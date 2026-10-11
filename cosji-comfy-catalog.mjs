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
