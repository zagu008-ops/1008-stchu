import { normalizeLoraBinding } from './character-lora.js';
export function mountCharacterLoraEditor(parent, role, getLoras) {
  const group = document.createElement('fieldset'); group.className = 'wardrobe-lora-editor';
  const title = document.createElement('legend'); title.textContent = '角色 LoRA 绑定'; group.append(title);
  const note = document.createElement('p'); note.textContent = '匹配到这个角色时自动加载。文件名来自 ComfyUI；触发词与姓名别名分开保存。权重可设为 0，取消启用可暂时关闭绑定。'; group.append(note);
  const rows = [], datalist = document.createElement('datalist'); datalist.id = 'role-loras-' + Math.random().toString(36).slice(2); group.append(datalist);
  let available = [];
  const input = (row, label, value, type='text') => { const wrap=document.createElement('label'); wrap.className='wardrobe-field'; const span=document.createElement('span');span.textContent=label;const field=document.createElement('input');field.type=type;field.value=value;wrap.append(span,field);row.append(wrap);return field; };
  function add(binding={file:'',modelWeight:1,clipWeight:1,triggerWords:'',enabled:true}) {
    const row=document.createElement('div'); group.append(row);
    const enabled=input(row,'启用此 LoRA','', 'checkbox');enabled.checked=binding.enabled!==false;
    const file=input(row,'ComfyUI LoRA 文件（从列表选择，可输入子目录文件名）',binding.file);file.setAttribute('list',datalist.id);
    const model=input(row,'模型权重',binding.modelWeight ?? 1,'number'),clip=input(row,'CLIP 权重',binding.clipWeight ?? 1,'number');for(const n of [model,clip]){n.min='-2';n.max='2';n.step='0.05';}
    const trigger=input(row,'激活词 / 触发词',binding.triggerWords||'');
    const record={row,enabled,file,model,clip,trigger}; rows.push(record);
    const remove=document.createElement('button');remove.type='button';remove.className='menu_button';remove.textContent='移除此绑定';remove.onclick=()=>{rows.splice(rows.indexOf(record),1);row.remove();};row.append(remove);
  }
  for(const binding of role.loraBindings || []) add(binding);
  const addButton=document.createElement('button');addButton.type='button';addButton.className='menu_button';addButton.textContent='添加 LoRA 绑定';addButton.onclick=()=>add();group.append(addButton);
  const status=document.createElement('p');group.append(status);
  const refresh=document.createElement('button');refresh.type='button';refresh.className='menu_button';refresh.textContent='读取 ComfyUI LoRA 列表';
  refresh.onclick=async()=>{refresh.disabled=true;try{available=(await getLoras?.() || []).map(x=>typeof x==='string'?x:x.value||x.name).filter(Boolean);datalist.replaceChildren();for(const name of available){const option=document.createElement('option');option.value=name;datalist.append(option);}status.textContent=available.length?`已读取 ${available.length} 个文件。`:'暂无文件列表，请先在 ComfyUI 设置中连接并刷新模型列表。';}catch(e){status.textContent=e.message;}finally{refresh.disabled=false;}};group.append(refresh);parent.append(group);refresh.click();
  return {read(){const result=rows.map(r=>normalizeLoraBinding({file:r.file.value,modelWeight:r.model.value,clipWeight:r.clip.value,triggerWords:r.trigger.value,enabled:r.enabled.checked}));const seen=new Set();for(const binding of result){if(available.length&&!available.includes(binding.file)&&!available.includes(binding.file.replace(/\//g,'\\')))throw Error(`ComfyUI 列表中找不到 ${binding.file}，请刷新列表或检查文件名。`);if(seen.has(binding.file.toLowerCase()))throw Error('同一个角色不能重复绑定同一个 LoRA。');seen.add(binding.file.toLowerCase());}return result;}};
}
