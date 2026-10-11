import {PROMPT_FIELDS, splitLoras, joinLoras, migrateCatalog, normalizeComfyUrl, resolveNativeProfile, withCommonPrompts} from './cosji-core.mjs';
import {fetchCivitModel, planCivitImport, commitCivitImport} from './cosji-civit.mjs';
import {previewMarkup, chooseCacheCover} from './cosji-preview.js';
import {availableAt,inspectLoras} from './cosji-address.mjs';
import {copyAddressDialog} from './cosji-address-dialog.js';
import {createCommonEditors} from './cosji-common.js';
import {comfyCatalog,applyComfyCatalog} from './cosji-comfy-catalog.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option = (value, label, selected) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;
const button = (action, text) => `<button type="button" class="cosji-button" data-cos-action="${action}">${text}</button>`;

function askDialog(message, initial, confirmOnly=false) {
    return new Promise(resolve => {
        const dialog=document.createElement('dialog');dialog.className='cosji-dialog';
        dialog.innerHTML=`<form><h3>${esc(message)}</h3>${confirmOnly?'':`<input aria-label="名称" value="${esc(initial)}" required autocomplete="off">`}<div class="cosji-row"><button type="button" class="cosji-button" data-cancel>取消</button><button type="submit" class="cosji-button">确定</button></div></form>`;
        document.body.append(dialog);
        const finish=value=>{dialog.close();dialog.remove();resolve(value);};
        dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();finish(confirmOnly?true:dialog.querySelector('input').value.trim());});
        dialog.querySelector('[data-cancel]').addEventListener('click',()=>finish(confirmOnly?false:''));
        dialog.addEventListener('cancel',e=>{e.preventDefault();finish(confirmOnly?false:'');});
        dialog.showModal();dialog.querySelector('input')?.focus();
    });
}

export function initCosji({settings, save, context, headers, refreshLLM, gallery, loraCache,saveComfyCache}) {
    const catalog = migrateCatalog(settings);
    document.getElementById('ch-title-update-notification')?.remove();
    document.getElementById('ch-update-indicator')?.remove();
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = new URL('./cosji.css', import.meta.url).href;
    document.head.append(styles);
    const panel = document.createElement('div');
    panel.id = 'st-chatu8-tab-cosji';
    panel.className = 'st-chatu8-tab-content cosji-panel';
    document.querySelector('#ch-settings-modal .st-chatu8-content').append(panel);
    const nav = document.createElement('a');
    nav.href = '#';
    nav.className = 'st-chatu8-nav-link';
    nav.dataset.tab = 'cosji';
    nav.textContent = '角色 / 服装';
    document.querySelector('.st-chatu8-sidebar .st-chatu8-nav-link').before(nav);
    const showEditor = () => {
        document.querySelectorAll('.st-chatu8-nav-link, .st-chatu8-tab-content').forEach(el => el.classList.remove('active'));
        panel.classList.add('active'); nav.classList.add('active');
        document.querySelector('#ch-settings-modal').style.display = 'grid';
        settings.lastTab = 'cosji';
        render();
    };
    nav.addEventListener('click', e => {e.preventDefault(); showEditor();});
    for(const link of document.querySelectorAll('.st-chatu8-nav-link')) {
        if(link===nav)continue;
        link.addEventListener('click',()=>{
            if(!panel.classList.contains('active'))return;
            const target=document.getElementById('st-chatu8-tab-'+link.dataset.tab);
            if(!target)return;
            panel.classList.remove('active');nav.classList.remove('active');
            target.classList.add('active');link.classList.add('active');settings.lastTab=link.dataset.tab;
        });
    }
    let current = settings.yusheid_comfyui || Object.keys(settings.yushe)[0] || '';
    let role = catalog.roles.some(r=>r.id===catalog.selectedRole) ? catalog.selectedRole : catalog.presetRoles[current] || 'uncategorized';
    if(catalog.presetRoles[current]!==role)current=Object.keys(settings.yushe).find(name=>catalog.presetRoles[name]===role) || '';
    catalog.lastCivitUrl ??= settings.yushe[current]?.cosjiCivit?.sourceUrl || '';
    let draft = splitLoras(settings.yushe[current]);
    let dirty = false;
    let status = '';
    const commonEditors=createCommonEditors({catalog,save,ask:askDialog,changed:()=>updateCompatibility()});
    let loraNames=catalog.loraCatalog?.url===settings.comfyuiUrl ? catalog.loraCatalog.names || [] : [];
    let loraVerifiedUrl='';
    function updateCompatibility(){
        const el=panel.querySelector('#cosji-lora-compatibility');if(!el)return;
        if(!current){el.textContent='';return;}
        if(loraVerifiedUrl!==settings.comfyuiUrl){el.textContent='等待检测当前地址的 LoRA 可用性';return;}
        let missing;
        try{missing=inspectLoras(withCommonPrompts(joinLoras(draft),settings,current),loraNames).filter(l=>!l.availableName);}catch{el.textContent='请完善 LoRA 名称和权重后检测';return;}
        el.textContent=missing.length?'当前地址缺失 LoRA：'+missing.map(l=>l.name).join('、')+'。可检测并创建此地址的副本。':'当前预设的 LoRA 在此地址均可用';
    }
    const updateLoraSelect=()=>{
        const select=panel.querySelector('#cosji-lora-name');if(!select)return;
        const value=select.value,query=(panel.querySelector('#cosji-lora-search')?.value||'').toLowerCase();
        const names=loraNames.filter(name=>name.toLowerCase().includes(query));
        select.innerHTML=option('',names.length?'选择 LoRA 模型':loraNames.length?'没有匹配的 LoRA':'请先读取 LoRA 列表','')+names.map(name=>option(name,name,value)).join('');
        if(names.includes(value))select.value=value;
        panel.querySelector('#cosji-lora-count').textContent=`${names.length} / ${loraNames.length} 个 LoRA`;
        commonEditors.updateModels(panel,loraNames);
        updateCompatibility();
    };
    let loraRequest=0;
    async function refreshLoras() {
        const request=++loraRequest,address=settings.comfyuiUrl;
        loraVerifiedUrl='';updateCompatibility();
        status='正在自动读取 ComfyUI LoRA 列表…';
        const showStatus=()=>{const el=panel.querySelector('.cosji-status');if(el)el.textContent=status;};
        showStatus();
        try {
            const response=await fetch(normalizeComfyUrl(address)+'/object_info',{signal:AbortSignal.timeout(12000),credentials:'omit'});
            if(!response.ok)throw new Error(`ComfyUI 返回 ${response.status}`);
            const info=await response.json(),names=info.LoraLoader?.input?.required?.lora_name?.[0];
            if(!Array.isArray(names))throw new Error('ComfyUI 未返回 LoRA 模型列表');
            if(request!==loraRequest||address!==settings.comfyuiUrl)return;
            const fullCache=comfyCatalog(info);
            if(saveComfyCache)await saveComfyCache(fullCache);
            if(request!==loraRequest||address!==settings.comfyuiUrl)return;
            window.dispatchEvent(new CustomEvent('comfyui-cache-updated',{detail:fullCache}));
            applyComfyCatalog(fullCache,settings);
            loraNames=[...new Set(names.filter(name=>typeof name==='string'&&name.trim()))].sort((a,b)=>a.localeCompare(b));
            loraVerifiedUrl=address;catalog.loraCatalog={url:address,names:loraNames};save();updateLoraSelect();
            status=`已自动读取 ${loraNames.length} 个 LoRA，选择模型后点击“添加 LoRA”`;
        } catch(error){
            if(request!==loraRequest||address!==settings.comfyuiUrl)return;
            status=`读取 LoRA 失败，请检查当前 ComfyUI 地址 ${address}：${error.message}`;
        }
        showStatus();
    }
    const namesFor = (id,all=false) => Object.keys(settings.yushe).filter(name => catalog.presetRoles[name] === id && (all||availableAt(settings.yushe[name],settings.comfyuiUrl)));
    function adaptAddressSelection(){
        const active=settings.yusheid_comfyui,activePreset=settings.yushe[active];
        if(activePreset&&!availableAt(activePreset,settings.comfyuiUrl)){
            const root=activePreset.cosjiSourcePreset;
            const choices=namesFor(catalog.presetRoles[active]);
            const replacement=choices.find(name=>settings.yushe[name].cosjiSourcePreset===root&&settings.yushe[name].cosjiComfyUrl)||choices.find(name=>name===root)||choices[0]||Object.keys(settings.yushe).find(name=>availableAt(settings.yushe[name],settings.comfyuiUrl));
            if(replacement){settings.yusheid_comfyui=replacement;syncNativeFields();save();}
        }
        if(!current||availableAt(settings.yushe[current],settings.comfyuiUrl))return;
        const source=settings.yushe[current].cosjiSourcePreset;
        const variant=namesFor(role).find(name=>settings.yushe[name].cosjiSourcePreset===source&&settings.yushe[name].cosjiComfyUrl)|| (source&&availableAt(settings.yushe[source]||{},settings.comfyuiUrl)&&Object.hasOwn(settings.yushe,source)?source:namesFor(role)[0]);
        if(variant)activate(variant);else{current='';draft=splitLoras();dirty=false;}
    }
    const outfitName = name => settings.yushe[name]?.cosjiOutfitName || name;
    const allowSwitch = async () => !dirty || await askDialog('有未保存的提示词或 LoRA 修改，放弃修改并切换？','',true);
    function syncNativeFields() {
        for (const [mode, suffix] of [['sd',''],['novelai','_novelai'],['comfyui','_comfyui']]) {
            const select = document.getElementById('yusheid' + suffix);
            if (select) {
                select.replaceChildren(...Object.keys(settings.yushe).map(name => new Option(name, name)));
                select.value = settings['yusheid_' + mode];
            }
            const preset = settings.yushe[settings['yusheid_' + mode]] || {};
            for (const field of PROMPT_FIELDS) {
                const input = document.getElementById(field + suffix);
                if (input) {input.value = preset[field] || ''; input.dispatchEvent(new Event('input', {bubbles:true}));}
            }
        }
    }
    function activate(name) {
        if (!Object.hasOwn(settings.yushe, name)) return;
        current = name; role = catalog.presetRoles[name]; catalog.selectedRole = role;
        quickRole=role;
        for (const mode of ['sd','novelai','comfyui']) settings['yusheid_' + mode] = name;
        settings.randomYushe = 'false';
        draft = splitLoras(settings.yushe[name]); dirty = false;
        syncNativeFields(); save(); renderQuick();
    }
    function render() {
        const roles = catalog.roles.map(r => option(r.id, r.name, role)).join('');
        const outfits = namesFor(role).map(name => option(name, outfitName(name), current)).join('');
        const connectionOptions = catalog.comfyConnections.map(c => option(c.id, c.name, catalog.selectedConnection)).join('');
        panel.innerHTML = `<h3>角色与服装预设</h3><p class="cosji-muted">角色负责分类，每套服装保存完整的正面、后置、负面提示词及 LoRA。</p>
          <div data-common-editor="all"></div>
          <label>角色分类</label><div class="cosji-row"><select id="cosji-role">${roles}</select>${button('role-new','新建角色')}${button('role-rename','改名')}${button('role-delete','删除分类')}</div>
          <div data-common-editor="role"></div>
          <label>服装（二级预设）</label><div class="cosji-row"><select id="cosji-outfit"><option value="">选择服装预设</option>${outfits}</select>${button('outfit-new','新建服装')}${button('outfit-copy','另存为')}${button('outfit-rename','改名')}${button('outfit-delete','删除')}${button('outfit-restore','恢复上次删除')}</div>
          <div class="cosji-row">${button('outfit-apply','应用当前服装')}${button('outfit-copy-address','检测并复制到其他 ComfyUI 地址')}<span class="cosji-muted">${settings.yushe[current]?.cosjiComfyUrl?'绑定地址：'+esc(settings.yushe[current].cosjiComfyUrl):'此预设提示词可跨地址复用'}</span></div><p class="cosji-muted">当前已应用：${esc(outfitName(settings.yusheid_comfyui)||'未选择')}</p>
          <div class="cosji-cover-row">${previewMarkup(settings.yushe[current])}<div>${button('cover-select','从生成缓存选择预览图')}${button('cover-remove','移除预览图')}</div></div>
          <div class="cosji-outfit-strip">${namesFor(role).map(name=>`<button type="button" class="cosji-outfit-card ${name===current?'selected':''}" data-outfit-key="${esc(name)}" title="${esc(outfitName(name))}">${previewMarkup(settings.yushe[name],true)}<span>${esc(outfitName(name))}</span></button>`).join('')}</div>
          ${settings.yushe[current]?.cosjiCivit ? `<p class="cosji-muted">来源：<a href="${esc(settings.yushe[current].cosjiCivit.sourceUrl)}" target="_blank" rel="noopener noreferrer">Civit 模型 ${esc(settings.yushe[current].cosjiCivit.modelId)}</a> · 版本 ${esc(settings.yushe[current].cosjiCivit.versionId)}</p>` : ''}
          <div class="cosji-civit-entry"><label>Civit 服装批量导入<input id="cosji-civit-url" type="url" value="${esc(catalog.lastCivitUrl)}" placeholder="https://civitai.red/models/1145224/…"></label>${button('civit-fetch','识别 Trigger Words')}<p class="cosji-muted">识别名称后勾选批量新建到当前角色，已存在的服装自动跳过。地址自动记住上一次输入。</p></div>
          <div class="cosji-row"><label>归类到 <select id="cosji-move-role">${roles}</select></label>${button('outfit-move','移动分类')}</div>
          ${PROMPT_FIELDS.map((field,i) => `<details><summary>${['固定正面提示词','后置固定正面提示词','固定负面提示词'][i]}（点击展开）</summary><label><textarea data-cos-field="${field}" rows="4" ${!current?'disabled':''}>${esc(draft[field])}</textarea></label></details>`).join('')}
          <h4>LoRA</h4><p class="cosji-muted">每个 LoRA 可整项删除；模型权重和可选 CLIP 权重独立编辑。</p>
          <p id="cosji-lora-compatibility" class="cosji-muted"></p>
          <div id="cosji-lora-list">${draft.loras.map((l,i) => `<div class="cosji-lora" data-lora-index="${i}"><span>${esc(l.name)}</span><label>权重<input type="number" step="0.05" data-lora-prop="weight" value="${esc(l.weight)}"></label><label>CLIP<input type="number" step="0.05" placeholder="可选" data-lora-prop="clipWeight" value="${esc(l.clipWeight)}"></label><select data-lora-prop="field">${PROMPT_FIELDS.map((f,j) => option(f,['正面','后置','负面'][j],l.field)).join('')}</select>${button('lora-remove','删除整项')}</div>`).join('') || '<p class="cosji-muted">此预设没有 LoRA</p>'}</div>
          <div class="cosji-row"><input id="cosji-lora-search" placeholder="搜索 LoRA 文件名" aria-label="搜索 LoRA">${button('lora-refresh','读取 / 刷新 LoRA 列表')}<span id="cosji-lora-count"></span></div>
          <div class="cosji-row"><select id="cosji-lora-name" aria-label="LoRA 模型列表"></select><input id="cosji-lora-weight" type="number" step="0.05" value="1" aria-label="新 LoRA 权重">${button('lora-add','添加 LoRA')}</div>
          <div class="cosji-row">${button('outfit-save','保存服装预设')}<span id="cosji-dirty">${dirty?'有未保存修改':'已保存'}</span></div>
          <hr><h3>ComfyUI 连接预设</h3><div class="cosji-row"><select id="cosji-connection"><option value="">选择连接预设</option>${connectionOptions}</select>${button('connection-apply','使用连接')}${button('connection-new','新建')}${button('connection-save','保存修改')}${button('connection-rename','改名')}${button('connection-delete','删除')}</div>
          <label>连接名称<input id="cosji-connection-name" value="${esc(catalog.comfyConnections.find(c=>c.id===catalog.selectedConnection)?.name || '')}" placeholder="例如：本机 / 远程 GPU"></label>
          <label>ComfyUI 地址<input id="cosji-connection-url" value="${esc(catalog.comfyConnections.find(c=>c.id===catalog.selectedConnection)?.url || settings.comfyuiUrl)}" placeholder="http://127.0.0.1:8188"></label><p class="cosji-muted">当前生图地址：<span id="cosji-active-url">${esc(settings.comfyuiUrl)}</span></p>
          <p role="status" class="cosji-status">${esc(status)}</p>`;
        updateLoraSelect();
        commonEditors.render(panel,role,loraNames);
    }
    function markDirty() {dirty=true; const el=panel.querySelector('#cosji-dirty'); if(el) el.textContent='有未保存修改';updateCompatibility();}
    function saveOutfit() {
        if (!current) throw new Error('请先新建或选择服装预设');
        settings.yushe[current] = {...settings.yushe[current], ...joinLoras(draft), cosjiLoras:structuredClone(draft.loras)};
        dirty=false; syncNativeFields(); save(); status='服装预设已保存';
    }
    async function askName(text, initial='') { return await askDialog(text,initial); }
    async function createOutfit(copy) {
        const name=await askName('服装名称'); if(!name) return;
        const roleName=catalog.roles.find(r=>r.id===role)?.name || '未分类';
        const key=roleName+' · '+name;
        if(Object.hasOwn(settings.yushe,key)) throw new Error('此角色下已存在同名服装');
        settings.yushe[key]={...(copy ? settings.yushe[current] : {}), ...(copy ? joinLoras(draft) : {fixedPrompt:'',fixedPrompt_end:'',negativePrompt:''}), cosjiOutfitName:name};
        catalog.presetRoles[key]=role; activate(key); status='服装预设已创建';
    }
    panel.addEventListener('input', e => {
        if(e.target.id==='cosji-civit-url'){catalog.lastCivitUrl=e.target.value;save();}


        if(e.target.id==='cosji-lora-search')updateLoraSelect();
        if(e.target.dataset.cosField) {draft[e.target.dataset.cosField]=e.target.value; markDirty();}
        if(e.target.dataset.loraProp) {draft.loras[Number(e.target.closest('[data-lora-index]').dataset.loraIndex)][e.target.dataset.loraProp]=e.target.value; markDirty();}
    });
    panel.addEventListener('change', async e => {
        if(e.target.id==='cosji-role') {
            if(!await allowSwitch()) {e.target.value=role;return;}
            role=e.target.value; catalog.selectedRole=role; current=namesFor(role)[0] || ''; draft=splitLoras(settings.yushe[current]); dirty=false; save(); render();
        }
        if(e.target.id==='cosji-outfit') {if(!await allowSwitch()) {e.target.value=current;return;} if(e.target.value) activate(e.target.value); render();}
        if(e.target.id==='cosji-connection') {catalog.selectedConnection=e.target.value; save();render();}
        if(e.target.dataset.loraProp) {draft.loras[Number(e.target.closest('[data-lora-index]').dataset.loraIndex)][e.target.dataset.loraProp]=e.target.value;markDirty();}
    });
    panel.addEventListener('click', async e => {
        const outfit=e.target.closest('[data-outfit-key]');
        if(outfit){if(await allowSwitch()){activate(outfit.dataset.outfitKey);render();}return;}
        const action=e.target.closest('[data-cos-action]')?.dataset.cosAction; if(!action)return;
        try {


            if(action==='connection-apply'&&!await allowSwitch())return;
            if(action==='lora-refresh') {
                const trigger=e.target.closest('button');trigger.disabled=true;
                try{await refreshLoras();}finally{trigger.disabled=false;}
                return;
            }
            if(action==='cover-select') {
                if(!current)throw new Error('请先选择服装预设');
                const target=current;
                const cover=await chooseCacheCover(gallery);
                if(cover&&settings.yushe[target]){settings.yushe[target].cosjiPreview=cover;save();status='服装预览图已保存';render();renderQuick();}
                return;
            }
            if(action==='cover-remove') {if(!current)throw new Error('请先选择服装预设');delete settings.yushe[current].cosjiPreview;status='预览图已移除';}
            if(action==='civit-fetch') {
                const url=panel.querySelector('#cosji-civit-url').value;
                const trigger=e.target.closest('button');trigger.disabled=true;
                status='正在读取 Civit 模型和 Trigger Words…';panel.querySelector('.cosji-status').textContent=status;
                try {
                    const data=await fetchCivitModel(url);
                    const result=await previewCivitImport(data,settings,role);
                    if(result){status=`已新建 ${result.created} 套服装，跳过 ${result.skipped} 套重复服装`;syncNativeFields();save();render();renderQuick();}
                }catch(error){status=`读取失败：${error.message}`;panel.querySelector('.cosji-status').textContent=status;}
                finally{trigger.disabled=false;}
                return;
            }
            if(action==='role-new') {if(!await allowSwitch())return;const name=await askName('角色分类名称');if(!name)return;if(catalog.roles.some(r=>r.name===name))throw new Error('角色名称已存在');const id=crypto.randomUUID();catalog.roles.push({id,name});role=id;current='';draft=splitLoras();dirty=false;catalog.selectedRole=id;}
            if(action==='role-rename') {const r=catalog.roles.find(r=>r.id===role);if(role==='uncategorized')throw new Error('未分类为保留分类');const name=await askName('角色名称',r.name);if(!name)return;if(catalog.roles.some(x=>x.id!==role&&x.name===name))throw new Error('角色名称已存在');r.name=name;}
            if(action==='role-delete') {if(role==='uncategorized')throw new Error('未分类为保留分类');if(!await allowSwitch())return;if(!await askDialog('删除此角色分类？其服装将移入“未分类”，不会删除提示词。','',true))return;for(const name of namesFor(role,true))catalog.presetRoles[name]='uncategorized';catalog.roles=catalog.roles.filter(r=>r.id!==role);role='uncategorized';current=namesFor(role)[0]||'';draft=splitLoras(settings.yushe[current]);dirty=false;}
            if(action==='outfit-new') {if(!await allowSwitch())return;await createOutfit(false);}
            if(action==='outfit-copy') await createOutfit(true);
            if(action==='outfit-copy-address') {
                if(!current)throw new Error('请先选择服装预设');
                const source=current,targetRole=role;
                const result=await copyAddressDialog({...settings.yushe[current],...joinLoras(draft)},catalog.comfyConnections,settings.comfyuiUrl,outfitName(current)+' · 地址副本');
                if(!result)return;
                const base=(catalog.roles.find(r=>r.id===targetRole)?.name||'未分类')+' · '+result.name;
                let key=base,n=2;while(Object.hasOwn(settings.yushe,key))key=base+' ('+(n++)+')';
                settings.yushe[key]={...result.preset,cosjiOutfitName:result.name,cosjiSourcePreset:settings.yushe[source].cosjiSourcePreset||source};catalog.presetRoles[key]=targetRole;
                status='已保存绑定 '+result.preset.cosjiComfyUrl+' 的副本；切换到该地址后可选择';syncNativeFields();
            }
            if(action==='outfit-save') saveOutfit();
            if(action==='outfit-apply'){saveOutfit();activate(current);status='已保存并应用当前服装：'+outfitName(current);}
            if(action==='outfit-move') {if(!current)throw new Error('请先选择服装');catalog.presetRoles[current]=panel.querySelector('#cosji-move-role').value;role=catalog.presetRoles[current];catalog.selectedRole=role;}
            if(action==='outfit-rename') {if(!current)throw new Error('请先选择服装');const name=await askName('服装名称',outfitName(current));if(!name)return;if(namesFor(role).some(n=>n!==current&&outfitName(n)===name))throw new Error('此角色下已存在同名服装');settings.yushe[current].cosjiOutfitName=name;}
            if(action==='outfit-delete') {if(!current)throw new Error('请先选择服装');if(current==='默认')throw new Error('默认预设保留，可另存为后编辑');if(!await askDialog('删除这套服装预设？可使用“恢复上次删除”恢复。','',true))return;catalog.deletedPreset={name:current,preset:settings.yushe[current],role};delete settings.yushe[current];delete catalog.presetRoles[current];const fallback=namesFor(role)[0]||Object.keys(settings.yushe)[0];if(fallback)activate(fallback);else{current='';draft=splitLoras();dirty=false;}}
            if(action==='outfit-restore') {const d=catalog.deletedPreset;if(!d)throw new Error('没有可恢复的服装');if(Object.hasOwn(settings.yushe,d.name))throw new Error('同名预设已存在');settings.yushe[d.name]=d.preset;catalog.presetRoles[d.name]=catalog.roles.some(r=>r.id===d.role)?d.role:'uncategorized';delete catalog.deletedPreset;activate(d.name);}
            if(action==='lora-add') {if(!current)throw new Error('请先选择服装');const name=panel.querySelector('#cosji-lora-name').value.trim();const weight=panel.querySelector('#cosji-lora-weight').value;if(!name)throw new Error('请选择或输入 LoRA 名称');const l={name,weight,clipWeight:'',field:'fixedPrompt'};joinLoras({...draft,loras:[l]});draft.loras.push(l);markDirty();}
            if(action==='lora-remove') {draft.loras.splice(Number(e.target.closest('[data-lora-index]').dataset.loraIndex),1);markDirty();}
            if(action==='connection-new') {const name=panel.querySelector('#cosji-connection-name').value.trim() || await askName('连接名称');if(!name)return;if(catalog.comfyConnections.some(c=>c.name===name))throw new Error('连接名称已存在');const url=normalizeComfyUrl(panel.querySelector('#cosji-connection-url').value);const id=crypto.randomUUID();catalog.comfyConnections.push({id,name,url});catalog.selectedConnection=id;status='连接预设已保存';}
            if(action==='connection-save') {const c=catalog.comfyConnections.find(c=>c.id===catalog.selectedConnection);if(!c)throw new Error('请先选择或新建连接');const name=panel.querySelector('#cosji-connection-name').value.trim();if(!name)throw new Error('连接名称不能为空');if(catalog.comfyConnections.some(x=>x.id!==c.id&&x.name===name))throw new Error('连接名称已存在');c.name=name;c.url=normalizeComfyUrl(panel.querySelector('#cosji-connection-url').value);status='连接预设已保存';}
            if(action==='connection-rename') {const c=catalog.comfyConnections.find(c=>c.id===catalog.selectedConnection);if(!c)throw new Error('请先选择连接');const name=await askName('连接名称',c.name);if(!name)return;if(catalog.comfyConnections.some(x=>x.id!==c.id&&x.name===name))throw new Error('连接名称已存在');c.name=name;}
            if(action==='connection-delete') {const id=catalog.selectedConnection;if(!id)throw new Error('请先选择连接');catalog.comfyConnections=catalog.comfyConnections.filter(c=>c.id!==id);catalog.selectedConnection='';status='连接预设已删除，当前生图地址保持不变';}
            if(action==='connection-apply') {const c=catalog.comfyConnections.find(c=>c.id===catalog.selectedConnection);if(!c)throw new Error('请先选择连接');settings.comfyuiUrl=c.url;loraNames=catalog.loraCatalog?.url===c.url?catalog.loraCatalog.names:[];const input=document.getElementById('comfyuiUrl');if(input){input.value=c.url;input.dispatchEvent(new Event('change',{bubbles:true}));}status='已切换 ComfyUI 连接，请读取 LoRA 列表';}
            save();render();renderQuick();
            if(action==='connection-apply'){adaptAddressSelection();render();renderQuick();refreshLoras();}
        } catch(err) {status=err.message;const el=panel.querySelector('.cosji-status');if(el)el.textContent=status;}
    });
    // Keep existing generation controls mounted; edits now use the classified editor.
    for(const suffix of ['','_novelai','_comfyui']) {
        const select=document.getElementById('yusheid'+suffix);
        const body=select?.closest('.st-chatu8-section-body');
        if(!body)continue;
        const jump=document.createElement('div');jump.className='cosji-prompt-jump';
        jump.innerHTML='<p>固定提示词现在按“角色 → 服装”保存，LoRA 可独立编辑。</p><button type="button" class="cosji-button">编辑角色 / 服装预设</button>';
        for(const child of Array.from(body.children)){child.hidden=true;child.style.display='none';}
        body.prepend(jump);jump.querySelector('button').addEventListener('click',showEditor);
    }
    const comfyInput=document.getElementById('comfyuiUrl');
    if(comfyInput){const jump=document.createElement('button');jump.type='button';jump.className='cosji-button';jump.textContent='管理 ComfyUI 连接预设';comfyInput.after(jump);jump.addEventListener('click',showEditor);}
    const quick=document.createElement('div');quick.id='cosji-quick';
    quick.innerHTML='<button type="button" id="cosji-quick-toggle" aria-label="cos姬 角色服装快捷选择">cos姬</button><div id="cosji-quick-panel" hidden></div>';
    document.body.append(quick);
    // SillyTavern can transform a zero-height HTML root: bottom-based fixed
    // positioning then places this control above the visible browser viewport.
    const placeQuick=()=>{
        const height=window.visualViewport?.height||window.innerHeight;
        const offset=window.visualViewport?.offsetTop||0;
        quick.style.top=Math.max(12,offset+height-164)+'px';
        quick.style.bottom='auto';
        quick.querySelector('#cosji-quick-panel').style.maxHeight=Math.max(120,height-190)+'px';
    };
    placeQuick();window.addEventListener('resize',placeQuick);
    window.visualViewport?.addEventListener('resize',placeQuick);
    window.visualViewport?.addEventListener('scroll',placeQuick);
    let quickRole='';
    const quickPicker=(kind,label,value,choices)=>`<details class="cosji-quick-picker"><summary>${esc(choices.find(c=>c.value===value)?.text||label)} ▾</summary><div class="cosji-quick-options">${choices.map(c=>`<button type="button" data-quick-${kind}="${esc(c.value)}" aria-pressed="${c.value===value}">${esc(c.text)}${c.value===value?' ✓':''}</button>`).join('')||'<span>此分类没有可用服装</span>'}</div></details>`;
    function renderQuick() {
        const selected=settings.yusheid_comfyui;
        const selectedRole=quickRole||catalog.presetRoles[selected] || catalog.selectedRole;
        const q=quick.querySelector('#cosji-quick-panel');
        const sizeControls=`<details><summary>生图尺寸 · ${esc(settings.comfyui_width)} × ${esc(settings.comfyui_height)}</summary><label>尺寸来源<select id="cosji-quick-size-mode">${option('fixed','固定使用设置尺寸',String(settings.aiAutonomousResolution)==='false'?'fixed':'ai')}${option('ai','允许 AI 决定尺寸',String(settings.aiAutonomousResolution)==='false'?'fixed':'ai')}</select></label><label>宽<input id="cosji-quick-width" type="number" min="64" max="8192" step="8" value="${esc(settings.comfyui_width)}"></label><label>高<input id="cosji-quick-height" type="number" min="64" max="8192" step="8" value="${esc(settings.comfyui_height)}"></label><button type="button" id="cosji-quick-size-save">应用尺寸</button><span id="cosji-quick-size-status"></span></details>`;
        q.innerHTML=`<strong>角色 / 服装</strong><label>角色${quickPicker("role","选择角色",selectedRole,catalog.roles.map(r=>({value:r.id,text:r.name})))}</label><label>服装${quickPicker("outfit","选择服装",selected,namesFor(selectedRole).map(n=>({value:n,text:outfitName(n)})))}</label><div class="cosji-cover-row">${previewMarkup(settings.yushe[selected],true)}<span>当前：${esc(outfitName(selected))}</span></div><label style="display:flex;align-items:center;gap:8px"><input style="width:auto" type="checkbox" id="cosji-quick-outfit-override" ${catalog.outfitOverride===true?'checked':''}>预设服装覆盖 LLM 服装</label><small id="cosji-quick-override-status">${catalog.outfitOverride===true?'已开启：后续新生成以预设服装为准':'关闭时保留 LLM 服装并合并预设'}</small>${sizeControls}<button type="button" id="cosji-quick-edit">编辑预设</button>`;
    }
    quick.querySelector('#cosji-quick-toggle').addEventListener('click',()=>{const p=quick.querySelector('#cosji-quick-panel');p.hidden=!p.hidden;if(!p.hidden)renderQuick();});
    quick.addEventListener('click',e=>{if(e.target.id==='cosji-quick-edit')showEditor();});
    quick.addEventListener('change',e=>{
        if(e.target.id!=='cosji-quick-outfit-override')return;
        catalog.outfitOverride=e.target.checked;save();
        quick.querySelector('#cosji-quick-override-status').textContent=e.target.checked?'已开启：后续新生成以预设服装为准':'已关闭：保留 LLM 服装并合并预设';
    });
    quick.addEventListener('click',async e=>{
        const roleButton=e.target.closest('[data-quick-role]');
        if(roleButton){quickRole=roleButton.dataset.quickRole;renderQuick();return;}
        const outfitButton=e.target.closest('[data-quick-outfit]');
        if(!outfitButton)return;
        if(!await allowSwitch())return;
        quickRole=catalog.presetRoles[outfitButton.dataset.quickOutfit];
        activate(outfitButton.dataset.quickOutfit);render();
    });
    quick.addEventListener('click',e=>{
        if(e.target.id!=='cosji-quick-size-save')return;
        const width=Number(quick.querySelector('#cosji-quick-width').value),height=Number(quick.querySelector('#cosji-quick-height').value);
        if(![width,height].every(n=>Number.isInteger(n)&&n>=64&&n<=8192&&n%8===0)){quick.querySelector('#cosji-quick-size-status').textContent='尺寸须为 64–8192 内的 8 的倍数';return;}
        settings.comfyui_width=String(width);settings.comfyui_height=String(height);settings.aiAutonomousResolution=quick.querySelector('#cosji-quick-size-mode').value==='ai';
        for(const key of ['comfyui_width','comfyui_height','aiAutonomousResolution']){const el=document.getElementById(key);if(el){if(el.type==='checkbox')el.checked=settings[key];else el.value=settings[key];}}
        const profile=settings.comfyui_profiles?.[settings.comfyui_profile_id];if(profile){profile.comfyui_width=settings.comfyui_width;profile.comfyui_height=settings.comfyui_height;}
        save();quick.querySelector('#cosji-quick-size-status').textContent='已应用；后续新生成使用此设置';
    });
    setupNativeConnections({settings, save, context, headers, refreshLLM});
    render();renderQuick();save();
    window.addEventListener('comfyui-cache-updated',e=>{
        if(Array.isArray(e.detail?.loras)){loraNames=[...new Set(e.detail.loras.filter(name=>typeof name==='string'&&name.trim()))];catalog.loraCatalog={url:settings.comfyuiUrl,names:loraNames};save();updateLoraSelect();}
    });
    if(!loraNames.length&&loraCache)loraCache().then(cache=>{if(Array.isArray(cache?.loras)&&!loraNames.length){loraNames=cache.loras.filter(name=>typeof name==='string'&&name.trim());updateLoraSelect();}}).catch(()=>{});
    adaptAddressSelection();
    if(settings.lastTab==='cosji')showEditor();
    comfyInput?.addEventListener('change',e=>{if(e.isTrusted){loraNames=[];updateLoraSelect();refreshLoras();}});
    refreshLoras();
}

async function previewCivitImport(data,settings,roleId) {
    return await new Promise(resolve=>{
        const dialog=document.createElement('dialog');dialog.className='cosji-dialog cosji-civit-dialog';
        const roleName=settings.cosji.roles.find(r=>r.id===roleId)?.name || '未分类';
        let version=data.requestedVersion || 'all';
        let planned=[];
        dialog.innerHTML=`<h3>Civit 服装批量导入</h3><p>${esc(data.modelName)}</p><p>导入角色：<strong>${esc(roleName)}</strong></p><label>模型版本<select id="cosji-civit-version">${option('all','全部版本（同服装去重）',version)}${data.versions.map(v=>option(v.id,v.name,version)).join('')}</select></label><div class="cosji-row"><button type="button" class="cosji-button" id="cosji-civit-all">全选可导入项</button><button type="button" class="cosji-button" id="cosji-civit-none">全部取消</button><span id="cosji-civit-count"></span></div><div id="cosji-civit-candidates"></div><p role="status" id="cosji-civit-preview-status"></p><div class="cosji-row"><button type="button" class="cosji-button" id="cosji-civit-cancel">取消</button><button type="button" class="cosji-button" id="cosji-civit-import">批量新建所选服装</button></div>`;
        const list=dialog.querySelector('#cosji-civit-candidates');
        const checked=()=>Array.from(list.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)'));
        function count(){const available=planned.filter(c=>!c.duplicate).length;dialog.querySelector('#cosji-civit-count').textContent=`识别 ${planned.length} 组 / 可导入 ${available} 组 / 已选 ${checked().length} 组`;dialog.querySelector('#cosji-civit-import').disabled=checked().length===0;}
        function renderCandidates(){
            planned=planCivitImport(data.versions.filter(v=>version==='all'||v.id===version).flatMap(v=>v.candidates),settings,roleId);
            list.innerHTML=planned.map((c,i)=>`<section class="cosji-civit-candidate ${c.duplicate?'cosji-civit-duplicate':''}" data-civit-index="${i}"><label class="cosji-civit-choice"><input type="checkbox" ${c.duplicate?'disabled':'checked'}><strong>${esc(c.name)}</strong><span>${esc(c.versionName)}${c.duplicate?' · '+esc(c.duplicate):''}</span></label><label>服装名称<input class="cosji-civit-name" value="${esc(c.name)}" ${c.duplicate?'disabled':''}></label><label>Trigger Words<textarea rows="3" readonly>${esc(c.triggerWords)}</textarea></label></section>`).join('');
            count();
        }
        const finish=value=>{dialog.close();dialog.remove();resolve(value);};
        dialog.querySelector('#cosji-civit-version').addEventListener('change',e=>{version=e.target.value;renderCandidates();});
        list.addEventListener('change',count);
        dialog.querySelector('#cosji-civit-all').addEventListener('click',()=>{list.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(c=>c.checked=true);count();});
        dialog.querySelector('#cosji-civit-none').addEventListener('click',()=>{list.querySelectorAll('input[type="checkbox"]').forEach(c=>c.checked=false);count();});
        dialog.querySelector('#cosji-civit-cancel').addEventListener('click',()=>finish(null));
        dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
        dialog.querySelector('#cosji-civit-import').addEventListener('click',()=>{
            try{
                const selected=checked().map(check=>{const row=check.closest('[data-civit-index]');return {...planned[Number(row.dataset.civitIndex)],name:row.querySelector('.cosji-civit-name').value.trim()};});
                if(selected.some(c=>!c.name))throw new Error('服装名称不能为空');
                const result=commitCivitImport(selected,settings,roleId);
                result.skipped+=planned.filter(c=>c.duplicate).length;
                finish(result);
            }catch(error){dialog.querySelector('#cosji-civit-preview-status').textContent=error.message;}
        });
        document.body.append(dialog);renderCandidates();dialog.showModal();
    });
}

function setupNativeConnections({settings,save,context,headers,refreshLLM}) {
    const tab=document.getElementById('ch-tab-llm');
    const box=document.createElement('div');box.className='st-chatu8-settings-section cosji-native';
    box.innerHTML='<h3>沿用酒馆连接配置</h3><p>地址和密钥由酒馆管理；cos姬 的模型独立保存，不修改主聊天模型。</p><div class="cosji-row"><select id="cosji-native-connection"></select><button type="button" id="cosji-native-use" class="cosji-button">使用此连接</button><button type="button" id="cosji-native-refresh" class="cosji-button">刷新配置列表</button></div><p role="status" id="cosji-native-status"></p>';
    tab.prepend(box);
    const profiles=()=>context().extensionSettings.connectionManager?.profiles?.filter(p=>p.mode==='cc'&&['custom','google','openai'].includes(p.api)) || [];
    const refresh=()=>{const selected=box.querySelector('select').value;box.querySelector('select').innerHTML=profiles().map(p=>option(p.id,p.name,selected)).join('');};
    const currentProfile=()=>settings.llm_profiles?.[document.getElementById('ch-llm_profile_select').value];
    function updateFields() {
        const profile=currentProfile();const native=!!profile?.cosji_connection_id;const resolved=resolveNativeProfile(profile,context());
        const url=document.getElementById('ch-llm_api_url'), key=document.getElementById('ch-llm_api_key'), bypass=document.getElementById('ch-llm_bypass_proxy');
        url.readOnly=native;key.readOnly=native;key.placeholder=native?'密钥由酒馆安全管理，无需复制':'请输入你的 API Key';
        if(native){url.value=resolved.api_url;key.value='';bypass.checked=false;box.querySelector('select').value=profile.cosji_connection_id;}
        bypass.disabled=native;
    }
    box.querySelector('#cosji-native-refresh').addEventListener('click',refresh);
    box.querySelector('#cosji-native-use').addEventListener('click',()=>{
        const native=profiles().find(p=>p.id===box.querySelector('select').value);if(!native)return;
        const name='酒馆 · '+native.name;
        const old=currentProfile() || {};
        settings.llm_profiles[name]={...old, cosji_connection_id:native.id, model:settings.llm_profiles[name]?.model || native.model || '', api_key:'',bypass_proxy:false};
        settings.current_llm_profile=name;
        for(const cfg of Object.values(settings.llm_request_type_configs || {}))cfg.api_profile=name;
        settings.cosji.nativeDefaultProfile=name;
        save();refreshLLM();updateFields();
        box.querySelector('#cosji-native-status').textContent='已沿用连接，模型可在下方独立选择。';
    });
    document.getElementById('ch-llm_profile_select').addEventListener('change',()=>setTimeout(updateFields,0));
    const modelButton=document.getElementById('ch-llm_fetch_models_button');
    modelButton.addEventListener('click',async e=>{
        const profile=currentProfile();if(!profile?.cosji_connection_id)return;
        e.preventDefault();e.stopImmediatePropagation();
        const resolved=resolveNativeProfile(profile,context());
        modelButton.disabled=true;const status=box.querySelector('#cosji-native-status');status.textContent='正在获取模型列表…';
        try {
            if(!resolved.api_url||!resolved.secret_id)throw new Error('酒馆连接已移除或缺少密钥，请检查主界面配置');
            const response=await fetch('/api/backends/chat-completions/status',{method:'POST',headers:headers(),body:JSON.stringify({chat_completion_source:resolved.chat_completion_source, custom_url:resolved.api_url,secret_id:resolved.secret_id})});
            const data=await response.json();if(!response.ok||data.error)throw new Error('模型列表获取失败，请检查连接地址和密钥');
            const models=(data.data || []).map(m=>m.id).filter(Boolean);
            const select=document.getElementById('ch-llm_model_select');const saved=profile.model;
            select.replaceChildren(...[...new Set([saved,...models].filter(Boolean))].map(m=>new Option(m,m,m===saved,m===saved)));
            status.textContent=`已获取 ${models.length} 个模型，也可以手动输入模型名。`;
        }catch(error){status.textContent=error.message;}finally{modelButton.disabled=false;}
    },true);
    refresh();updateFields();
}
