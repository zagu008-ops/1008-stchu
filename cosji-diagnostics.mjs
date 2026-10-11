export function inspectConfiguration(s,objectInfo){
    const models=objectInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]||[];
    const samplers=objectInfo.KSampler?.input?.required?.sampler_name?.[0]||[];
    const schedulers=objectInfo.KSampler?.input?.required?.scheduler?.[0]||[];
    const problems=[],repair={};
    if(!models.includes(s.MODEL_NAME)){
        problems.push('当前大模型未选择或在此地址不存在');
        if(models.length===1)repair.MODEL_NAME=models[0];
    }
    if(!samplers.includes(s.comfyuisamplerName)){
        problems.push('采样器未选择或无效');if(samplers.includes('euler'))repair.comfyuisamplerName='euler';
    }
    if(!schedulers.includes(s.comfyui_scheduler)){
        problems.push('调度器未选择或无效');if(schedulers.includes('normal'))repair.comfyui_scheduler='normal';
    }
    let missing=[];
    try{missing=[...new Set(Object.values(JSON.parse(s.worker)).filter(n=>!n._skip).map(n=>n.class_type).filter(type=>type&&!objectInfo[type]))];}
    catch{problems.push('工作流 JSON 无效');}
    if(missing.length)problems.push('工作流缺失节点：'+missing.join('、'));
    return {models,samplers,schedulers,problems,repair,missing};
}
