/* ============================================================
   Hooshyar POS — core: utils, crypto, store, auth, domain model
   Plain classic scripts (no ES modules) so the exact same files work
   over http:// in a browser AND from file:///android_asset/ in WebView.
   ============================================================ */
'use strict';
window.App = window.App || {};
App.version = '1.0.0';
App.device = { android: false };

/* ------------------------------ utils ------------------------------ */
App.util = (function () {
  const nf = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
  const fmtDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtDateLatin = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const c2 = str.charCodeAt(++i);
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  /** SHA-256 hex, pure JS so it also works on file:// (no crypto.subtle dependency). */
  function sha256(message) {
    const bytes = utf8Bytes(String(message));
    const len = bytes.length;
    const blocks = Math.ceil((len + 9) / 64);
    const data = new Uint8Array(blocks * 64);
    data.set(bytes);
    data[len] = 0x80;
    const dv = new DataView(data.buffer);
    const bits = len * 8;
    dv.setUint32(blocks * 64 - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(blocks * 64 - 4, bits >>> 0);
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const w = new Uint32Array(64);
    for (let b = 0; b < blocks; b++) {
      const off = b * 64;
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t-15], 7) ^ rotr(w[t-15], 18) ^ (w[t-15] >>> 3);
        const s1 = rotr(w[t-2], 17) ^ rotr(w[t-2], 19) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
      }
      let a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj = (a & bb) ^ (a & c) ^ (bb & c);
        const t2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+bb)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map(x => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
  }

  let seq = 0;
  const uid = (prefix) => prefix + '-' + Date.now().toString(36) + '-' + (seq++).toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const num = (n) => nf.format(Math.round(Number(n) || 0));
  const money = (n) => nf.format(Math.round(Number(n) || 0));
  const date = (ts) => fmtDate.format(new Date(ts || Date.now()));
  const dateLatin = (ts) => fmtDateLatin.format(new Date(ts || Date.now()));
  const time = (ts) => fmtTime.format(new Date(ts || Date.now()));
  const datetime = (ts) => fmtDateTime.format(new Date(ts || Date.now()));
  function isoDate(ts) {
    const d = new Date(ts == null ? Date.now() : ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  }
  function elapsed(ts) {
    const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (m < 60) return m + ' دقیقه';
    return Math.floor(m/60) + ' ساعت و ' + (m%60) + ' دقیقه';
  }
  function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; }
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function toBase64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function icon(id, cls) { return '<svg class="ic ' + (cls || '') + '"><use href="#i-' + id + '"/></svg>'; }
  const sum = (arr, fn) => arr.reduce((a, x) => a + (fn ? fn(x) : x), 0);
  return { sha256, utf8Bytes, uid, clone, esc, num, money, date, dateLatin, time, datetime, isoDate, elapsed, debounce, download, toBase64, icon, sum };
})();

/* --------------------------- permissions --------------------------- */
App.PERMISSIONS = [
  { key: 'tables.view',       label: 'مشاهده سالن و میزها',     group: 'سالن و سفارش' },
  { key: 'tables.manage',     label: 'تعریف / ویرایش میز و سالن', group: 'سالن و سفارش' },
  { key: 'order.create',      label: 'ثبت سفارش جدید',           group: 'سالن و سفارش' },
  { key: 'order.edit',        label: 'ویرایش اقلام سفارش',       group: 'سالن و سفارش' },
  { key: 'order.discount',    label: 'اعمال تخفیف',               group: 'سالن و سفارش' },
  { key: 'order.void',        label: 'حذف قلم / لغو سفارش',      group: 'سالن و سفارش' },
  { key: 'order.send',        label: 'ارسال به آشپزخانه',        group: 'سالن و سفارش' },
  { key: 'invoice.view',      label: 'مشاهده صورتحساب',          group: 'فاکتور و چاپ' },
  { key: 'invoice.print',     label: 'چاپ صورتحساب ۶ / ۸ سانتی', group: 'فاکتور و چاپ' },
  { key: 'invoice.reprint',   label: 'چاپ مجدد فاکتور',           group: 'فاکتور و چاپ' },
  { key: 'kitchen.print',     label: 'چاپ خط آشپزخانه',           group: 'فاکتور و چاپ' },
  { key: 'printers.manage',   label: 'مدیریت چاپگرها و خطوط چاپ', group: 'فاکتور و چاپ' },
  { key: 'payment.settle',    label: 'تسویه فاکتور',               group: 'تسویه' },
  { key: 'payment.credit',    label: 'پرداخت اعتباری / حساب مشتری', group: 'تسویه' },
  { key: 'payment.refund',    label: 'برگشت / اصلاح پرداخت',      group: 'تسویه' },
  { key: 'menu.view',         label: 'مشاهده منو و کالاها',       group: 'منو و گزارشات' },
  { key: 'menu.manage',       label: 'تعریف گروه، کالا و قیمت',   group: 'منو و گزارشات' },
  { key: 'reports.view',      label: 'مشاهده گزارشات',            group: 'منو و گزارشات' },
  { key: 'users.manage',      label: 'مدیریت کاربران و دسترسی',   group: 'سامانه' },
  { key: 'settings.manage',   label: 'تنظیمات سامانه و PSP',      group: 'سامانه' },
  { key: 'backup.manage',     label: 'پشتیبانگیری و بازیابی',     group: 'سامانه' }
];
App.ALL_PERMISSIONS = App.PERMISSIONS.map(p => p.key);

App.ROLES = {
  admin:   { label: 'مدیر کل',        desc: 'دسترسی کامل به همه بخشها', permissions: App.ALL_PERMISSIONS.slice() },
  manager: { label: 'مدیر سالن',      desc: 'همه عملیات به جز مدیریت کاربران و پشتیبان', permissions: App.ALL_PERMISSIONS.filter(k => k !== 'users.manage' && k !== 'backup.manage') },
  cashier: { label: 'صندوقدار',       desc: 'صورتحساب، چاپ و تسویه', permissions: ['tables.view','order.create','order.edit','order.discount','invoice.view','invoice.print','invoice.reprint','payment.settle','payment.credit','payment.refund','menu.view','reports.view','kitchen.print'] },
  waiter:  { label: 'سفارشگیر / گارسون', desc: 'ثبت و ارسال سفارش', permissions: ['tables.view','order.create','order.edit','order.void','order.send','invoice.view','menu.view','kitchen.print'] },
  kitchen: { label: 'آشپزخانه',       desc: 'فقط مشاهده و چاپ سفارشها', permissions: ['tables.view','invoice.view','menu.view','kitchen.print','order.send'] },
  custom:  { label: 'سفارشی',          desc: 'انتخاب دستی سطح دسترسی', permissions: [] }
};

/* ------------------------------- store ------------------------------- */
App.store = (function () {
  const KEY = 'hooshyar.pos.data.v1';
  const SESSION_KEY = 'hooshyar.pos.session.v1';
  const listeners = [];
  let saveTimer = null;
  const S = {
    data: null,
    session: null,

    defaults() {
      return {
        meta: { version: 1, createdAt: Date.now(), updatedAt: Date.now(), invoiceCounter: 1000, lastSnapshot: null, demo: true },
        settings: {
          restaurantName: 'رستوران هوشیار', address: 'تهران، خیابان ولیعصر', phone: '۰۲۱-۱۲۳۴۵۶۷۸',
          currency: 'تومان', taxPercent: 0, servicePercent: 0, invoiceWidth: 80, kitchenWidth: 80,
          footer: 'با تشکر از حضور گرم شما 🌿', autoSave: true, headerNote: 'سفارش شما در حال آمادهسازی است'
        },
        users: [], halls: [], tables: [], groups: [], products: [], stations: [], printers: [],
        psps: [], customers: [], orders: [], invoices: [], payments: [], printJobs: [], audit: [], snapshots: []
      };
    },

    seed() {
      const d = S.defaults();
      const hash = p => App.util.sha256('hooshyar:' + p + ':salt-2024');
      d.users = [
        { id:'u-admin', username:'admin', name:'مدیر کل', passHash:hash('1234'), role:'admin', permissions:App.ALL_PERMISSIONS.slice(), active:true, createdAt:Date.now() },
        { id:'u-cashier', username:'cashier', name:'خانم احمدی - صندوق', passHash:hash('2222'), role:'cashier', permissions:App.ROLES.cashier.permissions.slice(), active:true, createdAt:Date.now() },
        { id:'u-waiter', username:'waiter', name:'آقای رضایی - سالن', passHash:hash('3333'), role:'waiter', permissions:App.ROLES.waiter.permissions.slice(), active:true, createdAt:Date.now() },
        { id:'u-kitchen', username:'kitchen', name:'آشپزخانه', passHash:hash('4444'), role:'kitchen', permissions:App.ROLES.kitchen.permissions.slice(), active:true, createdAt:Date.now() }
      ];
      d.halls = [
        { id:'h1', name:'سالن اصلی', color:'#f0a44b', sort:1 },
        { id:'h2', name:'تراس', color:'#4cc38a', sort:2 },
        { id:'h3', name:'سالن VIP', color:'#b98bf0', sort:3 }
      ];
      const t = (id, hallId, n, cap, x, y) => ({ id, hallId, name:n, capacity:cap, x, y, status:'free', orderId:null });
      d.tables = [
        t('t1','h1','میز ۱',4,1,1), t('t2','h1','میز ۲',4,2,1), t('t3','h1','میز ۳',2,3,1), t('t4','h1','میز ۴',6,4,1),
        t('t5','h1','میز ۵',4,1,2), t('t6','h1','میز ۶',4,2,2), t('t7','h1','میز ۷',2,3,2), t('t8','h1','میز ۸',8,4,2),
        t('t9','h1','میز ۹',4,1,3), t('t10','h1','میز ۱۰',4,2,3),
        t('t11','h2','تراس ۱',4,1,1), t('t12','h2','تراس ۲',4,2,1), t('t13','h2','تراس ۳',2,3,1), t('t14','h2','تراس ۴',6,4,1),
        t('t15','h3','VIP ۱',6,1,1), t('t16','h3','VIP ۲',8,2,1)
      ];
      d.groups = [
        { id:'g1', name:'غذاهای اصلی', color:'#f0a44b', stationIds:['s-hot'], copies:1, active:true, sort:1 },
        { id:'g2', name:'پیش غذا',     color:'#6aa9f5', stationIds:['s-hot'], copies:1, active:true, sort:2 },
        { id:'g3', name:'سالاد و سرد', color:'#4cc38a', stationIds:['s-cold'], copies:1, active:true, sort:3 },
        { id:'g4', name:'نوشیدنی',     color:'#b98bf0', stationIds:['s-bar'], copies:1, active:true, sort:4 },
        { id:'g5', name:'دسر',         color:'#f36c6c', stationIds:['s-cold'], copies:1, active:true, sort:5 }
      ];
      const p = (id,name,price,groupId,code,desc) => ({ id,name,price,groupId,code,description:desc||'', active:true, stationIds:[], sort:99 });
      d.products = [
        p('p1','چلوکباب کوبیده',185000,'g1','101','یک سیخ، برنج ایرانی، گوجه و ماست'),
        p('p2','چلوکباب برگ',265000,'g1','102','یک سیخ، کره و زعفران'),
        p('p3','جوجه کباب',210000,'g1','103','سینه مرغ زعفرانی'),
        p('p4','کباب شیشلیک',320000,'g1','104','گوشت بره، استخوانی'),
        p('p5','قورمه سبزی',165000,'g1','105','خورشت با برنج'),
        p('p6','فسنجان',190000,'g1','106','گردو و رب انار'),
        p('p7','زرشک پلو با مرغ',175000,'g1','107',''),
        p('p8','سوپ جو',65000,'g2','201',''),
        p('p9','کشک بادمجان',85000,'g2','202',''),
        p('p10','ماست موسیر',45000,'g2','203',''),
        p('p11','سالاد شیرازی',55000,'g3','301',''),
        p('p12','سالاد سزار',135000,'g3','302',''),
        p('p13','دوغ محلی',25000,'g4','401',''),
        p('p14','نوشابه خانواده',35000,'g4','402',''),
        p('p15','چای ایرانی',18000,'g4','403',''),
        p('p16','آب معدنی',12000,'g4','404',''),
        p('p17','بستنی زعفرانی',75000,'g5','501',''),
        p('p18','شله زرد',45000,'g5','502','')
      ];
      d.stations = [
        { id:'s-hot',  name:'خط چاپ آشپزخانه گرم', printerId:'pr-hot',  enabled:true, copies:1, sort:1 },
        { id:'s-cold', name:'خط چاپ سرد / سالاد',  printerId:'pr-cold', enabled:true, copies:1, sort:2 },
        { id:'s-bar',  name:'خط چاپ بار / نوشیدنی', printerId:'pr-bar',  enabled:false, copies:1, sort:3 }
      ];
      const pr = (o) => Object.assign({ kind:'network', ip:'192.168.1.50', port:9100, mac:'', vendorId:1046, productId:20497, width:80, usage:'invoice', enabled:true, copies:1, cut:true, drawer:false, header:'', footer:'' }, o);
      d.printers = [
        pr({ id:'pr-inv80', name:'فاکتور ۸ سانتی | XPrinter 80mm (IP)', width:80, usage:'invoice', ip:'192.168.1.50' }),
        pr({ id:'pr-inv58', name:'فاکتور ۶ سانتی | 58mm (IP)', width:58, usage:'invoice', ip:'192.168.1.51', enabled:false }),
        pr({ id:'pr-hot',  name:'آشپزخانه گرم | XPrinter USB 80mm', width:80, usage:'kitchen', kind:'usb' }),
        pr({ id:'pr-cold', name:'خط سرد | 80mm شبکه', width:80, usage:'kitchen', ip:'192.168.1.52' }),
        pr({ id:'pr-bar',  name:'بار | 58mm بلوتوث', width:58, usage:'kitchen', kind:'bluetooth', mac:'00:11:22:33:44:55' })
      ];
      const psp = (o) => Object.assign({ packageName:'', action:'', amountKey:'amount', invoiceKey:'invoiceNumber', responseKeys:{ code:'responseCode', ref:'referenceNumber', trace:'traceNumber', pan:'maskedPan' }, terminalId:'', merchantId:'', enabled:false, note:'' }, o);
      d.psps = [
        psp({ id:'psp1', name:'پرداخت الکترونیک پاسارگاد', packageName:'com.pec.payment', action:'ir.pec.payment.PURCHASE', enabled:true, terminalId:'00000001', merchantId:'000000000000001', note:'نمونه - مقادیر بسته به قرارداد PSP تغییر کند' }),
        psp({ id:'psp2', name:'ایران کیش', packageName:'ir.irankish.payment', action:'ir.irankish.PURCHASE', enabled:true, note:'نمونه' }),
        psp({ id:'psp3', name:'به پرداخت ملت', packageName:'com.behpardakht.payment', action:'ir.behpardakht.PURCHASE', enabled:true, note:'نمونه' }),
        psp({ id:'psp4', name:'آسان پرداخت', packageName:'ir.asanpardakht.payment', action:'ir.asanpardakht.PURCHASE', enabled:true, note:'نمونه' })
      ];
      d.customers = [ { id:'c1', name:'شرکت نمونه', phone:'۰۹۱۲۳۴۵۶۷۸۹', credit:0 } ];

      // Demo content so every screen has something to show on first run.
      const now = Date.now();
      const demoOrder = {
        id:'o-demo', no:1001, tableId:'t5', hallId:'h1', type:'سالن', waiterId:'u-waiter',
        customer:{ name:'', phone:'' }, notes:'', status:'open', discount:{ type:'amount', value:0 },
        payments:[], split:{ mode:'none', heads:2, custom:[], items:{} },
        lines:[
          { id:'l1', productId:'p1', name:'چلوکباب کوبیده', price:185000, qty:2, note:'یکی بدون پیاز', sentQty:0, voided:false, stationIds:['s-hot'] },
          { id:'l2', productId:'p11', name:'سالاد شیرازی', price:55000, qty:2, note:'', sentQty:0, voided:false, stationIds:['s-cold'] },
          { id:'l3', productId:'p13', name:'دوغ محلی', price:25000, qty:2, note:'', sentQty:0, voided:false, stationIds:['s-bar'] }
        ],
        createdAt: now - 22*60000, updatedAt: now, paidAt:null
      };
      d.orders = [demoOrder];
      d.meta.invoiceCounter = 1001;
      const t5 = d.tables.find(x => x.id === 't5'); t5.status = 'occupied'; t5.orderId = 'o-demo';
      const paid = {
        id:'inv-demo', no:1000, orderId:'o-demo-archived', tableId:'t2', hallId:'h1', tableLabel:'میز ۲', hallLabel:'سالن اصلی',
        type:'سالن', waiterId:'u-waiter', waiterName:'آقای رضایی - سالن', customer:{name:'',phone:''},
        lines:[{ id:'pl1', productId:'p2', name:'چلوکباب برگ', price:265000, qty:1, note:'', voided:false, stationIds:['s-hot'] },
               { id:'pl2', productId:'p15', name:'چای ایرانی', price:18000, qty:2, note:'', voided:false, stationIds:['s-bar'] }],
        subtotal:301000, discount:0, tax:0, service:0, total:301000,
        payments:[{ id:'pay1', method:'cash', amount:151000, ref:'', at:now-3600000, label:'نقدی' },
                  { id:'pay2', method:'card', amount:150000, ref:'۹۸۷۶۵۴', pspName:'پرداخت الکترونیک پاسارگاد', at:now-3600000, label:'کارتخوان' }],
        split:null, status:'paid', createdAt:now-3900000, paidAt:now-3600000, printedCount:0
      };
      d.invoices = [paid];
      d.audit = [{ id:'a-demo', at:now, userId:'u-admin', userName:'مدیر کل', action:'setup', detail:'راهاندازی اولیه سامانه و بارگذاری دادههای نمونه' }];
      return d;
    },

    ensureShape(d) {
      const def = S.defaults();
      Object.keys(def).forEach(k => { if (d[k] == null) d[k] = def[k]; });
      Object.keys(def.settings).forEach(k => { if (d.settings[k] == null) d.settings[k] = def.settings[k]; });
      Object.keys(def.meta).forEach(k => { if (d.meta[k] == null) d.meta[k] = def.meta[k]; });
      return d;
    },

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* storage disabled */ }
      if (!raw && window.AndroidPOS && AndroidPOS.loadBackup) {
        try { raw = AndroidPOS.loadBackup(); } catch (e) { raw = null; }
      }
      if (raw) {
        try { S.data = S.ensureShape(JSON.parse(raw)); }
        catch (e) { console.warn('restore failed', e); S.data = S.seed(); }
      } else S.data = S.seed();
      try { S.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { S.session = null; }
      S.snapshot();
      return S.data;
    },

    snapshot() {
      const d = S.data;
      const today = App.util.isoDate();
      if (d.meta.lastSnapshot === today) return;
      d.meta.lastSnapshot = today;
      try {
        d.snapshots = (d.snapshots || []).slice(-6);
        d.snapshots.push({ at:Date.now(), label:'نسخه خودکار ' + App.util.date(), data:JSON.stringify({ users:d.users, halls:d.halls, tables:d.tables, groups:d.groups, products:d.products, printers:d.printers, stations:d.stations, psps:d.psps, settings:d.settings, invoices:d.invoices.slice(-100) }) });
      } catch (e) { /* ignore quota */ }
    },

    on(fn) { listeners.push(fn); },
    emit() { listeners.forEach(fn => { try { fn(S.data); } catch (e) { console.error(e); } }); },

    /** Single mutation entry point: every change is auto-saved and logged. */
    commit(mutator, action, detail) {
      mutator(S.data);
      S.data.meta.updatedAt = Date.now();
      if (action) App.audit(action, detail || '');
      S.emit();
      S.scheduleSave();
    },

    scheduleSave() {
      // Explicit "manual" mode: still saved on every lifecycle flush (close/background),
      // but not immediately after each keystroke/mutation.
      if (S.data && S.data.settings && S.data.settings.autoSave === false) return;
      const el = document.getElementById('save-state');
      if (el) { el.classList.add('saving'); el.querySelector('span').textContent = 'در حال ذخیره…'; }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => S.saveNow(), 350);
    },

    saveNow() {
      clearTimeout(saveTimer);
      try {
        const text = JSON.stringify(S.data);
        localStorage.setItem(KEY, text);
        if (window.AndroidPOS && AndroidPOS.saveBackup) AndroidPOS.saveBackup(text);
        const el = document.getElementById('save-state');
        if (el) {
          el.classList.remove('saving');
          el.querySelector('span').textContent = 'ذخیره شد · ' + App.util.time();
        }
      } catch (e) {
        console.error('save failed', e);
        const el = document.getElementById('save-state');
        if (el) { el.classList.remove('saving'); el.querySelector('span').textContent = 'خطا در ذخیرهسازی!'; }
      }
    },

    export() { return JSON.stringify(S.data, null, 2); },
    import(text) {
      const parsed = JSON.parse(text);
      if (!parsed || !parsed.meta || !Array.isArray(parsed.users)) throw new Error('فایل پشتیبان معتبر نیست');
      S.data = S.ensureShape(parsed);
      S.saveNow(); S.emit();
    },
    clearDemo() {
      S.commit(d => {
        d.orders = []; d.invoices = []; d.printJobs = []; d.payments = [];
        d.tables.forEach(t => { t.status = 'free'; t.orderId = null; });
        d.meta.invoiceCounter = 1000; d.meta.demo = false;
      }, 'setup', 'حذف دادههای نمونه');
    },
    resetAll() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION_KEY); },

    setSession(s) {
      S.session = s;
      try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {}
    },
    getSession() { return S.session; }
  };
  return S;
})();

/* ------------------------------- auth ------------------------------- */
App.auth = (function () {
  function hash(pass) {
    let h = App.util.sha256('hooshyar:' + pass + ':salt-2024');
    for (let i = 0; i < 120; i++) h = App.util.sha256(h + ':' + i);
    return h;
  }
  // Seed users are created with the fast hash; support both formats.
  function verify(user, pass) {
    if (!user || !user.active) return false;
    return user.passHash === hash(pass) || user.passHash === App.util.sha256('hooshyar:' + pass + ':salt-2024');
  }
  function current() {
    const s = App.store.getSession();
    if (!s) return null;
    return App.store.data.users.find(u => u.id === s.userId && u.active) || null;
  }
  function login(username, password, remember) {
    const u = App.store.data.users.find(x => x.username.trim().toLowerCase() === String(username || '').trim().toLowerCase());
    if (!verify(u, password)) return false;
    App.store.setSession({ userId:u.id, loginAt:Date.now(), remember:!!remember });
    App.audit('login', 'ورود کاربر «' + u.name + '»');
    App.store.saveNow();
    return true;
  }
  function logout() { App.audit('logout', 'خروج از حساب کاربری'); App.store.saveNow(); App.store.setSession(null); }
  function can(perm) {
    const u = current();
    if (!u) return false;
    if (u.role === 'admin') return true;
    return Array.isArray(u.permissions) && u.permissions.indexOf(perm) !== -1;
  }
  function roleLabel(u) { return (App.ROLES[u && u.role] || App.ROLES.custom).label; }
  function setPassword(userId, newPass) {
    App.store.commit(d => {
      const u = d.users.find(x => x.id === userId);
      if (u) u.passHash = hash(newPass);
    }, 'security', 'تغییر رمز عبور');
  }
  return { hash, verify, current, login, logout, can, roleLabel, setPassword };
})();

App.audit = function (action, detail) {
  const u = App.auth.current();
  const d = App.store.data;
  d.audit = d.audit || [];
  d.audit.unshift({ id:App.util.uid('a'), at:Date.now(), userId:u ? u.id : 'system', userName:u ? u.name : 'سامانه', action, detail });
  if (d.audit.length > 400) d.audit.length = 400;
};

/* ---------------------------- domain model ---------------------------- */
App.model = (function () {
  const D = () => App.store.data;
  const group = id => D().groups.find(g => g.id === id);
  const product = id => D().products.find(p => p.id === id);
  const table = id => D().tables.find(t => t.id === id);
  const hall = id => D().halls.find(h => h.id === id);
  const station = id => D().stations.find(s => s.id === id);
  const printer = id => D().printers.find(p => p.id === id);
  const order = id => D().orders.find(o => o.id === id);
  const invoice = id => D().invoices.find(i => i.id === id);

  function totals(o) {
    const s = D().settings;
    const subtotal = App.util.sum((o.lines || []).filter(l => !l.voided), l => (Number(l.price) || 0) * (Number(l.qty) || 0));
    let discount = 0;
    if (o.discount) {
      discount = o.discount.type === 'percent' ? Math.round(subtotal * (Number(o.discount.value) || 0) / 100) : Math.min(subtotal, Math.round(Number(o.discount.value) || 0));
    }
    const base = Math.max(0, subtotal - discount);
    const tax = Math.round(base * (Number(s.taxPercent) || 0) / 100);
    const service = Math.round(base * (Number(s.servicePercent) || 0) / 100);
    return { subtotal, discount, tax, service, total: base + tax + service, base };
  }
  function paid(o) { return App.util.sum((o.payments || []).filter(p => !p.reversed), p => Number(p.amount) || 0); }
  function remaining(o) { return Math.max(0, totals(o).total - paid(o)); }
  function lineStations(l) {
    if (l.stationIds && l.stationIds.length) return l.stationIds;
    const p = product(l.productId);
    if (p && p.stationIds && p.stationIds.length) return p.stationIds;
    const g = group(p ? p.groupId : l.groupId);
    return g && g.stationIds && g.stationIds.length ? g.stationIds : [];
  }
  function label(o) {
    const t = table(o.tableId);
    return t ? t.name + (hall(o.hallId) ? ' · ' + hall(o.hallId).name : '') : (o.type || 'بیرون بر');
  }
  function openOrders() { return D().orders.filter(o => o.status === 'open'); }
  function createOrder(tableId, type) {
    const d = D();
    const t = table(tableId);
    let o = null;
    App.store.commit(data => {
      data.meta.invoiceCounter = (data.meta.invoiceCounter || 1000) + 1;
      o = {
        id:App.util.uid('o'), no:data.meta.invoiceCounter, tableId:tableId || null, hallId:t ? t.hallId : null,
        type:type || 'سالن', waiterId:(App.auth.current() || {}).id || null,
        customer:{ name:'', phone:'' }, notes:'', status:'open', discount:{ type:'amount', value:0 },
        payments:[], split:{ mode:'none', heads:2, custom:[], items:{} }, lines:[],
        createdAt:Date.now(), updatedAt:Date.now(), paidAt:null
      };
      data.orders.push(o);
      if (t) { t.status = 'occupied'; t.orderId = o.id; }
    }, 'order.create', 'ایجاد سفارش ' + (t ? t.name : type));
    return o;
  }
  function addLine(o, productId, note) {
    const p = product(productId);
    if (!p) return null;
    let line;
    App.store.commit(() => {
      line = o.lines.find(l => l.productId === productId && !l.voided && (l.note || '') === (note || ''));
      if (line) line.qty += 1;
      else {
        line = { id:App.util.uid('l'), productId, name:p.name, price:p.price, qty:1, note:note || '', sentQty:0, voided:false, stationIds:p.stationIds ? p.stationIds.slice() : [], groupId:p.groupId };
        o.lines.push(line);
      }
      o.updatedAt = Date.now();
    }, 'order.edit', 'افزودن «' + p.name + '»');
    return line;
  }
  function settleOrder(o) {
    const d = D();
    const t = totals(o);
    d.meta.invoiceCounter = (d.meta.invoiceCounter || 1000);
    const inv = {
      id:App.util.uid('inv'), no:o.no, orderId:o.id, tableId:o.tableId, hallId:o.hallId,
      tableLabel:table(o.tableId) ? table(o.tableId).name : '—', hallLabel:hall(o.hallId) ? hall(o.hallId).name : '—',
      type:o.type, waiterId:o.waiterId, waiterName:(d.users.find(u => u.id === o.waiterId) || {}).name || '—',
      customer:Object.assign({}, o.customer), notes:o.notes || '',
      lines:o.lines.filter(l => !l.voided).map(l => Object.assign({}, l)),
      subtotal:t.subtotal, discount:t.discount, tax:t.tax, service:t.service, total:t.total,
      payments:(o.payments || []).map(p => Object.assign({}, p)), split:o.split ? App.util.clone(o.split) : null,
      status:'paid', createdAt:o.createdAt, paidAt:Date.now(), printedCount:0
    };
    App.store.commit(data => {
      data.invoices.unshift(inv);
      const ord = data.orders.find(x => x.id === o.id);
      if (ord) { ord.status = 'paid'; ord.paidAt = inv.paidAt; }
      const tb = data.tables.find(x => x.id === o.tableId);
      if (tb) { tb.status = 'free'; tb.orderId = null; }
      // Credit accounts: positive balance = debt owed by the customer.
      (o.payments || []).filter(p => p.method === 'credit' && p.customerId).forEach(p => {
        const c = data.customers.find(x => x.id === p.customerId);
        if (c) c.credit = (Number(c.credit) || 0) + (Number(p.amount) || 0);
      });
    }, 'payment.settle', 'تسویه فاکتور شماره ' + inv.no + ' به مبلغ ' + App.util.money(t.total));
    return inv;
  }
  function nextInvoiceNo() { return D().meta.invoiceCounter || 1000; }
  return { D, group, product, table, hall, station, printer, order, invoice, totals, paid, remaining, lineStations, label, openOrders, createOrder, addLine, settleOrder, nextInvoiceNo };
})();

/* ----------------------- bridge / platform info ----------------------- */
(function detect() {
  try {
    App.device.android = !!(window.AndroidPOS && AndroidPOS.isAndroid && AndroidPOS.isAndroid());
  } catch (e) { App.device.android = !!window.AndroidPOS; }
  App.device.browser = !App.device.android;
})();
