export function fitCosjiEditor(modal, view = window) {
    // Percent height fails when SillyTavern transforms its zero-height HTML root.
    const fit = () => {
        const v = view.visualViewport;
        Object.assign(modal.style, {top:(v?.offsetTop||0)+'px',left:(v?.offsetLeft||0)+'px',
            width:(v?.width||view.innerWidth)+'px',height:(v?.height||view.innerHeight)+'px'});
    };
    view.addEventListener('resize',fit);
    view.visualViewport?.addEventListener('resize',fit);
    view.visualViewport?.addEventListener('scroll',fit);
    fit();
}
export function closeCosjiQuick(doc) {
    const popup = doc.getElementById('cosji-quick-panel');
    if (popup) popup.hidden = true;
}
