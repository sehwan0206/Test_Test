/*
 * 농부의시장 배치도 도우미 — 앱 화면 (일정 · 참여 명단 · 저장/공유 · 설정)
 * 배치도 화면은 layout-view.js
 */
(function (root) {
  'use strict';
  const FM = root.FM;
  const UI = FM.UI;
  const h = UI.h;

  const App = (FM.App = {
    state: null,
    ui: {
      mode: 'edit', // 배치도 단계: edit(칸 만들기) | assign(농가 배치) | inspect(검수)
      brush: 'b',
      labelText: '무대',
      selectedKey: null,
      armedFarmId: null,
      swapFrom: null,
      search: '',
      listFilter: 'all',
      rosterSearch: '',
      rosterCat: '',
      shapeKind: 'lines',
      shapeLines: 2,
    },
    history: {},
  });

  // ================================================================ 저장 ===
  let saveStateEl = null;
  function setSaveState(s) {
    if (!saveStateEl) return;
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    saveStateEl.className = 'save-state ' + s;
    saveStateEl.textContent = s === 'saving' ? '저장 중…' : s === 'error' ? '⚠ 저장 실패 (공유용 파일로 저장해 두세요)' : '✓ 자동 저장됨 ' + t;
  }
  function saveNow() {
    setSaveState(FM.saveState(App.state) ? 'saved' : 'error');
  }
  const saveSoon = UI.debounce(saveNow, 400);
  App.changed = function () {
    setSaveState('saving');
    saveSoon();
  };
  App.saveNow = () => saveSoon.flush();
  window.addEventListener('beforeunload', () => FM.saveState(App.state));

  // ============================================================ 조회 헬퍼 ===
  App.venue = (id) => App.state.venues.find((v) => v.id === id) || { id, name: '(삭제된 장소)', short: '?', color: '#ddd' };
  App.event = (id) => App.state.events.find((e) => e.id === id);
  App.settings = () => App.state.settings;
  App.sortedEvents = () =>
    App.state.events.slice().sort((a, b) => {
      const da = a.days[0] ? a.days[0].date : '9999';
      const db = b.days[0] ? b.days[0].date : '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  App.eventStatus = function (ev) {
    const today = FM.todayISO();
    if (!ev.days.length) return 'none';
    const first = ev.days[0].date;
    const last = ev.days[ev.days.length - 1].date;
    if (today >= first && today <= last) return 'today';
    if (today > last) return 'past';
    return 'future';
  };
  App.dayStats = function (ev, day) {
    const att = FM.attendingFarms(ev, day);
    const booths = Object.values(day.layout.cells).filter((c) => c.t === 'b').length;
    const attSet = new Set(att.map((f) => f.id));
    const placed = Object.values(day.layout.assign).filter((fid) => attSet.has(fid)).length;
    return { attending: att.length, booths, placed };
  };

  // ================================================================ 라우팅 ===
  function parseRoute() {
    const p = location.hash.replace(/^#\/?/, '').split('/');
    if (p[0] === 'e' && p[1]) return { view: 'event', eventId: p[1], tab: p[2] || 'roster', dayId: p[3] || null };
    return { view: 'home' };
  }
  App.go = function (hash) {
    if (location.hash === hash) App.render();
    else location.hash = hash;
  };
  App.goLayout = function (ev, dayId, mode) {
    if (mode) App.ui.mode = mode;
    App.ui.selectedKey = null;
    App.ui.armedFarmId = null;
    App.ui.swapFrom = null;
    App.go('#/e/' + ev.id + '/layout/' + (dayId || (ev.days[0] && ev.days[0].id) || ''));
  };

  App.render = function () {
    const route = parseRoute();
    const view = UI.clear(document.getElementById('view'));
    renderTopbar(route);
    if (route.view === 'event') {
      const ev = App.event(route.eventId);
      if (!ev) {
        location.hash = '#/';
        return;
      }
      renderEvent(view, ev, route);
    } else {
      document.title = '농부의시장 배치도';
      App.refreshSteps = null;
      renderHome(view);
    }
  };
  window.addEventListener('hashchange', () => App.render());

  // ================================================================ 상단바 ===
  function renderTopbar(route) {
    const bar = UI.clear(document.getElementById('topbar'));
    bar.appendChild(
      h(
        'a',
        { class: 'brand', href: '#/', title: '처음 화면(일정 목록)으로' },
        h('span', { class: 'brand-logo' }, '🌾'),
        h('span', null, '농부의시장 ', h('b', null, '배치도 도우미'))
      )
    );
    bar.appendChild(h('div', { class: 'spacer' }));
    saveStateEl = h('span', { class: 'save-state saved' }, '✓ 자동 저장됨');
    bar.appendChild(saveStateEl);
    bar.appendChild(
      h(
        'button',
        { class: 'btn share-btn', title: '지금까지의 작업이 담긴 HTML 파일을 만듭니다. 이 파일을 팀원에게 보내면 더블클릭만으로 같은 화면이 열려요.', onclick: () => App.saveShareFile() },
        '💾 공유용 파일로 저장'
      )
    );
    bar.appendChild(h('button', { class: 'btn ghost', onclick: () => App.openWorkFile() }, '📂 파일 열기'));
    bar.appendChild(h('button', { class: 'btn ghost', onclick: () => App.openHelp() }, '❓ 사용법'));
    bar.appendChild(h('button', { class: 'btn ghost icon-only', title: '설정', 'aria-label': '설정', onclick: () => App.openSettings() }, '⚙'));
  }

  // ============================================================ 처음 화면 ===
  function renderHome(view) {
    const events = App.sortedEvents();
    const next = events.find((e) => ['today', 'future'].includes(App.eventStatus(e)));

    const hero = h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-text' },
        h('h1', null, '행사 일정을 선택하세요'),
        h('p', null, '일정을 누르면 ① 참여 명단 → ② 칸 만들기 → ③ 농가 배치 → ④ 검수 → ⑤ 저장·출력 순서로 진행돼요.')
      ),
      next
        ? h(
            'button',
            { class: 'hero-next', onclick: () => App.go('#/e/' + next.id + '/roster') },
            h('small', null, App.eventStatus(next) === 'today' ? '🔴 오늘 진행 중인 행사' : '⏭ 다가오는 행사'),
            h('strong', null, App.venue(next.venueId).name + ' ' + next.title),
            h('span', null, FM.fmtRange(next.days) + '  →  바로 열기')
          )
        : null
    );
    view.appendChild(hero);

    const board = h('section', { class: 'board' });
    for (const v of App.state.venues) {
      const list = events.filter((e) => e.venueId === v.id);
      const col = h(
        'div',
        { class: 'board-col' },
        h('div', { class: 'board-head', style: { background: v.color } }, h('strong', null, v.name), h('span', null, list.length + '개 일정')),
        list.map((ev) => eventCard(ev, v)),
        h('button', { class: 'add-event', onclick: () => openEventEditor(null, v.id) }, '＋ ' + v.short + ' 일정 추가')
      );
      board.appendChild(col);
    }
    const orphan = events.filter((e) => !App.state.venues.some((v) => v.id === e.venueId));
    if (orphan.length) board.appendChild(h('div', { class: 'board-col' }, h('div', { class: 'board-head' }, h('strong', null, '장소 없음')), orphan.map((ev) => eventCard(ev, App.venue(ev.venueId)))));
    view.appendChild(board);

    view.appendChild(
      h(
        'div',
        { class: 'home-foot' },
        h('button', { class: 'btn', onclick: () => openEventEditor(null, App.state.venues[0] && App.state.venues[0].id) }, '＋ 새 일정 만들기'),
        h('span', { class: 'muted' }, '작업 내용은 이 컴퓨터의 브라우저에 자동 저장돼요. 다른 사람과 나누려면 위의 「💾 공유용 파일로 저장」을 누르세요.')
      )
    );
  }

  function eventCard(ev, venue) {
    const status = App.eventStatus(ev);
    const badge = { today: ['오늘', 'b-today'], past: ['종료', 'b-past'], future: ['예정', 'b-future'], none: ['날짜 없음', 'b-past'] }[status];
    const dayBits = ev.days.map((d) => {
      const s = App.dayStats(ev, d);
      const done = s.attending > 0 && s.placed === s.attending;
      return h(
        'span',
        { class: 'day-bit' + (done ? ' done' : ''), title: `${FM.fmtDay(d.date)} 참여 ${s.attending}곳 · 배치 ${s.placed}곳` },
        FM.weekday(d.date) + ' ' + (done ? '✓' : s.placed + '/' + s.attending)
      );
    });
    return h(
      'div',
      { class: 'event-card ' + status, style: { borderLeftColor: venue.color } },
      h(
        'button',
        { class: 'event-main', onclick: () => App.go('#/e/' + ev.id + '/roster') },
        h('div', { class: 'ec-top' }, h('strong', null, ev.title || '(제목 없음)'), h('span', { class: 'badge ' + badge[1] }, badge[0])),
        h('div', { class: 'ec-date' }, FM.fmtRange(ev.days), ev.days.length > 2 ? h('span', { class: 'muted' }, ` · ${ev.days.length}일`) : null),
        h('div', { class: 'ec-stats' }, h('span', null, '명단 ' + ev.farms.length + '곳'), dayBits)
      ),
      h(
        'button',
        {
          class: 'icon-btn ec-menu',
          title: '일정 수정/삭제',
          'aria-label': '일정 메뉴',
          onclick: (e) =>
            UI.menu(e.currentTarget, [
              { icon: '✏️', label: '일정 수정 (날짜·금요일 추가)', onClick: () => openEventEditor(ev) },
              { icon: '📄', label: '일정 복제 (명단 포함)', onClick: () => duplicateEvent(ev) },
              '-',
              { icon: '🗑', label: '일정 삭제', danger: true, onClick: () => deleteEvent(ev) },
            ]),
        },
        '⋯'
      )
    );
  }

  async function deleteEvent(ev) {
    const ok = await UI.confirm(`「${App.venue(ev.venueId).name} ${ev.title}」 일정을 삭제할까요?\n명단과 배치도도 함께 지워집니다.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    App.state.events = App.state.events.filter((e) => e !== ev);
    App.changed();
    App.go('#/');
  }

  function duplicateEvent(ev) {
    const copy = FM.clone(ev);
    copy.id = FM.uid('ev');
    copy.title = ev.title + ' (복사본)';
    const dayMap = {};
    copy.days.forEach((d) => {
      const nid = FM.uid('d');
      dayMap[d.id] = nid;
      d.id = nid;
    });
    copy.farms.forEach((f) => {
      const days = {};
      for (const k in f.days) if (dayMap[k]) days[dayMap[k]] = f.days[k];
      f.days = days;
    });
    App.state.events.push(copy);
    App.changed();
    App.render();
    UI.toast('일정을 복제했어요. 날짜를 수정해 주세요.');
    openEventEditor(copy);
  }

  // ======================================================= 일정 추가/수정 ===
  function nextSaturday() {
    const dt = new Date();
    dt.setDate(dt.getDate() + ((6 - dt.getDay() + 7) % 7 || 7));
    return FM.toISO(dt);
  }

  function openEventEditor(ev, venueId) {
    const isNew = !ev;
    const draft = isNew
      ? { venueId: venueId || App.state.venues[0].id, title: '', days: [FM.newDay(nextSaturday(), ''), FM.newDay(FM.addDays(nextSaturday(), 1), '')] }
      : { venueId: ev.venueId, title: ev.title, days: ev.days.map((d) => ({ id: d.id, date: d.date, round: d.round })) };

    const body = h('div', { class: 'form' });
    let m = null;
    const draw = () => {
      UI.clear(body);
      draft.days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      body.appendChild(
        h(
          'label',
          { class: 'field' },
          h('span', null, '장소'),
          h(
            'select',
            { class: 'input', onchange: (e) => (draft.venueId = e.target.value) },
            App.state.venues.map((v) => h('option', { value: v.id, selected: v.id === draft.venueId }, v.name))
          )
        )
      );
      body.appendChild(
        h(
          'label',
          { class: 'field' },
          h('span', null, '일정 이름'),
          h('input', { class: 'input', value: draft.title, placeholder: '예: 13,14회차', oninput: (e) => (draft.title = e.target.value) })
        )
      );
      const rows = draft.days.map((d, i) =>
        h(
          'div',
          { class: 'day-row' },
          h('input', {
            type: 'date',
            class: 'input',
            value: d.date,
            onchange: (e) => {
              const v = e.target.value;
              if (!v) return;
              if (i === 0) {
                // 첫 날짜를 바꾸면 나머지 날짜도 같은 간격으로 함께 이동 (주말 단위로 옮기기 쉽게)
                const delta = Math.round((FM.parseDate(v) - FM.parseDate(d.date)) / 86400000);
                draft.days.forEach((x) => (x.date = FM.addDays(x.date, delta)));
              } else d.date = v;
              draw();
            },
          }),
          h('span', { class: 'wd' }, FM.weekday(d.date) + '요일'),
          h('input', { class: 'input', value: d.round, placeholder: '회차 (예: 13회차)', oninput: (e) => (d.round = e.target.value) }),
          h(
            'button',
            {
              class: 'icon-btn',
              title: '이 날짜 빼기',
              'aria-label': '이 날짜 빼기',
              disabled: draft.days.length <= 1,
              onclick: () => {
                draft.days.splice(i, 1);
                draw();
              },
            },
            '✕'
          )
        )
      );
      const first = draft.days[0];
      const last = draft.days[draft.days.length - 1];
      const prev = first ? FM.addDays(first.date, -1) : nextSaturday();
      const nxt = last ? FM.addDays(last.date, 1) : nextSaturday();
      body.appendChild(h('div', { class: 'field' }, h('span', null, '행사 날짜 (하루 = 한 회차)'), h('div', { class: 'day-rows' }, rows)));
      body.appendChild(
        h(
          'div',
          { class: 'row gap' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                draft.days.unshift({ id: null, date: prev, round: '' });
                draw();
              },
            },
            `＋ 앞에 ${FM.weekday(prev)}요일(${FM.fmtDay(prev)}) 추가`
          ),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                draft.days.push({ id: null, date: nxt, round: '' });
                draw();
              },
            },
            `＋ 뒤에 ${FM.weekday(nxt)}요일(${FM.fmtDay(nxt)}) 추가`
          )
        )
      );
      body.appendChild(h('p', { class: 'muted small' }, '첫 날짜를 바꾸면 나머지 날짜도 함께 옮겨져요. 기존 주말 일정에 금요일을 더하려면 「앞에 금요일 추가」를 누르세요.'));
    };
    draw();

    const save = async () => {
      const dates = draft.days.map((d) => d.date);
      if (new Set(dates).size !== dates.length) return UI.toast('같은 날짜가 두 번 들어 있어요.', 'warn');
      if (!draft.days.length) return UI.toast('날짜를 하나 이상 넣어 주세요.', 'warn');
      if (isNew) {
        const nev = {
          id: FM.uid('ev'),
          venueId: draft.venueId,
          title: draft.title.trim() || '새 일정',
          days: draft.days.map((d) => FM.newDay(d.date, d.round)),
          farms: [],
        };
        const tpl = App.venue(nev.venueId).template;
        if (tpl) nev.days.forEach((d) => Object.assign(d.layout, FM.clone(tpl)));
        App.state.events.push(nev);
        m.close(true);
        App.changed();
        App.go('#/e/' + nev.id + '/roster');
        UI.toast('일정을 만들었어요. 이제 참여 명단을 넣어 주세요.');
        return;
      }
      // 수정
      const removed = ev.days.filter((d) => !draft.days.some((x) => x.id === d.id));
      const removedWithData = removed.filter((d) => Object.keys(d.layout.assign).length || ev.farms.some((f) => f.days[d.id]));
      if (removedWithData.length) {
        const ok = await UI.confirm(`${removedWithData.map((d) => FM.fmtDay(d.date)).join(', ')} 날짜를 빼면 그날의 참여 체크와 배치도가 지워져요. 계속할까요?`, { danger: true, okText: '빼기' });
        if (!ok) return;
      }
      const added = [];
      const days = draft.days.map((d) => {
        const old = ev.days.find((x) => x.id === d.id);
        if (old) {
          old.date = d.date;
          old.round = d.round;
          return old;
        }
        const nd = FM.newDay(d.date, d.round);
        added.push(nd);
        return nd;
      });
      for (const r of removed) for (const f of ev.farms) delete f.days[r.id];
      ev.venueId = draft.venueId;
      ev.title = draft.title.trim() || ev.title;
      ev.days = days;
      for (const nd of added) {
        // 가장 가까운 기존 날짜의 칸 모양과 참여 체크를 이어받기
        const near = days.filter((d) => !added.includes(d)).sort((a, b) => Math.abs(FM.parseDate(a.date) - FM.parseDate(nd.date)) - Math.abs(FM.parseDate(b.date) - FM.parseDate(nd.date)))[0];
        if (near) {
          nd.layout.rows = near.layout.rows;
          nd.layout.cols = near.layout.cols;
          nd.layout.cells = FM.clone(near.layout.cells);
          nd.layout.numbering = near.layout.numbering;
        } else if (App.venue(ev.venueId).template) Object.assign(nd.layout, FM.clone(App.venue(ev.venueId).template));
        if (near && ev.farms.length) {
          const cnt = ev.farms.filter((f) => f.days[near.id]).length;
          const ok = await UI.confirm(`새로 추가한 ${FM.fmtDay(nd.date)}의 참여 농가를 ${FM.fmtDay(near.date)}과(와) 같게 체크할까요? (${cnt}곳)\n나중에 명단에서 바꿀 수 있어요.`, { okText: '같게 체크', cancelText: '비워 두기' });
          if (ok) for (const f of ev.farms) if (f.days[near.id]) f.days[nd.id] = true;
        }
      }
      m.close(true);
      App.changed();
      App.render();
      UI.toast('일정을 수정했어요.');
    };

    m = UI.modal({
      title: isNew ? '새 일정 만들기' : '일정 수정',
      body,
      width: '560px',
      footer: [h('button', { class: 'btn', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', onclick: save }, isNew ? '만들기' : '저장')],
    });
  }
  App.openEventEditor = openEventEditor;

  // ============================================================ 행사 화면 ===
  const STEPS = [
    { key: 'roster', n: '①', label: '참여 명단' },
    { key: 'edit', n: '②', label: '칸 만들기' },
    { key: 'assign', n: '③', label: '농가 배치' },
    { key: 'inspect', n: '④', label: '검수' },
    { key: 'export', n: '⑤', label: '저장·출력' },
  ];

  function stepDone(ev, key, day) {
    if (key === 'roster') return ev.farms.length > 0 && ev.days.every((d) => FM.attendingFarms(ev, d).length > 0);
    if (!day) return false;
    const s = App.dayStats(ev, day);
    if (key === 'edit') return s.booths > 0 && s.booths >= s.attending;
    if (key === 'assign') return s.attending > 0 && s.placed === s.attending;
    if (key === 'inspect') {
      if (!s.placed) return false;
      const g = FM.Sim.inspect(day.layout, Object.fromEntries(ev.farms.map((f) => [f.id, f])), App.settings()).grade.g;
      return g === 'A' || g === 'B';
    }
    return false;
  }

  function renderEvent(view, ev, route) {
    const venue = App.venue(ev.venueId);
    document.title = `${venue.short} ${ev.title} · 농부의시장 배치도`;
    let day = ev.days.find((d) => d.id === route.dayId) || null;
    const tab = route.tab === 'layout' || route.tab === 'export' ? route.tab : 'roster';
    if (tab === 'layout' && !day) day = ev.days[0];
    const dayForSteps = day || ev.days[0];

    const head = h(
      'section',
      { class: 'ev-head' },
      h('button', { class: 'btn ghost', onclick: () => App.go('#/') }, '← 일정 목록'),
      h('span', { class: 'venue-chip', style: { background: venue.color } }, venue.name),
      h('h2', null, ev.title),
      h('span', { class: 'muted' }, FM.fmtRange(ev.days)),
      h('button', { class: 'btn ghost small', onclick: () => openEventEditor(ev) }, '✏️ 일정 수정 / 금요일 추가')
    );
    view.appendChild(head);

    const steps = h('nav', { class: 'steps' });
    const drawSteps = () => {
      UI.clear(steps);
      const cur = tab === 'layout' ? App.ui.mode : tab;
      STEPS.forEach((s) => {
        const done = s.key !== 'export' && stepDone(ev, s.key, dayForSteps);
        steps.appendChild(h(
          'button',
          {
            class: 'step' + (cur === s.key ? ' active' : '') + (done ? ' done' : ''),
            onclick: () => {
              if (s.key === 'roster') App.go('#/e/' + ev.id + '/roster');
              else if (s.key === 'export') App.go('#/e/' + ev.id + '/export');
              else App.goLayout(ev, dayForSteps && dayForSteps.id, s.key);
            },
          },
          h('span', { class: 'step-n' }, done ? '✓' : s.n),
          h('span', null, s.label)
        ));
      });
    };
    drawSteps();
    App.refreshSteps = drawSteps;
    view.appendChild(steps);

    const body = h('section', { class: 'ev-body' });
    view.appendChild(body);
    if (tab === 'roster') renderRoster(body, ev);
    else if (tab === 'export') renderExport(body, ev);
    else FM.LayoutView.render(body, ev, day);
  }

  // ============================================================ 참여 명단 ===
  function renderRoster(container, ev) {
    const cats = [...new Set(ev.farms.map((f) => f.category).filter(Boolean))].sort();

    const toolbar = h(
      'div',
      { class: 'toolbar' },
      h('button', { class: 'btn primary', onclick: () => importExcel(ev, ev.farms.length ? 'add' : 'base') }, ev.farms.length ? '📥 엑셀로 추가 명단 넣기' : '📥 엑셀 명단 넣기'),
      ev.farms.length ? h('button', { class: 'btn', onclick: () => importExcel(ev, 'base') }, '🔄 기본 명단 다시 넣기') : null,
      h('button', { class: 'btn', onclick: () => openFarmEditor(ev, null) }, '✍️ 농가 직접 추가'),
      h('button', { class: 'btn', onclick: () => copyFromEvent(ev) }, '📋 다른 일정 명단 가져오기'),
      ev.farms.length
        ? h(
            'button',
            {
              class: 'btn ghost',
              onclick: (e) =>
                UI.menu(e.currentTarget, [
                  { icon: '📊', label: '명단·배치도 엑셀로 저장', onClick: () => exportExcel(ev, UI.safeFileName(`농부의시장_${App.venue(ev.venueId).short}_${ev.title}`)) },
                  { icon: '🏷', label: '유사 품목 태그 다시 계산', hint: '직접 고친 태그는 유지', onClick: () => {
                    FM.Sim.refreshTags(ev.farms, App.settings());
                    App.changed();
                    App.render();
                    UI.toast('품목 태그를 다시 계산했어요.', 'ok');
                  } },
                  '-',
                  { icon: '🗑', label: '명단 전체 비우기', danger: true, onClick: async () => {
                    if (!(await UI.confirm(`이 일정의 명단 ${ev.farms.length}곳과 배치를 모두 지울까요? (칸 모양은 남아요)`, { danger: true, okText: '모두 지우기' }))) return;
                    removeFarms(ev, ev.farms.map((f) => f.id));
                    App.changed();
                    App.render();
                  } },
                ]),
            },
            '⋯ 더보기'
          )
        : null,
      h('div', { class: 'spacer' }),
      h('input', {
        class: 'input search',
        type: 'search',
        placeholder: '🔍 농가·대표자·품목 검색',
        value: App.ui.rosterSearch,
        oninput: (e) => {
          App.ui.rosterSearch = e.target.value;
          redrawTable();
        },
      }),
      h(
        'select',
        {
          class: 'input',
          onchange: (e) => {
            App.ui.rosterCat = e.target.value;
            App.render();
          },
        },
        h('option', { value: '' }, '품목군 전체'),
        cats.map((c) => h('option', { value: c, selected: c === App.ui.rosterCat }, c))
      )
    );
    container.appendChild(toolbar);

    if (!ev.farms.length) {
      container.appendChild(
        h(
          'div',
          { class: 'empty-state' },
          h('div', { class: 'big' }, '📋'),
          h('h3', null, '아직 참여 명단이 없어요'),
          h('p', null, '엑셀 명단 파일(연번·농가명·대표자·연락처·품목군·신청품목·장소 등)을 넣으면 자동으로 읽어요.'),
          h('div', { class: 'row gap center' }, h('button', { class: 'btn primary lg', onclick: () => importExcel(ev, 'base') }, '📥 엑셀 명단 파일 선택'), h('button', { class: 'btn lg', onclick: () => loadSample(ev) }, '🧪 예시 명단으로 연습해 보기'))
        )
      );
      return;
    }

    // 요약
    const summary = h(
      'div',
      { class: 'roster-summary' },
      h('span', { class: 'chip' }, `전체 ${ev.farms.length}곳`),
      ev.days.map((d) => {
        const s = App.dayStats(ev, d);
        return h('span', { class: 'chip day' }, `${FM.weekday(d.date)} ${FM.fmtDay(d.date).replace(/\(.\)$/, '')} ${d.round ? '· ' + d.round + ' ' : ''}참여 `, h('b', null, s.attending + '곳'));
      }),
      (() => {
        const pf = ev.farms.filter((f) => FM.Power.kw(f));
        if (!pf.length) return h('span', { class: 'chip power', title: '명단 엑셀의 「장소」 바로 뒤 열에 kW를 적거나, 아래 표의 ⚡ 칸에 바로 입력하세요' }, '⚡ 전력 입력 0곳');
        return h(
          'span',
          { class: 'chip power', title: '전력 사용량이 입력된 농가 수와 날짜별 합계' },
          `⚡ 전력 입력 ${pf.length}곳 · `,
          ev.days.map((d, i) => h('b', null, (i ? ' / ' : '') + FM.weekday(d.date) + ' ' + FM.Power.fmt(FM.attendingFarms(ev, d).reduce((s2, f) => s2 + FM.Power.kw(f), 0))))
        );
      })(),
      h('span', { class: 'muted small' }, '체크를 풀면 그날 불참(취소)으로, 체크하면 참여로 바뀌어요. 배치도에도 바로 반영돼요.')
    );
    container.appendChild(summary);
    // 여러 농가가 같이 쓰는 원재료 — 배치할 때 떨어뜨려야 할 묶음
    const rawCount = {};
    for (const f of ev.farms) if (ev.days.some((d) => f.days[d.id])) for (const t of f.tags || []) (rawCount[t] = rawCount[t] || []).push(f);
    const overlaps = Object.entries(rawCount)
      .filter(([, fs]) => fs.length >= 2)
      .sort((a, b) => b[1].length - a[1].length);
    if (overlaps.length)
      container.appendChild(
        h(
          'div',
          { class: 'roster-summary overlap' },
          h('span', { class: 'small', title: '같은 원재료를 쓰는 농가끼리는 자동 배치가 최대한 멀리, 마주 보지 않게 놓아요' }, '🔁 겹치는 원재료'),
          overlaps.slice(0, 18).map(([t, fs]) =>
            h(
              'button',
              {
                class: 'tag raw btn-tag',
                title: fs.map((f) => f.name).join('\n') + '\n(누르면 이 원재료로 검색)',
                onclick: () => {
                  App.ui.rosterSearch = t;
                  App.render();
                },
              },
              `${t} ${fs.length}곳`
            )
          ),
          overlaps.length > 18 ? h('span', { class: 'muted small' }, `외 ${overlaps.length - 18}가지`) : null
        )
      );

    const tableWrap = h('div', { class: 'table-wrap' });
    container.appendChild(tableWrap);

    function redrawTable() {
      const q2 = App.ui.rosterSearch.trim().toLowerCase();
      const rows = ev.farms.filter((f) => {
        if (App.ui.rosterCat && f.category !== App.ui.rosterCat) return false;
        if (!q2) return true;
        return [f.name, f.owner, f.phone, f.items, f.category, f.sigungu, (f.tags || []).join(' '), (f.forms || []).join(' ')].join(' ').toLowerCase().includes(q2);
      });
      UI.clear(tableWrap).appendChild(buildTable(rows));
    }

    function buildTable(rows) {
      const cellMaps = ev.days.map((d) => ({ map: FM.farmCellMap(d.layout), nums: FM.boothNumbers(d.layout) }));
      const thead = h(
        'thead',
        null,
        h(
          'tr',
          null,
          ev.days.map((d) => {
            const allOn = rows.length > 0 && rows.every((f) => f.days[d.id]);
            const cnt = ev.farms.filter((f) => f.days[d.id]).length;
            return h(
              'th',
              { class: 'th-day' },
              h('div', null, FM.weekday(d.date) + ' ' + FM.fmtDay(d.date).replace(/\(.\)$/, '')),
              h('small', null, (d.round || '') + ' · ' + cnt + '곳'),
              h(
                'label',
                { class: 'all-toggle', title: '보이는 농가 전체 체크/해제' },
                h('input', {
                  type: 'checkbox',
                  checked: allOn,
                  onchange: (e) => {
                    for (const f of rows) setAttendance(ev, f, d, e.target.checked, true);
                    App.changed();
                    App.render();
                  },
                }),
                '전체'
              )
            );
          }),
          h('th', null, '연번'),
          h('th', null, '농가명 / 대표자'),
          h('th', null, '연락처'),
          h('th', null, '지역'),
          h('th', null, '품목군'),
          h('th', { class: 'th-items' }, '신청품목'),
          h('th', { title: '비슷한 품목 판단에 쓰는 원재료(파랑)·제품 형태(회색). 농가 수정에서 바꿀 수 있어요' }, '원재료 · 형태'),
          h('th', null, '신규'),
          h('th', null, '장소'),
          h('th', { class: 'th-power', title: '전력 사용량(kW). 칸에 바로 적거나 고칠 수 있어요. 비우면 모름/적음' }, '⚡전력(kW)'),
          h('th', null, '')
        )
      );
      const tbody = h(
        'tbody',
        null,
        rows.map((f, idx) => {
          const col = FM.catColor(f.category);
          const anyDay = ev.days.some((d) => f.days[d.id]);
          return h(
            'tr',
            { class: anyDay ? '' : 'absent' },
            ev.days.map((d, i) => {
              const k = cellMaps[i].map[f.id];
              return h(
                'td',
                { class: 'td-day' },
                h(
                  'label',
                  { class: 'day-check' },
                  h('input', {
                    type: 'checkbox',
                    checked: !!f.days[d.id],
                    onchange: (e) => {
                      setAttendance(ev, f, d, e.target.checked);
                      App.changed();
                      App.render();
                    },
                  }),
                  k ? h('span', { class: 'booth-no', title: '배치된 부스 번호' }, cellMaps[i].nums[k] + '번') : null
                )
              );
            }),
            h('td', { class: 'muted' }, f.no || idx + 1),
            h('td', null, h('div', { class: 'fname' }, f.name), h('div', { class: 'muted small' }, f.owner)),
            h('td', { class: 'nowrap' }, f.phone),
            h('td', { class: 'nowrap small' }, [f.sido, f.sigungu].filter(Boolean).join(' ')),
            h('td', null, f.category ? h('span', { class: 'cat-chip', style: { background: col.bg, borderColor: col.bd } }, f.category) : h('span', { class: 'muted' }, '-')),
            h('td', { class: 'td-items' }, f.items),
            h(
              'td',
              { class: 'td-tags' },
              (f.tags || []).map((t) => h('span', { class: 'tag raw' + (f.tagsManual ? ' manual' : ''), title: '원재료' }, t)),
              (f.forms || []).map((t) => h('span', { class: 'tag form' + (f.tagsManual ? ' manual' : ''), title: '제품 형태' }, t))
            ),
            h('td', { class: 'center' }, f.isNew),
            h('td', { class: 'nowrap' }, f.place),
            h(
              'td',
              { class: 'td-power' },
              h('input', {
                class: 'input pow-input' + (FM.Power.kw(f) ? ' has' : ''),
                type: 'number',
                min: 0,
                step: 0.1,
                value: FM.Power.kw(f) || '',
                placeholder: '-',
                title: '전력 사용량 kW',
                onchange: (e) => {
                  f.power = FM.Power.parse(e.target.value);
                  e.target.classList.toggle('has', !!FM.Power.kw(f));
                  App.changed();
                },
              })
            ),
            h(
              'td',
              { class: 'nowrap' },
              h('button', { class: 'icon-btn', title: '수정', 'aria-label': '수정', onclick: () => openFarmEditor(ev, f) }, '✏️'),
              h('button', { class: 'icon-btn', title: '삭제', 'aria-label': '삭제', onclick: () => deleteFarm(ev, f) }, '🗑')
            )
          );
        })
      );
      return h('table', { class: 'roster' }, thead, tbody);
    }
    redrawTable();
  }

  /** 참여 체크 변경 — 불참으로 바꾸면 그날 배치에서도 빠짐 */
  function setAttendance(ev, f, day, on, silent) {
    if (on) f.days[day.id] = true;
    else {
      delete f.days[day.id];
      const L = day.layout;
      const k = FM.farmCellMap(L)[f.id];
      if (k) {
        delete L.assign[k];
        delete L.pins[f.id];
        if (!silent) UI.toast(`${FM.shortName(f.name)} — ${FM.fmtDay(day.date)} 배치에서 빠졌어요 (부스 자리는 비워 둠)`);
      }
    }
  }
  App.setAttendance = setAttendance;

  async function deleteFarm(ev, f) {
    const ok = await UI.confirm(`「${f.name}」을(를) 명단에서 삭제할까요? 모든 날짜의 배치에서도 빠져요.`, { danger: true, okText: '삭제' });
    if (!ok) return;
    removeFarms(ev, [f.id]);
    App.changed();
    App.render();
  }
  function removeFarms(ev, ids) {
    const set = new Set(ids);
    ev.farms = ev.farms.filter((f) => !set.has(f.id));
    for (const d of ev.days) {
      for (const [k, fid] of Object.entries(d.layout.assign)) if (set.has(fid)) delete d.layout.assign[k];
      for (const fid of ids) delete d.layout.pins[fid];
    }
  }

  function loadSample(ev) {
    const [first, ...rest] = ev.days;
    const last = rest.length ? rest[rest.length - 1] : null;
    FM.SAMPLE_FARMS.forEach(([name, owner, sido, sigungu, category, items, when, power], i) => {
      const f = FM.newFarm({ no: i + 1, name, owner, sido, sigungu, category, items, power: power || '', phone: '010-0000-' + String(i + 1).padStart(4, '0'), place: App.venue(ev.venueId).short, isNew: i % 3 === 0 ? 'ㅇ' : '×', memo: '연습용 예시' });
      for (const d of ev.days) f.days[d.id] = true;
      if (when === 'sat' && last) delete f.days[last.id];
      if (when === 'sun' && first && last) delete f.days[first.id];
      ev.farms.push(f);
    });
    FM.Sim.refreshTags(ev.farms, App.settings());
    App.changed();
    App.render();
    UI.toast('예시 명단 40곳을 넣었어요. 연습이 끝나면 「⋯ 더보기 → 명단 전체 비우기」로 지울 수 있어요.', 'ok', 5000);
  }

  // ------------------------------------------------------- 농가 추가/수정 ---
  function openFarmEditor(ev, farm) {
    const isNew = !farm;
    const d = isNew ? FM.newFarm({ place: App.venue(ev.venueId).short }) : FM.clone(farm);
    if (isNew) for (const day of ev.days) d.days[day.id] = true;
    const cats = [...new Set(ev.farms.map((f) => f.category).concat(Object.keys(FM.CATEGORY_HUES)).filter(Boolean))].sort();
    const field = (label, key, attrs) =>
      h('label', { class: 'field' }, h('span', null, label), h('input', Object.assign({ class: 'input', value: d[key] || '', oninput: (e) => (d[key] = e.target.value) }, attrs || {})));
    const splitList = (v) =>
      v
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
    d.forms = d.forms || [];
    const tagNote = h('small', { class: 'muted' }, d.tagsManual ? '직접 지정한 값을 사용해요.' : '신청품목에서 자동으로 뽑았어요. 틀리면 고쳐 주세요.');
    const manualOn = () => {
      d.tagsManual = true;
      tagNote.textContent = '직접 지정한 값을 사용해요.';
    };
    const tagInput = h('input', {
      class: 'input',
      value: (d.tags || []).join(', '),
      placeholder: '예: 사과, 꿀, 참깨',
      oninput: (e) => {
        d.tags = splitList(e.target.value);
        manualOn();
      },
    });
    const formInput = h('input', {
      class: 'input',
      value: d.forms.join(', '),
      placeholder: '예: 즙·주스, 잼·소스',
      oninput: (e) => {
        d.forms = splitList(e.target.value);
        manualOn();
      },
    });
    const autoFill = () => {
      const x = FM.Sim.extract(d.items, App.settings());
      d.tags = x.raw;
      d.forms = x.forms;
      tagInput.value = d.tags.join(', ');
      formInput.value = d.forms.join(', ');
    };
    const itemsArea = h('textarea', {
      class: 'input',
      rows: 3,
      oninput: (e) => {
        d.items = e.target.value;
        if (!d.tagsManual) autoFill();
      },
    });
    itemsArea.value = d.items || '';

    const body = h(
      'div',
      { class: 'form grid2' },
      field('농가명 *', 'name', { autofocus: true }),
      field('대표자', 'owner'),
      field('연락처', 'phone'),
      h(
        'label',
        { class: 'field' },
        h('span', null, '품목군'),
        h('input', { class: 'input', value: d.category, list: 'catlist', oninput: (e) => (d.category = FM.normCategory(e.target.value)) }),
        h(
          'datalist',
          { id: 'catlist' },
          cats.map((c) => h('option', { value: c }))
        )
      ),
      field('시도', 'sido'),
      field('시군구', 'sigungu'),
      h('label', { class: 'field span2' }, h('span', null, '신청품목'), itemsArea),
      h(
        'div',
        { class: 'field span2' },
        h('span', null, '원재료 (쉼표로 구분) — 결과물이 달라도 원재료가 같으면 떨어뜨려요'),
        tagInput,
        h('span', null, '제품 형태 (쉼표로 구분) — 즙·청·떡·젓갈처럼 같은 형태끼리도 떨어뜨려요'),
        formInput,
        h(
          'div',
          { class: 'row gap' },
          tagNote,
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onclick: () => {
                autoFill();
                d.tagsManual = false;
                tagNote.textContent = '신청품목에서 자동으로 뽑았어요. 틀리면 고쳐 주세요.';
              },
            },
            '자동으로 다시 뽑기'
          )
        )
      ),
      h(
        'label',
        { class: 'field' },
        h('span', null, '⚡ 전력 사용량 (kW)'),
        h('input', {
          class: 'input',
          type: 'number',
          min: 0,
          step: 0.1,
          value: FM.Power.kw(d) || '',
          placeholder: '모르면 비워 두세요',
          oninput: (e) => (d.power = FM.Power.parse(e.target.value)),
        })
      ),
      field('신규여부', 'isNew', { placeholder: 'ㅇ / ×' }),
      field('장소', 'place'),
      h('label', { class: 'field span2' }, h('span', null, '비고'), h('input', { class: 'input', value: d.memo || '', oninput: (e) => (d.memo = e.target.value) })),
      h(
        'div',
        { class: 'field span2' },
        h('span', null, '참여 날짜'),
        h(
          'div',
          { class: 'row gap wrap' },
          ev.days.map((day) =>
            h(
              'label',
              { class: 'check' },
              h('input', {
                type: 'checkbox',
                checked: !!d.days[day.id],
                onchange: (e) => {
                  if (e.target.checked) d.days[day.id] = true;
                  else delete d.days[day.id];
                },
              }),
              `${FM.weekday(day.date)} ${FM.fmtDay(day.date)} ${day.round || ''}`
            )
          )
        )
      )
    );
    let m = null;
    const save = () => {
      if (!String(d.name).trim()) return UI.toast('농가명을 입력해 주세요.', 'warn');
      if (!d.tagsManual) {
        const x = FM.Sim.extract(d.items, App.settings());
        d.tags = x.raw;
        d.forms = x.forms;
      }
      if (isNew) {
        const dup = ev.farms.find((f) => FM.isSameFarm(f, d));
        if (dup) UI.toast(`이미 비슷한 농가(${dup.name})가 있어요. 확인해 주세요.`, 'warn');
        ev.farms.push(d);
      } else {
        for (const day of ev.days) if (farm.days[day.id] && !d.days[day.id]) setAttendance(ev, farm, day, false);
        Object.assign(farm, d);
      }
      m.close(true);
      App.changed();
      App.render();
    };
    m = UI.modal({
      title: isNew ? '농가 직접 추가' : '농가 정보 수정',
      body,
      width: '680px',
      footer: [h('button', { class: 'btn', onclick: () => m.close() }, '취소'), h('button', { class: 'btn primary', onclick: save }, '저장')],
    });
  }
  App.openFarmEditor = openFarmEditor;

  // ---------------------------------------------------------- 엑셀 가져오기 ---
  async function importExcel(ev, kind) {
    const file = await UI.pickFile('.xlsx,.xls,.xlsm,.csv');
    if (!file) return;
    let wbData;
    try {
      wbData = await FM.Excel.readFile(file);
    } catch (e) {
      console.error(e);
      return UI.toast('엑셀 파일을 읽지 못했어요: ' + e.message, 'error', 5000);
    }
    if (!wbData.sheets.length) return UI.toast('시트가 없는 파일이에요.', 'warn');
    showImportModal(ev, { kind, wbData });
  }

  function copyFromEvent(ev) {
    const others = App.sortedEvents().filter((e) => e !== ev && e.farms.length);
    if (!others.length) return UI.toast('명단이 들어 있는 다른 일정이 없어요.', 'warn');
    others.sort((a, b) => (a.venueId === ev.venueId ? 0 : 1) - (b.venueId === ev.venueId ? 0 : 1));
    let m = null;
    const body = h(
      'div',
      { class: 'pick-list' },
      h('p', { class: 'muted' }, '명단을 가져올 일정을 고르세요. 같은 장소의 일정이 위에 있어요.'),
      others.map((o) =>
        h(
          'button',
          {
            class: 'pick-item',
            onclick: () => {
              m.close();
              showImportModal(ev, { kind: 'add', fromEvent: o });
            },
          },
          h('span', { class: 'venue-dot', style: { background: App.venue(o.venueId).color } }),
          h('strong', null, App.venue(o.venueId).name + ' ' + o.title),
          h('span', { class: 'muted' }, FM.fmtRange(o.days) + ' · ' + o.farms.length + '곳')
        )
      )
    );
    m = UI.modal({ title: '다른 일정에서 명단 가져오기', body, width: '520px' });
  }

  function showImportModal(ev, opt) {
    const venue = App.venue(ev.venueId);
    const S = {
      sheet: 0,
      headerRow: 0,
      map: {},
      dayCols: {},
      onlyVenue: true,
      dup: 'update',
      replace: false,
      excluded: new Set(),
      showMap: false,
    };
    const fromExcel = !!opt.wbData;
    if (fromExcel) {
      // 행이 가장 많은 시트를 기본으로
      let best = 0;
      opt.wbData.sheets.forEach((s, i) => {
        if (s.rows.length > opt.wbData.sheets[best].rows.length) best = i;
      });
      S.sheet = best;
    }
    const detect = () => {
      const rows = opt.wbData.sheets[S.sheet].rows;
      const d = FM.Excel.detectHeader(rows);
      S.headerRow = d.headerRow;
      S.map = d.map;
      S.dayCols = FM.Excel.detectDayColumns(rows[S.headerRow] || [], ev.days);
    };
    if (fromExcel) detect();

    const venueMatch = (place) => {
      if (!place) return true;
      const p = String(place).replace(/\s/g, '');
      return p.includes(venue.short) || venue.name.includes(p) || p.includes(venue.name);
    };

    function candidates() {
      let list;
      if (fromExcel) list = FM.Excel.rowsToFarms(opt.wbData.sheets[S.sheet].rows, S.headerRow, S.map, S.dayCols);
      else
        list = opt.fromEvent.farms.map((f, i) => ({
          data: { no: f.no, sido: f.sido, sigungu: f.sigungu, name: f.name, owner: f.owner, phone: f.phone, category: f.category, items: f.items, isNew: f.isNew, place: f.place, power: f.power, memo: f.memo, tags: f.tags, forms: f.forms, tagsManual: f.tagsManual },
          dayVals: {},
          rowNo: i + 1,
        }));
      for (const c of list) {
        c.existing = ev.farms.find((f) => FM.isSameFarm(f, c.data)) || null;
        c.otherVenue = fromExcel && S.map.place != null && !venueMatch(c.data.place);
      }
      return list;
    }

    let m = null;
    const body = h('div', { class: 'import' });
    const footer = h('div', { class: 'row gap' });

    function draw() {
      UI.clear(body);
      UI.clear(footer);
      const cands = candidates();
      const hasPlace = fromExcel && S.map.place != null;
      const included = cands.filter((c, i) => !S.excluded.has(i) && !(hasPlace && S.onlyVenue && c.otherVenue));

      if (fromExcel) {
        const sh = opt.wbData.sheets[S.sheet];
        const header = sh.rows[S.headerRow] || [];
        const colName = (i) => (i == null || i < 0 ? '(없음)' : String.fromCharCode(65 + (i % 26)) + '열 「' + (header[i] || '') + '」');
        body.appendChild(
          h(
            'div',
            { class: 'imp-sec' },
            h('h4', null, '1. 파일 확인'),
            h(
              'div',
              { class: 'row gap wrap' },
              h('span', null, '📄 ' + opt.wbData.fileName),
              opt.wbData.sheets.length > 1
                ? h(
                    'select',
                    {
                      class: 'input',
                      onchange: (e) => {
                        S.sheet = +e.target.value;
                        S.excluded.clear();
                        detect();
                        draw();
                      },
                    },
                    opt.wbData.sheets.map((s, i) => h('option', { value: i, selected: i === S.sheet }, '시트: ' + s.name + ' (' + s.rows.length + '행)'))
                  )
                : null,
              h('span', { class: 'muted small' }, '자동 인식: ' + FM.Excel.FIELDS.filter((f) => S.map[f.key] != null).map((f) => f.label).join(' · ')),
              h(
                'button',
                {
                  class: 'btn small ghost',
                  onclick: () => {
                    S.showMap = !S.showMap;
                    draw();
                  },
                },
                S.showMap ? '열 설정 닫기' : '열이 잘못 잡혔나요? 열 직접 고르기'
              )
            ),
            S.map.name == null ? h('p', { class: 'warn-text' }, '⚠ 「농가명」 열을 찾지 못했어요. 「열 직접 고르기」에서 골라 주세요.') : null,
            S.showMap
              ? h(
                  'div',
                  { class: 'map-grid' },
                  h(
                    'label',
                    { class: 'field' },
                    h('span', null, '제목(머리글) 줄'),
                    h(
                      'select',
                      {
                        class: 'input',
                        onchange: (e) => {
                          S.headerRow = +e.target.value;
                          S.map = FM.Excel.mapHeader(sh.rows[S.headerRow] || []);
                          S.dayCols = FM.Excel.detectDayColumns(sh.rows[S.headerRow] || [], ev.days);
                          draw();
                        },
                      },
                      sh.rows.slice(0, 15).map((r, i) => h('option', { value: i, selected: i === S.headerRow }, i + 1 + '행: ' + r.filter(Boolean).slice(0, 5).join(', ')))
                    )
                  ),
                  FM.Excel.FIELDS.map((f) =>
                    h(
                      'label',
                      { class: 'field' },
                      h('span', null, f.label),
                      h(
                        'select',
                        {
                          class: 'input',
                          onchange: (e) => {
                            const v = +e.target.value;
                            if (v < 0) delete S.map[f.key];
                            else S.map[f.key] = v;
                            draw();
                          },
                        },
                        h('option', { value: -1 }, '(없음)'),
                        header.map((_, i) => h('option', { value: i, selected: S.map[f.key] === i }, colName(i)))
                      )
                    )
                  )
                )
              : null
          )
        );
      }

      // 2. 참여 날짜
      body.appendChild(
        h(
          'div',
          { class: 'imp-sec' },
          h('h4', null, (fromExcel ? '2' : '1') + '. 참여 날짜'),
          h('p', { class: 'muted small' }, '가져오는 농가를 어느 날 참여로 체크할지 정해요. (나중에 명단에서 하나씩 바꿀 수 있어요)'),
          h(
            'div',
            { class: 'row gap wrap' },
            ev.days.map((d) => {
              const header = fromExcel ? opt.wbData.sheets[S.sheet].rows[S.headerRow] || [] : [];
              const cur = S.dayCols[d.id];
              return h(
                'label',
                { class: 'field inline' },
                h('span', null, `${FM.weekday(d.date)} ${FM.fmtDay(d.date)}`),
                h(
                  'select',
                  {
                    class: 'input',
                    onchange: (e) => {
                      const v = e.target.value;
                      if (v === 'all') delete S.dayCols[d.id];
                      else S.dayCols[d.id] = v === 'none' ? -1 : +v;
                      draw();
                    },
                  },
                  h('option', { value: 'all', selected: cur == null }, '모두 참여'),
                  h('option', { value: 'none', selected: cur === -1 }, '참여 안 함'),
                  header.map((hd, i) => (hd ? h('option', { value: i, selected: cur === i }, '엑셀 「' + hd + '」 열 값 사용') : null))
                )
              );
            })
          )
        )
      );

      // 3. 농가 목록
      const nNew = included.filter((c) => !c.existing).length;
      const nDup = included.length - nNew;
      body.appendChild(
        h(
          'div',
          { class: 'imp-sec' },
          h('h4', null, (fromExcel ? '3' : '2') + '. 가져올 농가 확인'),
          h(
            'div',
            { class: 'row gap wrap' },
            hasPlace
              ? h(
                  'label',
                  { class: 'check' },
                  h('input', {
                    type: 'checkbox',
                    checked: S.onlyVenue,
                    onchange: (e) => {
                      S.onlyVenue = e.target.checked;
                      draw();
                    },
                  }),
                  `「장소」가 ${venue.short}인 농가만 (${cands.filter((c) => !c.otherVenue).length}/${cands.length}곳)`
                )
              : null,
            nDup
              ? h(
                  'label',
                  { class: 'field inline' },
                  h('span', null, `이미 있는 농가 ${nDup}곳`),
                  h(
                    'select',
                    {
                      class: 'input',
                      onchange: (e) => {
                        S.dup = e.target.value;
                      },
                    },
                    h('option', { value: 'update', selected: S.dup === 'update' }, '새 정보로 갱신'),
                    h('option', { value: 'skip', selected: S.dup === 'skip' }, '건너뛰기')
                  )
                )
              : null,
            opt.kind === 'base' && ev.farms.length
              ? h(
                  'label',
                  { class: 'check warn-text' },
                  h('input', {
                    type: 'checkbox',
                    checked: S.replace,
                    onchange: (e) => {
                      S.replace = e.target.checked;
                      draw();
                    },
                  }),
                  `기존 명단을 이 파일로 교체 (파일에 없는 농가 ${ev.farms.filter((f) => !included.some((c) => c.existing === f)).length}곳 삭제)`
                )
              : null
          ),
          h(
            'div',
            { class: 'table-wrap small-table' },
            h(
              'table',
              { class: 'roster compact' },
              h('thead', null, h('tr', null, h('th', null, h('input', {
                type: 'checkbox',
                title: '전체 선택',
                checked: S.excluded.size === 0,
                onchange: (e) => {
                  if (e.target.checked) S.excluded.clear();
                  else cands.forEach((_, i) => S.excluded.add(i));
                  draw();
                },
              })), h('th', null, '행'), h('th', null, '농가명'), h('th', null, '대표자'), h('th', null, '품목군'), h('th', null, '신청품목'), h('th', null, '장소'), h('th', null, '⚡kW'), h('th', null, '상태'))),
              h(
                'tbody',
                null,
                cands.map((c, i) => {
                  const hidden = hasPlace && S.onlyVenue && c.otherVenue;
                  const on = !S.excluded.has(i) && !hidden;
                  return h(
                    'tr',
                    { class: on ? '' : 'absent' },
                    h('td', null, h('input', {
                      type: 'checkbox',
                      checked: on,
                      disabled: hidden,
                      onchange: (e) => {
                        if (e.target.checked) S.excluded.delete(i);
                        else S.excluded.add(i);
                        draw();
                      },
                    })),
                    h('td', { class: 'muted' }, c.rowNo),
                    h('td', null, c.data.name),
                    h('td', null, c.data.owner),
                    h('td', null, c.data.category),
                    h('td', { class: 'td-items' }, c.data.items),
                    h('td', null, c.data.place),
                    h('td', { class: 'nowrap' }, FM.Power.kw(c.data) ? FM.Power.fmt(FM.Power.kw(c.data)) : ''),
                    h('td', null, hidden ? h('span', { class: 'badge b-past' }, '다른 장소') : c.existing ? h('span', { class: 'badge b-future' }, '이미 있음') : h('span', { class: 'badge b-today' }, '새 농가'))
                  );
                })
              )
            )
          )
        )
      );

      footer.appendChild(h('span', { class: 'muted' }, `새 농가 ${nNew}곳 · 이미 있는 농가 ${nDup}곳`));
      footer.appendChild(h('button', { class: 'btn', onclick: () => m.close() }, '취소'));
      footer.appendChild(
        h(
          'button',
          {
            class: 'btn primary',
            disabled: !included.length || (fromExcel && S.map.name == null),
            onclick: () => apply(included),
          },
          `${included.length}곳 가져오기`
        )
      );
    }

    function apply(included) {
      const st = App.settings();
      let added = 0;
      let updated = 0;
      const touched = new Set();
      for (const c of included) {
        const dayVals = {};
        for (const d of ev.days) {
          const col = S.dayCols[d.id];
          dayVals[d.id] = col == null ? true : col === -1 ? false : !!c.dayVals[d.id];
        }
        if (c.existing) {
          touched.add(c.existing.id);
          if (S.dup === 'skip') continue;
          for (const [k, v] of Object.entries(c.data)) if (v !== '' && v != null && k !== 'tags' && k !== 'forms' && k !== 'tagsManual') c.existing[k] = v;
          for (const d of ev.days) if (dayVals[d.id]) c.existing.days[d.id] = true;
          if (!c.existing.tagsManual) FM.Sim.refreshTags([c.existing], st);
          updated++;
        } else {
          const f = FM.newFarm(Object.assign({}, c.data));
          for (const d of ev.days) if (dayVals[d.id]) f.days[d.id] = true;
          if (!f.tagsManual || !Array.isArray(f.tags)) {
            f.tagsManual = false;
            FM.Sim.refreshTags([f], st);
          }
          ev.farms.push(f);
          touched.add(f.id);
          added++;
        }
      }
      let removed = 0;
      if (opt.kind === 'base' && S.replace) {
        const gone = ev.farms.filter((f) => !touched.has(f.id)).map((f) => f.id);
        removed = gone.length;
        removeFarms(ev, gone);
      }
      m.close(true);
      App.changed();
      App.render();
      UI.toast(`가져오기 완료 — 새로 ${added}곳 · 갱신 ${updated}곳` + (removed ? ` · 삭제 ${removed}곳` : ''), 'ok', 4000);
    }

    m = UI.modal({
      title: fromExcel ? (opt.kind === 'base' ? '엑셀 기본 명단 넣기' : '엑셀 추가 명단 넣기') : `「${App.venue(opt.fromEvent.venueId).short} ${opt.fromEvent.title}」 명단 가져오기`,
      body,
      footer,
      width: '980px',
      className: 'wide',
      autofocus: false,
    });
    draw();
  }

  // ============================================================ 저장·출력 ===
  function renderExport(container, ev) {
    const venue = App.venue(ev.venueId);
    const base = UI.safeFileName(`농부의시장_${venue.short}_${ev.title}`);
    const card = (icon, title, desc, buttons) => h('div', { class: 'export-card' }, h('div', { class: 'ex-icon' }, icon), h('div', { class: 'ex-body' }, h('h3', null, title), h('p', null, desc), h('div', { class: 'row gap wrap' }, buttons)));
    container.appendChild(
      h(
        'div',
        { class: 'export-grid' },
        card('📊', '엑셀로 저장', '날짜별 배치도(색깔 칸) · 부스 목록 · 참여 명단 · 검수 결과가 시트별로 들어간 엑셀 파일이에요.', [
          h('button', { class: 'btn primary', onclick: () => exportExcel(ev, base) }, '📊 배치도 엑셀 저장'),
        ]),
        card(
          '🖼',
          '배치도 그림(PNG) 저장',
          '카톡이나 문자로 보내기 좋은 그림 파일이에요. 날짜마다 따로 저장돼요.',
          ev.days.map((d) => h('button', { class: 'btn', onclick: () => exportPng(ev, d, base, false) }, `🖼 ${FM.weekday(d.date)} ${FM.fmtDay(d.date)}`)).concat(
            ev.days.map((d) => h('button', { class: 'btn ghost small', onclick: () => exportPng(ev, d, base, true) }, `검수 선 포함 ${FM.weekday(d.date)}`))
          )
        ),
        card(
          '🖨',
          '인쇄 / PDF',
          '현장에 붙일 배치도를 A4 가로로 인쇄해요. 인쇄 창에서 「PDF로 저장」을 고르면 PDF 파일이 돼요.',
          ev.days.map((d) => h('button', { class: 'btn', onclick: () => printDay(ev, d) }, `🖨 ${FM.weekday(d.date)} ${FM.fmtDay(d.date)} 인쇄`))
        ),
        card('💾', '공유용 파일로 저장 (팀원에게 보내기)', '지금까지의 모든 일정·명단·배치도가 담긴 HTML 파일을 만들어요. 받은 사람은 더블클릭만 하면 같은 화면이 열리고 이어서 작업할 수 있어요.', [
          h('button', { class: 'btn primary', onclick: () => App.saveShareFile() }, '💾 공유용 파일로 저장'),
        ])
      )
    );
  }

  async function exportExcel(ev, base) {
    try {
      UI.toast('엑셀 파일을 만드는 중…');
      const blob = await FM.Excel.exportEventWorkbook(App.state, ev);
      UI.download(blob, base + '_배치도.xlsx');
    } catch (e) {
      console.error(e);
      UI.toast('엑셀 저장 실패: ' + e.message, 'error', 5000);
    }
  }
  App.exportExcel = exportExcel;

  function exportPng(ev, day, base, showLines) {
    const cv = FM.Excel.renderLayoutCanvas({ ev, day, venue: App.venue(ev.venueId), settings: App.settings(), showLines });
    cv.toBlob((blob) => UI.download(blob, `${base}_${FM.fmtDay(day.date).replace(/[().]/g, '')}${showLines ? '_검수' : ''}_배치도.png`), 'image/png');
  }
  App.exportPng = exportPng;

  function printDay(ev, day) {
    const venue = App.venue(ev.venueId);
    const cv = FM.Excel.renderLayoutCanvas({ ev, day, venue, settings: App.settings(), showLines: false });
    const pr = UI.clear(document.getElementById('printRoot'));
    const L = day.layout;
    const nums = FM.boothNumbers(L);
    const farmById = Object.fromEntries(ev.farms.map((f) => [f.id, f]));
    const rows = FM.boothKeys(L).map((k) => {
      const f = farmById[L.assign[k]];
      return h('tr', null, h('td', null, nums[k]), h('td', null, f ? f.name : '(빈 자리)'), h('td', null, f ? f.owner : ''), h('td', null, f ? f.phone : ''), h('td', null, f ? f.category : ''), h('td', null, f ? f.items : ''));
    });
    const img = h('img', { class: 'print-img', alt: '배치도' });
    pr.appendChild(h('div', { class: 'print-page' }, img));
    pr.appendChild(
      h(
        'div',
        { class: 'print-page' },
        h('h2', null, `${venue.name} ${ev.title} — ${day.round ? day.round + ' ' : ''}${FM.fmtDay(day.date)} 부스 목록`),
        h('table', { class: 'print-table' }, h('thead', null, h('tr', null, ['부스', '농가명', '대표자', '연락처', '품목군', '신청품목'].map((t) => h('th', null, t)))), h('tbody', null, rows))
      )
    );
    img.onload = () => {
      document.body.classList.add('printing');
      setTimeout(() => {
        window.print();
        setTimeout(() => document.body.classList.remove('printing'), 500);
      }, 100);
    };
    img.src = cv.toDataURL('image/png');
  }
  App.printDay = printDay;

  // ======================================================= 공유용 파일 ===
  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const isSingleFile = () => !document.querySelector('script[src]') && FM.PRISTINE_HTML && FM.EMBED_RE.test(FM.PRISTINE_HTML);

  App.saveShareFile = function () {
    const st = App.state;
    st.meta.exportId = FM.uid('x');
    st.meta.exportedAt = new Date().toISOString();
    saveSoon.flush();
    if (!isSingleFile()) {
      UI.download(new Blob([JSON.stringify(st)], { type: 'application/json' }), `농부의시장_배치도_작업_${stamp()}.json`);
      UI.toast('개발용 화면이라 작업 데이터(JSON)로 저장했어요. 배포용 HTML 파일에서는 HTML로 저장돼요.', 'warn', 5000);
      return;
    }
    const html = FM.embedStateInHtml(FM.PRISTINE_HTML, st);
    const fileName = `농부의시장_배치도_${stamp()}.html`;
    UI.download(new Blob([html], { type: 'text/html;charset=utf-8' }), fileName);
    let m = null;
    m = UI.modal({
      title: '💾 공유용 파일을 저장했어요',
      width: '520px',
      body: h(
        'div',
        { class: 'guide' },
        h('p', null, h('b', null, fileName), ' 파일이 다운로드 폴더에 저장됐어요.'),
        h('ol', null, h('li', null, '이 파일을 카카오톡·메일로 팀원에게 보내세요.'), h('li', null, '받은 사람은 파일을 ', h('b', null, '더블클릭'), '만 하면 지금 화면 그대로 열려요. (설치 필요 없음)'), h('li', null, '받은 사람이 수정했다면, 다시 「공유용 파일로 저장」해서 돌려받으면 돼요.')),
        h('p', { class: 'muted small' }, '※ 같은 파일을 여러 사람이 동시에 고치면 마지막에 보낸 사람 것만 남아요. 한 사람씩 차례로 작업해 주세요.')
      ),
      footer: [h('button', { class: 'btn primary', onclick: () => m.close() }, '확인')],
    });
  };

  App.openWorkFile = async function () {
    const file = await UI.pickFile('.html,.htm,.json');
    if (!file) return;
    let st;
    try {
      st = FM.parseWorkFile(await file.text());
    } catch (e) {
      return UI.toast('작업 파일을 읽지 못했어요: ' + e.message, 'error', 5000);
    }
    const n = st.events.reduce((a, e) => a + e.farms.length, 0);
    const ok = await UI.confirm(`「${file.name}」의 작업(일정 ${st.events.length}개, 명단 총 ${n}곳)으로 바꿀까요?\n지금 이 컴퓨터의 작업은 백업해 두고, 설정 > 데이터에서 되돌릴 수 있어요.`, { okText: '이 파일로 바꾸기' });
    if (!ok) return;
    FM.backupLocal();
    st.meta.loadedExportId = st.meta.exportId;
    App.state = st;
    App.history = {};
    saveNow();
    App.go('#/');
    UI.toast('작업 파일을 열었어요.', 'ok');
  };

  // ================================================================ 사용법 ===
  App.openHelp = function () {
    let m = null;
    m = UI.modal({
      title: '❓ 사용법 (처음 쓰는 분을 위한 안내)',
      width: '720px',
      body: h(
        'div',
        { class: 'guide' },
        h('h4', null, '0. 파일 열기'),
        h('p', null, '받은 「농부의시장_배치도.html」 파일을 더블클릭하면 크롬/엣지에서 열려요. 인터넷이 없어도 동작해요. 작업은 자동 저장돼요.'),
        h('h4', null, '① 참여 명단'),
        h('ul', null, h('li', null, '일정을 누르고 「📥 엑셀 명단 넣기」로 명단 엑셀을 넣어요. 「장소」 열이 있으면 해당 장소 농가만 골라 줘요.'), h('li', null, '날짜(토/일)별 체크로 참여 여부를 정해요. 취소된 농가는 체크를 풀고, 추가 농가는 「엑셀로 추가 명단 넣기」나 「농가 직접 추가」로 넣어요.'), h('li', null, '⚡ 전력 사용량: 명단 엑셀의 「장소」 바로 뒤 열에 kW 숫자를 적으면 자동으로 읽어요(전력이 큰 농가만 적어도 돼요). 명단 표의 ⚡ 칸이나 농가 수정 창에서 바로 넣고 고칠 수 있어요.')),
        h('h4', null, '② 칸 만들기'),
        h(
          'ul',
          null,
          h('li', null, '격자를 클릭·드래그해서 부스 칸을 만들어요. 한 칸 = 농가 한 곳. 격자 끝까지 칠하면 자동으로 넓어져요.'),
          h('li', null, '위쪽 숫자가 「남은 칸 수」예요. 0이 되면 참여 농가 수와 딱 맞아요.'),
          h('li', null, '부스 앞면(손님 쪽) 방향 ▲▼◀▶ 은 자동으로 정해져요. 틀린 줄은 「➜ 방향」 붓으로 방향을 고르고 그 줄의 부스 하나만 클릭하면 줄 전체가 바뀌어요. 통로 건너 마주 보는 부스는 바로 옆처럼 떨어뜨려요.'),
          h('li', null, '⚡ 전력 구역: 「⚡ 전력 구역」에서 구역 수를 정하고 「자동으로 나누기」를 누르면 간선·분전반 구역(A·B·C…)이 나뉘어요. 구역 용량·발전기 용량을 알면 적어 두세요. 「⚡ 구역」 붓으로 고칠 수 있어요.'),
          h('li', null, '장소마다 모양이 다르니 한 번 만든 모양은 「장소 기본형으로 저장」해 두면 다음 일정에서 불러올 수 있어요.')
        ),
        h('h4', null, '③ 농가 배치'),
        h('ul', null, h('li', null, '「⚡ 자동 배치」를 누르면 비슷한 품목끼리 붙지 않게 자동으로 놓아요. 누를 때마다 다른 배치안이 나와요.'), h('li', null, '꼭 정해진 자리가 있는 농가는 오른쪽 목록에서 검색 → 농가 클릭 → 칸 클릭하면 그 자리에 📌고정돼요. 고정된 농가는 자동 배치해도 안 움직여요.'), h('li', null, '칸을 끌어서 다른 칸에 놓으면 서로 자리가 바뀌어요. 잘못하면 「↶ 되돌리기」(Ctrl+Z).')),
        h('h4', null, '④ 검수'),
        h(
          'ul',
          null,
          h('li', null, '원재료가 같으면(사과↔사과즙, 참깨↔참기름, 포도↔와인) 결과물이 달라도 비슷한 품목으로 봐요. 즙·청·떡·젓갈처럼 같은 형태, 같은 품목군도 함께 봐요.'),
          h('li', null, '가까이 붙거나 통로 건너 마주 보는 곳을 선으로 이어 보여줘요. 선 색이 다르면 다른 원재료·형태예요.'),
          h('li', null, '위험(빨강) = 같은 원재료가 바로 옆·대각선·마주봄, 주의(주황) = 2칸 거리 등. 「🩹 문제 자리만 고치기」로 최소한만 옮겨 해결할 수 있어요.'),
          h('li', null, '⚡ 전력 분산: 구역별 kW 합계와 목표·용량을 막대로 보여주고, 전력 큰 농가끼리 붙은 곳을 알려줘요. 자동 배치는 전력까지 함께 맞춰요.')
        ),
        h('h4', null, '⑤ 저장·출력·공유'),
        h('ul', null, h('li', null, '엑셀(색깔 배치도), 그림(PNG), 인쇄/PDF로 내보낼 수 있어요. 배치가 끝나면 배치 화면 위의 「🖼 그림 저장」으로 바로 저장해도 돼요.'), h('li', null, h('b', null, '팀원과 나누기: 「💾 공유용 파일로 저장」'), ' → 생긴 HTML 파일을 보내면 받은 사람은 더블클릭으로 같은 작업을 이어서 해요.')),
        h('h4', null, '일정 바꾸기'),
        h('p', null, '처음 화면의 일정 카드 「⋯ → 일정 수정」에서 날짜를 바꾸거나 「앞에 금요일 추가」를 할 수 있어요. 새 일정은 「＋ 일정 추가」.'),
        h('p', { class: 'muted small' }, '버전: ' + (window.FM_BUILD || '개발용'))
      ),
      footer: [h('button', { class: 'btn primary', onclick: () => m.close() }, '알겠어요')],
    });
  };

  // ================================================================== 설정 ===
  App.openSettings = function () {
    const st = App.state.settings;
    const draft = FM.clone(st);
    const venues = FM.clone(App.state.venues);
    let m = null;
    const rawTa = h('textarea', { class: 'input mono', rows: 12, spellcheck: 'false' });
    rawTa.value = draft.rawDict;
    const formTa = h('textarea', { class: 'input mono', rows: 8, spellcheck: 'false' });
    formTa.value = draft.formDict;
    const slider = (label, key, min, max, step, fmt) => {
      const out = h('b', null, fmt(draft[key]));
      return h(
        'label',
        { class: 'field' },
        h('span', null, label, ' ', out),
        h('input', {
          type: 'range',
          min,
          max,
          step,
          value: draft[key],
          oninput: (e) => {
            draft[key] = +e.target.value;
            out.textContent = fmt(draft[key]);
          },
        })
      );
    };
    const sel = (label, key, opts, help) =>
      h(
        'label',
        { class: 'field' },
        h('span', null, label),
        h(
          'select',
          { class: 'input', onchange: (e) => (draft[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value) },
          opts.map(([v, t]) => h('option', { value: v, selected: draft[key] === v }, t))
        ),
        help ? h('small', { class: 'muted' }, help) : null
      );

    const venueBox = h('div', { class: 'venue-edit' });
    const drawVenues = () => {
      UI.clear(venueBox);
      venues.forEach((v, i) =>
        venueBox.appendChild(
          h(
            'div',
            { class: 'row gap' },
            h('input', { type: 'color', value: v.color, oninput: (e) => (v.color = e.target.value), title: '색' }),
            h('input', { class: 'input', value: v.name, placeholder: '장소 이름', oninput: (e) => (v.name = e.target.value) }),
            h('input', { class: 'input short', value: v.short, placeholder: '줄임말', title: '엑셀 「장소」 열과 맞춰 볼 때 쓰는 이름', oninput: (e) => (v.short = e.target.value) }),
            h(
              'button',
              {
                class: 'icon-btn',
                title: '장소 삭제',
                'aria-label': '장소 삭제',
                disabled: App.state.events.some((e) => e.venueId === v.id),
                onclick: () => {
                  venues.splice(i, 1);
                  drawVenues();
                },
              },
              '🗑'
            )
          )
        )
      );
      venueBox.appendChild(
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              venues.push({ id: FM.uid('v'), name: '새 장소', short: '새장소', color: '#cde8c9', template: null });
              drawVenues();
            },
          },
          '＋ 장소 추가'
        )
      );
    };
    drawVenues();

    const body = h(
      'div',
      { class: 'settings' },
      h('h4', null, '비슷한 품목 판단 기준'),
      h(
        'p',
        { class: 'muted small' },
        '두 농가의 유사도 = 같은 원재료(+A, 결과물이 달라도) + 같은 제품 형태(+B) + 같은 품목군(+C). 근접 위험도 = 유사도 × 거리(바로 옆·마주봄 1, 2칸 0.5 …). 자동 배치는 이 값이 큰 쌍부터 없애고, 남은 쌍도 최대한 멀리 떨어뜨려요.'
      ),
      h(
        'div',
        { class: 'grid3' },
        slider('A. 같은 원재료', 'wRaw', 0, 1, 0.05, (v) => v.toFixed(2)),
        slider('B. 같은 제품 형태', 'wForm', 0, 1, 0.05, (v) => v.toFixed(2)),
        slider('C. 같은 품목군', 'wCat', 0, 1, 0.05, (v) => v.toFixed(2))
      ),
      h(
        'div',
        { class: 'grid2' },
        sel(
          '떨어뜨리는 거리 (자동 배치·검수가 살피는 범위)',
          'radius',
          [
            [2, '2칸까지'],
            [4, '4칸까지'],
            [6, '6칸까지 (기본)'],
            [99, '배치도 전체'],
          ],
          '넓게 살필수록 같은 원재료 농가가 더 멀리 흩어져요.'
        ),
        sel(
          '위·아래 칸 거리',
          'vScale',
          [
            [1, '좌우와 같게 (기본)'],
            [1.5, '1.5배 (위아래가 조금 멀다)'],
            [2, '2배 (위아래 줄이 등을 맞댄 부스)'],
          ],
          '줄 배치에서 위아래 칸이 서로 등을 맞대고 있다면 2배를 고르세요.'
        )
      ),
      h('h4', null, '⚡ 전력 분산'),
      h(
        'p',
        { class: 'muted small' },
        '전력 사용량(kW)이 입력된 농가는 ① 큰 농가끼리 붙지 않게(같은 분기 회로), ② 전력 구역(간선·분전반)마다 합계가 고르게, ③ 구역 용량을 넘지 않게 배치해요. 구역은 ② 칸 만들기의 「⚡ 전력 구역」에서 나눠요.'
      ),
      h('div', { class: 'grid2' }, slider('고전력 농가끼리 떨어뜨리기', 'wPow', 0, 1.5, 0.1, (v) => v.toFixed(1)), slider('구역별 합계 고르게', 'wZone', 0, 10, 0.5, (v) => v.toFixed(1))),
      h('h4', null, '원재료 사전'),
      h(
        'p',
        { class: 'muted small' },
        '한 줄에 「계열 > 원재료: 키워드, 키워드」. 신청품목 낱말에 키워드가 있으면 그 원재료로 봐요(괄호 안 재료 포함). 원재료 뒤 ',
        h('code', null, '(0.5)'),
        ' = 흔한 재료라 약하게, ',
        h('code', null, '@계열: 0.4'),
        ' = 원재료는 달라도 같은 계열이면 이만큼 비슷. 키워드: ',
        h('code', null, '=배'),
        ' 정확히 · ',
        h('code', null, '^묵'),
        ' ~로 시작 · ',
        h('code', null, '청$'),
        ' ~로 끝남 · ',
        h('code', null, '!김치'),
        ' 제외.'
      ),
      rawTa,
      h('h4', null, '제품 형태 사전'),
      h('p', { class: 'muted small' }, '한 줄에 「형태: 키워드, 키워드」. 원재료가 달라도 즙·청·떡·젓갈처럼 같은 형태면 손님이 겹친다고 봐요. 형태 뒤 (0.5) = 흔한 부가 상품이라 약하게.'),
      formTa,
      h(
        'div',
        { class: 'row gap' },
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              rawTa.value = FM.DEFAULT_RAW_DICT;
              formTa.value = FM.DEFAULT_FORM_DICT;
            },
          },
          '두 사전 모두 기본값으로 되돌리기'
        )
      ),
      h('h4', null, '장소'),
      venueBox,
      h('h4', null, '데이터'),
      h(
        'div',
        { class: 'row gap wrap' },
        h('button', { class: 'btn', onclick: () => App.saveShareFile() }, '💾 공유용 파일로 저장'),
        h('button', { class: 'btn', onclick: () => UI.download(new Blob([JSON.stringify(App.state)], { type: 'application/json' }), `농부의시장_배치도_백업_${stamp()}.json`) }, '⬇ 백업(JSON) 저장'),
        h('button', { class: 'btn', onclick: () => App.openWorkFile() }, '📂 작업 파일 열기'),
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              let raw = null;
              try {
                raw = localStorage.getItem(FM.BACKUP_KEY);
              } catch (e) {
                raw = null;
              }
              if (!raw) return UI.toast('되돌릴 백업이 없어요.', 'warn');
              if (!(await UI.confirm('파일을 열기 직전의 작업으로 되돌릴까요? 지금 작업과 서로 바뀌어요.', { okText: '되돌리기' }))) return;
              const cur = JSON.stringify(App.state);
              App.state = FM.normalizeState(JSON.parse(raw));
              localStorage.setItem(FM.BACKUP_KEY, cur);
              App.history = {};
              saveNow();
              m.close();
              App.go('#/');
              UI.toast('직전 작업으로 되돌렸어요.', 'ok');
            },
          },
          '↩ 직전 백업으로 되돌리기'
        ),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: async () => {
              if (!(await UI.confirm('모든 일정·명단·배치도를 지우고 처음 상태로 돌릴까요? (지금 작업은 백업돼요)', { danger: true, okText: '초기화' }))) return;
              FM.backupLocal();
              App.state = FM.createDefaultState();
              App.history = {};
              saveNow();
              m.close();
              App.go('#/');
            },
          },
          '🗑 전체 초기화'
        )
      )
    );

    const save = () => {
      const kwChanged = rawTa.value !== st.rawDict || formTa.value !== st.formDict;
      draft.rawDict = rawTa.value;
      draft.formDict = formTa.value;
      Object.assign(st, draft);
      App.state.venues = venues.map((v) => Object.assign({}, v, { template: (App.state.venues.find((o) => o.id === v.id) || {}).template || null }));
      if (kwChanged) for (const ev of App.state.events) FM.Sim.refreshTags(ev.farms, st);
      m.close();
      App.changed();
      App.render();
      UI.toast('설정을 저장했어요.' + (kwChanged ? ' 원재료·형태를 다시 계산했어요 (직접 고친 농가는 그대로).' : ''), 'ok');
    };
    m = UI.modal({
      title: '⚙ 설정',
      body,
      width: '760px',
      autofocus: false,
      footer: [
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              const keep = { rawDict: rawTa.value, formDict: formTa.value, zoom: draft.zoom, zoomEdit: draft.zoomEdit };
              Object.assign(draft, FM.clone(FM.DEFAULT_SETTINGS), keep);
              m.close();
              Object.assign(st, draft);
              App.changed();
              App.openSettings();
            },
          },
          '기준값 기본으로'
        ),
        h('button', { class: 'btn', onclick: () => m.close() }, '취소'),
        h('button', { class: 'btn primary', onclick: save }, '저장'),
      ],
    });
  };

  // ================================================================ 시작 ===
  function boot() {
    // 공유용 파일 저장 시 쓸 원본 HTML (화면을 그리기 전에 복사)
    FM.PRISTINE_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    const embedded = FM.readEmbeddedState();
    const local = FM.loadLocalState();
    let ask = false;
    if (embedded && !local) {
      App.state = embedded;
      App.state.meta.loadedExportId = embedded.meta.exportId;
    } else if (embedded && local && embedded.meta.exportId && local.meta.loadedExportId !== embedded.meta.exportId && local.meta.exportId !== embedded.meta.exportId) {
      App.state = local;
      ask = true;
    } else {
      App.state = local || FM.createDefaultState();
    }
    for (const ev of App.state.events) FM.Sim.refreshTags(ev.farms, App.state.settings);
    App.render();
    saveNow();
    if (embedded && !local) UI.toast('파일에 담긴 작업을 불러왔어요.', 'ok', 3500);
    if (ask) askEmbedded(embedded, local);
    document.addEventListener('keydown', (e) => FM.LayoutView && FM.LayoutView.onKey && FM.LayoutView.onKey(e));
  }

  function askEmbedded(embedded, local) {
    const fmt = (iso) => {
      if (!iso) return '알 수 없음';
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    let m = null;
    const useFile = () => {
      FM.backupLocal();
      App.state = embedded;
      App.state.meta.loadedExportId = embedded.meta.exportId;
      for (const ev of App.state.events) FM.Sim.refreshTags(ev.farms, App.state.settings);
      App.history = {};
      saveNow();
      m.close();
      App.go('#/');
      UI.toast('받은 파일의 작업을 열었어요. (이전 작업은 설정 > 데이터에서 되돌릴 수 있어요)', 'ok', 4500);
    };
    const keepLocal = () => {
      App.state.meta.loadedExportId = embedded.meta.exportId;
      saveNow();
      m.close();
    };
    m = UI.modal({
      title: '📂 이 파일에 작업 내용이 들어 있어요',
      width: '540px',
      autofocus: false,
      body: h(
        'div',
        { class: 'guide' },
        h('p', null, '이 컴퓨터에도 이전에 하던 작업이 있어요. 어떤 것을 열까요?'),
        h('ul', null, h('li', null, `받은 파일의 작업 — ${fmt(embedded.meta.exportedAt)} 저장 · 일정 ${embedded.events.length}개 · 명단 ${embedded.events.reduce((a, e) => a + e.farms.length, 0)}곳`), h('li', null, `이 컴퓨터의 작업 — ${fmt(local.meta.updatedAt)} 수정 · 일정 ${local.events.length}개 · 명단 ${local.events.reduce((a, e) => a + e.farms.length, 0)}곳`)),
        h('p', { class: 'muted small' }, '받은 파일을 열어도 이 컴퓨터의 작업은 백업되어 설정 > 데이터 > 「직전 백업으로 되돌리기」로 다시 꺼낼 수 있어요.')
      ),
      footer: [h('button', { class: 'btn', onclick: keepLocal }, '이 컴퓨터 작업 계속'), h('button', { class: 'btn primary', onclick: useFile }, '받은 파일 열기 (추천)')],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
