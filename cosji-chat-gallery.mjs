// Keep the actual generated media associated with its button across nested markup.
const generatedMedia = new WeakMap();
export function registerChatMedia(button, media) {
    if (button && media) generatedMedia.set(button, media);
}
export function collectChatMedia(root) {
    const entries=[],seen=new Set(),visited=new Set();
    const visit=node=>{
        if(!node||visited.has(node))return;visited.add(node);
        for(const element of node.querySelectorAll('.image-tag-button[data-link], iframe')) {
            if(element.tagName==='IFRAME'){
                try{visit(element.contentDocument);}catch{/* Cross-origin frames are inaccessible. */}
                continue;
            }
            if(seen.has(element)||!element.dataset.link)continue;
            let media=generatedMedia.get(element);
            if(!media||media.isConnected===false){
                const sibling=element.nextElementSibling;
                if(sibling?.matches?.('.st-chatu8-image-span'))media=sibling.querySelector('img, video');
                if(!media&&element.dataset.requestId){
                    const scope=element.closest('.mes')||element.ownerDocument;
                    const span=[...scope.querySelectorAll('.st-chatu8-image-span[data-request-id]')].find(s=>s.dataset.requestId===element.dataset.requestId);
                    media=span?.querySelector('img, video');
                }
            }
            if(!media||media.isConnected===false)continue;
            seen.add(element);entries.push({button:element,img:media});
        }
    };
    visit(root);return entries;
}
export function adjacentChatMedia(entries, button, direction) {
    const index=entries.findIndex(entry=>entry.button===button);
    return index<0?null:entries[index+direction]||null;
}

export function chatMediaGroups(chat, {startTag='image###',endTag='###',normalize=s=>s.trim(),convert=s=>s}={}) {
    const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const groups=[];
    for(let floor=0;floor<(chat||[]).length;floor++) {
        const text=convert(String(chat[floor]?.mes||'')),found=[];
        const patterns=[new RegExp(escape(startTag)+'([\\s\\S]*?)'+escape(endTag),'g')];
        if(startTag!=='<image>')patterns.push(/<image>\s*([^<>]+?)\s*<\/image>/g);
        for(const regex of patterns)for(const match of text.matchAll(regex))found.push({at:match.index,tag:normalize(match[1])});
        const seen=new Set();
        for(const item of found.sort((a,b)=>a.at-b.at)) {
            if(!item.tag||seen.has(item.tag))continue;seen.add(item.tag);
            groups.push({id:floor+':'+groups.length,floor,tag:item.tag});
        }
    }
    return groups;
}
export async function cachedChatMediaGroups(groups, read, concurrency=4) {
    const cache=new Map(),results=new Array(groups.length);let cursor=0;
    await Promise.all(Array.from({length:Math.min(concurrency,groups.length)},async()=>{
        while(cursor<groups.length){
            const index=cursor++,group=groups[index];
            if(!cache.has(group.tag))cache.set(group.tag,Promise.resolve().then(()=>read(group.tag)).catch(()=>null));
            const data=await cache.get(group.tag);
            if(data?.images?.length)results[index]={...group,count:data.images.length};
        }
    }));
    return results.filter(Boolean);
}
export function chatMediaFloor(button) {
    let element=button;
    for(let depth=0;element&&depth<10;depth++) {
        const mes=element.closest?.('.mes');
        if(mes){const id=mes.getAttribute('mesid')??mes.dataset?.mesid;if(id!==null&&id!==undefined&&/^\d+$/.test(String(id)))return Number(id);}
        try{element=element.ownerDocument?.defaultView?.frameElement;}catch{return null;}
    }
    return null;
}
