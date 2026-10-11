const HOSTS = new Set(['civitai.com', 'www.civitai.com', 'civitai.red', 'www.civitai.red']);

export function parseCivitLink(value) {
    const raw = String(value).trim().match(/https?:\/\/[^\s<>\[\]]+/)?.[0];
    if (!raw) throw new Error('请输入 Civit 模型链接');
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password) throw new Error('支持 https 的 civitai.com 或 civitai.red 模型链接');
    const match = url.pathname.match(/^\/models\/(\d+)(?:\/|$)/);
    if (!match) throw new Error('链接中未找到模型 ID');
    const version = url.searchParams.get('modelVersionId');
    if (version && !/^\d+$/.test(version)) throw new Error('模型版本 ID 无效');
    return {host:url.hostname.replace(/^www\./,''),modelId:match[1],versionId:version || '',sourceUrl:url.href};
}

export function suggestOutfitName(prompt, index=0) {
    const tags = prompt.toLowerCase().split(',').map(s=>s.trim());
    const includes = (...values) => values.some(value=>tags.some(tag=>tag.includes(value)));
    if(includes('black lobelia'))return '黑色洛贝莉亚 · 军装';
    if(includes('rizu-kyun'))return '莉兹 · 恶魔装';
    if(includes('prisoner veronica'))return '维罗妮卡 · 囚服';
    if(includes('kuroe shizuku'))return '黑江雫 · 女仆装';
    if(includes('playboy bunny','bunny suit'))return '兔女郎装';
    if(includes('nun'))return '修女装';
    if(includes('blazer','school uniform','sailor uniform'))return '校园制服';
    if(includes('maid'))return '女仆装';
    if(includes('swimsuit','bikini'))return '泳装';
    if(includes('kimono','yukata'))return '和服';
    if(includes('armor'))return '盔甲';
    const clothes=tags.find(t=>/dress|coat|jacket|shirt|sweater|skirt|leotard|suit/.test(t));
    return clothes || (index === 0 ? '基础形象' : `服装 ${index + 1}`);
}

export function buildCivitCandidates(model, link) {
    if(!model || !Array.isArray(model.modelVersions))throw new Error('模型接口返回的数据格式不正确');
    const versions=model.modelVersions.map(version=>{
        let words=(version.trainedWords || []).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
        // Ordinary Civit models store individual trigger words in this array;
        // multi-outfit models store a complete comma-separated prompt per item.
        const completeGroups=words.length>1&&words.every(w=>w.split(',').filter(Boolean).length>=4);
        if(!completeGroups&&words.length)words=[words.join(', ')];
        const seen=new Set();
        const candidates=words.filter(w=>{const key=w.toLowerCase().replace(/\s+/g,' ').replace(/,\s*$/,'');if(seen.has(key))return false;seen.add(key);return true;}).map((words,index)=>({
            id:`${model.id}:${version.id}:${index}`,name:suggestOutfitName(words,index),triggerWords:words,
            modelId:model.id,modelName:model.name,versionId:version.id,versionName:version.name,
            sourceUrl:link.sourceUrl,fileName:(version.files || []).find(f=>f.primary&&f.type==='Model')?.name || (version.files || []).find(f=>f.type==='Model')?.name || ''
        }));
        return {id:String(version.id),name:version.name,candidates};
    });
    if(link.versionId&&!versions.some(v=>v.id===link.versionId))throw new Error('链接指定的版本不在模型数据中');
    if(!versions.some(v=>v.candidates.length))throw new Error('该模型没有提供 Trigger Words');
    return {modelId:model.id,modelName:model.name,versions,selectedVersion:link.versionId || versions[0]?.id,requestedVersion:link.versionId};
}

export async function fetchCivitModel(value, fetcher=fetch) {
    const link=parseCivitLink(value);
    const response=await fetcher(`https://${link.host}/api/v1/models/${link.modelId}`,{credentials:'omit',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`模型读取失败（HTTP ${response.status}）`);
    return buildCivitCandidates(await response.json(),link);
}

export function triggerSignature(words) {
    return [...new Set(String(words || '').toLowerCase().split(',').map(w=>w.trim().replace(/\s+/g,' ')).filter(Boolean))].sort().join(',');
}

export function outfitIdentity(candidate) {
    const primary=candidate.triggerWords.split(',')[0].trim().toLowerCase();
    return `${candidate.modelId}:${primary}:${suggestOutfitName(candidate.triggerWords).toLowerCase()}`;
}

export function planCivitImport(candidates, settings, roleId) {
    const existing=Object.entries(settings.yushe || {}).filter(([key])=>settings.cosji?.presetRoles?.[key]===roleId);
    const identities=new Set(existing.map(([,p])=>p.cosjiCivit?.identity).filter(Boolean));
    const signatures=new Set(existing.map(([,p])=>triggerSignature(p.fixedPrompt)));
    const names=new Set(existing.map(([key,p])=>(p.cosjiOutfitName || key).trim().toLowerCase()));
    const seenIds=new Set(),seenWords=new Set();
    return candidates.map(candidate=>{
        const identity=outfitIdentity(candidate), signature=triggerSignature(candidate.triggerWords);
        let duplicate='';
        if(identities.has(identity)||signatures.has(signature))duplicate='当前角色已存在';
        else if(seenIds.has(identity)||seenWords.has(signature))duplicate='与前面的版本重复';
        seenIds.add(identity);seenWords.add(signature);
        // Name collisions alone are not enough to drop a different outfit.
        const proposedName=names.has(candidate.name.trim().toLowerCase())?`${candidate.name} · ${candidate.versionName}`:candidate.name;
        return {...candidate,identity,signature,name:proposedName,duplicate};
    });
}

export function commitCivitImport(candidates, settings, roleId) {
    if(!settings.cosji?.roles?.some(r=>r.id===roleId))throw new Error('目标角色分类已不存在');
    const planned=planCivitImport(candidates,settings,roleId);
    let created=0,skipped=0;
    const roleName=settings.cosji.roles.find(r=>r.id===roleId).name;
    for(const item of planned) {
        if(item.duplicate){skipped++;continue;}
        if(!item.name?.trim()||!item.triggerWords?.trim()){skipped++;continue;}
        const name=item.name.trim();
        let key=`${roleName} · ${name}`,index=2;
        while(Object.hasOwn(settings.yushe,key))key=`${roleName} · ${name} (${index++})`;
        settings.yushe[key]={cosjiOutfitName:name,fixedPrompt:item.triggerWords,fixedPrompt_end:'',negativePrompt:'',cosjiLoras:[],cosjiCivit:{identity:item.identity,modelId:item.modelId,versionId:item.versionId,sourceUrl:item.sourceUrl,triggerWords:item.triggerWords,fileName:item.fileName}};
        settings.cosji.presetRoles[key]=roleId;created++;
    }
    return {created,skipped};
}
