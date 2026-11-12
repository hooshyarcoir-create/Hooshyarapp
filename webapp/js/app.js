/* ============================================================
   Hooshyar POS — app shell, UI primitives, event delegation, boot
   ============================================================ */
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.formHandlers = App.formHandlers || {};

App.ui = (function () {
  const U = App.util;
  const state = {
    screen:'tables', hallId:null, groupId:'all', orderId:null,
    invTab:'current', invSel:null, invWidth:null, invPrinterId:null,
    payOrderId:null, slotDraft:{}, menuTab:'groups', settingsTab:'general',
    reportRange:'today', productSearch:'', adminSearch:''
  };
  let modalButtons = [];
  let genericSubmit = null;

  const NAV = [
    { screen:'tables',   label:'میزها و سالن',  icon:'grid',     perm:'tables.view' },
    { screen:'order',    label:'سفارش جاری',    icon:'note',     perm:'order.edit' },
    { screen:'invoice',  label:'صورتحساب',      icon:'receipt',  perm:'invoice.view' },
    { screen:'payment',  label:'تسویه',         icon:'wallet',   perm:'payment.settle' },
    { screen:'menu',     label:'منو و کالاها',  icon:'book',     perm:'menu.view' },
    { screen:'reports',  label:'گزارشات',       icon:'chart',    perm:'reports.view' },
    { screen:'settings', label:'تنظیمات',       icon:'settings', perm:null }
  ];
  const TITLES = {
    tables:['میزها و سالن','وضعیت لحظهای میزها و ثبت سفارش'],
    order:['سفارش','انتخاب کالا، توضیحات و ارسال به آشپزخانه'],
    invoice:['صورتحساب و چاپ','چاپ فاکتور روی کاغذ ۶ و ۸ سانتی'],
    payment:['تسویه فاکتور','نقدی، اعتباری، کارتخوان و دنگی'],
    menu:['منو و کالاها','گروهبندی، قیمت و خط چاپ'],
    reports:['گزارشات','فروش، پرداختها و کالاهای پرفروش'],
    settings:['تنظیمات','پیکربندی سامانه و سطوح دسترسی']
  };

  function navItems() {
    return NAV.filter(n => {
      if (n.screen === 'order' && !state.orderId) return false;
      if (n.screen === 'settings') return App.auth.can('settings.manage') || App.auth.can('tables.manage') || App.auth.can('printers.manage') || App.auth.can('users.manage') || App.auth.can('backup.manage') || App.auth.can('menu.manage');
      return !n.perm || App.auth.can(n.perm);
    });
  }
  function defaultScreen() { const n = navItems()[0]; return n ? n.screen : 'tables'; }

  /* -------------------------------- rendering -------------------------------- */
  function render(preserveScroll) {
    const view = document.getElementById('view');
    const scroll = preserveScroll && view ? view.scrollTop : 0;
    const user = App.auth.current();
    const loginEl = document.getElementById('login');
    const shellEl = document.getElementById('shell');
    const splash = document.getElementById('splash');
    if (splash) splash.hidden = true;
    if (!user) {
      shellEl.hidden = true; loginEl.hidden = false;
      loginEl.innerHTML = App.views.login();
      return;
    }
    loginEl.hidden = true; shellEl.hidden = false;

    const d = App.model.D();
    document.getElementById('brand-name').textContent = d.settings.restaurantName;
    document.title = d.settings.restaurantName + ' | هوشیار';
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-role').textContent = App.auth.roleLabel(user);
    document.getElementById('user-avatar').textContent = (user.name || '؟').slice(0,1);

    const items = navItems();
    if (!items.some(n => n.screen === state.screen)) state.screen = defaultScreen();
    const t = TITLES[state.screen] || ['هوشیار',''];
    document.getElementById('page-title').textContent = t[0];
    document.getElementById('page-sub').textContent = t[1];

    document.getElementById('side-nav').innerHTML = items.map(n => {
      const badge = (n.screen === 'payment' || n.screen === 'invoice') ? App.model.openOrders().length : 0;
      return '<button class="nav-item ' + (state.screen===n.screen?'active':'') + '" data-action="nav" data-screen="' + n.screen + '">' +
        U.icon(n.icon) + '<span>' + n.label + '</span>' + (badge ? '<span class="badge accent">' + U.num(badge) + '</span>' : '') + '</button>';
    }).join('');
    const short = { tables:'میزها', invoice:'فاکتور', payment:'تسویه', menu:'منو', settings:'تنظیمات', reports:'گزارش', order:'سفارش' };
    const bottom = ['tables','invoice','payment','menu','settings'].map(s => items.find(n => n.screen===s)).filter(Boolean).slice(0,5);
    document.getElementById('bottom-nav').innerHTML = bottom.map(n =>
      '<button class="' + (state.screen===n.screen?'active':'') + '" data-action="nav" data-screen="' + n.screen + '">' + U.icon(n.icon) + '<span>' + short[n.screen] + '</span></button>').join('');

    const fn = App.views[state.screen] || App.views.tables;
    try { view.innerHTML = fn(); }
    catch (e) { console.error('render error', e); view.innerHTML = '<div class="card"><div class="empty">خطا در نمایش صفحه: ' + U.esc(e.message) + '</div></div>'; }
    view.scrollTop = preserveScroll ? scroll : 0;
  }
  const refresh = () => render(true);
  function go(screen, patch) {
    Object.assign(state, patch || {});
    state.screen = screen;
    const sb = document.querySelector('.sidebar'); if (sb) sb.classList.remove('open');
    render();
  }

  /* --------------------------------- toasts --------------------------------- */
  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'err' ? 'err' : type === 'ok' ? 'ok' : '');
    el.textContent = String(msg);
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, type === 'err' ? 5500 : 3200);
    while (root.children.length > 4) root.firstChild.remove();
  }

  /* --------------------------------- modals --------------------------------- */
  function close() {
    const root = document.getElementById('modal-root');
    root.hidden = true; root.innerHTML = ''; root.onclick = null;
    modalButtons = []; genericSubmit = null;
  }
  function modalButton(i) { return modalButtons[i]; }
  function takeGenericSubmit() { const f = genericSubmit; genericSubmit = null; return f; }

  function modal(o) {
    const root = document.getElementById('modal-root');
    modalButtons = o.buttons || [];
    const buttons = modalButtons.map((b,i) => '<button type="button" class="btn ' + (b.cls||'') + '" data-modal-btn="' + i + '">' + (b.icon?U.icon(b.icon):'') + ' ' + U.esc(b.label) + '</button>').join('');
    root.innerHTML = '<div class="modal ' + (o.size==='wide'?'wide':'') + '">' +
      '<div class="modal-head"><h3>' + U.esc(o.title||'') + '</h3><button type="button" class="icon-btn plain" data-action="modal-close">' + U.icon('x') + '</button></div>' +
      '<div class="modal-body">' + (o.body||'') + '</div>' +
      (buttons ? '<div class="modal-foot">' + buttons + '</div>' : '') + '</div>';
    root.hidden = false;
    root.onclick = (e) => { if (e.target === root) close(); };
  }
  function confirm(msg, onYes, title) {
    modal({ title:title||'تایید عملیات',
      body:'<div style="font-size:13.5px;line-height:1.9">' + U.esc(msg) + '</div>',
      buttons:[{ label:'انصراف', icon:'x', close:true }, { label:'بله، انجام شود', icon:'check', cls:'btn-danger', onClick:() => { close(); onYes(); } }] });
  }

  function renderField(f) {
    const full = f.full ? ' full' : '';
    const req = f.required ? ' required' : '';
    if (f.type === 'note') return '<div class="field full">' + (f.value||'') + '</div>';
    if (f.type === 'multi') {
      const vals = (f.value||[]).map(String);
      return '<div class="field ' + full + '" data-multi="' + U.esc(f.name) + '"><span>' + U.esc(f.label) + '</span>' +
        '<div class="perm-grid">' + (f.options||[]).map(o => '<label class="check-line"><input type="checkbox" name="' + U.esc(f.name) + '" value="' + U.esc(o.value) + '" ' + (vals.indexOf(String(o.value))!==-1?'checked':'') + '> ' + U.esc(o.label) + '</label>').join('') + '</div>' +
        (f.hint ? '<small>' + U.esc(f.hint) + '</small>' : '') + '</div>';
    }
    if (f.type === 'checkbox') {
      return '<div class="field ' + full + '"><label class="check-line"><input type="checkbox" name="' + U.esc(f.name) + '" value="1" ' + (f.value?'checked':'') + '> ' + U.esc(f.label) + '</label>' +
        (f.hint ? '<small>' + U.esc(f.hint) + '</small>' : '') + '</div>';
    }
    let input;
    const common = 'name="' + U.esc(f.name) + '"' + req;
    if (f.type === 'select') input = '<select ' + common + '>' + (f.options||[]).map(o => '<option value="' + U.esc(o.value) + '" ' + (String(o.value)===String(f.value==null?'':f.value)?'selected':'') + '>' + U.esc(o.label) + '</option>').join('') + '</select>';
    else if (f.type === 'textarea') input = '<textarea ' + common + ' placeholder="' + U.esc(f.placeholder||'') + '">' + U.esc(f.value==null?'':f.value) + '</textarea>';
    else if (f.type === 'file') input = '<input type="file" ' + common + ' accept=".json,application/json">';
    else input = '<input type="' + (f.type||'text') + '" ' + common + ' value="' + U.esc(f.value==null?'':f.value) + '" placeholder="' + U.esc(f.placeholder||'') + '"' +
      (f.min!=null?' min="'+f.min+'"':'') + (f.max!=null?' max="'+f.max+'"':'') + (f.step!=null?' step="'+f.step+'"':'') + '>';
    return '<label class="field ' + full + '"><span>' + U.esc(f.label) + '</span>' + input + (f.hint?'<small>' + U.esc(f.hint) + '</small>':'') + '</label>';
  }

  function form(o) {
    genericSubmit = o.onSubmit;
    modalButtons = [];
    const fields = (o.fields||[]).map(renderField).join('');
    const body = '<form class="modal ' + (o.size==='wide'?'wide':'') + '" data-form="generic">' +
      '<div class="modal-head"><h3>' + U.esc(o.title||'') + '</h3><button type="button" class="icon-btn plain" data-action="modal-close">' + U.icon('x') + '</button></div>' +
      '<div class="modal-body">' + (o.note||'') + '<div class="form-grid">' + fields + '</div></div>' +
      '<div class="modal-foot"><button type="button" class="btn" data-action="modal-close">انصراف</button>' +
      '<button type="submit" class="btn btn-primary">' + U.icon('save') + ' ' + U.esc(o.submit||'ذخیره') + '</button></div></form>';
    const root = document.getElementById('modal-root');
    root.innerHTML = body; root.hidden = false;
    root.onclick = (e) => { if (e.target === root) close(); };
    setTimeout(() => { const first = root.querySelector('input:not([type=checkbox]):not([type=file]),select,textarea'); if (first) first.focus(); }, 60);
  }

  function collect(formEl) {
    const out = {};
    const fd = new FormData(formEl);
    fd.forEach((v,k) => { if (out[k] === undefined) out[k] = v; else if (Array.isArray(out[k])) out[k].push(v); else out[k] = [out[k], v]; });
    formEl.querySelectorAll('input[type=checkbox]').forEach(cb => { if (!fd.has(cb.name) && !Array.isArray(out[cb.name])) out[cb.name] = false; });
    formEl.querySelectorAll('[data-multi]').forEach(g => {
      const n = g.dataset.multi;
      if (!Array.isArray(out[n])) out[n] = (!out[n] || out[n] === false) ? [] : [out[n]];
    });
    return out;
  }

  /* --------------------------------- boot --------------------------------- */
  function init() {
    App.store.load();
    state.invWidth = Number(App.model.D().settings.invoiceWidth) || 80;

    // Auto-save at every lifecycle boundary (app close / background / screen off).
    const flush = () => { try { App.store.saveNow(); } catch (e) {} };
    window.App.flush = flush;
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    document.addEventListener('freeze', flush);
    setInterval(() => { if (App.model.D().settings.autoSave) App.store.saveNow(); }, 60000);

    // MainActivity evaluates App.back(); "true" means the WebView handled it.
    window.App.back = function () {
      const root = document.getElementById('modal-root');
      if (root && !root.hidden) { close(); return true; }
      if (state.screen !== defaultScreen()) { go(defaultScreen()); return true; }
      return false;
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const root = document.getElementById('modal-root'); if (root && !root.hidden) close(); } });

    const conn = document.getElementById('conn-text');
    const pill = document.getElementById('conn-pill');
    const updateConn = () => {
      if (App.device.android) { conn.textContent = 'چاپ بومی اندروید'; pill.classList.add('online'); }
      else { conn.textContent = navigator.onLine ? 'پیشنمایش تحت وب' : 'حالت آفلاین'; pill.classList.toggle('online', !!navigator.onLine); }
    };
    window.addEventListener('online', updateConn); window.addEventListener('offline', updateConn); updateConn();
    const tick = () => { const c = document.getElementById('clock'); if (c) c.textContent = U.time(); };
    tick(); setInterval(tick, 30000);

    render();
  }

  return { state, init, render, refresh, go, toast, modal, form, confirm, close, collect, navItems, defaultScreen, modalButton, takeGenericSubmit };
})();

/* -------------------------- global event delegation -------------------------- */
document.addEventListener('click', (e) => {
  const mb = e.target.closest('[data-modal-btn]');
  if (mb) {
    e.preventDefault();
    const b = App.ui.modalButton(Number(mb.dataset.modalBtn));
    if (!b) return;
    if (b.onClick) b.onClick();
    else if (b.close) App.ui.close();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = App.actions[el.dataset.action];
  if (!fn) { console.warn('action not found:', el.dataset.action); return; }
  e.preventDefault();
  try { Promise.resolve(fn(el, e)).catch(err => { console.error(err); App.ui.toast(err.message || 'خطای ناشناخته', 'err'); }); }
  catch (err) { console.error(err); App.ui.toast(err.message || 'خطای ناشناخته', 'err'); }
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  e.preventDefault();
  const kind = f.dataset.form;
  if (kind === 'login') {
    const v = App.ui.collect(f);
    if (App.auth.login(v.username, v.password, v.remember)) {
      App.ui.render();
      const u = App.auth.current();
      App.ui.toast('خوش آمدید، ' + (u ? u.name : '') + ' 👋', 'ok');
    } else {
      const box = document.getElementById('login-error');
      if (box) box.innerHTML = '<div class="login-error">نام کاربری یا رمز عبور اشتباه است.</div>';
    }
    return;
  }
  if (kind === 'generic') {
    const fn = App.ui.takeGenericSubmit();
    const values = App.ui.collect(f);
    App.ui.close();
    if (fn) { try { fn(values); } catch (err) { console.error(err); App.ui.toast(err.message, 'err'); } }
    return;
  }
  const handler = App.formHandlers[kind];
  if (handler) { try { handler(f, App.ui.collect(f)); } catch (err) { console.error(err); App.ui.toast(err.message, 'err'); } }
});

document.addEventListener('input', (e) => {
  const name = e.target.dataset && e.target.dataset.input;
  if (!name) return;
  const fn = App.inputs[name];
  if (fn) fn(e.target);
});
document.addEventListener('change', (e) => {
  const name = e.target.dataset && e.target.dataset.input;
  if (!name || e.target.type === 'text' || e.target.type === 'number') return;
  const fn = App.inputs[name];
  if (fn) fn(e.target);
});

Object.assign(App.actions, {
  'modal-close': () => App.ui.close(),
  'logout': () => App.ui.confirm('از حساب کاربری خارج میشوید؟ اطلاعات ذخیره باقی میماند.', () => { App.auth.logout(); App.ui.render(); }),
  'toggle-menu': () => { const sb = document.querySelector('.sidebar'); if (sb) sb.classList.toggle('open'); },
  'user-menu': () => {
    const u = App.auth.current(); if (!u) return;
    App.ui.modal({ title:'حساب کاربری',
      body:'<div class="card"><div class="row"><span class="avatar" style="width:46px;height:46px;font-size:18px">' + App.util.esc((u.name||'؟').slice(0,1)) + '</span><div><b>' + App.util.esc(u.name) + '</b><div class="tiny muted">@' + App.util.esc(u.username) + ' · ' + App.util.esc(App.auth.roleLabel(u)) + '</div></div></div>' +
        '<div class="divider"></div><div class="tiny muted">سطح دسترسی: ' + App.util.num((u.permissions||[]).length) + ' مجوز · آخرین ذخیره: ' + App.util.esc(App.util.datetime(App.model.D().meta.updatedAt)) + '</div></div>',
      buttons:[
        { label:'تغییر رمز عبور', icon:'lock', onClick:() => App.ui.form({ title:'تغییر رمز عبور', fields:[
            { name:'old', label:'رمز عبور فعلی', type:'password', required:true },
            { name:'pass', label:'رمز عبور جدید', type:'password', required:true }
          ], onSubmit:v => {
            if (!App.auth.verify(u, v.old)) return App.ui.toast('رمز عبور فعلی اشتباه است.','err');
            App.auth.setPassword(u.id, v.pass); App.ui.toast('رمز عبور تغییر کرد.','ok');
          } }) },
        { label:'خروج', icon:'logout', cls:'btn-danger', onClick:() => { App.ui.close(); App.actions.logout(); } },
        { label:'بستن', close:true }
      ] });
  }
});

App.ui.init();
