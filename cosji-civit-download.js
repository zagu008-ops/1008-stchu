import {normalizeComfyUrl} from './cosji-core.mjs';
import {parseCivitLink} from './cosji-civit.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keys=new Map(); // Pairing keys only live in this page's memory.

export function civitDownloadDialog({url,address,onDownloaded}) {
    const target=normalizeComfyUrl(address);
    const link=parseCivitLink(url);
    const storageKey='cosji-civit-job:'+target;
    let files=[],timer,authTimer,closed=false,pending=false;
    const dialog=document.createElement('dialog');
    dialog.className='cosji-dialog cosji-civit-dialog';
    dialog.innerHTML=`<h3>Civit LoRA 下载测试</h3><p>目标 ComfyUI：${esc(target)}</p><p>下载由目标电脑执行；此测试不会创建角色或服装预设。</p><label>下载助手配对密钥<input data-key type="password" autocomplete="off" value="${esc(keys.get(target)||'')}" placeholder="由目标电脑的下载助手配置提供"></label><button type="button" class="cosji-button" data-inspect>读取模型与下载目录</button><p data-model></p><label>模型版本与文件<select data-file disabled></select></label><label>LoRA 子文件夹<input data-folder value="Civit测试" maxlength="120"></label><p data-path></p><p data-token></p><p role="status" data-status></p><div class="cosji-row"><button type="button" class="cosji-button" data-close>关闭</button><button type="button" class="cosji-button" data-resume>查询上次任务</button><button type="button" class="cosji-button" data-download disabled>确认并下载到目标电脑</button></div>`;
    document.body.append(dialog);
    const status=message=>{dialog.querySelector('[data-status]').textContent=message;};
    const tokenSection=document.createElement('section');
    tokenSection.innerHTML='<button type="button" class="cosji-button" data-authorize>通过 Civitai 网页授权</button><p data-auth-link></p><details><summary>备用：手动配置 Token</summary><label>Civitai Token（仅保存到目标电脑）<input data-api-token type="password" autocomplete="off" placeholder="需要登录下载时填写"></label><button type="button" class="cosji-button" data-save-token>保存 Token 到目标电脑</button></details>';
    dialog.querySelector('[data-token]').after(tokenSection);
    async function pollAuthorization(id) {
        try {
            const auth=await request('oauth/status/'+encodeURIComponent(id));
            if(closed)return;
            if(auth.state==='done') {
                tokenSection.querySelector('[data-authorize]').disabled=false;
                dialog.querySelector('[data-token]').textContent='Civitai 网页授权已连接';
                status('授权成功，凭据已自动保存到目标电脑。现在可读取模型并下载。');
            }else if(auth.state==='failed') {
                tokenSection.querySelector('[data-authorize]').disabled=false;status(auth.error);
            }else authTimer=setTimeout(()=>pollAuthorization(id),5000);
        }catch(error){if(!closed){status(error.message);tokenSection.querySelector('[data-authorize]').disabled=false;}}
    }
    tokenSection.querySelector('[data-authorize]').addEventListener('click',async e=>{
        e.target.disabled=true;
        const popup=window.open('about:blank','_blank');
        try {
            const auth=await request('oauth/start',{});
            const u=new URL(auth.url);
            if(u.protocol!=='https:'||u.host!=='auth.civitai.com')throw new Error('授权链接不是 Civitai 官方授权域名');
            if(popup){popup.opener=null;popup.location.href=auth.url;}
            const link=document.createElement('a');link.href=auth.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='打开 Civitai 授权页';
            tokenSection.querySelector('[data-auth-link]').replaceChildren(link);
            status('请在 Civitai 页面登录并确认授权；此处会自动显示结果，无需复制 Token。');
            await pollAuthorization(auth.id);
        }catch(error){popup?.close();status(error.message);e.target.disabled=false;}
    });
    tokenSection.querySelector('[data-save-token]').addEventListener('click',async e=>{
        e.target.disabled=true;
        try{await request('token',{token:tokenSection.querySelector('input').value.trim()});tokenSection.querySelector('input').value='';dialog.querySelector('[data-token]').textContent='目标电脑已配置 Civitai Token';status('Token 已保存到目标电脑，可读取模型并下载。');}
        catch(error){status(error.message);}finally{e.target.disabled=false;}
    });
    let root='';
    const path=()=>{const f=files[Number(dialog.querySelector('[data-file]').value)];dialog.querySelector('[data-path]').textContent=f?`保存位置：${root}/${dialog.querySelector('[data-folder]').value}/${f.name}`:'';};
    async function request(route,body) {
        const key=dialog.querySelector('[data-key]').value.trim();
        if(!key)throw new Error('请填写目标下载助手的配对密钥');
        const response=await fetch(target+'/cosji-civit/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',signal:AbortSignal.timeout(40000)});
        const text=await response.text();let data;
        try{data=JSON.parse(text);}catch{throw new Error(response.status===404?'目标 ComfyUI 尚未安装下载助手':response.status===401?'下载助手配对密钥无效':`下载助手返回 HTTP ${response.status}`);}
        if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
        keys.set(target,key);
        return data;
    }
    async function poll(id) {
        clearTimeout(timer);
        try {
            const job=await request('jobs/'+encodeURIComponent(id));
            if(closed)return;
            if(job.state==='done') {
                status(`${job.reused?'文件已存在，已复用':'下载与 SHA256 校验完成'}：${job.path}`);
                dialog.querySelector('[data-download]').disabled=false;
                onDownloaded?.(job);
            } else if(job.state==='failed'||job.state==='cancelled') {
                status(job.error||'下载失败');dialog.querySelector('[data-download]').disabled=false;
            } else {
                status(`${job.state==='queued'?'已提交，目标电脑准备下载':'目标电脑正在下载'}：${(job.received/1024**2).toFixed(1)} / ${(job.total/1024**2).toFixed(1)} MiB。关闭此窗口不会停止下载。`);
                timer=setTimeout(()=>poll(id),2000);
            }
        }catch(e){if(!closed)status(e.message+'；可点击“查询上次任务”重试');}
    }
    dialog.querySelector('[data-inspect]').addEventListener('click',async e=>{
        if(pending)return;pending=true;e.target.disabled=true;status('由目标电脑读取模型资料…');
        try {
            const data=await request('inspect',{url});
            if(closed)return;
            files=data.files;root=data.root;
            dialog.querySelector('[data-model]').textContent=data.name;
            const select=dialog.querySelector('[data-file]');
            select.innerHTML=files.map((f,i)=>`<option value="${i}">${esc(f.versionName)} · ${esc(f.baseModel)} · ${(f.bytes/1024**2).toFixed(1)} MiB · ${esc(f.name)}</option>`).join('');
            if(link.versionId){const i=files.findIndex(f=>String(f.versionId)===link.versionId);if(i<0)throw new Error('链接指定的版本没有可下载的主 safetensors 文件');select.value=String(i);}
            select.disabled=false;dialog.querySelector('[data-download]').disabled=false;
            dialog.querySelector('[data-token]').textContent=data.tokenConfigured?'目标电脑已配置 Civitai 下载凭据':'目标电脑尚未连接 Civitai；请先点击网页授权。';
            path();status('请确认版本、基础模型和保存位置，再开始下载。');
        }catch(error){status(error.message);}finally{pending=false;e.target.disabled=false;}
    });
    dialog.querySelector('[data-file]').addEventListener('change',path);
    dialog.querySelector('[data-folder]').addEventListener('input',path);
    dialog.querySelector('[data-download]').addEventListener('click',async e=>{
        if(pending)return;
        const f=files[Number(dialog.querySelector('[data-file]').value)];if(!f)return;
        pending=true;e.target.disabled=true;
        try {
            const job=await request('download',{url,versionId:f.versionId,fileId:f.fileId,folder:dialog.querySelector('[data-folder]').value.trim()});
            localStorage.setItem(storageKey,job.id);
            await poll(job.id);
        }catch(error){status(error.message);e.target.disabled=false;}finally{pending=false;}
    });
    dialog.querySelector('[data-resume]').addEventListener('click',()=>{const id=localStorage.getItem(storageKey);if(id)poll(id);else status('此地址没有上次下载任务');});
    const close=()=>{closed=true;clearTimeout(timer);clearTimeout(authTimer);dialog.close();dialog.remove();};
    dialog.querySelector('[data-close]').addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.showModal();
}
