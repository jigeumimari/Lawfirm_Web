// appoint.js — booking UI for clients
(function(){
  const API = (p)=>{
    let s = String(p||''); if(/^https?:\/\//i.test(s)) return s;
    s = s.replace(/^\//,''); if(s.startsWith('api/')) return new URL(s,location.href).toString();
    return new URL('api/'+s, location.href).toString();
  };

  const el = (s,c=document)=>c.querySelector(s);
  const msg = el('#msg');

  function setMsg(t, ok){
    msg.textContent = t||'';
    msg.style.color = ok? 'var(--ok)':'var(--muted)';
  }

  async function me(){
    try{
      const r = await fetch(API('me.php'), {credentials:'include'});
      const p = await r.json(); return p.user || p;
    }catch{ return {}; }
  }

  function badge(s){
    s=(s||'').toLowerCase();
    const cls = s==='accepted'?'accepted':s==='rejected'?'rejected':'pending';
    return `<span class="badge ${cls}">${s||'pending'}</span>`;
  }

  function fmtDate(d,t){
    if(!d) return '—';
    let s = d;
    if(t) s += ' ' + t;
    const dt = new Date(s.replace(' ', 'T'));
    return isNaN(+dt) ? s : dt.toLocaleString();
  }

  async function listMyAppointments(role, id){
    const tbody = el('#tbl tbody'); tbody.innerHTML = '';
    try{
      const r = await fetch(API('appointments.php'), {credentials:'include', cache:'no-store'});
      const p = await r.json();
      let rows = Array.isArray(p) ? p : (p.data || []);
      if(role==='client' && id) rows = rows.filter(x=> String(x.client_id) === String(id));
      rows.sort((a,b)=> String(b.created_at||'').localeCompare(String(a.created_at||'')));
      if(!rows.length){
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">No appointments yet.</td></tr>';
        return;
      }
      rows.forEach(a=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${fmtDate(a.preferred_date, a.preferred_time)}</td>
          <td>${a.title||'—'}</td>
          <td>${a.practice_area||'—'}</td>
          <td>${a.appointment_type||'—'}</td>
          <td>${badge(a.status)}</td>
          <td>${a.details||'—'}</td>
        `;
        tbody.appendChild(tr);
      });
    }catch(e){
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Failed to load.</td></tr>';
    }
  }

  async function create(payload){
    const candidates = ['add','create','book',''];
    for (const action of candidates){
      const body = new URLSearchParams(payload);
      if(action) body.set('action', action);
      try{
        const res = await fetch(API('appointments.php'), {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
          body
        });
        const ct = (res.headers.get('content-type')||'').toLowerCase();
        const p = ct.includes('json') ? await res.json() : await res.text();
        if(res.ok && ((p && p.ok!==false) || typeof p === 'string')) return {ok:true, payload:p};
      }catch(e){ /* try next */ }
    }
    return {ok:false};
  }

  async function boot(){
    const u = await me();
    if(u && (u.full_name||u.email)) el('#signedAs').textContent = 'Signed in as ' + (u.full_name||u.email);
    const role = (u.role||'').toLowerCase();
    const clientId = u.id;

    await listMyAppointments(role, clientId);

    el('#bookForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const payload = {
        client_id: clientId,
        title: el('#title').value + ' • ' + el('#practice_area').value,
        preferred_date: el('#preferred_date').value,
        preferred_time: el('#preferred_time').value,
        appointment_type: el('#appointment_type').value,
        details: el('#details').value,
        practice_area: el('#practice_area').value,
        status: 'pending'
      };
      if(!payload.client_id || !payload.preferred_date || !payload.preferred_time){
        setMsg('Please complete all required fields.'); return;
      }
      setMsg('Saving...');
      const r = await create(payload);
      if(r.ok){
        setMsg('Appointment booked!', true);
        e.target.reset();
        await listMyAppointments(role, clientId);
      }else{
        setMsg('Failed to create appointment.');
      }
    });
  }

  boot();
})();
