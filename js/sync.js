/* 냉장고 파먹기 · GitHub API · 동기화 */
'use strict';

  /* ============ GitHub API ============ */
  function ghHeaders(token) {
    return {
      'Authorization': 'Bearer ' + (token || (cloud.conn && cloud.conn.token) || ''),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function ghBase() { return API_BASE + '/repos/' + encodeURIComponent(cloud.conn.owner) + '/' + encodeURIComponent(cloud.conn.repo); }
  function b64encodeUtf8(str) {
    var bytes = new TextEncoder().encode(String(str));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }
  function b64decodeUtf8(b64) {
    var bin = window.atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(bin));
  }
  function loadShaCache() { try { return JSON.parse(lsGet(SHA_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function rememberSha(p, sha) { if (!p || !sha) return; cloud.sha[p] = sha; lsSet(SHA_KEY, JSON.stringify(cloud.sha || {})); }

  async function ghGet(path) {
    if (!cloud.conn) return { ok: false, status: 0, error: '연결 전' };
    var branch = cloud.conn.branch || 'main';
    var url = ghBase() + '/contents/' + path + '?ref=' + encodeURIComponent(branch) + '&_=' + Date.now();
    try {
      var res = await window.fetch(url, { headers: ghHeaders(), cache: 'no-store' });
      if (res.status === 404) return { ok: true, missing: true };
      if (res.status === 401) return { ok: false, status: 401, error: '토큰이 올바르지 않아요' };
      if (res.status === 403) return { ok: false, status: 403, error: '권한이 없어요 (Contents: Read and write)' };
      if (!res.ok) return { ok: false, status: res.status, error: 'HTTP ' + res.status };
      var j = await res.json();
      if (Object.prototype.toString.call(j) === '[object Array]') return { ok: true, list: j };
      var text = j && j.content ? b64decodeUtf8(j.content) : '';
      var data = null;
      if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
      rememberSha(path, j && j.sha);
      return { ok: true, data: data, sha: j && j.sha, raw: text };
    } catch (e) {
      return { ok: false, status: 0, error: '네트워크에 연결하지 못했어요' };
    }
  }

  async function ghPut(path, obj, message) {
    if (!cloud.conn) return { ok: false, status: 0, error: '연결 전' };
    var payload = {
      message: message || ('냉장고 대시보드: ' + path),
      content: b64encodeUtf8(JSON.stringify(obj, null, 2)),
      branch: cloud.conn.branch || 'main'
    };
    if (cloud.sha[path]) payload.sha = cloud.sha[path];
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var res = await window.fetch(ghBase() + '/contents/' + path, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(payload) });
        if (res.ok) {
          var j = await res.json();
          rememberSha(path, j && j.content && j.content.sha);
          return { ok: true };
        }
        if (res.status === 409 || res.status === 422 || res.status === 404) {
          var cur = await ghGet(path);
          if (!cur.ok) return { ok: false, status: cur.status, error: cur.error };
          if (cur.missing) delete payload.sha; else payload.sha = cur.sha;
          continue;
        }
        if (res.status === 401) return { ok: false, status: 401, error: '토큰이 올바르지 않아요' };
        if (res.status === 403) return { ok: false, status: 403, error: '쓰기 권한이 없어요' };
        return { ok: false, status: res.status, error: 'HTTP ' + res.status };
      } catch (e) {
        return { ok: false, status: 0, error: '네트워크에 연결하지 못했어요' };
      }
    }
    return { ok: false, status: 409, error: '다른 기기에서 먼저 저장했어요' };
  }

  /* ============ 동기화 ============ */
  function setSync(st) { cloud.status = st; cloud.statusAt = Date.now(); renderSyncPill(); syncPillTail(); }
  function syncText() {
    var d = new Date(cloud.statusAt || Date.now());
    return cloud.status === 'ok' ? ('마지막 저장 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())) :
      cloud.status === 'error' ? '마지막 저장 실패 — 인터넷과 권한을 확인해 주세요' :
      cloud.status === 'offline' ? '오프라인 · 이 기기에만 저장 중' :
      cloud.saving ? '저장 중…' : '아직 저장 기록이 없어요';
  }
  function anyDirty() { return cloud.dirty.inventory || cloud.dirty.meals || cloud.dirty.settings || cloud.dirty.daily || cloud.dirty.recipes; }
  function renderSyncPill() {
    var el = $('syncPill');
    if (!el) return;
    if (!cloud.conn) { el.className = 'sync-pill'; el.textContent = '☁️ 연결 전'; return; }
    if (!cloud.me) { el.className = 'sync-pill'; el.textContent = '🔐 로그인 전'; return; }
    if (anyDirty()) {
      el.className = 'sync-pill sync';
      el.textContent = cloud.saving ? '☁️ 저장 중…' : '☁️ 저장 대기';
      return;
    }
    if (cloud.status === 'offline') { el.className = 'sync-pill off'; el.textContent = '📴 오프라인 · 기기에 저장'; return; }
    if (cloud.status === 'error') { el.className = 'sync-pill err'; el.textContent = '⚠️ 동기화 오류'; return; }
    if (cloud.status === 'syncing') { el.className = 'sync-pill sync'; el.textContent = '☁️ 저장 중…'; return; }
    if (cloud.status === 'ok') {
      el.className = 'sync-pill ok';
      var d = new Date(cloud.statusAt || Date.now());
      el.textContent = '☁️ 저장됨 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      return;
    }
    el.className = 'sync-pill';
    el.textContent = '☁️ 준비';
  }
  function syncPillTail() { /* settings의 저장 상태 줄도 같이 갱신 */
    var si = $('syncInfo');
    if (si) si.textContent = syncText();
  }
  function markDirty(kind) {
    if (kind === 'inventory') cloud.dirty.inventory = true;
    if (kind === 'meals') cloud.dirty.meals = true;
    if (kind === 'settings') cloud.dirty.settings = true;
    if (kind === 'daily') cloud.dirty.daily = true;
    if (kind === 'recipes') cloud.dirty.recipes = true;
    saveLocal();
    renderSyncPill();
    scheduleSync();
  }
  function scheduleSync() {
    if (!cloud.conn || !cloud.me) return;
    if (cloud.timer) window.clearTimeout(cloud.timer);
    cloud.timer = window.setTimeout(function () { cloud.timer = 0; flushSync(); }, 900);
  }
  async function flushSync() {
    if (!cloud.conn || !cloud.me || cloud.saving) return;
    if (!anyDirty()) { return; }
    cloud.saving = true;
    setSync('syncing');
    var jobs = [];
    if (cloud.dirty.inventory) jobs.push({ kind: 'inventory', path: PATH_INV, obj: { version: 1, updatedAt: nowIso(), items: state.inventory.items } });
    if (cloud.dirty.meals) jobs.push({ kind: 'meals', path: PATH_MEALS, obj: { version: 1, updatedAt: nowIso(), budget: state.meals.budget, weeks: state.meals.weeks, expenses: state.meals.expenses } });
    if (cloud.dirty.settings) jobs.push({ kind: 'settings', path: PATH_SET, obj: { version: 1, updatedAt: nowIso(), prefs: state.settings.prefs, links: state.settings.links, sectionOrder: state.settings.sectionOrder, sectionTitles: state.settings.sectionTitles, budgetDefault: budgetDefault(), lowPct: lowPct(), pctMinDefault: pctMinDefault(), minQtyDefault: minQtyDefault() } });
    if (cloud.dirty.recipes) jobs.push({ kind: 'recipes', path: PATH_RECIPES, obj: { version: 1, updatedAt: nowIso(), recipes: state.recipes.recipes } });
    if (cloud.dirty.daily) jobs.push({ kind: 'daily', path: PATH_DAILY, obj: { version: 1, updatedAt: nowIso(), days: state.daily.days } });
    var failed = null;
    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      var r = await ghPut(job.path, job.obj, '냉장고 대시보드 저장: ' + job.kind);
      if (r.ok) {
        cloud.dirty[job.kind] = false;
        state[job.kind].updatedAt = job.obj.updatedAt;
      } else {
        failed = r;
        break;
      }
    }
    cloud.saving = false;
    saveLocal();
    if (failed) {
      setSync(navigator.onLine === false ? 'offline' : 'error');
      if (failed.status === 401 || failed.status === 403) toast('저장 권한이 없어요. 가족 허브에서 기기를 다시 연결해 주세요.', true);
    } else {
      setSync(navigator.onLine === false ? 'offline' : 'ok');
    }
    if (anyDirty()) scheduleSync();
    syncPillTail();
  }

