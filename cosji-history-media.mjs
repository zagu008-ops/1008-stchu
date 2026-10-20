// Media stays in IndexedDB rather than inflating SillyTavern settings/export JSON.
let database;
function open(){
    return database??=new Promise((resolve,reject)=>{
        const request=indexedDB.open('cosji-task-media',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('images');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
    }).catch(error=>{database=null;throw error;});
}
async function transaction(mode,run){
    const db=await open();
    return new Promise((resolve,reject)=>{
        const tx=db.transaction('images',mode),request=run(tx.objectStore('images'));
        tx.oncomplete=()=>resolve(request?.result);
        tx.onerror=tx.onabort=()=>reject(tx.error||new Error('图片缓存读写失败'));
    });
}
export async function saveHistoryMedia(id,data,format='png'){
    let blob;
    if(data instanceof Blob)blob=data;
    else if(data instanceof ArrayBuffer||ArrayBuffer.isView(data))blob=new Blob([data],{type:`image/${format==='image'?'png':format}`});
    else {
        const url=String(data);
        if(!/^(data:(image|video)\/|blob:|https?:\/\/|\/)/i.test(url))throw new Error('无法识别的图片地址');
        const response=await fetch(url);if(!response.ok)throw new Error('图片读取失败');
        blob=await response.blob();
    }
    await transaction('readwrite',store=>store.put(blob,id));
    return id;
}
export const readHistoryMedia=id=>transaction('readonly',store=>store.get(id));
export function historyTags(info={}){
    const final=(info.promptTrace||[]).findLast(t=>t.values?.最终正向!==undefined)?.values;
    return {positive:final?.最终正向??info.生成Tag??info.原始Tag??'',negative:final?.最终负向??info.负向Tag??''};
}
export async function pruneHistoryMedia(ids){
    const keep=new Set(ids),db=await open();
    await new Promise((resolve,reject)=>{
        const tx=db.transaction('images','readwrite'),cursor=tx.objectStore('images').openCursor();
        cursor.onsuccess=()=>{const entry=cursor.result;if(!entry)return;if(!keep.has(entry.key))entry.delete();entry.continue();};
        tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
    });
}
