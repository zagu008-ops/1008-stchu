import assert from 'node:assert/strict';
import {authorityAppearance,enforceCharacterConsistency,appearanceAttributes,normalizeDynamicTag,saveAppearanceOverride,resolveAppearanceOverride,clearAppearanceOverride} from '../character-consistency.js';
const role={nameCN:'星野遥',facialFeatures:'sharp blue eyes, long silver hair',upperBodySFW:'flat chest'};
const settings={characterPresets:{star:role},yushe:{person:{fixedPrompt:'detailed face'},scene:{fixedPrompt:'masterpiece',negativePrompt:'bad anatomy'}},outfitPresets:{}};
const prepared=[{id:1,prompt:'${"name":"star","angle":"from front","upperBody":"sfw","lowerBody":"sfw"}$, (golden hair:1.2), hair tucked behind ear, sitting, school uniform'}];
const fresh=()=>({characters:[{id:1,name:'星野遥',roleKey:'star',presetId:'person',prompt:'sharp blue eyes, long silver hair, (golden hair:1.2), (green eyes:1.1), hair tucked behind ear, school uniform, sitting',negative:'(silver hair:1.2), (blue eyes:1.2), black hair, bad hands'}],scenePresetId:'scene',scenePrompt:'masterpiece, rooftop, golden hair',sceneNegative:'bad anatomy'});
const state={star:{wear:{outfitKey:'shirt',source:'chat',prompt:'white shirt, blue skirt'}}};
const plan=enforceCharacterConsistency(fresh(),settings,prepared,state,'她穿校服坐着。');
assert(!plan.positive.includes('golden hair'));assert(!plan.positive.includes('green eyes'));assert(plan.positive.includes('silver hair'));assert(plan.positive.includes('blue eyes'));
assert(plan.positive.includes('hair tucked behind ear'));assert(plan.positive.includes('sitting'));assert(plan.positive.includes('white shirt'));assert(!plan.positive.includes('school uniform'));
assert(!plan.negative.includes('silver hair'));assert(!plan.negative.includes('blue eyes'));assert(plan.negative.includes('bad hands'));assert(plan.negative.includes('bad anatomy'));assert(plan.negative.includes('black hair'));assert(plan.consistencyTrace.length>0);
for(const [id,field,value] of [['person','fixedPrompt','golden hair'],['person','negativePrompt','blue eyes'],['scene','fixedPrompt','green eyes'],['scene','negativePrompt','silver hair']]){
 const bad=structuredClone(settings);bad.yushe[id][field]=value;assert.throws(()=>enforceCharacterConsistency(fresh(),bad,prepared,state),e=>e.code==='CHARACTER_PRESET_CONFLICT');
}
assert.equal(appearanceAttributes('(golden hair:1.2)').hairColor,'blonde');
assert.equal(appearanceAttributes('hair tucked behind ear').hairColor,undefined);
assert.equal(appearanceAttributes('shirt with collar').hairColor,undefined);
const ctx={chatId:'one',characterId:1,chat:[{mes:'她将头发染成金色。',is_user:false,swipe_id:0}]};
saveAppearanceOverride(settings,ctx,'star','golden hair');const override=resolveAppearanceOverride(settings,ctx,'star');
assert(authorityAppearance(role,{},override).includes('golden hair'));assert(!authorityAppearance(role,{},override).includes('silver hair'));assert(authorityAppearance(role,{},override).includes('blue eyes'));
assert.equal(resolveAppearanceOverride(settings,{...ctx,chatId:'two'},'star'),null);
assert.equal(resolveAppearanceOverride(settings,{...ctx,chat:[{mes:'她将头发染成金色。',swipe_id:1}]},'star'),null);
clearAppearanceOverride(settings,ctx,'star');assert.equal(resolveAppearanceOverride(settings,ctx,'star'),null);
const dynamic='Scene Composition:1girl, rooftop;Character 1 Dynamic: {"roleKey":"star","action":["sitting"],"expression":["surprised"],"position":[0.5,0.5],"appearanceFromBody":{"tags":["golden hair"],"evidence":"她将头发染成金色。"},"appearanceChange":{"tags":["golden hair"],"evidence":"她将头发染成金色。"}};Character 1 UC:bad hands;';
const normalized=normalizeDynamicTag(dynamic,ctx.chat[0].mes);assert(normalized.tag.includes('Character 1 Prompt:'));assert(normalized.tag.includes('sitting'));assert.equal(normalized.candidates.length,1);assert(normalized.provenFields[1].includes('golden hair'));
assert(!normalizeDynamicTag(dynamic,'其他正文').tag.includes('golden hair'),'unproven body fields never enter prompt');
assert.throws(()=>normalizeDynamicTag('Character 1 Dynamic:{"position":[2,0]};'),/坐标/);
const missing={...settings,characterPresets:{star:{nameCN:'star'}}};
assert(enforceCharacterConsistency({...fresh(),characters:[{...fresh().characters[0],prompt:'sitting'}]},missing,[{id:1,prompt:'sitting'}]).warnings.length);
console.log('Consistency: screenshot conflict, positive/negative source validation, action retention, wardrobe authority, evidence, overrides and source invalidation passed.');

const acting=fresh();acting.characters[0].prompt+=' , golden hair tucked behind ear';
assert(enforceCharacterConsistency(acting,settings,prepared,state).positive.includes('silver hair tucked behind ear'));
const withCollar=fresh();withCollar.characters[0].prompt+=' , dress with bow';
assert(!enforceCharacterConsistency(withCollar,settings,prepared,state).positive.includes('dress with bow'));

const fallbackSettings={...settings,sopDefaultOutfitKey:'basic',outfitPresets:{basic:{upperBody:'white shirt',fullBody:'blue skirt'}}};
const publicWear=enforceCharacterConsistency(fresh(),fallbackSettings,prepared,{},'她坐着。');assert(publicWear.positive.includes('school uniform'));assert(!publicWear.positive.includes('white shirt'));
const bodyWear=enforceCharacterConsistency(fresh(),fallbackSettings,prepared,{},'她穿校服坐着。');assert(bodyWear.positive.includes('school uniform'));
