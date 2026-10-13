import assert from 'node:assert/strict';
import {readGenerationStream} from '../cosji-generation-stream.mjs';
const response=text=>new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}));
const stages=[];const data=await readGenerationStream(response('{"stage":"正在执行","promptId":"test"}\n{"result":{"format":"png","data":"abc"}}\n'),s=>stages.push(s));assert.equal(data.data,'abc');assert.deepEqual(stages,['正在执行 · 任务 test']);
await assert.rejects(()=>readGenerationStream(response('{"error":"node failed"}\n'),()=>{}),/node failed/);
await assert.rejects(()=>readGenerationStream(response('{"stage":"queued"}\n'),()=>{}),/未收到图片/);
