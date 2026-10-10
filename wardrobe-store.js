// Wardrobe data and scene rules. Keep legacy presets as the single source of prompt fields.
let fallbackIdCounter = 0;
export function newId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  // Library identifiers only, never credentials or security tokens.
  return `local-${Date.now().toString(36)}-${(++fallbackIdCounter).toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export const names = (p, key = '') => [...new Set([key, p?.nameCN, p?.nameEN].filter(Boolean).flatMap(x => x.split('|')).map(x => x.trim()).filter(Boolean))];
const signature = p => JSON.stringify(Object.entries(p || {}).filter(([k]) => !['nameCN','nameEN','outfits'].includes(k)).sort(([a],[b]) => a.localeCompare(b)));
export function library(settings) {
  if (!settings.wardrobe) settings.wardrobe = { version: 1, enabled: true, roles: {}, outfits: {}, combinations: {}, scenes: {}, pending: [], backup: { characters: structuredClone(settings.characterPresets || {}), outfits: structuredClone(settings.outfitPresets || {}) } };
  const w = settings.wardrobe;
  for (const [type, presets] of [['roles',settings.characterPresets],['outfits',settings.outfitPresets]]) {
    const records = w[type];
    for (const [key,p] of Object.entries(presets || {})) {
      let item = Object.values(records).find(r => r.key === key);
      if (!item) {
        const matches = Object.values(records).filter(r => !presets[r.key] && r.signature === signature(p));
        item = matches.length === 1 ? matches[0] : { id: newId(), key };
        if (type==='outfits' && item.key!==key) {
          const oldKey=item.key;
          for(const role of Object.values(w.roles))role.legacyOutfits=(role.legacyOutfits||[]).map(name=>name===oldKey?key:name);
          for(const role of Object.values(settings.characterPresets||{}))role.outfits=(role.outfits||[]).map(name=>name===oldKey?key:name);
        }
        item.key = key; records[item.id] = item;
      }
      item.signature = signature(p);
    }
  }
  for (const o of Object.values(w.outfits)) {
    const preset=settings.outfitPresets?.[o.key];if(preset&&preset.loraTriggerWords===undefined&&o.civit)preset.loraTriggerWords=o.civit.activation||o.civit.raw||'';
    if (settings.outfitPresets?.[o.key] && !Object.values(w.combinations).some(c => c.outfitId === o.id)) {
      const id = newId(); w.combinations[id] = { id, name:o.key, outfitId:o.id };
    }
  }
  for (const r of Object.values(w.roles)) {
    const preset=settings.characterPresets?.[r.key];if(!preset)continue;
    if (!Array.isArray(r.combinationIds)) {
      r.combinationIds=[];
      // Retain choices made before per-role lists were introduced.
      for (const id of [r.defaultComboId,...Object.values(w.scenes).map(s=>s.roles?.[r.id]?.comboId)]) if(w.combinations[id])r.combinationIds.push(id);
    }
    const keys=Array.isArray(preset.outfits)?preset.outfits:[],previous=r.legacyOutfits||[];
    const removed=previous.filter(key=>!keys.includes(key));
    r.combinationIds=r.combinationIds.filter(id=>!removed.includes(w.outfits[w.combinations[id]?.outfitId]?.key));
    for(const key of keys.filter(key=>!previous.includes(key))){const c=Object.values(w.combinations).find(c=>w.outfits[c.outfitId]?.key===key);if(c)r.combinationIds.push(c.id);}
    r.legacyOutfits=[...keys];
    r.combinationIds=[...new Set(r.combinationIds)].filter(id=>w.combinations[id]&&settings.outfitPresets?.[w.outfits[w.combinations[id].outfitId]?.key]);
  }
  return w;
}
export function roleCombinations(settings,roleId) {
  const w=library(settings);return (w.roles[roleId]?.combinationIds||[]).map(id=>w.combinations[id]).filter(Boolean);
}
export function bindCombination(settings,roleId,comboId) {
  const w=library(settings),r=w.roles[roleId],c=w.combinations[comboId],key=w.outfits[c?.outfitId]?.key,p=settings.characterPresets?.[r?.key];
  if(!p||!settings.outfitPresets?.[key])throw new Error('角色或服装已删除，请重新选择。');
  r.combinationIds=[...new Set([...(r.combinationIds||[]),comboId])];
  p.outfits=[...new Set([...(p.outfits||[]),key])];
}
export function unbindCombination(settings,roleId,comboId) {
  const w=library(settings),r=w.roles[roleId];if(!r)return;
  const c=w.combinations[comboId],key=w.outfits[c?.outfitId]?.key;
  // One outfit can have several named combinations: unlinking one keeps the others.
  r.combinationIds=(r.combinationIds||[]).filter(id=>id!==comboId);
  const p=settings.characterPresets?.[r.key];
  if(p&&!r.combinationIds.some(id=>w.combinations[id]?.outfitId===c?.outfitId))p.outfits=(p.outfits||[]).filter(x=>x!==key);
  if(r.defaultComboId===comboId)delete r.defaultComboId;
  for(const state of Object.values(w.scenes))if(state.roles?.[roleId]?.comboId===comboId)delete state.roles[roleId];
  w.pending=w.pending.filter(p=>p.kind!=='wear'||p.roleId!==roleId||p.comboId!==comboId);
}
export function chatKey(ctx) { return String(ctx?.chatId || ctx?.chatMetadata?.chat_id || '') + ':' + String(ctx?.characterId ?? ctx?.groupId ?? 'none'); }
export function messageStamp(message) { return JSON.stringify([message?.mes || '', message?.swipe_id ?? 0]); }
export function latestBody(ctx) {
  const chat = ctx.chat || [];
  for (let i = chat.length - 1; i >= 0; i--) if (!chat[i].is_system && !chat[i].is_user) return { index: i, stamp: messageStamp(chat[i]), text: chat[i].mes || '' };
  return { index: -1, stamp: '', text: '' };
}
export function scene(settings, ctx) {
  const w = library(settings), key = chatKey(ctx);
  return w.scenes[key] ||= { roles: {}, modes: {} };
}
export function validSource(source, ctx) { return source && messageStamp(ctx.chat?.[source.index]) === source.stamp; }
export function resolveWear(settings, ctx, roleId) {
  const w = library(settings), state = scene(settings,ctx).roles[roleId], r = w.roles[roleId];
  const chosen = state && (state.locked || validSource(state.source,ctx)) ? state.comboId : r?.defaultComboId;
  const c = w.combinations[chosen], o = w.outfits[c?.outfitId];
  if (!r?.combinationIds?.includes(chosen) || !settings.outfitPresets?.[o?.key]) return null;
  return { roleId, comboId: c.id, outfitKey: o.key, outfit: settings.outfitPresets[o.key], source: state?.comboId === chosen ? state : { default: true } };
}
export function applyWear(settings, ctx, roleId, comboId, manual = false, source = latestBody(ctx)) {
  const w = library(settings);
  const hasChat=!!(ctx.chatId || ctx.chatMetadata?.chat_id);
  if (!hasChat && !manual) throw new Error('正文自适应需要先打开并保存聊天。');
  if (!w.roles[roleId] || !w.combinations[comboId]) throw new Error('角色或组合已删除，请重新选择。');
  if (!w.roles[roleId].combinationIds.includes(comboId)) throw new Error('先把这套服装添加到该角色的服装配置。');
  if(!hasChat){w.roles[roleId].defaultComboId=comboId;return;}
  scene(settings,ctx).roles[roleId] = { comboId, locked: manual, source: { index: source.index, stamp: source.stamp }, confirmed: true };
}
export function selectedOutfitKeys(settings, ctx) {
  const w = library(settings), active = new Set();
  for (const list of [settings.characterEnablePresets?.[settings.characterEnablePresetId]?.characters, settings.characterCommonPresets?.[settings.characterCommonPresetId]?.characters])
    for (const entry of list || []) active.add(typeof entry === 'string' ? entry : entry.characterPresetName);
  return [...new Set(Object.values(w.roles).filter(r => active.has(r.key)).map(r => resolveWear(settings,ctx,r.id)?.outfitKey).filter(Boolean))];
}
export function matchOutfits(settings, ctx, roleId) {
  const w = library(settings), role = settings.characterPresets?.[w.roles[roleId]?.key], body = latestBody(ctx);
  if (!body.text || !role) return [];
  const aliases = names(role,w.roles[roleId].key);
  const sentences = body.text.split(/[。！？\n.!?]/).filter(s => aliases.some(n => s.toLowerCase().includes(n.toLowerCase())));
  const results = [];
  for (const c of roleCombinations(settings,roleId)) {
    const o = w.outfits[c.outfitId], p = settings.outfitPresets?.[o?.key];
    if (!p) continue;
    const hits = sentences.filter(s => names(p,o.key).some(n => s.toLowerCase().includes(n.toLowerCase())));
    if (hits.length) results.push({ id:newId(), roleId, comboId:c.id, evidence:hits.join('。'), source:body, kind:'wear', reason:'人物与服装名称出现在同一段正文；请核对归属' });
  }
  if (results.length) return results;
  // Conservative local fallback: require a garment type and a matching colour,
  // and leave every hit for confirmation. A colour alone is never sufficient.
  const tags = [
    ['black','黑色|黑|black'], ['white','白色|白|white'], ['blue','蓝色|蓝|blue|navy'],
    ['red','红色|红|red'], ['green','绿色|绿|green'], ['pink','粉色|粉红|pink'], ['grey','灰色|灰|grey|gray'],
    ['dress','连衣裙|长裙|dress'], ['shirt','衬衫|shirt'], ['skirt','短裙|裙子|skirt'],
    ['hoodie','卫衣|hoodie'], ['kimono','和服|浴衣|kimono|yukata'], ['sailor','水手服|sailor'],
    ['pants','长裤|裤子|pants|trousers'], ['shorts','短裤|shorts'], ['suit','西装|suit']
  ];
  const extract = text => new Set(tags.filter(([,pattern])=>new RegExp(pattern,'i').test(text)).map(([id])=>id));
  const colours = new Set(tags.slice(0,7).map(([id])=>id));
  for (const c of roleCombinations(settings,roleId)) {
    const o=w.outfits[c.outfitId],p=settings.outfitPresets?.[o?.key];if(!p)continue;
    const inventory=extract([p.nameCN,p.nameEN,p.upperBody,p.fullBody].filter(Boolean).join(' '));
    for (const sentence of sentences) {
      const described=extract(sentence),shared=[...described].filter(t=>inventory.has(t));
      if(shared.some(t=>colours.has(t))&&shared.some(t=>!colours.has(t))) {
        results.push({id:newId(),roleId,comboId:c.id,evidence:sentence,source:body,kind:'wear',reason:'颜色与服装类别匹配，请核对细节和人物归属'});break;
      }
    }
  }
  return results;
}
export function saveCover(settings, pair, imageId, replace = false) {
  const w = library(settings);
  if (!settings.characterPresets?.[w.roles[pair.roleId]?.key] || !w.roles[pair.roleId]?.combinationIds?.includes(pair.comboId) || !w.combinations[pair.comboId]) return;
  const key = pair.roleId + ':' + pair.comboId;
  const cover = (w.covers ||= {})[key] ||= {};
  cover.first ||= imageId;
  if (!cover.current || replace) cover.current = imageId;
}
export function parseCivitLink(input) {
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol)) throw new Error('请输入 Civit 模型链接。');
  const id = url.pathname.match(/\/models\/(\d+)/)?.[1];
  if (!id) throw new Error('链接中没有模型 ID。');
  return { id:Number(id), versionId: Number(url.searchParams.get('modelVersionId')) || null };
}
export function summarizeCivitOutfit(raw, index=0) {
  const tags=String(raw).toLowerCase().replace(/_/g,' ').split(',').map(x=>x.trim());
  const types=[['school uniform','校服'],['sailor uniform','水手服'],['maid dress','女仆裙'],['pleated skirt','百褶裙'],['pencil skirt','包臀裙'],['sweater','毛衣'],['cardigan','开衫'],['hoodie','连帽衫'],['blouse','衬衫'],['shirt','衬衫'],['dress','连衣裙'],['skirt','裙子'],['jacket','夹克'],['coat','外套'],['jeans','牛仔裤'],['pants','长裤'],['shorts','短裤'],['bikini','比基尼'],['swimsuit','泳装'],['kimono','和服'],['yukata','浴衣'],['leotard','连体衣'],['armor','铠甲']];
  const colors=[['black','黑色'],['white','白色'],['blue','蓝色'],['red','红色'],['pink','粉色'],['purple','紫色'],['green','绿色'],['yellow','黄色'],['brown','棕色'],['gray','灰色'],['grey','灰色'],['beige','米色']];
  const parts=[];
  for(const tag of tags){
    if(/\b(hair|eyes|background)\b/.test(tag))continue;
    const type=types.find(([word])=>new RegExp('\\b'+word+'\\b').test(tag));if(!type)continue;
    const color=colors.find(([word])=>new RegExp('\\b'+word+'\\b').test(tag));
    const name=(color?.[1]||'')+type[1];if(!parts.includes(name))parts.push(name);
  }
  return parts.length?parts.slice(0,2).join('＋'):'未识别到服装';
}
export function civitGroups(model, version) {
  if (!model.id || !version.id || !Array.isArray(version.trainedWords)) throw new Error('元数据缺少模型、版本或 trainedWords。');
  return version.trainedWords.filter(x => typeof x === 'string' && x.trim()).map((raw,index) => ({ raw, name:summarizeCivitOutfit(raw,index), description:raw, activation:raw, appearance:'', source: { modelId:model.id, versionId:version.id, modelName:model.name, versionName:version.name, baseModel:version.baseModel, type:model.type, files:(version.files || []).map(f=>({name:f.name,hashes:f.hashes})), raw, url:`https://civitai.com/models/${model.id}?modelVersionId=${version.id}`, status:'仅导入资料，LoRA 未加载' } }));
}
export function importCivitGroups(settings, groups) {
  const w = library(settings); const added = [];
  for (const g of groups) {
    if (typeof g.name !== 'string' || !g.name.trim() || typeof g.description !== 'string' || !g.description.trim()) throw new Error('服装名称与服装描述不能为空。');
    if (!g.source?.modelId || !g.source?.versionId || g.source.raw !== g.raw) throw new Error('服装来源资料不完整。');
  }
  for (const g of groups) {
    if (!g.name.trim() || !g.description.trim()) throw new Error('服装名称与服装描述不能为空。');
    const duplicate = Object.values(w.outfits).find(o => o.civit?.modelId === g.source.modelId && o.civit?.versionId === g.source.versionId && o.civit?.raw === g.raw);
    if (duplicate) { added.push({key:duplicate.key,reused:true}); continue; }
    let key = g.name.trim(), i = 2; while (settings.outfitPresets?.[key]) key = `${g.name.trim()} ${i++}`;
    (settings.outfitPresets ||= {})[key] = { nameCN:g.name.trim(), nameEN:'', upperBody:g.description.trim(), loraTriggerWords:(g.activation||g.raw).trim(), fullBody:'', photoPrompt:g.description.trim(), photoImageIds:[], selectedPhotoIndex:0, sendPhoto:false };
    library(settings); const item = Object.values(w.outfits).find(o => o.key === key);
    item.civit = { ...g.source, activation:g.activation, appearance:g.appearance, description:g.description }; added.push({key,reused:false});
  }
  return added;
}

export function paginateItems(items, page=1, size=12) {
  size=[12,24,48].includes(Number(size))?Number(size):12;
  const pages=Math.max(1,Math.ceil(items.length/size));page=Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
  return {items:items.slice((page-1)*size,page*size),page,pages,total:items.length,size};
}
export function deletionImpact(settings,type,id) {
  const w=library(settings),r=w[type]?.[id];if(!r)throw Error('资料已删除，请刷新。');
  const combos=type==='outfits'?Object.values(w.combinations).filter(c=>c.outfitId===id):(r.combinationIds||[]).map(x=>w.combinations[x]).filter(Boolean);
  const roles=type==='outfits'?Object.values(w.roles).filter(r=>settings.characterPresets?.[r.key]&&r.combinationIds.some(x=>combos.some(c=>c.id===x))):[r];
  return {key:r.key,combinations:combos.length,roles:roles.map(r=>r.key)};
}
export function deleteLibraryItem(settings,type,id) {
  if(!['roles','outfits'].includes(type))throw Error('资料类型错误。');
  const w=library(settings),record=w[type][id],presets=type==='roles'?settings.characterPresets:settings.outfitPresets;
  if(!record||!presets?.[record.key])throw Error('资料已删除，请刷新。');
  const entry={id:newId(),type,record:structuredClone(record),preset:structuredClone(presets[record.key]),deletedAt:Date.now(),relations:[],lists:[]};
  if(type==='outfits'){
    entry.combinations=Object.values(w.combinations).filter(c=>c.outfitId===id).map(c=>structuredClone(c));
    for(const r of Object.values(w.roles)){
      const comboIds=(r.combinationIds||[]).filter(x=>entry.combinations.some(c=>c.id===x));if(!comboIds.length)continue;
      entry.relations.push({roleId:r.id,comboIds,defaultComboId:comboIds.includes(r.defaultComboId)?r.defaultComboId:null});
      for(const combo of comboIds)unbindCombination(settings,r.id,combo);
    }
    for(const c of entry.combinations)delete w.combinations[c.id];
    for(const p of Object.values(settings.characterPresets||{}))p.outfits=(p.outfits||[]).filter(x=>x!==record.key);
  }else{
    for(const state of Object.values(w.scenes)){delete state.roles?.[id];delete state.modes?.[id];}
  }
  const collections=type==='roles'?['characterEnablePresets','characterCommonPresets']:['outfitEnablePresets'],field=type==='roles'?'characters':'outfits';
  const entryName=x=>typeof x==='string'?x:(type==='roles'?x?.characterPresetName:x?.outfitPresetName);
  for(const collection of collections)for(const [listId,list]of Object.entries(settings[collection]||{})){
    const removed=(list[field]||[]).filter(x=>entryName(x)===record.key);
    if(removed.length)entry.lists.push({collection,listId,field,entries:structuredClone(removed)});
    list[field]=(list[field]||[]).filter(x=>entryName(x)!==record.key);
  }
  w.pending=w.pending.flatMap(p=>{
    if(p.kind==='wear'&&(type==='roles'?p.roleId===id:entry.combinations.some(c=>c.id===p.comboId)))return [];
    if(p.kind==='cover'){p.pairs=p.pairs.filter(pair=>type==='roles'?pair.roleId!==id:!entry.combinations.some(c=>c.id===pair.comboId));if(!p.pairs.length)return [];}
    return [p];
  });
  delete presets[record.key];delete w[type][id];
  const selection=type==='roles'?'characterPresetId':'outfitPresetId';if(settings[selection]===record.key)settings[selection]=Object.keys(presets)[0]||'';
  (w.trash ||= []).push(entry);return entry;
}
export function restoreLibraryItem(settings,trashId) {
  const w=library(settings),entry=w.trash?.find(x=>x.id===trashId);if(!entry)throw Error('回收记录已变化。');
  const presets=entry.type==='roles'?(settings.characterPresets ||= {}):(settings.outfitPresets ||= {}),r=entry.record;
  if(Object.hasOwn(presets,r.key)||w[entry.type][r.id])throw Error('同名资料已存在，请先为现有资料改名，再恢复。');
  if(entry.type==='outfits'&&entry.combinations.some(c=>w.combinations[c.id]))throw Error('组合 ID 冲突，未恢复或覆盖现有资料。');
  presets[r.key]=structuredClone(entry.preset);w[entry.type][r.id]=structuredClone(r);
  if(entry.type==='outfits'){
    for(const c of entry.combinations)w.combinations[c.id]=structuredClone(c);
    for(const link of entry.relations)if(settings.characterPresets?.[w.roles[link.roleId]?.key]){
      for(const c of link.comboIds)bindCombination(settings,link.roleId,c);
      if(link.defaultComboId&&!w.roles[link.roleId].defaultComboId)w.roles[link.roleId].defaultComboId=link.defaultComboId;
    }
  }else{
    const role=w.roles[r.id];role.combinationIds=(role.combinationIds||[]).filter(id=>w.combinations[id]&&settings.outfitPresets?.[w.outfits[w.combinations[id].outfitId]?.key]);
    presets[r.key].outfits=(presets[r.key].outfits||[]).filter(key=>settings.outfitPresets?.[key]);role.legacyOutfits=[...presets[r.key].outfits];
    if(!role.combinationIds.includes(role.defaultComboId))delete role.defaultComboId;
  }
  for(const link of entry.lists){const list=settings[link.collection]?.[link.listId];if(!list)continue;list[link.field]||=[];for(const item of link.entries){const key=x=>typeof x==='string'?x:x?.characterPresetName||x?.outfitPresetName;if(!list[link.field].some(x=>key(x)===key(item)))list[link.field].push(structuredClone(item));}}
  w.trash=w.trash.filter(x=>x.id!==trashId);library(settings);return r.id;
}

// Activation tags keep source spelling; merge only exact duplicate tags.
export function mergePromptTags(...parts){return [...new Set(parts.filter(Boolean).flatMap(p=>String(p).split(',')).map(x=>x.trim()).filter(Boolean))].join(', ');}

// The wardrobe and legacy editor share the current character enable preset.
export function enabledRoleLists(settings) {
  return [['启用', settings.characterEnablePresetId, settings.characterEnablePresets], ['通用', settings.characterCommonPresetId, settings.characterCommonPresets]].map(([kind,id,presets]) => ({
    kind, id: id || '', entries: [...new Set((presets?.[id]?.characters || []).map(entry => typeof entry === 'string' ? entry : entry?.characterPresetName).filter(Boolean))].map(key => ({key, role:settings.characterPresets?.[key] || null}))
  }));
}
export function setRoleEnabled(settings, key, enabled) {
  if (!settings.characterPresets?.[key]) throw Error('角色资料不存在，请重新选择。');
  let id = settings.characterEnablePresetId;
  const presets = settings.characterEnablePresets ||= {};
  if (!id || !presets[id]) {
    id = '衣橱启用列表';
    let suffix = 1; while (presets[id]) id = '衣橱启用列表 ' + suffix++;
    presets[id] = {characters:[],mediaSchemaVersion:2}; settings.characterEnablePresetId = id;
  }
  const list = presets[id].characters ||= [];
  const entryKey = entry => typeof entry === 'string' ? entry : entry?.characterPresetName;
  if (enabled && !list.some(entry => entryKey(entry) === key)) list.push({characterPresetName:key,imageFileId:null,audioFileId:null,imageDescription:'',audioDescription:''});
  if (!enabled) presets[id].characters = list.filter(entry => entryKey(entry) !== key);
  return id;
}
