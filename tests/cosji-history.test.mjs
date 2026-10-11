import assert from 'node:assert/strict';
import {createHistory,safeUrl,safeError} from '../cosji-history.mjs';
const settings={};let writes=0;
const h=createHistory(settings,()=>writes++);
const a=h.start('提示词'),b=h.start('生图',{},a),c=h.start('生图',{},a);
h.update(b,'执行失败',{节点:'12'},'failed');h.update(c,'已返回',{},'success');
assert.equal(h.get(b).state,'failed');assert.equal(h.get(c).parent,a);assert.equal(h.get(a).state,'running');
const restarted=createHistory(settings);
assert.equal(restarted.get(a).state,'interrupted');assert.equal(restarted.get(b).state,'failed');
for(let i=0;i<110;i++){const id=h.start('生图');h.update(id,'完成',{},'success');}
// Pruning takes place when the next click is recorded.
const active=h.start('生图');assert.equal(h.rows.filter(r=>h.terminal.has(r.state)).length,100);assert.ok(h.get(active));
assert.equal(safeUrl('https://user:password@server.test/a?api_key=secret#hash'),'https://server.test/a');
const error=safeError('Failed https://user:pass@server.test/a?token=ABC Bearer HIDDEN api_key=TOPSECRET');
assert.ok(!/pass|ABC|HIDDEN|TOPSECRET/.test(error));assert.ok(writes>100);
console.log('PASS: independent tasks, parent linking, reload interruptions, bounded completed history, URL and error redaction');
