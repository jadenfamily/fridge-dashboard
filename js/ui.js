/* 냉장고 파먹기 · 전체 렌더 · 탭 · 헤더/예산 · 섹션 편집 · 모달 공통 */
'use strict';

  /* ============ 렌더 ============ */
  function renderAll() {
    renderHeader();
    renderTabs();
    renderBudget();
    renderShopping();
    renderTools();
    renderInventory();
    renderRecipes();
    renderMeals();
    renderSyncPill();
    renderEditPanel();
    applyTab();
    var hm = $('historyModal'); if (hm && !hm.hidden) renderHistory();
    var sm = $('statsModal'); if (sm && !sm.hidden) renderStats();
  }

  function renderTabs() {
    var el = $('tabBar'); if (!el) return;
    var invN = inStock(state.inventory.items).length;
    var shopN = needsShopping().length;
    var list = [];
    var order = secOrder();
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      list.push({ k: k, t: secTabName(k), n: k === 'inv' ? invN : (k === 'shop' ? shopN : null) });
    }
    list.push({ k: 'all', t: '전체', n: null });
    var h = '';
    for (var j = 0; j < list.length; j++) {
      var on = ui.tab === list[j].k;
      h += '<button class="tab' + (on ? ' on' : '') + '" type="button" data-act="tab-set" data-tab="' + list[j].k + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        list[j].t + (list[j].n != null ? ' <b>' + list[j].n + '</b>' : '') + '</button>';
    }
    el.innerHTML = h;
  }

  function applyTab() {
    var tab = ui.tab || 'all';
    var shopN = needsShopping().length;
    var showShop = tab === 'shop' || (tab === 'all' && (shopN > 0 || ui.watchOpen));
    var els = { inv: $('invSec'), recipe: $('recipeSec'), meal: $('mealSec') };
    for (var k in els) {
      if (!Object.prototype.hasOwnProperty.call(els, k) || !els[k]) continue;
      els[k].hidden = !(tab === 'all' || tab === k);
    }
    var shop = $('shoppingSec'); if (shop) shop.hidden = !showShop;
    var bud = $('budgetCard'); if (bud) bud.hidden = false;
    var order = secOrder();
    var secEls = { shop: $('shoppingSec'), inv: $('invSec'), recipe: $('recipeSec'), meal: $('mealSec') };
    for (var i = 0; i < order.length; i++) {
      var el = secEls[order[i]];
      if (el) el.style.order = String(10 + i);
    }
  }

  function setTab(k) {
    ui.tab = (k === 'inv' || k === 'shop' || k === 'recipe' || k === 'meal') ? k : 'all';
    lsSet(TAB_KEY, ui.tab);
    renderTabs();
    applyTab();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }

  function initTab() {
    var saved = lsGet(TAB_KEY) || '';
    if (saved === 'inv' || saved === 'shop' || saved === 'recipe' || saved === 'meal' || saved === 'all') ui.tab = saved;
    if (!ui.tab) ui.tab = (window.innerWidth && window.innerWidth < 768) ? 'inv' : 'all';
  }

  function renderHeader() {
    var tl = $('todayLine');
    if (tl) tl.textContent = (window.innerWidth && window.innerWidth < 700) ? shortDateLine() : dateLine();
    var cnt = inStock(state.inventory.items).length;
    var shop = needsShopping().length;
    var il = $('invLine');
    if (il) il.textContent = '재고 ' + cnt + '개' + (shop ? ' · 장보기 ' + shop + '개' : '');
    var it = $('invTitle'); if (it) it.textContent = secTitle('inv');
    var eb = $('editBtn');
    if (eb) {
      eb.hidden = !canEdit();
      eb.textContent = ui.editSections ? '✅ 완료' : '✏️ 편집';
      if (ui.editSections) eb.classList.add('on'); else eb.classList.remove('on');
    }
  }

  function renderBudget() {
    var card = $('budgetCard'); if (!card) return;
    var b = effectiveBudget();
    var s = monthSpent();
    var pct = b > 0 ? Math.min(100, Math.round(s.total / b * 100)) : 0;
    var over = s.total > b;
    var remain = b - s.total;
    var html = '' +
      '<div class="bud-head">' +
        '<div class="bud-title">💰 <span class="bud-sub">' + (new Date().getMonth() + 1) + '월</span> 식비</div>' +
        '<div class="bud-fig"><b class="' + (over ? 'over' : '') + '">' + fmtWon(s.total) + '</b>원 <span>/ ' + fmtWon(b) + '원</span></div>' +
        '<div class="bud-btns">' +
          (ui.readOnly ? '' : '<button class="btn sm" type="button" data-act="expense-open">+ 지출</button>') +
          '<button class="btn sm sub" type="button" data-act="settings-open">목표</button>' +
        '</div>' +
      '</div>' +
      '<div class="bud-bar"><div class="bud-fill' + (over ? ' over' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<div class="bud-foot">' +
        '<span>' + (over ? '목표보다 ' + fmtWon(-remain) + '원 초과' : '남은 ' + fmtWon(remain) + '원') + '</span>' +
        '<span class="bud-detail">재료 ' + fmtWon(s.inv) + ' · 직접 ' + fmtWon(s.exp) + '원</span>' +
      '</div>';
    card.innerHTML = html;
  }

  function renderTools() {
    var counts = storageCounts();
    var chips = '';
    for (var i = 0; i < STORAGES.length; i++) {
      var st = STORAGES[i];
      chips += '<button class="chip' + (ui.storages[st.key] ? ' on' : '') + '" type="button" data-act="st-toggle" data-st="' + st.key + '" aria-pressed="' + (ui.storages[st.key] ? 'true' : 'false') + '">' +
        st.emoji + ' ' + st.label + ' <b>' + (counts[st.key] || 0) + '</b></button>';
    }
    var chipsEl = $('storageChips'); if (chipsEl) chipsEl.innerHTML = chips;

    var seg = '';
    var opts = [['in', '보유중'], ['out', '소진됨'], ['all', '전체']];
    for (var j = 0; j < opts.length; j++) {
      seg += '<button type="button" class="' + (ui.status === opts[j][0] ? 'on' : '') + '" data-act="status-set" data-st="' + opts[j][0] + '" aria-pressed="' + (ui.status === opts[j][0] ? 'true' : 'false') + '">' + opts[j][1] + '</button>';
    }
    var segEl = $('statusSeg'); if (segEl) segEl.innerHTML = seg;

    var sel = $('sortSel'); if (sel) sel.value = ui.sort;
    var si = $('searchInput');
    if (si && document.activeElement !== si) si.value = ui.search;
    var tb = $('toolBtns');
    if (tb) tb.innerHTML = ui.readOnly ? '' :
      '<button class="btn sm sub" type="button" data-act="receipt-open">📷 영수증</button>' +
      '<button class="btn sm" type="button" data-act="item-add">+ 식재료</button>';
  }

  function sortedItems(list) {
    var arr = list.slice();
    if (ui.sort === 'old') {
      arr.sort(function (a, b) { return String(a.boughtAt || '9999-12-31').localeCompare(String(b.boughtAt || '9999-12-31')) || (a.createdAt - b.createdAt); });
    } else if (ui.sort === 'name') {
      arr.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    } else if (ui.sort === 'qty') {
      arr.sort(function (a, b) { return num(a.qty) - num(b.qty) || a.name.localeCompare(b.name, 'ko'); });
    } else {
      arr.sort(function (a, b) { return String(b.boughtAt || '').localeCompare(String(a.boughtAt || '')) || (b.createdAt - a.createdAt); });
    }
    return arr;
  }

  function filteredItems() {
    var q = norm(ui.search);
    var list = state.inventory.items.filter(function (it) {
      if (!ui.storages[it.storage]) return false;
      if (ui.status === 'in' && it.status !== 'in') return false;
      if (ui.status === 'out' && it.status !== 'out') return false;
      if (q && norm(it.name).indexOf(q) < 0) return false;
      return true;
    });
    return sortedItems(list);
  }

  /* ---------- 섹션 순서 / 이름 ---------- */
  var SECTIONS = [
    { k: 'shop', name: '🛒 장보기 필요', short: '🛒 장보기' },
    { k: 'inv', name: '🥕 식재료', short: '🥕 식재료' },
    { k: 'recipe', name: '🍳 만들 수 있는 레시피', short: '🍳 레시피' },
    { k: 'meal', name: '🍽 주간 식단', short: '📅 주간 식단' }
  ];
  var SEC_KEYS = ['shop', 'inv', 'recipe', 'meal'];
  function secOrder() {
    var out = [], seen = {}, i, list = state.settings.sectionOrder;
    if (Object.prototype.toString.call(list) === '[object Array]') {
      for (i = 0; i < list.length; i++) {
        var k = String(list[i] || '');
        if (SEC_KEYS.indexOf(k) >= 0 && !seen[k]) { seen[k] = 1; out.push(k); }
      }
    }
    for (i = 0; i < SEC_KEYS.length; i++) if (!seen[SEC_KEYS[i]]) out.push(SEC_KEYS[i]);
    return out;
  }
  function secDefaultName(k) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].k === k) return SECTIONS[i].name;
    return k;
  }
  function secShortName(k) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].k === k) return SECTIONS[i].short;
    return k;
  }
  function secTitle(k) {
    var t = state.settings.sectionTitles && state.settings.sectionTitles[k];
    return (typeof t === 'string' && t.trim()) ? t.trim() : secDefaultName(k);
  }
  function secTabName(k) {
    var t = state.settings.sectionTitles && state.settings.sectionTitles[k];
    return (typeof t === 'string' && t.trim()) ? t.trim() : secShortName(k);
  }
  function moveSection(k, dir) {
    var order = secOrder();
    var i = order.indexOf(k), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    var t = order[i]; order[i] = order[j]; order[j] = t;
    state.settings.sectionOrder = order;
    markDirty('settings');
    renderAll();
  }
  function toggleEdit() {
    if (!canEdit()) { toast('편집 권한이 없어요.', true); return; }
    ui.editSections = !ui.editSections;
    renderAll();
  }
  function renderEditPanel() {
    var p = $('editPanel'); if (!p) return;
    if (!ui.editSections || !canEdit()) {
      ui.editSections = false; p.hidden = true; p.innerHTML = ''; return;
    }
    var order = secOrder(), h = '';
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      h += '<div class="sec-order-row" data-sec="' + k + '">' +
        '<span class="so-num">' + (i + 1) + '</span>' +
        '<input class="so-title" type="text" data-sec="' + k + '" value="' + esc(secTitle(k)) + '" maxlength="20" placeholder="' + esc(secDefaultName(k)) + '" aria-label="섹션 이름">' +
        '<button class="so-btn" type="button" data-act="sec-up" data-sec="' + k + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="위로">▲</button>' +
        '<button class="so-btn" type="button" data-act="sec-down" data-sec="' + k + '"' + (i === order.length - 1 ? ' disabled' : '') + ' aria-label="아래로">▼</button>' +
        '</div>';
    }
    p.hidden = false;
    p.innerHTML = '<div class="ep-head"><h2>✏️ 섹션 편집</h2>' +
      '<button class="btn sm sub" type="button" data-act="edit-toggle">편집 완료</button></div>' +
      '<div class="sec-order">' + h + '</div>' +
      '<p class="note" style="margin-top:8px">▲▼로 순서를 바꾸고 이름을 고치면 위 탭과 ‘전체’ 화면에 바로 반영돼요. 이름을 비우면 기본 이름으로 돌아가요.</p>';
  }

  /* ============ 모달 열기/닫기 ============ */
  /* iOS Safari는 body overflow만으로는 뒷페이지 스크롤을 막지 못해서 body를 fixed로 고정한다. */
  var scrollLock = { on: false, y: 0 };
  var MODAL_SEL = '.sheet:not([hidden]), .hub:not([hidden])';
  function lockBodyScroll() {
    if (scrollLock.on) return;
    scrollLock.y = window.scrollY || window.pageYOffset || 0;
    var b = document.body, h = document.documentElement;
    b.style.position = 'fixed';
    b.style.top = '-' + scrollLock.y + 'px';
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
    b.style.overflow = 'hidden';
    h.style.overflow = 'hidden';
    scrollLock.on = true;
  }
  function unlockBodyScroll() {
    if (!scrollLock.on) return;
    var b = document.body, h = document.documentElement;
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.width = '';
    b.style.overflow = '';
    h.style.overflow = '';
    scrollLock.on = false;
    window.scrollTo(0, scrollLock.y);
  }
  function syncBodyScrollLock() {
    if (document.querySelector(MODAL_SEL)) { if (!scrollLock.on) lockBodyScroll(); }
    else if (scrollLock.on) unlockBodyScroll();
  }
  function showModal(id) {
    var m = $(id);
    if (!m) return;
    var opens = document.querySelectorAll(MODAL_SEL);
    for (var i = 0; i < opens.length; i++) {
      if (opens[i] !== m) opens[i].hidden = true;
    }
    m.hidden = false;
    syncBodyScrollLock();
  }
  function closeModal(id) {
    var m = $(id);
    if (m) m.hidden = true;
    syncBodyScrollLock();
  }

