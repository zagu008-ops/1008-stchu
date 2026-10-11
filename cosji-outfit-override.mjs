import {withCommonPrompts} from './cosji-core.mjs';
// Match garment tags, not locations such as "school corridor" or actions.
const garment=/\b(?:school[ _-]?uniform|uniform|shirt|blouse|t[ _-]?shirt|tank[ _-]?top|crop[ _-]?top|sweater|cardigan|hoodie|jacket|coat|blazer|vest|dress|gown|skirt|pants|trousers|jeans|shorts|leggings|stockings|pantyhose|tights|socks|shoes|boots|sneakers|heels|sandals|necktie|tie|bowtie|hat|cap|bonnet|gloves|apron|leotard|bodysuit|swimsuit|bikini|bra|panties|underwear|bunny[ _-]?(?:suit|outfit|ears)|maid[ _-]?(?:outfit|dress)|sailor[ _-]?(?:collar|uniform)|collared|sleeveless|long[ _-]?sleeves|short[ _-]?sleeves|clothing|outfit|costume)\b|校服|制服|衬衫|裙|外套|裤|领带|丝袜|长袜|鞋|靴|服装|衣服/i;
const extraGarment=/\b(?:shirts?|tops?|skirts?|dresses|coats?|jackets?|swimwear|swim[ -]?suits?|bathing[ -]?suits?|one[ -]?piece[ -]?(?:swimsuit|bathing suit)|two[ -]?piece[ -]?(?:swimsuit|bathing suit)|trunks|rash[ -]?guard|wetsuit|robe|habit|veil|headwear|footwear|mittens|suspenders)\b|泳衣|泳装|泳裤|连体泳衣|比基尼|修女服|头纱|上衣|背心|连衣裙|浴衣|和服/i;
const normalized=text=>String(text??'').replace(/[_-]+/g,' ').toLowerCase();
const isGarment=tag=>garment.test(normalized(tag))||extraGarment.test(normalized(tag));
function tags(text){
    let depth=0,angle=0,start=0;const result=[];
    for(let i=0;i<text.length;i++){
        const c=text[i];if(c==='<')angle++;if(c==='>')angle=Math.max(0,angle-1);
        if(!angle){if(c==='('||c==='[')depth++;if(c===')'||c===']')depth=Math.max(0,depth-1);}
        if(/[,，;；\n\r]/.test(c)&&!depth&&!angle){result.push(text.slice(start,i));start=i+1;}
    }
    result.push(text.slice(start));return result;
}
export function overrideOutfitTags(prompt,preset,enabled){
    if(!enabled)return {prompt,removed:[],applied:false};
    if(!String(preset?.fixedPrompt||'').trim()&&!String(preset?.fixedPrompt_end||'').trim())return {prompt,removed:[],applied:false,reason:'服装预设没有正向提示词，保留原服装'};
    const removed=[];
    const parts=String(prompt||'').split('|').map(part=>tags(part).flatMap(tag=>tag.split(/(<\s*(?:lora|wlr):[^<>]*>)/i)).filter(tag=>{
        if(/<\s*(?:lora|wlr):/i.test(tag))return true;
        if(isGarment(tag)){removed.push(tag.trim());return false;}return true;
    }).map(t=>t.trim()).filter(Boolean).join(', '));
    return {prompt:parts.join(' | '),removed,applied:true};
}

// Filter every non-outfit source before composing the final prompt.
export function prepareOutfitSources({prompt,preset,settings,presetId,insertions={},enabled}) {
    const main=overrideOutfitTags(prompt,preset,enabled);
    const removed={LLM:main.removed};
    const clean=(text,source)=>{const result=overrideOutfitTags(text,preset,main.applied);removed[source]=result.removed;return result.prompt;};
    const cosji=settings.cosji||{};
    const roleId=cosji.presetRoles?.[presetId];
    const common=value=>({...value,positive:clean(value?.positive||'','公共提示词'+(value===cosji.commonPrompts?'':' / 角色'))});
    const filtered={...settings,cosji:{...cosji,commonPrompts:common(cosji.commonPrompts),roleCommonPrompts:{...cosji.roleCommonPrompts,[roleId]:common(cosji.roleCommonPrompts?.[roleId])}}};
    return {...main,removedBySource:removed,preset:withCommonPrompts(preset,filtered,presetId),insertions:Object.fromEntries(Object.entries(insertions).map(([key,value])=>[key,clean(value,'插入 / '+key)])),quality:clean(settings.AQT_comfyui||'','正向质量预设')};
}

export function findOutfitConflicts(finalPrompt,preset){
    const key=tag=>normalized(tag).replace(/[()[\]]/g,'').replace(/:\s*[\d.]+\s*$/,'').trim();
    const allowed=new Set(tags([preset.fixedPrompt,preset.fixedPrompt_end].filter(Boolean).join(', ')).map(key));
    return tags(String(finalPrompt||'')).filter(tag=>!/<\s*(?:lora|wlr):/i.test(tag)&&isGarment(tag)&&!allowed.has(key(tag))).map(tag=>tag.trim());
}
