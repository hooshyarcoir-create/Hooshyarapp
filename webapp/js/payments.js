/* ============================================================
   Hooshyar POS — payments & PSP (کارتخوان) & «دنگی» split
   On Android, AndroidPOS.pspPay() starts the PSP app's purchase
   intent and the result is delivered to window.onPspResult().
   In the browser preview a clearly-labelled manual confirmation
   dialog is used instead (no real PSP SDK is bundled).
   ============================================================ */
'use strict';
window.App = window.App || {};

App.pay = (function () {
  const U = App.util;

  const METHODS = [
    { id:'cash',   label:'نقدی',      icon:'cash',   desc:'پرداخت نقدی / اسکناس' },
    { id:'credit', label:'اعتباری',   icon:'note',   desc:'حساب مشتری / نسیه' },
    { id:'card',   label:'کارتخوان',  icon:'wallet', desc:'PSP / دستگاه اندرویدی' },
    { id:'other',  label:'سایر',      icon:'tag',    desc:'کوپن، انتقال، کیف پول' }
  ];
  const methodLabel = m => (METHODS.find(x => x.id === m) || { label:m || '—' }).label;

  const SPLIT_MODES = {
    none:   'بدون تقسیم',
    equal:  'دنگی مساوی',
    custom: 'دنگی دلخواه',
    items:  'دنگی بر اساس اقلام'
  };

  /* ------------------------------- shares ------------------------------- */
  /**
   * Returns [{ id, label, amount }] for the current split configuration.
   * Shares always add up exactly to the invoice total (toman integers).
   */
  function shares(order, split) {
    split = split || order.split || { mode:'none' };
    const t = App.model.totals(order);
    const total = t.total;
    const mode = split.mode || 'none';
    if (mode === 'equal') {
      const n = Math.max(2, Math.min(30, Math.floor(Number(split.heads) || 2)));
      const base = Math.floor(total / n);
      let rem = total - base * n;
      return Array.from({ length:n }, (_, i) => ({ id:'s' + i, label:'نفر ' + U.num(i+1), amount:base + (rem-- > 0 ? 1 : 0) }));
    }
    if (mode === 'custom') {
      const vals = (split.custom || []).map(Number).filter(v => v >= 0);
      if (!vals.length) return [{ id:'s0', label:'کل فاکتور', amount:total }];
      const out = vals.map((v, i) => ({ id:'s' + i, label:'نفر ' + U.num(i+1), amount:Math.round(v) }));
      const diff = total - U.sum(out, x => x.amount);
      out[out.length-1].amount += diff;
      return out;
    }
    if (mode === 'items') {
      const heads = Math.max(2, Math.min(20, Math.floor(Number(split.heads) || 2)));
      const buckets = Array.from({ length:heads }, () => 0);
      const lines = (order.lines || []).filter(l => !l.voided);
      lines.forEach(l => {
        const idx = Math.max(0, Math.min(heads-1, Number((split.items || {})[l.id]) || 0));
        buckets[idx] += (Number(l.price)||0) * (Number(l.qty)||0);
      });
      const sub = U.sum(buckets) || 1;
      const factor = total / sub;
      const out = buckets.map((v, i) => ({ id:'s' + i, label:'نفر ' + U.num(i+1), amount:Math.round(v * factor) }));
      const diff = total - U.sum(out, x => x.amount);
      out[out.length-1].amount += diff;
      return out;
    }
    return [{ id:'single', label:'کل فاکتور', amount:total }];
  }

  function slotPaid(order, slotId) {
    return U.sum((order.payments || []).filter(p => !p.reversed && p.slotId === slotId), p => Number(p.amount) || 0);
  }
  function slotRemaining(order, slot) { return Math.max(0, slot.amount - slotPaid(order, slot.id)); }

  function setSplit(order, patch) {
    App.store.commit(() => { order.split = Object.assign({ mode:'none', heads:2, custom:[], items:{} }, order.split, patch); }, 'order.edit', 'تغییر نحوه تقسیم دنگی');
  }

  /* ------------------------------ payments ------------------------------ */
  function addPayment(order, p) {
    const pay = {
      id:U.uid('pay'), method:p.method, amount:Math.round(Number(p.amount) || 0),
      slotId:p.slotId || 'single', label:p.label || methodLabel(p.method),
      ref:p.ref || '', trace:p.trace || '', pan:p.pan || '', pspId:p.pspId || '', pspName:p.pspName || '',
      customerId:p.customerId || '', customerName:p.customerName || '',
      note:p.note || '', cashReceived:Number(p.cashReceived) || 0, at:Date.now(), reversed:false
    };
    if (pay.amount <= 0) return { ok:false, error:'مبلغ پرداخت باید بیشتر از صفر باشد' };
    App.store.commit(() => {
      order.payments = order.payments || [];
      order.payments.push(pay);
      order.updatedAt = Date.now();
    }, 'payment.add', 'پرداخت ' + U.money(pay.amount) + ' ' + S.currencyLabel() + ' · ' + pay.label);
    return { ok:true, payment:pay };
  }
  const S = { currencyLabel: () => App.model.D().settings.currency };

  function removePayment(order, payId) {
    App.store.commit(() => { order.payments = (order.payments || []).filter(p => p.id !== payId); order.updatedAt = Date.now(); }, 'payment.refund', 'حذف یک پرداخت');
  }
  function reversePayment(order, payId) {
    App.store.commit(() => {
      const p = (order.payments || []).find(x => x.id === payId);
      if (p) { p.reversed = true; p.reversedAt = Date.now(); }
    }, 'payment.refund', 'برگشت پرداخت');
  }

  function canSettle(order) { return App.model.remaining(order) <= 0; }
  function settle(order) {
    if (!canSettle(order)) return { ok:false, error:'مبلغ فاکتور هنوز به طور کامل پرداخت نشده است' };
    if (!(order.lines || []).some(l => !l.voided)) return { ok:false, error:'فاکتور بدون قلم کالا قابل تسویه نیست' };
    const inv = App.model.settleOrder(order);
    return { ok:true, invoice:inv };
  }

  /* -------------------------------- PSP -------------------------------- */
  let pending = null;
  window.onPspResult = function (raw) {
    if (!pending) return;
    const p = pending; pending = null;
    clearTimeout(p.timer);
    p.resolve(normalize(typeof raw === 'string' ? safeParse(raw) : raw));
  };
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return { raw:s }; } }
  function normalize(r) {
    r = r || {};
    const keys = r.keys || {};
    const code = String(r.code != null ? r.code : (r.responseCode != null ? r.responseCode : (r.resultCode != null ? r.resultCode : '')));
    const ok = code === '00' || code === '0' || r.ok === true || r.success === true || /success|موفق/i.test(String(r.message || ''));
    return {
      ok, code, message:String(r.message || (ok ? 'تراکنش موفق' : 'تراکنش ناموفق')),
      ref:String(r.ref || r.referenceNumber || r.rrn || keys.ref || ''),
      trace:String(r.trace || r.traceNumber || keys.trace || ''),
      pan:String(r.pan || r.maskedPan || keys.pan || ''),
      raw:r
    };
  }

  /** Start a card transaction. Resolves with a normalized result. */
  function pspPay(psp, amount, invoiceNo) {
    return new Promise((resolve) => {
      if (App.device.android && window.AndroidPOS && AndroidPOS.pspPay) {
        const req = {
          pspId:psp.id, name:psp.name, packageName:psp.packageName, action:psp.action,
          amount:Math.round(amount), amountKey:psp.amountKey || 'amount',
          invoiceNumber:String(invoiceNo || ''), invoiceKey:psp.invoiceKey || 'invoiceNumber',
          terminalId:psp.terminalId || '', merchantId:psp.merchantId || '',
          responseKeys:psp.responseKeys || {}, currency:'IRR'
        };
        let sync = null;
        try { sync = AndroidPOS.pspPay(JSON.stringify(req)); } catch (e) { return resolve({ ok:false, code:'', message:'خطا در اجرای اپلیکیشن PSP: ' + e.message }); }
        const immediate = typeof sync === 'string' ? safeParse(sync) : sync;
        if (immediate && (immediate.code != null || immediate.ok != null || immediate.responseCode != null || immediate.error)) {
          return resolve(immediate.error ? { ok:false, message:String(immediate.error) } : normalize(immediate));
        }
        pending = { resolve, timer:setTimeout(() => { if (pending && pending.resolve === resolve) { pending = null; resolve({ ok:false, message:'پاسخی از کارتخوان دریافت نشد (اتمام مهلت)' }); } }, 120000) };
        return;
      }
      // Browser / desktop: manual confirmation (never pretend a real transaction happened).
      App.ui.form({
        title:'تایید دستی تراکنش کارتخوان',
        note:'<div class="login-error" style="margin-bottom:12px">در پیشنمایش وب، اپلیکیشن PSP وجود ندارد. نتیجه اعلام شده توسط دستگاه کارتخوان را وارد کنید؛ روی دستگاه اندروید این پنجره جای خود را به فراخوانی مستقیم اپ PSP میدهد.</div>' +
             '<div class="card" style="margin-bottom:14px"><div class="row"><span>درگاه:</span><b>' + U.esc(psp.name) + '</b><span class="spacer"></span><span>مبلغ:</span><b class="accent">' + U.money(amount) + ' تومان</b></div></div>',
        fields:[
          { name:'code', label:'کد پاسخ (۰۰ = موفق)', type:'text', value:'00' },
          { name:'ref', label:'شماره مرجع / RRN', type:'text', value:'' },
          { name:'trace', label:'شماره پیگیری', type:'text', value:'' },
          { name:'pan', label:'چهار رقم آخر کارت', type:'text', value:'' }
        ],
        submit:'تایید و ثبت تراکنش',
        onSubmit: (v) => resolve({ ok:String(v.code || '').trim() === '00', code:String(v.code || ''), message:String(v.code || '').trim() === '00' ? 'تراکنش موفق (تایید دستی)' : 'تراکنش ناموفق', ref:v.ref, trace:v.trace, pan:v.pan, manual:true })
      });
    });
  }

  function enabledPsps() { return App.model.D().psps.filter(p => p.enabled); }

  /* --------------------------- customer / credit --------------------------- */
  function customers() { return App.model.D().customers || []; }
  function addCustomer(name, phone) {
    const c = { id:U.uid('c'), name:String(name || '').trim(), phone:String(phone || '').trim(), credit:0 };
    if (!c.name) return null;
    App.store.commit(d => { d.customers = d.customers || []; d.customers.push(c); }, 'payment.credit', 'تعریف مشتری اعتباری «' + c.name + '»');
    return c;
  }

  return { METHODS, methodLabel, SPLIT_MODES, shares, slotPaid, slotRemaining, setSplit,
           addPayment, removePayment, reversePayment, canSettle, settle,
           pspPay, enabledPsps, customers, addCustomer, normalize };
})();
