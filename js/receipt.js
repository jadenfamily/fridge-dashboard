/* 냉장고 파먹기 · 영수증 인식 · 사진 압축 · 검토 후 추가 */
'use strict';

  /* ---------- 영수증 ---------- */
  function renderReceipt() {
    var body = $('receiptBody'); if (!body) return;
    var rec = ui.rec || { step: 'pick' };
    if (rec.step === 'busy') {
      body.innerHTML = '<div class="spin"><div class="ring"></div><p>' + esc(rec.status || '영수증을 읽는 중…') + '</p><p class="note">사진은 저장하지 않아요</p></div>';
      return;
    }
    if (rec.step === 'error') {
      body.innerHTML = '<div class="guide"><b>사진을 읽지 못했어요</b><p>' + esc(rec.error || '다시 시도해 주세요.') + '</p>' +
        '<button class="btn" type="button" data-act="receipt-pick">다른 사진으로 다시</button></div>' +
        '<p class="note" style="margin-top:10px">바로 등록하려면 <button class="link-btn" type="button" data-act="item-add">직접 등록</button>을 써 주세요.</p>' +
        '<input type="file" id="receiptFile" accept="image/*" capture="environment" hidden>';
      return;
    }
    if (rec.step === 'review') {
      var rows = '';
      var sel = 0;
      for (var i = 0; i < rec.items.length; i++) {
        var it = rec.items[i];
        if (it.include) sel++;
        var so = '';
        for (var s = 0; s < STORAGES.length; s++) {
          so += '<option value="' + STORAGES[s].key + '"' + (it.storage === STORAGES[s].key ? ' selected' : '') + '>' + STORAGES[s].label + '</option>';
        }
        rows += '<div class="rec-row' + (it.include ? '' : ' off') + '">' +
          '<input type="checkbox" data-ri="' + i + '" aria-label="이 항목 포함"' + (it.include ? ' checked' : '') + '>' +
          '<input data-ri="' + i + '" data-f="name" value="' + esc(it.name) + '" aria-label="이름">' +
          '<input data-ri="' + i + '" data-f="qty" type="number" min="0" step="0.5" value="' + esc(fmtQty(it.qty)) + '" aria-label="수량">' +
          '<input data-ri="' + i + '" data-f="unit" value="' + esc(it.unit) + '" aria-label="단위">' +
          '<select data-ri="' + i + '" data-f="storage" aria-label="보관">' + so + '</select>' +
          '<input data-ri="' + i + '" data-f="price" type="number" min="0" step="100" value="' + esc(it.price || '') + '" aria-label="가격">' +
          '</div>';
      }
      body.innerHTML = '<div class="rec-head">' +
          '<label>구매일 <input type="date" id="recDate" value="' + esc(rec.date) + '"></label>' +
          '<span id="recCount">' + sel + '개 선택</span>' +
        '</div>' +
        (rec.items.length ? '<div class="rec-rows">' + rows + '</div>' : '<p class="note" style="color:#c6415a;margin-bottom:9px">재료를 찾지 못했어요. 직접 등록해 주세요.</p>') +
        '<button class="btn wide" type="button" data-act="receipt-add">선택한 재료 목록에 추가</button>' +
        '<div style="height:7px"></div>' +
        '<button class="btn wide sub" type="button" data-act="receipt-pick">다른 사진으로 다시</button>' +
        '<p class="note" style="margin-top:9px">인식 결과가 틀리면 고쳐 주세요. 사진은 저장하지 않고 인식에만 써요.</p>' +
        '<input type="file" id="receiptFile" accept="image/*" capture="environment" hidden>';
      return;
    }
    var key = aiReady(true);
    body.innerHTML = '<div class="rec-drop">📷<b>영수증 사진으로 한 번에 등록</b>' +
      '<p>마트 영수증이나 장보기 목록 사진을 올리면<br>재료·수량·가격·보관 구분을 자동으로 읽어요.</p></div>' +
      '<input type="file" id="receiptFile" accept="image/*" capture="environment" hidden>' +
      (key ?
        '<button class="btn wide" type="button" data-act="receipt-pick">사진 찍기 / 고르기</button>' :
        '<div class="guide"><b>✨ 자동 인식을 쓰려면 AI 키가 필요해요</b>' +
        '<p>무료 키를 발급해 ⚙️ 설정에 넣으면 영수증이 자동으로 정리돼요.</p>' +
        '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey 에서 무료 키 발급</a>' +
        '<div><button class="btn" type="button" data-act="settings-open">⚙️ 설정에서 키 넣기</button></div></div>') +
      '<div style="height:7px"></div>' +
      '<button class="btn wide sub" type="button" data-act="item-add">직접 등록하기</button>';
  }

  function openReceipt() {
    ui.rec = { step: 'pick' };
    renderReceipt();
    showModal('receiptModal');
  }

  function shrinkImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          try { resolve(cv.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('사진을 열지 못했어요.')); };
        img.src = String(reader.result || '');
      };
      reader.onerror = function () { reject(new Error('사진을 읽지 못했어요.')); };
      reader.readAsDataURL(file);
    });
  }

  async function analyzeReceipt(file) {
    ui.rec = { step: 'busy', status: '영수증을 읽는 중…' };
    renderReceipt();
    try {
      if (!aiReady(true)) throw new Error('NO_KEY');
      if (!/^image\//.test(file.type || '')) throw new Error('이미지 파일만 올릴 수 있어요.');
      var dataUrl = await shrinkImage(file, IMG_MAX_DIM, IMG_QUALITY);
      var mime = (/^data:(.*?);/.exec(dataUrl) || [])[1] || 'image/jpeg';
      var b64 = dataUrl.split(',')[1];
      var out = await aiJSON({ text: PROMPT_RECEIPT, image: { mime: mime, b64: b64 } }, SCHEMA_RECEIPT, {
        vision: true,
        validate: function (d) { return !!(d && Object.prototype.toString.call(d.items) === '[object Array]' && d.items.length); },
        onStatus: function (st) {
          var txt;
          if (!st.tried.length) txt = st.provider.label + '로 사진을 읽는 중…';
          else txt = st.tried[st.tried.length - 1].label + '가 응답하지 않아 ' + st.provider.label + '로 다시 읽는 중…';
          ui.rec = { step: 'busy', status: txt };
          renderReceipt();
        }
      });
      var list = (out && out.items) || [];
      var items = [];
      for (var i = 0; i < list.length && i < 40; i++) {
        var it = list[i] || {};
        var name = String(it.name || '').trim();
        if (!name) continue;
        items.push({
          include: true, name: name.slice(0, 40),
          qty: Math.max(0, num(it.qty) || 1),
          unit: String(it.unit || '개').slice(0, 6),
          storage: normStorage(it.storage),
          price: Math.max(0, Math.round(num(it.price)))
        });
      }
      var date = isYmd(out && out.purchaseDate) ? out.purchaseDate : todayStr();
      ui.rec = { step: 'review', items: items, date: date };
      renderReceipt();
    } catch (e) {
      ui.rec = { step: 'error', error: msgForError(e) };
      renderReceipt();
    }
  }

  function addReviewed() {
    var rec = ui.rec;
    if (!rec || rec.step !== 'review') return;
    var date = fieldVal('recDate');
    var added = 0;
    for (var i = 0; i < rec.items.length; i++) {
      var it = rec.items[i];
      if (!it.include) continue;
      var name = String(it.name || '').trim();
      if (!name) continue;
      var item = upsertItem({
        name: name, qty: Math.max(0, num(it.qty)), unit: it.unit || '개', storage: it.storage,
        boughtAt: isYmd(date) ? date : todayStr(), price: Math.max(0, Math.round(num(it.price)))
      });
      if (num(it.qty) > 0) {
        if (isYmd(date) && date !== todayStr()) touchDate(date);
        else logDaily('bought', item, it.qty);
      }
      added++;
    }
    if (!added) { toast('추가할 항목을 골라 주세요.', true); return; }
    markDirty('inventory');
    closeModal('receiptModal');
    renderAll();
    toast('🧾 ' + added + '개 재료를 등록했어요');
  }

