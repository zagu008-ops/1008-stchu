import assert from 'node:assert/strict';
import {getTagGenerationChain,setTagGenerationChain,usesStructuredTagChain,mountTagChainSwitch} from '../tag-chain-switch.js';
assert.equal(getTagGenerationChain(),'structured');
assert.equal(usesStructuredTagChain('image_gen',{mode:'comfyui'}),true);
assert.equal(usesStructuredTagChain('image_gen',{mode:'sd'}),false);
assert.equal(usesStructuredTagChain('visual_mat_prep',{mode:'comfyui'}),false);
assert.throws(()=>setTagGenerationChain('invalid'));
let mounted;const handlers={},attributes={},notices=[];
const doc={defaultView:{innerWidth:390,innerHeight:844},body:{append:button=>{mounted=button;}},getElementById:()=>mounted,
 createElement:()=>({style:{},offsetWidth:140,offsetHeight:44,setAttribute:(key,value)=>{attributes[key]=value;},
 addEventListener:(key,fn)=>{handlers[key]=fn;},setPointerCapture(){},getBoundingClientRect:()=>({left:238,top:200})})};
const button=mountTagChainSwitch({document:doc,notify:message=>notices.push(message)});
assert.equal(mountTagChainSwitch({document:doc}),button,'mounting twice reuses the button');
handlers.click({detail:0});assert.equal(getTagGenerationChain(),'legacy');assert.equal(attributes['aria-pressed'],'true');
assert.equal(usesStructuredTagChain('image_gen',{mode:'comfyui'}),false);
assert.equal(notices.length,1);
handlers.pointerdown({button:0,pointerId:1,clientX:250,clientY:210});
handlers.pointermove({pointerId:1,clientX:900,clientY:900});handlers.pointerup();handlers.click({detail:1});
assert.equal(getTagGenerationChain(),'legacy','dragging does not toggle the chain');
assert.equal(button.style.left,'250px');assert.equal(button.style.top,'800px');
handlers.click({detail:0});assert.equal(getTagGenerationChain(),'structured','keyboard toggle works after dragging');
const fresh=await import('../tag-chain-switch.js?fresh-page');
setTagGenerationChain('legacy');assert.equal(fresh.getTagGenerationChain(),'structured','new page/module restores the default');
setTagGenerationChain('structured');
console.log('Temporary tag routing, other backends, floating toggle, dragging and fresh-page default passed.');
