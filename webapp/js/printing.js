/* ============================================================
   Hooshyar POS — printing
   Thermal printers generally cannot shape Persian/Arabic text from
   CP1256 bytes, so receipts are rendered into a 1-bit raster with
   the bundled Vazirmatn font and sent as ESC/POS "GS v 0" bit image.
   Works with XPrinter / any ESC-POS 58mm (6cm) & 80mm (8cm) device.
   Transports:
     network  -> AndroidPOS.print() raw TCP :9100  |  /api/print proxy in browser
     usb      -> Android USB Host bulk transfer (XPrinter OTG)
     bluetooth-> Android Bluetooth SPP socket
     system   -> Android PrintManager / browser window.print()
   ============================================================ */
'use strict';
window.App = window.App || {};

App.print = (function () {
  const U = App.util;
  const WIDTHS = { 58: 384, 80: 576 };

  /* ------------------------- row specifications ------------------------- */
  // row = {t:'text'|'pair'|'rule'|'space', ...}
  function T(text, o) { return Object.assign({ t:'text', text:String(text == null ? '' : text), align:'right', style:'normal' }, o); }
  function P(right, left, o) { return Object.assign({ t:'pair', right:String(right == null ? '' : right), left:String(left == null ? '' : left), style:'normal' }, o); }
  const RULE = () => ({ t:'rule' });
  const SPACE = (h) => ({ t:'space', h:h || 8 });

  /* --------------------------- ESC/POS raster --------------------------- */
  function fontFor(style, widthMm) {
    const base = widthMm === 58 ? 20 : 26;
    const sizes = { small:base - 5, normal:base, bold:base + 2, title:base + 12 };
    const size = sizes[style] || base;
    const weight = (style === 'bold' || style === 'title') ? 700 : 400;
    return { size, css:weight + ' ' + size + 'px Vazirmatn, Tahoma, sans-serif' };
  }

  function wrap(ctx, text, maxW) {
    if (!text) return [''];
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW || !cur) cur = test;
      else { lines.push(cur); cur = w; }
      // hard-break a single word that is still too wide
      while (cur && ctx.measureText(cur).width > maxW && cur.length > 1) {
        let cut = 1;
        while (cut < cur.length && ctx.measureText(cur.slice(0, cut + 1)).width <= maxW) cut++;
        lines.push(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function layoutRows(ctx, rows, widthMm) {
    const W = WIDTHS[widthMm] || WIDTHS[80];
    const pad = widthMm === 58 ? 6 : 10;
    const maxW = W - pad * 2;
    const out = [];
    for (const row of rows) {
      if (row.t === 'space') { out.push({ h:row.h, draw:null }); continue; }
      if (row.t === 'rule') { out.push({ h:12, draw:(c, y, h) => {
        c.save(); c.strokeStyle = '#000'; c.lineWidth = 2; c.setLineDash([7,5]);
        c.beginPath(); c.moveTo(pad, y + h/2); c.lineTo(W - pad, y + h/2); c.stroke(); c.restore();
      } }); continue; }
      const f = fontFor(row.style, widthMm);
      ctx.font = f.css;
      const lineH = Math.round(f.size * 1.45);
      if (row.t === 'pair') {
        const leftW = ctx.measureText(row.left).width;
        const rightMax = Math.max(40, maxW - leftW - 12);
        const parts = wrap(ctx, row.right, rightMax);
        const h = lineH * parts.length;
        out.push({ h, draw:(c, y) => {
          c.font = f.css; c.fillStyle = '#000'; c.textBaseline = 'middle'; c.direction = 'rtl';
          parts.forEach((part, i) => {
            const yy = y + lineH * (i + 0.5);
            c.textAlign = 'right'; c.fillText(part, W - pad, yy);
            if (i === 0 && row.left) { c.textAlign = 'left'; c.fillText(row.left, pad, yy); }
          });
        } });
      } else {
        const parts = wrap(ctx, row.text, maxW);
        const h = lineH * parts.length;
        out.push({ h, draw:(c, y) => {
          c.font = f.css; c.fillStyle = '#000'; c.textBaseline = 'middle'; c.direction = 'rtl';
          parts.forEach((part, i) => {
            c.textAlign = row.align === 'center' ? 'center' : (row.align === 'left' ? 'left' : 'right');
            const x = row.align === 'center' ? W/2 : (row.align === 'left' ? pad : W - pad);
            c.fillText(part, x, y + lineH * (i + 0.5));
          });
        } });
      }
    }
    return { W, pad, items:out };
  }

  async function buildRaster(rows, widthMm, opts) {
    widthMm = Number(widthMm) === 58 ? 58 : 80;
    opts = opts || {};
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const probe = document.createElement('canvas').getContext('2d');
    const L = layoutRows(probe, rows, widthMm);
    const topPad = 10, bottomPad = 10;
    const H = Math.min(16000, topPad + bottomPad + App.util.sum(L.items, i => i.h));
    const canvas = document.createElement('canvas');
    canvas.width = L.W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L.W, H);
    ctx.textBaseline = 'middle';
    let y = topPad;
    L.items.forEach(item => { if (item.draw) item.draw(ctx, y, item.h); y += item.h; });

    const img = ctx.getImageData(0, 0, L.W, H).data;
    const bytesPerRow = Math.ceil(L.W / 8);
    const pixels = new Uint8Array(bytesPerRow * H);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < L.W; px++) {
        const i = (py * L.W + px) * 4;
        const lum = img[i] * 0.299 + img[i+1] * 0.587 + img[i+2] * 0.114;
        if (lum < 150 && img[i+3] > 100) pixels[py * bytesPerRow + (px >> 3)] |= 0x80 >> (px & 7);
      }
    }

    const cmd = [0x1b, 0x40];                              // ESC @ init
    cmd.push(0x1b, 0x33, 0x00);                          // ESC 3 0 line spacing
    cmd.push(0x1d, 0x76, 0x30, 0x00);                    // GS v 0 (m=0)
    cmd.push(bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff);
    cmd.push(H & 0xff, (H >> 8) & 0xff);
    const all = new Uint8Array(cmd.length + pixels.length + 14);
    all.set(cmd, 0); all.set(pixels, cmd.length);
    let k = cmd.length + pixels.length;
    all[k++]=0x1b; all[k++]=0x64; all[k++]=0x04;         // feed 4 lines
    if (opts.cut !== false) { all[k++]=0x1d; all[k++]=0x56; all[k++]=0x42; all[k++]=0x00; } // GS V B 0 partial cut
    if (opts.drawer) { all[k++]=0x1b; all[k++]=0x70; all[k++]=0x00; all[k++]=0x19; all[k++]=0xfa; }
    const out = all.subarray(0, k);
    return { base64: U.toBase64(out), width: L.W, height: H, bytes: out.length };
  }

  /* ------------------------------ HTML receipt ------------------------------ */
  function esc(s) { return U.esc(s); }
  function receiptHtml(inv, widthMm) {
    const S = App.model.D().settings;
    const N = U.num;
    const nr = U.num(inv.no);
    const line = (r, l, cls) => '<div class="p-row ' + (cls || '') + '"><span>' + r + '</span><span class="num">' + l + '</span></div>';
    let h = '';
    h += '<div class="p-center"><div class="p-logo">ه</div><div class="p-title">' + esc(S.restaurantName) + '</div>';
    h += '<div class="p-small">' + esc(S.address) + '</div><div class="p-small">تلفن: <span class="num">' + esc(S.phone) + '</span></div></div>';
    h += '<div class="p-sep"></div>';
    h += '<div class="p-center"><b>صورتحساب فروش</b></div>';
    h += '<div class="p-sep"></div>';
    h += line('شماره فاکتور', nr) ;
    h += line('تاریخ / ساعت', esc(U.date(inv.paidAt || inv.createdAt)) + ' · ' + esc(U.time(inv.paidAt || inv.createdAt)));
    h += line('میز / سالن', esc((inv.tableLabel || '—') + ' · ' + (inv.hallLabel || '—')));
    h += line('نوع سفارش', esc(inv.type || 'سالن'));
    h += line('سفارشگیر', esc(inv.waiterName || '—'));
    if (inv.customer && inv.customer.name) h += line('مشتری', esc(inv.customer.name));
    h += '<div class="p-sep"></div>';
    (inv.lines || []).forEach(l => {
      h += line(esc(N(l.qty) + ' × ' + l.name), N((Number(l.price)||0) * (Number(l.qty)||0)));
      if (l.note) h += '<div class="p-note">↳ ' + esc(l.note) + '</div>';
    });
    h += '<div class="p-sep"></div>';
    h += line('جمع اقلام', N(inv.subtotal));
    if (inv.discount) h += line('تخفیف', '− ' + N(inv.discount));
    if (inv.tax) h += line('مالیات (' + N(S.taxPercent) + '٪)', N(inv.tax));
    if (inv.service) h += line('سرویس (' + N(S.servicePercent) + '٪)', N(inv.service));
    h += '<div class="p-row p-total"><span>مبلغ قابل پرداخت</span><span class="num">' + N(inv.total) + ' ' + esc(S.currency) + '</span></div>';
    if (inv.payments && inv.payments.length) {
      h += '<div class="p-sep"></div><div class="p-small"><b>نحوه پرداخت</b></div>';
      inv.payments.forEach(p => {
        const label = p.label || ({ cash:'نقدی', credit:'اعتباری', card:'کارتخوان', other:'سایر' }[p.method] || p.method);
        h += line(esc(label) + (p.ref ? ' <span class="p-small">( ' + esc(p.ref) + ' )</span>' : ''), N(p.amount));
      });
    }
    h += '<div class="p-sep"></div>';
    h += '<div class="p-center p-small">' + esc(S.footer) + '</div>';
    h += '<div class="p-center p-small">سامانه سفارشگیری هوشیار · ' + esc(U.date(inv.paidAt || Date.now())) + '</div>';
    return h;
  }

  function kitchenHtml(ticket, widthMm) {
    const N = U.num;
    const line = (r, l) => '<div class="p-row"><span>' + r + '</span><span class="num">' + l + '</span></div>';
    let h = '<div class="p-center"><div class="p-title">🍽 ' + esc(ticket.stationName) + '</div><b>برگه سفارش آشپزخانه</b></div>';
    h += '<div class="p-sep"></div>';
    h += line('شماره سفارش', N(ticket.no));
    h += line('میز / سالن', esc(ticket.place));
    h += line('زمان', esc(U.time(ticket.at)) + ' · ' + esc(U.date(ticket.at)));
    h += line('نوع / سفارشگیر', esc(ticket.type + ' · ' + ticket.waiter));
    if (ticket.copyOf) h += '<div class="p-center p-small">چاپ مجدد</div>';
    h += '<div class="p-sep"></div>';
    ticket.lines.forEach(l => {
      h += '<div class="p-row" style="font-size:1.15em;font-weight:700"><span>' + esc(N(l.qty) + ' × ' + l.name) + '</span><span></span></div>';
      if (l.note) h += '<div class="p-note">↳ ' + esc(l.note) + '</div>';
    });
    if (ticket.cancelled && ticket.cancelled.length) {
      h += '<div class="p-sep"></div><div class="p-note"><b>اقلام حذف شده:</b></div>';
      ticket.cancelled.forEach(l => { h += '<div class="p-note">✗ ' + esc(N(l.qty) + ' × ' + l.name) + '</div>'; });
    }
    h += '<div class="p-sep"></div><div class="p-center p-small">تعداد اقلام: ' + N(App.util.sum(ticket.lines, l => l.qty)) + '</div>';
    h += '<div class="p-center p-small">' + esc(App.model.D().settings.headerNote) + '</div>';
    return h;
  }

  /* ------------------------------ row builders ------------------------------ */
  function invoiceRows(inv, widthMm) {
    const S = App.model.D().settings;
    const N = U.num;
    const rows = [];
    rows.push(T(S.restaurantName, { align:'center', style:'title' }));
    rows.push(T(S.address, { align:'center', style:'small' }));
    rows.push(T('تلفن: ' + S.phone, { align:'center', style:'small' }));
    rows.push(RULE());
    rows.push(T('صورتحساب فروش', { align:'center', style:'bold' }));
    rows.push(P('شماره فاکتور', N(inv.no)));
    rows.push(P('تاریخ / ساعت', U.date(inv.paidAt || inv.createdAt) + '  ' + U.time(inv.paidAt || inv.createdAt), { style:'small' }));
    rows.push(P('میز / سالن', (inv.tableLabel || '—') + ' · ' + (inv.hallLabel || '—')));
    rows.push(P('نوع سفارش', inv.type || 'سالن'));
    rows.push(P('سفارشگیر', inv.waiterName || '—'));
    if (inv.customer && inv.customer.name) rows.push(P('مشتری', inv.customer.name));
    rows.push(RULE());
    (inv.lines || []).forEach(l => {
      rows.push(P(N(l.qty) + ' × ' + l.name, N((Number(l.price)||0) * (Number(l.qty)||0)), { style:'bold' }));
      if (l.note) rows.push(T('↳ ' + l.note, { style:'small' }));
    });
    rows.push(RULE());
    rows.push(P('جمع اقلام', N(inv.subtotal)));
    if (inv.discount) rows.push(P('تخفیف', '− ' + N(inv.discount)));
    if (inv.tax) rows.push(P('مالیات (' + N(S.taxPercent) + '٪)', N(inv.tax)));
    if (inv.service) rows.push(P('سرویس (' + N(S.servicePercent) + '٪)', N(inv.service)));
    rows.push(SPACE(6));
    rows.push(T('مبلغ قابل پرداخت: ' + N(inv.total) + ' ' + S.currency, { align:'center', style:'bold' }));
    if (inv.payments && inv.payments.length) {
      rows.push(RULE());
      inv.payments.forEach(p => {
        const label = p.label || ({ cash:'نقدی', credit:'اعتباری', card:'کارتخوان', other:'سایر' }[p.method] || p.method);
        rows.push(P(label + (p.ref ? ' (' + p.ref + ')' : ''), N(p.amount), { style:'small' }));
      });
    }
    rows.push(RULE());
    rows.push(T(S.footer, { align:'center', style:'small' }));
    rows.push(T('سامانه سفارشگیری هوشیار', { align:'center', style:'small' }));
    rows.push(SPACE(14));
    return rows;
  }

  function kitchenRows(ticket, widthMm) {
    const N = U.num;
    const rows = [];
    rows.push(T(ticket.stationName, { align:'center', style:'title' }));
    rows.push(T('برگه سفارش آشپزخانه', { align:'center', style:'bold' }));
    rows.push(RULE());
    rows.push(P('شماره سفارش', N(ticket.no), { style:'bold' }));
    rows.push(P('میز / سالن', ticket.place, { style:'bold' }));
    rows.push(P('زمان', U.time(ticket.at) + '  ' + U.date(ticket.at), { style:'small' }));
    rows.push(P('نوع / سفارشگیر', ticket.type + ' · ' + ticket.waiter, { style:'small' }));
    if (ticket.copyOf) rows.push(T('*** چاپ مجدد ***', { align:'center', style:'bold' }));
    rows.push(RULE());
    ticket.lines.forEach(l => {
      rows.push(P(N(l.qty) + '  ×  ' + l.name, '', { style:'title' }));
      if (l.note) rows.push(T('↳ ' + l.note, { style:'bold' }));
    });
    if (ticket.cancelled && ticket.cancelled.length) {
      rows.push(RULE());
      rows.push(T('اقلام حذف شده:', { style:'bold' }));
      ticket.cancelled.forEach(l => rows.push(T('✗ ' + N(l.qty) + ' × ' + l.name, { style:'small' })));
    }
    rows.push(RULE());
    rows.push(T('تعداد اقلام: ' + N(App.util.sum(ticket.lines, l => l.qty)), { align:'center' }));
    rows.push(T(App.model.D().settings.headerNote, { align:'center', style:'small' }));
    rows.push(SPACE(14));
    return rows;
  }

  /* ------------------------------ transports ------------------------------ */
  function parseBridgeResult(v) {
    let r = v;
    if (v === true || v === 'true' || v === 1) return { ok:true, info:'ارسال شد' };
    if (typeof v === 'string') { try { r = JSON.parse(v); } catch (e) { return { ok:true, info:v }; } }
    if (r && typeof r === 'object') {
      const ok = r.ok === true || r.success === true;
      return ok ? { ok:true, info:r.info || r.message || 'ارسال شد' } : { ok:false, error:r.error || r.message || 'خطای چاپ' };
    }
    return { ok:false, error:typeof r === 'undefined' ? 'پاسخی از دستگاه دریافت نشد' : String(r) };
  }

  function findPrinter(widthMm, usage) {
    const ps = App.model.D().printers.filter(p => p.enabled && (p.usage === usage || p.usage === 'both'));
    return ps.find(p => Number(p.width) === Number(widthMm)) || ps[0] || null;
  }

  function log(job) {
    App.store.commit(d => {
      d.printJobs = d.printJobs || [];
      d.printJobs.unshift(Object.assign({ id:U.uid('job'), at:Date.now() }, job));
      if (d.printJobs.length > 60) d.printJobs.length = 60;
    });
  }

  async function browserPrint(html, widthMm) {
    const root = document.getElementById('print-root');
    if (!root) return { ok:false, error:'بخش چاپ یافت نشد' };
    root.innerHTML = '<div class="print-sheet ' + (Number(widthMm) === 58 ? 'w58' : '') + '">' + html + '</div>';
    if (App.device.android && window.AndroidPOS && AndroidPOS.printHtml) {
      try { return parseBridgeResult(AndroidPOS.printHtml(root.innerHTML, String(widthMm))); }
      catch (e) { return { ok:false, error:e.message }; }
    }
    setTimeout(() => { try { window.print(); } catch (e) {} }, 120);
    return { ok:true, info:'پنجره چاپ مرورگر باز شد' };
  }

  async function send(printer, rows, meta) {
    meta = meta || {};
    const width = Number(printer.width) === 58 ? 58 : 80;
    let raster;
    try { raster = await buildRaster(rows, width, { cut:printer.cut !== false, drawer:!!printer.drawer }); }
    catch (e) { return finish({ ok:false, error:'خطا در آمادهسازی چاپ: ' + e.message, printer, meta, raster:null }); }
    let result;
    if (printer.kind === 'system') {
      result = await browserPrint(meta.html || '', width);
    } else if (App.device.android && window.AndroidPOS && AndroidPOS.print) {
      try { result = parseBridgeResult(AndroidPOS.print(JSON.stringify(printer), raster.base64)); }
      catch (e) { result = { ok:false, error:e.message }; }
    } else if (printer.kind === 'network') {
      try {
        const r = await fetch('/api/print', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ ip:printer.ip, port:printer.port || 9100, data:raster.base64 }) });
        const j = await r.json();
        result = j.ok ? { ok:true, info:'ارسال TCP به ' + printer.ip + ':' + (printer.port||9100) } : { ok:false, error:j.error || 'خطای سرور چاپ' };
      } catch (e) { result = { ok:false, error:'دسترسی به سرور چاپ ممکن نیست. در اندروید چاپ بومی انجام میشود. (' + e.message + ')' }; }
    } else {
      result = { ok:false, error:'چاپگر ' + (printer.kind === 'usb' ? 'USB' : 'بلوتوث') + ' فقط روی دستگاه اندروید در دسترس است. میتوانید فایل چاپ (ESC/POS) یا پیشنمایش را ذخیره کنید.' };
    }
    return finish(Object.assign({}, result, { printer, meta, raster }));
  }

  function finish(ctx) {
    const ok = !!ctx.ok;
    log({ kind:ctx.meta.kind || 'receipt', printerId:ctx.printer ? ctx.printer.id : null, printerName:ctx.printer ? ctx.printer.name : 'مرورگر',
          width:ctx.printer ? ctx.printer.width : 80, status:ok ? 'ok' : 'fail', info:ok ? (ctx.info || '') : (ctx.error || ''),
          ref:ctx.meta.ref || '', bytes:ctx.raster ? ctx.raster.bytes : 0 });
    return Object.assign({}, ctx, { ok });
  }

  async function printInvoice(inv, widthMm, opts) {
    opts = opts || {};
    const w = Number(widthMm) === 58 ? 58 : 80;
    const rows = invoiceRows(inv, w);
    const html = receiptHtml(inv, w);
    const printer = opts.printerId ? App.model.printer(opts.printerId) : findPrinter(w, 'invoice');
    if (!printer) {
      const r = await browserPrint(html, w);
      log({ kind:'invoice', printerName:'چاپ مرورگر', width:w, status:r.ok ? 'ok':'fail', info:r.ok ? 'چاپگر فعالی تعریف نشده؛ چاپ مرورگر' : r.error, ref:String(inv.no), bytes:0 });
      return r;
    }
    const copies = Math.min(5, Math.max(1, Number(printer.copies) || 1));
    let last;
    for (let i = 0; i < copies; i++) last = await send(printer, rows, { kind:'invoice', ref:String(inv.no), html });
    if (last && last.ok && !opts.reprint) {
      App.store.commit(d => { const x = d.invoices.find(i => i.id === inv.id); if (x) x.printedCount = (x.printedCount || 0) + 1; });
    }
    return last;
  }

  function kitchenTickets(order, opts) {
    opts = opts || {};
    const d = App.model.D();
    const byStation = {};
    const unsent = [];
    (order.lines || []).forEach(l => {
      if (l.voided) return;
      const stations = App.model.lineStations(l).length ? App.model.lineStations(l) : ['__none__'];
      stations.forEach(sid => {
        const already = l.sent ? (Number(l.sent[sid]) || 0) : (Number(l.sentQty) || 0);
        const qty = opts.reprint ? l.qty : Math.max(0, (Number(l.qty)||0) - already);
        if (!qty) return;
        byStation[sid] = byStation[sid] || [];
        byStation[sid].push({ id:l.id, name:l.name, qty, note:l.note || '', stationId:sid });
      });
    });
    (order.lines || []).filter(l => l.voided).forEach(l => {
      (App.model.lineStations(l).length ? App.model.lineStations(l) : ['__none__']).forEach(sid => {
        byStation[sid] = byStation[sid] || [];
        byStation[sid].__cancelled = byStation[sid].__cancelled || [];
        byStation[sid].__cancelled.push({ name:l.name, qty:l.qty });
      });
    });
    const waiter = (d.users.find(u => u.id === order.waiterId) || {}).name || '—';
    const place = App.model.label(order);
    const tickets = [];
    Object.keys(byStation).forEach(sid => {
      const lines = byStation[sid].filter(x => !Array.isArray(x));
      const cancelled = byStation[sid].__cancelled || [];
      if (!lines.length && !cancelled.length) return;
      const st = App.model.station(sid);
      const fallback = d.stations.find(x => x.enabled) || null;
      const station = st || fallback;
      if (!station) return;
      tickets.push({
        stationId:station.id, stationName:st ? st.name : (station.name + ' (پیشفرض)'), printerId:station.printerId,
        copies:st ? (st.copies || 1) : 1, enabled:st ? st.enabled !== false : true,
        no:order.no, place, type:order.type || 'سالن', waiter, at:Date.now(), copyOf:!!opts.reprint,
        lines, cancelled, lineIds:lines.map(x => x.id)
      });
    });
    return tickets;
  }

  async function printKitchen(order, opts) {
    opts = opts || {};
    const tickets = kitchenTickets(order, opts);
    const results = [];
    for (const t of tickets) {
      if (!t.enabled) { results.push({ ticket:t, ok:false, error:'خط چاپ غیرفعال است' }); continue; }
      const printer = App.model.printer(t.printerId);
      if (!printer || !printer.enabled) {
        results.push({ ticket:t, ok:false, error:'چاپگری برای «' + t.stationName + '» تنظیم نشده یا غیرفعال است' });
        continue;
      }
      const w = Number(printer.width) === 58 ? 58 : 80;
      const rows = kitchenRows(t, w);
      let last;
      for (let i = 0; i < Math.min(5, t.copies || 1); i++) last = await send(printer, rows, { kind:'kitchen', ref:'سفارش ' + t.no + ' · ' + t.stationName, html:kitchenHtml(t, w) });
      results.push({ ticket:t, ok:!!(last && last.ok), error:last ? last.error : '', info:last ? last.info : '', printer });
      if (last && last.ok && !opts.reprint) {
        App.store.commit(() => {
          const o = App.model.D().orders.find(x => x.id === order.id);
          if (!o) return;
          t.lineIds.forEach(id => {
            const l = o.lines.find(x => x.id === id);
            if (!l) return;
            l.sent = l.sent || {};
            l.sent[t.stationId] = l.qty;
            l.sentQty = l.qty;
          });
        });
      }
    }
    return results;
  }

  async function testPrinter(printer) {
    const S = App.model.D().settings;
    const w = Number(printer.width) === 58 ? 58 : 80;
    const rows = [
      T('تست چاپگر', { align:'center', style:'title' }),
      T(S.restaurantName, { align:'center', style:'bold' }),
      RULE(),
      T('چاپگر: ' + printer.name),
      T('کاغذ: ' + w + ' میلیمتر (' + (w === 58 ? '۶ سانتی' : '۸ سانتی') + ')'),
      T('اتصال: ' + ({ network:'شبکه / IP', usb:'USB / XPrinter', bluetooth:'بلوتوث', system:'چاپ سیستم' }[printer.kind] || printer.kind)),
      T('زمان: ' + U.datetime()),
      T('الف ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی'),
      T('0123456789 / ۱۲۳۴۵۶۷۸۹۰'),
      RULE(), T('هوشیار POS · اتصال موفق', { align:'center', style:'bold' }), SPACE(16)
    ];
    return send(printer, rows, { kind:'test', ref:'تست', html:receiptHtml({ no:0, lines:[], subtotal:0, total:0, payments:[], createdAt:Date.now(), paidAt:Date.now(), type:'تست', tableLabel:'—', hallLabel:'—', waiterName:'—' }, w) });
  }

  function downloadRaster(printer, rows) {
    return buildRaster(rows, Number(printer.width) === 58 ? 58 : 80, { cut:printer.cut !== false }).then(r => {
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      U.download('hooshyar-' + (printer.id || 'print') + '.bin', arr, 'application/octet-stream');
      return r;
    });
  }

  return { T, P, RULE, SPACE, WIDTHS, buildRaster, invoiceRows, kitchenRows, receiptHtml, kitchenHtml,
           findPrinter, send, printInvoice, printKitchen, kitchenTickets, testPrinter, browserPrint, downloadRaster, log };
})();
