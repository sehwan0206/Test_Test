/*
 * 농부의시장 배치도 도우미 — 공통 데이터 모델 / 유틸리티
 * 브라우저(window.FM)와 Node 테스트(globalThis.FM) 양쪽에서 동작하도록 작성.
 */
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  FM.STORAGE_KEY = 'farmers-market-layout:v1';
  FM.BACKUP_KEY = 'farmers-market-layout:v1:backup';
  FM.DATA_VERSION = 1;
  FM.WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  // ---------------------------------------------------------------------------
  // 기본 장소 / 일정 (사진의 일정표 기준: 노랑=양천, 파랑=뚝섬, 분홍=화랑대)
  // ---------------------------------------------------------------------------
  FM.DEFAULT_VENUES = [
    { id: 'yangcheon', name: '양천파리공원', short: '양천', color: '#f7dc8a' },
    { id: 'ttukseom', name: '뚝섬한강공원', short: '뚝섬', color: '#a6d8ec' },
    { id: 'hwarangdae', name: '화랑대철도공원', short: '화랑대', color: '#e4c7e2' },
  ];

  FM.DEFAULT_SCHEDULE = [
    { venue: 'yangcheon', title: '13,14회차', days: [['2026-10-03', '13회차'], ['2026-10-04', '14회차']] },
    { venue: 'ttukseom', title: '13,14회차', days: [['2026-10-10', '13회차'], ['2026-10-11', '14회차']] },
    { venue: 'hwarangdae', title: '13,14회차', days: [['2026-10-17', '13회차'], ['2026-10-18', '14회차']] },
    { venue: 'yangcheon', title: '15,16회차', days: [['2026-10-24', '15회차'], ['2026-10-25', '16회차']] },
    { venue: 'ttukseom', title: '15,16회차', days: [['2026-10-31', '15회차'], ['2026-11-01', '16회차']] },
    { venue: 'hwarangdae', title: '15,16회차', days: [['2026-11-07', '15회차'], ['2026-11-08', '16회차']] },
    { venue: 'yangcheon', title: '17,18회차', days: [['2026-11-14', '17회차'], ['2026-11-15', '18회차']] },
  ];

  // ---------------------------------------------------------------------------
  // 품목 키워드 사전 (설정에서 수정 가능)
  //   그룹명: 키워드, 키워드, ...
  //   키워드 문법:  꿀 = 포함 / =배 = 정확히 일치 / ^묵 = ~로 시작 / 청$ = ~로 끝남 / !김치 = 제외
  //   괄호 안 내용(예: 사과(홍로, 부사))은 품종·구성 설명으로 보고 무시합니다.
  // ---------------------------------------------------------------------------
  FM.DEFAULT_KEYWORDS = [
    '꿀·양봉: 꿀, 로얄젤리, 로열젤리, 꽃가루, =화분, 밀랍, 프로폴리스, 허니, !꿀떡, !꿀빵',
    '사과: 사과, 홍로, 감홍, 부사, 시나노, 아리수',
    '배: =배, 신고배, 배즙, 배도라지',
    '포도: 포도, 샤인머스켓, 샤인머스캣, 머스켓, 머스캣, 거봉, 캠벨, 머루, !포도씨, !식초',
    '딸기: 딸기',
    '베리류: 블루베리, 아로니아, 오디, 복분자, 크랜베리, !식초',
    '복숭아·자두·살구: 복숭아, 자두, 살구, 천도, 매실, !장아찌',
    '감: 단감, 대봉, 홍시, 곶감, 말랭이, 반시, 연시, =감',
    '감귤·유자: 귤, 한라봉, 천혜향, 레드향, 황금향, 유자, !요거트',
    '참다래·키위: 참다래, 키위',
    '대추: 대추',
    '밤·견과: 알밤, 군밤, 깐밤, 칼집밤, 칼집밥, 반밤, =밤, 잣, 호두, 땅콩, 은행, 아몬드',
    '버섯: 버섯, 표고, 느타리, 송이, 목이, 노루궁뎅이, 상황, 영지, 동충하초, 팽이',
    '산나물·약초: 고사리, 더덕, 도라지, 명이, 산마늘, 눈개승마, 엄나무, 두릅, 취나물, 곰취, 나물, 황기, 칡, 헛개, 당귀, 오가피',
    '인삼·홍삼: 인삼, 홍삼, 수삼, 흑삼, 산양삼, 새싹삼',
    '채소: 토마토, 오이, 고추, 고춧가루, 양파, 감자, 고구마, 배추, =무, 상추, 대파, 쪽파, =파, 양배추, 호박, 가지, 생강, 마늘, 당근, 쌈채, 케일, 로메인, 허브, 바질, =딜, 시금치, 브로콜리, 파프리카, 차요태, 비트, 여주, 콜라비, 연근, 우엉, 부추, 미나리, !고추장, !차$, !장아찌, !김치',
    '김치: 김치, 깍두기, 겉절이, 섞박지, 동치미, 소박이, 알타리, 열무, 묵은지',
    '장류: 된장, 고추장, 간장, 막장, 청국장, 쌈장, 메주, 장소금, !어간장, !게장',
    '장아찌·절임: 장아찌, 짱아찌, 절임, 피클',
    '젓갈·액젓: 젓, 명란, 창난, 액젓, 어간장, 까나리',
    '게장·해산물: 게장, 전복, 꽃게, 새우장, 대게, 낙지, 오징어, 문어, 새우, =굴, 굴비, !젓, !어간장',
    '조개·재첩: 재첩, 바지락, 홍합, 조개, 꼬막, 가리비',
    '김·해조류: 김, 미역, 다시마, 톳, 감태, 매생이, 파래, 꼬시래기, !김치, !김장, !튀김, !식초',
    '건어물: 멸치, 황태, 북어, 쥐포, 건어물, 노가리, 건새우, 꼴뚜기, 실치, 디포리, !어간장, !액젓',
    '떡: 떡, 인절미, 송편, 설기, 모찌, 경단, 절편, 시루, 증편, !떡갈비',
    '한과·간식: 약과, 강정, 한과, 유과, 정과, 부각, 오란다, 누룽지, 쿠키, 젤리, 양갱, 칩, 과자, 주전부리, 그래놀라, !로얄젤리, !로열젤리',
    '빵·베이커리: 빵, 베이글, 식빵, 치아바타, 샌드, 스콘, 케이크, 머핀, 휘낭시에, 마들렌, 파이, 카스테라, 와플, 꽈배기, !빵가루',
    '음료: 식혜, 수정과, 음료, 주스, 쥬스, 라떼, 에이드, 스무디, 커피, 두유, 미숫가루',
    '청·즙·진액: 청$, 즙, 진액, 원액, 발효액, 추출액, 엑기스, 농축액',
    '차: 차$, 티백, 잎차',
    '식초: 식초, 발사믹, 발효초',
    '잼·소스: 잼, 쨈, 퓨레, 페스토, 스프레드, 소스, 드레싱, 시럽',
    '주류: 와인, 증류주, 막걸리, 약주, 담금주, 소주, 맥주, 뱅쇼, 전통주, 탁주, 과실주, !식초',
    '유제품: 치즈, 요거트, 요구르트, 우유, 버터',
    '계란: 계란, 달걀, 란$, 유정란, 메추리알, !명란, !창란',
    '육류·육가공: 한우, 한돈, 돼지고기, 소고기, =닭, 닭고기, 오리, 육포, 고기, 정육, 소시지, 햄, 떡갈비, 불고기, 곰탕, 사골',
    '곡물·잡곡: =쌀, 백미, 현미, 찹쌀, 흑미, 잡곡, 서리태, 콩$, 팥, 귀리, 율무, 보리, 수수, 차조, 매조, 기장, 메밀, 옥수수, 오곡, 녹두, 들깨, 참깨, 통깨, !차$, !식초, !발효, !떡, !모찌',
    '참기름·들기름: 기름, 오일',
    '묵: ^묵, 도토리, 건조묵, !묵은',
    '즉석·간편식: 밀키트, 도시락, 간편식, 국$, 수프, 스프, !떡국, !청국',
    '건강식품: 천년초, 꾸지뽕, 와송, 콜라겐, 유산균, 흑마늘, 노니, 녹용, 효소, 환$',
    '화훼·모종: 생화, 모종, 다육, 화초, 묘목, 꽃$, !꿀',
  ].join('\n');

  FM.DEFAULT_SETTINGS = {
    wCat: 0.35, // 같은 품목군일 때 유사도
    wTag: 0.65, // 공통 품목 키워드가 있을 때 유사도
    radius: 2.3, // 자동 배치·점수 계산에 고려하는 거리(칸)
    vScale: 1, // 세로(위·아래) 방향 거리 배율 (2 → 위아래 칸을 2칸 거리로 취급)
    lineDist: 1.5, // 검수 선 거리 기준 (lineScope 가 tag/all 일 때)
    lineScope: 'warn', // warn = 위험·주의만 / info = 참고까지 / tag = 공통 품목 모두 / all = 같은 품목군까지 모두
    lineColorBy: 'group', // group = 품목별 색 / cluster = 묶음별 색
    heatmap: true,
    liveLines: false, // 배치 화면에서도 검수 선 표시
    autoPin: true, // 수동 배치·교체 시 자동 고정
    zoom: 1, // ③ 배치·④ 검수 화면 배율
    zoomEdit: 0.6, // ② 칸 만들기 화면 배율 (작게 보여서 넓은 격자를 한눈에)
    keywords: FM.DEFAULT_KEYWORDS,
  };

  // 검수 레벨 기준 (근접 위험도 = 유사도 × 거리 가중치)
  FM.LEVELS = { danger: 0.6, warn: 0.3, info: 0.15 };
  FM.LEVEL_LABEL = { danger: '위험', warn: '주의', info: '참고' };

  // ---------------------------------------------------------------------------
  // 품목군 색상
  // ---------------------------------------------------------------------------
  FM.CATEGORY_HUES = {
    '가공식품류': 32,
    '양곡류': 52,
    '채소류': 112,
    '특용·임산물류': 160,
    '수산물류': 195,
    '즉석식품류': 228,
    '축산류': 275,
    '반찬·장류': 320,
    '과실류': 352,
  };
  const catColorCache = {};
  FM.catColor = function (cat) {
    const key = FM.normCategory(cat) || '(미분류)';
    if (catColorCache[key]) return catColorCache[key];
    let hue = FM.CATEGORY_HUES[key];
    if (hue == null) {
      let hsh = 0;
      for (const ch of key) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
      hue = key === '(미분류)' ? null : (hsh * 47) % 360;
    }
    const c =
      hue == null
        ? { hue: 0, bg: '#f1f1f1', mid: '#cfcfcf', bd: '#8a8a8a', hex: '#9e9e9e', bgHex: '#f1f1f1' }
        : {
            hue,
            bg: `hsl(${hue} 78% 92%)`,
            mid: `hsl(${hue} 62% 76%)`,
            bd: `hsl(${hue} 52% 42%)`,
            hex: hslToHex(hue, 55, 52),
            bgHex: hslToHex(hue, 78, 90),
          };
    catColorCache[key] = c;
    return c;
  };

  // 검수 선 색상 (품목 그룹/묶음별로 돌려가며 사용)
  FM.LINE_PALETTE = [
    '#e15759', '#4e79a7', '#f28e2b', '#59a14f', '#b07aa1', '#17a2b8', '#d4a017',
    '#ff6fa8', '#8c6d4f', '#2f4b7c', '#9acd32', '#c0392b', '#6a5acd', '#008b8b',
  ];

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }
  FM.hslToHex = hslToHex;

  // ---------------------------------------------------------------------------
  // 일반 유틸
  // ---------------------------------------------------------------------------
  FM.uid = function (prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  };
  FM.clone = (o) => JSON.parse(JSON.stringify(o));

  FM.parseDate = function (iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  FM.toISO = function (dt) {
    const p = (n) => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  };
  FM.addDays = function (iso, n) {
    const dt = FM.parseDate(iso);
    dt.setDate(dt.getDate() + n);
    return FM.toISO(dt);
  };
  FM.todayISO = () => FM.toISO(new Date());
  FM.weekday = (iso) => FM.WEEKDAYS[FM.parseDate(iso).getDay()];
  FM.fmtDay = function (iso) {
    const dt = FM.parseDate(iso);
    return dt.getMonth() + 1 + '.' + dt.getDate() + '(' + FM.WEEKDAYS[dt.getDay()] + ')';
  };
  FM.fmtRange = function (days) {
    if (!days || !days.length) return '날짜 없음';
    const sorted = days.map((d) => d.date).sort();
    if (sorted.length === 1) return FM.fmtDay(sorted[0]);
    return FM.fmtDay(sorted[0]) + ' ~ ' + FM.fmtDay(sorted[sorted.length - 1]);
  };
  FM.dayLabel = (day) => FM.weekday(day.date) + ' ' + FM.fmtDay(day.date).replace(/\(.\)$/, '');

  FM.normCategory = function (s) {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/[.ㆍ・•∙]/g, '·')
      .trim();
  };
  const CORP_RE = /(농업회사법인|영농조합법인|영어조합법인|어업회사법인|농업법인|주식회사|유한회사|유한책임회사|합자회사|\(주\)|\(유\)|㈜|\(농\)|\(영\))/g;
  FM.normName = (s) => String(s || '').replace(CORP_RE, '').replace(/[\s()·.,\-_]/g, '').toLowerCase();
  FM.shortName = function (s) {
    const t = String(s || '').replace(CORP_RE, '').replace(/\s+/g, ' ').trim();
    return t || String(s || '').trim();
  };
  FM.phoneDigits = (s) => String(s || '').replace(/\D/g, '');
  FM.isSameFarm = function (a, b) {
    const pa = FM.phoneDigits(a.phone);
    const pb = FM.phoneDigits(b.phone);
    if (pa && pb && pa.length >= 8 && pa === pb) return true;
    const na = FM.normName(a.name);
    return !!na && na === FM.normName(b.name);
  };

  FM.cellKey = (r, c) => r + ',' + c;
  FM.parseKey = function (k) {
    const i = k.indexOf(',');
    return [+k.slice(0, i), +k.slice(i + 1)];
  };

  FM.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------------------------------------------------------------------------
  // 데이터 모델
  // ---------------------------------------------------------------------------
  //  state = { version, venues[], events[], settings }
  //  venue = { id, name, short, color, template: {rows, cols, cells} | null }
  //  event = { id, venueId, title, days[], farms[] }
  //  day   = { id, date, round, layout }
  //  layout= { rows, cols, cells: {"r,c": {t:'b'} | {t:'l', label}}, assign: {"r,c": farmId}, pins: {farmId:true}, numbering }
  //  farm  = { id, no, sido, sigungu, name, owner, phone, category, items, isNew, place, memo,
  //            tags[], tagsManual, days: {dayId: true} }
  // 격자 크기: 농가가 40곳을 넘는 경우가 많아 넉넉하게 시작 (20줄 × 30칸 = 600칸)
  FM.GRID = { rows: 20, cols: 30, max: 100, margin: 3 };
  FM.emptyLayout = (rows, cols) => ({ rows: rows || FM.GRID.rows, cols: cols || FM.GRID.cols, cells: {}, assign: {}, pins: {}, numbering: 'row' });

  FM.newDay = (date, round) => ({ id: FM.uid('d'), date, round: round || '', layout: FM.emptyLayout() });

  FM.newFarm = function (data) {
    return Object.assign(
      {
        id: FM.uid('f'),
        no: '',
        sido: '',
        sigungu: '',
        name: '',
        owner: '',
        phone: '',
        category: '',
        items: '',
        isNew: '',
        place: '',
        memo: '',
        tags: [],
        tagsManual: false,
        days: {},
      },
      data || {}
    );
  };

  FM.createDefaultState = function () {
    return {
      version: FM.DATA_VERSION,
      venues: FM.DEFAULT_VENUES.map((v) => Object.assign({}, v, { template: null })),
      events: FM.DEFAULT_SCHEDULE.map((e) => ({
        id: FM.uid('ev'),
        venueId: e.venue,
        title: e.title,
        days: e.days.map(([date, round]) => FM.newDay(date, round)),
        farms: [],
      })),
      settings: FM.clone(FM.DEFAULT_SETTINGS),
      meta: { exportId: null, loadedExportId: null, exportedAt: null, updatedAt: null },
    };
  };

  /** 저장된 데이터의 누락 필드를 보정 */
  FM.normalizeState = function (st) {
    if (!st || typeof st !== 'object') return FM.createDefaultState();
    st.version = FM.DATA_VERSION;
    st.venues = Array.isArray(st.venues) && st.venues.length ? st.venues : FM.createDefaultState().venues;
    st.events = Array.isArray(st.events) ? st.events : [];
    st.settings = Object.assign(FM.clone(FM.DEFAULT_SETTINGS), st.settings || {});
    st.meta = Object.assign({ exportId: null, loadedExportId: null, exportedAt: null, updatedAt: null }, st.meta || {});
    for (const v of st.venues) if (v.template === undefined) v.template = null;
    for (const ev of st.events) {
      ev.days = Array.isArray(ev.days) ? ev.days : [];
      ev.farms = Array.isArray(ev.farms) ? ev.farms : [];
      for (const d of ev.days) {
        d.layout = Object.assign(FM.emptyLayout(), d.layout || {});
        d.layout.cells = d.layout.cells || {};
        d.layout.assign = d.layout.assign || {};
        d.layout.pins = d.layout.pins || {};
        // 아직 칸을 그리지 않은 예전의 작은 격자(8×14)는 넉넉한 기본 크기로 늘림
        if (!Object.keys(d.layout.cells).length) {
          d.layout.rows = Math.max(d.layout.rows, FM.GRID.rows);
          d.layout.cols = Math.max(d.layout.cols, FM.GRID.cols);
        }
      }
      ev.farms = ev.farms.map((f) => FM.newFarm(f));
      ev.days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    return st;
  };

  /** 브라우저(이 컴퓨터)에 저장된 작업. 없으면 null */
  FM.loadLocalState = function () {
    try {
      const raw = root.localStorage && root.localStorage.getItem(FM.STORAGE_KEY);
      if (raw) return FM.normalizeState(JSON.parse(raw));
    } catch (e) {
      console.warn('저장 데이터를 읽지 못했습니다', e);
    }
    return null;
  };
  FM.saveState = function (st) {
    try {
      st.meta.updatedAt = new Date().toISOString();
      root.localStorage.setItem(FM.STORAGE_KEY, JSON.stringify(st));
      return true;
    } catch (e) {
      console.warn('저장 실패', e);
      return false;
    }
  };
  FM.backupLocal = function () {
    try {
      const raw = root.localStorage.getItem(FM.STORAGE_KEY);
      if (raw) root.localStorage.setItem(FM.BACKUP_KEY, raw);
    } catch (e) {
      console.warn('백업 실패', e);
    }
  };

  // ---------------------------------------------------------------------------
  // 공유용 HTML: 파일 안에 작업 데이터를 함께 담아 '파일 하나'로 주고받기
  // ---------------------------------------------------------------------------
  FM.EMBED_RE = /(<script id="fm-embedded" type="application\/json">)([\s\S]*?)(<\/script>)/;

  /** 이 HTML 파일에 담겨 온 작업 데이터 (없으면 null) */
  FM.readEmbeddedState = function () {
    const el = root.document && root.document.getElementById('fm-embedded');
    const txt = el ? el.textContent.trim() : '';
    if (!txt) return null;
    try {
      return FM.normalizeState(JSON.parse(txt));
    } catch (e) {
      console.warn('파일에 담긴 데이터를 읽지 못했습니다', e);
      return null;
    }
  };

  /** 다른 사람이 보낸 공유용 HTML 또는 백업 JSON 텍스트 → state */
  FM.parseWorkFile = function (text) {
    const m = String(text).match(FM.EMBED_RE);
    const json = m ? m[2].trim() : String(text).trim();
    if (!json) throw new Error('파일에 작업 데이터가 없습니다.');
    const obj = JSON.parse(json);
    if (!obj || !Array.isArray(obj.events)) throw new Error('농부의시장 배치도 작업 파일이 아닙니다.');
    return FM.normalizeState(obj);
  };

  FM.embedStateInHtml = function (html, st) {
    const json = JSON.stringify(st).replace(/<\//g, '<\\/');
    return html.replace(FM.EMBED_RE, (all, open, body, close) => open + json + close);
  };

  // ---------------------------------------------------------------------------
  // 배치(layout) 헬퍼
  // ---------------------------------------------------------------------------
  FM.boothKeys = function (L) {
    const keys = Object.keys(L.cells).filter((k) => L.cells[k].t === 'b');
    const byCol = L.numbering === 'col';
    keys.sort((a, b) => {
      const [ra, ca] = FM.parseKey(a);
      const [rb, cb] = FM.parseKey(b);
      return byCol ? ca - cb || ra - rb : ra - rb || ca - cb;
    });
    return keys;
  };
  FM.boothNumbers = function (L) {
    const map = {};
    FM.boothKeys(L).forEach((k, i) => (map[k] = i + 1));
    return map;
  };
  FM.attendingFarms = (ev, day) => ev.farms.filter((f) => f.days && f.days[day.id]);

  /** 부스가 아닌 칸·불참 농가·중복 배정을 정리 */
  FM.cleanLayout = function (L, ev, day) {
    const attending = new Set(FM.attendingFarms(ev, day).map((f) => f.id));
    const seen = new Set();
    for (const k of Object.keys(L.assign)) {
      const fid = L.assign[k];
      const cell = L.cells[k];
      if (!cell || cell.t !== 'b' || !attending.has(fid) || seen.has(fid)) delete L.assign[k];
      else seen.add(fid);
    }
    for (const fid of Object.keys(L.pins)) if (!seen.has(fid)) delete L.pins[fid];
    for (const k of Object.keys(L.cells)) {
      const [r, c] = FM.parseKey(k);
      if (r >= L.rows || c >= L.cols || r < 0 || c < 0) {
        delete L.cells[k];
        delete L.assign[k];
      }
    }
  };
  /** 칸이 아래·오른쪽 끝에 가까워지면 격자를 늘려 항상 여유 칸(margin)을 남김. 늘렸으면 true */
  FM.ensureMargin = function (L, margin) {
    const m = margin == null ? FM.GRID.margin : margin;
    let maxR = -1;
    let maxC = -1;
    for (const k of Object.keys(L.cells)) {
      const [r, c] = FM.parseKey(k);
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    const rows = Math.min(FM.GRID.max, Math.max(L.rows, maxR + 1 + m));
    const cols = Math.min(FM.GRID.max, Math.max(L.cols, maxC + 1 + m));
    const grew = rows !== L.rows || cols !== L.cols;
    L.rows = rows;
    L.cols = cols;
    return grew;
  };

  FM.farmCellMap = function (L) {
    const m = {};
    for (const [k, fid] of Object.entries(L.assign)) m[fid] = k;
    return m;
  };

  // ---------------------------------------------------------------------------
  // 칸 모양 프리셋: n개 부스를 가진 기본 형태를 생성
  // ---------------------------------------------------------------------------
  FM.generateShape = function (shape, n, lines) {
    n = Math.max(1, Math.floor(n));
    const path = [];
    let rows, cols;
    if (shape === 'lines') {
      // 마주보기 줄 배치: 줄 사이에 통로 1칸
      const L = Math.max(1, Math.min(8, lines || 2));
      const len = Math.ceil(n / L);
      rows = L * 2 + 1;
      cols = len + 2;
      for (let i = 0; i < L; i++) for (let c = 0; c < len; c++) path.push([1 + i * 2, 1 + c]);
    } else if (shape === 'u') {
      // ㄷ자: 위쪽 줄 → 왼쪽 세로 → 아래쪽 줄 (오른쪽이 열린 형태)
      const hgt = Math.max(3, Math.round(n / 4) + 1);
      const w = Math.max(2, Math.ceil((n - (hgt - 2)) / 2));
      rows = hgt + 2;
      cols = w + 2;
      for (let c = w; c >= 1; c--) path.push([1, c]);
      for (let r = 2; r < hgt; r++) path.push([r, 1]);
      for (let c = 1; c <= w; c++) path.push([hgt, c]);
    } else if (shape === 'ring') {
      // ㅁ자: 사각형 둘레
      const hgt = Math.max(3, Math.round(n / 6) + 2);
      const w = Math.max(3, Math.ceil((n - 2 * (hgt - 2)) / 2));
      rows = hgt + 2;
      cols = w + 2;
      for (let c = 1; c <= w; c++) path.push([1, c]);
      for (let r = 2; r < hgt; r++) path.push([r, w]);
      for (let c = w; c >= 1; c--) path.push([hgt, c]);
      for (let r = hgt - 1; r >= 2; r--) path.push([r, 1]);
    } else {
      // block: 꽉 찬 사각형
      const w = Math.max(1, Math.ceil(Math.sqrt(n * 1.8)));
      const hgt = Math.ceil(n / w);
      rows = hgt + 2;
      cols = w + 2;
      for (let r = 1; r <= hgt; r++) for (let c = 1; c <= w; c++) path.push([r, c]);
    }
    // 위·왼쪽에 여유 2칸(입구·무대 표시용), 전체 격자는 기본 크기 이상으로 넉넉하게
    const OFF = 1;
    const cells = {};
    path.slice(0, n).forEach(([r, c]) => (cells[FM.cellKey(r + OFF, c + OFF)] = { t: 'b' }));
    rows = Math.min(FM.GRID.max, Math.max(FM.GRID.rows, rows + OFF + FM.GRID.margin));
    cols = Math.min(FM.GRID.max, Math.max(FM.GRID.cols, cols + OFF + FM.GRID.margin));
    return { rows, cols, cells };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
