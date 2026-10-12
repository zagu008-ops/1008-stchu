// Share the existing FAB's click and drag behavior; only position the quick panel.
export function mountUnifiedQuick(quick, button, popup, render, view = window) {
    const doc = button.ownerDocument;
    const fab = doc.getElementById('st-chatu8-fab');
    if (!fab) return null;
    button.hidden = true;
    quick.dataset.unified = 'true';
    const place = () => {
        const v = view.visualViewport;
        const width = v?.width || view.innerWidth, height = v?.height || view.innerHeight;
        const ox = v?.offsetLeft || 0, oy = v?.offsetTop || 0;
        const rect = fab.getBoundingClientRect(), panelWidth = Math.min(300, width - 24);
        const left = Math.max(12, Math.min(rect.right - ox - panelWidth, width - panelWidth - 12));
        const below = rect.top - oy < height / 2;
        Object.assign(quick.style, {left:(ox+left)+'px',top:(below ? rect.bottom+12 : rect.top-12)+'px',right:'auto',bottom:'auto'});
        Object.assign(popup.style, {width:panelWidth+'px',left:'0',right:'auto',top:below?'0':'auto',bottom:below?'auto':'0',
            maxHeight:Math.max(80, (below ? height-(rect.bottom-oy) : rect.top-oy)-24)+'px',overflowY:'auto'});
    };
    const toggle = () => {
        quick.hidden = false;
        popup.hidden = !popup.hidden;
        if (!popup.hidden) {render();place();}
        fab.setAttribute('aria-expanded',String(!popup.hidden));
    };
    view.toggleCosjiQuick = toggle;
    fab.setAttribute('role','button');fab.setAttribute('tabindex','0');
    fab.setAttribute('aria-label','生图快捷：角色、服装与完整设置');
    fab.setAttribute('aria-controls',popup.id);fab.setAttribute('aria-expanded','false');
    fab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
    doc.addEventListener('click',e=>{if(!quick.contains(e.target)&&!fab.contains(e.target)){popup.hidden=true;fab.setAttribute('aria-expanded','false');}});
    doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popup.hidden){popup.hidden=true;fab.setAttribute('aria-expanded','false');fab.focus();}});
    view.addEventListener('resize',place);
    view.visualViewport?.addEventListener('resize',place);
    view.visualViewport?.addEventListener('scroll',place);
    if(view.MutationObserver){
        new view.MutationObserver(()=>{if(!popup.hidden)place();}).observe(fab,{attributes:true,attributeFilter:['style','class']});
        new view.MutationObserver(()=>fab.setAttribute('aria-expanded',String(!popup.hidden&&!quick.hidden))).observe(popup,{attributes:true,attributeFilter:['hidden']});
    }
    place();return place;
}
