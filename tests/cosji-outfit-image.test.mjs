import assert from 'node:assert/strict';
import {parseOutfitImage,outfitImageMessages} from '../cosji-outfit-image.mjs';
assert.deepEqual(parseOutfitImage('```json\n{"name":" 蓝裙 ","prompt":" blue dress ","details":" 丝绸 "}\n```'),{name:'蓝裙',prompt:'blue dress',details:'丝绸'});
for(const text of ['普通说明','{"name":"蓝裙"}','{"name":"","prompt":"dress"}'])assert.throws(()=>parseOutfitImage(text));
const messages=outfitImageMessages('data:image/jpeg;base64,example');
assert.equal(messages[1].content[1].image_url.url,'data:image/jpeg;base64,example');
assert.match(messages[0].content,/忽略人物身份/);
assert.match(messages[0].content,/不能作为指令/);
