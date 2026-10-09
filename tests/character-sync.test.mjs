import { mergePromptTags } from '../wardrobe-store.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { collectRoleSources, buildRoleSyncMessages, parseRoleSyncResult, planRoleSync, saveRoleSync, findSharedRole, normalizeRoleName, roleMentionExcerpt, selectRoleSources, worldEntryMatches } from '../character-sync.js';
import { requestOutfitVision } from '../outfit-vision.js';
const loaded = [];
const ctx = { characterId: 0, chatId: 'chat-a', characters: [{ avatar: 'Alice.png', data: { name: '爱丽丝', description: '爱丽丝又名小爱，有蓝眼睛。鲍勃是黑发男士。', extensions: { world: '人物' }, character_book: { entries: [{ content: '内嵌人物安娜是医生。', enabled: true }, { content: '禁用人物', enabled: false }] } } }], chatMetadata: { world_info: '聊天书' }, chat: [{ is_user: false, mes: '爱丽丝遇见查理。查理天生绿眼睛。他正在跑步，穿红外套。' }], loadWorldInfo: async name => { loaded.push(name); return { entries: { 1: { comment: '组织名称', content: '爱丽丝有红眼睛，长黑发。莉莉是金发女士。' }, 2: { content: '禁用条目', disable: true } } }; } };
const indexed = await collectRoleSources(ctx, { globalSelect: ['全局', '人物'], charLore: [{ name: 'Alice', extraBooks: ['额外'] }] });
const collected = { ...indexed, sources: selectRoleSources(indexed, indexed.entries.map(entry => entry.id)) };
assert.equal(indexed.sources.world, '[]');
assert.equal(indexed.entries.length, 5);
assert(worldEntryMatches({ title: '林昭衣 · 性爱', keys: [] }, ['林昭衣']));
assert(!worldEntryMatches({ title: 'Anna', keys: [] }, ['Ann']));
assert.equal(selectRoleSources(indexed, []).world, '[]');
const hugeWorld = await collectRoleSources({ ...ctx, loadWorldInfo: async () => ({ entries: { x: { comment: '大条目', content: 'a'.repeat(130000) }, y: { comment: '查理', key: ['查理'], content: '查理天生绿眼睛。' } } }) });
assert.equal(hugeWorld.sources.world, '[]');
assert.throws(() => selectRoleSources(hugeWorld, hugeWorld.entries.filter(entry => entry.title === '大条目').map(entry => entry.id)), /分次同步/);
assert(selectRoleSources(hugeWorld, hugeWorld.entries.filter(entry => entry.title === '查理').map(entry => entry.id)).world.includes('绿眼睛'));
assert.deepEqual(loaded, ['人物', '聊天书', '额外', '全局']);
assert(!collected.sources.world.includes('禁用'));
assert(collected.sources.world.includes('内嵌人物安娜'));
assert(buildRoleSyncMessages(collected.sources)[0].content.includes('NEVER store temporary clothing'));
await assert.rejects(collectRoleSources({ ...ctx, groupId: 'group' }), /单个角色卡/);
await assert.rejects(collectRoleSources({ ...ctx, characters: [{ data: { description: 'a'.repeat(120001) } }] }), /12 万/);
await assert.rejects(collectRoleSources({ ...ctx, loadWorldInfo: async () => null }), /不存在/);
const person = (name, evidence, fields, aliases = []) => ({ name, evidence, fields, aliases });
const output = {
 card: [person('爱丽丝', '爱丽丝又名小爱，有蓝眼睛。', { facialFeatures: { value: 'blue eyes', evidence: '有蓝眼睛' } }, ['小爱'])],
 world: [person('爱丽丝', '爱丽丝有红眼睛，长黑发。', { facialFeatures: { value: 'red eyes', evidence: '有红眼睛' }, characterTraits: { value: 'long black hair', evidence: '长黑发' } }), person('莉莉', '莉莉是金发女士。', { facialFeatures: { value: 'blonde hair', evidence: '金发女士' } }), person('组织名称', '组织名称', {})],
 chat: [person('查理', '查理天生绿眼睛。', { facialFeatures: { value: 'green eyes', evidence: '天生绿眼睛' } }), person('不存在', '伪造引用', {}), person('爱丽丝', '爱丽丝遇见查理。', { fullBodySFW: { value: 'invented', evidence: '不存在引用' } })],
};
const roles = parseRoleSyncResult(JSON.stringify(output), collected.sources);
assert.equal(roles.length, 3);
assert.equal(roles[0].fields.facialFeatures, 'blue eyes');
assert.equal(roles[0].sources.facialFeatures, 'card');
assert.equal(roles[0].fields.characterTraits, 'long black hair');
assert.equal(roles[0].sources.characterTraits, 'world');
assert.equal(roles[0].fields.fullBodySFW, undefined);
assert.equal(roles[2].sources.facialFeatures, 'chat');
const titleSources = { card: '{}', world: JSON.stringify([{ title: '林昭衣 · 外貌', keys: ['林昭衣'], content: '她有蓝眼睛。' }]), chat: '[]' };
const titled = parseRoleSyncResult(JSON.stringify({ card: [], world: [person('林昭衣', '她有蓝眼睛。', { facialFeatures: { value: 'blue eyes', evidence: '蓝眼睛' } })], chat: [] }), titleSources);
assert.equal(titled[0].name, '林昭衣');
assert.equal(titled[0].fields.facialFeatures, 'blue eyes');
assert.throws(() => parseRoleSyncResult('{}', collected.sources), /格式错误/);
assert.throws(() => parseRoleSyncResult('not json', collected.sources), /有效/);
assert.equal(normalizeRoleName(' ＡLiCe '), 'alice');
const presets = { '我的爱丽丝': { nameCN: '爱丽丝|小爱', facialFeatures: 'manual eyes', outfits: ['水手服'], photoImageIds: ['img'], photoMedia: [{ id: 'img' }], negative: 'bad hands' } };
assert.equal(findSharedRole(presets, { name: '小爱' }), '我的爱丽丝');
assert.throws(() => findSharedRole({ ...presets, another: { nameCN: '小爱' } }, { name: '小爱' }), /多个/);
const plans = planRoleSync(presets, roles);
assert.equal(plans[0].id, '我的爱丽丝');
assert.deepEqual(planRoleSync(presets, roles, collected.latest).map(role => role.name), ['爱丽丝', '查理']);
assert(roleMentionExcerpt(roles[2], collected.latest).includes('查理天生绿眼睛'));
assert.equal(roleMentionExcerpt({ name: '不存在', aliases: [] }, collected.latest), '');
const settings = { characterPresets: structuredClone(presets) };
const choices = plans.map(plan => ({ ...plan, selected: true, values: Object.fromEntries(Object.entries(plan.fields).filter(([key]) => !plan.original?.[key])) }));
assert.equal(saveRoleSync(settings, choices), 3);
assert.equal(settings.characterPresets['我的爱丽丝'].facialFeatures, 'manual eyes');
assert.equal(settings.characterPresets['我的爱丽丝'].characterTraits, 'long black hair');
assert.deepEqual(settings.characterPresets['我的爱丽丝'].outfits, ['水手服']);
assert.deepEqual(settings.characterPresets['我的爱丽丝'].photoImageIds, ['img']);
assert.equal(settings.characterPresets['我的爱丽丝'].negative, 'bad hands');
assert.deepEqual(settings.characterCommonPresets['同步通用角色列表'].characters, ['我的爱丽丝', '莉莉', '查理']);
const again = planRoleSync(settings.characterPresets, roles).map(plan => ({ ...plan, selected: true, values: {} }));
saveRoleSync(settings, again);
assert.equal(Object.keys(settings.characterPresets).length, 3);
assert.equal(settings.characterCommonPresets['同步通用角色列表'].characters.length, 3);
const stale = structuredClone(settings);
assert.throws(() => saveRoleSync(stale, choices), /已被修改/);
assert.deepEqual(stale, settings);
const empty = {};
assert.throws(() => saveRoleSync(empty, [{ ...plans[1], selected: true, values: {} }]), /名称字段/);
assert.deepEqual(empty, {});
assert.throws(() => saveRoleSync({}, [{ id: '__proto__', name: '__proto__', selected: true, original: null, values: { nameCN: '__proto__' } }]), /不可用/);
const network = { getHeaders: () => ({}), parseHeaders: () => ({}), parseBody: () => ({}), includeHeaders: () => '' };
let payload;
const requested = await requestOutfitVision({ ...network, profile: { api_url: 'https://example.test/v1', api_key: 'test' }, model: 'text-test', messages: buildRoleSyncMessages(collected.sources), parseResult: text => parseRoleSyncResult(text, collected.sources), fetchImpl: async (_, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }; } });
assert.equal(requested.length, 3);
assert.equal(payload.model, 'text-test');
assert.equal(typeof payload.messages[1].content, 'string');
// Exercise the installed plugin's real common-list renderer, not a duplicate implementation.
const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end);
}
const rendered = vm.runInNewContext([
  extract('normalizeCharacterEnableEntry'), extract('getCharacterPromptData'),
  extract('applyInjectionTemplate'), extract('generateCommonCharacterListText'),
  'generateCommonCharacterListText()',
].join('\n'), {
  mergePromptTags, extension_settings25: { test: settings }, extensionName: 'test',
  renderCharacterOutfitsText: () => '',
  PLACEHOLDER_RE: /\{\{(\w+)\}\}/g,
  getActiveInjectionTemplates: () => ({ commonCharacterListTemplate: '{{nameCN}}: {{facial}}, {{traits}}' }),
});
assert(rendered.includes('查理: green eyes'));
assert(rendered.includes('爱丽丝|小爱: manual eyes, long black hair'));
assert(rendered.includes('莉莉: blonde hair'));
console.log('Character sync: source priority, evidence, enabled lorebooks, same-name reuse, batch safety, media retention and text request tests passed.');
