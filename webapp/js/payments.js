/* ============================================================================
 * Hooshyar POS v2 — payment service
 * Mixed payments, credit limits, PSP/card-reader intents, item-by-item settlement.
 * Every transaction is tied to an invoice number and records its actor.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};

App.pay = (function () {
  const U = App.util;
  const METHODS = [
    { id:'cash',   label:'نقدی',      icon:'cash',   desc:'پرداخت نقدی / اسکناس' },
    { id:'credit', label:'اعتباری',   icon:'note',   desc:'حساب مشتری با سقف اعتبار' },
    { id:'card',   label:'کارتخوان',  icon:'wallet', desc:'PSP / دستگاه اندرویدی' },
    { id:'other',  label:'سایر',      icon:'tag',    desc:'کوپن، انتقال، کیف پول' }
  ];
  const methodLabel = m => (METHODS.find(x => x.id===m) || { label:m || '—' }).label;
  function remainingItems(order) {
    const paidByLine={};
    (order.payments||[]).filter(p=>!p.reversed&&p.status!=='failed').forEach(p=>(p.itemAllocations||[]).forEach(x=>{paidByLine[x.lineId]=(paidByLine[x.lineId]||0)+(Number(x.qty)||0);}));
    return (order.lines||[]).filter(l=>!l.voided).map(line=>({line,remaining:Math.max(0,(Number(line.qty)||0)-(paidByLine[line.id]||0))})).filter(x=>x.remaining>0);
  }
  function itemBatch(order, selected) {
    const items=remainingItems(order), chosen=items.map(({line,remaining})=>({line,qty:Math.max(0,Math.min(remaining,Number((selected||{})[line.id])||0))})).filter(x=>x.qty>0);
    if(!chosen.length)return {ok:false,error:'برای تسویه، تعداد یک یا چند قلم را انتخاب کنید.'};
    const remainingGross=items.reduce((a,x)=>a+(Number(x.line.price)||0)*x.remaining,0);
    const selectedGross=chosen.reduce((a,x)=>a+(Number(x.line.price)||0)*x.qty,0), remaining=App.model.remaining(order);
    const finalBatch=chosen.reduce((a,x)=>a+x.qty,0)>=items.reduce((a,x)=>a+x.remaining,0);
    const amount=finalBatch?remaining:Math.round(remaining*(remainingGross?selectedGross/remainingGross:0));
    if(amount<=0)return {ok:false,error:'مبلغ این انتخاب صفر است؛ اقلام باقی‌مانده را بررسی کنید.'};
    return {ok:true,amount,finalBatch,itemAllocations:chosen.map(({line,qty})=>({lineId:line.id,name:line.name,qty,unitPrice:Number(line.price)||0}))};
  }

  function addPayment(o, p) {
    const amount = Math.round(Number(p.amount)||0);
    if (amount <= 0) return { ok:false, error:'مبلغ پرداخت باید بیشتر از صفر باشد' };
    if (p.method === 'credit') {
      if (!App.auth.can('payment.credit')) return { ok:false, error:'دسترسی پرداخت اعتباری ندارید' };
      const chk = App.domain.creditCheck(p.customerId || o.customerId, amount);
      if (!chk.ok) return chk;
    }
    const a = App.auth.actor();
    const pay = {
      id:U.uid('pay'), method:p.method, amount, slotId:p.slotId||'single',
      label:p.label || methodLabel(p.method), ref:p.ref||'', trace:p.trace||'', pan:p.pan||'',
      pspId:p.pspId||'', pspName:p.pspName||'', terminalId:p.terminalId||'', merchantId:p.merchantId||'',
      status:p.status || 'success', customerId:p.customerId||'', customerName:p.customerName||'',
      itemAllocations:U.clone(p.itemAllocations||[]), note:p.note||'', cashReceived:Number(p.cashReceived)||0, invoiceNo:o.no,
      at:Date.now(), by:a.id, byName:a.name, reversed:false
    };
    App.store.commit(() => {
      o.payments = o.payments || []; o.payments.push(pay); o.updatedAt = Date.now();
    }, 'payment.add', 'پرداخت ' + U.money(amount) + ' (' + pay.label + ') توسط ' + a.name + ' روی فاکتور ' + U.num(o.no),
      { before:null, after:U.clone(pay), entityType:'payment', entityId:pay.id });
    return { ok:true, payment:pay };
  }
  function removePayment(o, id) {
    const p = (o.payments||[]).find(x => x.id===id);
    if (!p) return { ok:false, error:'پرداخت یافت نشد' };
    App.store.commit(() => { o.payments = o.payments.filter(x => x.id!==id); o.updatedAt = Date.now(); },
      'payment.refund', 'حذف پرداخت ' + U.money(p.amount), { before:U.clone(p), after:null, entityType:'payment', entityId:id });
    return { ok:true };
  }
  function reversePayment(o, id) {
    App.store.commit(() => { const p=(o.payments||[]).find(x=>x.id===id); if (p) { p.reversed=true; p.reversedAt=Date.now(); } },
      'payment.refund', 'برگشت پرداخت', { entityType:'payment', entityId:id });
  }
  const canSettle = o => App.model.remaining(o) <= 0;
  function settle(o) { return App.domain.settle(o); }

  /* ------------------------------ PSP ------------------------------ */
  let pending = null;
  window.onPspResult = function (raw) {
    if (!pending) return;
    const p = pending; pending = null; clearTimeout(p.timer);
    p.resolve(normalize(typeof raw === 'string' ? safeParse(raw) : raw));
  };
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return { raw:s }; } }
  function normalize(r) {
    r = r || {};
    const code = String(r.code != null ? r.code : (r.responseCode != null ? r.responseCode : (r.resultCode != null ? r.resultCode : '')));
    const ok = code === '00' || code === '0' || r.ok === true || r.success === true || /success|موفق/i.test(String(r.message||''));
    return { ok, code, message:String(r.message || (ok ? 'تراکنش موفق' : 'تراکنش ناموفق')),
      ref:String(r.ref || r.referenceNumber || r.rrn || ''), trace:String(r.trace || r.traceNumber || ''),
      pan:String(r.pan || r.maskedPan || ''), raw:r };
  }
  function pspPay(psp, amount, invoiceNo) {
    return new Promise(resolve => {
      if (App.device.android && window.AndroidPOS && AndroidPOS.pspPay) {
        const req = { pspId:psp.id, name:psp.name, packageName:psp.packageName, action:psp.action,
          amount:Math.round(amount), amountKey:psp.amountKey||'amount', invoiceNumber:String(invoiceNo||''),
          invoiceKey:psp.invoiceKey||'invoiceNumber', terminalId:psp.terminalId||'', merchantId:psp.merchantId||'',
          responseKeys:psp.responseKeys||{}, currency:'IRR' };
        let sync = null;
        try { sync = AndroidPOS.pspPay(JSON.stringify(req)); } catch (e) { return resolve({ ok:false, message:'خطا در اجرای اپ PSP: '+e.message }); }
        const immediate = typeof sync === 'string' ? safeParse(sync) : sync;
        if (immediate && (immediate.code != null || immediate.ok != null || immediate.responseCode != null || immediate.error))
          return resolve(immediate.error ? { ok:false, message:String(immediate.error) } : normalize(immediate));
        pending = { resolve, timer:setTimeout(() => { if (pending && pending.resolve===resolve) { pending=null; resolve({ ok:false, message:'پاسخی از کارتخوان دریافت نشد' }); } }, 120000) };
        return;
      }
      App.ui.form({ title:'تایید دستی تراکنش کارتخوان',
        note:'<div class="login-error" style="margin-bottom:12px">در پیشنمایش وب اپلیکیشن PSP وجود ندارد؛ نتیجه اعلامشده توسط دستگاه کارتخوان را وارد کنید. روی اندروید این پنجره جای خود را به فراخوانی مستقیم اپ PSP میدهد.</div>' +
             '<div class="card"><div class="row"><span>درگاه:</span><b>'+U.esc(psp.name)+'</b><span class="spacer"></span><span>فاکتور:</span><b class="num">'+U.num(invoiceNo)+'</b><span>مبلغ:</span><b class="accent num">'+U.money(amount)+'</b></div></div>',
        fields:[
          { name:'code', label:'کد پاسخ (۰۰ = موفق)', type:'text', value:'00' },
          { name:'ref', label:'شماره مرجع / RRN', type:'text' },
          { name:'trace', label:'شماره پیگیری', type:'text' },
          { name:'pan', label:'چهار رقم آخر کارت', type:'text' }
        ], submit:'تایید تراکنش',
        onSubmit:v => {
          const ok = String(v.code||'').trim() === '00';
          resolve({ ok, code:String(v.code||''), message:ok?'تراکنش موفق (تایید دستی)':'تراکنش ناموفق', ref:v.ref, trace:v.trace, pan:v.pan, manual:true,
            terminalId:psp.terminalId||'', merchantId:psp.merchantId||'' });
        } });
    });
  }
  const enabledPsps = () => App.model.D().psps.filter(p => p.enabled);
  const customers = () => App.model.D().customers || [];
  function addCustomer(v) {
    const c = { id:U.uid('c'), code:(v.code||'').trim() || ('C-'+Math.floor(1000+Math.random()*9000)),
      firstName:(v.firstName||'').trim(), lastName:(v.lastName||'').trim(), phone:(v.phone||'').trim(),
      creditLimit:Math.max(0, Number(v.creditLimit)||0), credit:0, consent:v.consent !== false,
      purchaseCount:0, purchaseTotal:0, createdAt:Date.now() };
    if (!c.firstName && !c.lastName) return null;
    App.store.commit(d => { d.customers.push(c); }, 'club.manage', 'ثبت مشتری «'+c.firstName+' '+c.lastName+'»');
    return c;
  }
  return { METHODS, methodLabel, remainingItems, itemBatch, addPayment, removePayment,
           reversePayment, canSettle, settle, pspPay, enabledPsps, customers, addCustomer, normalize };
})();
