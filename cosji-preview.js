const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function previewMarkup(preset, small=false) {
    return preset?.cosjiPreview?.dataUrl
        ? `<img class="cosji-outfit-thumb ${small?'cosji-thumb-small':''}" src="${esc(preset.cosjiPreview.dataUrl)}" alt="服装预览图">`
        : `<span class="cosji-outfit-thumb cosji-thumb-empty ${small?'cosji-thumb-small':''}">无预览</span>`;
}

async function compactCover(blob) {
    if(!blob?.type?.startsWith('image/'))throw new Error('此缓存不是可用的图片');
    const bitmap=await createImageBitmap(blob);
    try {
        const scale=Math.min(1,128/bitmap.width,160/bitmap.height);
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        return canvas.toDataURL('image/jpeg',0.8);
    } finally {bitmap.close();}
}

export async function chooseCacheCover(gallery) {
    const metadata=await gallery.metadata();
    const seen=new Set();
    const images=Object.values(metadata).flatMap(m=>m.images||[]).filter(img=>{
        if(img.isVideo||!img.uuid||seen.has(img.uuid))return false;
        seen.add(img.uuid);return true;
    }).sort((a,b)=>(Number(b.date)||0)-(Number(a.date)||0));
    return await new Promise(resolve=>{
        const dialog=document.createElement('dialog');dialog.className='cosji-dialog cosji-cache-dialog';
        dialog.innerHTML='<h3>从生成缓存选择服装预览图</h3><p class="cosji-muted">点击小图保存为当前服装封面。</p><div class="cosji-cache-grid"></div><p role="status" class="cosji-cache-status"></p><div class="cosji-row"><button type="button" class="cosji-button" data-page="-1">上一页</button><span class="cosji-cache-page"></span><button type="button" class="cosji-button" data-page="1">下一页</button><button type="button" class="cosji-button" data-close>取消</button></div>';
        const grid=dialog.querySelector('.cosji-cache-grid'),status=dialog.querySelector('.cosji-cache-status');
        let page=0,generation=0,closed=false,busy=false;const urls=new Set();const total=Math.max(1,Math.ceil(images.length/24));
        const release=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
        const finish=value=>{closed=true;generation++;release();dialog.close();dialog.remove();resolve(value);};
        async function render(){
            const token=++generation;release();grid.replaceChildren();
            status.textContent=images.length?'':'还没有生成过的缓存图片。';
            dialog.querySelector('.cosji-cache-page').textContent=`${page+1} / ${total} 页 · ${images.length} 张`;
            dialog.querySelector('[data-page="-1"]').disabled=page===0;
            dialog.querySelector('[data-page="1"]').disabled=page+1===total;
            for(const entry of images.slice(page*24,(page+1)*24)){
                const button=document.createElement('button');button.type='button';button.className='cosji-cache-image';
                button.textContent='加载中';button.disabled=true;button.setAttribute('aria-label',`选择缓存图片 ${entry.uuid}`);grid.append(button);
                (async()=>{
                    try{
                        const blob=await gallery.thumbnail(entry.thumbnail_uuid)||await gallery.image(entry.uuid);
                        if(closed||token!==generation)return;
                        if(!blob||!blob.type.startsWith('image/'))throw new Error('图片不可用');
                        const url=URL.createObjectURL(blob);urls.add(url);
                        const img=document.createElement('img');img.src=url;img.alt='缓存缩略图';button.replaceChildren(img);button.disabled=false;
                        button.addEventListener('click',async()=>{
                            if(busy)return;busy=true;status.textContent='正在保存小尺寸预览图…';
                            try{finish({dataUrl:await compactCover(blob),cacheUuid:entry.uuid});}
                            catch(error){status.textContent=error.message;busy=false;}
                        });
                    }catch(error){if(!closed&&token===generation){button.textContent='图片失效';button.title=error.message;}}
                })();
            }
        }
        dialog.addEventListener('click',e=>{const delta=e.target.closest('[data-page]')?.dataset.page;if(delta&&!busy){page=Math.min(total-1,Math.max(0,page+Number(delta)));render();}});
        dialog.querySelector('[data-close]').addEventListener('click',()=>finish(null));
        dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
        document.body.append(dialog);dialog.showModal();render();
    });
}
