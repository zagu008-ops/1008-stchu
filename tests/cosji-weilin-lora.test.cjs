const fs=require('node:fs'),assert=require('node:assert/strict');
const text=fs.readFileSync('./index.js','utf8');
const start=text.indexOf('  function replaceLoraTags(input, addClipSkip = false)'),end=text.indexOf('\n  if (extension_settings49[extensionName].worker.includes',start);
const convert=new Function('extension_settings49','extensionName','isSettingTrue',text.slice(start,end)+';return replaceLoraTags;')({test:{worker:'WeiLinPromptUI',weilin_lora_fix:'false'}},'test',v=>v===true||v==='true');
const input='<lora:modelA:0.8>, apple, <lora:modelB:0.6:0.7>';
const output=convert(input,true).replaceAll('<lora:','<wlr:');
assert.equal(output,'<wlr:modelA:0.8:1:1>, apple, <wlr:modelB:0.6:0.7:1>');
// Mirror the installed node's greedy new-format parser: each numeric field must stay within its tag.
const matches=[...output.matchAll(/<wlr:([^:]+):([^:]+):([^:]+):([^>]+)>/g)];
assert.equal(matches.length,2);
for(const m of matches)for(const weight of m.slice(2))assert(Number.isFinite(Number(weight)));
const broken=[...'<wlr:modelA:0.8:1>, apple, <wlr:modelB:0.6:0.7>'.matchAll(/<wlr:([^:]+):([^:]+):([^:]+):([^>]+)>/g)];
assert(broken.some(m=>m.slice(2).some(weight=>!Number.isFinite(Number(weight)))));
console.log('PASS: reproduced adjacent old-tag failure; new tags parse as two independent numeric LoRAs');
