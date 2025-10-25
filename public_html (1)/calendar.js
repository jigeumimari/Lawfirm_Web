/* Law Firm Calendar - final updated version
   - Only add events for today or future
   - Past events visible but read-only
   - Multi-day events split into per-day items (no spanning)
   - Month view uses +n more; clicking 'more' opens modal showing that day's events
   - Upcoming panel shows only checked categories (2 items) + View All modal grouped by date
   - Times show as "h:mm AM/PM"
   - Checkbox filters toggle visibility and upcoming list
   - Prevent overlapping when creating events
   - addExternalBooking API provided
   
*/

document.addEventListener('DOMContentLoaded', () => {
  // DOM refs
  const todayBtn = document.getElementById('todayBtn');
  const prevBtn  = document.getElementById('prevBtn');
  const nextBtn  = document.getElementById('nextBtn');
  const currentTitle = document.getElementById('currentTitle');
  const monthView = document.getElementById('monthView');
  const weekView  = document.getElementById('weekView');
  const dayView   = document.getElementById('dayView');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const fab = document.getElementById('fab');
  const createLeft = document.getElementById('createLeft');
  const modal = document.getElementById('modal');
  const modalClose = document.getElementById('modalClose');
  const eventForm = document.getElementById('eventForm');
  const titleInput = document.getElementById('title');
  const startInput = document.getElementById('start');
  const endInput = document.getElementById('end');
  const categorySelect = document.getElementById('category');
  const deleteBtn = document.getElementById('deleteBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const upcomingList = document.getElementById('upcomingList');
  const viewAllBtn = document.getElementById('viewAllBtn');
  const allModal = document.getElementById('allModal');
  const allClose = document.getElementById('allClose');
  const allEventsList = document.getElementById('allEventsList');
  const toast = document.getElementById('toast');
  const calToggles = Array.from(document.querySelectorAll('.cal-toggle'));

  const STORAGE = 'lawfirm_calendar_final_v1';

  // category color map
  const CATEGORY = {
    appointments: '#1a73e8',
    court: '#ea4335',
    meetings: '#34a853',
    paralegal: '#f6c34a',
    attorney: '#8e24aa',
    confirmed: '#1a73e8',
    pending: '#f6c34a',
    cancelled: '#9e9e9e'
  };
  function categoryColor(cat){ return CATEGORY[cat] || '#1a73e8'; }

  // storage helpers
  function loadStored(){ try{ const raw = localStorage.getItem(STORAGE); return raw ? JSON.parse(raw) : []; } catch(e){ return []; } }
  function saveStored(arr){ localStorage.setItem(STORAGE, JSON.stringify(arr)); }

  // FullCalendar init
  const calendarEl = document.getElementById('calendar');
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    firstDay: 1,
    selectable: true,
    editable: true,
    eventOverlap: false,
    dayMaxEventRows: 3,            // allow +n more when overflow
    moreLinkClick: function(info) {
      // info.date: Date, info.allDay: boolean, info.jsEvent
      openAllModalForDate(info.date);
    },
    eventTimeFormat: { hour: 'numeric', minute: '2-digit', hour12: true }, // show 1:11 PM
    displayEventTime: true,
    nowIndicator: true,
    height: 'auto',
    headerToolbar: false,
    navLinks: true,
    events: loadStored(),
    select: function(selInfo) {
      // block selecting past date ranges
      if (isPastRange(selInfo.startStr, selInfo.endStr)) {
        showToast("You can't schedule events in the past.");
        calendar.unselect();
        return;
      }
      openModalRange(selInfo.startStr, selInfo.endStr);
    },
    dateClick: function(info) {
      const start = info.dateStr + 'T09:00';
      const end = info.dateStr + 'T10:00';
      if (isPast(start)) {
        showToast("You can't schedule events in the past.");
        return;
      }
      openModalRange(start, end);
    },
    eventClick: function(info) {
      // if the event start is in past, still allow viewing but disable editing via modal
      openModalForEvent(info.event);
    },
    eventDrop: function(info) {
      // prevent dropping into past
      if (isPast(info.event.startStr)) {
        showToast("Can't move an event into the past.");
        info.revert();
        return;
      }
      persistAll();
      updateUpcoming();
    },
    eventResize: function(info) {
      // prevent resizing into past
      if (isPast(info.event.startStr)) {
        showToast("Can't resize an event into the past.");
        info.revert();
        return;
      }
      persistAll();
      updateUpcoming();
    },
    viewDidMount: function() { refreshTitle(); },
    eventDidMount: function(info) {
      // attach category attribute to DOM for CSS & filter convenience
      if (info.event.extendedProps && info.event.extendedProps.category) {
        info.el.setAttribute('data-cat', info.event.extendedProps.category);
      }
      // visually mark past events as read-only
      if (new Date(info.event.start) < new Date()) {
        info.el.classList.add('past-event');
      }
    }
  });

  calendar.render();
  refreshTitle();
  updateUpcoming();

  // Controls wiring
  todayBtn.addEventListener('click', () => { calendar.today(); refreshTitle(); });
  prevBtn.addEventListener('click', () => { calendar.prev(); refreshTitle(); });
  nextBtn.addEventListener('click', () => { calendar.next(); refreshTitle(); });

  monthView.addEventListener('click', () => { calendar.changeView('dayGridMonth'); refreshTitle(); });
  weekView.addEventListener('click', () => { calendar.changeView('timeGridWeek'); refreshTitle(); });
  dayView.addEventListener('click', () => { calendar.changeView('timeGridDay'); refreshTitle(); });

  fab.addEventListener('click', () => openModalRange(getTodayISO() + 'T09:00', getTodayISO() + 'T10:00'));
  createLeft.addEventListener('click', () => openModalRange(getTodayISO() + 'T09:00', getTodayISO() + 'T10:00'));

  // Search
  searchBtn.addEventListener('click', () => searchHandler());
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchHandler(); });
  function searchHandler() {
    const q = searchInput.value;
    if (!q || !q.trim()) { showToast('Please enter a search term.'); return; }
    const term = q.trim().toLowerCase();
    const matches = calendar.getEvents().filter(e => (e.title || '').toLowerCase().includes(term));
    if (matches.length === 0) { showToast('No events found.'); return; }
    calendar.gotoDate(matches[0].start);
    matches.forEach(ev => highlightEvent(ev));
  }
  function highlightEvent(ev) {
    const classes = (ev.classNames || []).slice();
    if (!classes.includes('search-hit')) classes.push('search-hit');
    ev.setProp('classNames', classes);
    setTimeout(() => {
      const cls = (ev.classNames || []).filter(c => c !== 'search-hit');
      ev.setProp('classNames', cls);
    }, 3500);
  }

  // Modal management
  let editingId = null;
  function openModalRange(startISO, endISO) {
    editingId = null;
    deleteBtn.classList.add('hidden');
    titleInput.value = '';
    startInput.value = toLocal(startISO);
    endInput.value = toLocal(endISO || startISO);
    categorySelect.value = 'appointments';
    enableModalEditing(true);
    showModal();
  }
  function openModalForEvent(ev) {
    editingId = ev.id;
    titleInput.value = ev.title || '';
    startInput.value = toLocal(ev.startStr);
    endInput.value = ev.endStr ? toLocal(ev.endStr) : toLocal(ev.startStr);
    const cat = (ev.extendedProps && ev.extendedProps.category) ? ev.extendedProps.category : 'appointments';
    categorySelect.value = cat;
    deleteBtn.classList.remove('hidden');
    // If event is in the past, disallow editing (view-only)
    const isPastEvent = new Date(ev.start) < new Date();
    enableModalEditing(!isPastEvent);
    showModal();
  }
  function enableModalEditing(canEdit) {
    titleInput.disabled = !canEdit;
    startInput.disabled = !canEdit;
    endInput.disabled = !canEdit;
    categorySelect.disabled = !canEdit;
    document.getElementById('saveBtn').disabled = !canEdit;
    if (!canEdit) { document.getElementById('modalTitle').textContent = 'View event (read-only)'; }
    else { document.getElementById('modalTitle').textContent = editingId ? 'Edit event' : 'Add event'; }
  }
  function showModal() { modal.classList.remove('hidden'); setTimeout(() => titleInput.focus(), 80); }
  function closeModal() { modal.classList.add('hidden'); editingId = null; enableModalEditing(true); }

  modalClose.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Save (splits multi-day into per-day)
  eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;
    const cat = categorySelect.value;
    const color = categoryColor(cat);

    if (!title) { showToast('Please enter a title'); return; }
    if (!start) { showToast('Please choose start'); return; }
    if (isPast(start)) { showToast("You can't schedule events in the past."); return; }
    if (end && new Date(end) < new Date(start)) { showToast('End must be after start'); return; }

    // Editing existing event (single-per-day instance)
    if (editingId) {
      const e = calendar.getEventById(editingId);
      if (!e) { closeModal(); return; }
      // overlap check (ignore this event)
      const overlap = calendar.getEvents().some(x => x.id !== editingId && rangesOverlap(x.startStr, x.endStr, start, end));
      if (overlap) { showToast('This time overlaps an existing event.'); return; }
      e.setProp('title', title);
      e.setStart(start);
      e.setEnd(end || null);
      e.setProp('backgroundColor', color);
      e.setProp('borderColor', color);
      e.setExtendedProp('category', cat);
      persistAll(); updateUpcoming(); closeModal();
      return;
    }

    // New event: split across calendar days into separate day events
    const sDate = new Date(start);
    const eDate = end ? new Date(end) : new Date(start);

    const sDay = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    const eDay = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    const dayCount = Math.round((eDay - sDay) / (24 * 3600 * 1000)) + 1;

    // pre-check overlap for each daily instance
    for (let i = 0; i < dayCount; i++) {
      const day = new Date(sDay.getTime() + i * 24 * 3600 * 1000);
      const dayStartISO = toISODateTime(day, start);
      const dayEndISO = end ? toISODateTime(day, end) : null;
      const overl = calendar.getEvents().some(x => rangesOverlap(x.startStr, x.endStr, dayStartISO, dayEndISO));
      if (overl) { showToast('This time overlaps an existing event.'); return; }
    }

    for (let i = 0; i < dayCount; i++) {
      const day = new Date(sDay.getTime() + i * 24 * 3600 * 1000);
      const dayStartISO = toISODateTime(day, start);
      const dayEndISO = end ? toISODateTime(day, end) : null;
      const id = 'evt-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '-' + i;
      calendar.addEvent({
        id,
        title,
        start: dayStartISO,
        end: dayEndISO || null,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { category: cat, originalSpan: { start, end } }
      });
    }

    persistAll();
    updateUpcoming();
    closeModal();
  });

  // Delete
  deleteBtn.addEventListener('click', () => {
    if (!editingId) return;
    const ev = calendar.getEventById(editingId);
    if (ev && confirm('Delete this event?')) {
      ev.remove();
      persistAll();
      updateUpcoming();
      closeModal();
    }
  });

  // Filters & upcoming
  calToggles.forEach(cb => cb.addEventListener('change', () => { applyFilters(); updateUpcoming(); }));
  function applyFilters() {
    const active = {};
    calToggles.forEach(cb => active[cb.dataset.cal] = cb.checked);
    calendar.getEvents().forEach(ev => {
      const cat = (ev.extendedProps && ev.extendedProps.category) ? ev.extendedProps.category : 'appointments';
      const visible = !!active[cat];
      ev.setProp('display', visible ? 'auto' : 'none');
    });
  }

  // Upcoming list (shows 2); "View All" shows modal grouped by date
  function updateUpcoming() {
    const now = new Date();
    const active = {};
    calToggles.forEach(cb => active[cb.dataset.cal] = cb.checked);

    const events = calendar.getEvents()
      .filter(e => e.start && new Date(e.start) >= startOfToday())  // today & future
      .filter(e => {
        const cat = e.extendedProps && e.extendedProps.category ? e.extendedProps.category : 'appointments';
        return !!active[cat];
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    upcomingList.innerHTML = '';
    const two = events.slice(0, 2);
    if (two.length === 0) {
      const li = document.createElement('li'); li.textContent = 'No upcoming events'; upcomingList.appendChild(li);
    } else {
      two.forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${formatShort(ev.start)}</span><span class="meta">${ev.title}</span>`;
        li.style.borderLeft = `4px solid ${ev.backgroundColor || '#1a73e8'}`;
        li.addEventListener('click', () => { calendar.gotoDate(ev.start); highlightEvent(ev); });
        upcomingList.appendChild(li);
      });
    }

    populateAllModal(events);
  }

  viewAllBtn.addEventListener('click', () => { allModal.classList.remove('hidden'); });
  if (allClose) allClose.addEventListener('click', () => { allModal.classList.add('hidden'); });

  function populateAllModal(events) {
    allEventsList.innerHTML = '';
    if (events.length === 0) { allEventsList.innerHTML = '<div>No upcoming events</div>'; return; }

    // group by date (YYYY-MM-DD)
    const grouped = {};
    events.forEach(ev => {
      const key = ev.startStr.slice(0, 10);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ev);
    });

    Object.keys(grouped).sort().forEach(dateKey => {
      const list = grouped[dateKey];
      if (list.length === 1) {
        // single event, show as straight item with time + title
        const ev = list[0];
        const div = document.createElement('div');
        div.style.borderLeft = `4px solid ${ev.backgroundColor || '#1a73e8'}`;
        div.style.padding = '8px'; div.style.marginBottom = '8px';
        div.innerHTML = `<div style="font-weight:600">${ev.title}</div><div style="font-size:13px;color:#555">${formatShort(ev.start)}</div>`;
        div.addEventListener('click', () => { calendar.gotoDate(ev.start); highlightEvent(ev); allModal.classList.add('hidden'); });
        allEventsList.appendChild(div);
      } else {
        // multiple events: show date heading with items
        const header = document.createElement('div');
        header.style.margin = '6px 0'; header.style.fontWeight = '700';
        header.textContent = new Date(dateKey).toLocaleDateString();
        allEventsList.appendChild(header);
        list.forEach(ev => {
          const div = document.createElement('div');
          div.style.borderLeft = `4px solid ${ev.backgroundColor || '#1a73e8'}`;
          div.style.padding = '8px'; div.style.marginBottom = '8px';
          div.innerHTML = `<div style="font-weight:600">${ev.title}</div><div style="font-size:13px;color:#555">${formatShort(ev.start)}</div>`;
          div.addEventListener('click', () => { calendar.gotoDate(ev.start); highlightEvent(ev); allModal.classList.add('hidden'); });
          allEventsList.appendChild(div);
        });
      }
    });
  }

  // moreLink handling (open a modal for that date)
  function openAllModalForDate(dateObj) {
    // find events for that date (respecting filters)
    const dateKey = toISODate(dateObj);
    const active = {}; calToggles.forEach(cb => active[cb.dataset.cal] = cb.checked);
    const events = calendar.getEvents().filter(ev => {
      const evDate = ev.startStr.slice(0, 10);
      const cat = ev.extendedProps && ev.extendedProps.category ? ev.extendedProps.category : 'appointments';
      return evDate === dateKey && !!active[cat];
    }).sort((a,b) => new Date(a.start) - new Date(b.start));

    // populate allEventsList with heading
    allEventsList.innerHTML = '';
    const heading = document.createElement('div');
    heading.style.fontWeight = '700'; heading.style.marginBottom = '8px';
    heading.textContent = new Date(dateObj).toLocaleDateString();
    allEventsList.appendChild(heading);

    if (events.length === 0) {
      allEventsList.innerHTML += '<div>No events for this date</div>';
    } else {
      events.forEach(ev => {
        const div = document.createElement('div');
        div.style.borderLeft = `4px solid ${ev.backgroundColor || '#1a73e8'}`;
        div.style.padding = '8px'; div.style.marginBottom = '8px';
        div.innerHTML = `<div style="font-weight:600">${ev.title}</div><div style="font-size:13px;color:#555">${formatShort(ev.start)}</div>`;
        div.addEventListener('click', () => { calendar.gotoDate(ev.start); highlightEvent(ev); allModal.classList.add('hidden'); });
        allEventsList.appendChild(div);
      });
    }
    allModal.classList.remove('hidden');
  }

  // Search helpers
  function clearHighlights() {
    calendar.getEvents().forEach(e => {
      const cls = (e.classNames || []).filter(c => c !== 'search-hit');
      e.setProp('classNames', cls);
    });
  }

  // highlight used in search & upcoming clicks
  function highlightEvent(ev) {
    const classes = (ev.classNames || []).slice();
    if (!classes.includes('search-hit')) classes.push('search-hit');
    ev.setProp('classNames', classes);
    setTimeout(() => {
      const cls = (ev.classNames || []).filter(c => c !== 'search-hit');
      ev.setProp('classNames', cls);
    }, 3500);
  }

  // Persist
  function persistAll() {
    const arr = calendar.getEvents().map(e => ({
      id: e.id, title: e.title, start: e.startStr, end: e.endStr || null,
      backgroundColor: e.backgroundColor || '#1a73e8',
      borderColor: e.borderColor || e.backgroundColor || '#1a73e8',
      extendedProps: e.extendedProps || {}
    }));
    saveStored(arr);
  }

  // Utility helpers
  function refreshTitle() {
    currentTitle.textContent = calendar.view.title;
    const v = calendar.view.type;
    monthView.classList.toggle('active', v === 'dayGridMonth');
    weekView.classList.toggle('active', v === 'timeGridWeek');
    dayView.classList.toggle('active', v === 'timeGridDay');
  }
  function toLocal(iso) {
    if (!iso) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso + 'T09:00';
    return iso.replace(/:\d{2}(\.\d+)?(Z|[+\-].*)?$/, '');
  }
  function getTodayISO() {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function isPast(iso) { try { return new Date(iso).getTime() < startOfToday().getTime(); } catch (e) { return false; } }
  function isPastRange(startISO, endISO) { try { const e = new Date(endISO || startISO); return e.getTime() < startOfToday().getTime(); } catch (e) { return false; } }
  function startOfToday() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
  function formatShort(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }); }
  function toISODate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

  function toISODateTime(dayDate, sourceISO) {
    // keep time-of-day from sourceISO, but set the date to dayDate
    const src = new Date(sourceISO);
    const y = dayDate.getFullYear(), m = dayDate.getMonth(), da = dayDate.getDate();
    const hh = String(src.getHours()).padStart(2,'0'), mm = String(src.getMinutes()).padStart(2,'0');
    return `${y}-${String(m+1).padStart(2,'0')}-${String(da).padStart(2,'0')}T${hh}:${mm}`;
  }

  function rangesOverlap(aStart,aEnd,bStart,bEnd) {
    const aS = aStart ? new Date(aStart).getTime() : null;
    const aE = aEnd ? new Date(aEnd).getTime() : (aS ? aS + 30*60*1000 : null);
    const bS = bStart ? new Date(bStart).getTime() : null;
    const bE = bEnd ? new Date(bEnd).getTime() : (bS ? bS + 30*60*1000 : null);
    if (aS == null || bS == null) return false;
    return (aS < bE) && (bS < aE);
  }

  // Toast
  let toastTimer = null;
  function showToast(msg, time = 2200) {
    toast.textContent = msg; toast.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), time);
  }

  // Expose helper for booking integration
  window.addExternalBooking = function({ title, startISO, endISO, category }) {
    const cat = category || 'confirmed';
    if (isPast(startISO)) return console.warn('booking ignored in past', startISO);
    const color = categoryColor(cat);
    const base = 'ext-' + Date.now() + '-' + Math.floor(Math.random()*1000);

    const s = new Date(startISO), e = endISO ? new Date(endISO) : s;
    const sDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const eDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    const days = Math.round((eDay - sDay)/(24*3600*1000)) + 1;

    for (let i=0; i<days; i++) {
      const day = new Date(sDay.getTime() + i*24*3600*1000);
      const dayStart = toISODateTime(day, startISO);
      const dayEnd = endISO ? toISODateTime(day, endISO) : null;
      const id = base + '-' + i;
      calendar.addEvent({ id, title, start: dayStart, end: dayEnd || null, backgroundColor: color, borderColor: color, extendedProps: { category: cat } });
    }
    persistAll(); updateUpcoming();
  };

  // initial update/persist
  updateUpcoming();
  window.addEventListener('beforeunload', persistAll);
});
