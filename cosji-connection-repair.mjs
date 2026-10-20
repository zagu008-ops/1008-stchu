import {capturePage,copyPageForAddress,applyPage} from './cosji-address-config.mjs';
const normalized=url=>String(url||'').replace(/\/+$/,'').replace('localhost','127.0.0.1');
// Apply an explicitly approved local repair only when the server still lacks the old model.
export async function applyConnectionRepair(settings,repair,readInfo){
    if(!repair||normalized(settings.comfyuiUrl)!==normalized(repair.url))return false;
    const workflow=typeof settings.worker==='string'?settings.worker:JSON.stringify(settings.worker||{});
    if(!repair.invalidModels.some(name=>settings.MODEL_NAME===name||workflow.includes(name)))return false;
    const info=await readInfo(settings.comfyuiUrl);
    const models=info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]||[];
    if(!models.includes(repair.model)||models.includes(settings.MODEL_NAME)&&!repair.invalidModels.some(name=>workflow.includes(name)&&!models.includes(name)))return false;
    settings.cosji??={};
    settings.cosji.connectionRepairBackups??=[];
    settings.cosji.connectionRepairBackups.unshift({at:Date.now(),MODEL_NAME:settings.MODEL_NAME,workerid:settings.workerid,worker:settings.worker,page:capturePage(settings)});
    settings.cosji.connectionRepairBackups=settings.cosji.connectionRepairBackups.slice(0,3);
    const names=info.LoraLoader?.input?.required?.lora_name?.[0]||[];
    const page=copyPageForAddress(capturePage(settings),repair.url,names);
    const preset=page.yushe[settings.yusheid_comfyui];
    if(preset&&repair.outfit===settings.yusheid_comfyui&&names.includes(repair.lora)&&!preset.fixedPrompt?.includes(repair.lora)){
        preset.fixedPrompt=[preset.fixedPrompt,`<lora:${repair.lora}:1>`].filter(Boolean).join(', ');
    }
    applyPage(settings,page);
    const patch={comfyuiUrl:repair.url,MODEL_NAME:repair.model,workerid:repair.name,worker:JSON.stringify(repair.workflow,null,2),client:'jiuguan'};
    Object.assign(settings,patch);settings.workers??={};settings.workers[repair.name]=patch.worker;
    const profile=settings.comfyui_profiles?.[settings.comfyui_profile_id];
    if(profile){Object.assign(profile,patch);profile.workers??={};profile.workers[repair.name]=patch.worker;}
    settings.cosji.addressConfigs??={};settings.cosji.addressConfigs[normalized(repair.url)]=capturePage(settings);
    return true;
}
export async function loadConnectionRepair(settings,readInfo){
    const response=await fetch(new URL('./cosji-connection-repair.local.json',import.meta.url),{cache:'no-store'});
    if(response.status===404)return false;
    if(!response.ok)throw Error('读取已确认的连接修复配置失败');
    return applyConnectionRepair(settings,await response.json(),readInfo);
}
