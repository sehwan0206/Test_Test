/*
 * 엑셀 가져오기(SheetJS) / 내보내기(ExcelJS, 셀 색상 포함) / 배치도 이미지(Canvas)
 */
(function (root) {
  'use strict';
  const FM = root.FM;
  const X = (FM.Excel = {});

  // 엑셀 머리글 → 필드 매핑 (동의어)
  X.FIELDS = [
    { key: 'no', label: '연번', syn: ['연번', '번호', 'no', '순번', '순서'] },
    { key: 'sido', label: '시도', syn: ['시도', '시·도', '광역시도', '도'] },
    { key: 'sigungu', label: '시군구', syn: ['시군구', '시·군·구', '시군', '지역', '소재지'] },
    { key: 'name', label: '농가명', syn: ['농가명', '업체명', '상호', '상호명', '농가', '업체', '경영체명', '농장명', '참여농가'], required: true },
    { key: 'owner', label: '대표자', syn: ['대표자', '대표', '대표자명', '성명', '이름', '대표자성명'] },
    { key: 'phone', label: '연락처', syn: ['연락처', '전화번호', '휴대폰', '핸드폰', '휴대전화', '전화', '연락'] },
    { key: 'category', label: '품목군', syn: ['품목군', '품목분류', '품목구분', '분류', '구분', '카테고리', '품목류'] },
    { key: 'items', label: '신청품목', syn: ['신청품목', '판매품목', '주요품목', '취급품목', '품목', '판매상품', '상품'] },
    { key: 'isNew', label: '신규여부', syn: ['신규여부', '신규', '신규/기존', '신규기존'] },
    { key: 'place', label: '장소', syn: ['장소', '행사장', '개최지', '참여장소', '장소명', '참여장'] },
    { key: 'power', label: '전력(kW)', syn: ['전력사용량', '사용전력', '소비전력', '전력량', '전력', '전기', 'kw', '킬로와트'] },
    { key: 'memo', label: '비고', syn: ['비고', '메모', '특이사항', '참고'] },
    { key: 'alias', label: '배치도 표시 이름', syn: ['표시이름', '배치도이름', '배치도표시이름', '표시명', '간판명'] },
  ];

  const normH = (s) => String(s == null ? '' : s).replace(/[\s()\[\]·.\-_/]/g, '').toLowerCase();

  X.readFile = async function (file) {
    if (!root.XLSX) throw new Error('엑셀 라이브러리(lib/xlsx.full.min.js)를 불러오지 못했습니다.');
    const buf = await file.arrayBuffer();
    const wb = root.XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    return {
      fileName: file.name,
      sheets: wb.SheetNames.map((name) => ({
        name,
        rows: root.XLSX.utils
          .sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })
          .map((r) => r.map((v) => (v == null ? '' : String(v).trim()))),
      })),
    };
  };

  /** 머리글 행과 열 매핑을 추정 */
  X.detectHeader = function (rows) {
    let best = { headerRow: 0, map: {}, score: -1 };
    const lim = Math.min(rows.length, 15);
    for (let r = 0; r < lim; r++) {
      const map = X.mapHeader(rows[r] || []);
      const score = Object.keys(map).length + (map.name != null ? 3 : 0);
      if (score > best.score) best = { headerRow: r, map, score };
    }
    X.guessPowerColumn(rows, best.headerRow, best.map);
    return best;
  };

  /**
   * 전력 열 머리글을 못 찾았으면 「장소」 바로 뒤 열을 확인:
   * 머리글이 비었거나 kW·전력 같은 말이 있고, 값이 숫자(3, 2.5kW, 3000W …)면 전력 열로 봄
   */
  X.guessPowerColumn = function (rows, headerRow, map) {
    if (map.power != null || map.place == null) return;
    const col = map.place + 1;
    if (Object.values(map).includes(col)) return;
    const head = String((rows[headerRow] || [])[col] || '').trim();
    const vals = rows
      .slice(headerRow + 1)
      .map((r) => String((r || [])[col] == null ? '' : r[col]).trim())
      .filter(Boolean);
    if (!vals.length) return;
    const numeric = vals.filter((v) => FM.Power.parse(v) !== '' && /^[\d.,\s]+(k?w|kw|킬로와트|㎾)?$/i.test(v)).length;
    if ((head === '' || /kw|전력|전기|㎾/i.test(head)) && numeric >= Math.max(1, vals.length * 0.6)) map.power = col;
  };

  X.mapHeader = function (header) {
    const cols = header.map(normH);
    const map = {};
    const used = new Set();
    // 1) 정확히 일치
    for (const f of X.FIELDS) {
      for (const s of f.syn) {
        const i = cols.findIndex((c, idx) => !used.has(idx) && c && c === normH(s));
        if (i >= 0) {
          map[f.key] = i;
          used.add(i);
          break;
        }
      }
    }
    // 2) 포함 (긴 동의어부터)
    for (const f of X.FIELDS) {
      if (map[f.key] != null) continue;
      const syns = f.syn.filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
      for (const s of syns) {
        const i = cols.findIndex((c, idx) => !used.has(idx) && c && c.includes(normH(s)));
        if (i >= 0) {
          map[f.key] = i;
          used.add(i);
          break;
        }
      }
    }
    return map;
  };

  /** 날짜/요일 머리글로 일자별 참여 열 추정 (예: '10.10', '10/10', '토', '토요일') */
  X.detectDayColumns = function (header, days) {
    const out = {};
    const cols = header.map((c) => String(c || '').replace(/\s/g, ''));
    for (const d of days) {
      const dt = FM.parseDate(d.date);
      const m = dt.getMonth() + 1;
      const dd = dt.getDate();
      const wd = FM.WEEKDAYS[dt.getDay()];
      const pats = [m + '.' + dd, m + '/' + dd, m + '월' + dd + '일', m + '-' + dd, d.date];
      let i = cols.findIndex((c) => pats.some((p) => c.includes(p)));
      if (i < 0) i = cols.findIndex((c) => c === wd || c === wd + '요일' || c === wd + '(' + m + '.' + dd + ')');
      if (i < 0 && d.round) i = cols.findIndex((c) => c && c === String(d.round).replace(/\s/g, ''));
      if (i >= 0) out[d.id] = i;
    }
    return out;
  };

  X.truthy = (v) => /^(o|ㅇ|○|◯|●|v|✓|✔|y|yes|1|참|참여|참가|true|출점)$/i.test(String(v || '').trim());

  X.formatPhone = function (s) {
    let d = FM.phoneDigits(s);
    if (!d) return String(s || '').trim();
    if (d.length === 10 && d.startsWith('10')) d = '0' + d;
    if (d.length === 11 && d.startsWith('01')) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10 && d.startsWith('02')) return '02-' + d.slice(2, 6) + '-' + d.slice(6);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return String(s).trim();
  };

  /** 시트 행 → 농가 데이터 목록 */
  X.rowsToFarms = function (rows, headerRow, map, dayCols) {
    const out = [];
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const get = (k) => (map[k] != null && map[k] >= 0 ? String(row[map[k]] || '').trim() : '');
      const name = get('name');
      if (!name) continue;
      const data = {};
      for (const f of X.FIELDS) data[f.key] = get(f.key);
      data.phone = X.formatPhone(data.phone);
      data.power = FM.Power.parse(data.power);
      data.category = FM.normCategory(data.category);
      const dayVals = {};
      for (const [dayId, ci] of Object.entries(dayCols || {})) if (ci != null && ci >= 0) dayVals[dayId] = X.truthy(row[ci]);
      out.push({ data, dayVals, rowNo: r + 1 });
    }
    return out;
  };

  // ======================================================== 내보내기 (ExcelJS) ===
  const argb = (hex) => 'FF' + String(hex).replace('#', '').toUpperCase();
  const thin = { style: 'thin', color: { argb: 'FF9E9E9E' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

  function sheetName(wb, name) {
    let base = String(name).replace(/[\\/*?:\[\]]/g, ' ').slice(0, 28);
    let n = base;
    let i = 2;
    while (wb.getWorksheet(n)) n = base.slice(0, 26) + ' ' + i++;
    return n;
  }

  function layoutBounds(L) {
    let minR = Infinity;
    let minC = Infinity;
    let maxR = -1;
    let maxC = -1;
    for (const k of Object.keys(L.cells)) {
      const [r, c] = FM.parseKey(k);
      minR = Math.min(minR, r);
      minC = Math.min(minC, c);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }
    if (maxR < 0) return null;
    return { minR, minC, maxR, maxC };
  }
  X.layoutBounds = layoutBounds;

  X.exportEventWorkbook = async function (state, ev) {
    if (!root.ExcelJS) throw new Error('엑셀 저장 라이브러리(lib/exceljs.min.js)를 불러오지 못했습니다.');
    const venue = state.venues.find((v) => v.id === ev.venueId) || { name: '' };
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const wb = new root.ExcelJS.Workbook();
    wb.creator = '농부의시장 배치도 도우미';
    wb.created = new Date();

    const inspections = [];
    for (const day of ev.days) {
      const L = day.layout;
      const nums = FM.boothNumbers(L);
      const insp = FM.Sim.inspect(L, farmById, state.settings);
      inspections.push({ day, insp, nums });
      const dayName = FM.weekday(day.date) + ' ' + FM.fmtDay(day.date).replace(/\(.\)$/, '');

      // --- 배치도 시트
      const ws = wb.addWorksheet(sheetName(wb, dayName + ' 배치도'), {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
        views: [{ showGridLines: false }],
      });
      const b = layoutBounds(L);
      const attending = FM.attendingFarms(ev, day).length;
      const boothCount = Object.values(L.cells).filter((c) => c.t === 'b').length;
      ws.getCell('A1').value = `농부의시장 · ${venue.name} ${ev.title} — ${day.round ? day.round + ' ' : ''}${FM.fmtDay(day.date)} 배치도`;
      ws.getCell('A1').font = { bold: true, size: 16 };
      ws.getCell('A2').value = `참여 농가 ${attending}곳 · 부스 ${boothCount}칸 · 배치 ${insp.placed}곳 · 검수 ${insp.grade.g}등급(${insp.grade.label}), 분산 점수 ${insp.score}점`;
      ws.getCell('A2').font = { size: 10, color: { argb: 'FF555555' } };
      ws.getColumn(1).width = 2;
      if (b) {
        const R0 = 4;
        const C0 = 2;
        for (let c = b.minC; c <= b.maxC; c++) ws.getColumn(C0 + c - b.minC).width = 14;
        for (let r = b.minR; r <= b.maxR; r++) ws.getRow(R0 + r - b.minR).height = 46;
        for (const [k, cell] of Object.entries(L.cells)) {
          const [r, c] = FM.parseKey(k);
          const xc = ws.getCell(R0 + r - b.minR, C0 + c - b.minC);
          xc.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
          xc.border = BORDER;
          if (cell.t === 'l') {
            xc.value = cell.label || '';
            xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E3E3' } };
            xc.font = { italic: true, size: 10, color: { argb: 'FF444444' } };
            continue;
          }
          const f = farmById[L.assign[k]];
          const pin = f && L.pins[f.id] ? ' 📌' : '';
          const arrow = (cell.dir ? ' ' + FM.DIR_ARROW[cell.dir] : '') + (cell.zone ? ' [' + cell.zone + ']' : '');
          if (cell.dir) {
            // 앞면(손님 쪽)을 굵은 선으로
            const side = { u: 'top', d: 'bottom', l: 'left', r: 'right' }[cell.dir];
            xc.border = Object.assign({}, BORDER, { [side]: { style: 'thick', color: { argb: 'FF2F7D4F' } } });
          }
          if (f) {
            xc.value = {
              richText: [
                { text: nums[k] + arrow + pin + '\n', font: { size: 8, color: { argb: 'FF666666' } } },
                { text: FM.shortName(f.name), font: { bold: true, size: 10 } },
                { text: '\n' + (f.category || ''), font: { size: 7, color: { argb: 'FF666666' } } },
              ].concat(FM.Power.kw(f) ? [{ text: '  ⚡' + FM.Power.fmt(FM.Power.kw(f)), font: { size: 8, bold: true, color: { argb: 'FFB45309' } } }] : []),
            };
            xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(FM.catColor(f.category).bgHex) } };
          } else {
            xc.value = { richText: [{ text: nums[k] + arrow + '\n', font: { size: 8, color: { argb: 'FF999999' } } }, { text: '빈 자리', font: { size: 9, color: { argb: 'FFAAAAAA' } } }] };
          }
        }
        // 범례
        let lr = R0 + (b.maxR - b.minR) + 2;
        ws.getCell(lr - 1, 2).value = '▲▼◀▶ · 굵은 초록 테두리 = 부스 앞면(손님 쪽)';
        ws.getCell(lr - 1, 2).font = { size: 9, color: { argb: 'FF2F7D4F' } };
        lr += 1;
        ws.getCell(lr, 2).value = '품목군 범례';
        ws.getCell(lr, 2).font = { bold: true };
        const cats = {};
        for (const fid of Object.values(L.assign)) {
          const f = farmById[fid];
          if (f) cats[f.category || '(미분류)'] = (cats[f.category || '(미분류)'] || 0) + 1;
        }
        Object.entries(cats)
          .sort((a, b2) => b2[1] - a[1])
          .forEach(([cat, n], i) => {
            const xc = ws.getCell(lr + 1 + i, 2);
            xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(FM.catColor(cat).bgHex) } };
            xc.border = BORDER;
            ws.getCell(lr + 1 + i, 3).value = `${cat} (${n})`;
          });
      } else {
        ws.getCell('B4').value = '아직 부스 칸이 없습니다.';
      }

      // --- 부스 목록 시트
      const ls = wb.addWorksheet(sheetName(wb, dayName + ' 부스목록'));
      ls.columns = [
        { header: '부스', key: 'no', width: 7 },
        { header: '농가명', key: 'name', width: 24 },
        { header: '대표자', key: 'owner', width: 12 },
        { header: '연락처', key: 'phone', width: 16 },
        { header: '시도', key: 'sido', width: 7 },
        { header: '시군구', key: 'sigungu', width: 10 },
        { header: '품목군', key: 'category', width: 14 },
        { header: '신청품목', key: 'items', width: 60 },
        { header: '고정', key: 'pin', width: 6 },
        { header: '전력(kW)', key: 'power', width: 9 },
        { header: '전력 구역', key: 'zone', width: 9 },
        { header: '비고', key: 'memo', width: 20 },
      ];
      for (const k of FM.boothKeys(L)) {
        const f = farmById[L.assign[k]];
        ls.addRow(
          f
            ? { no: nums[k], name: f.name, owner: f.owner, phone: f.phone, sido: f.sido, sigungu: f.sigungu, category: f.category, items: f.items, pin: L.pins[f.id] ? 'O' : '', power: FM.Power.kw(f) || '', zone: L.cells[k].zone || '', memo: f.memo }
            : { no: nums[k], name: '(빈 자리)', zone: L.cells[k].zone || '' }
        );
      }
      const unplaced = FM.attendingFarms(ev, day).filter((f) => !Object.values(L.assign).includes(f.id));
      for (const f of unplaced) ls.addRow({ no: '미배치', name: f.name, owner: f.owner, phone: f.phone, sido: f.sido, sigungu: f.sigungu, category: f.category, items: f.items, power: FM.Power.kw(f) || '', memo: f.memo });
      styleTable(ls);
    }

    // --- 참여 명단 시트
    const rs = wb.addWorksheet(sheetName(wb, '참여명단'));
    const cols = [
      { header: '연번', key: 'no', width: 6 },
      { header: '시도', key: 'sido', width: 7 },
      { header: '시군구', key: 'sigungu', width: 10 },
      { header: '농가명', key: 'name', width: 24 },
      { header: '대표자', key: 'owner', width: 12 },
      { header: '연락처', key: 'phone', width: 16 },
      { header: '품목군', key: 'category', width: 14 },
      { header: '신청품목', key: 'items', width: 50 },
      { header: '신규여부', key: 'isNew', width: 8 },
      { header: '장소', key: 'place', width: 8 },
      { header: '전력(kW)', key: 'power', width: 9 },
    ];
    ev.days.forEach((d, i) => cols.push({ header: FM.weekday(d.date) + ' ' + FM.fmtDay(d.date).replace(/\(.\)$/, ''), key: 'd' + i, width: 12 }));
    cols.push({ header: '원재료', key: 'tags', width: 30 }, { header: '제품 형태', key: 'forms', width: 24 }, { header: '비고', key: 'memo', width: 20 });
    rs.columns = cols;
    const numsByDay = inspections.map((x) => ({ map: FM.farmCellMap(x.day.layout), nums: x.nums }));
    ev.farms.forEach((f, idx) => {
      const row = { no: f.no || idx + 1, sido: f.sido, sigungu: f.sigungu, name: f.name, owner: f.owner, phone: f.phone, category: f.category, items: f.items, isNew: f.isNew, place: f.place, power: FM.Power.kw(f) || '', tags: (f.tags || []).join(', '), forms: (f.forms || []).join(', '), memo: f.memo };
      ev.days.forEach((d, i) => {
        if (!f.days[d.id]) return (row['d' + i] = '');
        const k = numsByDay[i].map[f.id];
        row['d' + i] = k ? 'O (부스 ' + numsByDay[i].nums[k] + ')' : 'O';
      });
      rs.addRow(row);
    });
    styleTable(rs);

    // --- 전력 분산 시트
    const ps = wb.addWorksheet(sheetName(wb, '전력 분산'));
    ps.columns = [
      { header: '일자', key: 'day', width: 12 },
      { header: '전력 구역', key: 'z', width: 10 },
      { header: '부스 수', key: 'booths', width: 8 },
      { header: '전력 입력 농가', key: 'farms', width: 12 },
      { header: '합계(kW)', key: 'load', width: 10 },
      { header: '목표(kW)', key: 'target', width: 10 },
      { header: '용량(kW)', key: 'cap', width: 10 },
      { header: '목표 대비', key: 'dev', width: 10 },
      { header: '상태', key: 'state', width: 24 },
    ];
    for (const { day } of inspections) {
      const pr = FM.Power.report(day.layout, farmById, state.settings);
      const dn = FM.fmtDay(day.date);
      if (!pr.count) {
        const placedAny = Object.keys(day.layout.assign).length > 0;
        ps.addRow({ day: dn, state: placedAny ? '배치된 농가 중 전력 사용량이 입력된 곳 없음' : '아직 배치 전' });
        continue;
      }
      for (const z of pr.zones)
        ps.addRow({
          day: dn,
          z: (pr.virtual ? '참고 ' : '') + z.z,
          booths: z.booths,
          farms: z.farms,
          load: Math.round(z.load * 10) / 10,
          target: Math.round(z.target * 10) / 10,
          cap: z.cap || '',
          dev: (z.dev >= 0 ? '+' : '') + Math.round(z.dev * 100) + '%',
          state: z.over ? '⚠ 용량 초과' : z.level === 'warn' ? '치우침' : '고름',
        });
      ps.addRow({ day: dn, z: '전체', farms: pr.count, load: Math.round(pr.total * 10) / 10, cap: pr.gen || '', state: pr.genOver ? '⚠ 발전기 용량 초과' : FM.Power.LEVEL_LABEL[pr.level] });
      for (const hp of pr.hotPairs) ps.addRow({ day: dn, z: '고전력 인접', state: `${hp.a.farm.name}(${FM.Power.fmt(hp.a.kw)}) ↔ ${hp.b.farm.name}(${FM.Power.fmt(hp.b.kw)}) ${hp.label}` });
    }
    styleTable(ps);

    // --- 검수 결과 시트
    const is = wb.addWorksheet(sheetName(wb, '검수결과'));
    is.columns = [
      { header: '일자', key: 'day', width: 12 },
      { header: '레벨', key: 'level', width: 7 },
      { header: '부스A', key: 'na', width: 7 },
      { header: '농가A', key: 'fa', width: 22 },
      { header: '부스B', key: 'nb', width: 7 },
      { header: '농가B', key: 'fb', width: 22 },
      { header: '거리', key: 'dist', width: 10 },
      { header: '사유', key: 'why', width: 36 },
      { header: '근접 위험도', key: 'sev', width: 11 },
    ];
    for (const { day, insp, nums } of inspections) {
      if (!insp.pairs.length) {
        is.addRow({ day: FM.fmtDay(day.date), level: '-', why: `유사 품목 근접 없음 (${insp.grade.g}등급)` });
        continue;
      }
      for (const p of insp.pairs)
        is.addRow({
          day: FM.fmtDay(day.date),
          level: FM.LEVEL_LABEL[p.level],
          na: nums[p.a.key],
          fa: p.a.farm.name,
          nb: nums[p.b.key],
          fb: p.b.farm.name,
          dist: p.distLabel,
          why: X.reasonText(p),
          sev: Math.round(p.sev * 100) / 100,
        });
    }
    styleTable(is);

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  X.reasonText = function (p) {
    const parts = [];
    if (p.sharedRaw && p.sharedRaw.length) parts.push('같은 원재료: ' + p.sharedRaw.join(', '));
    else if (p.sharedFam && p.sharedFam.length) parts.push('같은 계열: ' + p.sharedFam.join(', '));
    if (p.sharedForms && p.sharedForms.length) parts.push('같은 형태: ' + p.sharedForms.join(', '));
    if (p.sameCat) parts.push('같은 품목군: ' + FM.normCategory(p.a.farm.category));
    return parts.join(' / ');
  };

  function styleTable(ws) {
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: 'middle', horizontal: 'center' };
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } };
      c.border = BORDER;
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = BORDER;
        c.alignment = { vertical: 'middle', wrapText: true };
      });
    });
  }

  // ============================================== 배치도 이미지 (Canvas/PNG) ===
  X.renderLayoutCanvas = function (o) {
    const { ev, day, venue, settings, showLines } = o;
    const L = day.layout;
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const nums = FM.boothNumbers(L);
    const b = layoutBounds(L) || { minR: 0, minC: 0, maxR: 0, maxC: 0 };
    const CW = 118;
    const CH = 66;
    const GAP = 6;
    const PAD = 28;
    const HEAD = 78;
    const cols = b.maxC - b.minC + 1;
    const rows = b.maxR - b.minR + 1;
    const insp = FM.Sim.inspect(L, farmById, settings);
    const cats = {};
    for (const fid of Object.values(L.assign)) {
      const f = farmById[fid];
      if (f) cats[f.category || '(미분류)'] = (cats[f.category || '(미분류)'] || 0) + 1;
    }
    const catList = Object.entries(cats).sort((a, b2) => b2[1] - a[1]);
    const gridW = cols * (CW + GAP) - GAP;
    const W = Math.max(gridW + PAD * 2, 760);
    const legendRows = Math.ceil(catList.length / 4) + (showLines && insp.legend.length ? Math.ceil(insp.legend.length / 3) + 1 : 0);
    const H = HEAD + rows * (CH + GAP) - GAP + PAD * 2 + 30 + legendRows * 24;
    const scale = 2;
    const cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    const g = cv.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    const font = (w, s) => `${w} ${s}px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
    g.fillStyle = '#1d2b22';
    g.font = font(700, 22);
    g.textBaseline = 'top';
    g.fillText(`${venue.name} ${ev.title} — ${day.round ? day.round + ' ' : ''}${FM.fmtDay(day.date)} 배치도`, PAD, PAD - 6);
    g.font = font(400, 13);
    g.fillStyle = '#555';
    g.fillText(`농부의시장 · 배치 ${insp.placed}곳 · 검수 ${insp.grade.g}등급(${insp.grade.label}) · 분산 점수 ${insp.score}점 · 위험 ${insp.counts.danger} / 주의 ${insp.counts.warn} · 초록 막대 = 부스 앞면(손님 쪽)${(() => {
      const pr = FM.Power.report(L, farmById, settings);
      return pr.count ? ` · ⚡ 전력 ${FM.Power.fmt(pr.total)} (${pr.virtual ? '구역 미지정' : pr.zones.map((z) => z.z + ' ' + FM.Power.fmt(z.load)).join(' / ')})` : '';
    })()}`, PAD, PAD + 26);
    const ox = PAD + (W - PAD * 2 - gridW) / 2;
    const oy = HEAD + PAD - 10;
    const pos = (r, c) => ({ x: ox + (c - b.minC) * (CW + GAP), y: oy + (r - b.minR) * (CH + GAP) });

    const rr = (x, y, w, h2, rad) => {
      g.beginPath();
      g.moveTo(x + rad, y);
      g.arcTo(x + w, y, x + w, y + h2, rad);
      g.arcTo(x + w, y + h2, x, y + h2, rad);
      g.arcTo(x, y + h2, x, y, rad);
      g.arcTo(x, y, x + w, y, rad);
      g.closePath();
    };
    const fitText = (text, maxW) => {
      if (g.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    const texts = []; // 선 위에 글자가 오도록 글자는 나중에 그림
    for (const [k, cell] of Object.entries(L.cells)) {
      const [r, c] = FM.parseKey(k);
      const { x, y } = pos(r, c);
      if (cell.t === 'l') {
        rr(x, y, CW, CH, 6);
        g.fillStyle = '#e6e6e6';
        g.fill();
        texts.push(() => {
          g.fillStyle = '#444';
          g.font = font(600, 14);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(fitText(cell.label || '', CW - 10), x + CW / 2, y + CH / 2);
          g.textAlign = 'left';
          g.textBaseline = 'top';
        });
        continue;
      }
      const f = farmById[L.assign[k]];
      const col = f ? FM.catColor(f.category) : null;
      rr(x, y, CW, CH, 7);
      g.fillStyle = f ? col.bgHex : '#fafafa';
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = f ? col.hex : '#bbb';
      if (!f) g.setLineDash([4, 3]);
      g.stroke();
      g.setLineDash([]);
      if (cell.dir) {
        // 앞면(손님 쪽) 표시 막대
        g.fillStyle = '#2f7d4f';
        const T = 5;
        if (cell.dir === 'u') g.fillRect(x + 10, y, CW - 20, T);
        else if (cell.dir === 'd') g.fillRect(x + 10, y + CH - T, CW - 20, T);
        else if (cell.dir === 'l') g.fillRect(x, y + 10, T, CH - 20);
        else g.fillRect(x + CW - T, y + 10, T, CH - 20);
      }
      texts.push(() => {
        const halo = (txt, tx, ty) => {
          g.lineWidth = 3;
          g.strokeStyle = f ? col.bgHex : '#fafafa';
          g.lineJoin = 'round';
          g.strokeText(txt, tx, ty);
          g.fillText(txt, tx, ty);
        };
        g.fillStyle = '#666';
        g.font = font(700, 11);
        halo(String(nums[k]) + (f && L.pins[f.id] ? ' 📌' : ''), x + 6, y + 5);
        if (cell.zone) {
          g.fillStyle = FM.Power.ZONE_COLORS[cell.zone] || '#555';
          g.font = font(800, 10);
          halo(cell.zone, x + 6, y + CH - 16);
        }
        if (f && FM.Power.kw(f)) {
          g.fillStyle = '#b45309';
          g.font = font(800, 10.5);
          g.textAlign = 'right';
          halo('⚡' + FM.Power.fmt(FM.Power.kw(f)), x + CW - 6, y + 5);
          g.textAlign = 'left';
        }
        g.textAlign = 'center';
        if (f) {
          g.fillStyle = '#1a1a1a';
          g.font = font(700, 14);
          halo(fitText(FM.shortName(f.name), CW - 10), x + CW / 2, y + 24);
          g.font = font(400, 10.5);
          g.fillStyle = '#555';
          halo(fitText(f.category || '', CW - 10), x + CW / 2, y + 45);
        } else {
          g.fillStyle = '#aaa';
          g.font = font(400, 12);
          g.fillText('빈 자리', x + CW / 2, y + 28);
        }
        g.textAlign = 'left';
      });
    }

    if (showLines) {
      for (const p of insp.lines) {
        const a = pos(p.a.r, p.a.c);
        const bb = pos(p.b.r, p.b.c);
        g.strokeStyle = p.color;
        g.globalAlpha = 0.85;
        g.lineWidth = 2 + 4 * Math.min(1, p.sev);
        g.setLineDash(p.kind === 'form' ? [9, 5] : p.kind === 'cat' ? [2, 6] : []);
        g.beginPath();
        g.moveTo(a.x + CW / 2, a.y + CH / 2);
        g.lineTo(bb.x + CW / 2, bb.y + CH / 2);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        for (const q of [a, bb]) {
          g.beginPath();
          g.arc(q.x + CW / 2, q.y + CH / 2, 4, 0, Math.PI * 2);
          g.fillStyle = p.color;
          g.fill();
        }
      }
    }
    texts.forEach((fn) => fn());

    // 범례
    let ly = oy + rows * (CH + GAP) + 18;
    g.font = font(400, 12);
    catList.forEach(([cat, n], i) => {
      const lx = PAD + (i % 4) * 180;
      const yy = ly + Math.floor(i / 4) * 24;
      rr(lx, yy, 18, 14, 3);
      g.fillStyle = FM.catColor(cat).bgHex;
      g.fill();
      g.strokeStyle = FM.catColor(cat).hex;
      g.stroke();
      g.fillStyle = '#333';
      g.fillText(`${cat} (${n})`, lx + 24, yy + 1);
    });
    if (showLines && insp.legend.length) {
      ly += Math.ceil(catList.length / 4) * 24 + 6;
      g.fillStyle = '#333';
      g.font = font(700, 12);
      g.fillText('검수 선', PAD, ly);
      g.font = font(400, 12);
      insp.legend.forEach((l, i) => {
        const lx = PAD + (i % 3) * 240;
        const yy = ly + 20 + Math.floor(i / 3) * 24;
        g.strokeStyle = l.color;
        g.lineWidth = 3;
        g.setLineDash(l.kind === 'form' ? [9, 5] : l.kind === 'cat' ? [2, 6] : []);
        g.beginPath();
        g.moveTo(lx, yy + 7);
        g.lineTo(lx + 22, yy + 7);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#333';
        g.fillText(fitText(`${l.label} (${l.count})`, 205), lx + 28, yy);
      });
    }
    return cv;
  };
})(window);
