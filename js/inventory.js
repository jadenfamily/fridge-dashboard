/* 냉장고 파먹기 · 식재료 계산 · 목록 렌더 · 식재료 폼 */
'use strict';

  /* ============ 식재료 계산 ============ */
  function inStock(items) { return items.filter(function (i) { return i.status === 'in' && num(i.qty) > 0; }); }
  function needsShopping() {
    return state.inventory.items.filter(function (it) {
      if (!it.staple || it.alert === false) return false;
      if (it.status !== 'in') return true;
      return isPctUnit(it.unit) ? num(it.qty) <= pctMin(it) : num(it.qty) < (num(it.minQty) || 1);
    });
  }
  function watchItems() {
    return state.inventory.items.filter(function (it) { return !!it.staple; });
  }
  function findItem(id) {
    for (var i = 0; i < state.inventory.items.length; i++) if (state.inventory.items[i].id === id) return state.inventory.items[i];
    return null;
  }
  /* 같은 이름의 '소진된' 항목이 있으면 새로 만들지 않고 재입고로 합쳐요 (장보기 알림이 바로 풀리도록) */
  function upsertItem(data) {
    var n = norm(data.name);
    var hit = null;
    for (var i = 0; i < state.inventory.items.length; i++) {
      var it = state.inventory.items[i];
      if (it.status === 'out' && norm(it.name) === n) { hit = it; break; }
    }
    if (hit) {
      if (data.unit) hit.unit = data.unit;
      hit.qty = qtyClamp(Math.max(0, num(hit.qty)) + Math.max(0, num(data.qty)), hit.unit);
      hit.status = hit.qty > 0 ? 'in' : 'out';
      if (isYmd(data.boughtAt)) hit.boughtAt = data.boughtAt;
      if (num(data.price) > 0) hit.price = Math.round(num(data.price));
      if (data.staple) hit.staple = true;
      hit.updatedAt = Date.now();
      return hit;
    }
    var added = makeItem(data);
    state.inventory.items.push(added);
    return added;
  }
  function monthSpent() {
    var m = todayStr().slice(0, 7), inv = 0, exp = 0, i;
    for (i = 0; i < state.inventory.items.length; i++) {
      var it = state.inventory.items[i];
      if (it.price > 0 && String(it.boughtAt).slice(0, 7) === m) inv += it.price;
    }
    for (i = 0; i < state.meals.expenses.length; i++) {
      var e = state.meals.expenses[i];
      if (String(e.date).slice(0, 7) === m) exp += num(e.amount);
    }
    return { inv: inv, exp: exp, total: inv + exp };
  }
  function storageCounts() {
    var c = { frozen: 0, fridge: 0, room: 0, sauce: 0 };
    for (var i = 0; i < state.inventory.items.length; i++) {
      var it = state.inventory.items[i];
      if (it.status === 'in' && num(it.qty) > 0) c[it.storage] = (c[it.storage] || 0) + 1;
    }
    return c;
  }

  function renderInventory() {
    var list = filteredItems();
    var note = $('invNote');
    if (note) note.textContent = list.length + '개 표시 · ' + (ui.sort === 'new' ? '최신순' : ui.sort === 'old' ? '오래된순' : ui.sort === 'name' ? '이름순' : '수량 적은 순');
    var box = $('invList'); if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty">조건에 맞는 식재료가 없어요.<br><button class="link-btn" type="button" data-act="filter-reset">필터 초기화</button></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var pct = isPctUnit(it.unit) ? pctClamp(it.qty) : -1;
      var pctLow = pct >= 0 && it.status === 'in' && pct <= lowPct();
      var meta = [];
      meta.push(it.boughtAt ? (it.boughtAt.slice(5).replace('-', '/') + ' (' + daysAgo(it.boughtAt) + ')') : '구매일 없음');
      if (pct >= 0) meta.push('남은 양 ' + pct + '%');
      if (it.price > 0) meta.push(fmtWon(it.price) + '원');
      if (it.staple) meta.push('최소 ' + fmtQty(it.minQty) + it.unit);
      if (it.note) meta.push(it.note);
      var qtyHtml;
      if (ui.readOnly) {
        qtyHtml = '<span class="qv" style="padding:0 5px">' + fmtQty(it.qty) + esc(it.unit) + '</span>';
      } else {
        qtyHtml = '<button class="qbtn" type="button" data-act="qty-down" data-id="' + esc(it.id) + '" aria-label="수량 줄이기">−</button>' +
          '<span class="qv">' + fmtQty(it.qty) + esc(it.unit) + '</span>' +
          '<button class="qbtn" type="button" data-act="qty-up" data-id="' + esc(it.id) + '" aria-label="수량 늘리기">+</button>';
      }
      html += '<div class="item' + (it.status === 'out' ? ' out' : '') + (pct >= 0 ? ' pct-item' : '') + (pctLow ? ' pct-low' : '') + '" data-id="' + esc(it.id) + '" title="' + esc(meta.join(' · ')) + '">' +
        '<div class="it-l1">' +
          '<span class="st-badge ' + ST_CLS[it.storage] + '">' + ST_LABEL[it.storage] + '</span>' +
          '<b class="it-name">' + esc(it.name) + '</b>' +
          (it.staple ? '<span class="star" title="알림 재료">★</span>' : '') +
          (it.status === 'out' ? '<span class="out-pill">소진</span>' : '') +
          '<span class="it-date">' + esc(it.boughtAt ? it.boughtAt.slice(5).replace('-', '/') : '') + '</span>' +
          (it.price > 0 ? '<span class="it-price">' + fmtWon(it.price) + '원</span>' : '') +
        '</div>' +
        (pct >= 0 ? '<div class="it-pct">' +
          '<div class="pct-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="남은 양 ' + pct + '%"><i style="width:' + pct + '%"></i></div>' +
          (pctLow ? '<span class="pct-tip">거의 다 씀</span>' : '') +
        '</div>' : '') +
        '<div class="it-l2">' +
          '<div class="it-qty' + (pct >= 0 ? ' pctq' : '') + '">' + qtyHtml + '</div>' +
          (ui.readOnly
            ? '<span class="it-date" style="margin-left:auto">' + esc(it.staple ? '최소 ' + fmtQty(it.minQty) + it.unit : '') + '</span>'
            : '<div class="it-acts">' +
                '<button class="act-pill ' + (it.status === 'in' ? 'use' : 'back') + '" type="button" data-act="' + (it.status === 'in' ? 'item-out' : 'item-restock') + '" data-id="' + esc(it.id) + '">' + (it.status === 'in' ? '소진' : '되살리기') + '</button>' +
                '<button class="act-pill" type="button" data-act="item-edit" data-id="' + esc(it.id) + '">수정</button>' +
                '<button class="act-pill" type="button" data-act="item-del" data-id="' + esc(it.id) + '">삭제</button>' +
                '<button class="act-pill' + (it.staple ? ' on' : '') + '" type="button" data-act="item-staple" data-id="' + esc(it.id) + '" aria-label="알림 재료로 표시" title="알림 재료">★</button>' +
              '</div>') +
        '</div>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  /* ---------- 식재료 폼 ---------- */
  var UNIT_PRESETS = ['개', '봉', '팩', '통', '병', 'g', 'kg', 'ml', 'L', '%'];
  function openItemModal(id) {
    ui.itemEdit = id || '';
    var it = id ? findItem(id) : null;
    $('itemTitle').textContent = it ? '식재료 수정' : '식재료 추가';
    var stOpts = '';
    for (var i = 0; i < STORAGES.length; i++) {
      stOpts += '<option value="' + STORAGES[i].key + '"' + ((it ? it.storage : 'fridge') === STORAGES[i].key ? ' selected' : '') + '>' + STORAGES[i].emoji + ' ' + STORAGES[i].label + '</option>';
    }
    var unit = it ? String(it.unit || '개') : '개';
    var uChips = '';
    for (var u = 0; u < UNIT_PRESETS.length; u++) {
      var uOn = UNIT_PRESETS[u] === unit;
      uChips += '<button class="uchip' + (uOn ? ' on' : '') + '" type="button" data-act="unit-pick" data-unit="' + esc(UNIT_PRESETS[u]) + '" aria-pressed="' + (uOn ? 'true' : 'false') + '">' + esc(UNIT_PRESETS[u]) + '</button>';
    }
    var pctPresets = '';
    var PCTS = [100, 75, 50, 25];
    for (var p = 0; p < PCTS.length; p++) {
      pctPresets += '<button type="button" data-act="pct-pick" data-pct="' + PCTS[p] + '">' + PCTS[p] + '%</button>';
    }
    $('itemBody').innerHTML = '<div class="form">' +
      '<label>이름<input id="itName" maxlength="40" placeholder="예: 두부" value="' + esc(it ? it.name : '') + '"></label>' +
      '<div class="frow">' +
        '<label><span id="itQtyLbl">' + (isPctUnit(unit) ? '남은 양 (%)' : '수량') + '</span><input id="itQty" type="number" min="0" step="' + (isPctUnit(unit) ? '25' : '0.5') + '"' + (isPctUnit(unit) ? ' max="100" inputmode="numeric"' : ' inputmode="decimal"') + ' value="' + esc(it ? fmtQty(it.qty) : (isPctUnit(unit) ? '100' : '1')) + '"></label>' +
        '<label>단위<input id="itUnit" maxlength="6" list="unitList" autocomplete="off" value="' + esc(unit) + '"></label>' +
      '</div>' +
      '<datalist id="unitList">' +
        '<option value="개"></option><option value="봉"></option><option value="팩"></option><option value="통"></option>' +
        '<option value="병"></option><option value="g"></option><option value="kg"></option><option value="ml"></option>' +
        '<option value="L"></option><option value="모"></option><option value="대"></option><option value="캔"></option>' +
        '<option value="조각"></option><option value="인분"></option><option value="%"></option>' +
      '</datalist>' +
      '<div class="uchips" id="itUnitChips" role="group" aria-label="단위 빠른 선택">' + uChips + '</div>' +
      '<div class="pct-presets" id="itPctPresets"' + (isPctUnit(unit) ? '' : ' hidden') + '><span>남은 양</span>' + pctPresets + '</div>' +
      '<div class="frow">' +
        '<label>보관 구분<select id="itStorage">' + stOpts + '</select></label>' +
        '<label>구매일<input id="itDate" type="date" value="' + esc(it && it.boughtAt ? it.boughtAt : todayStr()) + '"></label>' +
      '</div>' +
      '<label>가격 (선택, 원)<input id="itPrice" type="number" min="0" step="100" inputmode="numeric" placeholder="가계부에 이어져요" value="' + esc(it && it.price ? it.price : '') + '"></label>' +
      '<label class="chk"><input type="checkbox" id="itStaple"' + (it && it.staple ? ' checked' : '') + '> 자주 쓰는 필수 재료(단골)로 표시</label>' +
      '<label><span id="itMinLbl">' + (isPctUnit(unit) ? '단골 기준 남은 양 (%)' : '단골 최소 수량') + '</span><input id="itMin" type="number" min="1"' + (isPctUnit(unit) ? ' max="100" step="5"' : ' step="1"') + ' inputmode="numeric" value="' + esc(it ? fmtQty(it.minQty) : '1') + '"></label>' +
      '<label>메모 (선택)<input id="itNote" maxlength="60" placeholder="예: 유통기한 11/30" value="' + esc(it ? it.note : '') + '"></label>' +
      '<p class="form-msg" id="itemMsg"></p>' +
      '<button class="btn wide" type="button" data-act="item-save">저장</button>' +
      '</div>';
    showModal('itemModal');
    var uInput = $('itUnit');
    if (uInput) uInput._pct = isPctUnit(unit);
    syncPercentUi();
    try { $('itName').focus(); } catch (e) { /* 무시 */ }
  }

  /* 단위가 %이면 수량 입력을 0~100 정수·25% 스텝으로 바꾸고 남은 양 프리셋을 보여준다. */
  function syncPctPresets() {
    var pres = $('itPctPresets'); if (!pres) return;
    var q = $('itQty');
    var val = pctClamp(q ? q.value : 0);
    var btns = pres.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = (num(btns[i].getAttribute('data-pct')) === val) ? 'on' : '';
    }
  }
  function syncPercentUi() {
    var uEl = $('itUnit'); if (!uEl) return;
    var pct = isPctUnit(uEl.value);
    var wasPct = uEl._pct === true;
    uEl._pct = pct;
    var chips = $('itUnitChips');
    if (chips) {
      var cbs = chips.querySelectorAll('.uchip');
      for (var i = 0; i < cbs.length; i++) {
        var on = String(cbs[i].getAttribute('data-unit')) === String(uEl.value).trim();
        cbs[i].className = 'uchip' + (on ? ' on' : '');
        cbs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    var q = $('itQty'), lbl = $('itQtyLbl'), pres = $('itPctPresets'), mn = $('itMin');
    if (lbl) lbl.textContent = pct ? '남은 양 (%)' : '수량';
    var minLbl = $('itMinLbl');
    if (minLbl) minLbl.textContent = pct ? '단골 기준 남은 양 (%)' : '단골 최소 수량';
    if (q) {
      if (pct) { q.setAttribute('max', '100'); q.max = '100'; } else q.removeAttribute('max');
      q.setAttribute('step', pct ? '25' : '0.5');
      q.setAttribute('inputmode', pct ? 'numeric' : 'decimal');
      if (pct) { if (!wasPct) q.value = '100'; q.value = String(pctClamp(q.value)); }
    }
    if (pres) pres.hidden = !pct;
    if (mn) {
      if (pct) { mn.setAttribute('max', '100'); mn.max = '100'; } else mn.removeAttribute('max');
      mn.setAttribute('step', pct ? '5' : '1');
      var mv = num(mn.value);
      if (pct) {
        if (!(mv >= 1 && mv <= 100)) mn.value = String(pctMin({ minQty: mv }));
        else if (mv === 1) mn.value = '25';
      } else if (!(mv >= 1)) mn.value = '1';
    }
    if (pct) syncPctPresets();
  }

  function saveItem() {
    var name = fieldVal('itName').trim();
    var msg = $('itemMsg');
    if (!name) { if (msg) msg.textContent = '이름을 넣어 주세요.'; return; }
    var unitRaw = fieldVal('itUnit').trim() || '개';
    var unit = isPctUnit(unitRaw) ? '%' : unitRaw.slice(0, 6);
    var qtyRaw = fieldVal('itQty').trim();
    if (isPctUnit(unit) && !qtyRaw) { if (msg) msg.textContent = '남은 양을 0~100 사이로 넣어 주세요.'; return; }
    var qty = isPctUnit(unit) ? pctClamp(qtyRaw) : Math.max(0, num(qtyRaw));
    var minQty = isPctUnit(unit) ? Math.max(1, pctMin({ minQty: fieldVal('itMin') })) : Math.max(1, num(fieldVal('itMin')) || 1);
    var data = {
      name: name,
      qty: qty,
      unit: unit,
      storage: normStorage(fieldVal('itStorage')),
      boughtAt: fieldVal('itDate'),
      price: num(fieldVal('itPrice')),
      staple: !!($('itStaple') && $('itStaple').checked),
      minQty: minQty,
      note: fieldVal('itNote')
    };
    var it = ui.itemEdit ? findItem(ui.itemEdit) : null;
    if (it) {
      it.name = data.name; it.qty = data.qty; it.unit = data.unit; it.storage = data.storage;
      it.boughtAt = isYmd(data.boughtAt) ? data.boughtAt : '';
      it.price = Math.max(0, Math.round(data.price));
      it.staple = data.staple; it.minQty = data.minQty;
      it.note = data.note; it.updatedAt = Date.now();
      it.status = it.qty > 0 ? 'in' : 'out';
    } else {
      var added = upsertItem(data);
      if (num(data.qty) > 0) {
        if (isYmd(data.boughtAt) && data.boughtAt !== todayStr()) touchDate(data.boughtAt);
        else logDaily('bought', added, data.qty);
      }
    }
    markDirty('inventory');
    closeModal('itemModal');
    renderAll();
    toast(it ? '✏️ ' + it.name + ' 수정했어요' : '🥕 ' + data.name + ' 추가했어요');
  }

