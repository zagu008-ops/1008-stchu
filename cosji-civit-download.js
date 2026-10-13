import {createId} from './cosji-id.mjs';
import {normalizeComfyUrl} from './cosji-core.mjs';
import {parseCivitLink} from './cosji-civit.mjs';
import {parseRecognition,recognitionMessages,compatibility,applyImportedPlan} from './cosji-civit-import.mjs';
import {compactCover} from './cosji-preview.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function civitDownloadDialog({url,address,settings,headers,analyze,persist,extensionName,onImported}) {
    const target=normalizeComfyUrl(address);
    let connection,metadata,recognized,record,timer,closed=false,busy=false,polling=false;
    const dialog=document.createElement('dialog');dialog.className='cosji-dialog cosji-civit-dialog';
    dialog.innerHTML=`<h3>Civit 角色与服装导入</h3><p>目标电脑：${esc(target)}</p><p>首次在目标电脑打开 ComfyUI 的 /cosji-civit/local 页面完成账号授权并复制配对密钥。授权凭据保存在该电脑。</p><section data-pair hidden><label>配对密钥<input type="password" data-key autocomplete="off"></label><button class="cosji-button" data-action="pair">保存目标配对</button></section><label>Civit 链接<input data-url type="url" value="${esc(url)}"></label><button class="cosji-button" data-action="inspect">读取模型</button><p data-model></p><label>版本 / 基础模型 / 文件<select data-file disabled></select></label><p data-compatibility></p><button class="cosji-button" data-action="recognize" disabled>识别角色、作品与服装</button><section data-plan hidden></section><p role="status" data-status></p><div class="cosji-row"><button class="cosji-button" data-action="confirm" disabled>确认并下载导入</button><button class="cosji-button" data-action="resume">恢复上次任务</button><button class="cosji-button" data-action="retry" hidden>重试 / 继续保存</button><button class="cosji-button" data-action="cancel-job" hidden>取消下载</button><button class="cosji-button" data-action="close">关闭</button></div>`;
    document.body.append(dialog);dialog.showModal();
    const q=s=>dialog.querySelector(s),status=s=>{if(!closed)q('[data-status]').textContent=s;};
    const action=n=>q(`[data-action="${n}"]`);
    const api=async(route,body)=>{
        const r=await fetch('/api/plugins/cosji-civit/'+route,{method:body===undefined?'GET':'POST',headers:{...headers(),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
        let data;try{data=await r.json();}catch{throw Error('酒馆下载服务未启用。请安装并启用 cosji-civit 服务端插件后重启酒馆。');}
        if(!r.ok)throw Error(data.error||'酒馆服务请求失败');return data;
    };
    const remote=(route,body)=>{if(!connection)throw Error('请先配对目标电脑');return api('proxy',{id:connection.id,route,...(body===undefined?{}:{body})});};
    const selectedFile=()=>metadata?.files[Number(q('[data-file]').value)];
    const selectedVersion=()=>metadata?.versions.find(v=>String(v.id)===String(selectedFile()?.versionId));
    function updateFile(){
        recognized=undefined;q('[data-plan]').hidden=true;action('confirm').disabled=true;
        const f=selectedFile();if(!f)return;
        const c=compatibility(f.baseModel,settings.MODEL_NAME);q('[data-compatibility]').textContent=c.message;
        action('recognize').disabled=c.state==='mismatch';
    }
    function showPlan(r){
        const f=selectedFile(),v=selectedVersion();
        q('[data-plan]').hidden=false;
        q('[data-plan]').innerHTML=`<p>识别置信度：${Math.round(r.confidence*100)}%；请核对名称和词组。</p><label>角色名称<input data-role value="${esc(r.role.name)}" maxlength="120"></label><label>现有角色目标<select data-role-id><option value="">按角色及作品名称自动匹配 / 新建</option>${settings.cosji.roles.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><label>作品中文名 / 下载文件夹<input data-work value="${esc(r.work.name)}" maxlength="120"></label><p>原名：${esc(r.work.originalName)}</p><button class="cosji-button" data-action="wiki">搜索作品中文名</button><select data-wiki><option value="">保留当前名称</option></select><label>角色共用 Trigger Words<textarea data-identity>${esc(r.identityWords)}</textarea></label><details><summary>原始 Trigger Words</summary><pre>${esc((v.trainedWords||[]).join('\n'))}</pre></details><label>LoRA 权重<input data-weight type="number" min="-5" max="5" step="0.05" value="1"></label><div data-outfits>${r.outfits.map((o,i)=>`<fieldset data-outfit="${i}"><label><input data-enabled type="checkbox" checked>导入这套服装</label><input data-name value="${esc(o.name)}" maxlength="120"><textarea data-words>${esc(o.words)}</textarea><label>可选预览图<select data-image><option value="">无预览图</option>${(v.images||[]).map((img,j)=>`<option value="${j}">示例图 ${j+1}（请核对对应服装）</option>`).join('')}</select></label></fieldset>`).join('')}</div><p>保存位置：${esc(metadata.root)}/${esc(r.work.name)}/${esc(f.name)} · ${(f.bytes/1024**2).toFixed(1)} MiB</p><label><input data-review type="checkbox">我已核对角色、作品、每套服装词组、版本与当前工作流兼容性；下载成功后保存这些服装。</label>`;
        action('confirm').disabled=!metadata.tokenConfigured;
        if(!metadata.tokenConfigured)status('目标电脑尚未授权 Civitai，请在该电脑完成授权后重新读取模型。');
    }
    async function saveRecord(){await api('imports',record);}
    async function commit(job){
        const before=structuredClone({yushe:settings.yushe,cosji:settings.cosji});
        let result;
        try{
            result=applyImportedPlan(settings,record.plan,job,settings.comfyuiUrl);
            await persist();
            if(!(await api('verify-import',{extensionName,id:record.id})).verified)throw Error('酒馆设置尚未保存，请继续保存导入结果');
        }catch(e){
            settings.yushe=before.yushe;
            for(const key of Object.keys(settings.cosji))if(!Object.hasOwn(before.cosji,key))delete settings.cosji[key];
            Object.assign(settings.cosji,before.cosji);throw e;
        }
        record.state='done';await saveRecord();
        status(`已保存 ${result.created} 套服装，跳过 ${result.skipped} 套重复服装。当前应用服装保持原选择。文件：${job.path}`);
        action('retry').hidden=true;action('cancel-job').hidden=true;action('confirm').disabled=false;
        await onImported?.(job,result);
    }
    async function poll(){
        clearTimeout(timer);if(closed||!record||polling)return;polling=true;
        try{
            if(!record.jobId){const job=await remote('download',record.download);record.jobId=job.id;await saveRecord();}
            const job=await remote('jobs/'+record.jobId);if(closed)return;
            if(job.state==='done'){await commit(job);return;}
            if(['failed','cancelled','interrupted'].includes(job.state)){
                record.state=job.state;await saveRecord();status(job.error||'任务已中断，可重试');action('retry').hidden=false;action('cancel-job').hidden=true;return;
            }
            status(`${job.state}：${(Number(job.received||0)/1024**2).toFixed(1)} / ${(Number(job.total||0)/1024**2).toFixed(1)} MiB。关闭页面后目标电脑继续下载。`);
            action('cancel-job').hidden=false;timer=setTimeout(poll,2000);
        }catch(e){status(e.message);action('retry').hidden=false;}finally{polling=false;}
    }
    async function resume(){
        const list=(await api('imports')).imports.filter(r=>r.connectionId===connection?.id&&r.state!=='done');
        record=list[0];if(!record){status('该目标电脑没有未完成导入任务');return;}
        action('confirm').disabled=true;status('正在恢复 '+record.plan.roleName+' 的导入任务…');await poll();
    }
    async function confirm(){
        if(!recognized||!q('[data-review]').checked)throw Error('请先核对并勾选确认');
        if(compatibility(selectedFile().baseModel,settings.MODEL_NAME).state==='mismatch')throw Error('当前工作流模型家族不匹配');
        if(record&&record.state!=='done')throw Error('请先恢复或完成上一项导入任务');
        if(String(parseCivitLink(q('[data-url]').value).modelId)!==String(metadata.modelId))throw Error('链接已改变，请重新读取和识别模型');
        const roleName=q('[data-role]').value.trim(),workName=q('[data-work]').value.trim();
        if(!roleName||!workName||/[\\/:<>"|?*\x00-\x1f]/.test(workName)||workName==='.'||workName==='..')throw Error('角色和作品名称不能为空，作品名称不能包含目录特殊字符');
        const identityWords=q('[data-identity]').value.trim(),outfits=[];
        for(const row of q('[data-plan]').querySelectorAll('[data-outfit]')){
            if(!row.querySelector('[data-enabled]').checked)continue;
            const outfit={name:row.querySelector('[data-name]').value.trim(),words:row.querySelector('[data-words]').value.trim()};
            if(!outfit.name||!identityWords)throw Error('服装名称及角色共用词不能为空');
            const choice=row.querySelector('[data-image]').value;
            if(choice!==''){
                status('正在保存所选预览图…');const src=selectedVersion().images[Number(choice)].url;
                const {dataUrl}=await api('preview',{url:src});
                outfit.preview={dataUrl:await compactCover(await (await fetch(dataUrl)).blob()),sourceUrl:src};
            }
            outfits.push(outfit);
        }
        if(!outfits.length)throw Error('请至少选择一套服装');
        const weight=Number(q('[data-weight]').value);if(!Number.isFinite(weight)||Math.abs(weight)>5)throw Error('LoRA 权重应在 -5 到 5 之间');
        const id=createId(),file=selectedFile(),link=parseCivitLink(q('[data-url]').value);
        const sourceUrl='https://civitai.com/models/'+link.modelId+'?modelVersionId='+file.versionId;
        const plan={id,address:target,modelId:metadata.modelId,sourceUrl,file,roleName,roleAliases:recognized.role.aliases,existingRoleId:q('[data-role-id]').value,workName,workAliases:[recognized.work.originalName,...recognized.work.aliases,recognized.work.name],workSource:q('[data-wiki]').selectedOptions[0].dataset.source||'',identityWords,outfits,weight,rawTrainedWords:selectedVersion().trainedWords};
        record={id,connectionId:connection.id,state:'pending',plan,download:{url:sourceUrl,versionId:file.versionId,fileId:file.fileId,folder:workName},createdAt:Date.now()};
        await saveRecord();action('confirm').disabled=true;await poll();
    }
    async function searchWork(){
        const items=await api('wiki',{search:recognized.work.originalName||q('[data-work]').value});
        if(closed)return;
        q('[data-wiki]').innerHTML='<option value="">保留当前名称</option>'+items.map(x=>`<option value="${esc(x.name)}" data-source="${esc(x.url)}">${esc(x.name)} · ${esc(x.description)}</option>`).join('');
        status(items.length?'已自动搜索作品名称，请核对候选条目及每套服装':'没有找到作品条目，请手动核对中文作品名');
    }
    async function handle(name){
        if(name==='pair'){
            const key=q('[data-key]').value.trim();connection=await api('pair',{url:target,key,name:target});q('[data-key]').value='';q('[data-pair]').hidden=true;status('目标电脑已配对');
        }else if(name==='inspect'){
            if(record&&record.state!=='done')throw Error('请先恢复或完成上一项任务');
            parseCivitLink(q('[data-url]').value);metadata=await remote('inspect',{url:q('[data-url]').value});
            if(String(metadata.type).toLowerCase()!=='lora')throw Error('首版只支持 LoRA');
            const select=q('[data-file]');select.innerHTML=metadata.files.map((f,i)=>`<option value="${i}">${esc(f.versionName)} · ${esc(f.baseModel)} · ${(f.bytes/1024**2).toFixed(1)} MiB · ${esc(f.name)}</option>`).join('');
            if(!metadata.files.length)throw Error('模型没有带官方哈希的主 safetensors 文件');
            const link=parseCivitLink(q('[data-url]').value),index=link.versionId?metadata.files.findIndex(f=>String(f.versionId)===String(link.versionId)):metadata.files.findIndex(f=>compatibility(f.baseModel,settings.MODEL_NAME).state==='match');
            if(link.versionId&&index<0)throw Error('指定版本没有可下载文件');select.value=String(Math.max(index,0));select.disabled=false;q('[data-model]').textContent=metadata.name;updateFile();status('已读取模型，请选择版本并开始识别');
        }else if(name==='recognize'){
            status('正在使用当前文本 LLM 识别公开模型资料…');recognized=parseRecognition(await analyze(recognitionMessages(metadata,selectedVersion())),metadata,selectedVersion());if(!closed){showPlan(recognized);try{await searchWork();}catch(e){status('作品自动搜索失败，可手动核对名称：'+e.message);}}
        }else if(name==='wiki'){await searchWork();
        }else if(name==='confirm')await confirm();
        else if(name==='resume')await resume();
        else if(name==='retry'){
            if(!record)throw Error('没有待恢复任务');
            if(record.jobId){const job=await remote('jobs/'+record.jobId);if(['failed','cancelled','interrupted'].includes(job.state))await remote('jobs/'+record.jobId+'/retry',{});}
            action('retry').hidden=true;await poll();
        }else if(name==='cancel-job'){await remote('jobs/'+record.jobId+'/cancel',{});await poll();}
    }
    const close=()=>{closed=true;clearTimeout(timer);dialog.close();dialog.remove();};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',async e=>{
        const button=e.target.closest('[data-action]');if(!button)return;const name=button.dataset.action;
        if(name==='close'){close();return;}if(busy)return;busy=true;button.disabled=true;
        try{await handle(name);}catch(error){status(error.message);}finally{busy=false;if(!closed){button.disabled=false;if(name==='confirm'&&record&&record.state!=='done')button.disabled=true;}}
    });
    q('[data-file]').addEventListener('change',updateFile);
    dialog.addEventListener('change',e=>{if(e.target.matches('[data-wiki]')&&e.target.value)q('[data-work]').value=e.target.value;});
    busy=true;
    (async()=>{try{connection=(await api('connections')).connections.find(c=>normalizeComfyUrl(c.url)===target);q('[data-pair]').hidden=!!connection;if(connection)await resume();else status('首次使用请配对目标电脑');}catch(e){status(e.message);}finally{busy=false;}})();
}
