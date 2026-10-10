import {comfyAddressKey} from './character-lora.js';
import {validateSopLoraFiles} from './generation-sop-validation.js';

export function presetAddresses(settings,id) {
  const preset=settings.yushe?.[id];
  if(Array.isArray(preset?.comfyuiAddresses)) return [...new Set(preset.comfyuiAddresses.map(comfyAddressKey).filter(Boolean))];
  const addresses=[];
  if(!settings.comfyui_sop_by_address&&settings.comfyui_public_person_preset===id)addresses.push(comfyAddressKey(settings.comfyuiUrl));
  for(const role of Object.values(settings.characterPresets||{})) for(const [address,value] of Object.entries(role.promptPresetsByAddress||{})) {
    if((typeof value==='object'?value?.presetId:value)===id)addresses.push(comfyAddressKey(address));
  }
  for(const [address,value] of Object.entries(settings.comfyui_sop_by_address||{})) if(value.public_person_preset===id)addresses.push(comfyAddressKey(address));
  for(const profile of Object.values(settings.comfyui_profiles||{})) if(profile.yusheid_comfyui===id||profile.comfyui_public_person_preset===id)addresses.push(comfyAddressKey(profile.comfyuiUrl));
  return [...new Set(addresses.filter(Boolean))];
}
export function bindPresetAddress(settings,id,address) {
  if(!settings.yushe?.[id]||!comfyAddressKey(address))return;
  settings.yushe[id].comfyuiAddresses=[...new Set([...presetAddresses(settings,id),comfyAddressKey(address)])];
}
export function filterComfyPresets(settings,address,{files,includeUnassigned=false}={}) {
  const current=comfyAddressKey(address),visible=[],hidden=[];
  for(const [id,preset] of Object.entries(settings.yushe||{})) {
    const addresses=presetAddresses(settings,id);
    let reason='unassigned';
    if(addresses.length)reason=addresses.includes(current)?'address':'other-address';
    else if(/<(?:lora|wlr):/i.test([preset.fixedPrompt,preset.fixedPrompt_end,preset.negativePrompt].join(' '))&&Array.isArray(files)) {
      try{validateSopLoraFiles({scenePrompt:[preset.fixedPrompt,preset.fixedPrompt_end].filter(Boolean).join(', '),sceneNegative:preset.negativePrompt},files);reason='compatible';}
      catch{reason='missing-lora';}
    }
    const entry={id,reason,addresses};
    if(reason==='address'||reason==='compatible'||(reason==='unassigned'&&includeUnassigned))visible.push(entry);else hidden.push(entry);
  }
  visible.sort((a,b)=>a.id.localeCompare(b.id,'zh-CN'));
  return {visible,hidden};
}
