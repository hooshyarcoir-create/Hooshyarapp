/* ============================================================================
 * Hooshyar POS v2 — reporting console with filters, charts, CSV and printing
 * ==========================================================================*/
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.inputs = App.inputs || {};

(function () {
  const U=App.util, N=U.num, M=U.money, I=U.icon, V=App.views;
  const D=()=>App.model.D(), st=()=>App.ui.state;
  const B=V.btn, head=V.head, empty=V.empty, T=V.table, K=V.kpi;

  function filters() {
    let f=st().reportFilters;
    if(!f) f=st().reportFilters=App.report.defaultFilters();
    if(!f.range) f.range='month';
    if(f.range && f.range!=='custom') {
      const now=Date.now(), day=86400000;
      if(f.range==='today'){ f.from=U.isoDate(now); f.to=U.isoDate(now); }
      if(f.range==='week'){ f.from=U.isoDate(now-6*day); f.to=U.isoDate(now); }
      if(f.range==='month'){ f.from=U.isoDate(now-29*day); f.to=U.isoDate(now); }
    }
    return f;
  }
  const RANGES=[{id:'today',label:'امروز'},{id:'week',label:'۷ روز'},{id:'month',label:'۳۰ روز'},{id:'custom',label:'دلخواه'}];

  /** Every report returns the same shape so export/print stay generic. */
  function build(id,f) {
    const d=D(), invs=App.report.filter(f), sum=App.report.summary(invs);
    const orders=App.report.orders(f).filter(o=>{
      if(f.status&&o.status!==f.status)return false;
      if(f.type&&o.type!==f.type)return false;
      return true;
    });
    switch(id) {
      case 'orders': {
        const rows=invs.concat(orders).sort((a,b)=>(b.paidAt||b.createdAt)-(a.paidAt||a.createdAt)).map(x=>[
          N(x.no),U.date(x.paidAt||x.createdAt),U.time(x.paidAt||x.createdAt),
          App.model.label(x),U.esc(x.type||'حضوری'),App.domain.statusLabel(x.status),
          U.esc(App.report.METHOD_LABEL[App.report.methodOf(x)]||'—'),U.esc(x.createdByName||'—'),
          U.esc(x.settledByName||'—'),M(Number(x.total)||App.model.totals(x).total)]);
        return {title:'گزارش سفارشات',headers:['شماره','تاریخ','ساعت','میز','نوع','وضعیت','پرداخت','ثبتکننده','تسویهکننده','مبلغ'],rows};
      }
      case 'items': {
        const xs=App.report.items(invs);
        return {title:'اقلام فروش رفته',headers:['کالا','گروه','تعداد','تخفیف','مبلغ','تعداد فاکتور'],
          rows:xs.map(x=>[U.esc(x.name),U.esc(x.group),N(x.qty),M(x.discount),M(x.amount),N(x.orders)]),
          chart:xs.slice(0,10).map(x=>({label:x.name.slice(0,9),value:x.qty})),chartTitle:'نمودار پرفروشترین اقلام',chartFmt:v=>N(v)};
      }
      case 'changes': {
        const rows=[], audit=(d.audit||[]).filter(a=>/entity\.(edit|delete|restore)|invoice\.reprint|order\.submit/.test(a.action));
        audit.forEach(a=>rows.push([U.datetime(a.at),U.esc(a.userName||'—'),U.esc(a.action),U.esc(a.detail||'—'),U.esc((a.extra&&a.extra.reason)||'—')]));
        (d.printJobs||[]).filter(j=>j.kind==='invoice'||j.kind==='order-receipt'||String(j.kind).indexOf('notice:')===0)
          .forEach(j=>rows.push([U.datetime(j.at),'سامانه چاپ',j.kind==='invoice'?'چاپ / چاپ مجدد فاکتور':'اعلامیه / چاپ سفارش',U.esc(j.printerName||'')+' · '+U.esc(j.info||j.error||''),U.esc(j.ref||'')]));
        return {title:'گزارش ویرایش، حذف، بازیابی و چاپ مجدد',headers:['زمان','کاربر','نوع عملیات','شرح','دلیل / مرجع'],rows:rows.sort((a,b)=>b[0].localeCompare(a[0],'fa'))};
      }
      case 'credit': {
        const rows=App.report.creditRows().map(c=>[U.esc(c.name),U.esc(c.code||'—'),U.esc(c.phone||'—'),M(c.limit),M(c.used),M(c.available),N(c.purchases),M(c.total)]);
        return {title:'گزارش اعتباری مشتریان',headers:['مشتری','کد','موبایل','سقف','مصرف','مانده مجاز','دفعات خرید','جمع خرید'],rows};
      }
      case 'cash': {
        const rows=[];
        invs.forEach(i=>(i.payments||[]).filter(p=>p.method==='cash'&&!p.reversed).forEach(p=>rows.push([
          N(i.no),U.datetime(p.at||i.paidAt),U.esc(i.tableLabel||'—'),M(p.amount),U.esc(p.byName||i.settledByName||'—'),U.esc(i.createdByName||'—')])));
        return {title:'فروش نقدی',headers:['فاکتور','زمان','میز','مبلغ نقد','صندوقدار','ثبتکننده'],rows,foot:['جمع','','','<b>'+M(sum.cash)+'</b>','','']};
      }
      case 'card': {
        const rows=App.report.cardTransactions(invs).map(p=>[N(p.no),U.datetime(p.at),M(p.amount),U.esc(p.psp),U.esc(p.terminal),U.esc(p.ref),U.esc(p.trace),U.esc(p.pan),U.esc(p.status==='success'?'موفق':'ناموفق'),U.esc(p.by)]);
        return {title:'تراکنشهای کارتخوان',headers:['فاکتور','زمان','مبلغ','درگاه','پایانه','شماره مرجع','Trace','PAN','وضعیت','کاربر'],rows,foot:['جمع','','<b>'+M(sum.card)+'</b>','','','','','','','']};
      }
      case 'total': {
        const byMethod=Object.keys(sum.byMethod).map(k=>[U.esc(App.report.METHOD_LABEL[k]||k),M(sum.byMethod[k]),N(sum.byStatus[k]||0)]);
        const hours=App.report.hourly(invs).filter(h=>h.value).map(h=>[U.esc(h.label),M(h.value)]);
        const days=App.report.daily(invs,30).filter(x=>x.value).map(x=>[U.esc(x.label),M(x.value)]);
        return {title:'سرجمع فروش',headers:['شاخص','مقدار','توضیح'],
          rows:[['تعداد فاکتور',N(sum.count),'بدون فاکتورهای حذفشده'],['فروش ناخالص',M(sum.total+sum.discount+sum.lineDiscount),'قبل از تخفیف'],
            ['تخفیف ردیفی',M(sum.lineDiscount),'اقلام'],['تخفیف فاکتور',M(sum.discount),'کل فاکتور'],['مالیات',M(sum.tax),'—'],['عوارض',M(sum.levy),'—'],
            ['فروش خالص',M(sum.total),'قابل پرداخت'],['فروش نقد',M(sum.cash),'تراکنشها'],['فروش کارتخوان',M(sum.card),'تراکنشها'],['فروش اعتباری',M(sum.credit),'تراکنشها'],
            ['میانگین فاکتور',M(sum.average),'—'],['پورسانت',M(sum.commission),'پرسنل'],
            ...hours.map(x=>['ساعت '+x[0],x[1],'فروش ساعتی']),...days.map(x=>['روز '+x[0],x[1],'فروش روزانه']),
            ...byMethod.map(x=>['روش '+x[0],x[1],'تفکیک روش پرداخت'])],
          chart:App.report.daily(invs,14),chartTitle:'نمودار فروش ۱۴ روز',chartFmt:v=>M(v)};
      }
      case 'waiters': {
        const ws=App.report.waiters(invs);
        return {title:'عملکرد سفارشگیرها و پورسانت',headers:['پرسنل / کاربر','تعداد فاکتور','مبلغ فروش','پورسانت'],
          rows:ws.map(w=>[U.esc(w.name),N(w.orders),M(w.amount),M(w.commission)]),
          chart:ws.map(w=>({label:w.name.slice(0,9),value:w.amount})),chartTitle:'فروش به تفکیک پرسنل',chartFmt:v=>M(v)};
      }
      case 'transfers': {
        const ts=App.report.transfers(f);
        return {title:'زنجیره کامل جابهجایی میزها',headers:['فاکتور','زمان','میز مبدأ','میز مقصد','کاربر','دلیل'],
          rows:ts.map(t=>[N(t.orderNo),U.datetime(t.at),U.esc(t.fromLabel),U.esc(t.toLabel),U.esc(t.byName||'—'),U.esc(t.reason||'—')])};
      }
      case 'stock-ledger': {
        const moves=App.report.stockMovements(f);
        return {title:'گردش ثبت‌شده موجودی',headers:['زمان','کالا','نوع گردش','تغییر','قبل','بعد','کاربر','مرجع'],
          rows:moves.map(m=>[U.datetime(m.at),U.esc(m.productName),U.esc(({sale:'فروش / کسر',restore:'برگشت', 'order-correction':'اصلاح سفارش','manual-adjustment':'اصلاح دستی','invoice-edit':'اصلاح فاکتور'})[m.kind]||m.kind),N(m.delta),N(m.before),N(m.after),U.esc(m.byName||'—'),U.esc(m.entityId||'—')])};
      }
      case 'stock': {
        const ps=(d.products||[]).filter(p=>p.trackStock);
        return {title:'موجودی، فروش و هشدار کالاها',headers:['کالا','موجودی اولیه','فروش رفته','مانده','حداقل مجاز','وضعیت'],
          rows:ps.map(p=>[U.esc(p.name),N(p.initialStock),N(p.sold),N(p.stock),N(p.minStock),'<span class="badge '+App.domain.stockStatus(p).cls+'">'+U.esc(App.domain.stockStatus(p).label)+'</span>'])};
      }
      case 'actors': {
        const rows=invs.map(i=>[N(i.no),U.esc(i.createdByName||'—'),U.esc(i.editedByName||'—'),U.esc(i.deletedByName||'—'),
          U.esc(i.restoredByName||'—'),U.esc(i.settledByName||'—'),U.esc(i.waiterName||i.personnelName||'—'),M(i.total)]);
        return {title:'عاملین عملیات فاکتورها',headers:['فاکتور','ثبتکننده','ویرایشکننده','حذفکننده','بازیابیکننده','تسویهکننده','سفارشگیر','مبلغ'],rows};
      }
      default: return {title:'گزارش',headers:[],rows:[]};
    }
  }

  function reportsView() {
    const s=st(), f=filters(), reportId=s.reportId||'total';
    const d=D(), invs=App.report.filter(f), sum=App.report.summary(invs), r=build(reportId,f);
    const rep=App.report.REPORTS.find(x=>x.id===reportId)||App.report.REPORTS[0];
    let h=head('گزارشات مدیریتی','فیلتر تاریخ، ساعت، وضعیت، نوع سفارش، کاربر، سالن و روش پرداخت',
      B('rep-export','خروجی CSV','save','btn-sm')+B('rep-print','چاپ گزارش','print','btn-sm btn-outline'));
    h+='<div class="grid cols-4 keep" style="margin-bottom:12px">'+
      K('فروش خالص',M(sum.total),N(sum.count)+' فاکتور','accent')+
      K('نقد / کارت / اعتبار',M(sum.cash)+' / '+M(sum.card),'اعتبار '+M(sum.credit),'info')+
      K('تخفیفات',M(sum.discount+sum.lineDiscount),'مالیات '+M(sum.tax),'warn')+
      K('پورسانت',M(sum.commission),'میانگین '+M(sum.average),'ok')+'</div>';
    h+='<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>فیلترها</h3><span class="spacer"></span>'+V.chips(RANGES,'rep-range',f.range,'id')+'</div>'+
      '<div class="form-grid dense">'+
      '<label class="field"><span>از تاریخ</span><input type="date" data-input="rep-from" value="'+U.esc(f.from||'')+'"></label>'+
      '<label class="field"><span>تا تاریخ</span><input type="date" data-input="rep-to" value="'+U.esc(f.to||'')+'"></label>'+
      '<label class="field"><span>از ساعت</span><input type="time" data-input="rep-fromTime" value="'+U.esc(f.fromTime||'00:00')+'"></label>'+
      '<label class="field"><span>تا ساعت</span><input type="time" data-input="rep-toTime" value="'+U.esc(f.toTime||'23:59')+'"></label>'+
      '<label class="field"><span>وضعیت</span><select data-input="rep-status"><option value="">همه</option>'+
        Object.keys(App.domain.STATUS).map(k=>'<option value="'+k+'" '+(f.status===k?'selected':'')+'>'+U.esc(App.domain.STATUS[k].label)+'</option>').join('')+'</select></label>'+
      '<label class="field"><span>نوع سفارش</span><select data-input="rep-type"><option value="">همه</option>'+
        ['حضوری','بیرون بر','Take Away'].map(x=>'<option value="'+x+'" '+(f.type===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label class="field"><span>سالن</span><select data-input="rep-hall"><option value="">همه</option>'+
        d.halls.map(x=>'<option value="'+x.id+'" '+(f.hallId===x.id?'selected':'')+'>'+U.esc(x.name)+'</option>').join('')+'</select></label>'+
      '<label class="field"><span>گروه کالا</span><select data-input="rep-group"><option value="">همه</option>'+
        d.groups.map(x=>'<option value="'+x.id+'" '+(f.groupId===x.id?'selected':'')+'>'+U.esc(x.name)+'</option>').join('')+'</select></label>'+
      '<label class="field"><span>روش پرداخت</span><select data-input="rep-method"><option value="">همه</option>'+
        Object.keys(App.report.METHOD_LABEL).map(k=>'<option value="'+k+'" '+(f.method===k?'selected':'')+'>'+U.esc(App.report.METHOD_LABEL[k])+'</option>').join('')+'</select></label>'+
      '<label class="field"><span>کاربر</span><select data-input="rep-user"><option value="">همه</option>'+
        d.users.map(x=>'<option value="'+x.id+'" '+(f.userId===x.id?'selected':'')+'>'+U.esc(x.name)+'</option>').join('')+'</select></label>'+
      '</div></div>';
    h+='<div class="report-layout"><div class="card report-menu"><div class="card-head"><h3>انواع گزارش</h3></div>'+
      App.report.REPORTS.map(x=>'<button class="report-item '+(x.id===reportId?'active':'')+'" data-action="rep-select" data-id="'+x.id+'">'+I(x.icon,'sm')+
        '<span><b>'+U.esc(x.label)+'</b><small>'+U.esc(x.desc)+'</small></span></button>').join('')+'</div>'+
      '<div class="card report-body"><div class="card-head"><h3>'+U.esc(rep.label)+'</h3><span class="spacer"></span><span class="badge accent num">'+N(r.rows.length)+' ردیف</span></div>'+
      (r.chart?'<div class="card-head"><h4>'+U.esc(r.chartTitle||'')+'</h4></div>'+V.barChart(r.chart,{height:155,fmt:r.chartFmt}):'')+
      T(r.headers,r.rows,r.foot)+'</div></div>';
    return h;
  }

  Object.assign(App.actions, {
    'rep-select': el => { st().reportId=el.dataset.id; App.ui.refresh(); },
    'rep-range': el => { const f=filters(); f.range=el.dataset.id; App.ui.render(); },
    'rep-export': () => {
      if(!App.auth.can('reports.export')) return App.ui.toast('دسترسی خروجی گزارش ندارید.','err');
      const r=build(st().reportId||'total',filters());
      const rows=r.rows.map(x=>x.map(v=>String(v).replace(/<[^>]*>/g,'')));
      U.download('hooshyar-'+(st().reportId||'report')+'.csv',App.report.csv(r.headers,rows),'text/csv;charset=utf-8');
      App.audit('report.export','خروجی CSV گزارش '+r.title);
      App.ui.toast('فایل CSV ایجاد شد.','ok');
    },
    'rep-print': async () => {
      const r=build(st().reportId||'total',filters()), s=D().settings;
      const html='<div class="report-print"><h2>'+U.esc(s.restaurantName)+'</h2><h3>'+U.esc(r.title)+'</h3>'+
        '<div class="p-row"><span>تاریخ چاپ</span><span>'+U.datetime()+'</span></div><div class="p-row"><span>کاربر</span><span>'+U.esc(App.auth.actor().name)+'</span></div>'+
        '<hr><table class="tbl"><thead><tr>'+r.headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
        r.rows.map(row=>'<tr>'+row.map(c=>'<td>'+String(c).replace(/<[^>]*>/g,'')+'</td>').join('')+'</tr>').join('')+
        '</tbody></table></div>';
      const res=await App.print.browserPrint(html,Number(s.invoiceWidth)||80);
      App.ui.toast(res.ok?'گزارش به چاپ ارسال شد.':(res.error||'خطای چاپ'),res.ok?'ok':'err');
    }
  });
  const map={ 'rep-from':'from','rep-to':'to','rep-fromTime':'fromTime','rep-toTime':'toTime','rep-status':'status',
    'rep-type':'type','rep-hall':'hallId','rep-group':'groupId','rep-method':'method','rep-user':'userId' };
  Object.keys(map).forEach(key=>{
    App.inputs[key]=el=>{
      const f=filters(); f[map[key]]=el.value;
      if(key==='rep-from'||key==='rep-to')f.range='custom';
      // Debounced refresh keeps inputs usable while typing.
      clearTimeout(st()._reportTimer); st()._reportTimer=setTimeout(()=>App.ui.refresh(),280);
    };
  });
  App.views.reports = reportsView;
  App.reportsFlow = { build, filters };
})();
