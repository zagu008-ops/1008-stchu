import {chatKey,latestBody,validSource} from './wardrobe-store.js';
import {isSopClothingTag,expandSopResolvedOutfit,applySopOutfitPriority} from './generation-sop-outfit.js';
const tokens=value=>String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
const normal=value=>String(value||'').replace(/^\((.*?):[-+\d.]+\)$/,'$1').toLowerCase().replace(/[_-]/g,' ').trim();
const color='black|brown|blonde|blond|golden|gold|white|silver|grey|gray|red|blue|green|pink|purple|orange|yellow|aqua|cyan|teal|platinum|amber|violet';
export function appearanceAttributes(token){
 const t=normal(token),out={};if(/\b(holding|touching|pulling|tucked|brushing|looking|covering)\b/.test(t)&&!new RegExp(`\\b(${color}) (hair|eyes)\\b`).test(t))return out;
 const hair=t.match(new RegExp(`\\b(${color}) hair\\b`));if(hair)out.hairColor=hair[1].replace(/^(golden|gold|blond)$/,'blonde').replace('gray','grey');
 const eyes=t.match(new RegExp(`\\b(${color}) eyes\\b`));if(eyes)out.eyeColor=eyes[1].replace('gray','grey');
 if(/^(?:bangs|blunt bangs|side swept bangs|ponytail|twin tails|twintails|braid|hime cut)$/.test(t))out.hairStyle=t;
 const length=t.match(/\b(long|short|medium)\b.*\bhair\b/);if(length)out.hairLength=length[1];
 const texture=t.match(/\b(straight|wavy|curly)\b.*\bhair\b/);if(texture)out.hairTexture=texture[1];
 const skin=t.match(/\b(fair|pale|dark|tan|tanned) skin\b/);if(skin)out.skinTone=skin[1];
 const body=t.match(/\b(flat|small|medium|large|huge) (?:chest|breasts)\b/);if(body)out.chest=body[1];
 const features=[['nose',/\b(elegant|small|large|pointed|flat|button) nose\b/],['lips',/\b(thin|thick|full|small) lips\b/],['legLength',/\b(long|short) legs\b/],['waist',/\b(slim|thin|wide|thick) waist\b/],['stature',/^(tall|short stature)$/],['faceShape',/\b(oval|round|square|small) face\b/]];
 for(const [key,pattern] of features){const match=t.match(pattern);if(match)out[key]=match[1];}
 return out;
}
export function resolveAppearanceOverride(settings,ctx,key){const value=settings.sopAppearanceOverrides?.[chatKey(ctx)]?.[key];return value&&validSource(value.source,ctx)?value:null;}
export function saveAppearanceOverride(settings,ctx,key,tags){
 const source=latestBody(ctx);if(source.index<0)throw Error('当前聊天缺少可追溯的正文，不能保存外貌覆盖。');
 const all=settings.sopAppearanceOverrides||={};const group=all[chatKey(ctx)]||={};group[key]={tags:String(tags),source:{index:source.index,stamp:source.stamp}};
}
export function clearAppearanceOverride(settings,ctx,key){delete settings.sopAppearanceOverrides?.[chatKey(ctx)]?.[key];}
export function authorityAppearance(role,reference={},override=null){
 const behind=/from behind/i.test(reference.angle||''),upper=reference.upperBody!=='hidden',lower=reference.lowerBody!=='hidden';
 const base=[role.promptName,role.characterTraits,upper?(behind?role.facialFeaturesBack||role.facialFeatures:role.facialFeatures):'',upper?(behind?(reference.upperBody==='nsfw'?role.upperBodyNSFWBack:role.upperBodySFWBack):(reference.upperBody==='nsfw'?role.upperBodyNSFW:role.upperBodySFW)):'',lower?(behind?(reference.lowerBody==='nsfw'?role.fullBodyNSFWBack:role.fullBodySFWBack):(reference.lowerBody==='nsfw'?role.fullBodyNSFW:role.fullBodySFW)):''].filter(Boolean).join(', ');
 if(!override)return base;
 const changes=Object.assign({},...tokens(override.tags).map(appearanceAttributes));
 return [...tokens(base).filter(t=>!Object.keys(appearanceAttributes(t)).some(k=>k in changes)),...tokens(override.tags)].join(', ');
}
export function enforceCharacterConsistency(plan,settings,preparedPeople,states={},body='',provenFields={}){
 const trace=[];
 const clean=(value,locks,source,negative=false,strict=false,wear='')=>tokens(value).flatMap(token=>{
   const attrs=appearanceAttributes(token);const entries=Object.entries(attrs);
   const negated=/\b(no|not|without)\b/.test(normal(token));
   const conflict=entries.some(([k,v])=>k in locks&&(negative?v===locks[k]:(negated?v===locks[k]:v!==locks[k])));
   const clothing=!!wear&&isSopClothingTag(token)&&(negative?tokens(wear).some(t=>normal(t)===normal(token)):!tokens(wear).some(t=>normal(t)===normal(token)));
   const forbidden=conflict||clothing||(strict&&!negative&&entries.some(([k])=>!(k in locks)));
   if(forbidden&&strict){const error=Error(`${source} 与固定人物配置冲突：${token}。请编辑该预设。`);error.code='CHARACTER_PRESET_CONFLICT';throw error;}
   if(forbidden)trace.push({source,token,reason:negative?'negative-conflict':'fixed-config'});
   if(forbidden&&!strict&&!negative&&conflict&&/\b(holding|touching|pulling|tucked|brushing|covering)\b/.test(normal(token))&&!negated){
     let corrected=token;if(locks.hairColor)corrected=corrected.replace(new RegExp(`\\b(${color}) hair\\b`,'gi'),locks.hairColor+' hair');if(locks.eyeColor)corrected=corrected.replace(new RegExp(`\\b(${color}) eyes\\b`,'gi'),locks.eyeColor+' eyes');return [corrected];
   }
   return forbidden?[]:[token];
 }).join(', ');
 for(const person of plan.characters){
  const role=settings.characterPresets?.[person.roleKey];if(!role)continue;
  const state=states[person.roleKey]||{};let ref={};try{ref=JSON.parse(preparedPeople.find(p=>p.id===person.id)?.prompt.match(/\$([^$]+)\$/)?.[1]||'{}');}catch{}
  const authority=authorityAppearance(role,ref,state.appearanceOverride),locks=Object.assign({},...tokens(authority).map(appearanceAttributes));
  const preset=settings.yushe?.[person.presetId]||{};
  let wear=state.wear;
  if(wear?.outfit)wear={...wear,prompt:expandSopResolvedOutfit(wear.outfit,ref)};
  if(!wear&&settings.sopDefaultOutfitKey&&settings.outfitPresets?.[settings.sopDefaultOutfitKey])wear={outfitKey:settings.sopDefaultOutfitKey,source:'public',prompt:expandSopResolvedOutfit(settings.outfitPresets[settings.sopDefaultOutfitKey],ref)};
  const llm=preparedPeople.find(p=>p.id===person.id)?.prompt||'';
  const bodyClothing=/(?:衬衫|制服|校服|裙|长裤|短裤|外套|毛衣|鞋|袜|泳衣|比基尼|连衣|shirt|blouse|dress|skirt|uniform|pants|jacket|coat|shoes|stockings)/i.test(body);
  const describedClothing=tokens(llm).some(isSopClothingTag)&&(bodyClothing||(provenFields[person.id]||[]).some(isSopClothingTag));
  if(wear?.source==='public'&&describedClothing)wear=null;
  if(!(ref.upperBody==='hidden'&&ref.lowerBody==='hidden')&&!wear&&!describedClothing)throw Object.assign(Error(`角色“${person.name}”没有服装描述，请确认穿搭或配置公共默认服装。`),{code:'OUTFIT_REQUIRED'});
  for(const [label,text,negative] of [['人物正面预设',[preset.fixedPrompt,preset.fixedPrompt_end].join(', '),false],['人物负面预设',preset.negativePrompt,true],['角色负面资料',role.negative,true]])clean(text,locks,label,true===negative,true,wear?.prompt);
  // Check hand-written scene presets independently; never silently rewrite them.
  const scene=settings.yushe?.[plan.scenePresetId]||{};
  clean([scene.fixedPrompt,scene.fixedPrompt_end].join(', '),locks,'公共画面预设',false,true,wear?.prompt);
  clean(scene.negativePrompt,locks,'公共负面预设',true,true,wear?.prompt);
  const evidence=provenFields[person.id]||[];
  person.prompt=tokens(person.prompt).filter(token=>{
    const attrs=appearanceAttributes(token);
    if(Object.keys(attrs).some(k=>!(k in locks))&&!tokens(authority).includes(token)&&!evidence.includes(token)){
      trace.push({source:'人物 '+person.id,token,reason:'unconfigured-appearance-without-evidence'});return false;
    }return true;
  }).join(', ');
  person.prompt=clean(person.prompt,locks,'人物 '+person.id,false,false,wear?.prompt);
  // Remove all dynamic values of configured attributes, then add authoritative values once.
  person.prompt=tokens(person.prompt).filter(t=>/\b(holding|touching|pulling|tucked|brushing|covering)\b/.test(normal(t))||!Object.keys(appearanceAttributes(t)).some(k=>k in locks)).join(', ');
  const fixed=tokens(authority).filter(t=>Object.keys(appearanceAttributes(t)).length).join(', ');
  person.prompt=[person.prompt,fixed].filter(Boolean).join(', ');
  person.negative=clean(person.negative,locks,'人物 '+person.id+' UC',true,false,wear?.prompt);
  plan.scenePrompt=clean(plan.scenePrompt,locks,'LLM 公共场景',false);
  const handScene=new Set(tokens([scene.fixedPrompt,scene.fixedPrompt_end].join(', ')));
  plan.scenePrompt=tokens(plan.scenePrompt).filter(t=>{if(!handScene.has(t)&&Object.keys(appearanceAttributes(t)).length){trace.push({source:'LLM 公共场景',token:t,reason:'person-description-in-scene'});return false;}return true;}).join(', ');
  plan.sceneNegative=clean(plan.sceneNegative,locks,'公共负面',true);
  if(wear){person.prompt=applySopOutfitPriority(person.prompt,wear.prompt);person.outfit={outfitKey:wear.outfitKey,source:wear.source,comboId:wear.comboId};}
  person.authority={appearance:authority,locks,overrideSource:state.appearanceOverride?.source||null};
 }
 plan.consistencyTrace=trace;
 plan.positive=[plan.scenePrompt,...plan.characters.map(p=>p.prompt)].filter(Boolean).join(', ');
 plan.negative=[plan.sceneNegative,...plan.characters.map(p=>p.negative)].filter(Boolean).join(', ');
 return plan;
}
export function normalizeDynamicTag(raw,body=''){
 const candidates=[],provenFields={};
 const tag=String(raw||'').replace(/Character\s+(\d+)\s+Dynamic:\s*(\{[^;]*\})\s*;?/gi,(_,id,json)=>{
   let data;try{data=JSON.parse(json);}catch{throw Error(`人物 ${id} 动态字段 JSON 无效。`);}
   const list=value=>Array.isArray(value)?value.map(String):value?[String(value)]:[];
   const reference=(data.roleKey||data.identityName)?'$'+JSON.stringify({name:String(data.roleKey||data.identityName),angle:data.view==='from behind'?'from behind':'from front',upperBody:['sfw','nsfw','hidden'].includes(data.upperBody)?data.upperBody:'sfw',lowerBody:['sfw','nsfw','hidden'].includes(data.lowerBody)?data.lowerBody:'sfw'})+'$':list(data.originalDescription).join(', ');
   const parts=['action','expression','pose'].flatMap(key=>list(data[key]));
   provenFields[id]=[];
   for(const field of ['outfitFromBody','appearanceFromBody']){
     const value=data[field];
     if(value&&typeof value.evidence==='string'&&value.evidence.trim()&&body.includes(value.evidence)){
       parts.push(...list(value.tags));provenFields[id].push(...list(value.tags));
     }
   }
   for(const kind of ['appearanceChange','outfitChange'])if(data[kind])candidates.push({id:Number(id),roleKey:data.roleKey,kind,...data[kind]});
   const xy=Array.isArray(data.position)?data.position:[.5,.5];if(xy.length!==2||xy.some(v=>!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1))throw Error(`人物 ${id} 坐标无效。`);
   return `Character ${id} Prompt:${[reference,...parts].filter(Boolean).join(', ')}|centers:${xy.join(',')};Character ${id} coordinates:${xy.join(',')};`;
 });return {tag,candidates,provenFields};
}
export function validateConsistencySources(plan,sources){
 for(const person of plan.characters){
  if(!person.authority)continue;const locks=person.authority.locks;
  for(const source of sources)for(const token of tokens(source.text)){
   const attrs=appearanceAttributes(token),negated=/\b(no|not|without)\b/.test(normal(token));
   if(Object.entries(attrs).some(([k,v])=>k in locks&&(source.negative?v===locks[k]:(negated?v===locks[k]:v!==locks[k])))){
    throw Object.assign(Error(`${source.name} 与角色“${person.name}”固定外貌冲突：${token}。请修改该配置。`),{code:'CHARACTER_PRESET_CONFLICT'});
   }
  }
 }
}
