/* 냉장고 파먹기 · 클릭/입력/변경 이벤트 위임 · 온라인/주기 동기화 */
'use strict';

  /* ============ 이벤트 ============ */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id') || '';

    if (act === 'modal-close') { closeModal(el.getAttribute('data-m') || ''); return; }
    if (act === 'tab-set') { setTab(el.getAttribute('data-tab') || 'all'); return; }
    if (act === 'edit-toggle') { toggleEdit(); return; }
    if (act === 'sec-up') { moveSection(el.getAttribute('data-sec'), -1); return; }
    if (act === 'sec-down') { moveSection(el.getAttribute('data-sec'), 1); return; }
    if (act === 'history-open') { openHistory(); return; }
    if (act === 'stats-open') { openStats(); return; }
    if (act === 'hist-prev') { histShift(-1); return; }
    if (act === 'hist-next') { histShift(1); return; }
    if (act === 'hist-day') { ui.histSel = el.getAttribute('data-key') || ui.histSel; renderHistory(); return; }
    if (act === 'history-backup') {
      downloadJson('fridge-backup-' + todayStr() + '.json', { inventory: state.inventory, meals: state.meals, settings: state.settings, daily: state.daily });
      return;
    }
    if (act === 'watch-add') { openWatchModal(''); return; }
    if (act === 'watch-edit') { openWatchModal(id); return; }
    if (act === 'watch-save') { saveWatch(); return; }
    if (act === 'watch-del') { deleteWatch(id); return; }
    if (act === 'watch-alert') { toggleWatchAlert(id); return; }
    if (act === 'watch-toggle') { ui.watchOpen = !ui.watchOpen; renderShopping(); applyTab(); return; }
    if (act === 'recipe-link') { openLinkModal(el.getAttribute('data-kind') || 'b', el.getAttribute('data-title') || ''); return; }
    if (act === 'link-save') { saveLinks(); return; }
    if (act === 'link-clear') {
      if (state.settings.links) delete state.settings.links[ui.linkKey];
      markDirty('settings'); closeModal('linkModal'); renderRecipes(); toast('링크를 지웠어요');
      return;
    }
    if (act === 'gate-connect') {
      var f = $('gateForm');
      if (f) { f.hidden = !f.hidden; if (!f.hidden) { try { $('gToken').focus(); } catch (er) { /* 무시 */ } } }
      return;
    }

    if (act === 'settings-open') { ui.keyMsg = ''; renderSettings(); showModal('settingsModal'); aiSyncShared(); return; }
    if (act === 'item-add') { openItemModal(''); return; }
    if (act === 'item-save') { saveItem(); return; }
    if (act === 'unit-pick') {
      var uEl = $('itUnit'); if (!uEl) return;
      var wasPct = isPctUnit(uEl.value);
      var nu = el.getAttribute('data-unit') || '';
      uEl.value = nu;
      var qEl = $('itQty');
      if (qEl && isPctUnit(nu) && !wasPct) qEl.value = '100';
      syncPercentUi();
      return;
    }
    if (act === 'pct-pick') {
      var pEl = $('itQty'); if (!pEl) return;
      pEl.value = String(pctClamp(el.getAttribute('data-pct')));
      syncPctPresets();
      return;
    }
    if (act === 'item-edit') { openItemModal(id); return; }
    if (act === 'item-del') {
      var it = findItem(id); if (!it) return;
      if (!window.confirm('"' + it.name + '" 를 목록에서 지울까요?')) return;
      state.inventory.items = state.inventory.items.filter(function (x) { return x.id !== id; });
      markDirty('inventory'); renderAll(); toast('🗑️ ' + it.name + ' 삭제했어요');
      return;
    }
    if (act === 'qty-up' || act === 'qty-down') {
      var q = findItem(id); if (!q) return;
      var before = num(q.qty);
      var step = qtyStep(q.unit);
      q.qty = qtyClamp(before + (act === 'qty-up' ? step : -step), q.unit);
      q.status = q.qty > 0 ? 'in' : 'out';
      q.updatedAt = Date.now();
      if (act === 'qty-down' && before > q.qty) logDaily('consumed', q, before - q.qty);
      markDirty('inventory'); renderAll();
      return;
    }
    if (act === 'item-out' || act === 'item-restock') {
      var o = findItem(id); if (!o) return;
      if (act === 'item-out') {
        logDaily('consumed', o, num(o.qty) || 1);
        o.qty = 0; o.status = 'out'; o.updatedAt = Date.now();
        markDirty('inventory'); renderAll(); toast('다 먹었어요 · ' + o.name);
      } else {
        o.qty = isPctUnit(o.unit) ? 100 : Math.max(1, num(o.minQty) || 1);
        o.status = 'in';
        o.boughtAt = todayStr();
        o.updatedAt = Date.now();
        logDaily('bought', o, num(o.qty));
        markDirty('inventory'); renderAll(); toast('🛒 ' + o.name + ' 재입고 완료!');
      }
      return;
    }
    if (act === 'item-staple') {
      var st = findItem(id); if (!st) return;
      st.staple = !st.staple;
      if (st.staple) st.alert = true;
      if (st.staple && !st.minQty) st.minQty = isPctUnit(st.unit) ? 25 : 1;
      st.updatedAt = Date.now();
      markDirty('inventory'); renderAll();
      toast(st.staple ? '★ ' + st.name + ' 알림 재료로 표시했어요' : st.name + ' 알림 해제');
      return;
    }
    if (act === 'st-toggle') {
      var key = el.getAttribute('data-st');
      ui.storages[key] = !ui.storages[key];
      renderTools(); renderInventory();
      return;
    }
    if (act === 'shop-toggle') { ui.shopOpen = !ui.shopOpen; renderShopping(); return; }
    if (act === 'status-set') {
      ui.status = el.getAttribute('data-st');
      renderTools(); renderInventory();
      return;
    }
    if (act === 'filter-reset') {
      ui.search = '';
      ui.storages = { frozen: true, fridge: true, room: true, sauce: true };
      ui.status = 'in'; ui.sort = 'new';
      renderTools(); renderInventory();
      return;
    }
    if (act === 'recipe-toggle') { ui.recipeAll = !ui.recipeAll; renderRecipes(); return; }
    if (act === 'recipe-cat') {
      var cat = el.getAttribute('data-cat') || 'all';
      ui.recipeCat = (cat === 'all' || CATEGORIES.indexOf(cat) >= 0) ? cat : 'all';
      ui.recipeAll = false;
      renderRecipes();
      return;
    }
    if (act === 'recipe-refresh') { refreshAI(); return; }
    if (act === 'recipe-expand') {
      /* 카드 안의 링크·버튼을 누를 때는 접기/펼치기를 하지 않아요. */
      if (e.target && e.target.closest && e.target.closest('a,button')) return;
      toggleRecipeCard(el);
      return;
    }

    if (act === 'receipt-open') { openReceipt(); return; }
    if (act === 'receipt-pick') {
      var rf = $('receiptFile');
      if (rf) rf.click();
      return;
    }
    if (act === 'receipt-add') { addReviewed(); return; }

    if (act === 'key-save') {
      var kv = fieldVal('keyInput').trim();
      if (!kv) { ui.keyMsg = 'err:키를 입력해 주세요.'; renderSettings(); return; }
      if (!canEdit()) { ui.keyMsg = 'err:보기 전용 계정은 키를 바꿀 수 없어요.'; renderSettings(); return; }
      lsSet(KEY_KEY, kv);
      lsDel(KEY_SHARED_KEY);
      var km0 = aiKeyMap(); km0.gemini = kv; aiSetKeyMap(km0);
      aiSetState({ source: 'local', updatedAt: nowIso(), at: Date.now(), note: '' });
      renderRecipes();
      if (!cloud.conn || !cloud.me) {
        ui.keyMsg = 'ok:키를 이 브라우저에 저장했어요.';
        renderSettings();
        return;
      }
      ui.keyMsg = 'ok:키를 저장하고 가족과 공유하는 중…';
      renderSettings();
      aiPush(kv).then(function (r) {
        if (r.ok) {
          lsSet(KEY_SHARED_KEY, kv);
          aiSetState({ source: 'shared', updatedAt: r.updatedAt, at: Date.now(), note: '' });
          aiSetKeyMap(keysFromAiConfig(r.obj));
          ui.keyMsg = 'ok:저장했어요. 가족 모두 이 키를 함께 써요.';
        } else {
          ui.keyMsg = 'err:이 기기에는 저장했지만 가족 공유는 실패했어요 — ' + (r.error || '') ;
        }
        renderSettings();
      });
      return;
    }
    if (act === 'key-share') {
      var shk = String(lsGet(KEY_KEY) || '').trim();
      if (!shk) { ui.keyMsg = 'err:먼저 키를 저장해 주세요.'; renderSettings(); return; }
      if (!canEdit()) { ui.keyMsg = 'err:보기 전용 계정은 키를 공유할 수 없어요.'; renderSettings(); return; }
      ui.keyMsg = 'ok:가족과 공유하는 중…';
      renderSettings();
      aiPush(shk).then(function (r2) {
        if (r2.ok) {
          lsSet(KEY_SHARED_KEY, shk);
          aiSetState({ source: 'shared', updatedAt: r2.updatedAt, at: Date.now(), note: '' });
          aiSetKeyMap(keysFromAiConfig(r2.obj));
          ui.keyMsg = 'ok:가족 공유 키로 올렸어요. 다른 기기에서도 자동으로 써요.';
        } else {
          ui.keyMsg = 'err:공유하지 못했어요 — ' + (r2.error || '');
        }
        renderSettings();
      });
      return;
    }
    if (act === 'key-clear') {
      var wasShared = keyOrigin() === 'shared';
      if (wasShared && canEdit() && cloud.conn && cloud.me) {
        if (!window.confirm('가족 모두가 함께 쓰는 공유 키를 지울까요?  다른 기기에서도 이 키를 쓸 수 없게 돼요.')) return;
      }
      lsDel(KEY_KEY);
      lsDel(KEY_SHARED_KEY);
      var km1 = aiKeyMap(); km1.gemini = ''; aiSetKeyMap(km1);
      aiSetState({ source: 'none', updatedAt: nowIso(), at: Date.now(), note: '' });
      ui.keyMsg = 'ok:키를 지웠어요.';
      renderSettings(); renderRecipes();
      if (wasShared && canEdit() && cloud.conn && cloud.me) {
        aiClearRemote().then(function (rc) {
          if (!rc.ok) { ui.keyMsg = 'err:이 기기에서는 지웠지만 가족 공유 키 삭제는 실패했어요'; renderSettings(); }
        });
      }
      return;
    }
    if (act === 'key-check') { checkKey(); return; }
    if (act === 'ai-pick') {
      var pid = el.getAttribute('data-pid') || '';
      var pv = aiProviderById(pid);
      if (!pv) return;
      if (!aiKeyOf(pid)) {
        toast(pv.label + ' 키가 아직 없어요. 가족 AI 사무실 설정에서 키를 넣어 주세요.', true);
        return;
      }
      aiSetPref(pid);
      renderSettings();
      toast('🤖 ' + pv.label + '를 먼저 써요' + (pv.vision.length ? '' : ' (사진 인식은 다른 AI가 맡아요)'));
      return;
    }
    if (act === 'budget-save') {
      if (ui.readOnly) { toast('보기 전용 계정이에요.', true); return; }
      var b = Math.max(0, Math.round(num(fieldVal('budgetInput'))));
      var bd = Math.max(0, Math.round(num(fieldVal('budgetDefaultInput'))));
      if (!b) { toast('목표 금액을 넣어 주세요.', true); return; }
      if (bd < 1000) { toast('기본 목표는 1,000원 이상으로 넣어 주세요.', true); return; }
      state.meals.budget = b;
      state.settings.budgetDefault = bd;
      markDirty('meals'); markDirty('settings');
      renderAll(); renderSettings();
      toast('💰 월 식비 목표를 ' + fmtWon(b) + '원으로 저장했어요');
      return;
    }
    if (act === 'budget-reset') {
      if (ui.readOnly) { toast('보기 전용 계정이에요.', true); return; }
      state.meals.budget = BUDGET_DEFAULT;
      state.settings.budgetDefault = BUDGET_DEFAULT;
      markDirty('meals'); markDirty('settings');
      renderAll(); renderSettings();
      toast('💰 월 식비 목표를 기본값 ' + fmtWon(BUDGET_DEFAULT) + '원으로 되돌렸어요');
      return;
    }
    if (act === 'thr-save') {
      if (ui.readOnly) { toast('보기 전용 계정이에요.', true); return; }
      var lp = Math.round(num(fieldVal('lowPctInput')));
      var pm = Math.round(num(fieldVal('pctMinInput')));
      var mq = Math.round(num(fieldVal('minQtyInput')));
      if (!(lp >= 1 && lp <= 100)) { toast('경고 기준은 1~100 사이로 넣어 주세요.', true); return; }
      if (!(pm >= 1 && pm <= 100)) { toast('최소 남은 양은 1~100 사이로 넣어 주세요.', true); return; }
      if (!(mq >= 1)) { toast('최소 수량은 1 이상으로 넣어 주세요.', true); return; }
      state.settings.lowPct = lp;
      state.settings.pctMinDefault = pm;
      state.settings.minQtyDefault = mq;
      markDirty('settings');
      renderAll(); renderSettings();
      toast('📐 기준값을 저장했어요');
      return;
    }
    if (act === 'thr-reset') {
      if (ui.readOnly) { toast('보기 전용 계정이에요.', true); return; }
      state.settings.lowPct = LOW_PCT_DEFAULT;
      state.settings.pctMinDefault = PCT_MIN_DEFAULT;
      state.settings.minQtyDefault = MIN_QTY_DEFAULT;
      markDirty('settings');
      renderAll(); renderSettings();
      toast('📐 기준값을 기본값으로 되돌렸어요');
      return;
    }
    if (act === 'sync-now') { flushSync(); toast('☁️ 동기화를 시작했어요'); return; }
    if (act === 'reload-data') {
      if (anyDirty()) { toast('저장하지 않은 변경이 있어요. 잠시 뒤 다시 시도해 주세요.', true); return; }
      loadRemote(); toast('GitHub에서 다시 불러오는 중…');
      return;
    }

    if (act === 'meal-edit') {
      if (ui.readOnly) { toast('보기 전용 계정이에요.', true); return; }
      openMealModal(el.getAttribute('data-day') || '');
      return;
    }
    if (act === 'meal-save') { saveMeal(); return; }
    if (act === 'week-prev' || act === 'week-next') {
      var d0 = parseYmd(ui.weekStart) || new Date();
      var d1 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + (act === 'week-next' ? 7 : -7));
      ui.weekStart = ymd(mondayOf(d1));
      renderMeals();
      return;
    }
    if (act === 'week-today') { ui.weekStart = ymd(mondayOf(new Date())); renderMeals(); return; }

    if (act === 'expense-open') { renderExpense(); showModal('expenseModal'); return; }
    if (act === 'expense-save') {
      var amount = Math.max(0, Math.round(num(fieldVal('exAmount'))));
      if (!amount) { toast('금액을 넣어 주세요.', true); return; }
      var exDate = isYmd(fieldVal('exDate')) ? fieldVal('exDate') : todayStr();
      state.meals.expenses.push({
        id: uid('ex'),
        date: exDate,
        amount: amount,
        note: fieldVal('exNote').slice(0, 40),
        createdAt: Date.now()
      });
      touchDate(exDate);
      markDirty('meals'); renderAll(); renderExpense();
      toast('💰 ' + fmtWon(amount) + '원 기록했어요');
      return;
    }
    if (act === 'expense-del') {
      var delEx = null;
      for (var xi = 0; xi < state.meals.expenses.length; xi++) if (state.meals.expenses[xi].id === id) { delEx = state.meals.expenses[xi]; break; }
      state.meals.expenses = state.meals.expenses.filter(function (x) { return x.id !== id; });
      if (delEx) touchDate(delEx.date);
      markDirty('meals'); renderAll(); renderExpense();
      return;
    }
  });

  /* 레시피 카드는 키보드(Enter/Space)로도 접었다 펼 수 있어요. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = e.target;
    if (!t || !t.closest || t.closest('a,button,input,select,textarea')) return;
    var card = t.closest('[data-act="recipe-expand"]');
    if (!card) return;
    e.preventDefault();
    toggleRecipeCard(card);
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'searchInput') {
      ui.search = t.value;
      renderInventory();
      return;
    }
    if (t.id === 'itUnit') { syncPercentUi(); return; }
    if (t.id === 'itQty') { if (isPctUnit(fieldVal('itUnit'))) syncPctPresets(); return; }
    if (t.id === 'sortSel') return;
    if (t.hasAttribute && t.hasAttribute('data-ri') && ui.rec && ui.rec.step === 'review') {
      var i = parseInt(t.getAttribute('data-ri'), 10);
      var f = t.getAttribute('data-f');
      var item = ui.rec.items[i];
      if (!item || !f) return;
      item[f] = (f === 'qty' || f === 'price') ? num(t.value) : t.value;
      if (f !== 'name') { /* 이름 수정 중엔 목록을 다시 그리지 않음 */ }
      var cnt = $('recCount');
      if (cnt) {
        var n = 0;
        for (var k = 0; k < ui.rec.items.length; k++) if (ui.rec.items[k].include) n++;
        cnt.textContent = n + '개 선택';
      }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.classList && t.classList.contains('so-title')) {
      var sk = t.getAttribute('data-sec') || '';
      if (SEC_KEYS.indexOf(sk) < 0) return;
      var sv = String(t.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!state.settings.sectionTitles) state.settings.sectionTitles = {};
      if (sv && sv !== secDefaultName(sk)) state.settings.sectionTitles[sk] = sv;
      else delete state.settings.sectionTitles[sk];
      markDirty('settings');
      renderAll();
      return;
    }
    if (t.id === 'sortSel') { ui.sort = t.value; renderTools(); renderInventory(); return; }
    if (t.id === 'itUnit') { syncPercentUi(); return; }
    if (t.id === 'itQty' && isPctUnit(fieldVal('itUnit'))) {
      t.value = String(pctClamp(t.value));
      syncPctPresets();
      return;
    }
    if (t.getAttribute && t.getAttribute('data-sel') === 'recipe-sort') {
      ui.recipeSort = normRecipeSort(t.value);
      lsSet(RECIPE_SORT_KEY, ui.recipeSort);
      renderRecipes();
      return;
    }
    if (t.id === 'receiptFile' && t.files && t.files[0]) {
      var f = t.files[0];
      analyzeReceipt(f);
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-ri') && ui.rec && ui.rec.step === 'review') {
      var i = parseInt(t.getAttribute('data-ri'), 10);
      var item = ui.rec.items[i];
      if (!item) return;
      if (t.type === 'checkbox') {
        item.include = t.checked;
        var row = t.closest('.rec-row');
        if (row) row.className = 'rec-row' + (item.include ? '' : ' off');
        var cnt = $('recCount');
        if (cnt) {
          var n = 0;
          for (var k = 0; k < ui.rec.items.length; k++) if (ui.rec.items[k].include) n++;
          cnt.textContent = n + '개 선택';
        }
        return;
      }
      var f = t.getAttribute('data-f');
      if (f === 'storage') item.storage = normStorage(t.value);
      if (f === 'qty' || f === 'price') item[f] = num(t.value);
      if (f === 'name' || f === 'unit') item[f] = t.value;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var sheets = document.querySelectorAll('.sheet:not([hidden])');
    if (sheets.length) closeModal(sheets[sheets.length - 1].id);
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('sheet')) {
      closeModal(e.target.id);
    }
  });

  window.addEventListener('online', function () {
    if (cloud.me && anyDirty()) flushSync();
    else if (cloud.me && (cloud.status === 'offline' || cloud.status === 'error')) loadRemote();
  });
  window.addEventListener('visibilitychange', function () {
    if (!document.hidden && cloud.me && anyDirty()) flushSync();
  });
  window.setInterval(function () {
    if (cloud.me && anyDirty() && navigator.onLine !== false) flushSync();
  }, 15000);

