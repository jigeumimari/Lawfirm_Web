/* ==========================================================================
   Talampas & Associates — App Script (UPDATED, COMMENTED)
   - Keep original structure; only change what you requested
   - Major updates are tagged with  ✱  and explained inline
   ========================================================================== */

/* ---------- Tiny DOM helpers ---------- */
const q  = (sel, ctx=document) => ctx.querySelector(sel);
const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const fmt = (d) => new Date(d).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'2-digit'});

/* ---------- Date helpers ---------- */
function localISO(d = new Date()){
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().split('T')[0];
}
function prettyDate(isoDate){
  if(!isoDate) return '—';
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'2-digit', year:'numeric' });
}
function timeAgo(ts){
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - Number(ts));
  const s = Math.floor(diff/1000);
  if (s < 20) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s/60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h/24);
  return `${d}d ago`;
}

/* ---------- Storage keys ---------- */
const DB_KEY = 'ta_db_v2_intake';
const SESSION_KEY = 'ta_session_v2';
const DB_REV_KEY = 'ta_db_rev_v2';

/* ---------- Attachments policy ---------- */
const ATTACH_ALLOWED = ['.pdf','.doc','.docx','.png','.jpg','.jpeg','.heic','.txt'];
const ATTACH_MAX_BYTES = 200 * 1024 * 1024;
const ATTACH_HINT = `Attach files: ${ATTACH_ALLOWED.map(x=>x.replace('.','').toUpperCase()).join(', ')} • up to ${Math.floor(ATTACH_MAX_BYTES/1024/1024)} MB total`;

/* ---------- Presence (simple heartbeat in localStorage) ---------- */
const PRESENCE_PREFIX = 'ta_presence_';
const PRESENCE_HEARTBEAT_MS = 8000;
const PRESENCE_ONLINE_MS = 20 * 1000;
const PRESENCE_AWAY_MS   = 5 * 60 * 1000;

const Presence = {
  timer: null,
  email: null,
  start(email){
    this.stop();
    this.email = email;
    this.beat();
    this.timer = setInterval(()=> this.beat(), PRESENCE_HEARTBEAT_MS);
    window.addEventListener('beforeunload', () => this.clear(), { once:true });
    document.addEventListener('visibilitychange', () => this.beat());
  },
  beat(){
    if (!this.email) return;
    localStorage.setItem(PRESENCE_PREFIX + this.email, String(Date.now()));
  },
  clear(){ if (this.email) localStorage.removeItem(PRESENCE_PREFIX + this.email); },
  stop(){ if (this.timer){ clearInterval(this.timer); this.timer = null; } },
  get(email){
    const ts = Number(localStorage.getItem(PRESENCE_PREFIX + email) || 0);
    const age = Date.now() - ts;
    if (age <= PRESENCE_ONLINE_MS) return { state:'online', ts };
    if (age <= PRESENCE_AWAY_MS)   return { state:'away', ts };
    return { state:'offline', ts };
  },
  dot(state){
    const color = state==='online' ? '#22c55e' : state==='away' ? '#eab308' : '#64748b';
    return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin:0 6px 1px 6px;vertical-align:middle;"></span>`;
  }
};

/* ---------- Seed data ---------- */
function addDays(d, n=0){ const x = new Date(d); x.setDate(x.getDate()+n); return x.toISOString(); }
const DEFAULT_DB = {
  users: [
    { id:'u1', name:'A. Administrator', email:'admin@talampas.com', role:'admin',    password:'admin123', active:true, resetPin:'1111' },
    { id:'u2', name:'E. Employee',      email:'emp@talampas.com',   role:'employee', password:'emp123',   active:true, resetPin:'2222' },
    { id:'u3', name:'C. Client',        email:'client@talampas.com',role:'client',   password:'client123',active:true, resetPin:'3333' },
  ],
  cases: [
    { id:'C-2001', client:'C. Client', clientEmail:'client@talampas.com', practice:'Family Law',
      status:'Pending Review', nextDate:addDays(new Date(),5), assignee:'', notes:'Submitted by client. Awaiting Admin assignment.',
      files: [], progress: 25 }
  ],
  events: [
    { id:'E-1', title:'Hearing: C-2001', date:addDays(new Date(),5), time:'10:00', notes:'Regional Trial Court', caseId:'C-2001' }
  ],
  threads: [
    { id:'T-1', title:'Admin ↔ Client – C-2001', isGroup:false,
      members:['admin@talampas.com','client@talampas.com'],
      messages:[
        { id:'M-1', from:'admin@talampas.com',  body:'Welcome to Talampas & Associates. We will coordinate here.', ts: Date.now()-86400000, attachments: [], hiddenFor: [] },
        { id:'M-2', from:'client@talampas.com', body:'Thank you!', ts: Date.now()-86000000, attachments: [], hiddenFor: [] },
      ]
    }
  ],
  appointments: [],
  availability: [],
  activity: [ 'Intake workflow edition initialized.' ]
};

/* ---------- DB helpers ---------- */
function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw){
    localStorage.setItem(DB_KEY, JSON.stringify(DEFAULT_DB));
    return structuredClone(DEFAULT_DB);
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.availability)) data.availability = [];
    return data;
  } catch {
    localStorage.setItem(DB_KEY, JSON.stringify(DEFAULT_DB));
    return structuredClone(DEFAULT_DB);
  }
}
function saveDB(db){
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  localStorage.setItem(DB_REV_KEY, String(Date.now()));
}
function pushActivity(msg){
  const db = loadDB();
  db.activity.unshift(`${new Date().toLocaleString()}: ${msg}`);
  db.activity = db.activity.slice(0, 60);
  saveDB(db);
}

/* ---------- Session helpers ---------- */
function setSession(user){ localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function getSession(){ const raw = localStorage.getItem(SESSION_KEY); return raw? JSON.parse(raw): null; }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

/* ---------- Keep Cases search fresh ---------- */
function resetCaseSearch(){ const s = q('#caseSearch'); if (s) s.value = ''; }

/* ---------- LiveSync: keep tabs in sync ---------- */
const LiveSync = {
  _rev: localStorage.getItem(DB_REV_KEY) || '0',
  _timer: null,
  init(){
    window.addEventListener('storage', (e) => {
      if (e.key === DB_KEY || e.key === DB_REV_KEY) this._onChange();
      if (e.key && e.key.startsWith(PRESENCE_PREFIX)) {
        Users.renderTable();
      }
    });
    this._timer = setInterval(() => {
      const nowRev = localStorage.getItem(DB_REV_KEY) || '0';
      if (nowRev !== this._rev) this._onChange();
      if (isRouteActive('users')) Users.renderTable();
    }, 1000);
  },
  _onChange(){
    this._rev = localStorage.getItem(DB_REV_KEY) || '0';
    Messages.renderThreads();
    const tId = Messages.state.currentThread;
    if (tId) {
      const db = loadDB(); const me = getSession();
      const t = (db.threads||[]).find(x => x.id === tId);
      if (t && (t.members||[]).includes(me?.email)) { Messages.openThread(tId); }
      else { Messages._resetPane(); }
    }
    Dashboard.update();
    if (isRouteActive('users')) Users.renderTable();
  },
  forceRefresh(){ this._onChange(); }
  
};
function isRouteActive(name){ const route = q(`#route-${name}`); return route && route.classList.contains('active'); }

/* ---------- Toast + Confirm ---------- */
function showToast(msg){
  const el = q('#toast'); if(!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2200);
}
const Confirm = {
  _dlg: null,
  ensure(){
    if (this._dlg) return;
    const dlg = document.createElement('dialog');
    dlg.id = 'confirmDialog';
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form class="form" method="dialog" id="confirmForm">
        <h3 id="cfTitle">Confirm</h3>
        <div id="cfBody" class="hint">Are you sure?</div>
        <div class="actions">
          <button type="button" class="btn ghost" id="cfCancel">Cancel</button>
          <button type="submit" class="btn" id="cfOk">OK</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    this._dlg = dlg;
    q('#cfCancel', dlg).addEventListener('click', ()=> dlg.close('cancel'));
    q('#confirmForm', dlg).addEventListener('submit', (e)=>{ e.preventDefault(); dlg.close('ok'); });
  },
  async open({ title='Confirm', body='Are you sure?', okText='OK', cancelText='Cancel', danger=false }={}){
    this.ensure();
    q('#cfTitle', this._dlg).textContent = title;
    q('#cfBody', this._dlg).textContent = body;
    const okBtn = q('#cfOk', this._dlg);
    okBtn.textContent = okText;
    okBtn.className = 'btn ' + (danger ? 'danger' : 'primary');
    q('#cfCancel', this._dlg).textContent = cancelText;
    this._dlg.showModal();
    return new Promise(resolve => {
      this._dlg.addEventListener('close', function handler(){
        resolve(this.returnValue === 'ok');
        this.removeEventListener('close', handler);
      });
    });
  }
};

/* ---------- Login / logout flow ---------- */
function showLogin(){
  q('#appShell')?.classList.add('hidden');
  q('#loginView')?.classList.add('active');
}
function getAdminEmail(){
  const db = loadDB();
  const admin = (db.users || []).find(u => u.role === 'admin' && u.active) || db.users[0];
  return admin?.email || 'admin@talampas.com';
}
function ensureWelcomeThreadForUser(){ /* intentionally disabled */ }

/* ---------- ✱ Forgot Password flow (unchanged UI, hooked) ---------- */
const PasswordReset = {
  init(){
    this.ensureLink();
    this.ensureDialog();
  },
  ensureLink(){
    const form = q('#loginForm');
    if (!form || q('#forgotLink')) return;
    const link = document.createElement('button');
    link.type = 'button';
    link.id = 'forgotLink';
    link.className = 'btn ghost';
    link.textContent = 'Forgot password?';
    Object.assign(link.style, {
      marginTop:'6px', fontSize:'12px', padding:'2px 6px', width:'auto',
      alignSelf:'start', opacity:'0.9', textDecoration:'underline',
      background:'transparent', border:'none', cursor:'pointer'
    });
    link.addEventListener('click', ()=> this.openDialog());
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    submitBtn?.insertAdjacentElement('afterend', link) || form.appendChild(link);
  },
  ensureDialog(){
    if (q('#forgotDialog')) return;
    const dlg = document.createElement('dialog');
    dlg.id = 'forgotDialog';
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form class="form" id="forgotForm">
        <h3>Reset Password</h3>
        <label><span>Email</span>
          <input type="email" id="fpEmail" placeholder="you@example.com" required />
        </label>
        <label><span>Reset PIN</span>
          <input type="password" id="fpPin" placeholder="4–8 digits set by Admin" required minlength="4" maxlength="8" />
          <small class="hint">Ask Admin for your Reset PIN.</small>
        </label>
        <label><span>New password</span><input type="password" id="fpNew" required minlength="6" /></label>
        <label><span>Confirm new password</span><input type="password" id="fpConfirm" required minlength="6" /></label>
        <div class="actions">
          <button type="button" class="btn ghost" id="fpCancel">Cancel</button>
          <button type="submit" class="btn primary">Reset</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    q('#fpCancel').addEventListener('click', ()=> dlg.close());
    q('#forgotForm').addEventListener('submit', (e)=>{ e.preventDefault(); this._applyReset(); });
  },
  openDialog(){
    const dlg = q('#forgotDialog'); if (!dlg) return;
    ['fpEmail','fpPin','fpNew','fpConfirm'].forEach(id => { const el = q('#'+id); if (el) el.value=''; });
    dlg.showModal();
  },
  _applyReset(){
    const email = q('#fpEmail').value.trim().toLowerCase();
    const pin   = q('#fpPin').value.trim();
    const pass1 = q('#fpNew').value;
    const pass2 = q('#fpConfirm').value;
    if (!email || !pin || !pass1 || !pass2){ showToast('Complete all fields.'); return; }
    if (pass1 !== pass2){ showToast('Passwords do not match.'); return; }
    const db = loadDB();
    const u = (db.users||[]).find(x => x.email === email && x.active);
    if (!u){ showToast('Account not found or inactive.'); return; }
    if (String(u.resetPin||'') !== String(pin)){ showToast('Invalid Reset PIN.'); return; }
    u.password = pass1; saveDB(db);
    q('#forgotDialog').close(); showToast('Password updated. You can now log in.');
  }
};

/* ---------- ✱ Remove “Demo logins” block if present ---------- */
function removeDemoLoginsUI(){
  qa('summary').forEach(s => {
    if (s.textContent && /demo\s*logins/i.test(s.textContent.trim())) {
      const details = s.closest('details');
      (details || s).remove();
    }
  });
  qa('#demoLogins, .demo-logins, [data-demo-logins]').forEach(el => el.remove());
}

/* ---------- Post-login shell ---------- */
function enterApp(user){
  // reset message pane state
  if (Messages?.state) { Messages.state.currentThread = null; Messages.state.pendingAttachments = []; }
  if (typeof Messages?._resetPane === 'function') { Messages._resetPane(); }
  Messages?.removeActionButtons?.();

  q('#loginView')?.classList.remove('active');
  q('#appShell')?.classList.remove('hidden');
  q('#currentUserName') && (q('#currentUserName').textContent = user.name);
  q('#roleBadge') && (q('#roleBadge').textContent = user.role.toUpperCase());

  const role = user.role;
  document.body.dataset.role = role;

  // role-based nav vis
  qa('.only-admin').forEach(el => el.style.display = (role==='admin')? 'inline-flex' : 'none');
  qa('.only-employee').forEach(el => el.style.display = (role==='admin'||role==='employee')? 'inline-flex' : 'none');
  qa('.only-client').forEach(el => el.style.display = (role==='client')? 'inline-flex' : 'none');

  // hide import/export buttons across roles
  q('#exportDataBtn') && (q('#exportDataBtn').style.display = 'none');
  q('#importDataBtn') && (q('#importDataBtn').style.display = 'none');

  resetCaseSearch();

  routeTo('dashboard');
  Dashboard.update();
  Cases.renderTable();
  Calendar.render();
  Availability.ensureAddButton();
  Availability.renderTable();
  Messages.renderThreads();
  Users.renderTable();
  Appointments.renderTable();

  // start presence
  Presence.start(user.email);
  LiveSync.forceRefresh();
}
function onLogin(e){
  e.preventDefault();
  const email = q('#email').value.trim().toLowerCase();
  const password = q('#password').value;
  const db = loadDB();
  const user = db.users.find(u => u.email===email && u.password===password && u.active);
  if(!user){ showToast('Invalid credentials or inactive account.'); return; }
  setSession(user);
  pushActivity(`${user.email} logged in.`);
  enterApp(user);
  showToast(`Welcome back, ${user.name.split(' ')[0]}!`);
}
function onLogout(){
  const me = getSession();
  if(me) pushActivity(`${me.email} logged out.`);
  Presence.clear(); Presence.stop(); clearSession();
  Messages?.removeActionButtons?.();
  showLogin(); showToast('Logged out.');
}
function routeTo(name){
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route===name));
  qa('.route').forEach(r => r.classList.remove('active'));
  const route = q(`#route-${name}`); route && route.classList.add('active');
  if(route?.dataset?.title){ document.title = `${route.dataset.title} – Talampas & Associates`; }

  if (name === 'cases') { resetCaseSearch(); Cases.renderTable(); }
  if (name === 'availability') { Availability.ensureAddButton(); Availability.renderTable(); }
  if (name === 'users') { Users.renderTable(); }
  if (name !== 'messages') { Messages?.removeActionButtons?.(); }

  // Show/hide the client progress card based on route + role
  const _cpCard = q('#clientProgressCardPro');
  if (_cpCard) {
    const me = getSession();
    _cpCard.style.display = (name === 'dashboard' && me?.role === 'client') ? '' : 'none';
  }
  
  Dashboard.update();

  removeInlineGroupPanels();
}

/* ✱ [NG] Remove stray "New Group" UI only (keep Group Chat intact) */
function removeInlineGroupPanels(){
  // Don't touch anything inside the Group Chat dialog
  const isInThreadDialog = (el) => el.closest('#threadDialog');

  // Direct selectors commonly used for a "New Group" UI
  const selectors = [
    '#newGroup',
    '.new-group',
    '[data-new-group]',
    '[aria-label="New Group"]'
  ];

  // Remove exact selector matches (outside the thread dialog only)
  selectors.forEach(sel => {
    Array.from(document.querySelectorAll(sel)).forEach(el => {
      if (!isInThreadDialog(el)) el.remove();
    });
  });

  // Remove buttons/links/menu items whose text is "New Group" or "Create New Group"
  const looksLikeNewGroup = (txt) => /^\s*(create\s+)?new\s+group\s*$/i.test(txt || '');
  Array.from(document.querySelectorAll('button, a, summary, [role="button"], .menu-item, .toolbar .btn, .chip, .badge, .nav-btn, .nav-item'))
    .forEach(el => {
      if (isInThreadDialog(el)) return;
      const txt = (el.textContent || '').trim();
      if (looksLikeNewGroup(txt)) el.remove();
    });

  // Remove panels/sections headed exactly "New Group"
  Array.from(document.querySelectorAll('h1,h2,h3,h4,h5')).forEach(h => {
    if (isInThreadDialog(h)) return;
    if (looksLikeNewGroup(h.textContent)) {
      const panel = h.closest('.card, .panel, section, details, div');
      if (panel && !isInThreadDialog(panel)) panel.remove();
    }
  });
}

/* ---------- Boot (wire everything) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadDB();

  // auth
  q('#loginForm')?.addEventListener('submit', onLogin);
  q('#logoutBtn')?.addEventListener('click', onLogout);

  // nav
  qa('.nav-btn').forEach(b => b.addEventListener('click', () => routeTo(b.dataset.route)));

  // modules
  Cases.init();
  Calendar.init();
  MonthPicker.init();
  Messages.init();
  Users.init();
  Appointments.init();
  Availability.init();
  GlobalSearch.init();
  ImportExport.init();
  PasswordReset.init();
  LiveSync.init();

  // ✱ ensure demo-logins never shows
  removeDemoLoginsUI();

  // dialog controls
  q('#cancelCaseBtn')?.addEventListener('click', () => q('#caseDialog').close());
  q('#cancelEventBtn')?.addEventListener('click', () => q('#eventDialog').close());
  q('#deleteEventBtn')?.addEventListener('click', () => Calendar.remove());
  q('#cancelUserBtn')?.addEventListener('click', () => q('#userDialog').close());

  // session
  const me = getSession();
  if(me){ enterApp(me); } else { showLogin(); }
/*para ma remove yung new group*/
  removeInlineGroupPanels();

});

/* ==========================================================================
   Dashboard (✱ Updated: shows Upcoming Events + Pending Inquiries)
   - Admin/Employee: all events; Pending Inquiries = all cases with 'Pending Review'
   - Client: events for their cases; Pending: their own 'Pending Review' case(s)
   ========================================================================== */
const Dashboard = {
  update(){
    const db = loadDB();
    const me = getSession();
    const role = me?.role;

    const isClient   = role === 'client';
    const isEmployee = role === 'employee'; // paralegal/employee
    const isAdmin    = role === 'admin';

    // scope cases by role
    let cases = db.cases || [];
    if (isClient) cases = cases.filter(c => c.clientEmail === me.email);
    // Employees/Paralegals and Admins: see all cases


    // metrics
    const openCount = cases.filter(c => c.status === 'Open').length;
    q('#metricOpenCases') && (q('#metricOpenCases').textContent = openCount);

    const myCaseIds = new Set(cases.map(c => c.id));
    const upcomingCount = (db.events||[]).filter(e => {
      const in7 = daysFromToday(e.date) <= 7 && daysFromToday(e.date) >= 0;
      if(!in7) return false;
      if(isAdmin || isEmployee) return true;      // admins + employees/paralegals see all
      return myCaseIds.has(e.caseId);             // clients: only their cases
    }).length;
    q('#metricUpcoming') && (q('#metricUpcoming').textContent = upcomingCount);
    q('#metricUnread') && (q('#metricUnread').textContent = 0);

    // headings tweak for client
    document.querySelectorAll('.card h3').forEach(h => {
      if(h.textContent.includes('Total Open Cases')) h.textContent = isClient ? 'My Open Cases' : 'Total Open Cases';
      if(h.textContent.includes('Upcoming Events')) h.textContent = isClient ? 'My Upcoming Events (7d)' : 'Upcoming Events (7d)';
    });

    // Client progress list (unchanged)
    const host1 = q('#clientProgressList');
    const host2 = q('#clientProgressList2');
    const card  = q('#clientProgressCard');
    if(card) card.classList.toggle('hidden', !isClient);
    if(isClient && (host1 || host2)){
      const render = (host) => {
        if(!host) return;
        host.innerHTML = '';
        cases.forEach(c => {
          const pct = (c.progress ?? 0);
          const wrap = document.createElement('div');
          wrap.className = 'progress';
          wrap.innerHTML = `
            <div class="row"><strong>${c.id}</strong><span>${pct}%</span></div>
            <div class="progress-bar"><span style="width:${pct}%"></span></div>
            <div class="muted">${c.practice} • ${c.status}</div>`;
          host.appendChild(wrap);
        });
      };
      render(host1); render(host2);
    }

    // Activity feed visible only for admin (robust wrapper select)
    {
      const feed = q('#activityFeed');
      const wrap =
        feed?.closest('.card') ||
        feed?.closest('section') ||
        feed?.closest('[data-card]') ||
        feed?.parentElement;
      if (wrap) wrap.style.display = (role === 'admin' ? '' : 'none');

      if (role === 'admin' && feed) {
        feed.innerHTML = '';
        (db.activity||[]).slice(0,6).forEach(a => {
          const li = document.createElement('li');
          li.textContent = a;
          feed.appendChild(li);
        });
      }
    }

    // Local helper for detail popup (created once)
    function openDetailDialog(title, bodyHtml){
      let dlg = q('#detailDialog');
      if (!dlg){
        dlg = document.createElement('dialog');
        dlg.id = 'detailDialog';
        dlg.className = 'dialog';
        dlg.innerHTML = `
          <form class="form" method="dialog">
            <h3 id="detailTitle"></h3>
            <div id="detailBody" class="muted"></div>
            <div class="actions">
              <button type="submit" class="btn">Close</button>
            </div>
          </form>`;
        document.body.appendChild(dlg);
      }
      q('#detailTitle', dlg).textContent = title;
      q('#detailBody', dlg).innerHTML = bodyHtml;
      dlg.showModal();
    }

    // Upcoming Events (clickable details) — Admin + Employee/Paralegal see all; Client sees own
    const upHost = q('#upcomingList');
    if (upHost){
      upHost.innerHTML = '';
      let evs = (db.events||[]).filter(e => daysFromToday(e.date) >= 0 && daysFromToday(e.date) <= 14);
      if (isClient) evs = evs.filter(e => myCaseIds.has(e.caseId));
      evs.sort((a,b)=> new Date(a.date) - new Date(b.date));

      if (!evs.length){
        upHost.innerHTML = `<li class="empty">No upcoming events.</li>`;
      } else {
        evs.slice(0,6).forEach(e=>{
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="item-title">${e.title || 'Event'} ${e.time?`<span class="hint">• ${e.time}</span>`:''}</div>
            <div class="item-sub">${prettyDate((e.date||'').split('T')[0])} ${e.caseId?`• <strong>${e.caseId}</strong>`:''}</div>`;
          li.style.cursor = 'pointer';
          li.addEventListener('click', ()=> {
            openDetailDialog("Event Details", `
              <p><strong>Title:</strong> ${e.title || 'Event'}</p>
              <p><strong>Date:</strong> ${prettyDate((e.date||'').split('T')[0])}</p>
              <p><strong>Time:</strong> ${e.time || '—'}</p>
              <p><strong>Case:</strong> ${e.caseId || '—'}</p>
              <p><strong>Notes:</strong> ${escapeHtml(e.notes || '—')}</p>
            `);
          });
          upHost.appendChild(li);
        });
      }
    }

    // Pending Inquiries (clickable details) — Admin sees all; Employee/Paralegal sees assigned; Client sees own
    const pendHost = q('#pendingList');
    if (pendHost){
      pendHost.innerHTML = '';
      let items = cases.filter(c => c.status === 'Pending Review'); // already role-scoped in "cases"
      if (isAdmin) items = (db.cases||[]).filter(c => c.status === 'Pending Review');

      if (!items.length){
        pendHost.innerHTML = `<li class="empty">No pending inquiries.</li>`;
      } else {
        items.slice(0,6).forEach(c=>{
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="item-title">${c.id} — ${escapeHtml(c.client || '—')}</div>
            <div class="item-sub">${escapeHtml(c.practice || '—')} • ${c.notes ? escapeHtml(c.notes) : 'Awaiting admin review'}</div>`;
          li.style.cursor = 'pointer';
          li.addEventListener('click', ()=> {
            openDetailDialog("Inquiry Details", `
              <p><strong>Case ID:</strong> ${c.id}</p>
              <p><strong>Client:</strong> ${escapeHtml(c.client || '—')} ${c.clientEmail ? `(${escapeHtml(c.clientEmail)})` : ''}</p>
              <p><strong>Practice:</strong> ${escapeHtml(c.practice || '—')}</p>
              <p><strong>Status:</strong> ${escapeHtml(c.status || '—')}</p>
              <p><strong>Next Date:</strong> ${c.nextDate ? fmt(c.nextDate) : '—'}</p>
              <p><strong>Assignee:</strong> ${escapeHtml(c.assignee || '—')}</p>
              <p><strong>Notes:</strong> ${escapeHtml(c.notes || '—')}</p>
            `);
          });
          pendHost.appendChild(li);
        });
      }
      // Render client progress card if present (client + dashboard only)
if (document.getElementById('caseProgressListPro')) {
  CaseProgress.render();
}
    }
  }
};

function daysFromToday(dateStr){
  const d = new Date(dateStr); const t = new Date();
  d.setHours(0,0,0,0); t.setHours(0,0,0,0);
  return Math.round((d - t)/86400000);
}

/* ==========================================================================
   Cases (unchanged behavior; minor safety)
   ========================================================================== */
const Cases = {
  init(){
    q('#newCaseBtn')?.addEventListener('click', ()=> this.openDialog());
    q('#caseForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.saveFromDialog(); });
    q('#caseSearch')?.addEventListener('input', ()=> this.renderTable());

    // progress toggle buttons visible only for staff (configured in openDialog)
    q('#caseProgressButtons')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-p]');
      if (!btn) return;
      const me = getSession();
      if (!(me?.role === 'admin' || me?.role === 'employee')) return;
      qa('#caseProgressButtons .toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pct = Number(btn.dataset.p);
      const label = q('#caseProgressLabel'); if (label) label.textContent = `${pct}%`;
    });
  },
  openDialog(caseId){
    const db = loadDB();
    const dlg = q('#caseDialog');
    const me = getSession();
    const role = me?.role;
    const isEdit = !!caseId;

    q('#caseDialogTitle') && (q('#caseDialogTitle').textContent = isEdit? `Edit Case ${caseId}` : 'New Case');

    // staff-only progress
    qa('.progress-edit').forEach(el => el.style.display = (role==='admin'||role==='employee') ? 'grid' : 'none');
    const setProgressButtons = (pct=0) => {
      qa('#caseProgressButtons .toggle').forEach(b => b?.classList.toggle('active', Number(b.dataset.p) === Number(pct)));
      const label = q('#caseProgressLabel'); if (label) label.textContent = `${pct}%`;
      const range = q('#caseProgress'); if (range) range.value = pct;
    };

    if(isEdit){
      const c = db.cases.find(x=>x.id===caseId);
      q('#caseClient')    && (q('#caseClient').value   = c.client);
      q('#casePractice')  && (q('#casePractice').value = c.practice);
      q('#caseStatus')    && (q('#caseStatus').value   = c.status || 'Open');
      q('#caseNextDate')  && (q('#caseNextDate').value = c.nextDate? c.nextDate.split('T')[0] : '');
      q('#caseAssignee')  && (q('#caseAssignee').value = c.assignee || '');
      q('#caseNotes')     && (q('#caseNotes').value    = c.notes || '');
      setProgressButtons(c.progress ?? 0);
      this.renderFilesList(c.files || []);
      dlg.returnValue = caseId;
    } else {
      q('#caseClient')    && (q('#caseClient').value   = role==='client' ? me.name : '');
      q('#casePractice')  && (q('#casePractice').value = 'Family Law');
      q('#caseStatus')    && (q('#caseStatus').value   = role==='client' ? 'Pending Review' : 'Open');
      q('#caseNextDate')  && (q('#caseNextDate').value = '');
      q('#caseAssignee')  && (q('#caseAssignee').value = '');
      q('#caseNotes')     && (q('#caseNotes').value    = '');
      setProgressButtons(0);
      this.renderFilesList([]);
      dlg.returnValue = '';
    }

// ✱ allow Admin + Employee/Paralegal to edit (clients cannot)
const staffCanEdit = (role === 'admin' || role === 'employee');
    q('#caseStatus')   && (q('#caseStatus').disabled   = !staffCanEdit);
    q('#caseAssignee') && (q('#caseAssignee').disabled = !staffCanEdit);
    q('#clientCaseNote')?.classList.toggle('hidden', role!=='client');

    dlg.showModal();
  },
  renderFilesList(files){
    const list = q('#caseFileList'); if(!list) return;
    list.innerHTML = '';
    files.forEach(f => {
      const li = document.createElement('li');
      li.innerHTML = `<a download="${f.name}" href="${f.data}">${f.name}</a> (${Math.round(f.size/1024)} KB)`;
      list.appendChild(li);
    });
  },
  async saveFromDialog(){
    const dlg = q('#caseDialog');
    const db = loadDB();
    const me = getSession();
    const role = me?.role;
    const isEditId = dlg.returnValue || null;

    let status = q('#caseStatus')?.value || 'Open';
    let assignee = (q('#caseAssignee')?.value || '').trim();

    const fileInput = q('#caseFiles');
    const files = fileInput?.files?.length
      ? await readFilesAsDataURLs(fileInput.files)
      : (isEditId ? (db.cases.find(c=>c.id===isEditId)?.files || []) : []);

    const activeBtn = q('#caseProgressButtons .toggle.active');
    let progress = Number(activeBtn?.dataset.p ?? NaN);
    if (Number.isNaN(progress)) {
      progress = Number(q('#caseProgress')?.value ?? (isEditId ? (db.cases.find(c=>c.id===isEditId)?.progress ?? 0) : 0));
    }

    const payload = {
      client: (q('#caseClient')?.value || '').trim(),
      clientEmail: role==='client' ? me.email : (loadDB().users.find(u=>u.name===q('#caseClient')?.value)?.email || undefined),
      practice: q('#casePractice')?.value || 'Family Law',
      status,
      nextDate: q('#caseNextDate')?.value ? new Date(q('#caseNextDate').value).toISOString() : null,
      assignee,
      notes: (q('#caseNotes')?.value || '').trim(),
      files,
      progress
    };

   if (role === 'client' && !isEditId) {
  payload.status = 'Pending Review';
  payload.assignee = '';
}

// ✱ keep whatever status was selected; just log assignment if provided
if ((role === 'admin' || role === 'employee') && assignee) {
  pushActivity(`${me.email} assigned case to ${assignee}.`);
}


    if(isEditId){
      const idx = db.cases.findIndex(c=>c.id===isEditId);
      db.cases[idx] = { ...db.cases[idx], ...payload };
      pushActivity(`${me.email} edited case ${isEditId}.`);
    } else {
      const id = genCaseId(db);
      db.cases.unshift({ id, ...payload });
      pushActivity(`${me.email} created case ${id}.`);
    }

    saveDB(db);
    dlg.close();
    this.renderTable();
    Dashboard.update();
    Calendar.render();
  },
  async delete(id){
    const ok = await Confirm.open({
      title: `Delete Case ${id}?`,
      body: 'This action cannot be undone.',
      okText: 'Delete', cancelText: 'Cancel', danger: true
    });
    if(!ok) return;
    const db = loadDB(); const me = getSession();
    db.cases = db.cases.filter(c=>c.id!==id);
    saveDB(db); pushActivity(`${me.email} deleted case ${id}.`);
    this.renderTable(); Dashboard.update();
  },
  renderTable(){
    const db = loadDB();
    const tbody = q('#caseTable tbody'); if(!tbody) return;
    const role = getSession()?.role; const me = getSession();
    const search = (q('#caseSearch')?.value||'').toLowerCase();

    tbody.innerHTML = '';
    let items = db.cases;

    if (role === 'client') {
    items = items.filter(c => c.clientEmail === me.email);
}   // Employees/Paralegals and Admins: see all


    if(search){ items = items.filter(c => Object.values(c).join(' ').toLowerCase().includes(search)); }

    items = items.slice().sort((a,b) => {
      const rank = s => (s==='Pending Review'?0 : s==='Open'?1 : s==='On Hold'?2 : 3);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      const ad = a.nextDate || '';
      const bd = b.nextDate || '';
      if (ad !== bd) return bd.localeCompare(ad);
      return b.id.localeCompare(a.id);
    });

    for(const c of items){
      const tr = document.createElement('tr');
      const hasFiles = (c.files && c.files.length) ? ` • ${c.files.length} file(s)` : '';
      tr.innerHTML = `
        <td><strong>${c.id}</strong></td>
        <td>${c.client}</td>
        <td>${c.practice}</td>
        <td><span class="badge ${badgeForStatus(c.status)}">${c.status}</span></td>
        <td>${c.nextDate? fmt(c.nextDate): '—'}</td>
        <td>${c.assignee||'—'}</td>
        <td class="right">${actionButtons(c.id)}${hasFiles}</td>`;
      tbody.appendChild(tr);
      tr.querySelector('.edit')?.addEventListener('click', ()=> this.openDialog(c.id));
      tr.querySelector('.del')?.addEventListener('click',  ()=> this.delete(c.id));
    }
  }
};
function genCaseId(db){ let n = 2000 + db.cases.length; let id; do{ id = `C-${n++}`; } while(db.cases.some(c=>c.id===id)); return id; }
function badgeForStatus(s){ return ({ 'Open':'ok', 'On Hold':'warn', 'Closed':'danger', 'Pending Review':'warn' })[s] || 'ok'; }
function actionButtons(id){ const role = getSession()?.role; if(role==='client') return ''; return `<button class="btn edit">Edit</button> <button class="btn danger del">Delete</button>`; }
function readFilesAsDataURLs(fileList){
  const files = Array.from(fileList);
  return Promise.all(files.map(f => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name:f.name, type:f.type, size:f.size, data:r.result });
    r.onerror = reject; r.readAsDataURL(f);
  })));
}

/* ==========================================================================
   Calendar (✱ role-aware visibility; clients see only their cases)
   - Admin/Employee: see all events; can add/edit/delete
   - Client: see events only for their cases; cannot add/edit
   ========================================================================== */
const Calendar = {
  state: { month: new Date().getMonth(), year: new Date().getFullYear() },
  currentEditId: null,

  init(){
    q('#prevMonthBtn')?.addEventListener('click', ()=> this.shift(-1));
    q('#nextMonthBtn')?.addEventListener('click', ()=> this.shift(1));
    q('#newEventBtn')?.addEventListener('click', ()=> this.openDialog());
    q('#eventForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.saveFromDialog(); });
    q('#calendarTitle')?.addEventListener('click', ()=> MonthPicker.open());
  },
  shift(n){
    const {month, year} = this.state;
    const d = new Date(year, month + n, 1);
    this.state.month = d.getMonth();
    this.state.year  = d.getFullYear();
    this.render();
  },
  openDialog(eventId, prefillDate=null){
    const db = loadDB();
    const dlg = q('#eventDialog');
    const isEdit = !!eventId;
    this.currentEditId = isEdit ? eventId : null;

    q('#eventDialogTitle').textContent = isEdit? 'Edit Event' : 'Add Event';
    const delBtn = q('#deleteEventBtn');
    const role = getSession()?.role;

    delBtn?.classList.toggle('hidden', !(isEdit && (role==='admin' || role==='employee')));

    if(isEdit){
      const ev = db.events.find(e=>e.id===eventId);
      if(ev){
        q('#eventTitle').value = ev.title || '';
        q('#eventDate').value  = (ev.date || '').split('T')[0] || '';
        q('#eventTime').value  = ev.time || '';
        q('#eventNotes').value = ev.notes||'';
        q('#eventCaseId').value= ev.caseId||'';
      }
    } else {
      q('#eventTitle').value='';
      q('#eventDate').value= prefillDate || '';
      q('#eventTime').value='';
      q('#eventNotes').value='';
      q('#eventCaseId').value='';
    }

    // ✱ Clients cannot add/edit
    if(role === 'client'){ showToast("Clients cannot add or edit events."); return; }

    dlg.showModal();
  },
  saveFromDialog(){
    const db = loadDB(); const me = getSession(); const dlg = q('#eventDialog'); const editId = this.currentEditId;
    const p = { 
      title: (q('#eventTitle').value || '').trim(),
      date:  new Date(q('#eventDate').value).toISOString(),
      time:  q('#eventTime').value,
      notes: (q('#eventNotes').value || '').trim(),
      caseId:(q('#eventCaseId').value || '').trim()
    };
    if(editId){ 
      const i = db.events.findIndex(e=>e.id===editId); 
      db.events[i] = { ...db.events[i], ...p }; 
      pushActivity(`${me.email} edited an event.`); 
    } else { 
      const id = genEventId(db); 
      db.events.push({ id, ...p }); 
      pushActivity(`${me.email} added an event.`); 
    }
    saveDB(db); dlg.close(); this.render(); Dashboard.update();
  },
  async remove(){
    if(!this.currentEditId) return;
    const ok = await Confirm.open({
      title: 'Delete Event?',
      body: 'This action cannot be undone.',
      okText: 'Delete', cancelText: 'Cancel', danger: true
    });
    if(!ok) return;
    const db = loadDB(); const me = getSession(); const id = this.currentEditId;
    db.events = db.events.filter(e => e.id !== id);
    saveDB(db);
    q('#eventDialog').close();
    pushActivity(`${me.email} deleted an event.`);
    this.render(); Dashboard.update();
  },
  render(){
    const {month, year} = this.state;
    const title = new Date(year, month, 1).toLocaleString(undefined, {month:'long', year:'numeric'});
    q('#calendarTitle') && (q('#calendarTitle').textContent = title);

    const grid = q('#calendarGrid'); if(!grid) return;
    grid.innerHTML = '';

    const first = new Date(year, month, 1);
    const startDay = (first.getDay()+6)%7;
    const days = new Date(year, month+1, 0).getDate();
    for(let i=0;i<startDay;i++){ grid.appendChild(document.createElement('div')); }

    const db = loadDB(); const me = getSession(); const role = me?.role;
    const cases = db.cases || [];

    // ✱ Role filter
    let visibleEvents = db.events || [];
    if (role === 'client') {
    const myCases = new Set(cases.filter(c => c.clientEmail === me.email).map(c => c.id));
    visibleEvents = visibleEvents.filter(ev => myCases.has(ev.caseId));
}
// Admin & Employee/Paralegal: see all events

    // Admin sees all

    for(let d=1; d<=days; d++){
      const cell = document.createElement('div'); cell.className = 'calendar-day';
      const dateStr = new Date(year, month, d).toISOString().split('T')[0];
      cell.dataset.date = dateStr;
      cell.innerHTML = `<div class="d">${d}</div><div class="events"></div>`;

      // Staff can click empty day to add
      if (role==='admin' || role==='employee'){
        cell.addEventListener('click', (ev) => {
          if(ev.target.closest('.calendar-event')) return;
          this.openDialog(null, dateStr);
        });
      }

      const evWrap = cell.querySelector('.events');
      const evsForDay = visibleEvents.filter(e => (e.date||'').startsWith(dateStr));
      evsForDay.forEach(ev => {
        const tag = document.createElement('div');
        tag.className = 'calendar-event';
        tag.textContent = ev.title + (ev.time? ` @ ${ev.time}`:'');
        if(role==='admin' || role==='employee'){
          tag.classList.add('clickable');
          tag.title = 'Click to edit/cancel';
          tag.addEventListener('click', (e)=>{ e.stopPropagation(); this.openDialog(ev.id); });
        }
        evWrap.appendChild(tag);
      });

      grid.appendChild(cell);
    }
  }
};
function genEventId(db){ return `E-${(db.events?.length||0)+1}`; }
function ownsClientCase(me, caseId){
  const db = loadDB(); const c = db.cases.find(x=>x.id===caseId);
  return !!c && c.clientEmail===me.email;
}

/* ---------- Month picker ---------- */
const MonthPicker = {
  open(){
    const dlg = q('#monthPicker'); if(!dlg) return;
    q('#mpMonth').value = String(Calendar.state.month);
    q('#mpYear').value = String(Calendar.state.year);
    dlg.showModal();
  },
  apply(){
    const m = Number(q('#mpMonth').value);
    const y = Number(q('#mpYear').value);
    if (isNaN(m) || isNaN(y)) return;
    Calendar.state.month = m;
    Calendar.state.year = y;
    Calendar.render();
  },
  init(){
    q('#mpGo')?.addEventListener('click', (e)=>{ e.preventDefault(); this.apply(); q('#monthPicker').close(); });
  }
};

/* ==========================================================================
   Messages (✱ Group Chats enabled for admin/employee only)
   - Private thread kept; GC flagged as isGroup:true, allows multiple members
   ========================================================================== */

/* Helper: readable thread title */
function threadDisplayTitle(t){
  const db = loadDB();
  const me = getSession();
  const meName = (db.users||[]).find(u=>u.email===me.email)?.name || me.email;
  if (t.isGroup){
    // For group chat, show title as-is
    return t.title || 'Group Chat';
  }
  // Private chat: show "Me ↔ Other(s)" and keep case suffix like before
  const others = (t.members||[]).filter(e => e !== me.email);
  const otherNames = others.map(e => (db.users||[]).find(u=>u.email===e)?.name || e);
  const caseSuffixMatch = (t.title||'').match(/–\s*(C-\d+)/);
  const suffix = caseSuffixMatch ? ` – ${caseSuffixMatch[1]}` : '';
  return (otherNames.length ? `${meName} ↔ ${otherNames.join(', ')}` : meName) + suffix;
}
function genThreadId(){ return `T-${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`; }

const Messages = {
  state: { currentThread: null, pendingAttachments: [] },

  init(){
    this._ensureAttachmentUI();

    q('#newThreadBtn')?.addEventListener('click', ()=> this.createThread());
    q('#messageForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.sendMessage(); });

    // file attach validation + 200MB cap
    q('#msgFile')?.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || !files.length) return;

      const invalid = [];
      const okFiles = [];
      for (const f of files) {
        const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
        if (!ATTACH_ALLOWED.includes(ext)) invalid.push(f.name);
        else okFiles.push(f);
      }
      if (invalid.length) showToast(`Blocked: ${invalid.slice(0,3).join(', ')} (unsupported)`);

      const existingTotal = this.state.pendingAttachments.reduce((s,f)=>s+(f.size||0),0);
      const newTotalRaw   = okFiles.reduce((s,f)=>s+(f.size||0),0);
      if (existingTotal + newTotalRaw > ATTACH_MAX_BYTES){
        showToast(`Attachments limit: ${Math.floor(ATTACH_MAX_BYTES/1024/1024)} MB total`);
        e.target.value = '';
        return;
      }

      const arr = await readFilesAsDataURLs(okFiles);
      this.state.pendingAttachments.push(...arr);
      this._renderAttachPreview();
      e.target.value = '';
    });

    q('#attachBtn')?.addEventListener('click', ()=>{
      showToast(ATTACH_HINT);
      q('#msgFile')?.click();
    });
  },

  removeActionButtons(){
    q('#leaveThreadBtn')?.remove();
    q('#deleteThreadBtn')?.remove();
  },
  _resetPane(){
    const pane = q('#messagePane'); if (pane) pane.innerHTML = '';
    const title = q('#threadTitle'); if (title) title.textContent = 'Select a conversation';
    const preview = q('#attachPreview'); if (preview) preview.innerHTML = '';
    this.removeActionButtons();
  },
  _ensureAttachmentUI(){
    const form = q('#messageForm'); if (!form) return;
    if (q('#attachBtn')) return;

    const input = q('#messageInput'); if (!input) return;
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = 'auto 1fr auto';
    wrap.style.gap = '8px';
    wrap.appendChild(this._makeAttachButton());
    wrap.appendChild(input.cloneNode(true));
    input.replaceWith(wrap);
    wrap.children[1].id = 'messageInput';

    const file = document.createElement('input');
    file.type = 'file';
    file.id = 'msgFile';
    file.multiple = true;
    file.accept = ATTACH_ALLOWED.join(',');
    file.style.display = 'none';
    form.appendChild(file);

    const preview = document.createElement('div');
    preview.id = 'attachPreview';
    preview.style.display = 'flex';
    preview.style.flexWrap = 'wrap';
    preview.style.gap = '6px';
    preview.style.marginTop = '6px';
    form.insertBefore(preview, form.querySelector('button[type="submit"]'));
  },
  _makeAttachButton(){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'attachBtn';
    btn.className = 'btn';
    btn.title = ATTACH_HINT;
    btn.textContent = '+';
    btn.style.width = '40px';
    return btn;
  },
  _renderAttachPreview(){
    const host = q('#attachPreview'); if(!host) return;
    host.innerHTML = '';
    this.state.pendingAttachments.forEach((f, idx) => {
      const chip = document.createElement('span');
      chip.className = 'badge';
      chip.textContent = `${f.name} (${Math.round((f.size||0)/1024)} KB)`;
      chip.style.cursor = 'pointer';
      chip.title = 'Remove';
      chip.addEventListener('click', ()=>{
        this.state.pendingAttachments.splice(idx,1);
        this._renderAttachPreview();
      });
      host.appendChild(chip);
    });
  },

  renderThreads(){
    const db = loadDB(); const me = getSession(); 
    const list = q('#threadList'); if(!list) return; 
    list.innerHTML = '';
    const mine = (db.threads||[]).filter(t => (t.members||[]).includes(me?.email));
    mine.forEach(t => {
      const li = document.createElement('li');
      li.className = 'thread';
      li.textContent = threadDisplayTitle(t);
      li.setAttribute('role','option');
      li.addEventListener('click', ()=> this.openThread(t.id));
      if(this.state.currentThread===t.id) li.classList.add('active');
      list.appendChild(li);
    });

    if (this.state.currentThread && !mine.some(t=>t.id===this.state.currentThread)){
      this.state.currentThread = null;
      this._resetPane();
    }
  },

  openThread(id){
    const db = loadDB();
    const me = getSession();
    const t = (db.threads||[]).find(x=>x.id===id); 
    if(!t) { showToast('Conversation not found.'); return; }
    if(!(t.members||[]).includes(me?.email)){ 
      showToast('You are not a member of this conversation.');
      this.state.currentThread = null;
      this._resetPane();
      return;
    }

    this.state.currentThread = id;

    q('#threadTitle') && (q('#threadTitle').textContent = threadDisplayTitle(t));
    this.ensureActionButtons(id);

    const wrap = q('#messagePane'); if(!wrap) return; 
    wrap.innerHTML = '';
    (t.messages||[]).forEach(m => {
      const el = this.renderMsg(t.id, m);
      if (el) wrap.appendChild(el);
    });
    wrap.scrollTop = wrap.scrollHeight;
  },

  renderMsg(threadId, m){
    const me = getSession();
    if ((m.hiddenFor||[]).includes(me.email)) return null;

    const div = document.createElement('div');
    div.className = 'msg' + (m.from===me.email? ' me':'' );

    const meta = `<div class="meta">${m.from} • ${new Date(m.ts).toLocaleString()}</div>`;
    let atts = '';
    if (m.attachments && m.attachments.length){
      const links = m.attachments.map(a => `<a download="${a.name}" href="${a.data}">${a.name}</a>`).join(' • ');
      atts = `<div class="muted" style="margin-top:6px">${links}</div>`;
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `${escapeHtml(m.body||'')}${atts}`;

    div.innerHTML = meta;
    div.appendChild(bubble);
    return div;
  },

  async sendMessage(){
    const input = q('#messageInput'); const body = (input?.value || '').trim();
    const db = loadDB(); const me = getSession(); 
    const t = db.threads.find(x=>x.id===this.state.currentThread); 
    if(!t){ showToast('No thread selected.'); return; }
    if (!body && !(this.state.pendingAttachments?.length)){ showToast('Type a message or attach a file.'); return; }
    if (!t.members.includes(me.email)) { showToast('You are not a member of this thread.'); return; }

    const atts = this.state.pendingAttachments.slice();
    this.state.pendingAttachments = [];
    this._renderAttachPreview();

    t.messages.push({ id:`M-${Date.now()}`, from: me.email, body, ts: Date.now(), attachments: atts, hiddenFor: [] });
    saveDB(db); if (input) input.value='';
    this.openThread(t.id);
    pushActivity(`${me.email} sent a message in "${t.title}"`);
    Dashboard.update();
  },

  /* ✱ Create conversation: private DM or Group Chat (admin/employee only) */
  createThread(){
    const me = getSession();
    const db = loadDB();

    let dlg = q('#threadDialog');
    if (!dlg){
      dlg = document.createElement('dialog');
      dlg.id = 'threadDialog';
      dlg.className = 'dialog';
      dlg.innerHTML = `
        <form class="form" id="threadForm">
          <h3>Start a Conversation</h3>

          <!-- ✱ Mode: Private or Group (clients can only Private with staff) -->
          <label><span>Conversation Type</span>
            <select id="threadType">
              <option value="private" selected>Private</option>
              <option value="group">Group (Admins & Employees only)</option>
            </select>
          </label>

          <!-- Private: 1 recipient; Group: multi-select -->
          <label id="recipWrap"><span>Recipient(s)</span>
            <select id="threadRecipient" multiple size="4"></select>
            <small class="hint">Hold Ctrl/Cmd to select multiple for Group Chats.</small>
          </label>

          <label><span>Related Case (optional)</span>
            <select id="threadCase"><option value="">— None —</option></select>
          </label>

          <label><span>Title (for Group Chat)</span>
            <input id="threadTitleInput" placeholder="e.g., Para-legal Team — Weeklies" />
          </label>

          <label><span>First message</span>
            <textarea id="threadFirstMsg" rows="3" placeholder="Write a short message… (optional)"></textarea>
          </label>
          <div class="actions">
            <button type="button" class="btn ghost" id="threadCancelBtn">Cancel</button>
            <button type="submit" class="btn primary">Create</button>
          </div>
        </form>`;
      document.body.appendChild(dlg);

      dlg.querySelector('#threadForm').addEventListener('submit', (e)=>{
        e.preventDefault();
        this._createThreadFromDialog();
      });
      dlg.querySelector('#threadCancelBtn').addEventListener('click', ()=> dlg.close());

      // type toggling
      dlg.querySelector('#threadType').addEventListener('change', () => this._populateRecipients(dlg));
    }

    // populate recipients & cases per role/type
    this._populateRecipients(dlg);

    const caseSel = dlg.querySelector('#threadCase');
    const myCases = (me.role === 'client') ? (db.cases||[]).filter(c => c.clientEmail === me.email) : (db.cases||[]);
    caseSel.innerHTML = `<option value="">— None —</option>` + myCases.map(c => `<option value="${c.id}">${c.id} • ${c.practice}</option>`).join('');

    // reset title when opening
    dlg.querySelector('#threadTitleInput').value = '';
    dlg.querySelector('#threadFirstMsg').value = '';

    dlg.showModal();
  },

  _populateRecipients(dlg){
    const db = loadDB(); const me = getSession();
    const type = dlg.querySelector('#threadType').value;
    const isGroup = (type === 'group');
    const sel = dlg.querySelector('#threadRecipient');

    // ✱ clients cannot create group chats
    if (me.role === 'client' && isGroup){
      showToast('Clients cannot create Group Chats.');
      dlg.querySelector('#threadType').value = 'private';
    }

    // build allowed list:
    let people = (db.users||[]).filter(u => u.active && u.email !== me.email);

    // For Group: only admins/employees allowed to initiate, and participants can be admins/employees/clients
    if (isGroup){
      if (!(me.role === 'admin' || me.role === 'employee')){
        showToast('Only admins/employees can create Group Chats.');
      }
    }

    // Private: anyone except self
    // If you want to restrict client-to-client, add filter here.

    // Toggle multi-select
    sel.multiple = isGroup;
    sel.size = isGroup ? 6 : 4;

    sel.innerHTML = people
      .map(u => `<option value="${u.email}">${u.name} (${u.role})</option>`)
      .join('');

    // Title input visible only for Group
    dlg.querySelector('#threadTitleInput').closest('label').style.display = isGroup ? '' : 'none';
  },

  _createThreadFromDialog(){
    const db = loadDB(); const me = getSession();
    const dlg = q('#threadDialog'); if(!dlg) return;

    const type = dlg.querySelector('#threadType').value;
    const isGroup = (type === 'group');

    // read recipients
    const sel = dlg.querySelector('#threadRecipient');
    const selected = Array.from(sel.selectedOptions).map(o => o.value);

    if (!selected.length) { showToast('Please choose at least one recipient.'); return; }
    if (isGroup && !(me.role === 'admin' || me.role === 'employee')){ showToast('Only admins/employees can create Group Chats.'); return; }

    const caseId = dlg.querySelector('#threadCase')?.value || '';
    const firstMsg = (dlg.querySelector('#threadFirstMsg')?.value || '').trim();
    const customTitle = (dlg.querySelector('#threadTitleInput')?.value || '').trim();

    const id = genThreadId();

    let title;
    if (isGroup){
      title = customTitle || `Group Chat — ${new Date().toLocaleString()}`;
    } else {
      const recipUser = db.users.find(u => u.email === selected[0]);
      title = `${me.name} ↔ ${recipUser?.name||selected[0]}${caseId?` – ${caseId}`:''}`;
    }

    const members = Array.from(new Set([...selected, me.email]));
    const thread = { id, title, isGroup, members, messages: [] };
    (db.threads ||= []).push(thread);
    saveDB(db);

    dlg.close();
    this.state.currentThread = id;
    this.renderThreads();
    this.openThread(id);

    if (firstMsg){
      const db2 = loadDB();
      const t2 = db2.threads.find(x=>x.id===id);
      t2.messages.push({ id:`M-${Date.now()}`, from: me.email, body: firstMsg, ts: Date.now(), attachments: [], hiddenFor: [] });
      saveDB(db2);
      this.openThread(id);
    }

    pushActivity(`${me.email} started ${isGroup?'a group chat':'a conversation'} with ${selected.join(', ')}${caseId?` about ${caseId}`:''}`);
  },

  ensureActionButtons(threadId){
    const head = q('.message-head'); if (!head) return;
    this.removeActionButtons();

    const leaveBtn = document.createElement('button');
    leaveBtn.id = 'leaveThreadBtn';
    leaveBtn.className = 'btn ghost';
    leaveBtn.textContent = 'Remove from My Inbox';
    leaveBtn.style.marginLeft = '8px';
    leaveBtn.title = 'Hide this conversation from your inbox only. Others keep it.';
    leaveBtn.addEventListener('click', () => this.leaveThread(threadId));
    const title = q('#threadTitle', head);
    if (title) title.after(leaveBtn); else head.appendChild(leaveBtn);

    if (getSession()?.role === 'admin'){
      const delBtn = document.createElement('button');
      delBtn.id = 'deleteThreadBtn';
      delBtn.className = 'btn danger';
      delBtn.textContent = 'Delete Conversation';
      delBtn.style.marginLeft = '8px';
      delBtn.title = 'Permanently delete for all participants.';
      delBtn.addEventListener('click', () => this.deleteThread(threadId));
      leaveBtn.after(delBtn);
    }
  },

  async leaveThread(threadId){
    const ok = await Confirm.open({
      title: 'Remove from your inbox?',
      body: 'Only you will no longer see this conversation. Others keep it.',
      okText: 'Remove', cancelText: 'Cancel', danger: false
    });
    if(!ok) return;

    const me = getSession();
    const db = loadDB();
    const t = db.threads.find(x => x.id === threadId);
    if (!t) { showToast('Thread not found.'); return; }
    if (!t.members.includes(me.email)) { showToast('You are not a member of this thread.'); return; }

    t.members = (t.members || []).filter(m => m !== me.email);

    if (t.members.length === 0){
      db.threads = (db.threads || []).filter(x => x.id !== threadId);
    }

    saveDB(db);
    this.state.currentThread = null;
    this._resetPane();
    this.renderThreads();
    pushActivity(`${me.email} left conversation "${t.title}"`);
    showToast('Conversation removed from your inbox.');
  },

  async deleteThread(threadId){
    if (getSession()?.role !== 'admin'){ showToast('Admins only.'); return; }
    const db = loadDB();
    const t = (db.threads||[]).find(x=>x.id===threadId);
    if (!t) return;
    const ok = await Confirm.open({
      title: 'Delete Conversation?',
      body: 'This will permanently delete the entire conversation for all participants.',
      okText: 'Delete', cancelText: 'Cancel', danger: true
    });
    if(!ok) return;
    db.threads = (db.threads||[]).filter(x => x.id !== threadId);
    saveDB(db);
    this.state.currentThread = null;
    this._resetPane();
    this.renderThreads();
    pushActivity(`${getSession().email} deleted conversation "${t.title}"`);
    showToast('Conversation deleted.');
  }
};

/* ==========================================================================
   Users (admin)
   ========================================================================== */
const Users = {
  init(){
    q('#newUserBtn')?.addEventListener('click', ()=> this.openDialog());
    q('#userForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.saveFromDialog(); });
  },
  renderTable(){
    const db = loadDB(); const tbody = q('#userTable tbody'); if(!tbody) return; tbody.innerHTML = '';
    (db.users||[]).forEach(u => {
      const pres = Presence.get(u.email);
      const presLabel = pres.state[0].toUpperCase() + pres.state.slice(1);
      const presHtml = `${Presence.dot(pres.state)}<span class="hint">${presLabel}${pres.ts ? ` • ${timeAgo(pres.ts)}` : ''}</span>`;
      const acct = u.active? 'Active':'Disabled';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${acct} ${presHtml}</td>
        <td class="right">
          <button class="btn edit">Edit</button>
          <button class="btn ${u.active ? 'danger' : ''} toggle">${u.active? 'Disable':'Enable'}</button>
          <button class="btn danger delete">Delete</button>
        </td>`;
      tbody.appendChild(tr);
      tr.querySelector('.edit').addEventListener('click', ()=> this.openDialog(u.id));
      tr.querySelector('.toggle').addEventListener('click', ()=> this.toggle(u.id));
      tr.querySelector('.delete').addEventListener('click', ()=> this.remove(u.id));
    });
  },
  populateAssignableCases(selectEl){
    const db = loadDB();
    const candidates = (db.cases||[])
      .filter(c => !c.assignee || c.status === 'Pending Review')
      .sort((a,b)=> a.id.localeCompare(b.id));
    selectEl.innerHTML = `<option value="">— No immediate assignment —</option>` +
      candidates.map(c => `<option value="${c.id}">${c.id} • ${c.client} • ${c.status}</option>`).join('');
  },
  openDialog(id){
    const db = loadDB(); const dlg = q('#userDialog'); const isEdit = !!id;
    q('#userDialogTitle') && (q('#userDialogTitle').textContent = isEdit? 'Edit User' : 'New User');

    const assignSel = q('#assignCaseForUser');
    if (assignSel) this.populateAssignableCases(assignSel);

    if(isEdit){
      const u = db.users.find(x=>x.id===id);
      q('#userName').value = u.name; 
      q('#userEmail').value = u.email; 
      q('#userRole').value = u.role; 
      q('#userPassword').value = u.password; 
      if (assignSel) assignSel.value = '';
      dlg.returnValue = id;
    } else {
      q('#userName').value=''; 
      q('#userEmail').value=''; 
      q('#userRole').value='employee'; 
      q('#userPassword').value='changeme123'; 
      if (assignSel) assignSel.value = '';
      dlg.returnValue = '';
    }

    // Reset PIN field (append once)
    let pinRow = q('#userResetPinRow');
    if (!pinRow) {
      pinRow = document.createElement('label');
      pinRow.id = 'userResetPinRow';
      pinRow.innerHTML = `<span>Reset PIN</span>
        <input type="text" id="userResetPin" placeholder="e.g., 1234" minlength="4" maxlength="8" />`;
      const actions = q('#userDialog .actions') || q('#userDialog');
      actions.before(pinRow);
    }
    const u0 = isEdit ? db.users.find(x=>x.id===id) : null;
    q('#userResetPin').value = isEdit ? (u0.resetPin || '') : '';

    dlg.showModal();
  },
  saveFromDialog(){
    const db = loadDB(); const dlg = q('#userDialog'); const isEditId = dlg.returnValue||null;

    const p = { 
      name: q('#userName').value.trim(), 
      email: q('#userEmail').value.trim().toLowerCase(), 
      role: q('#userRole').value, 
      password: q('#userPassword').value, 
      active: true 
    };

    const pinVal = (q('#userResetPin')?.value || '').trim();
    if (pinVal) p.resetPin = pinVal;
    if (!isEditId && !p.resetPin) p.resetPin = '0000';

    let targetUser;
    if(isEditId){ 
      const i = db.users.findIndex(u=>u.id===isEditId); 
      db.users[i] = { ...db.users[i], ...p }; 
      targetUser = db.users[i];
      pushActivity(`${getSession().email} edited user ${p.email}`);
    } else { 
      const id = `u${Date.now()}`; 
      targetUser = { id, ...p }; 
      db.users.push(targetUser); 
      pushActivity(`${getSession().email} added user ${p.email}`);
    }

    const assignCaseId = (q('#assignCaseForUser')?.value || '').trim();
    if (assignCaseId){
      const c = db.cases.find(x => x.id === assignCaseId);
      if (c){
        c.assignee = targetUser.email;
        if (c.status === 'Pending Review') c.status = 'Open';
        pushActivity(`${getSession().email} assigned ${assignCaseId} to ${targetUser.email} during user save.`);
      }
    }

    saveDB(db); dlg.close(); 
    this.renderTable();
    Cases.renderTable();
    Messages.renderThreads();
    Dashboard.update();
  },
  toggle(id){
    const db = loadDB(); const u = db.users.find(x=>x.id===id);
    u.active = !u.active; saveDB(db); this.renderTable(); pushActivity(`${getSession().email} ${u.active? 'enabled':'disabled'} ${u.email}`);
  },
  async remove(id){
    const db = loadDB();
    const me = getSession();
    const victim = db.users.find(u => u.id === id);
    if(!victim) return;
    if(victim.email === me.email){ showToast("You can't delete your own account while logged in."); return; }
    if(victim.email === 'admin@talampas.com'){ showToast("Built-in admin cannot be deleted."); return; }

    const ok = await Confirm.open({
      title: `Delete ${victim.name}?`,
      body: `This will permanently delete ${victim.email}. This cannot be undone.`,
      okText: 'Delete', cancelText: 'Cancel', danger: true
    });
    if(!ok) return;

    db.users = db.users.filter(u => u.id !== id);

    // Clean references
    db.cases = (db.cases||[]).map(c => {
      if(c.assignee === victim.email){
        return { ...c, assignee: '', status: c.status === 'Closed' ? 'Closed' : 'Pending Review' };
      }
      if(victim.role === 'client' && c.clientEmail === victim.email){
        return { ...c, clientEmail: '', client: c.client || 'Former Client' };
      }
      return c;
    });
    db.threads = (db.threads||[])
      .map(t => ({ ...t, members: t.members.filter(m => m !== victim.email) }))
      .filter(t => t.members.length >= 2);
    db.appointments = (db.appointments||[]).filter(a => a.client !== victim.email);

    saveDB(db);
    pushActivity(`${me.email} permanently deleted ${victim.email}`);
    this.renderTable();
    Cases.renderTable();
    Messages.renderThreads();
    Dashboard.update();
    showToast('User deleted.');
  }
};

/* ==========================================================================
   Appointments (✱ strict phone length per country; creates case + event)
   ========================================================================== */
const PHONE_COUNTRIES = [
  { name: 'Philippines', code: '+63',  localLen: 10, example: '9123456789' },
  { name: 'Saudi Arabia', code: '+966', localLen: 9,  example: '5XXXXXXXX' },
  { name: 'United States', code: '+1',  localLen: 10, example: '4155550123' },
  { name: 'United Arab Emirates (Dubai)', code: '+971', localLen: 9, example: '5XXXXXXXX' },
  { name: 'Hong Kong', code: '+852', localLen: 8, example: '91234567' },
  { name: 'Singapore', code: '+65',  localLen: 8, example: '81234567' },
  { name: 'Vietnam', code: '+84',    localLen: 9, example: '912345678' },
  { name: 'Thailand', code: '+66',   localLen: 9, example: '812345678' },
];
function getPhoneRuleByCode(code){ return PHONE_COUNTRIES.find(c => c.code === code) || PHONE_COUNTRIES[0]; }

const Appointments = {
  init(){
    q('#appointmentForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.create(); });

    // ✱ Country + local number enforcement
    const sel = q('#phoneCountry');
    const pref = q('#phonePrefix');
    const local = q('#phoneLocal');
    const hint = (q('#phoneLocal')?.closest('label')?.querySelector('small.hint')) || null;

    if (sel){
      // If your HTML provides PH/SA/US/etc as country values, read the data-code if present; fallback to value if it's already a dial code.
      function currentDial(){
        const opt = sel.selectedOptions[0];
        return (opt?.dataset?.code) || sel.value || '+63';
      }

      // Populate using existing <option> nodes (do not rebuild list)
      this._applyPhoneRule(currentDial(), pref, local, hint);
      sel.addEventListener('change', () => {
        this._applyPhoneRule(currentDial(), pref, local, hint);
        if (local) local.value = '';
      });
    }

    if (local){
      local.addEventListener('input', () => {
        const dial = (sel?.selectedOptions?.[0]?.dataset?.code) || sel?.value || '+63';
        const rule = getPhoneRuleByCode(dial);
        // ✱ Hard-enforce digits and max length
        local.value = local.value.replace(/\D/g,'').slice(0, rule.localLen);
      });
    }
  },
  _applyPhoneRule(code, prefEl, localEl, hintEl){
    const rule = getPhoneRuleByCode(code);
    if (prefEl) prefEl.textContent = rule.code;
    if (localEl){
      localEl.maxLength = rule.localLen;
      localEl.placeholder = rule.example || ''.padStart(rule.localLen, '•');
      localEl.value = (localEl.value || '').replace(/\D/g,'').slice(0, rule.localLen);
    }
    if (hintEl) hintEl.textContent = `Enter exactly ${rule.localLen} digit(s) after ${rule.code}.`;
  },

  create(){
    const db = loadDB();
    const me = getSession();

    const sel = q('#phoneCountry');
    const dial = (sel?.selectedOptions?.[0]?.dataset?.code) || sel?.value || '+63';
    const rule = getPhoneRuleByCode(dial);

    const localRaw = (q('#phoneLocal')?.value || '').trim().replace(/\D/g,'');
    if (localRaw.length !== rule.localLen){
      showToast(`Phone number must be exactly ${rule.localLen} digits after ${rule.code}.`);
      return;
    }
    const phone = rule.code + localRaw;

    const p = {
      date: q('#apptDate').value,
      time: q('#apptTime').value,
      practice: q('#apptPractice').value,
      appointmentType: q('#appointmentType')?.value || '',
      phone,
      notes: q('#apptNotes').value.trim(),
      consent: q('#apptConsent').checked
    };

    if(!p.date || !p.time){ showToast('Please select date & time.'); return; }
    if(!p.appointmentType){ showToast('Please select an appointment type.'); return; }
    if(!p.consent){ showToast('Please accept the privacy/terms.'); return; }

    // save appointment
    db.appointments.push({ ...p, status:'Pending', client: me.email });

    // create case + calendar event
    const caseId = createCaseFromAppointment(p, me, db);

    saveDB(db);

    // ✱ Trigger dashboard list to catch "Pending Inquiries"
    Dashboard.update();

    showToast(`Appointment sent. Case ${caseId} is now Pending Review.`);
    q('#appointmentForm').reset();

    // reset phone UI to PH defaults if needed
    const pref = q('#phonePrefix');
    const local = q('#phoneLocal');
    const hint = (q('#phoneLocal')?.closest('label')?.querySelector('small.hint')) || null;
    if (sel){ /* keep current selection */ }
    this._applyPhoneRule(dial, pref, local, hint);

    Cases.renderTable();
    Calendar.render();
    Messages.renderThreads();
  },
  renderTable(){
    const db = loadDB(); const tbody = q('#apptTable tbody'); if(!tbody) return;
    const me = getSession(); tbody.innerHTML='';
    const items = me.role==='client'? db.appointments.filter(a=>a.client===me.email) : db.appointments;
    items.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${fmt(a.date)}</td><td>${a.time}</td><td>${a.practice}</td><td>${a.status}</td>`;
      tbody.appendChild(tr);
    });
  }
};
function createCaseFromAppointment(p, me, db){
  const id = genCaseId(db);
  const nextISO = p.date ? new Date(p.date).toISOString() : null;
  const newCase = {
    id, client: me.name, clientEmail: me.email, practice: p.practice,
    status: 'Pending Review', nextDate: nextISO, assignee: '',
    notes: p.notes || `Submitted by client via appointment form. Type: ${p.appointmentType || 'N/A'}, Phone: ${p.phone || 'N/A'}.`,
    files: [], progress: 0
  };
  db.cases.unshift(newCase);

  if (p.date && p.time){
    const evId = genEventId(db);
    db.events.push({ id: evId, title: `Appointment: ${id}`, date: new Date(p.date).toISOString(), time: p.time, notes: p.notes || '', caseId: id });
  }

  pushActivity(`${me.email} submitted booking -> created case ${id} (Pending Review).`);
  return id;
}

/* ==========================================================================
   Global Search / Import-Export / Misc
   ========================================================================== */
const GlobalSearch = {
  init(){
    q('#searchBtn')?.addEventListener('click', ()=> this.run());
    q('#globalSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); this.run(); } });
  },
  run(){
    const term = q('#globalSearch').value.trim().toLowerCase();
    if(!term) return;

    const db = loadDB();

    const results = {
      cases: db.cases.filter(c => Object.values(c).join(' ').toLowerCase().includes(term)),
      events: db.events.filter(e => Object.values(e).join(' ').toLowerCase().includes(term)),
      users:  db.users.filter(u => Object.values(u).join(' ').toLowerCase().includes(term))
    };

    if (results.cases.length){
      routeTo('cases');
      const s = q('#caseSearch'); if (s){ s.value = term; }
      Cases.renderTable();
      showToast(`Found ${results.cases.length} case(s).`);
      return;
    }
    if (results.users.length){
      routeTo('users');
      showToast(`Found ${results.users.length} user(s).`);
      return;
    }
    if (results.events.length){
      routeTo('calendar');
      showToast(`Found ${results.events.length} event(s).`);
      return;
    }
    showToast('No results.');
  }
};

const ImportExport = {
  init(){
    q('#exportDataBtn')?.addEventListener('click', ()=> this.export());
    q('#importDataBtn')?.addEventListener('click', ()=> q('#importDataInput').click());
    q('#importDataInput')?.addEventListener('change', (e)=> this.import(e));
  },
  export(){
    const db = loadDB();
    const blob = new Blob([JSON.stringify(db, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'talampas-data-intake.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Data exported.');
  },
  import(e){
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if(!data.users || !data.cases){ alert('Invalid file.'); return; }
        if (!Array.isArray(data.availability)) data.availability = [];
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        localStorage.setItem(DB_REV_KEY, String(Date.now()));
        showToast('Data imported.');
        Dashboard.update(); Cases.renderTable(); Calendar.render(); Availability.renderTable(); Messages.renderThreads(); Users.renderTable(); Appointments.renderTable();
      } catch(err){ alert('Import failed.'); }
    };
    reader.readAsText(file);
  }
};

/* ==========================================================================
   Availability (✱ ensure Cancel works, Add visible only to admin)
   ========================================================================== */
function escapeHtml(str){
  return str.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function listActiveStaff(){
  const db = loadDB();
  return (db.users||[]).filter(u => u.active && (u.role==='admin' || u.role==='employee'));
}
function findUserName(email){
  const db = loadDB();
  return (db.users||[]).find(u => u.email === email)?.name || email || '—';
}

const Availability = {
  state: { editId: null },

  init(){
    this.ensureAddButton();

    q('#availForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.saveFromDialog(); });
    q('#cancelAvailBtn')?.addEventListener('click', ()=> q('#availDialog')?.close());  // ✱ ensure cancel closes
    q('#deleteAvailBtn')?.addEventListener('click', ()=> this.remove());

    this.renderTable();
  },
  ensureAddButton(){
    const role = getSession()?.role;
    const card = q('#route-availability .card'); if (!card) return;

    let btn = q('#newAvailBtn');
    if (!btn){
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.innerHTML = `
        <div class="left"><h3>Availability</h3></div>
        <div class="right"><button class="btn primary" id="newAvailBtn">Add Availability</button></div>`;
      const firstChild = card.firstElementChild;
      if (firstChild && !firstChild.matches('.toolbar')) { card.insertBefore(toolbar, firstChild); }
      else if (!firstChild) { card.appendChild(toolbar); }
      btn = toolbar.querySelector('#newAvailBtn');
    }

    if (btn && !btn._bound){
      btn.addEventListener('click', () => this.openDialog());
      btn._bound = true;
    }
    if (btn) btn.style.display = (role === 'admin') ? 'inline-flex' : 'none';
  },
  openDialog(editId=null){
    const dlg = q('#availDialog'); if(!dlg) return;
    const isEdit = !!editId;
    this.state.editId = editId;

    q('#availDialogTitle').textContent = isEdit ? 'Edit Availability' : 'Add Availability';
    q('#deleteAvailBtn')?.classList.toggle('hidden', !isEdit);

    const people = listActiveStaff();
    const sel = q('#availUser');
    if (sel) sel.innerHTML = people.map(u => `<option value="${u.email}">${u.name} (${u.role})</option>`).join('');
    if (!people.length){ showToast('No active attorneys/staff. Add users first.'); return; }

    if (isEdit){
      const db = loadDB();
      const slot = (db.availability||[]).find(a => a.id === editId);
      if (!slot) return;
      q('#availUser').value     = slot.user;
      q('#availDateField').value= slot.date;
      q('#availFrom').value     = slot.from;
      q('#availTo').value       = slot.to;
      q('#availStatus').value   = slot.status;
      q('#availNotes').value    = slot.notes || '';
    } else {
      q('#availUser').value     = people[0]?.email || '';
      q('#availDateField').value= localISO();
      q('#availFrom').value     = '09:00';
      q('#availTo').value       = '12:00';
      q('#availStatus').value   = 'Available';
      q('#availNotes').value    = '';
    }

    dlg.showModal();
  },
  saveFromDialog(){
    const db = loadDB(); const me = getSession();
    if (me?.role !== 'admin'){ showToast('Admins only.'); return; }

    const p = {
      user:   (q('#availUser')?.value || '').trim(),
      date:   (q('#availDateField')?.value || '').trim(),
      from:   (q('#availFrom')?.value || '').trim(),
      to:     (q('#availTo')?.value || '').trim(),
      status: (q('#availStatus')?.value || '').trim(),
      notes:  (q('#availNotes')?.value || '').trim()
    };

    if (!p.user || !p.date){ showToast('Please pick a date and staff.'); return; }
    if (!p.from || !p.to){ showToast('Please set start and end time.'); return; }
    if (p.from >= p.to){ showToast('End time must be after start time.'); return; }

    if (this.state.editId){
      const i = (db.availability||[]).findIndex(a => a.id === this.state.editId);
      if (i >= 0) db.availability[i] = { ...db.availability[i], ...p };
      pushActivity(`${me.email} edited availability for ${p.user} (${p.date} ${p.from}-${p.to}).`);
    } else {
      const id = this.genId(db);
      (db.availability ||= []).push({ id, ...p });
      pushActivity(`${me.email} added availability for ${p.user} (${p.date} ${p.from}-${p.to}).`);
    }

    saveDB(db);
    q('#availDialog')?.close();
    this.renderTable();
    Dashboard.update();
  },
  async remove(){
    if (!this.state.editId) return;
    const ok = await Confirm.open({
      title: 'Delete Availability?',
      body: 'This will remove the selected slot.',
      okText: 'Delete', cancelText: 'Cancel', danger: true
    });
    if(!ok) return;

    const db = loadDB(); const me = getSession();
    db.availability = (db.availability||[]).filter(a => a.id !== this.state.editId);
    saveDB(db);
    q('#availDialog').close();
    pushActivity(`${me.email} deleted an availability slot.`);
    this.renderTable();
    Dashboard.update();
  },
  renderTable(){
    const tbody = q('#availTable tbody'); if (!tbody) return;
    const role = getSession()?.role;
    const db = loadDB();

    const rows = (db.availability||[])
      .slice()
      .sort((a,b) => (a.date===b.date ? (a.from+a.user).localeCompare(b.from+b.user) : b.date.localeCompare(a.date)));

    tbody.innerHTML = '';
    if (!rows.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${role==='admin'?6:5}" class="hint">No availability set yet.</td>`;
      tbody.appendChild(tr);
    } else {
      rows.forEach(a => {
        const tr = document.createElement('tr');
        const statusClass = a.status === 'Available' ? 'avail' : 'unavail';
        tr.innerHTML = `
          <td>${findUserName(a.user)}<div class="hint">${a.user}</div></td>
          <td>${a.date}</td>
          <td>${a.from}</td>
          <td>${a.to}</td>
          <td><span class="badge ${statusClass}">${a.status}</span>${a.notes? ` <span class="hint">• ${escapeHtml(a.notes)}</span>`:''}</td>
          ${role==='admin' ? `<td class="right"><button class="btn edit">Edit</button></td>` : ``}
        `;
        if (role==='admin'){ tr.querySelector('.edit')?.addEventListener('click', ()=> this.openDialog(a.id)); }
        tbody.appendChild(tr);
      });
    }
    this.ensureAddButton();
  },
  genId(db){ return `A-${(db.availability?.length||0)+1}`; }
};

/* =======================================================================
   CaseProgress v2 — CLIENT dashboard progress card (25/50/75/100)
   ======================================================================= */
const CaseProgress = (() => {
  const STAGES = [
    { pct: 25, label: 'First Level Courts' },
    { pct: 50, label: 'Regional Trial Courts' },
    { pct: 75, label: 'Specialized Higher Courts' },
    { pct: 100, label: 'Supreme Court' }
  ];
  const pctToLabel = (p) => (STAGES.find(s => s.pct === p)?.label || '');

  function rowHTML(c){
    const pct = [25,50,75,100].includes(Number(c.progress)) ? Number(c.progress) : 25;
    const metaParts = [
      c.client ? escapeHtml(c.client) : null,
      c.nextDate ? `Next: ${fmt(c.nextDate)}` : null,
      c.status ? escapeHtml(c.status) : null
    ].filter(Boolean);

    return `
      <li class="cp-row">
        <div class="cp-row-head">
          <div class="cp-row-title">${escapeHtml(c.id)} • ${escapeHtml(c.practice || '—')}</div>
          <div class="cp-row-sub">${pct}%</div>
        </div>

        <div class="cp-meta">${metaParts.map(p => `<span>${p}</span>`).join('')}</div>

        <div class="cp-bar"><span style="width:${pct}%;"></span></div>
        <div class="cp-stage">${pctToLabel(pct)}</div>
      </li>`;
  }

  function getClientCases(db, me){
    return (db.cases || [])
      .filter(c => c.clientEmail === me.email)
      .sort((a,b) => a.id.localeCompare(b.id));
  }

  function render(){
    const host  = document.getElementById('caseProgressListPro');
    const empty = document.getElementById('cpEmpty');
    if (!host) return;

    const me = getSession();
    const onDashboard = document.getElementById('route-dashboard')?.classList.contains('active');
    if (me?.role !== 'client' || !onDashboard) {
      host.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    const db = loadDB();
    const items = getClientCases(db, me);
    host.innerHTML = items.map(rowHTML).join('');
    if (empty) empty.hidden = items.length > 0;
  }

  return { render };
})();


/* ==========================================================================
   END
   ========================================================================== */
