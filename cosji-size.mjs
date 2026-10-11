export function resolveComfySize(settings,width,height,test=false){
    const auto=settings.aiAutonomousResolution!==false&&settings.aiAutonomousResolution!=='false';
    const useRequest=test||auto;
    return {width:Number(useRequest&&width||settings.comfyui_width),height:Number(useRequest&&height||settings.comfyui_height),source:test?'中性测试尺寸':auto&&width&&height?'AI / 单次请求尺寸':'设置中的固定尺寸'};
}
