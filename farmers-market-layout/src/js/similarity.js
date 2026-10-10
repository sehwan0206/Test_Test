/*
 * 품목 유사도 / 근접도 / 검수(인접 레벨) 계산
 *
 *  유사도 s(a,b) ∈ [0,1]
 *    = wCat × [같은 품목군] + wTag × [공통 품목 키워드 그룹 존재] (+0.1 × 추가 공통 그룹)
 *  거리 가중치 p(d) = 1 / d²  (d = 칸 단위 유클리드 거리, d ≤ radius 일 때만)
 *    바로 옆 1.0 · 대각선 0.5 · 한 칸 건너 0.25 · 나이트 이동 0.2
 *  근접 위험도 = s × p(d)  → 위험 ≥ 0.6, 주의 ≥ 0.3, 참고 ≥ 0.15
 *  배치 전체 비용 = Σ 근접 위험도  (자동 배치가 최소화하는 값과 동일)
 */
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const Sim = (FM.Sim = {});

  // ----------------------------------------------------------- 키워드 사전 ---
  function parsePattern(kw) {
    kw = String(kw).replace(/\s+/g, '');
    if (!kw) return null;
    if (kw.startsWith('=')) return { mode: 'eq', t: kw.slice(1) };
    if (kw.startsWith('^')) return { mode: 'pre', t: kw.slice(1) };
    if (kw.endsWith('$')) return { mode: 'suf', t: kw.slice(0, -1) };
    return { mode: 'sub', t: kw };
  }
  function matchPattern(p, tok) {
    if (!p.t) return false;
    switch (p.mode) {
      case 'eq':
        return tok === p.t;
      case 'pre':
        return tok.startsWith(p.t);
      case 'suf':
        return tok.endsWith(p.t);
      default:
        return tok.includes(p.t);
    }
  }

  Sim.parseDictionary = function (text) {
    const groups = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        const s = line.trim();
        if (!s || s.startsWith('#')) return;
        const m = s.match(/^([^:：]+)[:：](.*)$/);
        if (!m) return;
        const name = m[1].trim();
        const inc = [];
        const exc = [];
        m[2]
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .forEach((kw) => {
            const neg = kw.startsWith('!');
            const p = parsePattern(neg ? kw.slice(1) : kw);
            if (p) (neg ? exc : inc).push(p);
          });
        if (name && inc.length) groups.push({ name, inc, exc });
      });
    return groups;
  };

  let dictCache = { text: null, groups: [] };
  Sim.groups = function (settings) {
    const text = (settings && settings.keywords) || FM.DEFAULT_KEYWORDS;
    if (dictCache.text !== text) dictCache = { text, groups: Sim.parseDictionary(text) };
    return dictCache.groups;
  };

  const STOP = new Set(['등', '외', '및', '류', '기타', '약간', '각종', '종', '세트', '수제', '국산', '유기농', '무농약']);
  Sim.tokenize = function (items) {
    let t = String(items || '');
    // 괄호 안(품종·구성 설명) 제거 — 중첩 대비 여러 번
    for (let k = 0; k < 3; k++) t = t.replace(/\([^()]*\)|\[[^\[\]]*\]/g, ' ');
    t = t.replace(/[()\[\]{}<>「」『』"'“”‘’]/g, ' ');
    return t
      .split(/[,，、\/·ㆍ.;:+&|\n\r\t ]+/)
      .map((x) => x.replace(/^[\d\-~]+/, '').replace(/\d+종$/, '').trim())
      .filter((x) => x && !STOP.has(x));
  };

  /** 신청품목 문자열 → 품목 그룹 이름 목록 */
  Sim.extractTags = function (items, groupsOrSettings) {
    const groups = Array.isArray(groupsOrSettings) ? groupsOrSettings : Sim.groups(groupsOrSettings);
    const toks = Sim.tokenize(items);
    const out = [];
    for (const g of groups) {
      const hit = toks.some((tok) => g.inc.some((p) => matchPattern(p, tok)) && !g.exc.some((p) => matchPattern(p, tok)));
      if (hit) out.push(g.name);
    }
    return out;
  };

  /** 수동 지정이 아닌 농가의 태그를 다시 계산 */
  Sim.refreshTags = function (farms, settings, force) {
    const groups = Sim.groups(settings);
    for (const f of farms) if (force || !f.tagsManual) f.tags = Sim.extractTags(f.items, groups);
  };

  // -------------------------------------------------------------- 유사도 ---
  Sim.pair = function (a, b, st) {
    const ca = FM.normCategory(a.category);
    const sameCat = !!ca && ca === FM.normCategory(b.category);
    const tb = b.tags || [];
    const shared = (a.tags || []).filter((t) => tb.includes(t));
    const s = (sameCat ? st.wCat : 0) + (shared.length ? st.wTag + 0.1 * (shared.length - 1) : 0);
    return { s: Math.min(1, s), sameCat, shared };
  };

  /** n개 농가 → (n+1)×(n+1) 유사도 행렬 (마지막 인덱스 n = 빈 자리) */
  Sim.matrix = function (farms, st) {
    const n = farms.length;
    const N1 = n + 1;
    const S = new Float32Array(N1 * N1);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const s = Sim.pair(farms[i], farms[j], st).s;
        S[i * N1 + j] = s;
        S[j * N1 + i] = s;
      }
    return { S, N1, n };
  };

  Sim.dist = (r1, c1, r2, c2, vScale) => Math.hypot(c2 - c1, (r2 - r1) * (vScale || 1));
  Sim.prox = (d, radius) => (d > 0 && d <= radius + 1e-9 ? 1 / (d * d) : 0);
  Sim.level = (sev) => (sev >= FM.LEVELS.danger ? 'danger' : sev >= FM.LEVELS.warn ? 'warn' : sev >= FM.LEVELS.info ? 'info' : null);
  Sim.distLabel = function (dr, dc) {
    dr = Math.abs(dr);
    dc = Math.abs(dc);
    if (dr + dc === 1) return '바로 옆';
    if (dr === 1 && dc === 1) return '대각선';
    if ((dr === 2 && dc === 0) || (dr === 0 && dc === 2)) return '한 칸 건너';
    if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) return '한 칸 건너 대각선';
    return `가로 ${dc}칸·세로 ${dr}칸`;
  };

  // ------------------------------------------------------------------ 검수 ---
  /**
   * 검수 선을 그릴지
   *   warn(기본) = 위험·주의 쌍만 · info = 참고까지
   *   tag = 기준 거리 안의 공통 품목 쌍 모두 · all = 같은 품목군까지 모두
   */
  const RANK = { info: 1, warn: 2, danger: 3 };
  Sim.wantsLine = function (p, d, st) {
    const scope = st.lineScope || 'warn';
    if (scope === 'warn' || scope === 'info') return !!p.level && RANK[p.level] >= RANK[scope];
    return d <= st.lineDist + 1e-9 && (scope === 'all' || p.kind === 'tag');
  };

  Sim.grade = function (counts, n) {
    if (!n) return { g: '-', label: '배치 없음' };
    const d = counts.danger;
    const w = counts.warn;
    if (d === 0 && w <= Math.floor(n * 0.05)) return { g: 'A', label: '매우 좋음' };
    if (d === 0 && w <= Math.ceil(n * 0.15)) return { g: 'B', label: '좋음' };
    if (d <= Math.ceil(n * 0.05)) return { g: 'C', label: '보통' };
    if (d <= Math.ceil(n * 0.15)) return { g: 'D', label: '개선 필요' };
    return { g: 'E', label: '나쁨' };
  };

  /**
   * 배치 검수
   * @returns {{pairs, lines, cellScore, total, counts, grade, score, baseline, placed}}
   */
  Sim.inspect = function (L, farmById, st) {
    const placed = [];
    for (const [key, fid] of Object.entries(L.assign)) {
      const cell = L.cells[key];
      const f = farmById[fid];
      if (!f || !cell || cell.t !== 'b') continue;
      const [r, c] = FM.parseKey(key);
      placed.push({ key, r, c, farm: f });
    }
    const vScale = st.vScale || 1;
    const maxR = Math.max(st.radius, st.lineDist);
    const pairs = [];
    const lines = [];
    const cellScore = {};
    const counts = { danger: 0, warn: 0, info: 0 };
    let total = 0;
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        const d = Sim.dist(a.r, a.c, b.r, b.c, vScale);
        if (d > maxR + 1e-9) continue;
        const sim = Sim.pair(a.farm, b.farm, st);
        if (sim.s <= 0) continue;
        const sev = sim.s * Sim.prox(d, st.radius);
        const kind = sim.shared.length ? 'tag' : 'cat';
        const p = {
          a,
          b,
          d,
          s: sim.s,
          sev,
          shared: sim.shared,
          sameCat: sim.sameCat,
          kind,
          level: Sim.level(sev),
          groupKey: kind === 'tag' ? 'tag:' + sim.shared[0] : 'cat:' + FM.normCategory(a.farm.category),
          groupLabel: kind === 'tag' ? sim.shared.join(', ') : FM.normCategory(a.farm.category),
          distLabel: Sim.distLabel(a.r - b.r, a.c - b.c),
        };
        if (sev > 0) {
          total += sev;
          cellScore[a.key] = (cellScore[a.key] || 0) + sev;
          cellScore[b.key] = (cellScore[b.key] || 0) + sev;
        }
        if (p.level) {
          counts[p.level]++;
          pairs.push(p);
        }
        if (Sim.wantsLine(p, d, st)) lines.push(p);
      }
    }
    pairs.sort((x, y) => y.sev - x.sev);

    // 선 색상: 품목 그룹별 또는 연결 묶음(클러스터)별
    const colorOf = {};
    const legend = [];
    if (st.lineColorBy === 'cluster') {
      const parent = {};
      const find = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
      for (const p of lines) parent[find(p.a.key)] = find(p.b.key);
      const compColor = {};
      let ci = 0;
      for (const p of lines) {
        const root2 = find(p.a.key);
        if (!(root2 in compColor)) {
          compColor[root2] = FM.LINE_PALETTE[ci++ % FM.LINE_PALETTE.length];
          legend.push({ key: root2, label: '묶음 ' + ci, color: compColor[root2], count: 0 });
        }
        p.color = compColor[root2];
        legend.find((l) => l.key === root2).count++;
      }
    } else {
      let ci = 0;
      const sortedKeys = [...new Set(lines.map((p) => p.groupKey))];
      for (const gk of sortedKeys) {
        colorOf[gk] = FM.LINE_PALETTE[ci++ % FM.LINE_PALETTE.length];
        const sample = lines.find((p) => p.groupKey === gk);
        legend.push({
          key: gk,
          label: (sample.kind === 'tag' ? '공통 품목 · ' : '같은 품목군 · ') + sample.groupLabel,
          color: colorOf[gk],
          count: lines.filter((p) => p.groupKey === gk).length,
          kind: sample.kind,
        });
      }
      for (const p of lines) p.color = colorOf[p.groupKey];
    }

    const baseline = Sim.randomBaseline(L, placed, st);
    const score = baseline > 1e-9 ? Math.max(0, Math.min(100, Math.round(100 * (1 - total / baseline)))) : 100;
    return {
      pairs,
      lines,
      legend,
      cellScore,
      total,
      counts,
      grade: Sim.grade(counts, placed.length),
      score,
      baseline,
      placed: placed.length,
    };
  };

  /** 같은 농가들을 같은 부스 칸에 무작위로 놓았을 때의 평균 비용 (점수 기준선) */
  Sim.randomBaseline = function (L, placed, st) {
    if (placed.length < 2 || !FM.Opt) return 0;
    const keys = Object.keys(L.cells).filter((k) => L.cells[k].t === 'b');
    const cells = keys.map((k) => {
      const [r, c] = FM.parseKey(k);
      return { r, c };
    });
    const farms = placed.map((p) => p.farm);
    const { S, N1, n } = Sim.matrix(farms, st);
    const nb = FM.Opt.buildNeighbors(cells, st.radius, st.vScale || 1);
    const rng = FM.mulberry32(12345);
    const A = new Int32Array(cells.length);
    const trials = 24;
    let sum = 0;
    for (let t = 0; t < trials; t++) {
      for (let i = 0; i < A.length; i++) A[i] = i < n ? i : n;
      for (let i = A.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = A[i];
        A[i] = A[j];
        A[j] = tmp;
      }
      sum += FM.Opt.totalCost(A, nb, S, N1);
    }
    return sum / trials;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
