/* 냉장고 파먹기 · 주간 식단 · 지출 기록 */
'use strict';

  /* ---------- 주간 식단 ---------- */
  function openMealModal(dayKey) {
    if (!dayKey || ui.readOnly) return;
    ui.mealDay = dayKey;
    var start = ui.weekStart || ymd(mondayOf(new Date()));
    var w = weekEntry(start, false);
    var idx = 0;
    for (var i = 0; i < DAYS.length; i++) if (DAYS[i].k === dayKey) idx = i;
    var dd = dayDate(start, idx);
    var d = (w && w.days[dayKey]) || { b: '', l: '', d: '' };
    $('mealTitle').textContent = '🍽 ' + DAYS[idx].n + '요일 식단';
    $('mealBody').innerHTML = '<div class="form">' +
      '<p class="note">' + esc(weekLabel(start) + (dd ? ' · ' + (dd.getMonth() + 1) + '/' + dd.getDate() : '')) + '</p>' +
      '<label>아침<input id="msB" maxlength="60" placeholder="예: 토스트 + 우유" value="' + esc(d.b) + '"></label>' +
      '<label>점심<input id="msL" maxlength="60" placeholder="예: 김치볶음밥" value="' + esc(d.l) + '"></label>' +
      '<label>저녁<input id="msD" maxlength="60" placeholder="예: 된장찌개 + 달걀말이" value="' + esc(d.d) + '"></label>' +
      '<button class="btn wide" type="button" data-act="meal-save">저장</button>' +
      '<p class="note">비우고 저장하면 그 끼니 기록이 지워져요.</p>' +
      '</div>';
    showModal('mealModal');
    try { $('msB').focus(); } catch (e) { /* 무시 */ }
  }

  function saveMeal() {
    var day = ui.mealDay;
    if (!day) return;
    var start = ui.weekStart || ymd(mondayOf(new Date()));
    var w = weekEntry(start, true);
    if (!w) return;
    w.days[day] = {
      b: fieldVal('msB').trim().slice(0, 60),
      l: fieldVal('msL').trim().slice(0, 60),
      d: fieldVal('msD').trim().slice(0, 60)
    };
    var mIdx = 0;
    for (var di = 0; di < DAYS.length; di++) if (DAYS[di].k === day) mIdx = di;
    var mDay = dayDate(start, mIdx);
    if (mDay) touchDate(ymd(mDay));
    markDirty('meals');
    closeModal('mealModal');
    renderAll();
    toast('🍽 식단을 저장했어요');
  }

  function weekEntry(start, create) {
    var key = isoWeekKey(parseYmd(start) || new Date());
    var w = state.meals.weeks[key];
    if (!w && create) {
      w = { start: start, days: {} };
      for (var i = 0; i < DAYS.length; i++) w.days[DAYS[i].k] = { b: '', l: '', d: '' };
      state.meals.weeks[key] = w;
    }
    if (w && !w.start) w.start = start;
    if (w) {
      for (var j = 0; j < DAYS.length; j++) {
        if (!w.days[DAYS[j].k]) w.days[DAYS[j].k] = { b: '', l: '', d: '' };
      }
    }
    return w;
  }

  function renderMeals() {
    var sec = $('mealSec'); if (!sec) return;
    if (!ui.weekStart) ui.weekStart = ymd(mondayOf(new Date()));
    var start = ui.weekStart;
    var today = todayStr();
    var w = weekEntry(start, false);
    var cells = '';
    for (var i = 0; i < DAYS.length; i++) {
      var dd = dayDate(start, i);
      var ds = dd ? ymd(dd) : '';
      var isToday = ds === today;
      var slotHtml = '';
      for (var s = 0; s < SLOTS.length; s++) {
        var sl = SLOTS[s];
        var txt = (w && w.days[DAYS[i].k]) ? w.days[DAYS[i].k][sl.k] : '';
        var inner = '<b>' + sl.n + '</b><span class="' + (txt ? '' : 'empty') + '">' + (txt ? esc(txt) : '＋ 기록') + '</span>';
        if (ui.readOnly) {
          slotHtml += '<div class="mslot">' + inner + '</div>';
        } else {
          slotHtml += '<button class="mslot" type="button" data-act="meal-edit" data-day="' + DAYS[i].k + '">' + inner + '</button>';
        }
      }
      cells += '<div class="meal-day' + (isToday ? ' today' : '') + '">' +
        '<div class="md-head"><b>' + DAYS[i].n + '</b><span>' + (dd ? (dd.getMonth() + 1) + '/' + dd.getDate() : '') + '</span>' +
        (isToday ? '<span class="today-chip">오늘</span>' : '') + '</div>' +
        slotHtml +
        '</div>';
    }
    sec.innerHTML = '<div class="card-head"><h2>' + esc(secTitle('meal')) + '</h2>' +
      '<div class="week-nav"><button type="button" data-act="week-prev" aria-label="지난 주">‹</button>' +
      '<span>' + esc(weekLabel(start)) + '</span>' +
      '<button type="button" data-act="week-next" aria-label="다음 주">›</button></div></div>' +
      '<p class="week-range">' + esc(weekRange(start)) +
      '<button class="link-btn" type="button" data-act="week-today">이번 주</button>' +
      (ui.readOnly ? '<span class="st-badge" style="background:#f3ecff;color:#5b3fa8">보기 전용</span>' : '') + '</p>' +
      '<div class="meal-grid' + (ui.readOnly ? ' meal-readonly' : '') + '">' + cells + '</div>';
  }

  /* ---------- 지출 ---------- */
  function renderExpense() {
    var body = $('expenseBody'); if (!body) return;
    var m = todayStr().slice(0, 7), rows = '', i;
    for (i = 0; i < state.meals.expenses.length; i++) {
      var e = state.meals.expenses[i];
      if (String(e.date).slice(0, 7) !== m) continue;
      rows += '<div class="shop-row"><div class="shop-main"><b>' + fmtWon(e.amount) + '원</b><span style="color:#8a93a8">' + esc(e.date.slice(5).replace('-', '/')) + (e.note ? ' · ' + esc(e.note) : '') + '</span></div>' +
        '<button class="ic-btn" type="button" data-act="expense-del" data-id="' + esc(e.id) + '" aria-label="삭제">🗑️</button></div>';
    }
    body.innerHTML = '<div class="form">' +
      '<label>날짜<input id="exDate" type="date" value="' + todayStr() + '"></label>' +
      '<label>금액 (원)<input id="exAmount" type="number" min="0" step="100" inputmode="numeric" placeholder="예: 32000"></label>' +
      '<label>메모<input id="exNote" maxlength="40" placeholder="예: 이마트 장보기"></label>' +
      '<button class="btn wide" type="button" data-act="expense-save">지출 기록하기</button>' +
      '</div>' +
      '<h3 style="margin:16px 0 8px;font-size:14px">이번 달 직접 기록</h3>' +
      (rows || '<p class="note">직접 기록한 지출이 없어요. 재료 구매 가격은 자동으로 들어가요.</p>') +
      '<p class="note" style="margin-top:10px">재료 구매 합계는 식재료의 구매일·가격에서 자동 계산돼요. 여기에는 영수증에 없던 지출만 적어 주세요.</p>';
  }

