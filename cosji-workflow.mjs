export function resolveWorkflow(value,preset){
    const source=value&&typeof value==='object'?JSON.stringify(value):String(value??'');
    if(source.trim())return source;
    return preset&&typeof preset==='object'?JSON.stringify(preset):String(preset??'');
}
