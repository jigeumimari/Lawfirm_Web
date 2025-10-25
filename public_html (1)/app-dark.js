/* ============================================================================
   Talampas App — App JS (consolidated)
   - Works with your existing HTML (themeCheckbox, pages, tables, dialogs)
   - Includes: Theme toggle, Router, Profiles (list/add/edit/archive),
               Specialization (employees), Role-aware nav, Logout
   - Uses POST action verbs for update/archive to avoid host blocks on PUT/DELETE
   ============================================================================ */

/* --------------------- API helper (robust) --------------------- */
function API(p){
  var s = String(p || '');
  if (/^https?:\/\//i.test(s)) return s;         // absolute
  s = s.replace(/^\//, '');                       // '/api/x' -> 'api/x'
  if (s.startsWith('api/')) return new URL(s, location.href).toString();
  return new URL('api/' + s, location.href).toString();
}

async function api(path, opts){
  opts = opts || {};
  var method = opts.method || 'GET';
  var body   = opts.body;

  var fetchOpts = {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: opts.headers || {}
  };

  if (body && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
    fetchOpts.headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  } else {
    fetchOpts.body = body; // let browser set boundary for FormData/URLSearchParams
  }

  const res = await fetch(API(path), fetchOpts);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const payload = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof payload === 'string' ? payload : (payload.error || res.status));
  return payload;
}

/* --------------------- Utilities --------------------- */
function el(sel, ctx=document){ return ctx.querySelector(sel); }
function fmtDate(s){
  if(!s) return '—';
  var d = new Date(s);
  return isNaN(+d) ? s : d.toLocaleString([], {month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function uniq(arr){var o=[];arr.forEach(x=>{if(!o.includes(x))o.push(x)});return o;}

/* --------------------- THEME (Light/Dark) --------------------- */
(function themeInit(){
  var cb = document.getElementById('themeCheckbox');
  var saved = null; try { saved = localStorage.getItem('ta_theme'); } catch(_){}
  var prefersDark = false;
  try { prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch(_){}

  function apply(mode){
    mode = (mode === 'light') ? 'light' : 'dark'; // normalize
    document.body.classList.remove('theme-dark','theme-light');
    document.body.classList.add(mode === 'dark' ? 'theme-dark' : 'theme-light');
    try { localStorage.setItem('ta_theme', mode); } catch(_){}
    if (cb) cb.checked = (mode === 'dark');
  }

  var initial = saved ? saved : (prefersDark ? 'dark' : 'dark'); // default to DARK
  apply(initial);

  cb && cb.addEventListener('change', function(){ apply(cb.checked ? 'dark' : 'light'); });
})();

/* --------------------- Profile dropdown (open/close + role pill) --------------------- */
(function(){
  var btn  = document.getElementById('profileBtn');
  var menu = document.getElementById('profileDropdown');
  if (!btn || !menu) return;

  function openMenu(){
    menu.hidden = false; btn.setAttribute('aria-expanded','true');
    setTimeout(function(){
      document.addEventListener('click', onDoc, true);
      document.addEventListener('keydown', onEsc, true);
    }, 0);

    try {
      var me = JSON.parse(sessionStorage.getItem('ta_session') || '{}');
      if (me && me.role) setMeRole(me);
      if (me && (me.full_name || me.email)) setSignedAs(me);
    } catch (_) {}
  }
  function closeMenu(){
    menu.hidden = true; btn.setAttribute('aria-expanded','false');
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onEsc, true);
  }
  function onDoc(e){ if (!menu.contains(e.target) && e.target !== btn) closeMenu(); }
  function onEsc(e){ if (e.key === 'Escape') closeMenu(); }

  btn.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  });
})();

/* --------------------- Session / role --------------------- */
function setSessionUser(u){ try { sessionStorage.setItem('ta_session', JSON.stringify(u || {})); } catch(_){} }
function getCurrentUser(){ try { return JSON.parse(sessionStorage.getItem('ta_session') || '{}'); } catch(_) { return {}; } }
function prettyRole(r){r=(r||'').toLowerCase();return r==='admin'?'Admin':r==='employee'?'Employee':r==='client'?'Client':'—';}
function setMeName(u){
  var n = u.full_name || u.name || u.username || u.email || '—';
  var t = el('#meName'); if (t) t.textContent = n;
}
function setSignedAs(u){
  var n = u.full_name || u.email || '—';
  var line = el('#signedAs'); if (!line) return;
  line.textContent = 'Signed in as ' + n;
}
function setMeRole(u){
  if (!u) return;
  var sidebar = el('#sidebarRole'); if (sidebar) sidebar.textContent = prettyRole(u.role);

  var dd = document.getElementById('profileDropdown'); if (!dd) return;
  dd.querySelectorAll('#dropdownRolePill, .role-pill, .profile-role-icon')
    .forEach(function(node){ if (node.id === 'dropdownRolePill') node.remove(); });

  var headerLine = dd.querySelector('.signed-as') || dd.firstElementChild;
  if (!headerLine) return;

  var pill = document.createElement('span');
  pill.id = 'dropdownRolePill';
  pill.className = 'role-pill ' + (u.role || '').toLowerCase();
  pill.textContent = prettyRole(u.role);
  pill.style.marginLeft = '8px';
  pill.style.verticalAlign = 'baseline';
  headerLine.appendChild(pill);
}

/* Hide/show nav per role */
function enforceRoleNavigation(role){
  role = (role || '').toLowerCase();
  document.querySelectorAll('[data-roles]').forEach(function(el){
    var allow = (el.getAttribute('data-roles') || '').toLowerCase().split(/\s*,\s*/);
    el.style.display = allow.includes(role) ? '' : 'none';
  });
}

/* --------------------- Pages + router --------------------- */
var map = {
  dashboard: el('.page-dashboard'),
  cases: el('#page-cases'),
  schedules: el('#page-schedules'),
  profiles: el('#page-profiles'),
  profilesLawyers: el('#page-profiles-lawyers'),
  profilesClients: el('#page-profiles-clients'),
  appointments: el('#page-appointments'),
  roles: el('#page-roles'),
  profilesArchived: el('#page-profiles-archived') // ✅ added
};
function show(page){
  Object.keys(map).forEach(function(k){ if (map[k]) map[k].hidden = true; });
  if (map[page]) map[page].hidden = false;
  if (page === 'profiles') loadProfilesAllPage();
  if (page === 'profilesLawyers') loadLawyersPage();
  if (page === 'profilesClients') loadClientsPage();
  if (page === 'appointments') loadAppointmentsPage();
  if (page === 'profilesArchived') loadArchivedPage(); // ✅ call
}

document.querySelectorAll('.nav-link[data-page]').forEach(function(a){
  a.addEventListener('click', function(e){
    e.preventDefault();
    document.querySelectorAll('.nav-link').forEach(function(x){ x.classList.remove('active'); });
    a.classList.add('active');
    show(a.getAttribute('data-page'));
  });
});

/* Profiles dropdown open/close + routing */
(function(){
  var profToggle = document.querySelector('.nav-toggle[data-toggle="profiles"]');
  var profSub = el('#nav-profiles');
  var profGroup = profToggle ? profToggle.parentNode : null;
  if (!profToggle || !profSub || !profGroup) return;

  profToggle.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    var hidden = profSub.hasAttribute('hidden');
    if (hidden){
      profSub.removeAttribute('hidden'); profGroup.classList.add('open'); profToggle.classList.add('active');
      var r = (getCurrentUser().role || '').toLowerCase();
      show(r === 'employee' ? 'profilesLawyers' : 'profiles');
    } else {
      profSub.setAttribute('hidden',''); profGroup.classList.remove('open'); profToggle.classList.remove('active');
    }
  });

  document.querySelectorAll('.nav-sublink').forEach(function(link){
    link.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      document.querySelectorAll('.nav-sublink').forEach(function(s){ s.classList.remove('active'); });
      link.classList.add('active');
      var key = link.getAttribute('data-page');
      show(key === 'profiles-lawyers'  ? 'profilesLawyers'
         : key === 'profiles-clients'  ? 'profilesClients'
         : key === 'profiles-archived' ? 'profilesArchived'  // ✅ route
         : 'profiles');
    });
  });
})();

/* --------------------- Fetchers --------------------- */
function loadMe(){ return api('/api/me.php').then(function(r){ return r.user || r; }); }
function loadUsersAll(){ return api('/api/users.php').then(function(o){ return Array.isArray(o)?o:(o.data||[]); }).catch(function(){ return []; }); }
function loadUsersByRole(role){
  return api('/api/users.php').then(function(o){
    var list = Array.isArray(o) ? o : (o.data || []);
    return list.filter(function(u){ return (u.role||'').toLowerCase() === String(role).toLowerCase(); });
  }).catch(function(){ return []; });
}


function loadAppointments(){ return api('/api/appointments.php').then(function(o){ return Array.isArray(o)?o:(o.data||[]); }).catch(function(){ return []; }); }

/* --------------------- Renderers --------------------- */
function roleBadgeHTML(role){
  var r = (role || '').toLowerCase();
  var label = r === 'admin' ? 'Admin' : r === 'employee' ? 'Employee' : r === 'client' ? 'Client' : '—';
  return '<span class="role-pill '+ r +'">'+ label +'</span>';
}

// List used for validation and pretty labels
var SPECIALIZATIONS = [
  'Family Law', 'Immigration', 'Insurance Law', 'Criminal Case',
  'Litigation', 'Labor and Employment', 'Civil', 'Corporate'
];

function specBadgeHTML(spec){
  if (!spec) return '—';
  return '<span class="role-pill spec">'+ spec +'</span>'; // reuses pill style
}

function leftAlignTableFromTbody(tbody){
  var table = tbody.closest('table'); if (!table) return;
  table.style.textAlign = 'left';
  table.querySelectorAll('th, td').forEach(function(cell){
    cell.style.textAlign = 'left';
    cell.style.verticalAlign = 'middle';
  });
}

/* cache of last list */
var USERS_CACHE = new Map();

/* Render All/Role-specific Users with Actions column */
function renderUsersTable(tbodySelector, users){
  var tbody = document.querySelector(tbodySelector);
  if (!tbody) return;
  tbody.innerHTML = '';

  USERS_CACHE.clear();

  var me = (function(){ try { return JSON.parse(sessionStorage.getItem('ta_session')||'{}'); } catch(_) { return {}; }})();
  var viewerIsAdmin = ((me.role || '').toLowerCase() === 'admin');
  var inAllUsers = tbodySelector.includes('tbl-users'); // actions only here
  var inLawyers  = tbodySelector.includes('tbl-lawyers');

  if (!viewerIsAdmin){
    users = users.filter(function(u){ return (u.role || '').toLowerCase() !== 'admin'; });
  }

  if (!users.length){
    var span = inAllUsers ? 5 : (inLawyers ? 5 : 4);
    tbody.innerHTML = '<tr><td colspan="'+ span +'" style="color:var(--muted);padding:16px;text-align:left">No records found.</td></tr>';
    leftAlignTableFromTbody(tbody);
    return;
  }

  users.forEach(function(u){
    var id   = u.id || u.user_id || u.email || '';
    USERS_CACHE.set(String(id), u);

    var spec = u.specialization || u.speciality || u.specialty || '';
    var html =
      '<td>'+ (u.full_name || '—') +'</td>'+
      '<td>'+ (u.email || '—') +'</td>'+
      '<td class="td-role">'+ roleBadgeHTML(u.role) +'</td>';

    if (inLawyers) html += '<td>'+ (spec ? specBadgeHTML(spec) : '—') +'</td>';

    html += '<td>'+ (u.status || '—') +'</td>';

    if (inAllUsers) {
      html +=
        '<td class="actions">'+
        '<button class="action-btn ghost" data-action="view-schedules" data-id="'+id+'">View schedules</button>'+
        (viewerIsAdmin ? '<button class="action-btn" data-action="edit" data-id="'+id+'">Edit</button>' : '')+
        (viewerIsAdmin ? '<button class="action-btn danger" data-action="archive" data-id="'+id+'">Archive</button>' : '')+
        '</td>';
    }

    var tr = document.createElement('tr');
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  leftAlignTableFromTbody(tbody);
}

/* Appointments (client) */
function renderAppointmentsTable(list){
  var tbody = el('#tbl-appointments tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!list.length){
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);padding:16px;text-align:left">No appointments found.</td></tr>';
    return;
  }
  list.forEach(function(a){
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>'+ (a.title || '—') +'</td>'+
      '<td>'+ fmtDate(a.when || a.date || a.datetime) +'</td>'+
      '<td>'+ (a.location || '—') +'</td>'+
      '<td>'+ (a.type || '—') +'</td>';
    tbody.appendChild(tr);
  });
}

/* ===== Appointments — helpers (client booking + list) ===== */

// Status badge
function aptStatusBadge(s){
  s = (s || '').toLowerCase();
  const cls = s === 'accepted' ? 'accepted' : s === 'rejected' ? 'rejected' : 'pending';
  return `<span class="badge ${cls}">${s || 'pending'}</span>`;
}

// Fetch all appointments (uses your existing API helper)
async function fetchAppointmentsList(){
  try{
    const res = await fetch(API('/api/appointments.php'), { credentials: 'include', cache: 'no-store' });
    const ct  = (res.headers.get('content-type') || '').toLowerCase();
    const p   = ct.includes('json') ? await res.json() : await res.text();
    const data = Array.isArray(p) ? p : (p && p.data) ? p.data : [];
    console.debug('[appointments] fetched', data);
    return data;
  }catch(e){ return []; }
}

// Create a booking
async function createAppointment(payload){
  const actions = ['add','create','book','']; 
  for (const action of actions){
    const body = new URLSearchParams(payload);
    if (action) body.set('action', action);
    try{
      const res = await fetch(API('/api/appointments.php'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const p  = ct.includes('json') ? await res.json() : await res.text();
      if (res.ok && (typeof p === 'string' || (p && p.ok !== false))) return { ok:true, payload:p };
    }catch(_){ /* try next action */ }
  }
  return { ok:false };
}

// Render client-only list into #tbl-client-appts
function renderClientAppointments(rows){
  const tb = document.querySelector('#tbl-client-appts tbody');
  if (!tb) return;
  tb.innerHTML = '';
  if (!rows.length){
    tb.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">No appointments yet.</td></tr>';
    return;
  }
  rows.forEach(a=>{
    const tr = document.createElement('tr');
    const when = (a.preferred_date ? a.preferred_date : '—') + (a.preferred_time ? (' ' + a.preferred_time) : '');
    tr.innerHTML = `
      <td>${when}</td>
      <td>${a.title || ((getCurrentUser().full_name || 'Client') + ' — Appointment Request')}</td>
      <td>${a.practice_area || '—'}</td>
      <td>${a.appointment_type || '—'}</td>
      <td>${aptStatusBadge(a.status)}</td>
      <td>${a.details || '—'}</td>
    `;
    tb.appendChild(tr);
  });
}

/* --------------------- Page loaders --------------------- */
function loadProfilesAllPage(){
  var me = getCurrentUser();
  return loadUsersAll().then(function(list){
    if ((me.role || '').toLowerCase() !== 'admin'){
      list = list.filter(function(u){
        var r = (u.role || '').toLowerCase();
        return r === 'employee' || r === 'client';
      });
    }
    renderUsersTable('#tbl-users tbody', list);
  });
}
function loadLawyersPage(){
  var me = getCurrentUser();
  return loadUsersByRole('employee').then(function(list){
    if ((me.role || '').toLowerCase() !== 'admin'){
      list = list.filter(function(u){ return (u.role || '').toLowerCase() !== 'admin'; });
    }
    renderUsersTable('#tbl-lawyers tbody', list);
  });
}
function loadClientsPage(){
  var me = getCurrentUser();
  return loadUsersByRole('client').then(function(list){
    if ((me.role || '').toLowerCase() !== 'admin'){
      list = list.filter(function(u){ return (u.role || '').toLowerCase() !== 'admin'; });
    }
    renderUsersTable('#tbl-clients tbody', list);
  });
}

// --- ID helpers (make filtering robust) ---
function getUserId(u){
  return String(u?.id ?? u?.user_id ?? u?.uid ?? '');
}
function getRowClientId(a){
  return String(a?.client_id ?? a?.user_id ?? a?.uid ?? a?.clientid ?? '');
}

/* ===== Appointments — page loader (REPLACE your old one) ===== */
/* ===== Appointments — page loader (REPLACE with this) ===== */
async function loadAppointmentsPage(){
  // ensure we know who is logged in
  let u = getCurrentUser();
  if (!u || !u.id){
    try { u = await loadMe(); if (u && u.user) u = u.user; setSessionUser(u); } catch(_){}
  }
  const role = (u.role || '').toLowerCase();

  // fetch & render client's list
  const all = await fetchAppointmentsList();

// figure out my id safely
const myId = getUserId(u);

// keep only this client's rows (or show all if not a client)
let rows = role === 'client'
  ? all.filter(x => getRowClientId(x) === myId)
  : all;

// if nothing shows but we obviously have data, fall back to showing all
if (role === 'client' && !rows.length && all.length) {
  console.debug('[appointments] No rows matched client_id', { myId, sample: all[0] });
  rows = all; // temporary fallback so you can at least see data
}

renderClientAppointments(rows);


  // bind submit once
  const form = document.getElementById('bookForm');
  const msg  = document.getElementById('apt_msg');
  
  // --- Prevent past date/time selections (client-side UX) ---
(function initDateTimeGuards(){
  const dateEl = document.getElementById('apt_date');
  const timeEl = document.getElementById('apt_time');

  if (!dateEl || !timeEl) return;

  // Set <input type="date"> min to today (local)
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  dateEl.min = `${y}-${m}-${d}`;                 // HTML expects yyyy-mm-dd
  // If current value is older than today, clear it
  if (dateEl.value && dateEl.value < dateEl.min) dateEl.value = dateEl.min;

  // When user picks today, prevent times earlier than now (rounded to next 5 mins)
  function bumpToNext5Min(dt){
    const ms = 1000 * 60 * 5;
    return new Date(Math.ceil(dt.getTime()/ms) * ms);
  }
  function updateTimeMin(){
    // reset any min first
    timeEl.removeAttribute('min');

    const selected = dateEl.value; // yyyy-mm-dd
    if (!selected) return;

    const now = new Date();
    const [yy,mm,dd] = selected.split('-').map(Number);
    const isToday = (yy === now.getFullYear() && (mm-1) === now.getMonth() && dd === now.getDate());

    if (isToday){
      const next = bumpToNext5Min(now);
      const hh = String(next.getHours()).padStart(2,'0');
      const mi = String(next.getMinutes()).padStart(2,'0');
      const minStr = `${hh}:${mi}`;
      timeEl.min = minStr;

      // If chosen time is in the past, bump it
      if (timeEl.value && timeEl.value < minStr) timeEl.value = minStr;
    }
  }

  dateEl.addEventListener('change', updateTimeMin);
  // run once on load
  updateTimeMin();
})();

  if (form && !form.dataset.bound){
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();

      // auto-title (ticket)
      const autoTitle = `${u.full_name || u.email || 'Client'} — Appointment Request`;

      const payload = {
        client_id: u.id,
        title: autoTitle,  // <-- auto-generated
        preferred_date:   document.getElementById('apt_date').value,
        preferred_time:   document.getElementById('apt_time').value,
        appointment_type: document.getElementById('apt_type').value,
        details:          document.getElementById('apt_details').value,
        practice_area:    document.getElementById('apt_practice').value,
        status: 'pending'
      };

      // basic required
      if (!payload.client_id || !payload.preferred_date || !payload.preferred_time){
        if (msg) msg.textContent = 'Please complete date & time.'; 
        return;
      }

      // RELOAD all appts to validate against latest (prevents stale state)
      const allNow = await fetchAppointmentsList();

      // ---- Limits ----
      // 1) Per-user max 3 active (pending/accepted)
      const isActive = a => ['pending','accepted'].includes((a.status||'').toLowerCase());
      const userActive = allNow.filter(a => String(a.client_id) === String(u.id) && isActive(a));
      if (userActive.length >= 3){
        if (msg) msg.textContent = 'Limit reached: you can have max 3 active bookings.';
        return;
      }

      // 2) Per-day max 30 (count any non-rejected bookings for that date)
      const dayCount = allNow.filter(a => (a.preferred_date === payload.preferred_date) && isActive(a)).length;
      if (dayCount >= 30){
        if (msg) msg.textContent = 'Selected date is fully booked (30/day). Please choose another date.';
        return;
      }

      // create
      if (msg) msg.textContent = 'Submitting...';
      const r = await createAppointment(payload);
      if (r.ok){
        if (msg) msg.textContent = 'Appointment request submitted.';
        form.reset();

        // refresh list
        const all2  = await fetchAppointmentsList();
        const rows2 = role === 'client' ? all2.filter(x => String(x.client_id) === String(u.id)) : all2;
        renderClientAppointments(rows2);
      } else {
        if (msg) msg.textContent = 'Failed to submit request.';
      }
      
      // ---- Extra client-side check for past datetime ----
{
  const now = new Date();
  const [yy, mm, dd] = payload.preferred_date.split('-').map(Number); // yyyy-mm-dd
  const [HH, II]      = (payload.preferred_time || '00:00').split(':').map(Number); // HH:II
  const when = new Date(yy, mm - 1, dd, HH, II, 0, 0);

  if (isNaN(+when)) {
    if (msg) msg.textContent = 'Invalid date/time.';
    return;
  }
  // reject anything before now (with a tiny 1-minute grace)
  if (when.getTime() < (now.getTime() - 60*1000)) {
    if (msg) msg.textContent = 'Selected date/time is already in the past.';
    return;
  }
}

    });
  }
}



/* --------------------- Add User (admin only) --------------------- */
(function(){
  var btn  = document.getElementById('btnAddUser');
  var dlg  = document.getElementById('dlgAddUser');
  var form = document.getElementById('formAddUser');
  var roleSel = document.getElementById('au_role');
  var specRow = document.getElementById('row_specialization');
  var specSel = document.getElementById('au_specialization');

  if (!btn || !dlg || !form) return;

  function isAdmin(){
    try { var me = JSON.parse(sessionStorage.getItem('ta_session') || '{}'); return (me.role || '').toLowerCase() === 'admin'; }
    catch(_) { return false; }
  }
  function openDlg(){
    form.reset();
    if (roleSel) roleSel.value = 'employee';
    toggleSpecField();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  }
  function closeDlg(){ if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  function toggleSpecField(){
    var role = (roleSel && roleSel.value || '').toLowerCase();
    var show = (role === 'employee');
    if (specRow) specRow.hidden = !show;
    if (!show && specSel) specSel.value = '';
  }
  roleSel && roleSel.addEventListener('change', toggleSpecField);

  // open
  btn.addEventListener('click', function(e){
    e.preventDefault();
    if (!isAdmin()) return;
    openDlg();
  });

  // cancel
  document.getElementById('au_cancel')?.addEventListener('click', function(){
    closeDlg();
  });

  // submit
  form.addEventListener('submit', async function(e){
    e.preventDefault();

    var full_name = (document.getElementById('au_name')||{}).value?.trim();
    var email     = (document.getElementById('au_email')||{}).value?.trim().toLowerCase();
    var role      = (document.getElementById('au_role')||{}).value || 'client';
    var pass      = (document.getElementById('au_password')||{}).value;
    var confirmEl = document.getElementById('au_confirm');
    var confirm   = confirmEl ? confirmEl.value : undefined;

    if (!full_name || !email || !pass) { alert('Please fill name, email, and password.'); return; }
    if (pass.length < 6)               { alert('Password must be at least 6 characters.'); return; }
    if (typeof confirm === 'string' && pass !== confirm){ alert('Passwords do not match.'); return; }

    role = String(role).toLowerCase();
    if (!['admin','employee','client'].includes(role)) role = 'client';

    var specialization = '';
    if ((role || '').toLowerCase() === 'employee' && specSel) {
      var val = (specSel.value || '').trim();
      specialization = SPECIALIZATIONS.includes(val) ? val : '';
    }

    var body = new URLSearchParams();
    body.set('action', 'add'); // handled same as plain POST on server, safe to include
    body.set('full_name', full_name);
    body.set('email', email);
    body.set('role', role);
    body.set('password', pass);   // send the password under the DB column name
    body.set('status', 'active');      // many backends require status, matches your table

    if (specialization) body.set('specialization', specialization);

    try {
      const res = await fetch(API('/api/users.php'), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const payload = ct.includes('application/json') ? await res.json() : await res.text();

      if (res.ok && (
        (payload && (payload.ok === true || payload.success === true || payload.id || payload.status === 'ok')) ||
        (typeof payload === 'string' && /(^|\b)(ok|success|created|inserted)(\b|$)/i.test(payload))
      )) {
        closeDlg();
        await loadProfilesAllPage();
      } else {
        console.error('Create failed:', payload);
        alert('Create failed');
      }
    } catch (err) {
      console.error('Network/server error creating user:', err);
      alert('Network/server error creating user.');
    }
  });
})();

/* --------------------- Edit User modal --------------------- */
var euDlg   = document.getElementById('dlgEditUser');
var euForm  = document.getElementById('formEditUser');
var euId    = document.getElementById('eu_id');
var euName  = document.getElementById('eu_name');
var euEmail = document.getElementById('eu_email');
var euRole  = document.getElementById('eu_role');
var euStatus= document.getElementById('eu_status');
var euSpecRow = document.getElementById('eu_row_specialization');
var euSpec = document.getElementById('eu_specialization');

function toggleEditSpecField(){
  if (!euRole || !euSpecRow || !euSpec) return;
  var show = (euRole.value || '').toLowerCase() === 'employee';
  euSpecRow.hidden = !show;
  if (!show) euSpec.value = '';
}
euRole && euRole.addEventListener('change', toggleEditSpecField);

function openEditUser(u){
  if (!euDlg) return;
  euId.value    = u.id || u.user_id || '';
  euName.value  = u.full_name || '';
  euEmail.value = u.email || '';
  euRole.value  = (u.role || 'client').toLowerCase();
  euStatus.value= (u.status || 'active').toLowerCase();
  euSpec.value  = (u.specialization || u.speciality || u.specialty || '');
  toggleEditSpecField();

  if (euDlg.showModal) euDlg.showModal(); else euDlg.setAttribute('open','');
}
function closeEditDlg(){
  if (!euDlg) return;
  if (euDlg.close) euDlg.close(); else euDlg.removeAttribute('open');
}
document.getElementById('eu_cancel')?.addEventListener('click', closeEditDlg);

/* submit edit */
euForm && euForm.addEventListener('submit', async function(e){
  e.preventDefault();
  var id    = euId.value;
  var name  = euName.value.trim();
  var email = euEmail.value.trim().toLowerCase();
  var role  = (euRole.value || 'client').toLowerCase();
  var status= (euStatus.value || 'active').toLowerCase();
  var spec  = (role === 'employee') ? (euSpec.value || '') : '';

  if (!id || !name || !email){ alert('Missing required fields.'); return; }

  var body = new URLSearchParams();
  body.set('action','update');
  body.set('id', id);
  body.set('full_name', name);
  body.set('email', email);
  body.set('role', role);
  body.set('status', status);
  if (spec) body.set('specialization', spec);

  try{
    const res = await fetch(API('/api/users.php'), {
      method:'POST',
      credentials:'include',
      cache:'no-store',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    const ct = (res.headers.get('content-type')||'').toLowerCase();
    const payload = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok || (payload && payload.ok === false)) {
      console.error('Update failed:', payload);
      alert('Update failed');
      return;
    }
    closeEditDlg();
    await loadProfilesAllPage();
  } catch(err){
    console.error(err);
    alert('Network/server error');
  }
});

/* --------------------- Users table action wiring --------------------- */
document.addEventListener('click', async function(e){
  var btn = e.target.closest('.action-btn');
  if (!btn) return;

  var action = btn.getAttribute('data-action');
  var id = btn.getAttribute('data-id');

  if (action === 'view-schedules'){
    document.querySelector('.nav-link[data-page="schedules"]')?.click();
    return;
  }

  if (action === 'edit'){
    var u = USERS_CACHE.get(String(id));
    if (!u){ alert('User not found'); return; }
    openEditUser(u);
    return;
  }

  if (action === 'archive'){
    if (!confirm('Archive this user?')) return;

    // POST action=archive (works even if DELETE is blocked by host)
    var body = new URLSearchParams();
    body.set('action','archive');
    body.set('id', id);

    try{
      const res = await fetch(API('/api/users.php'), {
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body
      });
      const ct = (res.headers.get('content-type')||'').toLowerCase();
      const payload = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok || (payload && payload.ok === false)) {
        console.error('Archive failed:', payload);
        alert('Archive failed');
        return;
      }

      // Remove row instantly
      var row = btn.closest('tr');
      if (row) row.parentNode.removeChild(row);

      // Reload to ensure list excludes archived
      await loadProfilesAllPage();
    } catch(err){
      console.error(err);
      alert('Network/server error');
    }
    return;
  }
}, true);

/* --------------------- Logout --------------------- */
document.getElementById('btnLogout')?.addEventListener('click', function(e){
  e.preventDefault();
  api('/api/logout.php', { method:'POST' }).finally(function(){
    location.href = '/auth/login.html';
  });
});

/* --------------------- Boot --------------------- */
(function boot(){
  loadMe().then(function(u){
    if (u && u.user) u = u.user;
    if (u && u.id){
      setSessionUser(u);
      setMeName(u);
      setSignedAs(u);
      setMeRole(u);
      enforceRoleNavigation(u.role);
    }
    var role = (u.role || '').toLowerCase();
    if (role === 'client'){ show('appointments'); }
    else if (role === 'employee'){ show('profilesLawyers'); }
    else { show('dashboard'); }
  });
})();

/* --------------------- Notifications (pending appointments) --------------------- */
async function loadNotifications(){
  try {
    const res = await fetch(API('/api/notifications.php'), {credentials:'include'});
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.data)) return;

    const bell = document.querySelector('.notif-icon');
    const badge = document.querySelector('.notif-badge');
    if (!bell || !badge) return;

    const pending = data.data.length;
    badge.textContent = pending > 0 ? pending : '';
    badge.hidden = pending === 0;

    // Optional: populate dropdown list
    const drop = document.querySelector('#notifList');
    if (drop) {
      drop.innerHTML = pending === 0
        ? '<li class="empty">No pending appointments</li>'
        : data.data.map(a => `
            <li>
              <strong>${a.title || 'Appointment'}</strong><br>
              ${a.practice_area || ''} — ${a.preferred_date || ''} ${a.preferred_time || ''}
            </li>
          `).join('');
    }
  } catch (err) { console.warn('Notif load failed', err); }
}

/* ------------------ Notifications: click-to-review ------------------ */

// keep a small cache for quick modal open
const NOTIF_CACHE = new Map();

// augment your existing render inside loadNotifications()
async function loadNotifications() {
  try {
    const res = await fetch('api/notifications.php', { credentials: 'include' });
    const data = await res.json();

    const listEl = document.querySelector('.notif-list');
    const badgeEl = document.querySelector('.badge-count');

    const rows = (data && data.ok && Array.isArray(data.data)) ? data.data : [];
    // cache
    NOTIF_CACHE.clear();
    rows.forEach(r => { if (r && r.id != null) NOTIF_CACHE.set(String(r.id), r); });

    // badge
    if (badgeEl){
      const c = rows.length;
      badgeEl.textContent = c ? (c>99?'99+':c) : '';
      badgeEl.hidden = !c;
    }

    // dropdown
    if (listEl){
      listEl.innerHTML = rows.length ? rows.map(r => `
        <li class="notif-item" data-id="${r.id}">
          <div class="notif-title">${r.title || 'Appointment Request'}</div>
          <div class="notif-meta">
            ${r.practice_area || '—'} • ${r.preferred_date || ''} ${r.preferred_time || ''}
          </div>
        </li>
      `).join('') : `<li class="empty">No pending appointments</li>`;
    }
  } catch (e) {
    console.error('Notification fetch failed:', e);
  }
}

/* ===== Notifications: render actionable items & handlers ===== */
const bellBtn   = document.querySelector('.notify-btn');
const bellBadge = document.querySelector('.badge-count');
const bellMenu  = (function ensureMenu(){
  let dd = document.getElementById('notifyMenu');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'notifyMenu';
    dd.className = 'notify-dropdown';
    dd.hidden = true;
    document.body.appendChild(dd);
  }
  return dd;
})();

function positionBellMenu() {
  const r = bellBtn.getBoundingClientRect();
  bellMenu.style.position = 'fixed';
  bellMenu.style.top = (r.bottom + 8) + 'px';
  bellMenu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  bellMenu.style.width = '360px';
  bellMenu.style.maxHeight = '70vh';
  bellMenu.style.overflow = 'auto';
  bellMenu.style.zIndex = 9999;
}

async function refreshNotifications() {
  // admins see all pending; employees see pending assigned to them; clients see their pending
  const me = getCurrentUser();
  const all = await fetchAppointmentsList();
  const role = (me.role || '').toLowerCase();

  let list = [];
  if (role === 'admin') list = all.filter(a => (a.status||'').toLowerCase()==='pending');
  else if (role === 'employee') list = all.filter(a =>
    (a.status||'').toLowerCase()==='pending' && (String(a.assigned_to||'') === String(me.id)));
  else list = all.filter(a => (a.status||'').toLowerCase()==='pending' && String(a.client_id)===String(me.id));

  // badge
  if (bellBadge) bellBadge.textContent = list.length ? String(list.length) : '';
  
  // build dropdown
  bellMenu.innerHTML = '';
  if (!list.length) {
    bellMenu.innerHTML = `<div class="empty" style="padding:12px;color:var(--muted)">No pending appointments.</div>`;
    return;
  }

  list.forEach(a=>{
    const when = (a.preferred_date || '') + (a.preferred_time ? ` • ${a.preferred_time}` : '');
    const item = document.createElement('div');
    item.className = 'notif-item';

    item.innerHTML = `
      <div>
        <div class="notif-title">${a.title || 'Appointment Request'}</div>
        <div class="notif-sub">${(a.practice_area||'—')} • ${when || '—'}</div>
      </div>
      <div class="notif-actions">
        <button class="btn-pill js-decline" data-id="${a.id}">Decline</button>
        <button class="btn-pill btn-pill--primary js-accept" data-id="${a.id}">Accept</button>
      </div>
    `;
    // both title area and buttons open the modal (buttons also fill action later)
    item.querySelector('.notif-title').style.cursor='pointer';
    item.querySelector('.notif-title').addEventListener('click', ()=> openReviewModal(a.id));
    item.querySelector('.notif-sub').style.cursor='pointer';
    item.querySelector('.notif-sub').addEventListener('click', ()=> openReviewModal(a.id));

    item.querySelector('.js-accept').addEventListener('click', (e)=>{
      e.stopPropagation();
      openReviewModal(a.id, 'accept');
    });
    item.querySelector('.js-decline').addEventListener('click', async (e)=>{
      e.stopPropagation();
      // immediate reject without opening modal:
      if (!confirm('Reject this appointment?')) return;
      await updateAppointmentStatus(a.id, 'reject');
      await refreshNotifications();
      await loadAppointmentsPage?.();
    });

    bellMenu.appendChild(item);
  });
}

async function updateAppointmentStatus(id, action, assign_to) {
  const body = new URLSearchParams({ action, id });
  if (assign_to) body.set('assign_to', String(assign_to));
  const res = await fetch(API('/api/appointments.php'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  });
  const p = await res.json().catch(()=>({}));
  if (!res.ok || p.ok === false) {
    alert(p.error || 'Action failed');
    return false;
  }
  return true;
}

/* ----- Modal population + actions ----- */
async function openReviewModal(id, intent){
  // find the record
  const all = await fetchAppointmentsList();
  const a = all.find(x => String(x.id) === String(id));
  if (!a) return;

  // fill fields
  el('#rv_id').value      = a.id;
  el('#rv_client').value  = a.client_name || a.client_email || a.client_id || '—';
  el('#rv_when').value    = (a.preferred_date || '') + (a.preferred_time ? ` ${a.preferred_time}` : '');
  el('#rv_practice').value= a.practice_area || '—';
  el('#rv_type').value    = a.appointment_type || '—';
  el('#rv_details').value = a.details || '';

  // build attorney select (try to prioritize matching specialization)
  const me = getCurrentUser();
  const users = await loadUsersAll();
  const emps  = users.filter(u => (u.role||'').toLowerCase()==='employee');
  const match = a.practice_area ? emps.filter(e => (e.specialization||'').toLowerCase() === (a.practice_area||'').toLowerCase()) : [];
  const rvSel = el('#rv_attorney');
  const help  = el('#rv_attorney_help');

  rvSel.innerHTML = '';
  const mkOption = (v,t) => { const o=document.createElement('option'); o.value=v; o.textContent=t; return o; };

  if (match.length) {
    rvSel.append(mkOption('', '— select attorney —'));
    match.forEach(e => rvSel.append(mkOption(e.id, `${e.full_name} • ${e.specialization||'General'}`)));
    help.textContent = '';
  } else {
    rvSel.append(mkOption('', '— select attorney —'));
    emps.forEach(e => rvSel.append(mkOption(e.id, `${e.full_name}${e.specialization?(' • '+e.specialization):''}`)));
    help.textContent = 'No exact specialty match found; showing all attorneys.';
  }

  // open dialog
  const dlg = document.getElementById('dlgReviewAppt');
  if (dlg?.showModal) dlg.showModal(); else dlg?.setAttribute('open','');

  // If the user clicked Accept on the pill, pre-focus the Accept button
  if (intent === 'accept') setTimeout(()=>document.getElementById('btnAcceptAppt')?.focus(), 50);
}

// bind modal buttons (once)
(function bindReviewButtons(){
  const okBtn  = document.getElementById('btnAcceptAppt');
  const noBtn  = document.getElementById('btnDeclineAppt');
  const dlg    = document.getElementById('dlgReviewAppt');

  if (!okBtn || !noBtn || !dlg) return;

  okBtn.addEventListener('click', async ()=>{
    const id = el('#rv_id').value;
    const assign = el('#rv_attorney').value || '';
    if (!(await updateAppointmentStatus(id, 'accept', assign))) return;
    dlg.close();
    await refreshNotifications();
    await loadAppointmentsPage?.();
  });

  noBtn.addEventListener('click', async ()=>{
    const id = el('#rv_id').value;
    if (!(await updateAppointmentStatus(id, 'reject'))) return;
    dlg.close();
    await refreshNotifications();
    await loadAppointmentsPage?.();
  });
})();

/* ----- open/close behaviour for bell ----- */
bellBtn?.addEventListener('click', async (e)=>{
  e.preventDefault();
  e.stopPropagation();
  positionBellMenu();
  bellMenu.hidden = !bellMenu.hidden;
  if (!bellMenu.hidden) {
    await refreshNotifications();
    positionBellMenu();
    setTimeout(()=>{
      const onDoc = (ev)=>{
        if (!bellMenu.contains(ev.target) && ev.target !== bellBtn) {
          bellMenu.hidden = true;
          document.removeEventListener('click', onDoc, true);
        }
      };
      document.addEventListener('click', onDoc, true);
    },0);
  }
});


// open dialog on item click
document.querySelector('.notif-list')?.addEventListener('click', (e)=>{
  const li = e.target.closest('.notif-item');
  if (!li) return;
  e.stopPropagation();
  openAptReview(li.dataset.id);
  document.querySelector('.notif-list').hidden = true;
});

// modal elements
const dlgA = document.getElementById('dlgAptReview');
const fA   = document.getElementById('aptReviewForm');
const ui = {
  client:  document.getElementById('apt_client'),
  practice:document.getElementById('apt_practice'),
  when:    document.getElementById('apt_when'),
  details: document.getElementById('apt_details'),
  assign:  document.getElementById('apt_assign'),
  hint:    document.getElementById('apt_assign_hint'),
  err:     document.getElementById('apt_err'),
  accept:  document.getElementById('aptAccept'),
  reject:  document.getElementById('aptReject'),
  cancel:  document.getElementById('aptCancel'),
  close:   document.getElementById('aptClose'),
};

let CURRENT_APT_ID = null;

// open & populate modal
async function openAptReview(id){
  CURRENT_APT_ID = id;
  const row = NOTIF_CACHE.get(String(id)) || {};
  const me  = (JSON.parse(sessionStorage.getItem('ta_session')||'{}'));

  // basic info
  ui.client.textContent   = row.client_name || row.client_email || '—';
  ui.practice.textContent = row.practice_area || '—';
  ui.when.textContent     = `${row.preferred_date || ''} ${row.preferred_time || ''}`.trim();
  ui.details.textContent  = row.details || '—';
  ui.err.textContent      = '';

  // populate attorney list (employees). Prefer same specialization.
  ui.assign.innerHTML = `<option value="">— select attorney —</option>`;
  const all = await loadUsersAll().catch(()=>[]);
  const employees = all.filter(u => (u.role||'').toLowerCase()==='employee');
  const sameSpec  = employees.filter(u => (u.specialization||'').toLowerCase() === (row.practice_area||'').toLowerCase());

  const source = sameSpec.length ? sameSpec : employees;
  if (sameSpec.length === 0) {
    ui.hint.textContent = 'No matching specialty found; showing all attorneys.';
  } else {
    ui.hint.textContent = `Showing ${sameSpec.length} attorney(s) specialized in “${row.practice_area}”.`;
  }
  source.forEach(u=>{
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.full_name} — ${u.specialization||'General'}`;
    ui.assign.appendChild(opt);
  });

  // show
  if (dlgA.showModal) dlgA.showModal(); else dlgA.setAttribute('open','');
}

// close helpers
function closeAptReview(){
  if (dlgA.close) dlgA.close(); else dlgA.removeAttribute('open');
  CURRENT_APT_ID = null;
}
ui.close?.addEventListener('click', closeAptReview);
ui.cancel?.addEventListener('click', closeAptReview);

// actions
ui.accept?.addEventListener('click', async ()=>{
  if (!CURRENT_APT_ID) return;
  ui.err.textContent = 'Saving…';
  const body = new URLSearchParams();
  body.set('action', 'accept');
  body.set('id', CURRENT_APT_ID);
  const assignTo = ui.assign.value.trim();
  if (assignTo) body.set('assign_to', assignTo);

  try{
    const res = await fetch(API('/api/appointments.php'),{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    const p = await res.json().catch(()=>({}));
    if (!res.ok || p.ok===false){ ui.err.textContent = p.error || 'Failed to accept.'; return; }
    closeAptReview();
    await loadNotifications();           // refresh dropdown + badge
    if (typeof loadAppointmentsPage==='function') loadAppointmentsPage(); // refresh client/adm lists if on page
  }catch(e){ ui.err.textContent = 'Network error.'; }
});

ui.reject?.addEventListener('click', async ()=>{
  if (!CURRENT_APT_ID) return;
  if (!confirm('Reject this appointment?')) return;
  ui.err.textContent = 'Saving…';
  const body = new URLSearchParams();
  body.set('action','reject');
  body.set('id', CURRENT_APT_ID);

  try{
    const res = await fetch(API('/api/appointments.php'),{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    const p = await res.json().catch(()=>({}));
    if (!res.ok || p.ok===false){ ui.err.textContent = p.error || 'Failed to reject.'; return; }
    closeAptReview();
    await loadNotifications();
    if (typeof loadAppointmentsPage==='function') loadAppointmentsPage();
  }catch(e){ ui.err.textContent = 'Network error.'; }
});


// refresh every 60 s
setInterval(loadNotifications, 60000);
window.addEventListener('focus', loadNotifications);
loadNotifications();

/* ------------------ Notifications: Dropdown Pending Appointments ------------------ */
const NOTIF = {
  btn: document.querySelector('.notify-btn'),
  badge: document.querySelector('.badge-count'),
  list: document.querySelector('.notif-list')
};

function updateBadge(count) {
  if (!NOTIF.badge) return;
  if (count > 0) {
    NOTIF.badge.textContent = count > 99 ? '99+' : count;
    NOTIF.badge.hidden = false;
  } else {
    NOTIF.badge.textContent = '';
    NOTIF.badge.hidden = true;
  }
}

async function loadNotifications() {
  try {
    const res = await fetch('api/notifications.php', { credentials: 'include' });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.data)) return;

    const pending = data.data;
    updateBadge(pending.length);

    if (NOTIF.list) {
      NOTIF.list.innerHTML = pending.length === 0
        ? `<li class="empty">No pending appointments</li>`
        : pending.map(a => `
            <li class="notif-item">
              <div class="notif-title">${a.title || 'Appointment Request'}</div>
              <div class="notif-meta">
                ${a.practice_area || '—'} • ${a.preferred_date || ''} ${a.preferred_time || ''}
              </div>
            </li>
          `).join('');
    }
  } catch (err) {
    console.error('Notification fetch failed:', err);
  }
}

NOTIF.btn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (NOTIF.list) NOTIF.list.hidden = !NOTIF.list.hidden;
});

document.addEventListener('click', () => {
  if (NOTIF.list) NOTIF.list.hidden = true;
});

window.addEventListener('focus', loadNotifications);
setInterval(loadNotifications, 60000);
loadNotifications();


/*ARCHIVED*/
// fetcher
const loadArchived = ()=> fetch(API('/api/archived_users.php'),{credentials:'include'})
  .then(r=>r.json()).then(o=>Array.isArray(o)?o:(o.data||[])).catch(()=>[]);

// renderer
function renderArchivedTable(list){
  const tbody = document.querySelector('#tbl-archived tbody'); if (!tbody) return;
  tbody.innerHTML='';
  if (!list.length){ tbody.innerHTML='<tr><td colspan="6" style="color:var(--muted);padding:16px;text-align:left">No archived users.</td></tr>'; return; }
  list.forEach(u=>{
    const id = u.id || u.user_id || u.email || '';
    const spec = u.specialization || '';
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${u.full_name||'—'}</td>`+
      `<td>${u.email||'—'}</td>`+
      `<td>${prettyRole(u.role)}</td>`+  // changed from roleNice to prettyRole
      `<td>${spec?'<span class="role-pill spec">'+spec+'</span>':'—'}</td>`+
      `<td>${u.archived_at||'—'}</td>`+
      `<td class="actions">
         <button class="action-btn" data-action="restore" data-id="${id}">Restore</button>
         <button class="action-btn danger" data-action="purge" data-id="${id}">Delete</button>
       </td>`;
    tbody.appendChild(tr);
  });
}

// page loader hook
function loadArchivedPage(){ return loadArchived().then(renderArchivedTable); }

// actions
document.addEventListener('click', async (e)=>{
  const rbtn = e.target.closest('.action-btn[data-action="restore"]');
  if (rbtn){
    const id = rbtn.getAttribute('data-id');
    const body = new URLSearchParams({action:'restore', id});
    const res = await fetch(API('/api/archived_users.php'), {method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    const p = await res.json().catch(()=>({}));
    if(!res.ok || !p.ok) return alert(p.error||'Restore failed');
    await loadArchivedPage();
    await loadProfilesAllPage();
    return;
  }
  const pbtn = e.target.closest('.action-btn[data-action="purge"]');
  if (pbtn){
    if(!confirm('Permanently delete this archived user?')) return;
    const id = pbtn.getAttribute('data-id');
    const body = new URLSearchParams({action:'purge', id});
    const res = await fetch(API('/api/archived_users.php'), {method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    const p = await res.json().catch(()=>({}));
    if(!res.ok || !p.ok) return alert(p.error||'Delete failed');
    await loadArchivedPage();
  }
});
