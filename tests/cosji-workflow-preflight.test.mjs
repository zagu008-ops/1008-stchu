import assert from 'node:assert/strict';
import {workflowProblems} from '../cosji-diagnostics.mjs';
const info={CheckpointLoaderSimple:{input:{required:{ckpt_name:[['available.safetensors']]}}},CLIPLoader:{input:{required:{clip_name:[['clip_l.safetensors']]}}},VAELoader:{input:{required:{vae_name:[['local.vae']]}}},KSampler:{input:{required:{model:['MODEL'],sampler_name:[['euler']]}}}};
const workflow={'4':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'missing.safetensors'}},'30':{class_type:'CLIPLoader',inputs:{clip_name:'qwen.safetensors'}},'31':{class_type:'VAELoader',inputs:{vae_name:'qwen.vae'}},'3':{class_type:'KSampler',inputs:{model:['4',0],sampler_name:'euler'}}};
assert.equal(workflowProblems(workflow,info).length,3);
workflow['4'].inputs.ckpt_name='available.safetensors';workflow['30'].inputs.clip_name='clip_l.safetensors';workflow['31'].inputs.vae_name='local.vae';
assert.deepEqual(workflowProblems(workflow,info),[]);
assert.match(workflowProblems({x:{class_type:'MissingNode'}},info)[0],/MissingNode/);
console.log('PASS: server-specific hard-coded model validation and socket handling');
