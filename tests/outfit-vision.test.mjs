import { mergePromptTags } from '../wardrobe-store.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildOutfitVisionMessages, parseOutfitVisionResult, applyOutfitVisionResult, selectedOutfitImageId, normalizeVisionModelList, requestOutfitVision } from '../outfit-vision.js';

const image = 'data:image/png;base64,dGVzdA==';
const messages = buildOutfitVisionMessages(image, '重点识别领口');
assert.equal(messages[1].content[1].image_url.url, image);
assert.match(messages[0].content, /Back fields must be null/);
assert.throws(() => buildOutfitVisionMessages('https://example.com/private-image'), /格式/);
assert.equal(selectedOutfitImageId({ photoImageIds: ['a', 'b'], selectedPhotoIndex: 0 }), 'a');
assert.equal(selectedOutfitImageId({ photoImageIds: ['a', 'b'], selectedPhotoIndex: 1 }), 'b');
assert.equal(selectedOutfitImageId({ photoImageIds: [] }), null);

const output = { nameCN: '水手服', nameEN: 'sailor uniform', upperBody: 'black sailor collar top, white necktie', fullBody: 'black pleated skirt, dark tights, brown loafers', upperBodyBack: null, fullBodyBack: null, photoPrompt: 'black sailor collar top, white necktie, black pleated skirt, dark tights, brown loafers', notes: '背面不可见，材质无法确认' };
const result = parseOutfitVisionResult('```json\n' + JSON.stringify(output) + '\n```');
assert.equal(result.upperBodyBack, null);
assert.throws(() => parseOutfitVisionResult('not JSON'), /JSON/);
assert.throws(() => parseOutfitVisionResult(JSON.stringify({ ...output, fullBody: [] })), /字段/);
assert.throws(() => parseOutfitVisionResult('{}'), /可保存/);
const preset = { upperBody: 'old top', upperBodyBack: 'old back', photoImageIds: ['a', 'b'], selectedPhotoIndex: 1, sendPhoto: true };
applyOutfitVisionResult(preset, result, ['upperBody', 'fullBody', 'photoPrompt']);
assert.equal(preset.upperBodyBack, 'old back');
assert.equal(preset.fullBody, output.fullBody);
assert.equal(preset.selectedPhotoIndex, 1);
assert.deepEqual(preset.photoImageIds, ['a', 'b']);
applyOutfitVisionResult(preset, { upperBodyBack: '' }, ['upperBodyBack']);
assert.equal(preset.upperBodyBack, '');
assert.throws(() => applyOutfitVisionResult(preset, { api_key: 'bad' }, ['api_key']));
assert.deepEqual(normalizeVisionModelList({ data: [{ id: 'b' }, { name: 'a' }, 'b'] }), ['a', 'b']);

const profile = { api_url: 'https://example.test/v1/', api_key: 'test-key', model: 'original', send_images: false, max_tokens: 30000, enable_custom_body_params: true, custom_body_params: '{"model":"wrong","messages":[],"stream":true,"tools":[{}],"max_completion_tokens":1,"reasoning_effort":"low"}' };
const originalProfile = structuredClone(profile);
const helpers = { getHeaders: () => ({ 'X-CSRF-Token': 'local-test' }), parseHeaders: JSON.parse, parseBody: JSON.parse, includeHeaders: key => `Authorization: "Bearer ${key}"` };
let calls = [];
const mockFetch = async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }; };
await requestOutfitVision({ profile, model: 'selected-vision-model', messages, fetchImpl: mockFetch, ...helpers });
let body = JSON.parse(calls[0].options.body);
assert.equal(calls[0].url, '/api/backends/chat-completions/generate');
assert.equal(body.model, 'selected-vision-model');
assert.equal(body.messages[1].content[1].image_url.url, image); // Profile send_images=false must not strip it.
assert.equal(body.stream, false);
assert.equal(body.max_tokens, 8192);
assert.equal(body.tools, undefined);
assert.equal(body.max_completion_tokens, undefined);
assert.equal(body.reasoning_effort, 'low');
assert.deepEqual(profile, originalProfile); // Independent selection must not mutate original API profile.
await requestOutfitVision({ profile: { ...profile, bypass_proxy: true }, model: 'vision', messages, fetchImpl: mockFetch, ...helpers });
assert.equal(calls[1].url, 'https://example.test/v1/chat/completions');
assert.equal(calls[1].options.headers.Authorization, 'Bearer test-key');
assert.equal(JSON.parse(calls[1].options.body).custom_include_headers, undefined);
const listFetch = async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ data: [{ id: 'vision' }] }) }; };
assert.deepEqual(await requestOutfitVision({ profile: { ...profile, bypass_proxy: true }, listModels: true, fetchImpl: listFetch, ...helpers }), ['vision']);
assert.equal(calls[2].options.method, 'GET');
assert.equal(calls[2].options.body, undefined);
await requestOutfitVision({ profile, listModels: true, fetchImpl: listFetch, ...helpers });
assert.equal(calls[3].url, '/api/backends/chat-completions/status');
assert.equal(JSON.parse(calls[3].options.body).messages, undefined);
await assert.rejects(requestOutfitVision({ profile, model: 'vision', messages, ...helpers, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'secret dump test-key' }) }) }), error => !error.message.includes('test-key') && /401/.test(error.message));
const abortController = new AbortController(); abortController.abort();
await assert.rejects(requestOutfitVision({ profile, model: 'vision', messages, ...helpers, signal: abortController.signal, fetchImpl: async (_, opts) => { opts.signal.throwIfAborted(); } }), { name: 'AbortError' });

// Verify approved values enter the actual upstream outfit injection fields.
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const start = source.indexOf('function getOutfitPromptData(');
const end = source.indexOf('\nfunction ', start + 1);
const getData = vm.runInNewContext(source.slice(start, end) + '\ngetOutfitPromptData', {mergePromptTags});
assert.equal(getData(preset).upperBody, output.upperBody);
assert.equal(getData(preset).lowerBody, output.fullBody);
// Real save function must retain selected reference photo when saving ordinary outfit edits later.
const saveStart = source.indexOf('function saveCurrentOutfitData(');
const saveEnd = source.indexOf('function deleteOutfitPreset(', saveStart);
const settings = { outfitPresets: { test: preset } };
const saveReal = vm.runInNewContext(source.slice(saveStart, saveEnd) + '\nsaveCurrentOutfitData', { extension_settings23: { test: settings }, extensionName: 'test', document: { getElementById: () => null }, saveSettingsDebounced16() {} });
saveReal('test');
assert.equal(settings.outfitPresets.test.selectedPhotoIndex, 1);
assert.equal(settings.outfitPresets.test.photoImageIds[1], 'b');
console.log('Outfit vision request, parsing, selective save, cancellation, image retention and actual injection tests passed.');
