import assert from 'node:assert/strict';
import {resolveComfySize} from '../cosji-size.mjs';
for(const flag of [false,'false']){const s=resolveComfySize({comfyui_width:832,comfyui_height:1216,aiAutonomousResolution:flag},1216,832);assert.equal(s.width,832);assert.equal(s.height,1216);}
assert.equal(resolveComfySize({comfyui_width:832,comfyui_height:1216,aiAutonomousResolution:true},1216,832).width,1216);
assert.equal(resolveComfySize({comfyui_width:832,comfyui_height:1216,aiAutonomousResolution:false},512,512,true).width,512);
console.log('PASS: fixed dimensions cannot be overridden by AI or cached request dimensions; test dimensions remain isolated');
