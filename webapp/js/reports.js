/* ============================================================================
 * Hooshyar POS v2 — analytics / reporting service (pure, UI-independent)
 * ==========================================================================*/
'use strict';
window.App = window.App || {};

App.report = (function () {
  const U = App.util;
  const D = () => App.store.data;

  function defaultFilters() {
    return { from:'', to:'', fromTime:'00:00', toTime:'23:59', userId:'', hallId:'', tableId:'',
      groupId:'', method:'', status:'', type:'', range:'today' };
  }
  function ts(inv) { return inv.paidAt || inv.createdAt || 0; }
  function inRange(inv, f) {
    if (!f) return true;
    const d = new Date(ts(inv)), day = U.isoDate(ts(inv)), hhmm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.fromTime && hhmm < f.fromTime) return false;
    if (f.toTime && hhmm > f.toTime) return false;
    return true;
  }
  function filter(f) {
    f = Object.assign(defaultFilters(), f || {});
    return (D().invoices||[]).filter(i => {
      if (!inRange(i,f)) return false;
      if (f.status && i.status !== f.status) return false;
      if (f.type && i.type !== f.type) return false;
      if (f.userId && i.waiterId !== f.userId && i.createdBy !== f.userId && i.settledBy !== f.userId) return false;
      if (f.hallId && i.hallId !== f.hallId) return false;
      if (f.tableId && i.tableId !== f.tableId && i.originalTableId !== f.tableId) return false;
      if (f.method && !(i.payments||[]).some(p => p.method === f.method && !p.reversed)) return false;
      if (f.groupId && !(i.lines||[]).some(l => {
        const p = D().products.find(x => x.id===l.productId); return (p?p.groupId:l.groupId) === f.groupId;
      })) return false;
      return true;
    });
  }
  function methodOf(inv) {
    const ms = (inv.payments||[]).filter(p=>!p.reversed && p.status!=='failed').map(p=>p.method);
    if (!ms.length) return 'none';
    const uniq = Array.from(new Set(ms));
    return uniq.length > 1 ? 'mixed' : uniq[0];
  }
  const METHOD_LABEL = { cash:'نقدی', card:'کارتخوان', credit:'اعتباری', other:'سایر', split:'دنگی', mixed:'ترکیبی', none:'—' };

  function summary(invs) {
    const byMethod={}, byStatus={}, byType={}, byHall={}, byWaiter={}, byDay={}, byHour={};
    let total=0, discount=0, lineDiscount=0, tax=0, levy=0, commission=0, cash=0, card=0, credit=0;
    invs.forEach(i => {
      const t = Number(i.total)||0; total += t;
      discount += Number(i.discount)||0; lineDiscount += Number(i.lineDiscount)||0;
      tax += Number(i.tax)||0; levy += Number(i.levy)||0;
      commission += (i.commission && i.commission.total) || 0;
      const m = methodOf(i); byMethod[m] = (byMethod[m]||0)+t;
      byStatus[i.status||'paid'] = (byStatus[i.status||'paid']||0)+1;
      byType[i.type||'حضوری'] = (byType[i.type||'حضوری']||0)+t;
      byHall[i.hallLabel||'—'] = (byHall[i.hallLabel||'—']||0)+t;
      byWaiter[i.personnelName||i.waiterName||'—'] = (byWaiter[i.personnelName||i.waiterName||'—']||0)+t;
      byDay[U.isoDate(ts(i))] = (byDay[U.isoDate(ts(i))]||0)+t;
      byHour[U.hourOf(ts(i))] = (byHour[U.hourOf(ts(i))]||0)+t;
      (i.payments||[]).filter(p=>!p.reversed && p.status!=='failed').forEach(p => {
        if (p.method==='cash') cash += Number(p.amount)||0;
        if (p.method==='card') card += Number(p.amount)||0;
        if (p.method==='credit') credit += Number(p.amount)||0;
      });
    });
    return { count:invs.length, total, discount, lineDiscount, tax, levy, commission, cash, card, credit,
      average:invs.length?Math.round(total/invs.length):0, byMethod, byStatus, byType, byHall, byWaiter, byDay, byHour };
  }
  function items(invs) {
    const map = {};
    invs.forEach(i => (i.lines||[]).filter(l=>!l.voided).forEach(l => {
      const p = D().products.find(x=>x.id===l.productId), g = D().groups.find(x=>x.id===(p?p.groupId:l.groupId));
      const k = l.productId || l.name, d = map[k] || (map[k] = { id:k, name:l.name, qty:0, amount:0, discount:0, group:g?g.name:'سایر', orders:0 });
      const gross = (Number(l.price)||0)*(Number(l.qty)||0);
      d.qty += Number(l.qty)||0; d.amount += gross; d.discount += App.domain.discountValue(l.discount,gross); d.orders++;
    }));
    return Object.values(map).sort((a,b)=>b.qty-a.qty);
  }
  function byGroup(invs) {
    const map={};
    invs.forEach(i => (i.lines||[]).filter(l=>!l.voided).forEach(l => {
      const p=D().products.find(x=>x.id===l.productId), g=D().groups.find(x=>x.id===(p?p.groupId:l.groupId));
      const k=g?g.name:'سایر'; map[k]=(map[k]||0)+(Number(l.price)||0)*(Number(l.qty)||0);
    }));
    return map;
  }
  function waiters(invs) {
    const map={};
    invs.forEach(i => {
      const k=i.personnelName||i.waiterName||'—';
      const d=map[k]||(map[k]={name:k,orders:0,amount:0,commission:0});
      d.orders++; d.amount+=Number(i.total)||0; d.commission+=(i.commission&&i.commission.total)||0;
    });
    return Object.values(map).sort((a,b)=>b.amount-a.amount);
  }
  function cardTransactions(invs) {
    const rows=[];
    invs.forEach(i => (i.payments||[]).filter(p=>p.method==='card').forEach(p =>
      rows.push({ no:i.no, at:p.at||i.paidAt, amount:p.amount, status:p.status||'success', psp:p.pspName||'—',
        terminal:p.terminalId||'—', ref:p.ref||'—', trace:p.trace||'—', pan:p.pan||'—', by:p.byName||i.settledByName||'—', invoiceId:i.id })));
    return rows.sort((a,b)=>b.at-a.at);
  }
  function creditRows() {
    return (D().customers||[]).map(c => ({ id:c.id, name:App.club.fullName(c), code:c.code, phone:c.phone,
      limit:c.creditLimit||0, used:c.credit||0, available:App.domain.creditAvailable(c),
      purchases:c.purchaseCount||0, total:c.purchaseTotal||0 }));
  }
  function transfers(f) {
    return (D().transfers||[]).filter(t => !f || (!f.from || U.isoDate(t.at)>=f.from) && (!f.to || U.isoDate(t.at)<=f.to));
  }
  function changes(f) {
    return (D().audit||[]).filter(a => /entity\.(edit|delete|restore)/.test(a.action) || /stock\./.test(a.action))
      .filter(a => !f || (!f.from || U.isoDate(a.at)>=f.from) && (!f.to || U.isoDate(a.at)<=f.to));
  }
  function stockMovements(f) {
    return (D().stockMoves||[]).filter(m=>!f||(!f.from||U.isoDate(m.at)>=f.from)&&(!f.to||U.isoDate(m.at)<=f.to)&&(!f.productId||m.productId===f.productId))
      .slice().sort((a,b)=>b.at-a.at);
  }
  function stockAlerts() {
    return (D().products||[]).filter(p => p.trackStock && p.stock != null && Number(p.stock) <= (Number(p.minStock)||0))
      .map(p => ({ id:p.id, name:p.name, stock:p.stock, min:p.minStock, sold:p.sold||0, status:App.domain.stockStatus(p) }));
  }
  function orders(f) { return (D().orders||[]).filter(o => o.status !== 'paid' && o.status !== 'deleted'); }
  function hourly(invs) {
    const arr=Array.from({length:24},(_,h)=>({label:String(h).padStart(2,'0')+':00',value:0}));
    invs.forEach(i => { arr[U.hourOf(ts(i))].value += Number(i.total)||0; });
    return arr;
  }
  function daily(invs, days) {
    days = days||14; const arr=[];
    for (let k=days-1;k>=0;k--) {
      const d=U.isoDate(Date.now()-k*86400000);
      arr.push({ label:d.slice(5), value:0 });
    }
    const idx={}; arr.forEach((x,i)=>idx[x.label]=i);
    invs.forEach(i => { const key=U.isoDate(ts(i)).slice(5); if (idx[key]!=null) arr[idx[key]].value += Number(i.total)||0; });
    return arr;
  }
  function csv(headers, rows) {
    const q = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
    return '\ufeff' + [headers.map(q).join(','), ...rows.map(r=>r.map(q).join(','))].join('\n');
  }

  const REPORTS = [
    { id:'orders',      label:'سفارشات',          icon:'receipt', desc:'بر اساس تاریخ و ساعت، وضعیت، نوع و کاربر' },
    { id:'items',       label:'اقلام فروش رفته',  icon:'book',    desc:'تعداد و مبلغ هر کالا در بازه زمانی' },
    { id:'changes',     label:'ویرایش و حذف فاکتور', icon:'edit', desc:'تاریخچه ویرایش، حذف، بازیابی و چاپ مجدد' },
    { id:'credit',      label:'گزارش اعتباری',    icon:'note',    desc:'سقف، مصرف و مانده اعتبار مشتریان' },
    { id:'cash',        label:'فروش نقد',         icon:'cash',    desc:'تراکنشهای نقدی به تفکیک فاکتور' },
    { id:'card',        label:'فروش کارتخوان',    icon:'wallet',  desc:'تراکنشها، مرجع، پایانه و وضعیت' },
    { id:'total',       label:'سرجمع فروش',       icon:'chart',   desc:'روزانه، ساعتی، روش پرداخت و مالیات' },
    { id:'waiters',     label:'سفارشگیر / پورسانت',icon:'users',  desc:'فروش و پورسانت به تفکیک پرسنل' },
    { id:'transfers',   label:'جابهجایی میز',     icon:'grid',    desc:'زنجیره انتقال میزها' },
    { id:'stock',       label:'موجودی کالا',      icon:'layers',  desc:'کالاهای تمام‌شده و نزدیک به اتمام' },
    { id:'stock-ledger',label:'گردش موجودی',       icon:'refresh', desc:'فروش، اصلاح دستی، برگشت و اختلاف موجودی' },
    { id:'actors',      label:'عاملین عملیات',    icon:'lock',    desc:'ثبتکننده، ویرایشکننده، حذفکننده، تسویهکننده' }
  ];
  return { defaultFilters, filter, inRange, methodOf, METHOD_LABEL, summary, items, byGroup, waiters,
           cardTransactions, creditRows, transfers, changes, stockMovements, stockAlerts, orders, hourly, daily, csv, REPORTS };
})();
