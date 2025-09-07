/* ==========================================================
   Talampas & Associates — FULL FRONTEND SCRIPT (ALL FIXES)
   ========================================================== */

/* ---------- DOM helpers ---------- */
const q  = (sel, ctx=document) => ctx.querySelector(sel);
const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

/* ---------- Toast ---------- */
function toast(msg=''){
  const el=q('#toast'); if(!el) { alert(msg); return; }
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 1800);
}

/* ---------- API (JSON, with cookies) ---------- */
// IMPORTANT: relative to the folder you're serving (e.g., /talampas/)
const API = (p)=> new URL(`api/${p}`, location.href).toString();
async function api(path, { method='GET', body, form, headers={} } = {}) {
  const opts = { method, credentials:'include', cache:'no-store', headers };
  if (form) { opts.body = form; }
  else if (body !== undefined) { opts.headers = { 'Content-Type':'application/json', ...headers }; opts.body = JSON.stringify(body); }
  const url = API(path);
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data?.error) throw new Error(data?.error || `Request failed: ${url}`);
  return data;
}

/* ==========================================================
   AUTH
   ========================================================== */
function setSession(user){ sessionStorage.setItem('ta_session', JSON.stringify(user||{})); }
function getSession(){ try { return JSON.parse(sessionStorage.getItem('ta_session')||'{}'); } catch { return {}; } }
function clearSession(){ sessionStorage.removeItem('ta_session'); }

async function doLogin(email, password){
  const { ok, user } = await api('login.php', { method:'POST', body:{ email, password } });
  if (!ok) throw new Error('Invalid login');
  setSession(user);
  return user;
}
async function tryResume(){
  try { const { ok, user } = await api('me.php'); if (ok && user?.id){ setSession(user); return user; } } catch {}
  return null;
}
async function doLogout(){
  try { await api('logout.php'); } catch {}
  clearSession();
  location.reload();
}

/* ==========================================================
   UI: Routing / Visibility
   ========================================================== */
function showLogin(){
  q('#appShell')?.classList.add('hidden');
  q('#loginView')?.classList.add('active');
}
function enterApp(user){
  q('#loginView')?.classList.remove('active');
  q('#appShell')?.classList.remove('hidden');
  q('#currentUserName') && (q('#currentUserName').textContent = user.name || user.email);
  q('#roleBadge') && (q('#roleBadge').textContent = (user.role||'').toUpperCase());
  // Role-gated nav
  qa('.only-admin').forEach(el => el.style.display = (user.role==='admin' || user.role==='employee') ? '' : 'none');
  qa('.only-client').forEach(el => el.style.display = (user.role==='client') ? '' : 'none');
  // Default route
  routeTo('cases');
  // Initial loads
  refreshCases();
  refreshAppointments();
  refreshEvents();
}

/* Route switching */
// --- Routing (hardened) ---

function routeTo(name){
  // toggle nav button states
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route === name));
  // show only the requested route
  qa('.route').forEach(r => r.classList.remove('active'));
  const target = q(`#route-${name}`);
  if (target) target.classList.add('active');

  // optional: update title/hash
  const title = target?.dataset?.title || name;
  document.title = `${title} | Talampas & Associates`;
  history.replaceState(null, '', `#${name}`);
}

// wire nav buttons once
window.addEventListener('DOMContentLoaded', () => {
  qa('.nav-btn').forEach(b => {
    b.addEventListener('click', () => routeTo(b.dataset.route));
  });

  // ensure only one route is active on load
  const active = q('.route.active') || q('#route-cases') || q('#route-dashboard');
  qa('.route').forEach(r => r.classList.toggle('active', r === active));
});


/* ==========================================================
   CASES
   ========================================================== */
function renderCases(items = []) {
  const tbody = q('#caseTable tbody'); if (!tbody) return;
  const list = items.slice().sort((a,b)=>(b.id||0)-(a.id||0));

  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.client_name ?? '—'}</td>
      <td>${c.title || '—'}</td>
      <td><span class="badge">${c.status || '—'}</span></td>

      <!-- Next Date column -->
      <td>${
        c.next_date
          ? new Date(c.next_date).toLocaleDateString()
          // fallback so you at least see a date until we add a real next_date field:
          : (c.created_at ? new Date(c.created_at).toLocaleString() : '—')
      }</td>

      <!-- Assigned To column -->
      <td>${c.assignee_name ?? '—'}</td>
    </tr>
  `).join('');
}

async function refreshCases(){
  try {
    const data = await api('cases.php');
    const items = data.items || data;
    renderCases(items);
  } catch(e){ console.error(e); /* silent */ }
}

/* ==========================================================
   APPOINTMENTS
   ========================================================== */
function fullPhone(){
  const sel = q('#phoneCountry'); const code = sel?.selectedOptions?.[0]?.dataset?.code || '+63';
  const local = (q('#phoneLocal')?.value || '').replace(/\D+/g,'');
  return `${code} ${local}`.trim();
}
async function submitAppointment(e){
  e?.preventDefault();
  const preferred_date = q('#apptDate')?.value || '';
  const preferred_time = q('#apptTime')?.value || '';
  const appointmentType = q('#appointmentType')?.value || '';
  const practice_area = q('#apptPractice')?.value || '';
  const notes = (q('#apptNotes')?.value || '').trim();
  const phone = fullPhone();

  if(!preferred_date || !preferred_time || !appointmentType || !practice_area) return toast('Fill date, time, type, and case type');
  const title = `${appointmentType} • ${practice_area}`;
  const details = `Phone: ${phone}\n${notes}`;

  try {
    await api('appointments.php', { method:'POST', body:{ title, preferred_date, preferred_time, practice_area, details } });
    toast('Appointment submitted');
    e?.target?.reset?.();
  } catch(err){ console.error(err); toast('Failed to submit appointment'); }
}

/* ==========================================================
   CALENDAR EVENTS
   ========================================================== */
function firstDayOfMonth(d=new Date()){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d=new Date()){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function ymd(d){ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }
function hhmm(t){ return (t||'').toString().slice(0,5); }

function renderCalendarGrid(base=new Date(), items=[]){
  const grid = q('#calendarGrid'), title=q('#calendarTitle'); if(!grid||!title) return;
  const month = base.getMonth(), year = base.getFullYear();
  title.textContent = base.toLocaleString(undefined, { month:'long', year:'numeric' });
  grid.innerHTML = '';

  const start = new Date(year, month, 1);
  const end = new Date(year, month+1, 0);
  const startWeekday = (start.getDay()+6)%7; // Mon=0
  const days = end.getDate();

  for(let i=0;i<startWeekday;i++){ const div=document.createElement('div'); div.className='calendar-day'; grid.appendChild(div); }

  const dayEvents = items.reduce((acc,e)=>{
    const d = (e.start_datetime||'').slice(0,10); (acc[d]=acc[d]||[]).push(e); return acc;
  },{});

  for(let d=1; d<=days; d++){
    const dateStr = ymd(new Date(year, month, d));
    const cell = document.createElement('div'); cell.className='calendar-day';
    cell.innerHTML = `<div class="d">${d}</div><div class="events"></div>`;
    const wrap = cell.querySelector('.events');
    (dayEvents[dateStr]||[]).forEach(ev=>{
      const el = document.createElement('div');
      el.className = 'calendar-event clickable';
      const time = hhmm((ev.start_datetime||'').split(' ')[1]||'');
      el.textContent = `${time?time+' ':''}${ev.title}`;
      el.title = ev.description || '';
      wrap.appendChild(el);
    });
    grid.appendChild(cell);
  }
}

let _calBase = new Date();
async function refreshEvents(){
  const from = ymd(firstDayOfMonth(_calBase));
  const to   = ymd(lastDayOfMonth(_calBase));
  try {
    const items = await api(`calendar_events.php?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const list = items.items || items;
    renderCalendarGrid(_calBase, list);
  } catch(e){ console.error(e); }
}
async function submitEvent(e){
  e?.preventDefault();

  const title = q('#eventTitle')?.value?.trim();
  const date  = (q('#eventDate')?.value || '').trim();         // prefer YYYY-MM-DD
  const time  = (q('#eventTime')?.value || '').trim();         // could be "16:22" or "04:22 PM"
  const desc  = (q('#eventNotes')?.value || '').trim();
  const caseRef = (q('#eventCase')?.value || q('#eventCaseRef')?.value || '').trim();

  if (!title || !date || !time) return toast('Title, date & time required');

  const normTime = (t) => {
    const v = (t||'').trim();
    if (!v) return '';
    // If it already has AM/PM, let PHP parse it
    if (/am|pm/i.test(v)) return v;
    // If it's HH:MM, add seconds
    if (/^\d{2}:\d{2}$/.test(v)) return v + ':00';
    return v;
  };

  const event_time = normTime(time);
  const start_datetime = `${date.replace(/\//g,'-')} ${event_time}`;

  // try to parse case id if user typed "Case 1" or "#1"
  const case_id = (caseRef.match(/\d+/) || [null])[0];

  try{
    await api('calendar_events.php', {
      method:'POST',
      body: {
        title,
        description: desc,
        start_datetime,            // friendly format (handles AM/PM)
        event_date: date,          // YYYY-MM-DD (if it's that format)
        event_time,                // HH:MM:SS or AM/PM string
        case_id: case_id ? Number(case_id) : null
      }
    });
    toast('Event saved');
    q('#eventForm')?.reset();
    q('#eventDialog')?.close?.();
    refreshEvents();
  }catch(err){
    console.error(err);
    toast('Failed to save event');
  }
}


/* ==========================================================
   USERS
   ========================================================== */
async function fetchUsers(role=null){
  const url = role ? `users.php?role=${encodeURIComponent(role)}` : 'users.php';
  const list = await api(url);
  return list.items || list;
}
async function refreshUsers(){
  const tbody = q('#userTable tbody'); if(!tbody) return;
  try {
    const users = await fetchUsers();
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.full_name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.status}</td>
        <td></td>
      </tr>
    `).join('');
  } catch(e){ console.error(e); toast('Failed to load users'); }
}
async function openUserDialog(){
  const dlg = q('#userDialog'); if (!dlg) return;
  q('#userForm')?.reset();
  if (typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
}
function _valAny(selectors){ for (const s of selectors){ const el=document.querySelector(s); if (el && typeof el.value !== 'undefined') return el.value; } return ''; }
async function submitUser(e){
  e?.preventDefault();
  const full_name = _valAny(['#userFullName','input[name="full_name"]','#newUserFullName','.user-full-name']);
  const email = (_valAny(['#userEmail','input[name="email"]','#newUserEmail','.user-email'])||'').trim().toLowerCase();
  const password = _valAny(['#userPassword','input[name="password"]','#tempPassword','.user-password']);
  const role = _valAny(['#userRole','select[name="role"]','.user-role']) || 'client';
  const status = _valAny(['#userStatus','select[name="status"]','.user-status']) || 'active';
  if (!full_name || !email || !password){ console.warn('User form missing fields',{full_name,email,password}); toast('Fill name, email, password'); return; }
  try {
    await api('users.php', { method:'POST', body: { full_name, email, password, role, status } });
    toast('User created'); q('#userDialog')?.close?.(); refreshUsers();
  } catch(e){ console.error(e); toast('Failed to create user'); }
}

/* ==========================================================
   CASE CREATION
   ========================================================== */
async function openCaseDialog(){
  const dlg = q('#caseDialog'); if (!dlg) return;
  q('#caseForm')?.reset();
  try {
    const [clients, staff] = await Promise.all([ fetchUsers('client'), fetchUsers('employee') ]);
    const clientSel = q('#caseClient'); const assignSel = q('#caseAssignee');
    if (clientSel) clientSel.innerHTML = clients.map(u=>`<option value="${u.id}">${u.full_name} (${u.email})</option>`).join('');
    if (assignSel) assignSel.innerHTML = (staff||[]).map(u=>`<option value="${u.id}">${u.full_name}</option>`).join('');
  } catch(e){ console.error(e); }
  if (typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
}
async function submitCase(e){
  e?.preventDefault();
  const title = q('#caseTitle')?.value?.trim();
  const client_id = parseInt(q('#caseClient')?.value || '0',10);
  const assignee_id = parseInt(q('#caseAssignee')?.value || '0',10) || null;
  const status = q('#caseStatus')?.value || 'new';
  const notes  = q('#caseNotes')?.value || null;
  if (!title || !client_id) return toast('Title & client required');
  try {
    await api('cases.php', { method:'POST', body:{ title, client_id, assignee_id, status, notes } });
    toast('Case created'); q('#caseDialog')?.close?.(); refreshCases();
  } catch(e){ console.error(e); toast('Failed to create case (are you staff?)'); }
}

/* ==========================================================
   THREADS & MESSAGES
   ========================================================== */
let ACTIVE_THREAD_ID = null;

async function refreshThreads(){
  const listEl = q('#threadList'); if (!listEl) return;
  try{
    const threads = await api('threads.php');
    listEl.innerHTML = threads.map(t => `
      <li class="thread-item" data-id="${t.id}" tabindex="0">
        <div class="title">${t.title || 'Conversation #' + t.id}</div>
        <div class="sub">${t.last_message ? t.last_message : '—'}</div>
      </li>
    `).join('');
    qa('#threadList .thread-item').forEach(li => li.addEventListener('click', ()=> openThread(li.dataset.id)));
  } catch(e){ console.error(e); toast('Failed to load threads'); }
}
async function openThread(id){
  ACTIVE_THREAD_ID = parseInt(id,10);
  q('#threadTitle') && (q('#threadTitle').textContent = 'Thread #' + ACTIVE_THREAD_ID);
  await refreshMessages();
}
async function refreshMessages(){
  const pane = q('#messagePane'); if (!pane || !ACTIVE_THREAD_ID) return;
  try {
    const msgs = await api(`messages.php?thread_id=${ACTIVE_THREAD_ID}`);
    pane.innerHTML = msgs.map(m => `
      <div class="msg ${m.sender_role}"><b>${m.sender_name}</b>: ${m.body}
        <div class="meta">${new Date(m.created_at).toLocaleString()}</div>
      </div>
    `).join('');
  } catch(e){ console.error(e); }
}
async function submitMessage(e){
  e?.preventDefault();
  const inp = q('#messageInput'); if (!inp || !ACTIVE_THREAD_ID) return;
  const body = (inp.value||'').trim(); if (!body) return;
  try {
    await api('messages.php', { method:'POST', body:{ thread_id: ACTIVE_THREAD_ID, body } });
    inp.value=''; await refreshMessages();
  } catch(e){ console.error(e); toast('Failed to send'); }
}
async function openThreadDialog(){
  const dlg = q('#threadDialog'); if (!dlg) return;
  q('#threadForm')?.reset();
  try {
    const all = await fetchUsers();
    const me = getSession();
    const list = (all||[]).filter(u => u.id !== me?.id);
    const sel = q('#threadParticipants');
    if (sel) sel.innerHTML = list.map(u=>`<option value="${u.id}">${u.full_name} — ${u.role}</option>`).join('');
  } catch(e){ console.error(e); }
  if (typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
}
async function submitThread(e){
  e?.preventDefault();
  const title = q('#threadTitle')?.value?.trim() || null;
  const sel = q('#threadParticipants');
  const participants = Array.from(sel?.selectedOptions || []).map(o=>parseInt(o.value,10));
  if (participants.length < 1) return toast('Select at least one participant');
  try{
    const res = await api('threads.php', { method:'POST', body:{ title, participants } });
    toast('Conversation created');
    q('#threadDialog')?.close?.();
    await refreshThreads();
    if (res?.id) { openThread(res.id); }
  } catch(e){ console.error(e); toast('Failed to create thread'); }
}

/* Route enter hook */
function onRouteEnter(name){
  if (name==='users') refreshUsers();
  if (name==='messages') refreshThreads();
}
const __oldRouteTo = routeTo;
routeTo = function(name){ __oldRouteTo(name); onRouteEnter(name); };

/* ==========================================================
   BOOT & WIRING
   ========================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  // Auth
  on(q('#loginForm'),'submit', async (e)=>{
    e.preventDefault();
    const email = q('#email')?.value?.trim()?.toLowerCase();
    const password = q('#password')?.value || '';
    if (!email || !password) return toast('Enter email and password');
    try { const user = await doLogin(email,password); enterApp(user); toast(`Welcome, ${user.name||user.email}`); }
    catch(err){ console.error(err); toast(err.message || 'Login failed'); }
  });
  on(q('#logoutBtn'), 'click', doLogout);

  // Phone country prefix update
  on(q('#phoneCountry'), 'change', () => {
    const sel = q('#phoneCountry');
    const code = sel?.selectedOptions?.[0]?.dataset?.code || '+63';
    const prefix = q('#phonePrefix'); if (prefix) prefix.textContent = code;
    const hint = q('#phoneHint');
    if (hint){
      const map = { '+63':'PH: enter 10 digits (e.g., 9123456789)', '+966':'SA: enter 9 digits', '+1':'US: enter 10 digits' };
      hint.textContent = map[code] || 'Enter a valid local number';
    }
  });

  // Nav routing
  qa('.nav-btn').forEach(b => on(b, 'click', () => routeTo(b.dataset.route)));

  // Appointments
  on(q('#appointmentForm'), 'submit', submitAppointment);

  // Event dialog
  on(q('#newEventBtn'), 'click', ()=> { const dlg = q('#eventDialog'); if (dlg && typeof dlg.showModal==='function') dlg.showModal(); else dlg?.setAttribute?.('open',''); });
  on(q('#eventForm'), 'submit', submitEvent);
  on(q('#cancelEventBtn'), 'click', ()=> { const dlg = q('#eventDialog'); if (dlg && typeof dlg.close==='function') dlg.close(); else dlg?.removeAttribute?.('open'); });

  // Users
  on(q('#newUserBtn'), 'click', openUserDialog);
  on(q('#userForm'), 'submit', submitUser);
  on(q('#cancelUserBtn'), 'click', () => q('#userDialog')?.close?.());

  // Cases
  on(q('#newCaseBtn'), 'click', openCaseDialog);
  on(q('#caseForm'), 'submit', submitCase);
  on(q('#cancelCaseBtn'), 'click', () => q('#caseDialog')?.close?.());

  // Threads
  on(q('#newThreadBtn'), 'click', openThreadDialog);
  on(q('#threadForm'), 'submit', submitThread);
  on(q('#cancelThreadBtn'), 'click', () => q('#threadDialog')?.close?.());

  // Messages
  on(q('#messageForm'), 'submit', submitMessage);

  // Resume session
  const resumed = await tryResume();
  if (resumed && resumed.id) { enterApp(resumed); }
  else { showLogin(); }
});
