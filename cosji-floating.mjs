// Match the image FAB: mouse/touch starts on the button, movement ends on document.
export function mountCosjiFloating(quick, button, popup, activate, view = window) {
    const doc = button.ownerDocument, key = 'cosji-quick-position';
    let position = null, drag = null, suppressClick = false;
    try {
        const saved = JSON.parse(view.localStorage.getItem(key));
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
    } catch {}
    const bounds = () => {
        const v = view.visualViewport, size = button.getBoundingClientRect();
        const width = v?.width || view.innerWidth, height = v?.height || view.innerHeight;
        return {width, height, ox:v?.offsetLeft || 0, oy:v?.offsetTop || 0,
            size, maxX:Math.max(0,width-size.width-12), maxY:Math.max(0,height-size.height-12)};
    };
    const clamp = (n, max) => Math.min(max,Math.max(Math.min(12,max),n));
    const place = () => {
        const b = bounds();
        const x = clamp(position ? position.x*b.maxX : b.width-b.size.width-20,b.maxX);
        const y = clamp(position ? position.y*b.maxY : b.height-164,b.maxY);
        quick.style.left = b.ox+x+'px'; quick.style.right = 'auto';
        quick.style.top = b.oy+y+'px'; quick.style.bottom = 'auto';
        popup.style.width = Math.max(0,Math.min(260,b.width-24))+'px';
        popup.style.boxSizing = 'border-box';
        popup.style.left = x<b.width/2 ? '0' : 'auto';
        popup.style.right = x<b.width/2 ? 'auto' : '0';
        const below = y<b.height/2;
        popup.style.top = below ? b.size.height+12+'px' : 'auto';
        popup.style.bottom = below ? 'auto' : b.size.height+12+'px';
        popup.style.maxHeight = Math.max(0,(below ? b.height-y-b.size.height : y)-24)+'px';
        popup.style.overflowY = 'auto';
    };
    const point = (e, ending = false) => {
        if (!e.type.startsWith('touch')) return e;
        return Array.from(ending ? e.changedTouches : e.touches).find(t=>t.identifier===drag?.id);
    };
    const move = e => {
        if (!drag || e.type.startsWith('touch')!==drag.touch) return;
        const p = point(e); if (!p) return;
        const dx = p.clientX-drag.startX, dy = p.clientY-drag.startY;
        if (!drag.moved && Math.hypot(dx,dy)<6) return;
        drag.moved = true; suppressClick = true;
        e.preventDefault();
        const b = bounds();
        position = {x:clamp(drag.x+dx-b.ox,b.maxX)/(b.maxX||1),
            y:clamp(drag.y+dy-b.oy,b.maxY)/(b.maxY||1)};
        place();
        button.style.cursor = 'grabbing';
    };
    const removeListeners = () => {
        for (const [type,handler] of listeners) doc.removeEventListener(type,handler,true);
        view.removeEventListener('blur',cancel);
    };
    const finish = (e, cancelled = false) => {
        if (!drag) return;
        if (e && (e.type.startsWith('touch')!==drag.touch || !point(e,true))) return;
        const current = drag; drag = null; removeListeners(); button.style.cursor = 'grab';
        if (current.moved) {try {view.localStorage.setItem(key,JSON.stringify(position));} catch {}}
        // touchstart is prevented, so a tap is activated explicitly; no synthetic mouse click.
        if (current.touch && !current.moved && !cancelled) activate();
    };
    const cancel = () => finish(null,true);
    const end = e => finish(e,e.type==='touchcancel');
    const listeners = [['mousemove',move],['mouseup',end],['touchmove',move],['touchend',end],['touchcancel',end]];
    const start = e => {
        const touch = e.type==='touchstart';
        if (drag || (!touch && e.button!==0) || (touch && e.touches.length!==1)) return;
        const p = touch ? e.touches[0] : e, rect = button.getBoundingClientRect();
        suppressClick = false;
        drag = {touch,id:p.identifier,startX:p.clientX,startY:p.clientY,x:rect.left,y:rect.top,moved:false};
        e.preventDefault(); e.stopPropagation();
        for (const [type,handler] of listeners) doc.addEventListener(type,handler,{capture:true,passive:false});
        view.addEventListener('blur',cancel);
    };
    button.style.touchAction = 'none'; button.style.userSelect = 'none';
    button.style.webkitUserSelect = 'none'; button.style.cursor = 'grab';
    button.addEventListener('mousedown',start);
    button.addEventListener('touchstart',start,{passive:false});
    button.addEventListener('contextmenu',e=>e.preventDefault());
    button.addEventListener('dragstart',e=>e.preventDefault());
    button.addEventListener('click',e=>{
        if (suppressClick && e.detail!==0) {e.preventDefault();e.stopPropagation();suppressClick=false;return;}
        suppressClick=false;activate();
    });
    const reposition = () => {cancel();place();};
    view.addEventListener('resize',reposition);
    view.visualViewport?.addEventListener('resize',reposition);
    view.visualViewport?.addEventListener('scroll',reposition);
    place();
    return place;
}
