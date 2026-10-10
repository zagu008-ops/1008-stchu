// A failed request must release its slot so the same reply can be retried.
export function createTagGenerationRunner() {
  const active = new WeakSet();
  return async (message, run, onBusy = () => {}) => {
    if (!message) return;
    if (active.has(message)) { onBusy(); return; }
    active.add(message);
    try { return await run(); } finally { active.delete(message); }
  };
}

export function installTagGenerationRetry({ root, getMessage, hasTags, run, onError }) {
  const scan = () => {
    for (const mes of root.querySelectorAll('.mes[mesid]')) {
      const message = getMessage(Number(mes.getAttribute('mesid')));
      const existing = mes.querySelector('.st-chatu8-tag-retry');
      const body = mes.querySelector('.mes_text');
      if (!body || !message || message.is_user || message.is_system || !message.mes?.trim() || hasTags(message.mes)) {
        existing?.remove();
        continue;
      }
      if (existing) continue;
      const button = mes.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'menu_button st-chatu8-tag-retry';
      button.textContent = '重试生成 tag';
      button.title = '重新为这条回复生成图片 tag；超时或失败后可再次点击';
      body.before(button);
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = '生成 tag 中…';
        try { await run(body); } catch (error) { onError(error); }
        finally {
          button.disabled = false;
          button.textContent = '重试生成 tag';
          scan();
        }
      });
    }
  };
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; scan(); });
  });
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return () => observer.disconnect();
}
