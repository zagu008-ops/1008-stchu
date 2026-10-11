import assert from 'node:assert/strict';
import {createId} from '../cosji-id.mjs';
import {createHistory} from '../cosji-history.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
assert.equal(createId({randomUUID:()=> 'native-id'}),'native-id');
assert.match(createId({getRandomValues:bytes=>bytes.fill(255)}),uuid);
assert.match(createId({}),uuid);
const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
try {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:bytes=>bytes.set(Array.from({length:16},()=>Math.floor(Math.random()*256)))}});
    const history=createHistory({});
    const ids=Array.from({length:100},()=>history.start('HTTP task'));
    assert.equal(new Set(ids).size,100);
    ids.forEach(id=>assert.match(id,uuid));
    assert.equal(history.rows.length,100);
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
    assert.match(history.start('No crypto'),uuid);
} finally {
    if(original) Object.defineProperty(globalThis,'crypto',original);
    else delete globalThis.crypto;
}
console.log('PASS: native UUID, LAN HTTP fallback, unique history tasks and missing crypto');
