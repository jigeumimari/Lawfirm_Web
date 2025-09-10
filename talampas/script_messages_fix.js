
/*! script_messages_fix.js (v2)
 * Drop-in Messages stabilizer for Talampas & Associates
 * - Works without onRouteEnter
 * - Tolerates many API shapes
 * - Delegated click for thread items
 * - Auto-opens first thread
 * - Wires the Send form; supports JSON or FormData POST
 * Include AFTER your main script.js
 */
(function(){
  // ---------- tiny helpers ----------
  const q  = (s,c=document)=>c.querySelector(s);
  const qa = (s,c=document)=>Array.from(c.querySelectorAll(s));
  const esc= s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const apiUrl = (p)=> (typeof API==='function') ? API(p) : new URL('api/'+p, location.href).toString();
  const toast = (m)=> { try { window.toast && window.toast(m); } catch(_){} };

  // ---------- shape helpers ----------
  const pickArr = (raw)=> Array.isArray(raw) ? raw
                    : (raw && (raw.items||raw.messages||raw.data||raw.results)) || [];

  function normThread(t){
    return {
      id: t.id,
      title: t.title || null,
      last_message: t.last_message || t.preview || t.last || null,
      last_at: t.last_at || t.updated_at || t.created_at || null
    };
  }
  function normMsg(m){
    return {
      id: m.id,
      thread_id: m.thread_id ?? m.tid ?? m.thread ?? null,
      sender_id: m.sender_id ?? m.user_id ?? m.uid ?? null,
      sender_name: m.sender_name ?? m.name ?? m.full_name ?? 'User',
      sender_email: m.sender_email ?? m.email ?? null,
      sender_role: m.sender_role ?? m.role ?? '',
      body: (m.body ?? m.message ?? m.content ?? m.text ?? '').toString(),
      created_at: m.created_at ?? m.ts ?? m.time ?? m.sent_at ?? null
    };
  }

  // ---------- list threads (overrides if needed) ----------
  async function refreshThreadsFix(){
    const listEl = q('#threadList'); if (!listEl) return;
    try{
      const res = await fetch(apiUrl('threads.php'), { credentials:'include', cache:'no-store' });
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = []; }
      const threads = pickArr(json).map(normThread);

      listEl.innerHTML = threads.map(t => `
        <li class="thread-item" data-id="${t.id}" tabindex="0">
          <div class="title">${esc(t.title || ('Conversation #'+t.id))}</div>
          <div class="sub">${t.last_message ? esc(t.last_message) : '—'}</div>
        </li>
      `).join('');

      // if nothing is open, auto-open the newest
      if (!window.ACTIVE_THREAD_ID){
        const first = q('#threadList .thread-item');
        if (first) openThreadFix(first.dataset.id);
      }
    } catch(e){
      console.error('[messages-fix] threads load error', e);
    }
  }

  // ---------- open thread (sets global id) ----------
  async function openThreadFix(id){
    window.ACTIVE_THREAD_ID = Number(id);
    const t = q('#threadTitle'); if (t) t.textContent = 'Thread #' + window.ACTIVE_THREAD_ID;
    await refreshMessagesFix(true);
  }

  // ---------- render messages (left aligned) ----------
  async function refreshMessagesFix(scrollToBottom){
    const pane = q('#messagePane'); if (!pane || !window.ACTIVE_THREAD_ID) return;
    const atBottom = (pane.scrollHeight - pane.scrollTop - pane.clientHeight) < 48;

    try{
      const res  = await fetch(apiUrl(`messages.php?thread_id=${window.ACTIVE_THREAD_ID}`), { credentials:'include', cache:'no-store' });
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch {
        pane.innerHTML = `<pre class="debug" style="white-space:pre-wrap;opacity:.6;padding:12px">Raw response:\n${esc(text)}</pre>`;
        return;
      }
      const msgs = pickArr(json).map(normMsg);
      if (!msgs.length){
        pane.innerHTML = `<div style="opacity:.6;padding:16px">No messages yet. Say hi 👋</div>`;
        return;
      }
      pane.innerHTML = msgs.map(m => {
        const when = m.created_at ? new Date(m.created_at).toLocaleString() : '';
        return `
          <div class="msg ${m.sender_role ? esc(m.sender_role) : ''}">
            <div><b>${esc(m.sender_name)}</b>: ${esc(m.body)}</div>
            <div class="meta">${esc(when)}</div>
          </div>`;
      }).join('');
      if (scrollToBottom || atBottom) pane.scrollTop = pane.scrollHeight;
    }catch(e){
      console.error('[messages-fix] messages load error', e);
      pane.innerHTML = `<div style="opacity:.6;padding:16px">Couldn't load messages.</div>`;
    }
  }

  // ---------- send message (supports JSON or FormData) ----------
  async function submitMessageFix(e){
    e && e.preventDefault && e.preventDefault();
    if (!window.ACTIVE_THREAD_ID){ toast && toast('Select a conversation first'); return; }

    const inp = q('#messageInput');
    const btn = q('#messageForm button[type="submit"]');
    const body = (inp && inp.value || '').trim();
    if (!body) return;

    try{
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      // Try JSON first
      let res = await fetch(apiUrl('messages.php'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: window.ACTIVE_THREAD_ID, body })
      });

      // If server doesn't accept JSON, retry as form data
      if (!res.ok){
        const fd = new FormData();
        fd.append('thread_id', String(window.ACTIVE_THREAD_ID));
        fd.append('body', body);
        res = await fetch(apiUrl('messages.php'), { method:'POST', credentials:'include', body: fd });
      }

      // Read & ignore body; just refresh on success
      if (!res.ok) throw new Error('Send failed');
      inp && (inp.value = '');
      await refreshMessagesFix(true);
    } catch(err){
      console.error('[messages-fix] send error', err);
      toast && toast('Failed to send message');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    }
  }

  // ---------- delegated clicks + bootstrap + form wiring ----------
  function initMessagesFix(){
    if (initMessagesFix._done) return;
    initMessagesFix._done = true;

    const list = q('#threadList');
    if (list && !list.__wired){
      list.__wired = true;
      list.addEventListener('click', (e)=>{
        const li = e.target.closest('.thread-item');
        if (li) openThreadFix(li.dataset.id);
      });
      list.addEventListener('keydown', (e)=>{
        if (e.key==='Enter' || e.key===' '){
          const li = e.target.closest('.thread-item');
          if (li){ e.preventDefault(); openThreadFix(li.dataset.id); }
        }
      });
    }

    // Wire send form once
    const form = q('#messageForm');
    if (form && !form.__wired){
      form.__wired = true;
      form.addEventListener('submit', submitMessageFix);
      const inp = q('#messageInput');
      if (inp){
        inp.addEventListener('keydown', (ev)=>{
          if (ev.key === 'Enter' && !ev.shiftKey){
            ev.preventDefault();
            form.requestSubmit ? form.requestSubmit() : submitMessageFix();
          }
        });
      }
    }

    refreshThreadsFix();
  }

  // initialize when clicking the Messages tab
  const navBtn = qa('.nav-btn').find(b => b.dataset.route === 'messages');
  if (navBtn) navBtn.addEventListener('click', () => setTimeout(initMessagesFix, 0));

  // or if already active on load
  if (q('#route-messages')?.classList.contains('active')) initMessagesFix();

  // expose (override safely)
  window.refreshThreads  = refreshThreadsFix;
  window.openThread      = openThreadFix;
  window.refreshMessages = refreshMessagesFix;
  window.submitMessage   = submitMessageFix;
})();
