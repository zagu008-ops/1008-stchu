import assert from 'node:assert/strict';
import {fetchComfyLoras} from '../cosji-comfy-catalog.mjs';
const info={LoraLoader:{input:{required:{lora_name:[['ok.safetensors','ok.safetensors',42]]}}}};
let calls=[];
const direct=await fetchComfyLoras('http://10.146.67.215:8188/',{headers:{'X-CSRF-Token':'private'},fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>info};}});
assert.deepEqual(direct,['ok.safetensors']);assert.equal(calls.length,1);assert.equal(calls[0].url,'http://10.146.67.215:8188/object_info/LoraLoader');assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].options.credentials,'omit');
for(const failure of ['timeout','network','http','malformed']){
 calls=[];
 const result=await fetchComfyLoras('http://target:8188',{headers:{'X-CSRF-Token':'private'},fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(calls.length===1){if(failure==='timeout')throw new DOMException('signal timed out','TimeoutError');if(failure==='network')throw new TypeError('Failed to fetch');if(failure==='http')return {ok:false,status:403};return {ok:true,json:async()=>({})};}
  return {ok:true,json:async()=>info};
 }});
 assert.deepEqual(result,['ok.safetensors']);assert.equal(calls[1].url,'/api/sd/comfy/object-info');assert.equal(calls[1].options.headers['X-CSRF-Token'],'private');
}
await assert.rejects(()=>fetchComfyLoras('http://target:8188',{headers:{},fetchImpl:async()=>{throw new DOMException('signal timed out','TimeoutError');}}),/target:8188.*直连：请求超时.*酒馆转发：请求超时/);
assert.deepEqual(await fetchComfyLoras('http://target:8188',{fetchImpl:async()=>({ok:true,json:async()=>({LoraLoader:{input:{required:{lora_name:[[]]}}}})})}),[]);
console.log('PASS direct LoRA read, private header isolation, timeout/network/HTTP/malformed fallback, empty list, useful error');
