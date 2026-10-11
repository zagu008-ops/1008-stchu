import assert from 'node:assert/strict';
import {mountCosjiFloating} from '../cosji-floating.mjs';
class Target {
    handlers = new Map(); style = {};
    addEventListener(type,fn) {if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(fn);}
    removeEventListener(type,fn) {this.handlers.get(type)?.delete(fn);}
    emit(type,data={}) {
        const event={type,button:0,detail:1,clientX:0,clientY:0,preventDefault(){this.prevented=true;},stopPropagation(){},...data};
        for(const fn of [...this.handlers.get(type)||[]])fn(event);
        return event;
    }
}
function fixture(saved) {
    const view=new Target(),doc=new Target(),quick=new Target(),button=new Target(),popup=new Target();
    view.innerWidth=400;view.innerHeight=800;
    view.visualViewport=Object.assign(new Target(),{width:400,height:800,offsetLeft:0,offsetTop:0});
    let stored=saved,clicks=0;
    view.localStorage={getItem:()=>stored,setItem:(k,v)=>stored=v};
    button.ownerDocument=doc;
    button.getBoundingClientRect=()=>({left:parseFloat(quick.style.left)||316,top:parseFloat(quick.style.top)||636,width:64,height:64});
    mountCosjiFloating(quick,button,popup,()=>clicks++,view);
    return {view,doc,quick,button,popup,clicks:()=>clicks,stored:()=>stored};
}
const mouse=fixture();
mouse.button.emit('mousedown',{clientX:340,clientY:660});
mouse.doc.emit('mousemove',{clientX:200,clientY:200});
assert.equal(mouse.quick.style.left,'176px');assert.equal(mouse.quick.style.top,'176px');
mouse.doc.emit('mouseup');
assert.equal(mouse.button.emit('click').prevented,true);assert.equal(mouse.clicks(),0);
assert.equal(mouse.doc.handlers.get('mousemove').size,0);
const restored=fixture(mouse.stored());assert.equal(restored.quick.style.left,'176px');
restored.button.emit('mousedown',{clientX:180,clientY:180});
restored.doc.emit('mousemove',{clientX:182,clientY:182});restored.doc.emit('mouseup');restored.button.emit('click');
assert.equal(restored.clicks(),1); // small jitter remains a click
restored.button.emit('click',{detail:0});assert.equal(restored.clicks(),2); // keyboard
const touch=fixture();
const t=(x,y,id=7)=>({identifier:id,clientX:x,clientY:y});
assert.equal(touch.button.emit('touchstart',{touches:[t(340,660)]}).prevented,true);
touch.doc.emit('touchmove',{touches:[t(160,160,8)]});assert.equal(touch.quick.style.left,'316px');
touch.doc.emit('touchmove',{touches:[t(160,160)]});
touch.doc.emit('touchend',{changedTouches:[t(160,160)]});
assert.equal(touch.quick.style.left,'136px');assert.equal(touch.clicks(),0);
touch.button.emit('touchstart',{touches:[t(160,160)]});touch.doc.emit('touchend',{changedTouches:[t(160,160)]});
assert.equal(touch.clicks(),1);
touch.button.emit('touchstart',{touches:[t(160,160)]});touch.doc.emit('touchcancel',{changedTouches:[t(160,160)]});
assert.equal(touch.clicks(),1);assert.equal(touch.doc.handlers.get('touchmove').size,0);
touch.button.emit('mousedown',{clientX:160,clientY:160});touch.doc.emit('mousemove',{clientX:9999,clientY:-9999});
assert.equal(touch.quick.style.left,'324px');assert.equal(touch.quick.style.top,'12px');
touch.view.emit('blur');assert.equal(touch.doc.handlers.get('mouseup').size,0);
touch.view.innerWidth=200;touch.view.visualViewport.width=200;touch.view.visualViewport.emit('resize');
assert.equal(touch.quick.style.left,'124px');assert.equal(touch.popup.style.top,'76px');
const corrupt=fixture('{bad');assert.equal(corrupt.quick.style.left,'316px');
const noStorage=fixture();noStorage.view.localStorage.setItem=()=>{throw Error('disabled');};
noStorage.button.emit('mousedown');noStorage.doc.emit('mousemove',{clientX:-200,clientY:-200});noStorage.doc.emit('mouseup');
assert.equal(noStorage.doc.handlers.get('mousemove').size,0);
console.log('PASS: mouse/touch document drag, tap/keyboard, no accidental click, saved position, boundaries, resize, cancel/blur, unavailable storage');
