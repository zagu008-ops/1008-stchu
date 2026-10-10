import assert from 'node:assert/strict';
import {migrateAddressLoras,prepareCharacterTags} from '../character-lora.js';
const role={nameCN:'海梦',loraBindings:[{file:'marin.safetensors',modelWeight:1,clipWeight:1,enabled:true,triggerWords:'marin'}]};
const settings={comfyuiUrl:'http://localhost:8188/',characterPresets:{marin:role},characterEnablePresetId:'a',characterEnablePresets:{a:{characters:['marin']}}};
migrateAddressLoras(settings);
assert.equal(prepareCharacterTags('海梦, 1girl',settings).bindings.length,1);
settings.comfyuiUrl='http://localhost:8189';
assert.equal(prepareCharacterTags('海梦, 1girl',settings).bindings.length,0);
migrateAddressLoras(settings);
role.loraBindingsByAddress['http://localhost:8189']=[{file:'other.safetensors',modelWeight:0.5,clipWeight:1,enabled:true}];
assert.equal(prepareCharacterTags('海梦, 1girl',settings).bindings[0].file,'other.safetensors');
settings.comfyuiUrl='http://localhost:8188';
assert.equal(prepareCharacterTags('海梦, 1girl',settings).bindings[0].file,'marin.safetensors');
console.log('Address migration, unconfigured server, independent bindings and switch-back passed.');

const strictSettings={characterPresets:{inactive:{nameCN:"未启用",facialFeatures:"red hair"}},characterEnablePresets:{},characterCommonPresets:{}};
assert(!prepareCharacterTags('${"name":"未启用","angle":"from front"}$',strictSettings,"",{activeOnly:true}).tag.includes("$"));
assert(!prepareCharacterTags("$未启用-sfw-upperbody-sfw-lowerbody$",strictSettings,"",{activeOnly:true}).tag.includes("$"));
