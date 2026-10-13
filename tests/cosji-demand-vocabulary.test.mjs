import assert from 'node:assert/strict';
import fs from 'node:fs';
import {composeVocabularyDemand} from '../cosji-demand-vocabulary.mjs';
assert.equal(composeVocabularyDemand('linen dress',[]),'linen dress');
assert.equal(composeVocabularyDemand('',[{name:'soft_lighting',translation:'柔和光线'}]),'词库关键词：soft_lighting（柔和光线）');
assert.equal(composeVocabularyDemand('  linen dress  ',[{name:'soft_lighting',translation:'柔和光线'},{name:'soft_lighting',translation:'柔和光线'},{name:' ',translation:'空'}]),'linen dress\n\n词库关键词：soft_lighting（柔和光线）');
assert.equal(composeVocabularyDemand('scene',[{name:'sunset'}]),'scene\n\n词库关键词：sunset');
const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
for(const name of ['showUserDemandPopup','showUserDemandPopup2']){
 const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2,body=source.slice(start,end);
 assert.ok(body.includes('mountDemandVocabulary({bubble,textarea,confirmBtn,db:dbs})'));
 assert.equal((body.match(/vocabulary.getText\(textarea.value.trim\(\)\)/g)||[]).length,2);
 assert.ok(body.includes('images: [...uploadedImages]'));assert.ok(body.includes('vocabulary.dispose()'));
}
console.log('PASS keyword-only generation, text preservation, duplicate selection and both popup submission paths');
// Exercise the existing indexedDB cursor search with translated terms and source filtering.
const records=[{name:'linen_dress',translation:'亚麻连衣裙',fileName:'clothes',hot:1},{name:'soft_light',translation:'柔光',fileName:'light',hot:2},{name:'custom_clothes',translation:'连衣裙',fileName:'manual',hot:-1}];
const openDB=async()=>({transaction:()=>({objectStore:()=>({openCursor(){const request={};let i=0;const next=()=>queueMicrotask(()=>request.onsuccess({target:{result:i<records.length?{value:records[i++],continue:next}:null}}));next();return request;}})})});
const searchCode=source.slice(source.indexOf('async function searchTags(keyword, options = {})'),source.indexOf('async function addTag(tag)'));
const search=new Function('openDB',searchCode+';return searchTags;')(openDB);
assert.deepEqual((await search('连衣裙',{fileName:'clothes'})).map(t=>t.name),['linen_dress']);
assert.equal((await search('linen')).length,1);assert.deepEqual(await search(''),[]);
assert.equal((await search('',{browse:true})).length,3);assert.equal((await search('',{browse:true,fileName:'manual'}))[0].name,'custom_clothes');
console.log('PASS actual cursor search: Chinese, English, library filter, browse and legacy empty-search behavior');

const first=await search('',{browse:true,paged:true,offset:0,limit:2});const second=await search('',{browse:true,paged:true,offset:2,limit:2});
assert.equal(first.total,3);assert.equal(first.items.length,2);assert.equal(second.items.length,1);assert.equal(new Set([...first.items,...second.items].map(t=>t.name)).size,3);
assert.equal((await search('连衣裙',{paged:true,fileName:'clothes',offset:0,limit:1})).total,1);
assert.equal((await search('',{browse:true,paged:true,offset:100,limit:2})).items.length,0);
console.log('PASS pagination totals, full coverage, source-filtered count and out-of-range handling');
