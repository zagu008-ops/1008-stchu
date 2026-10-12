import assert from 'node:assert/strict';
import {mountUnifiedQuick} from '../cosji-unified.mjs';
class Element {
    style={}; attributes={}; handlers={}; hidden=false;
    addEventListener(type,fn){(this.handlers[type]||=[]).push(fn);}
    setAttribute(key,value){this.attributes[key]=value;}
    contains(target){return target===this;}
    emit(type,event){for(const fn of this.handlers[type]||[])fn(event);}
    focus(){this.focused=true;}
}
const doc=new Element(),fab=new Element(),quick=new Element(),button=new Element(),popup=new Element(),view=new Element();
doc.getElementById=id=>id==='st-chatu8-fab'?fab:null;
button.ownerDocument=doc;quick.dataset={};popup.hidden=true;popup.id='cosji-quick-panel';
view.innerWidth=390;view.innerHeight=800;
let y=620,renders=0;
fab.getBoundingClientRect=()=>({top:y,bottom:y+50,right:370});
assert.equal(typeof mountUnifiedQuick(quick,button,popup,()=>renders++,view),'function');
assert.equal(button.hidden,true);
view.toggleCosjiQuick();assert.equal(popup.hidden,false);assert.equal(renders,1);
assert.equal(quick.style.left,'70px');assert.equal(popup.style.bottom,'0');
doc.emit('click',{target:quick});assert.equal(popup.hidden,false);
doc.emit('keydown',{key:'Escape'});assert.equal(popup.hidden,true);assert.equal(fab.focused,true);
fab.emit('keydown',{key:'Enter',preventDefault(){}});assert.equal(popup.hidden,false);
doc.emit('click',{target:{}});assert.equal(popup.hidden,true);
y=20;view.toggleCosjiQuick();assert.equal(quick.style.top,'82px');assert.equal(popup.style.top,'0');
view.innerWidth=320;view.emit('resize');assert.equal(popup.style.width,'296px');assert.equal(quick.style.left,'12px');
assert.equal(mountUnifiedQuick(quick,{ownerDocument:{getElementById:()=>null}},popup,()=>{},view),null);
console.log('Unified entry, boundaries, keyboard and dismissal passed');
