// Empty preserves the workflow's own CLIP setting.
export function applyComfyClipSkip(workflow, value) {
  if (value === undefined || value === null || String(value).trim() === '') return workflow;
  const layer = Number(value);
  if (!Number.isInteger(layer) || layer > -1 || layer < -24) throw Error('CLIP skip 请填写 -24 到 -1 的整数，或留空沿用工作流。');
  const nodes = Object.values(workflow).filter(node => node.class_type === 'CLIPSetLastLayer');
  if (!nodes.length) throw Error('当前工作流没有 CLIPSetLastLayer 节点，请添加该节点，或清空插件的 CLIP skip 设置。');
  for (const node of nodes) { node.inputs ||= {}; node.inputs.stop_at_clip_layer = layer; }
  return workflow;
}
