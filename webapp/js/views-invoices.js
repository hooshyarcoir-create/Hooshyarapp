/* ============================================================================
 * Hooshyar POS v2 — invoice archive: separated current / paid / edited /
 * deleted lists, detail, edit, soft delete, restore and reprint.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.inputs = App.inputs || {};

(function () {
  const U=App.util, N=U.num, M=U.money, I=U.icon, V=App.views;
  const D=()=>App.model.D(), st=()=>App.ui.state;
  const B=V.btn, head=V.head, empty=V.empty, T=V.table;

  const TABS = [
    { id:'current', label:'جاری', icon:'grid' },
    { id:'paid',    label:'پرداخت شده', icon:'check' },
    { id:'edited',  label:'ویرایش شده', icon:'edit' },
    { id:'deleted', label:'حذف شده', icon:'trash' },
    { id:'all',     label:'همه', icon:'layers' }
  ];

  function source() {
    const d=D();
    return d.orders.concat(d.invoices).filter(x => x && x.id);
  }
  function bucket(x, tab) {
    if (tab === 'all') return true;
    if (tab === 'current') return ['draft','current','void'].indexOf(x.status) !== -1;
    if (tab === 'deleted') return x.status === 'deleted';
    return x.status === tab;
  }
  function method(x) {
    const m=App.report.methodOf(x);
    return '<span class="badge '+(m==='mixed'?'accent':m==='card'?'info':m==='credit'?'warn':'ok')+'">'+U.esc(App.report.METHOD_LABEL[m]||m)+'</span>';
  }
  function invView() {
    const s=st(), tab=s.invTab||'current', d=D();
    let list=source().filter(x=>bucket(x,tab)).sort((a,b)=>(b.paidAt||b.updatedAt||b.createdAt||0)-(a.paidAt||a.updatedAt||a.createdAt||0));
    const q=(s.invSearch||'').trim(); if(q) list=list.filter(x=>String(x.no).indexOf(q)>=0 || (x.customer&&x.customer.name||'').indexOf(q)>=0 || App.model.label(x).indexOf(q)>=0);
    const sum=U.sum(list.filter(x=>x.status!=='deleted'),x=>Number(x.total)||App.model.totals(x).total);
    let h=head('مدیریت فاکتورها','جاری، پرداختشده، ویرایششده و حذفشده بهصورت مجزا',
      B('nav','کنسول ثبت سفارش','grid','btn-primary btn-sm',{screen:'console'})+
      B('inv-export','خروجی CSV','save','btn-sm'));
    h+='<div class="stat-strip">' + TABS.map(t=>{
      const c=source().filter(x=>bucket(x,t.id)).length;
      return '<button class="stat-tab '+(tab===t.id?'active':'')+'" data-action="inv-tab" data-id="'+t.id+'">'+I(t.icon,'sm')+'<span>'+t.label+'</span><b class="num">'+N(c)+'</b></button>';
    }).join('')+'</div>';
    h+='<div class="card"><div class="card-head"><h3>'+U.esc((TABS.find(t=>t.id===tab)||{}).label||'')+'</h3><span class="spacer"></span>'+
      '<span class="badge accent num">جمع '+M(sum)+' '+U.esc(d.settings.currency)+'</span></div>'+
      '<div class="input-icon" style="max-width:340px;margin-bottom:10px">'+I('search')+'<input type="text" data-input="inv-search" value="'+U.esc(s.invSearch||'')+'" placeholder="شماره فاکتور، مشتری یا میز…"></div>';
    const rows=list.map(x=>{
      const isInv=D().invoices.some(i=>i.id===x.id);
      return [ '<b class="num">'+N(x.no)+'</b>', U.date(x.paidAt||x.createdAt)+'<div class="tiny faint">'+U.time(x.paidAt||x.createdAt)+'</div>',
        U.esc(App.model.label(x))+'<div class="tiny faint">'+U.esc(x.type||'حضوری')+'</div>',
        V.statusBadge(x.status)+' '+method(x),
        U.esc(x.customer&&x.customer.name?x.customer.name:'—')+'<div class="tiny faint">'+U.esc(x.createdByName||'—')+'</div>',
        '<span class="num strong">'+M(Number(x.total)||App.model.totals(x).total)+'</span>',
        '<div class="row tight">'+B('inv-detail','جزئیات','receipt','btn-sm',{id:x.id})+
          (isInv&&x.status!=='deleted'&&App.auth.can('invoice.edit')?B('inv-edit',(x.paidAt||x.settledAt||x.status==='paid'||x.status==='edited')?'ویرایش فاکتور تسویه‌شده':'ویرایش','edit','btn-sm',{id:x.id}):'')+
          (isInv&&x.status!=='deleted'&&App.auth.can('invoice.delete')&&((!x.paidAt&&!x.settledAt&&x.status!=='paid'&&x.status!=='edited')||App.auth.can('invoice.deletePaid'))?B('inv-delete','حذف','trash','btn-sm btn-danger',{id:x.id}):'')+
          (isInv&&x.status==='deleted'&&App.auth.can('invoice.restore')?B('inv-restore','بازیابی','refresh','btn-sm btn-outline',{id:x.id}):'')+
        '</div>' ];
    });
    h+=T(['شماره','تاریخ / ساعت','میز / نوع','وضعیت / پرداخت','مشتری / ثبتکننده','مبلغ','عملیات'],rows,
      ['جمع',N(list.length)+' فاکتور','','','','<b class="num">'+M(sum)+'</b>','']);
    h+='</div>';
    return h;
  }

  function paymentRows(inv) {
    const rows=(inv.payments||[]).map(p=>[U.esc(p.label||p.method),'<span class="num">'+M(p.amount)+'</span>',
      U.esc(p.ref||'—')+'<div class="tiny faint">'+U.esc(p.pspName||'')+'</div>',
      (p.status==='failed'||p.reversed)?'<span class="badge danger">'+U.esc(p.status==='failed'?'ناموفق':'برگشتی')+'</span>':'<span class="badge ok">موفق</span>']);
    return T(['روش','مبلغ','مرجع / درگاه','وضعیت'],rows);
  }
  function detailBody(inv) {
    const isInv=D().invoices.some(i=>i.id===inv.id), t=App.model.totals(inv), s=D().settings;
    const actorRow=(label,name,at)=>'<div class="t-row"><span>'+label+'</span><span>'+U.esc(name||'—')+(at?' <span class="tiny faint">'+U.datetime(at)+'</span>':'')+'</span></div>';
    let h='<div class="inv-detail">';
    h+='<div class="detail-top"><div class="badge big '+App.domain.statusClass(inv.status)+'">'+App.domain.statusLabel(inv.status)+'</div>'+
      '<div><b class="num" style="font-size:22px">'+N(inv.no)+'</b><div class="tiny muted">نسخه '+N(inv.revision||1)+' · ویرایشها '+N(inv.editCount||0)+'</div></div>'+
      '<span class="spacer"></span>'+method(inv)+'</div>';
    h+='<div class="grid cols-2"><div class="card"><div class="card-head"><h3>اطلاعات فاکتور</h3></div>'+
      '<div class="t-row"><span>تاریخ صدور</span><span>'+U.datetime(inv.paidAt||inv.createdAt)+'</span></div>'+
      '<div class="t-row"><span>میز / محل</span><span>'+U.esc(inv.tableLabel||App.model.label(inv))+' '+U.esc(inv.hallLabel||'')+'</span></div>'+
      '<div class="t-row"><span>نوع سفارش</span><span>'+U.esc(inv.type||'حضوری')+'</span></div>'+
      '<div class="t-row"><span>مدت اشغال</span><span>'+U.duration(inv.occupiedAt||inv.createdAt,inv.paidAt)+'</span></div>'+
      '<div class="t-row"><span>مشتری</span><span>'+U.esc(inv.customer&&inv.customer.name?inv.customer.name:'—')+'</span></div>'+
      '<div class="t-row"><span>سفارشگیر / پرسنل</span><span>'+U.esc(inv.waiterName||inv.createdByName||'—')+' / '+U.esc(inv.personnelName||(App.model.personnel(inv.personnelId)||{}).name||'—')+'</span></div>'+
      (inv.notes?'<div class="tiny warn">یادداشت: '+U.esc(inv.notes)+'</div>':'')+
      '</div><div class="card"><div class="card-head"><h3>عاملین و حسابرسی</h3></div>'+
      actorRow('ثبتکننده',inv.createdByName,inv.createdAt)+
      actorRow('ویرایشکننده',inv.editedByName,inv.editedAt)+
      actorRow('تسویهکننده',inv.settledByName,inv.settledAt)+
      actorRow('حذفکننده',inv.deletedByName,inv.deletedAt)+
      actorRow('بازیابیکننده',inv.restoredByName,inv.restoredAt)+
      (inv.deleteReason?'<div class="tiny danger">دلیل حذف: '+U.esc(inv.deleteReason)+'</div>':'')+
      '<div class="divider"></div><div class="tiny faint">چاپها: '+N(inv.printCount||0)+' · انتقالها: '+N((inv.transfers||[]).length)+'</div>'+
      '</div></div>';
    h+='<div class="card" style="margin-top:12px"><div class="card-head"><h3>اقلام</h3></div>'+
      T(['کالا','تعداد','قیمت','تخفیف','جمع'],(inv.lines||[]).filter(l=>!l.voided).map(l=>[
        U.esc(l.name)+(l.note?'<div class="tiny faint">'+U.esc(l.note)+'</div>':''),'<span class="num">'+N(l.qty)+'</span>',
        '<span class="num">'+M(l.price)+'</span>','<span class="num">'+M(App.domain.discountValue(l.discount,l.price*l.qty))+'</span>',
        '<span class="num strong">'+M(l.price*l.qty)+'</span>']))+'</div>';
    h+='<div class="grid cols-2" style="margin-top:12px"><div class="card"><div class="card-head"><h3>مبالغ</h3></div>'+
      '<div class="t-row"><span>جمع اقلام</span><span class="num">'+M(t.gross)+'</span></div>'+
      '<div class="t-row"><span>تخفیف ردیفی</span><span class="num">− '+M(t.lineDiscount)+'</span></div>'+
      '<div class="t-row"><span>تخفیف فاکتور</span><span class="num">− '+M(t.discount)+'</span></div>'+
      '<div class="t-row"><span>مالیات / عوارض</span><span class="num">'+M(t.tax+t.levy)+'</span></div>'+
      '<div class="t-row total"><span>قابل پرداخت</span><span class="num">'+M(Number(inv.total)||t.total)+'</span></div></div>'+
      '<div class="card"><div class="card-head"><h3>پرداختها</h3></div>'+paymentRows(inv)+'</div></div>';
    if((inv.transfers||[]).length) h+='<div class="card" style="margin-top:12px"><div class="card-head"><h3>زنجیره انتقال میز</h3></div>'+
      inv.transfers.map((tr,i)=>'<div class="list-row"><span class="lr-main"><span class="lr-title">'+N(i+1)+'. '+U.esc(tr.fromLabel)+' ← '+U.esc(tr.toLabel)+'</span><span class="lr-sub">'+U.datetime(tr.at)+' · '+U.esc(tr.byName||'')+'</span></span></div>').join('')+'</div>';
    if((inv.versions||[]).length) h+='<div class="card" style="margin-top:12px"><div class="card-head"><h3>نسخهها و تغییرات</h3></div>'+
      inv.versions.slice(0,8).map(v=>'<div class="list-row"><span class="lr-main"><span class="lr-title">نسخه '+N(v.revision)+' · '+U.esc(v.reason||'—')+'</span><span class="lr-sub">'+U.datetime(v.at)+' · '+U.esc(v.byName||'')+'</span></span><span class="num">'+M(v.snapshot?v.snapshot.total:0)+'</span></div>').join('')+'</div>';
    return h+'</div>';
  }
  function detail(id) {
    const inv=App.model.invoice(id), ord=inv?null:App.model.order(id), x=inv||ord;
    if(!x) return App.ui.toast('فاکتور یافت نشد.','err');
    const isInv=!!inv, w=Number(D().settings.invoiceWidth)||80;
    const buttons=[{label:'بستن',close:true}];
    if(isInv&&x.status!=='deleted') {
      if(App.auth.can('club.manage')) buttons.unshift({label:'لینک آنلاین مشتری',icon:'send',onClick:()=>{App.ui.close();sendLink(x);}});
      if(App.auth.can('invoice.reprint')) buttons.unshift({label:'چاپ مجدد',icon:'print',onClick:async()=>{App.ui.close();const r=await App.print.printInvoice(x,w,{reprint:true});App.ui.toast(r.ok?'چاپ مجدد ثبت شد.':'خطای چاپ: '+(r.error||''),r.ok?'ok':'err');App.ui.refresh();}});
      if(App.auth.can('invoice.edit')) buttons.unshift({label:(x.paidAt||x.settledAt||x.status==='paid'||x.status==='edited')?'ویرایش فاکتور تسویه‌شده':'ویرایش فاکتور','icon':'edit',onClick:()=>{App.ui.close();editInvoice(x);}});
    }
    App.ui.modal({title:'فاکتور شماره '+N(x.no),size:'wide',body:detailBody(x),buttons});
  }
  function sendLink(inv) {
    const r=App.club.sendInvoice(inv);
    if(!r.ok&&!r.link) return App.ui.toast(r.error,'err');
    App.ui.modal({title:'لینک فاکتور مشتری',body:'<div class="card">'+(r.error?'<div class="tiny warn">'+U.esc(r.error)+'</div>':'')+'<div class="tiny muted">پیوند حامل‌محور و فقط‌خواندنی؛ جزئیات فاکتور در نشانی کدگذاری شده و محرمانه نیست:</div>'+
      '<div class="link-box" dir="ltr">'+U.esc(r.link)+'</div><div class="tiny muted">کانال ارسال: '+U.esc(r.channel||'')+'</div></div>',
      buttons:[{label:'کپی لینک',icon:'save',onClick:()=>{
        try{navigator.clipboard.writeText(r.link);App.ui.toast('لینک کپی شد.','ok');}catch(e){App.ui.toast('کپی خودکار ممکن نشد؛ لینک را انتخاب کنید.','err');}
      }},{label:'باز کردن',icon:'receipt',onClick:()=>{try{window.open(r.link,'_blank');}catch(e){}}},{label:'بستن',close:true}]});
  }
  function editInvoice(inv) {
    if(!App.auth.can('invoice.edit')) return App.ui.toast('دسترسی ویرایش فاکتور ندارید.','err');
    const settings=D().settings, eq=App.domain.discountEquivalent(inv);
    let lines='<div class="card"><div class="card-head"><h3>اقلام فاکتور</h3><span class="spacer"></span><span class="tiny faint">تعداد و تخفیف هر ردیف</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف ردیف (مبلغ)</th></tr></thead><tbody>';
    lines+=(inv.lines||[]).map(l=>'<tr><td>'+U.esc(l.name)+'</td><td><input type="number" min="0" name="qty_'+l.id+'" value="'+N(l.qty)+'" style="width:80px"></td>'+
      '<td><input type="number" min="0" name="price_'+l.id+'" value="'+N(l.price)+'" style="width:110px"></td>'+
      '<td><input type="number" min="0" name="disc_'+l.id+'" value="'+N(App.domain.discountValue(l.discount,l.price*l.qty))+'" style="width:110px"></td></tr>').join('');
    lines+='</tbody></table></div><div class="tiny faint">با ذخیره، نسخه جدید فاکتور، عامل ویرایش و اختلاف موجودی کالا ثبت میشود.</div></div>';
    App.ui.form({title:'ویرایش فاکتور شماره '+N(inv.no),size:'wide',submit:'ذخیره نسخه جدید',
      note:lines,
      fields:[
        {name:'reason',label:'دلیل ویرایش',type:'text',required:true,placeholder:'مثال: اصلاح تعداد نوشیدنی'},
        {name:'discType',label:'نوع تخفیف فاکتور',type:'select',options:[{value:'percent',label:'درصدی'},{value:'amount',label:'مبلغ ثابت'}],value:inv.discount?inv.discount.type:'percent'},
        {name:'discValue',label:'مقدار تخفیف فاکتور',type:'number',value:inv.discount?inv.discount.value:0,min:0},
        {name:'notes',label:'یادداشت فاکتور',type:'textarea',value:inv.notes||'',full:true},
        {name:'customerCode',label:'کد مشتری',type:'text',value:inv.customer&&inv.customer.code||''},
        {name:'personnelId',label:'پرسنل / سفارشگیر',type:'select',options:D().personnel.map(p=>({value:p.id,label:p.name})),value:inv.personnelId}
      ],
      onSubmit:v=>{
        const patch={type:v.discType,value:Number(v.discValue)||0};
        const chk=App.domain.discountAllowed(inv,patch,'discount.invoice');
        if(!chk.ok) return App.ui.toast(chk.error,'err');
        const before=(inv.lines||[]).map(l=>({id:l.id,qty:Number(l.qty)||0,productId:l.productId,voided:!!l.voided}));
        const after=before.map(x=>Object.assign({},x,{qty:Math.max(0,Number(v['qty_'+x.id])||0),voided:!(Number(v['qty_'+x.id])>0)}));
        const stockMoves=[], stockLedger=U.clone(inv.stockAppliedLines||{});
        if(inv.stockApplied){
          const projected={};
          after.forEach(next=>{const prev=before.find(x=>x.id===next.id),p=D().products.find(z=>z.id===next.productId);if(!p||!p.trackStock||p.stock==null)return;
            const had=Object.prototype.hasOwnProperty.call(stockLedger,next.id),was=had?Math.max(0,Number(stockLedger[next.id])||0):(prev&&!prev.voided?prev.qty:0);
            if(!had)stockLedger[next.id]=was;
            const now=next.voided?0:next.qty,delta=now-was;if(delta){stockMoves.push({id:next.id,productId:p.id,delta,now});if(delta>0)projected[p.id]=(projected[p.id]||0)+delta;}
          });
          const shortage=Object.keys(projected).find(id=>(Number(D().products.find(p=>p.id===id).stock)||0)<projected[id]);
          if(shortage){const p=D().products.find(x=>x.id===shortage);return App.ui.toast('موجودی «'+p.name+'» برای اصلاح فاکتور کافی نیست.','err');}
        }
        const c=v.customerCode?App.club.find(v.customerCode):null;
        App.store.commit(d=>{
          const x=d.invoices.find(i=>i.id===inv.id)||inv;
          App.domain.snapshot(x,v.reason,'invoice');
          (x.lines||[]).forEach(l=>{
            const q=Math.max(0,Number(v['qty_'+l.id])||0), pr=Math.max(0,Number(v['price_'+l.id])||0);
            l.qty=q; l.price=Number(v['price_'+l.id])!=null?pr:l.price;
            const dv=Math.max(0,Number(v['disc_'+l.id])||0);
            l.discount={type:'amount',value:dv}; l.voided=q<=0;
          });
          x.discount=patch; x.notes=v.notes||''; x.personnelId=v.personnelId;
          if(c) { x.customerId=c.id; x.customer={name:App.club.fullName(c),phone:c.phone||'',code:c.code||''}; }
          const t=App.domain.totals(x,d.settings);
          x.subtotal=t.gross; x.lineDiscount=t.lineDiscount; x.discount=t.discount; x.discountPercent=t.discountPercent;
          x.tax=t.tax; x.lineTax=t.lineTax; x.levy=t.levy; x.total=t.total; x.updatedAt=Date.now();
          if(x.stockApplied) {
            x.stockAppliedLines=U.clone(stockLedger);
            stockMoves.forEach(m=>{const p=d.products.find(z=>z.id===m.productId);if(!p)return;const beforeStock=Number(p.stock)||0;p.stock=Math.max(0,beforeStock-m.delta);p.sold=Math.max(0,(Number(p.sold)||0)+m.delta);x.stockAppliedLines[m.id]=m.now;if(p.stock>0)p.lockedReason='';else p.lockedReason='اتمام موجودی';d.stockMoves=d.stockMoves||[];d.stockMoves.unshift({id:U.uid('sm'),at:Date.now(),productId:p.id,productName:p.name,delta:-m.delta,before:beforeStock,after:p.stock,kind:'invoice-edit',entityId:inv.id,by:App.auth.actor().id,byName:App.auth.actor().name});});
          }
        },'entity.edit','ویرایش فاکتور '+N(inv.no)+' · '+v.reason,{entityType:'invoice',entityId:inv.id,before,after});
        App.print.broadcast('اصلاح فاکتور',inv,'فاکتور ویرایش شد: '+v.reason).catch(()=>{});
        App.ui.toast('نسخه '+N(inv.revision||1)+' فاکتور ثبت و گزارش شد.','ok');
        App.ui.refresh();
      }});
  }
  Object.assign(App.actions, {
    'inv-tab': el => { st().invTab=el.dataset.id; App.ui.render(); },
    'inv-search': el => {},
    'inv-detail': el => detail(el.dataset.id),
    'inv-edit': el => { const inv=App.model.invoice(el.dataset.id); if(inv) editInvoice(inv); },
    'inv-delete': el => {
      const inv=App.model.invoice(el.dataset.id); if(!inv)return;
      if(!App.auth.can('invoice.delete')||((!!inv.paidAt||!!inv.settledAt||inv.status==='paid'||inv.status==='edited')&&!App.auth.can('invoice.deletePaid'))) return App.ui.toast('دسترسی حذف این فاکتور را ندارید.','err');
      App.ui.form({title:'حذف منطقی فاکتور '+N(inv.no),fields:[{name:'reason',label:'دلیل حذف',type:'text',required:true}],submit:'حذف و ارسال اعلامیه',
        onSubmit:v=>{
          const wasActive=inv.status!=='deleted';
          App.store.commit(()=>{
            const r=App.domain.softDelete(inv,'invoice',v.reason);
            if(r.ok && wasActive) App.domain.restoreStock(inv);
          },'entity.delete','حذف فاکتور '+N(inv.no)+' · '+v.reason,{entityType:'invoice',entityId:inv.id});
          App.print.broadcast('ابطال / حذف فاکتور',inv,'فاکتور حذف شد: '+v.reason).catch(()=>{});
          App.ui.toast('فاکتور حذف منطقی شد؛ موجودی برگشت و اعلامیه به چاپگرها ارسال شد.','ok'); App.ui.refresh();
        }});
    },
    'inv-restore': el => {
      const inv=App.model.invoice(el.dataset.id); if(!inv)return;
      if(!App.auth.can('invoice.restore')) return App.ui.toast('دسترسی بازیابی ندارید.','err');
      App.ui.form({title:'بازیابی فاکتور '+N(inv.no),fields:[{name:'reason',label:'دلیل بازیابی',type:'text',required:true}],submit:'بازیابی',
        onSubmit:v=>{
          App.store.commit(()=>{
            const r=App.domain.restore(inv,'invoice',v.reason);
            if(r.ok && !inv.stockApplied) App.domain.applyStock(inv);
          },'entity.restore','بازیابی فاکتور '+N(inv.no)+' · '+v.reason,{entityType:'invoice',entityId:inv.id});
          App.print.broadcast('بازیابی فاکتور',inv,'فاکتور بازیابی شد: '+v.reason).catch(()=>{});
          App.ui.toast('فاکتور بازیابی و موجودی مجدداً کسر شد.','ok'); App.ui.refresh();
        }});
    },
    'inv-export': () => {
      if(!App.auth.can('reports.export')) return App.ui.toast('دسترسی خروجی فاکتورها ندارید.','err');
      const rows=source().filter(x=>bucket(x,st().invTab||'current')).map(x=>[
        x.no,U.datetime(x.paidAt||x.createdAt),App.model.label(x),x.type||'',App.domain.statusLabel(x.status),
        App.report.methodOf(x),x.customer&&x.customer.name||'',x.createdByName||'',x.editedByName||'',x.settledByName||'',
        Number(x.total)||App.model.totals(x).total]);
      U.download('hooshyar-invoices.csv',App.report.csv(['شماره','تاریخ','میز','نوع','وضعیت','پرداخت','مشتری','ثبتکننده','ویرایشکننده','تسویهکننده','مبلغ'],rows),'text/csv;charset=utf-8');
    }
  });
  Object.assign(App.inputs, {
    'inv-search': el => {
      st().invSearch=el.value;
      // Re-render on a short debounce so typing stays responsive.
      clearTimeout(st()._invSearchTimer);
      st()._invSearchTimer=setTimeout(()=>App.ui.refresh(),260);
    }
  });
  App.views.invoices = invView;
  App.invoiceFlow = { detail, editInvoice, sendLink, detailBody };
})();
