// Identity decisions apply to one image only; this module never writes settings.
export function normalizeSopIdentity(value) {
  let text = String(value || '').normalize('NFKC').trim();
  const weighted = text.match(/^\(([^()]+?)(?::[-+]?(?:\d*\.)?\d+)?\)$/);
  if (weighted) text = weighted[1];
  return text.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function getSopIdentityCatalog(settings) {
  const active = settings.characterEnablePresets?.[settings.characterEnablePresetId]?.characters || [];
  const common = settings.characterCommonPresets?.[settings.characterCommonPresetId]?.characters || [];
  const keys = [...new Set([...active, ...common].map(entry => typeof entry === 'string' ? entry : entry?.characterPresetName).filter(Boolean))];
  return keys.filter(key => settings.characterPresets?.[key]).map(key => {
    const role = settings.characterPresets[key];
    return {key, name: String(role.nameCN || role.nameEN || key).split('|')[0], aliases: [...new Set([key, role.nameCN, role.nameEN, role.promptName].flatMap(value => String(value || '').split('|').map(name => name.trim()).filter(Boolean)))]};
  });
}
export function findAmbiguousCharacterTags(rawTag, settings) {
  const text = String(rawTag || ''), catalog = getSopIdentityCatalog(settings), conflicts = [];
  const examine = (name, start, end, reference = null, prefix = '') => {
    // A canonical preset key resolves a reference even if another role shares that alias.
    const candidates = reference && catalog.some(role => role.key === name) ? catalog.filter(role => role.key === name) : catalog.filter(role => role.aliases.some(alias => normalizeSopIdentity(alias) === normalizeSopIdentity(name)));
    if (candidates.length > 1) conflicts.push({name: name.trim(), start, end, reference, prefix, candidates});
  };
  const scan = (start, end) => {
    for (const token of text.slice(start, end).matchAll(/[^,\n;|]+/g)) {
      const prefix = token[0].match(/^\s*Character \d+ Prompt:\s*/i)?.[0] || '';
      examine(token[0].slice(prefix.length), start + token.index, start + token.index + token[0].length, null, prefix);
    }
  };
  let cursor = 0;
  for (const match of text.matchAll(/\$([^$]+)\$/g)) {
    scan(cursor, match.index);
    try { const ref = JSON.parse(match[1]); if (Object.hasOwn(ref, 'angle') && typeof ref.name === 'string') examine(ref.name, match.index, match.index + match[0].length, ref); } catch { /* Preserve malformed references for the generation validator. */ }
    cursor = match.index + match[0].length;
  }
  scan(cursor, text.length);
  return conflicts;
}
export function replaceSopIdentitySelections(rawTag, conflicts, selections) {
  let result = String(rawTag || '');
  for (const conflict of [...conflicts].sort((a, b) => b.start - a.start)) {
    const key = selections instanceof Map ? selections.get(conflict.start) : selections[conflict.start];
    if (!conflict.candidates.some(candidate => candidate.key === key)) throw Error(`请选择“${conflict.name}”对应的角色。`);
    const reference = conflict.reference ? {...conflict.reference, name: key} : {name: key, angle: /from behind/i.test(rawTag) ? 'from behind' : 'from front', upperBody: 'sfw', lowerBody: 'sfw'};
    result = result.slice(0, conflict.start) + conflict.prefix + '$' + JSON.stringify(reference) + '$' + result.slice(conflict.end);
  }
  return result;
}
function makeSopDialog(title) {
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'width:min(760px,90vw);max-height:85vh;overflow:auto;background:#1d1a2d;color:#eee;border:1px solid #68617c;border-radius:12px;padding:24px;z-index:2147483647';
  const heading = document.createElement('h3'); heading.textContent = title; dialog.append(heading);
  document.body.append(dialog); return dialog;
}
function sopButton(label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.style.cssText = 'padding:8px 14px;margin:10px 8px 0 0;cursor:pointer'; button.addEventListener('click', action); return button;
}
export async function resolveAmbiguousCharacterTags(rawTag, settings) {
  const conflicts = findAmbiguousCharacterTags(rawTag, settings);
  if (!conflicts.length) return String(rawTag || '');
  return new Promise((resolve, reject) => {
    const dialog = makeSopDialog('选择当前图片中的角色'), selections = new Map();
    const description = document.createElement('p'); description.textContent = '以下名称命中多个已启用角色。选择仅用于当前图片，不修改角色别名。'; dialog.append(description);
    for (const conflict of conflicts) {
      const label = document.createElement('label'); label.style.cssText = 'display:block;margin:16px 0'; label.append(document.createTextNode(conflict.name + '： '));
      const select = document.createElement('select'), empty = document.createElement('option'); empty.value = ''; empty.textContent = '请选择角色'; select.append(empty);
      for (const candidate of conflict.candidates) { const option = document.createElement('option'); option.value = candidate.key; option.textContent = `${candidate.name}（${candidate.key}） — ${candidate.aliases.join(' / ')}`; select.append(option); }
      select.addEventListener('change', () => selections.set(conflict.start, select.value)); label.append(select); dialog.append(label);
    }
    const error = document.createElement('p'); error.style.color = '#ffb5b5'; dialog.append(error);
    dialog.append(sopButton('确认角色', () => { try { const tag = replaceSopIdentitySelections(rawTag, conflicts, selections); resolve(tag); dialog.close(); } catch (reason) { error.textContent = reason.message; } }), sopButton('取消生成', () => dialog.close()));
    dialog.addEventListener('close', () => { dialog.remove(); const reason = new Error('已取消当前图片的角色选择。'); reason.name = 'AbortError'; reject(reason); }, {once: true});
    dialog.showModal();
  });
}
export function normalizeSopRegion(region = {}) {
  const clamp = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const width = clamp(region.width, .5, .05, 1), height = clamp(region.height, 1, .05, 1);
  return {x: clamp(region.x, 0, 0, 1 - width), y: clamp(region.y, 0, 0, 1 - height), width, height};
}
export async function openRegionPreview(plan) {
  const copy = JSON.parse(JSON.stringify(plan)), roles = copy.roles || copy.characters || [];
  if (!roles.length) throw Error('当前图片没有可调整的人物区域。');
  return new Promise(resolve => {
    const dialog = makeSopDialog('人物区域预览'), canvas = document.createElement('div');
    const dimensions = copy.dimensions || copy; canvas.style.cssText = `position:relative;width:100%;aspect-ratio:${Number(dimensions.width) || 512}/${Number(dimensions.height) || 768};max-height:45vh;border:1px solid #68617c;background:#101622;overflow:hidden`;
    dialog.append(canvas); let accepted = false;
    roles.forEach((role, index) => {
      const flatRegion = !role.region;
      role.region = normalizeSopRegion(role.region || {x: Number(role.x ?? .5) - Number(role.width ?? .5) / 2, y: Number(role.y ?? .5) - Number(role.height ?? 1) / 2, width: role.width, height: role.height}); const color = ['#81c8ff','#ffb7d6','#ffde91'][index % 3];
      const rectangle = document.createElement('div'); rectangle.style.cssText = `position:absolute;box-sizing:border-box;border:2px solid ${color};background:${color}22;color:${color};padding:4px;pointer-events:none`;
      rectangle.textContent = `${index + 1} · ${role.name || role.roleKey || role.characterKey || role.key || role.id || '未匹配人物'}`; canvas.append(rectangle);
      const draw = () => Object.assign(rectangle.style, {left: role.region.x * 100 + '%', top: role.region.y * 100 + '%', width: role.region.width * 100 + '%', height: role.region.height * 100 + '%'});
      const group = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = rectangle.textContent; group.append(legend); const inputs = {};
      for (const [field, labelText] of Object.entries({x:'横向位置',y:'纵向位置',width:'宽度',height:'高度'})) {
        const label = document.createElement('label'); label.style.cssText = 'display:inline-block;margin:8px'; label.append(document.createTextNode(labelText + ' '));
        const input = document.createElement('input'); input.type = 'number'; input.min = field === 'width' || field === 'height' ? '.05' : '0'; input.max = '1'; input.step = '.01'; input.value = role.region[field]; input.style.width = '70px'; inputs[field] = input;
        input.addEventListener('change', () => { role.region = normalizeSopRegion(Object.fromEntries(Object.entries(inputs).map(([key, item]) => [key, item.value]))); for (const [key,item] of Object.entries(inputs)) item.value = role.region[key]; draw(); });
        label.append(input); group.append(label);
      }
      if (flatRegion) role.__sopFlatRegion = true;
      dialog.append(group); draw();
    });
    dialog.append(sopButton('应用区域', () => { accepted = true; dialog.close(); }), sopButton('取消', () => dialog.close()));
    dialog.addEventListener('close', () => {
      dialog.remove();
      for (const role of roles) if (role.__sopFlatRegion) {
        Object.assign(role, {x: role.region.x + role.region.width / 2, y: role.region.y + role.region.height / 2, width: role.region.width, height: role.region.height});
        delete role.region; delete role.__sopFlatRegion;
      }
      resolve(accepted ? copy : null);
    }, {once:true}); dialog.showModal();
  });
}
