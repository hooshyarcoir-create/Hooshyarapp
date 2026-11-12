/* ============================================================
   Hooshyar POS — screens: login, tables, order, invoice, payment
   ============================================================ */
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.inputs = App.inputs || {};

App.views = (function () {
  const U = App.util, N = U.num, M = U.money;
  const I = U.icon;
  const D = () => App.model.D();
  const opts = (arr, vk, lk) => (arr || []).map(x => ({ value:x[vk], label:x[lk] }));

  function head(title, sub, actions) {
    return '<div class="page-head"><div><h2>' + title + '</h2><p>' + (sub || '') + '</p></div><div class="spacer"></div>' + (actions || '') + '</div>';
  }
  function empty(text, ico) {
    return '<div class="empty">' + I(ico || 'info', 'lg') + '<div>' + text + '</div></div>';
  }
  function kpi(label, value, foot, cls) {
    return '<div class="kpi ' + (cls||'') + '"><div class="k-label">' + label + '</div><div class="k-value num">' + value + '</div><div class="k-foot">' + (foot||'') + '</div></div>';
  }
  function btn(action, label, ico, cls, data) {
    let d = '';
    Object.keys(data || {}).forEach(k => { d += ' data-' + k + '="' + U.esc(data[k]) + '"'; });
    return '<button class="btn ' + (cls||'') + '" data-action="' + action + '"' + d + '>' + (ico ? I(ico) : '') + ' ' + label + '</button>';
  }
  function provisional(o) {
    const t = App.model.totals(o);
    const tb = App.model.table(o.tableId), h = App.model.hall(o.hallId);
    return {
      id:o.id, no:o.no, orderId:o.id, tableId:o.tableId, hallId:o.hallId,
      tableLabel:tb ? tb.name : '—', hallLabel:h ? h.name : '—', type:o.type,
      waiterId:o.waiterId, waiterName:(D().users.find(u => u.id === o.waiterId)||{}).name || '—',
      customer:o.customer, lines:(o.lines||[]).filter(l => !l.voided), subtotal:t.subtotal, discount:t.discount,
      tax:t.tax, service:t.service, total:t.total, payments:o.payments||[], status:'draft',
      createdAt:o.createdAt, paidAt:null
    };
  }
  function statusInfo(s) {
    return ({ free:['آزاد','ok'], occupied:['مشغول','accent'], billed:['منتظر تسویه','info'], reserved:['رزرو','warn'] }[s] || ['آزاد','ok']);
  }

  /* =============================== LOGIN =============================== */
  function login() {
    const S = D().settings;
    return '<div class="login-box">' +
      '<div class="login-head"><div class="brand-mark">ه</div><h2>' + U.esc(S.restaurantName) + '</h2><p>سامانه سفارشگیری و صدور فاکتور</p></div>' +
      '<div id="login-error"></div>' +
      '<form data-form="login" autocomplete="off">' +
        '<label class="field"><span>نام کاربری</span><div class="input-icon">' + I('user') + '<input type="text" name="username" placeholder="admin" autocomplete="username" required></div></label>' +
        '<label class="field"><span>رمز عبور</span><div class="input-icon">' + I('lock') + '<input type="password" name="password" placeholder="••••" autocomplete="current-password" required></div></label>' +
        '<label class="check-line" style="margin-bottom:14px"><input type="checkbox" name="remember" checked> مرا به خاطر بسپار</label>' +
        '<button class="btn btn-primary btn-block btn-lg" type="submit">' + I('check') + ' ورود به سامانه</button>' +
      '</form>' +
      '<div class="login-foot">حساب پیشفرض: <b>admin / ۱۲۳۴</b> · صندوق: cashier / ۲۲۲۲ · سالن: waiter / ۳۳۳۳<br>اطلاعات به صورت خودکار روی دستگاه ذخیره میشود.</div>' +
    '</div>';
  }

  /* =============================== TABLES =============================== */
  function tables() {
    const d = D(), st = App.ui.state;
    const halls = d.halls.slice().sort((a,b) => (a.sort||0)-(b.sort||0));
    if (!st.hallId || !halls.some(h => h.id === st.hallId)) st.hallId = halls.length ? halls[0].id : null;
    const list = d.tables.filter(t => t.hallId === st.hallId);
    const occupied = d.tables.filter(t => t.status === 'occupied').length;
    const openTotal = U.sum(App.model.openOrders(), o => App.model.totals(o).total);
    let h = head('سالن و میزها', 'انتخاب میز برای ثبت سفارش یا مشاهده صورتحساب',
      (App.auth.can('order.create') ? btn('new-takeaway', 'سفارش بیرونبر / پیک', 'plus', 'btn-outline') : '') +
      (App.auth.can('tables.manage') ? btn('go-halls', 'مدیریت سالن', 'settings', '', {}) : ''));
    h += '<div class="grid cols-4 keep" style="margin-bottom:16px">' +
      kpi('کل میزها', N(d.tables.length), 'در ' + N(halls.length) + ' سالن') +
      kpi('میزهای آزاد', N(d.tables.filter(t => t.status==='free').length), 'آماده پذیرش', 'ok') +
      kpi('میزهای مشغول', N(occupied), 'سفارش باز', 'accent') +
      kpi('مبلغ سفارشهای باز', M(openTotal), d.settings.currency, 'info') + '</div>';
    h += '<div class="hall-bar"><div class="chips">';
    halls.forEach(x => { h += '<button class="chip ' + (x.id===st.hallId?'active':'') + '" data-action="hall" data-id="' + x.id + '"><span class="dot" style="background:' + U.esc(x.color||'#f0a44b') + '"></span>' + U.esc(x.name) + ' <span class="tiny">(' + N(d.tables.filter(t=>t.hallId===x.id).length) + ')</span></button>'; });
    if (App.auth.can('tables.manage')) h += '<button class="chip" data-action="hall-add">' + I('plus','sm') + ' سالن جدید</button>';
    h += '</div></div>';
    h += '<div class="card">';
    if (!list.length) h += empty('برای این سالن هنوز میزی تعریف نشده است.', 'grid');
    else {
      h += '<div class="table-grid">';
      list.slice().sort((a,b) => (a.y-b.y) || (a.x-b.x)).forEach(t => {
        const s = statusInfo(t.status);
        const o = t.orderId ? App.model.order(t.orderId) : null;
        const total = o ? App.model.totals(o).total : 0;
        h += '<button class="table-card is-' + t.status + '" data-action="table" data-id="' + t.id + '">' +
          '<div class="t-top"><span class="t-name">' + U.esc(t.name) + '</span><span class="badge ' + s[1] + ' t-status">' + s[0] + '</span></div>' +
          '<div class="t-meta"><span>' + I('users','sm') + ' ' + N(t.capacity) + ' نفره</span>' +
          (o ? '<span class="t-total num">' + M(total) + ' ' + U.esc(d.settings.currency) + '</span><span>سفارش ' + N(o.no) + ' · ' + U.elapsed(o.createdAt) + '</span>' : '<span>برای ثبت سفارش لمس کنید</span>') +
          '</div>' +
          (App.auth.can('tables.manage') ? '<span class="t-edit icon-btn plain" data-action="table-edit" data-id="' + t.id + '">' + I('edit','sm') + '</span>' : '') +
        '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    if (App.auth.can('tables.manage')) h += '<div class="row" style="margin-top:12px">' + btn('table-add','افزودن میز به این سالن','plus') + btn('hall-edit','ویرایش سالن فعلی','edit','',{id:st.hallId}) + '</div>';
    return h;
  }

  /* =============================== ORDER =============================== */
  function order() {
    const st = App.ui.state, d = D();
    const o = App.model.order(st.orderId);
    if (!o) return head('سفارش', '') + '<div class="card">' + empty('سفارشی انتخاب نشده است.', 'receipt') + '<div class="center">' + btn('back-tables','بازگشت به میزها','back','btn-primary') + '</div></div>';
    const t = App.model.totals(o);
    const groups = d.groups.filter(g => g.active !== false).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
    const gid = st.groupId && st.groupId !== 'all' ? st.groupId : null;
    const q = (st.productSearch || '').trim();
    const products = d.products.filter(p => p.active !== false && (!gid || p.groupId === gid) && (!q || p.name.indexOf(q) !== -1 || (p.code||'').indexOf(q) !== -1));

    let h = head('سفارش شماره ' + N(o.no), U.esc(App.model.label(o)) + ' · ' + U.esc((D().users.find(u=>u.id===o.waiterId)||{}).name || '—') + ' · ' + U.elapsed(o.createdAt),
      btn('back-tables','','back','btn-sm') +
      btn('order-save','ذخیره','save','btn-sm') +
      (App.auth.can('order.send') ? btn('order-send','ارسال به آشپزخانه','send','btn-primary btn-sm') : ''));
    h += '<div class="card" style="margin-bottom:14px"><div class="row">' +
      '<span class="muted tiny">نوع سفارش:</span>' +
      ['سالن','بیرون بر','پیک'].map(x => '<button class="chip ' + (o.type===x?'active':'') + '" data-action="order-type" data-type="' + x + '">' + x + '</button>').join('') +
      '<span class="spacer"></span>' +
      btn('order-customer','مشتری: ' + (o.customer && o.customer.name ? U.esc(o.customer.name) : 'ثبت نشده'),'user','btn-sm btn-ghost') +
      btn('order-notes','توضیحات' + (o.notes ? ' ✓' : ''),'note','btn-sm btn-ghost') +
      (App.auth.can('users.manage') ? btn('order-waiter','سفارشگیر','users','btn-sm btn-ghost') : '') +
      '</div>' + (o.notes ? '<div class="tiny warn" style="margin-top:8px">یادداشت: ' + U.esc(o.notes) + '</div>' : '') + '</div>';

    h += '<div class="order-layout">';
    // products (right column in RTL)
    h += '<div><div class="card">' +
      '<div class="row" style="margin-bottom:12px"><div class="input-icon" style="flex:1">' + I('search') +
      '<input type="text" data-input="product-search" placeholder="جستجوی نام یا کد کالا…" value="' + U.esc(st.productSearch||'') + '"></div></div>' +
      '<div class="chips" style="margin-bottom:12px"><button class="chip ' + (!gid?'active':'') + '" data-action="group" data-id="all">همه</button>' +
      groups.map(g => '<button class="chip ' + (gid===g.id?'active':'') + '" data-action="group" data-id="' + g.id + '"><span class="dot" style="background:' + U.esc(g.color||'#888') + '"></span>' + U.esc(g.name) + '</button>').join('') + '</div>' +
      '<div class="product-grid">';
    products.forEach(p => {
      h += '<button class="product-card" data-action="add-product" data-id="' + p.id + '">' +
        '<div class="p-name">' + U.esc(p.name) + '</div>' +
        (p.description ? '<div class="tiny faint">' + U.esc(p.description) + '</div>' : '') +
        '<div class="p-foot"><span class="p-price num">' + M(p.price) + '</span><span class="p-add">' + I('plus','sm') + '</span></div></button>';
    });
    if (!products.length) h += '<div style="grid-column:1/-1">' + empty('کالایی یافت نشد.', 'book') + '</div>';
    h += '</div></div></div>';

    // cart (left column)
    h += '<div class="cart"><div class="card"><div class="card-head"><h3>اقلام سفارش</h3><span class="spacer"></span><span class="badge accent">' + N(o.lines.filter(l=>!l.voided).length) + ' قلم</span></div>';
    const lines = o.lines.filter(l => !l.voided);
    if (!lines.length) h += empty('هنوز کالایی انتخاب نشده است.', 'receipt');
    else {
      h += '<div class="cart-lines">';
      lines.forEach(l => {
        h += '<div class="cart-line"><div class="cl-top">' +
          '<span class="cl-name">' + U.esc(l.name) + (l.sentQty ? ' <span class="badge ok tiny">چاپ شد</span>' : '') + '</span>' +
          '<span class="cl-price num">' + M(l.price * l.qty) + '</span></div>' +
          (l.note ? '<div class="cl-note">↳ ' + U.esc(l.note) + '</div>' : '') +
          '<div class="row tight" style="margin-top:6px">' +
            '<span class="qty"><button data-action="qty-minus" data-line="' + l.id + '">' + I('minus','sm') + '</button><span>' + N(l.qty) + '</span><button data-action="qty-plus" data-line="' + l.id + '">' + I('plus','sm') + '</button></span>' +
            '<button class="icon-btn plain" title="توضیحات" data-action="line-note" data-line="' + l.id + '">' + I('note','sm') + '</button>' +
            (App.auth.can('menu.manage') ? '<button class="icon-btn plain" title="تغییر قیمت" data-action="line-price" data-line="' + l.id + '">' + I('tag','sm') + '</button>' : '') +
            '<span class="spacer"></span>' +
            (App.auth.can('order.void') ? '<button class="icon-btn plain danger" title="حذف" data-action="line-remove" data-line="' + l.id + '">' + I('trash','sm') + '</button>' : '') +
          '</div></div>';
      });
      h += '</div>';
    }
    h += '<div class="divider"></div><div class="totals">' +
      '<div class="t-row"><span>جمع اقلام</span><span class="num">' + M(t.subtotal) + '</span></div>' +
      '<div class="t-row"><span>تخفیف ' + (App.auth.can('order.discount') ? '<button class="icon-btn plain" data-action="order-discount">' + I('edit','sm') + '</button>' : '') + '</span><span class="num">− ' + M(t.discount) + '</span></div>' +
      (t.tax ? '<div class="t-row"><span>مالیات</span><span class="num">' + M(t.tax) + '</span></div>' : '') +
      (t.service ? '<div class="t-row"><span>سرویس</span><span class="num">' + M(t.service) + '</span></div>' : '') +
      '<div class="t-row total"><span>قابل پرداخت</span><span class="num">' + M(t.total) + ' <small>' + U.esc(d.settings.currency) + '</small></span></div></div>';
    h += '<div class="grid cols-2 keep" style="margin-top:14px">' +
      (App.auth.can('invoice.view') ? btn('order-invoice','صورتحساب','receipt','',{}) : '') +
      (App.auth.can('payment.settle') ? btn('order-payment','تسویه','wallet','btn-primary') : '') +
      '</div>';
    h += '<div class="row" style="margin-top:8px">' +
      (App.auth.can('order.send') ? btn('order-send','چاپ آشپزخانه','print','btn-sm') : '') +
      btn('order-kitchen-preview','پیشنمایش برگهها','receipt','btn-sm') +
      (App.auth.can('order.void') ? btn('order-void','لغو سفارش','trash','btn-sm btn-danger') : '') + '</div>';
    h += '</div></div></div>';
    return h;
  }

  /* =============================== INVOICE =============================== */
  function invoice() {
    const st = App.ui.state, d = D();
    const tab = st.invTab || 'current';
    const items = tab === 'current' ? App.model.openOrders() : d.invoices.slice();
    let sel = st.invSel;
    if (!sel || !items.some(x => x.id === sel.id)) sel = items.length ? { kind:tab === 'current' ? 'order' : 'invoice', id:items[0].id } : null;
    st.invSel = sel;
    const inv = sel ? (sel.kind === 'order' ? provisional(App.model.order(sel.id)) : App.model.invoice(sel.id)) : null;
    const w = st.invWidth || Number(d.settings.invoiceWidth) || 80;

    let h = head('صورتحساب و چاپ', 'نمایش، چاپ ۶ و ۸ سانتی و ارسال به چاپگرهای خط چاپ',
      btn('inv-refresh','','refresh','btn-sm'));
    h += '<div class="tabs"><button class="tab ' + (tab==='current'?'active':'') + '" data-action="inv-tab" data-tab="current">فاکتورهای جاری (' + N(App.model.openOrders().length) + ')</button>' +
         '<button class="tab ' + (tab==='archive'?'active':'') + '" data-action="inv-tab" data-tab="archive">آرشیو فاکتورها (' + N(d.invoices.length) + ')</button></div>';
    h += '<div class="order-layout"><div class="card"><div class="card-head"><h3>' + (tab==='current'?'سفارشهای باز':'فاکتورهای تسویه شده') + '</h3></div>';
    if (!items.length) h += empty('موردی وجود ندارد.', 'receipt');
    else items.forEach(x => {
      const o = tab==='current' ? x : null;
      const total = o ? App.model.totals(o).total : x.total;
      const active = sel && sel.id === x.id;
      h += '<button class="list-row" style="width:100%;text-align:right;background:' + (active?'var(--accent-soft)':'transparent') + ';border-radius:9px;padding:9px" data-action="inv-select" data-id="' + x.id + '" data-kind="' + (tab==='current'?'order':'invoice') + '">' +
        '<span class="avatar">' + (tab==='current'?'س':'ف') + '</span>' +
        '<span class="lr-main"><span class="lr-title">فاکتور ' + N(x.no) + ' · ' + U.esc(o ? App.model.label(o) : (x.tableLabel||'—')) + '</span>' +
        '<span class="lr-sub">' + U.esc(U.datetime(o ? o.createdAt : (x.paidAt||x.createdAt))) + ' · ' + (tab==='current' ? (o.lines.filter(l=>!l.voided).length) + ' قلم' : (x.payments||[]).length + ' پرداخت') + '</span></span>' +
        '<span class="num strong accent">' + M(total) + '</span></button>';
    });
    h += '</div>';

    h += '<div>';
    if (!inv) h += '<div class="card">' + empty('فاکتوری برای نمایش انتخاب کنید.', 'receipt') + '</div>';
    else {
      h += '<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>چاپ صورتحساب شماره ' + N(inv.no) + '</h3><span class="spacer"></span>' +
        '<span class="badge ' + (sel.kind==='order'?'warn':'ok') + '">' + (sel.kind==='order'?'پیش فاکتور / تسویه نشده':'تسویه شده') + '</span></div>' +
        '<div class="row tight"><button class="chip ' + (w===80?'active':'') + '" data-action="inv-width" data-width="80">کاغذ ۸ سانتی (80mm)</button>' +
        '<button class="chip ' + (w===58?'active':'') + '" data-action="inv-width" data-width="58">کاغذ ۶ سانتی (58mm)</button></div>' +
        '<div class="grid cols-2 keep" style="margin-top:12px">' +
          (App.auth.can('invoice.print') ? btn('inv-print','چاپ فاکتور','print','btn-primary',{id:inv.id,kind:sel.kind,width:w}) : '') +
          btn('inv-browser-print','چاپ مرورگر / PDF','print','',{id:inv.id,kind:sel.kind,width:w}) +
          (App.auth.can('invoice.print') ? btn('inv-printer','انتخاب چاپگر…','settings','',{id:inv.id,kind:sel.kind,width:w}) : '') +
          btn('inv-preview','پیشنمایش','receipt','',{id:inv.id,kind:sel.kind,width:w}) +
        '</div>' +
        (sel.kind==='order' && App.auth.can('kitchen.print') ? '<div class="row" style="margin-top:8px">' + btn('inv-kitchen','چاپ مجدد برگه آشپزخانه','send','btn-sm btn-block',{id:inv.id}) + '</div>' : '') +
        (App.auth.can('payment.settle') && sel.kind==='order' ? '<div class="row" style="margin-top:8px">' + btn('inv-goto-payment','رفتن به تسویه','wallet','btn-sm btn-ok btn-block',{id:inv.id}) + '</div>' : '') +
        (st.invPrinterId ? '<div class="tiny muted" style="margin-top:10px">چاپگر انتخابی: <b>' + U.esc((App.model.printer(st.invPrinterId)||{}).name || '—') + '</b> <button class="icon-btn plain" data-action="inv-printer-clear">' + I('x','sm') + '</button></div>' : '') +
      '</div>';
      h += '<div class="paper-stage"><div class="paper ' + (w===58?'w58':'') + '">' + App.print.receiptHtml(inv, w) + '</div></div>';
    }
    h += '</div></div>';
    return h;
  }

  /* =============================== PAYMENT =============================== */
  function payment() {
    const st = App.ui.state, d = D();
    let o = App.model.order(st.payOrderId);
    const open = App.model.openOrders();
    if (!o && open.length) { o = open[0]; st.payOrderId = o.id; }
    if (!o) return head('تسویه فاکتور','') + '<div class="card">' + empty('هیچ سفارش بازی برای تسویه وجود ندارد.', 'wallet') + '<div class="center">' + btn('nav','رفتن به میزها','grid','btn-primary',{screen:'tables'}) + '</div></div>';
    const t = App.model.totals(o);
    const paid = App.model.paid(o);
    const rem = Math.max(0, t.total - paid);
    const split = o.split || { mode:'none', heads:2 };
    const slots = App.pay.shares(o, split);
    st.slotDraft = st.slotDraft || {};
    const psps = App.pay.enabledPsps();
    const customers = App.pay.customers();

    let h = head('تسویه فاکتور ' + N(o.no), U.esc(App.model.label(o)) + ' · ' + U.esc((d.users.find(u=>u.id===o.waiterId)||{}).name||'—'),
      btn('nav','سفارشها','grid','btn-sm',{screen:'tables'}) + btn('pay-order-select','تغییر سفارش','refresh','btn-sm'));
    h += '<div class="grid cols-4 keep" style="margin-bottom:14px">' +
      kpi('مبلغ فاکتور', M(t.total), d.settings.currency, 'accent') +
      kpi('پرداخت شده', M(paid), N((o.payments||[]).filter(p=>!p.reversed).length) + ' تراکنش', 'info') +
      kpi('مانده', M(rem), rem ? 'منتظر پرداخت' : 'تسویه شده', rem ? '' : 'ok') +
      kpi('باقیمانده نقدی', M(Math.max(0, paid - t.total)), 'پول برگشتی', '') + '</div>';

    h += '<div class="order-layout"><div>';
    // split section
    h += '<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>نحوه پرداخت</h3><span class="spacer"></span><span class="badge info">' + U.esc(App.pay.SPLIT_MODES[split.mode]||'بدون تقسیم') + '</span></div>' +
      '<div class="chips">' + Object.keys(App.pay.SPLIT_MODES).map(k => '<button class="chip ' + (split.mode===k?'active':'') + '" data-action="split-mode" data-mode="' + k + '">' + App.pay.SPLIT_MODES[k] + '</button>').join('') + '</div>';
    if (split.mode === 'equal' || split.mode === 'items') {
      h += '<div class="row" style="margin-top:12px"><span class="muted tiny">تعداد نفرات (دنگ):</span>' +
        '<span class="qty"><button data-action="split-heads" data-delta="-1">' + I('minus','sm') + '</button><span>' + N(split.heads||2) + '</span><button data-action="split-heads" data-delta="1">' + I('plus','sm') + '</button></span>' +
        '<span class="spacer"></span>' +
        (split.mode==='items' ? btn('split-items','تخصیص اقلام به نفرات','layers','btn-sm') : '') +
        '<span class="tiny faint">سهم هر نفر: <b class="num accent">' + M(slots.length ? slots[0].amount : 0) + '</b></span></div>';
    }
    if (split.mode === 'custom') {
      h += '<div class="row" style="margin-top:12px">' + btn('split-custom','تعیین مبالغ دلخواه','edit','btn-sm') + '<span class="tiny faint">جمع سهمها: <b class="num">' + M(U.sum(slots,s=>s.amount)) + '</b></span></div>';
      h += '<div class="tiny muted" style="margin-top:8px">' + slots.map(s => U.esc(s.label) + ': ' + M(s.amount)).join(' · ') + '</div>';
    }
    h += '</div>';

    // slots
    h += '<div class="card"><div class="card-head"><h3>سهمهای پرداخت</h3><span class="spacer"></span><span class="tiny faint">هر سهم با هر روشی قابل پرداخت است</span></div>';
    slots.forEach(slot => {
      const draft = st.slotDraft[slot.id] || {};
      const method = draft.method || 'cash';
      const left = Math.max(0, slot.amount - App.pay.slotPaid(o, slot.id));
      const done = left <= 0;
      h += '<div class="pay-slot ' + (done?'paid':'') + '">' +
        '<div class="ps-head">' + I(done?'check':'user','sm') + '<span class="ps-label">' + U.esc(slot.label) + '</span>' +
        '<span class="ps-amount num">' + M(slot.amount) + '</span>' + (done ? '<span class="badge ok">پرداخت شد</span>' : '<span class="badge warn num">مانده ' + M(left) + '</span>') + '</div>' +
        '<div class="method-grid">' + App.pay.METHODS.map(m => '<button class="method-btn ' + (method===m.id?'active':'') + '" data-action="slot-method" data-slot="' + slot.id + '" data-method="' + m.id + '">' + I(m.icon) + m.label + '</button>').join('') + '</div>';
      if (!done) {
        h += '<div class="form-grid" style="margin-top:10px">';
        h += '<label class="field"><span>مبلغ پرداخت (' + U.esc(d.settings.currency) + ')</span><input type="number" data-input="slot-amount" data-slot="' + slot.id + '" value="' + (draft.amount != null ? draft.amount : left) + '" min="1"></label>';
        if (method === 'card') {
          h += '<label class="field"><span>درگاه / کارتخوان (PSP)</span><select data-input="slot-psp" data-slot="' + slot.id + '">' +
            psps.map(p => '<option value="' + p.id + '" ' + (draft.pspId===p.id?'selected':'') + '>' + U.esc(p.name) + '</option>').join('') + '</select></label>';
          if (!psps.length) h += '<div class="full tiny danger">هیچ درگاه فعالی تعریف نشده است.</div>';
        } else if (method === 'credit') {
          h += '<label class="field"><span>مشتری اعتباری</span><select data-input="slot-customer" data-slot="' + slot.id + '">' +
            '<option value="">انتخاب مشتری…</option>' + customers.map(c => '<option value="' + c.id + '" ' + (draft.customerId===c.id?'selected':'') + '>' + U.esc(c.name) + ' (بدهی: ' + M(c.credit) + ')</option>').join('') + '</select></label>' +
            '<div class="full">' + btn('credit-add','تعریف مشتری اعتباری جدید','plus','btn-sm') + '</div>';
        } else if (method === 'cash') {
          h += '<label class="field"><span>مبلغ دریافتی (برای محاسبه پول خرد)</span><input type="number" data-input="slot-cash" data-slot="' + slot.id + '" value="' + (draft.cashReceived || '') + '" placeholder="اختیاری"></label>';
        } else {
          h += '<label class="field"><span>توضیح روش پرداخت</span><input type="text" data-input="slot-note" data-slot="' + slot.id + '" value="' + U.esc(draft.note||'') + '" placeholder="مثلاً کوپن تخفیف"></label>';
        }
        h += '</div><div class="row" style="margin-top:4px">' +
          btn('slot-pay','ثبت پرداخت ' + (method==='card' ? 'کارتخوان' : App.pay.methodLabel(method)), 'check','btn-ok btn-sm',{slot:slot.id}) +
          (method==='cash' && left>0 ? btn('slot-pay-exact','دریافت دقیق','cash','btn-sm',{slot:slot.id}) : '') + '</div>';
      }
      h += '</div>';
    });
    if (App.auth.can('payment.settle')) h += '<div class="divider"></div>' + btn('pay-extra','افزودن پرداخت آزاد / ترکیبی','plus','btn-sm btn-block');
    h += '</div>';
    h += '</div>';

    // right column: payment list + settle
    h += '<div><div class="card"><div class="card-head"><h3>پرداختها</h3><span class="spacer"></span><span class="badge accent num">' + M(paid) + '</span></div>';
    const pays = (o.payments || []);
    if (!pays.length) h += empty('پرداختی ثبت نشده است.', 'wallet');
    else pays.forEach(p => {
      h += '<div class="list-row"><span class="avatar">' + I(p.reversed?'x':(App.pay.METHODS.find(m=>m.id===p.method)||{icon:'tag'}).icon,'sm') + '</span>' +
        '<span class="lr-main"><span class="lr-title">' + U.esc(p.label || App.pay.methodLabel(p.method)) + (p.reversed ? ' <span class="badge danger">برگشتی</span>' : '') + '</span>' +
        '<span class="lr-sub">' + U.esc(U.time(p.at)) + (p.ref ? ' · مرجع <span class="num">' + U.esc(p.ref) + '</span>' : '') + (p.pspName ? ' · ' + U.esc(p.pspName) : '') + (p.customerName ? ' · ' + U.esc(p.customerName) : '') + '</span></span>' +
        '<span class="num strong">' + M(p.amount) + '</span>' +
        (App.auth.can('payment.refund') ? '<button class="icon-btn plain danger" data-action="pay-remove" data-id="' + p.id + '">' + I('trash','sm') + '</button>' : '') + '</div>';
    });
    h += '<div class="divider"></div>';
    h += '<div class="totals"><div class="t-row total"><span>مانده قابل پرداخت</span><span class="num">' + M(rem) + '</span></div></div>';
    if (App.auth.can('payment.settle')) {
      h += '<div class="row" style="margin-top:14px">' +
        '<button class="btn btn-ok btn-lg btn-block" data-action="settle" ' + (rem>0?'disabled':'') + '>' + I('check') + ' تکمیل تسویه و صدور فاکتور</button>' +
        '</div><div class="tiny faint center" style="margin-top:8px">پس از تسویه، فاکتور در آرشیو ذخیره و میز آزاد میشود.</div>';
    }
    h += '</div></div></div>';
    return h;
  }

  /* =============================== helpers used by other views =============================== */
  return { login, tables, order, invoice, payment, provisional, head, empty, kpi, btn, opts, statusInfo };
})();

/* ============================ actions (screens 1) ============================ */
Object.assign(App.actions, {
  'go-halls': () => App.ui.go('settings', { settingsTab:'halls' }),
  'back-tables': () => App.ui.go('tables'),
  'nav': (el) => App.ui.go(el.dataset.screen),
  'hall': (el) => { App.ui.state.hallId = el.dataset.id; App.ui.render(); },
  'group': (el) => { App.ui.state.groupId = el.dataset.id; App.ui.render(); },
  'inv-tab': (el) => { App.ui.state.invTab = el.dataset.tab; App.ui.state.invSel = null; App.ui.render(); },
  'inv-width': (el) => { App.ui.state.invWidth = Number(el.dataset.width); App.ui.render(); },
  'inv-refresh': () => App.ui.render(),
  'inv-select': (el) => { App.ui.state.invSel = { id:el.dataset.id, kind:el.dataset.kind }; App.ui.render(); },
  'inv-printer-clear': () => { App.ui.state.invPrinterId = null; App.ui.render(); },

  table: (el) => {
    const t = App.model.table(el.dataset.id);
    if (!t) return;
    if (t.status === 'reserved') return App.ui.toast('این میز رزرو شده است. ابتدا وضعیت آن را تغییر دهید.', 'err');
    let o = t.orderId ? App.model.order(t.orderId) : null;
    if (!o || o.status !== 'open') {
      if (!App.auth.can('order.create')) return App.ui.toast('دسترسی ثبت سفارش ندارید.', 'err');
      o = App.model.createOrder(t.id, 'سالن');
    }
    App.ui.go('order', { orderId:o.id });
  },
  'new-takeaway': () => {
    if (!App.auth.can('order.create')) return App.ui.toast('دسترسی ثبت سفارش ندارید.', 'err');
    App.ui.form({ title:'سفارش بدون میز', fields:[{ name:'type', label:'نوع سفارش', type:'select', options:[{value:'بیرون بر',label:'بیرون بر'},{value:'پیک',label:'پیک'}], value:'بیرون بر' }],
      submit:'ایجاد سفارش', onSubmit:v => { const o = App.model.createOrder(null, v.type); App.ui.go('order', { orderId:o.id }); } });
  },
  'table-add': () => App.forms.table(null, App.ui.state.hallId),
  'table-edit': (el) => App.forms.table(el.dataset.id),
  'hall-add': () => App.forms.hall(null),
  'hall-edit': (el) => App.forms.hall(el.dataset.id || App.ui.state.hallId),

  'order-type': (el) => { const o = App.model.order(App.ui.state.orderId); if (!o) return; App.store.commit(() => { o.type = el.dataset.type; }, 'order.edit', 'تغییر نوع سفارش'); App.ui.render(); },
  'add-product': (el) => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    if (!App.auth.can('order.edit')) return App.ui.toast('دسترسی ویرایش سفارش ندارید.', 'err');
    App.model.addLine(o, el.dataset.id); App.ui.refresh();
  },
  'qty-plus': (el) => changeQty(el.dataset.line, 1),
  'qty-minus': (el) => changeQty(el.dataset.line, -1),
  'line-remove': (el) => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    App.ui.confirm('این قلم از سفارش حذف شود؟ (در برگه آشپزخانه به عنوان حذف شده اعلام میشود)', () => {
      App.store.commit(() => { const l = o.lines.find(x => x.id === el.dataset.line); if (l) { l.voided = true; l.qtyBeforeVoid = l.qty; } o.updatedAt = Date.now(); }, 'order.void', 'حذف قلم سفارش');
      App.ui.render();
    });
  },
  'line-note': (el) => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    const l = o.lines.find(x => x.id === el.dataset.line); if (!l) return;
    App.ui.form({ title:'توضیحات قلم «' + l.name + '»', fields:[{ name:'note', label:'توضیح (روی برگه آشپزخانه چاپ میشود)', type:'textarea', value:l.note || '', placeholder:'مثلاً: بدون پیاز، کم نمک' }],
      onSubmit:v => { App.store.commit(() => { l.note = String(v.note||'').trim(); o.updatedAt = Date.now(); }, 'order.edit', 'توضیح قلم'); App.ui.render(); } });
  },
  'line-price': (el) => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    const l = o.lines.find(x => x.id === el.dataset.line); if (!l) return;
    App.ui.form({ title:'تغییر قیمت «' + l.name + '»', fields:[{ name:'price', label:'قیمت واحد (تومان)', type:'number', value:l.price, min:0 }],
      onSubmit:v => { App.store.commit(() => { l.price = Math.max(0, Number(v.price)||0); o.updatedAt = Date.now(); }, 'order.edit', 'تغییر قیمت قلم'); App.ui.render(); } });
  },
  'order-discount': () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    if (!App.auth.can('order.discount')) return App.ui.toast('دسترسی اعمال تخفیف ندارید.', 'err');
    App.ui.form({ title:'اعمال تخفیف', fields:[
      { name:'type', label:'نوع تخفیف', type:'select', options:[{value:'amount',label:'مبلغ (تومان)'},{value:'percent',label:'درصد'}], value:o.discount.type },
      { name:'value', label:'مقدار', type:'number', value:o.discount.value, min:0 }
    ], onSubmit:v => { App.store.commit(() => { o.discount = { type:v.type, value:Math.max(0, Number(v.value)||0) }; }, 'order.discount', 'تخفیف ' + v.value); App.ui.render(); } });
  },
  'order-customer': () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    App.ui.form({ title:'اطلاعات مشتری', fields:[
      { name:'name', label:'نام مشتری', type:'text', value:o.customer.name },
      { name:'phone', label:'شماره تماس', type:'tel', value:o.customer.phone }
    ], onSubmit:v => { App.store.commit(() => { o.customer = { name:v.name, phone:v.phone }; }, 'order.edit', 'ثبت اطلاعات مشتری'); App.ui.render(); } });
  },
  'order-notes': () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    App.ui.form({ title:'توضیحات سفارش', fields:[{ name:'notes', label:'یادداشت', type:'textarea', value:o.notes||'' }],
      onSubmit:v => { App.store.commit(() => { o.notes = v.notes; }, 'order.edit', 'یادداشت سفارش'); App.ui.render(); } });
  },
  'order-waiter': () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    App.ui.form({ title:'انتخاب سفارشگیر', fields:[{ name:'waiterId', label:'کاربر', type:'select', options:App.views.opts(D().users.filter(u=>u.active),'id','name'), value:o.waiterId }],
      onSubmit:v => { App.store.commit(() => { o.waiterId = v.waiterId; }, 'order.edit', 'تغییر سفارشگیر'); App.ui.render(); } });
  },
  'order-save': () => { App.store.saveNow(); App.ui.toast('سفارش ذخیره شد. دادهها پس از بستن برنامه نیز باقی میمانند.', 'ok'); },
  'order-void': () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    App.ui.confirm('کل سفارش شماره ' + App.util.num(o.no) + ' لغو و میز آزاد شود؟', () => {
      App.store.commit(d => {
        const tb = d.tables.find(t => t.id === o.tableId); if (tb) { tb.status = 'free'; tb.orderId = null; }
        o.status = 'void'; o.voidAt = Date.now();
      }, 'order.void', 'لغو سفارش ' + o.no);
      App.ui.go('tables'); App.ui.toast('سفارش لغو شد.', 'ok');
    });
  },
  'order-send': async () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    if (!App.auth.can('order.send') && !App.auth.can('kitchen.print')) return App.ui.toast('دسترسی ارسال به آشپزخانه ندارید.', 'err');
    const res = await App.print.printKitchen(o);
    if (!res.length) return App.ui.toast('قلم جدیدی برای چاپ وجود ندارد (همه اقلام قبلاً ارسال شدهاند).', 'err');
    const ok = res.filter(r => r.ok).length;
    res.forEach(r => { if (!r.ok) App.ui.toast(r.ticket.stationName + ': ' + r.error, 'err'); });
    if (ok) App.ui.toast('برگه سفارش به ' + App.util.num(ok) + ' خط چاپ ارسال شد.', 'ok');
    App.ui.render();
  },
  'order-kitchen-preview': () => {
    const o = App.model.order(App.ui.state.orderId); if (!o) return;
    const tickets = App.print.kitchenTickets(o, { reprint:true });
    if (!tickets.length) return App.ui.toast('قلمی برای برگه آشپزخانه وجود ندارد.', 'err');
    const body = '<div class="tiny faint" style="margin-bottom:10px">هر برگه فقط اقلام همان گروه را دارد و به چاپگر همان خط چاپ ارسال میشود.</div>' +
      '<div class="paper-stage" style="flex-wrap:wrap;gap:16px;align-items:flex-start">' + tickets.map(t => {
        const pr = App.model.printer(t.printerId);
        return '<div><div class="tiny muted center" style="margin-bottom:6px">' + U.esc(t.stationName) + ' → ' + U.esc(pr ? pr.name : 'چاپگر تنظیم نشده') + '</div>' +
          '<div class="paper w58">' + App.print.kitchenHtml(t, 58) + '</div></div>';
      }).join('') + '</div>';
    App.ui.modal({ title:'برگههای خطوط چاپ · سفارش ' + U.num(o.no), size:'wide', body,
      buttons:[
        { label:'چاپ همه در مرورگر', icon:'print', cls:'btn-primary', onClick: () => App.print.browserPrint(tickets.map(t => App.print.kitchenHtml(t, 58)).join('<div class="p-sep"></div>'), 58) },
        { label:'بستن', icon:'x', close:true }
      ] });
  },
  'order-invoice': () => { const o = App.model.order(App.ui.state.orderId); if (o) App.ui.go('invoice', { invTab:'current', invSel:{ kind:'order', id:o.id } }); },
  'order-payment': () => { const o = App.model.order(App.ui.state.orderId); if (o) App.ui.go('payment', { payOrderId:o.id }); },
  'inv-goto-payment': (el) => App.ui.go('payment', { payOrderId:el.dataset.id }),

  'inv-print': async (el) => {
    if (!App.auth.can('invoice.print')) return App.ui.toast('دسترسی چاپ ندارید.', 'err');
    const inv = getInv(el); if (!inv) return;
    const w = Number(el.dataset.width);
    const r = await App.print.printInvoice(inv.inv, w, { printerId:App.ui.state.invPrinterId, reprint:inv.kind === 'invoice' });
    if (r.ok) App.ui.toast('فاکتور ' + App.util.num(inv.inv.no) + ' روی کاغذ ' + (w===58?'۶':'۸') + ' سانتی چاپ شد. ' + (r.info||''), 'ok');
    else App.ui.toast('خطای چاپ: ' + (r.error||'') + ' — میتوانید از «چاپ مرورگر / PDF» یا ذخیره فایل ESC/POS استفاده کنید.', 'err');
    App.ui.render();
  },
  'inv-browser-print': async (el) => {
    const inv = getInv(el); if (!inv) return;
    const w = Number(el.dataset.width);
    const r = await App.print.browserPrint(App.print.receiptHtml(inv.inv, w), w);
    App.ui.toast(r.ok ? 'پنجره چاپ باز شد.' : r.error, r.ok ? 'ok' : 'err');
  },
  'inv-printer': (el) => {
    const printers = D().printers.filter(p => p.enabled);
    if (!printers.length) return App.ui.toast('چاپگر فعالی تعریف نشده است.', 'err');
    App.ui.form({ title:'انتخاب چاپگر صورتحساب', fields:[{ name:'printerId', label:'چاپگر', type:'select', options:App.views.opts(printers,'id','name'), value:App.ui.state.invPrinterId || printers[0].id }],
      onSubmit:v => { App.ui.state.invPrinterId = v.printerId; App.ui.render(); App.ui.toast('چاپگر انتخاب شد.', 'ok'); } });
  },
  'inv-preview': (el) => {
    const inv = getInv(el); if (!inv) return;
    const w = Number(el.dataset.width);
    const html = App.print.receiptHtml(inv.inv, w);
    App.ui.modal({ title:'پیشنمایش فاکتور ' + App.util.num(inv.inv.no), size:'wide',
      body:'<div class="paper-stage"><div class="paper ' + (w===58?'w58':'') + '">' + html + '</div></div>',
      buttons:[
        { label:'چاپ مرورگر', icon:'print', cls:'btn-primary', onClick: () => App.print.browserPrint(html, w) },
        { label:'دانلود فایل ESC/POS', icon:'download', onClick: () => {
            const p = App.model.printer(App.ui.state.invPrinterId) || App.print.findPrinter(w,'invoice') || { id:'default', width:w, cut:true };
            App.print.downloadRaster(p, App.print.invoiceRows(inv.inv, w)).then(() => App.ui.toast('فایل باینری چاپ ذخیره شد.', 'ok'));
          } },
        { label:'بستن', icon:'x', close:true }
      ] });
  },
  'inv-kitchen': async (el) => {
    const o = App.model.order(el.dataset.id); if (!o) return;
    const res = await App.print.printKitchen(o, { reprint:true });
    if (!res.length) return App.ui.toast('برگهای برای چاپ موجود نیست.', 'err');
    const ok = res.filter(r=>r.ok).length;
    res.forEach(r => { if (!r.ok) App.ui.toast(r.ticket.stationName + ': ' + r.error, 'err'); });
    if (ok) App.ui.toast('چاپ مجدد ' + App.util.num(ok) + ' برگه آشپزخانه انجام شد.', 'ok');
  },

  'pay-order-select': () => {
    const open = App.model.openOrders();
    App.ui.form({ title:'انتخاب سفارش برای تسویه', fields:[{ name:'id', label:'سفارش باز', type:'select', options:open.map(o => ({ value:o.id, label:'فاکتور ' + App.util.num(o.no) + ' · ' + App.model.label(o) + ' · ' + App.util.money(App.model.totals(o).total) })), value:App.ui.state.payOrderId }],
      onSubmit:v => { App.ui.state.payOrderId = v.id; App.ui.state.slotDraft = {}; App.ui.render(); } });
  },
  'split-mode': (el) => {
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    App.pay.setSplit(o, { mode:el.dataset.mode });
    App.ui.state.slotDraft = {};
    App.ui.render();
  },
  'split-heads': (el) => {
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    const n = Math.max(2, Math.min(30, (Number(o.split.heads)||2) + Number(el.dataset.delta)));
    App.pay.setSplit(o, { heads:n }); App.ui.render();
  },
  'split-custom': () => {
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    const cur = App.pay.shares(o, o.split);
    App.ui.form({ title:'مبالغ دلخواه دنگی', note:'<div class="tiny muted" style="margin-bottom:10px">جمع مبالغ باید ' + App.util.money(App.model.totals(o).total) + ' تومان شود؛ در صورت اختلاف، مبلغ سهم آخر اصلاح میشود.</div>',
      fields:[{ name:'heads', label:'تعداد نفرات', type:'number', value:cur.length, min:2, max:20 },
              { name:'amounts', label:'مبالغ (با کاما یا خط جدید جدا کنید)', type:'textarea', value:cur.map(s=>s.amount).join('، ') }],
      onSubmit:v => {
        const arr = String(v.amounts).split(/[،,\n\s]+/).map(x => Number(x.replace(/[^\d]/g,''))).filter(x => !isNaN(x));
        const heads = Math.max(2, Math.min(20, Number(v.heads)||arr.length||2));
        const custom = Array.from({length:heads}, (_,i) => arr[i] != null ? arr[i] : 0);
        App.pay.setSplit(o, { mode:'custom', heads, custom }); App.ui.state.slotDraft = {}; App.ui.render();
      } });
  },
  'split-items': () => {
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    const heads = Math.max(2, Math.min(20, Number(o.split.heads)||2));
    const fields = (o.lines||[]).filter(l=>!l.voided).map(l => ({ name:'l_' + l.id, label:App.util.num(l.qty) + ' × ' + l.name, type:'select', options:Array.from({length:heads},(_,i)=>({value:String(i),label:'نفر ' + App.util.num(i+1)})), value:String((o.split.items||{})[l.id]||0) }));
    App.ui.form({ title:'تخصیص اقلام به نفرات (دنگی)', note:'<div class="tiny muted" style="margin-bottom:10px">تخفیف، مالیات و سرویس به نسبت سهم هر نفر تقسیم میشود.</div>',
      fields, size:'wide', onSubmit:v => {
        const items = {};
        Object.keys(v).forEach(k => { if (k.indexOf('l_')===0) items[k.slice(2)] = Number(v[k]); });
        App.pay.setSplit(o, { mode:'items', heads, items }); App.ui.render();
      } });
  },
  'slot-method': (el) => {
    const st = App.ui.state; st.slotDraft = st.slotDraft || {};
    st.slotDraft[el.dataset.slot] = Object.assign({}, st.slotDraft[el.dataset.slot], { method:el.dataset.method });
    App.ui.render();
  },
  'slot-pay-exact': (el) => { App.ui.state.slotDraft[el.dataset.slot] = Object.assign({}, App.ui.state.slotDraft[el.dataset.slot], { amount:null, cashReceived:'' }); App.actions['slot-pay'](el); },
  'slot-pay': async (el) => {
    const st = App.ui.state, o = App.model.order(st.payOrderId); if (!o) return;
    const slot = App.pay.shares(o, o.split).find(s => s.id === el.dataset.slot); if (!slot) return;
    const draft = st.slotDraft[slot.id] || {};
    const method = draft.method || 'cash';
    const left = slot.amount - App.pay.slotPaid(o, slot.id);
    const amount = Math.round(Number(draft.amount) || left);
    if (amount <= 0) return App.ui.toast('مبلغ نامعتبر است.', 'err');
    const extra = { method, amount, slotId:slot.id, label:slot.label + ' · ' + App.pay.methodLabel(method), cashReceived:Number(draft.cashReceived)||0, note:draft.note||'' };
    if (method === 'card') {
      const psps = App.pay.enabledPsps();
      const psp = psps.find(p => p.id === draft.pspId) || psps[0];
      if (!psp) return App.ui.toast('هیچ درگاه PSP فعالی تنظیم نشده است.', 'err');
      App.ui.toast('در انتظار پاسخ کارتخوان «' + psp.name + '»…');
      const res = await App.pay.pspPay(psp, amount, o.no);
      if (!res.ok) return App.ui.toast('تراکنش ناموفق: ' + (res.message || res.code), 'err');
      Object.assign(extra, { pspId:psp.id, pspName:psp.name, ref:res.ref, trace:res.trace, pan:res.pan, label:slot.label + ' · کارتخوان ' + psp.name });
    } else if (method === 'credit') {
      if (!App.auth.can('payment.credit')) return App.ui.toast('دسترسی پرداخت اعتباری ندارید.', 'err');
      const c = App.pay.customers().find(x => x.id === draft.customerId);
      if (!c) return App.ui.toast('ابتدا مشتری اعتباری را انتخاب کنید.', 'err');
      Object.assign(extra, { customerId:c.id, customerName:c.name });
    }
    const r = App.pay.addPayment(o, extra);
    if (!r.ok) return App.ui.toast(r.error, 'err');
    if (method === 'cash' && extra.cashReceived > amount) App.ui.toast('پول خرد: ' + App.util.money(extra.cashReceived - amount) + ' تومان', 'ok');
    App.ui.toast('پرداخت ' + App.util.money(amount) + ' تومان ثبت شد.', 'ok');
    delete st.slotDraft[slot.id];
    App.ui.render();
  },
  'credit-add': () => {
    App.ui.form({ title:'تعریف مشتری اعتباری', fields:[{ name:'name',label:'نام مشتری / شرکت',type:'text',required:true },{ name:'phone',label:'تلفن',type:'tel' }],
      onSubmit:v => { const c = App.pay.addCustomer(v.name, v.phone); if (c) { App.ui.toast('مشتری اضافه شد.', 'ok'); App.ui.render(); } } });
  },
  'pay-remove': (el) => {
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    App.ui.confirm('این پرداخت حذف شود؟', () => { App.pay.removePayment(o, el.dataset.id); App.ui.render(); });
  },
  'pay-extra': () => {
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    App.ui.form({ title:'پرداخت آزاد / ترکیبی', fields:[
      { name:'method', label:'روش', type:'select', options:App.views.opts(App.pay.METHODS,'id','label'), value:'cash' },
      { name:'amount', label:'مبلغ (تومان)', type:'number', value:App.model.remaining(o), min:1 },
      { name:'ref', label:'شماره مرجع / توضیح', type:'text' }
    ], onSubmit:v => {
      const r = App.pay.addPayment(o, { method:v.method, amount:v.amount, ref:v.ref, label:App.pay.methodLabel(v.method) });
      App.ui.toast(r.ok ? 'پرداخت ثبت شد.' : r.error, r.ok?'ok':'err'); App.ui.render();
    } });
  },
  settle: () => {
    if (!App.auth.can('payment.settle')) return App.ui.toast('دسترسی تسویه ندارید.', 'err');
    const o = App.model.order(App.ui.state.payOrderId); if (!o) return;
    const r = App.pay.settle(o);
    if (!r.ok) return App.ui.toast(r.error, 'err');
    App.ui.state.payOrderId = null;
    App.ui.state.invSel = { kind:'invoice', id:r.invoice.id };
    App.ui.state.invTab = 'archive';
    App.ui.go('invoice');
    App.ui.toast('فاکتور شماره ' + App.util.num(r.invoice.no) + ' صادر و ذخیره شد. میز آزاد شد.', 'ok');
  }
});

function getInv(el) {
  const d = App.model.D();
  const kind = el.dataset.kind;
  if (kind === 'order') { const o = App.model.order(el.dataset.id); return o ? { inv:App.views.provisional(o), kind } : null; }
  const i = App.model.invoice(el.dataset.id); return i ? { inv:i, kind } : null;
}
function D() { return App.model.D(); }
function changeQty(lineId, delta) {
  const o = App.model.order(App.ui.state.orderId); if (!o) return;
  if (!App.auth.can('order.edit')) return App.ui.toast('دسترسی ویرایش سفارش ندارید.', 'err');
  const l = o.lines.find(x => x.id === lineId); if (!l) return;
  App.store.commit(() => {
    l.qty += delta;
    if (l.qty <= 0) l.voided = true;
    if (l.sent) l.sent = {};
    l.sentQty = 0;
    o.updatedAt = Date.now();
  }, 'order.edit', 'تغییر تعداد قلم');
  App.ui.refresh();
}

Object.assign(App.inputs, {
  'product-search': (el) => {
    App.ui.state.productSearch = el.value;
    const grid = document.querySelector('.product-grid');
    if (!grid) return;
    const d = D(), st = App.ui.state, q = el.value.trim();
    const gid = st.groupId && st.groupId !== 'all' ? st.groupId : null;
    const list = d.products.filter(p => p.active !== false && (!gid || p.groupId === gid) && (!q || p.name.indexOf(q) !== -1 || (p.code||'').indexOf(q) !== -1));
    grid.innerHTML = list.length ? list.map(p => '<button class="product-card" data-action="add-product" data-id="' + p.id + '"><div class="p-name">' + App.util.esc(p.name) + '</div><div class="p-foot"><span class="p-price num">' + App.util.money(p.price) + '</span><span class="p-add">' + App.util.icon('plus','sm') + '</span></div></button>').join('') : '<div style="grid-column:1/-1">' + App.views.empty('کالایی یافت نشد.','book') + '</div>';
  }
});
