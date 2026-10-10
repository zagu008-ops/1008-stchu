import { normalizeLoraBinding, comfyAddressKey, addressLoras } from './character-lora.js';
export function openComfyConnectionSettings(parent) {
  const link = document.querySelector('.st-chatu8-nav-link[data-tab="comfyui"]');
  const target = document.getElementById('comfyuiUrl');
  if (!link || !target) throw Error('ComfyUI 设置尚未加载，请先打开插件设置。');
  const dialog = parent.closest('dialog');
  const previousLink = document.querySelector('.st-chatu8-nav-link.active');
  return new Promise(resolve => {
    // Temporarily leave the modal without discarding its unsaved fields.
    if (dialog?.open) {
      dialog.addEventListener('close', event => event.stopImmediatePropagation(), {once:true, capture:true});
      dialog.close();
    }
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'menu_button';
    back.textContent = '返回角色 LoRA 绑定';
    back.onclick = () => {
      back.remove(); previousLink?.click();
      if (dialog?.isConnected) dialog.showModal();
      resolve();
    };
    target.closest('.st-chatu8-settings-section').prepend(back);
    link.click();
    target.scrollIntoView({block:'center'});
    target.focus({preventScroll:true});
  });
}
export function mountCharacterLoraEditor(parent, role, getLoras, getAddress=()=> '') {
  const group = document.createElement('fieldset'); group.className = 'wardrobe-lora-editor';
  const title = document.createElement('legend'); title.textContent = '角色 LoRA 绑定'; group.append(title);
  const note = document.createElement('p'); note.textContent = '匹配到这个角色时自动加载。文件名来自 ComfyUI；触发词与姓名别名分开保存。权重可设为 0，取消启用可暂时关闭绑定。'; group.append(note);
  let address=comfyAddressKey(getAddress());
  const byAddress=structuredClone(role.loraBindingsByAddress||{[address]:role.loraBindings||[]});
  const addressNote=document.createElement('p');group.append(addressNote);
  const rows = [], datalist = document.createElement('datalist'); datalist.id = 'role-loras-' + Math.random().toString(36).slice(2); group.append(datalist);
  let available = [];
  const input = (row, label, value, type='text') => { const wrap=document.createElement('label'); wrap.className='wardrobe-field'; const span=document.createElement('span');span.textContent=label;const field=document.createElement('input');field.type=type;field.value=value;wrap.append(span,field);row.append(wrap);return field; };
  function updateFileOptions(record) {
    const value=record.file.value || record.savedFile || '';
    record.file.replaceChildren(new Option(available.length?'请选择 LoRA 文件':'请先读取 ComfyUI LoRA 列表',''));
    for(const name of available) record.file.add(new Option(name,name));
    if(value && !available.includes(value)) {const missing=new Option(value+'（当前列表未找到）',value);missing.disabled=true;record.file.add(missing);}
    record.file.value=value;record.file.disabled=!available.length;
  }
  function add(binding={file:'',modelWeight:1,clipWeight:1,triggerWords:'',enabled:true}) {
    const row=document.createElement('div'); group.append(row);
    const enabled=input(row,'启用此 LoRA','', 'checkbox');enabled.checked=binding.enabled!==false;enabled.parentElement.classList.add('wardrobe-lora-enabled');enabled.parentElement.prepend(enabled);
    const wrap=document.createElement('label');wrap.className='wardrobe-field';const label=document.createElement('span');label.textContent='ComfyUI LoRA 文件（从读取列表选择）';const file=document.createElement('select');file.className='st-chatu8-select';file.setAttribute('aria-label','ComfyUI LoRA 文件');wrap.append(label,file);row.append(wrap);
    const model=input(row,'模型权重',binding.modelWeight ?? 1,'number'),clip=input(row,'CLIP 权重',binding.clipWeight ?? 1,'number');for(const n of [model,clip]){n.min='-2';n.max='2';n.step='0.05';}
    const trigger=input(row,'激活词 / 触发词',binding.triggerWords||'');
    const record={row,enabled,file,model,clip,trigger,savedFile:binding.file}; rows.push(record);updateFileOptions(record);file.onchange=()=>{record.savedFile=file.value;};
    const remove=document.createElement('button');remove.type='button';remove.className='menu_button';remove.textContent='移除此绑定';remove.onclick=()=>{rows.splice(rows.indexOf(record),1);row.remove();};row.append(remove);
  }
  for(const binding of byAddress[address] || []) add(binding);
  addressNote.textContent='绑定地址：'+(address||'未配置');
  const addButton=document.createElement('button');addButton.type='button';addButton.className='menu_button';addButton.textContent='添加 LoRA 绑定';addButton.onclick=()=>add();group.append(addButton);
  const status=document.createElement('p');group.append(status);
  const refresh=document.createElement('button');refresh.type='button';refresh.className='menu_button';refresh.textContent='读取 ComfyUI LoRA 列表';
  refresh.onclick=async()=>{refresh.disabled=true;const nextAddress=comfyAddressKey(getAddress());if(nextAddress!==address){byAddress[address]=readRows();for(const record of rows)record.row.remove();rows.length=0;available=[];address=nextAddress;for(const binding of byAddress[address]||[])add(binding);addressNote.textContent='绑定地址：'+(address||'未配置');}status.textContent='正在读取 ComfyUI LoRA 列表…';try{available=(await getLoras?.() || []).map(x=>typeof x==='string'?x:x.value||x.name).filter(Boolean);datalist.replaceChildren();for(const name of available){const option=document.createElement('option');option.value=name;datalist.append(option);}for(const record of rows)updateFileOptions(record);status.textContent=available.length?`已读取 ${available.length} 个文件。`:'ComfyUI 未返回 LoRA 文件，请检查 models/loras 目录和 LoRA 加载节点。';}catch(e){status.textContent=e.message;}finally{refresh.disabled=false;}};group.append(refresh);parent.append(group);refresh.click();
  const connect=document.createElement('button');connect.type='button';connect.className='menu_button';connect.textContent='前往 ComfyUI 连接设置';
  connect.onclick=async()=>{connect.disabled=true;try{await openComfyConnectionSettings(parent);refresh.click();}catch(e){status.textContent=e.message;}finally{connect.disabled=false;}};
  group.append(connect);
  function readRows(){const result=rows.filter(r=>r.file.value).map(r=>normalizeLoraBinding({file:r.file.value,modelWeight:r.model.value,clipWeight:r.clip.value,triggerWords:r.trigger.value,enabled:r.enabled.checked}));const seen=new Set();for(const binding of result){if(available.length&&!available.includes(binding.file)&&!available.includes(binding.file.replace(/\//g,'\\')))throw Error(`ComfyUI 列表中找不到 ${binding.file}，请刷新列表或检查文件名。`);if(seen.has(binding.file.toLowerCase()))throw Error('同一个角色不能重复绑定同一个 LoRA。');seen.add(binding.file.toLowerCase());}return result;}
  return {read:readRows,readByAddress(){byAddress[address]=readRows();return byAddress;}};
}
