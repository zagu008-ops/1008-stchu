import assert from 'node:assert/strict';
import {pageAddressDialog} from '../cosji-address-config-dialog.js';
let active,calls=0,mode='ok',release;
class Dialog{
 constructor(){this.elements=new Map();this.closed=false;}
 set innerHTML(html){this.html=html;for(const key of ['target','detect','copy','test','mapping','status','cancel','apply'])this.elements.set(`[data-${key}]`,{value:key==='target'?'http://target:8188':'',disabled:['copy','test','apply'].includes(key),textContent:'',replaceChildren(){}});}
 querySelector(s){return this.elements.get(s);}
 addEventListener(){} showModal(){} close(){this.closed=true;} remove(){}
}
globalThis.document={createElement:()=>new Dialog(),body:{append:d=>active=d}};
globalThis.window={SillyTavern:{getContext:()=>({getRequestHeaders:()=>({})})}};
globalThis.fetch=async()=>{calls++;if(mode==='wait')await new Promise(r=>release=r);if(mode==='fail')throw new DOMException('signal timed out','TimeoutError');return {ok:true,json:async()=>({LoraLoader:{input:{required:{lora_name:[['available.safetensors']]}}}})};};
const page={version:1,yushe:{outfit:{fixedPrompt:'portrait',cosjiLoras:[{name:'available.safetensors',weight:1},{name:'missing.safetensors',weight:1}]}},catalog:{},selection:{}};
async function prepare(){const result=pageAddressDialog(page,[],'http://target:8188');const d=active,q=s=>d.querySelector(`[data-${s}]`);await q('detect').onclick();assert.equal(q('copy').disabled,false);await q('copy').onclick();assert.equal(q('apply').disabled,false);assert.equal(q('apply').textContent,'测试并使用配置');return {result,d,q};}
let {result,d,q}=await prepare();await q('apply').onclick();const applied=await result;assert.equal(applied.url,'http://target:8188');assert.equal(applied.page.yushe.outfit.cosjiLoras.length,1);assert(d.closed);assert.equal(page.yushe.outfit.cosjiLoras.length,2);
({result,d,q}=await prepare());mode='fail';await q('apply').onclick();assert.equal(d.closed,false);assert.equal(q('apply').disabled,false);assert.match(q('status').textContent,/请求超时/);mode='ok';await q('apply').onclick();assert.equal((await result).url,'http://target:8188');
({result,d,q}=await prepare());mode='wait';const before=calls;const applying=q('apply').onclick();assert.equal(q('apply').disabled,true);assert.equal(q('apply').textContent,'处理中…');await q('apply').onclick();assert.equal(calls,before+1);mode='ok';release();await applying;await result;
({result,d,q}=await prepare());q('target').value='http://other:8188';q('target').oninput();assert.equal(q('apply').disabled,true);assert.equal(q('copy').disabled,true);q('cancel').onclick();assert.equal(await result,null);
console.log('PASS click-to-test-and-apply, timeout feedback and retry, double-click suppression, address change invalidation, original preservation');
