/*
 * 전력 분산 — 농가별 전력 사용량(kW)을 간선·분전반 구역에 고르게 나누기
 *
 *  ① 전력 구역(A·B·C…): 한 간선(분전반)이 맡는 부스 묶음. 칸마다 cell.zone 으로 지정
 *     구역별 목표 = 전체 kW × (구역 용량 비율, 용량을 모두 적었을 때) 또는 (구역 부스 수 비율)
 *     구역 비용 = wZone × ((합계 − 목표) / 목표)²  + 용량 초과 시 큰 벌점
 *  ② 고전력끼리 떨어뜨리기: 두 농가의 상대 전력 u = kW / 최대kW 일 때
 *     유사도 행렬에 wPow × u_a × u_b 를 더해, 근처(같은 분기 회로)에 몰리지 않게 함
 */
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const P = (FM.Power = {});

  P.ZONES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  P.ZONE_COLORS = { A: '#e15759', B: '#4e79a7', C: '#59a14f', D: '#f28e2b', E: '#b07aa1', F: '#17a2b8', G: '#c9a227', H: '#8c6d4f' };

  /** "3", "2.5kW", "3,000W", "1.5 킬로와트" → kW 숫자 ('' = 모름) */
  P.parse = function (v) {
    if (v == null) return '';
    if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : '';
    const s = String(v).replace(/,/g, '').replace(/\s+/g, '').toLowerCase();
    const m = s.match(/(\d+(?:\.\d+)?)(kw|킬로와트|㎾|w|와트)?/);
    if (!m) return '';
    let n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return '';
    if ((m[2] === 'w' || m[2] === '와트') && n >= 50) n = n / 1000;
    return Math.round(n * 100) / 100;
  };
  P.kw = (f) => (f && typeof f.power === 'number' && f.power > 0 ? f.power : 0);
  P.fmt = (kw) => (Math.round(kw * 10) / 10).toString().replace(/\.0$/, '') + 'kW';

  /** 지금 쓰는 구역 글자 목록 (A부터 순서대로) */
  P.zonesIn = function (L) {
    const set = new Set();
    for (const c of Object.values(L.cells)) if (c.t === 'b' && c.zone) set.add(c.zone);
    return P.ZONES.filter((z) => set.has(z));
  };

  /**
   * 부스를 n개 구역으로 자동으로 나눔 — 배치도의 긴 방향을 따라 부스 수가 같은 띠로 자름
   * (간선이 통로를 따라 깔리고 분전반이 일정 간격으로 있다고 가정)
   */
  P.splitKeys = function (L, n) {
    const keys = Object.keys(L.cells).filter((k) => L.cells[k].t === 'b');
    if (!keys.length) return [];
    let minR = Infinity;
    let maxR = -1;
    let minC = Infinity;
    let maxC = -1;
    const pos = keys.map((k) => {
      const [r, c] = FM.parseKey(k);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
      return { k, r, c };
    });
    const wide = maxC - minC >= maxR - minR;
    pos.sort((a, b) => (wide ? a.c - b.c || a.r - b.r : a.r - b.r || a.c - b.c));
    n = Math.max(1, Math.min(P.ZONES.length, Math.floor(n), keys.length));
    const groups = Array.from({ length: n }, () => []);
    pos.forEach((p, i) => groups[Math.min(n - 1, Math.floor((i * n) / pos.length))].push(p.k));
    return { groups, wide };
  };
  P.autoZones = function (L, n) {
    const res = P.splitKeys(L, n);
    if (!res.groups) return 0;
    for (const c of Object.values(L.cells)) delete c.zone;
    res.groups.forEach((g, i) => g.forEach((k) => (L.cells[k].zone = P.ZONES[i])));
    L.zoneCaps = L.zoneCaps || {};
    for (const z of Object.keys(L.zoneCaps)) if (P.ZONES.indexOf(z) >= res.groups.length) delete L.zoneCaps[z];
    return res.groups.length;
  };

  // ------------------------------------------------------------ 자동 배치용 ---
  /** 고전력끼리 떨어뜨리기: 유사도 행렬 S 에 wPow × u_a × u_b 를 더함 */
  P.addToMatrix = function (S, N1, farms, st) {
    const w = st.wPow == null ? 0.5 : st.wPow;
    const kws = farms.map(P.kw);
    const max = Math.max(0, ...kws);
    if (!w || max <= 0) return;
    const u = kws.map((x) => x / max);
    for (let i = 0; i < farms.length; i++) {
      if (!u[i]) continue;
      for (let j = 0; j < farms.length; j++) if (i !== j && u[j]) S[i * N1 + j] += w * u[i] * u[j];
    }
  };

  /** 최적화에 넘길 구역 정보: 칸별 구역 번호, 구역 용량 */
  P.zoneSetup = function (L, keys) {
    const zones = P.zonesIn(L);
    if (!zones.length) return null;
    const zoneOf = new Int32Array(keys.length).fill(-1);
    keys.forEach((k, i) => {
      const z = L.cells[k] && L.cells[k].zone;
      if (z) zoneOf[i] = zones.indexOf(z);
    });
    const caps = Float64Array.from(zones.map((z) => +((L.zoneCaps || {})[z] || 0)));
    return { zones, zoneOf, caps };
  };

  // ------------------------------------------------------------------ 검수 ---
  /**
   * 전력 분산 검수
   * @returns {{total, count, zones:[{z, booths, load, target, cap, dev, level}], level, maxDev, hotPairs, gen, virtual}}
   */
  P.report = function (L, farmById, st) {
    const placed = [];
    for (const [k, fid] of Object.entries(L.assign)) {
      const f = farmById[fid];
      const cell = L.cells[k];
      if (!f || !cell || cell.t !== 'b') continue;
      const [r, c] = FM.parseKey(k);
      placed.push({ key: k, r, c, cell, farm: f, kw: P.kw(f) });
    }
    const withPower = placed.filter((p) => p.kw > 0);
    const total = withPower.reduce((s, p) => s + p.kw, 0);
    const out = { total, count: withPower.length, zones: [], level: null, maxDev: 0, hotPairs: [], virtual: false };
    out.gen = +(L.genCap || 0);
    out.genOver = out.gen > 0 && total > out.gen;
    if (!withPower.length) return out;

    // 구역별 합계 (구역이 없으면 긴 방향 3등분으로 참고용 계산)
    let zoneOfKey = {};
    let zones = P.zonesIn(L);
    if (zones.length) {
      for (const k of Object.keys(L.cells)) if (L.cells[k].zone) zoneOfKey[k] = L.cells[k].zone;
    } else {
      const res = P.splitKeys(L, 3);
      if (res.groups) {
        out.virtual = true;
        out.virtualWide = res.wide;
        zones = res.groups.map((_, i) => P.ZONES[i]);
        res.groups.forEach((g, i) => g.forEach((k) => (zoneOfKey[k] = P.ZONES[i])));
      }
    }
    const caps = out.virtual ? {} : L.zoneCaps || {};
    const allCaps = zones.length && zones.every((z) => +caps[z] > 0);
    const capSum = zones.reduce((s, z) => s + (+caps[z] || 0), 0);
    const boothsIn = {};
    for (const k of Object.keys(zoneOfKey)) if (L.cells[k] && L.cells[k].t === 'b') boothsIn[zoneOfKey[k]] = (boothsIn[zoneOfKey[k]] || 0) + 1;
    const boothSum = Object.values(boothsIn).reduce((s, x) => s + x, 0) || 1;
    for (const z of zones) {
      const load = withPower.filter((p) => zoneOfKey[p.key] === z).reduce((s, p) => s + p.kw, 0);
      const target = allCaps ? (total * +caps[z]) / capSum : (total * (boothsIn[z] || 0)) / boothSum;
      const cap = +caps[z] || 0;
      const dev = target > 0 ? (load - target) / target : 0;
      const over = cap > 0 && load > cap;
      const level = over ? 'danger' : Math.abs(dev) > 0.3 ? 'warn' : 'ok';
      out.zones.push({ z, booths: boothsIn[z] || 0, load, target, cap, dev, over, level, farms: withPower.filter((p) => zoneOfKey[p.key] === z).length });
    }
    out.maxDev = Math.max(0, ...out.zones.map((x) => Math.abs(x.dev)));
    out.level = out.zones.some((x) => x.over) || out.genOver ? 'danger' : out.maxDev > 0.3 ? 'warn' : out.maxDev > 0.15 ? 'fair' : 'good';

    // 고전력 농가끼리 바로 옆·대각선 (같은 분기 회로에 몰릴 위험)
    const max = Math.max(...withPower.map((p) => p.kw));
    const hot = withPower.filter((p) => p.kw >= max * 0.5);
    for (let i = 0; i < hot.length; i++)
      for (let j = i + 1; j < hot.length; j++) {
        const a = hot[i];
        const b = hot[j];
        const d = Math.hypot(a.r - b.r, a.c - b.c);
        if (d <= 1.5) out.hotPairs.push({ a, b, d, sum: a.kw + b.kw, label: d === 1 ? '바로 옆' : '대각선' });
      }
    out.hotPairs.sort((x, y) => y.sum - x.sum);
    return out;
  };

  P.LEVEL_LABEL = { good: '고름', fair: '조금 치우침', warn: '치우침', danger: '용량 초과' };

  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
