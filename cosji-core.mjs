export const PROMPT_FIELDS = ['fixedPrompt', 'fixedPrompt_end', 'negativePrompt'];

export function withCommonPrompts(preset = {}, settings = {}, presetId) {
    const common=settings.cosji?.commonPrompts || {};
    const roleId=settings.cosji?.presetRoles?.[presetId];
    const roleCommon=settings.cosji?.roleCommonPrompts?.[roleId] || {};
    const commonFields=value=>joinLoras({fixedPrompt:value.positive,negativePrompt:value.negative,loras:value.loras||[]});
    const globalFields=commonFields(common),roleFields=commonFields(roleCommon);
    const combine=(...parts)=>parts.map(value=>String(value??'').trim()).filter(Boolean).join(', ');
    return {...preset,fixedPrompt:combine(globalFields.fixedPrompt,roleFields.fixedPrompt,preset.fixedPrompt),negativePrompt:combine(globalFields.negativePrompt,roleFields.negativePrompt,preset.negativePrompt)};
}

export function splitLoras(preset = {}) {
    const result = { loras: [] };
    for (const field of PROMPT_FIELDS) {
        result[field] = String(preset[field] ?? '').replace(/<lora:([^<>]+)>/gi, (tag, body) => {
            const parts = body.split(':');
            const weights = [];
            while (parts.length > 1 && weights.length < 2 && /^-?\d+(?:\.\d+)?$/.test(parts.at(-1))) weights.unshift(parts.pop());
            if (!parts.join(':').trim() || !weights.length) return tag;
            result.loras.push({name: parts.join(':'), weight: weights[0], clipWeight: weights[1] ?? '', field});
            return '';
        }).replace(/(?:\s*,\s*){2,}/g, ', ').replace(/^\s*,\s*|\s*,\s*$/g, '').trim();
    }
    return result;
}

export function joinLoras(draft) {
    const result = {};
    for (const field of PROMPT_FIELDS) {
        const text = String(draft[field] ?? '').trim();
        const tags = (draft.loras ?? []).filter(l => l.field === field).map(l => {
            if (!l.name?.trim() || /[<>\r\n]/.test(l.name) || !Number.isFinite(Number(l.weight)) || l.weight === '') throw new Error('LoRA 名称或权重无效');
            if (l.clipWeight !== '' && l.clipWeight !== undefined && !Number.isFinite(Number(l.clipWeight))) throw new Error('LoRA CLIP 权重无效');
            return `<lora:${l.name.trim()}:${l.weight}${l.clipWeight !== '' && l.clipWeight !== undefined ? ':' + l.clipWeight : ''}>`;
        });
        result[field] = [text, ...tags].filter(Boolean).join(', ');
    }
    return result;
}

export function migrateCatalog(settings) {
    settings.yushe ??= {};
    const catalog = settings.cosji ??= {};
    catalog.commonPrompts ??= {positive:'',negative:''};
    catalog.roleCommonPrompts ??= {};
    catalog.roles ??= [{id:'uncategorized', name:'未分类'}];
    if (!catalog.roles.some(r => r.id === 'uncategorized')) catalog.roles.unshift({id:'uncategorized', name:'未分类'});
    catalog.presetRoles ??= {};
    for (const name of Object.keys(settings.yushe)) {
        if (!catalog.roles.some(r => r.id === catalog.presetRoles[name])) catalog.presetRoles[name] = 'uncategorized';
    }
    for (const name of Object.keys(catalog.presetRoles)) if (!Object.hasOwn(settings.yushe, name)) delete catalog.presetRoles[name];
    catalog.selectedRole ??= 'uncategorized';
    catalog.comfyConnections ??= [];
    return catalog;
}

export function normalizeComfyUrl(value) {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请输入 http 或 https 的 ComfyUI 地址');
    return url.href.replace(/\/$/, '');
}

export function resolveNativeProfile(profile, context) {
    if (!profile?.cosji_connection_id) return profile;
    const native = context.extensionSettings.connectionManager?.profiles?.find(p => p.id === profile.cosji_connection_id);
    if (!native || native.mode !== 'cc') return {...profile, api_url:'', api_key:'', secret_id:''};
    const api = native.api;
    const base = native['api-url'] || (api === 'openai' ? 'https://api.openai.com/v1' : api === 'google' ? 'https://generativelanguage.googleapis.com' : '');
    return {...profile, api_url:base, api_key:'', secret_id:native['secret-id'], chat_completion_source:api, bypass_proxy:false};
}
