/* 냉장고 파먹기 · 하루 기록 · 캘린더 · 통계 */
'use strict';

  /* ============ 하루 기록 / 통계 ============ */
  function fmtShort(n) {
    n = Math.round(num(n));
    if (!n) return '';
    if (n >= 100000000) return (Math.round(n / 10000000) / 10) + '억';
    if (n >= 10000) return (Math.round(n / 1000) / 10) + '만';
    if (n >= 1000) return (Math.round(n / 100) / 10) + '천';
    return String(n);
  }
  function dayRec(key, create) {
    if (!isYmd(key)) return null;
    var d = state.daily.days[key];
    if (!d && create) {
      d = { bought: [], consumed: [], meals: { b: '', l: '', d: '' }, spend: 0, stockCount: 0, updatedAt: 0 };
      state.daily.days[key] = d;
    }
    return d || null;
  }
  function mealsForDate(key) {
    var empty = { b: '', l: '', d: '' };
    var dt = parseYmd(key);
    if (!dt) return empty;
    for (var wk in state.meals.weeks) {
      if (!Object.prototype.hasOwnProperty.call(state.meals.weeks, wk)) continue;
      var w = state.meals.weeks[wk] || {};
      var mon = parseYmd(w.start);
      if (!mon) continue;
      for (var i = 0; i < DAYS.length; i++) {
        var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
        if (ymd(d) === key) {
          var s = (w.days && w.days[DAYS[i].k]) || {};
          return { b: String(s.b || ''), l: String(s.l || ''), d: String(s.d || '') };
        }
      }
    }
    return empty;
  }
  function mealCount(m) {
    if (!m) return 0;
    var n = 0;
    if (m.b) n++;
    if (m.l) n++;
    if (m.d) n++;
    return n;
  }
  function spendForDate(key) {
    var s = 0, i;
    for (i = 0; i < state.inventory.items.length; i++) {
      var it = state.inventory.items[i];
      if (it.price > 0 && it.boughtAt === key) s += it.price;
    }
    for (i = 0; i < state.meals.expenses.length; i++) {
      if (state.meals.expenses[i].date === key) s += num(state.meals.expenses[i].amount);
    }
    return s;
  }
  function derivedBought(key) {
    var out = [];
    for (var i = 0; i < state.inventory.items.length; i++) {
      var it = state.inventory.items[i];
      if (it.boughtAt === key) out.push({ name: it.name, qty: num(it.qty), unit: it.unit, price: it.price, storage: it.storage, t: it.createdAt });
    }
    return out;
  }
  function logDaily(kind, item, qty) {
    if (!item || !isYmd(todayStr())) return;
    var key = todayStr();
    var rec = dayRec(key, true);
    if (!rec) return;
    var list = kind === 'consumed' ? rec.consumed : rec.bought;
    var n = norm(item.name), hit = null;
    for (var i = 0; i < list.length; i++) if (norm(list[i].name) === n) { hit = list[i]; break; }
    var q = Math.max(0, num(qty));
    if (hit) {
      hit.qty = Math.round((num(hit.qty) + q) * 100) / 100;
      hit.t = Date.now();
    } else {
      list.push({
        name: String(item.name || '').slice(0, 40), qty: q, unit: item.unit || '개',
        price: kind === 'bought' ? Math.max(0, num(item.price)) : 0,
        storage: item.storage || 'fridge', t: Date.now()
      });
    }
    refreshDay(key, false);
    markDirty('daily');
  }
  function refreshDay(key, touch) {
    var rec = dayRec(key, true);
    if (!rec) return null;
    rec.meals = mealsForDate(key);
    rec.spend = spendForDate(key);
    rec.stockCount = inStock(state.inventory.items).length;
    rec.updatedAt = Date.now();
    if (touch) markDirty('daily');
    return rec;
  }
  function touchDate(key) {
    if (isYmd(key)) refreshDay(key, true);
  }
  function dayData(key) {
    var rec = state.daily.days[key] || null;
    var meals = mealsForDate(key);
    var bought = (rec && rec.bought && rec.bought.length) ? rec.bought : derivedBought(key);
    var consumed = (rec && rec.consumed) || [];
    var spend = spendForDate(key);
    var mn = mealCount(meals);
    return {
      key: key, rec: rec, bought: bought, consumed: consumed, meals: meals, mealN: mn,
      spend: spend, stock: rec ? rec.stockCount : 0,
      has: !!(bought.length || consumed.length || mn || spend)
    };
  }
  function backfillDaily() {
    var changed = false;
    var n = new Date();
    var cut = ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 200));
    function ensure(k) {
      if (!isYmd(k) || k < cut || state.daily.days[k]) return;
      state.daily.days[k] = {
        bought: derivedBought(k), consumed: [], meals: mealsForDate(k),
        spend: spendForDate(k), stockCount: 0, updatedAt: Date.now()
      };
      changed = true;
    }
    var i, w, mon, s;
    for (i = 0; i < state.inventory.items.length; i++) ensure(state.inventory.items[i].boughtAt);
    for (i = 0; i < state.meals.expenses.length; i++) ensure(state.meals.expenses[i].date);
    for (var wk in state.meals.weeks) {
      if (!Object.prototype.hasOwnProperty.call(state.meals.weeks, wk)) continue;
      w = state.meals.weeks[wk] || {};
      mon = parseYmd(w.start);
      if (!mon) continue;
      for (i = 0; i < DAYS.length; i++) {
        s = (w.days && w.days[DAYS[i].k]) || {};
        if (s.b || s.l || s.d) ensure(ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
      }
    }
    if (changed) markDirty('daily');
  }
  function downloadJson(name, obj) {
    try {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 900);
      toast('💾 백업 파일을 저장했어요');
    } catch (e) { toast('백업 파일을 만들지 못했어요.', true); }
  }

  function openHistory() {
    var n = new Date();
    if (!ui.histY) { ui.histY = n.getFullYear(); ui.histM = n.getMonth(); }
    if (!ui.histSel) ui.histSel = todayStr();
    renderHistory();
    showModal('historyModal');
  }
  function histShift(dir) {
    var m2 = ui.histM + dir, y = ui.histY;
    if (m2 < 0) { m2 = 11; y--; }
    if (m2 > 11) { m2 = 0; y++; }
    ui.histY = y; ui.histM = m2;
    renderHistory();
  }
  function renderHistory() {
    var body = $('historyBody'); if (!body) return;
    var now = new Date(), today = todayStr();
    var y = ui.histY || now.getFullYear(), m = (typeof ui.histM === 'number') ? ui.histM : now.getMonth();
    var lead = new Date(y, m, 1).getDay();
    var last = new Date(y, m + 1, 0).getDate();
    var isNowMonth = (y === now.getFullYear() && m === now.getMonth());
    var mSpend = 0, mDays = 0, mActs = 0, dd, k, dt;
    for (dd = 1; dd <= last; dd++) {
      k = y + '-' + pad2(m + 1) + '-' + pad2(dd);
      dt = dayData(k);
      mSpend += dt.spend;
      if (dt.mealN) mDays++;
      mActs += dt.bought.length + dt.consumed.length;
    }
    var h = '<div class="hsum">' +
      '<div class="hsum-card"><div class="hsum-k">' + (m + 1) + '월 식비</div><div class="hsum-v">' + fmtWon(mSpend) + '원</div><div class="hsum-s">재료 구매 + 직접 지출</div></div>' +
      '<div class="hsum-card mint"><div class="hsum-k">식단 기록</div><div class="hsum-v">' + mDays + '일</div><div class="hsum-s">한 끼라도 적은 날</div></div>' +
      '<div class="hsum-card sky"><div class="hsum-k">등록 · 소진</div><div class="hsum-v">' + mActs + '건</div><div class="hsum-s">산 재료 + 쓴 재료</div></div>' +
      '</div>';
    h += '<div class="hcal"><div class="hcal-head">' +
      '<button type="button" class="hnav" data-act="hist-prev" aria-label="이전 달">‹</button>' +
      '<div class="hcal-title">' + y + '년 ' + (m + 1) + '월</div>' +
      '<button type="button" class="hnav" data-act="hist-next" aria-label="다음 달"' + (isNowMonth ? ' disabled' : '') + '>›</button>' +
      '</div>';
    h += '<div class="hcal-dow"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="sat">토</span></div>';
    h += '<div class="hcal-grid">';
    for (var i = 0; i < lead; i++) h += '<div class="hday empty" aria-hidden="true"></div>';
    for (dd = 1; dd <= last; dd++) {
      k = y + '-' + pad2(m + 1) + '-' + pad2(dd);
      dt = dayData(k);
      var cls = 'hday' + (dt.has ? ' has' : '') + (k === today ? ' today' : '') + (k === ui.histSel ? ' sel' : '') + (k > today ? ' fut' : '');
      var inner = '<span class="n">' + dd + '</span>' +
        '<span class="p">' + (dt.spend ? fmtShort(dt.spend) : (dt.has ? '기록' : '·')) + '</span>' +
        '<span class="hdots"><i class="bt' + (dt.bought.length ? ' on' : '') + '"></i><i class="cn' + (dt.consumed.length ? ' on' : '') + '"></i><i class="ml' + (dt.mealN ? ' on' : '') + '"></i></span>';
      if (k > today) {
        h += '<div class="' + cls + '" aria-hidden="true">' + inner + '</div>';
      } else {
        h += '<button type="button" class="' + cls + '" data-act="hist-day" data-key="' + k + '" aria-pressed="' + (k === ui.histSel ? 'true' : 'false') + '" aria-label="' + esc((m + 1) + '월 ' + dd + '일 ' + (dt.spend ? fmtWon(dt.spend) + '원 지출' : (dt.has ? '기록 있음' : '기록 없음'))) + '">' + inner + '</button>';
      }
    }
    h += '</div><div class="hd-legend"><span><i style="background:#3d9be9"></i>산 재료</span><span><i style="background:#ff9f1c"></i>쓴 재료</span><span><i style="background:#10b981"></i>식단</span></div></div>';

    var sel = ui.histSel || today;
    var sd = parseYmd(sel);
    if (sd) {
      var sdt = dayData(sel);
      var dow = ['일', '월', '화', '수', '목', '금', '토'][sd.getDay()];
      h += '<div class="hdetail"><div class="hd-head">' +
        '<span class="hd-date">' + (sd.getMonth() + 1) + '월 ' + sd.getDate() + '일 ' + dow + '요일</span>' +
        (sdt.spend ? '<span class="hd-pay">' + fmtWon(sdt.spend) + '원</span>' : '') +
        (sdt.stock ? '<span class="hd-sub">재고 ' + sdt.stock + '개</span>' : '') +
        '</div>';
      if (!sdt.has) {
        h += '<p class="hd-empty">이 날은 기록이 없어요. 재료를 등록하거나 식단을 적으면 여기에 쌓여요 🌱</p>';
      } else {
        if (sdt.bought.length) {
          h += '<div class="hd-sec"><div class="hd-sec-t">🛒 산 재료<span>' + sdt.bought.length + '건</span></div><div class="hd-list">';
          for (i = 0; i < sdt.bought.length; i++) {
            var b = sdt.bought[i];
            h += '<span class="hd-it b">' + esc(b.name) + (num(b.qty) ? ' ' + fmtQty(b.qty) + esc(b.unit) : '') + (num(b.price) ? ' · ' + fmtWon(b.price) + '원' : '') + '</span>';
          }
          h += '</div></div>';
        }
        if (sdt.consumed.length) {
          h += '<div class="hd-sec"><div class="hd-sec-t">🥢 쓴 재료<span>' + sdt.consumed.length + '건</span></div><div class="hd-list">';
          for (i = 0; i < sdt.consumed.length; i++) {
            var c2 = sdt.consumed[i];
            h += '<span class="hd-it c">' + esc(c2.name) + (num(c2.qty) ? ' ' + fmtQty(c2.qty) + esc(c2.unit) : '') + '</span>';
          }
          h += '</div></div>';
        }
        h += '<div class="hd-sec"><div class="hd-sec-t">🍽 식단<span>' + sdt.mealN + '/3</span></div>';
        for (i = 0; i < SLOTS.length; i++) {
          var sv = sdt.meals[SLOTS[i].k] || '';
          h += '<div class="hd-meal"><b>' + SLOTS[i].n + '</b><span class="' + (sv ? '' : 'empty') + '">' + (sv ? esc(sv) : '기록 없음') + '</span></div>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    h += '<div class="hback"><button class="btn sm sub" type="button" data-act="history-backup">💾 JSON 백업</button><span class="hback-note">날짜를 눌러 그날의 산 재료·쓴 재료·식단·지출을 한 번에 볼 수 있어요.</span></div>';
    body.innerHTML = h;
  }

  function barList(map, unitFmt, cls) {
    var order = [], k;
    for (k in map) if (Object.prototype.hasOwnProperty.call(map, k) && map[k] > 0) order.push(k);
    if (!order.length) return '<p class="spend-empty">아직 기록이 없어요.</p>';
    order.sort(function (a, b) { return map[b] - map[a]; });
    var top = map[order[0]] || 1, h = '<div class="bars">';
    for (var i = 0; i < order.length && i < 8; i++) {
      h += '<div class="bar-row"><span class="bar-name">' + esc(order[i]) + '</span>' +
        '<span class="bar-track"><i class="bar-fill' + (cls ? ' ' + cls : '') + '" style="display:block;width:' + Math.max(4, Math.round(map[order[i]] / top * 100)) + '%"></i></span>' +
        '<span class="bar-val">' + unitFmt(map[order[i]]) + '</span></div>';
    }
    return h + '</div>';
  }
  function chartSpend14() {
    var base = new Date();
    base.setHours(0, 0, 0, 0);
    var arr = [], max = 1, i;
    for (i = 13; i >= 0; i--) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      var k = ymd(d);
      var v = spendForDate(k);
      if (v > max) max = v;
      arr.push({ d: d, v: v });
    }
    var h = '<div class="chart14">';
    for (i = 0; i < arr.length; i++) {
      var x = arr[i];
      var ht = x.v ? Math.max(8, Math.round(x.v / max * 92)) : 4;
      h += '<div class="c14' + (i === arr.length - 1 ? ' today' : '') + '" title="' + (x.d.getMonth() + 1) + '/' + x.d.getDate() + ' · ' + (x.v ? fmtWon(x.v) + '원' : '지출 없음') + '">' +
        '<span class="v">' + (x.v ? fmtShort(x.v) : '') + '</span>' +
        '<span class="col' + (x.v ? '' : ' zero') + '" style="height:' + ht + 'px"></span>' +
        '<span class="d">' + x.d.getDate() + '</span></div>';
    }
    return h + '</div>';
  }
  function openStats() {
    renderStats();
    showModal('statsModal');
  }
  function renderStats() {
    var body = $('statsBody'); if (!body) return;
    var now = new Date(), m = todayStr().slice(0, 7);
    var s = monthSpent();
    var b = effectiveBudget();
    var remain = b - s.total;
    var last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var regN = 0, useN = 0, mealDays = 0, i, dd;
    var topB = {}, topC = {};
    var cut = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45));
    for (var key in state.daily.days) {
      if (!Object.prototype.hasOwnProperty.call(state.daily.days, key) || key < cut) continue;
      var dtr = dayData(key);
      for (i = 0; i < dtr.bought.length; i++) topB[dtr.bought[i].name] = (topB[dtr.bought[i].name] || 0) + Math.max(1, num(dtr.bought[i].qty));
      for (i = 0; i < dtr.consumed.length; i++) topC[dtr.consumed[i].name] = (topC[dtr.consumed[i].name] || 0) + Math.max(1, num(dtr.consumed[i].qty));
    }
    for (dd = 1; dd <= last; dd++) {
      var dt = dayData(m + '-' + pad2(dd));
      regN += dt.bought.length;
      useN += dt.consumed.length;
      if (dt.mealN) mealDays++;
    }
    var stSpend = {}, stStock = {};
    for (i = 0; i < state.inventory.items.length; i++) {
      var it = state.inventory.items[i];
      var lb = ST_LABEL[it.storage] || '기타';
      if (it.price > 0 && String(it.boughtAt).slice(0, 7) === m) stSpend[lb] = (stSpend[lb] || 0) + it.price;
      if (it.status === 'in' && num(it.qty) > 0) stStock[lb] = (stStock[lb] || 0) + 1;
    }
    var h = '<div class="stat-sum">' +
      '<div class="stat-box"><b>이번 달 총 식비</b><strong>' + fmtWon(s.total) + '원</strong><small>목표 ' + fmtWon(b) + '원</small></div>' +
      '<div class="stat-box ' + (remain < 0 ? 'pink' : 'mint') + '"><b>' + (remain < 0 ? '목표 초과' : '목표 대비 잔액') + '</b><strong>' + fmtWon(Math.abs(remain)) + '원</strong><small>' + (remain < 0 ? '이번 달 목표를 넘었어요' : '남은 금액이에요') + '</small></div>' +
      '<div class="stat-box"><b>이번 달 등록 · 소진</b><strong>' + regN + ' · ' + useN + '건</strong><small>산 재료 · 쓴 재료</small></div>' +
      '<div class="stat-box mint"><b>식단 기록일</b><strong>' + mealDays + '일</strong><small>이번 달 한 끼라도 적은 날</small></div>' +
      '<div class="stat-box sky"><b>보유 재료</b><strong>' + inStock(state.inventory.items).length + '개</strong><small>지금 냉장고에 있는 재료</small></div>' +
      '<div class="stat-box"><b>장보기 알림</b><strong>' + needsShopping().length + '개</strong><small>기준 이하로 떨어진 재료</small></div>' +
      '</div>';
    h += '<div class="stat-sec"><h3>🧊 보관별 이번 달 지출</h3>' + barList(stSpend, function (v) { return fmtShort(v) + '원'; }, '') + '</div>';
    h += '<div class="stat-sec"><h3>📦 보관별 보유 비율</h3>' + barList(stStock, function (v) { return fmtQty(v) + '개'; }, 'sky') + '</div>';
    h += '<div class="stat-sec"><h3>🛒 자주 산 재료 (최근 45일)</h3>' + barList(topB, function (v) { return fmtQty(v) + '개'; }, '') + '</div>';
    h += '<div class="stat-sec"><h3>🥢 자주 쓴 재료 (최근 45일)</h3>' + barList(topC, function (v) { return fmtQty(v) + '개'; }, '') + '</div>';
    h += '<div class="stat-sec"><h3>📈 최근 14일 하루 지출</h3>' + chartSpend14() + '</div>';
    body.innerHTML = h;
  }

