/* === CASES: improved title detection + client resolution === */
function _t(s){ return (s||'').trim(); }
function _tl(el){ return (el?.textContent||'').trim().toLowerCase(); }
function _byLabel(container, labels){
  const labs = Array.from(container.querySelectorAll('label'));
  for (const lab of labs){
    const txt = _tl(lab.querySelector('span, .label, .field-label, label')) || _tl(lab);
    if (!txt) continue;
    if (labels.some(l => txt.includes(l))) {
      const ctl = lab.querySelector('input, select, textarea');
      if (ctl && typeof ctl.value !== 'undefined') return ctl.value;
    }
  }
  return '';
}
function _byPlaceholder(container, keys){
  const els = Array.from(container.querySelectorAll('input[placeholder], select[placeholder], textarea[placeholder]'));
  for (const el of els){
    const ph = (el.getAttribute('placeholder')||'').toLowerCase();
    if (keys.some(k => ph.includes(k))) return el.value;
  }
  return '';
}
function _firstSelectOrSecondField(container){
  const ctrls = Array.from(container.querySelectorAll('input, select, textarea')).filter(el => !el.type || el.type!=='hidden');
  // Prefer first <select>
  const firstSelect = ctrls.find(el => el.tagName==='SELECT' && _t(el.value));
  if (firstSelect) return firstSelect.value;
  // Else try second non-empty control (often case type)
  const nonEmpty = ctrls.map(el=>_t(el.value)).filter(Boolean);
  if (nonEmpty[1]) return nonEmpty[1];
  return nonEmpty[0] || '';
}
async function _fetchClients(){ try{ const r=await api('users.php?role=client'); return r.items||r||[]; }catch(e){ console.error(e); return []; } }
async function _clientIdFrom(val){
  const v=_t(val); if(!v) return null; const L=await _fetchClients(); if(!L.length) return null;
  const em=L.find(u=>(u.email||'').toLowerCase()===v.toLowerCase()); if(em) return em.id;
  const ex=L.find(u=>(u.full_name||'').toLowerCase()===v.toLowerCase()); if(ex) return ex.id;
  const ct=L.find(u=>(u.full_name||'').toLowerCase().includes(v.toLowerCase())); if(ct) return ct.id;
  return null;
}
async function _staffIdFromEmail(email){
  const v=_t(email); if(!v) return null;
  try{ const r=await api('users.php'); const L=r.items||r||[]; const h=L.find(u=>(u.email||'').toLowerCase()===v.toLowerCase()); return h?h.id:null; }
  catch(e){ console.warn('staff lookup fail',e); return null; }
}
function _normStatus(v){
  const s=(v||'').toLowerCase();
  if (s.includes('review')||s.includes('progress')||s.includes('pending')) return 'in_progress';
  if (s.includes('open')) return 'open';
  if (s.includes('close')) return 'closed';
  return 'new';
}

async function submitCaseSmart(e){
  e?.preventDefault();
  const dlg = document.querySelector('#caseDialog') || document;

  // --- client (required) ---
  let clientRaw = (document.querySelector('#caseClient, #caseClientEmail, .client-email, input[name="client_email"], .client-name, input[name="client"]')?.value||'').trim();
  if (!clientRaw) clientRaw = _byLabel(dlg, ['client email','client','client name']);
  const client_id = await _clientIdFrom(clientRaw);
  if (!client_id){ toast('Choose a client: type their email or exact name (or add them first in Users).'); return; }

  // --- title (robust) ---
  let title = (document.querySelector('#caseTitle, input[name="title"], .case-title')?.value||'').trim();
  if (!title) title = _byLabel(dlg, ['title','case title','subject','case type','type','practice area','category']);
  if (!title) title = _byPlaceholder(dlg, ['title','case','type','subject','practice']);
  if (!title) title = _firstSelectOrSecondField(dlg);
  if (!title){ toast('Title is required'); return; }

  // --- status / notes / assignee (optional) ---
  let status = (document.querySelector('#caseStatus, select[name="status"], .case-status')?.value||'').trim();
  if (!status) status = _byLabel(dlg, ['status']);
  status = _normStatus(status);

  let notes = (document.querySelector('#caseNotes, textarea[name="notes"], .case-notes')?.value||'') 
              || _byLabel(dlg, ['notes','description','details']);

  let assEmail = (document.querySelector('#caseAssigneeEmail, .assignee-email, input[name="assignee_email"]')?.value||'').trim();
  if (!assEmail) assEmail = _byLabel(dlg, ['assigned to','assignee','assigned email','assigned to (email)']);
  const assignee_id = await _staffIdFromEmail(assEmail);

  // --- NEXT DATE (your question) ---
  let next_date = (document.querySelector('#caseNextDate')?.value || '').trim();
  if (!next_date) next_date = _byLabel(dlg, ['next date','hearing date','deadline','court date']); // optional

  // build payload
  const payload = { title, status, notes, client_id };
  if (assignee_id) payload.assignee_id = assignee_id;
  if (next_date)   payload.next_date   = next_date;   // <-- this line sends the date

  try{
    await api('cases.php', { method:'POST', body: payload });
    toast('Case created');
    document.querySelector('#caseDialog')?.close?.();
    refreshCases?.();
  }catch(err){
    console.error(err);
    toast(err.message || 'Failed to create case');
  }
}


  // Client
  let clientRaw = (document.querySelector('#caseClient, #caseClientEmail, .client-email, input[name="client_email"], .client-name, input[name="client"]')?.value||'').trim();
  if (!clientRaw) clientRaw = _byLabel(dlg, ['client email','client','client name']);
  const client_id = await _clientIdFrom(clientRaw);
  if (!client_id){ toast('Choose a client: type their email or exact name (or add them first in Users).'); return; }

  // Title (robust)
  let title = (document.querySelector('#caseTitle, input[name="title"], .case-title')?.value||'').trim();
  if (!title) title = _byLabel(dlg, ['title','case title','subject','case type','type','practice area','category']);
  if (!title) title = _byPlaceholder(dlg, ['title','case','type','subject','practice']);
  if (!title) title = _firstSelectOrSecondField(dlg);
  if (!title){ toast('Title is required'); return; }

  // Other optional fields
  let status = (document.querySelector('#caseStatus, select[name="status"], .case-status')?.value||'').trim();
  if (!status) status = _byLabel(dlg, ['status']);
  status = _normStatus(status);
  let notes = (document.querySelector('#caseNotes, textarea[name="notes"], .case-notes')?.value||'') || _byLabel(dlg, ['notes','description','details']);
  let assEmail = (document.querySelector('#caseAssigneeEmail, .assignee-email, input[name="assignee_email"]')?.value||'').trim();
  if (!assEmail) assEmail = _byLabel(dlg, ['assigned to','assignee','assigned email','assigned to (email)']);
  const assignee_id = await _staffIdFromEmail(assEmail);

  const payload = { title, status, notes, client_id };
  if (assignee_id) payload.assignee_id = assignee_id;

  try{
    await api('cases.php', { method:'POST', body: payload });
    toast('Case created');
    document.querySelector('#caseDialog')?.close?.();
    refreshCases?.();
  }catch(err){
    console.error(err);
    toast(err.message || 'Failed to create case');
  }


/* Make progress chips clickable (visual only) */
document.addEventListener('click', (ev) => {
  const node = ev.target?.closest('[data-progress], .progress .btn, .progress .percent');
  if (!node) return;
  const wrap = document.querySelector('#caseDialog') || document;
  wrap.querySelectorAll('[data-progress], .progress .btn, .progress .percent').forEach(x => x.classList?.remove('active'));
  node.classList?.add('active');
  wrap.dataset.progress = (node.dataset.progress || node.textContent.replace('%','')).trim();
});

window.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#caseForm');
  if (form && !form.__caseSubmitWired){
    form.addEventListener('submit', submitCaseSmart);
    form.__caseSubmitWired = true;
  }
});
