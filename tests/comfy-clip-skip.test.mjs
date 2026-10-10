import assert from 'node:assert/strict';
import {applyComfyClipSkip} from '../comfy-clip-skip.js';
const w={a:{class_type:'CLIPSetLastLayer',inputs:{clip:['4',1],stop_at_clip_layer:-1}},b:{class_type:'CLIPTextEncode',inputs:{clip:['a',0]}}};
const original=structuredClone(w);applyComfyClipSkip(w,'');assert.deepEqual(w,original);
applyComfyClipSkip(w,'-2');assert.equal(w.a.inputs.stop_at_clip_layer,-2);assert.deepEqual(w.a.inputs.clip,['4',1]);assert.deepEqual(w.b,original.b);
for(const value of [0,2,-25,-1.5,'bad'])assert.throws(()=>applyComfyClipSkip(w,value));
assert.throws(()=>applyComfyClipSkip({},-2),/没有/);assert.deepEqual(applyComfyClipSkip({},undefined),{});
console.log('PASS: CLIP layer override, preserve default and wiring, invalid values and absent node.');
