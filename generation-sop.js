// Pure generation planning. No network, DOM, or implicit global LoRA fallback.
import {comfyAddressKey, addressLoras, normalizeLoraBinding} from './character-lora.js';

const join = (...values) => values.flat().map(value => String(value || '').trim()).filter(Boolean).join(', ');
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
const copy = value => JSON.parse(JSON.stringify(value));
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
const names = (key, role) => [key, role.nameCN, role.nameEN, role.promptName].flatMap(value => String(value || '').split('|')).filter(Boolean);
function enabledRoles(settings) {
  const groups = [settings.characterEnablePresets?.[settings.characterEnablePresetId]?.characters, settings.characterCommonPresets?.[settings.characterCommonPresetId]?.characters];
  const keys = [...new Set(groups.flatMap(group => group || []).map(entry => typeof entry === 'string' ? entry : entry?.characterPresetName).filter(Boolean))];
  return keys.filter(key => settings.characterPresets?.[key]).map(key => ({key, role:settings.characterPresets[key]}));
}
function coordinates(value) {
  const text = String(value || '').trim();
  const pair = text.match(/^\{?\s*([-+\d.]+)\s*[,，]\s*([-+\d.]+)\s*\}?$/);
  if (pair && pair.slice(1).every(number => Number.isFinite(Number(number)))) return {x:Math.max(0,Math.min(1,Number(pair[1]))), y:Math.max(0,Math.min(1,Number(pair[2])))};
  const grid = text.match(/^([a-e])([1-5])$/i);
  return grid ? {x:0.1 + ('abcde'.indexOf(grid[1].toLowerCase()) * 0.2), y:0.1 + ((Number(grid[2])-1)*0.2)} : null;
}
export function parseSopTag(tag) {
  const text = String(tag || '').replace(/\\n/g, '\n').replace(/^\s*image###/, '').replace(/###\s*$/, '');
  const markers = [...text.matchAll(/(?:Scene Composition|Character\s+(\d+)\s+(Prompt|UC|coordinates))\s*:/gi)];
  if (!markers.length) return {structured:false, scene:'', characters:[{id:1,prompt:text.trim(),negative:'',coordinates:null}]};
  let scene = ''; const characters = new Map();
  markers.forEach((marker,index) => {
    let value = text.slice(marker.index + marker[0].length, markers[index+1]?.index ?? text.length).replace(/;\s*$/, '').trim();
    if (!marker[1]) { scene = value; return; }
    const id = Number(marker[1]); if (!id) fail('STRUCTURE_INVALID','人物编号必须大于零。');
    const character = characters.get(id) || {id,prompt:'',negative:'',coordinates:null};
    const field = marker[2].toLowerCase();
    if (field === 'prompt') {
      const centers = value.match(/\|\s*centers\s*:\s*([^;]+)\s*;?$/i);
      if (centers) { character.coordinates = coordinates(centers[1]); value = value.slice(0, centers.index).trim(); }
      if (character.prompt) fail('STRUCTURE_INVALID',`人物 ${id} 的提示词重复。`);
      character.prompt = value;
    } else if (field === 'uc') character.negative = value;
    else character.coordinates = coordinates(value);
    characters.set(id,character);
  });
  return {structured:true,scene,characters:[...characters.values()].sort((a,b)=>a.id-b.id).filter(character=>character.prompt)};
}
export function resolveSopAddressSettings(settings) {
  const map=settings.comfyui_sop_by_address;
  if(!map || typeof map!=='object' || Array.isArray(map)) return {...settings};
  const binding=map[comfyAddressKey(settings.comfyuiUrl)] || {};
  return {...settings,
    comfyui_public_person_preset:binding.public_person_preset || '',
    comfyui_multi_workflow:binding.multi_workflow || '',
    comfyui_multi_lora_mode:binding.multi_lora_mode==='global'?'global':'ask',
    comfyui_region_preview:binding.region_preview===true || binding.region_preview==='true'};
}
export function resolveRolePromptPreset(role, settings) {
  settings=resolveSopAddressSettings(settings);
  const address = comfyAddressKey(settings.comfyuiUrl);
  const bound = role?.promptPresetsByAddress?.[address];
  const id = typeof bound === 'object' && bound ? bound.presetId : bound;
  const selected = id || settings.comfyui_public_person_preset || '';
  if (selected && !settings.yushe?.[selected]) fail('PRESET_MISSING',`人物提示词预设“${selected}”已失效，请重新选择。`);
  return {presetId:selected,presetSource:id?'role':'public',preset:settings.yushe?.[selected] || {}};
}
function identityMatches(prompt, settings, fallbackKeys = []) {
  const roles = enabledRoles(settings), found = new Map();
  for (const match of String(prompt || '').matchAll(/\$([^$]+)\$/g)) {
    let name;
    try { const reference = JSON.parse(match[1]); if (Object.hasOwn(reference,'angle')) name=reference.name; }
    catch { const legacy=match[1].match(/^(.*?)-(?:sfw|nsfw)-(?:upperbody|lowerbody)(?:-|$)/i); if(legacy) name=legacy[1]; }
    if (!name) continue;
    // Canonical preset keys are authoritative after a user resolves an ambiguous alias.
    const canonical=roles.find(item=>item.key===name);
    const hits = canonical?[canonical]:roles.filter(({key,role})=>names(key,role).some(alias=>normalize(alias)===normalize(name)));
    if (hits.length>1) fail('IDENTITY_CONFLICT',`人物“${name}”对应多个启用角色，请选择当前图片的角色。`);
    if (hits.length) found.set(hits[0].key,hits[0]);
  }
  if (!found.size) for (const key of fallbackKeys) { const hit=roles.find(item=>item.key===key); if(hit) found.set(key,hit); }
  return [...found.values()];
}
function identity(prompt, settings, fallbackKeys = []) {
  const found=identityMatches(prompt,settings,fallbackKeys);
  if (found.length>1) fail('IDENTITY_CONFLICT','同一个人物区域包含多个角色，请分开人物编号。');
  return found[0] || null;
}
function detectedCount(text) {
  const counts=[...String(text||'').matchAll(/\b(\d+)\s*(girls?|boys?|people|persons?)\b/gi)];
  const max=kind=>Math.max(0,...counts.filter(match=>kind.test(match[2])).map(match=>Number(match[1])));
  return Math.max(max(/^girl/)+max(/^boy/),max(/^(people|person)/));
}
export function buildGenerationPlan({rawTag='',preparedTag=rawTag,expandedTag=preparedTag,settings={},selection={},scenePresetId,allowMerged=false,allowGlobalLoras=false}) {
  settings=resolveSopAddressSettings(settings);
  const parsed=parseSopTag(preparedTag), expanded=parseSopTag(expandedTag);
  const flatIdentities=!parsed.structured?identityMatches(preparedTag,settings,selection.characters||[]):[];
  const count=Math.max(parsed.characters.length,detectedCount(rawTag),flatIdentities.length);
  const mergedFlat=!parsed.structured&&count>1&&allowMerged;
  if(mergedFlat) {
    parsed.scene=expandedTag;
    parsed.characters=Array.from({length:Math.max(count,flatIdentities.length)},(_,index)=>({id:index+1,prompt:flatIdentities[index]?'$'+JSON.stringify({name:flatIdentities[index].key,angle:'from front',upperBody:'sfw',lowerBody:'sfw'})+'$':'',negative:'',coordinates:null}));
  }
  const selectedSceneId=scenePresetId ?? settings.yusheid_comfyui;
  if (selectedSceneId && !settings.yushe?.[selectedSceneId]) fail('PRESET_MISSING','公共画面提示词预设已失效。');
  const common=settings.yushe?.[selectedSceneId] || {}, warnings=[];
  if(count>2&&!allowMerged) fail('MULTI_UNSUPPORTED','三人及以上暂不支持分区，请明确选择普通合并生成。');
  if(count>1&&(!parsed.structured||parsed.characters.length!==count)&&!allowMerged) fail('MULTI_STRUCTURE_REQUIRED','多人图需要每个人独立的编号与提示词，请重新提取或选择普通合并生成。');
  let mode=count>1&&!allowMerged?'regional':'single';
  if(count>1&&allowMerged) {mode='merged';warnings.push('本次使用普通合并生成，人物区域不受控制。');}
  const workflow=mode==='regional'?settings.comfyui_multi_workflow:settings.worker;
  if(mode==='regional'&&!workflow) fail('MULTI_WORKFLOW_REQUIRED','请先配置双人分区工作流，或明确选择普通合并生成。');
  const characters=parsed.characters.map((character,index)=>{
    const matched=identity(character.prompt,settings,!parsed.structured&&count===1?selection.characters||[]:[]);
    const role=matched?.role, route=resolveRolePromptPreset(role,settings);
    const bindings=(role?addressLoras(role,settings.comfyuiUrl):[]).map(normalizeLoraBinding).filter(binding=>binding.enabled);
    const expandedCharacter=mergedFlat?null:expanded.characters.find(item=>item.id===character.id);
    const personPrompt=mergedFlat?'':expandedCharacter?.prompt || character.prompt;
    const position=character.coordinates || {x:count===2?(index===0?0.25:0.75):0.5,y:0.5};
    if(!matched) warnings.push(`人物 ${character.id} 未匹配启用角色，沿用原创人物描述。`);
    return {id:character.id,roleKey:matched?.key || null,name:role?.nameCN?.split('|')[0] || `人物 ${character.id}`,presetId:route.presetId,presetSource:route.presetSource,
      prompt:join(route.preset.fixedPrompt,personPrompt,route.preset.fixedPrompt_end,bindings.map(binding=>binding.triggerWords)),
      negative:join(expandedCharacter?.negative || character.negative,role?.negative,route.preset.negativePrompt),
      x:position.x,y:position.y,width:count===2?0.5:1,height:1,bindings};
  });
  const bindingMap=new Map();
  for(const binding of characters.flatMap(character=>character.bindings)) {
    const key=binding.file.toLowerCase(), previous=bindingMap.get(key);
    if(previous&&(previous.modelWeight!==binding.modelWeight||previous.clipWeight!==binding.clipWeight)) fail('LORA_CONFLICT',`同一 LoRA 权重冲突：${binding.file}`);
    if(!previous) bindingMap.set(key,{...binding});
  }
  const bindings=[...bindingMap.values()];
  const hasGlobalLoras=bindings.length || /<(?:lora|wlr):/i.test(join(common.fixedPrompt,common.fixedPrompt_end,characters.map(character=>character.prompt)));
  // Standard ComfyUI LoraLoader and WeiLin loaders patch globally. Regional text does not scope these patches.
  if(count>1&&hasGlobalLoras&&!allowGlobalLoras) fail('GLOBAL_LORA_CONFIRM','当前角色 LoRA 是全局作用；请确认全局 LoRA 降级，或配置支持区域 LoRA 的专用工作流。');
  if(count>1&&hasGlobalLoras) warnings.push('本次角色 LoRA 全局作用，可能造成角色特征串用。');
  const scenePrompt=join(common.fixedPrompt,mergedFlat?parsed.scene:expanded.scene || parsed.scene,common.fixedPrompt_end),sceneNegative=String(common.negativePrompt||'');
  const plan={version:1,address:comfyAddressKey(settings.comfyuiUrl),mode,count,workflow,scenePresetId:selectedSceneId,scenePrompt,sceneNegative,characters,bindings,warnings,
    positive:join(scenePrompt,characters.map(character=>character.prompt)),negative:join(sceneNegative,characters.map(character=>character.negative))};
  plan.snapshot=copy({rawTag,preparedTag,expandedTag,address:plan.address,mode,count,scenePresetId:selectedSceneId,scenePrompt,sceneNegative,characters,workflow});
  return plan;
}
export function materializeSopWorkflow(workflow,plan) {
  let object;
  try {object=typeof workflow==='string'?JSON.parse(workflow):copy(workflow);} catch {fail('WORKFLOW_INVALID','ComfyUI 工作流 JSON 无效。');}
  if(!object||typeof object!=='object'||Array.isArray(object)) fail('WORKFLOW_INVALID','ComfyUI 工作流必须为 API 节点对象。');
  const values={'%scene_prompt%':plan.scenePrompt,'%scene_negative%':plan.sceneNegative};
  plan.characters.forEach((character,index)=>{const prefix=`%character_${index+1}_`;for(const [field,value] of Object.entries({prompt:character.prompt,negative:join(plan.sceneNegative,character.negative),x:character.x,y:character.y,width:character.width,height:character.height,left:Math.max(0,Math.min(1-character.width,character.x-character.width/2)),top:Math.max(0,Math.min(1-character.height,character.y-character.height/2))})) values[prefix+field+'%']=value;});
  const serialized=JSON.stringify(object);
  if(plan.mode==='regional') {
    for(const key of ['%scene_prompt%','%character_1_prompt%','%character_2_prompt%','%character_1_negative%','%character_2_negative%']) if(!serialized.includes(key)) fail('REGIONAL_CONTRACT_INVALID',`双人工作流缺少占位符 ${key}。`);
    validateRegionalGraph(object);
  }
  const walk=value=>{
    if(typeof value==='string') {if(Object.hasOwn(values,value)) return values[value];return value.replace(/%(?:scene_(?:prompt|negative)|character_\d+_(?:prompt|negative|x|y|width|height|left|top))%/g,key=>{if(!Object.hasOwn(values,key)) fail('REGIONAL_CONTRACT_INVALID',`工作流引用了不存在的人物占位符 ${key}。`);return String(values[key]);});}
    if(Array.isArray(value)) return value.map(walk);
    if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,walk(item)]));return value;
  };
  return walk(object);
}

function validateRegionalGraph(workflow) {
  const nodes=Object.entries(workflow).filter(([,node])=>node&&typeof node==='object'&&node.class_type);
  const downstream=new Map(nodes.map(([id])=>[id,[]]));
  for(const [id,node] of nodes) for(const value of Object.values(node.inputs||{})) if(Array.isArray(value)&&value.length===2&&downstream.has(String(value[0]))) downstream.get(String(value[0])).push(id);
  const reachable=(source,predicate)=>{const pending=[source],seen=new Set();while(pending.length){const id=pending.shift();if(seen.has(id))continue;seen.add(id);if(predicate(workflow[id],id))return true;pending.push(...(downstream.get(id)||[]));}return false;};
  const sampler=node=>/^(?:KSampler|KSamplerAdvanced|SamplerCustom|SamplerCustomAdvanced)$/.test(node?.class_type);
  const regional=node=>/^(?:ConditioningSetArea|ConditioningSetAreaPercentage|AttentionCouple|AttentionCoupleRegion|RegionalPrompt|RegionalConditioning)$/.test(node?.class_type);
  for(const number of [1,2]) {
    for(const suffix of ['prompt','negative']) {
      const placeholder=`%character_${number}_${suffix}%`;
      const sources=nodes.filter(([,node])=>Object.values(node.inputs||{}).some(value=>typeof value==='string'&&value.includes(placeholder)));
      if(!sources.some(([id])=>reachable(id,(node,regionId)=>regional(node)&&reachable(regionId,sampler)))) fail('REGIONAL_CONTRACT_INVALID',`人物 ${number} ${suffix} 未通过区域节点接入采样器。`);
    }
    const position=nodes.some(([,node])=>regional(node)&&Object.values(node.inputs||{}).some(value=>typeof value==='string'&&(value.includes(`%character_${number}_x%`)||value.includes(`%character_${number}_left%`)))&&Object.values(node.inputs||{}).some(value=>typeof value==='string'&&(value.includes(`%character_${number}_y%`)||value.includes(`%character_${number}_top%`))));
    if(!position) fail('REGIONAL_CONTRACT_INVALID',`人物 ${number} 的区域节点未接入位置占位符。`);
  }
}

// Native ComfyUI nodes only. Regional conditioning, intentionally no regional LoRA claim.
export function createStandardRegionalWorkflow() {
  const nodes={
    '1':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'%MODEL_NAME%'}},
    '2':{class_type:'CLIPSetLastLayer',inputs:{clip:['1',1],stop_at_clip_layer:-2}},
    '3':{class_type:'CLIPTextEncode',inputs:{clip:['2',0],text:'%scene_prompt%'}},
    '4':{class_type:'CLIPTextEncode',inputs:{clip:['2',0],text:'%scene_negative%'}},
    '5':{class_type:'CLIPTextEncode',inputs:{clip:['2',0],text:'%character_1_prompt%'}},
    '6':{class_type:'CLIPTextEncode',inputs:{clip:['2',0],text:'%character_1_negative%'}},
    '7':{class_type:'CLIPTextEncode',inputs:{clip:['2',0],text:'%character_2_prompt%'}},
    '8':{class_type:'CLIPTextEncode',inputs:{clip:['2',0],text:'%character_2_negative%'}},
    '9':{class_type:'ConditioningSetAreaPercentage',inputs:{conditioning:['5',0],width:'%character_1_width%',height:'%character_1_height%',x:'%character_1_left%',y:'%character_1_top%',strength:1}},
    '10':{class_type:'ConditioningSetAreaPercentage',inputs:{conditioning:['6',0],width:'%character_1_width%',height:'%character_1_height%',x:'%character_1_left%',y:'%character_1_top%',strength:1}},
    '11':{class_type:'ConditioningSetAreaPercentage',inputs:{conditioning:['7',0],width:'%character_2_width%',height:'%character_2_height%',x:'%character_2_left%',y:'%character_2_top%',strength:1}},
    '12':{class_type:'ConditioningSetAreaPercentage',inputs:{conditioning:['8',0],width:'%character_2_width%',height:'%character_2_height%',x:'%character_2_left%',y:'%character_2_top%',strength:1}},
    '13':{class_type:'ConditioningCombine',inputs:{conditioning_1:['3',0],conditioning_2:['9',0]}},
    '14':{class_type:'ConditioningCombine',inputs:{conditioning_1:['13',0],conditioning_2:['11',0]}},
    '15':{class_type:'ConditioningCombine',inputs:{conditioning_1:['4',0],conditioning_2:['10',0]}},
    '16':{class_type:'ConditioningCombine',inputs:{conditioning_1:['15',0],conditioning_2:['12',0]}},
    '17':{class_type:'EmptyLatentImage',inputs:{width:'%width%',height:'%height%',batch_size:1}},
    '18':{class_type:'KSampler',inputs:{model:['1',0],positive:['14',0],negative:['16',0],latent_image:['17',0],seed:'%seed%',steps:'%steps%',cfg:'%cfg_scale%',sampler_name:'%sampler_name%',scheduler:'%scheduler%',denoise:1}},
    '19':{class_type:'VAEDecode',inputs:{samples:['18',0],vae:['1',2]}},
    '20':{class_type:'SaveImage',inputs:{images:['19',0],filename_prefix:'SillyTavern-regional'}}
  };
  return nodes;
}
