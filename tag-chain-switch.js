// Page-local selection: never persist temporary routing to plugin settings.
let chain = 'structured';
const subscribers = new Set();
export function getTagGenerationChain() { return chain; }
export function setTagGenerationChain(value) {
  if (!['structured', 'legacy'].includes(value)) throw new Error('未知 tag 链路');
  chain = value;
  for (const update of subscribers) update();
  return chain;
}
export function usesStructuredTagChain(requestType, settings, selected = chain) {
  return requestType === 'image_gen' && settings?.mode === 'comfyui' && selected === 'structured';
}
export function mountTagChainSwitch({document: doc = document, notify = () => {}} = {}) {
  const existing = doc.getElementById('st-chatu8-tag-chain-switch');
  if (existing) return existing;
  const button = doc.createElement('button');
  button.id = 'st-chatu8-tag-chain-switch';
  button.type = 'button';
  button.style.cssText = 'position:fixed;right:12px;top:calc(25vh + env(safe-area-inset-top,0px));z-index:10001;max-width:calc(100vw - 24px);min-height:44px;padding:8px 12px;border:1px solid #9a8ec5;border-radius:22px;background:#272136;color:#fff;box-shadow:0 2px 10px #0006;font-size:13px;line-height:1.4;cursor:pointer;touch-action:none;user-select:none';
  const update = () => {
    button.textContent = chain === 'structured' ? 'Tag：结构化 ⇄' : 'Tag：旧模板 ⇄';
    button.title = '点击切换 ComfyUI 正文生成 tag 链路；拖动调整位置。仅本页临时生效，刷新恢复结构化。已有 tag 和进行中的请求不变。';
    button.setAttribute('aria-label', `${button.textContent}，点击切换，刷新恢复结构化`);
    button.setAttribute('aria-pressed', String(chain === 'legacy'));
  };
  let drag = null, suppressClick = false;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    suppressClick = false;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!suppressClick && Math.hypot(dx, dy) < 6) return;
    suppressClick = true;
    const view = doc.defaultView;
    button.style.right = 'auto';
    button.style.left = `${Math.max(0, Math.min(view.innerWidth - button.offsetWidth, drag.left + dx))}px`;
    button.style.top = `${Math.max(0, Math.min(view.innerHeight - button.offsetHeight, drag.top + dy))}px`;
  });
  const endDrag = () => { drag = null; };
  button.addEventListener('pointerup', endDrag);
  button.addEventListener('pointercancel', endDrag);
  button.addEventListener('lostpointercapture', endDrag);
  button.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { suppressClick = false; return; }
    setTagGenerationChain(chain === 'structured' ? 'legacy' : 'structured');
    notify(`已临时切换为${chain === 'structured' ? '结构化' : '旧版模板'}链路，下一次生成 tag 生效；刷新恢复结构化。`);
  });
  subscribers.add(update);
  update();
  doc.body.append(button);
  return button;
}
