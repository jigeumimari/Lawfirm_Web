/* Talampas & Associates — Chat (ES5 + PHP backend) */

// ---------- helpers ----------
function API(p){ // assumes /api/ folder next to this file
  var base = location.href.replace(/[#?].*$/, '');
  if (base.slice(-1) !== '/') base += '/';
  return base + 'api/' + p;
}
function j(el){ return document.querySelector(el); }
function el(tag, cls){ var n = document.createElement(tag); if (cls) n.className = cls; return n; }
function fmtTime(s){
  var d = new Date(s); if (isNaN(+d)) return s || '';
  return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

// Unified fetch (with credentials for PHP sessions)
function call(p, opts){
  opts = opts || {};
  var o = {
    method: opts.method || 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: opts.headers || {}
  };
  if (opts.body && !(opts.body instanceof FormData)){
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(opts.body);
  } else if (opts.body){ o.body = opts.body; }

  return fetch(API(p), o).then(function(res){
    if (!res.ok) return res.text().then(function(t){ throw new Error(res.status + ' ' + t); });
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') === -1) return {};
    return res.json();
  });
}

// ---------- state ----------
var state = {
  me: null,
  threads: [],
  activeThreadId: null,
  pollTimer: null
};

// ---------- UI builders ----------
function renderThreads(list){
  var ul = j('#threadList'); ul.innerHTML = '';
  for (var i=0;i<list.length;i++){
    var t = list[i];
    var li = el('li', 'thread'); li.setAttribute('data-id', t.id || t.thread_id);
    if ((t.id || t.thread_id) == state.activeThreadId) li.classList.add('active');

    var avatar = el('img', 'avatar');
    avatar.src = t.avatar || t.peer_avatar || '';
    avatar.onerror = function(){ this.style.display='none'; };

    var name = el('div', 'name'); name.textContent = t.name || t.peer_name || ('User ' + (t.peer_id || ''));
    var status = el('div', 'status'); status.textContent = (t.presence || 'Offline');

    var right = el('div');
    if (t.unread_count > 0) {
      var b = el('span', 'badge'); b.textContent = t.unread_count; right.appendChild(b);
    }

    li.appendChild(avatar);
    var txt = el('div');
    txt.appendChild(name); txt.appendChild(status);
    li.appendChild(txt);
    li.appendChild(right);

    (function(threadId){
      li.addEventListener('click', function(){
        setActiveThread(threadId);
      });
    })(t.id || t.thread_id);

    ul.appendChild(li);
  }
}

function renderMessages(items){
  var box = j('#messageScroll'); box.innerHTML = '';
  for (var i=0;i<items.length;i++){
    var m = items[i];
    var row = el('div', 'msg-row' + (m.is_me || m.from_me ? ' me':''));
    var time = el('div', 'msg-time'); time.textContent = fmtTime(m.created_at || m.time || m.sent_at);
    var msg = el('div', 'msg' + (m.is_me || m.from_me ? ' me':''));
    msg.textContent = m.text || m.message || '';

    if (m.is_me || m.from_me){ row.appendChild(msg); row.appendChild(time); }
    else { row.appendChild(time); row.appendChild(msg); }

    box.appendChild(row);
  }
  // scroll to bottom
  box.scrollTop = box.scrollHeight;
}

// ---------- data loaders ----------
function loadMe(){
  return call('me.php').then(function(me){ state.me = me || {}; return me; }).catch(function(){});
}
function loadThreads(){
  return call('threads.php').then(function(out){
    state.threads = Array.isArray(out) ? out : (out.data || []);
    renderThreads(state.threads);
    // set default active
    if (!state.activeThreadId && state.threads.length){
      state.activeThreadId = state.threads[0].id || state.threads[0].thread_id;
      renderThreads(state.threads);
      return loadMessages(state.activeThreadId);
    }
  });
}
function loadMessages(threadId){
  return call('messages.php?thread_id=' + encodeURIComponent(threadId)).then(function(out){
    var items = Array.isArray(out) ? out : (out.data || []);
    renderMessages(items);
    // header info
    var t = (state.threads || []).filter(function(x){ return (x.id||x.thread_id)==threadId; })[0] || {};
    j('#peerName').textContent = t.name || t.peer_name || '—';
    j('#peerPresence').textContent = t.presence || 'Offline';
    var av = j('#peerAvatar'); av.src = t.avatar || t.peer_avatar || ''; av.onerror = function(){ this.style.display='none'; };
  });
}

function setActiveThread(threadId){
  state.activeThreadId = threadId;
  // update list active class
  var lis = document.querySelectorAll('.thread'); 
  for (var i=0;i<lis.length;i++){
    var id = lis[i].getAttribute('data-id');
    if (id == threadId) lis[i].classList.add('active'); else lis[i].classList.remove('active');
  }
  loadMessages(threadId);
}

// ---------- send message ----------
function sendMessage(text){
  if (!state.activeThreadId || !text) return Promise.resolve();
  return call('messages.php', {
    method: 'POST',
    body: { thread_id: state.activeThreadId, message: text }
  }).then(function(){
    j('#msgInput').value = '';
    return loadMessages(state.activeThreadId);
  });
}

// ---------- search filter ----------
j('#searchInput').addEventListener('input', function(){
  var q = this.value.toLowerCase();
  var filtered = (state.threads || []).filter(function(t){
    var name = (t.name || t.peer_name || '').toLowerCase();
    return !q || name.indexOf(q) !== -1;
  });
  renderThreads(filtered);
});

// ---------- form handlers ----------
j('#sendForm').addEventListener('submit', function(e){
  e.preventDefault();
  var txt = j('#msgInput').value.trim();
  if (!txt) return;
  sendMessage(txt);
});

// ---------- poll for new messages every 6s ----------
function startPolling(){
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(function(){
    if (state.activeThreadId) loadMessages(state.activeThreadId);
  }, 6000);
}

// ---------- boot ----------
loadMe()
  .then(loadThreads)
  .then(startPolling)
  .catch(function(err){ console.error(err); });
