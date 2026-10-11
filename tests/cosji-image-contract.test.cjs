const fs=require('node:fs'),assert=require('node:assert/strict');
const text=fs.readFileSync('./index.js','utf8');
const start=text.indexOf('function getEffectiveConfigForRequestType('),end=text.indexOf('\nfunction buildPromptForRequestType',start);
const get=new Function('extension_settings17','extensionName','cosjiResolveNativeProfile','SillyTavern','getGlobalToolCallConfig','getGlobalTailMessagesConfig',text.slice(start,end)+';return getEffectiveConfigForRequestType;')(
 {test:{llm_profiles:{default:{model:'model',max_tokens:2048}},llm_request_type_configs:{image_gen:{api_profile:'default'},translation:{api_profile:'default'}}}},'test',x=>x,{getContext:()=>({})},()=>({enabled:true,fields:['thought_and_context','user_requirements']}),()=>({enabled:false}));
assert.equal(get('image_gen').tool_call_config.enabled,false);
assert.equal(get('image_gen').max_tokens,8192);
assert.equal(get('translation').tool_call_config.enabled,true);
assert.equal(get('translation').max_tokens,2048);
console.log('PASS: XML image generation bypasses incompatible global tools; other request settings are preserved');
