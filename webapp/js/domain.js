/* ============================================================================
 * Hooshyar POS v2 — domain / business rules layer
 * Pure functions + transactional operations. No DOM, no UI dependencies.
 * Guarantees: idempotency, soft-delete, auditability, stock consistency,
 * discount caps, credit limits, role-aware actor recording.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};

App.domain = (function () {
  const U = App.util;
  const D = () => App.store.data;
  const S = () => D().settings;

  const STATUS = {
    draft:   { label:'پیشنویس',       cls:'warn' },
    current: { label:'جاری',          cls:'accent' },
    paid:    { label:'تسویهشده',     cls:'ok' },
    edited:  { label:'ویرایششده',    cls:'info' },
    deleted: { label:'حذفشده',       cls:'danger' },
    void:    { label:'لغوشده',       cls:'danger' }
  };
  const statusLabel = s => (STATUS[s] || STATUS.current).label;
  const statusClass = s => (STATUS[s] || STATUS.current).cls;

  /* ----------------------------- money engine ----------------------------- */
  function discountValue(disc, base) {
    if (!disc) return 0;
    const v = Math.max(0, Number(disc.value) || 0);
    return Math.min(base, disc.type === 'percent' ? Math.round(base * v / 100) : Math.round(v));
  }
  function lineCalc(line, settings) {
    settings = settings || S();
    const gross = Math.max(0, (Number(line.price)||0) * (Number(line.qty)||0));
    const discount = discountValue(line.discount, gross);
    const net = gross - discount;
    const taxPercent = settings.taxPolicy === 'item' ? (Number(line.taxPercent) || Number(settings.taxPercent) || 0) : 0;
    const levyPercent = settings.taxPolicy === 'item' ? (Number(line.levyPercent) || Number(settings.levyPercent) || 0) : 0;
    return { gross, discount, net, tax:Math.round(net * taxPercent / 100), levy:Math.round(net * levyPercent / 100) };
  }
  /**
   * Calculation order is explicit and configurable:
   *  discount-first: line discount -> invoice discount -> tax/levy on the result
   *  tax-first:      line discount -> tax/levy -> invoice discount on the net
   * Item-level policy computes tax per line and never doubles it at invoice level.
   */
  function totals(o, settings) {
    settings = settings || S();
    const lines = (o.lines || []).filter(l => !l.voided);
    const calc = lines.map(l => lineCalc(l, settings));
    const gross = U.sum(calc, c => c.gross);
    const lineDiscount = U.sum(calc, c => c.discount);
    const lineTax = U.sum(calc, c => c.tax);
    const lineLevy = U.sum(calc, c => c.levy);
    const afterLines = gross - lineDiscount;

    const invDiscount = discountValue(o.discount, afterLines);
    const taxable = Math.max(0, afterLines - invDiscount);
    let tax = 0, levy = 0;
    if (settings.taxPolicy === 'item') {
      // item rates are applied on the line net; invoice discount is NOT re-taxed
      tax = lineTax; levy = lineLevy;
    } else if (settings.calcOrder === 'tax-first') {
      tax = Math.round(afterLines * (Number(settings.taxPercent)||0) / 100);
      levy = Math.round(afterLines * (Number(settings.levyPercent)||0) / 100) + (Number(settings.levyFixed)||0);
    } else {
      tax = Math.round(taxable * (Number(settings.taxPercent)||0) / 100);
      levy = Math.round(taxable * (Number(settings.levyPercent)||0) / 100) + (Number(settings.levyFixed)||0);
    }
    const total = Math.max(0, taxable + tax + levy);
    return {
      gross, lineDiscount, discount:invDiscount,
      discountPercent:U.pct(lineDiscount + invDiscount, gross),
      subtotal:gross, taxable, tax, lineTax, levy, total, base:taxable
    };
  }
  /** Auto-compute the counterpart of a discount (amount <-> percent). */
  function discountEquivalent(o) {
    const t = totals(o), gross = t.gross - t.lineDiscount;
    const d = o.discount || { type:'amount', value:0 };
    const amount = discountValue(d, gross);
    return { amount, percent:gross ? Math.round(amount / gross * 1000) / 10 : 0,
             amountFromPercent:Math.round(gross * (Number(d.value)||0) / 100) };
  }
  function discountAllowed(o, patch, permission, base) {
    if (!App.auth.current()) return { ok:false, error:'ورود انجام نشده است' };
    const cap = App.auth.maxDiscount(), current = totals(base||o);
    const t = totals(patch ? Object.assign({}, o, { discount:patch }) : o);
    const amount = t.lineDiscount + t.discount, oldAmount = current.lineDiscount + current.discount;
    const percent = U.pct(amount, t.gross);
    if (permission && !App.auth.can(permission) && amount > oldAmount) return { ok:false, error:'مجوز اعمال این نوع تخفیف را ندارید' };
    if (cap.percent > 0 && percent > cap.percent + 0.001) return { ok:false, error:'سقف تخفیف مجاز ' + U.num(cap.percent) + '٪ است (درخواست ' + U.num(percent) + '٪)' };
    if (cap.amount > 0 && amount > cap.amount) return { ok:false, error:'سقف تخفیف ریالی مجاز ' + U.money(cap.amount) + ' است' };
    if (cap.percent === 0 && cap.amount === 0 && amount > oldAmount) return { ok:false, error:'این سطح دسترسی مجوز تخفیف ندارد' };
    return { ok:true, amount, percent };
  }

  /* ---------------------------- idempotency ---------------------------- */
  /** Guards against double clicks / replayed requests. Returns {ok, duplicate, value}. */
  function once(key, fn) {
    const d = D();
    d.processedKeys = d.processedKeys || [];
    if (d.processedKeys.indexOf(key) !== -1) return { ok:true, duplicate:true, value:null };
    const value = fn();
    // A failed operation must not poison the key: retries are allowed.
    if (value && value.ok === false) return { ok:false, duplicate:false, value };
    d.processedKeys.push(key);
    if (d.processedKeys.length > 500) d.processedKeys = d.processedKeys.slice(-300);
    return { ok:true, duplicate:false, value };
  }

  /* ------------------------- audit & versioning ------------------------- */
  function audit(action, detail, before, after, reason, entity) {
    App.audit(action, detail, { before:before == null ? null : U.clone(before), after:after == null ? null : U.clone(after),
      reason:reason||'', entityType:(entity && entity.type)||'', entityId:(entity && entity.id)||'' });
  }
  function snapshot(entity, reason, kind) {
    const a = App.auth.actor();
    entity.versions = entity.versions || [];
    entity.versions.unshift({ id:U.uid('v'), at:Date.now(), by:a.id, byName:a.name, reason:reason||'',
      revision:entity.revision || 1, snapshot:U.clone({ lines:entity.lines, discount:entity.discount, payments:entity.payments,
        total:(entity.total != null ? entity.total : totals(entity).total), status:entity.status, tableId:entity.tableId }) });
    if (entity.versions.length > 30) entity.versions.length = 30;
    entity.revision = (entity.revision || 1) + 1;
    entity.editCount = (entity.editCount || 0) + 1;
    entity.editedBy = a.id; entity.editedByName = a.name; entity.editedAt = Date.now(); entity.editReason = reason||'';
    if (kind === 'invoice' && entity.status === 'paid') entity.status = 'edited';
    audit('entity.edit', 'ویرایش ' + kind + ' شماره ' + U.num(entity.no) + ' توسط ' + a.name, null, entity, reason, { type:kind, id:entity.id });
  }
  function softDelete(entity, kind, reason) {
    const a = App.auth.actor(), before = U.clone(entity);
    const settledInvoice=kind==='invoice'&&(!!entity.paidAt||!!entity.settledAt||entity.status==='paid'||entity.status==='edited');
    if (settledInvoice && !App.auth.can('invoice.deletePaid'))
      return { ok:false, error:'حذف فاکتور تسویهشده نیازمند مجوز ویژه است' };
    if (!App.auth.can(kind === 'invoice' ? 'invoice.delete' : 'order.void'))
      return { ok:false, error:'دسترسی حذف ندارید' };
    snapshot(entity, reason || 'حذف فاکتور', kind);
    entity.status = 'deleted';
    entity.deletedBy = a.id; entity.deletedByName = a.name; entity.deletedAt = Date.now(); entity.deleteReason = reason||'';
    audit('entity.delete', 'حذف منطقی ' + kind + ' شماره ' + U.num(entity.no), before, entity, reason, { type:kind, id:entity.id });
    return { ok:true };
  }
  function restore(entity, kind, reason) {
    if (!App.auth.can('invoice.restore')) return { ok:false, error:'دسترسی بازیابی ندارید' };
    const a = App.auth.actor(), before = U.clone(entity);
    const prev = (entity.versions || []).find(v => v.snapshot && v.snapshot.status !== 'deleted');
    entity.status = prev ? prev.snapshot.status : (kind === 'invoice' ? 'paid' : 'current');
    entity.deletedBy = ''; entity.deletedByName = ''; entity.deletedAt = null; entity.deleteReason = '';
    entity.restoredBy = a.id; entity.restoredByName = a.name; entity.restoredAt = Date.now();
    audit('entity.restore', 'بازیابی ' + kind + ' شماره ' + U.num(entity.no) + ' توسط ' + a.name, before, entity, reason, { type:kind, id:entity.id });
    return { ok:true };
  }

  /* ------------------------------- stock ------------------------------- */
  function stockStatus(p) {
    if (!p.trackStock || p.stock == null) return { label:'بدون محدودیت', cls:'ok', locked:false };
    const n = Number(p.stock) || 0;
    if (n <= 0) return { label:'ناموجود (قفل خودکار)', cls:'danger', locked:true };
    if (n <= (Number(p.minStock)||0)) return { label:'نزدیک به اتمام (' + U.num(n) + ')', cls:'warn', locked:false };
    return { label:'موجود ' + U.num(n), cls:'ok', locked:false };
  }
  function productAvailable(p) {
    if (!p || p.active === false) return false;
    if (p.trackStock && p.stock != null && Number(p.stock) <= 0) return false;
    return true;
  }
  function recordStock(product, delta, before, after, kind, entityId) {
    const d=D(),a=App.auth.actor();d.stockMoves=d.stockMoves||[];
    d.stockMoves.unshift({id:U.uid('sm'),at:Date.now(),productId:product.id,productName:product.name,delta,before,after,kind,entityId:entityId||'',by:a.id,byName:a.name});
    if(d.stockMoves.length>2000)d.stockMoves.length=2000;
  }
  function stockCheck(o) {
    const d=D(), applied=o.stockAppliedLines||{};
    for(const l of (o.lines||[])){
      const p=d.products.find(x=>x.id===l.productId);if(!p||!p.trackStock||p.stock==null)continue;
      const was=Math.max(0,Number(applied[l.id])||0), now=l.voided?0:Math.max(0,Number(l.qty)||0), delta=now-was;
      if(delta>0&&(Number(p.stock)||0)<delta)return {ok:false,error:'موجودی «'+p.name+'» کافی نیست (موجود: '+U.num(p.stock)+'، درخواست: '+U.num(delta)+')'};
    }
    return {ok:true};
  }
  function applyStock(o) {
    const check=stockCheck(o);if(!check.ok)return check;
    const d=D(), applied=o.stockAppliedLines||(o.stockAppliedLines={}), moves=[];
    (o.lines||[]).forEach(l=>{
      const p=d.products.find(x=>x.id===l.productId); if(!p||!p.trackStock||p.stock==null)return;
      const beforeQty=Math.max(0,Number(applied[l.id])||0), afterQty=l.voided?0:Math.max(0,Number(l.qty)||0), delta=afterQty-beforeQty;
      if(delta>0&&(Number(p.stock)||0)<delta)return moves.push({error:'موجودی «'+p.name+'» کافی نیست (موجود: '+U.num(p.stock)+'، درخواست: '+U.num(delta)+')'});
      if(delta)moves.push({line:l,product:p,beforeQty,afterQty,delta});
    });
    const issue=moves.find(x=>x.error); if(issue)return {ok:false,error:issue.error};
    const changes=[];
    moves.forEach(m=>{
      const before=Number(m.product.stock)||0;
      m.product.stock=Math.max(0,before-m.delta);m.product.sold=Math.max(0,(Number(m.product.sold)||0)+m.delta);
      if(m.product.stock>0)m.product.lockedReason='';else m.product.lockedReason='اتمام موجودی';
      applied[m.line.id]=m.afterQty;
      recordStock(m.product,-m.delta,before,m.product.stock,m.delta>0?'sale':'order-correction',o.id);
      changes.push({productId:m.product.id,lineId:m.line.id,name:m.product.name,before,after:m.product.stock,qty:m.delta});
    });
    o.stockApplied=Object.keys(applied).some(id=>(Number(applied[id])||0)>0);
    if(changes.length)audit('stock.apply','تغییر موجودی سفارش '+U.num(o.no),null,changes,'',{type:'order',id:o.id});
    return {ok:true,duplicate:changes.length===0,changes};
  }
  function restoreStock(o) {
    if (!o.stockApplied) return { ok:true, duplicate:true };
    const d=D(),changes=[],applied=o.stockAppliedLines||{};
    (o.lines||[]).forEach(l=>{
      const p=d.products.find(x=>x.id===l.productId);if(!p||!p.trackStock||p.stock==null)return;
      const qty=Object.keys(applied).length?Math.max(0,Number(applied[l.id])||0):(!l.voided?Math.max(0,Number(l.qty)||0):0);
      if(!qty)return;const before=Number(p.stock)||0;p.stock=before+qty;p.sold=Math.max(0,(Number(p.sold)||0)-qty);p.lockedReason='';
      recordStock(p,qty,before,p.stock,'restore',o.id);
      changes.push({productId:p.id,lineId:l.id,name:p.name,before,after:p.stock,qty});
    });
    o.stockApplied=false;o.stockAppliedLines={};
    audit('stock.restore','برگشت موجودی سفارش '+U.num(o.no),null,changes,'',{type:'order',id:o.id});
    return {ok:true,changes};
  }

  /* --------------------------- order lifecycle --------------------------- */
  function setStatus(o, status, reason) {
    const before = { status:o.status };
    o.status = status; o.updatedAt = Date.now();
    if (status === 'current' && !o.occupiedAt) o.occupiedAt = Date.now();
    audit('order.status', 'تغییر وضعیت سفارش ' + U.num(o.no) + ': ' + statusLabel(o.status), before, { status }, reason, { type:'order', id:o.id });
  }
  function submit(o) {
    if (!App.auth.can('order.submit')) return { ok:false, error:'دسترسی ثبت قطعی سفارش ندارید' };
    if (o.status === 'paid' || o.status === 'deleted' || o.status === 'void') return { ok:false, error:'این سفارش دیگر قابل ثبت نیست' };
    if (!(o.lines||[]).some(l => !l.voided)) return { ok:false, error:'سفارش بدون قلم کالا قابل ثبت نیست' };
    // Reconcile the stock ledger on every send: newly added quantities are
    // deducted once, reductions/voids restore the difference, retries are safe.
    if (o.status === 'current') {
      const sr=S().stockPolicy==='on-submit'?applyStock(o):{ok:true,duplicate:true};
      if(!sr.ok)return sr;
      App.store.scheduleSave();
      return {ok:true,duplicate:!!sr.duplicate,stockChanges:sr.changes||[]};
    }
    const r = once('submit:' + o.id + ':' + o.revision, () => {
      const before = U.clone({ status:o.status, stockApplied:o.stockApplied });
      if (S().stockPolicy === 'on-submit') { const sr=applyStock(o); if(!sr.ok)return sr; }
      setStatus(o, 'current', 'ثبت سفارش');
      audit('order.submit', 'ثبت قطعی سفارش ' + U.num(o.no), before, { status:o.status, stockApplied:o.stockApplied }, '', { type:'order', id:o.id });
      App.store.scheduleSave();
      return { ok:true };
    });
    return r.value || { ok:true, duplicate:true };
  }
  function transfer(o, toTableId, reason) {
    if (!App.auth.can('order.transfer')) return { ok:false, error:'دسترسی جابهجایی میز ندارید' };
    const d = D(), dest = d.tables.find(t => t.id === toTableId);
    if (!dest) return { ok:false, error:'میز مقصد یافت نشد' };
    if (dest.id === o.tableId) return { ok:false, error:'میز مقصد همان میز فعلی است' };
    if (dest.status !== 'free' && dest.orderId && dest.orderId !== o.id) return { ok:false, error:'میز مقصد مشغول است' };
    const fromId = o.tableId, fromLabel = fromId ? App.model.tableLabel(fromId) : 'بدون میز';
    const a = App.auth.actor();
    const rec = { id:U.uid('tr'), orderId:o.id, orderNo:o.no, fromTableId:fromId, fromLabel,
      toTableId:dest.id, toLabel:App.model.tableLabel(dest.id), at:Date.now(), by:a.id, byName:a.name, reason:reason||'' };
    App.store.commit(data => {
      const ord = data.orders.find(x => x.id === o.id) || o;
      const src = data.tables.find(t => t.id === fromId);
      if (src) { src.status='free'; src.orderId=null; src.occupiedAt=null; }
      dest.status = 'occupied'; dest.orderId = o.id; dest.occupiedAt = o.occupiedAt || ord.createdAt;
      ord.tableId = dest.id; ord.hallId = dest.hallId;
      ord.transfers = ord.transfers || []; ord.transfers.push(rec);
      ord.updatedAt = Date.now();
      data.transfers = data.transfers || []; data.transfers.unshift(rec);
      if (data.transfers.length > 500) data.transfers.length = 500;
    }, 'order.transfer', 'انتقال سفارش ' + U.num(o.no) + ' از ' + fromLabel + ' به ' + rec.toLabel);
    audit('order.transfer', rec.fromLabel + ' ← ' + rec.toLabel, { tableId:fromId }, { tableId:dest.id }, reason, { type:'order', id:o.id });
    return { ok:true, transfer:rec };
  }

  /* ----------------------------- credit ----------------------------- */
  function creditAvailable(c) { return Math.max(0, (Number(c.creditLimit)||0) - (Number(c.credit)||0)); }
  function creditCheck(customerId, amount) {
    const c = App.model.customer(customerId);
    if (!c) return { ok:false, error:'مشتری انتخاب نشده است' };
    const avail = creditAvailable(c);
    if (amount > avail && !App.auth.can('settings.manage'))
      return { ok:false, error:'سقف اعتبار مجاز (' + U.money(avail) + ') رعایت نشده است' };
    return { ok:true, available:avail, customer:c };
  }

  /* -------------------------- commission -------------------------- */
  function lineCommission(line, inv) {
    const d = D(), p = d.products.find(x => x.id === line.productId), g = d.groups.find(x => x.id === (p?p.groupId:line.groupId));
    const per = d.personnel.find(x => x.id === inv.personnelId);
    let rate = 0;
    if (S().commissionPolicy === 'personnel') rate = Number(per && per.commissionPercent) || 0;
    else if (S().commissionPolicy === 'group') rate = Number(g && g.commissionPercent) || 0;
    else rate = Number(p && p.commissionPercent) || Number(g && g.commissionPercent) || 0;
    if (!rate) rate = Number(per && per.commissionPercent) || 0;
    const base = Math.max(0, (Number(line.price)||0)*(Number(line.qty)||0) - discountValue(line.discount, (Number(line.price)||0)*(Number(line.qty)||0)));
    return { rate, amount:Math.round(base * rate / 100), productId:line.productId, name:line.name, personnelId:inv.personnelId };
  }
  function commission(inv) {
    const lines = (inv.lines||[]).filter(l => !l.voided).map(l => lineCommission(l, inv));
    return { lines, total:U.sum(lines, x => x.amount) };
  }

  /* ---------------------------- settlement ---------------------------- */
  /**
   * Atomic settle: validates payment, applies stock (if not yet), moves the
   * order into an immutable invoice snapshot, frees the table, updates the
   * customer ledger and returns the invoice. Never frees a table on failure.
   */
  function settle(o, opts) {
    opts = opts || {};
    if (!App.auth.can('payment.settle') && !App.auth.can('order.settlePrint')) return { ok:false, error:'دسترسی تسویه ندارید' };
    if (!(o.lines||[]).some(l => !l.voided)) return { ok:false, error:'فاکتور بدون قلم کالا قابل تسویه نیست' };
    const t = totals(o), paidAmount = App.model.paid(o);
    if (paidAmount < t.total) return { ok:false, error:'مبلغ فاکتور کامل پرداخت نشده است (مانده ' + U.money(t.total - paidAmount) + ')' };
    const failed = (o.payments||[]).some(p => p.status === 'failed' && !p.reversed);
    if (failed) return { ok:false, error:'تراکنش ناموفق وجود دارد؛ ابتدا آن را اصلاح کنید' };

    const guard = once('settle:' + o.id + ':' + o.revision, () => {
      const existing = D().invoices.find(i => i.orderId === o.id);
      if (existing) return { ok:true, duplicate:true, invoice:existing };
      const d = D(), a = App.auth.actor(), before = U.clone({ status:o.status, tableId:o.tableId });
      const stockResult=applyStock(o);
      if(!stockResult.ok)return stockResult;
      const tb = d.tables.find(x => x.id === o.tableId);
      const c = d.customers.find(x => x.id === o.customerId);
      const inv = {
        id:U.uid('inv'), no:o.no, orderId:o.id, tableId:o.tableId, hallId:o.hallId,
        tableLabel:tb ? tb.name : '—', hallLabel:o.hallId && App.model.hall(o.hallId) ? App.model.hall(o.hallId).name : '—',
        originalTableId:o.originalTableId, originalTableLabel:o.originalTableLabel,
        type:o.type, waiterId:o.waiterId, waiterName:(d.users.find(u=>u.id===o.waiterId)||{}).name || o.createdByName || '—',
        personnelId:o.personnelId, personnelName:(d.personnel.find(p=>p.id===o.personnelId)||{}).name || '',
        customerId:o.customerId, customer:U.clone(o.customer || {name:'',phone:'',code:''}), notes:o.notes||'',
        lines:o.lines.filter(l => !l.voided).map(l => U.clone(l)),
        subtotal:t.gross, lineDiscount:t.lineDiscount, discount:t.discount, discountPercent:t.discountPercent,
        tax:t.tax, lineTax:t.lineTax, levy:t.levy, total:t.total,
        payments:(o.payments||[]).map(p => U.clone(p)), split:o.split ? U.clone(o.split) : null,
        status:'paid', createdAt:o.createdAt, occupiedAt:o.occupiedAt, paidAt:Date.now(),
        createdBy:o.createdBy, createdByName:o.createdByName,
        editedBy:o.editedBy, editedByName:o.editedByName, editedAt:o.editedAt, editReason:o.editReason,
        deletedBy:'', deletedByName:'', deletedAt:null, deleteReason:'',
        settledBy:a.id, settledByName:a.name, settledAt:Date.now(),
        versions:U.clone(o.versions||[]), transfers:U.clone(o.transfers||[]), editCount:o.editCount||0, revision:o.revision||1,
        stockApplied:o.stockApplied, stockAppliedLines:U.clone(o.stockAppliedLines||{}), printCount:0, reprintLog:[], invalidated:false,
        clubToken:App.util.token(), commission:null, occupationMinutes:Math.max(0, Math.floor((Date.now() - (o.occupiedAt||o.createdAt))/60000))
      };
      inv.commission = commission(inv);
      App.store.commit(data => {
        data.invoices.unshift(inv);
        const ord = data.orders.find(x => x.id === o.id);
        if (ord) { ord.status = 'paid'; ord.paidAt = inv.paidAt; ord.settledBy = a.id; ord.settledByName = a.name; ord.settledAt = inv.paidAt; }
        if (tb) { tb.status = 'free'; tb.orderId = null; tb.occupiedAt = null; }
        (o.payments||[]).filter(p => p.method === 'credit' && p.customerId && !p.reversed).forEach(p => {
          const cust = data.customers.find(x => x.id === p.customerId);
          if (cust) {
            const b = Number(cust.credit)||0;
            cust.credit = b + (Number(p.amount)||0);
            audit('credit.use', 'مصرف اعتبار «' + cust.firstName + ' ' + cust.lastName + '»', { credit:b }, { credit:cust.credit }, '', { type:'customer', id:cust.id });
          }
        });
        if (c) { c.purchaseCount = (Number(c.purchaseCount)||0) + 1; c.purchaseTotal = (Number(c.purchaseTotal)||0) + inv.total; }
      }, 'payment.settle', 'تسویه فاکتور ' + U.num(inv.no) + ' توسط ' + a.name + ' به مبلغ ' + U.money(inv.total));
      audit('invoice.settle', 'صدور فاکتور نهایی ' + U.num(inv.no), before, { status:'paid', tableId:o.tableId }, '', { type:'invoice', id:inv.id });
      return { ok:true, invoice:inv };
    });
    if (guard.duplicate) {
      const existing = D().invoices.find(i => i.orderId === o.id);
      return existing ? { ok:true, duplicate:true, invoice:existing } : { ok:false, error:'تسویه تکراری شناسایی شد' };
    }
    return guard.value || { ok:false, error:'تسویه ناموفق' };
  }

  /* --------------------------- bulk operations --------------------------- */
  function bulkProducts(ids, op) {
    if (!App.auth.can('menu.manage')) return { ok:false, error:'دسترسی ویرایش گروهی ندارید' };
    const d = D(), changes = [];
    App.store.commit(data => {
      ids.forEach(id => {
        const p = data.products.find(x => x.id === id); if (!p) return;
        const before = { price:p.price, groupId:p.groupId, stationIds:(p.stationIds||[]).slice(), active:p.active, discount:U.clone(p.discount), stock:p.stock };
        if (op.kind === 'price') {
          if (op.mode === 'percent') p.price = Math.max(0, Math.round(p.price * (1 + Number(op.value)/100)));
          else if (op.mode === 'fixed') p.price = Math.max(0, Math.round(p.price + Number(op.value)));
          else p.price = Math.max(0, Math.round(Number(op.value)||0));
        } else if (op.kind === 'discount') p.discount = { type:op.mode === 'percent' ? 'percent' : 'amount', value:Math.max(0, Number(op.value)||0) };
        else if (op.kind === 'station') p.stationIds = (op.value||[]).slice();
        else if (op.kind === 'group') p.groupId = op.value;
        else if (op.kind === 'stock') { p.stock = Math.max(0, Number(op.value)||0); p.initialStock = p.stock; if (p.stock>0) p.lockedReason=''; }
        else if (op.kind === 'active') p.active = !!op.value;
        if(op.kind==='stock'&&before.stock!==p.stock)recordStock(p,p.stock-before.stock,before.stock,p.stock,'manual-adjustment','bulk');
        changes.push({ id, name:p.name, before, after:{ price:p.price, groupId:p.groupId, stationIds:p.stationIds, active:p.active, discount:p.discount, stock:p.stock } });
      });
    }, 'menu.bulk', 'ویرایش گروهی ' + U.num(ids.length) + ' کالا (' + op.kind + ')');
    audit('menu.bulk', 'ویرایش گروهی کالاها', null, changes, op.kind, { type:'product', id:ids.join(',') });
    return { ok:true, count:changes.length };
  }

  return { STATUS, statusLabel, statusClass, discountValue, lineCalc, totals, discountEquivalent, discountAllowed,
           once, audit, snapshot, softDelete, restore, stockStatus, productAvailable, stockCheck, applyStock, restoreStock,
           setStatus, submit, transfer, creditAvailable, creditCheck, lineCommission, commission, settle, bulkProducts };
})();
