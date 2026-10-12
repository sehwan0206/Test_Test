/*
 * 게시용 배치도 그림
 *  - 흰 바탕 · 맨 위 제목 · 배치 모양 그대로 상호명 · 줄마다 다른 색 · 부스 번호
 *  - 장소마다 팀에서 쓰던 형식이 기본 (양천: 초록 제목 띠·번호 상자·전력 숫자 / 화랑대: 가로 글씨·노랑 칸 / 뚝섬: 세로 글씨·방향 띠)
 *  - 간단히(상호명) / 자세히(상호명·품목·지역)
 *  - 이 날짜만 / 주말 합쳐서(한쪽 날만 오는 농가에 「토」「일」 표시)
 *  - 시설 칸은 같은 이름끼리 하나의 띠로 (관람객 통로·입구·야외무대·주차장…)
 */
(function (root) {
  'use strict';
  const FM = root.FM;
  const P = (FM.Poster = {});

  P.PALETTES = [
    { id: 'yb', name: '노랑·하늘', colors: ['#FFF1BF', '#C3D3EA'] },
    { id: 'yb2', name: '노랑·파랑', colors: ['#FFE699', '#BDD7EE'] },
    { id: 'yg', name: '노랑·연두', colors: ['#FFF1BF', '#D3EAC2'] },
    { id: 'pm', name: '분홍·민트', colors: ['#FADBDD', '#CBEBE3'] },
    { id: 'many', name: '여러 색', colors: ['#FFF1BF', '#C3D3EA', '#D3EAC2', '#F8D3CF', '#E2D5F0', '#CDEDEC', '#FBDDBA'] },
    { id: 'yellow', name: '노랑', colors: ['#FFEB9C'] },
    { id: 'white', name: '흰색', colors: ['#FFFFFF'] },
  ];
  P.DEFAULTS = {
    content: 'name', // name(간단히: 상호명) | card(자세히: 상호명·품목·지역)
    scope: 'day', // day(이 날짜만) | weekend(주말 합쳐서)
    titleTpl: '{장소} 배치도({월일})', // {장소} {날짜} {월일} {회차}
    titleStyle: 'plain', // plain(글자만) | bar(색 띠)
    titleBar: '#0B7A0B',
    titleIcon: '',
    colorBy: 'auto', // 간단히 칸 색: auto·row(부스 줄마다) | col(세로 열마다) | cat(품목군별) | one(한 색)
    cardColorBy: 'cat', // 자세히 머리 칸 색
    palette: 'yb',
    colors: null, // 직접 고른 색 (null = 색 조합 그대로)
    text: 'auto', // auto | v(세로 글씨) | h(가로 글씨)
    cw: 0, // 간단히 칸 크기 (0 = 자동)
    ch: 0,
    ccw: 0, // 자세히 칸 크기
    cch: 0,
    noStyle: 'attach', // attach(상호명에 붙여서) | box(번호 상자) | none
    noColor: '#70AD47',
    showEmpty: true, // 빈 자리 칸도 그리기
    paren: true, // 「한빛인터내셔널(들꽃향기)」 → 「들꽃향기」
    showPower: false, // 전력 kW 빨간 숫자
    bands: { l: '', r: '', t: '', b: '' }, // 방향 표시 띠 글씨
    bandColor: '#1B5E7A',
    labelColors: {}, // 시설 이름 → 색
    note: '', // 맨 아래 작은 글씨
  };
  // 장소별 기본 형식 (팀에서 쓰던 배치도 그림)
  P.VENUE_PRESETS = {
    ttukseom: { bands: { l: '한강방향 🌉', r: '자양역방향 🚇', t: '', b: '' } },
    yangcheon: {
      scope: 'weekend',
      titleTpl: '양천 파리공원 농부의 시장 부스 배치도 | {날짜}',
      titleStyle: 'bar',
      titleBar: '#0B7A0B',
      titleIcon: '🍂',
      palette: 'yb2',
      noStyle: 'box',
      noColor: '#70AD47',
      showPower: true,
    },
    hwarangdae: {
      scope: 'weekend',
      titleTpl: '화랑대 철도공원 농부의 시장 부스 배치도 | {날짜}',
      colorBy: 'one',
      palette: 'yellow',
      text: 'h',
      cw: 180,
      ch: 120,
      labelColors: { 노원기차마을: '#FFC000', 출구: '#BF9000' },
    },
  };
  // 시설 이름 → [바탕, 글씨]
  P.LABEL_STYLES = [
    [/통로|광장|산책로/, '#D5E8D4', '#8A9A88'],
    [/입구|출구|출입/, '#C0392B', '#FFFFFF'],
    [/무대|공연/, '#6AA84F', '#FFFFFF'],
    [/주차/, '#D9D9D9', '#222222'],
    [/본부|안내|운영/, '#1F4E79', '#FFFFFF'],
    [/화장실/, '#E7E6E6', '#555555'],
    [/기차|마을|건물|매표/, '#FFC000', '#2B2B2B'],
    [/나무|화단|잔디/, '#C6E0B4', '#375623'],
  ];
  P.NO_COLOR = '#0F5A73';
  P.TEXT_COLOR = '#111827';
  P.DAY_BADGE = '#FF6A13';
  P.POWER_BADGE = '#E01B1B';
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕","Noto Sans KR",sans-serif'; // 이모지 글꼴은 넣지 않음 (숫자까지 이모지 글꼴로 그려져 간격이 벌어짐)
  const font = (w, s) => `${w} ${Math.round(s * 10) / 10}px ${FONT}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ 색 ---
  const rgbOf = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const luminance = (hex) => {
    const [r, g, b] = rgbOf(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** 바탕색 위에 읽기 좋은 글씨색 */
  P.inkOn = (hex) => (luminance(hex) > 0.4 ? '#1F2937' : '#FFFFFF');
  const mix = (hex, t, to) => {
    const [r, g, b] = rgbOf(hex);
    const tv = to === 'black' ? 0 : 255;
    const ch = (v) => Math.round(v + (tv - v) * t);
    return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
  };

  P.labelStyle = function (label, o) {
    let fill = '#E4E7EC';
    let ink = '#4B5563';
    for (const [re, f, t] of P.LABEL_STYLES)
      if (re.test(label)) {
        fill = f;
        ink = t;
        break;
      }
    const custom = o && o.labelColors && o.labelColors[label];
    if (custom) {
      fill = custom;
      ink = P.inkOn(custom);
    }
    return { fill, ink, open: FM.isOpenLabel(label) };
  };

  // -------------------------------------------------------------- 설정 ---
  P.preset = (venue) => Object.assign(FM.clone(P.DEFAULTS), FM.clone((venue && P.VENUE_PRESETS[venue.id]) || {}));
  /** 장소 기본 형식 + 장소에 저장된 설정 */
  P.options = function (venue) {
    const base = P.preset(venue);
    const saved = venue && venue.posterOpts ? FM.clone(venue.posterOpts) : {};
    if (saved.showNo === false && !saved.noStyle) saved.noStyle = 'none'; // 예전 설정
    delete saved.showNo;
    const o = Object.assign(base, saved);
    o.bands = Object.assign({ l: '', r: '', t: '', b: '' }, saved.bands || P.preset(venue).bands);
    o.labelColors = Object.assign({}, P.preset(venue).labelColors, saved.labelColors || {});
    return o;
  };
  P.colorsOf = function (o) {
    if (Array.isArray(o.colors) && o.colors.length) return o.colors;
    return (P.PALETTES.find((x) => x.id === o.palette) || P.PALETTES[0]).colors;
  };

  // ----------------------------------------------------------- 날짜·제목 ---
  const dparts = (iso) => {
    const d = FM.parseDate(iso);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), w: FM.WEEKDAYS[d.getDay()] };
  };
  /** full = 「2026. 10. 3 - 4」 / short = 「10.3-4」 (하루면 「2026. 10. 3(토)」 / 「10.3」) */
  P.dateText = function (days) {
    const ds = days.map((d) => d.date).sort();
    const a = dparts(ds[0]);
    const b = dparts(ds[ds.length - 1]);
    if (ds.length === 1) return { full: `${a.y}. ${a.m}. ${a.d}(${a.w})`, short: `${a.m}.${a.d}` };
    if (a.m === b.m) return { full: `${a.y}. ${a.m}. ${a.d} - ${b.d}`, short: `${a.m}.${a.d}-${b.d}` };
    return { full: `${a.y}. ${a.m}. ${a.d} - ${b.m}. ${b.d}`, short: `${a.m}.${a.d}-${b.m}.${b.d}` };
  };
  P.fillTitle = function (tpl, venue, ev, days) {
    const dt = P.dateText(days);
    return String(tpl || '')
      .replace(/\{장소\}/g, (venue && venue.name) || '')
      .replace(/\{날짜\}/g, dt.full)
      .replace(/\{월일\}/g, dt.short)
      .replace(/\{회차\}/g, days.length === 1 ? days[0].round || ev.title : ev.title)
      .trim();
  };
  /** 직접 고친 제목(주말이면 일정에, 하루면 날짜에 저장) → 없으면 장소 기본 제목 */
  P.titleOf = (o, plan, venue, ev) => (plan.holder.posterTitle != null ? plan.holder.posterTitle : P.fillTitle(o.titleTpl, venue, ev, plan.titleDays));

  // ------------------------------------------------------------ 그릴 범위 ---
  /**
   * 이 날짜만 / 주말 합쳐서
   *  주말: 배치가 된 날짜들의 칸을 합치고, 한 자리에 날짜마다 누가 있는지 모음.
   *        일부 날에만 그 자리에 있는 농가는 badge = 「토」「일」
   */
  P.plan = function (ev, day, scope) {
    const weekend = scope === 'weekend' && ev.days.length > 1;
    let used = [day];
    if (weekend) {
      const placed = ev.days.filter((d) => Object.keys(d.layout.assign || {}).length);
      if (placed.length) used = placed;
    }
    const base = used.includes(day) ? day : used[0];
    const cells = {};
    for (const d of [base].concat(used.filter((x) => x !== base))) for (const k in d.layout.cells) if (!cells[k]) cells[k] = d.layout.cells[k];
    const seats = {};
    for (const d of used)
      for (const k in d.layout.assign) {
        if (!cells[k] || cells[k].t !== 'b') continue;
        const fid = d.layout.assign[k];
        const list = seats[k] || (seats[k] = []);
        let e = list.find((x) => x.farmId === fid);
        if (!e) list.push((e = { farmId: fid, days: [] }));
        e.days.push(d);
      }
    let split = 0;
    for (const k in seats) {
      if (seats[k].length > 1) split++;
      for (const e of seats[k]) e.badge = used.length > 1 && e.days.length < used.length ? e.days.map((d) => FM.weekday(d.date)).join('·') : '';
    }
    return {
      weekend,
      days: used,
      base,
      missing: weekend ? ev.days.filter((d) => !used.includes(d)) : [],
      layout: { cells, numbering: base.layout.numbering || 'row' },
      seats,
      split,
      titleDays: weekend ? ev.days : [day],
      holder: weekend ? ev : day,
    };
  };

  /** 글자 단위로 자르기 (이모지·결합 문자 보존) */
  P.graphemes = function (s) {
    s = String(s || '');
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
    return Array.from(s);
  };

  /** 부스가 가로로 늘어선 배치인지(row) 세로로 늘어선 배치인지(col) */
  P.orientation = function (L) {
    let hz = 0;
    let vt = 0;
    for (const k in L.cells) {
      const cell = L.cells[k];
      if (cell.t !== 'b') continue;
      const [r, c] = FM.parseKey(k);
      const rt = L.cells[FM.cellKey(r, c + 1)];
      const dn = L.cells[FM.cellKey(r + 1, c)];
      if (rt && rt.t === 'b') hz += 1;
      if (dn && dn.t === 'b') vt += 1;
      if (cell.dir === 'u' || cell.dir === 'd') hz += 0.5;
      else if (cell.dir === 'l' || cell.dir === 'r') vt += 0.5;
    }
    return vt > hz ? 'col' : 'row';
  };

  /** 「강원」 「인제군」 → 「강원 인제」 */
  P.region = (f) => `${f.sido || ''} ${String(f.sigungu || '').length > 2 ? String(f.sigungu).replace(/[시군구]$/, '') : f.sigungu || ''}`.trim();

  /**
   * 그림의 칸 배치(순수 계산 — 캔버스 없이 테스트 가능)
   *  - 빈 줄·빈 열은 좁은 통로로 줄여서 그림
   *  - 세로 글씨 배치에서 세로로 늘어선 부스(ㄷ자·ㅁ자의 옆줄)는 넓고 낮은 칸에 가로 글씨로
   *  - 「줄」 = 부스가 늘어선 한 줄(가로줄은 행, 옆줄은 열) → 줄마다 색을 번갈아
   *  - 같은 이름의 시설 칸은 하나의 띠(block)로
   * seats(선택) = { 칸: [{farmId, badge}] } — 없으면 L.assign
   */
  P.model = function (L, farmById, opts, seats) {
    const o = Object.assign({}, P.DEFAULTS, opts || {});
    const card = o.content === 'card';
    const orient = P.orientation(L);
    const text = o.text === 'v' || o.text === 'h' ? o.text : orient === 'row' ? 'v' : 'h';
    const V = text === 'v';
    const colorBy = card ? o.cardColorBy || 'cat' : !o.colorBy || o.colorBy === 'auto' ? 'row' : o.colorBy;
    const sz = card ? [o.ccw, o.cch] : [o.cw, o.ch];
    const cw = sz[0] > 0 ? sz[0] : V ? (card ? 86 : 64) : card ? 200 : 150;
    const ch = sz[1] > 0 ? sz[1] : V ? (card ? 330 : 200) : card ? 150 : 58;
    const sideW = card ? Math.max(cw, Math.round(ch * 0.6)) : Math.max(cw, Math.round(ch * 0.75));
    const sideH = card ? Math.max(110, Math.round(cw * 1.7)) : Math.max(40, Math.round(cw * 0.9));
    const gap = card ? 6 : 3;
    const aisle = Math.max(14, Math.round(Math.min(cw, ch) * (card ? 0.35 : 0.5)));
    const openH = Math.max(30, Math.round(ch * (V ? 0.38 : 0.5))); // 관람객 통로 같은 띠
    const labelH = Math.max(30, Math.round(ch * (V ? 0.28 : 0.5))); // 무대·주차장 같은 띠
    const labelW = V ? cw : Math.max(40, Math.round(cw * 0.8));
    const m = { orient, text, colorBy, content: card ? 'card' : 'name', cw, ch, sideW, sideH, gap, aisle, width: 0, height: 0, items: [], labels: [], rowY: {}, rowH: {}, colX: {}, colW: {}, booths: 0, placed: 0, split: 0, lines: 0 };
    const keys = Object.keys(L.cells);
    if (!keys.length) return m;
    const isB = (r, c) => {
      const x = L.cells[FM.cellKey(r, c)];
      return !!x && x.t === 'b';
    };
    const run = (r, c, dr, dc) => {
      let n = 0;
      for (let i = 1; isB(r + dr * i, c + dc * i); i++) n++;
      return n;
    };
    let minR = Infinity;
    let minC = Infinity;
    let maxR = -1;
    let maxC = -1;
    const rowInfo = {};
    const colInfo = {};
    const vert = {}; // 세로로 늘어선 줄의 부스
    const side = {}; // 세로 글씨 배치에서 넓고 낮은 칸으로 그릴 부스
    for (const k of keys) {
      const cell = L.cells[k];
      const [r, c] = FM.parseKey(k);
      minR = Math.min(minR, r);
      minC = Math.min(minC, c);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
      const ri = rowInfo[r] || (rowInfo[r] = {});
      const ci = colInfo[c] || (colInfo[c] = {});
      if (cell.t === 'b') {
        const hl = 1 + run(r, c, 0, -1) + run(r, c, 0, 1);
        const vl = 1 + run(r, c, -1, 0) + run(r, c, 1, 0);
        if (vl > hl || (vl === hl && (cell.dir === 'l' || cell.dir === 'r'))) vert[k] = true;
        if (V && vert[k]) {
          side[k] = true;
          ri.side = ci.side = true;
        } else ri.main = ci.main = true;
      } else {
        if (FM.isOpenLabel(cell.label)) ri.open = true;
        else ri.label = true;
        ci.label = true;
      }
    }
    // 줄 높이: 세로 글씨 칸이 하나라도 있으면 높게 / 열 너비: 옆줄 칸이 하나라도 있으면 넓게
    let y = 0;
    for (let r = minR; r <= maxR; r++) {
      const ri = rowInfo[r];
      const hh = !ri ? aisle : ri.main ? ch : ri.side ? sideH : Math.max(ri.open ? openH : 0, ri.label ? labelH : 0);
      m.rowY[r] = y;
      m.rowH[r] = hh;
      y += hh + gap;
    }
    let x = 0;
    for (let c = minC; c <= maxC; c++) {
      const ci = colInfo[c];
      const ww = !ci ? aisle : ci.side ? sideW : ci.main ? cw : labelW;
      m.colX[c] = x;
      m.colW[c] = ww;
      x += ww + gap;
    }
    m.width = x - gap;
    m.height = y - gap;

    // 줄 번호: 위에 있는 줄부터 (같은 높이면 왼쪽부터). 가로줄은 행, 세로로 늘어선 줄은 열 단위
    const lineOf = (k, r, c) => (colorBy === 'col' || vert[k] ? 'c' + c : 'r' + r);
    const lineFirst = {};
    for (const k of keys) {
      if (L.cells[k].t !== 'b') continue;
      const [r, c] = FM.parseKey(k);
      const id = lineOf(k, r, c);
      const f = lineFirst[id];
      if (!f || r < f[0] || (r === f[0] && c < f[1])) lineFirst[id] = [r, c];
    }
    const lineRank = {};
    Object.keys(lineFirst)
      .sort((a, b) => (colorBy === 'col' ? lineFirst[a][1] - lineFirst[b][1] : lineFirst[a][0] - lineFirst[b][0] || lineFirst[a][1] - lineFirst[b][1]))
      .forEach((id, i) => (lineRank[id] = i));
    m.lines = Object.keys(lineRank).length;

    const colors = P.colorsOf(o);
    const nums = FM.boothNumbers(L);
    const kwOf = (f) => (FM.Power ? FM.Power.kw(f) : 0);
    const seen = new Set();
    for (const k of keys) {
      const cell = L.cells[k];
      const [r, c] = FM.parseKey(k);
      if (cell.t !== 'b') {
        if (!seen.has(k)) m.labels.push(labelBlock(k));
        continue;
      }
      const it = { key: k, r, c, x: m.colX[c], y: m.rowY[r], w: m.colW[c], h: m.rowH[r] };
      m.booths++;
      const entries = seats ? seats[k] || [] : L.assign && L.assign[k] ? [{ farmId: L.assign[k], badge: '' }] : [];
      it.parts = entries
        .map((e) => {
          const f = farmById[e.farmId];
          return f ? { farmId: f.id, farm: f, name: FM.displayName(f, o.paren), cat: f.category || '', kw: kwOf(f), badge: e.badge || '' } : null;
        })
        .filter(Boolean);
      it.no = nums[k];
      it.kind = it.parts.length ? 'booth' : 'empty';
      it.side = !!side[k];
      it.dir = text === 'h' ? 'h' : it.side ? (it.w >= it.h * 0.9 ? 'h' : 'v') : 'v';
      if (it.parts.length) {
        m.placed++;
        if (it.parts.length > 1) m.split++;
        it.farmId = it.parts[0].farmId;
        it.name = it.parts[0].name;
        it.cat = it.parts[0].cat;
      }
      it.line = lineRank[lineOf(k, r, c)];
      if (colorBy === 'cat') it.fill = it.parts.length ? (card ? FM.catColor(it.cat).hex : FM.catColor(it.cat).bgHex) : '#FFFFFF';
      else if (colorBy === 'one') it.fill = colors[0];
      else it.fill = colors[it.line % colors.length];
      m.items.push(it);
    }
    m.items.sort((a, b) => a.r - b.r || a.c - b.c);
    return m;

    // 같은 이름으로 이어진 시설 칸 묶음 → 하나의 띠
    function labelBlock(k0) {
      const lab = L.cells[k0].label || '';
      const same = (k) => L.cells[k] && L.cells[k].t !== 'b' && (L.cells[k].label || '') === lab;
      const ks = [];
      const stack = [k0];
      seen.add(k0);
      while (stack.length) {
        const q = stack.pop();
        ks.push(q);
        const [r, c] = FM.parseKey(q);
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nk = FM.cellKey(r + dr, c + dc);
          if (same(nk) && !seen.has(nk)) {
            seen.add(nk);
            stack.push(nk);
          }
        }
      }
      const set = new Set(ks);
      let r0 = Infinity;
      let c0 = Infinity;
      let r1 = -1;
      let c1 = -1;
      const rects = ks.map((q) => {
        const [r, c] = FM.parseKey(q);
        r0 = Math.min(r0, r);
        c0 = Math.min(c0, c);
        r1 = Math.max(r1, r);
        c1 = Math.max(c1, c);
        // 이웃 칸과 이어지도록 간격만큼 늘림
        return { x: m.colX[c], y: m.rowY[r], w: m.colW[c] + (set.has(FM.cellKey(r, c + 1)) ? gap : 0), h: m.rowH[r] + (set.has(FM.cellKey(r + 1, c)) ? gap : 0) };
      });
      const bx = m.colX[c0];
      const by = m.rowY[r0];
      const bw = m.colX[c1] + m.colW[c1] - bx;
      const bh = m.rowY[r1] + m.rowH[r1] - by;
      return { kind: 'label', name: lab, keys: ks, r: r0, c: c0, x: bx, y: by, w: bw, h: bh, full: ks.length === (r1 - r0 + 1) * (c1 - c0 + 1), rects, dir: bw >= bh * 0.9 ? 'h' : 'v', open: FM.isOpenLabel(lab) };
    }
  };

  // ------------------------------------------------------------ 세로 글씨 ---
  const vAdv = (g) => (/^\s$/.test(g) ? 0.4 : 1.04); // 글자 하나가 차지하는 높이(글자 크기 배수)
  const vLen = (gs) => gs.reduce((s, g) => s + vAdv(g), 0);
  const trimSp = (gs) => {
    let a = 0;
    let b = gs.length;
    while (a < b && /^\s$/.test(gs[a])) a++;
    while (b > a && /^\s$/.test(gs[b - 1])) b--;
    return gs.slice(a, b);
  };

  /** 세로 두 줄로 나눌 자리: 띄어쓰기가 가운데에 가까우면 거기서, 아니면 반으로 */
  P.splitName = function (name) {
    const gs = trimSp(P.graphemes(name));
    const n = gs.length;
    if (n < 2) return [gs];
    let best = -1;
    let bestScore = Infinity;
    gs.forEach((g, i) => {
      if (!/^\s$/.test(g)) return;
      const score = Math.abs(vLen(gs.slice(0, i)) - vLen(gs.slice(i + 1)));
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    const half = Math.ceil(n / 2);
    if (best >= 0 && bestScore <= Math.max(2, n * 0.34)) return [trimSp(gs.slice(0, best)), trimSp(gs.slice(best + 1))];
    return [gs.slice(0, half), gs.slice(half)];
  };

  /**
   * 세로 글씨 크기 정하기 — 칸 안에 들어가는 가장 큰 크기(전체 기준 크기 이하)
   * 한 줄로 너무 작아지면 두 줄(오른쪽 줄부터 읽음)
   */
  P.fitVertical = function (name, availW, availH, baseFs) {
    const one = trimSp(P.graphemes(name));
    const fs1 = Math.min(baseFs, availW * 0.92, availH / Math.max(1, vLen(one)));
    if (one.length >= 5 && fs1 < baseFs * 0.82) {
      const cols = P.splitName(name);
      if (cols.length === 2 && cols[1].length) {
        const colW = (availW - 4) / 2;
        const fs2 = Math.min(baseFs, colW * 0.95, availH / Math.max(vLen(cols[0]), vLen(cols[1])));
        if (fs2 > fs1 * 1.12) return { cols, fs: fs2 };
      }
    }
    return { cols: [one], fs: fs1 };
  };

  // 세로 글씨에서 눕혀 써야 보기 좋은 문자
  const ROTATE = /^[()[\]{}<>\-–—~_=|/·:]$/;
  function drawVChars(g, gs, cx, top, fs) {
    let y = top;
    for (const ch of gs) {
      const adv = vAdv(ch) * fs;
      if (!/^\s$/.test(ch)) {
        if (ROTATE.test(ch)) {
          g.save();
          g.translate(cx, y + adv / 2);
          g.rotate(Math.PI / 2);
          g.fillText(ch, 0, 0);
          g.restore();
        } else g.fillText(ch, cx, y + adv / 2);
      }
      y += adv;
    }
  }

  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function pct(arr, p) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
  }
  /** 칸을 긴 쪽으로 n등분 (한 자리에 날짜마다 다른 농가) */
  function splitRect(R, n, alongY) {
    if (n <= 1) return [R];
    const gp = 6;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (alongY) {
        const hh = (R.h - gp * (n - 1)) / n;
        out.push({ x: R.x, y: R.y + i * (hh + gp), w: R.w, h: hh });
      } else {
        const ww = (R.w - gp * (n - 1)) / n;
        out.push({ x: R.x + i * (ww + gp), y: R.y, w: ww, h: R.h });
      }
    }
    return out;
  }

  /**
   * 그림 그리기 → canvas
   * p = { ev, day, venue, opts?, title?, sub? }
   */
  P.render = function (p) {
    const { ev, day, venue } = p;
    const o = Object.assign(P.options(venue), p.opts || {});
    const plan = P.plan(ev, day, o.scope);
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const m = P.model(plan.layout, farmById, o, plan.seats);
    m.plan = plan;
    const title = p.title != null ? p.title : P.titleOf(o, plan, venue, ev);
    const sub = p.sub != null ? p.sub : plan.holder.posterSub || '';
    const V = m.text === 'v';
    const card = m.content === 'card';
    const cw = m.cw;
    const ch = m.ch;
    const NB = o.noStyle;

    // 방향 표시 띠
    const bands = {};
    for (const s of ['l', 'r', 't', 'b']) if (String(o.bands[s] || '').trim()) bands[s] = String(o.bands[s]).trim();
    const bandSide = Math.max(40, Math.round((V ? Math.min(cw, 90) : Math.min(cw, ch)) * 0.9));
    const bandTop = Math.max(34, Math.round(bandSide * 0.78));
    const BG = 10;

    // 범례: 품목군 색 · 「토」 표시 · 전력 숫자
    const legend = [];
    if (m.colorBy === 'cat') {
      const cnt = {};
      for (const it of m.items) for (const pt of it.parts) cnt[pt.cat || '(미분류)'] = (cnt[pt.cat || '(미분류)'] || 0) + 1;
      for (const [cat, n] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) legend.push({ kind: 'cat', cat, label: `${cat} ${n}` });
    }
    const dayBadges = new Set();
    let anyKw = false;
    for (const it of m.items)
      for (const pt of it.parts) {
        if (pt.badge) dayBadges.add(pt.badge);
        if (o.showPower && pt.kw > 0) anyKw = true;
      }
    for (const b of dayBadges) legend.push({ kind: 'badge', text: b, fill: P.DAY_BADGE, label: b.split('·').map((w) => w + '요일').join('·') + '만 참여' });
    if (anyKw) legend.push({ kind: 'badge', text: 'kW', fill: P.POWER_BADGE, label: '빨간 숫자 = 전력 사용량(kW)' });

    const PAD = 36;
    const gridW = Math.max(m.width, 1);
    const gridH = Math.max(m.height, 1);
    const leftW = bands.l ? bandSide + BG : 0;
    const rightW = bands.r ? bandSide + BG : 0;
    const topH = bands.t ? bandTop + BG : 0;
    const botH = bands.b ? bandTop + BG : 0;
    const contentW = leftW + gridW + rightW;
    const W = Math.round(Math.max(contentW + PAD * 2, 720));

    const cv = root.document.createElement('canvas');
    let g = cv.getContext('2d');
    const measure = (txt, w) => {
      g.font = font(w, 100);
      return g.measureText(txt).width / 100; // 글자 크기 1 기준 너비
    };
    // 제목
    const bar = o.titleStyle === 'bar' && !!title;
    const icon = bar || title ? String(o.titleIcon || '').trim() : '';
    let titleFs = Math.max(26, Math.min(52, Math.round(W / 22)));
    if (title) {
      const tw = measure(title, 800) + (icon ? measure(icon, 800) + 0.6 : 0);
      titleFs = Math.max(18, Math.min(titleFs, (W - PAD * 2) / Math.max(tw, 0.01)));
    }
    const subFs = Math.max(15, Math.round(titleFs * 0.45));
    const barH = Math.round(titleFs * 2);
    const headH = bar ? barH + (sub ? subFs * 1.7 : 0) + 24 : PAD + (title ? titleFs * 1.25 : 0) + (sub ? subFs * 1.5 : 0) + (title || sub ? 22 : 0);
    // 범례 줄 수
    const LG = 14;
    let legendRows = 0;
    if (legend.length) {
      let lx = 0;
      legendRows = 1;
      for (const it of legend) {
        it.w = (it.kind === 'cat' ? 22 : 30) + measure(it.label, 600) * LG + 22;
        if (lx + it.w > W - PAD * 2 && lx > 0) {
          legendRows++;
          lx = 0;
        }
        lx += it.w;
      }
    }
    const legendH = legendRows * 28;
    const noteFs = 14;
    const noteH = o.note ? noteFs * 1.6 + 6 : 0;
    const H = Math.round(headH + topH + gridH + botH + (legendH || noteH ? 18 : 0) + legendH + noteH + PAD);

    let scale = 2;
    if (W * H * scale * scale > 60e6) scale = Math.max(1, Math.sqrt(60e6 / (W * H)));
    cv.width = Math.round(W * scale);
    cv.height = Math.round(H * scale);
    g = cv.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // 제목
    let y = 0;
    const drawTitle = (cy, color) => {
      g.font = font(800, titleFs);
      const tw = g.measureText(title).width;
      const iw = icon ? g.measureText(icon).width + titleFs * 0.6 : 0;
      const x0 = W / 2 - (tw + iw) / 2;
      g.textAlign = 'left';
      if (icon) g.fillText(icon, x0, cy);
      g.fillStyle = color;
      g.fillText(title, x0 + iw, cy);
      g.textAlign = 'center';
    };
    if (bar) {
      g.fillStyle = o.titleBar || P.DEFAULTS.titleBar;
      g.fillRect(0, 0, W, barH);
      g.fillStyle = P.inkOn(o.titleBar || P.DEFAULTS.titleBar);
      drawTitle(barH / 2 + 1, P.inkOn(o.titleBar || P.DEFAULTS.titleBar));
      y = barH;
      if (sub) {
        g.fillStyle = '#4B5563';
        g.font = font(600, subFs);
        g.fillText(sub, W / 2, y + subFs * 0.95);
        y += subFs * 1.7;
      }
      y += 24;
    } else {
      y = PAD;
      if (title) {
        g.fillStyle = P.TEXT_COLOR;
        drawTitle(y + titleFs * 0.6, P.TEXT_COLOR);
        y += titleFs * 1.25;
      }
      if (sub) {
        g.fillStyle = '#4B5563';
        g.font = font(500, subFs);
        g.fillText(sub, W / 2, y + subFs * 0.7);
        y += subFs * 1.5;
      }
      if (title || sub) y += 22;
    }

    const gx = Math.round((W - contentW) / 2 + leftW);
    const gy = Math.round(y + topH);

    // 방향 표시 띠
    const drawBand = (s, x, yy, w, h) => {
      const fill = o.bandColor || P.DEFAULTS.bandColor;
      g.fillStyle = fill;
      rrect(g, x, yy, w, h, 6);
      g.fill();
      g.fillStyle = P.inkOn(fill);
      const txt = bands[s];
      if (s === 'l' || s === 'r') {
        const gs = P.graphemes(txt);
        const fs = Math.min(w * 0.52, (h - 24) / Math.max(1, vLen(gs)), 40);
        g.font = font(800, fs);
        drawVChars(g, gs, x + w / 2, yy + (h - vLen(gs) * fs) / 2, fs);
      } else {
        const fs = Math.min(h * 0.5, (w - 24) / Math.max(measure(txt, 800), 0.01), 34);
        g.font = font(800, fs);
        g.fillText(txt, x + w / 2, yy + h / 2 + 1);
      }
    };
    if (bands.l) drawBand('l', gx - BG - bandSide, gy, bandSide, gridH);
    if (bands.r) drawBand('r', gx + gridW + BG, gy, bandSide, gridH);
    if (bands.t) drawBand('t', gx, gy - BG - bandTop, gridW, bandTop);
    if (bands.b) drawBand('b', gx, gy + gridH + BG, gridW, bandTop);

    // ---------------------------------------------------- 시설 띠 (아래에 먼저)
    for (const b of m.labels) {
      const st = P.labelStyle(b.name, o);
      g.fillStyle = st.fill;
      if (b.full) {
        rrect(g, gx + b.x, gy + b.y, b.w, b.h, 6);
        g.fill();
        if (!st.open) {
          g.strokeStyle = mix(st.fill, 0.3, 'black');
          g.lineWidth = 1.5;
          g.stroke();
        }
      } else
        for (const R of b.rects) {
          g.fillRect(gx + R.x, gy + R.y, R.w, R.h);
        }
      if (!b.name) continue;
      g.fillStyle = st.ink;
      const wt = st.open ? 600 : 800;
      if (b.dir === 'h') {
        const fs = Math.min(b.h * 0.48, 46, (b.w - 16) / Math.max(measure(b.name, wt), 0.01));
        g.font = font(wt, fs);
        g.fillText(b.name, gx + b.x + b.w / 2, gy + b.y + b.h / 2 + 1);
      } else {
        const gs = trimSp(P.graphemes(b.name));
        const fs = Math.min(b.w * 0.6, (b.h - 12) / Math.max(1, vLen(gs)), 46);
        g.font = font(wt, fs);
        drawVChars(g, gs, gx + b.x + b.w / 2, gy + b.y + (b.h - vLen(gs) * fs) / 2, fs);
      }
    }

    // ---------------------------------------------------- 글씨 크기 기준
    // 이름 길이 75% 지점에 맞춰 모두 같은 크기로 (세로 글씨 칸 / 가로 글씨 칸 따로)
    const booths = m.items.filter((it) => it.kind === 'booth');
    const allParts = booths.reduce((a, it) => a.concat(it.parts), []);
    const hw = V ? m.sideW : cw; // 가로 글씨 칸
    const hh = V ? m.sideH : ch;
    const PV = { padX: Math.max(4, Math.round(cw * 0.08)), padY: Math.max(6, Math.round(cw * 0.12)), noFs: clamp(Math.round(cw * 0.3), 11, 22), boxH: clamp(Math.round(cw * 0.36), 18, 30) };
    const PH = { padX: Math.max(4, Math.round(hh * 0.12)), padY: Math.max(5, Math.round(hh * 0.12)), noFs: clamp(Math.round(hh * 0.34), 11, 20), boxW: clamp(Math.round(hh * 0.6), 24, 44) };
    PV.noH = NB === 'attach' ? PV.noFs + 6 : NB === 'box' ? PV.boxH + 6 : 0;
    const vNames = booths.filter((it) => it.dir === 'v').reduce((a, it) => a.concat(it.parts.map((pt) => vLen(trimSp(P.graphemes(pt.name))))), []);
    PV.base = Math.max(9, Math.min((cw - PV.padX * 2) * 0.7, (ch - PV.padY * 2 - PV.noH) / Math.max(4, pct(vNames, 0.75)), 40));
    const noW1 = NB === 'attach' ? measure('00', 800) + 0.3 : 0;
    const hNames = booths.filter((it) => it.dir === 'h').reduce((a, it) => a.concat(it.parts.map((pt) => noW1 + measure(pt.name, 800))), []);
    const hAvailW = hw - PH.padX * 2 - (NB === 'box' ? PH.boxW + 4 : 0);
    PH.base = Math.max(9, Math.min((hh - PH.padY * 2) * 0.62, 30, hAvailW / Math.max(pct(hNames, 0.75), 2.5)));
    const badgeFs = card ? clamp(Math.round(Math.min(cw, ch) * 0.18), 12, 20) : V ? clamp(Math.round(cw * 0.24), 11, 18) : clamp(Math.round(hh * 0.3), 11, 16);
    const badgeH = Math.round(badgeFs * 1.45);

    // ---------------------------------------------------- 그리기 도우미
    const badgesOf = (pt) => {
      const out = [];
      if (pt.badge) out.push([pt.badge, P.DAY_BADGE]);
      if (o.showPower && pt.kw > 0) out.push([String(Math.round(pt.kw * 10) / 10), P.POWER_BADGE]);
      return out;
    };
    const badgeW = (txt) => {
      g.font = font(800, badgeFs);
      return Math.max(badgeH, Math.round(g.measureText(txt).width + badgeFs * 0.7));
    };
    const drawBadge = (x, yy, txt, fill) => {
      const bw = badgeW(txt);
      g.fillStyle = fill;
      rrect(g, x, yy, bw, badgeH, 3);
      g.fill();
      g.fillStyle = '#FFFFFF';
      g.font = font(800, badgeFs);
      g.textAlign = 'center';
      g.fillText(txt, x + bw / 2, yy + badgeH / 2 + 0.5);
      return bw;
    };
    /** 표시들을 아래 왼쪽부터 한 줄로(넘치면 위로 쌓기) */
    const drawBadgesBL = (R, list) => {
      let bx = R.x;
      let by = R.y + R.h - badgeH;
      for (const [t, f] of list) {
        const bw = badgeW(t);
        if (bx > R.x && bx + bw > R.x + R.w) {
          bx = R.x;
          by -= badgeH + 2;
        }
        drawBadge(bx, by, t, f);
        bx += bw + 3;
      }
    };
    const numberBox = (x, yy, w, h, no) => {
      g.fillStyle = o.noColor || P.DEFAULTS.noColor;
      rrect(g, x, yy, w, h, 3);
      g.fill();
      g.fillStyle = P.inkOn(o.noColor || P.DEFAULTS.noColor);
      g.font = font(800, Math.min(h * 0.62, w * 0.5));
      g.textAlign = 'center';
      g.fillText(String(no), x + w / 2, yy + h / 2 + 0.5);
    };
    const drawNameV = (R, name, fs0, color, wt) => {
      const fit = P.fitVertical(name, R.w, R.h, fs0);
      g.fillStyle = color;
      g.font = font(wt, fit.fs);
      g.textAlign = 'center';
      if (fit.cols.length === 1) drawVChars(g, fit.cols[0], R.x + R.w / 2, R.y, fit.fs);
      else {
        const colW = (R.w - 4) / 2;
        // 오른쪽 줄부터 읽어요
        drawVChars(g, fit.cols[0], R.x + colW + 4 + colW / 2, R.y, fit.fs);
        drawVChars(g, fit.cols[1], R.x + colW / 2, R.y, fit.fs);
      }
    };
    // 가로 글씨: 「12 상호명」 한 줄, 길면 두 줄
    const drawNameH = (R, name, fs0, color, wt, prefix) => {
      const noW = prefix ? measure(prefix, 800) + 0.3 : 0;
      const nameW = measure(name, wt);
      let fs = Math.min(fs0, R.w / Math.max(noW + nameW, 0.01), R.h * 0.8);
      let lines = [name];
      // 두 줄: 띄어쓰기가 있거나 8글자 이상일 때만 (짧은 이름을 중간에서 자르지 않게)
      const nG = P.graphemes(name).length;
      if ((/\s/.test(name.trim()) && fs < fs0 * 0.9) || (nG >= 8 && fs < fs0 * 0.8)) {
        const parts = P.splitName(name).map((gs) => gs.join(''));
        if (parts.length === 2 && parts[1]) {
          const w2 = Math.max(noW + measure(parts[0], wt), measure(parts[1], wt));
          const fs2 = Math.min(fs0, R.w / Math.max(w2, 0.01), R.h / 2.3);
          if (fs2 > fs * 1.1) {
            fs = fs2;
            lines = parts;
          }
        }
      }
      const lh = fs * 1.18;
      const cy = R.y + R.h / 2;
      lines.forEach((ln, i) => {
        const ly = cy + (i - (lines.length - 1) / 2) * lh;
        const pre = i === 0 ? prefix : '';
        g.font = font(800, fs);
        const pw = pre ? g.measureText(pre).width + fs * 0.3 : 0;
        g.font = font(wt, fs);
        const lw = g.measureText(ln).width;
        let lx = R.x + R.w / 2 - (lw + pw) / 2;
        g.textAlign = 'left';
        if (pre) {
          g.fillStyle = P.NO_COLOR;
          g.font = font(800, fs);
          g.fillText(pre, lx, ly);
          lx += pw;
        }
        g.fillStyle = color;
        g.font = font(wt, fs);
        g.fillText(ln, lx, ly);
        g.textAlign = 'center';
      });
    };
    // 여러 줄 글씨(자세히): 구분자 뒤에서, 안 되면 글자 단위로 줄바꿈
    const wrapLines = (txt, maxW, fs, wt) => {
      g.font = font(wt, fs);
      const tokens = String(txt).split(/(?<=[\s,·/])/);
      const lines = [];
      let cur = '';
      const push = () => {
        if (cur.trim()) lines.push(cur.trim());
        cur = '';
      };
      for (const tk of tokens) {
        if (g.measureText(cur + tk).width <= maxW) {
          cur += tk;
          continue;
        }
        if (cur.trim()) push();
        if (g.measureText(tk).width <= maxW) {
          cur = tk;
          continue;
        }
        // 긴 낱말은 글자 단위로, 줄 길이를 고르게 (「흥많은농/부」 대신 「흥많은/농부」)
        const gs = P.graphemes(tk);
        let k = Math.ceil(g.measureText(tk).width / maxW);
        let chunks;
        for (; k <= gs.length; k++) {
          const size = Math.ceil(gs.length / k);
          chunks = [];
          for (let i = 0; i < gs.length; i += size) chunks.push(gs.slice(i, i + size).join(''));
          if (chunks.every((c2) => g.measureText(c2).width <= maxW)) break;
        }
        chunks.slice(0, -1).forEach((c2) => lines.push(c2.trim()));
        cur = chunks[chunks.length - 1];
      }
      push();
      return lines;
    };
    const fitWrap = (txt, maxW, maxH, fsMax, fsMin, wt, etc) => {
      for (let fs = fsMax; fs >= fsMin; fs -= 0.5) {
        const lines = wrapLines(txt, maxW, fs, wt);
        if (lines.length * fs * 1.2 <= maxH) return { lines, fs };
      }
      const fs = fsMin;
      const maxLines = Math.max(1, Math.floor(maxH / (fs * 1.2)));
      if (etc) {
        // 품목이 너무 많으면 뒤를 줄여 「등」
        const items = String(txt).split(/\s*,\s*/);
        while (items.length > 1) {
          items.pop();
          const lines = wrapLines(items.join(', ') + ' 등', maxW, fs, wt);
          if (lines.length <= maxLines) return { lines, fs };
        }
      }
      return { lines: wrapLines(txt, maxW, fs, wt).slice(0, maxLines), fs };
    };
    const drawLines = (fit, cx, cy, color, wt) => {
      g.fillStyle = color;
      g.font = font(wt, fit.fs);
      g.textAlign = 'center';
      const lh = fit.fs * 1.2;
      fit.lines.forEach((ln, i) => g.fillText(ln, cx, cy + (i - (fit.lines.length - 1) / 2) * lh));
    };
    // 자세히: 머리(상호명) · 몸(품목) · 발(지역) 카드
    const drawCard = (R, pt, headFill, prefix) => {
      const tall = R.h > R.w * 1.3;
      const headH = tall ? Math.round(R.h * 0.36) : Math.max(26, Math.round(R.h * 0.25));
      const footH = tall ? Math.round(R.h * 0.16) : Math.max(22, Math.round(R.h * 0.2));
      const bodyH = R.h - headH - footH;
      const line = luminance(headFill) > 0.55 ? mix(headFill, 0.25, 'black') : headFill;
      g.fillStyle = '#FFFFFF';
      rrect(g, R.x, R.y, R.w, R.h, 3);
      g.fill();
      g.fillStyle = headFill;
      g.fillRect(R.x, R.y, R.w, headH);
      g.strokeStyle = line;
      g.lineWidth = 2;
      rrect(g, R.x, R.y, R.w, R.h, 3);
      g.stroke();
      g.beginPath();
      g.moveTo(R.x, R.y + headH);
      g.lineTo(R.x + R.w, R.y + headH);
      g.moveTo(R.x, R.y + headH + bodyH);
      g.lineTo(R.x + R.w, R.y + headH + bodyH);
      g.stroke();
      const ink = P.inkOn(headFill);
      const inW = R.w - 8;
      let hy = R.y;
      let hAvail = headH - 6;
      if (prefix && tall) {
        // 세로로 긴 카드: 번호를 머리 맨 위 한 줄에
        const nfs = clamp(Math.round(R.w * 0.2), 11, 18);
        g.fillStyle = ink;
        g.font = font(800, nfs);
        g.fillText(prefix, R.x + R.w / 2, R.y + 4 + nfs / 2);
        hy += nfs + 4;
        hAvail -= nfs + 4;
      }
      const head = fitWrap(prefix && !tall ? `${prefix} ${pt.name}` : pt.name, inW, hAvail, tall ? clamp(R.w * 0.22, 11, 20) : clamp(headH * 0.55, 12, 20), 8, 800);
      drawLines(head, R.x + R.w / 2, hy + (R.y + headH - hy) / 2, ink, 800);
      const items = fitWrap(pt.farm.items || '', inW, bodyH - 8, tall ? clamp(R.w * 0.17, 9.5, 15) : 15, 9, 500, true);
      drawLines(items, R.x + R.w / 2, R.y + headH + bodyH / 2, '#333333', 500);
      const reg = fitWrap(P.region(pt.farm), inW, footH - 4, tall ? clamp(R.w * 0.17, 9, 14) : 14, 7.5, 500);
      drawLines(reg, R.x + R.w / 2, R.y + headH + bodyH + footH / 2, '#333333', 500);
      const bl = badgesOf(pt);
      if (bl.length) drawBadgesBL({ x: R.x + 3, y: R.y + headH, w: R.w - 6, h: bodyH - 3 }, bl);
    };

    // ---------------------------------------------------- 부스 칸
    for (const it of m.items) {
      if (it.kind === 'empty' && !o.showEmpty) continue;
      const x = gx + it.x;
      const yy = gy + it.y;
      const empty = it.kind === 'empty';
      const showNo = NB !== 'none' && it.no != null;
      if (card) {
        let R = { x, y: yy, w: it.w, h: it.h };
        let prefix = '';
        if (showNo && NB === 'box') {
          const bh2 = clamp(Math.round(Math.min(it.w, it.h) * 0.3), 18, 30);
          numberBox(x, yy, it.w, bh2, it.no);
          R = { x, y: yy + bh2 + 3, w: it.w, h: it.h - bh2 - 3 };
        } else if (showNo) prefix = String(it.no);
        if (empty) {
          g.fillStyle = '#F7F7F7';
          rrect(g, R.x, R.y, R.w, R.h, 3);
          g.fill();
          g.setLineDash([4, 3]);
          g.strokeStyle = 'rgba(0,0,0,.3)';
          g.lineWidth = 1;
          g.stroke();
          g.setLineDash([]);
          if (prefix) {
            g.fillStyle = '#6B7280';
            g.font = font(800, 14);
            g.fillText(prefix, R.x + R.w / 2, R.y + 14);
          }
          continue;
        }
        const tallCell = R.h > R.w * 1.3;
        splitRect(R, it.parts.length, tallCell).forEach((S, i) => {
          const pt = it.parts[i];
          const head = m.colorBy === 'cat' ? FM.catColor(pt.cat).hex : it.fill;
          drawCard(S, pt, head, i === 0 ? prefix : '');
        });
        continue;
      }

      // 간단히: 칸 바탕
      if (empty) {
        g.fillStyle = mix(it.fill, 0.55);
        rrect(g, x, yy, it.w, it.h, 4);
        g.fill();
        g.setLineDash([4, 3]);
        g.strokeStyle = 'rgba(0,0,0,.28)';
        g.lineWidth = 1;
        g.stroke();
        g.setLineDash([]);
      } else {
        g.fillStyle = m.colorBy === 'cat' && it.parts.length ? FM.catColor(it.cat).bgHex : it.fill;
        rrect(g, x, yy, it.w, it.h, 4);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,.22)';
        g.lineWidth = 1;
        g.stroke();
      }
      if (it.dir === 'v') {
        const { padX, padY, noFs, boxH } = PV;
        let top = yy + padY;
        if (showNo && NB === 'attach') {
          g.fillStyle = P.NO_COLOR;
          g.font = font(800, noFs);
          g.textAlign = 'center';
          g.fillText(String(it.no), x + it.w / 2, top + noFs / 2);
          top += noFs + 6;
        } else if (showNo && NB === 'box') {
          numberBox(x + 3, yy + 3, it.w - 6, boxH, it.no);
          top = yy + 3 + boxH + 6;
        }
        const A = { x: x + padX, y: top, w: it.w - padX * 2, h: yy + it.h - padY - top };
        // 날짜마다 다른 농가: 세로 글씨는 나란히
        const n = it.parts.length;
        if (!empty)
          splitRect(A, n, false).forEach((S, i) => {
            const pt = it.parts[i];
            const bl = badgesOf(pt);
            drawNameV({ x: S.x, y: S.y, w: S.w, h: S.h - (bl.length ? badgeH + 3 : 0) }, pt.name, PV.base, P.TEXT_COLOR, 800);
            if (bl.length) drawBadgesBL(n > 1 ? S : { x: S.x - padX + 3, y: S.y, w: S.w + padX * 2 - 6, h: S.h + padY - 3 }, bl);
            if (i > 0) dashLine(S.x - 3, S.y, S.x - 3, S.y + S.h);
          });
      } else {
        const { padX, padY, boxW } = PH;
        let left = x + padX;
        if (showNo && NB === 'box') {
          numberBox(x + 3, yy + 3, boxW, it.h - 6, it.no);
          left = x + 3 + boxW + 4;
        }
        const prefix = showNo && NB === 'attach' ? String(it.no) : '';
        const A = { x: left, y: yy + padY, w: x + it.w - padX - left, h: it.h - padY * 2 };
        // 날짜마다 다른 농가: 가로 글씨는 위아래로
        if (!empty)
          splitRect(A, it.parts.length, true).forEach((S, i) => {
            const pt = it.parts[i];
            const bl = badgesOf(pt);
            const bw = bl.reduce((s2, [t]) => s2 + badgeW(t) + 3, 0);
            drawNameH({ x: S.x, y: S.y, w: S.w - bw, h: S.h }, pt.name, PH.base, P.TEXT_COLOR, 800, i === 0 ? prefix : '');
            let bx = S.x + S.w - bw + 3;
            for (const [t, f] of bl) bx += drawBadge(bx, S.y + S.h / 2 - badgeH / 2, t, f) + 3;
            if (i > 0) dashLine(S.x, S.y - 3, S.x + S.w, S.y - 3);
          });
      }
    }
    function dashLine(x1, y1, x2, y2) {
      g.setLineDash([3, 3]);
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.setLineDash([]);
    }

    // ---------------------------------------------------- 아래: 범례 · 문구
    let by = gy + gridH + botH + 18;
    if (legend.length) {
      let lx = PAD;
      let ly = by + 12;
      g.textAlign = 'left';
      for (const it of legend) {
        if (lx + it.w > W - PAD && lx > PAD) {
          lx = PAD;
          ly += 28;
        }
        let tx = lx;
        if (it.kind === 'cat') {
          const c = FM.catColor(it.cat);
          g.fillStyle = card ? c.hex : c.bgHex;
          rrect(g, lx, ly - 8, 16, 16, 3);
          g.fill();
          g.strokeStyle = c.hex;
          g.lineWidth = 1;
          g.stroke();
          tx += 22;
        } else {
          g.fillStyle = it.fill;
          rrect(g, lx, ly - 10, 24, 20, 3);
          g.fill();
          g.fillStyle = '#FFFFFF';
          g.font = font(800, 11);
          g.textAlign = 'center';
          g.fillText(it.text, lx + 12, ly + 0.5);
          g.textAlign = 'left';
          tx += 30;
        }
        g.fillStyle = '#374151';
        g.font = font(600, LG);
        g.fillText(it.label, tx, ly);
        lx += it.w;
      }
      by += legendH;
    }
    if (o.note) {
      g.fillStyle = '#4B5563';
      g.font = font(500, noteFs);
      g.textAlign = 'center';
      g.fillText(o.note, W / 2, by + noteFs * 0.8);
    }
    g.textAlign = 'left';
    cv.model = m;
    return cv;
  };

  P.fileName = function (ev, venue, plan, o) {
    const ds = plan.titleDays.map((d) => FM.fmtDay(d.date).replace(/[().]/g, ''));
    const d = ds.length > 1 ? ds[0] + '~' + ds[ds.length - 1] : ds[0];
    return FM.UI.safeFileName(`농부의시장_${venue.short}_${ev.title}_${d}_배치도${o.content === 'card' ? '_자세히' : ''}`) + '.png';
  };

  P.print = function (cv) {
    const UI = FM.UI;
    const pr = UI.clear(root.document.getElementById('printRoot'));
    const img = UI.h('img', { class: 'print-img poster', alt: '배치도' });
    pr.appendChild(UI.h('div', { class: 'print-page' }, img));
    img.onload = () => {
      root.document.body.classList.add('printing');
      setTimeout(() => {
        root.print();
        setTimeout(() => root.document.body.classList.remove('printing'), 500);
      }, 100);
    };
    img.src = cv.toDataURL('image/png');
  };

  // ============================================================ 만들기 창 ===
  P.open = function (ev, day) {
    const UI = FM.UI;
    const h = UI.h;
    const App = FM.App;
    const venue = App.venue(ev.venueId);
    if (!ev.days.some((d) => Object.keys(d.layout.cells).some((k) => d.layout.cells[k].t === 'b'))) {
      UI.toast('먼저 ② 칸 만들기에서 부스 칸을 만들어 주세요.', 'warn');
      return;
    }
    if (!Object.keys(day.layout.cells).some((k) => day.layout.cells[k].t === 'b')) {
      const other = ev.days.find((d) => Object.keys(d.layout.assign).length) || ev.days.find((d) => Object.keys(d.layout.cells).length);
      if (other) day = other;
    }
    const o = P.options(venue);
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const numbering0 = ev.days.map((d) => d.layout.numbering || 'row').join();
    const store = () => {
      venue.posterOpts = FM.clone(o);
      App.changed();
    };
    let cv = null;
    let plan = P.plan(ev, day, o.scope);
    const preview = h('div', { class: 'poster-preview' });
    const info = h('div', { class: 'poster-info' });
    const warn = h('div', { class: 'poster-warn' });
    const draw = () => {
      plan = P.plan(ev, day, o.scope);
      cv = P.render({ ev, day, venue, opts: o });
      UI.clear(preview).appendChild(cv);
      const mm = cv.model;
      info.textContent =
        (plan.days.length > 1 ? `${plan.days.map((d) => FM.weekday(d.date)).join('·')} 합침 · ` : `${FM.weekday(plan.base.date)} ${FM.fmtDay(plan.base.date)} · `) +
        `부스 ${mm.booths}칸 · 농가 ${mm.placed}곳` +
        (mm.booths > mm.placed ? ` · 빈 자리 ${mm.booths - mm.placed}칸` : '') +
        ` · 그림 크기 ${cv.width}×${cv.height}`;
      const msgs = [];
      if (plan.missing.length) msgs.push(`${plan.missing.map((d) => FM.weekday(d.date) + '요일').join('·')}은 아직 배치 전이라 그림에 빠졌어요.`);
      if (mm.split) msgs.push(`토·일에 서로 다른 농가가 쓰는 자리 ${mm.split}칸은 칸을 나눠 두 농가를 함께 그렸어요.`);
      warn.textContent = msgs.join(' ');
      warn.style.display = msgs.length ? '' : 'none';
    };
    const redraw = UI.debounce(draw, 120);
    const changed = () => {
      store();
      redraw();
    };

    const sec = (title, ...kids) => h('div', { class: 'pc-sec' }, title ? h('h4', null, title) : null, ...kids);
    const segs = (list, get, set) => {
      const el = h('div', { class: 'segs wrap' });
      el.paint = () => {
        UI.clear(el);
        for (const [v, t, tip] of list)
          el.appendChild(
            h(
              'button',
              {
                class: 'seg' + (get() === v ? ' on' : ''),
                title: tip || null,
                onclick: () => {
                  set(v);
                  el.paint();
                },
              },
              t
            )
          );
      };
      el.paint();
      return el;
    };
    const check = (label, key, tip) =>
      h(
        'label',
        { class: 'check', title: tip || null },
        h('input', {
          type: 'checkbox',
          checked: !!o[key],
          onchange: (e) => {
            o[key] = e.target.checked;
            if (key === 'paren') paintAliases();
            changed();
          },
        }),
        label
      );
    const colorInput = (value, title, onInput) => h('input', { type: 'color', class: 'pc-color', value, title, oninput: (e) => onInput(e.target.value) });

    // 형식
    const card = () => o.content === 'card';
    const contentSeg = segs(
      [
        ['name', '간단히 · 상호명', '배치 모양대로 상호명만 크게 (게시용)'],
        ['card', '자세히 · 품목·지역', '상호명 + 신청품목 + 지역을 카드처럼 (안내·확인용)'],
      ],
      () => o.content,
      (v) => {
        o.content = v;
        colorBySeg.paint();
        syncSize();
        changed();
      }
    );
    const scopeSeg =
      ev.days.length > 1
        ? segs(
            [
              ['day', `이 날짜만 (${FM.weekday(day.date)})`],
              ['weekend', `주말 합쳐서 (${ev.days.map((d) => FM.weekday(d.date)).join('·')})`, '한 장에 그리고, 한쪽 날만 오는 농가에 「토」「일」 표시'],
            ],
            () => o.scope,
            (v) => {
              o.scope = v;
              store();
              draw();
              titleInput.value = P.titleOf(o, plan, venue, ev);
              subInput.value = plan.holder.posterSub || '';
              paintAliases();
            }
          )
        : null;

    // 제목
    const titleInput = h('input', {
      class: 'input poster-title-input',
      value: P.titleOf(o, plan, venue, ev),
      placeholder: '맨 위 제목',
      oninput: (e) => {
        plan.holder.posterTitle = e.target.value;
        App.changed();
        redraw();
      },
    });
    const subInput = h('input', {
      class: 'input',
      value: plan.holder.posterSub || '',
      placeholder: '작은 제목 (예: 10:00~16:00) — 비워도 돼요',
      oninput: (e) => {
        plan.holder.posterSub = e.target.value;
        App.changed();
        redraw();
      },
    });
    const titleBtns = h(
      'div',
      { class: 'row gap wrap' },
      h(
        'button',
        {
          class: 'btn small ghost',
          title: '장소 기본 제목으로 되돌려요',
          onclick: () => {
            delete plan.holder.posterTitle;
            titleInput.value = P.titleOf(o, plan, venue, ev);
            App.changed();
            redraw();
          },
        },
        '↺ 기본 제목'
      ),
      h(
        'button',
        {
          class: 'btn small ghost',
          title: '지금 제목을 이 장소의 기본 제목으로 — 다른 주에는 날짜만 바뀌어요',
          onclick: () => {
            const dt = P.dateText(plan.titleDays);
            o.titleTpl = titleInput.value.split(dt.full).join('{날짜}').split(dt.short).join('{월일}');
            delete plan.holder.posterTitle;
            store();
            UI.toast('이 장소의 기본 제목으로 정했어요. 다른 주에는 날짜만 바뀌어요.', 'ok');
          },
        },
        '📌 장소 기본 제목으로'
      )
    );
    const titleStyleSeg = segs(
      [
        ['plain', '글자만'],
        ['bar', '색 띠', '맨 위를 색 띠로 채우고 흰 글씨 (양천 형식)'],
      ],
      () => o.titleStyle,
      (v) => {
        o.titleStyle = v;
        changed();
      }
    );
    const titleBarRow = h(
      'div',
      { class: 'row gap' },
      h('small', { class: 'muted' }, '띠 색'),
      colorInput(o.titleBar, '제목 띠 색', (v) => {
        o.titleBar = v;
        changed();
      }),
      h('small', { class: 'muted' }, '앞 그림'),
      h('input', {
        class: 'input pc-icon',
        value: o.titleIcon || '',
        placeholder: '예: 🍂',
        oninput: (e) => {
          o.titleIcon = e.target.value;
          changed();
        },
      })
    );

    // 색
    const swatchWrap = h('div', { class: 'pc-swatches' });
    const paintSwatches = () => {
      UI.clear(swatchWrap);
      const cols = P.colorsOf(o).slice();
      cols.forEach((c, i) =>
        swatchWrap.appendChild(
          colorInput(c, `${i + 1}번째 줄 색 — 눌러서 바꾸기`, (v) => {
            const arr = P.colorsOf(o).slice();
            arr[i] = v;
            o.colors = arr;
            changed();
          })
        )
      );
      swatchWrap.append(
        h(
          'button',
          {
            class: 'icon-btn small',
            title: '색 하나 더',
            disabled: cols.length >= 8,
            onclick: () => {
              const arr = P.colorsOf(o).slice();
              const many = P.PALETTES.find((x) => x.id === 'many').colors;
              arr.push(many[arr.length % many.length]);
              o.colors = arr;
              paintSwatches();
              changed();
            },
          },
          '＋'
        ),
        h(
          'button',
          {
            class: 'icon-btn small',
            title: '마지막 색 빼기',
            disabled: cols.length <= 1,
            onclick: () => {
              o.colors = P.colorsOf(o).slice(0, -1);
              paintSwatches();
              changed();
            },
          },
          '－'
        )
      );
    };
    paintSwatches();
    const palettes = h(
      'div',
      { class: 'pc-palettes' },
      P.PALETTES.map((pl) =>
        h(
          'button',
          {
            class: 'pc-pal',
            title: pl.name,
            onclick: () => {
              o.palette = pl.id;
              o.colors = null;
              paintSwatches();
              changed();
            },
          },
          h(
            'span',
            { class: 'pc-pal-sw' },
            pl.colors.slice(0, 4).map((c) => h('i', { style: { background: c } }))
          ),
          h('small', null, pl.name)
        )
      )
    );
    const colorBySeg = segs(
      [
        ['row', '줄마다', '부스가 늘어선 줄마다 색을 번갈아 (가로줄·옆줄 모두)'],
        ['col', '세로 열마다', '격자의 세로 열마다 색을 번갈아'],
        ['cat', '품목군별', '품목군마다 다른 색 + 아래에 범례'],
        ['one', '한 색'],
      ],
      () => (card() ? o.cardColorBy : o.colorBy === 'auto' ? 'row' : o.colorBy),
      (v) => {
        if (card()) o.cardColorBy = v;
        else o.colorBy = v;
        changed();
      }
    );

    // 글씨·칸 크기
    const sizeOut = h('small', { class: 'muted' });
    const wRange = h('input', { type: 'range', min: 36, max: 260, step: 2 });
    const hRange = h('input', { type: 'range', min: 36, max: 400, step: 2 });
    const sizeKeys = () => (card() ? ['ccw', 'cch'] : ['cw', 'ch']);
    function syncSize() {
      const mm = P.model(plan.layout, farmById, o, plan.seats);
      const [kw, kh] = sizeKeys();
      wRange.value = mm.cw;
      hRange.value = mm.ch;
      sizeOut.textContent = `칸 ${mm.cw}×${mm.ch}` + (o[kw] || o[kh] ? '' : ' (자동)');
    }
    wRange.addEventListener('input', () => {
      const [kw, kh] = sizeKeys();
      o[kw] = +wRange.value;
      if (!o[kh]) o[kh] = +hRange.value;
      syncSize();
      changed();
    });
    hRange.addEventListener('input', () => {
      const [kw, kh] = sizeKeys();
      o[kh] = +hRange.value;
      if (!o[kw]) o[kw] = +wRange.value;
      syncSize();
      changed();
    });
    syncSize();
    const textSeg = segs(
      [
        ['v', '세로로 긴 칸', '좁고 긴 칸에 위→아래로 써요 (가로로 늘어선 부스)'],
        ['h', '가로로 넓은 칸', '넓고 낮은 칸에 옆으로 써요 (세로로 늘어선 부스·묶음 배치)'],
      ],
      () => (o.text === 'auto' ? P.model(plan.layout, farmById, o).text : o.text),
      (v) => {
        o.text = v;
        o.cw = o.ch = o.ccw = o.cch = 0;
        syncSize();
        changed();
      }
    );

    // 부스 번호 (번호 순서를 바꾸면 배치도·엑셀 번호도 같이 바뀜)
    const noSeg = segs(
      [
        ['attach', '상호명에 붙이기'],
        ['box', '번호 상자', '칸 위쪽에 색 상자로 (양천 형식)'],
        ['none', '안 보이기'],
      ],
      () => o.noStyle,
      (v) => {
        o.noStyle = v;
        changed();
      }
    );
    const numSel = h(
      'select',
      {
        class: 'input',
        onchange: (e) => {
          for (const d of plan.days) d.layout.numbering = e.target.value;
          App.changed();
          paintAliases();
          redraw();
        },
      },
      FM.NUMBERING.map(([v, t, tip]) => h('option', { value: v, selected: plan.layout.numbering === v }, `${t} — ${tip}`))
    );

    // 시설 칸 색
    const labelNames = [...new Set(ev.days.reduce((a, d) => a.concat(Object.values(d.layout.cells).filter((c) => c.t === 'l').map((c) => c.label || '')), []))].filter(Boolean);
    const labelRows = labelNames.map((name) =>
      h(
        'div',
        { class: 'pc-label-row' },
        colorInput(P.labelStyle(name, o).fill, `${name} 색`, (v) => {
          o.labelColors[name] = v;
          changed();
        }),
        h('span', null, name),
        FM.isOpenLabel(name) ? h('small', { class: 'muted' }, '통로') : null
      )
    );

    // 방향 표시 띠
    const bandInput = (s, label, ph) =>
      h(
        'label',
        { class: 'pc-band' },
        h('span', null, label),
        h('input', {
          class: 'input',
          value: o.bands[s] || '',
          placeholder: ph,
          oninput: (e) => {
            o.bands[s] = e.target.value;
            changed();
          },
        })
      );

    // 그림에 보일 이름 고치기
    const aliasBox = h('div', { class: 'pc-alias' });
    const aliasCount = h('span');
    function paintAliases() {
      UI.clear(aliasBox);
      const nums = FM.boothNumbers(plan.layout);
      const rows = [];
      const seen = new Set();
      for (const k of FM.boothKeys(plan.layout))
        for (const e of plan.seats[k] || []) {
          const f = farmById[e.farmId];
          if (f && !seen.has(f.id)) {
            seen.add(f.id);
            rows.push({ k, f });
          }
        }
      aliasCount.textContent = ` (${rows.length}곳)`;
      for (const { k, f } of rows) {
        const auto = FM.displayName(Object.assign({}, f, { alias: '' }), o.paren);
        const long = () => (Array.from(FM.displayName(f, o.paren).replace(/\s/g, '')).length >= 9 ? '길어요' : '');
        const warnEl = h('small', { class: 'pc-long' }, long());
        aliasBox.appendChild(
          h(
            'div',
            { class: 'pc-alias-row' },
            h('b', null, nums[k]),
            h('span', { class: 'pc-alias-name', title: f.name }, f.name),
            h('input', {
              class: 'input',
              value: f.alias || '',
              placeholder: auto,
              oninput: (e) => {
                f.alias = e.target.value.trim();
                warnEl.textContent = long();
                App.changed();
                redraw();
              },
            }),
            warnEl
          )
        );
      }
    }
    paintAliases();

    const presetName = { yangcheon: '양천 형식', hwarangdae: '화랑대 형식', ttukseom: '뚝섬 형식' }[venue.id];
    const controls = h(
      'div',
      { class: 'poster-controls' },
      sec(
        '형식',
        contentSeg,
        scopeSeg,
        h(
          'div',
          { class: 'row gap' },
          h('small', { class: 'muted' }, presetName ? `기본: 팀에서 쓰던 ${presetName}` : '기본 형식'),
          h(
            'button',
            {
              class: 'btn small ghost',
              title: '이 장소에서 바꾼 색·글씨·번호 설정을 처음 형식으로 되돌려요',
              onclick: async () => {
                if (!(await UI.confirm('이 장소의 그림 설정을 처음 형식으로 되돌릴까요?', { okText: '되돌리기' }))) return;
                venue.posterOpts = null;
                App.changed();
                m.close();
                P.open(ev, day);
              },
            },
            '↺ 처음 형식으로'
          )
        )
      ),
      sec('제목', titleInput, titleBtns, subInput, titleStyleSeg, titleBarRow),
      sec('칸 색', colorBySeg, palettes, h('div', { class: 'row gap wrap' }, h('small', { class: 'muted' }, '줄 색:'), swatchWrap)),
      sec(
        '칸 모양 · 크기',
        textSeg,
        h('label', { class: 'pc-range' }, h('span', null, '너비'), wRange),
        h('label', { class: 'pc-range' }, h('span', null, '높이'), hRange),
        h(
          'div',
          { class: 'row gap' },
          sizeOut,
          h(
            'button',
            {
              class: 'btn small ghost',
              onclick: () => {
                const [kw, kh] = sizeKeys();
                o[kw] = 0;
                o[kh] = 0;
                syncSize();
                changed();
              },
            },
            '자동 크기'
          )
        )
      ),
      sec(
        '부스 번호',
        noSeg,
        h(
          'div',
          { class: 'row gap' },
          h('small', { class: 'muted' }, '상자 색'),
          colorInput(o.noColor, '번호 상자 색', (v) => {
            o.noColor = v;
            changed();
          })
        ),
        numSel,
        h('small', { class: 'muted' }, '번호 순서를 바꾸면 배치도·엑셀의 부스 번호도 같이 바뀌어요.')
      ),
      sec(
        '표시',
        check('⚡ 전력(kW)을 빨간 숫자로', 'showPower', '명단에 전력이 적힌 농가만 표시돼요'),
        check('빈 자리 칸도 그리기', 'showEmpty'),
        check('괄호 안 상호 쓰기 (예: 한빛인터내셔널(들꽃향기) → 들꽃향기)', 'paren')
      ),
      labelRows.length ? sec('시설 칸 색 (통로·입구·무대…)', ...labelRows) : null,
      sec(
        '방향 표시 띠 (그림 바깥, 이 장소에 기억)',
        bandInput('l', '왼쪽', '예: 한강방향 🌉'),
        bandInput('r', '오른쪽', '예: 자양역방향 🚇'),
        bandInput('t', '위', '예: 주차장 쪽'),
        bandInput('b', '아래', '예: 산책로 쪽'),
        h(
          'div',
          { class: 'row gap' },
          h('small', { class: 'muted' }, '띠 색'),
          colorInput(o.bandColor || P.DEFAULTS.bandColor, '띠 색', (v) => {
            o.bandColor = v;
            changed();
          })
        )
      ),
      sec(
        '맨 아래 문구',
        h('input', {
          class: 'input',
          value: o.note || '',
          placeholder: '예: 우천 시 일부 부스 위치 변경',
          oninput: (e) => {
            o.note = e.target.value;
            changed();
          },
        })
      ),
      h(
        'details',
        { class: 'pc-sec pc-details' },
        h('summary', null, '✏️ 그림에 보일 이름 고치기', aliasCount),
        h('small', { class: 'muted' }, '비워 두면 회색 글씨 이름을 써요. 여기서 고친 이름은 이 일정의 모든 날짜에 쓰여요.'),
        aliasBox
      )
    );

    let m = null;
    const saveBtn = h(
      'button',
      {
        class: 'btn primary',
        onclick: () => {
          redraw.flush();
          cv.toBlob((blob) => UI.download(blob, P.fileName(ev, venue, plan, o)), 'image/png');
          UI.toast('배치도 그림을 저장했어요. 다운로드 폴더를 확인하세요.', 'ok');
        },
      },
      '🖼 그림 저장 (PNG)'
    );
    m = UI.modal({
      title: `🖼 배치도 그림 만들기 — ${venue.name} ${ev.title}`,
      className: 'poster-modal',
      width: 'min(1320px, 96vw)',
      autofocus: false,
      body: h('div', { class: 'poster-dlg' }, controls, h('div', { class: 'poster-right' }, info, warn, preview)),
      footer: [
        h(
          'button',
          {
            class: 'btn ghost',
            title: '유사 품목 검수 선·전력 표시가 들어간 확인용 그림',
            onclick: () => {
              App.exportPng(ev, day, UI.safeFileName(`농부의시장_${venue.short}_${ev.title}`), true);
              UI.toast('검수용 그림을 저장했어요.', 'ok');
            },
          },
          '🔍 검수용 그림'
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              redraw.flush();
              P.print(cv);
            },
          },
          '🖨 인쇄'
        ),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => m.close() }, '닫기'),
        saveBtn,
      ],
      onClose: () => {
        App.saveNow();
        if (ev.days.map((d) => d.layout.numbering || 'row').join() !== numbering0) App.render();
      },
    });
    draw();
    return m;
  };
})(typeof window !== 'undefined' ? window : globalThis);
