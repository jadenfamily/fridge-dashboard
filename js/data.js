/* 냉장고 파먹기 · 데이터 정규화 · 시드 · 주/날짜 */
'use strict';

  /* ============ 데이터 정규화 ============ */
  function makeItem(o) {
    o = o || {};
    var unit = String(o.unit || '개').slice(0, 6).trim() || '개';
    var qty = qtyClamp(o.qty, unit);
    var status = o.status === 'out' ? 'out' : (qty > 0 ? 'in' : 'out');
    return {
      id: o.id || uid('it'),
      name: String(o.name || '').trim().slice(0, 40),
      qty: qty,
      unit: unit,
      storage: normStorage(o.storage),
      boughtAt: isYmd(o.boughtAt) ? o.boughtAt : '',
      price: Math.max(0, Math.round(num(o.price))),
      staple: !!o.staple,
      minQty: isPctUnit(unit) ? Math.max(1, pctMin(o)) : Math.max(1, num(o.minQty) || minQtyDefault()),
      status: status,
      note: String(o.note || '').slice(0, 60),
      category: String(o.category || '').slice(0, 20),
      alert: o.alert === false ? false : true,
      createdAt: num(o.createdAt) || Date.now(),
      updatedAt: num(o.updatedAt) || Date.now()
    };
  }
  function normalizeInventory(raw) {
    var out = { version: 1, updatedAt: (raw && raw.updatedAt) || '', items: [] };
    var list = (raw && raw.items) || [];
    for (var i = 0; i < list.length; i++) {
      var it = makeItem(list[i]);
      if (it.name) out.items.push(it);
    }
    return out;
  }
  function normalizeMeals(raw) {
    raw = raw || {};
    var out = { version: 1, updatedAt: raw.updatedAt || '', budget: Math.max(0, Math.round(num(raw.budget))), weeks: {}, expenses: [] };
    var weeks = raw.weeks || {};
    for (var k in weeks) {
      if (!Object.prototype.hasOwnProperty.call(weeks, k)) continue;
      var w = weeks[k] || {};
      var wk = { start: isYmd(w.start) ? w.start : '', days: {} };
      for (var i = 0; i < DAYS.length; i++) {
        var d = (w.days && w.days[DAYS[i].k]) || {};
        wk.days[DAYS[i].k] = { b: String(d.b || '').slice(0, 60), l: String(d.l || '').slice(0, 60), d: String(d.d || '').slice(0, 60) };
      }
      out.weeks[k] = wk;
    }
    var ex = raw.expenses || [];
    for (var j = 0; j < ex.length && j < 500; j++) {
      var e = ex[j] || {};
      if (!num(e.amount)) continue;
      out.expenses.push({ id: e.id || uid('ex'), date: isYmd(e.date) ? e.date : todayStr(), amount: Math.round(num(e.amount)), note: String(e.note || '').slice(0, 40), createdAt: num(e.createdAt) || Date.now() });
    }
    return out;
  }
  function normalizeSettings(raw) {
    raw = raw || {};
    var out = { version: 1, updatedAt: raw.updatedAt || '', recipes: [], recipesAt: raw.recipesAt || '', prefs: raw.prefs || {}, links: {} };
    var links = raw.links || {};
    var lc = 0, lk;
    for (lk in links) {
      if (!Object.prototype.hasOwnProperty.call(links, lk)) continue;
      if (lc++ > 400) break;
      var arr = links[lk];
      if (Object.prototype.toString.call(arr) !== '[object Array]') continue;
      var ok = [];
      for (var a = 0; a < arr.length && a < 6; a++) {
        var u = String(arr[a] || '').trim().slice(0, 400);
        if (/^https?:\/\//i.test(u)) ok.push(u);
      }
      if (ok.length) out.links[String(lk).slice(0, 140)] = ok;
    }
    var list = raw.recipes || [];
    for (var i = 0; i < list.length && i < 10; i++) {
      var r = list[i] || {};
      if (!r.title) continue;
      out.recipes.push({
        title: String(r.title).slice(0, 60),
        reason: String(r.reason || '').slice(0, 160),
        minutes: Math.max(0, Math.round(num(r.minutes))),
        ingredients: (r.ingredients || []).slice(0, 14).map(function (x) { return String(x).slice(0, 30); }),
        missing: (r.missing || []).slice(0, 10).map(function (x) { return String(x).slice(0, 30); }),
        steps: (r.steps || []).slice(0, 8).map(function (x) { return String(x).slice(0, 160); })
      });
    }
    out.sectionOrder = [];
    var so = raw.sectionOrder;
    if (Object.prototype.toString.call(so) === '[object Array]') {
      for (var oi = 0; oi < so.length; oi++) {
        var sk = String(so[oi] || '');
        if (SEC_KEYS.indexOf(sk) >= 0 && out.sectionOrder.indexOf(sk) < 0) out.sectionOrder.push(sk);
      }
    }
    for (var si = 0; si < SEC_KEYS.length; si++) if (out.sectionOrder.indexOf(SEC_KEYS[si]) < 0) out.sectionOrder.push(SEC_KEYS[si]);
    out.sectionTitles = {};
    var st = raw.sectionTitles || {};
    for (var tk in st) {
      if (!Object.prototype.hasOwnProperty.call(st, tk) || SEC_KEYS.indexOf(tk) < 0) continue;
      var tv = String(st[tk] || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (tv) out.sectionTitles[tk] = tv;
    }
    if (raw.prefs && Object.prototype.toString.call(raw.prefs) === '[object Object]') out.prefs = raw.prefs;
    out.budgetDefault = clampRange(raw.budgetDefault, BUDGET_DEFAULT, 1000, 1000000000);
    out.lowPct = clampRange(raw.lowPct, LOW_PCT_DEFAULT, 1, 100);
    out.pctMinDefault = clampRange(raw.pctMinDefault, PCT_MIN_DEFAULT, 1, 100);
    out.minQtyDefault = clampRange(raw.minQtyDefault, MIN_QTY_DEFAULT, 1, 9999);
    return out;
  }

  /* 레시피 도서관(fridge/recipes.json) — 한 번 받아서 계속 쌓아 쓰는 요리 목록 */
  function recipeKey(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
  }
  function normalizeRecipeEntry(r, i) {
    r = r || {};
    var title = String(r.title || '').trim().slice(0, 60);
    if (!title) return null;
    var ings = [], st = [], a;
    var list = r.ingredients || [];
    for (a = 0; a < list.length && a < 16; a++) {
      var v = String(list[a] || '').trim().slice(0, 30);
      if (v) ings.push(v);
    }
    if (!ings.length) return null;
    list = r.steps || [];
    for (a = 0; a < list.length && a < 10; a++) {
      var stp = String(list[a] || '').trim().slice(0, 200);
      if (stp) st.push(stp);
    }
    return {
      id: String(r.id || ('r_' + i)).slice(0, 40),
      title: title,
      emoji: String(r.emoji || '🍽').slice(0, 4),
      minutes: Math.max(0, Math.round(num(r.minutes))),
      category: normCategory(r.category) || guessCategory(title, ings),
      ingredients: ings,
      steps: st,
      source: r.source === 'ai' ? 'ai' : 'builtin',
      createdAt: num(r.createdAt) || Date.now()
    };
  }
  function normalizeRecipes(raw) {
    var out = { version: 1, updatedAt: (raw && raw.updatedAt) || '', recipes: [] };
    var list = (raw && raw.recipes) || [];
    if (Object.prototype.toString.call(list) !== '[object Array]') return out;
    for (var i = 0; i < list.length && i < 400; i++) {
      var e = normalizeRecipeEntry(list[i], i);
      if (e) out.recipes.push(e);
    }
    return out;
  }
  /* 처음 한 번만 쓰는 기본 도서관: 집에서 자주 해 먹는 요리 + 예전 저장된 AI 추천 */
  function seedRecipes() {
    var now = Date.now(), list = [], seen = {}, i;
    for (i = 0; i < RECIPES.length; i++) {
      var r = RECIPES[i];
      seen[recipeKey(r.t)] = 1;
      list.push({
        id: 'rb_' + (i + 1), title: r.t, emoji: r.e, minutes: 0,
        category: normCategory(r.cat) || guessCategory(r.t, r.ing),
        ingredients: r.ing.slice(0), steps: (r.s || []).slice(0),
        source: 'builtin', createdAt: now - (RECIPES.length - i) * 1000
      });
    }
    var legacy = state.settings.recipes || [];
    for (i = 0; i < legacy.length; i++) {
      var a = legacy[i] || {};
      var k = recipeKey(a.title);
      if (!k || seen[k]) continue;
      var e = normalizeRecipeEntry({ id: uid('ra'), title: a.title, emoji: '✨', minutes: a.minutes, ingredients: a.ingredients, steps: a.steps, source: 'ai', createdAt: now + i }, i);
      if (!e) continue;
      seen[k] = 1;
      list.push(e);
    }
    return { version: 1, updatedAt: nowIso(), recipes: list };
  }

  function normEventList(list) {
    var out = [];
    if (Object.prototype.toString.call(list) !== '[object Array]') return out;
    for (var i = 0; i < list.length && i < 60; i++) {
      var e = list[i] || {};
      var nm = String(e.name || '').trim();
      if (!nm) continue;
      out.push({
        name: nm.slice(0, 40),
        qty: Math.max(0, num(e.qty)),
        unit: String(e.unit || '개').slice(0, 6),
        price: Math.max(0, Math.round(num(e.price))),
        storage: normStorage(e.storage),
        t: num(e.t) || 0
      });
    }
    return out;
  }
  function normalizeDaily(raw) {
    raw = raw || {};
    var out = { version: 1, updatedAt: raw.updatedAt || '', days: {} };
    var days = raw.days || {}, keys = [], k;
    for (k in days) if (Object.prototype.hasOwnProperty.call(days, k) && isYmd(k)) keys.push(k);
    keys.sort();
    for (var i = 0; i < keys.length && i < 900; i++) {
      var e = days[keys[i]] || {};
      var mm = e.meals || {};
      out.days[keys[i]] = {
        bought: normEventList(e.bought),
        consumed: normEventList(e.consumed),
        meals: { b: String(mm.b || '').slice(0, 60), l: String(mm.l || '').slice(0, 60), d: String(mm.d || '').slice(0, 60) },
        spend: Math.max(0, Math.round(num(e.spend))),
        stockCount: Math.max(0, Math.round(num(e.stockCount))),
        updatedAt: num(e.updatedAt) || 0
      };
    }
    return out;
  }

  /* ============ 시드 ============ */
  function seedInventory() {
    var now = Date.now(), c = 0, items = [];
    for (var s = 0; s < STORAGES.length; s++) {
      var st = STORAGES[s];
      var list = SEED[st.key] || [];
      for (var i = 0; i < list.length; i++) {
        items.push(makeItem({ name: list[i], storage: st.key, qty: 1, unit: '개', boughtAt: todayStr(), createdAt: now - (c++) * 1000 }));
      }
    }
    for (var k = 0; k < STAPLES.length; k++) {
      var sp = STAPLES[k], found = null;
      for (var j = 0; j < items.length; j++) {
        if (norm(items[j].name) === norm(sp.n)) { found = items[j]; break; }
      }
      if (found) {
        found.staple = true;
        found.minQty = 1;
      } else {
        items.push(makeItem({ name: sp.n, storage: sp.s, qty: 0, unit: '개', status: 'out', staple: true, minQty: 1, createdAt: now - (c++) * 1000 }));
      }
    }
    return { version: 1, updatedAt: nowIso(), items: items };
  }

  /* ============ 주 / 날짜 ============ */
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = x.getDay(); // 0=일
    var diff = (day === 0 ? -6 : 1 - day);
    x.setDate(x.getDate() + diff);
    return x;
  }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function isoWeekKey(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var y = t.getUTCFullYear();
    var w = Math.ceil((((t - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
    return y + '-W' + pad2(w);
  }
  function weekLabel(start) {
    var mon = parseYmd(start);
    if (!mon) return '';
    var weekOfMonth = Math.ceil(mon.getDate() / 7);
    var fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
    return (mon.getMonth() + 1) + '월 ' + weekOfMonth + '주차';
  }
  function weekRange(start) {
    var mon = parseYmd(start);
    if (!mon) return '';
    var fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
    return (mon.getMonth() + 1) + '/' + mon.getDate() + '(' + DAYS[0].n + ') ~ ' + (fri.getMonth() + 1) + '/' + fri.getDate() + '(' + DAYS[4].n + ')';
  }
  function dayDate(start, i) {
    var mon = parseYmd(start);
    if (!mon) return null;
    return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
  }

