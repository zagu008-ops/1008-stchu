// Public Wiki names are suggestions. No role-card/body text or API credentials leave the browser.
export async function searchWikiNames(query,{signal,fetchImpl=fetch}={}) {
  query=String(query||'').trim();if(!query)throw Error('请先填写角色名称。');
  async function api(params){const url=new URL('https://www.wikidata.org/w/api.php');url.search=new URLSearchParams({format:'json',origin:'*',...params});const response=await fetchImpl(url.href,{signal,credentials:'omit'});if(!response.ok)throw Error('Wiki 查询失败：HTTP '+response.status);const data=await response.json();if(data.error)throw Error('Wiki 查询失败。');return data;}
  const search=await api({action:'wbsearchentities',search:query,language:/[\u3400-\u9fff]/.test(query)?'zh':'en',uselang:'zh',type:'item',limit:'8'});
  const ids=(search.search||[]).map(x=>x.id).filter(id=>/^Q\d+$/.test(id));if(!ids.length)return [];
  const data=await api({action:'wbgetentities',ids:ids.join('|'),props:'labels|aliases|descriptions|sitelinks',languages:'zh|zh-hans|zh-hant|en|ja',sitefilter:'enwiki|zhwiki|jawiki'});
  return ids.flatMap(id=>{const entity=data.entities?.[id];if(!entity||entity.missing!==undefined)return [];
    const label=lang=>entity.labels?.[lang]?.value||'',english=[label('en'),...(entity.aliases?.en||[]).map(x=>x.value)].filter(x=>typeof x==='string'&&x.trim()&&!/[\u3400-\u9fff\u3040-\u30ff]/.test(x));
    const aliases=[...new Set(['zh','zh-hans','zh-hant','en','ja'].flatMap(lang=>[label(lang),...(entity.aliases?.[lang]||[]).map(x=>x.value)]).filter(x=>typeof x==='string'&&x.trim()))];
    const site=entity.sitelinks?.enwiki||entity.sitelinks?.zhwiki||entity.sitelinks?.jawiki,host=site?.site==='enwiki'?'en.wikipedia.org':site?.site==='zhwiki'?'zh.wikipedia.org':'ja.wikipedia.org';
    return [{id,title:label('zh-hans')||label('zh')||label('en')||query,description:entity.descriptions?.zh?.value||entity.descriptions?.en?.value||'',aliases,english:[...new Set(english)],source:site?`https://${host}/wiki/${encodeURIComponent(site.title.replaceAll(' ','_'))}`:`https://www.wikidata.org/wiki/${id}`}];
  });
}
export function attachWikiLookup(parent,{nameInput,aliasInput,promptInput,signal,onApply}) {
  const toolbar=document.createElement('div');toolbar.className='wardrobe-wiki';const button=document.createElement('button');button.type='button';button.className='menu_button';button.textContent='查询 Wiki 名称 / 别名';const query=document.createElement('input');query.placeholder='角色名，可补作品名以区分同名人物';query.setAttribute('aria-label','Wiki 搜索名称');query.value=nameInput.value.split('|')[0];const results=document.createElement('div');toolbar.append(query,button,results);parent.append(toolbar);
  let serial=0;button.onclick=async()=>{const ticket=++serial;button.disabled=true;results.textContent='正在查询 Wiki…';try{
    const items=await searchWikiNames(query.value,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!parent.isConnected||ticket!==serial)return;results.replaceChildren();
    const note=document.createElement('p');note.textContent=items.length?'请按作品和人物核对条目，选择别名与生图名称；不会直接保存。':'没有找到对应人物。可以尝试英文名称；原创角色可手填生图名称。';results.append(note);
    for(const item of items){const row=document.createElement('section');row.className='wardrobe-candidate';const title=document.createElement('strong');title.textContent=item.title;const desc=document.createElement('p');desc.textContent=item.description;const source=document.createElement('a');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='查看 Wiki 来源';row.append(title,desc,source);
      const checks=item.aliases.map(name=>{const label=document.createElement('label');label.className='wardrobe-checkbox';const check=document.createElement('input');check.type='checkbox';check.checked=true;label.append(check,document.createTextNode(name));row.append(label);return {name,check};});
      const select=document.createElement('select');select.setAttribute('aria-label',item.title+'的生图名称');select.add(new Option('保留当前生图名称',''));for(const name of item.english)select.add(new Option(name,name));if(item.english.length)select.value=item.english[0];row.append(select);
      const use=document.createElement('button');use.type='button';use.className='menu_button';use.textContent='采用所选名称';use.onclick=()=>{const aliases=checks.filter(x=>x.check.checked).map(x=>x.name);aliasInput.value=[...new Set([...aliasInput.value.split('|').map(x=>x.trim()).filter(Boolean),...aliases])].join('|');if(select.value)promptInput.value=select.value;onApply?.({source:item.source,entityId:item.id,aliases,promptName:select.value});note.textContent='已填入待保存字段，请核对后保存角色。';};row.append(use);results.append(row);
    }
  }catch(e){if(parent.isConnected&&!signal?.aborted)results.textContent=(e.name==='TimeoutError'||e.name==='AbortError'?'Wiki 查询超时。':e.message)+' 可手动填写，或稍后重试。';}finally{button.disabled=false;}};
}
