import assert from 'node:assert/strict';
import {presetTestSnapshot} from '../cosji-preset-test.mjs';
const settings={yushe:{dress:{fixedPrompt:'dress',fixedPrompt_end:'end',negativePrompt:'outfit-negative',cosjiPublicOutfit:true}},cosji:{selectedRole:'old',roles:[{id:'r',name:'Role'}],presetRoles:{dress:'old'},commonPrompts:{positive:'global',negative:'global-negative',loras:[{name:'style',weight:'0.5',field:'fixedPrompt'}]},roleCommonPrompts:{r:{positive:'character',negative:'role-negative',loras:[]}}}};
const original=structuredClone(settings),snapshot=presetTestSnapshot(settings,'dress','r');
assert.equal(snapshot.preset.fixedPrompt,'global, <lora:style:0.5>, character, dress');assert.equal(snapshot.preset.fixedPrompt_end,'end');assert.equal(snapshot.preset.negativePrompt,'global-negative, role-negative, outfit-negative');assert.equal(snapshot.roleName,'Role');assert.deepEqual(settings,original);
settings.cosji.commonPrompts.positive='changed';assert.ok(snapshot.preset.fixedPrompt.startsWith('global,'));assert.throws(()=>presetTestSnapshot(settings,'missing','r'),/二级预设/);
