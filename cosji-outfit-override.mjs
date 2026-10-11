// Match garment tags, not locations such as "school corridor" or actions.
const garment=/\b(?:school[ _-]?uniform|uniform|shirt|blouse|t[ _-]?shirt|tank[ _-]?top|crop[ _-]?top|sweater|cardigan|hoodie|jacket|coat|blazer|vest|dress|gown|skirt|pants|trousers|jeans|shorts|leggings|stockings|pantyhose|tights|socks|shoes|boots|sneakers|heels|sandals|necktie|tie|bowtie|hat|cap|bonnet|gloves|apron|leotard|bodysuit|swimsuit|bikini|bra|panties|underwear|bunny[ _-]?(?:suit|outfit|ears)|maid[ _-]?(?:outfit|dress)|sailor[ _-]?(?:collar|uniform)|collared|sleeveless|long[ _-]?sleeves|short[ _-]?sleeves|clothing|outfit|costume)\b|校服|制服|衬衫|裙|外套|裤|领带|丝袜|长袜|鞋|靴|服装|衣服/i;
function tags(text){
    let depth=0,angle=0,start=0;const result=[];
    for(let i=0;i<text.length;i++){
        const c=text[i];if(c==='<')angle++;if(c==='>')angle=Math.max(0,angle-1);
        if(!angle){if(c==='('||c==='[')depth++;if(c===')'||c===']')depth=Math.max(0,depth-1);}
        if(c===','&&!depth&&!angle){result.push(text.slice(start,i));start=i+1;}
    }
    result.push(text.slice(start));return result;
}
export function overrideOutfitTags(prompt,preset,enabled){
    if(!enabled)return {prompt,removed:[],applied:false};
    if(!String(preset?.fixedPrompt||'').trim()&&!String(preset?.fixedPrompt_end||'').trim())return {prompt,removed:[],applied:false,reason:'服装预设没有正向提示词，保留原服装'};
    const removed=[];
    const parts=String(prompt||'').split('|').map(part=>tags(part).filter(tag=>{
        if(/<\s*(?:lora|wlr):/i.test(tag))return true;
        if(garment.test(tag)){removed.push(tag.trim());return false;}return true;
    }).map(t=>t.trim()).filter(Boolean).join(', '));
    return {prompt:parts.join(' | '),removed,applied:true};
}
