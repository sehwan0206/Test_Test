// 핵심 로직 테스트:  npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const js = (f) => path.join(__dirname, '..', 'src', 'js', f);
require(js('dictionary.js'));
require(js('core.js'));
require(js('similarity.js'));
require(js('optimizer.js'));
require(js('sample-data.js'));
const FM = globalThis.FM;
const ST = FM.clone(FM.DEFAULT_SETTINGS);

const ex = (items) => FM.Sim.extract(items, ST);
const raw = (items) => ex(items).raw;
const farm = (category, items) => {
  const x = ex(items);
  return { category, items, tags: x.raw, forms: x.forms };
};

// ------------------------------------------------------------------ 품목 분석 ---
test('원재료: 결과물이 달라도 원재료가 같으면 같은 태그', () => {
  assert.ok(raw('와인, 증류주, 뱅쇼').includes('포도'));
  assert.ok(raw('포도, 포도즙').includes('포도'));
  assert.ok(raw('머루발사믹식초').includes('포도'));
  assert.ok(raw('생들기름, 볶은참기름').includes('참깨') && raw('생들기름').includes('들깨'));
  assert.ok(raw('오미자식초드레싱').includes('오미자'));
  assert.ok(raw('곰취떡, 곰취만두').includes('산나물'));
  assert.ok(raw('식혜(4종)').includes('식혜·엿기름'));
});

test('원재료: 괄호 안 재료도 원재료로 본다', () => {
  assert.deepStrictEqual(raw('침출차(작두콩,여주,비트,돼지감자)').sort(), ['돼지감자', '비트', '여주', '작두콩'].sort());
  assert.ok(raw('오골계 파우치(구기자 삼계탕)').includes('구기자'));
  assert.ok(raw('즉석조리식품(곤드레밥, 새우밥)').includes('새우'));
});

test('원재료: 헷갈리기 쉬운 단어를 잘못 잡지 않는다', () => {
  assert.ok(!raw('옥수수').includes('잡곡')); // 옥수수 ≠ 수수
  assert.ok(!raw('알타리김치, 열무김치').includes('김')); // 김치 ≠ 김
  assert.ok(raw('곱창김, 김부각').includes('김'));
  assert.ok(!raw('고추장, 매실고추장소스').includes('고추'));
  assert.ok(!raw('명란젓, 백명란').includes('계란'));
  assert.ok(raw('청계란, 식용란').includes('계란'));
  assert.ok(!raw('밤꿀, 벚꽃꿀').includes('밤'));
  assert.ok(!raw('산마늘').includes('마') && !raw('산마늘').includes('마늘'));
  assert.ok(!raw('꾸지뽕잎').includes('오디·뽕'));
  assert.ok(!ex('로얄젤리').forms.includes('스낵·칩·젤리'));
  assert.ok(!ex('엿기름').forms.includes('기름'));
});

test('유사도: 같은 원재료 > 같은 형태 > 같은 품목군 > 무관', () => {
  const grape = farm('과실류', '포도, 포도즙');
  const wine = farm('가공식품류', '와인, 뱅쇼');
  const appleJuice = farm('과실류', '사과, 사과즙');
  const tteokA = farm('가공식품류', '인절미, 가래떡');
  const tteokB = farm('즉석식품류', '쑥설기, 송편');
  const jam = farm('가공식품류', '딸기잼');
  const mush = farm('특용·임산물류', '표고버섯');
  const sGrapeWine = FM.Sim.pair(grape, wine, ST);
  assert.deepStrictEqual(sGrapeWine.sharedRaw, ['포도']);
  assert.ok(sGrapeWine.s >= ST.wRaw);
  assert.ok(FM.Sim.pair(grape, appleJuice, ST).sharedForms.includes('즙·주스'));
  assert.ok(FM.Sim.pair(tteokA, tteokB, ST).sharedForms.includes('떡'));
  assert.ok(sGrapeWine.s > FM.Sim.pair(grape, appleJuice, ST).s);
  assert.strictEqual(FM.Sim.pair(tteokA, jam, ST).s, ST.wCat);
  assert.strictEqual(FM.Sim.pair(jam, mush, ST).s, 0);
});

// ----------------------------------------------------------- 방향·마주봄 ---
test('근접도: 통로 건너 마주보면 바로 옆과 같고, 등을 맞대면 약하다', () => {
  const st = ST;
  const side = FM.Sim.relation({ r: 1, c: 1, dir: 'd' }, { r: 1, c: 2, dir: 'd' }, st);
  const face = FM.Sim.relation({ r: 1, c: 1, dir: 'd' }, { r: 3, c: 1, dir: 'u' }, st);
  const faceDiag = FM.Sim.relation({ r: 1, c: 1, dir: 'd' }, { r: 3, c: 2, dir: 'u' }, st);
  const back = FM.Sim.relation({ r: 3, c: 1, dir: 'd' }, { r: 2, c: 1, dir: 'u' }, st);
  const noDir = FM.Sim.relation({ r: 1, c: 1 }, { r: 3, c: 1 }, st);
  assert.strictEqual(side.p, 1);
  assert.strictEqual(face.rel, 'face');
  assert.strictEqual(face.p, 1); // 2칸 떨어졌지만 마주봄 → 바로 옆과 같음
  assert.strictEqual(noDir.p, 0.5); // 방향 모르면 거리로만
  assert.ok(faceDiag.p >= 0.75 && faceDiag.rel === 'faceDiag');
  assert.strictEqual(back.rel, 'back');
  assert.ok(back.p < 0.5);
  assert.ok(face.label.includes('마주봄'));
});

test('부스 방향 자동 설정: 마주보는 두 줄은 서로를 향하고, ㅁ자는 안쪽을 향한다', () => {
  const g = FM.generateShape('lines', 20, 2);
  const rows = {};
  for (const [k, c] of Object.entries(g.cells)) rows[FM.parseKey(k)[0]] = c.dir;
  const [top, bottom] = Object.keys(rows).map(Number).sort((a, b) => a - b);
  assert.strictEqual(rows[top], 'd');
  assert.strictEqual(rows[bottom], 'u');
  const ring = FM.generateShape('ring', 24);
  const L = Object.assign(FM.emptyLayout(ring.rows, ring.cols), { cells: ring.cells });
  for (const k of Object.keys(L.cells)) delete L.cells[k].dir;
  FM.autoDirections(L, 'all');
  const b = { minR: Infinity, maxR: -1, minC: Infinity, maxC: -1 };
  for (const k of Object.keys(L.cells)) {
    const [r, c] = FM.parseKey(k);
    b.minR = Math.min(b.minR, r);
    b.maxR = Math.max(b.maxR, r);
    b.minC = Math.min(b.minC, c);
    b.maxC = Math.max(b.maxC, c);
  }
  const mid = Math.floor((b.minC + b.maxC) / 2);
  assert.strictEqual(L.cells[FM.cellKey(b.minR, mid)].dir, 'd'); // 위 줄 → 아래(안쪽)
  assert.strictEqual(L.cells[FM.cellKey(b.maxR, mid)].dir, 'u'); // 아래 줄 → 위(안쪽)
});

test('방향 붓: 한 칸만 눌러도 같은 줄 전체가 바뀌고, 직접 정한 방향은 자동 계산이 건드리지 않는다', () => {
  const g = FM.generateShape('lines', 20, 2);
  const L = Object.assign(FM.emptyLayout(g.rows, g.cols), { cells: g.cells });
  const anyTop = Object.keys(L.cells).find((k) => L.cells[k].dir === 'd');
  const keys = FM.setDirection(L, anyTop, 'u', true);
  assert.strictEqual(keys.length, 10);
  assert.ok(keys.every((k) => L.cells[k].dir === 'u' && !L.cells[k].da));
  FM.autoDirections(L); // 자동 방향만 다시 계산
  assert.ok(keys.every((k) => L.cells[k].dir === 'u'));
});

// ---------------------------------------------------------------- 칸 모양 ---
test('모양 프리셋은 요청한 칸 수를 정확히 만들고 방향도 정해 둔다', () => {
  for (const shape of ['lines', 'u', 'ring', 'block'])
    for (const n of [7, 23, 40, 61]) {
      const g = FM.generateShape(shape, n, 3);
      assert.strictEqual(Object.keys(g.cells).length, n, `${shape} ${n}`);
      for (const k of Object.keys(g.cells)) {
        const [r, c] = FM.parseKey(k);
        assert.ok(r >= 0 && c >= 0 && r < g.rows && c < g.cols);
      }
      if (shape !== 'block') assert.ok(Object.values(g.cells).every((c) => c.dir), `${shape} 방향`);
    }
});

test('격자는 넉넉하게: 기본 600칸, 예전 작은 빈 격자는 자동으로 늘어나고, 끝까지 칠하면 늘어난다', () => {
  const L = FM.emptyLayout();
  assert.ok(L.rows * L.cols >= 600, `${L.rows}×${L.cols}`);
  const st = FM.createDefaultState();
  st.events[0].days[0].layout = { rows: 8, cols: 14, cells: {}, assign: {}, pins: {} };
  const kept = { rows: 8, cols: 14, cells: { '1,1': { t: 'b' } }, assign: {}, pins: {} };
  st.events[0].days[1].layout = kept;
  FM.normalizeState(st);
  assert.deepStrictEqual([st.events[0].days[0].layout.rows, st.events[0].days[0].layout.cols], [FM.GRID.rows, FM.GRID.cols]);
  assert.deepStrictEqual([kept.rows, kept.cols], [8, 14]);
  const E = FM.emptyLayout();
  E.cells[FM.cellKey(E.rows - 1, E.cols - 1)] = { t: 'b' };
  assert.strictEqual(FM.ensureMargin(E), true);
  assert.strictEqual(E.rows, FM.GRID.rows + FM.GRID.margin);
  const big = FM.generateShape('lines', 120, 2);
  assert.ok(big.cols >= 60 + 2 + FM.GRID.margin);
});

test('이전 버전 데이터: 설정이 새 기준으로 바뀌고 품목 태그를 다시 계산하게 표시된다', () => {
  const st = FM.createDefaultState();
  st.settings = { wCat: 0.35, wTag: 0.65, radius: 2.3, keywords: '꿀·양봉: 꿀', zoom: 1.2 };
  st.events[0].farms.push(FM.newFarm({ name: 'x', items: '사과', tags: ['사과'], tagsManual: true }));
  FM.normalizeState(st);
  assert.strictEqual(st.settings.dictVersion, FM.DICT_VERSION);
  assert.strictEqual(st.settings.radius, 6);
  assert.strictEqual(st.settings.zoom, 1.2);
  assert.ok(!('keywords' in st.settings) && !('wTag' in st.settings));
  assert.strictEqual(st.events[0].farms[0].tagsManual, false);
});

// ---------------------------------------------------------------- 자동 배치 ---
function sampleFarms() {
  const farms = FM.SAMPLE_FARMS.map(([name, , , , category, items]) => FM.newFarm({ name, category, items }));
  FM.Sim.refreshTags(farms, ST);
  return farms;
}
function layoutOf(shape, n, lines) {
  const g = FM.generateShape(shape, n, lines);
  return Object.assign(FM.emptyLayout(g.rows, g.cols), { cells: g.cells });
}

test('자동 배치: 모두 한 번씩 배치, 위험 0, 같은 원재료끼리 마주보지 않음', () => {
  const farms = sampleFarms();
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const L = layoutOf('lines', farms.length, 2);
  const keys = FM.boothKeys(L);
  const res = FM.Opt.optimize({ cells: FM.Sim.boothCells(L, keys), S, N1, toPlace: farms.map((_, i) => i), fresh: true, st: ST, seed: 7 });
  const placed = [...res.assign].filter((x) => x >= 0);
  assert.strictEqual(new Set(placed).size, farms.length);
  keys.forEach((k, i) => (L.assign[k] = farms[res.assign[i]].id));
  const byId = Object.fromEntries(farms.map((f) => [f.id, f]));
  const insp = FM.Sim.inspect(L, byId, ST);
  assert.strictEqual(insp.counts.danger, 0);
  assert.ok(insp.total < insp.baseline * 0.6, `최적 ${insp.total.toFixed(2)} vs 무작위 ${insp.baseline.toFixed(2)}`);
  assert.strictEqual(insp.rawStats.facing, 0);
});

test('자동 배치: 고정 칸은 절대 움직이지 않는다', () => {
  const farms = sampleFarms();
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const L = layoutOf('lines', farms.length, 2);
  const cells = FM.Sim.boothCells(L);
  const initial = new Int32Array(cells.length).fill(-1);
  const fixed = new Uint8Array(cells.length);
  initial[0] = 0;
  initial[1] = 34; // 꿀 농가 두 곳을 일부러 붙여 고정
  fixed[0] = fixed[1] = 1;
  const toPlace = farms.map((_, i) => i).filter((i) => i !== 0 && i !== 34);
  const res = FM.Opt.optimize({ cells, S, N1, initial, fixed, toPlace, fresh: true, st: ST, seed: 3 });
  assert.strictEqual(res.assign[0], 0);
  assert.strictEqual(res.assign[1], 34);
});

test('자동 배치: 칸이 모자라면 남는 농가를 미배치로 알려준다', () => {
  const farms = sampleFarms();
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const L = layoutOf('block', 30);
  const res = FM.Opt.optimize({ cells: FM.Sim.boothCells(L), S, N1, toPlace: farms.map((_, i) => i), fresh: true, st: ST, seed: 1 });
  assert.strictEqual(res.unplaced.length, farms.length - 30);
});

test('문제 자리만 고치기: 마주보게 붙인 같은 원재료를 적은 이동으로 떼어 놓는다', () => {
  const farms = sampleFarms();
  const byId = Object.fromEntries(farms.map((f) => [f.id, f]));
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const L = layoutOf('lines', farms.length, 2);
  const keys = FM.boothKeys(L);
  const cells = FM.Sim.boothCells(L, keys);
  const good = FM.Opt.optimize({ cells, S, N1, toPlace: farms.map((_, i) => i), fresh: true, st: ST, seed: 11 });
  const A = Int32Array.from(good.assign);
  // 위 줄 첫 칸과 정면으로 마주 보는 아래 줄 칸에 꿀 농가 두 곳(0, 34)을 놓기
  const top = cells.findIndex((c) => c.dir === 'd');
  const opp = cells.findIndex((c) => c.dir === 'u' && c.c === cells[top].c);
  const swapIn = (pos, f) => {
    const cur = A.indexOf(f);
    const t = A[pos];
    A[pos] = f;
    A[cur] = t;
  };
  swapIn(top, 0);
  swapIn(opp, 34);
  keys.forEach((k, i) => (L.assign[k] = farms[A[i]].id));
  const before = FM.Sim.inspect(L, byId, ST);
  assert.ok(before.counts.danger >= 1);
  assert.ok(before.pairs.some((p) => p.rel === 'face' && p.sharedRaw.includes('꿀')));
  const res = FM.Opt.optimize({ cells, S, N1, initial: A, toPlace: [], fresh: false, anchorPenalty: 1, st: ST, seed: 5 });
  L.assign = {};
  keys.forEach((k, i) => (L.assign[k] = farms[res.assign[i]].id));
  assert.strictEqual(FM.Sim.inspect(L, byId, ST).counts.danger, 0);
  assert.ok(res.moved <= 10, `이동 ${res.moved}곳`);
});

// ---------------------------------------------------------------- 공유 파일 ---
test('공유용 HTML: 작업 데이터를 넣고 다시 꺼낼 수 있다 (</script> 포함 문자열도 안전)', () => {
  const st = FM.createDefaultState();
  st.events[0].farms.push(FM.newFarm({ name: '테스트</script><b>농가', items: '꿀' }));
  const html = '<html><body><script id="fm-embedded" type="application/json"></script><script>x()</script></body></html>';
  const out = FM.embedStateInHtml(html, st);
  const back = FM.parseWorkFile(out);
  assert.strictEqual(back.events[0].farms[0].name, '테스트</script><b>농가');
  assert.strictEqual(back.events.length, st.events.length);
});

test('기본 일정은 사진 일정표와 같고 모두 토·일이다', () => {
  const st = FM.createDefaultState();
  const byVenue = (id) => st.events.filter((e) => e.venueId === id).map((e) => e.days.map((d) => d.date).join('~'));
  assert.deepStrictEqual(byVenue('yangcheon'), ['2026-10-03~2026-10-04', '2026-10-24~2026-10-25', '2026-11-14~2026-11-15']);
  assert.deepStrictEqual(byVenue('ttukseom'), ['2026-10-10~2026-10-11', '2026-10-31~2026-11-01']);
  assert.deepStrictEqual(byVenue('hwarangdae'), ['2026-10-17~2026-10-18', '2026-11-07~2026-11-08']);
  for (const e of st.events) assert.deepStrictEqual(e.days.map((d) => FM.weekday(d.date)), ['토', '일']);
});
