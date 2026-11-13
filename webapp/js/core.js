/* ============================================================================
 * Hooshyar POS v2 — core / data layer
 * Responsibilty: utils, schema+migration, persistence, identity, audit, lookups.
 * Business rules live in domain.js, printing in printing.js, payments in
 * payments.js, analytics in reports.js, UI in views-*.js.
 * Classic scripts (no ES modules) => identical code runs in a browser and
 * from file:///android_asset/ inside the Android WebView.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};
App.version = '2.0.0';
App.device = { android: false };

/* --------------------------------- utils --------------------------------- */
App.util = (function () {
  const nf = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
  const fDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year:'numeric', month:'2-digit', day:'2-digit' });
  const fDateLatin = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year:'numeric', month:'2-digit', day:'2-digit' });
  const fTime = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { hour:'2-digit', minute:'2-digit', hour12:false });
  const fDateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });

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
  function sha256(message) {
    const bytes = utf8Bytes(String(message));
    const len = bytes.length, blocks = Math.ceil((len + 9) / 64);
    const data = new Uint8Array(blocks * 64);
    data.set(bytes); data[len] = 0x80;
    const dv = new DataView(data.buffer), bits = len * 8;
    dv.setUint32(blocks * 64 - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(blocks * 64 - 4, bits >>> 0);
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const w = new Uint32Array(64);
    for (let b = 0; b < blocks; b++) {
      const off = b * 64;
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15] >>> 3);
        const s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
      }
      let a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22), maj = (a & bb) ^ (a & c) ^ (bb & c);
        const t2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+bb)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map(x => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
  }

  let seq = 0;
  const uid = p => p + '-' + Date.now().toString(36) + '-' + (seq++).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const token = () => { const a = new Uint8Array(24); for (let i=0;i<a.length;i++) a[i] = Math.floor(Math.random()*256); return Array.from(a, x => ('0'+x.toString(16)).slice(-2)).join(''); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const num = n => nf.format(Math.round(Number(n) || 0));
  const money = n => nf.format(Math.round(Number(n) || 0));
  const date = ts => fDate.format(new Date(ts || Date.now()));
  const dateLatin = ts => fDateLatin.format(new Date(ts || Date.now()));
  const time = ts => fTime.format(new Date(ts || Date.now()));
  const datetime = ts => fDateTime.format(new Date(ts || Date.now()));
  function isoDate(ts) { const d = new Date(ts == null ? Date.now() : ts), p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  const hourOf = ts => new Date(ts).getHours();
  function elapsed(ts) {
    const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    return m < 60 ? m + ' دقیقه' : Math.floor(m/60) + ' ساعت و ' + (m%60) + ' دقیقه';
  }
  function duration(from, to) {
    const m = Math.max(0, Math.floor(((to || Date.now()) - from) / 60000));
    const p = n => String(n).padStart(2,'0');
    return p(Math.floor(m/60)) + ':' + p(m%60);
  }
  function debounce(fn, ms) { let t; return function () { const a=arguments,c=this; clearTimeout(t); t=setTimeout(()=>fn.apply(c,a),ms); }; }
  function download(name, content, mime) {
    const blob = new Blob([content], { type:mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function toBase64(bytes) {
    let s = ''; const CH = 0x8000;
    for (let i=0;i<bytes.length;i+=CH) s += String.fromCharCode.apply(null, bytes.subarray(i,i+CH));
    return btoa(s);
  }
  const icon = (id, cls) => '<svg class="ic ' + (cls||'') + '"><use href="#i-'+id+'"/></svg>';
  const sum = (arr, fn) => arr.reduce((a,x) => a + (fn ? fn(x) : x), 0);
  const pct = (part, whole) => whole > 0 ? Math.round(part / whole * 1000) / 10 : 0;
  return { sha256, utf8Bytes, uid, token, clone, esc, num, money, date, dateLatin, time, datetime, isoDate,
           hourOf, elapsed, duration, debounce, download, toBase64, icon, sum, pct };
})();

/* ------------------------------ permissions ------------------------------ */
App.PERMISSIONS = [
  { key:'dashboard.view',   label:'مشاهده پیشخوان',              group:'پیشخوان' },
  { key:'tables.view',      label:'مشاهده سالن و میزها',         group:'کنسول فروش' },
  { key:'tables.manage',    label:'تعریف / ویرایش میز و سالن',   group:'کنسول فروش' },
  { key:'order.create',     label:'ثبت سفارش جدید',               group:'کنسول فروش' },
  { key:'order.save',       label:'ذخیره پیشنویس (بدون چاپ)',    group:'کنسول فروش' },
  { key:'order.print',      label:'چاپ سفارش / رسید مشتری',      group:'کنسول فروش' },
  { key:'order.submit',     label:'ثبت سفارش و ارسال آشپزخانه',  group:'کنسول فروش' },
  { key:'order.settlePrint',label:'ثبت و چاپ نهایی (تسویه)',     group:'کنسول فروش' },
  { key:'order.edit',       label:'ویرایش اقلام سفارش',           group:'کنسول فروش' },
  { key:'order.transfer',   label:'جابهجایی میز',                 group:'کنسول فروش' },
  { key:'order.void',       label:'لغو / حذف قلم سفارش',          group:'کنسول فروش' },
  { key:'discount.line',    label:'تخفیف ردیفی',                   group:'مالی' },
  { key:'discount.invoice', label:'تخفیف کل فاکتور',               group:'مالی' },
  { key:'price.change',     label:'تغییر قیمت',                     group:'مالی' },
  { key:'payment.settle',   label:'تسویه فاکتور',                   group:'مالی' },
  { key:'payment.credit',   label:'پرداخت اعتباری',                 group:'مالی' },
  { key:'payment.refund',   label:'برگشت / اصلاح پرداخت',          group:'مالی' },
  { key:'invoice.view',     label:'مشاهده فاکتورها',                group:'فاکتور' },
  { key:'invoice.edit',     label:'ویرایش فاکتور',                   group:'فاکتور' },
  { key:'invoice.delete',   label:'حذف منطقی فاکتور',                group:'فاکتور' },
  { key:'invoice.deletePaid',label:'حذف فاکتور تسویهشده',           group:'فاکتور' },
  { key:'invoice.restore',  label:'بازیابی فاکتور',                  group:'فاکتور' },
  { key:'invoice.print',    label:'چاپ فاکتور',                      group:'فاکتور' },
  { key:'invoice.reprint',  label:'چاپ مجدد',                        group:'فاکتور' },
  { key:'kitchen.print',    label:'چاپ خط آشپزخانه',                 group:'چاپ' },
  { key:'printers.manage',  label:'مدیریت چاپگرها',                  group:'چاپ' },
  { key:'base.view',        label:'مشاهده اطلاعات پایه',             group:'اطلاعات پایه' },
  { key:'base.manage',      label:'مدیریت اطلاعات پایه',             group:'اطلاعات پایه' },
  { key:'menu.manage',      label:'تعریف گروه، کالا و قیمت',        group:'اطلاعات پایه' },
  { key:'stock.manage',     label:'مدیریت موجودی',                    group:'اطلاعات پایه' },
  { key:'club.manage',      label:'باشگاه مشتریان',                   group:'اطلاعات پایه' },
  { key:'commission.manage',label:'پرسنل و پورسانت',                  group:'اطلاعات پایه' },
  { key:'roles.manage',     label:'تعریف سطوح دسترسی',                group:'سامانه' },
  { key:'users.manage',     label:'مدیریت کاربران',                   group:'سامانه' },
  { key:'settings.manage',  label:'تنظیمات سامانه',                   group:'سامانه' },
  { key:'reports.view',     label:'مشاهده گزارشات',                   group:'سامانه' },
  { key:'reports.export',   label:'خروجی و چاپ گزارشات',             group:'سامانه' },
  { key:'backup.manage',    label:'پشتیبانگیری و بازیابی',           group:'سامانه' }
];
App.ALL_PERMISSIONS = App.PERMISSIONS.map(p => p.key);

App.BUILTIN_ROLES = [
  { id:'role-admin', name:'مدیر کل', builtin:true, permissions:App.ALL_PERMISSIONS.slice(), maxDiscountPercent:100, maxDiscountAmount:0 },
  { id:'role-manager', name:'مدیر سالن', builtin:true, permissions:App.ALL_PERMISSIONS.filter(k => !['users.manage','roles.manage','backup.manage'].includes(k)), maxDiscountPercent:30, maxDiscountAmount:0 },
  { id:'role-cashier', name:'صندوقدار', builtin:true, permissions:['dashboard.view','tables.view','order.create','order.save','order.print','order.submit','order.settlePrint','order.edit','discount.line','discount.invoice','payment.settle','payment.credit','payment.refund','invoice.view','invoice.print','invoice.reprint','kitchen.print','base.view','club.manage','reports.view'], maxDiscountPercent:10, maxDiscountAmount:0 },
  { id:'role-waiter', name:'سفارشگیر', builtin:true, permissions:['dashboard.view','tables.view','order.create','order.save','order.submit','order.edit','order.void','order.transfer','invoice.view','base.view','kitchen.print'], maxDiscountPercent:0, maxDiscountAmount:0 },
  { id:'role-kitchen', name:'آشپزخانه', builtin:true, permissions:['tables.view','invoice.view','base.view','kitchen.print'], maxDiscountPercent:0, maxDiscountAmount:0 }
];
App.ROLES = {
  admin:{label:'مدیر کل',permissions:App.ALL_PERMISSIONS.slice()},
  manager:{label:'مدیر سالن',permissions:App.BUILTIN_ROLES[1].permissions},
  cashier:{label:'صندوقدار',permissions:App.BUILTIN_ROLES[2].permissions},
  waiter:{label:'سفارشگیر',permissions:App.BUILTIN_ROLES[3].permissions},
  kitchen:{label:'آشپزخانه',permissions:App.BUILTIN_ROLES[4].permissions},
  custom:{label:'سفارشی',permissions:[]}
};

/* --------------------------------- store --------------------------------- */
App.store = (function () {
  const KEY = 'hooshyar.pos.data.v2';
  const OLD_KEY = 'hooshyar.pos.data.v1';
  const SESSION_KEY = 'hooshyar.pos.session.v2';
  const listeners = [];
  let saveTimer = null;

  const S = {
    data:null, session:null,

    defaults() {
      return {
        meta:{ version:2, createdAt:Date.now(), updatedAt:Date.now(), invoiceCounter:1000, lastSnapshot:null, demo:true },
        settings:{
          restaurantName:'رستوران هوشیار', address:'تهران، خیابان ولیعصر', phone:'۰۲۱-۱۲۳۴۵۶۷۸',
          currency:'تومان', taxPolicy:'invoice', taxPercent:9, levyPercent:0, levyFixed:0,
          calcOrder:'discount-first', invoiceWidth:80, kitchenWidth:80,
          footer:'با تشکر از حضور گرم شما 🌿', headerNote:'سفارش شما در حال آمادهسازی است',
          autoSave:true, printMeta:true, printVersion:true,
          stockPolicy:'on-submit', commissionPolicy:'product',
          club:{ enabled:true, customerRequired:false, welcomeMessage:'سلام {name} عزیز، به رستوران هوشیار خوش آمدید 🌿',
                 invoiceMessage:'فاکتور شما آماده است: {link}', smsProvider:'android', linkBase:'', consent:true }
        },
        roles:[], users:[], halls:[], tables:[], groups:[], products:[], stations:[], printers:[], psps:[],
        customers:[], personnel:[], cashRegisters:[], paymentMethods:[], orders:[], invoices:[], transfers:[],
        printJobs:[], stockMoves:[], audit:[], snapshots:[], processedKeys:[], clubMessages:[]
      };
    },

    seed() {
      const d = S.defaults();
      const hash = p => App.util.sha256('hooshyar:' + p + ':salt-2024');
      d.roles = App.util.clone(App.BUILTIN_ROLES);
      d.users = [
        { id:'u-admin', username:'admin', name:'مدیر کل', passHash:hash('1234'), role:'admin', roleIds:['role-admin'], permissions:App.ALL_PERMISSIONS.slice(), active:true, createdAt:Date.now() },
        { id:'u-cashier', username:'cashier', name:'خانم احمدی - صندوق', passHash:hash('2222'), role:'cashier', roleIds:['role-cashier'], permissions:App.BUILTIN_ROLES[2].permissions.slice(), pspId:'psp1', cashRegisterId:'cash-main', active:true, createdAt:Date.now() },
        { id:'u-waiter', username:'waiter', name:'آقای رضایی - سالن', passHash:hash('3333'), role:'waiter', roleIds:['role-waiter'], permissions:App.BUILTIN_ROLES[3].permissions.slice(), active:true, createdAt:Date.now() },
        { id:'u-kitchen', username:'kitchen', name:'آشپزخانه', passHash:hash('4444'), role:'kitchen', roleIds:['role-kitchen'], permissions:App.BUILTIN_ROLES[4].permissions.slice(), active:true, createdAt:Date.now() }
      ];
      d.personnel = [
        { id:'per1', code:'P-01', name:'آقای رضایی', phone:'۰۹۱۲۱۱۱۲۲۳۳', userId:'u-waiter', commissionPercent:3, active:true },
        { id:'per2', code:'P-02', name:'خانم احمدی', phone:'۰۹۱۲۴۴۴۵۵۶۶', userId:'u-cashier', commissionPercent:2, active:true }
      ];
      d.cashRegisters = [{id:'cash-main',name:'صندوق اصلی',code:'CASH-01',enabled:true}];
      d.customers = [
        { id:'c1', code:'C-1001', firstName:'علی', lastName:'محمدی', phone:'۰۹۱۲۳۴۵۶۷۸۹', creditLimit:2000000, credit:0, consent:true, purchaseCount:1, purchaseTotal:301000, createdAt:Date.now()-86400000 },
        { id:'c2', code:'C-1002', firstName:'شرکت', lastName:'نمونه', phone:'۰۲۱-۸۸۸۸۸۸۸۸', creditLimit:5000000, credit:0, consent:true, purchaseCount:0, purchaseTotal:0, createdAt:Date.now()-172800000 }
      ];
      d.paymentMethods = [
        { id:'cash', name:'نقدی', icon:'cash', enabled:true, kind:'cash' },
        { id:'card', name:'کارتخوان', icon:'wallet', enabled:true, kind:'card' },
        { id:'credit', name:'اعتباری', icon:'note', enabled:true, kind:'credit' },
        { id:'dongi', name:'دنگی', icon:'split', enabled:true, kind:'split' },
        { id:'other', name:'سایر / ترکیبی', icon:'tag', enabled:true, kind:'other' }
      ];
      d.halls = [
        { id:'h1', name:'سالن اصلی', color:'#f0a44b', sort:1 },
        { id:'h2', name:'تراس', color:'#4cc38a', sort:2 },
        { id:'h3', name:'سالن VIP', color:'#b98bf0', sort:3 }
      ];
      const t = (id,hallId,n,cap,x,y) => ({ id,hallId,name:n,capacity:cap,x,y,status:'free',orderId:null,occupiedAt:null });
      d.tables = [
        t('t1','h1','میز ۱',4,1,1), t('t2','h1','میز ۲',4,2,1), t('t3','h1','میز ۳',2,3,1), t('t4','h1','میز ۴',6,4,1),
        t('t5','h1','میز ۵',4,1,2), t('t6','h1','میز ۶',4,2,2), t('t7','h1','میز ۷',2,3,2), t('t8','h1','میز ۸',8,4,2),
        t('t9','h1','میز ۹',4,1,3), t('t10','h1','میز ۱۰',4,2,3),
        t('t11','h2','تراس ۱',4,1,1), t('t12','h2','تراس ۲',4,2,1), t('t13','h2','تراس ۳',2,3,1), t('t14','h2','تراس ۴',6,4,1),
        t('t15','h3','VIP ۱',6,1,1), t('t16','h3','VIP ۲',8,2,1)
      ];
      d.groups = [
        { id:'g1', name:'غذاهای اصلی', color:'#f0a44b', stationIds:['s-hot'], copies:1, commissionPercent:2, active:true, sort:1 },
        { id:'g2', name:'پیش غذا',     color:'#6aa9f5', stationIds:['s-hot'], copies:1, commissionPercent:2, active:true, sort:2 },
        { id:'g3', name:'سالاد و سرد', color:'#4cc38a', stationIds:['s-cold'], copies:1, commissionPercent:2, active:true, sort:3 },
        { id:'g4', name:'نوشیدنی',     color:'#b98bf0', stationIds:['s-bar'], copies:1, commissionPercent:1, active:true, sort:4 },
        { id:'g5', name:'دسر',         color:'#f36c6c', stationIds:['s-cold'], copies:1, commissionPercent:2, active:true, sort:5 }
      ];
      const p = (id,name,price,groupId,code,stock) => ({ id,name,price,groupId,code,description:'',active:true,stationIds:[],sort:99,
        stock, initialStock:stock, sold:0, minStock:2, trackStock:true, taxPercent:0, levyPercent:0,
        discount:{type:'amount',value:0}, commissionPercent:0, lockedReason:'' });
      d.products = [
        p('p1','چلوکباب کوبیده',185000,'g1','101',30), p('p2','چلوکباب برگ',265000,'g1','102',20),
        p('p3','جوجه کباب',210000,'g1','103',25),      p('p4','کباب شیشلیک',320000,'g1','104',12),
        p('p5','قورمه سبزی',165000,'g1','105',30),    p('p6','فسنجان',190000,'g1','106',20),
        p('p7','زرشک پلو با مرغ',175000,'g1','107',18), p('p17','پیتزا مخصوص',240000,'g2','108',10),
        p('p8','سوپ جو',65000,'g2','201',40),          p('p9','کشک بادمجان',85000,'g2','202',35),
        p('p10','ماست موسیر',45000,'g2','203',50),     p('p11','سالاد شیرازی',55000,'g3','301',50),
        p('p12','سالاد سزار',135000,'g3','302',25),    p('p13','دوغ محلی',25000,'g4','401',80),
        p('p14','نوشابه خانواده',35000,'g4','402',60), p('p15','چای ایرانی',18000,'g4','403',100),
        p('p16','آب معدنی',12000,'g4','404',100),      p('p18','بستنی زعفرانی',75000,'g5','501',30)
      ];
      d.stations = [
        { id:'s-hot', name:'خط چاپ آشپزخانه گرم', printerId:'pr-hot', enabled:true, copies:1, sort:1 },
        { id:'s-cold',name:'خط چاپ سرد / سالاد',  printerId:'pr-cold',enabled:true, copies:1, sort:2 },
        { id:'s-bar', name:'خط چاپ بار / نوشیدنی', printerId:'pr-bar', enabled:false,copies:1, sort:3 }
      ];
      const pr = o => Object.assign({ kind:'network', ip:'192.168.1.50', port:9100, mac:'', vendorId:1046, productId:20497,
        width:80, usage:'invoice', enabled:true, copies:1, cut:true, drawer:false, header:'', footer:'' }, o);
      d.printers = [
        pr({ id:'pr-inv80', name:'چاپگر صندوق | ۸ سانتی XPrinter (IP)', width:80, usage:'invoice', ip:'192.168.1.50' }),
        pr({ id:'pr-inv58', name:'چاپگر صندوق | ۶ سانتی (IP)', width:58, usage:'invoice', ip:'192.168.1.51', enabled:false }),
        pr({ id:'pr-hot', name:'آشپزخانه گرم | XPrinter USB 80mm', width:80, usage:'kitchen', kind:'usb' }),
        pr({ id:'pr-cold',name:'خط سرد | 80mm شبکه', width:80, usage:'kitchen', ip:'192.168.1.52' }),
        pr({ id:'pr-bar', name:'بار | 58mm بلوتوث', width:58, usage:'kitchen', kind:'bluetooth', mac:'00:11:22:33:44:55' })
      ];
      const psp = o => Object.assign({ packageName:'', action:'', amountKey:'amount', invoiceKey:'invoiceNumber',
        responseKeys:{code:'responseCode',ref:'referenceNumber',trace:'traceNumber',pan:'maskedPan'},
        terminalId:'', merchantId:'', enabled:false, note:'' }, o);
      d.psps = [
        psp({ id:'psp1', name:'پرداخت الکترونیک پاسارگاد', packageName:'com.pec.payment', action:'ir.pec.payment.PURCHASE', enabled:true, terminalId:'00000001', merchantId:'000000000000001' }),
        psp({ id:'psp2', name:'ایران کیش', packageName:'ir.irankish.payment', action:'ir.irankish.PURCHASE', enabled:true }),
        psp({ id:'psp3', name:'به پرداخت ملت', packageName:'com.behpardakht.payment', action:'ir.behpardakht.PURCHASE', enabled:true }),
        psp({ id:'psp4', name:'آسان پرداخت', packageName:'ir.asanpardakht.payment', action:'ir.asanpardakht.PURCHASE', enabled:true })
      ];

      const now = Date.now();
      const mkLine = (id,pid,name,price,qty,note,sts) => ({ id,productId:pid,name,price,qty,note,sentQty:0,sent:{},voided:false,
        stationIds:sts,groupId:(d.products.find(x=>x.id===pid)||{}).groupId||'g1',discount:{type:'amount',value:0},taxPercent:0,levyPercent:0 });
      d.orders = [{
        id:'o-demo', no:1001, tableId:'t5', hallId:'h1', originalTableId:'t5', originalTableLabel:'میز ۵ · سالن اصلی',
        type:'حضوری', waiterId:'u-waiter', personnelId:'per1', customerId:'', customer:{name:'',phone:'',code:''},
        notes:'', status:'current', discount:{type:'amount',value:0}, payments:[],
        split:{mode:'none',heads:2,custom:[],items:{}}, lines:[
          mkLine('l1','p1','چلوکباب کوبیده',185000,2,'یکی بدون پیاز',['s-hot']),
          mkLine('l2','p11','سالاد شیرازی',55000,2,'',['s-cold']),
          mkLine('l3','p13','دوغ محلی',25000,2,'',['s-bar'])
        ],
        createdAt:now-2*3600000, occupiedAt:now-2*3600000, updatedAt:now, paidAt:null,
        createdBy:'u-waiter', createdByName:'آقای رضایی - سالن', editedBy:'', editedByName:'', editedAt:null,
        deletedBy:'', deletedByName:'', deletedAt:null, deleteReason:'', settledBy:'', settledByName:'', settledAt:null,
        versions:[], transfers:[], stockApplied:false, printCount:0, reprintLog:[], editCount:0, revision:1, invalidated:false
      }];
      d.tables.find(x=>x.id==='t5').status = 'occupied';
      d.tables.find(x=>x.id==='t5').orderId = 'o-demo';
      d.tables.find(x=>x.id==='t5').occupiedAt = now-2*3600000;
      d.meta.invoiceCounter = 1001;
      d.invoices = [{
        id:'inv-demo', no:1000, orderId:'o-archived', tableId:'t2', hallId:'h1', tableLabel:'میز ۲', hallLabel:'سالن اصلی',
        originalTableId:'t2', originalTableLabel:'میز ۲ · سالن اصلی', type:'حضوری',
        waiterId:'u-waiter', waiterName:'آقای رضایی - سالن', personnelId:'per1', customerId:'c1',
        customer:{name:'علی محمدی',phone:'۰۹۱۲۳۴۵۶۷۸۹',code:'C-1001'}, notes:'', status:'paid',
        lines:[ mkLine('pl1','p2','چلوکباب برگ',265000,1,'',['s-hot']), mkLine('pl2','p15','چای ایرانی',18000,2,'',['s-bar']) ],
        subtotal:301000, discount:0, discountPercent:0, tax:27090, levy:0, lineTax:0, total:328090,
        payments:[
          { id:'pay1', method:'cash', amount:178090, ref:'', at:now-3600000, label:'نقدی', slotId:'single', reversed:false },
          { id:'pay2', method:'card', amount:150000, ref:'۹۸۷۶۵۴', trace:'۱۲۳۴۵۶', pan:'****1234', pspName:'پرداخت الکترونیک پاسارگاد', terminalId:'00000001', status:'success', at:now-3600000, label:'کارتخوان', slotId:'single', reversed:false }
        ],
        split:null, createdAt:now-3900000, paidAt:now-3600000, printCount:1, reprintLog:[], editCount:0, revision:1,
        createdBy:'u-admin', createdByName:'مدیر کل', editedBy:'', editedByName:'', editedAt:null,
        deletedBy:'', deletedByName:'', deletedAt:null, deleteReason:'',
        settledBy:'u-cashier', settledByName:'خانم احمدی - صندوق', settledAt:now-3600000,
        versions:[], transfers:[], stockApplied:true, commission:null, clubToken:App.util.token(), invalidated:false
      }];
      d.audit = [{ id:'a-demo', at:now, userId:'u-admin', userName:'مدیر کل', action:'setup', detail:'راهاندازی اولیه سامانه نسخه ۲' }];
      return d;
    },

    /** Versioned, idempotent migration for data created by v1 or older. */
    ensureShape(d) {
      const def = S.defaults();
      Object.keys(def).forEach(k => { if (d[k] == null) d[k] = def[k]; });
      Object.keys(def.settings).forEach(k => { if (d.settings[k] == null) d.settings[k] = def.settings[k]; });
      if (d.settings.club) Object.keys(def.settings.club).forEach(k => { if (d.settings.club[k] == null) d.settings.club[k] = def.settings.club[k]; });
      else d.settings.club = def.settings.club;
      Object.keys(def.meta).forEach(k => { if (d.meta[k] == null) d.meta[k] = def.meta[k]; });

      if (!d.roles || !d.roles.length) d.roles = App.util.clone(App.BUILTIN_ROLES);
      if (!d.personnel) d.personnel = [];
      if (!d.paymentMethods || !d.paymentMethods.length) d.paymentMethods = def.paymentMethods;
      (d.users||[]).forEach(u => {
        if (!u.roleIds) u.roleIds = [({admin:'role-admin',manager:'role-manager',cashier:'role-cashier',waiter:'role-waiter',kitchen:'role-kitchen'})[u.role] || 'role-custom'];
        if (!u.permissions) u.permissions = [];
      });
      (d.customers||[]).forEach(c => {
        if (c.creditLimit == null) c.creditLimit = 0;
        if (!c.firstName && !c.lastName) { c.firstName = c.name || ''; c.lastName = ''; }
        if (!c.code) c.code = 'C-' + c.id.slice(-4);
        if (c.consent == null) c.consent = true;
        if (c.purchaseCount == null) c.purchaseCount = 0;
        if (c.purchaseTotal == null) c.purchaseTotal = 0;
      });
      const productDefaults = { stock:null, initialStock:null, sold:0, minStock:0, trackStock:false, taxPercent:0, levyPercent:0, commissionPercent:0, discount:{type:'amount',value:0}, lockedReason:'' };
      (d.products||[]).forEach(p => Object.keys(productDefaults).forEach(k => { if (p[k] == null) p[k] = App.util.clone(productDefaults[k]); }));
      (d.groups||[]).forEach(g => { if (g.commissionPercent == null) g.commissionPercent = 0; });
      const entityDefaults = {
        status:'current', customerId:'', personnelId:'', customer:{name:'',phone:'',code:''},
        originalTableId:null, originalTableLabel:'', notes:'', versions:[], transfers:[], stockApplied:false,
        printCount:0, reprintLog:[], editCount:0, revision:1, invalidated:false,
        createdBy:'', createdByName:'', editedBy:'', editedByName:'', editedAt:null,
        deletedBy:'', deletedByName:'', deletedAt:null, deleteReason:'',
        settledBy:'', settledByName:'', settledAt:null, occupiedAt:null, editReason:''
      };
      const fixLines = l => {
        if (!l.discount) l.discount = { type:'amount', value:0 };
        if (l.taxPercent == null) l.taxPercent = 0;
        if (l.levyPercent == null) l.levyPercent = 0;
        if (!l.sent) l.sent = {};
        if (l.sentQty == null) l.sentQty = 0;
        if (!l.groupId) l.groupId = (d.products.find(p=>p.id===l.productId)||{}).groupId || '';
      };
      (d.orders||[]).forEach(o => {
        Object.keys(entityDefaults).forEach(k => { if (o[k] == null) o[k] = App.util.clone(entityDefaults[k]); });
        if (!o.occupiedAt) o.occupiedAt = o.createdAt;
        if (o.status === 'open') o.status = 'current';
        (o.lines||[]).forEach(fixLines);
        if (!o.split) o.split = { mode:'none', heads:2, custom:[], items:{} };
      });
      (d.invoices||[]).forEach(i => {
        Object.keys(entityDefaults).forEach(k => { if (i[k] == null) i[k] = App.util.clone(entityDefaults[k]); });
        if (i.status === 'paid' && i.editCount > 0) i.status = 'edited';
        (i.lines||[]).forEach(fixLines);
        if (i.tax == null) i.tax = 0;
        if (i.levy == null) i.levy = 0;
        if (i.lineTax == null) i.lineTax = 0;
        if (i.discountPercent == null) i.discountPercent = 0;
        if (!i.clubToken) i.clubToken = App.util.token();
        (i.payments||[]).forEach(p => { if (!p.status) p.status = 'success'; if (!p.slotId) p.slotId = 'single'; });
      });
      (d.tables||[]).forEach(t => { if (t.occupiedAt == null) t.occupiedAt = null; });
      (d.printJobs||[]).forEach(j => { if (!j.idempotencyKey) j.idempotencyKey = 'legacy-'+j.id; });
      d.meta.version = 2;
      return d;
    },

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); } catch (e) {}
      if (!raw && window.AndroidPOS && AndroidPOS.loadBackup) { try { raw = AndroidPOS.loadBackup(); } catch (e) { raw = null; } }
      if (raw) { try { S.data = S.ensureShape(JSON.parse(raw)); } catch (e) { console.warn('restore failed', e); S.data = S.seed(); } }
      else S.data = S.seed();
      try { S.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { S.session = null; }
      S.snapshot();
      return S.data;
    },
    snapshot() {
      const d = S.data, today = App.util.isoDate();
      if (d.meta.lastSnapshot === today) return;
      d.meta.lastSnapshot = today;
      try {
        d.snapshots = (d.snapshots||[]).slice(-6);
        d.snapshots.push({ at:Date.now(), label:'نسخه خودکار ' + App.util.date(),
          data:JSON.stringify({ users:d.users, roles:d.roles, halls:d.halls, tables:d.tables, groups:d.groups,
            products:d.products, printers:d.printers, stations:d.stations, psps:d.psps, settings:d.settings,
            customers:d.customers, personnel:d.personnel, invoices:d.invoices.slice(-150) }) });
      } catch (e) {}
    },
    on(fn) { listeners.push(fn); },
    emit() { listeners.forEach(fn => { try { fn(S.data); } catch (e) { console.error(e); } }); },
    commit(mutator, action, detail, extra) {
      mutator(S.data);
      S.data.meta.updatedAt = Date.now();
      if (action) App.audit(action, detail || '', extra);
      S.emit(); S.scheduleSave();
    },
    scheduleSave() {
      if (S.data && S.data.settings && S.data.settings.autoSave === false) return;
      const el = document.getElementById('save-state');
      if (el) { el.classList.add('saving'); el.querySelector('span').textContent = 'در حال ذخیره…'; }
      clearTimeout(saveTimer); saveTimer = setTimeout(() => S.saveNow(), 350);
    },
    saveNow() {
      clearTimeout(saveTimer);
      try {
        const text = JSON.stringify(S.data);
        localStorage.setItem(KEY, text);
        if (window.AndroidPOS && AndroidPOS.saveBackup) AndroidPOS.saveBackup(text);
        const el = document.getElementById('save-state');
        if (el) { el.classList.remove('saving'); el.querySelector('span').textContent = 'ذخیره شد · ' + App.util.time(); }
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
      S.data = S.ensureShape(parsed); S.saveNow(); S.emit();
    },
    clearDemo() {
      S.commit(d => {
        d.orders = []; d.invoices = []; d.printJobs = []; d.transfers = []; d.clubMessages = [];
        d.tables.forEach(t => { t.status='free'; t.orderId=null; t.occupiedAt=null; });
        d.products.forEach(p => { p.sold = 0; if (p.trackStock && p.initialStock != null) p.stock = p.initialStock; });
        d.meta.invoiceCounter = 1000; d.meta.demo = false;
      }, 'setup', 'حذف دادههای نمونه');
    },
    resetAll() { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); localStorage.removeItem(SESSION_KEY); },
    setSession(s) { S.session = s; try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {} },
    getSession() { return S.session; }
  };
  return S;
})();

/* --------------------------------- auth --------------------------------- */
App.auth = (function () {
  const fast = p => App.util.sha256('hooshyar:' + p + ':salt-2024');
  function hash(p) { let h = fast(p); for (let i=0;i<120;i++) h = App.util.sha256(h + ':' + i); return h; }
  function verify(u, pass) { return !!u && !!u.active && (u.passHash === hash(pass) || u.passHash === fast(pass)); }
  const users = () => (App.store.data.users||[]).filter(u => u.active);
  function current() {
    const s = App.store.getSession();
    if (!s) return null;
    return (App.store.data.users||[]).find(u => u.id === s.userId && u.active) || null;
  }
  function actor() { const u = current(); return { id:u?u.id:'system', name:u?u.name:'سامانه' }; }
  function login(userId, password, remember) {
    const u = users().find(x => x.id === userId);
    if (!u || !verify(u, password)) {
      App.audit('login.failed', 'تلاش ناموفق ورود برای «' + (u ? u.name : userId) + '»', { severity:'warning' });
      App.store.saveNow(); return false;
    }
    App.store.setSession({ userId:u.id, loginAt:Date.now(), remember:!!remember });
    App.audit('login', 'ورود کاربر «' + u.name + '»'); App.store.saveNow(); return true;
  }
  function logout() { App.audit('logout', 'خروج از حساب کاربری'); App.store.saveNow(); App.store.setSession(null); }
  /** Union of permissions of built-in role, explicit list and assigned custom levels. */
  function permissions(u) {
    if (!u) return [];
    if (u.role === 'admin') return App.ALL_PERMISSIONS.slice();
    const set = new Set(u.permissions || []);
    const builtin = App.ROLES[u.role]; if (builtin) builtin.permissions.forEach(p => set.add(p));
    (u.roleIds||[]).forEach(rid => { const r = (App.store.data.roles||[]).find(x => x.id === rid); if (r) (r.permissions||[]).forEach(p => set.add(p)); });
    return Array.from(set);
  }
  function can(perm) { return permissions(current()).indexOf(perm) !== -1; }
  function maxDiscount() {
    const u = current(); if (!u) return { percent:0, amount:0 };
    if (u.role === 'admin') return { percent:100, amount:0 };
    let percent = u.maxDiscountPercent != null ? Number(u.maxDiscountPercent) : 0;
    let amount = u.maxDiscountAmount != null ? Number(u.maxDiscountAmount) : 0;
    (u.roleIds||[]).forEach(rid => {
      const r = (App.store.data.roles||[]).find(x => x.id === rid);
      if (r) { percent = Math.max(percent, Number(r.maxDiscountPercent)||0); amount = Math.max(amount, Number(r.maxDiscountAmount)||0); }
    });
    if (!u.roleIds || !u.roleIds.length) {
      const b = (App.store.data.roles||[]).find(r => r.id === ({admin:'role-admin',manager:'role-manager',cashier:'role-cashier',waiter:'role-waiter',kitchen:'role-kitchen'})[u.role]);
      if (b) { percent = Math.max(percent, Number(b.maxDiscountPercent)||0); amount = Math.max(amount, Number(b.maxDiscountAmount)||0); }
    }
    return { percent, amount };
  }
  function roleLabel(u) {
    if (!u) return '—';
    const ids = u.roleIds||[];
    const custom = ids.map(id => (App.store.data.roles||[]).find(r => r.id===id)).filter(Boolean).map(r => r.name);
    return custom.length ? custom.join(' + ') : (App.ROLES[u.role] || App.ROLES.custom).label;
  }
  function setPassword(id, pass) { App.store.commit(d => { const u = d.users.find(x=>x.id===id); if (u) u.passHash = hash(pass); }, 'security', 'تغییر رمز عبور'); }
  function addRole(role) {
    const r = Object.assign({ id:App.util.uid('role'), builtin:false, permissions:[], maxDiscountPercent:0, maxDiscountAmount:0 }, role);
    App.store.commit(d => { d.roles.push(r); }, 'roles.manage', 'ایجاد سطح دسترسی «' + r.name + '»');
    return r;
  }
  return { hash, fast, verify, users, current, actor, login, logout, permissions, can, maxDiscount, roleLabel, setPassword, addRole };
})();

App.audit = function (action, detail, extra) {
  const a = App.auth.actor(), d = App.store.data;
  d.audit = d.audit || [];
  d.audit.unshift(Object.assign({ id:App.util.uid('a'), at:Date.now(), userId:a.id, userName:a.name, action, detail:detail||'' }, extra || {}));
  if (d.audit.length > 1000) d.audit.length = 1000;
};

/* -------------------------------- model -------------------------------- */
App.model = (function () {
  const D = () => App.store.data;
  const group = id => D().groups.find(g => g.id===id);
  const product = id => D().products.find(p => p.id===id);
  const table = id => D().tables.find(t => t.id===id);
  const hall = id => D().halls.find(h => h.id===id);
  const station = id => D().stations.find(s => s.id===id);
  const printer = id => D().printers.find(p => p.id===id);
  const customer = id => D().customers.find(c => c.id===id);
  const personnel = id => D().personnel.find(p => p.id===id);
  const order = id => D().orders.find(o => o.id===id);
  const invoice = id => D().invoices.find(i => i.id===id);
  const role = id => D().roles.find(r => r.id===id);
  function tableLabel(id) { const t = table(id); return t ? t.name + (hall(t.hallId) ? ' · ' + hall(t.hallId).name : '') : '—'; }
  function label(o) { return o.tableId ? tableLabel(o.tableId) : (o.type || 'بیرون بر'); }
  function lineStations(l) {
    if (l.stationIds && l.stationIds.length) return l.stationIds;
    const p = product(l.productId);
    if (p && p.stationIds && p.stationIds.length) return p.stationIds;
    const g = group(p ? p.groupId : l.groupId);
    return g && g.stationIds && g.stationIds.length ? g.stationIds : [];
  }
  function totals(o) { return App.domain.totals(o); }
  function paid(o) { return App.util.sum((o.payments||[]).filter(p => !p.reversed && p.status !== 'failed'), p => Number(p.amount)||0); }
  function remaining(o) { return Math.max(0, totals(o).total - paid(o)); }
  function openOrders() { return D().orders.filter(o => o.status !== 'paid' && o.status !== 'deleted' && o.status !== 'void'); }
  function allInvoices() { return D().invoices.slice(); }
  function createOrder(tableId, type) {
    const d = D(), t = table(tableId), a = App.auth.actor();
    let o = null;
    App.store.commit(data => {
      data.meta.invoiceCounter = (data.meta.invoiceCounter||1000) + 1;
      o = {
        id:App.util.uid('o'), no:data.meta.invoiceCounter, tableId:tableId||null, hallId:t?t.hallId:null,
        originalTableId:tableId||null, originalTableLabel:t?tableLabel(tableId):'',
        type:type||'حضوری', waiterId:a.id, personnelId:(data.personnel.find(p=>p.userId===a.id)||{}).id||'',
        customerId:'', customer:{name:'',phone:'',code:''}, notes:'', status:'draft',
        discount:{type:'amount',value:0}, payments:[], split:{mode:'none',heads:2,custom:[],items:{}},
        lines:[], createdAt:Date.now(), occupiedAt:Date.now(), updatedAt:Date.now(), paidAt:null,
        createdBy:a.id, createdByName:a.name, editedBy:'', editedByName:'', editedAt:null,
        deletedBy:'', deletedByName:'', deletedAt:null, deleteReason:'', settledBy:'', settledByName:'', settledAt:null,
        versions:[], transfers:[], stockApplied:false, printCount:0, reprintLog:[], editCount:0, revision:1, invalidated:false,
        editReason:'', commission:null, clubToken:null
      };
      data.orders.push(o);
      if (t) { t.status='occupied'; t.orderId=o.id; t.occupiedAt=o.occupiedAt; }
    }, 'order.create', 'ایجاد سفارش ' + (t ? t.name : type));
    return o;
  }
  function addLine(o, productId, note) {
    const p = product(productId); if (!p) return null;
    let line;
    App.store.commit(() => {
      line = o.lines.find(l => l.productId===productId && !l.voided && (l.note||'')===(note||''));
      if (line) line.qty += 1;
      else {
        line = { id:App.util.uid('l'), productId, name:p.name, price:p.price, qty:1, note:note||'', sentQty:0, sent:{},
          voided:false, stationIds:p.stationIds?p.stationIds.slice():[], groupId:p.groupId,
          discount:{type:'amount',value:0}, taxPercent:p.taxPercent||0, levyPercent:p.levyPercent||0 };
        o.lines.push(line);
      }
      o.updatedAt = Date.now();
    }, 'order.edit', 'افزودن «' + p.name + '»');
    return line;
  }
  function nextInvoiceNo() { return D().meta.invoiceCounter || 1000; }
  return { D, group, product, table, hall, station, printer, customer, personnel, order, invoice, role,
           tableLabel, label, lineStations, totals, paid, remaining, openOrders, allInvoices,
           createOrder, addLine, nextInvoiceNo };
})();

(function detect() {
  try { App.device.android = !!(window.AndroidPOS && AndroidPOS.isAndroid && AndroidPOS.isAndroid()); }
  catch (e) { App.device.android = !!window.AndroidPOS; }
  App.device.browser = !App.device.android;
})();
