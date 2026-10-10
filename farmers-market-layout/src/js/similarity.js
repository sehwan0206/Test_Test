/*
 * 품목 유사도 / 근접도 / 검수(인접 레벨) 계산
 *
 *  ① 품목 분석: 신청품목 → 원재료 태그(사과·포도·참깨·꿀…) + 제품 형태 태그(즙·청·떡·젓갈…)
 *  ② 유사도 s(a,b) ∈ [0,1]
 *       = wRaw × 원재료가중치      (같은 원재료 — 결과물이 달라도)      + 0.1 × 추가로 겹치는 원재료
 *       | wRaw × 계열가중치        (원재료는 달라도 같은 계열, 예: 블루베리·아로니아)
 *       + wForm × 형태가중치       (같은 제품 형태, 예: 둘 다 즙·청)
 *       + wCat                     (같은 품목군)
 *  ③ 근접도 p(a,b)  — 부스 방향을 알면 방향까지 고려
 *       기본: 1/d  (d = 칸 거리, radius 이내)  바로 옆 1 · 대각선 0.71 · 2칸 0.5 · 3칸 0.33 …
 *       마주봄(통로 건너 정면): 1  · 대각선으로 마주봄: 0.75 · 두 칸 비껴 마주봄: 0.4
 *       등 맞댐: 기본 × 0.4      · 같은 방향 앞뒤 줄: 기본 × 0.5
 *  ④ 근접 위험도 = s × p  → 위험 ≥ 0.45 · 주의 ≥ 0.3 · 참고 ≥ 0.15
 *     배치 전체 비용 = Σ 근접 위험도  (자동 배치가 최소화하는 값과 동일)
 */
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});
  const Sim = (FM.Sim = {});

  // ----------------------------------------------------------- 사전 해석 ---
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
  function parseKeywords(str) {
    const inc = [];
    const exc = [];
    String(str)
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((kw) => {
        const neg = kw.startsWith('!');
        const p = parsePattern(neg ? kw.slice(1) : kw);
        if (p) (neg ? exc : inc).push(p);
      });
    return { inc, exc };
  }
  /** "이름(0.5)" → {name, weight} */
  function nameWeight(s) {
    const m = String(s).trim().match(/^(.*?)\(\s*(\d*\.?\d+)\s*\)$/);
    return m ? { name: m[1].trim(), weight: Math.max(0, Math.min(1, +m[2])) } : { name: String(s).trim(), weight: 1 };
  }

  /**
   * 원재료 사전: 「계열 > 원재료(가중치): 키워드…」, 「@계열: 가중치」
   * 형태 사전:   「형태(가중치): 키워드…」
   */
  Sim.parseDictionary = function (text, withFamily) {
    const groups = [];
    const famWeight = {};
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        const s = line.trim();
        if (!s || s.startsWith('#')) return;
        const fm = s.match(/^@([^:：]+)[:：]\s*(\d*\.?\d+)/);
        if (fm) {
          famWeight[fm[1].trim()] = Math.max(0, Math.min(1, +fm[2]));
          return;
        }
        const m = s.match(/^([^:：]+)[:：](.*)$/);
        if (!m) return;
        let head = m[1];
        let family = '';
        if (withFamily && head.includes('>')) {
          const parts = head.split('>');
          family = parts[0].trim();
          head = parts.slice(1).join('>');
        }
        const nw = nameWeight(head);
        const kw = parseKeywords(m[2]);
        if (nw.name && kw.inc.length) groups.push({ name: nw.name, weight: nw.weight, family, inc: kw.inc, exc: kw.exc });
      });
    return { groups, famWeight };
  };

  let dictCache = { key: null, value: null };
  Sim.dicts = function (st) {
    const rawText = (st && st.rawDict) || FM.DEFAULT_RAW_DICT;
    const formText = (st && st.formDict) || FM.DEFAULT_FORM_DICT;
    const key = rawText + '\u0000' + formText;
    if (dictCache.key !== key) {
      const raw = Sim.parseDictionary(rawText, true);
      const form = Sim.parseDictionary(formText, false);
      const rawInfo = {};
      for (const g of raw.groups) rawInfo[g.name] = { weight: g.weight, family: g.family };
      const formInfo = {};
      for (const g of form.groups) formInfo[g.name] = { weight: g.weight };
      dictCache = { key, value: { raw, form, rawInfo, formInfo, famWeight: raw.famWeight } };
    }
    return dictCache.value;
  };

  // ------------------------------------------------------------- 품목 분석 ---
  const STOP = new Set(['등', '외', '및', '류', '기타', '약간', '각종', '종', '세트', '수제', '국산', '유기농', '무농약', '제철농산물', '선물세트']);
  /** 신청품목 → 낱말 목록. 괄호 안 재료도 낱말로 포함 (예: 침출차(작두콩,여주) → 침출차, 작두콩, 여주) */
  Sim.tokenize = function (items) {
    return String(items || '')
      .replace(/[()\[\]{}<>「」『』"'“”‘’]/g, ',')
      .split(/[,，、\/·ㆍ.;:+&|\n\r\t ]+/)
      .map((x) =>
        x
          .replace(/^[\d\-~]+/, '')
          .replace(/\d+(종|호|도|g|kg|ml|L)?$/i, '')
          .replace(/(.{2,})등$/, '$1')
          .trim()
      )
      .filter((x) => x && !STOP.has(x));
  };

  function matchGroups(groups, toks) {
    const out = [];
    for (const g of groups) {
      if (toks.some((tok) => g.inc.some((p) => matchPattern(p, tok)) && !g.exc.some((p) => matchPattern(p, tok)))) out.push(g.name);
    }
    return out;
  }

  /** 신청품목 → { raw: 원재료[], forms: 제품형태[] } */
  Sim.extract = function (items, st) {
    const D = Sim.dicts(st);
    const toks = Sim.tokenize(items);
    return { raw: matchGroups(D.raw.groups, toks), forms: matchGroups(D.form.groups, toks) };
  };

  /** 수동 지정이 아닌 농가의 원재료·형태 태그를 다시 계산 */
  Sim.refreshTags = function (farms, st, force) {
    for (const f of farms) {
      if (!force && f.tagsManual) continue;
      const x = Sim.extract(f.items, st);
      f.tags = x.raw;
      f.forms = x.forms;
    }
  };
  Sim.family = (name, st) => {
    const info = Sim.dicts(st).rawInfo[name];
    return info ? info.family : '';
  };

  // -------------------------------------------------------------- 유사도 ---
  Sim.pair = function (a, b, st) {
    const D = Sim.dicts(st);
    const ca = FM.normCategory(a.category);
    const sameCat = !!ca && ca === FM.normCategory(b.category);
    const ra = a.tags || [];
    const rb = b.tags || [];
    const sharedRaw = ra.filter((t) => rb.includes(t));
    const fa = a.forms || [];
    const fb = b.forms || [];
    const sharedForms = fa.filter((t) => fb.includes(t));
    const rw = (t) => (D.rawInfo[t] ? D.rawInfo[t].weight : 1);
    const fw = (t) => (D.formInfo[t] ? D.formInfo[t].weight : 1);

    let s = 0;
    let sharedFam = [];
    if (sharedRaw.length) {
      s += st.wRaw * Math.max(...sharedRaw.map(rw)) + 0.1 * (sharedRaw.length - 1);
    } else {
      const famA = new Set(ra.map((t) => D.rawInfo[t] && D.rawInfo[t].family).filter((f) => f && D.famWeight[f] > 0));
      sharedFam = [...new Set(rb.map((t) => D.rawInfo[t] && D.rawInfo[t].family).filter((f) => famA.has(f)))];
      if (sharedFam.length) s += st.wRaw * Math.max(...sharedFam.map((f) => D.famWeight[f]));
    }
    if (sharedForms.length) s += st.wForm * Math.max(...sharedForms.map(fw)) + 0.05 * (sharedForms.length - 1);
    if (sameCat) s += st.wCat;
    const kind = sharedRaw.length ? 'raw' : sharedFam.length ? 'fam' : sharedForms.length ? 'form' : sameCat ? 'cat' : null;
    return { s: Math.min(1, s), sameCat, sharedRaw, sharedFam, sharedForms, kind };
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

  // ------------------------------------------------------- 거리·방향 근접도 ---
  // 부스 방향 = 손님을 맞는 앞면이 향하는 쪽 (u 위 · d 아래 · l 왼쪽 · r 오른쪽)
  Sim.DIRV = { u: [-1, 0], d: [1, 0], l: [0, -1], r: [0, 1] };
  const FACE_LAT = [1, 0.75, 0.4]; // 정면 · 한 칸 비껴 · 두 칸 비껴
  const FACE_MAX = 6; // 이 칸 수 이내로 마주 보면 마주봄으로 판단

  /**
   * 두 칸(a, b: {r, c, dir})의 관계와 근접도
   * @returns {{p, d, rel, label}}  rel: side | face | faceDiag | back | stack | near
   */
  Sim.relation = function (a, b, st) {
    const dr = b.r - a.r;
    const dc = b.c - a.c;
    const vs = st.vScale || 1;
    const d = Math.hypot(dc, dr * vs);
    const R = st.radius || 6;
    let p = d > 0 && d <= R + 1e-9 ? 1 / d : 0;
    let rel = 'near';
    const fa = a.dir && Sim.DIRV[a.dir];
    const fb = b.dir && Sim.DIRV[b.dir];
    if (fa && fb) {
      const t = dr * fa[0] + dc * fa[1]; // a 앞쪽으로 떨어진 칸 수
      const m = Math.abs(dr * fa[1] - dc * fa[0]); // 옆으로 비껴난 칸 수
      const opposite = fa[0] === -fb[0] && fa[1] === -fb[1];
      const same = fa[0] === fb[0] && fa[1] === fb[1];
      if (opposite && t >= 1 && t <= FACE_MAX && m <= 2) {
        const face = FACE_LAT[m] * (t <= 4 ? 1 : 0.6);
        if (face >= p) {
          p = face;
          rel = m === 0 ? 'face' : 'faceDiag';
        }
      } else if (opposite && t <= -1) {
        p *= 0.4;
        rel = 'back';
      } else if (same && t !== 0 && m <= 1) {
        p *= 0.5;
        rel = 'stack';
      } else if (same && t === 0) rel = 'side';
    }
    return { p, d, rel, label: Sim.relLabel(rel, dr, dc, a.dir) };
  };

  Sim.relLabel = function (rel, dr, dc, dirA) {
    const ar = Math.abs(dr);
    const ac = Math.abs(dc);
    if (rel === 'face' || rel === 'faceDiag') {
      const fa = Sim.DIRV[dirA];
      const t = Math.abs(dr * fa[0] + dc * fa[1]);
      const gap = t - 1;
      return (rel === 'face' ? '마주봄' : '비껴서 마주봄') + (gap > 0 ? ` (통로 ${gap}칸 건너)` : ' (정면으로 붙음)');
    }
    if (rel === 'back') return '등 맞댐';
    if (ar + ac === 1) return '바로 옆';
    if (ar === 1 && ac === 1) return '대각선';
    if ((ar === 2 && ac === 0) || (ar === 0 && ac === 2)) return '한 칸 건너';
    if (rel === 'stack') return '앞뒤 줄';
    return `${Math.round(Math.hypot(ar, ac) * 10) / 10}칸 거리`;
  };

  Sim.level = (sev) => (sev >= FM.LEVELS.danger ? 'danger' : sev >= FM.LEVELS.warn ? 'warn' : sev >= FM.LEVELS.info ? 'info' : null);

  /** 배치(layout) → 부스 칸 목록 {key, r, c, dir} */
  Sim.boothCells = function (L, keys) {
    return (keys || Object.keys(L.cells).filter((k) => L.cells[k].t === 'b')).map((k) => {
      const [r, c] = FM.parseKey(k);
      return { key: k, r, c, dir: L.cells[k] && L.cells[k].dir };
    });
  };

  // ------------------------------------------------------------------ 검수 ---
  const RANK = { info: 1, warn: 2, danger: 3 };
  /**
   * 검수 선을 그릴지
   *   warn(기본) = 위험·주의 쌍만 · info = 참고까지
   *   tag = 기준 거리 안의 원재료·형태 공통 쌍 모두 · all = 같은 품목군까지 모두
   */
  Sim.wantsLine = function (p, rel, st) {
    const scope = st.lineScope || 'warn';
    if (scope === 'warn' || scope === 'info') return !!p.level && RANK[p.level] >= RANK[scope];
    const near = rel.d <= st.lineDist + 1e-9 || rel.rel === 'face' || rel.rel === 'faceDiag';
    return near && (scope === 'all' || p.kind !== 'cat');
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

  const KIND_LABEL = { raw: '같은 원재료', fam: '같은 계열', form: '같은 형태', cat: '같은 품목군' };
  Sim.KIND_LABEL = KIND_LABEL;

  /**
   * 배치 검수
   * @returns {{pairs, lines, legend, cellScore, total, counts, grade, score, baseline, placed, rawStats}}
   */
  Sim.inspect = function (L, farmById, st) {
    const placed = [];
    for (const [key, fid] of Object.entries(L.assign)) {
      const cell = L.cells[key];
      const f = farmById[fid];
      if (!f || !cell || cell.t !== 'b') continue;
      const [r, c] = FM.parseKey(key);
      placed.push({ key, r, c, dir: cell.dir, farm: f });
    }
    const pairs = [];
    const lines = [];
    const cellScore = {};
    const counts = { danger: 0, warn: 0, info: 0 };
    const rawDists = [];
    let total = 0;
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        const sim = Sim.pair(a.farm, b.farm, st);
        if (sim.s <= 0) continue;
        const rel = Sim.relation(a, b, st);
        // 흔한 재료(쌀·소금 등 가중치 < 1)만 겹치는 쌍은 거리 통계에서 뺌
        if (sim.sharedRaw.some((t) => !Sim.dicts(st).rawInfo[t] || Sim.dicts(st).rawInfo[t].weight >= 1))
          rawDists.push({ d: (rel.rel === 'face' || rel.rel === 'faceDiag') && rel.p >= 0.75 ? 1 : rel.d, a, b, rel });
        const sev = sim.s * rel.p;
        const groupKey =
          sim.kind === 'raw' ? 'raw:' + sim.sharedRaw[0] : sim.kind === 'fam' ? 'fam:' + sim.sharedFam[0] : sim.kind === 'form' ? 'form:' + sim.sharedForms[0] : 'cat:' + FM.normCategory(a.farm.category);
        const groupLabel =
          sim.kind === 'raw' ? sim.sharedRaw.join(', ') : sim.kind === 'fam' ? sim.sharedFam.join(', ') + ' 계열' : sim.kind === 'form' ? sim.sharedForms.join(', ') : FM.normCategory(a.farm.category);
        const p = {
          a,
          b,
          d: rel.d,
          rel: rel.rel,
          distLabel: rel.label,
          s: sim.s,
          sev,
          sharedRaw: sim.sharedRaw,
          sharedFam: sim.sharedFam,
          sharedForms: sim.sharedForms,
          sameCat: sim.sameCat,
          kind: sim.kind,
          level: Sim.level(sev),
          groupKey,
          groupLabel,
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
        if (Sim.wantsLine(p, rel, st)) lines.push(p);
      }
    }
    pairs.sort((x, y) => y.sev - x.sev);

    // 선 색상: 원재료·형태별 또는 연결 묶음(클러스터)별
    const legend = [];
    if (st.lineColorBy === 'cluster') {
      const parent = {};
      const find = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
      for (const p of lines) parent[find(p.a.key)] = find(p.b.key);
      const compColor = {};
      let ci = 0;
      for (const p of lines) {
        const r2 = find(p.a.key);
        if (!(r2 in compColor)) {
          compColor[r2] = FM.LINE_PALETTE[ci++ % FM.LINE_PALETTE.length];
          legend.push({ key: r2, label: '묶음 ' + ci, color: compColor[r2], count: 0 });
        }
        p.color = compColor[r2];
        legend.find((l) => l.key === r2).count++;
      }
    } else {
      const colorOf = {};
      let ci = 0;
      for (const gk of [...new Set(lines.map((p) => p.groupKey))]) {
        colorOf[gk] = FM.LINE_PALETTE[ci++ % FM.LINE_PALETTE.length];
        const sample = lines.find((p) => p.groupKey === gk);
        legend.push({ key: gk, label: KIND_LABEL[sample.kind] + ' · ' + sample.groupLabel, color: colorOf[gk], count: lines.filter((p) => p.groupKey === gk).length, kind: sample.kind });
      }
      for (const p of lines) p.color = colorOf[p.groupKey];
    }

    // 같은 원재료 농가끼리 얼마나 떨어졌는지
    rawDists.sort((x, y) => x.d - y.d);
    const rawStats = rawDists.length
      ? {
          pairs: rawDists.length,
          min: rawDists[0].d,
          minPair: rawDists[0],
          avg: rawDists.reduce((s, x) => s + x.d, 0) / rawDists.length,
          within2: rawDists.filter((x) => x.d <= 2.01).length,
          facing: rawDists.filter((x) => (x.rel.rel === 'face' || x.rel.rel === 'faceDiag') && x.rel.p >= 0.75).length,
        }
      : null;

    const baseline = Sim.randomBaseline(L, placed, st);
    const score = baseline > 1e-9 ? Math.max(0, Math.min(100, Math.round(100 * (1 - total / baseline)))) : 100;
    return { pairs, lines, legend, cellScore, total, counts, grade: Sim.grade(counts, placed.length), score, baseline, placed: placed.length, rawStats };
  };

  /** 같은 농가들을 같은 부스 칸에 무작위로 놓았을 때의 평균 비용 (점수 기준선) */
  Sim.randomBaseline = function (L, placed, st) {
    if (placed.length < 2 || !FM.Opt) return 0;
    const cells = Sim.boothCells(L);
    const farms = placed.map((p) => p.farm);
    const { S, N1, n } = Sim.matrix(farms, st);
    const nb = FM.Opt.buildNeighbors(cells, st);
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
