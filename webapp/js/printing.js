/* ============================================================================
 * Hooshyar POS v2 — print service
 * Persian text is rendered into a 1-bit ESC/POS raster (GS v 0) so any
 * XPrinter / 58mm(6cm) / 80mm(8cm) device prints correctly shaped text.
 * Every ticket carries: invoice no, date/time, registering user, table/type,
 * print version and copy number. Print jobs have unique idempotency keys.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};

App.print = (function () {
  const U = App.util;
  const WIDTHS = { 58:384, 80:576 };
  const T = (text,o) => Object.assign({ t:'text', text:String(text==null?'':text), align:'right', style:'normal' }, o);
  const P = (right,left,o) => Object.assign({ t:'pair', right:String(right==null?'':right), left:String(left==null?'':left), style:'normal' }, o);
  const RULE = () => ({ t:'rule' });
  const SPACE = h => ({ t:'space', h:h||8 });

  /* --------------------------- ESC/POS raster --------------------------- */
  function fontFor(style, mm) {
    const base = mm === 58 ? 20 : 26;
    const sizes = { small:base-5, normal:base, bold:base+2, title:base+12 };
    const size = sizes[style] || base, weight = (style==='bold'||style==='title') ? 700 : 400;
    return { size, css:weight + ' ' + size + 'px Vazirmatn, Tahoma, sans-serif' };
  }
  function wrap(ctx, text, maxW) {
    if (!text) return [''];
    const words = String(text).split(/\s+/).filter(Boolean); if (!words.length) return [''];
    const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur+' '+w : w;
      if (ctx.measureText(test).width <= maxW || !cur) cur = test; else { lines.push(cur); cur = w; }
      while (cur && ctx.measureText(cur).width > maxW && cur.length > 1) {
        let cut = 1; while (cut < cur.length && ctx.measureText(cur.slice(0,cut+1)).width <= maxW) cut++;
        lines.push(cur.slice(0,cut)); cur = cur.slice(cut);
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  function layoutRows(ctx, rows, mm) {
    const W = WIDTHS[mm]||WIDTHS[80], pad = mm===58?6:10, maxW = W-pad*2, out = [];
    for (const row of rows) {
      if (row.t === 'space') { out.push({ h:row.h, draw:null }); continue; }
      if (row.t === 'rule') { out.push({ h:12, draw:(c,y,h) => { c.save(); c.strokeStyle='#000'; c.lineWidth=2; c.setLineDash([7,5]); c.beginPath(); c.moveTo(pad,y+h/2); c.lineTo(W-pad,y+h/2); c.stroke(); c.restore(); } }); continue; }
      const f = fontFor(row.style, mm); ctx.font = f.css;
      const lineH = Math.round(f.size*1.45);
      if (row.t === 'pair') {
        const leftW = ctx.measureText(row.left).width, parts = wrap(ctx, row.right, Math.max(40, maxW-leftW-12));
        out.push({ h:lineH*parts.length, draw:(c,y) => {
          c.font=f.css; c.fillStyle='#000'; c.textBaseline='middle'; c.direction='rtl';
          parts.forEach((part,i) => {
            const yy = y+lineH*(i+0.5); c.textAlign='right'; c.fillText(part,W-pad,yy);
            if (i===0 && row.left) { c.textAlign='left'; c.fillText(row.left,pad,yy); }
          });
        } });
      } else {
        const parts = wrap(ctx, row.text, maxW);
        out.push({ h:lineH*parts.length, draw:(c,y) => {
          c.font=f.css; c.fillStyle='#000'; c.textBaseline='middle'; c.direction='rtl';
          parts.forEach((part,i) => {
            c.textAlign = row.align==='center' ? 'center' : (row.align==='left' ? 'left' : 'right');
            const x = row.align==='center' ? W/2 : (row.align==='left' ? pad : W-pad);
            c.fillText(part,x,y+lineH*(i+0.5));
          });
        } });
      }
    }
    return { W, pad, items:out };
  }
  async function buildRaster(rows, mm, opts) {
    mm = Number(mm)===58 ? 58 : 80; opts = opts||{};
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const probe = document.createElement('canvas').getContext('2d');
    const L = layoutRows(probe, rows, mm), top=10, bottom=10;
    const H = Math.min(16000, top+bottom+U.sum(L.items, i=>i.h));
    const canvas = document.createElement('canvas'); canvas.width=L.W; canvas.height=H;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,L.W,H); ctx.textBaseline='middle';
    let y=top; L.items.forEach(it => { if (it.draw) it.draw(ctx,y,it.h); y += it.h; });
    const img = ctx.getImageData(0,0,L.W,H).data, bpr = Math.ceil(L.W/8), pixels = new Uint8Array(bpr*H);
    for (let py=0;py<H;py++) for (let px=0;px<L.W;px++) {
      const i=(py*L.W+px)*4, lum=img[i]*.299+img[i+1]*.587+img[i+2]*.114;
      if (lum<150 && img[i+3]>100) pixels[py*bpr+(px>>3)] |= 0x80 >> (px&7);
    }
    const cmd=[0x1b,0x40, 0x1b,0x33,0x00, 0x1d,0x76,0x30,0x00, bpr&0xff,(bpr>>8)&0xff, H&0xff,(H>>8)&0xff];
    const all = new Uint8Array(cmd.length+pixels.length+14); all.set(cmd,0); all.set(pixels,cmd.length);
    let k=cmd.length+pixels.length;
    all[k++]=0x1b; all[k++]=0x64; all[k++]=0x04;
    if (opts.cut !== false) { all[k++]=0x1d; all[k++]=0x56; all[k++]=0x42; all[k++]=0x00; }
    if (opts.drawer) { all[k++]=0x1b; all[k++]=0x70; all[k++]=0x00; all[k++]=0x19; all[k++]=0xfa; }
    const out=all.subarray(0,k);
    return { base64:U.toBase64(out), width:L.W, height:H, bytes:out.length };
  }

  /* ---------------------------- print metadata ---------------------------- */
  /** Required on EVERY ticket, per SRS §12. */
  function metaRows(inv, ctx) {
    ctx = ctx || {};
    const s = App.model.D().settings;
    if (!s.printMeta) return [];
    const rows = [
      P('شماره فاکتور', U.num(inv.no), { style:'bold' }),
      P('تاریخ / ساعت', U.date(ctx.at||Date.now()) + '  ' + U.time(ctx.at||Date.now()), { style:'small' }),
      P('کاربر ثبتکننده', inv.createdByName || inv.waiterName || '—', { style:'small' }),
      P('میز / نوع سفارش', (inv.tableLabel||'—') + ' · ' + (inv.type||'حضوری'), { style:'small' })
    ];
    if (s.printVersion) rows.push(P('نسخه / نوبت چاپ', 'v' + U.num(inv.revision||1) + ' · ' + U.num(ctx.copy||1) + '/' + U.num(ctx.copies||1), { style:'small' }));
    rows.push(RULE());
    return rows;
  }

  /* ------------------------------ HTML receipts ------------------------------ */
  function esc(s) { return U.esc(s); }
  function receiptHtml(inv, mm) {
    const s = App.model.D().settings, N = U.num;
    const line = (r,l,cls) => '<div class="p-row '+(cls||'')+'"><span>'+r+'</span><span class="num">'+l+'</span></div>';
    let h = '<div class="p-center"><div class="p-logo">ه</div><div class="p-title">'+esc(s.restaurantName)+'</div>' +
      '<div class="p-small">'+esc(s.address)+'</div><div class="p-small">تلفن: <span class="num">'+esc(s.phone)+'</span></div></div>';
    h += '<div class="p-sep"></div><div class="p-center"><b>صورتحساب فروش</b></div><div class="p-sep"></div>';
    h += line('شماره فاکتور', N(inv.no));
    h += line('تاریخ / ساعت', esc(U.date(inv.paidAt||inv.createdAt)) + ' · ' + esc(U.time(inv.paidAt||inv.createdAt)));
    h += line('کاربر ثبتکننده', esc(inv.createdByName || inv.waiterName || '—'));
    h += line('میز / نوع', esc((inv.tableLabel||'—') + ' · ' + (inv.type||'حضوری')));
    h += line('سفارشگیر', esc(inv.personnelName || inv.waiterName || '—'));
    h += line('تسویهکننده', esc(inv.settledByName || '—'));
    if (inv.customer && (inv.customer.name || inv.customer.firstName)) h += line('مشتری', esc(inv.customer.name || (inv.customer.firstName+' '+inv.customer.lastName)));
    h += '<div class="p-sep"></div>';
    (inv.lines||[]).forEach(l => {
      const lc = App.domain.lineCalc(l, s);
      h += line(esc(N(l.qty)+' × '+l.name), N(lc.gross));
      if (lc.discount) h += '<div class="p-note">↳ تخفیف ردیفی: − '+N(lc.discount)+'</div>';
      if (l.note) h += '<div class="p-note">↳ '+esc(l.note)+'</div>';
    });
    h += '<div class="p-sep"></div>';
    h += line('جمع اقلام', N(inv.subtotal || App.model.totals(inv).gross));
    if (inv.lineDiscount) h += line('تخفیف ردیفی', '− '+N(inv.lineDiscount));
    if (inv.discount) h += line('تخفیف فاکتور' + (inv.discountPercent ? ' ('+N(inv.discountPercent)+'٪)' : ''), '− '+N(inv.discount));
    if (inv.lineTax || (s.taxPolicy === 'item' && inv.tax)) h += line('مالیات کالا', N(inv.tax||inv.lineTax||0));
    else if (inv.tax) h += line('مالیات ('+N(s.taxPercent)+'٪)', N(inv.tax));
    if (inv.levy) h += line('عوارض', N(inv.levy));
    h += '<div class="p-row p-total"><span>مبلغ قابل پرداخت</span><span class="num">'+N(inv.total)+' '+esc(s.currency)+'</span></div>';
    if (inv.payments && inv.payments.length) {
      h += '<div class="p-sep"></div><div class="p-small"><b>نحوه پرداخت</b></div>';
      inv.payments.forEach(p => {
        const label = p.label || ({cash:'نقدی',credit:'اعتباری',card:'کارتخوان',other:'سایر'}[p.method]||p.method);
        h += line(esc(label) + (p.ref ? ' <span class="p-small">( '+esc(p.ref)+' )</span>' : ''), N(p.amount));
      });
    }
    h += '<div class="p-sep"></div><div class="p-center p-small">'+esc(s.footer)+'</div>';
    h += '<div class="p-center p-small">هوشیار POS · نسخه '+N(inv.revision||1)+' · '+esc(U.date(inv.paidAt||Date.now()))+'</div>';
    return h;
  }
  function kitchenHtml(t, mm) {
    const N=U.num, line=(r,l)=>'<div class="p-row"><span>'+r+'</span><span class="num">'+l+'</span></div>';
    let h = '<div class="p-center"><div class="p-title">🍽 '+esc(t.stationName)+'</div><b>برگه سفارش آشپزخانه</b></div><div class="p-sep"></div>';
    h += line('شماره فاکتور', N(t.no));
    h += line('تاریخ / ساعت', esc(U.date(t.at))+' · '+esc(U.time(t.at)));
    h += line('کاربر ثبتکننده', esc(t.createdByName||'—'));
    h += line('میز / نوع', esc(t.place+' · '+t.type));
    h += line('نسخه / نوبت', 'v'+N(t.revision||1)+' · '+N(t.copy||1)+'/'+N(t.copies||1));
    if (t.copyOf) h += '<div class="p-center p-small">*** چاپ مجدد ***</div>';
    h += '<div class="p-sep"></div>';
    t.lines.forEach(l => { h += '<div class="p-row" style="font-size:1.15em;font-weight:700"><span>'+esc(N(l.qty)+' × '+l.name)+'</span><span></span></div>'; if (l.note) h += '<div class="p-note">↳ '+esc(l.note)+'</div>'; });
    if (t.cancelled && t.cancelled.length) { h += '<div class="p-sep"></div><div class="p-note"><b>ابطال / حذف اقلام:</b></div>'; t.cancelled.forEach(l => h += '<div class="p-note">✗ '+esc(N(l.qty)+' × '+l.name)+'</div>'); }
    if (t.notice) h += '<div class="p-sep"></div><div class="p-center"><b>'+esc(t.notice)+'</b></div>';
    h += '<div class="p-sep"></div><div class="p-center p-small">تعداد اقلام: '+N(U.sum(t.lines,l=>l.qty))+'</div>';
    return h;
  }

  /* ------------------------------ row builders ------------------------------ */
  function invoiceRows(inv, mm, ctx) {
    const s=App.model.D().settings, N=U.num, rows=[];
    rows.push(T(s.restaurantName,{align:'center',style:'title'}));
    rows.push(T(s.address,{align:'center',style:'small'}));
    rows.push(T('تلفن: '+s.phone,{align:'center',style:'small'}));
    rows.push(RULE(), T('صورتحساب فروش',{align:'center',style:'bold'}));
    rows.push(...metaRows(inv, ctx));
    rows.push(P('سفارشگیر', inv.personnelName||inv.waiterName||'—'));
    rows.push(P('تسویهکننده', inv.settledByName||'—'));
    if (inv.customer && (inv.customer.name||inv.customer.firstName)) rows.push(P('مشتری', inv.customer.name||(inv.customer.firstName+' '+inv.customer.lastName)));
    (inv.lines||[]).forEach(l => {
      const lc = App.domain.lineCalc(l,s);
      rows.push(P(N(l.qty)+' × '+l.name, N(lc.gross), {style:'bold'}));
      if (lc.discount) rows.push(T('↳ تخفیف ردیفی − '+N(lc.discount),{style:'small'}));
      if (l.note) rows.push(T('↳ '+l.note,{style:'small'}));
    });
    rows.push(RULE());
    rows.push(P('جمع اقلام', N(inv.subtotal||App.model.totals(inv).gross)));
    if (inv.lineDiscount) rows.push(P('تخفیف ردیفی','− '+N(inv.lineDiscount)));
    if (inv.discount) rows.push(P('تخفیف فاکتور'+(inv.discountPercent?' ('+N(inv.discountPercent)+'٪)':''),'− '+N(inv.discount)));
    if (inv.tax) rows.push(P(s.taxPolicy==='item'?'مالیات کالا':'مالیات ('+N(s.taxPercent)+'٪)', N(inv.tax)));
    if (inv.levy) rows.push(P('عوارض', N(inv.levy)));
    rows.push(SPACE(6), T('مبلغ قابل پرداخت: '+N(inv.total)+' '+s.currency,{align:'center',style:'bold'}));
    if (inv.payments && inv.payments.length) {
      rows.push(RULE());
      inv.payments.forEach(p => rows.push(P((p.label||p.method)+(p.ref?' ('+p.ref+')':''), N(p.amount), {style:'small'})));
    }
    rows.push(RULE(), T(s.footer,{align:'center',style:'small'}), SPACE(14));
    return rows;
  }
  function kitchenRows(t, mm) {
    const N=U.num, rows=[];
    rows.push(T(t.stationName,{align:'center',style:'title'}), T('برگه سفارش آشپزخانه',{align:'center',style:'bold'}), RULE());
    rows.push(P('شماره فاکتور',N(t.no),{style:'bold'}), P('تاریخ / ساعت',U.date(t.at)+'  '+U.time(t.at),{style:'small'}));
    rows.push(P('کاربر ثبتکننده',t.createdByName||'—',{style:'small'}), P('میز / نوع',t.place+' · '+t.type,{style:'bold'}));
    rows.push(P('نسخه / نوبت چاپ','v'+N(t.revision||1)+' · '+N(t.copy||1)+'/'+N(t.copies||1),{style:'small'}));
    if (t.copyOf) rows.push(T('*** چاپ مجدد ***',{align:'center',style:'bold'}));
    rows.push(RULE());
    t.lines.forEach(l => { rows.push(P(N(l.qty)+'  ×  '+l.name,'',{style:'title'})); if (l.note) rows.push(T('↳ '+l.note,{style:'bold'})); });
    if (t.cancelled && t.cancelled.length) { rows.push(RULE(), T('ابطال / حذف اقلام:',{style:'bold'})); t.cancelled.forEach(l => rows.push(T('✗ '+N(l.qty)+' × '+l.name,{style:'small'}))); }
    if (t.notice) rows.push(RULE(), T(t.notice,{align:'center',style:'title'}));
    rows.push(RULE(), T('تعداد اقلام: '+N(U.sum(t.lines,l=>l.qty)),{align:'center'}), T(App.model.D().settings.headerNote,{align:'center',style:'small'}), SPACE(14));
    return rows;
  }

  /* ------------------------------ transports ------------------------------ */
  function parseBridgeResult(v) {
    let r=v;
    if (v===true||v==='true'||v===1) return { ok:true, info:'ارسال شد' };
    if (typeof v==='string') { try { r=JSON.parse(v); } catch (e) { return { ok:true, info:v }; } }
    if (r && typeof r==='object') { const ok=r.ok===true||r.success===true; return ok?{ok:true,info:r.info||r.message||'ارسال شد'}:{ok:false,error:r.error||r.message||'خطای چاپ'}; }
    return { ok:false, error:r==null?'پاسخی دریافت نشد':String(r) };
  }
  const findPrinter = (mm,usage) => {
    const ps=App.model.D().printers.filter(p=>p.enabled&&(p.usage===usage||p.usage==='both'));
    return ps.find(p=>Number(p.width)===Number(mm)) || ps[0] || null;
  };
  function log(job) {
    App.store.commit(d => { d.printJobs=d.printJobs||[]; d.printJobs.unshift(Object.assign({id:U.uid('job'),at:Date.now(),status:'ok'},job)); if (d.printJobs.length>200) d.printJobs.length=200; });
  }
  function finish(ctx) {
    const ok=!!ctx.ok;
    log({ kind:ctx.meta.kind||'receipt', printerId:ctx.printer?ctx.printer.id:null, printerName:ctx.printer?ctx.printer.name:'مرورگر',
      width:ctx.printer?ctx.printer.width:80, status:ok?'ok':'fail', info:ok?(ctx.info||''):(ctx.error||''),
      ref:ctx.meta.ref||'', bytes:ctx.raster?ctx.raster.bytes:0, copy:ctx.meta.copy||1,
      idempotencyKey:ctx.meta.idempotencyKey||'', entityId:ctx.meta.entityId||'' });
    return Object.assign({},ctx,{ok});
  }
  async function browserPrint(html, mm) {
    const root=document.getElementById('print-root'); if (!root) return {ok:false,error:'بخش چاپ یافت نشد'};
    root.innerHTML='<div class="print-sheet '+(Number(mm)===58?'w58':'')+'">'+html+'</div>';
    if (App.device.android && window.AndroidPOS && AndroidPOS.printHtml) {
      try { return parseBridgeResult(AndroidPOS.printHtml(root.innerHTML,String(mm))); } catch (e) { return {ok:false,error:e.message}; }
    }
    setTimeout(() => { try { window.print(); } catch(e){} },120);
    return {ok:true,info:'پنجره چاپ باز شد'};
  }
  async function send(printer, rows, meta) {
    meta=meta||{};
    const width=Number(printer.width)===58?58:80;
    const key=meta.idempotencyKey||('print-'+U.uid('p'));
    let raster;
    try { raster=await buildRaster(rows,width,{cut:printer.cut!==false,drawer:!!printer.drawer}); }
    catch (e) { return finish({ok:false,error:'خطا در آمادهسازی چاپ: '+e.message,printer,meta,raster:null}); }
    let result;
    if (printer.kind==='system') result=await browserPrint(meta.html||'',width);
    else if (App.device.android && window.AndroidPOS && AndroidPOS.print) {
      try { result=parseBridgeResult(AndroidPOS.print(JSON.stringify(printer),raster.base64)); } catch(e) { result={ok:false,error:e.message}; }
    } else if (printer.kind==='network') {
      try {
        const r=await fetch('/api/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ip:printer.ip,port:printer.port||9100,data:raster.base64})});
        const j=await r.json();
        result=j.ok?{ok:true,info:'TCP → '+printer.ip+':'+(printer.port||9100)}:{ok:false,error:j.error||'خطای سرور چاپ'};
      } catch(e) { result={ok:false,error:'سرور چاپ در دسترس نیست (روی اندروید چاپ بومی انجام میشود): '+e.message}; }
    } else result={ok:false,error:'چاپگر '+(printer.kind==='usb'?'USB':'بلوتوث')+' فقط روی اندروید در دسترس است'};
    return finish(Object.assign({},result,{printer,meta:Object.assign({idempotencyKey:key},meta),raster}));
  }
  async function deliver(printer, rows, meta) {
    const copies=Math.min(5,Math.max(1,Number(printer.copies)||1));
    let last;
    for (let i=1;i<=copies;i++) last=await send(printer,rows,Object.assign({},meta,{copy:i,copies,idempotencyKey:(meta.idempotencyKey||'p')+'-c'+i}));
    return last;
  }

  /* ------------------------------- receipts ------------------------------- */
  async function printInvoice(inv, mm, opts) {
    opts=opts||{}; const w=Number(mm)===58?58:80;
    const ctx={at:Date.now(),copy:1,copies:1};
    const rows=invoiceRows(inv,w,ctx), html=receiptHtml(inv,w);
    const printer=opts.printerId?App.model.printer(opts.printerId):findPrinter(w,'invoice');
    if (!printer) {
      const r=await browserPrint(html,w);
      log({kind:'invoice',printerName:'چاپ مرورگر',width:w,status:r.ok?'ok':'fail',info:r.info||r.error,ref:String(inv.no),entityId:inv.id});
      return r;
    }
    const meta={kind:'invoice',ref:String(inv.no),html,entityId:inv.id,
      idempotencyKey:'inv-' + inv.id + '-' + (inv.revision||1) + '-' + (opts.reprint?'r':'p') + '-' + Date.now()};
    const r=await deliver(printer,rows,meta);
    if (r.ok) {
      App.store.commit(d => {
        const x=d.invoices.find(i=>i.id===inv.id);
        if (x) { x.printCount=(x.printCount||0)+1; x.reprintLog=x.reprintLog||[]; x.reprintLog.unshift({at:Date.now(),by:App.auth.actor().name,copy:opts.reprint?'مجدد':'اولیه'}); if(x.reprintLog.length>20)x.reprintLog.length=20; }
      }, opts.reprint?'invoice.reprint':'invoice.print', 'چاپ فاکتور '+U.num(inv.no));
    }
    return r;
  }
  function kitchenTickets(o, opts) {
    opts=opts||{}; const d=App.model.D(), byStation={};
    (o.lines||[]).forEach(l => {
      const stations=App.model.lineStations(l).length?App.model.lineStations(l):['__none__'];
      stations.forEach(sid => {
        const already=l.sent?(Number(l.sent[sid])||0):(Number(l.sentQty)||0);
        const qty=l.voided?0:(opts.reprint?l.qty:Math.max(0,(Number(l.qty)||0)-already));
        if (!qty && !l.voided) return;
        byStation[sid]=byStation[sid]||{lines:[],cancelled:[]};
        if (l.voided) byStation[sid].cancelled.push({name:l.name,qty:l.qty});
        else byStation[sid].lines.push({id:l.id,name:l.name,qty,note:l.note||'',stationId:sid});
      });
    });
    const tickets=[];
    Object.keys(byStation).forEach(sid => {
      const b=byStation[sid]; if (!b.lines.length && !b.cancelled.length) return;
      const st=App.model.station(sid), fallback=d.stations.find(x=>x.enabled), station=st||fallback;
      if (!station) return;
      tickets.push({ stationId:station.id, stationName:st?st.name:(station.name+' (پیشفرض)'), printerId:station.printerId,
        copies:st?(st.copies||1):1, enabled:st?st.enabled!==false:true, no:o.no,
        place:App.model.label(o), type:o.type||'حضوری', createdByName:o.createdByName||'—',
        revision:o.revision||1, at:Date.now(), copyOf:!!opts.reprint, lines:b.lines, cancelled:b.cancelled,
        lineIds:b.lines.map(x=>x.id), notice:opts.notice||'' });
    });
    return tickets;
  }
  async function printKitchen(o, opts) {
    opts=opts||{}; const tickets=kitchenTickets(o,opts), results=[];
    for (const t of tickets) {
      if (!t.enabled) { results.push({ticket:t,ok:false,error:'خط چاپ غیرفعال است'}); continue; }
      const printer=App.model.printer(t.printerId);
      if (!printer||!printer.enabled) { results.push({ticket:t,ok:false,error:'چاپگر «'+t.stationName+'» تنظیم نشده است'}); continue; }
      const w=Number(printer.width)===58?58:80;
      const r=await deliver(printer,kitchenRows(t,w),{kind:'kitchen',ref:'سفارش '+t.no+' · '+t.stationName,
        html:kitchenHtml(t,w),entityId:o.id,copies:t.copies,idempotencyKey:'kit-'+o.id+'-'+t.stationId+'-'+(o.revision||1)+'-'+Date.now(),
        copy:1,revision:t.revision});
      results.push({ticket:t,ok:!!r.ok,error:r.error||'',info:r.info||'',printer});
      if (r.ok && !opts.reprint) App.store.commit(() => {
        const ord=App.model.D().orders.find(x=>x.id===o.id); if (!ord) return;
        t.lineIds.forEach(id => { const l=ord.lines.find(x=>x.id===id); if (l) { l.sent=l.sent||{}; l.sent[t.stationId]=l.qty; l.sentQty=l.qty; } });
      });
    }
    return results;
  }
  /** «چاپ سفارش»: receipt at the cash printer + customer copy, no settlement. */
  async function printCustomerReceipt(o, opts) {
    opts=opts||{};
    const inv=Object.assign({},o,{paidAt:null,settledByName:'—',personnelName:(App.model.personnel(o.personnelId)||{}).name||'',
      tableLabel:(App.model.table(o.tableId)||{}).name||'—', hallLabel:(App.model.hall(o.hallId)||{}).name||'',
      customer:o.customer||{}});
    const w=Number(App.model.D().settings.invoiceWidth)||80;
    const printer=findPrinter(w,'invoice');
    const rows=invoiceRows(inv,w,{at:Date.now(),copy:1,copies:1});
    const meta={kind:'order-receipt',ref:'سفارش '+U.num(o.no),html:receiptHtml(inv,w),entityId:o.id,
      idempotencyKey:'order-'+o.id+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)};
    const res=[];
    if (printer) res.push(await deliver(printer,rows,meta));
    else res.push(await browserPrint(meta.html,w));
    if (opts.includeKitchen !== false) {
      const kitchen=await printKitchen(o,{reprint:true});
      kitchen.forEach(k=>res.push({ok:k.ok,info:k.info,error:k.error}));
    }
    App.store.commit(d=>{ const ord=d.orders.find(x=>x.id===o.id); if(ord) ord.printCount=(ord.printCount||0)+1; },'order.print','چاپ رسید سفارش '+U.num(o.no));
    return res;
  }
  /** Broadcast system notices (delete / cancel / transfer) to ALL enabled printers. */
  async function broadcast(kind, o, detail) {
    const printers=App.model.D().printers.filter(p=>p.enabled && p.kind!=='system');
    const results=[];
    for (const p of printers) {
      const w=Number(p.width)===58?58:80;
      const rows=[ T('*** '+kind+' ***',{align:'center',style:'title'}), RULE(),
        P('شماره فاکتور',U.num(o.no),{style:'bold'}), P('تاریخ / ساعت',U.date()+'  '+U.time(),{style:'bold'}),
        P('کاربر',App.auth.actor().name,{style:'bold'}), P('میز / نوع',App.model.label(o)+' · '+(o.type||'حضوری'),{style:'bold'}),
        P('نسخه','v'+U.num(o.revision||1),{style:'small'}), RULE(), T(detail,{align:'center',style:'bold'}),
        RULE(), T('لطفاً از انجام این سفارش خودداری کنید',{align:'center',style:'bold'}), SPACE(16) ];
      results.push(await send(p,rows,{kind:'notice:'+kind,ref:U.num(o.no),entityId:o.id,
        idempotencyKey:'notice-'+kind+'-'+o.id+'-'+Date.now()+'-'+p.id}));
    }
    return results;
  }
  async function testPrinter(p) {
    const s=App.model.D().settings, w=Number(p.width)===58?58:80;
    const rows=[T('تست چاپگر',{align:'center',style:'title'}),T(s.restaurantName,{align:'center',style:'bold'}),RULE(),
      T('چاپگر: '+p.name),T('کاغذ: '+w+'mm ('+(w===58?'۶ سانتی':'۸ سانتی')+')'),
      T('اتصال: '+({network:'شبکه / IP',usb:'USB / XPrinter',bluetooth:'بلوتوث',system:'سیستم'}[p.kind]||p.kind)),
      P('شماره فاکتور','۰'),P('تاریخ / ساعت',U.datetime()),P('کاربر',App.auth.actor().name),
      T('الف ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی'),T('0123456789 / ۱۲۳۴۵۶۷۸۹۰'),
      RULE(),T('هوشیار POS · اتصال موفق',{align:'center',style:'bold'}),SPACE(16)];
    return send(p,rows,{kind:'test',ref:'تست',idempotencyKey:'test-'+p.id+'-'+Date.now()});
  }
  function downloadRaster(printer, rows) {
    return buildRaster(rows,Number(printer.width)===58?58:80,{cut:printer.cut!==false}).then(r => {
      const bin=atob(r.base64), arr=new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
      U.download('hooshyar-'+(printer.id||'print')+'.bin',arr,'application/octet-stream');
      return r;
    });
  }
  return { T,P,RULE,SPACE,WIDTHS,buildRaster,invoiceRows,kitchenRows,receiptHtml,kitchenHtml,metaRows,
           findPrinter,send,deliver,printInvoice,printKitchen,kitchenTickets,printCustomerReceipt,
           broadcast,testPrinter,browserPrint,downloadRaster,log };
})();
