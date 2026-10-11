/*
 * 게시용 배치도 그림
 *  - 맨 위에 제목(직접 입력) · 흰 바탕
 *  - 배치 모양 그대로 칸마다 상호명(세로 글씨) · 줄마다 다른 색
 *  - 부스 번호는 맨 위 줄이 아니라 상호명 바로 위에 붙여서
 *  - 「한강방향 🌉」 같은 방향 표시 띠, 색·글씨 설정은 장소마다 기억
 */
(function (root) {
  'use strict';
  const FM = root.FM;
  const P = (FM.Poster = {});

  P.PALETTES = [
    { id: 'yb', name: '노랑·하늘', colors: ['#FFF1BF', '#C3D3EA'] },
    { id: 'yg', name: '노랑·연두', colors: ['#FFF1BF', '#D3EAC2'] },
    { id: 'pm', name: '분홍·민트', colors: ['#FADBDD', '#CBEBE3'] },
    { id: 'many', name: '여러 색', colors: ['#FFF1BF', '#C3D3EA', '#D3EAC2', '#F8D3CF', '#E2D5F0', '#CDEDEC', '#FBDDBA'] },
    { id: 'white', name: '흰색', colors: ['#FFFFFF'] },
  ];
  P.DEFAULTS = {
    colorBy: 'auto', // auto·row(부스 줄마다) | col(세로 열마다) | cat(품목군별) | one(한 색)
    palette: 'yb',
    colors: null, // 직접 고른 색 (null = 색 조합 그대로)
    text: 'auto', // auto | v(세로 글씨) | h(가로 글씨)
    cw: 0, // 칸 너비 (0 = 자동)
    ch: 0, // 칸 높이 (0 = 자동)
    showNo: true, // 부스 번호를 이름에 붙여서
    showEmpty: true, // 빈 자리 칸도 그리기
    paren: true, // 「한빛인터내셔널(들꽃향기)」 → 「들꽃향기」
    bands: { l: '', r: '', t: '', b: '' }, // 방향 표시 띠 글씨
    bandColor: '#1B5E7A',
    note: '', // 맨 아래 작은 글씨
  };
  P.LABEL_FILL = '#E4E7EC';
  P.NO_COLOR = '#0F5A73';
  P.TEXT_COLOR = '#111827';
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕","Noto Sans KR",sans-serif'; // 이모지 글꼴은 넣지 않음 (숫자까지 이모지 글꼴로 그려져 간격이 벌어짐)
  const font = (w, s) => `${w} ${Math.round(s * 10) / 10}px ${FONT}`;

  /** 장소에 저장된 설정 + 기본값 */
  P.options = function (venue) {
    const saved = venue && venue.posterOpts ? FM.clone(venue.posterOpts) : {};
    const o = Object.assign(FM.clone(P.DEFAULTS), saved);
    o.bands = Object.assign({ l: '', r: '', t: '', b: '' }, saved.bands || {});
    return o;
  };
  P.colorsOf = function (o) {
    if (Array.isArray(o.colors) && o.colors.length) return o.colors;
    return (P.PALETTES.find((x) => x.id === o.palette) || P.PALETTES[0]).colors;
  };
  P.defaultTitle = function (venue, day) {
    const dt = FM.parseDate(day.date);
    return `${(venue && venue.name) || ''} 배치도(${dt.getMonth() + 1}.${dt.getDate()})`.trim();
  };
  P.titleOf = (venue, day) => (day.posterTitle != null ? day.posterTitle : P.defaultTitle(venue, day));

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

  /**
   * 그림의 칸 배치(순수 계산 — 캔버스 없이 테스트 가능)
   *  - 빈 줄·빈 열은 좁은 통로로 줄여서 그림
   *  - 세로 글씨 배치에서 세로로 늘어선 부스(ㄷ자·ㅁ자의 옆줄)는 넓고 낮은 칸에 가로 글씨로
   *  - 「줄」 = 부스가 늘어선 한 줄(가로줄은 행, 옆줄은 열) → 줄마다 색을 번갈아
   */
  P.model = function (L, farmById, opts) {
    const o = Object.assign({}, P.DEFAULTS, opts || {});
    const orient = P.orientation(L);
    const text = o.text === 'v' || o.text === 'h' ? o.text : orient === 'row' ? 'v' : 'h';
    const colorBy = !o.colorBy || o.colorBy === 'auto' ? 'row' : o.colorBy;
    const cw = o.cw > 0 ? o.cw : text === 'v' ? 64 : 150;
    const ch = o.ch > 0 ? o.ch : text === 'v' ? 200 : 58;
    const sideW = Math.max(cw, Math.round(ch * 0.75));
    const sideH = Math.max(40, Math.round(cw * 0.9));
    const gap = 3;
    const aisle = Math.max(14, Math.round(Math.min(cw, ch) * 0.5));
    const m = { orient, text, colorBy, cw, ch, sideW, sideH, gap, aisle, width: 0, height: 0, items: [], rowY: {}, rowH: {}, colX: {}, colW: {}, booths: 0, placed: 0, lines: 0 };
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
    const rowKind = {};
    const colKind = {};
    const ROWP = { label: 1, side: 2, main: 3 }; // 줄 높이: 세로 글씨 칸이 하나라도 있으면 높게
    const COLP = { label: 1, main: 2, side: 3 }; // 열 너비: 옆줄 칸이 하나라도 있으면 넓게
    const vert = {}; // 세로로 늘어선 줄의 부스
    const side = {}; // 세로 글씨 배치에서 넓고 낮은 칸으로 그릴 부스
    for (const k of keys) {
      const cell = L.cells[k];
      const [r, c] = FM.parseKey(k);
      minR = Math.min(minR, r);
      minC = Math.min(minC, c);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
      let kind = 'label';
      if (cell.t === 'b') {
        kind = 'main';
        const hl = 1 + run(r, c, 0, -1) + run(r, c, 0, 1);
        const vl = 1 + run(r, c, -1, 0) + run(r, c, 1, 0);
        if (vl > hl || (vl === hl && (cell.dir === 'l' || cell.dir === 'r'))) {
          vert[k] = true;
          if (text === 'v') {
            kind = 'side';
            side[k] = true;
          }
        }
      }
      if (!rowKind[r] || ROWP[kind] > ROWP[rowKind[r]]) rowKind[r] = kind;
      if (!colKind[c] || COLP[kind] > COLP[colKind[c]]) colKind[c] = kind;
    }
    let y = 0;
    for (let r = minR; r <= maxR; r++) {
      const kd = rowKind[r];
      const hh = !kd ? aisle : kd === 'main' ? ch : text === 'v' ? sideH : ch;
      m.rowY[r] = y;
      m.rowH[r] = hh;
      y += hh + gap;
    }
    let x = 0;
    for (let c = minC; c <= maxC; c++) {
      const kd = colKind[c];
      const ww = !kd ? aisle : kd === 'side' ? sideW : cw;
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
    for (const k of keys) {
      const cell = L.cells[k];
      const [r, c] = FM.parseKey(k);
      const it = { key: k, r, c, x: m.colX[c], y: m.rowY[r], w: m.colW[c], h: m.rowH[r] };
      if (cell.t !== 'b') {
        it.kind = 'label';
        it.name = cell.label || '';
        it.fill = P.LABEL_FILL;
        it.dir = it.w >= it.h * 0.9 ? 'h' : 'v';
      } else {
        m.booths++;
        const f = farmById[L.assign[k]];
        it.no = nums[k];
        it.kind = f ? 'booth' : 'empty';
        it.side = !!side[k];
        it.dir = text === 'h' ? 'h' : it.side ? (it.w >= it.h * 0.9 ? 'h' : 'v') : 'v';
        if (f) {
          m.placed++;
          it.farmId = f.id;
          it.name = FM.displayName(f, o.paren);
          it.cat = f.category || '';
        }
        it.line = lineRank[lineOf(k, r, c)];
        if (colorBy === 'cat') it.fill = f ? FM.catColor(f.category).bgHex : '#FFFFFF';
        else if (colorBy === 'one') it.fill = colors[0];
        else it.fill = colors[it.line % colors.length];
      }
      m.items.push(it);
    }
    m.items.sort((a, b) => a.r - b.r || a.c - b.c);
    return m;
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
  function mix(hex, t) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (!(n >= 0)) return hex;
    const ch = (v) => Math.round(v + (255 - v) * t);
    return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  }
  function pct(arr, p) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
  }

  /**
   * 그림 그리기 → canvas
   * p = { ev, day, venue, opts?, title?, sub? }
   */
  P.render = function (p) {
    const { ev, day, venue } = p;
    const o = Object.assign(P.options(venue), p.opts || {});
    const L = day.layout;
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const m = P.model(L, farmById, o);
    const title = p.title != null ? p.title : P.titleOf(venue, day);
    const sub = p.sub != null ? p.sub : day.posterSub || '';
    const V = m.text === 'v';
    const cw = m.cw;
    const ch = m.ch;

    // 방향 표시 띠
    const bands = {};
    for (const side of ['l', 'r', 't', 'b']) if (String(o.bands[side] || '').trim()) bands[side] = String(o.bands[side]).trim();
    const bandSide = Math.max(40, Math.round((V ? cw : Math.min(cw, ch)) * 0.9)); // 왼쪽·오른쪽 띠 너비
    const bandTop = Math.max(34, Math.round(bandSide * 0.78)); // 위·아래 띠 높이
    const BG = 10; // 띠와 칸 사이

    // 품목군 범례
    const cats = [];
    if (m.colorBy === 'cat') {
      const cnt = {};
      for (const it of m.items) if (it.kind === 'booth') cnt[it.cat || '(미분류)'] = (cnt[it.cat || '(미분류)'] || 0) + 1;
      cats.push(...Object.entries(cnt).sort((a, b) => b[1] - a[1]));
    }

    const PAD = 36;
    const gridW = Math.max(m.width, 1);
    const gridH = Math.max(m.height, 1);
    const leftW = bands.l ? bandSide + BG : 0;
    const rightW = bands.r ? bandSide + BG : 0;
    const topH = bands.t ? bandTop + BG : 0;
    const botH = bands.b ? bandTop + BG : 0;
    const contentW = leftW + gridW + rightW;
    const W = Math.round(Math.max(contentW + PAD * 2, 640));

    // 제목 크기: 그림 너비에 맞춰서
    const cv = root.document.createElement('canvas');
    let g = cv.getContext('2d');
    let titleFs = Math.max(30, Math.min(56, Math.round(W / 18)));
    if (title) {
      g.font = font(800, 100);
      const tw = g.measureText(title).width / 100;
      titleFs = Math.max(20, Math.min(titleFs, (W - PAD * 2) / Math.max(tw, 0.01)));
    }
    const subFs = Math.max(15, Math.round(titleFs * 0.45));
    const headH = (title ? titleFs * 1.25 : 0) + (sub ? subFs * 1.5 : 0) + (title || sub ? 22 : 0);
    const legendH = cats.length ? Math.ceil(cats.length / Math.max(1, Math.floor((W - PAD * 2) / 170))) * 26 + 10 : 0;
    const noteFs = 14;
    const noteH = o.note ? noteFs * 1.6 + 6 : 0;
    const H = Math.round(PAD + headH + topH + gridH + botH + (legendH || noteH ? 16 : 0) + legendH + noteH + PAD);

    let scale = 2;
    if (W * H * scale * scale > 60e6) scale = Math.max(1, Math.sqrt(60e6 / (W * H)));
    cv.width = Math.round(W * scale);
    cv.height = Math.round(H * scale);
    g = cv.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);

    // 제목
    let y = PAD;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (title) {
      g.fillStyle = P.TEXT_COLOR;
      g.font = font(800, titleFs);
      g.fillText(title, W / 2, y + titleFs * 0.6);
      y += titleFs * 1.25;
    }
    if (sub) {
      g.fillStyle = '#4B5563';
      g.font = font(500, subFs);
      g.fillText(sub, W / 2, y + subFs * 0.7);
      y += subFs * 1.5;
    }
    if (title || sub) y += 22;

    const gx = Math.round((W - contentW) / 2 + leftW);
    const gy = Math.round(y + topH);

    // 띠
    const drawBand = (side, x, yy, w, h) => {
      g.fillStyle = o.bandColor || P.DEFAULTS.bandColor;
      rrect(g, x, yy, w, h, 6);
      g.fill();
      g.fillStyle = '#FFFFFF';
      const txt = bands[side];
      if (side === 'l' || side === 'r') {
        const gs = P.graphemes(txt);
        const fs = Math.min(w * 0.52, (h - 24) / Math.max(1, vLen(gs)), 40);
        g.font = font(800, fs);
        drawVChars(g, gs, x + w / 2, yy + (h - vLen(gs) * fs) / 2, fs);
      } else {
        g.font = font(800, 100);
        const tw = g.measureText(txt).width / 100;
        const fs = Math.min(h * 0.5, (w - 24) / Math.max(tw, 0.01), 34);
        g.font = font(800, fs);
        g.fillText(txt, x + w / 2, yy + h / 2 + 1);
      }
    };
    if (bands.l) drawBand('l', gx - BG - bandSide, gy, bandSide, gridH);
    if (bands.r) drawBand('r', gx + gridW + BG, gy, bandSide, gridH);
    if (bands.t) drawBand('t', gx, gy - BG - bandTop, gridW, bandTop);
    if (bands.b) drawBand('b', gx, gy + gridH + BG, gridW, bandTop);

    // 칸 안 글씨 크기 기준: 이름 길이 75% 지점에 맞춰 모두 같은 크기로 (세로 글씨 칸 / 가로 글씨 칸 따로)
    const measure = (txt, w) => {
      g.font = font(w, 100);
      return g.measureText(txt).width / 100; // 글자 크기 1 기준 너비
    };
    const booths = m.items.filter((it) => it.kind === 'booth');
    const vw = cw; // 세로 글씨 칸
    const vh = ch;
    const hw = V ? m.sideW : cw; // 가로 글씨 칸
    const hh = V ? m.sideH : ch;
    const PV = { padX: Math.max(4, Math.round(vw * 0.08)), padY: Math.max(6, Math.round(vw * 0.12)), noFs: Math.max(11, Math.min(22, Math.round(vw * 0.3))) };
    const PH = { padX: Math.max(4, Math.round(hh * 0.12)), padY: Math.max(5, Math.round(hh * 0.12)), noFs: Math.max(11, Math.min(20, Math.round(hh * 0.34))) };
    PV.noH = o.showNo ? PV.noFs + 6 : 0;
    const vNames = booths.filter((it) => it.dir === 'v').map((it) => vLen(trimSp(P.graphemes(it.name))));
    PV.base = Math.max(9, Math.min((vw - PV.padX * 2) * 0.7, (vh - PV.padY * 2 - PV.noH) / Math.max(4, pct(vNames, 0.75)), 40));
    const noW1 = o.showNo ? measure('00', 800) + 0.3 : 0;
    const hNames = booths.filter((it) => it.dir === 'h').map((it) => noW1 + measure(it.name, 800));
    PH.base = Math.max(9, Math.min((hh - PH.padY * 2) * 0.62, 30, (hw - PH.padX * 2) / Math.max(pct(hNames, 0.75), 2.5)));

    for (const it of m.items) {
      if (it.kind === 'empty' && !o.showEmpty) continue;
      const x = gx + it.x;
      const yy = gy + it.y;
      // 칸
      if (it.kind === 'empty') {
        g.fillStyle = mix(it.fill, 0.55);
        rrect(g, x, yy, it.w, it.h, 4);
        g.fill();
        g.setLineDash([4, 3]);
        g.strokeStyle = 'rgba(0,0,0,.28)';
        g.lineWidth = 1;
        g.stroke();
        g.setLineDash([]);
      } else {
        g.fillStyle = it.fill;
        rrect(g, x, yy, it.w, it.h, 4);
        g.fill();
        g.strokeStyle = it.kind === 'label' ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.22)';
        g.lineWidth = 1;
        g.stroke();
      }
      const showNo = o.showNo && it.no != null;
      const name = it.name || '';
      const color = it.kind === 'label' ? '#4B5563' : P.TEXT_COLOR;
      if (it.dir === 'v') {
        const { padX, padY, noFs, noH, base: baseFs } = PV;
        // 번호(위) + 바로 아래 상호명(세로)
        const cx = x + it.w / 2;
        let top = yy + padY;
        if (showNo) {
          g.fillStyle = P.NO_COLOR;
          g.font = font(800, noFs);
          g.fillText(String(it.no), cx, top + noFs / 2);
          top += noH;
        }
        if (!name) continue;
        const availH = yy + it.h - padY - top;
        const availW = it.w - padX * 2;
        const fit = P.fitVertical(name, availW, availH, it.kind === 'label' ? Math.min(baseFs, 24) : baseFs);
        g.fillStyle = color;
        g.font = font(it.kind === 'label' ? 600 : 800, fit.fs);
        if (fit.cols.length === 1) drawVChars(g, fit.cols[0], cx, top, fit.fs);
        else {
          const colW = (availW - 4) / 2;
          // 오른쪽 줄부터 읽어요
          drawVChars(g, fit.cols[0], x + padX + colW + 4 + colW / 2, top, fit.fs);
          drawVChars(g, fit.cols[1], x + padX + colW / 2, top, fit.fs);
        }
      } else {
        // 가로 글씨: 「12 상호명」 한 줄, 길면 두 줄
        const { padX, padY, base: baseFs } = PH;
        const cy = yy + it.h / 2;
        const availW = it.w - padX * 2;
        const availH = it.h - padY * 2;
        const noTxt = showNo ? String(it.no) : '';
        const noW = noTxt ? measure(noTxt, 800) + 0.3 : 0;
        const nameW = measure(name, 800);
        let fs = Math.min(baseFs, availW / Math.max(noW + nameW, 0.01), availH * 0.8);
        let lines = [name];
        // 두 줄: 띄어쓰기가 있거나 8글자 이상일 때만 (짧은 이름을 중간에서 자르지 않게)
        const nG = P.graphemes(name).length;
        if ((/\s/.test(name.trim()) && fs < baseFs * 0.9) || (nG >= 8 && fs < baseFs * 0.8)) {
          const parts = P.splitName(name).map((gs) => gs.join(''));
          if (parts.length === 2 && parts[1]) {
            const w2 = Math.max(noW + measure(parts[0], 800), measure(parts[1], 800));
            const fs2 = Math.min(baseFs, availW / Math.max(w2, 0.01), availH / 2.3);
            if (fs2 > fs * 1.1) {
              fs = fs2;
              lines = parts;
            }
          }
        }
        const lh = fs * 1.18;
        lines.forEach((ln, i) => {
          const ly = cy + (i - (lines.length - 1) / 2) * lh;
          const pre = i === 0 ? noTxt : '';
          g.font = font(800, fs);
          const lw = g.measureText(ln).width;
          const pw = pre ? g.measureText(pre).width + fs * 0.3 : 0;
          let lx = x + it.w / 2 - (lw + pw) / 2;
          g.textAlign = 'left';
          if (pre) {
            g.fillStyle = P.NO_COLOR;
            g.fillText(pre, lx, ly);
            lx += pw;
          }
          g.fillStyle = color;
          g.font = font(it.kind === 'label' ? 600 : 800, fs);
          g.fillText(ln, lx, ly);
          g.textAlign = 'center';
        });
      }
    }

    // 아래: 품목군 범례 · 문구
    let by = gy + gridH + botH + 16;
    g.textBaseline = 'middle';
    if (cats.length) {
      const per = Math.max(1, Math.floor((W - PAD * 2) / 170));
      cats.forEach(([cat, n], i) => {
        const lx = PAD + (i % per) * 170;
        const ly = by + Math.floor(i / per) * 26 + 10;
        g.fillStyle = FM.catColor(cat).bgHex;
        rrect(g, lx, ly - 8, 16, 16, 3);
        g.fill();
        g.strokeStyle = FM.catColor(cat).hex;
        g.stroke();
        g.fillStyle = '#374151';
        g.font = font(600, 13);
        g.textAlign = 'left';
        g.fillText(`${cat} ${n}`, lx + 22, ly);
      });
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

  P.fileName = function (ev, day, venue) {
    const d = FM.fmtDay(day.date).replace(/[().]/g, '');
    return FM.UI.safeFileName(`농부의시장_${venue.short}_${ev.title}_${d}_배치도`) + '.png';
  };

  P.save = function (ev, day) {
    const venue = FM.App.venue(ev.venueId);
    const cv = P.render({ ev, day, venue });
    cv.toBlob((blob) => FM.UI.download(blob, P.fileName(ev, day, venue)), 'image/png');
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
    const L = day.layout;
    if (!Object.keys(L.cells).some((k) => L.cells[k].t === 'b')) {
      UI.toast('먼저 ② 칸 만들기에서 부스 칸을 만들어 주세요.', 'warn');
      return;
    }
    const o = P.options(venue);
    const numbering0 = L.numbering || 'row';
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const store = () => {
      venue.posterOpts = FM.clone(o);
      App.changed();
    };
    let cv = null;
    const preview = h('div', { class: 'poster-preview' });
    const info = h('div', { class: 'poster-info' });
    const draw = () => {
      cv = P.render({ ev, day, venue, opts: o });
      UI.clear(preview).appendChild(cv);
      const mm = cv.model;
      info.textContent = `부스 ${mm.booths}칸 · 농가 ${mm.placed}곳` + (mm.booths > mm.placed ? ` · 빈 자리 ${mm.booths - mm.placed}칸` : '') + ` · 그림 크기 ${cv.width}×${cv.height}`;
    };
    const redraw = UI.debounce(draw, 120);
    const changed = () => {
      store();
      redraw();
    };

    const sec = (title, ...kids) => h('div', { class: 'pc-sec' }, title ? h('h4', null, title) : null, ...kids);
    const segs = (list, get, set) => {
      const el = h('div', { class: 'segs wrap' });
      const paint = () => {
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
                  paint();
                },
              },
              t
            )
          );
      };
      paint();
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

    // 제목
    const titleInput = h('input', {
      class: 'input poster-title-input',
      value: P.titleOf(venue, day),
      placeholder: '맨 위 제목',
      oninput: (e) => {
        day.posterTitle = e.target.value;
        App.changed();
        redraw();
      },
    });
    const subInput = h('input', {
      class: 'input',
      value: day.posterSub || '',
      placeholder: '작은 제목 (예: 10:00~16:00) — 비워도 돼요',
      oninput: (e) => {
        day.posterSub = e.target.value;
        App.changed();
        redraw();
      },
    });

    // 색
    const model0 = P.model(L, farmById, o);
    const swatchWrap = h('div', { class: 'pc-swatches' });
    const paintSwatches = () => {
      UI.clear(swatchWrap);
      const cols = P.colorsOf(o).slice();
      cols.forEach((c, i) =>
        swatchWrap.appendChild(
          h('input', {
            type: 'color',
            class: 'pc-color',
            value: c,
            title: `${i + 1}번째 줄 색 — 눌러서 바꾸기`,
            oninput: (e) => {
              const arr = P.colorsOf(o).slice();
              arr[i] = e.target.value;
              o.colors = arr;
              changed();
            },
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
              arr.push(P.PALETTES[3].colors[arr.length % 7]);
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
      () => (o.colorBy === 'auto' ? 'row' : o.colorBy),
      (v) => {
        o.colorBy = v;
        changed();
      }
    );

    // 글씨·칸 크기
    const sizeOut = h('small', { class: 'muted' });
    const wRange = h('input', { type: 'range', min: 36, max: 240, step: 2 });
    const hRange = h('input', { type: 'range', min: 36, max: 340, step: 2 });
    const syncSize = () => {
      const mm = P.model(L, farmById, o);
      wRange.value = mm.cw;
      hRange.value = mm.ch;
      sizeOut.textContent = `칸 ${mm.cw}×${mm.ch}` + (o.cw || o.ch ? '' : ' (자동)');
    };
    wRange.addEventListener('input', () => {
      o.cw = +wRange.value;
      if (!o.ch) o.ch = +hRange.value;
      syncSize();
      changed();
    });
    hRange.addEventListener('input', () => {
      o.ch = +hRange.value;
      if (!o.cw) o.cw = +wRange.value;
      syncSize();
      changed();
    });
    syncSize();
    const textSeg = segs(
      [
        ['v', '세로 글씨', '좁고 긴 칸에 위→아래로 써요 (가로로 늘어선 부스)'],
        ['h', '가로 글씨', '넓고 낮은 칸에 옆으로 써요 (세로로 늘어선 부스)'],
      ],
      () => (o.text === 'auto' ? model0.text : o.text),
      (v) => {
        o.text = v;
        o.cw = 0;
        o.ch = 0;
        syncSize();
        changed();
      }
    );

    // 번호 순서 (배치도·엑셀 번호도 같이 바뀜)
    const numSel = h(
      'select',
      {
        class: 'input',
        onchange: (e) => {
          L.numbering = e.target.value;
          App.changed();
          paintAliases();
          redraw();
        },
      },
      FM.NUMBERING.map(([v, t, tip]) => h('option', { value: v, selected: (L.numbering || 'row') === v }, `${t} — ${tip}`))
    );

    // 방향 표시 띠
    const bandInput = (side, label, ph) =>
      h(
        'label',
        { class: 'pc-band' },
        h('span', null, label),
        h('input', {
          class: 'input',
          value: o.bands[side] || '',
          placeholder: ph,
          oninput: (e) => {
            o.bands[side] = e.target.value;
            changed();
          },
        })
      );
    const bandColor = h('input', {
      type: 'color',
      class: 'pc-color',
      value: o.bandColor || P.DEFAULTS.bandColor,
      title: '띠 색',
      oninput: (e) => {
        o.bandColor = e.target.value;
        changed();
      },
    });

    // 그림에 보일 이름 고치기
    const aliasBox = h('div', { class: 'pc-alias' });
    const aliasCount = h('span');
    function paintAliases() {
      UI.clear(aliasBox);
      const nums = FM.boothNumbers(L);
      const rows = FM.boothKeys(L)
        .map((k) => ({ k, f: farmById[L.assign[k]] }))
        .filter((x) => x.f);
      aliasCount.textContent = ` (${rows.length}곳)`;
      for (const { k, f } of rows) {
        const auto = FM.displayName(Object.assign({}, f, { alias: '' }), o.paren);
        const long = Array.from(FM.displayName(f, o.paren).replace(/\s/g, '')).length >= 9;
        const warn = h('small', { class: 'pc-long' }, long ? '길어요' : '');
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
                warn.textContent = Array.from(FM.displayName(f, o.paren).replace(/\s/g, '')).length >= 9 ? '길어요' : '';
                App.changed();
                redraw();
              },
            }),
            warn
          )
        );
      }
    }
    paintAliases();

    const controls = h(
      'div',
      { class: 'poster-controls' },
      sec('제목', titleInput, subInput),
      sec('칸 색', colorBySeg, palettes, h('div', { class: 'row gap wrap' }, h('small', { class: 'muted' }, '줄 색:'), swatchWrap)),
      sec(
        '글씨 · 칸 크기',
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
                o.cw = 0;
                o.ch = 0;
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
        check('번호를 상호명에 붙이기', 'showNo'),
        numSel,
        h('small', { class: 'muted' }, '번호 순서를 바꾸면 배치도·엑셀의 부스 번호도 같이 바뀌어요.')
      ),
      sec(
        '방향 표시 띠 (이 장소에 기억)',
        bandInput('l', '왼쪽', '예: 한강방향 🌉'),
        bandInput('r', '오른쪽', '예: 자양역방향 🚇'),
        bandInput('t', '위', '예: 주차장 쪽'),
        bandInput('b', '아래', '예: 산책로 쪽'),
        h('div', { class: 'row gap' }, h('small', { class: 'muted' }, '띠 색'), bandColor)
      ),
      sec(
        '그 밖에',
        check('빈 자리 칸도 그리기', 'showEmpty'),
        check('괄호 안 상호 쓰기 (예: 한빛인터내셔널(들꽃향기) → 들꽃향기)', 'paren'),
        h('input', {
          class: 'input',
          value: o.note || '',
          placeholder: '맨 아래 작은 글씨 (예: 우천 시 일부 부스 위치 변경)',
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
          cv.toBlob((blob) => UI.download(blob, P.fileName(ev, day, venue)), 'image/png');
          UI.toast('배치도 그림을 저장했어요. 다운로드 폴더를 확인하세요.', 'ok');
        },
      },
      '🖼 그림 저장 (PNG)'
    );
    m = UI.modal({
      title: `🖼 배치도 그림 만들기 — ${venue.short} ${FM.weekday(day.date)} ${FM.fmtDay(day.date)}`,
      className: 'poster-modal',
      width: 'min(1320px, 96vw)',
      autofocus: false,
      body: h('div', { class: 'poster-dlg' }, controls, h('div', { class: 'poster-right' }, info, preview)),
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
        if ((L.numbering || 'row') !== numbering0) App.render();
      },
    });
    draw();
    return m;
  };
})(typeof window !== 'undefined' ? window : globalThis);
