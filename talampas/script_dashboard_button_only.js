// script_dashboard_button_only.js
(function () {
  const q = (s,c=document)=>c.querySelector(s);
  const setTxt = (sel, v)=>{ const el=q(sel); if (el) el.textContent = (v==null?'—':v); };
  const ymd = (d)=>{ const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };

  function renderRecentCases(list=[]){
    const ul = q('#recentActivityList'); if(!ul) return;
    ul.innerHTML = list.map(c => `
      <li>
        <b>#${c.id}</b> ${c.title || '—'}
        ${c.client_name ? ' — ' + c.client_name : ''}
        <span class="muted" style="opacity:.75"> · ${c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
      </li>
    `).join('');
  }

  async function refreshDashboard(){
    // Only run if the Dashboard route is currently visible
    const route = q('#route-dashboard');
    if (!route || !route.classList.contains('active')) return;

    // Open cases
    try {
      const data  = await api('cases.php');
      const items = data.items || data || [];
      const open  = items.filter(c => (c.status||'new').toLowerCase() !== 'closed').length;
      setTxt('#metricOpenCases', open);
      const recent = items.slice().sort((a,b)=> new Date(b.created_at||0) - new Date(a.created_at||0)).slice(0,5);
      renderRecentCases(recent);
    } catch { setTxt('#metricOpenCases', '—'); }

    // Upcoming events (7d)
    try{
      const now = new Date();
      const in7 = new Date(now); in7.setDate(in7.getDate()+7);
      const ev  = await api(`calendar_events.php?from=${ymd(now)}&to=${ymd(in7)}`);
      const items = ev.items || ev || [];
      setTxt('#metricUpcomingEvents', items.length);
    }catch { setTxt('#metricUpcomingEvents', '—'); }

    // Unread messages (best-effort; 0 if backend doesn't return it)
    try{
      const threads = await api('threads.php');
      const count = (threads||[]).reduce((n,t)=> n + (t.unread_count ? 1 : 0), 0);
      setTxt('#metricUnreadMessages', count || 0);
    }catch {}
  }

  // Hook into your router; only refresh when Dashboard is clicked
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof routeTo === 'function') {
      const _routeTo = routeTo;
      window.routeTo = function(name){
        _routeTo(name);
        if (name === 'dashboard') refreshDashboard();
      };
    }
  });

  // Expose for manual refreshes; it no-ops if Dashboard isn’t active
  window.refreshDashboard = refreshDashboard;
})();
