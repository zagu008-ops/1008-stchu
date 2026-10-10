export function mountComfyAddressHistory(input, getSettings, save) {
  if (!input || input.parentElement.parentElement.querySelector('.comfy-address-history')) return;
  const row=document.createElement('div');row.className='comfy-address-history';input.parentElement.parentElement.classList.add('comfy-address-field');
  const select=document.createElement('select');select.className='st-chatu8-select';select.setAttribute('aria-label','已保存的 ComfyUI 地址');
  const note=document.createElement('small');note.className='comfy-address-status';note.setAttribute('role','status');
  const makeButton=text=>{const b=document.createElement('button');b.type='button';b.className='st-chatu8-btn';b.textContent=text;return b;};
  const add=makeButton('保存当前地址'),remove=makeButton('删除所选地址');
  const normalize=value=>{const url=new URL(value.trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('请输入有效的 HTTP / HTTPS 地址。');return url.href.replace(/\/+$/,'');};
  const render=selected=>{select.replaceChildren(new Option('选择已保存地址',''));for(const url of getSettings().comfyuiAddressHistory||[])select.add(new Option(url,url));select.value=selected||'';remove.disabled=!select.value;};
  select.onchange=()=>{remove.disabled=!select.value;if(!select.value)return;input.value=select.value;getSettings().comfyuiUrl=select.value;save();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));note.textContent='已切换地址，点击“连接刷新数据”连接。';};
  add.onclick=()=>{try{const url=normalize(input.value),config=getSettings();config.comfyuiAddressHistory=[...new Set([...(config.comfyuiAddressHistory||[]),url])];save();render(url);note.textContent='地址已保存。';}catch(e){note.textContent=e.message;}};
  remove.onclick=()=>{const url=select.value;if(!url)return;const config=getSettings();config.comfyuiAddressHistory=(config.comfyuiAddressHistory||[]).filter(x=>x!==url);save();render();note.textContent='已删除历史地址，当前连接地址保留。';};
  const label=document.createElement('label');label.textContent='历史地址';select.id='ch-comfy-address-history';label.htmlFor=select.id;
  const actions=document.createElement('div');actions.className='comfy-address-actions';actions.append(add,remove);
  row.append(label,select,actions,note);input.parentElement.parentElement.append(row);render();
}
