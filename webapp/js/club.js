/* ============================================================================
 * Hooshyar POS v2 — باشگاه مشتریان / loyalty & messaging
 * Offline-first: no SMS gateway is bundled. Messages are delivered through
 * the native Android share/SMS bridge, Web Share API, or copied to clipboard.
 * The invoice link is self-contained (read-only, token-protected payload), so
 * it opens on any device without a backend. A hosted linkBase can be set to
 * emit short links when a real server is available.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};

App.club = (function () {
  const U = App.util;
  const cfg = () => App.model.D().settings.club || {};
  const enabled = () => !!cfg().enabled;

  function fullName(c) { return c ? ((c.firstName||'') + ' ' + (c.lastName||'')).trim() || c.name || '—' : '—'; }
  function find(term) {
    const q = String(term||'').trim().toLowerCase(); if (!q) return null;
    return (App.model.D().customers||[]).find(c =>
      (c.code||'').toLowerCase() === q || (c.phone||'').replace(/[^\d]/g,'') === q.replace(/[^\d]/g,'') && q.length > 3) || null;
  }
  function logMessage(c, type, text, link) {
    const rec = { id:U.uid('msg'), at:Date.now(), customerId:c?c.id:'', customerName:fullName(c), type, text, link:link||'',
      by:App.auth.actor().name, channel:cfg().smsProvider||'android' };
    App.store.commit(d => { d.clubMessages=d.clubMessages||[]; d.clubMessages.unshift(rec); if (d.clubMessages.length>300) d.clubMessages.length=300; },
      'club.message', 'ارسال پیام ' + type + ' به ' + fullName(c), { entityType:'message', entityId:rec.id });
    return rec;
  }
  /** Delivery abstraction — one place to plug a real SMS/payment gateway. */
  function deliver(phone, text) {
    const provider = cfg().smsProvider || 'android';
    if (App.device.android && window.AndroidPOS && AndroidPOS.sendSms) {
      try { AndroidPOS.sendSms(String(phone||''), text); return { ok:true, channel:'android-sms' }; } catch (e) {}
    }
    if (App.device.android && window.AndroidPOS && AndroidPOS.shareText) {
      try { AndroidPOS.shareText('پیام هوشیار', text); return { ok:true, channel:'android-share' }; } catch (e) {}
    }
    if (provider === 'whatsapp' && phone) {
      const url = 'https://wa.me/' + String(phone).replace(/[^\d]/g,'') + '?text=' + encodeURIComponent(text);
      try { window.open(url, '_blank'); return { ok:true, channel:'whatsapp' }; } catch (e) {}
    }
    if (navigator.share) { try { navigator.share({ title:'رستوران هوشیار', text }); return { ok:true, channel:'web-share' }; } catch (e) {} }
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    try { if (window.AndroidPOS && AndroidPOS.toast) AndroidPOS.toast('پیام کپی شد: ' + text.slice(0,60)); } catch (e) {}
    return { ok:true, channel:'clipboard' };
  }
  function welcome(c) {
    if (!enabled() || !c || c.consent === false) return { ok:false, error:'ارسال پیام غیرفعال یا رضایت مشتری ثبت نشده است' };
    const text = String(cfg().welcomeMessage||'خوش آمدید').replace('{name}', fullName(c)).replace('{code}', c.code||'');
    const res = deliver(c.phone, text);
    logMessage(c, 'خوشآمدگویی', text);
    return Object.assign({ ok:true, text }, res);
  }
  /** Attach a customer to an order (by code/phone, or register a new one). */
  function attachCustomer(o, input) {
    const c = cfg();
    let customer = find(input.code || input.phone || '');
    if (!customer && (input.code || input.phone || input.firstName)) {
      if (input.firstName || input.phone) {
        customer = App.pay.addCustomer({ code:input.code, firstName:input.firstName, lastName:input.lastName,
          phone:input.phone, creditLimit:input.creditLimit, consent:input.consent !== false });
      }
    }
    if (!customer) return { ok:false, error:'مشتری یافت نشد' };
    App.store.commit(d => {
      const ord = d.orders.find(x=>x.id===o.id) || o;
      ord.customerId = customer.id;
      ord.customer = { name:fullName(customer), phone:customer.phone||'', code:customer.code||'' };
      ord.updatedAt = Date.now();
    }, 'club.attach', 'اتصال مشتری «' + fullName(customer) + '» به فاکتور ' + U.num(o.no));
    return { ok:true, customer, welcome:welcome(customer) };
  }
  function requiresCustomer() { return enabled() && !!cfg().customerRequired; }
  function validateOrder(o) {
    if (requiresCustomer() && !o.customerId) return { ok:false, error:'ثبت شماره مشتری طبق تنظیمات باشگاه اجباری است' };
    return { ok:true };
  }

  /* --------------------------- invoice link --------------------------- */
  function b64url(str) {
    const bytes = U.utf8Bytes(str); let s = '';
    for (let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i,i+0x8000));
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function compact(inv) {
    return {
      no:inv.no, at:inv.paidAt||inv.createdAt, restaurant:App.model.D().settings.restaurantName,
      address:App.model.D().settings.address, phone:App.model.D().settings.phone,
      currency:App.model.D().settings.currency, status:App.domain.statusLabel(inv.status),
      table:inv.tableLabel, hall:inv.hallLabel, type:inv.type,
      customer:inv.customer && (inv.customer.name||inv.customer.firstName) ? (inv.customer.name||inv.customer.firstName) : '',
      lines:(inv.lines||[]).map(l => ({ n:l.name, q:l.qty, p:l.price, d:App.domain.discountValue(l.discount, l.price*l.qty), note:l.note||'' })),
      subtotal:inv.subtotal, lineDiscount:inv.lineDiscount||0, discount:inv.discount||0,
      tax:inv.tax||0, levy:inv.levy||0, total:inv.total,
      payments:(inv.payments||[]).map(p => ({ m:p.label||p.method, a:p.amount, ref:p.ref||'' })),
      footer:App.model.D().settings.footer, revision:inv.revision||1
    };
  }
  function invoiceLink(inv) {
    const token = inv.clubToken || U.token();
    if (!inv.clubToken) { inv.clubToken = token; App.store.saveNow(); }
    const base = (cfg().linkBase || '').trim();
    const here = (window.location && window.location.href || '').split('#')[0].replace(/[^/]*$/, '');
    const root = base ? (base.replace(/\/?$/, '/')) : here;
    // The customer page is static/offline: always carry a read-only snapshot.
    // linkBase changes only the public origin/path; it is not a server lookup.
    return root + 'invoice.html#v=' + b64url(JSON.stringify(compact(inv))) + '&t=' + token;
  }
  function sendInvoice(inv) {
    if (!enabled()) return { ok:false, error:'باشگاه مشتریان غیرفعال است' };
    const c = App.model.customer(inv.customerId);
    if (!c) return { ok:false, error:'مشتری برای این فاکتور ثبت نشده است' };
    if (c.consent === false) return { ok:false, error:'رضایت ارتباطی مشتری ثبت نشده است' };
    const link = invoiceLink(inv);
    const host=String(window.location&&window.location.hostname||'').toLowerCase();
    if(!String(cfg().linkBase||'').trim()&&(window.location.protocol==='file:'||host==='localhost'||host==='127.0.0.1'||host==='::1'))
      return {ok:false,link,error:'برای ارسال لینک قابل‌دسترسی به مشتری، ابتدا نشانی عمومی را در تنظیمات باشگاه (linkBase) وارد کنید.'};
    const text = String(cfg().invoiceMessage||'فاکتور شما: {link}').replace('{link}',link).replace('{name}',fullName(c)).replace('{no}',U.num(inv.no));
    const res = deliver(c.phone, text);
    logMessage(c, 'لینک فاکتور', text, link);
    return Object.assign({ ok:true, link, text }, res);
  }
  function history(c) {
    return (App.model.D().invoices||[]).filter(i => i.customerId === c.id && i.status !== 'deleted')
      .sort((a,b) => (b.paidAt||0)-(a.paidAt||0));
  }
  return { cfg, enabled, fullName, find, logMessage, deliver, welcome, attachCustomer, requiresCustomer,
           validateOrder, b64url, compact, invoiceLink, sendInvoice, history };
})();
