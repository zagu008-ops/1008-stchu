export function configureXLRuntime(workflow,refinerSeed=-1,random=Math.random){
    if(!Object.values(workflow).some(node=>node._meta?.cosjiXLTwoPass))return workflow;
    const seed=Number(refinerSeed);
    const actual=Number.isSafeInteger(seed)&&seed>=0?seed:Math.floor(random()*Number.MAX_SAFE_INTEGER);
    for(const node of Object.values(workflow))if(node.class_type==='KSamplerAdvanced')node.inputs.noise_seed=actual;
    return workflow;
}
export async function recordMediaDimensions(params,url,ImageType=globalThis.Image){
    if(!ImageType||!params)return;
    const image=new ImageType();image.src=url;
    await image.decode();
    if(image.naturalWidth&&image.naturalHeight){
        params.baseWidth=params.width;params.baseHeight=params.height;
        params.width=image.naturalWidth;params.height=image.naturalHeight;
        params.imageSize=`${image.naturalWidth} × ${image.naturalHeight}`;
    }
}
export function mountXLRuntimeControls(settings,save,doc=document){
    const seedInput=doc.getElementById('comfyui_seed');if(!seedInput||doc.getElementById('cosji-refiner-seed'))return;
    const field=doc.createElement('div');field.className=seedInput.parentElement.className;
    const label=doc.createElement('label');label.htmlFor='cosji-refiner-seed';label.textContent='XL 二次采样种子（-1 为每次随机）';
    const input=doc.createElement('input');input.type='number';input.min='-1';input.max=String(Number.MAX_SAFE_INTEGER);input.step='1';input.id='cosji-refiner-seed';input.className=seedInput.className;input.value=String(settings.cosji?.refinerSeed??-1);
    input.onchange=()=>{if(!input.reportValidity())return;settings.cosji??={};settings.cosji.refinerSeed=Number(input.value);save();};
    const hint=doc.createElement('small');hint.textContent='仅用于 0911 XL 两段工作流。要复现 ComfyUI 图像，首轮与二次种子都需填写对应执行记录中的值。';hint.style.cssText='display:block;opacity:.7;margin-top:6px';
    field.append(label,input,hint);seedInput.parentElement.after(field);
}
export function actualMediaParams(params,media){
    const width=media?.naturalWidth||media?.videoWidth,height=media?.naturalHeight||media?.videoHeight;
    if(!width||!height)return params;
    const result={...(params||{}),width,height,imageSize:`${width} × ${height}`};
    if(params?.baseWidth||params?.width)result.baseWidth=params.baseWidth||params.width;
    if(params?.baseHeight||params?.height)result.baseHeight=params.baseHeight||params.height;
    return result;
}
