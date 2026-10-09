import assert from 'node:assert/strict';
import {newId} from '../wardrobe-store.js';
const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
try {
 for(const crypto of [{randomUUID:()=> 'native-id'}, {getRandomValues:bytes=>{bytes.fill(7);return bytes;}}, undefined]){
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:crypto});
  const id=newId();assert.equal(typeof id,'string');assert.ok(id.length);
  if(crypto?.randomUUID)assert.equal(id,'native-id');
  else if(crypto)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  else assert.equal(new Set(Array.from({length:1000},newId)).size,1000);
 }
}finally{if(original)Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
console.log('Wardrobe IDs: native UUID, HTTP getRandomValues fallback and missing crypto passed.');
