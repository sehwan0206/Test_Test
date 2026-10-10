/* 작은 DOM/UI 헬퍼 모음 (프레임워크 없이 동작) */
(function (root) {
  'use strict';
  const FM = root.FM;
  const UI = (FM.UI = {});

  /** h('div', {class:'x', onclick: fn}, child, ...) */
  UI.h = function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') el[k] = !!v;
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (kid) => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) return kid.forEach(add);
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  };
  const h = UI.h;

  UI.clear = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  UI.debounce = function (fn, ms) {
    let t = null;
    const wrapped = function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(() => fn.apply(null, args), ms);
    };
    wrapped.flush = () => {
      clearTimeout(t);
      fn();
    };
    return wrapped;
  };

  // ------------------------------------------------------------------ 토스트 ---
  UI.toast = function (msg, type, ms) {
    const rootEl = document.getElementById('toastRoot');
    const el = h('div', { class: 'toast ' + (type || 'info') }, msg);
    rootEl.appendChild(el);
    while (rootEl.children.length > 2) rootEl.removeChild(rootEl.firstChild);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, ms || 2600);
  };

  // ------------------------------------------------------------------- 모달 ---
  const modalStack = [];
  UI.modal = function (opts) {
    const rootEl = document.getElementById('modalRoot');
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      back.remove();
      const i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
      if (opts.onClose) opts.onClose(result);
    };
    const box = h(
      'div',
      { class: 'modal ' + (opts.className || ''), role: 'dialog', 'aria-modal': 'true', style: opts.width ? { width: opts.width } : null },
      h('div', { class: 'modal-head' }, h('h3', null, opts.title || ''), h('button', { class: 'icon-btn', title: '닫기', 'aria-label': '닫기', onclick: () => close(null) }, '✕')),
      h('div', { class: 'modal-body' }, opts.body),
      opts.footer ? h('div', { class: 'modal-foot' }, opts.footer) : null
    );
    const back = h('div', { class: 'modal-back' }, box);
    rootEl.appendChild(back);
    const api = { el: box, close };
    modalStack.push(api);
    setTimeout(() => {
      const f = box.querySelector('[autofocus]') || box.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select');
      if (f && opts.autofocus !== false) f.focus();
    }, 30);
    return api;
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStack.length) {
      modalStack[modalStack.length - 1].close(null);
      e.stopPropagation();
    }
  });
  UI.hasModal = () => modalStack.length > 0;

  UI.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let m = null;
      const ok = h('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), onclick: () => m.close(true) }, opts.okText || '확인');
      m = UI.modal({
        title: opts.title || '확인',
        body: h('div', { class: 'confirm-msg' }, message),
        footer: [h('button', { class: 'btn', onclick: () => m.close(false) }, opts.cancelText || '취소'), ok],
        width: '420px',
        autofocus: false,
        onClose: (r) => resolve(!!r),
      });
      setTimeout(() => ok.focus(), 40);
    });
  };

  UI.prompt = function (message, value, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let m = null;
      const input = h('input', { type: 'text', class: 'input', value: value || '', placeholder: opts.placeholder || '' });
      const done = () => m.close(input.value);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && done());
      m = UI.modal({
        title: opts.title || '입력',
        body: h('div', null, h('p', { class: 'muted' }, message), input),
        footer: [h('button', { class: 'btn', onclick: () => m.close(null) }, '취소'), h('button', { class: 'btn primary', onclick: done }, '확인')],
        width: '420px',
        onClose: (r) => resolve(r == null ? null : String(r)),
      });
    });
  };

  // -------------------------------------------------------------- 파일 처리 ---
  UI.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  };

  UI.pickFile = function (accept) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: accept || '', style: { display: 'none' } });
      input.addEventListener('change', () => {
        resolve(input.files && input.files[0] ? input.files[0] : null);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });
  };

  UI.safeFileName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');

  /** 작은 드롭다운 메뉴 */
  UI.menu = function (anchor, items) {
    document.querySelectorAll('.popmenu').forEach((m) => m.remove());
    const rect = anchor.getBoundingClientRect();
    const menu = h(
      'div',
      { class: 'popmenu', style: { top: rect.bottom + window.scrollY + 4 + 'px', left: Math.max(8, rect.right + window.scrollX - 240) + 'px' } },
      items.map((it) =>
        it === '-'
          ? h('div', { class: 'sep' })
          : h(
              'button',
              {
                class: 'popmenu-item' + (it.danger ? ' danger' : ''),
                onclick: () => {
                  menu.remove();
                  it.onClick();
                },
              },
              it.icon ? h('span', { class: 'mi' }, it.icon) : null,
              h('span', null, it.label),
              it.hint ? h('small', null, it.hint) : null
            )
      )
    );
    document.body.appendChild(menu);
    const off = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('pointerdown', off, true);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    return menu;
  };
})(window);
