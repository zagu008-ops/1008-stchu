// Native SDXL workflow: expand prompt LoRAs into built-in LoraLoader nodes.
export function nativeLoraWorkflow(workflow,objectInfo){
    const root=Object.entries(workflow).find(([,node])=>node._meta?.cosjiNativeLoras);
    if(!root)return workflow;
    const result=structuredClone(workflow),[checkpoint]=root,loras=[];
    for(const node of Object.values(result)){
        const field=node.class_type==='CLIPTextEncode'?'text':node.class_type==='JoinStrings'?'string1':null;
        if(!field||typeof node.inputs[field]!=='string')continue;
        node.inputs[field]=node.inputs[field].replace(/<(?:wlr|lora):([^<>]+)>/gi,(tag,body)=>{
            const parts=body.split(':'),weights=[];
            while(parts.length>1&&weights.length<3&&/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(parts.at(-1)))weights.unshift(Number(parts.pop()));
            if(!weights.length)throw Error('LoRA 权重格式无效：'+body);
            const name=parts.join(':'),names=objectInfo.LoraLoader?.input?.required?.lora_name?.[0]||[];
            const normalize=value=>value.replace(/\\/g,'/').replace(/\.(safetensors|ckpt|pt)$/i,'');
            const exact=names.find(value=>normalize(value)===normalize(name));
            if(!exact)throw Error('当前 ComfyUI 缺少 LoRA：'+name);
            const entry={name:exact,model:weights[0],clip:weights[1]??weights[0]};
            const previous=loras.find(item=>item.name===exact);
            if(previous)Object.assign(previous,entry);else loras.push(entry);
            return root[1]._meta.cosjiPreserveLoraText?tag:'';
        });
    }
    const modelOnly=root[1]._meta.cosjiNativeLoras==='modelOnly';
    if(!loras.length)for(const entry of root[1]._meta.cosjiDefaultLoras||[])loras.push({...entry});
    let model=[checkpoint,0],clip=[checkpoint,1];
    const originalNodes=Object.values(result);
    for(const [i,lora] of loras.entries()){
        let id='cosji_lora_'+i;while(result[id])id+='x';
        result[id]=modelOnly?{class_type:'LoraLoaderModelOnly',inputs:{model,lora_name:lora.name,strength_model:lora.model}}:{class_type:'LoraLoader',inputs:{model,clip,lora_name:lora.name,strength_model:lora.model,strength_clip:lora.clip}};
        model=[id,0];if(!modelOnly)clip=[id,1];
    }
    for(const node of originalNodes)for(const [key,value] of Object.entries(node.inputs||{})){
        if(!Array.isArray(value)||String(value[0])!==checkpoint)continue;
        if(value[1]===0)node.inputs[key]=model;
        if(value[1]===1)node.inputs[key]=clip;
    }
    return result;
}
