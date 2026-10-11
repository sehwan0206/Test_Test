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

  // 품목 사전(원재료·제품 형태)은 dictionary.js
  FM.DEFAULT_SETTINGS = {
    wRaw: 0.7, // 같은 원재료(결과물이 달라도)일 때 유사도
    wForm: 0.35, // 같은 제품 형태(즙·청·떡·젓갈…)일 때 유사도
    wCat: 0.2, // 같은 품목군일 때 유사도
    radius: 6, // 자동 배치·검수에서 살피는 거리(칸) — 이 안에서 멀수록 좋게 계산
    vScale: 1, // 세로(위·아래) 방향 거리 배율
    lineDist: 1.5, // 검수 선 거리 기준 (lineScope 가 tag/all 일 때)
    lineScope: 'warn', // warn = 위험·주의만 / info = 참고까지 / tag = 원재료·형태 공통 모두 / all = 같은 품목군까지 모두
    lineColorBy: 'group', // group = 원재료·형태별 색 / cluster = 묶음별 색
    heatmap: true,
    liveLines: false, // 배치 화면에서도 검수 선 표시
    autoPin: true, // 수동 배치·교체 시 자동 고정
    zoom: 1, // ③ 배치·④ 검수 화면 배율
    zoomEdit: 0.6, // ② 칸 만들기 화면 배율 (작게 보여서 넓은 격자를 한눈에)
    wPow: 0.5, // 고전력 농가끼리 떨어뜨리기
    wZone: 4, // 전력 구역(간선) 합계 균형
    rawDict: FM.DEFAULT_RAW_DICT,
    formDict: FM.DEFAULT_FORM_DICT,
    dictVersion: FM.DICT_VERSION,
  };

  // 검수 레벨 기준 (근접 위험도 = 유사도 × 거리 가중치)
  FM.LEVELS = { danger: 0.45, warn: 0.3, info: 0.15 }; // 같은 원재료가 대각선(0.7×0.71)이면 위험
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
  /**
   * 배치도(게시용 그림)에 쓰는 짧은 이름.
   * 직접 적은 「표시 이름」(alias)이 있으면 그것, 없으면 법인 표기를 뺀 이름.
   * paren=true 이면 「한빛인터내셔널(들꽃향기)」처럼 괄호 안 상호를 씀 → 「들꽃향기」
   */
  FM.displayName = function (f, paren) {
    if (!f) return '';
    const alias = String(f.alias || '').trim();
    if (alias) return alias;
    const t = FM.shortName(f.name);
    if (paren !== false) {
      const m = t.match(/^(.+?)\s*[(（\[]\s*([^()（）\[\]]+?)\s*[)）\]]\s*$/);
      if (m && Array.from(m[2].replace(/\s/g, '')).length >= 2) return m[2];
    }
    return t;
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
  FM.emptyLayout = (rows, cols) => ({ rows: rows || FM.GRID.rows, cols: cols || FM.GRID.cols, cells: {}, assign: {}, pins: {}, numbering: 'row', zoneCaps: {}, genCap: '' });

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
        power: '', // 전력 사용량 kW ('' = 모름/적음)
        alias: '', // 배치도에 보일 이름 (비우면 농가명에서 자동)
        tags: [], // 원재료
        forms: [], // 제품 형태
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
    const storedDictVersion = (st.settings || {}).dictVersion;
    st.settings = Object.assign(FM.clone(FM.DEFAULT_SETTINGS), st.settings || {});
    let resetTags = false;
    if (storedDictVersion !== FM.DICT_VERSION) {
      // 이전 버전(품목군 + 단순 품목 그룹) → 원재료·형태 기준으로 전환
      const keep = { vScale: st.settings.vScale };
      Object.assign(st.settings, FM.clone(FM.DEFAULT_SETTINGS), keep, {
        lineColorBy: st.settings.lineColorBy,
        heatmap: st.settings.heatmap,
        liveLines: st.settings.liveLines,
        autoPin: st.settings.autoPin,
        zoom: st.settings.zoom,
        zoomEdit: st.settings.zoomEdit,
      });
      delete st.settings.keywords;
      delete st.settings.wTag;
      resetTags = true;
    }
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
        d.layout.zoneCaps = d.layout.zoneCaps || {}; // 전력 구역별 용량 kW
        if (d.layout.genCap === undefined) d.layout.genCap = ''; // 발전기(전체) 용량 kW
        // 아직 칸을 그리지 않은 예전의 작은 격자(8×14)는 넉넉한 기본 크기로 늘림
        if (!Object.keys(d.layout.cells).length) {
          d.layout.rows = Math.max(d.layout.rows, FM.GRID.rows);
          d.layout.cols = Math.max(d.layout.cols, FM.GRID.cols);
        }
      }
      ev.farms = ev.farms.map((f) => FM.newFarm(f));
      for (const f of ev.farms) if (f.power !== '' && typeof f.power !== 'number') f.power = FM.Power ? FM.Power.parse(f.power) : '';
      if (resetTags) for (const f of ev.farms) f.tagsManual = false;
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
  // 부스 번호 매기는 순서
  FM.NUMBERING = [
    ['row', '가로 →', '위 줄부터, 줄마다 왼쪽 → 오른쪽'],
    ['rowR', '가로 ←', '위 줄부터, 줄마다 오른쪽 → 왼쪽'],
    ['snake', '지그재그', '위 줄부터, 줄마다 방향을 바꿔 걷는 순서대로 (→ ← →)'],
    ['col', '세로 ↓', '왼쪽 열부터, 열마다 위 → 아래'],
    ['colR', '세로 ↓ (오른쪽부터)', '오른쪽 열부터, 열마다 위 → 아래'],
  ];
  FM.boothKeys = function (L) {
    const keys = Object.keys(L.cells).filter((k) => L.cells[k].t === 'b');
    const mode = L.numbering || 'row';
    const rc = {};
    for (const k of keys) rc[k] = FM.parseKey(k);
    let rowRank = null;
    if (mode === 'snake') {
      // 부스가 있는 줄만 세어 홀/짝 줄의 방향을 바꿈
      rowRank = {};
      [...new Set(keys.map((k) => rc[k][0]))].sort((a, b) => a - b).forEach((r, i) => (rowRank[r] = i));
    }
    keys.sort((a, b) => {
      const [ra, ca] = rc[a];
      const [rb, cb] = rc[b];
      switch (mode) {
        case 'col':
          return ca - cb || ra - rb;
        case 'colR':
          return cb - ca || ra - rb;
        case 'rowR':
          return ra - rb || cb - ca;
        case 'snake':
          return ra - rb || (rowRank[ra] % 2 ? cb - ca : ca - cb);
        default:
          return ra - rb || ca - cb;
      }
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
  // 부스 방향 (손님을 맞는 앞면이 향하는 쪽): u 위 · d 아래 · l 왼쪽 · r 오른쪽
  //   cell.dir = 방향, cell.da = 1 이면 자동으로 정한 방향 (칸을 더 그리면 다시 계산)
  // ---------------------------------------------------------------------------
  FM.DIRS = ['u', 'd', 'l', 'r'];
  FM.DIR_LABEL = { u: '위', d: '아래', l: '왼쪽', r: '오른쪽' };
  FM.DIR_ARROW = { u: '▲', d: '▼', l: '◀', r: '▶' };
  const DV = { u: [-1, 0], d: [1, 0], l: [0, -1], r: [0, 1] };

  /**
   * 부스 방향 자동 설정
   *   한 줄로 이어진 부스는 줄과 수직 방향만 후보로 두고, 앞이 비어 있는 쪽을 고름.
   *   통로 건너 다른 부스 줄이 있으면 그쪽(통로 쪽)을 우선, 막힌 쪽(부스·시설·격자 끝)은 피함.
   * @param mode 'auto'(기본) = 직접 정한 방향은 두고 자동 방향만 다시 계산 / 'all' = 전부 다시
   * @returns 바뀐 칸 수
   */
  FM.autoDirections = function (L, mode) {
    const at = (r, c) => L.cells[FM.cellKey(r, c)];
    const isB = (r, c) => {
      const x = at(r, c);
      return !!x && x.t === 'b';
    };
    const inGrid = (r, c) => r >= 0 && c >= 0 && r < L.rows && c < L.cols;
    let changed = 0;
    for (const [k, cell] of Object.entries(L.cells)) {
      if (cell.t !== 'b') continue;
      if (mode !== 'all' && cell.dir && !cell.da) continue;
      const [r, c] = FM.parseKey(k);
      const runH = isB(r, c - 1) || isB(r, c + 1);
      const runV = isB(r - 1, c) || isB(r + 1, c);
      const allowed = runH && !runV ? ['d', 'u'] : runV && !runH ? ['r', 'l'] : ['d', 'u', 'r', 'l'];
      let best = null;
      let bestScore = -Infinity;
      for (const dir of allowed) {
        const [fr, fc] = DV[dir];
        const nr = r + fr;
        const nc = c + fc;
        let score;
        if (!inGrid(nr, nc)) score = -3;
        else if (isB(nr, nc)) score = -100;
        else if (at(nr, nc)) score = -5; // 시설 칸
        else {
          score = 2;
          for (let s2 = 2; s2 <= 6; s2++) {
            const rr = r + fr * s2;
            const cc = c + fc * s2;
            if (!inGrid(rr, cc)) {
              score = 1;
              break;
            }
            if (isB(rr, cc)) {
              score = 10 - s2; // 통로 건너 마주 보는 줄
              break;
            }
            if (at(rr, cc)) break;
          }
        }
        if (cell.dir === dir) score += 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = dir;
        }
      }
      if (bestScore <= -100) {
        // 사방이 부스로 막힌 칸 — 방향 없음(거리로만 판단)
        if (cell.dir && cell.da) {
          delete cell.dir;
          delete cell.da;
          changed++;
        }
        continue;
      }
      if (cell.dir !== best) changed++;
      cell.dir = best;
      cell.da = 1;
    }
    return changed;
  };

  /** 방향 일괄 지정: key 칸(그리고 whole 이면 같은 줄로 이어진 부스 전체)에 dir 지정. 지정한 칸 목록 반환 */
  FM.setDirection = function (L, key, dir, whole) {
    const cell = L.cells[key];
    if (!cell || cell.t !== 'b') return [];
    const keys = [key];
    if (whole) {
      // 위·아래를 정하면 가로줄 전체, 왼쪽·오른쪽을 정하면 세로줄 전체
      const [r, c] = FM.parseKey(key);
      const step = dir === 'u' || dir === 'd' ? [0, 1] : [1, 0];
      for (const sgn of [-1, 1]) {
        for (let i = 1; ; i++) {
          const k2 = FM.cellKey(r + step[0] * i * sgn, c + step[1] * i * sgn);
          const x = L.cells[k2];
          if (!x || x.t !== 'b') break;
          keys.push(k2);
        }
      }
    }
    for (const k2 of keys) {
      if (dir) L.cells[k2].dir = dir;
      else delete L.cells[k2].dir;
      delete L.cells[k2].da;
    }
    return keys;
  };

  // ---------------------------------------------------------------------------
  // 칸 모양 프리셋: n개 부스를 가진 기본 형태를 생성
  // ---------------------------------------------------------------------------
  FM.generateShape = function (shape, n, lines) {
    n = Math.max(1, Math.floor(n));
    const path = [];
    let rows, cols;
    if (shape === 'lines') {
      // 마주보는 줄 배치: ↓줄 · 통로 · ↑줄 ↓줄(등 맞댐) · 통로 · ↑줄 …
      const L = Math.max(1, Math.min(8, lines || 2));
      const len = Math.ceil(n / L);
      let r = 1;
      for (let i = 0; i < L; i++) {
        if (i > 0) r += i % 2 === 1 ? 2 : 1;
        for (let c = 0; c < len; c++) path.push([r, 1 + c, i % 2 === 0 ? 'd' : 'u']);
      }
      rows = r + 2;
      cols = len + 2;
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
    path.slice(0, n).forEach(([r, c, dir]) => (cells[FM.cellKey(r + OFF, c + OFF)] = dir ? { t: 'b', dir, da: 1 } : { t: 'b' }));
    rows = Math.min(FM.GRID.max, Math.max(FM.GRID.rows, rows + OFF + FM.GRID.margin));
    cols = Math.min(FM.GRID.max, Math.max(FM.GRID.cols, cols + OFF + FM.GRID.margin));
    const out = { rows, cols, cells };
    if (shape !== 'lines') FM.autoDirections(out, 'all');
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
