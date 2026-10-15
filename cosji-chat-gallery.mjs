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
