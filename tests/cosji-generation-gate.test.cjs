const fs=require('fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('./index.js','utf8');
const marker='async function processImageLikeRequest(el, gestureId, requestType, title, llmFunction, historyId) {';
const start=source.indexOf(marker)+marker.length,end=source.indexOf('  const mainTimer =',start);
assert.ok(start>=marker.length&&end>start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const gate=new AsyncFunction('requestType','isPluginEnabled','addLog','toastr','historyStep','historyId',source.slice(start,end)+'return "continue";');
(async()=>{
 const logs=[],warnings=[];
 const history=[];
 assert.equal(await gate('image_gen',()=>false,m=>logs.push(m),{warning:(...args)=>warnings.push(args)},(...args)=>history.push(args),'test'),undefined);
 assert.equal(history[0][3],'failed');
 assert.equal(logs.length,1);assert.equal(warnings.length,1);assert.match(warnings[0][0],/启用插件/);
 assert.equal(await gate('image_gen',()=>true,()=>{},{}),'continue');
 assert.ok(source.includes('requestType === "image_gen" || String(extension_settings40[extensionName]?.zidongdianji) === "true"'));
 console.log('PASS: disabled image generation stops before prompt/LLM calls and reports the reason; enabled requests continue.');
})().catch(error=>{console.error(error);process.exitCode=1;});
