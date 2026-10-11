import {inspectLoras,copyForAddress} from './cosji-address.mjs';
import {normalizeComfyUrl} from './cosji-core.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function copyAddressDialog(preset,connections,currentUrl,name){
    const targets=[{name:'当前连接',url:currentUrl},...connections].filter((c,i,all)=>all.findIndex(t=>t.url===c.url)===i);
    return await new Promise(resolve=>{
        const dialog=document.createElement('dialog');dialog.className='cosji-dialog cosji-civit-dialog';
        dialog.innerHTML=`<h3>检测并复制到 ComfyUI 地址</h3><label>目标连接<select id="cosji-copy-target">${targets.map(c=>`<option value="${esc(c.url)}">${esc(c.name)} · ${esc(c.url)}</option>`).join('')}</select></label><label>副本名称<input id="cosji-copy-name" value="${esc(name)}" required></label><p>提示词、权重和预览图一起复制；缺失 LoRA 需选择移除或替换。</p><div id="cosji-copy-loras"></div><p role="status" id="cosji-copy-status"></p><div class="cosji-row"><button type="button" class="cosji-button" id="cosji-copy-cancel">取消</button><button type="button" class="cosji-button" id="cosji-copy-confirm" disabled>保存目标地址副本</button></div>`;
        const select=dialog.querySelector('#cosji-copy-target'),list=dialog.querySelector('#cosji-copy-loras'),status=dialog.querySelector('#cosji-copy-status'),confirm=dialog.querySelector('#cosji-copy-confirm');
        let token=0,names=[],checked=[],ready=false,closed=false;
        const finish=value=>{closed=true;token++;dialog.close();dialog.remove();resolve(value);};
        const update=()=>{confirm.disabled=!ready||!dialog.querySelector('#cosji-copy-name').value.trim()||Array.from(list.querySelectorAll('select')).some(s=>!s.value);};
        async function detect(){
            const request=++token;ready=false;update();list.replaceChildren();status.textContent='正在检测目标地址的 LoRA…';
            try{
                const response=await fetch(normalizeComfyUrl(select.value)+'/object_info/LoraLoader',{signal:AbortSignal.timeout(12000),credentials:'omit'});
                if(!response.ok)throw new Error(`ComfyUI 返回 ${response.status}`);
                const info=await response.json(),values=info.LoraLoader?.input?.required?.lora_name?.[0];
                if(!Array.isArray(values))throw new Error('没有读取到目标地址的 LoRA 列表');
                if(closed||request!==token)return;
                names=[...new Set(values.filter(v=>typeof v==='string'))].sort((a,b)=>a.localeCompare(b));checked=inspectLoras(preset,names);
                list.innerHTML=checked.map((l,i)=>`<div class="cosji-civit-candidate"><strong>${esc(l.name)}</strong><p>${l.availableName?'✓ 目标地址可用':'⚠ 目标地址缺失'}</p>${l.availableName?'':`<select data-resolution="${i}" aria-label="替换 ${esc(l.name)}"><option value="">选择处理方式</option><option value="__remove__">从副本移除此 LoRA</option>${names.map(n=>`<option value="${esc(n)}">替换为：${esc(n)}</option>`).join('')}</select>`}</div>`).join('');
                const missing=checked.filter(l=>!l.availableName).length;
                status.textContent=`检测完成：${checked.length-missing} 个可用，${missing} 个缺失${checked.length?'':'；此预设没有 LoRA'}`;ready=true;update();
            }catch(error){if(!closed&&request===token)status.textContent=`检测失败，无法创建副本：${error.message}`;}
        }
        select.addEventListener('change',detect);list.addEventListener('change',update);dialog.querySelector('#cosji-copy-name').addEventListener('input',update);
        dialog.querySelector('#cosji-copy-cancel').addEventListener('click',()=>finish(null));dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
        confirm.addEventListener('click',()=>{
            try{
                const resolutions={};list.querySelectorAll('[data-resolution]').forEach(s=>resolutions[s.dataset.resolution]=s.value);
                finish({preset:copyForAddress(preset,select.value,names,resolutions),name:dialog.querySelector('#cosji-copy-name').value.trim()});
            }catch(error){status.textContent=error.message;}
        });
        document.body.append(dialog);dialog.showModal();detect();
    });
}
