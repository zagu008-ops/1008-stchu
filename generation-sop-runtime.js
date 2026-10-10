import {buildGenerationPlan,materializeSopWorkflow,resolveSopAddressSettings} from './generation-sop.js';
import {openRegionPreview} from './sop-identity-ui.js';
export function chooseSopFallback(message, action) {
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='wardrobe-dialog';
    const h=document.createElement('h3');h.textContent='生图配置需要选择';
    const p=document.createElement('p');p.textContent=message;
    const yes=document.createElement('button');yes.type='button';yes.textContent=action;
    const no=document.createElement('button');no.type='button';no.textContent='取消，先配置';
    let result=false;yes.onclick=()=>{result=true;d.close();};no.onclick=()=>d.close();
    d.append(h,p,yes,no);document.body.append(d);d.addEventListener('close',()=>{d.remove();resolve(result);},{once:true});d.showModal();
  });
}
export async function prepareSopGeneration(options) {
  options={...options,settings:resolveSopAddressSettings(options.settings)};
  // Regional execution is paused: all multi-person requests use the ordinary workflow.
  options.singleRoleLora=true;
  let allowMerged=true,allowGlobalLoras=true;
  for (;;) {
    try {
      let plan=buildGenerationPlan({...options,allowMerged,allowGlobalLoras});
      if(plan.mode==='regional')materializeSopWorkflow(plan.workflow,plan);
      if(plan.mode==='regional' && (options.settings.comfyui_region_preview===true||options.settings.comfyui_region_preview==='true')) {
        plan=await openRegionPreview(plan);if(!plan)throw new DOMException('已取消区域预览','AbortError');
        plan.snapshot.characters=structuredClone(plan.characters);
      }
      return plan;
    } catch(error) {
      if(['MULTI_UNSUPPORTED','MULTI_STRUCTURE_REQUIRED','MULTI_WORKFLOW_REQUIRED','REGIONAL_CONTRACT_INVALID'].includes(error.code)&&!allowMerged) {
        if(!await chooseSopFallback(error.message,'本次使用普通合并生成'))throw new DOMException('已取消生图','AbortError');allowMerged=true;continue;
      }
      if(error.code==='GLOBAL_LORA_CONFIRM'&&!allowGlobalLoras) {
        if(!await chooseSopFallback(error.message,'本次允许全局 LoRA'))throw new DOMException('已取消生图','AbortError');allowGlobalLoras=true;continue;
      }
      throw error;
    }
  }
}
