/**
 * PlanDay — 달력 · 대시보드 · 일정 UI (11-3 3단계)
 * 사용: window.createPlanDayScheduleUi(deps)
 */
window.createPlanDayScheduleUi = function createPlanDayScheduleUi(deps) {
  const $ = deps.$;

  let todayPage = 0;
  let upcomingPage = 0;
  let listPage = 0;
  let ddayPage = 0;
  const listSelectedIds = new Set();
  let listDeleteMode = false;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedDate = deps.formatDate(new Date());
  let eventModalContext = null;
  function getWeekday(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  function eventOccursOn(event, dateStr) {
    if (event.repeat === "weekly") {
      return getWeekday(event.date) === getWeekday(dateStr) && dateStr >= event.date;
    }
    return event.date === dateStr;
  }

  function getOccurrenceKey(event, dateStr) {
    return `${event.id}_${dateStr}`;
  }

  function isDone(event, dateStr) {
    return (event.doneDates || []).includes(dateStr);
  }

  function isUpcomingOnDate(event, dateStr) {
    const todayStr = deps.formatDate(new Date());
    if (dateStr > todayStr) return true;
    if (dateStr < todayStr) return false;
    const [h, min] = event.time.split(":").map(Number);
    return h * 60 + min >= new Date().getHours() * 60 + new Date().getMinutes();
  }

  function getTodayOrder(dateStr) {
    try {
      return JSON.parse(localStorage.getItem(deps.ORDER_KEY_PREFIX + dateStr)) || [];
    } catch { return []; }
  }

  function saveTodayOrder(dateStr, ids) {
    localStorage.setItem(deps.ORDER_KEY_PREFIX + dateStr, JSON.stringify(ids));
  }

  function sortTodayEvents(list, dateStr) {
    const order = getTodayOrder(dateStr);
    return [...list].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return a.time.localeCompare(b.time);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  function getEventsForDate(dateStr, upcomingOnly = false) {
    const list = deps.getEvents().filter(e => eventOccursOn(e, dateStr));
    const filtered = upcomingOnly ? list.filter(e => isUpcomingOnDate(e, dateStr)) : list;
    const todayStr = deps.formatDate(new Date());
    if (dateStr === todayStr && upcomingOnly) {
      return sortTodayEvents(filtered, dateStr);
    }
    return filtered.sort((a, b) => a.time.localeCompare(b.time));
  }

  function getAllOccurrences(upcomingOnly = true) {
    const result = [];
    const todayStr = deps.formatDate(new Date());
    const end = deps.addDays(new Date(), 60);

    deps.getEvents().forEach(event => {
      if (event.repeat === "weekly") {
        let cur = todayStr >= event.date ? todayStr : event.date;
        if (getWeekday(cur) !== getWeekday(event.date)) {
          const d = new Date(cur + "T00:00:00");
          const diff = (getWeekday(event.date) - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + diff);
          cur = deps.formatDate(d);
        }
        while (cur <= end) {
          if (!upcomingOnly || isUpcomingOnDate(event, cur)) {
            result.push({ event, dateStr: cur });
          }
          cur = deps.addDays(new Date(cur + "T00:00:00"), 7);
        }
      } else if (!upcomingOnly || isUpcomingOnDate(event, event.date)) {
        result.push({ event, dateStr: event.date });
      }
    });

    return result.sort((a, b) => {
      const c = a.dateStr.localeCompare(b.dateStr);
      return c !== 0 ? c : a.event.time.localeCompare(b.event.time);
    });
  }

  function getFutureOccurrences(excludeToday = false) {
    const all = getAllOccurrences(true);
    if (!excludeToday) return all;
    const todayStr = deps.formatDate(new Date());
    return all.filter(o => o.dateStr > todayStr);
  }

  function getWeekRange() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: deps.formatDate(start), end: deps.formatDate(end) };
  }

  function formatDisplayDate(dateStr) {
    const [y, m, d] = dateStr.split("-");
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const wd = ["일","월","화","수","목","금","토"];
    return `${y}년 ${Number(m)}월 ${Number(d)}일 (${wd[date.getDay()]})`;
  }

  function getRelativeLabel(dateStr) {
    const todayStr = deps.formatDate(new Date());
    if (dateStr === todayStr) return "오늘";
    const diff = Math.round((new Date(dateStr + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
    if (diff === 1) return "내일";
    if (diff === 2) return "모레";
    return `${diff}일 후`;
  }

  function getDday(dateStr) {
    const todayStr = deps.formatDate(new Date());
    return Math.round((new Date(dateStr + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
  }

  function getDdayLabel(dateStr) {
    const days = getDday(dateStr);
    if (days === 0) return "D-Day";
    return `D-${days}`;
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  }

  function switchTab(name) {
    if (name !== "list" && listDeleteMode) exitListDeleteMode(false);
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === `panel-${name}`));
  }

  function buildBadges(event) {
    let h = `<span class="badge badge-cat-${event.category}">${deps.CATEGORY_LABELS[event.category]}</span>`;
    if (event.important) h += `<span class="badge badge-important">중요</span>`;
    if (event.repeat === "weekly") h += `<span class="badge badge-repeat">매주</span>`;
    if (event.dday) h += `<span class="badge badge-dday">${getDdayLabel(event.date)}</span>`;
    return h;
  }

  function toggleDone(eventId, dateStr) {
    const event = deps.getEvents().find(e => e.id === eventId);
    if (!event) return;
    if (!event.doneDates) event.doneDates = [];
    const idx = event.doneDates.indexOf(dateStr);
    if (idx >= 0) event.doneDates.splice(idx, 1);
    else event.doneDates.push(dateStr);
    deps.saveEvents().then(() => renderAll());
  }

  function deleteEvent(id) {
    if (!confirm("이 일정을 삭제할까요?")) return;
    deps.setEvents(deps.getEvents().filter(e => e.id !== id));
    listSelectedIds.delete(id);
    deps.saveEvents().then(() => {
      renderAll();
      deps.showToast("일정이 삭제되었습니다");
    });
  }

  function deleteEventSilent(id) {
    const exists = deps.getEvents().some(e => e.id === id);
    if (!exists) return Promise.resolve(false);
    deps.setEvents(deps.getEvents().filter(e => e.id !== id));
    listSelectedIds.delete(id);
    return deps.saveEvents().then(() => {
      renderAll();
      return true;
    });
  }

  function updateEventById(id, patch) {
    const idx = deps.getEvents().findIndex(e => e.id === id);
    if (idx < 0) return Promise.resolve(false);
    deps.getEvents()[idx] = deps.normalizeEvent({ ...deps.getEvents()[idx], ...patch });
    return deps.saveEvents().then(() => {
      renderAll();
      return true;
    });
  }

  function getTodayCompletionStats() {
    const todayStr = deps.formatDate(new Date());
    const items = getEventsForDate(todayStr, false);
    const done = items.filter(e => isDone(e, todayStr)).length;
    return {
      total: items.length,
      done,
      percent: items.length ? Math.round((done / items.length) * 100) : 0
    };
  }

  function getNextOccurrence() {
    const all = getAllOccurrences(true);
    const now = new Date();
    const todayStr = deps.formatDate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const item of all) {
      const { event, dateStr } = item;
      if (dateStr < todayStr) continue;
      const [h, m] = event.time.split(":").map(Number);
      const tMin = h * 60 + m;
      if (dateStr === todayStr && tMin <= nowMin) continue;
      return item;
    }
    return null;
  }

  function openEdit(eventId) {
    const event = deps.getEvents().find(e => e.id === eventId);
    if (!event) return;
    $("edit-id").value = event.id;
    $("edit-title").value = event.title;
    $("edit-date").value = event.date;
    $("edit-time").value = event.time;
    $("edit-category").value = event.category;
    $("edit-repeat").value = event.repeat;
    $("edit-memo").value = event.memo;
    $("edit-important").checked = event.important;
    $("edit-dday").checked = event.dday;
    $("edit-modal").classList.add("open");
  }

  function closeEdit() {
    $("edit-modal").classList.remove("open");
  }

  function renderEventEl(event, dateStr, opts = {}) {
    const { showDate = false, showCheck = false, showSelect = false, deleteSelectMode = false, hideDelete = false, hideEdit = false, asList = false, draggable = false, compact = false, home = false } = opts;
    const done = isDone(event, dateStr);
    const isSelected = listSelectedIds.has(event.id);
    const el = document.createElement(asList ? "li" : "div");
    el.className = `${asList ? "event-item" : "event-card"} cat-${event.category}${event.important ? " important" : ""}${done ? " done" : ""}${compact ? " compact" : ""}${home ? " home-card" : ""}`;
    if (deleteSelectMode) {
      el.classList.add("delete-selectable");
      if (isSelected) el.classList.add("selected-for-delete");
    }
    el.dataset.id = event.id;
    if (draggable) el.draggable = true;

    let dateBox = "";
    if (showDate) {
      const [, m, d] = dateStr.split("-");
      dateBox = `<div class="event-date-box"><div class="month">${Number(m)}월</div><div class="day">${Number(d)}</div></div>`;
    }

    const dragHtml = draggable ? `<span class="drag-handle" title="드래그">⠿</span>` : "";
    const checkHtml = showCheck
      ? `<button type="button" class="check-btn${done ? " checked" : ""}" aria-label="완료">${done ? "✓" : ""}</button>`
      : "";
    const selectHtml = showSelect
      ? (deleteSelectMode
        ? `<button type="button" class="check-btn delete-select${isSelected ? " checked" : ""}" aria-label="선택">${isSelected ? "✓" : ""}</button>`
        : `<input type="checkbox" class="select-check" aria-label="선택"${isSelected ? " checked" : ""}>`)
      : "";
    const deleteHtml = hideDelete
      ? ""
      : `<button type="button" class="icon-btn del" title="삭제">×</button>`;
    const editHtml = hideEdit
      ? ""
      : `<button type="button" class="icon-btn edit-btn" title="수정">✎</button>`;

    el.innerHTML = `
      ${dragHtml}${selectHtml}${checkHtml}${dateBox}
      <div class="${asList ? "event-body" : "event-main"}">
        <div class="event-title">${escapeHtml(event.title)} ${buildBadges(event)}</div>
        <div class="${asList ? "event-meta" : "event-sub"}">${event.time}${showDate && !home ? " · " + formatDisplayDate(dateStr) : ""}</div>
        ${event.memo && !compact ? `<div class="event-memo">${escapeHtml(event.memo)}</div>` : ""}
      </div>
      <div class="item-actions">
        ${editHtml}
        ${deleteHtml}
      </div>`;

    if (showCheck) {
      el.querySelector(".check-btn").addEventListener("click", e => {
        e.stopPropagation();
        toggleDone(event.id, dateStr);
      });
    }
    if (showSelect && deleteSelectMode) {
      el.addEventListener("click", () => toggleListSelection(event.id));
    } else if (showSelect) {
      el.querySelector(".select-check").addEventListener("change", e => {
        if (e.target.checked) listSelectedIds.add(event.id);
        else listSelectedIds.delete(event.id);
        updateListActionButtons();
      });
    }
    if (!hideEdit) el.querySelector(".edit-btn").addEventListener("click", () => openEdit(event.id));
    if (!hideDelete) el.querySelector(".del").addEventListener("click", () => deleteEvent(event.id));
    return el;
  }

  function getAllListEventIds() {
    return [...new Set(getAllOccurrences(false).map(o => o.event.id))];
  }

  function resetListActionButtons() {
    $("list-select-all").textContent = "전체선택";
    $("list-delete-selected").disabled = true;
  }

  function updateListActionButtons() {
    if (!listDeleteMode) return;
    const allIds = getAllListEventIds();
    const allSelected = allIds.length > 0 && allIds.every(id => listSelectedIds.has(id));
    $("list-select-all").textContent = allSelected ? "선택해제" : "전체선택";
    $("list-delete-selected").disabled = listSelectedIds.size === 0;
  }

  function toggleListSelection(id) {
    if (listSelectedIds.has(id)) listSelectedIds.delete(id);
    else listSelectedIds.add(id);
    renderList();
  }

  function enterListDeleteMode() {
    listDeleteMode = true;
    listSelectedIds.clear();
    resetListActionButtons();
    $("list-normal-actions").hidden = true;
    $("list-delete-actions").hidden = false;
    renderList();
  }

  function exitListDeleteMode(rerender = true) {
    listDeleteMode = false;
    listSelectedIds.clear();
    resetListActionButtons();
    $("list-normal-actions").hidden = false;
    $("list-delete-actions").hidden = true;
    if (rerender) renderList();
  }

  function toggleListSelectAll() {
    const allIds = getAllListEventIds();
    const allSelected = allIds.length > 0 && allIds.every(id => listSelectedIds.has(id));
    if (allSelected) listSelectedIds.clear();
    else allIds.forEach(id => listSelectedIds.add(id));
    renderList();
  }

  function deleteSelectedEvents() {
    if (listSelectedIds.size === 0) {
      deps.showToast("삭제할 일정을 선택하세요");
      return;
    }
    if (!confirm(`선택한 ${listSelectedIds.size}개 일정을 삭제할까요?`)) return;
    deps.setEvents(deps.getEvents().filter(e => !listSelectedIds.has(e.id)));
    exitListDeleteMode(false);
    deps.saveEvents().then(() => {
      renderAll();
      deps.showToast("선택한 일정이 삭제되었습니다");
    });
  }

  function renderPagination(container, items, page, pageSize, onChange) {
    container.innerHTML = "";
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (items.length <= pageSize) return;

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "page-btn";
    prev.textContent = "‹ 이전";
    prev.disabled = page <= 0;
    prev.addEventListener("click", () => onChange(page - 1));

    const info = document.createElement("span");
    info.className = "page-info";
    info.textContent = `${page + 1} / ${totalPages}`;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "page-btn";
    next.textContent = "다음 ›";
    next.disabled = page >= totalPages - 1;
    next.addEventListener("click", () => onChange(page + 1));

    container.appendChild(prev);
    container.appendChild(info);
    container.appendChild(next);
  }

  function paginateSlice(items, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * pageSize;
    return { slice: items.slice(start, start + pageSize), page: safePage, totalPages };
  }

  function renderPagedSection(listEl, paginationEl, items, page, pageSize, renderItem, onPageChange, emptyMsg = "일정 없음") {
    listEl.innerHTML = "";
    if (items.length === 0) {
      const tag = listEl.tagName === "UL" ? "li" : "p";
      listEl.innerHTML = `<${tag} class="list-empty">${emptyMsg}</${tag}>`;
      paginationEl.innerHTML = "";
      return 0;
    }

    const { slice, page: safePage } = paginateSlice(items, page, pageSize);
    slice.forEach(item => listEl.appendChild(renderItem(item)));
    renderPagination(paginationEl, items, safePage, pageSize, onPageChange);
    return safePage;
  }

  function setupDragSort(container, dateStr) {
    let dragId = null;

    container.querySelectorAll("[draggable=true]").forEach(el => {
      el.addEventListener("dragstart", e => {
        if (e.target.closest(".check-btn, .icon-btn")) {
          e.preventDefault();
          return;
        }
        dragId = el.dataset.id;
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        container.querySelectorAll(".drag-over").forEach(x => x.classList.remove("drag-over"));
      });

      el.addEventListener("dragover", e => {
        e.preventDefault();
        el.classList.add("drag-over");
      });

      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));

      el.addEventListener("drop", e => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const targetId = el.dataset.id;
        if (!dragId || dragId === targetId) return;

        const ids = [...container.querySelectorAll("[data-id]")].map(n => n.dataset.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;

        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        saveTodayOrder(dateStr, ids);
        renderDashboard();
        renderProgress();
        deps.showToast("순서가 변경되었습니다");
      });
    });
  }

  function renderProgress() {
    const todayStr = deps.formatDate(new Date());
    const todayAll = getEventsForDate(todayStr, false);
    const done = todayAll.filter(e => isDone(e, todayStr)).length;
    const total = todayAll.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("progress-label").textContent = `${done} / ${total} 완료`;
    $("progress-pct").textContent = `${pct}%`;
    $("progress-fill").style.width = `${pct}%`;
  }

  function renderDday() {
    const list = $("dday-list");
    const pag = $("dday-pagination");
    const ddayEvents = deps.getEvents()
      .filter(e => e.dday && getDday(e.date) >= 0)
      .sort((a, b) => getDday(a.date) - getDday(b.date));

    list.innerHTML = "";
    if (ddayEvents.length === 0) {
      list.innerHTML = `<p class="list-empty" style="padding:8px;grid-column:1/-1">D-day 일정 없음</p>`;
      pag.innerHTML = "";
      return;
    }

    const { slice, page: safePage } = paginateSlice(ddayEvents, ddayPage, deps.DDAY_PAGE_SIZE);
    ddayPage = safePage;

    slice.forEach(e => {
      const div = document.createElement("div");
      div.className = "dday-item";
      div.innerHTML = `
        <div class="days">${getDdayLabel(e.date)}</div>
        <div class="title">${escapeHtml(e.title)}</div>
        <div class="date">${formatDisplayDate(e.date)}</div>`;
      list.appendChild(div);
    });

    renderPagination(pag, ddayEvents, ddayPage, deps.DDAY_PAGE_SIZE, p => {
      ddayPage = p;
      renderDday();
    });
  }

  function renderSearch(query) {
    const box = $("search-results");
    box.innerHTML = "";
    if (!query.trim()) return;

    const q = query.toLowerCase();
    const matches = getAllOccurrences(false).filter(({ event }) =>
      event.title.toLowerCase().includes(q) ||
      event.memo.toLowerCase().includes(q) ||
      deps.CATEGORY_LABELS[event.category].includes(q)
    ).slice(0, 8);

    if (matches.length === 0) {
      box.innerHTML = `<p class="list-empty" style="padding:8px">검색 결과 없음</p>`;
      return;
    }

    matches.forEach(({ event, dateStr }) => {
      const div = document.createElement("div");
      div.className = "search-item";
      div.style.borderLeftColor = `var(--cat-${event.category})`;
      div.innerHTML = `<strong>${escapeHtml(event.title)}</strong><br><span style="font-size:0.78rem;color:var(--text-muted)">${formatDisplayDate(dateStr)} ${event.time}</span>`;
      div.addEventListener("click", () => {
        selectedDate = dateStr;
        viewYear = Number(dateStr.split("-")[0]);
        viewMonth = Number(dateStr.split("-")[1]) - 1;
        switchTab("calendar");
        renderCalendar();
      });
      box.appendChild(div);
    });
  }

  function renderNextEvent() {
    const occ = getAllOccurrences(true);
    const next = occ[0];
    const box = $("next-event-box");
    if (!next) {
      box.innerHTML = `<div class="next-event"><div class="next-event-label">다음 일정</div><div class="next-event-meta">예정된 일정이 없습니다</div></div>`;
      return;
    }
    const { event, dateStr } = next;
    box.innerHTML = `
      <div class="next-event">
        <div class="next-event-label">다음 일정 · ${getRelativeLabel(dateStr)} ${event.time}</div>
        <div class="next-event-title">${escapeHtml(event.title)}</div>
        <div class="next-event-meta">${formatDisplayDate(dateStr)} · ${deps.CATEGORY_LABELS[event.category]}</div>
      </div>`;
  }

  function renderMiniWeek() {
    const { start, end } = getWeekRange();
    const todayStr = deps.formatDate(new Date());
    const wd = ["일","월","화","수","목","금","토"];
    const grid = $("mini-week");
    grid.innerHTML = "";

    for (let i = 0; i < 7; i++) {
      const date = new Date(start + "T00:00:00");
      date.setDate(date.getDate() + i);
      const dateStr = deps.formatDate(date);
      const count = getEventsForDate(dateStr, false).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini-day" + (dateStr === todayStr ? " today" : "");
      btn.innerHTML = `
        <div class="mini-day-name">${wd[i]}</div>
        <div class="mini-day-num">${date.getDate()}</div>
        <div class="mini-dots">${Array(Math.min(count,3)).fill('<span class="mini-dot"></span>').join("")}</div>`;
      btn.addEventListener("click", () => openCalDayModal(dateStr));
      grid.appendChild(btn);
    }
  }

  function renderCategorySummary() {
    const { start, end } = getWeekRange();
    const box = $("cat-summary");
    box.innerHTML = "";
    ["school","personal","work","other"].forEach(cat => {
      let count = 0;
      for (let d = new Date(start + "T00:00:00"); deps.formatDate(d) <= end; d.setDate(d.getDate() + 1)) {
        count += getEventsForDate(deps.formatDate(d), false).filter(e => e.category === cat).length;
      }
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "cat-pill";
      pill.textContent = `${deps.CATEGORY_LABELS[cat]} ${count}`;
      pill.addEventListener("click", () => openCategoryWeekModal(cat));
      box.appendChild(pill);
    });
  }

  function renderHomeEvent(event, dateStr, opts = {}) {
    return renderEventEl(event, dateStr, {
      showDate: true,
      compact: true,
      home: true,
      ...opts
    });
  }

  function renderDashboard() {
    const todayStr = deps.formatDate(new Date());
    const { start, end } = getWeekRange();
    const todayOcc = getEventsForDate(todayStr, false);
    let weekCount = 0;
    for (let d = new Date(start + "T00:00:00"); deps.formatDate(d) <= end; d.setDate(d.getDate() + 1)) {
      weekCount += getEventsForDate(deps.formatDate(d), false).length;
    }

    $("dash-greeting-text").textContent = deps.randomGreeting;
    $("dash-date-text").textContent = formatDisplayDate(todayStr);
    $("stat-today").textContent = todayOcc.length;
    $("stat-week").textContent = weekCount;
    $("stat-important").textContent = getAllOccurrences(false).filter(o => o.event.important).length;

    renderNextEvent();
    renderMiniWeek();
    renderCategorySummary();

    const todayList = $("dash-today-list");
    const todayPagination = $("today-pagination");
    const sortedToday = sortTodayEvents(todayOcc, todayStr);

    todayPage = renderPagedSection(
      todayList,
      todayPagination,
      sortedToday,
      todayPage,
      deps.HOME_PAGE_SIZE,
      e => renderHomeEvent(e, todayStr, { showCheck: true, draggable: true }),
      newPage => { todayPage = newPage; renderDashboard(); },
      "오늘 일정 없음"
    );
    if (sortedToday.length > 0) setupDragSort(todayList, todayStr);

    const upList = $("dash-upcoming-list");
    const upPagination = $("upcoming-pagination");
    const upcomingAll = getFutureOccurrences(true);

    upcomingPage = renderPagedSection(
      upList,
      upPagination,
      upcomingAll,
      upcomingPage,
      deps.HOME_PAGE_SIZE,
      ({ event, dateStr }) => renderHomeEvent(event, dateStr),
      newPage => { upcomingPage = newPage; renderDashboard(); },
      "다가오는 일정 없음"
    );
  }

  function buildCalCellEventsHtml(events, maxShow = 2) {
    if (!events.length) return "";
    const shown = events.slice(0, maxShow);
    let html = shown.map(e =>
      `<span class="cal-event-pill cat-${e.category}">${escapeHtml(e.title)}</span>`
    ).join("");
    if (events.length > maxShow) {
      html += `<span class="cal-event-more">+${events.length - maxShow}</span>`;
    }
    return html;
  }

  function getCategoryWeekOccurrences(category) {
    const { start, end } = getWeekRange();
    const occurrences = [];
    for (let d = new Date(start + "T00:00:00"); deps.formatDate(d) <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = deps.formatDate(d);
      getEventsForDate(dateStr, false)
        .filter(e => e.category === category)
        .forEach(event => occurrences.push({ event, dateStr }));
    }
    return occurrences;
  }

  function renderEventListModal(title, occurrences) {
    $("cal-day-modal-title").textContent = title;
    const dayEl = $("cal-day-modal-events");
    dayEl.innerHTML = "";
    if (!occurrences.length) {
      dayEl.innerHTML = `<li class="list-empty">일정 없음</li>`;
    } else {
      const todayStr = deps.formatDate(new Date());
      occurrences.forEach(({ event, dateStr }) => {
        dayEl.appendChild(renderEventEl(event, dateStr, {
          asList: true,
          showDate: true,
          showCheck: dateStr === todayStr
        }));
      });
    }
  }

  function refreshEventModal() {
    if (!eventModalContext) return;
    if (eventModalContext.type === "day") {
      const dateStr = eventModalContext.dateStr;
      const list = getEventsForDate(dateStr, false);
      renderEventListModal(formatDisplayDate(dateStr), list.map(event => ({ event, dateStr })));
    } else if (eventModalContext.type === "category") {
      renderEventListModal(
        `이번 주 · ${deps.CATEGORY_LABELS[eventModalContext.category]}`,
        getCategoryWeekOccurrences(eventModalContext.category)
      );
    }
    if (!$("modal-add-wrap").hidden) {
      $("cal-day-modal-events").hidden = true;
    }
  }

  function hideModalAddForm() {
    $("modal-add-wrap").hidden = true;
    $("cal-day-modal-events").hidden = false;
    $("modal-add-form").reset();
    $("modal-add-time").value = "09:00";
  }

  function showModalAddForm(dateStr) {
    $("modal-add-date").value = dateStr;
    $("modal-add-date-label").textContent = formatDisplayDate(dateStr);
    $("modal-add-time").value = "09:00";
    $("cal-day-modal-events").hidden = true;
    $("modal-add-wrap").hidden = false;
    $("cal-day-modal-add-btn").hidden = true;
    $("modal-add-title").focus();
  }

  function updateModalAddUi() {
    hideModalAddForm();
    $("cal-day-modal-add-btn").hidden = eventModalContext?.type !== "day";
  }

  function pushNewEvent(data) {
    deps.getEvents().push(deps.normalizeEvent({
      id: crypto.randomUUID(),
      doneDates: [],
      ...data
    }));
    return deps.saveEvents();
  }

  function openCalDayModal(dateStr) {
    selectedDate = dateStr;
    eventModalContext = { type: "day", dateStr };
    refreshEventModal();
    updateModalAddUi();
    $("cal-day-modal").classList.add("open");
    renderCalendar();
  }

  function openCategoryWeekModal(category) {
    eventModalContext = { type: "category", category };
    refreshEventModal();
    updateModalAddUi();
    $("cal-day-modal").classList.add("open");
  }

  function closeCalDayModal() {
    $("cal-day-modal").classList.remove("open");
    eventModalContext = null;
    hideModalAddForm();
  }

  function appendCalDayCell(grid, cellYear, cellMonth, cellDay, todayStr) {
    const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;
    const isCurrentMonth = cellYear === viewYear && cellMonth === viewMonth;
    const dayEvents = getEventsForDate(dateStr, false);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    if (!isCurrentMonth) btn.classList.add("other-month");
    if (dateStr === todayStr) btn.classList.add("today");
    if (dateStr === selectedDate) btn.classList.add("selected");
    const dayLabel = isCurrentMonth ? String(cellDay) : `${cellMonth + 1}/${cellDay}`;
    btn.innerHTML = `
      <span class="cal-day-num">${dayLabel}</span>
      <div class="cal-cell-events">${buildCalCellEventsHtml(dayEvents)}</div>`;
    btn.addEventListener("click", () => openCalDayModal(dateStr));
    grid.appendChild(btn);
  }

  function renderCalendar() {
    $("cal-title").textContent = `${viewYear}년 ${viewMonth + 1}월`;
    const grid = $("cal-grid");
    grid.innerHTML = "";
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr = deps.formatDate(new Date());
    const totalCells = 42;

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstDay + 1;
      let cellYear = viewYear;
      let cellMonth = viewMonth;
      let cellDay = dayNum;

      if (dayNum < 1) {
        cellMonth = viewMonth === 0 ? 11 : viewMonth - 1;
        cellYear = viewMonth === 0 ? viewYear - 1 : viewYear;
        const daysInPrev = new Date(cellYear, cellMonth + 1, 0).getDate();
        cellDay = daysInPrev + dayNum;
      } else if (dayNum > daysInMonth) {
        cellMonth = viewMonth === 11 ? 0 : viewMonth + 1;
        cellYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        cellDay = dayNum - daysInMonth;
      }

      appendCalDayCell(grid, cellYear, cellMonth, cellDay, todayStr);
    }

    if ($("cal-day-modal").classList.contains("open")) {
      refreshEventModal();
    }
  }

  function renderList() {
    const list = $("all-events");
    const paginationEl = $("list-pagination");
    const occ = getAllOccurrences(false);
    const todayStr = deps.formatDate(new Date());

    listPage = renderPagedSection(
      list,
      paginationEl,
      occ,
      listPage,
      deps.LIST_PAGE_SIZE,
      ({ event, dateStr }) => renderEventEl(event, dateStr, {
        asList: true,
        showDate: true,
        showCheck: dateStr === todayStr && !listDeleteMode,
        showSelect: listDeleteMode,
        deleteSelectMode: listDeleteMode,
        hideDelete: true,
        hideEdit: listDeleteMode
      }),
      newPage => { listPage = newPage; renderList(); },
      "다가오는 일정 없음"
    );
    updateListActionButtons();
  }

  function renderAll() {
    renderProgress();
    renderDday();
    renderSearch($("search-input").value);
    renderDashboard();
    renderCalendar();
    renderList();
    if ($("cal-day-modal").classList.contains("open")) refreshEventModal();
  }

  function setupEvents() {    document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.goto)));

    $("search-input").addEventListener("input", e => renderSearch(e.target.value));

    $("cal-prev").addEventListener("click", () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
    $("cal-next").addEventListener("click", () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });
    $("cal-today").addEventListener("click", () => {
      const n = new Date();
      viewYear = n.getFullYear(); viewMonth = n.getMonth();
      selectedDate = formatDate(n);
      renderCalendar();
    });

    $("add-form").addEventListener("submit", e => {
      e.preventDefault();
      pushNewEvent({
        title: $("title").value.trim(),
        date: $("date").value,
        time: $("time").value,
        memo: $("memo").value.trim(),
        category: $("category").value,
        repeat: $("repeat").value,
        important: $("important").checked,
        dday: $("dday").checked
      }).then(() => {
        e.target.reset();
        $("date").value = formatDate(new Date());
        $("time").value = "09:00";
        renderAll();
        deps.showToast("일정이 저장되었습니다");
        switchTab("dashboard");
      });
    });

    $("modal-add-form").addEventListener("submit", e => {
      e.preventDefault();
      pushNewEvent({
        title: $("modal-add-title").value.trim(),
        date: $("modal-add-date").value,
        time: $("modal-add-time").value,
        memo: $("modal-add-memo").value.trim(),
        category: $("modal-add-category").value,
        repeat: $("modal-add-repeat").value,
        important: $("modal-add-important").checked,
        dday: $("modal-add-dday").checked
      }).then(() => {
        hideModalAddForm();
        renderAll();
        deps.showToast("일정이 저장되었습니다");
        if (eventModalContext?.type === "day") {
          $("cal-day-modal-add-btn").hidden = false;
        }
      });
    });

    $("cal-day-modal-add-btn").addEventListener("click", () => {
      if (eventModalContext?.type === "day") {
        showModalAddForm(eventModalContext.dateStr);
      }
    });

    $("modal-add-cancel").addEventListener("click", () => {
      hideModalAddForm();
      if (eventModalContext?.type === "day") {
        $("cal-day-modal-add-btn").hidden = false;
      }
    });

    $("edit-form").addEventListener("submit", e => {
      e.preventDefault();
      const id = $("edit-id").value;
      const idx = deps.getEvents().findIndex(ev => ev.id === id);
      if (idx < 0) return;
      deps.getEvents()[idx] = deps.normalizeEvent({
        ...deps.getEvents()[idx],
        title: $("edit-title").value.trim(),
        date: $("edit-date").value,
        time: $("edit-time").value,
        memo: $("edit-memo").value.trim(),
        category: $("edit-category").value,
        repeat: $("edit-repeat").value,
        important: $("edit-important").checked,
        dday: $("edit-dday").checked
      });
      deps.saveEvents().then(() => {
        closeEdit();
        renderAll();
        deps.showToast("일정이 수정되었습니다");
      });
    });

    $("edit-cancel").addEventListener("click", closeEdit);
    $("edit-modal").addEventListener("click", e => { if (e.target === $("edit-modal")) closeEdit(); });
    $("cal-day-modal-close").addEventListener("click", closeCalDayModal);
    $("cal-day-modal").addEventListener("click", e => { if (e.target === $("cal-day-modal")) closeCalDayModal(); });
    $("list-enter-delete").addEventListener("click", enterListDeleteMode);
    $("list-cancel-delete").addEventListener("click", () => exitListDeleteMode());
    $("list-select-all").addEventListener("click", toggleListSelectAll);
    $("list-delete-selected").addEventListener("click", deleteSelectedEvents);
  }

  return {
    renderAll,
    renderCalendar,
    renderDashboard,
    renderSearch,
    getEventsForDate,
    getAllOccurrences,
    getFutureOccurrences,
    getWeekRange,
    getDday,
    getDdayLabel,
    formatDisplayDate,
    getRelativeLabel,
    pushNewEvent,
    escapeHtml,
    switchTab,
    toggleDone,
    deleteEventSilent,
    updateEventById,
    isDone,
    openCalDayModal,
    getTodayCompletionStats,
    getNextOccurrence,
    setupEvents
  };
};
