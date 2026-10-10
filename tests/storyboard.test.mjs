import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeStoryboardCount, buildStoryboardInstructions, validateStoryboardImages } from '../storyboard.js';

const body = '她走入书店。她找到遗失的信。她带着信离开。';
const shots = [
  { regex: '她走入书店。', tag: 'image###woman entering a bookstore###' },
  { regex: '她找到遗失的信。', tag: 'image###woman finding a letter###' },
  { regex: '她带着信离开。', tag: 'image###woman leaving with a letter###' },
];
assert.equal(validateStoryboardImages(shots, 3, body), '');
assert.match(validateStoryboardImages(shots.slice(0, 2), 3, body), /实际解析到 2/);
assert.match(validateStoryboardImages([...shots, shots[0]], 3, body), /实际解析到 4/);
assert.match(validateStoryboardImages([shots[0], { ...shots[1], tag: shots[0].tag }, shots[2]], 3, body), /重复/);
assert.match(validateStoryboardImages([shots[0], { ...shots[1], regex: '她走到河边。' }, shots[2]], 3, body), /位置/);
assert.match(validateStoryboardImages([...shots].reverse(), 3, body), /顺序/);
assert.match(validateStoryboardImages([{ regex: '她点头。', tag: 'nod' }], 1, '她点头。她点头。'), /位置/);
assert.deepEqual([-4, 2.8, 12, 'invalid'].map(normalizeStoryboardCount), [1, 2, 6, 3]);

// Run the actual upstream parser against storyboard output, including custom markers.
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const parser = source.slice(source.indexOf('function parseImagesFromPrompt('), source.indexOf('async function insertImagesIntoElement('));
for (const [startTag, endTag] of [['image###', '###'], ['[prompt]', '[/prompt]']]) {
  const sandbox = {
    debugTimer: () => ({ end() {} }), debugBranch() {}, debugLog() {}, debugContent() {},
    applyWordReplacement: text => text, removeThinkingTextOnly: text => text,
    convertNewXmlFormatToOld: text => text,
    normalizeImagesReply: text => ({ changed: false, output: text }),
    getImageTags: () => ({ startTag, endTag }),
    extension_settings11: { test: { tagthinkEcho: 'false' } }, extensionName: 'test',
    toastr: { warning: text => { throw new Error(text); } },
    console: { log() {}, group() {}, groupEnd() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(parser, sandbox);
  const output = '<images>' + shots.map((shot, i) => `<image>\nregex: ${shot.regex}\n${startTag}woman in blue coat, bookstore, action ${i + 1}${endTag}\n</image>`).join('\n') + '</images>';
  const parsed = sandbox.parseImagesFromPrompt(output);
  assert.equal(validateStoryboardImages(parsed, 3, body), '');
  assert.equal(parsed.length, 3);
  const instructions = buildStoryboardInstructions({ count: 3, body, startTag, endTag });
  assert.ok(instructions.includes(startTag));
  assert.ok(instructions.includes(JSON.stringify(body)));
}
// Exercise the actual request pipeline with a mocked LLM and insertion boundary.
const requestPipeline = source.slice(source.indexOf('async function processImageLikeRequest('), source.indexOf('var init_promptReq', source.indexOf('async function processImageLikeRequest(')));
async function runRequest(results, { stale = false, autoReply = true, comfyLegacy = false } = {}) {
  const message = { mes: body };
  const context = { chat: [message], chatMetadata: { variables: {} } };
  const settings = { storyboardEnabled: 'true', storyboardImageCount: 3, zidongdianji: 'false' };
  if (comfyLegacy) settings.mode = 'comfyui';
  let calls = 0;
  let inserted = [];
  const warnings = [];
  const sandbox = {
    getTagGenerationChain: () => 'legacy',
    usesStructuredTagChain: (type, current, chain) => type === 'image_gen' && current?.mode === 'comfyui' && chain === 'structured',
    normalizeStoryboardCount, buildStoryboardInstructions, validateStoryboardImages,
    getContext12: () => context, extension_settings40: { test: settings }, extensionName: 'test',
    debugTimer: () => ({ end() {} }), debugMilestone() {}, debugLog() {}, debugBranch() {}, debugError() {},
    toastr: { info() {}, success() {}, error: text => warnings.push(text), warning: text => warnings.push(text) },
    getElContext: async (_el, depth) => { assert.equal(depth, 3); return ['以前的剧情', body]; },
    processWorldBooksWithTrigger: async () => '',
    buildPromptForRequestType: () => [{ role: 'user', content: body }],
    generateCharacterListText: () => '', generateOutfitEnableListText: () => '', generateCommonCharacterListText: () => '',
    mergeAdjacentMessages: messages => messages, getMergeOptionsForRequestType: () => ({}),
    replaceAllPlaceholders: async messages => ({ messages, replacedVariables: new Set() }),
    getImageTags: () => ({ startTag: 'image###', endTag: '###' }),
    getEnabledCharacterImages: async () => [], getEnabledOutfitImages: async () => [], getCommonCharacterImages: async () => [],
    updateCombinedPrompt() {}, addLog() {}, removeThinkingTags: text => text,
    parseImagesFromPrompt: text => JSON.parse(text),
    insertImagesIntoElement: async (_el, images) => { inserted = images; },
    buildParseFailureToastInfo: () => ({ level: 'warning', message: 'invalid', title: 'invalid' }),
    console: { log() {}, error() {}, warn() {} }, setTimeout: callback => { callback(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(requestPipeline, sandbox);
  const el = { isConnected: true, closest: () => ({ getAttribute: () => '0' }) };
  const llm = async (messages, options) => {
    calls++;
    if (comfyLegacy) assert.equal(options.legacyTagChain, true);
    if (autoReply) assert.ok(messages.some(m => m.content.includes('连续分镜要求')));
    if (stale) context.chat = [{ mes: '新的聊天' }];
    return { result: JSON.stringify(results[Math.min(calls - 1, results.length - 1)]) };
  };
  await sandbox.processImageLikeRequest(el, 'gesture1', 'image_gen', '生图', llm, { autoReply });
  return { calls, inserted, warnings };
}
const corrected = await runRequest([shots.slice(0, 1), shots]);
assert.equal(corrected.calls, 2);
assert.equal(corrected.inserted.length, 3);
const failed = await runRequest([shots.slice(0, 1)]);
assert.equal(failed.calls, 2);
assert.equal(failed.inserted.length, 0);
assert.ok(failed.warnings.some(text => text.includes('未提交生图')));
assert.equal((await runRequest([shots], { stale: true })).inserted.length, 0);
const manual = await runRequest([shots.slice(0, 1)], { autoReply: false });
assert.equal(manual.calls, 1);
assert.equal(manual.inserted.length, 1);
assert.equal((await runRequest([shots], {comfyLegacy:true})).inserted.length,3);
console.log('Storyboard validation, upstream parser, retry/insertion, stale-chat and manual-flow tests passed.');
