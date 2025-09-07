/* ==========================================================
   Talampas & Associates — FRONTEND (fully patched)
   - Robust routing & auth
   - Safe DOM helpers (no null crashes)
   - Correct API base path (relative)
   - Cases/Appointments/Calendar wired to PHP
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
  routeTo('dashboard');
  // Initial loads
  refreshCases();
  refreshAppointments();
  refreshEvents();
}
function routeTo(name){
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route===name));
  qa('.route').forEach(r => r.classList.remove('active'));
  const route = q(`#route-${name}`);
  if (route) route.classList.add('active');
}

/* ==========================================================
   CASES
   ========================================================== */
function renderCases(items=[]){
  const tbody = q('#caseTable tbody'); if(!tbody) return;
  const list = items.slice().sort((a,b)=>(b.id||0)-(a.id||0));
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.client_name ?? '—'}</td>
      <td>${c.title || '—'}</td>
      <td><span class="badge">${c.status || '—'}</span></td>
      <td>${c.assignee_name ?? '—'}</td>
      <td>${c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
    </tr>
  `).join('');
}
async function refreshCases(){
  try {
    const data = await api('cases.php');
    const items = data.items || data;
    renderCases(items);
  } catch(e){ console.error(e); /* silent for dashboard */ }
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
  const date  = q('#eventDate')?.value;
  const time  = q('#eventTime')?.value;
  const desc  = q('#eventNotes')?.value || '';
  if (!title || !date || !time) return toast('Title, date & time required');
  const start = `${date} ${time}:00`;
  try{
    await api('calendar_events.php', { method:'POST', body:{ title, description: desc, start_datetime: start, end_datetime: start } });
    toast('Event saved'); q('#eventForm')?.reset(); q('#eventDialog')?.close?.(); refreshEvents();
  } catch(err){ console.error(err); toast('Failed to save event'); }
}

/* ==========================================================
   BOOT
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

  // Resume session
  const resumed = await tryResume();
  if (resumed && resumed.id) { enterApp(resumed); }
  else { showLogin(); }
});
