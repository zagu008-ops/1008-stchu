import assert from 'node:assert/strict';
import {comfyCatalog,applyComfyCatalog} from '../cosji-comfy-catalog.mjs';
const cache=comfyCatalog({CheckpointLoaderSimple:{input:{required:{ckpt_name:[['model.safetensors']]}}},KSampler:{input:{required:{sampler_name:[['euler','dpmpp_2m']],scheduler:[['normal']]}}}});
assert.deepEqual(cache.vaes,[]);assert.deepEqual(cache.CLIPs,[]);
globalThis.Option=class{constructor(text,value){this.text=text;this.value=value;}};
const elements=Object.fromEntries(['MODEL_NAME','comfyuisamplerName','comfyui_scheduler','comfyui_vae','comfyuiCLIPName'].map(id=>[id,{value:'',disabled:true,options:[],replaceChildren(...a){this.options=a;},add(a){this.options.push(a);}}]));
const settings={MODEL_NAME:'model.safetensors',comfyuisamplerName:'euler',comfyui_scheduler:'normal'};
applyComfyCatalog(cache,settings,{getElementById:id=>elements[id]});
assert.equal(elements.MODEL_NAME.disabled,false);assert.equal(elements.comfyuisamplerName.disabled,false);
assert.equal(elements.comfyui_vae.disabled,true);assert.equal(elements.MODEL_NAME.value,settings.MODEL_NAME);
assert.equal(elements.comfyuisamplerName.options.length,2);
console.log('PASS: complete catalog tolerates absent optional nodes, unlocks populated selectors and preserves selected settings');
const {fetchComfyInfo}=await import('../cosji-comfy-catalog.mjs');
let submitted;
const info={LoraLoader:{input:{required:{lora_name:[['test.safetensors']]}}}};
assert.deepEqual(await fetchComfyInfo('http://127.0.0.1:8188/',{headers:{'X-CSRF-Token':'test'},fetchImpl:async(url,options)=>{submitted={url,options};return {ok:true,json:async()=>info};}}),info);
assert.equal(submitted.url,'/api/sd/comfy/object-info');assert.equal(submitted.options.method,'POST');assert.equal(JSON.parse(submitted.options.body).url,'http://127.0.0.1:8188');
await assert.rejects(()=>fetchComfyInfo('http://127.0.0.1:8188',{headers:{},fetchImpl:async()=>({ok:false,status:502,text:async()=> 'Unavailable'})}),/502.*Unavailable/);
for(const status of [404,405]){
    const calls=[];
    const actual=await fetchComfyInfo('http://192.168.3.13:8188/',{headers:{'X-CSRF-Token':'private'},fetchImpl:async(url,options)=>{
        calls.push({url,options});
        return calls.length===1?{ok:false,status}:{ok:true,json:async()=>info};
    }});
    assert.deepEqual(actual,info);
    assert.equal(calls[1].url,'http://192.168.3.13:8188/object_info');
    assert.equal(calls[1].options.headers,undefined);
    assert.equal(calls[1].options.body,undefined);
}
await assert.rejects(()=>fetchComfyInfo('http://192.168.3.13:8188',{headers:{},fetchImpl:async url=>{
    if(url.startsWith('/'))return {ok:false,status:404};
    throw new Error('Failed to fetch');
}}),/缺少.*直连.*跨域/);
console.log('PASS: missing relay falls back to direct ComfyUI without forwarding private headers');
