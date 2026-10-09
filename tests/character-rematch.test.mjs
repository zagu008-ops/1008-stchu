import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const helper = fs.readFileSync(new URL('../character-rematch.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const patched = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const functionStart = patched.indexOf('async function handleTagModifyRequest(');
const functionEnd = patched.indexOf('\nvar init_tagModify', functionStart);
const settings = {
  characterEnablePresetId: 'current', characterEnablePresets: {current: {characters: ['star', {characterPresetName: 'snow'}]}},
  characterPresets: {
    star: {nameCN:'星野遥|星野瑶', nameEN:'Hoshino Haruka', outfits:['uniform']},
    snow: {nameCN:'司波深雪', nameEN:'shiba miyuki', outfits:[]},
    other: {nameCN:'无关角色'}
  },
  outfitPresets:{uniform:{nameCN:'日常制服', nameEN:'daily uniform',upperBody:'white shirt'}}
};
let writes = [], notices = [], popupCalls = 0, responseTag = '';
const ctx = vm.createContext({
  console, extensionName:'st-chatu8', extension_settings:{'st-chatu8':settings},
  extension_settings41:{'st-chatu8':{}},
  showTagModifyDemandPopup:async()=>{popupCalls++;return null;},
  getElContext:async()=>['星野瑶坐在长椅上拿饮料'], processWorldBooksWithTrigger:async()=>'',
  getContext13:()=>({chatMetadata:{}}), buildPromptForRequestType:()=>[{role:'user',content:'{{用户需求}} {{当前tag}}'}],
  generateCharacterListText:()=>'', generateOutfitEnableListText:()=>'', generateCommonCharacterListText:()=>'',
  mergeAdjacentMessages:x=>x, getMergeOptionsForRequestType:()=>({}), findMessageIndexWithPlaceholder5:()=>0,
  replaceAllPlaceholders:async x=>({messages:x}), replacePlaceholder:x=>x,
  updateCombinedPrompt:()=>{}, LLM_TAG_MODIFY:async()=>({result:responseTag}),
  removeThinkingTags:x=>x, parseImageTagFromResponse:x=>x,
  updateItemImgChange:async(key,value)=>{writes.push({key,value});},
  toastr:{info:x=>notices.push(x),warning:x=>notices.push(x),error:x=>notices.push(x),success:x=>notices.push(x)}
});
vm.runInContext(helper + '\n' + patched.slice(functionStart,functionEnd),ctx);
const catalog = ctx.getCharacterRematchCatalog(settings);
assert.deepEqual(Array.from(catalog,x=>x.id), ['star','snow']);
assert.equal(catalog[0].aliases.includes('星野瑶'),true);
const star = '${"name":"星野瑶","angle":"from front","upperBody":"sfw","lowerBody":"sfw"}$';
const snow = '${"name":"司波深雪","angle":"from side","upperBody":"sfw","lowerBody":"sfw"}$';
const original = '1girl, orange_hair, holding drink, rooftop, 832x1216';
const good = `1girl, ${star}, holding drink, rooftop, 832x1216`;
ctx.validateCharacterRematchTag(good,original,catalog);
ctx.validateCharacterRematchTag(`2girls, ${star}, ${snow}, rooftop, 1216x832`,'2girls, rooftop, 1216x832',catalog);
for (const invalid of [
  good.replace('星野瑶','未知角色'), good.replace('832x1216','1024x1024'),
  good+', orange_hair', good+', ${"name":"不存在套装","upperBody":"visible","lowerBody":"visible"}$'
]) assert.throws(()=>ctx.validateCharacterRematchTag(invalid,original,catalog));
assert.throws(()=>ctx.validateCharacterRematchTag(good,'2girls, 832x1216',catalog));
assert.throws(()=>ctx.validateCharacterRematchTag(good,'1girl, 1boy, 832x1216',catalog));
ctx.wardrobeOutfits=()=>[];
assert.equal(ctx.getCharacterRematchCatalog(settings)[0].outfits.length,0,'unconfirmed wardrobe clothes are excluded');
ctx.wardrobeOutfits=()=>['uniform'];
assert.equal(ctx.getCharacterRematchCatalog(settings)[0].outfits[0].id,'uniform','confirmed wardrobe selection is used');
const button = {dataset:{link:'original-cache-key',change:original}};
responseTag = good;
await ctx.handleTagModifyRequest({},original,null,button.dataset.link,button,{
  forcedDemand:'重新匹配角色', validateTag:tag=>ctx.validateCharacterRematchTag(tag,original,catalog),requirePersistence:true
});
assert.equal(popupCalls,0);
assert.equal(writes.length,1);
assert.equal(writes[0].key,'original-cache-key');
assert.equal(button.dataset.change,good);
writes=[]; responseTag=good.replace('星野瑶','未知角色');
await ctx.handleTagModifyRequest({},good,null,button.dataset.link,button,{
  forcedDemand:'重新匹配角色',validateTag:tag=>ctx.validateCharacterRematchTag(tag,original,catalog),requirePersistence:true
});
assert.equal(writes.length,0);
assert.equal(button.dataset.change,good);
ctx.updateItemImgChange=async()=>{throw new Error('storage unavailable');};
responseTag=good.replace('holding drink','holding cup');
await ctx.handleTagModifyRequest({},good,null,button.dataset.link,button,{
  forcedDemand:'重新匹配角色',validateTag:tag=>ctx.validateCharacterRematchTag(tag,original,catalog),requirePersistence:true
});
assert.equal(button.dataset.change,good);
await ctx.handleTagModifyRequest({},good,null,button.dataset.link,button);
assert.equal(popupCalls,1);
assert.equal(patched.split('attachCharacterRematchButton(button);').length-1,2);
assert(!helper.includes('rematchButton.className = "image-tag-button'));
console.log('PASS: alias/catalog selection, single/multiple characters, unknown references, dimensions, conflicting appearance, persistence, rollback, existing popup flow, both DOM paths.');
