/* 냉장고 파먹기 · 레시피 도서관 · 카드 렌더 · 레시피 링크 */
'use strict';

  /* ---------- 레시피 링크 ---------- */
  function linksFor(kind, title) {
    var k = kind + ':' + String(title || '').trim().toLowerCase();
    var l = state.settings.links && state.settings.links[k];
    return (Object.prototype.toString.call(l) === '[object Array]') ? l : [];
  }
  function ytQuery(title, shorts) {
    var q = (String(title || '').trim() + (shorts ? ' 쇼츠 레시피' : ' 레시피')).replace(/\s+/g, ' ');
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q).replace(/%20/g, '+');
  }
  function linkLabel(u) {
    var s = String(u || '');
    if (/youtube\.com\/shorts/i.test(s)) return { t: '🎬 쇼츠', c: 'sh' };
    if (/youtube\.com|youtu\.be/i.test(s)) return { t: '📺 영상', c: 'yt' };
    return { t: '🔗 링크', c: 'ref' };
  }
  function recipeLinksHtml(kind, title) {
    var links = linksFor(kind, title), h = '<div class="rc-links">';
    for (var i = 0; i < links.length && i < 3; i++) {
      var lb = linkLabel(links[i]);
      h += '<a class="lnk ' + lb.c + '" href="' + esc(links[i]) + '" target="_blank" rel="noopener">' + lb.t + '</a>';
    }
    h += '<a class="lnk sh" href="' + esc(ytQuery(title, true)) + '" target="_blank" rel="noopener">🎬 쇼츠 검색</a>' +
      '<a class="lnk yt" href="' + esc(ytQuery(title, false)) + '" target="_blank" rel="noopener">📺 유튜브 검색</a>';
    if (!ui.readOnly) {
      h += '<button class="lnk add" type="button" data-act="recipe-link" data-kind="' + esc(kind) + '" data-title="' + esc(title) + '">🔗 링크 ' + (links.length ? '수정' : '추가') + '</button>';
    }
    return h + '</div>';
  }

  /* ---------- 레시피 ---------- */
  /* 지금 재고로 100% 만들 수 있는 요리만 보여준다. */
  var PANTRY = ['물', '소금', '식용유', '후추'];
  function cleanIng(s) {
    return String(s || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[0-9]+(\.[0-9]+)?\s*(kg|g|ml|l|개|대|쪽|큰술|작은술|컵|공기|장|줌|봉|팩|조각|인분|모|캔|알|마리|줄기|cm)/gi, ' ')
      .replace(/(약간|조금|적당량|적당히|취향껏)/g, ' ')
      .replace(/\s+/g, '')
      .toLowerCase();
  }
  function isPantry(name) { return PANTRY.indexOf(cleanIng(name)) >= 0; }
  function stockNames() {
    var out = [], seen = {}, list = inStock(state.inventory.items);
    for (var i = 0; i < list.length; i++) {
      var n = cleanIng(list[i].name);
      if (!n || seen[n]) continue;
      seen[n] = 1; out.push(n);
    }
    return out;
  }
  function hasStock(stock, ing) {
    var n = cleanIng(ing);
    if (!n) return false;
    if (isPantry(n)) return true;
    for (var i = 0; i < stock.length; i++) {
      var s = stock[i];
      if (s === n) return true;
      if (s.length >= 2 && n.indexOf(s) >= 0) return true;
      if (n.length >= 2 && s.indexOf(n) >= 0) return true;
    }
    return false;
  }
  function missingIngs(ings, stock) {
    var miss = [];
    for (var i = 0; i < ings.length; i++) if (!hasStock(stock, ings[i])) miss.push(ings[i]);
    return miss;
  }

  /* 레시피 도서관에서 지금 재고로 100% 만들 수 있는 요리만 골라낸다. */
  function fullRecipes() {
    var stock = stockNames(), out = [], i;
    var list = (state.recipes && state.recipes.recipes) || [];
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.title || !r.ingredients || !r.ingredients.length) continue;
      if (missingIngs(r.ingredients, stock).length) continue;
      out.push({
        kind: r.source === 'ai' ? 'a' : 'b',
        pos: i,
        id: String(r.id || ('k_' + i)),
        title: r.title,
        emoji: r.emoji || '🍽',
        category: normCategory(r.category) || guessCategory(r.title, r.ingredients),
        ings: r.ingredients,
        steps: r.steps || [],
        minutes: num(r.minutes),
        ai: r.source === 'ai',
        createdAt: num(r.createdAt)
      });
    }
    return out;
  }
  /* 카테고리별 100% 요리 개수 (필터 칩에 표시) */
  function recipeCatCounts(list) {
    var out = { all: list.length }, i;
    for (i = 0; i < CATEGORIES.length; i++) out[CATEGORIES[i]] = 0;
    for (i = 0; i < list.length; i++) {
      var c = normCategory(list[i].category) || '한식';
      if (out[c] == null) out[c] = 0;
      out[c]++;
    }
    return out;
  }
  function sortRecipes(list, mode) {
    var out = list.slice();
    if (mode === 'time') {
      /* 조리시간 짧은 순 — 시간을 모르는 요리는 뒤로 */
      out.sort(function (a, b) {
        var am = a.minutes > 0 ? a.minutes : 9999, bm = b.minutes > 0 ? b.minutes : 9999;
        if (am !== bm) return am - bm;
        return String(a.title).localeCompare(String(b.title), 'ko');
      });
    } else if (mode === 'name') {
      out.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'ko'); });
    } else {
      /* 최신순(기본): AI로 새로 담은 요리를 최근 것부터, 그다음 기본 요리 순서대로
         — 도서관은 뒤에 붙이는 방식이라 배열 순서가 곧 담은 순서다(기기 시계 차이에도 안전). */
      out.sort(function (a, b) {
        if (a.ai !== b.ai) return a.ai ? -1 : 1;
        return b.pos - a.pos;
      });
    }
    return out;
  }
  function recipeCatLabel(c) { return c === 'all' ? '전체' : c; }

  function recipeCardHtml(it) {
    var key = it.id || (it.kind + ':' + it.title);
    var open = !!(ui.openRecipe && ui.openRecipe[key]);
    var steps = it.steps || [], i;
    var ing = '';
    for (i = 0; i < it.ings.length; i++) ing += (i ? ' · ' : '') + it.ings[i];
    if (it.minutes) ing += ' · ' + it.minutes + '분';
    var ol = '';
    for (i = 0; i < steps.length; i++) ol += '<li>' + esc(steps[i]) + '</li>';
    var canOpen = steps.length > 0;
    return '<div class="rc' + (open ? ' open' : '') + '"' + (canOpen ? ' role="button" tabindex="0" data-act="recipe-expand" aria-expanded="' + (open ? 'true' : 'false') + '"' : '') + ' data-key="' + esc(key) + '">' +
      '<div class="rc-top">' +
        '<span class="rc-emoji" aria-hidden="true">' + esc(it.emoji) + '</span>' +
        '<b class="rc-name" title="' + esc(it.title) + '">' + esc(it.title) + '</b>' +
        '<span class="rc-cat ' + esc(CAT_CLS[it.category] || '') + '">' + esc(it.category || '한식') + '</span>' +
        '<span class="rc-badge' + (it.ai ? ' ai' : '') + '">' + (it.ai ? 'AI 100%' : '100%') + '</span>' +
        (canOpen ? '<span class="rc-caret" aria-hidden="true">▼</span>' : '') +
      '</div>' +
      '<p class="rc-line">' + esc(ing) + '</p>' +
      recipeLinksHtml(it.kind, it.title) +
      (canOpen ? '<div class="rc-steps"><ol>' + ol + '</ol></div>' : '') +
      '</div>';
  }

  function toggleRecipeCard(el) {
    if (!el) return;
    var on = !el.classList.contains('open');
    el.classList.toggle('open', on);
    el.setAttribute('aria-expanded', on ? 'true' : 'false');
    var key = el.getAttribute('data-key') || '';
    if (!key) return;
    if (!ui.openRecipe) ui.openRecipe = {};
    if (on) ui.openRecipe[key] = 1; else delete ui.openRecipe[key];
  }

  /* 카테고리 필터 칩 + 정렬 선택 — 카테고리마다 지금 100% 만들 수 있는 개수를 함께 보여준다. */
  function recipeToolsHtml(counts, filter) {
    var chips = '', cols = [{ k: 'all', n: '전체' }], i;
    for (i = 0; i < CATEGORIES.length; i++) cols.push({ k: CATEGORIES[i], n: CATEGORIES[i] });
    for (i = 0; i < cols.length; i++) {
      var ck = cols[i].k, cn = counts[ck] || 0, on = filter === ck;
      chips += '<button class="rc-chip' + (on ? ' on' : '') + (cn ? '' : ' zero') + '" type="button" data-act="recipe-cat" data-cat="' + esc(ck) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        esc(cols[i].n) + '<b>' + cn + '</b></button>';
    }
    var now = normRecipeSort(ui.recipeSort);
    var sorts = [['new', '최신순'], ['time', '조리시간 짧은 순'], ['name', '이름순']];
    var opts = '';
    for (i = 0; i < sorts.length; i++) {
      opts += '<option value="' + sorts[i][0] + '"' + (now === sorts[i][0] ? ' selected' : '') + '>' + sorts[i][1] + '</option>';
    }
    return '<div class="rc-tools">' +
      '<div class="rc-cats" role="group" aria-label="레시피 카테고리">' + chips + '</div>' +
      '<select class="rc-sort" data-sel="recipe-sort" aria-label="레시피 정렬">' + opts + '</select>' +
      '</div>';
  }

  function renderRecipes() {
    var sec = $('recipeSec'); if (!sec) return;
    var all = fullRecipes();
    var counts = recipeCatCounts(all);
    var filter = (ui.recipeCat === 'all' || CATEGORIES.indexOf(ui.recipeCat) >= 0) ? ui.recipeCat : 'all';
    var picked = filter === 'all' ? all : all.filter(function (r) { return (r.category || '한식') === filter; });
    var list = sortRecipes(picked, normRecipeSort(ui.recipeSort));
    var shown = ui.recipeAll ? list : list.slice(0, 6);
    var cards = '';
    for (var i = 0; i < shown.length; i++) cards += recipeCardHtml(shown[i]);
    var more = list.length > 6 ? '<div class="more-row"><button class="btn sm sub" type="button" data-act="recipe-toggle">' + (ui.recipeAll ? '접기' : '레시피 ' + list.length + '개 모두 보기') + '</button></div>' : '';

    var at = (state.recipes && state.recipes.updatedAt) || state.settings.recipesAt, atTxt = '';
    if (at) {
      var d = new Date(at);
      if (!isNaN(d.getTime())) atTxt = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' 업데이트';
    }
    var btn = '';
    if (!ui.readOnly) {
      btn = '<button class="btn sm rc-refresh" type="button" data-act="recipe-refresh"' + (ui.aiBusy ? ' disabled' : '') + '>' + (ui.aiBusy ? '⏳ 업데이트 중…' : '✨ 업데이트') + '</button>';
    }
    var loading = ui.aiBusy ? '<div class="rc-loading"><span class="ring"></span><span>지금 있는 재료로 AI가 레시피를 고르는 중…</span></div>' : '';
    var body = list.length ? '<div class="recipe-grid">' + cards + '</div>' + more : '';
    var tools = all.length ? recipeToolsHtml(counts, filter) : '';
    var libReady = !!(state.recipes && (state.recipes.updatedAt || (state.recipes.recipes || []).length));
    var empty = '';
    if (!list.length && !ui.aiBusy) {
      if (filter !== 'all') {
        empty = '<p class="empty rc-empty">' + esc(filter) + ' 요리 중 지금 재료로 100% 만들 수 있는 요리가 없어요.<br>' +
          '<button class="link-btn" type="button" data-act="recipe-cat" data-cat="all">전체 레시피 보기</button></p>';
      } else {
        empty = libReady
          ? '<p class="empty rc-empty">지금 있는 재료로 100% 만들 수 있는 요리가 아직 없어요.<br>재료를 채운 뒤 ✨ 업데이트를 눌러 보세요.</p>'
          : '<p class="empty rc-empty">레시피를 불러오는 중…</p>';
      }
    }

    sec.innerHTML = '<div class="card-head"><h2>' + esc(secTitle('recipe')) + (list.length ? ' <span class="count">' + list.length + '</span>' : '') + '</h2>' + btn + (atTxt ? '<span class="rc-updated">' + esc(atTxt) + '</span>' : '') + '</div>' +
      tools + loading + body + empty;
  }

  /* ---------- 레시피 링크 ---------- */
  function openLinkModal(kind, title) {
    if (ui.readOnly) return;
    ui.linkKey = kind + ':' + String(title || '').trim().toLowerCase();
    ui.linkTitle = title;
    var links = linksFor(kind, title);
    $('linkTitle').textContent = '🔗 ' + title + ' 링크';
    $('linkBody').innerHTML = '<div class="form">' +
      '<p class="note">유튜브 영상·쇼츠 주소나 블로그·문서 링크를 붙여 넣으면 레시피 카드에 바로 보여요.</p>' +
      '<label>유튜브 영상 / 쇼츠<input id="lnk1" type="url" inputmode="url" placeholder="https://youtu.be/..." value="' + esc(links[0] || '') + '"></label>' +
      '<label>참고 링크 1<input id="lnk2" type="url" inputmode="url" placeholder="https://..." value="' + esc(links[1] || '') + '"></label>' +
      '<label>참고 링크 2<input id="lnk3" type="url" inputmode="url" placeholder="https://..." value="' + esc(links[2] || '') + '"></label>' +
      '<p class="form-msg" id="linkMsg"></p>' +
      '<button class="btn wide" type="button" data-act="link-save">저장</button>' +
      (links.length ? '<button class="btn wide ghost" type="button" data-act="link-clear">링크 모두 지우기</button>' : '') +
      '<p class="note">비워 두고 저장하면 그 칸은 지워져요. http로 시작하는 주소만 저장돼요.</p>' +
      '</div>';
    showModal('linkModal');
  }
  function saveLinks() {
    var vals = [fieldVal('lnk1').trim(), fieldVal('lnk2').trim(), fieldVal('lnk3').trim()];
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i]) continue;
      if (!/^https?:\/\/\S+$/i.test(vals[i])) {
        var mm = $('linkMsg'); if (mm) mm.textContent = 'http:// 또는 https:// 로 시작하는 주소만 넣어 주세요.';
        return;
      }
      out.push(vals[i].slice(0, 400));
    }
    if (!state.settings.links) state.settings.links = {};
    if (out.length) state.settings.links[ui.linkKey] = out;
    else delete state.settings.links[ui.linkKey];
    markDirty('settings');
    closeModal('linkModal');
    renderRecipes();
    toast(out.length ? '🔗 링크를 저장했어요' : '링크를 지웠어요');
  }

