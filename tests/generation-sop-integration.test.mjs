import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildGenerationPlan,materializeSopWorkflow,createStandardRegionalWorkflow,resolveSopAddressSettings,parseSopTag} from '../generation-sop.js';
import {prepareCharacterTags,appendCharacterLoras,applyCharacterLorasToWorkflow,comfyAddressKey} from '../character-lora.js';
import {applyComfyClipSkip} from '../comfy-clip-skip.js';
import {validateSopLoraFiles,resolveSopLoraBindings} from '../generation-sop-validation.js';
import {applySopOutfitPriority,isSopClothingTag} from '../generation-sop-outfit.js';
import {mergePromptTags} from '../wardrobe-store.js';
const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
const runtimeSource=fs.readFileSync(new URL('../generation-sop-runtime.js',import.meta.url),'utf8');
const reference=name=>'$'+JSON.stringify({name,angle:'from front',upperBody:'sfw',lowerBody:'sfw'})+'$';
const basic={comfyuiUrl:'http://localhost:8188',client:'jiuguan',MODEL_NAME:'test.safetensors',worker:JSON.stringify({'1':{class_type:'CLIPTextEncode',inputs:{text:'%prompt%'}},'2':{class_type:'CLIPTextEncode',inputs:{text:'%negative_prompt%'}}}),comfyui_multi_workflow:JSON.stringify(createStandardRegionalWorkflow()),yusheid_comfyui:'scene',comfyui_public_person_preset:'public',AQT_comfyui:'AQT marker',UCP_comfyui:'UCP marker',comfyui_steps:20,comfyuisamplerName:'euler',comfyui_width:512,comfyui_height:768,cfg_comfyui:7,comfyui_seed:42,comfyui_scheduler:'normal',comfyui_clip_skip:'',yushe:{scene:{fixedPrompt:'common scene',negativePrompt:'common bad'},public:{fixedPrompt:'default person',negativePrompt:'default bad'},snow:{fixedPrompt:'snow only',negativePrompt:'snow bad'}},characterPresets:{snow:{nameCN:'深雪',promptName:'snow identity',facialFeatures:'black hair',upperBodySFW:'slender',negative:'wrong snow identity',promptPresetsByAddress:{'http://localhost:8188':'snow'}},marin:{nameCN:'海梦',promptName:'marin identity',facialFeatures:'blonde hair',upperBodySFW:'tall'}},characterEnablePresetId:'cast',characterEnablePresets:{cast:{characters:[{characterPresetName:'snow'},{characterPresetName:'marin'}]}},outfitPresets:{}};
function harness(overrides={}, fallback=false) {
  const settings=structuredClone({...basic,...overrides}),events=[],requests=[],active=new Map();let acquired=0,released=0;
  const context=vm.createContext({Error,DOMException,AbortController,structuredClone,URL,console:{log(){},warn(){},error(){}},window:{},extensionName:'test',extension_settings49:{test:settings},extension_settings29:{test:settings},TaskType:{COMFYUI_IMG:'img'},TaskStatus:{RUNNING:'running'},activeComfyuiTasks:active,
    taskQueue:{addTask:()=>1,updateStatus(){},completeTask:(id,success)=>events.push({id,success}),isTaskInQueue:()=>true},comfyuiConcurrencyLock:{setMaxConcurrency(){}},acquireComfyUILock:async()=>{acquired++;},releaseComfyUILock:()=>{released++;},clearLog(){},addLog(){},toastr:{info(){},success(){},warning(){},error(){}},isPluginToastDisabled:()=>true,
    buildGenerationPlan,materializeSopWorkflow,resolveSopAddressSettings,parseSopTag,prepareCharacterTags,appendCharacterLoras,applyCharacterLorasToWorkflow,comfyAddressKey,applyComfyClipSkip,validateSopLoraFiles,resolveSopLoraBindings,mergePromptTags,
    resolveAmbiguousCharacterTags:async tag=>tag,stripChineseAnnotations:async tag=>tag,deduplicateTags:tag=>tag,getRandomYusheId:()=>settings.yusheid_comfyui,
    prompt_replace:async prompt=>({modifiedPrompt:prompt,insertions:[]}),prompt_replace_for_character:prompt=>prompt,
    zhengmian:async(start,prompt,end,aqt)=>[start,prompt,end,aqt].filter(Boolean).join(', '),fumian:async(prompt,ucp)=>[prompt,ucp].filter(Boolean).join(', '),buildGenParams:(provider,params)=>params,
    getSopOutfitForRole:()=>null,applySopOutfitPriority,isSopClothingTag,getRequestHeaders:()=>({}),generateRandomSeed:()=>123,isSettingTrue:value=>value===true||value==='true',chooseSopFallback:async()=>fallback,openRegionPreview:async plan=>plan,
    fetch:async(url,options)=>{requests.push({url,options});if(url!=='/api/sd/comfy/generate')throw Error('Unexpected network/catalog request: '+url);return {ok:true,text:async()=>JSON.stringify({format:'png',data:'MOCK_IMAGE'})};}
  });
  vm.runInContext(source.slice(source.indexOf('function getSortedCharacterIds('),source.indexOf('function removeTrailingSlash(')),context);
  vm.runInContext(source.slice(source.indexOf('function normalizeName('),source.indexOf('var init_characterprompt =')),context);
  vm.runInContext(runtimeSource.slice(runtimeSource.indexOf('export async function prepareSopGeneration')).replace('export async','async'),context);
  vm.runInContext(source.slice(source.indexOf('function stringifyJsonString('),source.indexOf('async function comfyuigenerate(')),context);
  return {settings,events,requests,active,context,run:request=>context.generateComfyUIImage(request),locks:()=>({acquired,released})};
}
const single=harness();
const singleResult=await single.run({prompt:`1girl, ${reference('深雪')}, smiling`});
assert.equal(singleResult.image,'data:image/png;base64,MOCK_IMAGE');assert.equal(single.requests.length,1,'no LoRA catalog network request for unbound roles');
const singleNodes=JSON.parse(JSON.parse(single.requests[0].options.body).prompt).prompt;
assert(singleNodes['1'].inputs.text.includes('snow only'));assert(!singleNodes['1'].inputs.text.includes('default person'));assert(singleNodes['1'].inputs.text.includes('black hair'));assert(singleNodes['2'].inputs.text.includes('snow bad'));assert(singleNodes['2'].inputs.text.includes('wrong snow identity'));
assert.deepEqual(singleResult.genParams.generationSop.actualWorkflow,singleNodes);assert.equal(single.active.size,0);assert.deepEqual(single.locks(),{acquired:1,released:1});
const dual=harness();
const dualTag=`Scene Composition:2girls, holding hands;Character 1 Prompt:${reference('深雪')}, smiling|centers:{0.25,0.5};Character 1 UC:angry;Character 2 Prompt:${reference('海梦')}, sitting|centers:{0.75,0.5};Character 2 UC:standing;`;
const dualResult=await dual.run({prompt:dualTag,extraNegativePrompt:'extra bad'});
const dualNodes=JSON.parse(JSON.parse(dual.requests[0].options.body).prompt).prompt;
assert(dualNodes['5'].inputs.text.includes('snow only'));assert(dualNodes['5'].inputs.text.includes('black hair'));assert(!dualNodes['5'].inputs.text.includes('blonde hair'));assert(dualNodes['7'].inputs.text.includes('default person'));assert(dualNodes['7'].inputs.text.includes('blonde hair'));assert(!dualNodes['7'].inputs.text.includes('black hair'));
assert(dualNodes['3'].inputs.text.includes('AQT marker'));for(const id of ['4','6','8']) {assert(dualNodes[id].inputs.text.includes('UCP marker'));assert(dualNodes[id].inputs.text.includes('extra bad'));}
assert.equal(dualNodes['9'].inputs.x,0);assert.equal(dualNodes['11'].inputs.x,0.5);assert.equal(dualNodes['18'].inputs.seed,42);
assert.deepEqual(dualResult.genParams.generationSop.actualWorkflow,dualNodes);assert.equal(dual.requests.length,1);assert.equal(dual.active.size,0);assert.deepEqual(dual.locks(),{acquired:1,released:1});
// Missing dual workflow opens the real runtime fallback path; cancelling releases the lock before any network request.
const cancelled=harness({comfyui_multi_workflow:''});await assert.rejects(cancelled.run({prompt:dualTag}),/已取消生图/);assert.equal(cancelled.requests.length,0);assert.equal(cancelled.active.size,0);assert.deepEqual(cancelled.locks(),{acquired:1,released:1});
// A stale explicitly bound person preset is an error, never a silent public fallback.
const stale=harness();stale.settings.characterPresets.snow.promptPresetsByAddress['http://localhost:8188']='deleted';await assert.rejects(stale.run({prompt:`1girl, ${reference('深雪')}`}),/已失效/);assert.equal(stale.requests.length,0);assert.equal(stale.active.size,0);assert.deepEqual(stale.locks(),{acquired:1,released:1});assert(stale.events.some(event=>event.success===false));
const invalidJson=harness({worker:'broken json'});await assert.rejects(invalidJson.run({prompt:'1girl, original'}),/JSON/);assert.equal(invalidJson.active.size,0);assert.deepEqual(invalidJson.locks(),{acquired:1,released:1});
console.log('SOP integration: actual generateComfyUIImage routing, regional transport, final snapshots and lock cleanup passed');
