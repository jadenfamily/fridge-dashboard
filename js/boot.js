/* 냉장고 파먹기 · 게이트 · 부팅 · 원격 로드 · 시작 */
'use strict';

  /* ============ 게이트 ============ */
  /* 계정별 대시보드 접근 권한 — 가족 허브(/home/)의 👥 계정 설정과 같은 규칙이에요. */
  var DASH_ID = 'fridge';
  var DASH_IDS = ['kids', 'fridge', 'ledger'];
  var DASH_DEFAULTS = {
    admin: ['kids', 'fridge', 'ledger'],
    parent: ['kids', 'fridge', 'ledger'],
    viewer: ['kids', 'fridge', 'ledger'],
    child: ['kids']
  };
  function dashboardsFor(u) {
    if (!u) return [];
    if (u.role === 'admin') return DASH_IDS.slice();
    if (Object.prototype.toString.call(u.dashboards) === '[object Array]') {
      var out = [];
      for (var i = 0; i < u.dashboards.length; i++) {
        var id = String(u.dashboards[i] == null ? '' : u.dashboards[i]);
        if (DASH_IDS.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
      }
      return out;
    }
    var def = DASH_DEFAULTS[u.role] || DASH_IDS;
    return def.slice();
  }
  function dashAllowed(u) { return dashboardsFor(u).indexOf(DASH_ID) >= 0; }

  function showLock() {
    $('appRoot').hidden = true;
    if ($('gateScreen')) { $('gateScreen').hidden = true; $('gateScreen').removeAttribute('data-loading'); }
    $('lockScreen').hidden = false;
    var who = $('lockWho');
    if (who) {
      who.textContent = (cloud.me ? ((cloud.me.name || cloud.me.id) + ' 계정은 이 대시보드를 열 수 없어요.') : '') +
        ' 허브에서 관리자에게 요청해 주세요.';
    }
  }

  function showGate(mode, msg) {
    $('appRoot').hidden = true;
    if ($('lockScreen')) $('lockScreen').hidden = true;
    $('gateScreen').hidden = false;
    $('gateScreen').removeAttribute('data-loading');
    ui.gateMode = mode || '';
    var note = $('gateMsg');
    if (note) note.textContent = msg || (mode === 'setup'
      ? '아직 이 기기가 저장소에 연결되지 않았어요. 가족 허브에서 한 번만 연결해 주세요.'
      : '가족 허브에서 로그인하면 여기서도 바로 이어서 쓸 수 있어요.');
  }

  function wireGate() {
    var form = $('gateForm');
    if (form) form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = $('gMsg');
      var owner = fieldVal('gOwner').trim(), repo = fieldVal('gRepo').trim(), token = fieldVal('gToken').trim();
      function fail(t) { if (msg) { msg.className = 'gate-msg'; msg.textContent = t; } }
      if (!owner || !repo || !token) return fail('아이디, 저장소, 토큰을 모두 넣어 주세요.');
      if (!/^(gh[pousr]_|github_pat_)/.test(token)) return fail('GitHub 토큰 형식이 아니에요. (github_pat_… )');
      var btn = $('gBtn'); if (btn) { btn.disabled = true; btn.textContent = '연결하는 중…'; }
      try {
        var res = await window.fetch(API_BASE + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), { headers: ghHeaders(token), cache: 'no-store' });
        if (res.status === 401) return fail('토큰이 올바르지 않아요.');
        if (res.status === 404) return fail('저장소를 찾을 수 없어요. 아이디·저장소 이름을 확인해 주세요.');
        if (!res.ok) return fail('저장소를 확인하지 못했어요. (HTTP ' + res.status + ')');
        var info = await res.json();
        if (info && info.private === false) return fail('비공개(private) 저장소만 연결할 수 있어요.');
        if (info && info.permissions && info.permissions.push === false) return fail('토큰에 쓰기 권한이 없어요. Contents를 Read and write로 주세요.');
        saveDevice({ owner: owner, repo: repo, token: token, branch: 'main', at: Date.now() });
        if (msg) { msg.className = 'gate-msg ok'; msg.textContent = '연결했어요! 가족 허브에서 비밀번호로 로그인한 뒤 이 화면을 새로고침해 주세요.'; }
      } catch (err) {
        fail('연결에 실패했어요. 인터넷 연결을 확인해 주세요.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '연결하기'; }
      }
    });
  }

  /* ============ 부팅 ============ */
  async function boot() {
    cloud.sha = loadShaCache();
    var local = loadLocal();
    if (local) hydrateLocal(local);
    if (!(state.recipes && state.recipes.recipes.length)) state.recipes = seedRecipes();
    cloud.conn = loadDevice();
    renderSyncPill();
    if (!cloud.conn) { showGate('setup'); return; }
    var sess = loadSession();
    if (!sess) { showGate('login'); return; }
    var res = null;
    try { res = await ghGet('config/users.json'); } catch (e) { res = null; }
    if (res && res.status === 401) {
      showGate('login', '토큰이 만료됐어요. 가족 허브에서 기기를 다시 연결해 주세요.');
      return;
    }
    if (res && res.ok && res.data && Object.prototype.toString.call(res.data.users) === '[object Array]') {
      cloud.users = res.data;
      var u = findUser(sess.id);
      if (!u) {
        lsDel(SESSION_KEY); ssDel(SESSION_KEY);
        showGate('login', '계정 정보를 찾을 수 없어요. 가족 허브에서 다시 로그인해 주세요.');
        return;
      }
      cloud.me = { id: u.id, name: u.name || u.id, role: ROLES[u.role] ? u.role : 'viewer', dashboards: dashboardsFor(u) };
      cloud.session = sess;
    } else {
      /* 오프라인이거나 계정 파일이 없을 때: 기기에 저장된 세션으로 계속 */
      cloud.me = { id: sess.id, name: sess.name, role: sess.role, dashboards: dashboardsFor(sess) };
      cloud.session = sess;
    }
    if (!dashAllowed(cloud.me)) { showLock(); return; }
    enterApp();
  }

  function enterApp() {
    lsSet(HUB_LAST_KEY, 'fridge'); /* 가족 허브(/home/)의 '최근 사용' 표시용 */
    initTab();
    applyUserUi();
    renderAll();
    aiSyncShared();
    return showLoadingThenApp();
  }

  function waitMs(ms) { return new Promise(function (res) { window.setTimeout(res, ms); }); }

  /* 첫 로딩: 게이트의 로딩 안내를 보여 준 채 원격 데이터를 기다리고, 다 오면 앱을 한 번에 연다.
     네트워크가 없거나 BOOT_WAIT_MS를 넘기면 기기에 있던 자료로 바로 넘어간다. */
  async function showLoadingThenApp() {
    var gate = $('gateScreen');
    $('appRoot').hidden = true;
    if ($('lockScreen')) $('lockScreen').hidden = true;
    if (gate) { gate.hidden = false; gate.setAttribute('data-loading', '1'); }
    var msg = $('gateMsg'); if (msg) msg.textContent = '데이터를 불러오는 중…';
    if (navigator.onLine !== false) {
      try { await Promise.race([loadRemote(), waitMs(BOOT_WAIT_MS)]); } catch (e) { /* 캐시로 계속 */ }
    }
    renderAll();
    if (gate) { gate.hidden = true; gate.removeAttribute('data-loading'); }
    $('appRoot').hidden = false;
  }

  async function loadRemote() {
    if (!cloud.conn || !cloud.me) return;
    setSync('syncing');
    var r = await Promise.all([ghGet(PATH_INV), ghGet(PATH_MEALS), ghGet(PATH_SET), ghGet(PATH_DAILY), ghGet(PATH_RECIPES)]);
    var okAll = true;

    if (r[0].ok && r[0].data && !cloud.dirty.inventory) {
      state.inventory = normalizeInventory(r[0].data);
    } else if (r[0].ok && r[0].missing) {
      if (!cloud.dirty.inventory) {
        if (!state.inventory.items.length) state.inventory = seedInventory();
        cloud.dirty.inventory = true;
      }
    } else if (!r[0].ok) { okAll = false; }

    if (r[1].ok && r[1].data && !cloud.dirty.meals) state.meals = normalizeMeals(r[1].data);
    else if (r[1].ok && r[1].missing) cloud.dirty.meals = true;
    else if (!r[1].ok) okAll = false;

    if (r[2].ok && r[2].data && !cloud.dirty.settings) state.settings = normalizeSettings(r[2].data);
    else if (r[2].ok && r[2].missing) cloud.dirty.settings = true;
    else if (!r[2].ok) okAll = false;

    if (r[3].ok && r[3].data && !cloud.dirty.daily) state.daily = normalizeDaily(r[3].data);
    else if (r[3].ok && r[3].missing) cloud.dirty.daily = true;
    else if (!r[3].ok) okAll = false;

    /* 레시피 도서관: 없으면 기본 요리로 한 번만 만들고, 있으면 그대로 불러온다. */
    if (!r[4].ok) { okAll = false; if (!(state.recipes && state.recipes.recipes.length)) state.recipes = seedRecipes(); }
    else if (cloud.dirty.recipes) { /* 이 기기에 아직 저장 안 된 변경이 있으면 그대로 둔다 */ }
    else if (r[4].missing || !r[4].data || Object.prototype.toString.call(r[4].data.recipes) !== '[object Array]') {
      state.recipes = seedRecipes();
      if (canEdit()) cloud.dirty.recipes = true;
    } else {
      state.recipes = normalizeRecipes(r[4].data);
    }

    try { backfillDaily(); } catch (e) { /* 기록 백필 실패는 무시 */ }

    saveLocal();
    renderAll();
    if (!okAll) setSync(navigator.onLine === false ? 'offline' : 'error');
    else if (anyDirty()) { setSync('syncing'); scheduleSync(); }
    else setSync('ok');
  }

  /* ============ 시작 ============ */
  wireGate();
  boot();
