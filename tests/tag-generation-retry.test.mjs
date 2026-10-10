import assert from 'node:assert/strict';
import { createTagGenerationRunner, installTagGenerationRetry } from '../tag-generation-retry.js';

const runner = createTagGenerationRunner();
const message = { mes: '正文' };
let release, calls = 0, busy = 0;
const first = runner(message, () => { calls++; return new Promise(resolve => release = resolve); });
await runner(message, () => calls++, () => busy++);
assert.equal(calls, 1);
assert.equal(busy, 1);
release(); await first;
await assert.rejects(runner(message, () => { throw new Error('timeout'); }), /timeout/);
await runner(message, () => calls++);
assert.equal(calls, 2, 'timeout releases the slot for retry');

let button, handler, current = message, savedTag = false;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const body = { before: el => button = el };
const mes = {
  getAttribute: () => '0',
  querySelector: selector => selector === '.mes_text' ? body : button,
  ownerDocument: { createElement: () => ({ addEventListener: (_, fn) => handler = fn, remove() { button = null; } }) }
};
let attempts = 0, errors = 0;
installTagGenerationRetry({
  root: { querySelectorAll: () => [mes] }, getMessage: () => current,
  hasTags: () => savedTag,
  run: async el => { assert.equal(el, body); if (++attempts === 1) throw new Error('timeout'); savedTag = true; },
  onError: () => errors++
});
const event = { preventDefault() {}, stopPropagation() {} };
await handler(event);
assert.equal(errors, 1);
assert.equal(button.disabled, false, 'failed request remains retryable');
assert.equal(button.textContent, '重试生成 tag');
await handler(event);
assert.equal(attempts, 2);
assert.equal(button, null, 'successful tag insertion removes retry button');
console.log('tag retry tests passed');
