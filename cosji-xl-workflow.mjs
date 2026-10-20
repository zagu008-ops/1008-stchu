// Resolve the specified two-pass XL canvas into an explicit ComfyUI API graph.
export function adaptXLWorkflow(source){
    const nodes=new Map(source.nodes.map(node=>[String(node.id),node]));
    const get=(id,type)=>{const node=nodes.get(id);if(node?.type!==type)throw Error(`源工作流节点 ${id} 应为 ${type}`);return node;};
    const base=get('1','KSampler').widgets_values,refine=get('14','KSamplerAdvanced').widgets_values;
    const upscale=get('13','LatentUpscaleBy').widgets_values,checkpoint=get('2','CheckpointLoaderSimple').widgets_values[0];
    const dimensions=get('19','EmptyLatentImagePresets').widgets_values;
    const match=String(dimensions[0]).match(/(\d+)\s*x\s*(\d+)/i);if(!match)throw Error('源工作流尺寸无法识别');
    let width=Number(match[1]),height=Number(match[2]);if(dimensions[1])[width,height]=[height,width];
    const enabledLoras=source.nodes.filter(n=>n.type==='LoraLoaderModelOnly'&&n.mode===0&&n.inputs?.some(i=>i.name==='model'&&i.link!=null)).map(n=>({name:n.widgets_values[0],model:Number(n.widgets_values[1]),clip:0}));
    const workflow={
        '2':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'%MODEL_NAME%'},_meta:{title:'XL 模型 · 酒馆选择',cosjiNativeLoras:'modelOnly',cosjiDefaultLoras:enabledLoras,cosjiPreserveLoraText:true,cosjiXLTwoPass:true}},
        '11':{class_type:'JoinStrings',inputs:{string1:'%prompt%',string2:'',delimiter:','}},
        '3':{class_type:'CLIPTextEncode',inputs:{clip:['2',1],text:['11',0]}},
        '4':{class_type:'CLIPTextEncode',inputs:{clip:['2',1],text:'%negative_prompt%'}},
        '19':{class_type:'EmptyLatentImage',inputs:{width:'%width%',height:'%height%',batch_size:1}},
        '1':{class_type:'KSampler',inputs:{model:['2',0],positive:['3',0],negative:['4',0],latent_image:['19',0],seed:'%seed%',steps:'%steps%',cfg:'%cfg_scale%',sampler_name:'%sampler_name%',scheduler:'%scheduler%',denoise:base[6]}},
        '13':{class_type:'LatentUpscaleBy',inputs:{samples:['1',0],upscale_method:upscale[0],scale_by:upscale[1]}},
        '14':{class_type:'KSamplerAdvanced',inputs:{model:['2',0],positive:['3',0],negative:['4',0],latent_image:['13',0],add_noise:refine[0],noise_seed:'%seed%',steps:refine[3],cfg:refine[4],sampler_name:refine[5],scheduler:refine[6],start_at_step:refine[7],end_at_step:refine[8],return_with_leftover_noise:refine[9]}},
        '6':{class_type:'VAEDecode',inputs:{samples:['14',0],vae:['2',2]}},
        '17':{class_type:'SaveImage',inputs:{images:['6',0],filename_prefix:'Cosji_XL_0911'}}
    };
    return {workflow,defaults:{MODEL_NAME:checkpoint,comfyui_width:String(width),comfyui_height:String(height),comfyui_steps:String(base[2]),cfg_comfyui:String(base[3]),comfyuisamplerName:base[4],comfyui_scheduler:base[5],aiAutonomousResolution:'false'}};
}
