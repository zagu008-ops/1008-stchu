import {fetchComfyInfo} from './cosji-comfy-catalog.mjs';
import {splitLoras,joinLoras,normalizeComfyUrl} from './cosji-core.mjs';
const fields=['roles','presetRoles','commonPrompts','roleCommonPrompts','commonLibraries','selectedRole','outfitOverride'];
const selections=['yusheid_sd','yusheid_novelai','yusheid_comfyui','randomYushe'];
export function capturePage(settings){return {version:1,yushe:structuredClone(settings.yushe||{}),catalog:Object.fromEntries(fields.filter(k=>settings.cosji[k]!==undefined).map(k=>[k,structuredClone(settings.cosji[k])])),selection:Object.fromEntries(selections.map(k=>[k,settings[k]]))};}
export function applyPage(settings,page){if(page.version!==1)throw new Error('地址配置版本不支持');settings.yushe=structuredClone(page.yushe);for(const k of fields){delete settings.cosji[k];if(page.catalog[k]!==undefined)settings.cosji[k]=structuredClone(page.catalog[k]);}Object.assign(settings,page.selection);}
function walk(value,visit){if(!value||typeof value!=='object')return;visit(value);Object.values(value).forEach(v=>walk(v,visit));}
export function pageLoras(page){const used=new Map();walk(page,o=>{for(const field of ['fixedPrompt','fixedPrompt_end','negativePrompt','positive','negative'])if(typeof o[field]==='string')for(const l of splitLoras({fixedPrompt:o[field]}).loras){if(!used.has(l.name))used.set(l.name,new Set());used.get(l.name).add(field);}if(Array.isArray(o.loras)||Array.isArray(o.cosjiLoras))for(const l of [...(o.loras||[]),...(o.cosjiLoras||[])]){if(!used.has(l.name))used.set(l.name,new Set());used.get(l.name).add('LoRA 列表');}});return [...used].map(([name,uses])=>({name,uses:[...uses]}));}
const path=name=>String(name).replace(/\\/g,'/');
export function suggestLora(name,names){const exact=names.find(n=>path(n)===path(name));if(exact)return exact;const file=path(name).split('/').at(-1);const matches=names.filter(n=>path(n).split('/').at(-1)===file);return matches.length===1?matches[0]:'';}
export function copyPageForAddress(page,url,names,mapping={}){const copy=structuredClone(page),target=normalizeComfyUrl(url);for(const l of pageLoras(copy)){const match=mapping[l.name]??(suggestLora(l.name,names)||'__remove__');if(match!=='__remove__'&&!names.includes(match))throw new Error('请选择替换或移除：'+l.name);mapping={...mapping,[l.name]:match};}
 const replace=l=>mapping[l.name]==='__remove__'?[]:[{...l,name:mapping[l.name]}];
 walk(copy,o=>{for(const field of ['fixedPrompt','fixedPrompt_end','negativePrompt','positive','negative'])if(typeof o[field]==='string'){const d=splitLoras({fixedPrompt:o[field]});if(d.loras.length){d.loras=d.loras.flatMap(replace);o[field]=joinLoras(d).fixedPrompt;}}for(const field of ['loras','cosjiLoras'])if(Array.isArray(o[field]))o[field]=o[field].flatMap(replace);});
 for(const p of Object.values(copy.yushe)){p.cosjiComfyUrl=target;delete p.cosjiSourcePreset;}
 return copy;
}
export async function detectAddress(url){const info=await fetchComfyInfo(url),names=info.LoraLoader?.input?.required?.lora_name?.[0];if(!Array.isArray(names))throw new Error('目标地址未提供 LoRA 模型列表');return [...new Set(names.filter(n=>typeof n==='string'))];}
