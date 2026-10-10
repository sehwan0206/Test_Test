/*
 * 자동 배치 최적화
 *
 * 문제: K개의 부스 칸에 N개 농가를 배치하여
 *       비용 = Σ(이웃한 두 칸) 유사도(a,b) × 거리가중치(d)  를 최소화 (이차 할당 문제, QAP)
 *
 * 방법: 1) 탐욕 초기해 — 다른 농가와 겹치는 품목이 많은(배치가 어려운) 농가부터,
 *          지금까지 놓인 농가들과의 충돌이 가장 적은 칸에 배치
 *       2) 담금질 기법(Simulated Annealing) — 임의의 두 칸 교환을 반복,
 *          비용이 늘어나는 교환도 온도에 따라 확률적으로 허용해 지역 최적해 탈출
 *       3) 마무리 — 모든 칸 쌍에 대해 개선되는 교환이 없을 때까지 최급강하
 *       4) 여러 번 재시작하여 가장 좋은 해 선택
 *
 * 고정(📌)된 칸은 움직이지 않으며, anchorPenalty > 0 이면 '현재 자리에서 옮겨지는 농가 수'에
 * 벌점을 주어 최소한의 이동으로 충돌만 해소합니다(문제 농가 개선 모드).
 */
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const Opt = (FM.Opt = {});

  /**
   * 각 칸의 이웃 칸과 근접도 가중치 (CSR 형식)
   * cells: [{r, c, dir}] — 가중치는 검수와 같은 FM.Sim.relation (거리 1/d + 마주봄·등맞댐 보정)
   */
  Opt.buildNeighbors = function (cells, st) {
    const K = cells.length;
    const lists = Array.from({ length: K }, () => []);
    for (let i = 0; i < K; i++)
      for (let j = i + 1; j < K; j++) {
        const p = FM.Sim.relation(cells[i], cells[j], st).p;
        if (p <= 0) continue;
        lists[i].push(j, p);
        lists[j].push(i, p);
      }
    const off = new Int32Array(K + 1);
    let n = 0;
    for (let i = 0; i < K; i++) {
      off[i] = n;
      n += lists[i].length / 2;
    }
    off[K] = n;
    const idx = new Int32Array(n);
    const w = new Float32Array(n);
    for (let i = 0; i < K; i++) {
      let o = off[i];
      for (let x = 0; x < lists[i].length; x += 2, o++) {
        idx[o] = lists[i][x];
        w[o] = lists[i][x + 1];
      }
    }
    return { off, idx, w, K };
  };

  /**
   * 쌍별 벌점 G(x), x = 유사도 × 근접도(= 근접 위험도)
   *   가까운 충돌일수록 훨씬 크게: 위험·주의 구간(FM.LEVELS)에 추가 벌점을 줘서
   *   「먼 곳 여러 쌍을 조금 줄이는 대신 한 쌍을 붙여 버리는」 해를 피함
   */
  const G = (x) => {
    const W = FM.LEVELS.warn;
    const D = FM.LEVELS.danger;
    return x + (x > W ? 4 * (x - W) : 0) + (x > D ? 8 * (x - D) : 0);
  };
  Opt.penalty = G;
  Opt.SHAPE = 'level';

  Opt.totalCost = function (A, nb, S, N1, shaped) {
    let c = 0;
    const { off, idx, w } = nb;
    for (let i = 0; i < A.length; i++) {
      const row = A[i] * N1;
      for (let k = off[i]; k < off[i + 1]; k++) {
        const x = w[k] * S[row + A[idx[k]]];
        c += shaped ? G(x) : x;
      }
    }
    return c / 2;
  };

  /**
   * @param {object} p
   *   cells: [{r,c,dir}]        부스 칸 목록 (K)
   *   S, N1                     유사도 행렬 (N1 = 농가수 + 1, 마지막 = 빈 자리)
   *   initial: Int32Array(K)    현재 배치 (농가 인덱스, 비었으면 -1)
   *   fixed:   Uint8Array(K)    1 = 움직이지 않는 칸
   *   toPlace: number[]         새로 배치할 농가 인덱스 (우선순위 순)
   *   fresh:   boolean          true = 고정되지 않은 칸을 비우고 처음부터 재배치
   *   anchorPenalty: number     자리 이동 1건당 벌점 (0 = 자유 재배치)
   *   st                        설정 (radius, vScale — 근접도 계산용)
   *   seed, restarts, iterations
   * @returns {{assign: Int32Array, cost: number, unplaced: number[], moved: number}}
   */
  Opt.optimize = function (p) {
    const cells = p.cells;
    const K = cells.length;
    const N1 = p.N1;
    const E = N1 - 1;
    const S = p.S;
    const nb = Opt.buildNeighbors(cells, p.st);
    const rng = FM.mulberry32(p.seed == null ? Date.now() : p.seed);
    const lam = p.anchorPenalty || 0;

    const fixed = p.fixed || new Uint8Array(K);
    const init = new Int32Array(K);
    for (let i = 0; i < K; i++) init[i] = p.initial && p.initial[i] >= 0 ? p.initial[i] : E;

    const movable = [];
    for (let i = 0; i < K; i++) if (!fixed[i]) movable.push(i);

    // 배치 대상 풀
    let pool = [];
    const base = new Int32Array(init);
    if (p.fresh) {
      for (const i of movable) {
        if (base[i] !== E) pool.push(base[i]);
        base[i] = E;
      }
    }
    pool = pool.concat(p.toPlace || []);
    let empties = 0;
    for (const i of movable) if (base[i] === E) empties++;
    const unplaced = pool.length > empties ? pool.slice(empties) : [];
    pool = pool.slice(0, empties);

    // 농가별 '배치 난이도' = 다른 모든 농가와의 유사도 합
    const weight = new Float64Array(N1);
    for (let a = 0; a < E; a++) {
      let s = 0;
      for (let b = 0; b < E; b++) s += S[a * N1 + b];
      weight[a] = s;
    }

    const { off, idx, w } = nb;
    const anchor = lam > 0 ? init : null;

    function delta(A, i, j) {
      const fi = A[i];
      const fj = A[j];
      const ri = fi * N1;
      const rj = fj * N1;
      let d = 0;
      for (let k = off[i]; k < off[i + 1]; k++) {
        const n = idx[k];
        if (n === j) continue;
        const g = A[n];
        d += G(w[k] * S[rj + g]) - G(w[k] * S[ri + g]);
      }
      for (let k = off[j]; k < off[j + 1]; k++) {
        const n = idx[k];
        if (n === i) continue;
        const g = A[n];
        d += G(w[k] * S[ri + g]) - G(w[k] * S[rj + g]);
      }
      if (anchor) {
        const oi = anchor[i];
        const oj = anchor[j];
        const before = (fi !== E && fi !== oi ? 1 : 0) + (fj !== E && fj !== oj ? 1 : 0);
        const after = (fj !== E && fj !== oi ? 1 : 0) + (fi !== E && fi !== oj ? 1 : 0);
        d += lam * (after - before);
      }
      return d;
    }

    function localCost(A, i, f) {
      let c = 0;
      const row = f * N1;
      for (let k = off[i]; k < off[i + 1]; k++) c += G(w[k] * S[row + A[idx[k]]]);
      return c;
    }

    function greedy(A, jitter) {
      const key = new Map(pool.map((f) => [f, weight[f] * (1 + jitter * (rng() - 0.5))]));
      const order = pool.slice().sort((a, b) => key.get(b) - key.get(a));
      for (const f of order) {
        let best = Infinity;
        let cands = [];
        for (const i of movable) {
          if (A[i] !== E) continue;
          const c = localCost(A, i, f);
          if (c < best - 1e-9) {
            best = c;
            cands = [i];
          } else if (c < best + 1e-9) cands.push(i);
        }
        if (!cands.length) break;
        A[cands[Math.floor(rng() * cands.length)]] = f;
      }
    }

    function anneal(A, iters) {
      const M = movable.length;
      if (M < 2) return;
      // 초기 온도: 비용이 늘어나는 교환의 평균 증가량
      let sum = 0;
      let cnt = 0;
      for (let t = 0; t < 400; t++) {
        const i = movable[Math.floor(rng() * M)];
        const j = movable[Math.floor(rng() * M)];
        if (i === j || A[i] === A[j]) continue;
        const d = delta(A, i, j);
        if (d > 0) {
          sum += d;
          cnt++;
        }
      }
      if (!cnt) return;
      const T0 = sum / cnt;
      const Tend = T0 * 1e-3;
      const alpha = Math.pow(Tend / T0, 1 / iters);
      let T = T0;
      let cur = 0;
      let bestCur = 0;
      const bestA = new Int32Array(A);
      for (let it = 0; it < iters; it++, T *= alpha) {
        const i = movable[Math.floor(rng() * M)];
        const j = movable[Math.floor(rng() * M)];
        if (i === j) continue;
        const fi = A[i];
        const fj = A[j];
        if (fi === fj) continue;
        const d = delta(A, i, j);
        if (d <= 0 || rng() < Math.exp(-d / T)) {
          A[i] = fj;
          A[j] = fi;
          cur += d;
          if (cur < bestCur - 1e-12) {
            bestCur = cur;
            bestA.set(A);
          }
        }
      }
      A.set(bestA);
    }

    function polish(A) {
      for (let pass = 0; pass < 30; pass++) {
        let improved = false;
        for (let x = 0; x < movable.length; x++) {
          for (let y = x + 1; y < movable.length; y++) {
            const i = movable[x];
            const j = movable[y];
            if (A[i] === A[j]) continue;
            if (delta(A, i, j) < -1e-9) {
              const t = A[i];
              A[i] = A[j];
              A[j] = t;
              improved = true;
            }
          }
        }
        if (!improved) break;
      }
    }

    function fullCost(A) {
      let c = Opt.totalCost(A, nb, S, N1, true);
      if (anchor) for (let i = 0; i < K; i++) if (A[i] !== E && A[i] !== anchor[i]) c += lam;
      return c;
    }

    const M = movable.length;
    const iters = p.iterations || Math.max(20000, Math.min(300000, M * 2500));
    const restarts = p.restarts || (p.fresh ? 3 : 2);
    let best = null;
    for (let r = 0; r < restarts; r++) {
      const A = new Int32Array(base);
      greedy(A, r === 0 ? 0 : 0.6);
      anneal(A, iters);
      polish(A);
      const c = fullCost(A);
      if (!best || c < best.c - 1e-12) best = { A, c };
    }

    const assign = new Int32Array(K);
    let moved = 0;
    for (let i = 0; i < K; i++) {
      assign[i] = best.A[i] === E ? -1 : best.A[i];
      if (init[i] !== E && best.A[i] !== init[i]) moved++;
    }
    return { assign, cost: Opt.totalCost(best.A, nb, S, N1), unplaced, moved };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Opt;
})(typeof window !== 'undefined' ? window : globalThis);
