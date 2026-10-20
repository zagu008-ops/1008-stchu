import assert from 'node:assert/strict';
import {configureXLRuntime,recordMediaDimensions,actualMediaParams} from '../cosji-xl-runtime.mjs';
import {nativeLoraWorkflow} from '../cosji-native-lora.mjs';
const graph={'2':{class_type:'CheckpointLoaderSimple',inputs:{},_meta:{cosjiXLTwoPass:true,cosjiNativeLoras:'modelOnly',cosjiPreserveLoraText:true}},'1':{class_type:'KSampler',inputs:{seed:10}},'14':{class_type:'KSamplerAdvanced',inputs:{noise_seed:10}},'11':{class_type:'JoinStrings',inputs:{string1:'test, <lora:style:1>',delimiter:',',string2:''}}};
configureXLRuntime(graph,644294621650221);assert.equal(graph['14'].inputs.noise_seed,644294621650221);assert.equal(graph['1'].inputs.seed,10);
configureXLRuntime(graph,-1,()=>.5);assert.notEqual(graph['14'].inputs.noise_seed,10);
const result=nativeLoraWorkflow(graph,{LoraLoader:{input:{required:{lora_name:[['style.safetensors']]}}}});assert.equal(result['11'].inputs.string1,'test, <lora:style:1>');assert.equal(result.cosji_lora_0.class_type,'LoraLoaderModelOnly');
const metadata={width:512,height:768};await recordMediaDimensions(metadata,'data:image/png;base64,test',class{naturalWidth=768;naturalHeight=1152;async decode(){}});
assert.equal(metadata.baseWidth,512);assert.equal(metadata.baseHeight,768);assert.equal(metadata.width,768);assert.equal(metadata.height,1152);
console.log('PASS: independent refinement seed, original LoRA text encoding and actual output dimensions');

const old={width:512,height:768};const shown=actualMediaParams(old,{naturalWidth:768,naturalHeight:1152});assert.equal(shown.width,768);assert.equal(shown.baseWidth,512);assert.equal(old.width,512);
