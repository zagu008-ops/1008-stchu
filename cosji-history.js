import {createHistory,safeUrl,safeError,historyPage} from './cosji-history.mjs';
import {saveHistoryMedia,readHistoryMedia,historyTags,pruneHistoryMedia} from './cosji-history-media.mjs';
import {inspectConfiguration} from './cosji-diagnostics.mjs';
import {eventSource} from '../../../../script.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderInfo(info){
    const {promptTrace=[],图片缓存,...configuration}=info;
    const block=(label,value)=>`<h4>${esc(label)}</h4><pre style="white-space:pre-wrap;overflow-wrap:anywhere;user-select:text">${esc(typeof value==='string'?value:JSON.stringify(value,null,2))}</pre>`;
    const tags=historyTags(info);
    return `<pre>${esc(JSON.stringify(configuration,null,2))}</pre>`+
        (tags.positive?`<details class="cosji-prompt-final" open><summary>生图 Tag（正向 / 负向）</summary>${block('正向',tags.positive)}${block('负向',tags.negative||'（空）')}</details>`:'')+
        (promptTrace.length?`<details class="cosji-prompt-trace"><summary>提示词替换与合并过程（${promptTrace.length} 步）</summary>${promptTrace.map((t,i)=>`<details><summary>${i+1}. ${esc(t.stage)}</summary>${Object.entries(t.values).map(([key,value])=>block(key,value)).join('')}</details>`).join('')}</details>`:'');
}
let store,settings,requests=new Map(),openPanel=()=>{};
export function historyStart(kind,extra={},parent=''){return store?.start(kind,{...snapshot(),...extra},parent);}
export function historyStep(id,stage,info={},state='running'){store?.update(id,stage,info,state);}
export function openHistory(){openPanel();}
export function historyLLM(id,config){historyStep(id,'正在请求 LLM',{LLM模型:config.model,LLM地址:safeUrl(config.api_url),认证已配置:!!(config.secret_id||config.api_key)});}
export function historyWatchSubmission(id){
    const row=store?.get(id);
    if(row?.state==='running'&&row.stage==='等待生成按钮触发实际生图')historyStep(id,'15 秒内没有触发实际生图请求；请检查图片标签、消息按钮或已有缓存',{},'waiting');
}
function snapshot(){
    const s=settings||{},profiles=s.llm_profiles||{},configured=s.llm_request_type_configs?.image_gen?.api_profile;
    const actual=profiles[configured]?configured:Object.keys(profiles)[0],p=profiles[actual];
    return {插件启用:s.scriptEnabled===true||s.scriptEnabled==='true',生图模式:s.mode,ComfyUI地址:safeUrl(s.comfyuiUrl),服装预设:s.yusheid_comfyui,工作流:s.workerid,模型:s.MODEL_NAME,
        自动点击:s.zidongdianji,正则测试:s.regexTestMode,LLM配置:actual,配置指定LLM:configured,LLM模型:p?.model,超时秒:s.comfyui_timeout};
}
export function historyRequest(data){
    if(!store)return;
    const existing=requests.get(data.id);
    if(existing&&!store.terminal.has(store.get(existing)?.state))return existing;
    const id=historyStart('实际生图',{请求ID:data.id,原始Tag:String(data.prompt||''),提示词字数:String(data.prompt||'').length,宽:data.width,高:data.height},data.cosjiHistoryId||'');
    requests.set(data.id,id);
    historyStep(id,'等待生图处理器接收');
    if(data.cosjiHistoryId)historyStep(data.cosjiHistoryId,'已触发实际生图，等待后端结果');
    setTimeout(()=>{const r=store.get(id);if(r?.state==='running'&&r.stage==='等待生图处理器接收')historyStep(id,'10 秒内未收到处理器回报，请检查插件总开关和生图模式');},10000);
    return id;
}
export function historyBackend(requestId,stage,info={}){historyStep(requests.get(requestId),stage,info);}
export function historyPromptTrace(requestId,stage,values){
    const row=store?.get(requests.get(requestId));if(!row)return;
    const trace=[...(row.info.promptTrace||[]),{stage,values}];
    historyStep(row.id,stage,{promptTrace:trace});
}
export function initHistory(s,save,{cache,test}={}){
    settings=s;
    let lastInspection,lastObject,lastUrl;
    let testing=false,testImage='';
    let page=1,pageSize=Number(s.cosji?.historyPageSize)||10;
    const panel=document.createElement('div');panel.id='st-chatu8-tab-cosji-history';panel.className='st-chatu8-tab-content cosji-panel';
    document.querySelector('#ch-settings-modal .st-chatu8-content').append(panel);
    const nav=document.createElement('a');nav.href='#';nav.className='st-chatu8-nav-link';nav.dataset.tab='cosji-history';nav.textContent='生图任务历史';
    document.querySelector('.st-chatu8-sidebar .st-chatu8-nav-link').before(nav);
    let expanded=new Set();
    function render(){
        if(!panel.classList.contains('active'))return;
        const flags=snapshot();
        const pagination=historyPage(store.rows,page,pageSize);page=pagination.page;
        panel.innerHTML=`<h2>生图任务历史</h2><p>${s.scriptEnabled?'插件已启用':'⚠ 插件总开关已关闭，点击生成不会向 ComfyUI 发请求。请到“主要设置”开启“启用插件”。'}</p><p>当前地址：${esc(flags.ComfyUI地址)} · 模式：${esc(flags.生图模式)}</p><p>记录提示词处理与实际生图两段。展开查看时间线、连接和请求编号；最近 100 条已结束任务保留在本地。</p><button class="cosji-button" data-history-export>导出诊断信息</button><div class="cosji-history-list">${store.rows.length?pagination.rows.map(r=>`<details data-history-id="${esc(r.id)}" ${expanded.has(r.id)?'open':''}><summary>${esc(new Date(r.created).toLocaleString())} · ${esc(r.kind)} · ${esc(({running:'进行中',waiting:'等待操作',success:'成功',failed:'失败',cancelled:'已取消',interrupted:'追踪中断'})[r.state])}<br><strong>${esc(r.stage)}</strong></summary><p>任务：${esc(r.id)}${r.parent?' · 来源任务：'+esc(r.parent):''} · 已耗时 ${Math.round((r.updated-r.created)/1000)} 秒${r.state==='running'?' · 此阶段已等待 '+Math.round((Date.now()-r.updated)/1000)+' 秒':''}</p>${r.info.图片缓存?`<button class="cosji-button" data-history-view="${esc(r.id)}">查看图片</button>`:''}${renderInfo(r.info)}<ol>${r.events.map(e=>`<li>${esc(new Date(e.time).toLocaleTimeString())} — ${esc(e.stage)}</li>`).join('')}</ol>${store.removable(r)?`<button class="cosji-button" data-history-remove="${esc(r.id)}">删除此记录</button>`:''}</details>`).join(''):'<p>暂无记录。更新前的点击无法回溯，请再次操作后查看这里。</p>'}</div>`;
        const check=document.createElement('button');check.className='cosji-button';check.dataset.historyCheck='';check.textContent='检查连接与配置';
        const toolbar=document.createElement('div');toolbar.className='cosji-row';
        toolbar.innerHTML=`<button class="cosji-button" data-history-prev ${page===1?'disabled':''}>上一页</button><span>第 ${page} / ${pagination.pages} 页 · 共 ${pagination.total} 条</span><button class="cosji-button" data-history-next ${page===pagination.pages?'disabled':''}>下一页</button><label>每页 <select data-history-size>${[10,20,50].map(n=>`<option value="${n}" ${n===pagination.size?'selected':''}>${n} 条</option>`).join('')}</select></label><button class="cosji-button" data-history-clear>清理已结束任务</button><button class="cosji-button" data-history-undo ${s.cosji.historyTrash?.length?'':'disabled'}>撤销上次清理</button>`;
        panel.querySelector('.cosji-history-list').before(toolbar);
        panel.querySelector('h2').nextElementSibling.textContent=flags.插件启用?'插件已启用':'⚠ 插件总开关已关闭，点击生成不会向 ComfyUI 发请求。请到“主要设置”开启“启用插件”。';
        panel.querySelector('[data-history-export]').before(check,document.createTextNode(' '));
        if(test){const b=document.createElement('button');b.className='cosji-button';b.dataset.historyTest='';b.textContent=testing?'正在测试生图…':'中性场景实际生图测试';b.disabled=testing;check.after(document.createTextNode(' '),b);}
        if(testImage){const img=document.createElement('img');img.id='cosji-test-preview';img.alt='中性生图测试结果';img.src=testImage;img.style.cssText='display:block;max-width:256px;margin:14px 0;border-radius:8px';panel.querySelector('.cosji-history-list').before(img);}
        if(lastInspection&&Object.keys(lastInspection.repair).length){const repair=document.createElement('button');repair.className='cosji-button';repair.dataset.historyRepair='';repair.textContent='修复未选择的生成参数';check.after(document.createTextNode(' '),repair);}
        if(!s.MODEL_NAME||s.MODEL_NAME==='连接后选择'){
            const warning=document.createElement('p');warning.textContent='⚠ 尚未选择 ComfyUI 大模型，请到 ComfyUI 设置连接后选择模型。';
            panel.querySelector('.cosji-history-list').before(warning);
        }
        panel.querySelectorAll('details[data-history-id]').forEach(row=>{
            [row,...row.querySelectorAll('details')].forEach((d,i)=>{
                const key=i?row.dataset.historyId+':prompt:'+i:row.dataset.historyId;
                d.open=expanded.has(key)||(i>0&&d.classList.contains('cosji-prompt-final')&&!expanded.has(key+':closed'));
                d.addEventListener('toggle',()=>{if(d.open){expanded.add(key);expanded.delete(key+':closed');}else{expanded.delete(key);expanded.add(key+':closed');}});
            });
        });
    }
    function showMedia(id){
        const entries=store.rows.filter(row=>row.info.图片缓存);
        let index=entries.findIndex(row=>row.id===id),revision=0,objectUrl,activeBlob;
        if(index<0)return;
        const dialog=document.createElement('dialog');dialog.className='cosji-dialog cosji-history-viewer';
        dialog.innerHTML=`<div class="cosji-viewer-stage">
            <div class="cosji-viewer-counter" data-count></div>
            <button type="button" class="cosji-viewer-close" data-corner-close aria-label="关闭图片查看" title="关闭（Esc）">×</button>
            <button type="button" class="cosji-viewer-arrow cosji-viewer-prev" data-back aria-label="上一张" title="上一张（←）">‹</button>
            <div class="cosji-viewer-canvas" data-media></div><p class="cosji-viewer-status" data-status role="status"></p>
            <button type="button" class="cosji-viewer-arrow cosji-viewer-next" data-forward aria-label="下一张" title="下一张（→）">›</button>
        </div>
        <aside class="cosji-viewer-tags" data-tag-panel><header><h3>图片 Tag</h3><span>本次生图提交的提示词</span></header><p data-label></p><h4>正向 Tag</h4><pre data-positive></pre><h4>负向 Tag</h4><pre data-negative></pre></aside>
        <footer class="cosji-viewer-dock"><div class="cosji-viewer-mode-switch" role="group" aria-label="图片查看模式"><button type="button" data-view-mode="image" aria-pressed="false">仅看图</button><button type="button" data-view-mode="tags" aria-pressed="false">看图＋Tag</button></div><button type="button" class="cosji-viewer-action" data-fullscreen>⛶ 沉浸全屏</button><button type="button" class="cosji-viewer-action" data-download disabled>↓ 下载图片</button><span class="cosji-viewer-hint">← → 切图 · Esc 关闭</span></footer>`;
        const find=selector=>dialog.querySelector(selector);
        function setViewMode(mode,persist=false){
            mode=mode==='image'?'image':'tags';dialog.dataset.viewMode=mode;
            find('[data-tag-panel]').hidden=mode==='image';
            dialog.querySelectorAll('[data-view-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.viewMode===mode)));
            if(persist){s.cosji.historyViewMode=mode;save();}
        }
        dialog.querySelectorAll('[data-view-mode]').forEach(button=>{button.onclick=()=>setViewMode(button.dataset.viewMode,true);});
        setViewMode(s.cosji.historyViewMode);
        async function display(){
            const token=++revision,row=entries[index],tags=historyTags(row.info);activeBlob=null;
            find('[data-download]').disabled=true;
            if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
            find('[data-count]').textContent=`${index+1} / ${entries.length}`;
            find('[data-back]').disabled=index===0;find('[data-forward]').disabled=index===entries.length-1;
            find('[data-label]').textContent=new Date(row.created).toLocaleString()+' · '+row.kind;
            find('[data-positive]').textContent=tags.positive||'此记录未保存 Tag';
            find('[data-negative]').textContent=tags.negative||'（空）';
            find('[data-media]').replaceChildren();find('[data-status]').textContent='正在读取图片…';
            try{
                const blob=await readHistoryMedia(row.info.图片缓存);
                if(token!==revision)return;
                if(!blob)throw new Error('图片缓存已被清理或不可用');
                const media=document.createElement(blob.type.startsWith('video/')?'video':'img');
                if(media.tagName==='VIDEO')media.controls=true;
                media.alt='生图历史图片';
                media.onerror=()=>{find('[data-status]').textContent='图片无法解码';};
                activeBlob=blob;objectUrl=URL.createObjectURL(blob);media.src=objectUrl;
                find('[data-media]').append(media);find('[data-status]').textContent='';find('[data-download]').disabled=false;
                find('[data-download]').textContent=blob.type.startsWith('video/')?'↓ 下载视频':'↓ 下载图片';
            }catch(error){if(token===revision)find('[data-status]').textContent=safeError(error);}
        }
        const move=delta=>{if(index+delta<0||index+delta>=entries.length)return;index+=delta;display();};
        find('[data-back]').onclick=()=>move(-1);find('[data-forward]').onclick=()=>move(1);
        find('[data-corner-close]').onclick=()=>dialog.close();
        find('[data-download]').onclick=()=>{
            if(!activeBlob||!objectUrl)return;
            const link=document.createElement('a'),extension=activeBlob.type.split('/')[1]?.split(';')[0]||'png';
            link.href=objectUrl;link.download='cosji-'+entries[index].id+'.'+extension.replace('svg+xml','svg');link.click();
        };
        const updateFullscreen=()=>{find('[data-fullscreen]').textContent=document.fullscreenElement===dialog||dialog.classList.contains('cosji-viewer-immersive')?'⛶ 退出全屏':'⛶ 沉浸全屏';};
        find('[data-fullscreen]').onclick=async()=>{
            if(document.fullscreenElement===dialog){await document.exitFullscreen();}
            else if(dialog.classList.contains('cosji-viewer-immersive'))dialog.classList.remove('cosji-viewer-immersive');
            else{try{if(!dialog.requestFullscreen)throw Error();await dialog.requestFullscreen();}catch{dialog.classList.add('cosji-viewer-immersive');}}
            updateFullscreen();
        };
        document.addEventListener('fullscreenchange',updateFullscreen);
        const onKey=event=>{
            if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();move(event.key==='ArrowLeft'?-1:1);}
            if(event.key==='Escape'&&dialog.classList.contains('cosji-viewer-immersive')){event.preventDefault();event.stopPropagation();dialog.classList.remove('cosji-viewer-immersive');updateFullscreen();}
        };
        document.addEventListener('keydown',onKey,true);
        dialog.addEventListener('close',()=>{
            document.removeEventListener('keydown',onKey,true);document.removeEventListener('fullscreenchange',updateFullscreen);
            if(document.fullscreenElement===dialog)document.exitFullscreen().catch(()=>{});
            revision++;if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.remove();
        });
        document.body.append(dialog);dialog.showModal();display();
    }
    let retainedIds='';
    const prune=()=>{
        const ids=[...(s.cosji?.taskHistory||[]),...(s.cosji?.historyTrash||[])].map(row=>row.id);
        const signature=JSON.stringify(ids.sort());if(signature===retainedIds)return;retainedIds=signature;
        pruneHistoryMedia(ids).catch(()=>{retainedIds='';});
    };
    store=createHistory(s,save,()=>{render();prune();});prune();
    openPanel=()=>{
        document.querySelectorAll('.st-chatu8-nav-link, .st-chatu8-tab-content').forEach(el=>el.classList.remove('active'));
        panel.classList.add('active');nav.classList.add('active');document.querySelector('#ch-settings-modal').style.display='grid';s.lastTab='cosji-history';render();
    };
    nav.addEventListener('click',e=>{e.preventDefault();openPanel();});
    panel.addEventListener('change',e=>{if(!e.target.matches('[data-history-size]'))return;pageSize=Number(e.target.value);page=1;s.cosji.historyPageSize=pageSize;save();render();});
    panel.addEventListener('click',async e=>{
        const view=e.target.closest('[data-history-view]');if(view){showMedia(view.dataset.historyView);return;}
        if(e.target.closest('[data-history-prev]')){page--;render();return;}
        if(e.target.closest('[data-history-next]')){page++;render();return;}
        if(e.target.closest('[data-history-clear]')){store.remove();render();return;}
        if(e.target.closest('[data-history-undo]')){store.undo();render();return;}
        const remove=e.target.closest('[data-history-remove]');
        if(remove){store.remove(remove.dataset.historyRemove);render();return;}
        if(e.target.closest('[data-history-test]')){
            if(testing||!test)return;
            testing=true;const id=historyStart('中性场景端到端生图测试');expanded.add(id);render();
            try{testImage=await test(id);historyStep(id,'端到端测试成功，图片已返回并保存缓存',{},'success');}
            catch(error){historyStep(id,error,{},'failed');}
            finally{testing=false;render();}return;
        }
        if(e.target.closest('[data-history-repair]')){
            if(!lastInspection||lastUrl!==s.comfyuiUrl)return;
            const id=historyStart('生成参数修复');
            Object.assign(s,lastInspection.repair);
            const profile=s.comfyui_profiles?.[s.comfyui_profile_id];if(profile)Object.assign(profile,lastInspection.repair);
            save();
            for(const [key,names] of Object.entries({MODEL_NAME:lastInspection.models,comfyuisamplerName:lastInspection.samplers,comfyui_scheduler:lastInspection.schedulers})){
                const el=document.getElementById(key);if(el)el.replaceChildren(...names.map(n=>new Option(n,n,n===s[key],n===s[key])));
            }
            try{
                if(cache)await cache({models:lastInspection.models.map(n=>({value:n,text:n})),samplers:lastInspection.samplers,schedulers:lastInspection.schedulers,loras:lastObject.LoraLoader?.input?.required?.lora_name?.[0]||[],objectInfo:lastObject});
            }catch(error){historyStep(id,'参数已保存，但模型列表缓存更新失败：'+safeError(error),{},'failed');return;}
            historyStep(id,'已应用唯一可用模型和有效默认采样参数',{已应用参数:lastInspection.repair},'success');
            lastInspection=null;render();return;
        }
        if(!e.target.closest('[data-history-check]'))return;
        const id=historyStart('连接与配置检测');expanded.add(id);
        historyStep(id,'正在只读检测 ComfyUI 队列与模型列表');
        try{
            const url=String(s.comfyuiUrl||'').replace(/\/+$/,'');
            const results=await Promise.allSettled(['/queue','/object_info'].map(async path=>{const r=await fetch(url+path,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(`${path} HTTP ${r.status}`);return r.json();}));
            const q=results[0],m=results[1];
            const problems=[];
            if(!snapshot().插件启用)problems.push('插件总开关关闭');
            if(q.status==='rejected')problems.push('队列读取失败：'+safeError(q.reason));
            if(m.status==='rejected')problems.push('模型列表读取失败：'+safeError(m.reason));
            else{lastInspection=inspectConfiguration(s,m.value);lastObject=m.value;lastUrl=s.comfyuiUrl;problems.push(...lastInspection.problems);}
            historyStep(id,problems.length?problems.join('；'):'ComfyUI 在线，模型、采样参数与工作流节点可用',{运行中:q.value?.queue_running?.length,排队中:q.value?.queue_pending?.length,可选模型:lastInspection?.models,缺失节点:lastInspection?.missing},problems.length?'failed':'success');
        }catch(error){historyStep(id,error,{},'failed');}
    });
    panel.addEventListener('click',e=>{if(!e.target.closest('[data-history-export]'))return;const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,current:snapshot(),tasks:store.rows},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cosji-generation-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    // Tavern awaits listeners sequentially; record before the backend can finish.
    if(eventSource.makeFirst)eventSource.makeFirst('generate-image-request',historyRequest);
    else eventSource.on('generate-image-request',historyRequest);
    eventSource.on('generate-image-response',data=>{
        const id=requests.get(data.id),row=store.get(id);if(!row)return;
        const ok=data.success===true&&!!data.imageData;
        historyStep(id,ok?'图片已返回，已交给聊天界面显示':safeError(data.error||'后端未返回图片'),{结果类型:data.format||'image',...(ok&&data.prompt?{生成Tag:data.prompt}:{})},ok?'success':'failed');
        if(ok)saveHistoryMedia(id,data.imageData,data.format).then(key=>{
            if(!store.get(id))return;
            Object.assign(row.info,{图片缓存:key});save();render();
        }).catch(error=>{row.info.图片查看错误=safeError(error);save();render();});
        if(row.parent){
            const parent=store.get(row.parent),children=store.rows.filter(r=>r.parent===row.parent);
            const completed=children.filter(r=>store.terminal.has(r.state)).length,expected=parent?.info?.识别图片数||children.length;
            historyStep(row.parent,`已返回 ${completed}/${expected} 张，成功 ${children.filter(r=>r.state==='success').length} 张`,{},completed>=expected?(children.some(r=>r.state==='failed')?'failed':'success'):'running');
        }
    });
    setInterval(()=>{if(store.rows.some(row=>row.state==='running'))render();},5000);
}
