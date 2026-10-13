const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function composeVocabularyDemand(text,tags){
    const unique=[...new Map(tags.filter(t=>typeof t.name==='string'&&t.name.trim()).map(t=>[t.name.trim(),t])).values()];
    const keywords=unique.map(t=>t.name.trim()+(t.translation?'（'+t.translation+'）':'')).join(', ');
    return [String(text||'').trim(),keywords?'词库关键词：'+keywords:''].filter(Boolean).join('\n\n');
}
export function composeDirectTags(text,tags){
    return [...new Set([String(text||'').trim(),...tags.map(t=>t.name?.trim()).filter(Boolean)].filter(Boolean))].join(', ');
}
export function mountDemandVocabulary({bubble,textarea,confirmBtn,db}){
    const section=document.createElement('details');section.className='cosji-demand-vocabulary';section.open=true;
    section.innerHTML='<summary>词库列表与搜索</summary><div class="cosji-demand-search"><select data-vocab-source aria-label="词库来源"><option value="">全部已安装词库</option></select><input data-vocab-query placeholder="搜索中文或英文词条" aria-label="搜索词条"><button type="button" data-vocab-search>搜索</button></div><p data-vocab-status role="status">正在读取已安装词库…</p><div data-vocab-results class="cosji-demand-results"></div><div class="cosji-demand-pagination"><button type="button" data-vocab-prev>上一页</button><span data-vocab-page>第 1 / 1 页</span><button type="button" data-vocab-next>下一页</button><select data-vocab-size aria-label="每页词条数"><option value="12">12 条 / 页</option><option value="24" selected>24 条 / 页</option><option value="48">48 条 / 页</option></select></div><div class="cosji-demand-selected-header"><span data-vocab-count>已选 0 项</span><button type="button" data-vocab-clear>清空已选</button></div><div data-vocab-selected class="cosji-demand-selected"></div>';
    textarea.after(section);
    const q=s=>section.querySelector(s),chosen=new Map();let results=[],timer,request=0,closed=false,page=1,total=0;
    const originalLabel=confirmBtn.textContent;
    function renderSelected(){
        q('[data-vocab-count]').textContent='已选 '+chosen.size+' 项';
        q('[data-vocab-selected]').innerHTML=[...chosen.values()].map((t,i)=>`<button type="button" data-remove="${i}" aria-label="移除 ${esc(t.name)}">${esc(t.translation||t.name)} ×</button>`).join('');
        confirmBtn.textContent=chosen.size?'按所选词条生成':originalLabel;
        q('[data-vocab-clear]').disabled=!chosen.size;
        q('[data-vocab-results]').querySelectorAll('[data-tag-index]').forEach(b=>b.setAttribute('aria-pressed',String(chosen.has(results[Number(b.dataset.tagIndex)]?.name))));
    }
    async function search(reset=true){
        if(reset!==false)page=1;
        clearTimeout(timer);const id=++request,query=q('[data-vocab-query]').value.trim(),source=q('[data-vocab-source]').value;
        q('[data-vocab-status]').textContent=query?'正在搜索…':'正在加载词库列表…';
        try{
            const size=Number(q('[data-vocab-size]').value);
            const found=await db.searchTags(query,{browse:true,fileName:source,startsWith:false,limit:size,offset:(page-1)*size,paged:true,sortBy:'hot_asc'});
            if(closed||id!==request)return;
            total=found.total;
            const pages=Math.max(1,Math.ceil(total/size));
            if(page>pages){page=pages;return search(false);}
            q('[data-vocab-page]').textContent=`第 ${page} / ${pages} 页 · 共 ${total} 项`;
            q('[data-vocab-prev]').disabled=page<=1;q('[data-vocab-next]').disabled=page>=pages;
            results=found.items.filter(t=>typeof t.name==='string'&&t.name.trim());
            q('[data-vocab-results]').innerHTML=results.map((t,i)=>`<button type="button" data-tag-index="${i}" aria-pressed="${chosen.has(t.name)}"><strong>${esc(t.name)}</strong><span>${esc(t.translation||'暂无翻译')}</span></button>`).join('');
            q('[data-vocab-status]').textContent=results.length?`本页 ${results.length} 项；跨页保留已选词条，点击生成时一起提交。`:'没有匹配词条；可换关键词，或先到“词库管理”安装词库。';
        }catch(e){if(!closed&&id===request)q('[data-vocab-status]').textContent='词库读取失败：'+e.message;}
    }
    section.onclick=e=>{
        const tag=e.target.closest('[data-tag-index]'),remove=e.target.closest('[data-remove]');
        if(tag){const t=results[Number(tag.dataset.tagIndex)];if(!t)return;chosen.has(t.name)?chosen.delete(t.name):chosen.set(t.name,{name:t.name,translation:t.translation||''});renderSelected();}
        if(remove){chosen.delete([...chosen.keys()][Number(remove.dataset.remove)]);renderSelected();}
    };
    q('[data-vocab-prev]').onclick=()=>{if(page>1){page--;search(false);}};
    q('[data-vocab-next]').onclick=()=>{if(page<Math.ceil(total/Number(q('[data-vocab-size]').value))){page++;search(false);}};
    q('[data-vocab-size]').onchange=search;
    q('[data-vocab-search]').onclick=search;q('[data-vocab-source]').onchange=search;
    q('[data-vocab-query]').oninput=()=>{request++;clearTimeout(timer);timer=setTimeout(search,250);};
    q('[data-vocab-query]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();search();}};
    q('[data-vocab-clear]').onclick=()=>{chosen.clear();renderSelected();};
    renderSelected();
    (async()=>{try{const sources=await db.getInstalledVocabularies();if(closed)return;const names=[...new Set(sources.map(s=>s.fileName).filter(Boolean))];q('[data-vocab-source]').innerHTML='<option value="">全部已安装词库</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')+'<option value="manual">手动词条</option>';await search();}catch(e){if(!closed)q('[data-vocab-status]').textContent='无法读取词库列表：'+e.message;}})();
    return {getDirectText:text=>composeDirectTags(text,[...chosen.values()]),getText:text=>composeVocabularyDemand(text,[...chosen.values()]),dispose(){closed=true;request++;clearTimeout(timer);}};
}
