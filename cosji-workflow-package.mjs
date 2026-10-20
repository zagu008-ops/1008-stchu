export function installWorkflowPackage(settings,pack){
    if(String(settings.comfyuiUrl||'').replace(/\/+$/,'')!==pack.url)return false;
    settings.cosji??={};settings.cosji.installedWorkflowPackages??={};
    if(settings.cosji.installedWorkflowPackages[pack.name]===pack.version)return false;
    const updating=settings.cosji.installedWorkflowPackages[pack.name]!==undefined;
    const workflow=JSON.stringify(pack.workflow,null,2),patch={...(!updating?pack.defaults:{}),workerid:pack.name,worker:workflow};
    settings.cosji.workflowPackageBackups??=[];
    settings.cosji.workflowPackageBackups.unshift({name:pack.name,at:Date.now(),settings:Object.fromEntries(Object.keys(patch).map(key=>[key,structuredClone(settings[key]??null)]))});
    settings.cosji.workflowPackageBackups=settings.cosji.workflowPackageBackups.slice(0,5);
    Object.assign(settings,patch);settings.workers??={};settings.workers[pack.name]=workflow;
    const profile=settings.comfyui_profiles?.[settings.comfyui_profile_id];
    if(profile){Object.assign(profile,patch);profile.workers??={};profile.workers[pack.name]=workflow;}
    settings.cosji.installedWorkflowPackages[pack.name]=pack.version;return true;
}
export async function loadWorkflowPackage(settings){
    const response=await fetch(new URL('./cosji-workflow-package.local.json',import.meta.url),{cache:'no-store'});
    if(response.status===404)return false;if(!response.ok)throw Error('读取酒馆工作流安装包失败');
    return installWorkflowPackage(settings,await response.json());
}
