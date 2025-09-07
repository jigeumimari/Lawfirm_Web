/* ==========================================================
   Talampas & Associates — FRONTEND aligned to PHP backend
   Endpoints used: login.php, logout.php, me.php,
                   cases.php, appointments.php, calendar_events.php
   ========================================================== */

/* ---------- DOM helpers ---------- */
const q  = (sel, ctx=document) => ctx.querySelector(sel);
const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

/* ---------- Toast ---------- */
function showToast(msg=''){ const el=q('#toast'); if(!el) return alert(msg); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'), 1800); }
const toast = showToast;

/* ---------- API (JSON, with cookies) ---------- */
// RIGHT: points to http://localhost/talampas/api/...
const API = (p)=> new URL(`api/${p}`, location.href).toString();
async function api(path, { method='GET', body, form, headers={} } = {}) {
  const opts = { method, credentials:'include', cache:'no-store', headers };
  if (form) { opts.body = form; }
  else if (body !== undefined) { opts.headers = { 'Content-Type':'application/json', ...headers }; opts.body = JSON.stringify(body); }
  const res = await fetch(API(path), opts);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok || data?.error) throw new Error(data.error || `Request failed: ${path}`);
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
  if (!ok) throw new Error('Login failed');
  setSession(user);
  return user;
}
async function tryResume(){
  try { const { ok, user } = await api('me.php'); if (ok && user?.id){ setSession(user); return true; } } catch {}
  return false;
}
async function doLogout(){ try { await api('logout.php'); } catch {} clearSession(); showLogin(); }

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
  try { const data = await api('cases.php'); const items = data.items || data; renderCases(items); }
  catch(e){ console.error(e); toast('Failed to load cases'); }
}

/* ==========================================================
   APPOINTMENTS
   ========================================================== */
async function refreshAppointments(){
  // You can render into a table if you add one; for now just quiet fetch to verify session/flow
  try { await api('appointments.php'); } catch(e){ console.error(e); }
}
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

  await api('appointments.php', { method:'POST', body:{ title, preferred_date, preferred_time, practice_area, details } });
  toast('Appointment submitted');
  (e.target?.reset?.());
  await refreshAppointments();
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

  // Fill leading blanks
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
    const list = items.items || items; // endpoint returns array directly
    renderCalendarGrid(_calBase, list);
  } catch(e){ console.error(e); toast('Failed to load events'); }
}

async function submitEvent(e){
  e?.preventDefault();
  const title = q('#eventTitle')?.value.trim();
  const date  = q('#eventDate')?.value;
  const time  = q('#eventTime')?.value;
  const desc  = q('#eventNotes')?.value || '';
  if (!title || !date || !time) return toast('Title, date & time required');
  const start = `${date} ${time}:00`;
  // for now end = start; you can extend dialog later
  await api('calendar_events.php', { method:'POST', body:{ title, description: desc, start_datetime: start, end_datetime: start } });
  toast('Event saved');
  q('#eventForm')?.reset();
  q('#eventDialog')?.close?.();
  await refreshEvents();
}

/* ==========================================================
   ROUTING & BOOT
   ========================================================== */
function showLogin(){ q('#appShell')?.classList.add('hidden'); q('#loginView')?.classList.add('active'); }
function enterApp(user){
  q('#loginView')?.classList.remove('active');
  q('#appShell')?.classList.remove('hidden');
  if (q('#currentUserName')) q('#currentUserName').textContent = user.name || user.email;
  if (q('#roleBadge')) q('#roleBadge').textContent = (user.role||'').toUpperCase();
  refreshCases(); refreshAppointments(); refreshEvents();
}
function routeTo(name){
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route===name));
  qa('.route').forEach(r => r.classList.remove('active'));
  q(`#route-${name}`)?.classList.add('active');
}

window.addEventListener('DOMContentLoaded', async () => {
  // Auth
  q('#loginForm')?.addEventListener('submit', async (e)=>{ e.preventDefault();
    const email = q('#email')?.value.trim().toLowerCase(); const password = q('#password')?.value || '';
    if (!email || !password) return toast('Enter email and password');
    try { const user = await doLogin(email,password); enterApp(user); toast(`Welcome, ${user.name||user.email}`); }
    catch(err){ toast(err.message || 'Login failed'); }
  });
  q('#logoutBtn')?.addEventListener('click', doLogout);

  // Nav
  qa('.nav-btn').forEach(b => b.addEventListener('click', () => routeTo(b.dataset.route)));

  // Appointments
  q('#appointmentForm')?.addEventListener('submit', submitAppointment);

  // Events
  q('#newEventBtn')?.addEventListener('click', ()=> q('#eventDialog')?.showModal());
  q('#eventForm')?.addEventListener('submit', submitEvent);
  q('#cancelEventBtn')?.addEventListener('click', ()=> q('#eventDialog')?.close?.());
  q('#prevMonthBtn')?.addEventListener('click', ()=>{ _calBase = new Date(_calBase.getFullYear(), _calBase.getMonth()-1, 1); refreshEvents(); });
  q('#nextMonthBtn')?.addEventListener('click', ()=>{ _calBase = new Date(_calBase.getFullYear(), _calBase.getMonth()+1, 1); refreshEvents(); });

  // Resume
  const ok = await tryResume(); const me = getSession();
  if (ok && me?.id) enterApp(me); else showLogin();
});
