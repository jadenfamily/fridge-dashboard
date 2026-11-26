/* 냉장고 파먹기 · 장보기 목록 · 알림 재료 관리 */
'use strict';

  function renderShopping() {
    var sec = $('shoppingSec'); if (!sec) return;
    var list = needsShopping().slice(0);
    var watches = watchItems().slice(0);
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    var rows = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var why = it.status !== 'in' ? '0' + it.unit + ' · 다 떨어졌어요' : fmtQty(it.qty) + it.unit + ' 남음 · 최소 ' + fmtQty(it.minQty) + it.unit;
      rows += '<div class="shop-row" data-id="' + esc(it.id) + '">' +
        '<span class="st-badge ' + ST_CLS[it.storage] + '">' + ST_LABEL[it.storage] + '</span>' +
        '<div class="shop-main"><b>' + esc(it.name) + '</b><span id="why-' + esc(it.id) + '">' + esc(why) + '</span></div>' +
        (ui.readOnly ? '' :
          '<button class="act-pill" type="button" data-act="watch-edit" data-id="' + esc(it.id) + '" aria-label="알림 설정 수정">설정</button>' +
          '<button class="btn sm" type="button" data-act="item-restock" data-id="' + esc(it.id) + '">🛒 완료</button>') +
        '</div>';
    }
    var more = list.length > 9 ? '<button class="shop-more" type="button" data-act="shop-toggle">' + (ui.shopOpen ? '접기' : (list.length - 9) + '개 더 보기') + '</button>' : '';
    var manage = '';
    if (ui.watchOpen) {
      var wrows = '';
      var sorted = watches.slice(0).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
      for (var j = 0; j < sorted.length; j++) {
        var w = sorted[j];
        var on = w.alert !== false;
        var wstate = (on ? '' : '알림 꺼짐 · ') + (w.status === 'in' ? '재고 ' + fmtQty(w.qty) + w.unit : '0' + w.unit) + ' · 최소 ' + fmtQty(w.minQty) + w.unit;
        wrows += '<div class="watch-row' + (on ? '' : ' off') + '" data-id="' + esc(w.id) + '">' +
          '<span class="st-badge ' + ST_CLS[w.storage] + '">' + ST_LABEL[w.storage] + '</span>' +
          '<div class="watch-main"><b>' + esc(w.name) + ' <span class="star">★</span></b><span>' + esc(wstate) + '</span></div>' +
          (ui.readOnly ? '' :
            '<button class="act-pill' + (on ? ' on' : '') + '" type="button" data-act="watch-alert" data-id="' + esc(w.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + (on ? '알림 ON' : '알림 OFF') + '</button>' +
            '<button class="act-pill" type="button" data-act="watch-edit" data-id="' + esc(w.id) + '">수정</button>' +
            '<button class="act-pill" type="button" data-act="watch-del" data-id="' + esc(w.id) + '">빼기</button>') +
          '</div>';
      }
      manage = '<div class="watch-list">' +
        '<div class="watch-cap">🔔 알림 목록 관리 · ' + watches.length + '개 (재고가 있어도 여기서 켜고 끌 수 있어요)</div>' +
        (wrows || '<p class="note">아직 알림 재료가 없어요. [+ 알림 재료]로 추가해 보세요.</p>') +
        '</div>';
    }
    var body;
    if (list.length) {
      body = '<div class="shop-list' + (ui.shopOpen ? ' open' : '') + '">' + rows + '</div>' + more;
    } else {
      body = '<div class="shop-empty">' + (watches.length
        ? '지금은 알림 재료가 모두 채워져 있어요 🌿 기준 이하로 떨어지면 바로 여기에 올라와요.'
        : '알림 재료를 추가하면 재고가 기준 이하로 떨어질 때 여기에 올라와요.') + '</div>';
    }
    sec.innerHTML = '<div class="card-head"><h2>' + esc(secTitle('shop')) + ' <span class="count">' + list.length + '</span></h2>' +
      '<div class="shop-head-btns">' +
        (ui.readOnly ? '' :
        '<button class="btn xs sub" type="button" data-act="watch-add">+ 알림 재료</button>' +
        '<button class="btn xs ghost" type="button" data-act="watch-toggle" aria-pressed="' + (ui.watchOpen ? 'true' : 'false') + '">' + (ui.watchOpen ? '관리 닫기' : '목록 관리' + (watches.length ? ' ' + watches.length : '')) + '</button>') +
      '</div></div>' +
      body + manage;
  }

  /* ---------- 알림 재료 관리 ---------- */
  function openWatchModal(id) {
    if (ui.readOnly) return;
    ui.watchEdit = id || '';
    var it = id ? findItem(id) : null;
    $('watchTitle').textContent = it ? '🔔 알림 재료 수정' : '🔔 알림 재료 추가';
    var stOpts = '';
    for (var i = 0; i < STORAGES.length; i++) {
      stOpts += '<option value="' + STORAGES[i].key + '"' + ((it ? it.storage : 'fridge') === STORAGES[i].key ? ' selected' : '') + '>' + STORAGES[i].emoji + ' ' + STORAGES[i].label + '</option>';
    }
    var names = [], seen = {};
    for (i = 0; i < state.inventory.items.length; i++) {
      var nm = state.inventory.items[i].name;
      if (nm && !seen[norm(nm)]) { seen[norm(nm)] = 1; names.push(nm); }
    }
    names.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    var opts = '';
    for (i = 0; i < names.length && i < 200; i++) opts += '<option value="' + esc(names[i]) + '"></option>';
    var on = it ? it.alert !== false : true;
    $('watchBody').innerHTML = '<div class="form">' +
      '<label>재료 이름<input id="wName" list="wNames" maxlength="40" placeholder="예: 우유" value="' + esc(it ? it.name : '') + '"></label>' +
      '<datalist id="wNames">' + opts + '</datalist>' +
      '<div class="frow">' +
        '<label>보관 구분<select id="wStorage">' + stOpts + '</select></label>' +
        '<label>' + (it && isPctUnit(it.unit) ? '최소 남은 양 (%)' : '최소 수량') + '<input id="wMin" type="number" min="1"' + (it && isPctUnit(it.unit) ? ' max="100" step="5"' : ' step="1"') + ' inputmode="numeric" value="' + esc(it ? fmtQty(it.minQty) : '1') + '"></label>' +
      '</div>' +
      '<label class="chk"><input type="checkbox" id="wAlert"' + (on ? ' checked' : '') + '> 알림 켜기 (기준 이하로 떨어지면 장보기 목록에 올려요)</label>' +
      '<p class="form-msg" id="watchMsg"></p>' +
      '<button class="btn wide" type="button" data-act="watch-save">저장</button>' +
      (it ? '<button class="btn wide ghost" type="button" data-act="watch-del" data-id="' + esc(it.id) + '">알림 목록에서 빼기</button>' : '') +
      '<p class="note">같은 이름의 식재료가 이미 있으면 그 재고에 알림만 붙여요. 알림을 빼도 식재료는 그대로 남아요.</p>' +
      '</div>';
    showModal('watchModal');
    try { $('wName').focus(); } catch (e) { /* 무시 */ }
  }
  function saveWatch() {
    var name = fieldVal('wName').trim();
    if (!name) { var mm = $('watchMsg'); if (mm) mm.textContent = '재료 이름을 넣어 주세요.'; return; }
    var wEdit = ui.watchEdit ? findItem(ui.watchEdit) : null;
    var minQty = (wEdit && isPctUnit(wEdit.unit))
      ? Math.max(1, pctMin({ minQty: fieldVal('wMin') }))
      : Math.max(1, num(fieldVal('wMin')) || 1);
    var storage = normStorage(fieldVal('wStorage'));
    var on = $('wAlert') ? !!$('wAlert').checked : true;
    var it = ui.watchEdit ? findItem(ui.watchEdit) : null;
    if (!it) {
      var n = norm(name);
      for (var i = 0; i < state.inventory.items.length; i++) {
        if (norm(state.inventory.items[i].name) === n) { it = state.inventory.items[i]; break; }
      }
    }
    if (it) {
      it.name = name.slice(0, 40);
      it.storage = storage;
      it.minQty = minQty;
      it.staple = true;
      it.alert = on;
      it.updatedAt = Date.now();
    } else {
      it = makeItem({ name: name, qty: 0, unit: '개', storage: storage, staple: true, alert: on, minQty: minQty, status: 'out' });
      state.inventory.items.push(it);
    }
    markDirty('inventory');
    closeModal('watchModal');
    renderAll();
    toast('🔔 ' + it.name + ' 알림을 저장했어요');
  }
  function deleteWatch(id) {
    var it = findItem(id); if (!it) return;
    if (!window.confirm('“' + it.name + '” 알림을 목록에서 뺄까요?\n식재료 재고는 그대로 남아요.')) return;
    it.staple = false;
    it.alert = true;
    it.updatedAt = Date.now();
    markDirty('inventory');
    closeModal('watchModal');
    renderAll();
    toast('알림에서 뺐어요 · ' + it.name);
  }
  function toggleWatchAlert(id) {
    var it = findItem(id); if (!it) return;
    it.alert = it.alert === false;
    it.updatedAt = Date.now();
    markDirty('inventory');
    renderAll();
    toast((it.alert !== false ? '🔔 ' : '🔕 ') + it.name + ' 알림 ' + (it.alert !== false ? '켬' : '끔'));
  }

