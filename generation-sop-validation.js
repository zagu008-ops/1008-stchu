// Read-only preflight validation for a resolved generation plan.
const normalized = value => String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const stem = value => normalized(value).replace(/\.(?:safetensors|ckpt|pt|bin)$/i, '');
function fail(code, message, details) {
  const error = new Error(message); error.code = code; error.details = details; throw error;
}
function taggedFiles(prompt) {
  return [...String(prompt || '').matchAll(/<(?:lora|wlr):([^:>]+)(?::[^>]*)?>/gi)].map(match => match[1].trim());
}
function resolveFile(requested, files, owner) {
  const target = normalized(requested), targetStem = stem(requested);
  let matches = files.filter(file => normalized(file) === target);
  if (!matches.length) matches = files.filter(file => stem(file) === targetStem);
  // A specified subdirectory must remain part of the match. A bare name may
  // resolve inside any subdirectory, only when the result is unambiguous.
  if (!matches.length) matches = files.filter(file => stem(file).endsWith('/' + targetStem));
  if (matches.length > 1) fail('LORA_FILE_AMBIGUOUS', `${owner}的 LoRA 文件“${requested}”匹配多个文件，请填写完整子目录：${matches.join('、')}`, {owner,requested,matches});
  if (!matches.length) fail('LORA_FILE_MISSING', `${owner}的 LoRA 文件“${requested}”不在当前 ComfyUI 服务中，请修正绑定或提示词。`, {owner,requested});
  return matches[0];
}
export function validateSopLoraFiles(plan, availableFiles) {
  const requested = [];
  const add = (file,owner) => { if (file) requested.push({file:String(file).trim(),owner}); };
  for (const character of plan.characters || []) {
    const owner = `角色“${character.name || character.roleKey || ('人物 ' + character.id)}”`;
    for (const binding of character.bindings || []) if (binding.enabled !== false) add(binding.file,owner);
    for (const file of taggedFiles(character.prompt)) add(file,owner);
    for (const file of taggedFiles(character.negative)) add(file,owner);
  }
  // Top-level bindings normally duplicate character bindings. Still validate
  // orphan entries to cover plans imported from older snapshots.
  for (const binding of plan.bindings || []) if (binding.enabled !== false && !requested.some(item => normalized(item.file) === normalized(binding.file))) add(binding.file,'生成配置');
  for (const file of taggedFiles(plan.scenePrompt)) add(file,'公共画面预设');
  for (const file of taggedFiles(plan.sceneNegative)) add(file,'公共画面负面预设');
  if (!requested.length) return [];
  if (!Array.isArray(availableFiles)) fail('LORA_CATALOG_UNAVAILABLE','无法读取当前 ComfyUI LoRA 文件列表，请连接刷新后重试。');
  const files = [...new Set(availableFiles.map(file => typeof file === 'string' ? file : file?.value || file?.name).filter(Boolean))];
  const seen = new Set(), result = [];
  for (const entry of requested) {
    const key = entry.owner + '\0' + normalized(entry.file); if (seen.has(key)) continue; seen.add(key);
    result.push({owner:entry.owner,requested:entry.file,file:resolveFile(entry.file,files,entry.owner)});
  }
  return result;
}
export function validateSopWorkflowNodes(workflow, objectInfo) {
  let nodes = workflow;
  if (typeof nodes === 'string') {
    try { nodes = JSON.parse(nodes); } catch { fail('WORKFLOW_INVALID','ComfyUI 工作流 JSON 无效。'); }
  }
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) fail('WORKFLOW_INVALID','ComfyUI 工作流必须是 API 节点对象。');
  if (!objectInfo || typeof objectInfo !== 'object' || Array.isArray(objectInfo)) fail('NODE_CATALOG_UNAVAILABLE','无法读取当前 ComfyUI 节点列表，请连接刷新后重试。');
  const missing = [];
  for (const [id,node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object' || typeof node.class_type !== 'string' || !node.class_type) fail('WORKFLOW_INVALID',`工作流节点 ${id} 缺少 class_type，请使用 ComfyUI API 格式导出。`);
    if (!Object.hasOwn(objectInfo,node.class_type)) missing.push({id,classType:node.class_type});
  }
  if (missing.length) fail('WORKFLOW_NODE_MISSING','当前 ComfyUI 缺少工作流节点：'+missing.map(node=>`#${node.id} ${node.classType}`).join('、')+'。请安装对应节点或更换工作流。',{missing});
  return true;
}

// Convert both saved and inline LoRA declarations into native LoraLoader data.
// WeiLin block/extra parameters cannot be preserved by a native loader.
export function resolveSopLoraBindings(plan, availableFiles) {
  const resolved = validateSopLoraFiles(plan,availableFiles), bindings = new Map();
  const actual = requested => resolved.find(item=>normalized(item.requested)===normalized(requested))?.file;
  const add = (binding,owner) => {
    const file=actual(binding.file); if (!file) return;
    const weight=value=>{const number=Number(value ?? 1);if(value===''||!Number.isFinite(number)||number < -2 || number > 2)fail('LORA_WEIGHT_INVALID',`${owner}的 LoRA“${binding.file}”权重必须是 -2 到 2 的数字。`);return number;};
    const next={file,modelWeight:weight(binding.modelWeight),clipWeight:weight(binding.clipWeight ?? binding.modelWeight),triggerWords:String(binding.triggerWords||''),enabled:true},key=normalized(file),previous=bindings.get(key);
    if(previous&&(previous.modelWeight!==next.modelWeight||previous.clipWeight!==next.clipWeight)) fail('LORA_CONFLICT',`${owner}的 LoRA“${file}”与另一处配置权重冲突，请统一权重。`,{owner,file});
    if(previous){previous.triggerWords=[...new Set([previous.triggerWords,next.triggerWords].filter(Boolean))].join(', ');}
    else bindings.set(key,next);
  };
  const tags=(prompt,owner)=>{
    for(const match of String(prompt||'').matchAll(/<(?:lora|wlr):([^:>]+)(?::([^>]*))?>/gi)) {
      const values=match[2]===undefined?[]:match[2].split(':');
      if(values.length>2)fail('LORA_PARAMETERS_UNSUPPORTED',`${owner}的 LoRA“${match[1]}”包含额外参数，标准 LoRA 工作流不能应用，请改用支持这些参数的工作流。`);
      add({file:match[1],modelWeight:values[0]??1,clipWeight:values[1]??values[0]??1},owner);
    }
  };
  for(const character of plan.characters||[]) {
    const owner=`角色“${character.name||character.roleKey||('人物 '+character.id)}”`;
    for(const binding of character.bindings||[])if(binding.enabled!==false)add(binding,owner);
    tags(character.prompt,owner);tags(character.negative,owner);
  }
  for(const binding of plan.bindings||[])if(binding.enabled!==false)add(binding,'生成配置');
  tags(plan.scenePrompt,'公共画面预设');tags(plan.sceneNegative,'公共画面负面预设');
  return [...bindings.values()];
}
