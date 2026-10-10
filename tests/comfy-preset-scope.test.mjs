import assert from 'node:assert/strict';
import {presetAddresses,bindPresetAddress,filterComfyPresets} from '../comfy-preset-scope.js';
const a='http://localhost:8188',b='http://remote:8189';
const settings={yushe:{a:{comfyuiAddresses:[a+'/']},b:{comfyuiAddresses:[b]},used:{},works:{fixedPrompt:'<lora:folder/hero:1>'},missing:{fixedPrompt:'<wlr:missing:1>'},plain:{}},characterPresets:{r:{promptPresetsByAddress:{[a]:'used'}}}};
const before=structuredClone(settings);
assert.deepEqual(filterComfyPresets(settings,a,{files:['folder/hero.safetensors']}).visible.map(x=>x.id),['a','used','works']);
assert.deepEqual(settings,before,'filter does not rewrite presets');
assert(filterComfyPresets(settings,b,{files:[]}).visible.some(x=>x.id==='b'));
assert(!filterComfyPresets(settings,b,{files:[],includeUnassigned:true}).visible.some(x=>x.id==='used'),'other address remains excluded');
assert(filterComfyPresets(settings,a,{includeUnassigned:true}).visible.some(x=>x.id==='plain'));
assert(!filterComfyPresets(settings,a,{files:[],includeUnassigned:true}).visible.some(x=>x.id==='missing'),'missing LoRA stays excluded');
assert(!filterComfyPresets(settings,a).visible.some(x=>x.id==='works'),'no stale server catalog assumed');
bindPresetAddress(settings,'plain',a);bindPresetAddress(settings,'plain',a+'/');bindPresetAddress(settings,'plain',b);
assert.deepEqual(presetAddresses(settings,'plain'),[a,b]);assert.equal(settings.yushe.plain.fixedPrompt,undefined);
console.log('Preset address filtering, legacy usage inference, LoRA compatibility, unassigned recovery and nondestructive binding passed.');

settings.comfyui_profiles={old:{comfyuiUrl:b,comfyui_public_person_preset:"plain"}};
assert(presetAddresses(settings,"plain").includes(b));
