import assert from 'node:assert/strict';
import {parseOutfitJson,requestOutfitVision} from '../outfit-vision.js';
assert.deepEqual(parseOutfitJson('I see 8 groups.\n```json\n[{"index":0,"nameCN":"黑色长袖兔女郎装"}]\n```'),[{index:0,nameCN:'黑色长袖兔女郎装'}]);
assert.deepEqual(parseOutfitJson('Result: [{"text":"brace } and [ in string"}] done'),[{text:'brace } and [ in string'}]);
assert.throws(()=>parseOutfitJson('I see 8 groups, no JSON.'),/未返回有效 JSON/);
let calls=0;
const result=await requestOutfitVision({profile:{api_url:'https://example.test/v1',api_key:'test',bypass_proxy:true},model:'test',messages:[],parseHeaders:()=>({}),parseBody:()=>({}),includeHeaders:()=>({}),getHeaders:()=>({}),parseResult:parseOutfitJson,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:++calls===1?'I see groups':'[{"index":0}]'}}]})})});
assert.equal(calls,2);assert.equal(result[0].index,0);
console.log('Outfit JSON extraction and corrective retry passed.');
