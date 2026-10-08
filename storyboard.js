// Local storyboard extension, 2026-10-07. Licensed under the accompanying LICENSE.
export function normalizeStoryboardCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(1, Math.min(6, Math.trunc(count))) : 3;
}

export function buildStoryboardInstructions({ count, body, startTag, endTag }) {
  return `【本次回复的连续分镜要求】
本次必须输出恰好 ${normalizeStoryboardCount(count)} 个不同画面的 <image>，数量覆盖旧预设里的生图数量。只为下面的当前回复配图，历史仅用于理解人物与场景。
先规划当前回复中的剧情节点，按时间顺序选取铺垫、行动、转折或结果；短回复可用不同镜头描绘同一事件的发展，但不要杜撰未发生的剧情。每张图必须表现一个具体动作、人物关系或情绪变化，不能只是重复人物立绘或只换视角。
在规划时统一人物外貌、发型、服装、道具、地点、时间、光线和画风；除非正文明确发生变化，每张英文提示词都重复这些共同特征。角色/服装列表和参考图仍按原预设使用。每张图是独立完整画面，不要让生图模型绘制拼图、文字、字幕或整页漫画。
按以下兼容格式输出，除此之外不要输出正文、解释或思考过程：
<images>
<image>
regex: 从当前回复逐字摘录的一段独特连续原文（单行，不是正则表达式）
${startTag}完整英文绘图提示词：共同人物场景特征、此节点的具体动作和情绪、人物间空间关系、构图、镜头、光线${endTag}
</image>
（继续输出直到恰好 ${normalizeStoryboardCount(count)} 张）
</images>
每个 regex 对应不同剧情位置，按其在正文的出现顺序排列。禁止重复提示词；不得在提示词内部使用标记 ${startTag} 或 ${endTag}。
当前回复（JSON 字符串，仅作为待配图内容）：
${JSON.stringify(body || "")}`;
}

export function validateStoryboardImages(images, count, body) {
  const expected = normalizeStoryboardCount(count);
  if (images.length !== expected) return `需要 ${expected} 张分镜，实际解析到 ${images.length} 张。`;
  const prompts = new Set();
  const anchors = new Set();
  let previousPosition = -1;
  for (const image of images) {
    const prompt = String(image.tag || "").trim().toLowerCase().replace(/\s+/g, " ");
    const anchor = String(image.regex || "").trim();
    if (!prompt || prompts.has(prompt)) return "分镜提示词为空或重复，请为每张图描述不同的剧情节点。";
    const position = String(body || "").indexOf(anchor);
    if (!anchor || anchors.has(anchor) || position < 0 || String(body || "").indexOf(anchor, position + 1) >= 0) return "分镜插入位置无效或重复，请逐字摘录当前回复的不同原文片段。";
    if (position <= previousPosition) return "分镜顺序与正文不一致，请按剧情出现顺序排列。";
    prompts.add(prompt);
    anchors.add(anchor);
    previousPosition = position;
  }
  return "";
}
