const terminal = new Set(['success','failed','cancelled','interrupted']);
export function historyPage(rows,page=1,size=10){
    size=[10,20,50].includes(Number(size))?Number(size):10;
    const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.max(1,Math.min(pages,Number(page)||1));
    return {page,pages,size,total:rows.length,rows:rows.slice((page-1)*size,page*size)};
}
export function safeUrl(value) {
    try { const u=new URL(value); return u.origin+u.pathname; } catch { return ''; }
}
export function safeError(value) {
    return String(value?.message ?? value ?? '').replace(/https?:\/\/[^\s"'<>]+/gi,safeUrl).replace(/Bearer\s+\S+/gi,'Bearer [已隐藏]').replace(/(api[_-]?key|token|secret|authorization)(["'\s:=]+)[^\s,;"'}]+/gi,'$1$2[已隐藏]').slice(0,1800);
}
export function createHistory(settings, save=()=>{}, changed=()=>{}) {
    settings.cosji ??= {};
    const rows=settings.cosji.taskHistory ??= [];
    const get=id=>rows.find(r=>r.id===id);
    const persist=()=>{ save(); changed(); };
    function update(id,stage,info={},state='running') {
        const row=get(id); if(!row)return;
        row.stage=safeError(stage);row.state=state;row.updated=Date.now();
        Object.assign(row.info,info);
        row.events.push({time:row.updated,stage:row.stage});
        row.events=row.events.slice(-60);persist();
    }
    function start(kind,info={},parent='') {
        const id=globalThis.crypto.randomUUID();
        rows.unshift({id,kind,parent,created:Date.now(),updated:Date.now(),state:'running',stage:'已接收点击',info,events:[]});
        // Keep active tasks so long requests cannot disappear under newer clicks.
        const completed=rows.filter(r=>terminal.has(r.state));
        for(const r of completed.slice(100)){rows.splice(rows.indexOf(r),1);}
        update(id,'已接收点击');return id;
    }
    for(const row of rows)if(!terminal.has(row.state)&&row.state!=='waiting'){
        row.state='interrupted';row.stage='页面已重新加载，无法继续追踪旧任务；请检查 ComfyUI 队列';row.updated=Date.now();
        row.events.push({time:row.updated,stage:row.stage});
    }
    save();
    function removable(row){return terminal.has(row.state)&&!rows.some(child=>child.parent===row.id&&!terminal.has(child.state));}
    function remove(id){
        const removed=rows.filter(row=>(id?row.id===id:true)&&removable(row));
        if(!removed.length)return 0;
        settings.cosji.historyTrash=structuredClone(removed);
        const ids=new Set(removed.map(r=>r.id));
        for(let i=rows.length-1;i>=0;i--)if(ids.has(rows[i].id))rows.splice(i,1);
        persist();return removed.length;
    }
    function undo(){
        const restored=(settings.cosji.historyTrash||[]).filter(row=>!get(row.id));
        rows.push(...restored);rows.sort((a,b)=>b.created-a.created);
        settings.cosji.historyTrash=[];persist();return restored.length;
    }
    return {rows,get,start,update,terminal,remove,undo,removable};
}
