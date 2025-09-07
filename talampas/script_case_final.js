/* ==========================================================
   CASES — FINAL PATCH
   - Robust title detection
   - Client resolution by email OR name
   - Progress buttons click handling
   - Clear error toasts + console hints
   ========================================================== */

(function(){
  const $ = (s, c=document)=>c.querySelector(s);
  const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));
  const txt = (n)=> (n?.textContent||'').trim();
  const tl  = (n)=> txt(n).toLowerCase();

  function toast(msg){ const t = document.querySelector('#toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1800); }

  function byLabel(container, keys){
    for (const lab of $$('label', container)){
      const t = tl(lab.querySelector('span, .label, .field-label, label')) || tl(lab);
      if (!t) continue;
      if (keys.some(k => t.includes(k))) {
        const ctl = lab.querySelector('input, select, textarea');
        if (ctl && typeof ctl.value !== 'undefined') return ctl.value;
      }
    }
    return '';
  }
  function byPlaceholder(container, keys){
    for (const el of $$('input[placeholder], select[placeholder], textarea[placeholder]', container)){
      const ph = (el.getAttribute('placeholder')||'').toLowerCase();
      if (keys.some(k => ph.includes(k))) return el.value;
    }
    return '';
  }
  function firstSelectOrSecondControl(container){
    const ctrls = $$('input, select, textarea', container).filter(el => (el.type||'')!=='hidden');
    const firstSel = ctrls.find(el => el.tagName==='SELECT' && (el.value||'').trim());
    if (firstSel) return firstSel.value;
    const vals = ctrls.map(el => (el.value||'').trim()).filter(Boolean);
    return vals[1] || vals[0] || '';
  }

  async function fetchClients(){
    try{ const r = await api('users.php?role=client'); return r.items || r || []; }
    catch(e){ console.error('fetchClients failed', e); return []; }
  }
  async function clientIdFrom(val){
    const v = (val||'').trim(); if(!v) return null;
    let list = await fetchClients();
    // if no clients endpoint or role-filter fails, try all users
    if (!list.length){
      try{ const r = await api('users.php'); list = r.items || r || []; }catch{}
    }
    if (!list.length) return null;
    const vlow = v.toLowerCase();
    const byEmail = list.find(u => (u.email||'').toLowerCase() === vlow);
    if (byEmail) return byEmail.id;
    const byExact = list.find(u => (u.full_name||'').toLowerCase() === vlow);
    if (byExact) return byExact.id;
    const byContains = list.find(u => (u.full_name||'').toLowerCase().includes(vlow));
    if (byContains) return byContains.id;
    return null;
  }
  async function staffIdFrom(email){
    const v=(email||'').trim(); if(!v) return null;
    try{ const r = await api('users.php'); const L = r.items || r || []; const hit = L.find(u => (u.email||'').toLowerCase()===v.toLowerCase()); return hit?hit.id:null; }
    catch{ return null; }
  }
  function normStatus(v){
    const s=(v||'').toLowerCase();
    if (s.includes('review')||s.includes('progress')||s.includes('pending')) return 'in_progress';
    if (s.includes('open')) return 'open';
    if (s.includes('close')) return 'closed';
    return 'new';
  }

  async function submitCaseFinal(e){
    e?.preventDefault();
    const dlg = $('#caseDialog') || document;

    // CLIENT (required by PHP)
    let clientRaw = ($('#caseClient, #caseClientEmail, .client-email, input[name="client_email"], .client-name, input[name="client"]')?.value||'').trim();
    if (!clientRaw) clientRaw = byLabel(dlg, ['client email','client','client name']);
    const client_id = await clientIdFrom(clientRaw);

    // TITLE (robust)
    let title = ($('#caseTitle, input[name="title"], .case-title')?.value||'').trim();
    if (!title) title = byLabel(dlg, ['title','case title','subject','case type','type','practice area','category']);
    if (!title) title = byPlaceholder(dlg, ['title','case','type','subject','practice']);
    if (!title) title = firstSelectOrSecondControl(dlg);

    if (!title || !client_id){
      console.warn('Case submit missing', { title, clientRaw, client_id });
      toast(!title && !client_id ? 'Title & client required'
           : !title ? 'Title is required'
           : 'Client not found (type email or exact name; add them first in Users)');
      return;
    }

    // OPTIONALS
    let status = ($('#caseStatus, select[name="status"], .case-status')?.value||'').trim();
    if (!status) status = byLabel(dlg, ['status']);
    status = normStatus(status);

    let notes = ($('#caseNotes, textarea[name="notes"], .case-notes')?.value||'') || byLabel(dlg, ['notes','description','details']);

    let assEmail = ($('#caseAssigneeEmail, .assignee-email, input[name="assignee_email"]')?.value||'').trim();
    if (!assEmail) assEmail = byLabel(dlg, ['assigned to','assignee','assigned email','assigned to (email)']);
    const assignee_id = await staffIdFrom(assEmail);

    // NEXT DATE (optional)
    let next_date = ($('#caseNextDate')?.value || '').trim();
    if (!next_date) next_date = byLabel(dlg, ['next date','hearing date','deadline','court date']);

    const payload = { title, status, notes, client_id };
    if (assignee_id) payload.assignee_id = assignee_id;
    if (next_date)   payload.next_date   = next_date;

    try{
      const res = await api('cases.php', { method:'POST', body: payload });
      console.debug('Case created', res);
      toast('Case created');
      $('#caseDialog')?.close?.();
      refreshCases?.();
    }catch(err){
      console.error('cases.php POST failed', err);
      toast(err.message || 'Failed to create case');
    }
  }

  // Progress chips
  document.addEventListener('click', (ev) => {
    const node = ev.target?.closest('[data-progress], .progress .btn, .progress .percent');
    if (!node) return;
    const wrap = $('#caseDialog') || document;
    $$('.progress .btn, .progress .percent, [data-progress]', wrap).forEach(x => x.classList?.remove('active'));
    node.classList?.add('active');
    wrap.dataset.progress = (node.dataset.progress || node.textContent.replace('%','')).trim();
  });

  // Wire submit (avoid double)
  window.addEventListener('DOMContentLoaded', () => {
    const form = $('#caseForm');
    if (form && !form.__caseSubmitWired){
      form.addEventListener('submit', submitCaseFinal);
      form.__caseSubmitWired = true;
    }
  });
})();
