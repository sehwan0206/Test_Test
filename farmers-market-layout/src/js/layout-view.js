/*
 * 배치도 화면: ② 칸 만들기 / ③ 농가 배치 / ④ 검수
 */
(function (root) {
  'use strict';
  const FM = root.FM;
  const UI = FM.UI;
  const h = UI.h;
  const LV = (FM.LayoutView = {});

  const GAP = 4;
  const PAD = 14;
  let C = null; // { ev, day, els, insp, nums, farmById, hl }

  const App = () => FM.App;
  const ui = () => FM.App.ui;
  const ST = () => FM.App.state.settings;
  const LY = () => C.day.layout;
  // 칸 만들기 화면과 배치·검수 화면의 배율을 따로 기억
  const zoomKey = () => (ui().mode === 'edit' ? 'zoomEdit' : 'zoom');
  const zoom = () => ST()[zoomKey()] || (ui().mode === 'edit' ? 0.6 : 1);
  const MAXG = () => FM.GRID.max;
  const CW = () => Math.round(96 * zoom());
  const CH = () => Math.round(62 * zoom());
  const cellX = (c) => PAD + c * (CW() + GAP);
  const cellY = (r) => PAD + r * (CH() + GAP);

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // ================================================================ 렌더 ===
  LV.render = function (container, ev, day) {
    if (!day) {
      container.appendChild(h('div', { class: 'empty-state' }, h('h3', null, '이 일정에 날짜가 없어요'), h('button', { class: 'btn primary', onclick: () => App().openEventEditor(ev) }, '일정 수정')));
      return;
    }
    C = { ev, day, els: {}, hl: null };
    FM.cleanLayout(day.layout, ev, day);
    const mode = ui().mode;

    const MODE_INFO = {
      edit: ['② 칸 만들기', '격자를 클릭·드래그해서 부스 칸을 만드세요(한 칸 = 농가 한 곳). 부스 앞면 방향(▲▼◀▶)은 자동으로 정해지고 「➜ 방향」 붓으로 줄 단위로 바꿀 수 있어요.'],
      assign: ['③ 농가 배치', '「⚡ 자동 배치」 후, 칸을 끌어 옮기거나 목록에서 농가를 골라 원하는 칸에 놓으세요.'],
      inspect: ['④ 검수', '원재료·형태가 겹치는 농가가 가깝거나 서로 마주 보는 곳을 선으로 이어 보여줘요. 손으로 바꾼 뒤 꼭 확인하세요.'],
    }[mode];

    const top = h(
      'div',
      { class: 'lv-top' },
      h(
        'div',
        { class: 'day-pills' },
        ev.days.map((d) => {
          const s = App().dayStats(ev, d);
          return h(
            'button',
            { class: 'day-pill' + (d === day ? ' active' : ''), onclick: () => App().goLayout(ev, d.id) },
            h('b', null, FM.weekday(d.date) + ' ' + FM.fmtDay(d.date).replace(/\(.\)$/, '')),
            h('small', null, (d.round ? d.round + ' · ' : '') + `참여 ${s.attending} · 배치 ${s.placed}`)
          );
        })
      ),
      h('div', { class: 'lv-mode' }, h('strong', null, MODE_INFO[0]), h('span', null, MODE_INFO[1])),
      h(
        'div',
        { class: 'lv-tools' },
        h('button', { class: 'btn small', title: '지금 날짜의 배치도를 그림(PNG) 파일로 저장해요', onclick: () => savePng() }, '🖼 그림 저장'),
        h('button', { class: 'btn small', title: '되돌리기 (Ctrl+Z)', onclick: undo }, '↶ 되돌리기'),
        h('button', { class: 'btn small', title: '다시 하기 (Ctrl+Y)', onclick: redo }, '↷'),
        h(
          'span',
          { class: 'zoom' },
          h('button', { class: 'icon-btn', title: '작게', 'aria-label': '작게', onclick: () => setZoom(-0.1) }, '−'),
          h('span', null, Math.round(zoom() * 100) + '%'),
          h('button', { class: 'icon-btn', title: '크게', 'aria-label': '크게', onclick: () => setZoom(0.1) }, '＋'),
          h('button', { class: 'icon-btn small', title: '격자를 화면 너비에 맞춰요', onclick: fitZoom }, '화면 맞춤')
        )
      )
    );
    C.els.counter = h('div', { class: 'lv-counter' });
    C.els.grid = h('div', { class: 'lv-grid' });
    C.els.svg = svgEl('svg', { class: 'lv-lines' });
    C.els.hint = h('div', { class: 'lv-hint-wrap' });
    C.els.wrap = h('div', { class: 'lv-canvas' }, C.els.hint, h('div', { class: 'lv-stage' }, C.els.grid, C.els.svg));
    C.els.side = h('aside', { class: 'lv-side' });
    container.appendChild(top);
    container.appendChild(C.els.counter);
    container.appendChild(h('div', { class: 'lv-body' }, C.els.wrap, C.els.side));
    C.els.grid.addEventListener('pointerdown', onGridPointerDown);
    C.els.wrap.addEventListener('pointerdown', (e) => {
      if (e.target === C.els.wrap || e.target.classList.contains('lv-stage')) clearSelection();
    });
    refresh();
  };

  function baseName() {
    return UI.safeFileName(`농부의시장_${App().venue(C.ev.venueId).short}_${C.ev.title}`);
  }
  function savePng(withLines) {
    const lines = withLines == null ? ui().mode === 'inspect' || (ui().mode === 'assign' && ST().liveLines) : withLines;
    App().exportPng(C.ev, C.day, baseName(), lines);
    UI.toast('배치도 그림을 저장했어요' + (lines ? ' (검수 선 포함)' : '') + '. 다운로드 폴더를 확인하세요.', 'ok');
  }

  function setZoom(d) {
    ST()[zoomKey()] = Math.max(0.35, Math.min(1.6, Math.round((zoom() + d) * 100) / 100));
    App().changed();
    App().render();
  }
  function fitZoom() {
    const L = LY();
    const b = FM.Excel.layoutBounds(L);
    // 칸 만들기: 격자 전체(또는 그린 부분 + 여유) / 배치·검수: 그린 부분
    const cols = ui().mode === 'edit' ? (b ? Math.min(L.cols, b.maxC + 1 + FM.GRID.margin) : L.cols) : b ? b.maxC + 2 : L.cols;
    const avail = C.els.wrap.clientWidth - PAD * 2 - 6;
    const z = Math.floor((((avail + GAP) / cols - GAP) / 96) * 100) / 100;
    ST()[zoomKey()] = Math.max(0.35, Math.min(1.6, z));
    App().changed();
    App().render();
  }

  function compute() {
    const L = LY();
    C.farmById = Object.fromEntries(C.ev.farms.map((f) => [f.id, f]));
    C.nums = FM.boothNumbers(L);
    C.insp = FM.Sim.inspect(L, C.farmById, ST());
    C.cellOf = FM.farmCellMap(L);
    const rank = { info: 1, warn: 2, danger: 3 };
    C.cellLevel = {};
    for (const p of C.insp.pairs)
      for (const k of [p.a.key, p.b.key]) if (!C.cellLevel[k] || rank[p.level] > rank[C.cellLevel[k]]) C.cellLevel[k] = p.level;
  }

  function refresh(opts) {
    if (!C || !document.body.contains(C.els.grid)) return;
    FM.cleanLayout(LY(), C.ev, C.day);
    compute();
    renderCounter();
    renderHint();
    renderGrid();
    if (!opts || !opts.keepSide) renderSide();
    if (App().refreshSteps) App().refreshSteps();
  }
  LV.refresh = refresh;

  function changed(opts) {
    App().changed();
    refresh(opts);
  }

  // ------------------------------------------------------------- 카운터 ---
  function renderCounter() {
    const el = UI.clear(C.els.counter);
    const s = App().dayStats(C.ev, C.day);
    const mode = ui().mode;
    const N = s.attending;
    const K = s.booths;
    const P = s.placed;
    const stat = (label, val, cls, title) => h('div', { class: 'stat ' + (cls || ''), title: title || '' }, h('small', null, label), h('b', null, val));
    el.appendChild(stat('이 날 참여 농가', N + '곳'));
    el.appendChild(stat('부스 칸', K + '칸'));
    if (mode === 'edit') {
      const rem = N - K;
      el.appendChild(stat('남은 칸 수', rem > 0 ? rem : rem === 0 ? '0 ✓' : rem, rem > 0 ? 'need' : rem === 0 ? 'ok' : 'over', '참여 농가 수 − 부스 칸 수'));
      el.appendChild(h('div', { class: 'counter-msg ' + (rem > 0 ? 'need' : rem === 0 ? 'ok' : 'over') }, rem > 0 ? `부스 칸을 ${rem}개 더 만들면 딱 맞아요` : rem === 0 ? '✓ 참여 농가 수와 부스 칸 수가 딱 맞아요!' : `칸이 ${-rem}개 남아요 (빈 자리가 생겨요)`));
      const pct = N ? Math.min(100, Math.round((K / N) * 100)) : 0;
      el.appendChild(h('div', { class: 'progress' }, h('div', { class: 'bar ' + (rem < 0 ? 'over' : rem === 0 ? 'ok' : ''), style: { width: pct + '%' } })));
      const noDir = Object.values(LY().cells).filter((c) => c.t === 'b' && !c.dir).length;
      if (K && noDir)
        el.appendChild(
          h(
            'button',
            {
              class: 'stat over',
              title: '사방이 막혀 앞면을 정할 수 없는 부스예요. 「➜ 방향」 붓으로 정해 주세요. (방향이 없으면 거리로만 판단해요)',
              onclick: () => {
                ui().brush = 'd';
                renderSide();
              },
            },
            h('small', null, '방향 없는 부스'),
            h('b', null, noDir + '칸')
          )
        );
    } else {
      el.appendChild(stat('배치됨', P + '곳', P === N && N ? 'ok' : ''));
      const un = N - P;
      el.appendChild(
        h(
          'button',
          {
            class: 'stat ' + (un > 0 ? 'need' : 'ok'),
            title: '미배치 농가 보기',
            onclick: () => {
              ui().listFilter = 'unplaced';
              if (ui().mode !== 'assign') App().goLayout(C.ev, C.day.id, 'assign');
              else renderSide();
            },
          },
          h('small', null, '미배치'),
          h('b', null, un + '곳')
        )
      );
      if (K < N) el.appendChild(h('div', { class: 'counter-msg need' }, `⚠ 부스 칸이 ${N - K}개 부족해요 → ② 칸 만들기에서 늘려 주세요`));
      else if (K > N) el.appendChild(h('div', { class: 'counter-msg over' }, `빈 자리 ${K - P}칸`));
      if (N > 0 && P === N)
        el.appendChild(
          h(
            'div',
            { class: 'done-banner' },
            h('b', null, '🎉 배치 완료!'),
            h('button', { class: 'btn small primary', onclick: () => savePng(false) }, '🖼 그림 저장'),
            h('button', { class: 'btn small', onclick: () => savePng(true) }, '🖼 검수 선 넣어 저장'),
            h('button', { class: 'btn small', onclick: () => App().exportExcel(C.ev, baseName()) }, '📊 엑셀 저장'),
            h('button', { class: 'btn small ghost', onclick: () => App().printDay(C.ev, C.day) }, '🖨 인쇄')
          )
        );
    }
    el.appendChild(h('div', { class: 'spacer' }));
    if (P > 0) {
      const g = C.insp.grade;
      el.appendChild(
        h(
          'button',
          { class: 'grade-chip g-' + g.g, title: '검수 결과 보기', onclick: () => ui().mode !== 'inspect' && App().goLayout(C.ev, C.day.id, 'inspect') },
          h('span', { class: 'gl' }, g.g),
          h('span', null, `검수 ${g.label} · 위험 ${C.insp.counts.danger} · 주의 ${C.insp.counts.warn}`)
        )
      );
    }
  }

  /** 칸이 하나도 없는 날: 다른 날짜·장소 기본형에서 바로 가져오는 버튼 */
  function renderHint() {
    const box = UI.clear(C.els.hint);
    const L = LY();
    if (Object.keys(L.cells).length) return;
    const venue = App().venue(C.ev.venueId);
    const others = C.ev.days.filter((d) => d !== C.day && Object.values(d.layout.cells).some((c) => c.t === 'b'));
    const btns = [];
    for (const d of others) {
      const placed = Object.keys(d.layout.assign).length;
      btns.push(
        h(
          'button',
          {
            class: 'btn primary small',
            onclick: () => {
              pushHistory();
              const n = copyFrom(C.ev, d, { cells: true, seats: placed > 0, pin: placed > 0 });
              changed();
              UI.toast(`${FM.fmtDay(d.date)} 칸 모양을 가져왔어요.` + (placed ? ` 같은 농가 ${n}곳은 같은 자리에 📌고정했어요.` : ''), 'ok', 4500);
            },
          },
          `📋 ${FM.weekday(d.date)} ${FM.fmtDay(d.date)} ${placed ? '배치 그대로' : '칸 모양'} 가져오기`
        )
      );
    }
    if (venue.template)
      btns.push(
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              pushHistory();
              Object.assign(L, { rows: venue.template.rows, cols: venue.template.cols, cells: FM.clone(venue.template.cells), numbering: venue.template.numbering || 'row' });
              changed();
            },
          },
          `📥 ${venue.short} 기본형 불러오기`
        )
      );
    if (ui().mode !== 'edit') btns.push(h('button', { class: 'btn small', onclick: () => App().goLayout(C.ev, C.day.id, 'edit') }, '② 칸 직접 만들기'));
    box.appendChild(
      h(
        'div',
        { class: 'lv-hint' },
        h('b', null, '이 날은 아직 부스 칸이 없어요. '),
        h('span', { class: 'muted' }, btns.length > (ui().mode !== 'edit' ? 1 : 0) ? '같은 모양이면 아래에서 가져오세요.' : '격자를 클릭·드래그하거나 오른쪽 「빠르게 모양 만들기」를 쓰세요.'),
        btns.length ? h('div', { class: 'row gap wrap' }, btns) : null
      )
    );
  }

  // ---------------------------------------------------------------- 격자 ---
  function renderGrid() {
    const L = LY();
    const mode = ui().mode;
    const grid = UI.clear(C.els.grid);
    const W = PAD * 2 + L.cols * (CW() + GAP) - GAP;
    const H = PAD * 2 + L.rows * (CH() + GAP) - GAP;
    grid.className = 'lv-grid mode-' + mode + (zoom() < 0.5 ? ' tiny' : '');
    grid.style.width = W + 'px';
    grid.style.height = H + 'px';
    grid.style.setProperty('--z', zoom());
    grid.style.backgroundSize = `${CW() + GAP}px ${CH() + GAP}px`;
    grid.style.backgroundPosition = `${PAD - GAP / 2}px ${PAD - GAP / 2}px`;
    const q = (ui().search || '').trim().toLowerCase();
    const frag = document.createDocumentFragment();
    const showHeat = mode === 'inspect' && ST().heatmap;
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        const key = FM.cellKey(r, c);
        const cell = L.cells[key];
        if (!cell && mode !== 'edit') continue;
        frag.appendChild(cellEl(key, cell, q, showHeat));
      }
    }
    grid.appendChild(frag);
    renderLines(W, H);
  }

  function cellEl(key, cell, q, showHeat) {
    const L = LY();
    const [r, c] = FM.parseKey(key);
    const style = { left: cellX(c) + 'px', top: cellY(r) + 'px', width: CW() + 'px', height: CH() + 'px' };
    if (!cell) return h('div', { class: 'cell off', 'data-k': key, style });
    if (cell.t === 'l') return h('div', { class: 'cell label', 'data-k': key, style, title: cell.label }, h('span', null, cell.label));
    const f = C.farmById[L.assign[key]];
    const u = ui();
    let cls = 'cell booth ' + (f ? 'filled' : 'empty');
    if (f && L.pins[f.id]) cls += ' pinned';
    if (u.selectedKey === key) cls += ' selected';
    if (u.swapFrom === key) cls += ' swap-src';
    if (C.hl && (C.hl.a === key || C.hl.b === key)) cls += ' hl';
    if (q) {
      const hit = f && [f.name, f.owner, f.items, f.category, (f.tags || []).join(' '), (f.forms || []).join(' ')].join(' ').toLowerCase().includes(q);
      cls += hit ? ' match' : ' dim';
    }
    if (f) {
      const col = FM.catColor(f.category);
      style.background = col.bg;
      style.borderColor = col.bd;
    }
    if (showHeat) {
      // 이 칸이 걸린 가장 높은 레벨로 테두리 표시 (위험 빨강 · 주의 주황 · 참고 노랑)
      const lv = C.cellLevel[key];
      if (lv) cls += ' heat-' + lv;
    }
    if (cell.dir) cls += ' f-' + cell.dir;
    const dirText = cell.dir ? `\n앞면: ${FM.DIR_LABEL[cell.dir]}쪽${cell.da ? ' (자동)' : ''}` : '';
    const title = f
      ? `${C.nums[key]}번 · ${f.name}\n${f.category} · ${f.items}\n원재료: ${(f.tags || []).join(', ') || '없음'}\n형태: ${(f.forms || []).join(', ') || '없음'}${L.pins[f.id] ? '\n📌 고정됨' : ''}${dirText}`
      : `${C.nums[key]}번 · 빈 자리${dirText}`;
    return h(
      'div',
      { class: cls, 'data-k': key, style, title },
      cell.dir ? h('span', { class: 'cdir d-' + cell.dir + (cell.da ? '' : ' manual') }, FM.DIR_ARROW[cell.dir]) : null,
      h('span', { class: 'cno' }, C.nums[key]),
      f && L.pins[f.id] ? h('span', { class: 'cpin' }, '📌') : null,
      f ? h('div', { class: 'cname' }, FM.shortName(f.name)) : h('div', { class: 'cempty' }, '빈 자리'),
      f ? h('div', { class: 'ccat' }, f.category || '') : null
    );
  }

  function renderLines(W, H) {
    const svg = C.els.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const mode = ui().mode;
    const show = mode === 'inspect' || (mode === 'assign' && ST().liveLines);
    svg.style.display = show ? '' : 'none';
    svg.classList.toggle('has-hl', !!C.hl);
    if (!show) return;
    const cx = (p) => cellX(p.c) + CW() / 2;
    const cy = (p) => cellY(p.r) + CH() / 2;
    for (const p of C.insp.lines) {
      const hl = C.hl && ((C.hl.a === p.a.key && C.hl.b === p.b.key) || (C.hl.a === p.b.key && C.hl.b === p.a.key) || (C.hl.cell && (C.hl.cell === p.a.key || C.hl.cell === p.b.key)));
      const g = svgEl('g', { class: 'ln' + (hl ? ' hl' : '') });
      const w = 2.5 + 4 * Math.min(1, p.sev / 0.8);
      g.appendChild(svgEl('line', { x1: cx(p.a), y1: cy(p.a), x2: cx(p.b), y2: cy(p.b), stroke: '#fff', 'stroke-width': w + 3, 'stroke-linecap': 'round', opacity: 0.8 }));
      const ln = svgEl('line', { x1: cx(p.a), y1: cy(p.a), x2: cx(p.b), y2: cy(p.b), stroke: p.color, 'stroke-width': w, 'stroke-linecap': 'round' });
      if (p.kind === 'form') ln.setAttribute('stroke-dasharray', '9 5');
      else if (p.kind === 'cat') ln.setAttribute('stroke-dasharray', '2 6');
      g.appendChild(ln);
      for (const q of [p.a, p.b]) g.appendChild(svgEl('circle', { cx: cx(q), cy: cy(q), r: 4.5, fill: p.color, stroke: '#fff', 'stroke-width': 1.5 }));
      svg.appendChild(g);
    }
  }

  function setHighlight(hl) {
    C.hl = hl;
    renderGrid();
  }

  // ---------------------------------------------------------- 포인터 조작 ---
  function onGridPointerDown(e) {
    if (e.button !== 0) return;
    const cellNode = e.target.closest('.cell');
    if (!cellNode) return;
    const key = cellNode.dataset.k;
    const mode = ui().mode;
    if (mode === 'edit') return startPaint(e, key);
    const cell = LY().cells[key];
    if (!cell || cell.t !== 'b') return;
    if (mode === 'assign') return startDrag(e, { fromKey: key });
    if (mode === 'inspect') {
      ui().selectedKey = ui().selectedKey === key ? null : key;
      C.hl = ui().selectedKey ? { cell: key } : null;
      renderGrid();
      renderSide();
    }
  }

  // 칸 칠하기 (클릭/드래그)
  function startPaint(e, key) {
    e.preventDefault();
    const L = LY();
    const u = ui();
    const cell = L.cells[key];
    let action;
    if (u.brush === 'b') action = cell && cell.t === 'b' ? 'erase' : 'booth';
    else if (u.brush === 'l') action = cell && cell.t === 'l' && cell.label === u.labelText ? 'erase' : 'label';
    else if (u.brush === 'd') action = 'dir';
    else action = 'erase';
    pushHistory();
    const visited = new Set();
    const redraw = (k) => {
      const old = C.els.grid.querySelector(`.cell[data-k="${k}"]`);
      const nu = cellEl(k, L.cells[k], '', false);
      if (old) old.replaceWith(nu);
    };
    const apply = (k) => {
      if (visited.has(k)) return;
      visited.add(k);
      const cur = L.cells[k];
      if (action === 'dir') {
        // 방향 붓: 부스 앞면 방향 지정 (같은 줄 전체 옵션)
        const pick = u.dirPick === undefined ? 'd' : u.dirPick;
        const keys = FM.setDirection(L, k, pick || null, u.dirWhole !== false);
        keys.forEach((k2) => {
          visited.add(k2);
          redraw(k2);
        });
        return;
      }
      if (action === 'booth') {
        if (cur && cur.t === 'b') return;
        L.cells[k] = { t: 'b' };
      } else if (action === 'label') {
        L.cells[k] = { t: 'l', label: u.labelText || '표시' };
        delete L.assign[k];
      } else {
        if (!cur) return;
        delete L.cells[k];
        delete L.assign[k];
      }
      C.nums = FM.boothNumbers(L);
      const old = C.els.grid.querySelector(`.cell[data-k="${k}"]`);
      const nu = cellEl(k, L.cells[k], '', false);
      if (old) old.replaceWith(nu);
      renderCounter();
    };
    apply(key);
    const grid = C.els.grid;
    try {
      grid.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 일부 브라우저 */
    }
    const move = (ev2) => {
      const node = document.elementFromPoint(ev2.clientX, ev2.clientY);
      const cn = node && node.closest && node.closest('.lv-grid .cell');
      if (cn) apply(cn.dataset.k);
    };
    const up = () => {
      grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerup', up);
      grid.removeEventListener('pointercancel', up);
      // 가장자리까지 칠하면 격자를 자동으로 늘림
      if (FM.ensureMargin(L)) UI.toast(`격자를 넓혔어요 (${L.rows}줄 × ${L.cols}칸)`);
      // 칸 모양이 바뀌면 자동 방향(직접 정한 방향 제외)을 다시 계산
      if (action !== 'dir') FM.autoDirections(L);
      changed();
    };
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', up);
  }

  // 끌어서 옮기기 / 클릭
  function startDrag(e, src) {
    const L = LY();
    const fid = src.farmId || L.assign[src.fromKey];
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dragging = false;
    let ghost = null;
    let overKey = null;
    let overList = false;
    if (fid) e.preventDefault();
    const setOver = (k) => {
      if (k === overKey) return;
      if (overKey) {
        const o = C.els.grid.querySelector(`.cell[data-k="${overKey}"]`);
        if (o) o.classList.remove('drop-over');
      }
      overKey = k;
      if (k) {
        const o = C.els.grid.querySelector(`.cell[data-k="${k}"]`);
        if (o) o.classList.add('drop-over');
      }
    };
    const move = (ev2) => {
      if (!dragging) {
        if (!fid || Math.hypot(ev2.clientX - x0, ev2.clientY - y0) < 6) return;
        dragging = true;
        const f = C.farmById[fid];
        ghost = h('div', { class: 'drag-ghost' }, f ? FM.shortName(f.name) : '');
        document.body.appendChild(ghost);
        document.body.classList.add('is-dragging');
      }
      ghost.style.left = ev2.clientX + 14 + 'px';
      ghost.style.top = ev2.clientY + 10 + 'px';
      const node = document.elementFromPoint(ev2.clientX, ev2.clientY);
      const cn = node && node.closest && node.closest('.lv-grid .cell.booth');
      setOver(cn ? cn.dataset.k : null);
      const lst = node && node.closest && node.closest('.farm-list-drop');
      overList = !!lst && !!src.fromKey;
      document.querySelectorAll('.farm-list-drop').forEach((x) => x.classList.toggle('drop-over', overList));
    };
    const end = (ev2) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      if (ghost) ghost.remove();
      document.body.classList.remove('is-dragging');
      document.querySelectorAll('.farm-list-drop').forEach((x) => x.classList.remove('drop-over'));
      const target = overKey;
      setOver(null);
      if (dragging) {
        if (target && target !== src.fromKey) {
          pushHistory();
          if (src.fromKey) moveOrSwap(src.fromKey, target, false);
          else placeFarm(fid, target);
          ui().selectedKey = target;
          ui().armedFarmId = null;
          changed();
        } else if (overList && src.fromKey) {
          pushHistory();
          unassign(src.fromKey);
          changed();
        }
      } else if (ev2 && ev2.type === 'pointerup') {
        if (src.fromKey) onCellClick(src.fromKey);
        else onFarmItemClick(src.farmId);
      }
    };
    const cancel = () => {
      dragging = false;
      end(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  }

  function onCellClick(key) {
    const u = ui();
    if (u.armedFarmId) {
      pushHistory();
      placeFarm(u.armedFarmId, key);
      const f = C.farmById[u.armedFarmId];
      u.armedFarmId = null;
      u.selectedKey = key;
      changed();
      if (f) UI.toast(`${FM.shortName(f.name)} → ${C.nums[key]}번 자리` + (ST().autoPin ? ' 📌고정' : ''), 'ok');
      return;
    }
    if (u.swapFrom && u.swapFrom !== key) {
      pushHistory();
      moveOrSwap(u.swapFrom, key, true);
      u.swapFrom = null;
      u.selectedKey = key;
      changed();
      UI.toast('두 자리를 바꿨어요.', 'ok');
      return;
    }
    u.swapFrom = null;
    u.selectedKey = u.selectedKey === key ? null : key;
    renderGrid();
    renderSide();
  }

  function onFarmItemClick(fid) {
    const u = ui();
    if (u.armedFarmId === fid) {
      u.armedFarmId = null;
    } else {
      u.armedFarmId = fid;
      u.swapFrom = null;
      u.selectedKey = C.cellOf[fid] || null;
    }
    renderGrid();
    renderSide();
  }

  function clearSelection() {
    const u = ui();
    if (!u.selectedKey && !u.armedFarmId && !u.swapFrom && !C.hl) return;
    u.selectedKey = null;
    u.armedFarmId = null;
    u.swapFrom = null;
    C.hl = null;
    renderGrid();
    renderSide();
  }

  // ------------------------------------------------------------ 배치 조작 ---
  function moveOrSwap(a, b, explicitSwap) {
    const L = LY();
    const fa = L.assign[a];
    const fb = L.assign[b];
    if (fa) L.assign[b] = fa;
    else delete L.assign[b];
    if (fb) L.assign[a] = fb;
    else delete L.assign[a];
    if (ST().autoPin) {
      if (fa) L.pins[fa] = true;
      if (fb && explicitSwap) L.pins[fb] = true;
    }
  }
  function placeFarm(fid, key) {
    const L = LY();
    const cur = FM.farmCellMap(L)[fid];
    if (cur === key) {
      if (ST().autoPin) L.pins[fid] = true;
      return;
    }
    if (cur) moveOrSwap(cur, key, false);
    else {
      const disp = L.assign[key];
      if (disp) delete L.pins[disp];
      L.assign[key] = fid;
    }
    if (ST().autoPin) L.pins[fid] = true;
  }
  function unassign(key) {
    const L = LY();
    const fid = L.assign[key];
    if (fid) delete L.pins[fid];
    delete L.assign[key];
  }

  // ---------------------------------------------------------- 되돌리기 ---
  function hist() {
    const id = C.day.id;
    const H = App().history;
    return H[id] || (H[id] = { undo: [], redo: [] });
  }
  function pushHistory() {
    const H = hist();
    H.undo.push(JSON.stringify(LY()));
    if (H.undo.length > 80) H.undo.shift();
    H.redo.length = 0;
  }
  function undo() {
    const H = hist();
    if (!H.undo.length) return UI.toast('되돌릴 작업이 없어요.');
    H.redo.push(JSON.stringify(LY()));
    C.day.layout = JSON.parse(H.undo.pop());
    changed();
    UI.toast('되돌렸어요.');
  }
  function redo() {
    const H = hist();
    if (!H.redo.length) return UI.toast('다시 할 작업이 없어요.');
    H.undo.push(JSON.stringify(LY()));
    C.day.layout = JSON.parse(H.redo.pop());
    changed();
  }

  LV.onKey = function (e) {
    if (!C || !document.body.contains(C.els.grid) || UI.hasModal()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (e.key === 'Escape') clearSelection();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && ui().mode === 'assign' && ui().selectedKey && LY().assign[ui().selectedKey]) {
      e.preventDefault();
      pushHistory();
      unassign(ui().selectedKey);
      changed();
    }
  };

  // ============================================================ 자동 배치 ===
  /**
   * kind: 'all'  고정 농가 외 전체 재배치
   *       'fill' 지금 배치는 그대로 두고 빈 자리만 채우기
   *       'fix'  최소한의 이동으로 충돌만 해소 (이동 1건당 벌점)
   */
  function runAuto(kind) {
    const L = LY();
    const ev = C.ev;
    FM.cleanLayout(L, ev, C.day);
    const farms = FM.attendingFarms(ev, C.day);
    const keys = FM.boothKeys(L);
    if (!keys.length) return UI.toast('먼저 ② 칸 만들기에서 부스 칸을 만들어 주세요.', 'warn');
    if (!farms.length) return UI.toast('이 날 참여 농가가 없어요. ① 참여 명단에서 체크해 주세요.', 'warn');
    if (kind === 'fix' && !C.insp.counts.danger && !C.insp.counts.warn) return UI.toast('고칠 위험·주의 자리가 없어요. 👍', 'ok');
    const idx = new Map(farms.map((f, i) => [f.id, i]));
    const cells = FM.Sim.boothCells(L, keys);
    const initial = new Int32Array(keys.length).fill(-1);
    const fixed = new Uint8Array(keys.length);
    keys.forEach((k, i) => {
      const fid = L.assign[k];
      if (fid && idx.has(fid)) {
        initial[i] = idx.get(fid);
        if (L.pins[fid] || kind === 'fill') fixed[i] = 1;
      }
    });
    const placed = new Set(Object.values(L.assign));
    const toPlace = farms.map((f, i) => (placed.has(f.id) ? -1 : i)).filter((i) => i >= 0);
    if (kind === 'fill' && !toPlace.length) return UI.toast('미배치 농가가 없어요.', 'ok');
    const st = ST();
    const before = C.insp;
    const busy = h('div', { class: 'busy' }, h('div', { class: 'busy-box' }, h('div', { class: 'spinner' }), h('span', null, '비슷한 품목이 붙지 않게 배치를 계산하는 중…')));
    document.body.appendChild(busy);
    setTimeout(() => {
      try {
        const { S, N1 } = FM.Sim.matrix(farms, st);
        const res = FM.Opt.optimize({
          cells,
          S,
          N1,
          initial,
          fixed,
          toPlace,
          fresh: kind === 'all',
          anchorPenalty: kind === 'fix' ? 1 : 0,
          st,
          seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
        });
        pushHistory();
        for (const k of keys) delete L.assign[k];
        keys.forEach((k, i) => {
          if (res.assign[i] >= 0) L.assign[k] = farms[res.assign[i]].id;
        });
        ui().selectedKey = null;
        ui().armedFarmId = null;
        changed();
        const after = C.insp;
        let msg;
        if (kind === 'fix') {
          msg = `문제 자리 고치기 완료 — ${res.moved}곳 이동 · 위험 ${before.counts.danger}→${after.counts.danger}, 주의 ${before.counts.warn}→${after.counts.warn}`;
          const pinnedPairs = after.pairs.filter((p) => p.level !== 'info' && L.pins[p.a.farm.id] && L.pins[p.b.farm.id]).length;
          if (pinnedPairs) msg += ` · 📌고정 농가끼리 붙은 ${pinnedPairs}쌍은 고정을 풀어야 고칠 수 있어요`;
          else if (after.counts.warn) msg += ' · 남은 「주의」는 한 번 더 누르거나 「⚡ 전체 다시 배치」로 줄일 수 있어요';
        }
        else msg = `${kind === 'fill' ? '빈 자리 채우기' : '자동 배치'} 완료 — 검수 ${after.grade.g}등급(${after.grade.label}) · 위험 ${after.counts.danger} · 주의 ${after.counts.warn}`;
        if (res.unplaced.length) msg += ` · ⚠ 칸이 부족해 ${res.unplaced.length}곳 미배치`;
        UI.toast(msg, res.unplaced.length ? 'warn' : 'ok', 5000);
      } catch (err) {
        console.error(err);
        UI.toast('배치 계산 중 오류: ' + err.message, 'error', 5000);
      } finally {
        busy.remove();
      }
    }, 50);
  }

  // ============================================================ 옆 패널 ===
  function renderSide() {
    const side = C.els.side;
    const list = side.querySelector('.farm-list');
    const scroll = list ? list.scrollTop : 0;
    UI.clear(side);
    const mode = ui().mode;
    if (mode === 'edit') sideEdit(side);
    else if (mode === 'assign') sideAssign(side);
    else sideInspect(side);
    const nl = side.querySelector('.farm-list');
    if (nl) nl.scrollTop = scroll;
  }

  const section = (title, ...kids) => h('section', { class: 'side-sec' }, title ? h('h4', null, title) : null, ...kids);
  const nextBtn = (label, mode) => h('button', { class: 'btn primary block next-step', onclick: () => (mode === 'export' ? App().go('#/e/' + C.ev.id + '/export') : App().goLayout(C.ev, C.day.id, mode)) }, label);

  // ---------------------------------------------------------- ② 칸 만들기 ---
  function sideEdit(side) {
    const L = LY();
    const u = ui();
    const venue = App().venue(C.ev.venueId);
    const N = FM.attendingFarms(C.ev, C.day).length;

    const brushBtn = (b, label) =>
      h(
        'button',
        {
          class: 'seg' + (u.brush === b ? ' on' : ''),
          onclick: () => {
            u.brush = b;
            renderSide();
          },
        },
        label
      );
    side.appendChild(
      section(
        '칸 그리기',
        h('div', { class: 'segs' }, brushBtn('b', '▦ 부스'), brushBtn('d', '➜ 방향'), brushBtn('l', '🏷 시설'), brushBtn('x', '⌫ 지우개')),
        u.brush === 'd'
          ? dirPicker()
          : u.brush === 'l'
          ? h(
              'div',
              { class: 'label-pick' },
              h('input', { class: 'input', value: u.labelText, placeholder: '표시할 이름', oninput: (e) => (u.labelText = e.target.value) }),
              h(
                'div',
                { class: 'chips' },
                ['입구', '무대', '운영본부', '화장실', '통로', '시식', '휴게', '주차장', '나무', '계단'].map((t) =>
                  h(
                    'button',
                    {
                      class: 'chip-btn' + (u.labelText === t ? ' on' : ''),
                      onclick: () => {
                        u.labelText = t;
                        renderSide();
                      },
                    },
                    t
                  )
                )
              ),
              h('p', { class: 'muted small' }, '무대·입구 같은 시설은 부스 수에 들어가지 않아요. 위치를 알아보기 쉽게 표시만 해요.')
            )
          : h('p', { class: 'muted small' }, u.brush === 'b' ? '빈 격자를 누르면 부스 칸이 생기고, 부스 칸을 다시 누르면 지워져요. 누른 채로 끌면 여러 칸을 한 번에 칠해요. 오른쪽·아래 끝까지 칠하면 격자가 자동으로 늘어나요.' : '누르거나 끌어서 칸을 지워요.')
      )
    );

    side.appendChild(directionSection());

    const shapeSel = h(
      'select',
      {
        class: 'input',
        onchange: (e) => {
          u.shapeKind = e.target.value;
          renderSide();
        },
      },
      [
        ['lines', '일자 줄 (마주보기)'],
        ['u', 'ㄷ자'],
        ['ring', 'ㅁ자 (둘레)'],
        ['block', '꽉 찬 사각형'],
      ].map(([v, t]) => h('option', { value: v, selected: u.shapeKind === v }, t))
    );
    const nInput = h('input', { class: 'input num', type: 'number', min: 1, max: 400, value: N || 20 });
    side.appendChild(
      section(
        '빠르게 모양 만들기',
        h('div', { class: 'row gap wrap' }, shapeSel, u.shapeKind === 'lines' ? h('label', { class: 'inline' }, h('input', { class: 'input num', type: 'number', min: 1, max: 8, value: u.shapeLines, onchange: (e) => (u.shapeLines = +e.target.value || 2) }), ' 줄') : null),
        h(
          'div',
          { class: 'row gap' },
          h('label', { class: 'inline' }, '칸 수 ', nInput),
          h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                const n = +nInput.value;
                if (!n) return;
                if (Object.keys(L.cells).length && !(await UI.confirm('지금 칸을 지우고 새 모양으로 만들까요?', { okText: '새로 만들기' }))) return;
                pushHistory();
                const g = FM.generateShape(u.shapeKind, n, u.shapeLines);
                Object.assign(L, { rows: Math.max(L.rows, g.rows), cols: Math.max(L.cols, g.cols), cells: g.cells, assign: {}, pins: {} });
                changed();
              },
            },
            '만들기'
          )
        ),
        h('p', { class: 'muted small' }, `기본값은 이 날 참여 농가 수(${N}곳)예요. 만든 뒤 칸을 더하거나 지워서 실제 장소 모양에 맞추세요.`)
      )
    );

    const rIn = h('input', { class: 'input num', type: 'number', min: 1, max: MAXG(), value: L.rows });
    const cIn = h('input', { class: 'input num', type: 'number', min: 1, max: MAXG(), value: L.cols });
    const grow = (dr, dc) => {
      pushHistory();
      L.rows = Math.min(MAXG(), L.rows + dr);
      L.cols = Math.min(MAXG(), L.cols + dc);
      changed();
    };
    const shift = (dr, dc) => {
      pushHistory();
      shiftLayout(L, dr, dc);
      changed();
    };
    side.appendChild(
      section(
        '격자 크기',
        h(
          'div',
          { class: 'row gap' },
          h('label', { class: 'inline' }, '세로 ', rIn, ' 줄'),
          h('label', { class: 'inline' }, '가로 ', cIn, ' 칸'),
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                const r = Math.max(1, Math.min(MAXG(), +rIn.value || L.rows));
                const c = Math.max(1, Math.min(MAXG(), +cIn.value || L.cols));
                pushHistory();
                L.rows = r;
                L.cols = c;
                changed();
              },
            },
            '적용'
          )
        ),
        h(
          'div',
          { class: 'row gap wrap' },
          h('button', { class: 'btn small', onclick: () => shift(5, 0) }, '＋ 위 5줄'),
          h('button', { class: 'btn small', onclick: () => grow(5, 0) }, '＋ 아래 5줄'),
          h('button', { class: 'btn small', onclick: () => shift(0, 5) }, '＋ 왼쪽 5칸'),
          h('button', { class: 'btn small', onclick: () => grow(0, 5) }, '＋ 오른쪽 5칸'),
          h(
            'button',
            {
              class: 'btn small ghost',
              onclick: () => {
                pushHistory();
                trimLayout(L);
                changed();
              },
            },
            '빈 테두리 줄이기'
          )
        ),
        h('p', { class: 'muted small' }, `지금 ${L.rows}줄 × ${L.cols}칸 = ${L.rows * L.cols}칸 (최대 ${MAXG()}×${MAXG()})`)
      )
    );

    const tpl = venue.template;
    const tplCount = tpl ? Object.values(tpl.cells).filter((c) => c.t === 'b').length : 0;
    side.appendChild(
      section(
        `장소 기본형 · ${venue.short}`,
        h('p', { class: 'muted small' }, tpl ? `저장된 기본형: 부스 ${tplCount}칸 (${tpl.rows}×${tpl.cols})` : '아직 저장된 기본형이 없어요. 장소 모양을 한 번 만들어 저장해 두면 다음 일정에서 바로 불러와요.'),
        h(
          'div',
          { class: 'row gap wrap' },
          h(
            'button',
            {
              class: 'btn small',
              disabled: !tpl,
              onclick: async () => {
                if (Object.keys(L.cells).length && !(await UI.confirm('지금 칸 모양을 장소 기본형으로 바꿀까요? (배치된 농가는 남는 부스 칸에 그대로 둬요)', { okText: '불러오기' }))) return;
                pushHistory();
                L.rows = tpl.rows;
                L.cols = tpl.cols;
                L.cells = FM.clone(tpl.cells);
                L.numbering = tpl.numbering || 'row';
                changed();
              },
            },
            '📥 기본형 불러오기'
          ),
          h(
            'button',
            {
              class: 'btn small',
              disabled: !Object.keys(L.cells).length,
              onclick: async () => {
                if (tpl && !(await UI.confirm(`「${venue.name}」 기본형을 지금 모양으로 덮어쓸까요?`, { okText: '저장' }))) return;
                venue.template = { rows: L.rows, cols: L.cols, cells: FM.clone(L.cells), numbering: L.numbering || 'row' };
                App().changed();
                renderSide();
                UI.toast(`「${venue.name}」 기본형으로 저장했어요.`, 'ok');
              },
            },
            '💾 지금 모양을 기본형으로 저장'
          )
        )
      )
    );

    side.appendChild(section('다른 날짜에서 모양 복사', h('button', { class: 'btn small', onclick: () => openCopyDialog('cells') }, '📋 다른 날·다른 일정의 칸 모양 가져오기')));

    side.appendChild(
      section(
        '부스 번호 순서',
        h(
          'div',
          { class: 'segs' },
          [
            ['row', '가로 먼저 →'],
            ['col', '세로 먼저 ↓'],
          ].map(([v, t]) =>
            h(
              'button',
              {
                class: 'seg' + ((L.numbering || 'row') === v ? ' on' : ''),
                onclick: () => {
                  L.numbering = v;
                  changed();
                },
              },
              t
            )
          )
        )
      )
    );
    side.appendChild(
      section(
        null,
        h(
          'button',
          {
            class: 'btn danger small',
            onclick: async () => {
              if (!(await UI.confirm('모든 칸과 배치를 지울까요? (되돌리기 가능)', { danger: true, okText: '모두 지우기' }))) return;
              pushHistory();
              L.cells = {};
              L.assign = {};
              L.pins = {};
              changed();
            },
          },
          '🗑 모든 칸 지우기'
        )
      )
    );
    side.appendChild(nextBtn('다음: ③ 농가 배치 →', 'assign'));
  }

  /** 방향 붓: 방향 고르기 + 같은 줄 한 번에 */
  function dirPicker() {
    const u = ui();
    const pick = u.dirPick === undefined ? 'd' : u.dirPick;
    const btn = (d, label) =>
      h(
        'button',
        {
          class: 'dir-btn' + (pick === d ? ' on' : ''),
          title: d ? `앞면(손님 쪽)을 ${FM.DIR_LABEL[d]}으로` : '방향 지우기',
          onclick: () => {
            u.dirPick = d;
            renderSide();
          },
        },
        label
      );
    return h(
      'div',
      { class: 'dir-pick' },
      h(
        'div',
        { class: 'dir-pad' },
        h('span'),
        btn('u', '▲ 위'),
        h('span'),
        btn('l', '◀ 왼쪽'),
        btn(null, '없음'),
        btn('r', '오른쪽 ▶'),
        h('span'),
        btn('d', '▼ 아래'),
        h('span')
      ),
      h(
        'label',
        { class: 'check small' },
        h('input', {
          type: 'checkbox',
          checked: u.dirWhole !== false,
          onchange: (e) => (u.dirWhole = e.target.checked),
        }),
        '같은 줄 전체를 한 번에 (부스 하나만 클릭해도 그 줄이 모두 바뀜)'
      ),
      h('p', { class: 'muted small' }, '부스 앞면 = 손님이 서는 쪽이에요. 방향을 고른 뒤 부스를 클릭하거나, 누른 채로 여러 줄을 지나가면 한꺼번에 바뀌어요. 통로를 사이에 두고 앞면끼리 마주 보면 「마주봄」으로 보고 비슷한 품목을 떨어뜨려요.')
    );
  }

  /** 부스 방향 요약 + 자동 설정 */
  function directionSection() {
    const L = LY();
    const booths = Object.values(L.cells).filter((c) => c.t === 'b');
    const withDir = booths.filter((c) => c.dir).length;
    const manual = booths.filter((c) => c.dir && !c.da).length;
    const counts = {};
    for (const c of booths) if (c.dir) counts[c.dir] = (counts[c.dir] || 0) + 1;
    return section(
      '부스 방향 (마주봄 판단용)',
      h(
        'p',
        { class: 'small' },
        booths.length ? `방향 있음 ${withDir}/${booths.length}칸` : '부스 칸이 없어요',
        manual ? ` · 직접 정함 ${manual}칸` : '',
        withDir ? ' · ' + FM.DIRS.filter((d) => counts[d]).map((d) => `${FM.DIR_ARROW[d]} ${counts[d]}`).join('  ') : ''
      ),
      h(
        'div',
        { class: 'row gap wrap' },
        h(
          'button',
          {
            class: 'btn small',
            disabled: !booths.length,
            onclick: () => {
              pushHistory();
              const n = FM.autoDirections(L, 'all');
              changed();
              UI.toast(`모든 부스 방향을 자동으로 정했어요 (${n}칸 바뀜). 통로 쪽을 앞면으로 봐요.`, 'ok');
            },
          },
          '🧭 전부 자동으로 정하기'
        ),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () => {
              ui().brush = 'd';
              renderSide();
            },
          },
          '➜ 방향 붓으로 고치기'
        )
      ),
      h('p', { class: 'muted small' }, '칸을 그리면 앞이 트인 쪽(통로 건너 다른 줄이 있으면 그쪽)을 앞면으로 자동으로 정해요. 직접 정한 방향은 그대로 둬요.')
    );
  }

  function shiftLayout(L, dr, dc) {
    const cells = {};
    const assign = {};
    for (const [k, v] of Object.entries(L.cells)) {
      const [r, c] = FM.parseKey(k);
      cells[FM.cellKey(r + dr, c + dc)] = v;
    }
    for (const [k, v] of Object.entries(L.assign)) {
      const [r, c] = FM.parseKey(k);
      assign[FM.cellKey(r + dr, c + dc)] = v;
    }
    L.cells = cells;
    L.assign = assign;
    L.rows = Math.min(MAXG(), L.rows + dr);
    L.cols = Math.min(MAXG(), L.cols + dc);
  }
  function trimLayout(L) {
    const b = FM.Excel.layoutBounds(L);
    if (!b) return;
    // 위·왼쪽 2칸, 아래·오른쪽 3칸 여유만 남기고 줄임
    shiftLayout(L, 2 - b.minR, 2 - b.minC);
    L.rows = b.maxR - b.minR + 1 + 2 + FM.GRID.margin;
    L.cols = b.maxC - b.minC + 1 + 2 + FM.GRID.margin;
  }

  // ---------------------------------------------------------- ③ 농가 배치 ---
  function sideAssign(side) {
    const L = LY();
    const u = ui();
    const st = ST();
    const hasBooths = Object.values(L.cells).some((c) => c.t === 'b');
    if (!hasBooths) {
      side.appendChild(
        section(
          '먼저 칸을 만들어 주세요',
          h('p', null, '배치할 부스 칸이 없어요. 왼쪽 위 버튼으로 다른 날 배치를 가져오거나 칸을 만들어 주세요.'),
          h('button', { class: 'btn small', onclick: () => openCopyDialog('full') }, '↔ 다른 날·다른 일정 배치 가져오기'),
          nextBtn('② 칸 만들기로 가기', 'edit')
        )
      );
      return;
    }
    const pinCount = Object.keys(L.pins).length;
    side.appendChild(
      section(
        '자동 배치',
        h('button', { class: 'btn primary block big', onclick: () => runAuto('all') }, '⚡ 자동 배치'),
        h('p', { class: 'muted small' }, `📌고정 농가(${pinCount}곳)는 그대로 두고, 나머지를 비슷한 품목이 붙지 않게 놓아요. 누를 때마다 새로운 배치안이 나와요.`),
        h(
          'div',
          { class: 'row gap wrap' },
          h('button', { class: 'btn small', title: '지금 배치는 그대로 두고 미배치 농가만 빈 칸에 넣어요', onclick: () => runAuto('fill') }, '＋ 빈 자리만 채우기'),
          h('button', { class: 'btn small', title: '최소한만 옮겨서 위험·주의 자리를 해소해요', onclick: () => runAuto('fix') }, '🩹 문제 자리만 고치기')
        ),
        h(
          'div',
          { class: 'row gap wrap' },
          h(
            'button',
            {
              class: 'btn small ghost',
              onclick: async () => {
                if (!(await UI.confirm('고정📌 농가만 남기고 배치를 비울까요?', { okText: '비우기' }))) return;
                pushHistory();
                for (const [k, fid] of Object.entries(L.assign)) if (!L.pins[fid]) delete L.assign[k];
                changed();
              },
            },
            '🧹 배치 비우기(고정 제외)'
          ),
          h(
            'button',
            {
              class: 'btn small ghost',
              disabled: !pinCount,
              onclick: () => {
                pushHistory();
                L.pins = {};
                changed();
                UI.toast('고정을 모두 풀었어요.');
              },
            },
            '📌 고정 모두 해제'
          ),
          h('button', { class: 'btn small ghost', onclick: () => openCopyDialog('full') }, '↔ 다른 날 배치 가져오기')
        ),
        h(
          'label',
          { class: 'check small' },
          h('input', {
            type: 'checkbox',
            checked: st.autoPin,
            onchange: (e) => {
              st.autoPin = e.target.checked;
              App().changed();
            },
          }),
          '손으로 옮긴 농가는 자동으로 📌고정'
        ),
        h(
          'label',
          { class: 'check small' },
          h('input', {
            type: 'checkbox',
            checked: st.liveLines,
            onchange: (e) => {
              st.liveLines = e.target.checked;
              App().changed();
              renderGrid();
            },
          }),
          '이 화면에서도 검수 선 보기'
        )
      )
    );

    if (u.armedFarmId && C.farmById[u.armedFarmId]) {
      const f = C.farmById[u.armedFarmId];
      const cur = C.cellOf[f.id];
      side.appendChild(
        h(
          'div',
          { class: 'banner' },
          h('span', null, `👉 「${FM.shortName(f.name)}」${cur ? `(지금 ${C.nums[cur]}번)` : ''}을(를) 놓을 칸을 격자에서 클릭하세요.`),
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                u.armedFarmId = null;
                renderGrid();
                renderSide();
              },
            },
            '취소'
          )
        )
      );
    }
    if (u.swapFrom) {
      side.appendChild(
        h(
          'div',
          { class: 'banner' },
          h('span', null, `⇄ ${C.nums[u.swapFrom]}번과 바꿀 칸을 격자에서 클릭하세요.`),
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                u.swapFrom = null;
                renderGrid();
                renderSide();
              },
            },
            '취소'
          )
        )
      );
    }

    const card = selectedCard();
    if (card) side.appendChild(card);
    side.appendChild(farmListSection());
    side.appendChild(nextBtn('다음: ④ 검수 →', 'inspect'));
  }

  function selectedCard() {
    const L = LY();
    const u = ui();
    const k = u.selectedKey;
    if (!k || !L.cells[k] || L.cells[k].t !== 'b') return null;
    const f = C.farmById[L.assign[k]];
    const no = C.nums[k];
    const attending = FM.attendingFarms(C.ev, C.day);
    const pickInput = h('input', { class: 'input', list: 'farm-pick-list', placeholder: f ? '다른 농가로 바꾸기 (이름 입력)' : '이 자리에 넣을 농가 (이름 입력)' });
    const pickList = h(
      'datalist',
      { id: 'farm-pick-list' },
      attending.filter((x) => !f || x.id !== f.id).map((x) => h('option', { value: x.name }, (C.cellOf[x.id] ? C.nums[C.cellOf[x.id]] + '번 · ' : '미배치 · ') + (x.category || '')))
    );
    const doPick = () => {
      const name = pickInput.value.trim();
      const t = attending.find((x) => x.name === name) || attending.find((x) => FM.normName(x.name) === FM.normName(name));
      if (!t) return UI.toast('명단에서 그 농가를 찾지 못했어요.', 'warn');
      pushHistory();
      placeFarm(t.id, k);
      changed();
      UI.toast(`${FM.shortName(t.name)} → ${no}번 자리` + (ST().autoPin ? ' 📌고정' : ''), 'ok');
    };
    pickInput.addEventListener('change', doPick);
    const pick = h('div', { class: 'row gap' }, pickInput, pickList);

    if (!f) {
      return h(
        'section',
        { class: 'side-sec sel-card' },
        h('div', { class: 'sel-head' }, h('b', null, `${no}번 부스`), h('span', { class: 'muted' }, '빈 자리')),
        pick,
        h('p', { class: 'muted small' }, '아래 목록에서 농가를 끌어다 놓거나, 농가를 클릭한 뒤 이 칸을 클릭해도 돼요.')
      );
    }
    const pinned = !!L.pins[f.id];
    const col = FM.catColor(f.category);
    const conflicts = C.insp.pairs.filter((p) => p.a.key === k || p.b.key === k);
    return h(
      'section',
      { class: 'side-sec sel-card', style: { borderColor: col.bd } },
      h('div', { class: 'sel-head' }, h('b', null, `${no}번 부스`), pinned ? h('span', { class: 'badge b-pin' }, '📌 고정됨') : null),
      h('div', { class: 'sel-name' }, f.name),
      h('div', { class: 'muted small' }, [f.owner, f.phone].filter(Boolean).join(' · ')),
      h('div', { class: 'sel-items' }, f.category ? h('span', { class: 'cat-chip', style: { background: col.bg, borderColor: col.bd } }, f.category) : null, ' ', f.items),
      (f.tags || []).length || (f.forms || []).length
        ? h('div', null, (f.tags || []).map((t) => h('span', { class: 'tag raw', title: '원재료' }, t)), (f.forms || []).map((t) => h('span', { class: 'tag form', title: '제품 형태' }, t)))
        : null,
      L.cells[k].dir ? h('div', { class: 'muted small' }, `부스 앞면: ${FM.DIR_ARROW[L.cells[k].dir]} ${FM.DIR_LABEL[L.cells[k].dir]}쪽`) : null,
      h(
        'div',
        { class: 'row gap wrap' },
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              pushHistory();
              if (pinned) delete L.pins[f.id];
              else L.pins[f.id] = true;
              changed();
            },
          },
          pinned ? '📌 고정 풀기' : '📌 이 자리에 고정'
        ),
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              ui().swapFrom = k;
              ui().armedFarmId = null;
              renderGrid();
              renderSide();
            },
          },
          '⇄ 다른 자리와 교체'
        ),
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              pushHistory();
              unassign(k);
              changed();
            },
          },
          '자리 비우기'
        ),
        h('button', { class: 'btn small ghost', onclick: () => App().openFarmEditor(C.ev, f) }, '✏️ 정보 수정')
      ),
      pick,
      conflicts.length
        ? h(
            'div',
            { class: 'mini-conf' },
            h('small', null, '가까이 있는 비슷한 품목'),
            conflicts.map((p) => {
              const o = p.a.key === k ? p.b : p.a;
              return h('div', { class: 'conf-mini lv-' + p.level }, h('span', { class: 'lvl' }, FM.LEVEL_LABEL[p.level]), ` ${C.nums[o.key]}번 ${FM.shortName(o.farm.name)} · ${p.distLabel} · ${FM.Excel.reasonText(p)}`);
            })
          )
        : h('p', { class: 'ok-text small' }, '✓ 가까이에 비슷한 품목이 없어요')
    );
  }

  function farmListSection() {
    const u = ui();
    const L = LY();
    const attending = FM.attendingFarms(C.ev, C.day);
    const counts = {
      all: attending.length,
      unplaced: attending.filter((f) => !C.cellOf[f.id]).length,
      pinned: attending.filter((f) => L.pins[f.id]).length,
    };
    const listBox = h('div', { class: 'farm-list farm-list-drop' });
    const drawList = () => {
      UI.clear(listBox);
      const q = (u.search || '').trim().toLowerCase();
      const rows = attending.filter((f) => {
        if (u.listFilter === 'unplaced' && C.cellOf[f.id]) return false;
        if (u.listFilter === 'pinned' && !L.pins[f.id]) return false;
        if (!q) return true;
        return [f.name, f.owner, f.items, f.category, (f.tags || []).join(' '), (f.forms || []).join(' ')].join(' ').toLowerCase().includes(q);
      });
      rows.sort((a, b) => (C.cellOf[a.id] ? 1 : 0) - (C.cellOf[b.id] ? 1 : 0) || (C.nums[C.cellOf[a.id]] || 0) - (C.nums[C.cellOf[b.id]] || 0));
      if (!rows.length) listBox.appendChild(h('p', { class: 'muted small center' }, q ? '검색 결과가 없어요.' : '해당하는 농가가 없어요.'));
      for (const f of rows) {
        const k = C.cellOf[f.id];
        const col = FM.catColor(f.category);
        listBox.appendChild(
          h(
            'div',
            {
              class: 'farm-item' + (u.armedFarmId === f.id ? ' armed' : '') + (k ? '' : ' unplaced'),
              'data-fid': f.id,
              title: `${f.name}\n${f.category} · ${f.items}\n끌어서 칸에 놓거나, 클릭 후 칸을 클릭하세요.`,
              onpointerdown: (e) => {
                if (e.button !== 0) return;
                startDrag(e, { farmId: f.id });
              },
            },
            h('span', { class: 'dot', style: { background: col.mid, borderColor: col.bd } }),
            h('div', { class: 'fi-main' }, h('div', { class: 'fi-name' }, FM.shortName(f.name)), h('div', { class: 'fi-sub' }, (f.category || '') + ' · ' + f.items)),
            h('span', { class: 'fi-status' + (k ? '' : ' un') }, k ? (L.pins[f.id] ? '📌' : '') + C.nums[k] + '번' : '미배치')
          )
        );
      }
    };
    const search = h('input', {
      class: 'input search',
      type: 'search',
      placeholder: '🔍 농가·품목 검색 (격자에서도 표시돼요)',
      value: u.search,
      oninput: (e) => {
        u.search = e.target.value;
        drawList();
        renderGrid();
      },
    });
    const chip = (key, label) =>
      h(
        'button',
        {
          class: 'chip-btn' + (u.listFilter === key ? ' on' : ''),
          onclick: () => {
            u.listFilter = key;
            renderSide();
          },
        },
        `${label} ${counts[key]}`
      );
    drawList();
    return h(
      'section',
      { class: 'side-sec list-sec' },
      h('h4', null, '농가 찾기 · 자리 지정'),
      search,
      h('div', { class: 'chips' }, chip('all', '전체'), chip('unplaced', '미배치'), chip('pinned', '📌고정')),
      h('p', { class: 'muted small' }, '농가를 클릭 → 원하는 칸 클릭 = 그 자리에 📌고정. 칸의 농가를 이 목록으로 끌어오면 자리에서 빠져요.'),
      listBox
    );
  }

  // ---------------------------------------------------------------- ④ 검수 ---
  function sideInspect(side) {
    const st = ST();
    const ins = C.insp;
    const u = ui();
    if (!ins.placed) {
      side.appendChild(section('아직 배치된 농가가 없어요', nextBtn('③ 농가 배치로 가기', 'assign')));
      return;
    }
    const g = ins.grade;
    side.appendChild(
      h(
        'section',
        { class: 'side-sec grade-card g-' + g.g },
        h('div', { class: 'grade-big' }, g.g),
        h(
          'div',
          null,
          h('div', { class: 'grade-label' }, g.label),
          h('div', { class: 'small' }, `분산 점수 ${ins.score}점 `, h('span', { class: 'muted' }, '(무작위 배치 대비, 100 = 근접 없음)')),
          h('div', { class: 'row gap wrap lvl-chips' }, h('span', { class: 'lvl-chip lv-danger' }, `위험 ${ins.counts.danger}`), h('span', { class: 'lvl-chip lv-warn' }, `주의 ${ins.counts.warn}`), h('span', { class: 'lvl-chip lv-info' }, `참고 ${ins.counts.info}`))
        )
      )
    );
    const rs = ins.rawStats;
    if (rs)
      side.appendChild(
        section(
          '같은 원재료 농가끼리 거리',
          h(
            'div',
            { class: 'raw-stats' },
            h('div', null, h('small', null, '가장 가까운'), h('b', { class: rs.min <= 1 ? 'bad' : rs.min <= 2 ? 'warn' : 'good' }, rs.facing && rs.min <= 1 ? '마주봄' : `${Math.round(rs.min * 10) / 10}칸`)),
            h('div', null, h('small', null, '평균'), h('b', null, `${Math.round(rs.avg * 10) / 10}칸`)),
            h('div', null, h('small', null, '2칸 이내'), h('b', { class: rs.within2 ? 'warn' : 'good' }, `${rs.within2}쌍`)),
            h('div', null, h('small', null, '마주봄'), h('b', { class: rs.facing ? 'bad' : 'good' }, `${rs.facing}쌍`))
          ),
          h(
            'button',
            { class: 'link-btn small', onclick: () => setHighlight({ a: rs.minPair.a.key, b: rs.minPair.b.key }) || scrollToCell(rs.minPair.a.key) },
            `가장 가까운 쌍: ${C.nums[rs.minPair.a.key]}번 ${FM.shortName(rs.minPair.a.farm.name)} ↔ ${C.nums[rs.minPair.b.key]}번 ${FM.shortName(rs.minPair.b.farm.name)} (${rs.minPair.rel.label})`
          ),
          h('p', { class: 'muted small' }, `원재료가 같은 ${rs.pairs}쌍 기준 (쌀·소금처럼 흔한 재료만 겹치는 쌍은 제외). 자동 배치는 이 거리를 최대한 벌려요.`)
        )
      );
    side.appendChild(
      section(
        null,
        h(
          'details',
          { class: 'explain' },
          h('summary', null, '레벨은 어떻게 정하나요?'),
          h(
            'ul',
            { class: 'small' },
            h('li', null, `유사도 = 같은 원재료 +${st.wRaw} (결과물이 달라도: 포도↔와인, 참깨↔참기름) · 같은 계열 +일부 (블루베리↔아로니아) · 같은 형태 +${st.wForm} (즙·청·떡·젓갈…) · 같은 품목군 +${st.wCat}`),
            h('li', null, `거리 = 1/칸 수 (바로 옆 1 · 대각선 0.71 · 2칸 0.5 · 3칸 0.33 …, ${st.radius >= 99 ? '전체' : st.radius + '칸'}까지 계산)`),
            h('li', null, '마주봄 = 통로 건너 앞면끼리 정면이면 1 (바로 옆과 같음), 비껴서 0.75 · 등 맞댐은 0.4배로 약하게'),
            h('li', null, `근접 위험도 = 유사도 × 거리 → 위험 ≥ ${FM.LEVELS.danger} · 주의 ≥ ${FM.LEVELS.warn} · 참고 ≥ ${FM.LEVELS.info}`),
            h('li', null, '예) 같은 원재료가 바로 옆·마주봄·대각선 = 위험, 2칸 거리 = 주의, 3~4칸 = 참고')
          )
        )
      )
    );
    const sel = (label, key, opts) =>
      h(
        'label',
        { class: 'field inline' },
        h('span', null, label),
        h(
          'select',
          {
            class: 'input',
            onchange: (e) => {
              st[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value;
              App().changed();
              refresh();
            },
          },
          opts.map(([v, t]) => h('option', { value: v, selected: st[key] === v }, t))
        )
      );
    side.appendChild(
      section(
        '선 표시',
        sel('선으로 이을 쌍', 'lineScope', [
          ['warn', '위험·주의만 (기본)'],
          ['info', '참고까지'],
          ['tag', '원재료·형태가 겹치면 모두'],
          ['all', '같은 품목군까지 모두'],
        ]),
        st.lineScope === 'tag' || st.lineScope === 'all'
          ? sel('거리 기준', 'lineDist', [
              [1, '바로 옆만'],
              [1.5, '대각선까지'],
              [2.3, '한 칸 건너까지'],
              [3.2, '두 칸 건너까지'],
            ])
          : null,
        sel('선 색', 'lineColorBy', [
          ['group', '품목별로 다른 색'],
          ['cluster', '붙어 있는 묶음별로 다른 색'],
        ]),
        h(
          'label',
          { class: 'check small' },
          h('input', {
            type: 'checkbox',
            checked: st.heatmap,
            onchange: (e) => {
              st.heatmap = e.target.checked;
              App().changed();
              renderGrid();
            },
          }),
          '근접도가 높은 칸을 빨간 테두리로 표시'
        ),
        ins.legend.length
          ? h(
              'div',
              { class: 'legend' },
              ins.legend.map((l) =>
                h(
                  'div',
                  { class: 'legend-row' },
                  h('span', { class: 'legend-line' + (l.kind === 'form' ? ' dashed' : l.kind === 'cat' ? ' dotted' : ''), style: { borderColor: l.color } }),
                  h('span', null, l.label),
                  h('b', null, l.count)
                )
              ),
              h('p', { class: 'muted small' }, '실선 = 같은 원재료·계열, 긴 점선 = 같은 형태, 짧은 점선 = 같은 품목군만. 굵을수록 가깝거나 마주 봐요.')
            )
          : h('p', { class: 'ok-text' }, '✓ 선으로 이을 만큼 가까운 유사 품목이 없어요')
      )
    );
    side.appendChild(
      section(
        '고치기',
        h('div', { class: 'row gap wrap' }, h('button', { class: 'btn small primary', onclick: () => runAuto('fix') }, '🩹 문제 자리만 고치기'), h('button', { class: 'btn small', onclick: () => runAuto('all') }, '⚡ 전체 다시 배치'), h('button', { class: 'btn small ghost', onclick: () => App().goLayout(C.ev, C.day.id, 'assign') }, '✋ 손으로 고치기')),
        h('p', { class: 'muted small' }, '「문제 자리만 고치기」는 지금 배치를 최대한 유지하면서 몇 곳만 옮겨요. 📌고정 농가는 움직이지 않아요.')
      )
    );

    let pairs = ins.pairs;
    const focus = u.selectedKey;
    if (focus) pairs = pairs.filter((p) => p.a.key === focus || p.b.key === focus);
    const listBox = h(
      'div',
      { class: 'conf-list' },
      pairs.length
        ? pairs.slice(0, 120).map((p) =>
            h(
              'div',
              {
                class: 'conf lv-' + p.level + (C.hl && C.hl.a === p.a.key && C.hl.b === p.b.key ? ' on' : ''),
                onmouseenter: () => setHighlight({ a: p.a.key, b: p.b.key }),
                onmouseleave: () => setHighlight(focus ? { cell: focus } : null),
                onclick: () => scrollToCell(p.a.key),
              },
              h('span', { class: 'lvl' }, FM.LEVEL_LABEL[p.level]),
              h('div', null, h('div', null, h('b', null, `${C.nums[p.a.key]}번`), ` ${FM.shortName(p.a.farm.name)} ↔ `, h('b', null, `${C.nums[p.b.key]}번`), ` ${FM.shortName(p.b.farm.name)}`), h('div', { class: 'muted small' }, `${p.distLabel} · ${FM.Excel.reasonText(p)}`))
            )
          )
        : h('p', { class: 'ok-text' }, focus ? '✓ 이 부스 주변에는 비슷한 품목이 없어요' : '🎉 가까이 붙은 비슷한 품목이 없어요')
    );
    side.appendChild(
      section(
        focus ? `${C.nums[focus]}번 부스 주변` : `가까이 붙은 유사 품목 (${ins.pairs.length})`,
        focus
          ? h(
              'button',
              {
                class: 'btn small ghost',
                onclick: () => {
                  u.selectedKey = null;
                  C.hl = null;
                  refresh();
                },
              },
              '전체 목록 보기'
            )
          : h('p', { class: 'muted small' }, '줄에 마우스를 올리면 격자에서 두 농가가 강조돼요. 칸을 클릭하면 그 부스 주변만 보여요.'),
        listBox
      )
    );
    side.appendChild(nextBtn('다음: ⑤ 저장·출력 →', 'export'));
  }

  function scrollToCell(key) {
    const el = C.els.grid.querySelector(`.cell[data-k="${key}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  // ========================================================== 다른 날 복사 ===
  /** srcDay 의 칸 모양/자리를 지금 날짜로 복사. 같은 자리에 놓은 농가 수를 돌려줌 */
  function copyFrom(srcEv, srcDay, opts) {
    const src = srcDay.layout;
    const L = LY();
    if (opts.cells) {
      L.rows = src.rows;
      L.cols = src.cols;
      L.cells = FM.clone(src.cells);
      L.numbering = src.numbering || 'row';
      if (opts.seats) {
        L.assign = {};
        L.pins = {};
      }
    }
    let matched = 0;
    if (opts.seats) {
      const attending = FM.attendingFarms(C.ev, C.day);
      const srcFarms = Object.fromEntries(srcEv.farms.map((f) => [f.id, f]));
      const already = new Set(Object.values(L.assign));
      for (const [k, sfid] of Object.entries(src.assign)) {
        const sf = srcFarms[sfid];
        if (!sf || !L.cells[k] || L.cells[k].t !== 'b') continue;
        const t = srcEv === C.ev ? attending.find((f) => f.id === sfid) : attending.find((f) => FM.isSameFarm(f, sf));
        if (!t || already.has(t.id)) continue;
        if (L.assign[k]) {
          if (L.pins[L.assign[k]]) continue;
          already.delete(L.assign[k]);
        }
        L.assign[k] = t.id;
        already.add(t.id);
        if (opts.pin) L.pins[t.id] = true;
        matched++;
      }
    }
    return matched;
  }

  function openCopyDialog(kind) {
    const venueId = C.ev.venueId;
    const opts = { cells: true, seats: kind === 'full', pin: kind === 'full' };
    const items = [];
    for (const ev of App().sortedEvents()) {
      for (const d of ev.days) {
        if (d === C.day) continue;
        const booths = Object.values(d.layout.cells).filter((c) => c.t === 'b').length;
        if (!booths) continue;
        items.push({ ev, d, booths, placed: Object.keys(d.layout.assign).length, same: ev.venueId === venueId });
      }
    }
    if (!items.length) return UI.toast('칸이 만들어진 다른 날짜가 없어요.', 'warn');
    items.sort((a, b) => (b.ev === C.ev) - (a.ev === C.ev) || b.same - a.same);
    let chosen = items[0];
    let m = null;
    const body = h('div', { class: 'copy-dlg' });
    const draw = () => {
      UI.clear(body);
      body.appendChild(
        h(
          'div',
          { class: 'pick-list' },
          items.map((it) =>
            h(
              'button',
              {
                class: 'pick-item' + (it === chosen ? ' on' : ''),
                onclick: () => {
                  chosen = it;
                  draw();
                },
              },
              h('span', { class: 'venue-dot', style: { background: App().venue(it.ev.venueId).color } }),
              h('strong', null, `${App().venue(it.ev.venueId).short} ${it.ev.title} · ${FM.weekday(it.d.date)} ${FM.fmtDay(it.d.date)}`),
              h('span', { class: 'muted' }, `부스 ${it.booths}칸 · 배치 ${it.placed}곳`)
            )
          )
        )
      );
      const ck = (key, label) =>
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: opts[key],
            onchange: (e) => {
              opts[key] = e.target.checked;
            },
          }),
          label
        );
      body.appendChild(h('div', { class: 'opts' }, ck('cells', '칸 모양도 함께 가져오기 (지금 칸 모양은 바뀌어요)'), ck('seats', '같은 농가는 같은 자리에 놓기 (이 날 참여하는 농가만)'), ck('pin', '가져온 자리는 📌고정')));
    };
    draw();
    const apply = () => {
      pushHistory();
      const matched = copyFrom(chosen.ev, chosen.d, opts);
      m.close();
      changed();
      const un = FM.attendingFarms(C.ev, C.day).length - Object.keys(LY().assign).length;
      UI.toast((opts.cells ? '칸 모양을 가져왔어요. ' : '') + (opts.seats ? `같은 농가 ${matched}곳을 같은 자리에 놓았어요.` : '') + (opts.seats && un > 0 ? ` 남은 ${un}곳은 「빈 자리만 채우기」로 배치하세요.` : ''), 'ok', 5000);
    };
    m = UI.modal({
      title: kind === 'cells' ? '다른 날짜의 칸 모양 가져오기' : '다른 날짜의 배치 가져오기',
      body,
      width: '620px',
      autofocus: false,
      footer: [h('button', { class: 'btn', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', onclick: apply }, '가져오기')],
    });
  }
})(window);
