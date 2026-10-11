import {splitLoras,joinLoras,normalizeComfyUrl} from './cosji-core.mjs';
const path=name=>String(name).replace(/\\/g,'/');
export function inspectLoras(preset,names){
    return splitLoras(preset).loras.map(lora=>({...lora,availableName:names.find(name=>path(name)===path(lora.name))||null}));
}
export function copyForAddress(preset,url,names,resolutions){
    const draft=splitLoras(preset),checked=inspectLoras(preset,names);
    draft.loras=checked.flatMap((lora,index)=>{
        const name=lora.availableName||resolutions[index];
        if(name==='__remove__')return [];
        if(!name||!names.includes(name))throw new Error(`请移除或替换缺失 LoRA：${lora.name}`);
        return [{name,weight:lora.weight,clipWeight:lora.clipWeight,field:lora.field}];
    });
    return {...structuredClone(preset),...joinLoras(draft),cosjiLoras:draft.loras,cosjiComfyUrl:normalizeComfyUrl(url)};
}
export function availableAt(preset,url){return !preset.cosjiComfyUrl||normalizeComfyUrl(preset.cosjiComfyUrl)===normalizeComfyUrl(url);}
