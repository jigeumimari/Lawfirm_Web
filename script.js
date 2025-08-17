/* ==========================================================
   script.js – Talampas & Associates (Intake Workflow Edition)
   Front-end only (localStorage)
   ========================================================== */

/* ---------- DOM helpers ---------- */
const q  = (sel, ctx=document) => ctx.querySelector(sel);
const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const fmt = (d) => new Date(d).toLocaleDateString(undefined, {year:'numeric', month:'short', day:'2-digit'});

/* ---------- Storage keys ---------- */
const DB_KEY = 'ta_db_v2_intake';
const SESSION_KEY = 'ta_session_v2';

/* ---------- Seed data / defaults ---------- */
function addDays(d, n=0){ const x = new Date(d); x.setDate(x.getDate()+n); return x.toISOString(); }
const DEFAULT_DB = {
  users: [
    { id:'u1', name:'A. Administrator', email:'admin@talampas.com', role:'admin',    password:'admin123', active:true },
    { id:'u2', name:'E. Employee',      email:'emp@talampas.com',   role:'employee', password:'emp123',   active:true },
    { id:'u3', name:'C. Client',        email:'client@talampas.com',role:'client',   password:'client123',active:true },
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
    { id:'T-1', title:'Admin ↔ Client – C-2001',
      members:['admin@talampas.com','client@talampas.com'],
      messages:[
        { id:'M-1', from:'admin@talampas.com',  body:'Welcome to Talampas & Associates. We will coordinate here.', ts: Date.now()-86400000 },
        { id:'M-2', from:'client@talampas.com', body:'Thank you!', ts: Date.now()-86000000 },
      ]
    }
  ],
  appointments: [],
  activity: [ 'Intake workflow edition initialized.' ]
};

/* ---------- DB/session helpers ---------- */
function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw){
    localStorage.setItem(DB_KEY, JSON.stringify(DEFAULT_DB));
    return structuredClone(DEFAULT_DB);
  }
  try { return JSON.parse(raw); }
  catch {
    localStorage.setItem(DB_KEY, JSON.stringify(DEFAULT_DB));
    return structuredClone(DEFAULT_DB);
  }
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function pushActivity(msg){
  const db = loadDB();
  db.activity.unshift(`${new Date().toLocaleString()}: ${msg}`);
  db.activity = db.activity.slice(0, 60);
  saveDB(db);
}
function setSession(user){ localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function getSession(){ const raw = localStorage.getItem(SESSION_KEY); return raw? JSON.parse(raw): null; }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

/** Ensure the Cases search input is clear so fresh rows aren’t filtered out */
function resetCaseSearch() {
  const s = q('#caseSearch');
  if (s) s.value = '';
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadDB();

  // Auth
  q('#loginForm')?.addEventListener('submit', onLogin);
  q('#logoutBtn')?.addEventListener('click', onLogout);

  // Navigation
  qa('.nav-btn').forEach(b => b.addEventListener('click', () => routeTo(b.dataset.route)));

  // Init modules
  Cases.init();
  Calendar.init();
  MonthPicker.init();
  Messages.init();
  Users.init();
  Appointments.init();
  GlobalSearch.init();
  ImportExport.init();

  // Dialog cancel/delete buttons
  q('#cancelCaseBtn')?.addEventListener('click', () => q('#caseDialog').close());
  q('#cancelEventBtn')?.addEventListener('click', () => q('#eventDialog').close());
  q('#deleteEventBtn')?.addEventListener('click', () => Calendar.remove());
  q('#cancelUserBtn')?.addEventListener('click', () => q('#userDialog').close());

  // Session
  const me = getSession();
  if(me){ enterApp(me); } else { showLogin(); }
});

/* ---------- App shell (routing, toast, auth) ---------- */
function showToast(msg){
  const el = q('#toast'); if(!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2200);
}
function showLogin(){
  q('#appShell')?.classList.add('hidden');
  q('#loginView')?.classList.add('active');
}
function enterApp(user){
  q('#loginView')?.classList.remove('active');
  q('#appShell')?.classList.remove('hidden');
  q('#currentUserName') && (q('#currentUserName').textContent = user.name);
  q('#roleBadge') && (q('#roleBadge').textContent = user.role.toUpperCase());

  const role = user.role;
  qa('.only-admin').forEach(el => el.style.display = (role==='admin')? 'inline-flex' : 'none');
  qa('.only-employee').forEach(el => el.style.display = (role==='admin'||role==='employee')? 'inline-flex' : 'none');
  qa('.only-client').forEach(el => el.style.display = (role==='client')? 'inline-flex' : 'none');

  resetCaseSearch();

  routeTo('dashboard');
  Dashboard.update();
  Cases.renderTable();
  Calendar.render();
  Messages.renderThreads();
  Users.renderTable();
  Appointments.renderTable();
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
  clearSession();
  showLogin();
  showToast('Logged out.');
}
function routeTo(name){
  qa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route===name));
  qa('.route').forEach(r => r.classList.remove('active'));
  const route = q(`#route-${name}`); route && route.classList.add('active');
  if(route?.dataset?.title){ document.title = `${route.dataset.title} – Talampas & Associates`; }

  if (name === 'cases') {
    resetCaseSearch();
    Cases.renderTable();
  }
  Dashboard.update();
}

/* ---------- Dashboard (role-aware) ---------- */
const Dashboard = {
  update(){
    const db = loadDB();
    const me = getSession();
    const role = me?.role;

    const isClient   = role === 'client';
    const isEmployee = role === 'employee';
    const isAdmin    = role === 'admin';

    const cases = db.cases.filter(c => {
      if(isAdmin) return true;
      if(isEmployee) return c.assignee === me.email;
      return c.clientEmail === me.email;
    });

    const openCount = cases.filter(c => c.status === 'Open').length;
    q('#metricOpenCases') && (q('#metricOpenCases').textContent = openCount);

    const myCaseIds = new Set(cases.map(c => c.id));
    const upcoming = (db.events||[]).filter(e => {
      const in7 = daysFromToday(e.date) <= 7 && daysFromToday(e.date) >= 0;
      if(!in7) return false;
      if(isAdmin) return true;
      return myCaseIds.has(e.caseId);
    }).length;
    q('#metricUpcoming') && (q('#metricUpcoming').textContent = upcoming);

    q('#metricUnread') && (q('#metricUnread').textContent = 0);

    document.querySelectorAll('.card h3').forEach(h => {
      if(h.textContent.includes('Total Open Cases')) h.textContent = isClient ? 'My Open Cases' : 'Total Open Cases';
      if(h.textContent.includes('Upcoming Events')) h.textContent = isClient ? 'My Upcoming Events (7d)' : 'Upcoming Events (7d)';
    });

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

    const activityCard = q('#activityFeed')?.closest('.card');
    if (activityCard) activityCard.style.display = (role === 'admin' ? '' : 'none');
    if (role === 'admin' && activityCard) {
      const feed = q('#activityFeed'); 
      feed.innerHTML = '';
      (db.activity||[]).slice(0,6).forEach(a => { const li = document.createElement('li'); li.textContent = a; feed.appendChild(li); });
    }
  }
};
function daysFromToday(dateStr){
  const d = new Date(dateStr); const t = new Date();
  d.setHours(0,0,0,0); t.setHours(0,0,0,0);
  return Math.round((d - t)/86400000);
}

/* ---------- Cases ---------- */
const Cases = {
  init(){
    q('#newCaseBtn')?.addEventListener('click', ()=> this.openDialog());
    q('#caseForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.saveFromDialog(); });
    q('#caseSearch')?.addEventListener('input', ()=> this.renderTable());

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

    qa('.progress-edit').forEach(el => el.style.display = (role==='admin'||role==='employee') ? 'grid' : 'none');

    const setProgressButtons = (pct=0) => {
      qa('#caseProgressButtons .toggle').forEach(b => {
        b?.classList.toggle('active', Number(b.dataset.p) === Number(pct));
      });
      const label = q('#caseProgressLabel'); if (label) label.textContent = `${pct}%`;
      const range = q('#caseProgress');
      if (range) range.value = pct;
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

    q('#caseStatus')   && (q('#caseStatus').disabled   = (role!=='admin'));
    q('#caseAssignee') && (q('#caseAssignee').disabled = (role!=='admin'));
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

    if(role==='client' && !isEditId){ payload.status = 'Pending Review'; payload.assignee = ''; }
    if(role==='admin' && (status==='Pending Review') && assignee){ payload.status = 'Open'; pushActivity(`${me.email} assigned case to ${assignee}.`); }

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

  renderTable(){
    const db = loadDB();
    const tbody = q('#caseTable tbody');
    if(!tbody) return;
    const role = getSession()?.role;
    const me = getSession();
    const search = (q('#caseSearch')?.value||'').toLowerCase();

    tbody.innerHTML = '';
    let items = db.cases;

    if(role==='client'){
      items = items.filter(c => c.clientEmail === me.email);
    } else if(role==='employee'){
      items = items.filter(c => c.assignee === me.email);
    }

    if(search){
      items = items.filter(c => Object.values(c).join(' ').toLowerCase().includes(search));
    }

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
  },

  delete(id){
    const db = loadDB(); const me = getSession();
    if(!confirm(`Delete case ${id}?`)) return;
    db.cases = db.cases.filter(c=>c.id!==id);
    saveDB(db); pushActivity(`${me.email} deleted case ${id}.`);
    this.renderTable(); Dashboard.update();
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

/* ---------- Calendar ---------- */
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
    const db = loadDB(); const dlg = q('#eventDialog'); const isEdit = !!eventId;
    this.currentEditId = isEdit ? eventId : null;

    q('#eventDialogTitle') && (q('#eventDialogTitle').textContent = isEdit? 'Edit Event' : 'Add Event');

    const delBtn = q('#deleteEventBtn');
    const role = getSession()?.role;
    delBtn?.classList.toggle('hidden', !(isEdit && (role==='admin' || role==='employee')));

    if(isEdit){
      const ev = db.events.find(e=>e.id===eventId);
      q('#eventTitle').value = ev.title || '';
      q('#eventDate').value  = (ev.date || '').split('T')[0] || '';
      q('#eventTime').value  = ev.time || '';
      q('#eventNotes').value = ev.notes||'';
      q('#eventCaseId').value= ev.caseId||'';
    } else {
      q('#eventTitle').value=''; 
      q('#eventDate').value= prefillDate || '';
      q('#eventTime').value=''; 
      q('#eventNotes').value=''; 
      q('#eventCaseId').value='';
    }
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
    }
    else { 
      const id = genEventId(db); 
      db.events.push({ id, ...p }); 
      pushActivity(`${me.email} added an event.`); 
    }
    saveDB(db); dlg.close(); this.render(); Dashboard.update();
  },

  remove(){
    const db = loadDB(); const me = getSession(); const id = this.currentEditId;
    if(!id) return;
    if(!confirm('Delete this event?')) return;
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
    const grid = q('#calendarGrid'); if(!grid) return; grid.innerHTML = '';

    const first = new Date(year, month, 1);
    const startDay = (first.getDay()+6)%7;
    const days = new Date(year, month+1, 0).getDate();
    for(let i=0;i<startDay;i++){ grid.appendChild(document.createElement('div')); }

    const db = loadDB(); const role = getSession()?.role; const me = getSession();

    for(let d=1; d<=days; d++){
      const cell = document.createElement('div'); cell.className = 'calendar-day';
      const dateStr = new Date(year, month, d).toISOString().split('T')[0];
      cell.dataset.date = dateStr;
      cell.innerHTML = `<div class="d">${d}</div><div class="events"></div>`;

      cell.addEventListener('click', (ev) => {
        if(ev.target.closest('.calendar-event')) return;
        if(!(role==='admin' || role==='employee')) return;
        this.openDialog(null, dateStr);
      });

      const evWrap = cell.querySelector('.events');
      const evs = db.events.filter(e => (e.date||'').startsWith(dateStr));
      evs.forEach(ev => {
        if(role==='client' && ev.caseId && !ownsClientCase(me, ev.caseId)) return;
        const tag = document.createElement('div'); tag.className = 'calendar-event'; tag.textContent = ev.title + (ev.time? ` @ ${ev.time}`:'');
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
  if(!c) return false; return c.clientEmail===me.email;
}

/* ---------- Month/Year picker ---------- */
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

/* ---------- Messages (private, leave-for-me, admin delete-for-all) ---------- */
const Messages = {
  state: { currentThread: null },

  init(){
    q('#newThreadBtn')?.addEventListener('click', ()=> this.createThread());
    q('#messageForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.sendMessage(); });
  },

  renderThreads(){
    const db = loadDB(); const me = getSession(); const list = q('#threadList'); if(!list) return; list.innerHTML = '';
    (db.threads||[]).filter(t => t.members.includes(me.email)).forEach(t => {
      const li = document.createElement('li'); li.className = 'thread'; li.textContent = t.title; li.setAttribute('role','option');
      li.addEventListener('click', ()=> this.openThread(t.id));
      if(this.state.currentThread===t.id) li.classList.add('active');
      list.appendChild(li);
    });
  },

  openThread(id){
    this.state.currentThread = id;
    const db = loadDB();
    const t = db.threads.find(x=>x.id===id); if(!t) return;

    q('#threadTitle') && (q('#threadTitle').textContent = t.title);

    this.ensureActionButtons(id);

    const wrap = q('#messagePane'); if(!wrap) return; wrap.innerHTML = '';
    t.messages.forEach(m => wrap.appendChild(this.renderMsg(m)));
    wrap.scrollTop = wrap.scrollHeight;
  },

  renderMsg(m){
    const me = getSession(); const div = document.createElement('div');
    div.className = 'msg' + (m.from===me.email? ' me':'' );
    div.innerHTML = `<div class="meta">${m.from} • ${new Date(m.ts).toLocaleString()}</div><div class="bubble">${escapeHtml(m.body)}</div>`;
    return div;
  },

  sendMessage(){
    const input = q('#messageInput'); const body = input.value.trim(); if(!body) return;
    const db = loadDB(); const me = getSession(); const t = db.threads.find(x=>x.id===this.state.currentThread); if(!t){ showToast('No thread selected.'); return; }
    // Safety: only allow members to post
    if (!t.members.includes(me.email)) { showToast('You are not a member of this thread.'); return; }
    t.messages.push({ id:`M-${Date.now()}`, from: me.email, body, ts: Date.now() });
    saveDB(db); input.value=''; this.openThread(t.id);
    pushActivity(`${me.email} sent a message in "${t.title}"`);
    Dashboard.update();
  },

  createThread(){
    const db = loadDB(); const me = getSession();
    const title = prompt('Thread title (e.g., "Client ↔ Admin – C-2002")'); if(!title) return;

    const input = prompt('Enter participant emails (comma-separated). Example: client@talampas.com');
    if(!input) return;

    const rawList = input.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    const validEmails = db.users.map(u=>u.email);
    const members = Array.from(new Set([me.email, ...rawList.filter(e=>validEmails.includes(e))]));

    if(members.length < 2){ alert('No valid participants found.'); return; }

    const id = `T-${(db.threads?.length||0)+1}`;
    db.threads.push({ id, title, members, messages: [ { id:`M-${Date.now()}`, from: me.email, body:'Started this thread.', ts: Date.now() } ] });
    saveDB(db); this.renderThreads(); this.openThread(id);
    pushActivity(`${me.email} created thread "${title}"`);
  },

  /* Remove conversation ONLY for me (leave/hide) */
  leaveThread(threadId){
    const me = getSession();
    const db = loadDB();
    const t = db.threads.find(x => x.id === threadId);
    if (!t) { showToast('Thread not found.'); return; }

    if (!t.members.includes(me.email)) { showToast('You are not a member of this thread.'); return; }

    if (!confirm(`Remove "${t.title}" from your inbox? Other participant(s) will still see it.`)) return;

    t.members = (t.members || []).filter(m => m !== me.email);

    if (t.members.length === 0){
      db.threads = (db.threads || []).filter(x => x.id !== threadId);
    }

    saveDB(db);

    this.state.currentThread = null;
    q('#threadTitle') && (q('#threadTitle').textContent = 'Select a conversation');
    const pane = q('#messagePane'); if (pane) pane.innerHTML = '';

    this.renderThreads();
    pushActivity(`${me.email} left conversation "${t.title}"`);
    showToast('Conversation removed from your inbox.');
  },

  /* Admin: delete conversation for ALL members */
  deleteThreadForEveryone(threadId){
    const me = getSession();
    if (me?.role !== 'admin') { showToast('Only Admin can delete for everyone.'); return; }

    const db = loadDB();
    const t = db.threads.find(x => x.id === threadId);
    if (!t) { showToast('Thread not found.'); return; }

    if (!confirm(`Delete conversation "${t.title}" for ALL participants? This cannot be undone.`)) return;

    db.threads = (db.threads || []).filter(x => x.id !== threadId);
    saveDB(db);

    this.state.currentThread = null;
    q('#threadTitle') && (q('#threadTitle').textContent = 'Select a conversation');
    const pane = q('#messagePane'); if (pane) pane.innerHTML = '';

    this.renderThreads();
    pushActivity(`${me.email} deleted conversation "${t.title}" for everyone`);
    showToast('Conversation deleted for everyone.');
  },

  /* Buttons in message header */
  ensureActionButtons(threadId){
    const me = getSession();
    const head = q('.message-head');
    if (!head) return;

    q('#leaveThreadBtn')?.remove();
    q('#deleteThreadBtn')?.remove();

    const leaveBtn = document.createElement('button');
    leaveBtn.id = 'leaveThreadBtn';
    leaveBtn.className = 'btn ghost';
    leaveBtn.textContent = 'Remove from My Inbox';
    leaveBtn.style.marginLeft = '8px';
    leaveBtn.addEventListener('click', () => this.leaveThread(threadId));
    const title = q('#threadTitle', head);
    if (title) title.after(leaveBtn); else head.appendChild(leaveBtn);

    if (me?.role === 'admin'){
      const delBtn = document.createElement('button');
      delBtn.id = 'deleteThreadBtn';
      delBtn.className = 'btn danger';
      delBtn.textContent = 'Delete for Everyone';
      delBtn.style.marginLeft = '8px';
      delBtn.addEventListener('click', () => this.deleteThreadForEveryone(threadId));
      leaveBtn.after(delBtn);
    }
  }
};

/* ---------- Users (Admin) ---------- */
const Users = {
  init(){
    q('#newUserBtn')?.addEventListener('click', ()=> this.openDialog());
    q('#userForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); this.saveFromDialog(); });
  },

  renderTable(){
    const db = loadDB(); const tbody = q('#userTable tbody'); if(!tbody) return; tbody.innerHTML = '';
    db.users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.active? 'Active':'Disabled'}</td>
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

  /* Build the "Assign Case optional" options: - show cases with no assignee OR in Pending Review*/
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

    // Populate assignable cases each time dialog opens
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

    // Create or update user
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

    // Optional immediate assignment
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
    Dashboard.update();
  },

  toggle(id){
    const db = loadDB(); const u = db.users.find(x=>x.id===id);
    u.active = !u.active; saveDB(db); this.renderTable(); pushActivity(`${getSession().email} ${u.active? 'enabled':'disabled'} ${u.email}`);
  },

  remove(id){
    const db = loadDB();
    const me = getSession();
    const victim = db.users.find(u => u.id === id);
    if(!victim) return;
    if(victim.email === me.email){ alert("You can't delete your own account while logged in."); return; }
    if(victim.email === 'admin@talampas.com'){ alert("Built-in admin cannot be deleted."); return; }
    if(!confirm(`Permanently delete ${victim.name} (${victim.email})? This cannot be undone.`)) return;

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
  }
};

/* ---------- Appointments (booking → case) ---------- */
const Appointments = {
  init(){
    q('#appointmentForm')?.addEventListener('submit', (e)=>{
      e.preventDefault();
      this.create();
    });

    // Keep prefix label in sync with country select (future-ready)
    const sel = q('#phoneCountry');
    const pref = q('#phonePrefix');
    if (sel && pref){
      pref.textContent = sel.value || '+63';
      sel.addEventListener('change', () => { pref.textContent = sel.value; });
    }

    // Numeric-only and length guard for local number
    const phoneLocal = q('#phoneLocal');
    if (phoneLocal){
      phoneLocal.addEventListener('input', () => {
        phoneLocal.value = phoneLocal.value.replace(/\D/g,'').slice(0,11);
      });
    }
  },

  create(){
    const db = loadDB();
    const me = getSession(); // client

    // Phone validation (+63 + exactly 11 digits)
    const country = (q('#phoneCountry')?.value || '+63').trim();
    const local   = (q('#phoneLocal')?.value || '').trim().replace(/\D/g,'');
    if (country !== '+63'){ showToast('Currently only PH (+63) is supported.'); return; }
    if (local.length !== 11){ showToast('Phone number must be exactly 11 digits (after +63).'); return; }

    const phone = country + local;

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

    db.appointments.push({ ...p, status:'Pending', client: me.email });

    const caseId = createCaseFromAppointment(p, me, db);

    saveDB(db);

    showToast(`Appointment sent. Case ${caseId} is now Pending Review.`);
    q('#appointmentForm').reset();
    // keep +63 visible after reset
    const pref = q('#phonePrefix'); if (pref) pref.textContent = '+63';

    Dashboard.update();
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

/* ---------- Helpers for booking case ---------- */
function createCaseFromAppointment(p, me, db){
  const id = genCaseId(db);
  const nextISO = p.date ? new Date(p.date).toISOString() : null;

  const newCase = {
    id,
    client: me.name,
    clientEmail: me.email,
    practice: p.practice,
    status: 'Pending Review',
    nextDate: nextISO,
    assignee: '',
    notes: p.notes || `Submitted by client via appointment form. Type: ${p.appointmentType || 'N/A'}, Phone: ${p.phone || 'N/A'}.`,
    files: [],
    progress: 0
  };

  db.cases.unshift(newCase);

  if (p.date && p.time){
    const evId = genEventId(db);
    db.events.push({
      id: evId,
      title: `Appointment: ${id}`,
      date: new Date(p.date).toISOString(),
      time: p.time,
      notes: p.notes || '',
      caseId: id
    });
  }

  ensureAdminThreadForCase(db, id, me.email);

  pushActivity(`${me.email} submitted booking -> created case ${id} (Pending Review).`);
  return id;
}
function ensureAdminThreadForCase(db, caseId, clientEmail){
  const adminEmail = 'admin@talampas.com';
  const title = `Admin ↔ Client – ${caseId}`;
  const exists = (db.threads||[]).some(t => t.title === title);
  if (exists) return;

  (db.threads ||= []).push({
    id: `T-${(db.threads?.length||0)+1}`,
    title,
    members: [adminEmail, clientEmail],
    messages: [
      { id:`M-${Date.now()}`, from: adminEmail, body:`We received your request for ${caseId}. We'll review and assign it shortly.`, ts: Date.now() }
    ]
  });
}

/* ---------- Global Search ---------- */
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
      const s = q('#caseSearch');
      if (s){ s.value = term; }
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

/* ---------- Import / Export JSON ---------- */
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
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if(!data.users || !data.cases){ alert('Invalid file.'); return; }
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        showToast('Data imported.');
        Dashboard.update(); Cases.renderTable(); Calendar.render(); Messages.renderThreads(); Users.renderTable(); Appointments.renderTable();
      } catch(err){ alert('Import failed.'); }
    };
    reader.readAsText(file);
  }
};

/* ---------- Misc utilities ---------- */
function escapeHtml(str){
  return str.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
