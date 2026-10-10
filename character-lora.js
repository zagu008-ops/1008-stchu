export function comfyAddressKey(value) {
  try { const url=new URL(String(value||'').trim()); return url.href.replace(/\/+$/, ''); } catch { return String(value||'').trim().replace(/\/+$/, ''); }
}
export function migrateAddressLoras(settings) {
  const key=comfyAddressKey(settings.comfyuiUrl);
  if(!key)return;
  for(const role of Object.values(settings.characterPresets||{})) {
    if(!role.loraBindingsByAddress) {
      role.loraBindingsByAddress={[key]:(role.loraBindings||[]).map(x=>({...x}))};
      role.loraBindings=[];
    }
  }
}
export function addressLoras(role, address) {
  return role.loraBindingsByAddress ? role.loraBindingsByAddress[comfyAddressKey(address)]||[] : role.loraBindings||[];
}
// Character identity resolution and LoRA transport; no LLM or network calls.
const normal = value => {
  let text = String(value || '').normalize('NFKC').trim();
  const weighted = text.match(/^\(([^()]+?)(?::[-+]?(?:\d*\.)?\d+)?\)$/);
  if (weighted) text = weighted[1];
  return text.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
};
const aliases = (key, role) => [...new Set([key, ...[role.nameCN, role.nameEN, role.promptName].flatMap(x => String(x || '').split('|'))].filter(x => x.trim()))];
const entryKey = entry => typeof entry === 'string' ? entry : entry?.characterPresetName;
export function normalizeLoraBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw Error('LoRA 绑定格式错误。');
  const file = String(binding.file || '').trim().replace(/\\/g, '/');
  if (!file || file.startsWith('/') || /[:<>\r\n]/.test(file) || file.split('/').some(x => !x || x === '..' || x === '.') || !/\.safetensors$/i.test(file)) throw Error('请选择 ComfyUI 列表中的 .safetensors 文件（支持子目录）。');
  const weight = value => { const number = Number(value ?? 1); if (value === '' || !Number.isFinite(number) || number < -2 || number > 2) throw Error('LoRA 权重必须是 -2 到 2 的数字。'); return number; };
  return {file, modelWeight: weight(binding.modelWeight), clipWeight: weight(binding.clipWeight), triggerWords: String(binding.triggerWords || '').trim(), enabled: binding.enabled !== false};
}
function catalog(settings) {
  const presets = settings.characterPresets || {};
  const groups = [settings.characterEnablePresets?.[settings.characterEnablePresetId]?.characters, settings.characterCommonPresets?.[settings.characterCommonPresetId]?.characters];
  const keys = [...new Set(groups.flatMap(x => x || []).map(entryKey).filter(Boolean))];
  return keys.filter(key => presets[key]).map(key => ({key, role: presets[key], names: aliases(key, presets[key])}));
}
function lookup(name, roles) {
  const hits = roles.filter(item => item.names.some(alias => normal(alias) === normal(name)));
  return hits.length === 1 ? hits[0] : null;
}
function bodyMentions(body, roles) {
  // Generated tags and thinking are not evidence of a character in the prose.
  const text = normal(String(body || '').replace(/image###[\s\S]*?###/g, '').replace(/<think>[\s\S]*?<\/think>/gi, ''));
  return roles.filter(item => item.names.some(alias => {
    const name = normal(alias), escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return /[\u3400-\u9fff]/.test(name) ? text.includes(name) : new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
  }));
}
const appearance = /^(?:(?:(?:black|brown|blonde|blond|white|silver|grey|gray|red|blue|green|pink|purple|orange|yellow|aqua|cyan|teal|platinum|multicolored|two tone|long|short|medium|straight|wavy|curly|messy|silky|flowing)(?:\s+|$))+hair|(?:black|brown|blue|green|red|grey|gray|purple|yellow|pink|orange|amber|aqua|cyan|teal|violet|silver|golden)\s+eyes|bangs|blunt bangs|side swept bangs|sidelocks|ponytail|high ponytail|side ponytail|twin tails|twintails|braid|hime cut|(?:small|medium|large|huge) breasts|slender|muscular|tall|short stature)$/i;
export function isCharacterAppearanceTag(token) { return appearance.test(normal(token)); }
export function hasOutsideCharacterAppearance(tag) {
  return String(tag || '').replace(/\$[^$]+\$/g, '').split(/[,;\n|]/).some(token => isCharacterAppearanceTag(token.replace(/^\s*Character \d+ Prompt:\s*/i, '')));
}
function cleanAppearance(text) {
  const protectedReferences = [];
  const masked = text.replace(/\$[^$]+\$/g, value => `@@ROLE${protectedReferences.push(value)-1}@@`);
  return masked.split(',').filter(token => !appearance.test(normal(token))).join(',').replace(/@@ROLE(\d+)@@/g, (_, index) => protectedReferences[Number(index)]);
}
export function prepareCharacterTags(tag, settings, body = '', {activeOnly=false} = {}) {
  const roles = catalog(settings), matched = new Map();
  let text = String(tag || '');
  // Other backends retain legacy references; SOP generation restricts identity to the enabled catalog.
  const all = activeOnly ? roles : Object.entries(settings.characterPresets || {}).map(([key, role]) => ({key, role, names: aliases(key, role)}));
  if(activeOnly) text=text.replace(/\$([^$]+)\$/g,(ref,content)=>{try{const value=JSON.parse(content);if(Object.hasOwn(value,'angle')&&!all.some(item=>item.names.some(alias=>normal(alias)===normal(value.name)))) return String(value.name||'original character');}catch{const legacy=content.match(/^(.*?)-(?:sfw|nsfw)-(?:upperbody|lowerbody)(?:-|$)/i);if(legacy&&!all.some(item=>item.names.some(alias=>normal(alias)===normal(legacy[1]))))return legacy[1];}return ref;});
  text.replace(/\$([^$]+)\$/g, (_, content) => {
    let name;
    try { const ref = JSON.parse(content); if (Object.hasOwn(ref, 'angle')) name = ref.name; } catch { if (/-(?:sfw|nsfw)-(?:upperbody|lowerbody)/i.test(content)) name = content.replace(/-(?:sfw|nsfw)-(?:upperbody|lowerbody)[\s\S]*$/i, ''); }
    const item = name && (all.find(item => item.key === name) || lookup(name, all)); if (item) matched.set(item.key, item);
    return _;
  });
  const reference = item => '$' + JSON.stringify({name:item.key, angle:/from behind/i.test(text)?'from behind':'from front', upperBody:'sfw', lowerBody:'sfw'}) + '$';
  // Match whole comma-delimited tags; never replace name fragments inside action tags.
  const protectedTags = [];
  text = text.replace(/\$[^$]+\$/g, value => `@@REF${protectedTags.push(value)-1}@@`).replace(/[^,\n;|]+/g, token => {
    if (token.includes('@@REF')) return token;
    const prefix = token.match(/^\s*Character \d+ Prompt:\s*/i)?.[0] || '';
    const item = lookup(token.slice(prefix.length).trim(), roles); if (!item) return token;
    matched.set(item.key, item); return prefix + reference(item);
  }).replace(/@@REF(\d+)@@/g, (_, index) => protectedTags[Number(index)]);
  if (text.includes('Scene Composition')) text = text.replace(/(Character \d+ Prompt:\s*)([^;]*)(;|$)/gi, (block, prefix, value, end) => value.includes('$') ? prefix + cleanAppearance(value) + end : block);
  if (!matched.size && /\b(?:1girl|1boy|solo)\b/i.test(text) && !/\b(?:[2-9]\d*girls?|[2-9]\d*boys?|1girl.*1boy|1boy.*1girl)\b/i.test(text) && !text.includes('Scene Composition')) {
    const mentions = bodyMentions(body, roles);
    if (mentions.length === 1) { matched.set(mentions[0].key, mentions[0]); text = reference(mentions[0]) + ', ' + text; }
  }
  const counts = [...text.matchAll(/\b(\d+)\s*(girls?|boys?|people|persons?)\b/gi)];
  const countFor = kind => Math.max(0,...counts.filter(x=>kind.test(x[2])).map(x=>Number(x[1])));
  const people = Math.max(countFor(/^girl/)+countFor(/^boy/),countFor(/^(people|person)/));
  if (!text.includes('Scene Composition') && matched.size && (people ? matched.size >= people : matched.size === 1)) text = cleanAppearance(text);
  const bindings = new Map();
  for (const {role} of matched.values()) for (const raw of addressLoras(role, settings.comfyuiUrl)) {
    const binding = normalizeLoraBinding(raw); if (!binding.enabled) continue;
    const key = binding.file.toLowerCase(), previous = bindings.get(key);
    if (previous && (previous.modelWeight !== binding.modelWeight || previous.clipWeight !== binding.clipWeight)) throw Error(`角色绑定的同一 LoRA 权重冲突：${binding.file}`);
    if (previous) previous.triggerWords = [...new Set([previous.triggerWords, binding.triggerWords].filter(Boolean))].join(', '); else bindings.set(key, binding);
  }
  return {tag:text, characters:[...matched.keys()], bindings:[...bindings.values()]};
}
export function appendCharacterLoras(prompt, bindings) {
  let text = String(prompt || '');
  for (const binding of bindings) {
    const basename = binding.file.replace(/\.safetensors$/i, '').toLowerCase();
    text = text.replace(/<(?:lora|wlr):([^:>]+):[^>]+>/gi, (tag, file) => file.replace(/\.safetensors$/i, '').toLowerCase() === basename ? '' : tag);
    text += `, <lora:${binding.file}:${binding.modelWeight}:${binding.clipWeight}>`;
    const existing = new Set(text.split(',').map(normal));
    for (const word of binding.triggerWords.split(',').map(x=>x.trim()).filter(Boolean)) if (!existing.has(normal(word))) { text += ', ' + word; existing.add(normal(word)); }
  }
  return text.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').trim();
}
export function applyCharacterLorasToWorkflow(workflow, bindings) {
  if (!bindings.length) return workflow;
  const nodes = Object.entries(workflow);
  const automatic = nodes.filter(([,node]) => ['WeiLinPromptUI','WeiLinComfyUIPromptToLorasOnly'].includes(node.class_type));
  if (automatic.length) {
    if (!automatic.some(([id,node]) => (node.inputs?.opt_model || node.inputs?.model) && nodes.some(([,consumer])=>Object.values(consumer.inputs || {}).some(value=>Array.isArray(value)&&String(value[0])===id&&value[1]===(node.class_type==='WeiLinPromptUI'?3:0))))) throw Error('LoRA 自动加载节点的模型输出未接入工作流。');
    return workflow;
  }
  const loaders = nodes.filter(([,node]) => node.class_type === 'CheckpointLoaderSimple');
  if (loaders.length !== 1) throw Error('角色 LoRA 需要 WeiLin 自动加载节点，或单 CheckpointLoaderSimple 工作流。');
  const [source] = loaders[0]; let model = [source,0], clip = [source,1];
  const pending = bindings.filter(binding => {
    const existing = nodes.filter(([,node])=>node.class_type==='LoraLoader'&&String(node.inputs?.lora_name).replace(/\\/g,'/').toLowerCase()===binding.file.toLowerCase());
    if (!existing.length) return true;
    if (existing.length !== 1 || Number(existing[0][1].inputs.strength_model)!==binding.modelWeight || Number(existing[0][1].inputs.strength_clip)!==binding.clipWeight) throw Error(`工作流已有 LoRA 与角色绑定权重冲突：${binding.file}`);
    const id=existing[0][0];
    if (!nodes.some(([,node])=>Object.values(node.inputs||{}).some(value=>Array.isArray(value)&&String(value[0])===id))) throw Error(`工作流已有 LoRA 未连接：${binding.file}`);
    return false;
  });
  for (const binding of pending) {
    let id = String(Math.max(0,...Object.keys(workflow).map(Number).filter(Number.isFinite))+1); while (workflow[id]) id = String(Number(id)+1);
    workflow[id] = {class_type:'LoraLoader', inputs:{model,clip,lora_name:binding.file,strength_model:binding.modelWeight,strength_clip:binding.clipWeight}, _meta:{title:'角色绑定 LoRA'}};
    model = [id,0]; clip = [id,1];
  }
  for (const [id,node] of nodes) for (const [key,value] of Object.entries(node.inputs || {})) {
    if (Array.isArray(value) && String(value[0]) === source && value[1] === 0) node.inputs[key] = model;
    if (Array.isArray(value) && String(value[0]) === source && value[1] === 1) node.inputs[key] = clip;
    if (typeof value === 'string' && (key === 'text' || key === 'positive')) node.inputs[key] = value.replace(/<(?:lora|wlr):([^:>]+):[^>]+>/gi, (tag,file) => bindings.some(b=>b.file.replace(/\.safetensors$/i,'').toLowerCase()===file.replace(/\.safetensors$/i,'').toLowerCase())?'':tag);
  }
  return workflow;
}
