/* ==========================================================
   Talampas & Associates — SERVER-ONLY script.js
   Source of truth = PHP backend (DB: talampas_app via api/db.php)
   ========================================================== */

/* ---------- DOM helpers ---------- */
const q  = (sel, ctx=document) => ctx.querySelector(sel);
const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

/* ---------- UI helpers ---------- */
function toast(msg){ if (typeof showToast === 'function') showToast(msg); else alert(msg); }

/* ---------- API (JSON, with cookies) ---------- */
function API(path){ return new URL(`/api/${path}`, location.origin).toString(); }

async function api(path, { method='GET', body, form, headers={} } = {}) {
  const opts = { method, credentials: 'include', cache: 'no-store', headers };
  if (form) {
    opts.body = form; // FormData
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json', ...headers };
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(API(path), opts);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Request failed: ${path}`);
  return data;
}

/* ==========================================================
   AUTH
   ========================================================== */
function setSession(user){ sessionStorage.setItem('ta_session', JSON.stringify(user||{})); }
function getSession(){ try { return JSON.parse(sessionStorage.getItem('ta_session')||'{}'); } catch { return {}; } }
function clearSession(){ sessionStorage.removeItem('ta_session'); }

async function doLogin(email, password){
  const { user } = await api('login.php', { method:'POST', body:{ email, password } });
  if (!user) throw new Error('Invalid user payload');
  // normalize
  if (!user.name && user.full_name) user.name = user.full_name;
  setSession(user);
  return user;
}
async function tryResume(){
  try {
    const { user } = await api('me.php');
    if (user) { if (!user.name && user.full_name) user.name = user.full_name; setSession(user); return true; }
  } catch {}
  return false;
}
async function doLogout(){
  try { await api('logout.php'); } catch {}
  clearSession();
  showLogin();
}

/* ==========================================================
   CASES (server-only)
   ========================================================== */
function renderCases(items=[]){
  const tbody = q('#caseTable tbody');
  if (!tbody) return;
  const list = items.slice().sort((a,b)=>(b.id||0)-(a.id||0));
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.title || '—'}</td>
      <td><span class="badge">${c.status || '—'}</span></td>
      <td>${c.assignee_id ?? '—'}</td>
      <td>${c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
    </tr>
  `).join('');
}

async function listCases(){
  const r = await api('cases.php');            // { ok:true, items:[...] }
  return r.items || r.cases || [];
}
async function refreshCases(){
  try { renderCases(await listCases()); }
  catch(e){ console.error(e); toast('Failed to load cases'); }
}
async function submitCase(e){
  e?.preventDefault();
  const title = q('#case_title')?.value.trim() || q('#casePractice')?.value.trim() || '';
  const notes = q('#case_notes')?.value.trim() || q('#caseNotes')?.value.trim() || '';
  if(!title) return toast('Case title is required');
  await api('cases.php', { method:'POST', body:{ title, notes } });
  // clear fields
  if (q('#case_title')) q('#case_title').value='';
  if (q('#case_notes')) q('#case_notes').value='';
  if (q('#casePractice')) q('#casePractice').value='';
  if (q('#caseNotes')) q('#caseNotes').value='';
  await refreshCases();                      // POST → GET → render
  toast('Case saved.');
}

/* (Optional) upload a file to a case via case_files.php */
async function uploadCaseFile(caseId, file){
  const fd = new FormData();
  fd.append('case_id', String(caseId));
  fd.append('file', file);
  return api('case_files.php', { method:'POST', form: fd });
}

/* ==========================================================
   APPOINTMENTS (server-only)
   ========================================================== */
function renderAppointments(items=[]){
  const tbody = q('#appointmentsTable tbody') || q('#apptsList');
  if (!tbody) return;
  const list = items.slice().sort((a,b)=>(b.id||0)-(a.id||0));
  tbody.innerHTML = list.map(a => `
    <tr>
      <td>${a.id}</td>
      <td>${a.title || '—'}</td>
      <td>${a.practice_area || '—'}</td>
      <td>${a.preferred_date || '—'} ${a.preferred_time || ''}</td>
      <td>${a.status || 'pending'}</td>
    </tr>
  `).join('');
}
async function refreshAppointments(){
  try {
    const r = await api('appointments.php');   // { ok:true, items:[...] }
    renderAppointments(r.items || r.appointments || []);
  } catch(e){ console.error(e); toast('Failed to load appointments'); }
}
async function submitAppointment(e){
  e?.preventDefault();
  const title = q('#appt_title')?.value.trim() || '';
  const details = q('#appt_details')?.value.trim() || '';
  const practice = q('input[name="practice"]:checked')?.value || q('#practice_area')?.value || '';
  const preferred_date = q('#appt_date')?.value || null;
  const preferred_time = q('#appt_time')?.value || null;
  if(!title) return toast('Appointment title is required');
  await api('appointments.php', { method:'POST', body:{ title, details, practice, preferred_date, preferred_time } });
  await refreshAppointments();                // POST → GET → render
  toast('Appointment submitted');
  q('#appointmentDialog')?.close?.();
}

/* ==========================================================
   EVENTS (server-only)
   ========================================================== */
function ymd(d=new Date()){ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }

function renderEvents(items=[]){
  const tbody = q('#calendarTable tbody') || q('#eventsBody');
  if (!tbody) return;
  const list = items.slice().sort((a,b)=> (a.event_date > b.event_date ? 1 : -1));
  tbody.innerHTML = list.map(ev => `
    <tr>
      <td>${ev.id}</td>
      <td>${ev.title}</td>
      <td>${ev.event_date}</td>
      <td>${ev.event_time || '—'}</td>
      <td>${ev.case_id ?? '—'}</td>
    </tr>
  `).join('');
}
async function refreshEvents(range){
  const from = range?.from || ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const to   = range?.to   || ymd(new Date(new Date().getFullYear(), new Date().getMonth()+1, 0));
  try {
    const r = await api(`events.php?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    renderEvents(r.items || r.events || []);
  } catch(e){ console.error(e); toast('Failed to load events'); }
}
async function submitEvent(e){
  e?.preventDefault();
  const title = q('#event_title')?.value.trim();
  const event_date = q('#event_date')?.value;
  const event_time = q('#event_time')?.value || null;
  const notes = q('#event_notes')?.value || '';
  const case_id = q('#event_case_id')?.value ? Number(q('#event_case_id').value) : null;
  if(!title || !event_date) return toast('Event title & date required');
  await api('events.php', { method:'POST', body:{ title, event_date, event_time, notes, case_id } });
  await refreshEvents();                      // POST → GET → render
  toast('Event saved');
  q('#eventDialog')?.close?.();
}

/* ==========================================================
   THREADS & MESSAGES (server-only)
   ========================================================== */
function renderThreads(items=[]){
  const list = q('#threadsList') || q('#threadList');
  if (!list) return;
  const sorted = items.slice().sort((a,b)=>(b.id||0)-(a.id||0));
  list.innerHTML = sorted.map(t => `
    <li>
      <button class="thread-btn" onclick="openThread(${t.id})">#${t.id} — ${t.title || 'Conversation'}</button>
    </li>
  `).join('');
}
function renderMessages(items=[]){
  const box = q('#messagesBox') || q('#chatMessages');
  if (!box) return;
  const me = getSession();
  box.innerHTML = items.map(m => `
    <div class="msg ${m.sender_id === me.id ? 'me' : 'them'}">
      <div class="bubble">${escapeHtml(m.body || '')}</div>
      <div class="meta">${new Date(m.created_at).toLocaleString()}</div>
    </div>
  `).join('');
  box.scrollTop = box.scrollHeight;
}
async function refreshThreads(){
  try { const r = await api('threads.php'); renderThreads(r.items || []); }
  catch(e){ console.error(e); toast('Failed to load threads'); }
}
async function createThread(e){
  e?.preventDefault();
  const title = q('#thread_title')?.value.trim() || 'Conversation';
  // collect participants from checkboxes/select (name="thread_participants")
  const participants = qa('[name="thread_participants"]:checked, #thread_participants option:checked')
    .map(x => Number(x.value)).filter(Boolean);
  if (!participants.length) return toast('Pick at least one participant');
  await api('threads.php', { method:'POST', body:{ title, participants } });
  q('#threadDialog')?.close?.();
  await refreshThreads(); toast('Thread created');
}
async function openThread(threadId){
  try {
    const r = await api(`messages.php?thread_id=${encodeURIComponent(threadId)}`);
    renderMessages(r.items || []);
    q('#currentThreadId')?.setAttribute('data-id', String(threadId));
  } catch(e){ console.error(e); toast('Failed to open thread'); }
}
async function sendMessage(e){
  e?.preventDefault();
  const threadId = Number(q('#currentThreadId')?.getAttribute('data-id'));
  const body = q('#message_input')?.value.trim();
  if (!threadId || !body) return;
  await api('messages.php', { method:'POST', body:{ thread_id: threadId, body } });
  q('#message_input').value = '';
  await openThread(threadId);                // POST → GET → render
}

/* ---------- Utils ---------- */
function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ==========================================================
   APP SHELL / ROUTING
   ========================================================== */
function showLogin(){
  q('#appShell')?.classList.add('hidden');
  q('#loginView')?.classList.add('active');
}
async function enterApp(user){
  q('#loginView')?.classList.remove('active');
  q('#appShell')?.classList.remove('hidden');
  if (q('#currentUserName')) q('#currentUserName').textContent = user.name || user.email;
  if (q('#roleBadge')) q('#roleBadge').textContent = (user.role||'').toUpperCase();

  await Promise.allSettled([
    refreshCases(),
    refreshAppointments(),
    refreshEvents(),
    refreshThreads()
  ]);
}
function routeTo(name){
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route===name));
  qa('.route').forEach(r => r.classList.remove('active'));
  q(`#route-${name}`)?.classList.add('active');
}

/* ==========================================================
   BOOT
   ========================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  // Auth bindings
  q('#loginForm')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = q('#email')?.value.trim().toLowerCase();
    const password = q('#password')?.value || '';
    if (!email || !password) return toast('Enter email and password');
    try { const user = await doLogin(email,password); await enterApp(user); toast(`Welcome, ${user.name || user.email}`); }
    catch(err){ toast(err.message || 'Login failed'); }
  });
  q('#logoutBtn')?.addEventListener('click', doLogout);

  // Cases
  q('#caseForm')?.addEventListener('submit', submitCase);
  q('#caseRefresh')?.addEventListener('click', refreshCases);

  // Appointments
  q('#appointmentForm')?.addEventListener('submit', submitAppointment);
  q('#apptRefresh')?.addEventListener('click', refreshAppointments);

  // Events
  q('#eventForm')?.addEventListener('submit', submitEvent);
  q('#eventsRefresh')?.addEventListener('click', () => refreshEvents());

  // Threads/messages
  q('#threadForm')?.addEventListener('submit', createThread);
  q('#messageForm')?.addEventListener('submit', sendMessage);

  // Nav
  qa('.nav-btn').forEach(b => b.addEventListener('click', () => routeTo(b.dataset.route)));

  // Try resuming server session; else show login
  const resumed = await tryResume();
  const me = getSession();
  if (resumed && me?.id) enterApp(me); else showLogin();
});
