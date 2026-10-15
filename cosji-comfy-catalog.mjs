import {normalizeComfyUrl} from './cosji-core.mjs';
export async function fetchComfyInfo(address,{fetchImpl=fetch,headers}={}){
    const url=normalizeComfyUrl(address);
    const requestHeaders=headers || window.SillyTavern.getContext().getRequestHeaders();
    const response=await fetchImpl('/api/sd/comfy/object-info',{method:'POST',headers:requestHeaders,body:JSON.stringify({url}),signal:AbortSignal.timeout(20000)});
    // Older SillyTavern servers do not have the optional catalog relay.
    // Keep direct ComfyUI access working without sending the Tavern CSRF token.
    if(response.status===404 || response.status===405){
        let direct;
        try{direct=await fetchImpl(url+'/object_info',{signal:AbortSignal.timeout(20000)});}
        catch(error){throw new Error('酒馆缺少模型列表转发接口，直连 ComfyUI 也失败：'+error.message+'。请检查地址和跨域设置，或安装酒馆转发补丁。');}
        if(!direct.ok)throw new Error('直连 ComfyUI 模型列表失败 ('+direct.status+')：'+await direct.text());
        return direct.json();
    }
    if(!response.ok)throw new Error('酒馆读取 ComfyUI 模型列表失败 ('+response.status+')：'+await response.text());
    return response.json();
}
export async function fetchComfyLoras(address,{fetchImpl=fetch,headers}={}){
    const url=normalizeComfyUrl(address);
    let directError;
    try{
        const response=await fetchImpl(url+'/object_info/LoraLoader',{credentials:'omit',signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const info=await response.json();
        const names=info.LoraLoader?.input?.required?.lora_name?.[0];
        if(!Array.isArray(names))throw new Error('目标地址未提供 LoRA 模型列表');
        return [...new Set(names.filter(n=>typeof n==='string'))];
    }catch(error){directError=error;}
    try{
        const info=await fetchComfyInfo(url,{fetchImpl,headers});
        const names=info.LoraLoader?.input?.required?.lora_name?.[0];
        if(!Array.isArray(names))throw new Error('目标地址未提供 LoRA 模型列表');
        return [...new Set(names.filter(n=>typeof n==='string'))];
    }catch(error){
        const message=e=>e.name==='TimeoutError'||e.name==='AbortError'?'请求超时':e.message;
        throw new Error(`无法读取 ${url} 的 LoRA 列表。直连：${message(directError)}；酒馆转发：${message(error)}。请确认目标地址仍在线、IP 未变化，且允许当前酒馆跨域访问。`);
    }
}
export function comfyCatalog(info){
    const names=(node,key)=>info[node]?.input?.required?.[key]?.[0]||[];
    return {
        models:[...names('CheckpointLoaderSimple','ckpt_name').map(value=>({value,text:value})),...names('UNETLoader','unet_name').map(value=>({value,text:'UNet: '+value})),...names('UnetLoaderGGUF','unet_name').map(value=>({value,text:'GGUF: '+value}))],
        samplers:names('KSampler','sampler_name'),schedulers:names('KSampler','scheduler'),
        vaes:names('VAELoader','vae_name'),CLIPs:names('CLIPLoader','clip_name'),loras:names('LoraLoader','lora_name'),objectInfo:info
    };
}
export function applyComfyCatalog(cache,settings,doc=document){
    for(const [id,key] of Object.entries({MODEL_NAME:'models',comfyuisamplerName:'samplers',comfyui_scheduler:'schedulers',comfyui_vae:'vaes',comfyuiCLIPName:'CLIPs'})){
        const el=doc.getElementById(id);if(!el)continue;
        const values=cache[key]||[],selected=settings[id]||el.value;
        el.replaceChildren(...values.map(v=>new Option(v.text||v.value||v,v.value||v)));
        if(values.some(v=>(v.value||v)===selected))el.value=selected;
        else if(values.length){el.add(new Option('当前配置：'+selected,selected,true,true),0);el.value=selected;}
        else el.add(new Option('此地址没有可用选项',''));
        el.disabled=!values.length;
        el.title=values.length?'已从当前 ComfyUI 读取，可点击切换':'此地址未返回可用选项';
    }
}
