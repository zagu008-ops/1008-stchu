import assert from 'node:assert/strict';
import {resolveWorkflow} from '../cosji-workflow.mjs';
const valid='{"1":{"class_type":"SaveImage","inputs":{}}}';
assert.equal(resolveWorkflow('',valid),valid);
assert.equal(resolveWorkflow('  ',valid),valid);
assert.equal(resolveWorkflow(valid,''),valid);
assert.equal(resolveWorkflow('{broken',valid),'{broken');
assert.deepEqual(JSON.parse(resolveWorkflow({a:1},'')),{a:1});
console.log('PASS: empty profile workflow restores selected preset; nonempty edits are preserved');
