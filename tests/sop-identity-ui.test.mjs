import assert from 'node:assert/strict';
import {getSopIdentityCatalog, findAmbiguousCharacterTags, replaceSopIdentitySelections, resolveAmbiguousCharacterTags, normalizeSopRegion} from '../sop-identity-ui.js';
const settings = {
  characterEnablePresetId:'active', characterEnablePresets:{active:{characters:['a', {characterPresetName:'b'}]}},
  characterCommonPresetId:'common', characterCommonPresets:{common:{characters:['b','c','missing']}},
  characterPresets:{a:{nameCN:'星野遥|星野',nameEN:'Haruka|shared name'},b:{nameCN:'另一人|星野',nameEN:'shared_name'},c:{nameCN:'配角'},off:{nameCN:'星野'}}
};
assert.deepEqual(getSopIdentityCatalog(settings).map(x=>x.key),['a','b','c']);
const raw = '2girls, (星野:1.2), Character 2 Prompt: shared_name, 配角, 星野 holding cup, 未知人物';
const conflicts = findAmbiguousCharacterTags(raw,settings);
assert.equal(conflicts.length,2);
assert.deepEqual(conflicts[0].candidates.map(x=>x.key),['a','b']);
assert.throws(()=>replaceSopIdentitySelections(raw,conflicts,{}),/请选择/);
const resolved = replaceSopIdentitySelections(raw,conflicts,new Map([[conflicts[0].start,'a'],[conflicts[1].start,'b']]));
assert.ok(resolved.includes('$'+JSON.stringify({name:'a',angle:'from front',upperBody:'sfw',lowerBody:'sfw'})+'$'));
assert.ok(resolved.includes('Character 2 Prompt: $'));
assert.ok(resolved.includes('星野 holding cup, 未知人物'));
assert.equal(findAmbiguousCharacterTags(resolved,settings).length,0);
const structured = '$'+JSON.stringify({name:'星野',angle:'from behind',upperBody:'hidden',lowerBody:'nsfw'})+'$';
const refs = findAmbiguousCharacterTags(structured,settings);
assert.equal(refs.length,1);
assert.deepEqual(JSON.parse(replaceSopIdentitySelections(structured,refs,{[refs[0].start]:'b'}).slice(1,-1)),{name:'b',angle:'from behind',upperBody:'hidden',lowerBody:'nsfw'});
assert.equal(findAmbiguousCharacterTags('${"name":"星野","upperBody":"visible","lowerBody":"visible"}$',settings).length,0);
assert.equal(await resolveAmbiguousCharacterTags('1girl, 未知人物',settings),'1girl, 未知人物');
assert.deepEqual(normalizeSopRegion({x:.9,y:-1,width:.4,height:2}),{x:.6,y:0,width:.4,height:1});
assert.deepEqual(normalizeSopRegion({x:'bad',width:0,height:.5}),{x:0,y:0,width:.05,height:.5});
console.log('SOP identity UI helpers passed.');
