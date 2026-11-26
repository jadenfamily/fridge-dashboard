/* 냉장고 파먹기 · 가족 공유 AI 설정(AES-GCM) · 3사 AI 호출 · 설정 화면 */
'use strict';

  /* ============ 가족 공유 AI 설정 (AES-GCM) ============
     config/ai.json 에 암호문만 올려 두고, 가족 저장소에 연결된 모든 기기가
     같은 암호키(저장소 주소에서 유도)로 풀어서 씁니다. 평문은 GitHub에 남지 않아요.
     형식은 가족 AI 사무실(office.html)과 같아서 양쪽에서 같이 씁니다. */
  function aiCrypto() { return (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null; }
  function aiPass() {
    var c = cloud.conn || {};
    return String(c.owner || '').toLowerCase() + '/' + String(c.repo || '').toLowerCase() + '::jadenfamily-ai-v1';
  }
  function aiB64(buf) {
    var b = new Uint8Array(buf), s = '', i;
    for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return window.btoa(s);
  }
  function aiUnB64(txt) {
    var bin = window.atob(String(txt || '').replace(/\s/g, '')), i;
    var out = new Uint8Array(bin.length);
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function aiKey(salt, iter) {
    var sub = aiCrypto();
    if (!sub) throw new Error('이 브라우저에서는 암호화를 쓸 수 없어요');
    var raw = new TextEncoder().encode(aiPass());
    if (!salt) {
      var d = await sub.digest('SHA-256', raw);
      return sub.importKey('raw', d, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    var base = await sub.importKey('raw', raw, { name: 'PBKDF2' }, false, ['deriveKey']);
    return sub.deriveKey({ name: 'PBKDF2', salt: salt, iterations: Math.max(1, Number(iter) || 1), hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aiSeal(obj) {
    var sub = aiCrypto();
    if (!sub) throw new Error('이 브라우저에서는 암호화를 쓸 수 없어요');
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    var k = await aiKey(salt, AI_ITER);
    var ct = await sub.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj && typeof obj === 'object' ? obj : {})));
    return { version: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: AI_ITER, salt: aiB64(salt), iv: aiB64(iv), ct: aiB64(ct), updatedAt: nowIso() };
  }
  async function aiOpen(p) {
    if (!p || !p.iv || !p.ct) return null;
    var sub = aiCrypto();
    if (!sub) return null;
    var k = await aiKey(p.salt ? aiUnB64(p.salt) : null, Number(p.iter) || 1);
    var pt = await sub.decrypt({ name: 'AES-GCM', iv: aiUnB64(p.iv) }, k, aiUnB64(p.ct));
    var txt = new TextDecoder('utf-8').decode(new Uint8Array(pt));
    var j = null;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (j && typeof j === 'object') return j;
    return txt ? { key: String(txt) } : null;
  }
  async function aiDecrypt(p) {
    var j = null;
    try { j = await aiOpen(p); } catch (e) { j = null; }
    return j ? String(j.key || j.gemini || '') : '';
  }
  function aiState() { try { return JSON.parse(lsGet(AI_STATE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function aiSetState(o) { lsSet(AI_STATE_KEY, JSON.stringify(o || {})); }
  function sharedKey() { return String(lsGet(KEY_SHARED_KEY) || '').trim(); }
  function keyOrigin() { return sharedKey() ? 'shared' : (lsGet(KEY_KEY) ? 'local' : ''); }

  /* 제공자별 키 — 이 기기에 들고 있다가, 가족 공유 설정을 읽을 때 갱신된다. */
  function aiKeyMap() {
    var m = {};
    try { m = JSON.parse(lsGet(AI_KEYS_KEY) || '{}') || {}; } catch (e) { m = {}; }
    return (m && typeof m === 'object') ? m : {};
  }
  function aiSetKeyMap(m) { try { lsSet(AI_KEYS_KEY, JSON.stringify(m || {})); } catch (e) {} }
  function aiKeyOf(pid) {
    var v = String(aiKeyMap()[pid] || '').trim();
    if (pid === 'gemini' && !v) v = sharedKey() || String(lsGet(KEY_KEY) || '').trim();
    return v;
  }
  function aiProviderById(pid) {
    for (var i = 0; i < AI_PROVIDERS.length; i++) if (AI_PROVIDERS[i].id === pid) return AI_PROVIDERS[i];
    return null;
  }
  function aiReadyProviders(vision) {
    var out = [];
    for (var i = 0; i < AI_PROVIDERS.length; i++) {
      var p = AI_PROVIDERS[i];
      if (!aiKeyOf(p.id)) continue;
      if (vision && !p.vision.length) continue;
      out.push(p);
    }
    return out;
  }
  function aiReady(vision) { return aiReadyProviders(!!vision).length > 0; }
  function aiPref() {
    var v = String(lsGet(AI_PREF_KEY) || '').trim();
    return aiProviderById(v) ? v : '';
  }
  function aiSetPref(pid) { try { lsSet(AI_PREF_KEY, String(pid || '')); } catch (e) {} }
  /* 고른 제공자를 1순위로, 나머지 둘을 뒤에 붙인다. */
  function aiOrder(vision) {
    var list = aiReadyProviders(vision), pref = aiPref(), out = [], i;
    for (i = 0; i < list.length; i++) if (list[i].id === pref) out.push(list[i]);
    for (i = 0; i < list.length; i++) if (list[i].id !== pref) out.push(list[i]);
    return out;
  }

  /* 가족 AI 설정(config/ai.json)에서 제공자 키를 꺼내는 규칙 — office.html과 같다.
     {geminiKeys:[],openrouterKeys:[],groqKeys:[]} 또는 {gemini,openrouter,groq,key} 둘 다 읽는다. */
  function keysFromAiConfig(obj) {
    var out = { gemini: '', openrouter: '', groq: '' };
    if (!obj || typeof obj !== 'object') return out;
    for (var i = 0; i < AI_PROVIDERS.length; i++) {
      var pid = AI_PROVIDERS[i].id, arr = obj[pid + 'Keys'], v = '';
      if (Object.prototype.toString.call(arr) === '[object Array]') {
        for (var j = 0; j < arr.length; j++) {
          var s = String(arr[j] == null ? '' : arr[j]).trim();
          if (s) { v = s; break; }
        }
      }
      if (!v) v = String((pid === 'gemini' ? (obj.key || obj.gemini) : obj[pid]) || '').trim();
      out[pid] = v;
    }
    return out;
  }

  async function aiReadRemoteConfig() {
    var r = null;
    try { r = await ghGet(AI_PATH); } catch (e) { return { ok: false, missing: false, obj: null, error: 'offline' }; }
    if (!r || !r.ok) return { ok: false, missing: false, obj: null, error: (r && r.error) || 'offline' };
    if (r.missing) return { ok: true, missing: true, obj: null };
    var obj = null;
    try { obj = await aiOpen(r.data || {}); } catch (e) { obj = null; }
    return { ok: true, missing: false, obj: obj, raw: r.data || {} };
  }

  /* Gemini 키 저장 — 가족 설정을 통째로 덮어쓰지 않고, 다른 제공자 키와 토큰은 그대로 살린다. */
  async function aiPush(keyStr) {
    try {
      var cur = await aiReadRemoteConfig();
      var obj = (cur && cur.ok && cur.obj) ? cur.obj : {};
      var next = {};
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) next[k] = obj[k];
      next.key = String(keyStr || '');
      next.gemini = String(keyStr || '');
      var gk = Object.prototype.toString.call(next.geminiKeys) === '[object Array]' ? next.geminiKeys.filter(function (x) { return String(x || '').trim(); }) : [];
      if (gk.indexOf(String(keyStr || '')) < 0) gk.unshift(String(keyStr || ''));
      next.geminiKeys = gk;
      next.updatedAt = nowIso();
      var payload = await aiSeal(next);
      var r = await ghPut(AI_PATH, payload, '가족 AI 설정 저장 (Gemini 키)');
      if (!r.ok) return { ok: false, error: r.error || '공유 저장 실패' };
      return { ok: true, updatedAt: payload.updatedAt, obj: next };
    } catch (e) {
      return { ok: false, error: '암호화하지 못했어요' };
    }
  }
  /* Gemini 키만 지운다 — OpenRouter·Groq 키와 토큰은 그대로 살린다. */
  async function aiClearRemote() {
    try {
      var cur = await aiReadRemoteConfig();
      var obj = (cur && cur.ok && cur.obj) ? cur.obj : null;
      if (!obj) {
        var r0 = await ghPut(AI_PATH, { version: 1, alg: 'AES-GCM', cleared: true, updatedAt: nowIso() }, '가족 AI 설정에서 Gemini 키 삭제');
        return { ok: !!r0.ok, error: r0.error || '' };
      }
      var next = {};
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) next[k] = obj[k];
      next.key = '';
      next.gemini = '';
      next.geminiKeys = [];
      next.updatedAt = nowIso();
      var payload = await aiSeal(next);
      var r = await ghPut(AI_PATH, payload, '가족 AI 설정에서 Gemini 키 삭제');
      return { ok: !!r.ok, error: r.error || '', obj: r.ok ? next : null };
    } catch (e) {
      return { ok: false, error: '삭제하지 못했어요' };
    }
  }
  async function aiSyncShared() {
    if (!cloud.conn || !cloud.me) return;
    var local = String(lsGet(KEY_KEY) || '').trim();
    var st = aiState();
    var next = { source: st.source || '', updatedAt: st.updatedAt || '', at: Date.now(), note: '' };
    var r = null;
    try { r = await ghGet(AI_PATH); } catch (e) { r = null; }
    if (!r || !r.ok) {
      next.source = sharedKey() ? 'shared' : (local ? 'local' : 'none');
      next.note = 'offline';
      aiSetState(next); renderSettings(); return;
    }
    if (r.missing) {
      if (local && canEdit()) {
        var up = await aiPush(local);
        if (up.ok) { lsSet(KEY_SHARED_KEY, local); next.source = 'shared'; next.updatedAt = up.updatedAt; next.note = 'uploaded'; }
        else { next.source = 'local'; next.note = up.error || 'error'; }
      } else {
        next.source = local ? 'local' : 'none';
      }
      aiSetState(next); renderSettings(); return;
    }
    var p = r.data || {};
    var remoteAt = String(p.updatedAt || '');
    if (p.cleared) {
      lsDel(KEY_SHARED_KEY);
      aiSetKeyMap({});
      next.source = local ? 'local' : 'none';
      next.updatedAt = remoteAt;
      aiSetState(next); renderSettings(); return;
    }
    var obj = null;
    try { obj = await aiOpen(p); } catch (e) { obj = null; }
    if (!obj) {
      next.source = sharedKey() ? 'shared' : (local ? 'local' : 'none');
      next.note = 'decrypt';
      aiSetState(next); renderSettings(); return;
    }
    var km = keysFromAiConfig(obj);
    aiSetKeyMap(km);
    var remoteKey = km.gemini || '';
    /* Gemini 키 없이 OpenRouter·Groq만 있는 설정도 정상이다. */
    if (!remoteKey) {
      lsDel(KEY_SHARED_KEY);
      next.source = local ? 'local' : 'none';
      next.updatedAt = remoteAt;
      aiSetState(next); renderSettings(); renderRecipes(); return;
    }
    /* 이 기기에서 방금 저장한 키가 더 최신이면 이쪽을 올려서 가족 키로 맞춘다 */
    if (local && st.source === 'local' && st.updatedAt && (!remoteAt || st.updatedAt > remoteAt) && canEdit()) {
      var up2 = await aiPush(local);
      if (up2.ok) {
        lsSet(KEY_SHARED_KEY, local); next.source = 'shared'; next.updatedAt = up2.updatedAt;
        aiSetKeyMap(keysFromAiConfig(up2.obj));
      } else { next.source = 'local'; next.note = up2.error || 'error'; }
      aiSetState(next); renderSettings(); return;
    }
    lsSet(KEY_SHARED_KEY, remoteKey);
    next.source = 'shared';
    next.updatedAt = remoteAt;
    aiSetState(next);
    renderSettings(); renderRecipes();
  }

  /* ---------- AI 호출 (Gemini · OpenRouter · Groq) ---------- */
  function getKey() { return aiKeyOf('gemini'); }

  function msgForError(e) {
    var m = (e && e.message) ? e.message : String(e || '');
    if (m === 'NO_KEY' || m === 'NO_KEY_SET') return '설정에서 AI 키를 먼저 넣어 주세요.';
    if (/^TIMEOUT$/.test(m)) return 'AI가 20초 안에 답하지 않았어요. 잠시 후 다시 시도해 주세요.';
    if (/API key not valid|API_KEY_INVALID|API key expired|invalid[ _]api[ _]key|incorrect api key|unauthorized|HTTP 401|HTTP 403/i.test(m)) return 'AI 키가 올바르지 않아요. ⚙️ 설정에서 다시 확인해 주세요.';
    if (/quota|RESOURCE_EXHAUSTED|rate.?limit|too many|HTTP 429/i.test(m)) return '무료 사용량을 다 썼어요. 잠시 후 다시 시도해 주세요.';
    if (/^NETWORK$|네트워크|fetch|Failed to fetch|NetworkError/i.test(m)) return '인터넷에 연결하지 못했어요. 연결을 확인해 주세요.';
    if (/모델을 찾지 못했/.test(m)) return '쓸 수 있는 AI 모델을 찾지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (/형식에 맞지 않/.test(m)) return 'AI가 답을 제대로 주지 못했어요. 다시 시도해 주세요.';
    return m || '알 수 없는 오류가 생겼어요.';
  }

  function looseJson(text) {
    var t = String(text || '').trim();
    var f = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    var tries = [t, f], i;
    var a1 = f.indexOf('{'), b1 = f.lastIndexOf('}');
    var a2 = f.indexOf('['), b2 = f.lastIndexOf(']');
    if (a1 >= 0 && b1 > a1) tries.push(f.slice(a1, b1 + 1));
    if (a2 >= 0 && b2 > a2) tries.push(f.slice(a2, b2 + 1));
    for (i = 0; i < tries.length; i++) {
      if (!tries[i]) continue;
      try { return JSON.parse(tries[i]); } catch (e) { /* 다음 후보 */ }
    }
    throw new Error('JSON 아님');
  }

  /* 모델이 배열만 돌려주면 스키마가 기대하는 키에 담아 준다. */
  function aiNormalize(data, schema) {
    if (Object.prototype.toString.call(data) !== '[object Array]') return data;
    if (!schema || !schema.properties) return data;
    for (var k in schema.properties) {
      var p = schema.properties[k];
      if (p && p.type === 'ARRAY') { var o = {}; o[k] = data; return o; }
    }
    return data;
  }

  function aiErrText(status, json) {
    if (json && json.error) {
      if (typeof json.error === 'string') return json.error;
      if (json.error.message) return String(json.error.message);
    }
    var s = (json && json.message) ? String(json.message) : '';
    return s || ('HTTP ' + status);
  }

  /* 이 모델이 없어졌거나 쓸 수 없는 경우 — 같은 AI의 다음 모델로 넘어간다. */
  function aiModelMissing(status, msg) {
    if (status === 404) return true;
    if (status === 400 && /model|not found|not supported|unsupported|deprecat|does not exist/i.test(String(msg || ''))) return true;
    return false;
  }

  /* 모든 AI 요청은 20초 안에 끊는다 — '읽는 중…'에서 끝없이 멈춰 있지 않게. */
  async function aiFetchJson(url, opts) {
    var ctl = null, timer = 0, k;
    if (typeof window.AbortController === 'function') ctl = new window.AbortController();
    var o = {};
    for (k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (ctl) {
      o.signal = ctl.signal;
      timer = window.setTimeout(function () { try { ctl.abort(); } catch (e) {} }, AI_TIMEOUT_MS);
    }
    try {
      var res = await window.fetch(url, o);
      var txt = '';
      try { txt = await res.text(); } catch (e) { txt = ''; }
      var json = null;
      try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
      return { status: res.status, ok: res.ok, text: txt, json: json };
    } catch (e) {
      if ((e && e.name === 'AbortError') || (ctl && ctl.signal && ctl.signal.aborted)) throw new Error('TIMEOUT');
      throw new Error('NETWORK');
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function aiChoiceText(json) {
    var c = (json && json.choices && json.choices[0]) || null;
    var m = (c && c.message) || null;
    var content = m ? m.content : '';
    if (Object.prototype.toString.call(content) === '[object Array]') {
      var out = '', i;
      for (i = 0; i < content.length; i++) if (content[i] && content[i].text) out += content[i].text;
      return out;
    }
    return String(content == null ? '' : content);
  }

  function aiExample(s) {
    if (!s || typeof s !== 'object') return '';
    if (Object.prototype.toString.call(s.enum) === '[object Array]') return s.enum.join('|');
    if (s.type === 'OBJECT') {
      var o = {}, k;
      for (k in (s.properties || {})) if (Object.prototype.hasOwnProperty.call(s.properties, k)) o[k] = aiExample(s.properties[k]);
      return o;
    }
    if (s.type === 'ARRAY') return [aiExample(s.items)];
    if (s.type === 'NUMBER') return 0;
    if (s.type === 'BOOLEAN') return true;
    return '';
  }
  /* 스키마를 통째로 붙이면 모델이 스키마를 그대로 따라 쓰는 경우가 있어서, 짧은 예시 모양만 보여준다. */
  function aiJsonRule(schema) {
    if (!schema) return '';
    try {
      return '\n\n설명 없이 아래 예시와 같은 모양의 JSON 하나만 출력해(예시 값을 그대로 쓰지 말고 사진·재료에 맞게 채워).\n' + JSON.stringify(aiExample(schema));
    } catch (e) { return ''; }
  }

  async function aiCallGemini(key, model, req, schema) {
    var parts = [{ text: String(req.text || '') }];
    if (req.image) parts.push({ inline_data: { mime_type: req.image.mime || 'image/jpeg', data: req.image.b64 || '' } });
    var cfg = { temperature: 0.25, responseMimeType: 'application/json', maxOutputTokens: 3000 };
    if (schema) cfg.responseSchema = schema;
    var r = await aiFetchJson('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: cfg })
    });
    var em = aiErrText(r.status, r.json);
    if (aiModelMissing(r.status, em)) return { missing: true };
    if (!r.ok) return { err: em, status: r.status };
    var text = '';
    try {
      var ps = (r.json.candidates[0].content.parts) || [];
      for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].text) text += ps[i].text;
    } catch (e) { text = ''; }
    if (!text) return { err: '응답이 비어 있어요', status: 0 };
    try { return { data: aiNormalize(looseJson(text), schema) }; } catch (e) { return { err: '응답을 이해하지 못했어요', status: 0 }; }
  }

  async function aiCallOpenAI(pid, key, model, req, schema) {
    var url = pid === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    if (pid === 'openrouter') {
      headers['HTTP-Referer'] = 'https://jadenfamily.github.io/fridge-dashboard/';
      headers['X-Title'] = 'jadenfamily fridge';
    }
    var text = String(req.text || '') + aiJsonRule(schema);
    var content = req.image
      ? [{ type: 'text', text: text }, { type: 'image_url', image_url: { url: 'data:' + (req.image.mime || 'image/jpeg') + ';base64,' + (req.image.b64 || '') } }]
      : text;
    var r = await aiFetchJson(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: model, messages: [{ role: 'user', content: content }], temperature: 0.25, max_tokens: 3000 })
    });
    var em = aiErrText(r.status, r.json);
    if (aiModelMissing(r.status, em)) return { missing: true };
    if (!r.ok) return { err: em, status: r.status };
    var out = aiChoiceText(r.json);
    if (!out) return { err: '응답이 비어 있어요', status: 0 };
    try { return { data: aiNormalize(looseJson(out), schema) }; } catch (e) { return { err: '응답을 이해하지 못했어요', status: 0 }; }
  }

  function aiCallProvider(pid, key, model, req, schema) {
    if (pid === 'gemini') return aiCallGemini(key, model, req, schema);
    return aiCallOpenAI(pid, key, model, req, schema);
  }

  /* 모델 이름이 통째로 바뀌었을 때: Gemini가 실제로 쓸 수 있는 모델을 직접 물어본다. */
  async function geminiDiscover(key) {
    var r = await aiFetchJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key), { method: 'GET' });
    if (!r.ok || !r.json) return [];
    var list = r.json.models || [], pref = [], rest = [], i;
    for (i = 0; i < list.length; i++) {
      var m = list[i] || {};
      var id = String(m.name || '').replace(/^models\//, '');
      var methods = m.supportedGenerationMethods || [];
      if (methods.indexOf('generateContent') < 0) continue;
      if (!/^gemini-/.test(id)) continue;
      if (/(image|tts|live|transcribe|embedding|translate|omni|audio|robotics|computer-use|deep-research|antigravity)/i.test(id)) continue;
      if (/(flash-lite|flash).*lite/i.test(id)) pref.push(id);
      else if (/flash-lite/i.test(id)) pref.push(id);
      else if (/flash/i.test(id)) rest.push(id);
    }
    return pref.concat(rest).slice(0, 6);
  }

  /* 3사 중 고른 AI를 1순위로 부르고, 20초 타임아웃·429·오류·모델 없음이면 다음 AI로 넘어간다. */
  async function aiJSON(req, schema, opts) {
    opts = opts || {};
    var vision = !!opts.vision;
    var order = aiOrder(vision), tried = [], last = '', i, m;
    if (!order.length) throw new Error('NO_KEY');
    for (i = 0; i < order.length; i++) {
      var p = order[i], key = aiKeyOf(p.id);
      if (!key) continue;
      var models = (vision ? p.vision : p.text).slice();
      if (opts.onStatus) {
        try { opts.onStatus({ provider: p, tried: tried.slice() }); } catch (e) {}
      }
      var missingAll = true, res = null, k;
      for (k = 0; k < models.length; k++) {
        try { res = await aiCallProvider(p.id, key, models[k], req, schema); }
        catch (e) { res = { err: (e && e.message) || 'NETWORK', status: 0 }; }
        if (res && res.data) {
          if (!opts.validate || opts.validate(res.data)) { aiRemember(p.id, models[k]); return res.data; }
          last = p.label + ' 응답이 형식에 맞지 않았어요';
          missingAll = false;
          break;
        }
        if (res && res.missing) { last = p.label + ' 모델을 찾지 못했어요'; continue; }
        missingAll = false;
        last = (res && res.err) ? String(res.err) : 'error';
        /* 사용량 초과·서버 혼잡은 이 AI의 다른 모델이 받아줄 수 있다. 응답이 느린 경우(시간 초과)는 바로 다음 AI로. */
        var sc = (res && res.status) || 0;
        if ((sc === 429 || sc >= 500) && k + 1 < models.length) continue;
        break;
      }
      if (p.id === 'gemini' && missingAll) {
        var found = [];
        try { found = await geminiDiscover(key); } catch (e) { found = []; }
        for (k = 0; k < found.length && k < 4; k++) {
          var got = null;
          try { got = await aiCallProvider('gemini', key, found[k], req, schema); } catch (e) { got = null; }
          if (got && got.data) { aiRemember('gemini', found[k]); return got.data; }
          if (got && got.missing) continue;
          last = (got && got.err) ? String(got.err) : last;
          break;
        }
      }
      tried.push(p);
    }
    throw new Error(last || 'AI가 답하지 않았어요');
  }

  var aiLast = { pid: '', model: '' };
  /* 마지막으로 응답한 AI는 화면 표시에만 쓴다 — 사용자가 고른 기본 AI는 건드리지 않는다. */
  function aiRemember(pid, model) { aiLast = { pid: pid, model: model }; }
  function aiLastLabel() {
    var p = aiProviderById(aiLast.pid);
    return p ? p.label : '';
  }

  async function refreshAI() {
    if (ui.aiBusy) return;
    if (ui.readOnly) { toast('보기 전용 계정이라 레시피를 바꿀 수 없어요.', true); return; }
    if (!aiReady(false)) {
      /* 키가 없으면 기본 레시피(100% 매칭)만 새로 고른다. */
      ui.recipeAll = false;
      renderRecipes();
      var n0 = fullRecipes().length;
      toast(n0
        ? '지금 재료로 만드는 레시피 ' + n0 + '개 · AI 추천은 ⚙️ 설정에서 키를 넣어 주세요'
        : '지금 재료로 100% 되는 요리가 없어요 · AI 추천은 ⚙️ 설정에서 키를 넣어 주세요');
      return;
    }
    ui.aiBusy = true;
    ui.keyMsg = '';
    renderRecipes();
    try {
      var stock = inStock(state.inventory.items).map(function (it) { return it.name; });
      /* 이미 저장된 요리 이름을 프롬프트에 넣어 처음부터 겹치지 않는 새 요리를 받는다. */
      var savedLib = (state.recipes && state.recipes.recipes) || [];
      var savedTitles = [], si, st;
      for (si = 0; si < savedLib.length && savedTitles.length < 60; si++) {
        st = String((savedLib[si] && savedLib[si].title) || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        if (st) savedTitles.push(st);
      }
      var prompt = '너는 한국 가정의 냉장고 요리 도우미야. 아래 보유 재료만 써서 지금 100% 만들 수 있는 요리를 4~6개 추천해줘.\n' +
        '보유 재료: ' + stock.join(', ') + '\n' +
        (savedTitles.length ? '이미 저장된 요리(중복 제외): ' + savedTitles.join(', ') + '\n' : '') +
        '추천 방향: 요즘 유튜브·SNS에서 핫한 트렌디한 요리(원팬·초간단 인기 집밥)와 영양 균형 잡힌 건강식(고단백·채소·저당·저염 위주)을 골고루 섞어줘.\n' +
        '조건: 1) ingredients에는 보유 재료 이름만 넣고, 보유하지 않은 재료는 절대 넣지 마. (물·소금·식용유·후추는 집에 늘 있는 기본 양념이라 예외로 넣어도 됨) ' +
        '2) 조리 30분 이내 3) 아이도 같이 먹을 수 있는 순한 맛 위주 4) title, minutes(숫자), category, ingredients(재료 배열), steps(조리 순서 3~5단계 배열)를 채우기 ' +
        '5) category는 한식·양식·중식·일식·건강/간편 중 하나로 — 집밥·찌개·볶음류는 한식, 파스타·피자·구이·토스트는 양식, 짜장·짬뽕·마라·탕수육은 중식, 초밥·우동·덮밥·돈가스는 일식, 샐러드·요거트·가벼운 한 그릇은 건강/간편 ' +
        '6) 같은 요리를 중복해서 넣지 말고, 이미 저장된 요리와 이름이 겹치거나 사실상 같은 요리는 빼기.';
      var out = await aiJSON({ text: prompt }, SCHEMA_RECIPES, {
        validate: function (d) { return !!(d && Object.prototype.toString.call(d.recipes) === '[object Array]' && d.recipes.length); }
      });
      var list = (out && out.recipes) || [];
      var clean = [], stockNow = stockNames(), i;
      for (i = 0; i < list.length && i < 8; i++) {
        var r = list[i] || {};
        if (!r.title) continue;
        var ings = (r.ingredients || []).slice(0, 14).map(function (x) { return String(x).slice(0, 30); });
        if (!ings.length) continue;
        if (missingIngs(ings, stockNow).length) continue; /* 100% 안 되는 건 담지 않는다 */
        clean.push({
          title: String(r.title).slice(0, 60),
          minutes: Math.max(0, Math.round(num(r.minutes))),
          category: normCategory(r.category) || guessCategory(r.title, ings),
          ingredients: ings,
          steps: (r.steps || []).slice(0, 8).map(function (x) { return String(x).slice(0, 200); })
        });
      }
      if (!clean.length) throw new Error('지금 재료로 100% 만들 수 있는 요리를 받지 못했어요. 다시 시도해 주세요.');

      /* 도서관에 이미 있는 요리는 이름으로 비교해 건너뛴다. */
      var existing = (state.recipes && state.recipes.recipes) || [];
      var have = {}, key;
      for (i = 0; i < existing.length; i++) have[recipeKey(existing[i].title)] = 1;
      var fresh = [], now = Date.now();
      for (i = 0; i < clean.length; i++) {
        key = recipeKey(clean[i].title);
        if (!key || have[key]) continue;
        have[key] = 1;
        fresh.push({
          id: uid('ra'), title: clean[i].title, emoji: '✨', minutes: clean[i].minutes,
          category: clean[i].category,
          ingredients: clean[i].ingredients, steps: clean[i].steps,
          source: 'ai', createdAt: now + i
        });
      }
      ui.recipeAll = false;
      if (!fresh.length) {
        toast('새로운 레시피가 없어 기존 목록을 유지했어요');
      } else {
        /* 새로 담은 요리가 바로 보이도록 카테고리 필터는 전체로 돌려둔다 */
        if (ui.recipeCat !== 'all') ui.recipeCat = 'all';
        state.recipes.recipes = existing.concat(fresh);
        state.recipes.updatedAt = nowIso();
        markDirty('recipes');
        toast('새 레시피 ' + fresh.length + '개 추가됐어요');
      }
    } catch (e) {
      toast(msgForError(e), true);
    } finally {
      ui.aiBusy = false;
      renderRecipes();
    }
  }

  /* ---------- 설정 ---------- */
  function renderSettings() {
    var body = $('settingsBody'); if (!body) return;
    var key = getKey();
    var origin = keyOrigin();
    var keyBadge = origin === 'shared' ? '<span class="badge ok">가족 공유 키 연결됨 ✓</span>' :
      (origin === 'local' ? '<span class="badge ok">이 기기에만 저장됨</span>' : '<span class="badge">없음</span>');
    var keyInfo = origin === 'shared' ? '가족 모두 같은 키를 써요. 여기서 바꾸면 모든 기기에 함께 적용돼요.' :
      (origin === 'local' ? (canEdit() ? '이 기기에만 있어요. 가족과 함께 쓰려면 공유해 주세요.' : '이 기기에만 저장된 키예요.') : '영수증 자동 인식과 AI 식단 추천에 써요.');
    var keyMsg = ui.keyMsg ? '<p class="form-msg' + (ui.keyMsg.indexOf('ok:') === 0 ? ' ok' : '') + '">' + esc(ui.keyMsg.replace(/^(ok|err):/, '')) + '</p>' : '<p class="form-msg"></p>';
    var d = new Date(cloud.statusAt || Date.now());
    var syncTxt = syncText();
    var pref = aiPref(), pickBtns = '', pi, pv, on;
    if (!pref) {
      for (pi = 0; pi < AI_PROVIDERS.length; pi++) {
        if (aiKeyOf(AI_PROVIDERS[pi].id)) { pref = AI_PROVIDERS[pi].id; break; }
      }
    }
    for (pi = 0; pi < AI_PROVIDERS.length; pi++) {
      pv = AI_PROVIDERS[pi];
      on = (pv.id === pref);
      var hasKey = !!aiKeyOf(pv.id);
      var cap = !hasKey ? '키 없음' : (pv.vision.length ? '사진·레시피' : '레시피만');
      pickBtns += '<button type="button" class="ai-btn' + (on && hasKey ? ' on' : '') + (hasKey ? '' : ' off') + '" data-act="ai-pick" data-pid="' + esc(pv.id) + '" aria-pressed="' + (on && hasKey ? 'true' : 'false') + '">' + esc(pv.label) + '<small>' + esc(cap) + '</small></button>';
    }
    body.innerHTML = '' +
      '<div class="set-sec">' +
        '<h3>🤖 AI 고르기 ' + (aiReady(false) ? '<span class="badge ok">연결됨 ✓</span>' : '<span class="badge">키 없음</span>') + '</h3>' +
        '<p class="set-info">영수증 인식과 AI 레시피 추천에 먼저 쓸 AI를 골라요.</p>' +
        '<div class="ai-pick">' + pickBtns + '</div>' +
        '<p class="set-info" style="margin-top:7px">고른 AI가 20초 안에 답하지 않거나 사용량이 차면 나머지 AI로 자동으로 다시 시도해요.' + (aiLastLabel() ? ' 마지막으로 답한 AI: ' + esc(aiLastLabel()) : '') + '</p>' +
        '<div class="row"><button class="btn sm sub" type="button" data-act="key-check">연결 확인</button></div>' +
      '</div>' +
      '<div class="set-sec">' +
        '<h3>✨ Gemini API 키 ' + keyBadge + '</h3>' +
        '<p class="set-info">' + esc(keyInfo) + '</p>' +
        '<div class="row"><input id="keyInput" type="password" placeholder="AQ… 또는 AIza… (새 키로 바꿀 때만 입력)" autocomplete="off" spellcheck="false">' +
        '<button class="btn sm" type="button" data-act="key-save">키 저장</button>' +
        (origin === 'local' && canEdit() ? '<button class="btn sm sub" type="button" data-act="key-share">가족과 공유</button>' : '') +
        (key ? '<button class="btn sm ghost" type="button" data-act="key-clear">삭제</button>' : '') + '</div>' +
        keyMsg +
        '<p class="set-info" style="margin-top:6px">OpenRouter · Groq는 가족 AI 사무실 설정에서 넣은 키를 그대로 함께 써요. 무료 키 발급: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></p>' +
      '</div>' +
      '<div class="set-sec">' +
        '<h3>💰 월 식비 목표</h3>' +
        '<p class="set-info">이번 달 재료 구매 가격과 직접 기록한 지출을 합쳐서 보여줘요.</p>' +
        '<div class="row"><span class="set-cap">이번 달 목표 (원)</span><input id="budgetInput" type="number" min="0" step="10000" inputmode="numeric" value="' + esc(effectiveBudget()) + '"></div>' +
        '<div class="row"><span class="set-cap">기본 목표 · 매달 처음 값 (원)</span><input id="budgetDefaultInput" type="number" min="1000" step="10000" inputmode="numeric" value="' + esc(budgetDefault()) + '"' + (ui.readOnly ? ' disabled' : '') + '></div>' +
        '<div class="row">' +
          (ui.readOnly ? '<span class="badge">보기 전용</span>' :
            '<button class="btn sm" type="button" data-act="budget-save">저장</button>' +
            '<button class="btn sm ghost" type="button" data-act="budget-reset">기본값 ' + fmtWon(BUDGET_DEFAULT) + '원으로</button>') +
        '</div>' +
      '</div>' +
      '<div class="set-sec">' +
        '<h3>📐 알림 · 경고 기준</h3>' +
        '<p class="set-info">재료의 남은 양에 따라 \'거의 다 씀\' 표시와 장보기 목록 기준이 달라져요.</p>' +
        '<div class="row"><span class="set-cap">\'거의 다 씀\' 경고 기준 (남은 양 %)</span><input id="lowPctInput" type="number" min="1" max="100" step="5" inputmode="numeric" value="' + lowPct() + '"' + (ui.readOnly ? ' disabled' : '') + '></div>' +
        '<div class="row"><span class="set-cap">새 재료의 최소 남은 양 (%)</span><input id="pctMinInput" type="number" min="1" max="100" step="5" inputmode="numeric" value="' + pctMinDefault() + '"' + (ui.readOnly ? ' disabled' : '') + '></div>' +
        '<div class="row"><span class="set-cap">새 재료의 최소 수량 (개 · g 등)</span><input id="minQtyInput" type="number" min="1" step="1" inputmode="numeric" value="' + minQtyDefault() + '"' + (ui.readOnly ? ' disabled' : '') + '></div>' +
        '<div class="row">' +
          (ui.readOnly ? '' :
            '<button class="btn sm" type="button" data-act="thr-save">저장</button>' +
            '<button class="btn sm ghost" type="button" data-act="thr-reset">기본값 ' + LOW_PCT_DEFAULT + '% · ' + PCT_MIN_DEFAULT + '% · ' + MIN_QTY_DEFAULT + '으로</button>') +
        '</div>' +
        '<p class="set-info" style="margin-top:6px">이미 저장된 재료는 각자 정한 기준을 그대로 쓰고, 새로 추가하는 재료에 여기 값이 기본으로 들어가요.</p>' +
      '</div>' +
      '<div class="set-sec">' +
        '<h3>☁️ 저장</h3>' +
        '<p class="set-info" id="syncInfo">' + esc(syncTxt) + '</p>' +
        '<div class="row"><button class="btn sm sub" type="button" data-act="sync-now">지금 동기화</button>' +
        '<button class="btn sm ghost" type="button" data-act="reload-data">GitHub에서 다시 불러오기</button></div>' +
      '</div>' +
      '<div class="set-sec">' +
        '<h3>👤 내 계정</h3>' +
        '<p class="set-info">' + esc(cloud.me ? ((cloud.me.name || cloud.me.id) + ' · ' + roleLabel(cloud.me.role) + ' (' + cloud.me.id + ')') : '-') + '</p>' +
        '<p class="set-info">영수증 사진은 저장하지 않아요. 인식에만 쓰고 바로 버려요.</p>' +
      '</div>';
  }

  async function checkKey() {
    ui.keyMsg = 'err:확인하는 중…';
    renderSettings();
    try {
      await aiJSON({ text: '연결 확인이야. JSON {"ok":true} 만 답해줘.' }, { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } }, {});
      ui.keyMsg = 'ok:' + (aiLastLabel() ? aiLastLabel() + ' 연결됐어요. ' : '') + '영수증 인식과 AI 레시피를 쓸 수 있어요.';
    } catch (e) {
      ui.keyMsg = 'err:' + msgForError(e);
    }
    renderSettings();
  }

