// 핵심 로직 테스트:  node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const js = (f) => path.join(__dirname, '..', 'src', 'js', f);
require(js('core.js'));
require(js('similarity.js'));
require(js('optimizer.js'));
require(js('sample-data.js'));
const FM = globalThis.FM;
const ST = FM.clone(FM.DEFAULT_SETTINGS);

const tags = (items) => FM.Sim.extractTags(items, ST);

test('품목 태그: 괄호 안 품종 설명은 무시하고 대표 품목을 잡는다', () => {
  assert.deepStrictEqual(tags('사과(홍로, 감홍, 부사), 사과즙'), ['사과', '청·즙·진액']);
  assert.deepStrictEqual(tags('페스토(명이나물, 표고, 고사리, 고추)'), ['잼·소스']);
});

test('품목 태그: 헷갈리기 쉬운 단어를 잘못 잡지 않는다', () => {
  assert.deepStrictEqual(tags('야생화꿀, 꽃가루(화분), 로얄젤리, 밀랍'), ['꿀·양봉']); // 생화·젤리 오인 없음
  assert.ok(!tags('알타리김치, 열무김치').includes('김·해조류')); // 김치 ≠ 김
  assert.ok(tags('곱창김').includes('김·해조류'));
  assert.ok(!tags('고추장, 된장').includes('채소')); // 고추장 ≠ 고추
  assert.ok(!tags('명란젓').includes('계란')); // 명란 ≠ ~란
  assert.ok(tags('청계란').includes('계란'));
  assert.ok(!tags('간장게장').includes('장류'));
});

test('유사도: 공통 품목 > 같은 품목군 > 무관', () => {
  const f = (category, items) => ({ category, items, tags: tags(items) });
  const honeyA = f('가공식품류', '아카시아꿀, 로얄젤리');
  const honeyB = f('축산류', '벌꿀, 화분');
  const jam = f('가공식품류', '딸기잼');
  const mush = f('특용·임산물류', '표고버섯');
  assert.strictEqual(FM.Sim.pair(honeyA, honeyB, ST).s, ST.wTag); // 품목군은 달라도 꿀끼리
  assert.strictEqual(FM.Sim.pair(honeyA, jam, ST).s, ST.wCat);
  assert.strictEqual(FM.Sim.pair(honeyA, mush, ST).s, 0);
});

function sampleFarms() {
  const farms = FM.SAMPLE_FARMS.map(([name, owner, sido, sigungu, category, items]) => FM.newFarm({ name, category, items }));
  FM.Sim.refreshTags(farms, ST);
  return farms;
}
function cellsOf(L) {
  return FM.boothKeys(L).map((k) => {
    const [r, c] = FM.parseKey(k);
    return { r, c };
  });
}

test('모양 프리셋은 요청한 칸 수를 정확히 만든다', () => {
  for (const shape of ['lines', 'u', 'ring', 'block'])
    for (const n of [7, 23, 40, 61]) {
      const g = FM.generateShape(shape, n, 3);
      assert.strictEqual(Object.keys(g.cells).length, n, `${shape} ${n}`);
      for (const k of Object.keys(g.cells)) {
        const [r, c] = FM.parseKey(k);
        assert.ok(r >= 0 && c >= 0 && r < g.rows && c < g.cols);
      }
    }
});

test('자동 배치: 모든 농가를 한 번씩 배치하고, 무작위보다 충돌이 훨씬 적다', () => {
  const farms = sampleFarms();
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const g = FM.generateShape('block', farms.length);
  const L = Object.assign(FM.emptyLayout(g.rows, g.cols), { cells: g.cells });
  const cells = cellsOf(L);
  const res = FM.Opt.optimize({ cells, S, N1, toPlace: farms.map((_, i) => i), fresh: true, radius: ST.radius, vScale: 1, seed: 7 });
  const placed = [...res.assign].filter((x) => x >= 0);
  assert.strictEqual(placed.length, farms.length);
  assert.strictEqual(new Set(placed).size, farms.length);
  assert.deepStrictEqual(res.unplaced, []);

  const keys = FM.boothKeys(L);
  keys.forEach((k, i) => (L.assign[k] = farms[res.assign[i]].id));
  const byId = Object.fromEntries(farms.map((f) => [f.id, f]));
  const insp = FM.Sim.inspect(L, byId, ST);
  assert.ok(insp.total < insp.baseline * 0.5, `최적 ${insp.total.toFixed(2)} vs 무작위 ${insp.baseline.toFixed(2)}`);
  assert.strictEqual(insp.counts.danger, 0);
});

test('자동 배치: 고정 칸은 절대 움직이지 않는다', () => {
  const farms = sampleFarms();
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const g = FM.generateShape('lines', farms.length, 2);
  const cells = cellsOf(Object.assign(FM.emptyLayout(), { cells: g.cells }));
  const initial = new Int32Array(cells.length).fill(-1);
  const fixed = new Uint8Array(cells.length);
  initial[0] = 0; // 햇살양봉원(꿀)
  initial[1] = 34; // 벌꿀농원(꿀) — 일부러 바로 옆에 고정
  fixed[0] = fixed[1] = 1;
  const toPlace = farms.map((_, i) => i).filter((i) => i !== 0 && i !== 34);
  const res = FM.Opt.optimize({ cells, S, N1, initial, fixed, toPlace, fresh: true, radius: ST.radius, vScale: 1, seed: 3 });
  assert.strictEqual(res.assign[0], 0);
  assert.strictEqual(res.assign[1], 34);
  assert.strictEqual(new Set([...res.assign].filter((x) => x >= 0)).size, farms.length);
});

test('자동 배치: 칸이 모자라면 남는 농가를 미배치로 알려준다', () => {
  const farms = sampleFarms();
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const g = FM.generateShape('block', 30);
  const cells = cellsOf(Object.assign(FM.emptyLayout(), { cells: g.cells }));
  const res = FM.Opt.optimize({ cells, S, N1, toPlace: farms.map((_, i) => i), fresh: true, radius: ST.radius, vScale: 1, seed: 1 });
  assert.strictEqual(res.unplaced.length, farms.length - 30);
});

test('문제 자리만 고치기: 일부러 붙인 같은 품목을 적은 이동으로 떼어 놓는다', () => {
  const farms = sampleFarms();
  const byId = Object.fromEntries(farms.map((f) => [f.id, f]));
  const { S, N1 } = FM.Sim.matrix(farms, ST);
  const g = FM.generateShape('block', farms.length);
  const L = Object.assign(FM.emptyLayout(g.rows, g.cols), { cells: g.cells });
  const cells = cellsOf(L);
  const keys = FM.boothKeys(L);
  const good = FM.Opt.optimize({ cells, S, N1, toPlace: farms.map((_, i) => i), fresh: true, radius: ST.radius, vScale: 1, seed: 11 });
  const A = Int32Array.from(good.assign);
  // 0번 칸 옆(1번 칸)에 꿀 농가 두 곳을 붙여 위험 상황 만들기
  const i0 = A.indexOf(0);
  const i34 = A.indexOf(34);
  const t = A[1];
  A[1] = 34;
  A[i34] = t;
  const tmp = A[0];
  A[0] = 0;
  A[i0] = tmp;
  keys.forEach((k, i) => (L.assign[k] = farms[A[i]].id));
  assert.ok(FM.Sim.inspect(L, byId, ST).counts.danger >= 1);
  const res = FM.Opt.optimize({ cells, S, N1, initial: A, toPlace: [], fresh: false, anchorPenalty: 0.12, radius: ST.radius, vScale: 1, seed: 5 });
  L.assign = {};
  keys.forEach((k, i) => (L.assign[k] = farms[res.assign[i]].id));
  assert.strictEqual(FM.Sim.inspect(L, byId, ST).counts.danger, 0);
  assert.ok(res.moved <= 8, `이동 ${res.moved}곳`);
});

test('공유용 HTML: 작업 데이터를 넣고 다시 꺼낼 수 있다 (</script> 포함 문자열도 안전)', () => {
  const st = FM.createDefaultState();
  st.events[0].farms.push(FM.newFarm({ name: '테스트</script><b>농가', items: '꿀' }));
  const html = '<html><body><script id="fm-embedded" type="application/json"></script><script>x()</script></body></html>';
  const out = FM.embedStateInHtml(html, st);
  assert.ok(!/<\/script><b>/.test(out.split('<script>x()')[0].replace(/<\/script>$/, '')));
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
