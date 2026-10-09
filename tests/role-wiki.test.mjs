import assert from 'node:assert/strict';
import {searchWikiNames} from '../role-wiki.js';
let calls=[];
const fetchImpl=async(url,options)=>{calls.push({url:new URL(url),options});return Response.json(calls.length===1?{search:[{id:'Q1'}]}:{entities:{Q1:{labels:{zh:{value:'喜多川海梦'},en:{value:'Marin Kitagawa'}},aliases:{en:[{value:'Kitagawa Marin'}],zh:[{value:'海梦'}]},descriptions:{zh:{value:'漫画人物'}},sitelinks:{enwiki:{site:'enwiki',title:'Marin Kitagawa'}}}}});};
const [result]=await searchWikiNames('喜多川海梦',{fetchImpl});assert.deepEqual(result.english,['Marin Kitagawa','Kitagawa Marin']);assert(result.aliases.includes('海梦'));assert.equal(result.source,'https://en.wikipedia.org/wiki/Marin_Kitagawa');assert.equal(calls[0].url.searchParams.get('language'),'zh');assert(calls.every(c=>c.options.credentials==='omit'));
await assert.rejects(searchWikiNames('',{fetchImpl}),/填写/);assert.deepEqual(await searchWikiNames('Original',{fetchImpl:async()=>Response.json({search:[]})}),[]);await assert.rejects(searchWikiNames('A',{fetchImpl:async()=>new Response('',{status:429})}),/429/);
console.log('Wiki lookup: exact sourced aliases and separate English names, no invented translation, empty search and HTTP failures passed.');
