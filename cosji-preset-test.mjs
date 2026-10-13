import {withCommonPrompts} from './cosji-core.mjs';
export function presetTestSnapshot(settings,presetId,roleId){
    if(!settings.yushe?.[presetId])throw new Error('请先选择服装（二级预设）');
    const snapshot=structuredClone(settings);
    snapshot.cosji.selectedRole=roleId;
    snapshot.cosji.presetRoles[presetId]=roleId;
    return {presetId,roleId,roleName:snapshot.cosji.roles.find(r=>r.id===roleId)?.name||'未分类',outfitName:snapshot.yushe[presetId].cosjiOutfitName||presetId,preset:withCommonPrompts(snapshot.yushe[presetId],snapshot,presetId)};
}
export function showPresetTest(snapshot,generate){
    const dialog=document.createElement('dialog');dialog.className='cosji-dialog cosji-civit-dialog';
    dialog.innerHTML='<h3>当前预设生图测试</h3><p data-context></p><label>测试场景 Tag（可选）<textarea rows="2" placeholder="例如：standing, outdoors, sunlight"></textarea></label><details><summary>本次合并配置</summary><pre data-prompts style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details><div class="cosji-row"><button type="button" class="cosji-button" data-start>开始生图测试</button><button type="button" class="cosji-button" data-close>关闭</button></div><p data-status role="status"></p><img data-result alt="预设生图测试结果" style="display:none;max-width:100%;max-height:60vh;object-fit:contain">';
    const q=s=>dialog.querySelector(s);let closed=false,running=false;
    q('[data-context]').textContent=`角色：${snapshot.roleName} · 二级预设：${snapshot.outfitName}。合并全部公共、角色公共和服装提示词、负面词与 LoRA；跳过 AI。`;
    q('[data-prompts]').textContent=['前置：'+snapshot.preset.fixedPrompt,'后置：'+snapshot.preset.fixedPrompt_end,'负向：'+snapshot.preset.negativePrompt].join('\n\n');
    const close=()=>{closed=true;dialog.close();dialog.remove();};q('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    q('[data-start]').onclick=async()=>{if(running)return;running=true;q('[data-start]').disabled=true;q('[data-start]').textContent='测试进行中…';const started=Date.now();let stage='准备提交（尚未确认后端接收）';const update=value=>{stage=value;tick();};const tick=()=>{if(!closed)q('[data-status]').textContent=stage+' · 已等待 '+Math.floor((Date.now()-started)/1000)+' 秒。关闭窗口后任务继续。';};tick();const timer=setInterval(tick,1000);try{const image=await generate(snapshot,q('textarea').value.trim(),update);if(!closed){q('[data-result]').src=image;q('[data-result]').style.display='block';q('[data-status]').textContent='测试成功，图片已保存到生图缓存。';}}catch(e){if(!closed)q('[data-status]').textContent='测试失败：'+e.message;}finally{clearInterval(timer);running=false;if(!closed){q('[data-start]').disabled=false;q('[data-start]').textContent='开始生图测试';}}};
    document.body.append(dialog);dialog.showModal();
}
