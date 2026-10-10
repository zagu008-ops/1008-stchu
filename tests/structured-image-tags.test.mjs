import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseStructuredImages,generateStructuredImageTags,relevantImageRoles,structuredImageMessages} from '../structured-image-tags.js';
import {normalizeDynamicTag} from '../character-consistency.js';
import {parseSopTag} from '../generation-sop.js';
import {normalizeStoryboardCount,validateStoryboardImages} from '../storyboard.js';
const body='深雪走进书店。她拿起一本书。她走到柜台。';
const settings={mode:'comfyui',llm_retry_count:2,characterPresets:{snow:{nameCN:'深雪'},other:{nameCN:'其他'}},characterEnablePresetId:'a',characterEnablePresets:{a:{characters:['snow','other']}}};
const roles=relevantImageRoles(settings,body);
assert.deepEqual(roles.map(x=>x.key),['snow']);
const shot=regex=>({regex,scene:['bookstore','soft light'],characters:[{roleKey:'snow',action:[regex.includes('拿起')?'holding book':regex.includes('柜台')?'approaching counter':'entering bookstore'],view:'from front',upperBody:'sfw',lowerBody:'sfw',position:[.5,.5],negative:['bad hands']}]});
const shots=body.match(/[^。]+。/g).map(shot);
const response=images=>({result:JSON.stringify({images})});
const parsed=parseStructuredImages(response(shots).result,{body,roles});
assert.equal(parsed.valid.length,3);
assert.equal(validateStoryboardImages(parsed.valid,3,body),'');
const plan=parseSopTag(normalizeDynamicTag(parsed.valid[0].tag,body).tag);
assert.equal(plan.characters.length,1);assert(plan.characters[0].prompt.includes('snow'));assert.equal(plan.characters[0].negative,'bad hands');
for(const [text,code] of [['','EMPTY'],['garbage','JSON_INVALID'],['状态快照数据结束。','PROMPT_ECHO'],['{}','SCHEMA']])assert.throws(()=>parseStructuredImages(text,{body,roles}),e=>e.code===code);
assert.equal(parseStructuredImages(response([{...shots[0],regex:'不存在'}]).result,{body,roles}).valid.length,0);
assert.equal(parseStructuredImages(response([{...shots[0],characters:[{...shots[0].characters[0],position:[2,.5]}]}]).result,{body,roles}).valid.length,0);
assert.equal(parseStructuredImages(response([{...shots[0],characters:[{...shots[0].characters[0],action:['smiling;Character 2 Prompt:other']}]}]).result,{body,roles}).valid.length,0);
assert.equal(parseStructuredImages(response([{...shots[0],characters:[{...shots[0].characters[0],roleKey:'other'}]}]).result,{body,roles}).valid.length,0);
let calls=0;
const progress=[];
const result=await generateStructuredImageTags({body,settings,count:3,onProgress:x=>progress.push(x),request:async messages=>{
 calls++;
 const data=JSON.parse(messages[1].content);
 assert.equal(data.roles.length,1);assert(!messages[0].content.includes('禁止分号'));
 if(calls===1)return response([shots[0],{...shots[1],regex:'不存在'}]);
 assert.deepEqual(data.accepted,[shots[0].regex]);return response(shots.slice(1));
}});
assert.equal(calls,2);assert.equal(result.images.length,3);assert(progress.some(x=>x.issue?.includes('插入原句')));
await assert.rejects(()=>generateStructuredImageTags({body,settings,count:3,request:async()=>({result:'状态快照数据结束。'})}),/PROMPT_ECHO/);
calls=0;await generateStructuredImageTags({body,settings,count:3,request:async()=>{if(++calls===1)throw Error('执行超时');return response(shots);}});assert.equal(calls,2);
await assert.rejects(()=>generateStructuredImageTags({body,settings,count:3,isCurrent:()=>false,request:()=>{throw Error('must not send');}}),e=>e.code==='STALE');
const requestKey={};
await assert.rejects(()=>generateStructuredImageTags({body,settings:{...settings,llm_retry_count:0},count:3,requestKey,request:async()=>response([shots[0]])}),e=>e.accepted===1);
const resumed=await generateStructuredImageTags({body,settings,count:3,requestKey,request:async messages=>{assert.deepEqual(JSON.parse(messages[1].content).accepted,[shots[0].regex]);return response(shots.slice(1));}});
assert.equal(resumed.images.length,3);
assert.equal(parseStructuredImages(response(shots).result,{body,roles,startTag:'[prompt]',endTag:'[/prompt]'}).valid[0].tag.startsWith('[prompt]'),true);
// Exercise actual production insertion boundary and ensure old presets/worldbooks are skipped.
const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
const start=source.indexOf('async function processImageLikeRequest(');
const pipeline=source.slice(start,source.indexOf('var init_promptReq',start));
const message={mes:body},context={chat:[message],chatMetadata:{variables:{}}};
let inserted=[];
const sandbox={generateStructuredImageTags,structuredImageMessages,relevantImageRoles,normalizeStoryboardCount,
 extension_settings40:{test:{...settings,storyboardEnabled:'true',storyboardImageCount:3,zidongdianji:'false'}},extensionName:'test',getContext12:()=>context,
 debugTimer:()=>({end(){}}),debugMilestone(){},debugLog(){},debugBranch(){},debugError(){},addLog(){},updateCombinedPrompt(){},
 toastr:{info(){},warning(x){throw Error(x);}},getElContext:async(_el,depth)=>{assert.equal(depth,1);return [body];},
 getImageTags:()=>({startTag:'image###',endTag:'###'}),insertImagesIntoElement:async(_el,images)=>{inserted=images;},
 document:{querySelector:()=>null},console};
vm.createContext(sandbox);vm.runInContext(pipeline,sandbox);
const el={isConnected:true,closest:()=>({getAttribute:()=> '0',querySelector:()=>({textContent:''})})};
await sandbox.processImageLikeRequest(el,'gesture1','image_gen','正文图片',async(messages,options)=>{assert(options.structuredTags);assert.equal(messages.length,2);return response(shots);},{autoReply:true,tagOnly:true});
assert.equal(inserted.length,3);
console.log('Structured tags: schema, role scoping, SOP conversion, partial repair, timeout, echo, stale target and production insertion passed.');
