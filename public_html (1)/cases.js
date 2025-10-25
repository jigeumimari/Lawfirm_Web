/* ===== helpers ===== */
const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const todayStr=()=>new Date().toISOString().slice(0,10);
const fmt=d=> d? new Date(d).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'2-digit'}):'—';
const toast=m=>{const t=$("#toast"); if(!t) return; t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1500);};
const uid=()=> 'C' + Math.random().toString(36).slice(2,7).toUpperCase();
const ROLE=document.documentElement.getAttribute('data-role')||'admin';

/* ---------- UI Confirm (modal with graceful fallback) ---------- */
// Usage: const ok = await confirmUI({title, message, okText, cancelText, danger});
function confirmUI({ title='Confirm', message='Are you sure?', okText='OK', cancelText='Cancel', danger=true } = {}){
  const back = $("#confirmBack");
  // Fallback to native confirm if modal is not in DOM
  if(!back){
    return Promise.resolve(window.confirm(message));
  }
  return new Promise(resolve=>{
    const t=$("#cfTitle"), m=$("#cfMsg"), ok=$("#cfOk"), cancel=$("#cfCancel"), x=$("#cfClose");
    t.textContent=title; m.textContent=message;
    ok.textContent=okText; cancel.textContent=cancelText;
    ok.classList.toggle('danger', !!danger);

    const close=(val)=>{ back.style.display='none';
      ok.onclick = cancel.onclick = x.onclick = null;
      window.removeEventListener('keydown', onKey);
      back.onclick = null;
      resolve(val);
    };
    const onKey=(e)=>{ if(e.key==='Escape') close(false); if(e.key==='Enter') close(true); };

    ok.onclick = ()=> close(true);
    cancel.onclick = x.onclick = ()=> close(false);
    back.onclick = (e)=>{ if(e.target===back) close(false); };

    window.addEventListener('keydown', onKey);
    back.style.display='flex';
    ok.focus();
  });
}

/* ===== theme ===== */
(function(){
  const root=document.documentElement;
  const saved=localStorage.getItem('theme')||'dark';
  if(saved==='light') root.classList.add('light');
  const sw=$("#theme"); if(!sw) return;
  const set=(dark)=>{ sw.classList.toggle('on',dark); localStorage.setItem('theme',dark?'dark':'light'); root.classList.toggle('light',!dark); };
  set(saved!=='light'); sw.onclick=()=> set(!sw.classList.contains('on'));
})();

/* ===== demo data (replace with API) =====
   NEW: each case has `assignedTo` (paralegal) so they can edit only their cases. */
let caseTypes=['Family Law','Civil Litigation','Criminal Defense','Immigration'];
let items=[
  {id:uid(),ref:'REF-77330',title:'Theft Allegation',client:'John Cruz',lawyer:'Atty. Vega',type:'Criminal Defense',stage:-1,opened:'2025-10-18',hearing:'',updated:'2025-10-22',status:'Active',desc:'Interview and intake.',docs:[],assignedTo:'Paula Vega'},
  {id:uid(),ref:'REF-10234',title:'Custody Petition',client:'Maria Santos',lawyer:'Atty. Cruz',type:'Family Law',stage:0,opened:'2025-10-02',hearing:todayStr(),updated:'2025-10-21',status:'Active',desc:'Filing and mediation preparation.',docs:['Petition.pdf'],assignedTo:'Paula Vega'},
  {id:uid(),ref:'REF-99120',title:'Breach of Contract',client:'Acme Corp.',lawyer:'Atty. Reyes',type:'Civil Litigation',stage:1,opened:'2025-08-10',hearing:'2025-11-15',updated:'2025-10-19',status:'Active',desc:'Discovery ongoing.',docs:['Contract.pdf','DemandLetter.pdf'],assignedTo:'Paula Vega'},
  {id:uid(),ref:'REF-44021',title:'Work Permit Appeal',client:'Ali Khan',lawyer:'Atty. Dizon',type:'Immigration',stage:1,opened:'2025-09-20',hearing:'2025-12-05',updated:'2025-10-18',status:'Active',desc:'Compiling exhibits.',docs:[],assignedTo:'—'},
];

// Demo “current users”
const CURRENT={
  paralegal:{name:'Paula Vega'},
  client:{name:'Maria Santos'}
};

/* ===== role scoping ===== */
function scopedItems(){
  if(ROLE==='admin') return items;
  if(ROLE==='paralegal'){
    const mine = items.filter(i=> i.assignedTo===CURRENT.paralegal.name);
    return mine.length ? mine : items; // demo fallback only
  }
  if(ROLE==='client'){
    return items.filter(i=> i.client===CURRENT.client.name);
  }
  return items;
}
const canEdit = (c)=>
  ROLE==='admin' || (ROLE==='paralegal' && c.assignedTo===CURRENT.paralegal.name);

/* ===== KPIs ===== */
function refreshKPIs(){
  const list=scopedItems(); const year=(new Date()).getFullYear();
  const active=list.filter(i=>i.status!=='Closed').length;
  const newThisMonth=list.filter(i=>{
    const d=new Date(i.opened); return d.getFullYear()===year && d.getMonth()===(new Date()).getMonth();
  }).length;
  const hearings=list.filter(i=>i.status!=='Closed' && i.hearing && i.hearing>=todayStr()).length;
  const closedYTD=list.filter(i=>i.status==='Closed' && new Date(i.updated).getFullYear()===year).length;
  $("#kpiActive") && ($("#kpiActive").textContent=active);
  $("#kpiNew") && ($("#kpiNew").textContent=newThisMonth);
  $("#kpiHearing") && ($("#kpiHearing").textContent=hearings);
  $("#kpiClosed") && ($("#kpiClosed").textContent=closedYTD);
}

/* ===== Case Types (build selects, tags, datalist) ===== */
function rebuildTypeOptions(){
  const dl=$("#typeOptions");
  if(dl){ dl.innerHTML=`<option value="Case Type: All"></option>` + caseTypes.map(t=>`<option value="${t}"></option>`).join(''); }
  const sel=$("#fType"); if(sel){ sel.innerHTML='<option value="">Case Type: All</option>'+caseTypes.map(t=>`<option>${t}</option>`).join(''); }
  const editSel=$("#typeSelect"); if(editSel){ editSel.innerHTML=caseTypes.map(t=>`<option>${t}</option>`).join(''); }
}
function renderTypeTags(){
  const box=$("#typeTags"); if(!box) return;
  box.querySelectorAll('.tag').forEach(x=>x.remove());
  caseTypes.forEach(t=>{
    const el=document.createElement('span'); el.className='tag';
    el.innerHTML=`${t} <button title="Remove" aria-label="Remove">×</button>`;
    el.querySelector('button').onclick=()=>{ caseTypes = caseTypes.filter(x=>x!==t); rebuildTypeOptions(); renderTypeTags(); };
    box.insertBefore(el,$("#typeInput"));
  });
}
$("#typeInput") && $("#typeInput").addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault();
    const v=e.target.value.trim(); if(!v) return;
    if(!caseTypes.includes(v)) caseTypes.push(v);
    e.target.value=''; rebuildTypeOptions(); renderTypeTags();
  }
});

/* Manage Types (admin only) */
const typesBack=$("#typesBack");
if(typesBack){
  const open=()=> typesBack.style.display='flex', close=()=> typesBack.style.display='none';
  $("#manageTypesBtn").onclick=open; $("#typesClose").onclick=close; $("#typesDone").onclick=close;
  const listEl=$("#typesList"), search=$("#typeSearch"), addBtn=$("#typeAdd"), newInp=$("#typeNew");
  function renderList(){
    const q=(search.value||'').toLowerCase().trim();
    listEl.innerHTML = caseTypes
      .filter(t=>!q || t.toLowerCase().includes(q))
      .map(t=>`<div class="type-row"><input value="${t}" data-old="${t}">
        <div><button class="btn secondary mini" data-save="${t}">Save</button>
        <button class="btn mini" data-del="${t}">Delete</button></div></div>`).join('') || `<div class="empty">No types.</div>`;
  }
  search.oninput=renderList;
  addBtn.onclick=()=>{ const v=(newInp.value||'').trim(); if(!v) return; if(!caseTypes.includes(v)) caseTypes.push(v); newInp.value=''; rebuildTypeOptions(); renderTypeTags(); renderList(); };
  listEl.onclick=(e)=>{
    const del=e.target.closest('[data-del]'); const save=e.target.closest('[data-save]');
    if(del){ caseTypes = caseTypes.filter(x=>x!==del.dataset.del); rebuildTypeOptions(); renderTypeTags(); renderList(); }
    if(save){ const row=save.closest('.type-row'); const inp=row.querySelector('input'); const old=inp.dataset.old; const v=inp.value.trim(); if(!v) return;
      const i=caseTypes.indexOf(old); if(i>-1) caseTypes[i]=v; rebuildTypeOptions(); renderTypeTags(); renderList();
    }
  };
  renderList();
}

/* ===== Filters ===== */
const filters={q:'',stage:'',type:'',sort:'updated_desc'};
$("#q") && ($("#q").oninput=e=>{filters.q=e.target.value.toLowerCase().trim(); render();});
$("#fStage") && ($("#fStage").onchange=e=>{filters.stage=e.target.value; render();});
$("#fType") && ($("#fType").onchange=e=>{filters.type=e.target.value; render();});
$("#fTypeInput") && ($("#fTypeInput").addEventListener('input', e=>{
  const v=e.target.value.trim(); filters.type = (v==='' || v==='Case Type: All') ? '' : v; render();
}));
$("#fSort") && ($("#fSort").onchange=e=>{filters.sort=e.target.value; render();});
$("#reset") && ($("#reset").onclick=()=>{ const tIn=$("#fTypeInput"), tSel=$("#fType");
  $("#q").value=''; $("#fStage").value=''; if(tIn) tIn.value=''; if(tSel) tSel.value=''; $("#fSort").value='updated_desc';
  Object.assign(filters,{q:'',stage:'',type:'',sort:'updated_desc'}); render();
});

/* ===== Table ===== */
const stageNames=['First Level Courts','Regional Trial Courts','Specialized Higher Courts','Supreme Court'];
const tbody=$("#tbody");

function rowHTML(c){
  const editBtns = canEdit(c) ? '<button class="ib" data-a="edit" title="Edit">✎</button><button class="ib" data-a="del" title="Delete">🗑</button>' : '';
  return `<tr data-id="${c.id}">
    <td class="col-ref">${c.ref}</td>
    <td class="col-title"><div class="t-strong">${c.title}</div></td>
    <td class="col-client">${c.client||'—'}</td>
    <td class="col-lawyer">${c.lawyer||'—'}</td>
    <td class="col-type"><span class="chip">${c.type}</span></td>
    <td class="col-stage">
      <div class="stage" data-level="${c.stage}">
        <div class="s"><i></i></div><div class="s"><i></i></div><div class="s"><i></i></div><div class="s"><i></i></div>
      </div>
      <div class="stage-labels"><div>${stageNames[0]}</div><div>${stageNames[1]}</div><div>${stageNames[2]}</div><div>${stageNames[3]}</div></div>
    </td>
    <td class="col-hearing">${fmt(c.hearing)}</td>
    <td class="col-opened">${fmt(c.opened)}</td>
    <td class="col-updated">${fmt(c.updated)}</td>
    <td class="col-actions"><div class="actions">
      <button class="ib" data-a="view" title="View">👁</button>${editBtns}
    </div></td>
  </tr>`;
}
function applyFilters(list){
  let out=list.filter(c=>{
    const hit=v=> String(v).toLowerCase().includes(filters.q);
    const stageOK = filters.stage==='' || String(c.stage)===filters.stage;
    const typeOK  = !filters.type || c.type===filters.type;
    return stageOK && typeOK && (hit(c.title)||hit(c.client)||hit(c.lawyer)||hit(c.ref)||hit(c.type));
  });
  switch(filters.sort){
    case 'updated_desc': out.sort((a,b)=> b.updated.localeCompare(a.updated)); break;
    case 'updated_asc':  out.sort((a,b)=> a.updated.localeCompare(b.updated)); break;
    case 'opened_desc':  out.sort((a,b)=> b.opened.localeCompare(a.opened)); break;
    case 'opened_asc':   out.sort((a,b)=> a.opened.localeCompare(b.opened)); break;
  }
  return out;
}
function render(){
  const list=applyFilters(scopedItems());
  if(tbody) tbody.innerHTML = list.map(rowHTML).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:20px">No cases found.</td></tr>`;
  rebuildTypeOptions(); renderTypeTags(); refreshKPIs();
}
render();

/* ===== table actions ===== */
tbody && (tbody.onclick=(e)=>{
  const btn=e.target.closest('button[data-a]'); if(!btn) return;
  const tr=e.target.closest('tr'); const id=tr.dataset.id; const act=btn.dataset.a;
  if(act==='view') openView(id);
  if(act==='edit' && canEdit(items.find(x=>x.id===id))) openEditor(id);
  if(act==='del'  && canEdit(items.find(x=>x.id===id))) removeCase(id, tr);
});

/* ===== View (RO except Status; Attach for admin/paralegal) ===== */
let viewingId=null;
function openView(id){
  viewingId=id; const c=items.find(x=>x.id===id); if(!c) return;
  $("#vwTitle") && ($("#vwTitle").textContent=c.title);
  $("#vwRef") && ($("#vwRef").textContent=c.ref);
  $("#vwClient") && ($("#vwClient").textContent=c.client||'—');
  $("#vwLawyer") && ($("#vwLawyer").textContent=c.lawyer||'—');
  $("#vwType") && ($("#vwType").textContent=c.type||'—');
  $("#vwStage") && ($("#vwStage").dataset.level=String(c.stage));
  $("#vwOpened") && ($("#vwOpened").textContent=fmt(c.opened));
  $("#vwHearing") && ($("#vwHearing").textContent=fmt(c.hearing));
  $("#vwDesc") && ($("#vwDesc").textContent=c.desc||'—');

  const statusSel=$("#vwStatus");
  if(statusSel){
    statusSel.value=c.status||'Active';
    statusSel.disabled = (ROLE==='client'); // client cannot change
    statusSel.onchange = (e)=>{ c.status=e.target.value; c.updated=todayStr(); render(); toast(`Marked as ${c.status}`); };
  }

  const list=$("#docList");
  if(list){
    list.innerHTML='';
    if(!c.docs || !c.docs.length){ const emp=document.createElement('div'); emp.className='empty'; emp.textContent='No documents yet.'; list.appendChild(emp); }
    else{
      c.docs.forEach((name,idx)=>{
        const row=document.createElement('div'); row.className='doc-row';
        row.innerHTML=`<div class="meta">📄 <strong>${name}</strong></div>
          <div>${ROLE==='client' ? '' : `<button class="btn secondary" data-rm="${idx}">Remove</button>`}</div>`;
        list.appendChild(row);
      });
    }
  }
  const attachBtn=$("#attachBtn"), attachInput=$("#attachInput");
  if(attachBtn && attachInput){
    const canAttach=(ROLE!=='client');
    attachBtn.disabled=!canAttach; attachInput.disabled=!canAttach;
    attachBtn.onclick=()=>{
      if(!canAttach) return;
      const f=attachInput.files?.[0]; if(!f){ toast('Choose a file first.'); return; }
      c.docs=c.docs||[]; c.docs.push(f.name); c.updated=todayStr(); render(); openView(id); toast('File attached (demo)');
    };

    // REMOVE attachment with UI confirm
    $("#docList").onclick = async (e)=>{
      const rm=e.target.closest('[data-rm]'); if(!rm || !canAttach) return;
      const idx=Number(rm.dataset.rm); const name=c.docs[idx];
      const ok = await confirmUI({
        title:'Remove File',
        message:`Remove "${name}" from ${c.ref}?`,
        okText:'Remove',
        cancelText:'Cancel',
        danger:true
      });
      if(!ok) return;
      c.docs.splice(idx,1); c.updated=todayStr(); render(); openView(id); toast('Removed');
    };
  }
  $("#drawer") && $("#drawer").classList.add('open');
}
$("#vwClose") && ($("#vwClose").onclick=()=> $("#drawer").classList.remove('open'));

/* ===== Editor (admin + assigned paralegal) ===== */
let editing=null;
const dlg=$("#dlgBack"), form=$("#form");
if(dlg && form){
  const hd=$("#hearingDate"); hd && hd.setAttribute('min',todayStr());
  window.openEditor=(id)=>{
    editing=id||null;
    $("#dlgTitle").textContent = id? 'Edit Case' : 'New Case';
    form.opened.value ||= todayStr(); hd && (hd.min=todayStr());
    if(id){
      const c=items.find(x=>x.id===id);
      form.title.value=c.title; form.ref.value=c.ref; form.client.value=c.client; form.lawyer.value=c.lawyer;
      $("#typeSelect").value=c.type; form.stage.value=String(c.stage); form.opened.value=c.opened; form.hearing.value=c.hearing||''; form.desc.value=c.desc||'';
    }else{
      form.reset(); $("#typeSelect").value=caseTypes[0]||''; form.stage.value='-1';
      form.opened.value=todayStr(); form.hearing.value=''; form.desc.value='';
    }
    dlg.style.display='flex';
  };
  const closeEditor=()=> dlg.style.display='none';
  $("#addBtn") && ($("#addBtn").onclick=()=> window.openEditor(null));
  $("#dlgClose") && ($("#dlgClose").onclick=closeEditor);
  $("#dlgCancel") && ($("#dlgCancel").onclick=closeEditor);

  hd && hd.addEventListener('input', (e)=>{
    const min=todayStr(); if(e.target.value && e.target.value < min){ e.target.value=min; toast('Past dates are disabled.'); }
  });

  $("#dlgSave") && ($("#dlgSave").onclick=(e)=>{
    e.preventDefault(); if(!form.reportValidity()) return;
    const data={
      title:form.title.value.trim(),
      ref:form.ref.value.trim() || ('REF-' + Math.random().toString(10).slice(2,7)),
      client:form.client.value.trim(),
      lawyer:form.lawyer.value.trim(),
      type:$("#typeSelect").value,
      stage:Number(form.stage.value||-1),
      opened:form.opened.value || todayStr(),
      hearing:form.hearing.value || '',
      updated:todayStr(),
      status:'Active',
      desc:(form.desc.value||'').trim(),
      docs:[]
    };
    if(editing){ Object.assign(items.find(x=>x.id===editing), data); toast('Case updated'); }
    else{ items.unshift({id:uid(), ...data, assignedTo:(ROLE==='paralegal'? CURRENT.paralegal.name : '—')}); toast('Case created'); }
    render(); closeEditor();
  });
}

/* ===== Delete (admin + assigned paralegal) ===== */
async function removeCase(id, rowEl){
  const c=items.find(x=>x.id===id); if(!c || !canEdit(c)) return;

  const ok = await confirmUI({
    title: 'Remove Case',
    message: `Remove "${c.title}" (${c.ref})? Are you sure you want to Remove?`,
    okText: 'Remove',
    cancelText: 'Cancel',
    danger: true
  });
  if(!ok) return;

  if(rowEl){ rowEl.classList.add('fade-out'); await new Promise(r=>setTimeout(r,220)); }
  items = items.filter(x=>x.id!==id);
  const drawer=$("#drawer"); if(drawer && drawer.classList.contains('open') && viewingId===id){ drawer.classList.remove('open'); }
  render(); toast('Case Removed');
}
window.removeCase=removeCase;

/* init */
rebuildTypeOptions(); renderTypeTags(); refreshKPIs();
