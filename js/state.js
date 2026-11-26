/* 냉장고 파먹기 · 상수 · 상태 · 유틸 · 로컬 캐시 · 기기/세션 · 권한 */
'use strict';

  /* ============ 상수 ============ */
  var API_BASE = 'https://api.github.com';
  var DEVICE_KEY = 'kidsDashboard.device.v1';
  var SESSION_KEY = 'kidsDashboard.session.v1';
  var HUB_KEY = 'kidsDashboard.hub.v1';
  var HUB_LAST_KEY = 'kidsDashboard.hub.last';
  var LOCAL_KEY = 'fridgeDashboard.v1';
  var SHA_KEY = 'fridgeDashboard.sha.v1';
  var KEY_KEY = 'fridgeDashboard.geminiKey.v1';
  var KEY_SHARED_KEY = 'fridgeDashboard.geminiKey.shared.v1';
  var AI_STATE_KEY = 'fridgeDashboard.aiState.v1';
  var AI_PATH = 'config/ai.json';
  var AI_ITER = 120000;
  var TAB_KEY = 'fridgeDashboard.tab.v1';
  var RECIPE_SORT_KEY = 'fridgeDashboard.recipeSort.v1';
  var BUDGET_DEFAULT = 700000;
  var LOW_PCT_DEFAULT = 25;      /* '거의 다 씀' 표시 기준 남은 양(%) */
  var PCT_MIN_DEFAULT = 25;      /* 새 재료의 최소 남은 양(%) */
  var MIN_QTY_DEFAULT = 1;       /* 새 재료의 최소 수량 */
  var BOOT_WAIT_MS = 6000;       /* 첫 로딩에서 원격 데이터를 기다리는 최대 시간 */
  var PATH_INV = 'fridge/inventory.json';
  var PATH_MEALS = 'fridge/meals.json';
  var PATH_SET = 'fridge/settings.json';
  var PATH_DAILY = 'fridge/daily.json';
  var PATH_RECIPES = 'fridge/recipes.json';

  /* ---------- AI 제공자 ----------
     키는 가족 AI 사무실과 같은 config/ai.json(Gemini·OpenRouter·Groq)을 함께 읽는다.
     모델 ID는 2026-11-26 실제 응답을 확인한 것만 넣었다(빠른 모델을 앞에).
     vision 목록이 빈 제공자는 사진 인식을 건너뛰고 다음 제공자로 넘어간다. */
  var AI_PROVIDERS = [
    { id: 'gemini', label: 'Gemini',
      text: ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'],
      vision: ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'] },
    { id: 'openrouter', label: 'OpenRouter',
      text: ['particle-ai/particle-1:free', 'baidu/ernie-5.5-flash-preview:free', 'nvidia/nemotron-3.5-lightning:free'],
      vision: ['particle-ai/particle-1:free', 'inclusionai/ling-3.2-flash:free', 'google/gemma-4-31b-it:free'] },
    { id: 'groq', label: 'Groq',
      text: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'],
      vision: [] }
  ];
  var AI_TIMEOUT_MS = 20000;   /* 한 번의 AI 요청은 20초까지만 기다린다 */
  var AI_KEYS_KEY = 'fridgeDashboard.aiKeys.v1';
  var AI_PREF_KEY = 'fridgeDashboard.aiProvider.v1';
  var IMG_MAX_DIM = 1000;      /* 영수증 사진은 긴 변 1000px */
  var IMG_QUALITY = 0.72;      /* 모바일 LTE에서도 빨리 올라가게 */

  var ROLES = {
    admin: { label: '관리자', edit: 1 },
    parent: { label: '보호자', edit: 1 },
    child: { label: '아이' },
    viewer: { label: '보기 전용' }
  };

  var STORAGES = [
    { key: 'frozen', label: '냉동', emoji: '❄️', cls: 'st-frozen' },
    { key: 'fridge', label: '냉장', emoji: '🧊', cls: 'st-fridge' },
    { key: 'room', label: '실온', emoji: '🧺', cls: 'st-room' },
    { key: 'sauce', label: '소스/양념', emoji: '🧂', cls: 'st-sauce' }
  ];
  var ST_LABEL = { frozen: '냉동', fridge: '냉장', room: '실온', sauce: '소스/양념' };
  var ST_CLS = { frozen: 'st-frozen', fridge: 'st-fridge', room: 'st-room', sauce: 'st-sauce' };
  var ST_FROM_LABEL = { '냉동': 'frozen', '냉장': 'fridge', '실온': 'room', '소스/양념': 'sauce', '소스': 'sauce', '양념': 'sauce' };

  var DAYS = [
    { k: 'mon', n: '월' }, { k: 'tue', n: '화' }, { k: 'wed', n: '수' },
    { k: 'thu', n: '목' }, { k: 'fri', n: '금' }
  ];
  var SLOTS = [{ k: 'b', n: '아침' }, { k: 'l', n: '점심' }, { k: 'd', n: '저녁' }];

  var SEED = {
    frozen: ['치즈스틱', '물만두', '블루베리', '명란', '피자', '건버섯', '주먹밥', '떡국떡', '볶음밥'],
    fridge: ['단호박(미니)', '당근', '달걀', '또띠아', '마늘', '김치', '떡국떡', '냉면', '무', '새송이', '한방', '매생이'],
    room: ['소면', '아몬드가루', '부침가루', '라면', '미역', '스파게티면'],
    sauce: ['케첩', '고추장', '된장', '홀그레인', '딸기잼', '소금', '크림치즈', '버터', '참치액', '연두', '간장', '굴소스', '바베큐소스', '불닭소스', '쌈장', '레몬', '돈까스소스', '고춧가루', '식초', '마요네즈', '샐러드소스', '후추', '월계수잎', '참기름', '후리카케', '깨', '꿀', '설탕', '알룰로스']
  };
  var STAPLES = [
    { n: '식빵', s: 'room' }, { n: '원두', s: 'room' }, { n: '햄', s: 'fridge' }, { n: '달걀', s: 'fridge' },
    { n: '양파', s: 'fridge' }, { n: '대파', s: 'fridge' }, { n: '닭가슴살', s: 'frozen' }, { n: '바나나', s: 'room' },
    { n: '요거트', s: 'fridge' }, { n: '새우', s: 'frozen' }, { n: '치즈', s: 'fridge' }, { n: '두부', s: 'fridge' },
    { n: '팽이버섯', s: 'fridge' }, { n: '떡갈비', s: 'frozen' }, { n: '맛살', s: 'frozen' }, { n: '미역줄기', s: 'fridge' },
    { n: '샐러드', s: 'fridge' }, { n: '멸치', s: 'frozen' }, { n: '우유', s: 'fridge' }, { n: '쌀', s: 'room' }
  ];

  /* 집에서 자주 해 먹는 한식 레시피 — 재료 매칭 + 조리법(s) */
  var RECIPES = [
    { e: '🍚', t: '김치볶음밥', d: '김치와 달걀만 있으면 15분', ing: ['김치', '달걀', '대파', '밥', '참기름'], s: ['김치를 잘게 썰고 대파는 송송 썰어요.', '팬에 기름을 두르고 김치를 2분 볶아요.', '밥을 넣고 김치와 고루 섞어 볶아요.', '한쪽에 달걀을 풀어 익힌 뒤 참기름을 두르고 마무리해요.'], cat: '한식' },
    { e: '🍲', t: '김치찌개', d: '김치·두부로 끓이는 기본 찌개', ing: ['김치', '돼지고기', '두부', '대파'], s: ['돼지고기를 한입 크기로 썰어 팬에 볶아요.', '김치를 넣고 함께 볶다가 물 3컵을 부어요.', '끓어오르면 두부를 넣고 10분 더 끓여요.', '대파를 넣고 한소끔 끓여 마무리해요.'], cat: '한식' },
    { e: '🥘', t: '된장찌개', d: '된장 베이스로 채소 넣고 끓이기', ing: ['된장', '두부', '애호박', '감자', '대파'], s: ['무·애호박·감자를 먹기 좋게 썰어요.', '냄비에 물 3컵과 된장 1큰술을 풀어 끓여요.', '감자와 애호박을 먼저 넣고 7분 끓여요.', '두부와 대파를 넣고 3분 더 끓여요.'], cat: '한식' },
    { e: '🍳', t: '달걀찜', d: '달걀과 소금만으로 부드럽게', ing: ['달걀', '대파', '소금'], s: ['달걀 3개를 풀고 물 1컵과 소금을 넣어 섞어요.', '대파를 잘게 썰어 넣어요.', '냄비에 부어 약불에서 저어가며 익혀요.', '가장자리가 굳으면 뚜껑을 덮고 3분 더 익혀요.'], cat: '한식' },
    { e: '🍄', t: '버터간장 새송이구이', d: '새송이+버터+간장, 10분', ing: ['새송이', '버터', '간장', '마늘'], s: ['새송이버섯을 0.5cm 두께로 저며요.', '팬에 버터를 녹이고 새송이를 노릇하게 구워요.', '간장과 다진 마늘을 넣고 1분 더 볶아요.', '접시에 담고 남은 소스를 끼얹어요.'], cat: '양식' },
    { e: '🍝', t: '명란버터파스타', d: '명란젓과 버터로 고소하게', ing: ['명란', '버터', '스파게티면', '마늘'], s: ['끓는 물에 소금을 넣고 면을 8분 삶아요.', '팬에 버터와 다진 마늘을 약불에 볶아요.', '명란젓을 껍질에서 발라 넣고 섞어요.', '삶은 면을 넣고 면수 3큰술로 농도를 맞춰요.'], cat: '양식' },
    { e: '🍜', t: '매생이국', d: '매생이 넣고 시원하게 끓이기', ing: ['매생이', '마늘', '소금'], s: ['매생이를 물에 살살 헹궈요.', '냄비에 물을 끓이고 다진 마늘을 넣어요.', '매생이를 넣고 3분 끓여요.', '소금으로 간을 맞춰요.'], cat: '한식' },
    { e: '🥣', t: '무된장국', d: '무를 넣어 달큰한 된장국', ing: ['무', '된장', '대파', '마늘'], s: ['무를 얇게 썰고 대파를 송송 썰어요.', '물 3컵에 된장을 풀어 끓여요.', '무를 넣고 7분 끓여요.', '대파와 다진 마늘을 넣고 한소끔 끓여요.'], cat: '한식' },
    { e: '🍲', t: '떡국', d: '떡국떡으로 간단히 한 끼', ing: ['떡국떡', '달걀', '대파', '소고기'], s: ['떡국떡을 물에 5분 불려요.', '냄비에 물 3컵을 끓이고 떡을 넣어요.', '떡이 떠오르면 소고기와 대파를 넣어요.', '달걀을 풀어 넣고 한소끔 끓여요.'], cat: '한식' },
    { e: '🥟', t: '물만두국', d: '물만두 넣고 달걀 풀기', ing: ['물만두', '달걀', '대파'], s: ['물 3컵을 끓여요.', '물만두를 넣고 떠오를 때까지 4분 끓여요.', '대파를 넣고 달걀을 풀어 넣어요.', '소금으로 간을 맞춰요.'], cat: '한식' },
    { e: '🍜', t: '물냉면', d: '냉면 사리로 시원한 한 그릇', ing: ['냉면', '달걀', '오이', '겨자'], s: ['냉면 사리를 끓는 물에 1분 삶아 찬물에 헹궈요.', '그릇에 냉면 육수를 부어요.', '오이를 채 썰고 달걀을 삶아 반으로 잘라요.', '면을 담고 오이·달걀·겨자를 올려요.'], cat: '한식' },
    { e: '🍕', t: '또띠아 피자', d: '또띠아 위에 케첩·치즈·햄', ing: ['또띠아', '케첩', '치즈', '햄'], s: ['또띠아에 케첩을 고루 발라요.', '햄과 치즈를 올려요.', '에어프라이어 180도에서 6분 구워요.', '먹기 좋게 잘라요.'], cat: '양식' },
    { e: '🍜', t: '비빔국수', d: '고추장 양념에 소면 비비기', ing: ['소면', '고추장', '식초', '설탕', '참기름', '오이'], s: ['끓는 물에 소면을 3분 삶아 찬물에 헹궈요.', '고추장·식초·설탕·참기름을 섞어 양념을 만들어요.', '오이를 채 썰어요.', '면에 양념과 오이를 올려 비벼요.'], cat: '한식' },
    { e: '🍜', t: '라면 한 그릇', d: '달걀·대파 넣고 끓이기', ing: ['라면', '달걀', '대파'], s: ['물 550ml를 끓여요.', '스프와 면을 넣고 3분 끓여요.', '대파를 송송 썰어 넣어요.', '달걀을 풀어 넣고 30초 익혀요.'], cat: '한식' },
    { e: '🥞', t: '김치전', d: '김치와 부침가루로 노릇하게', ing: ['김치', '부침가루'], s: ['김치를 잘게 썰어요.', '부침가루와 물을 1:1로 섞어 반죽해요.', '김치를 넣고 고루 섞어요.', '팬에 기름을 두르고 앞뒤로 노릇하게 부쳐요.'], cat: '한식' },
    { e: '🥞', t: '매생이전', d: '매생이 넣은 바삭한 전', ing: ['매생이', '부침가루'], s: ['매생이를 살살 헹궈 물기를 빼요.', '부침가루와 물을 섞어 반죽해요.', '매생이를 넣고 가볍게 섞어요.', '팬에 얇게 펴서 앞뒤로 바삭하게 부쳐요.'], cat: '한식' },
    { e: '🍄', t: '건버섯 볶음', d: '불린 건버섯을 간장·참기름에', ing: ['건버섯', '간장', '참기름', '마늘'], s: ['건버섯을 미지근한 물에 20분 불려요.', '물기를 꼭 짜고 먹기 좋게 썰어요.', '팬에 기름을 두르고 마늘을 볶아요.', '건버섯을 넣고 간장·참기름으로 간해 볶아요.'], cat: '한식' },
    { e: '🥗', t: '단호박 샐러드', d: '찐 단호박에 요거트 드레싱', ing: ['단호박', '요거트', '아몬드가루'], s: ['단호박을 깍둑 썰어 전자레인지에 5분 익혀요.', '한김 식혀요.', '요거트에 아몬드가루를 섞어 드레싱을 만들어요.', '단호박에 드레싱을 올려요.'], cat: '건강/간편' },
    { e: '🫐', t: '블루베리 요거트볼', d: '냉동 블루베리로 간단 디저트', ing: ['블루베리', '요거트'], s: ['냉동 블루베리를 살짝 녹여요.', '그릇에 요거트를 담아요.', '블루베리를 올리고 가볍게 섞어요.'], cat: '건강/간편' },
    { e: '🧀', t: '치즈스틱 에어프라이', d: '냉동 치즈스틱 180도 8분', ing: ['치즈스틱'], s: ['치즈스틱을 에어프라이어에 놓아요.', '180도에서 8분 구워요.', '뒤집어 3분 더 구워요.'], cat: '건강/간편' },
    { e: '🍙', t: '참기름 주먹밥', d: '밥에 참기름·깨 넣고 동글동글', ing: ['밥', '김', '참기름', '깨'], s: ['따뜻한 밥에 참기름과 깨를 넣어 섞어요.', '김을 잘게 부숴 넣어요.', '한입 크기로 동글게 뭉쳐요.'], cat: '한식' },
    { e: '🔥', t: '불닭볶음면', d: '불닭소스로 매콤하게', ing: ['라면', '불닭소스', '달걀'], s: ['물 500ml를 끓여 면을 4분 삶아요.', '물을 8숟갈 남기고 따라내요.', '불닭소스를 넣고 30초 볶아요.', '달걀 프라이를 올려요.'], cat: '한식' },
    { e: '🍝', t: '버터 마늘 파스타', d: '마늘·버터만으로 기본 파스타', ing: ['스파게티면', '마늘', '버터'], s: ['끓는 물에 소금을 넣고 면을 8분 삶아요.', '팬에 버터를 녹이고 다진 마늘을 약불에 볶아요.', '면수 3큰술을 넣고 소스를 만들어요.', '삶은 면을 넣고 고루 버무려요.'], cat: '양식' },
    { e: '🍤', t: '새우 볶음밥', d: '냉동 새우로 새우볶음밥', ing: ['새우', '밥', '달걀', '대파'], s: ['새우를 해동해 물기를 빼요.', '팬에 기름을 두르고 새우를 볶아요.', '밥을 넣고 고루 볶아요.', '달걀과 대파를 넣고 마무리해요.'], cat: '한식' },
    { e: '🥘', t: '두부김치', d: '두부 데쳐 김치와 볶아내기', ing: ['두부', '김치', '대파'], s: ['두부를 1cm로 썰어 끓는 물에 2분 데쳐요.', '팬에 김치를 볶아요.', '대파를 넣고 한 번 더 볶아요.', '두부 위에 볶은 김치를 올려요.'], cat: '한식' },
    { e: '🍳', t: '계란후라이', d: '달걀 하나로 든든한 반찬', ing: ['달걀', '소금'], s: ['팬에 기름을 두르고 약불로 데워요.', '달걀을 깨 넣고 흰자가 익을 때까지 두어요.', '소금을 살짝 뿌려요.'], cat: '건강/간편' },
    { e: '🍕', t: '냉동피자', d: '피자 데워서 간단 야식', ing: ['피자'], s: ['피자를 에어프라이어에 놓아요.', '180도에서 10분 구워요.', '가운데까지 뜨거워지면 꺼내요.'], cat: '양식' },
    { e: '🍖', t: '떡갈비 구이', d: '떡갈비 에어프라이 한 접시', ing: ['떡갈비'], s: ['떡갈비를 실온에 5분 두어요.', '에어프라이어 180도에서 10분 구워요.', '뒤집어 5분 더 구워요.'], cat: '한식' }
  ];

  /* 레시피 카테고리 — 필터 칩과 AI 응답이 함께 쓰는 고정 목록 */
  var CATEGORIES = ['한식', '양식', '중식', '일식', '건강/간편'];
  var CAT_CLS = { '한식': 'k', '양식': 'w', '중식': 'c', '일식': 'j', '건강/간편': 'h' };
  /* 제목·재료에 나오는 낱말로 카테고리를 추정한다(카테고리가 없는 옛 레시피용 안전장치). */
  var CAT_HINTS = [
    ['일식', ['스시', '초밥', '우동', '소바', '라멘', '돈코츠', '규동', '가츠동', '오야코동', '가라아게', '데리야끼', '데리야키', '텐동', '다코야키', '오니기리', '미소시루', '사케동', '연어덮밥', '장어덮밥', '덮밥', '스키야키', '카레라이스', '가츠']],
    ['중식', ['짜장', '짬뽕', '탕수육', '마파두부', '깐풍', '팔보채', '양꼬치', '훠궈', '딤섬', '마라', '꿔바로우', '완탕', '춘권', '중화', '샤브샤브', '볶음면']],
    ['양식', ['파스타', '스파게티', '피자', '리조또', '리조토', '스테이크', '오믈렛', '오무라이스', '샌드위치', '토스트', '버거', '그라탕', '라자냐', '또띠아', '타코', '브리또', '카르보나라', '알리오', '뇨끼', '감바스', '커리']],
    ['건강/간편', ['샐러드', '요거트', '스무디', '그릭', '닭가슴살', '에어프라이', '전자레인지', '오트밀', '시리얼', '견과', '단백질', '곤약', '포케', '컵밥', '두유']],
    ['한식', ['김치', '된장', '고추장', '찌개', '국', '볶음밥', '비빔', '떡', '죽', '찜', '구이', '조림', '무침', '나물', '불고기', '갈비', '주먹밥', '계란말이', '김밥', '냉면', '라면', '수제비', '칼국수', '만두', '꼬치', '순두부', '장아찌']]
  ];
  function normCategory(v) {
    var s = String(v == null ? '' : v).replace(/\s+/g, '').trim();
    if (!s) return '';
    if (CATEGORIES.indexOf(s) >= 0) return s;
    var flat = s.replace(/\//g, '');
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].replace(/\//g, '') === flat) return CATEGORIES[i];
    }
    var alias = { 'korean': '한식', 'western': '양식', 'chinese': '중식', 'japanese': '일식', 'healthy': '건강/간편', 'simple': '건강/간편', '간편': '건강/간편', '건강': '건강/간편', '한식요리': '한식', '양식요리': '양식', '중식요리': '중식', '일식요리': '일식' };
    return alias[s.toLowerCase()] || '';
  }
  function guessCategory(title, ings) {
    var hay = String(title || '') + ' ' + (ings && ings.length ? ings.join(' ') : '');
    for (var i = 0; i < CAT_HINTS.length; i++) {
      var hints = CAT_HINTS[i][1];
      for (var j = 0; j < hints.length; j++) {
        if (hay.indexOf(hints[j]) >= 0) return CAT_HINTS[i][0];
      }
    }
    return '한식';
  }
  function normRecipeSort(v) { return (v === 'time' || v === 'name') ? v : 'new'; }

  var PROMPT_RECEIPT = '너는 한국 가정의 냉장고 관리 도우미야. 첨부한 영수증 또는 장보기 목록 사진에서 구매한 식재료를 읽어 정리해줘.\n' +
    '규칙: 1) 식재료·식품만 (봉투값·할인·적립·비식품 제외) 2) 수량과 단위는 사진에서 확인되면 채우고 모르면 수량 1, 단위 "개" 3) 가격은 그 항목의 금액(원, 숫자만), 모르면 0 4) 보관 구분은 반드시 냉동/냉장/실온/소스/양념 중 하나 — 고기·해산물·유제품·채소·두부·김치는 냉장, 만두·아이스크림·튀김·볶음밥·냉동밥은 냉동, 라면·면·쌀·가루·통조림·견과는 실온, 소스·잼·양념·기름·장류는 소스/양념 5) 구매일은 영수증에 적힌 날짜(YYYY-MM-DD), 없으면 오늘 6) 이름은 한국어로 짧게.';
  var SCHEMA_RECEIPT = {
    type: 'OBJECT',
    properties: {
      purchaseDate: { type: 'STRING' },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            qty: { type: 'NUMBER' },
            unit: { type: 'STRING' },
            price: { type: 'NUMBER' },
            storage: { type: 'STRING', enum: ['냉동', '냉장', '실온', '소스/양념'] }
          },
          required: ['name', 'storage']
        }
      }
    },
    required: ['items']
  };
  var SCHEMA_RECIPES = {
    type: 'OBJECT',
    properties: {
      recipes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            minutes: { type: 'NUMBER' },
            category: { type: 'STRING', enum: CATEGORIES },
            ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
            steps: { type: 'ARRAY', items: { type: 'STRING' } }
          },
          required: ['title', 'category', 'ingredients', 'steps']
        }
      }
    },
    required: ['recipes']
  };

  /* ============ 상태 ============ */
  function emptyState() {
    return {
      inventory: { version: 1, updatedAt: '', items: [] },
      meals: { version: 1, updatedAt: '', budget: 0, weeks: {}, expenses: [] },
      settings: { version: 1, updatedAt: '', recipes: [], recipesAt: '', prefs: {}, links: {}, budgetDefault: BUDGET_DEFAULT, lowPct: LOW_PCT_DEFAULT, pctMinDefault: PCT_MIN_DEFAULT, minQtyDefault: MIN_QTY_DEFAULT },
      recipes: { version: 1, updatedAt: '', recipes: [] },
      daily: { version: 1, updatedAt: '', days: {} }
    };
  }
  var state = emptyState();
  var cloud = {
    conn: null, me: null, users: null, session: null,
    status: 'idle', statusAt: 0, sha: {},
    dirty: { inventory: false, meals: false, settings: false, daily: false, recipes: false },
    timer: 0, saving: false
  };
  var ui = {
    search: '', storages: { frozen: true, fridge: true, room: true, sauce: true },
    status: 'in', sort: 'new', recipeAll: false, openRecipe: {}, weekStart: '',
    recipeCat: 'all', recipeSort: normRecipeSort(lsGet(RECIPE_SORT_KEY)),
    itemEdit: '', mealDay: '', rec: null, keyMsg: '', aiBusy: false, gateMode: '', shopOpen: false,
    tab: '', watchOpen: false, watchEdit: '', linkKey: '', linkTitle: '',
    histY: 0, histM: 0, histSel: '', editSections: false
  };

  /* ============ 유틸 ============ */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid(p) {
    return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function nowIso() { return new Date().toISOString(); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function isYmd(s) { return !!parseYmd(s); }
  function fmtWon(n) { return Number(num(n)).toLocaleString('ko-KR'); }
  function fmtQty(q) { var n = num(q); return (Math.round(n * 100) / 100).toString(); }
  /* ---------- 남은 양(%) 단위 ---------- */
  function isPctUnit(u) { return String(u == null ? '' : u).trim() === '%'; }
  function pctClamp(v) { var n = Math.round(num(v)); return n < 0 ? 0 : (n > 100 ? 100 : n); }
  function qtyClamp(q, u) { return isPctUnit(u) ? pctClamp(q) : Math.max(0, num(q)); }
  function qtyStep(u) { return isPctUnit(u) ? 25 : 1; }
  /* 설정 화면에서 바꾸는 기준값 — state.settings에 저장되고 가족 기기와 함께 동기화된다. */
  function clampRange(v, def, min, max) {
    var n = Math.round(num(v));
    if (!isFinite(n) || n === 0) return def;
    return n < min ? min : (n > max ? max : n);
  }
  function lowPct() { return clampRange(state.settings && state.settings.lowPct, LOW_PCT_DEFAULT, 1, 100); }
  function pctMinDefault() { return clampRange(state.settings && state.settings.pctMinDefault, PCT_MIN_DEFAULT, 1, 100); }
  function minQtyDefault() { return clampRange(state.settings && state.settings.minQtyDefault, MIN_QTY_DEFAULT, 1, 9999); }
  function budgetDefault() { return clampRange(state.settings && state.settings.budgetDefault, BUDGET_DEFAULT, 1000, 1000000000); }
  function effectiveBudget() { var b = Math.round(num(state.meals && state.meals.budget)); return b > 0 ? b : budgetDefault(); }
  function pctMin(it) { var m = num(it && it.minQty); return pctClamp(m > 0 ? m : pctMinDefault()); }
  function daysAgo(s) {
    var d = parseYmd(s);
    if (!d) return '';
    var t = new Date(); t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    var diff = Math.round((t - d) / 86400000);
    if (diff < 0) return Math.abs(diff) + '일 후';
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    return diff + '일 전';
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, '');
  }
  function normStorage(v) {
    var s = String(v || '').trim();
    if (ST_LABEL[s]) return s;
    if (ST_FROM_LABEL[s]) return ST_FROM_LABEL[s];
    return 'fridge';
  }
  function dateLine() {
    try {
      return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    } catch (e) { return todayStr(); }
  }
  function shortDateLine() {
    var d = new Date();
    var dw = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '/' + d.getDate() + ' (' + dw + ')';
  }
  function toast(msg, isErr) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    t.hidden = false;
    if (t._timer) window.clearTimeout(t._timer);
    t._timer = window.setTimeout(function () { t.className = 'toast'; t.hidden = true; }, 2600);
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssDel(k) { try { window.sessionStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  function fieldVal(id) { var el = $(id); return el ? String(el.value == null ? '' : el.value) : ''; }

  /* ============ 로컬 캐시 ============ */
  function saveLocal() {
    try {
      lsSet(LOCAL_KEY, JSON.stringify({
        inventory: state.inventory, meals: state.meals, settings: state.settings, recipes: state.recipes, daily: state.daily,
        dirty: cloud.dirty, savedAt: Date.now()
      }));
    } catch (e) { /* 용량 초과 등은 무시 */ }
  }
  function loadLocal() {
    var raw = lsGet(LOCAL_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function hydrateLocal(l) {
    if (!l) return;
    if (l.inventory) state.inventory = normalizeInventory(l.inventory);
    if (l.meals) state.meals = normalizeMeals(l.meals);
    if (l.settings) state.settings = normalizeSettings(l.settings);
    if (l.recipes) state.recipes = normalizeRecipes(l.recipes);
    if (l.daily) state.daily = normalizeDaily(l.daily);
    if (l.dirty && typeof l.dirty === 'object') {
      cloud.dirty.inventory = !!l.dirty.inventory;
      cloud.dirty.meals = !!l.dirty.meals;
      cloud.dirty.settings = !!l.dirty.settings;
      cloud.dirty.daily = !!l.dirty.daily;
      cloud.dirty.recipes = !!l.dirty.recipes;
    }
  }

  /* ============ 기기 / 세션 ============ */
  function loadDevice() {
    try {
      var j = JSON.parse(lsGet(DEVICE_KEY) || 'null');
      if (j && j.owner && j.repo && j.token) return { owner: j.owner, repo: j.repo, token: j.token, branch: j.branch || 'main', at: j.at || 0 };
    } catch (e) { /* 무시 */ }
    return null;
  }
  function saveDevice(c) { if (c) lsSet(DEVICE_KEY, JSON.stringify(c)); else lsDel(DEVICE_KEY); }
  function loadSession() {
    var raw = lsGet(SESSION_KEY), store = 'local';
    if (!raw) { raw = ssGet(SESSION_KEY); store = 'session'; }
    if (!raw) return null;
    var j = null;
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (!j || !j.id) return null;
    var exp = Number(j.expiresAt) || 0;
    if (store === 'local' && (!exp || exp <= Date.now())) { lsDel(SESSION_KEY); return null; }
    return { id: String(j.id), name: String(j.name || j.id), role: ROLES[j.role] ? j.role : 'viewer', dashboards: Object.prototype.toString.call(j.dashboards) === '[object Array]' ? j.dashboards : null, store: store, expiresAt: exp };
  }
  function findUser(id) {
    var users = (cloud.users && cloud.users.users) || [];
    var key = String(id || '').toLowerCase();
    for (var i = 0; i < users.length; i++) if (String(users[i].id).toLowerCase() === key) return users[i];
    return null;
  }

  /* ============ 권한 / 사용자 ============ */
  function canEdit() {
    if (!cloud.me) return false;
    var r = ROLES[cloud.me.role];
    return !!(r && r.edit);
  }
  function roleLabel(role) { return (ROLES[role] && ROLES[role].label) || '보기 전용'; }
  function applyUserUi() {
    var me = cloud.me;
    var chip = $('userChip');
    if (chip) chip.hidden = !me;
    if (me) {
      var av = $('ucAv'); if (av) av.textContent = String(me.name || me.id).slice(0, 1) || '·';
      var nm = $('ucName'); if (nm) nm.textContent = me.name || me.id;
      var rl = $('ucRole'); if (rl) rl.textContent = roleLabel(me.role) + ' · ' + me.id;
    }
    var ro = $('roPill'); if (ro) ro.hidden = canEdit();
    ui.readOnly = !canEdit();
  }

