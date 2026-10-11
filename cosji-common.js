import {splitLoras,joinLoras} from './cosji-core.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeCommon(value={}){
    const parsed=splitLoras({fixedPrompt:value.positive,negativePrompt:value.negative});
    return {positive:parsed.loras.some(l=>l.field==='fixedPrompt')?parsed.fixedPrompt:String(value.positive??''),negative:parsed.loras.some(l=>l.field==='negativePrompt')?parsed.negativePrompt:String(value.negative??''),loras:[...(value.loras||[]),...parsed.loras]};
}
export function createCommonEditors({catalog,save,ask,changed}){
    catalog.commonLibraries??={};
    const states=new Map();let modelNames=[];
    function getState(scope){
        if(states.has(scope))return states.get(scope);
        const previous=scope==='all'?catalog.commonPrompts:catalog.roleCommonPrompts[scope];
        const library=catalog.commonLibraries[scope]??={selected:'default',presets:{default:{name:'默认',...normalizeCommon(previous)}}};
        if(!library.presets[library.selected])library.selected=Object.keys(library.presets)[0];
        const state={scope,library,draft:structuredClone(library.presets[library.selected]),dirty:false,open:new Set()};states.set(scope,state);mirror(state);return state;
    }
    function mirror(s){const value=normalizeCommon(s.library.presets[s.library.selected]);if(s.scope==='all')catalog.commonPrompts=value;else catalog.roleCommonPrompts[s.scope]=value;}
    const controls=(s)=>`<div class="cosji-row"><select data-common-profile aria-label="公共预设列表">${Object.entries(s.library.presets).map(([id,p])=>`<option value="${esc(id)}" ${id===s.library.selected?'selected':''}>${esc(p.name)}</option>`).join('')}</select>${['新建','另存为','改名','删除','恢复删除'].map((name,i)=>`<button type="button" class="cosji-button" data-common-action="${['new','copy','rename','delete','restore'][i]}">${name}</button>`).join('')}</div>`;
    function mark(s,host){s.dirty=true;host.querySelector('[data-common-state]').textContent='有未保存修改';}
    function renderHost(host,s,title){
        host.innerHTML=`<section class="cosji-civit-entry"><h3>${esc(title)}</h3>${controls(s)}<p class="cosji-muted">提示词和默认 LoRA 随此预设保存、切换。合并顺序：全部公共 → 角色公共 → 服装。</p>${['positive','negative'].map((field,i)=>`<details data-common-fold="${field}" ${s.open.has(field)?'open':''}><summary>${i?'负向提示词':'前置正向提示词'}（点击展开）</summary><textarea data-common-text="${field}" rows="3">${esc(s.draft[field])}</textarea></details>`).join('')}<h4>默认 LoRA</h4><div data-common-loras>${s.draft.loras.map((l,i)=>`<div class="cosji-lora" data-common-lora="${i}"><span>${esc(l.name)}</span><label>权重<input type="number" step="0.05" value="${esc(l.weight)}" data-common-weight="weight"></label><label>CLIP<input type="number" step="0.05" placeholder="可选" value="${esc(l.clipWeight)}" data-common-weight="clipWeight"></label><select data-common-weight="field"><option value="fixedPrompt" ${l.field==='fixedPrompt'?'selected':''}>正向</option><option value="negativePrompt" ${l.field==='negativePrompt'?'selected':''}>负向</option></select><button type="button" class="cosji-button" data-common-remove="${i}">删除整项</button></div>`).join('')||'<p class="cosji-muted">没有默认 LoRA</p>'}</div><div class="cosji-row"><select data-common-model aria-label="默认 LoRA 模型列表"></select><input data-common-new-weight type="number" step="0.05" value="1" aria-label="默认 LoRA 权重"><button type="button" class="cosji-button" data-common-action="add-lora">添加默认 LoRA</button></div><div class="cosji-row"><button type="button" class="cosji-button" data-common-action="save">保存预设</button><span data-common-state>${s.dirty?'有未保存修改':'已保存'}</span></div><p data-common-status role="status" class="cosji-muted"></p></section>`;
        updateHostModels(host);
        host.querySelectorAll('details').forEach(el=>el.addEventListener('toggle',()=>{if(el.open)s.open.add(el.dataset.commonFold);else s.open.delete(el.dataset.commonFold);}));
        host.oninput=e=>{
            if(e.target.dataset.commonText){s.draft[e.target.dataset.commonText]=e.target.value;mark(s,host);}
            if(e.target.dataset.commonWeight){s.draft.loras[Number(e.target.closest('[data-common-lora]').dataset.commonLora)][e.target.dataset.commonWeight]=e.target.value;mark(s,host);}
        };
        host.onchange=async e=>{
            if(!e.target.hasAttribute('data-common-profile'))return;
            if(s.dirty&&!await ask('公共预设有未保存修改，放弃并切换？','',true)){e.target.value=s.library.selected;return;}
            s.library.selected=e.target.value;s.draft=structuredClone(s.library.presets[s.library.selected]);s.dirty=false;mirror(s);save();changed();renderHost(host,s,title);
        };
        host.onclick=async e=>{
            const remove=e.target.closest('[data-common-remove]'),action=e.target.closest('[data-common-action]')?.dataset.commonAction;
            if(!remove&&!action)return;e.stopPropagation();
            try{
                if(remove){s.draft.loras.splice(Number(remove.dataset.commonRemove),1);s.dirty=true;renderHost(host,s,title);return;}
                if(action==='add-lora'){
                    const name=host.querySelector('[data-common-model]').value,weight=host.querySelector('[data-common-new-weight]').value;
                    if(!name)throw new Error('请先选择 LoRA 模型');
                    const l={name,weight,clipWeight:'',field:'fixedPrompt'};joinLoras({loras:[l]});s.draft.loras.push(l);s.dirty=true;renderHost(host,s,title);return;
                }
                if(action==='save'){joinLoras({loras:s.draft.loras});s.library.presets[s.library.selected]=structuredClone(s.draft);s.dirty=false;}
                if(action==='new'||action==='copy'){
                    if(action==='new'&&s.dirty&&!await ask('放弃未保存修改并新建？','',true))return;
                    const name=await ask('公共预设名称',action==='copy'?s.draft.name+' 副本':'');if(!name)return;
                    if(Object.values(s.library.presets).some(p=>p.name===name))throw new Error('同名公共预设已存在');
                    if(action==='copy')joinLoras({loras:s.draft.loras});
                    const id=crypto.randomUUID();s.library.presets[id]=action==='copy'?{...structuredClone(s.draft),name}:{name,positive:'',negative:'',loras:[]};s.library.selected=id;s.draft=structuredClone(s.library.presets[id]);s.dirty=false;
                }
                if(action==='rename'){const name=await ask('公共预设名称',s.draft.name);if(!name)return;if(Object.entries(s.library.presets).some(([id,p])=>id!==s.library.selected&&p.name===name))throw new Error('同名公共预设已存在');s.library.presets[s.library.selected].name=name;s.draft.name=name;}
                if(action==='delete'){
                    if(Object.keys(s.library.presets).length===1)throw new Error('至少保留一个公共预设');
                    if(!await ask('删除此公共预设？可恢复上次删除。','',true))return;
                    s.library.deleted={id:s.library.selected,preset:s.library.presets[s.library.selected]};delete s.library.presets[s.library.selected];s.library.selected=Object.keys(s.library.presets)[0];s.draft=structuredClone(s.library.presets[s.library.selected]);s.dirty=false;
                }
                if(action==='restore'){const d=s.library.deleted;if(!d)throw new Error('没有可恢复的公共预设');s.library.presets[d.id]=d.preset;delete s.library.deleted;}
                mirror(s);save();changed();renderHost(host,s,title);
            }catch(error){host.querySelector('[data-common-status]').textContent=error.message;}
        };
    }
    function updateHostModels(host){const select=host.querySelector('[data-common-model]');if(!select)return;const value=select.value;select.innerHTML='<option value="">'+(modelNames.length?'选择默认 LoRA':'等待连接读取 LoRA')+'</option>'+modelNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');if(modelNames.includes(value))select.value=value;}
    return {
        render(panel,role,names){modelNames=names;renderHost(panel.querySelector('[data-common-editor="all"]'),getState('all'),'全部公共预设');renderHost(panel.querySelector('[data-common-editor="role"]'),getState(role),'角色公共预设 · '+(catalog.roles.find(r=>r.id===role)?.name||'未分类'));},
        updateModels(panel,names){modelNames=names;panel.querySelectorAll('[data-common-editor]').forEach(updateHostModels);}
    };
}
