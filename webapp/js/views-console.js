/* ============================================================================
 * Hooshyar POS v2 — unified sales console (جایگزین «میز و سالن»)
 * All steps of a sale in ONE screen: hall/table, customer, groups/items,
 * discounts/tax, payment method, printing and settlement.
 * ==========================================================================*/
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.inputs = App.inputs || {};

(function () {
  const U=App.util, N=U.num, M=U.money, I=U.icon, V=App.views;
  const D=()=>App.model.D(), st=()=>App.ui.state;
  const B=V.btn, head=V.head, empty=V.empty;
  const methodName=id=>{const x=(D().paymentMethods||[]).find(m=>(m.kind==='split'?'dongi':m.kind)===id&&m.enabled!==false);return x?x.name:App.pay.methodLabel(id);};

  function stInit() {
    const s=st();
    if (!s.cPay) s.cPay={ method:'cash', pspId:'', customerId:'', heads:2, dongiMethod:'cash', amount:null, cashReceived:'' };
    if (!s.cHallId) s.cHallId=(D().halls[0]||{}).id||null;
    if (s.cGroupId==null) s.cGroupId='all';
    if (s.cSearch==null) s.cSearch='';
    if (s.cTakeaway==null) s.cTakeaway=false;
    return s;
  }
  function currentOrder() {
    const s=st();
    if (s.cOrderId) { const o=App.model.order(s.cOrderId); if (o && o.status!=='paid' && o.status!=='deleted') return o; }
    if (s.cTableId) { const t=App.model.table(s.cTableId); if (t && t.orderId) { const o=App.model.order(t.orderId); if (o && o.status!=='paid'&&o.status!=='deleted') return o; } }
    return null;
  }
  function tableCard(t) {
    const d=D(), o=t.orderId?App.model.order(t.orderId):null;
    const active=st().cTableId===t.id && (!o||o.status!=='paid');
    const si = o ? V.statusBadge(o.status) : (t.status==='reserved' ? '<span class="badge warn">رزرو</span>' : '<span class="badge ok">آزاد</span>');
    const occ=t.occupiedAt?U.duration(t.occupiedAt):'';
    const paid=o?App.model.paid(o):0, remaining=o?App.model.remaining(o):0;
    return '<button class="table-card mini pos-table-card '+(active?'selected':'')+' '+(o?'is-occupied':'is-free')+'" data-action="c-table" data-id="'+t.id+'">'+
      '<div class="t-top"><span class="t-name">'+U.esc(t.name)+'</span><span class="t-status">'+si+'</span></div>'+
      '<div class="t-meta">'+(o?'<span class="t-total num">'+M(App.model.totals(o).total)+'</span><span>فاکتور '+N(o.no)+'</span>':'<span>آزاد</span>')+
      (paid>0?'<span class="'+(remaining>0?'warn':'ok')+'">پرداخت '+M(paid)+' · مانده '+M(remaining)+'</span>':'')+
      (occ?'<span class="warn">'+I('clock','sm')+' '+occ+' · شروع '+U.time(t.occupiedAt)+'</span>':'')+'</div></button>';
  }
  function productCard(p) {
    const avail=App.domain.productAvailable(p), ss=App.domain.stockStatus(p);
    const g=App.model.group(p.groupId);
    return '<button class="product-card '+(avail?'':'off')+'" data-action="c-add" data-id="'+p.id+'" '+(avail?'':'disabled')+'>'+
      '<div class="row tight"><span class="dot" style="background:'+U.esc(g?g.color:'#888')+'"></span><span class="p-name">'+U.esc(p.name)+'</span></div>'+
      '<div class="tiny faint">'+U.esc(p.code||'')+'</div>'+
      '<div class="p-foot"><span class="p-price num">'+M(p.price)+'</span>'+
      '<span class="badge '+ss.cls+'">'+U.esc(ss.label)+'</span><span class="p-add">'+I(avail?'plus':'lock','sm')+'</span></div></button>';
  }
  function payDraft(o) {
    const p=stInit().cPay, d=D(), psps=App.pay.enabledPsps(), custs=App.pay.customers();
    const rem=App.model.remaining(o);
    let h='<div class="card-head"><h3>نحوه پرداخت</h3><span class="spacer"></span><span class="badge accent num">مانده '+M(rem)+'</span></div>';
    const methods=(d.paymentMethods||[]).filter(x=>x.enabled!==false).map(x=>({id:x.kind==='split'?'dongi':x.kind,label:x.name,icon:x.icon||({cash:'cash',card:'wallet',credit:'note',split:'split'}[x.kind]||'tag')}));
    h+='<div class="method-grid">'+methods.map(m=>'<button class="method-btn '+(p.method===m.id?'active':'')+'" data-action="c-method" data-method="'+U.esc(m.id)+'">'+I(m.icon)+U.esc(m.label)+'</button>').join('')+'</div>';
    h+='<div class="form-grid" style="margin-top:10px">';
    h+='<label class="field"><span>مبلغ پرداخت</span><input type="number" data-input="c-amount" value="'+(p.amount!=null?p.amount:rem)+'" min="1"></label>';
    if (p.method==='card') h+='<label class="field"><span>درگاه / کارتخوان</span><select data-input="c-psp">'+psps.map(x=>'<option value="'+x.id+'" '+(p.pspId===x.id?'selected':'')+'>'+U.esc(x.name)+'</option>').join('')+'</select></label>';
    else if (p.method==='credit') {
      const c=App.model.customer(p.customerId||o.customerId);
      h+='<label class="field"><span>مشتری اعتباری</span><select data-input="c-credit">'+custs.map(x=>'<option value="'+x.id+'" '+(x.id===(p.customerId||o.customerId)?'selected':'')+'>'+U.esc(App.club.fullName(x))+' · مجاز '+M(App.domain.creditAvailable(x))+'</option>').join('')+'</select></label>';
      h+='<div class="full tiny '+(c&&App.domain.creditAvailable(c)<rem?'danger':'muted')+'">اعتبار مجاز: <b class="num">'+M(c?App.domain.creditAvailable(c):0)+'</b> · مصرفشده: <b class="num">'+M(c?c.credit:0)+'</b></div>';
    } else if (p.method==='cash') h+='<label class="field"><span>مبلغ دریافتی (پول خرد)</span><input type="number" data-input="c-cash" value="'+U.esc(p.cashReceived||'')+'" placeholder="اختیاری"></label>';
    else h+='<label class="field"><span>تعداد نفرات دنگ</span><input type="number" data-input="c-heads" value="'+N(p.heads)+'" min="2" max="30"></label>'+
      '<label class="field"><span>روش پرداخت هر سهم</span><select data-input="c-dongi"><option value="cash" '+(p.dongiMethod==='cash'?'selected':'')+'>نقدی</option><option value="card" '+(p.dongiMethod==='card'?'selected':'')+'>کارتخوان</option><option value="credit" '+(p.dongiMethod==='credit'?'selected':'')+'>اعتباری</option></select></label>';
    h+='</div>';
    if ((o.payments||[]).length) {
      h+='<div class="divider"></div>'+(o.payments||[]).map(pay=>'<div class="list-row"><span class="lr-main"><span class="lr-title">'+U.esc(pay.label||pay.method)+(pay.status==='failed'?' <span class="badge danger">ناموفق</span>':'')+'</span><span class="lr-sub">'+U.time(pay.at)+' · '+U.esc(pay.byName||'')+(pay.ref?' · مرجع '+U.esc(pay.ref):'')+'</span></span><span class="num strong">'+M(pay.amount)+'</span>'+
        (App.auth.can('payment.refund')?'<button class="icon-btn plain danger" data-action="c-pay-del" data-id="'+pay.id+'">'+I('trash','sm')+'</button>':'')+'</div>').join('');
    }
    return h;
  }
  function orderPanel(o) {
    if (!o) return '<div class="card">'+head('سفارش','')+empty('یک میز را انتخاب کنید یا سفارش بیرونبر ایجاد نمایید.','grid')+'</div>';
    const t=App.model.totals(o), s=D().settings, eq=App.domain.discountEquivalent(o);
    const personnel=D().personnel.filter(x=>x.active!==false);
    let h='';
    h+='<div class="card"><div class="card-head"><h3>فاکتور '+N(o.no)+'</h3><span class="spacer"></span>'+V.statusBadge(o.status)+'</div>';
    h+='<div class="row tight" style="margin-bottom:8px">';
    ['حضوری','بیرون بر','Take Away'].forEach(x=>h+='<button class="chip '+(o.type===x?'active':'')+'" data-action="c-type" data-type="'+x+'">'+x+'</button>');
    h+='<span class="spacer"></span><span class="pill">'+I('clock','sm')+' '+U.duration(o.occupiedAt||o.createdAt)+'</span></div>';
    h+='<div class="row tight" style="margin-bottom:8px">'+
      '<button class="btn btn-sm" data-action="c-customer">'+I('user','sm')+' مشتری: '+(o.customer&&o.customer.name?U.esc(o.customer.name):'<span class="warn">ثبت نشده</span>')+'</button>'+
      '<select class="sel-sm" data-input="c-waiter" style="width:auto;min-width:130px">'+personnel.map(p=>'<option value="'+p.id+'" '+(o.personnelId===p.id?'selected':'')+'>'+U.esc(p.name)+'</option>').join('')+'</select>'+
      '<button class="btn btn-sm" data-action="c-notes">'+I('note','sm')+' یادداشت'+(o.notes?' ✓':'')+'</button></div>';
    if (o.notes) h+='<div class="tiny warn">'+U.esc(o.notes)+'</div>';
    h+='<div class="divider"></div><div class="cart-lines">';
    const lines=o.lines.filter(l=>!l.voided);
    if (!lines.length) h+=empty('هنوز کالایی انتخاب نشده است.','receipt');
    lines.forEach(l => {
      const lc=App.domain.lineCalc(l,s);
      h+='<div class="cart-line"><div class="cl-top"><span class="cl-name">'+U.esc(l.name)+'</span><span class="cl-price num">'+M(lc.gross)+'</span></div>'+
        (lc.discount?'<div class="cl-note">تخفیف ردیفی − '+M(lc.discount)+'</div>':'')+
        (l.note?'<div class="cl-note">↳ '+U.esc(l.note)+'</div>':'')+
        '<div class="row tight" style="margin-top:6px"><span class="qty"><button data-action="c-qty" data-line="'+l.id+'" data-delta="-1">'+I('minus','sm')+'</button><span>'+N(l.qty)+'</span><button data-action="c-qty" data-line="'+l.id+'" data-delta="1">'+I('plus','sm')+'</button></span>'+
        '<button class="icon-btn plain" data-action="c-line-discount" data-line="'+l.id+'">'+I('tag','sm')+'</button>'+
        '<button class="icon-btn plain" data-action="c-line-note" data-line="'+l.id+'">'+I('note','sm')+'</button>'+
        (App.auth.can('price.change')?'<button class="icon-btn plain" data-action="c-line-price" data-line="'+l.id+'">'+I('edit','sm')+'</button>':'')+
        '<span class="spacer"></span><button class="icon-btn plain danger" data-action="c-line-del" data-line="'+l.id+'">'+I('trash','sm')+'</button></div></div>';
    });
    h+='</div><div class="divider"></div><div class="totals">'+
      '<div class="t-row"><span>جمع اقلام</span><span class="num">'+M(t.gross)+'</span></div>'+
      (t.lineDiscount?'<div class="t-row"><span>تخفیف ردیفی</span><span class="num">− '+M(t.lineDiscount)+'</span></div>':'')+
      '<div class="t-row"><span>تخفیف فاکتور '+B('c-invoice-discount','','edit','btn-sm','',{})+' <b class="num">'+(eq.percent?N(eq.percent)+'٪':'')+'</b></span><span class="num">− '+M(t.discount)+'</span></div>'+
      '<div class="t-row"><span>مالیات ('+N(s.taxPercent)+'٪ · '+(s.taxPolicy==='item'?'کالا':'فاکتور')+')</span><span class="num">'+M(t.tax)+'</span></div>'+
      '<div class="t-row"><span>عوارض</span><span class="num">'+M(t.levy)+'</span></div>'+
      '<div class="t-row total"><span>قابل پرداخت</span><span class="num">'+M(t.total)+' <small>'+U.esc(s.currency)+'</small></span></div></div>';
    h+='</div>';
    return h;
  }

  function consoleView() {
    stInit();
    const s=st(), d=D(), o=currentOrder();
    const halls=d.halls.slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
    if (!s.cHallId || !halls.some(h=>h.id===s.cHallId)) s.cHallId=halls.length?halls[0].id:null;
    const tables=d.tables.filter(t=>t.hallId===s.cHallId);
    const groups=d.groups.filter(g=>g.active!==false).sort((a,b)=>(a.sort||0)-(b.sort||0));
    const gid=s.cGroupId&&s.cGroupId!=='all'?s.cGroupId:null;
    const q=(s.cSearch||'').trim();
    const products=d.products.filter(p=>(!gid||p.groupId===gid)&&(!q||p.name.indexOf(q)!==-1||(p.code||'').indexOf(q)!==-1));
    const occ=d.tables.filter(t=>t.status==='occupied').length;
    const canCustomer=App.auth.can('club.manage')||App.auth.can('payment.credit');

    let h='<div class="pos-console">';
    h+=head('کنسول فروش','ثبت سفارش، انتخاب میز و پرداخت در یک صفحه',
      B('c-new-takeaway','بیرونبر','plus','btn-outline btn-sm')+
      B('c-transfer','جابهجایی میز','refresh','btn-sm',{id:o?o.id:''})+
      B('nav','فاکتورها','receipt','btn-sm',{screen:'invoices'}));
    h+='<div class="console-grid pos-workspace">';
    // Compact action rail on the right, matching a dedicated POS terminal.
    h+='<aside class="pos-action-rail" aria-label="عملیات فاکتور">'+
      (App.auth.can('payment.settle')||App.auth.can('order.settlePrint')?'<button class="pos-rail-button pos-rail-pay" data-action="c-settle" '+(o?'':'disabled')+' title="پرداخت و تسویه فاکتور" aria-label="پرداخت و تسویه فاکتور">'+I('cash','lg')+'<span>پرداخت<br>فاکتور</span></button>':'')+
      (canCustomer?'<button class="pos-rail-button pos-rail-customer" data-action="c-customer" '+(o?'':'disabled')+' title="تخصیص مشتری به فاکتور برای پرداخت اعتباری" aria-label="تخصیص مشتری برای اعتبار">'+I('user-search','lg')+'<span>مشتری<br>اعتباری</span></button>':'')+
      '<button class="pos-rail-button pos-rail-invoices" data-action="nav" data-screen="invoices" title="فاکتورها" aria-label="فاکتورها">'+I('receipt','lg')+'<span>فاکتورها</span></button>'+
      '<div class="pos-rail-count"><span>'+I('grid','sm')+'</span><b>'+N(occ)+'</b><small>میز اشغال</small></div></aside>';

    // Tables and product selection share the central POS workspace.
    h+='<section class="pos-catalog">'+
      '<div class="card pos-tables-panel"><div class="pos-hall-toolbar"><div class="chips">'+halls.map(x=>'<button class="chip '+(x.id===s.cHallId?'active':'')+'" data-action="c-hall" data-id="'+x.id+'"><span class="dot" style="background:'+U.esc(x.color||'#f0a44b')+'"></span>'+U.esc(x.name)+' ('+N(d.tables.filter(t=>t.hallId===x.id).length)+')</button>').join('')+'</div><span class="pill">'+I('grid','sm')+' '+N(occ)+' میز اشغال</span></div>'+
      '<div class="table-grid compact pos-table-grid">'+tables.sort((a,b)=>(a.y-b.y)||(a.x-b.x)).map(tableCard).join('')+'</div>'+
      (tables.length?'':'<div class="tiny muted">برای سفارش، ابتدا از بخش اطلاعات پایه میز تعریف کنید.</div>')+'</div>'+
      '<div class="card pos-products"><div class="card-head"><h3>کالاها</h3><span class="spacer"></span><span class="tiny faint">'+N(products.length)+' کالا</span></div>'+
      '<div class="input-icon pos-search">'+I('search')+'<input type="text" data-input="c-search" placeholder="جستجوی نام یا کد کالا…" value="'+U.esc(s.cSearch||'')+'"></div>'+
      '<div class="chips pos-groups"><button class="chip '+(gid?'':'active')+'" data-action="c-group" data-id="all">همه</button>'+
      groups.map(g=>'<button class="chip '+(gid===g.id?'active':'')+'" data-action="c-group" data-id="'+g.id+'"><span class="dot" style="background:'+U.esc(g.color||'#888')+'"></span>'+U.esc(g.name)+'</button>').join('')+'</div>'+
      '<div class="product-grid pos-product-grid">'+products.map(productCard).join('')+'</div>'+(products.length?'':empty('کالایی یافت نشد.','book'))+'</div></section>';

    // Invoice lines and totals stay in a dedicated left-hand panel.
    h+='<section class="pos-order-column">'+orderPanel(o);
    if (o) {
      h+='<div class="card pos-order-actions"><div class="card-head"><h3>ثبت و چاپ</h3></div><div class="pos-order-action-buttons">'+
        (App.auth.can('order.save')?B('c-save','ذخیره','save','btn-sm'):'')+
        (App.auth.can('order.print')?B('c-print','چاپ سفارش','print','btn-sm'):'')+
        (App.auth.can('order.submit')?B('c-submit','ثبت سفارش','check','btn-outline btn-sm'):'')+
        (App.auth.can('order.print')?B('c-preview','پیش‌نمایش','receipt','btn-sm'):'')+
        (App.auth.can('order.void')?B('c-void','لغو','trash','btn-sm btn-danger'):'')+
        '</div><label class="check-line" style="margin-top:8px"><input type="checkbox" data-input="c-takeaway" '+(s.cTakeaway?'checked':'')+'> ثبت به‌عنوان سفارش Take Away</label></div>';
      h+='<div class="card pos-pay-panel">'+payDraft(o)+'</div>';
    }
    h+='</section></div></div>';
    return h;
  }

  /* ------------------------------- actions ------------------------------- */
  function withOrder(fn) { const o=currentOrder(); if (!o) { App.ui.toast('ابتدا یک میز یا سفارش بیرونبر انتخاب کنید.','err'); return; } return fn(o); }
  function refresh() { App.ui.refresh(); }
  Object.assign(App.actions, {
    'c-hall': el => { st().cHallId=el.dataset.id; st().cTableId=null; st().cOrderId=null; App.ui.render(); },
    'c-group': el => { st().cGroupId=el.dataset.id; App.ui.render(); },
    'c-table': el => withOrderTap(el.dataset.id),
    'c-new-takeaway': () => {
      if (!App.auth.can('order.create')) return App.ui.toast('دسترسی ثبت سفارش ندارید.','err');
      const o=App.model.createOrder(null,'بیرون بر');
      st().cTableId=null; st().cOrderId=o.id; st().cTakeaway=true; App.ui.render();
    },
    'c-add': el => withOrder(o => {
      if(!App.auth.can('order.edit')) return App.ui.toast('دسترسی ویرایش سفارش ندارید.','err');
      const p=App.model.product(el.dataset.id);
      if (!App.domain.productAvailable(p)) return App.ui.toast('این کالا ناموجود است و بهصورت خودکار قفل شده است.','err');
      App.model.addLine(o,el.dataset.id); refresh();
    }),
    'c-qty': el => withOrder(o => {
      if(!App.auth.can('order.edit')) return App.ui.toast('دسترسی ویرایش اقلام سفارش ندارید.','err');
      const l=o.lines.find(x=>x.id===el.dataset.line); if(!l) return;
      App.store.commit(()=>{ l.qty+=Number(el.dataset.delta); if(l.qty<=0) l.voided=true; l.sent={}; l.sentQty=0; o.updatedAt=Date.now(); },'order.edit','تغییر تعداد');
      refresh();
    }),
    'c-line-del': el => withOrder(o => {
      if(!App.auth.can('order.void')) return App.ui.toast('دسترسی حذف قلم سفارش ندارید.','err');
      App.ui.confirm('این قلم حذف شود؟ پیام ابطال به ایستگاههای مربوطه ارسال خواهد شد.', () => {
        App.store.commit(()=>{ const l=o.lines.find(x=>x.id===el.dataset.line); if(l)l.voided=true; o.updatedAt=Date.now(); },'order.void','حذف قلم');
        App.print.printKitchen(o,{reprint:true,notice:'ابطال قلم سفارش'}).catch(()=>{});
        refresh();
      });
    }),
    'c-line-note': el => withOrder(o => {
      if(!App.auth.can('order.edit')) return App.ui.toast('دسترسی ویرایش سفارش ندارید.','err');
      const l=o.lines.find(x=>x.id===el.dataset.line); if(!l)return;
      App.ui.form({title:'توضیحات '+l.name,fields:[{name:'note',label:'توضیح آشپزخانه',type:'textarea',value:l.note||''}],
        onSubmit:v=>{ App.store.commit(()=>{l.note=v.note;o.updatedAt=Date.now();},'order.edit','توضیح قلم'); refresh(); }});
    }),
    'c-line-price': el => withOrder(o => {
      if(!App.auth.can('price.change')) return App.ui.toast('دسترسی تغییر قیمت ندارید.','err');
      const l=o.lines.find(x=>x.id===el.dataset.line); if(!l)return;
      App.ui.form({title:'تغییر قیمت '+l.name,fields:[{name:'price',label:'قیمت واحد',type:'number',value:l.price,min:0}],
        onSubmit:v=>{ const before=l.price; App.store.commit(()=>{l.price=Math.max(0,Number(v.price)||0);o.updatedAt=Date.now();},'price.change','تغییر قیمت '+l.name,
          {before:{price:before},after:{price:l.price},entityType:'line',entityId:l.id}); refresh(); }});
    }),
    'c-line-discount': el => withOrder(o => {
      const l=o.lines.find(x=>x.id===el.dataset.line); if(!l)return;
      App.ui.form({title:'تخفیف ردیفی · '+l.name,
        note:'<div class="tiny muted" style="margin-bottom:8px">معادل خودکار: درصد و مبلغ محاسبه میشود. سقف مجاز سطح دسترسی اعمال خواهد شد.</div>',
        fields:[{name:'type',label:'نوع',type:'select',options:[{value:'percent',label:'درصدی'},{value:'amount',label:'مبلغ ثابت'}],value:l.discount.type},
                {name:'value',label:'مقدار',type:'number',value:l.discount.value,min:0}],
        onSubmit:v=>{
          const test=Object.assign({},o,{ lines:o.lines.map(x=>x.id===l.id?Object.assign({},x,{discount:{type:v.type,value:Number(v.value)||0}}):x) });
          const chk=App.domain.discountAllowed(test,null,'discount.line',o);
          if(!chk.ok) return App.ui.toast(chk.error,'err');
          App.store.commit(()=>{l.discount={type:v.type,value:Number(v.value)||0};o.updatedAt=Date.now();},'discount.line','تخفیف ردیفی '+l.name);
          refresh();
        }});
    }),
    'c-invoice-discount': () => withOrder(o => {
      App.ui.form({title:'تخفیف کل فاکتور',
        note:'<div class="tiny muted" style="margin-bottom:8px">محاسبه درصد خودکار: مبلغ واردشده معادل '+U.num(App.domain.discountEquivalent(o).percent)+'٪ از جمع اقلام است. سقف مجاز: '+U.num(App.auth.maxDiscount().percent)+'٪</div>',
        fields:[{name:'type',label:'نوع',type:'select',options:[{value:'percent',label:'درصدی'},{value:'amount',label:'مبلغ ثابت (ریالی)'}],value:o.discount.type},
                {name:'value',label:'مقدار',type:'number',value:o.discount.value,min:0}],
        onSubmit:v=>{
          const patch={type:v.type,value:Number(v.value)||0}, chk=App.domain.discountAllowed(o,patch,'discount.invoice');
          if(!chk.ok) return App.ui.toast(chk.error,'err');
          App.store.commit(()=>{o.discount=patch;o.updatedAt=Date.now();},'discount.invoice','تخفیف فاکتور '+chk.percent+'٪',
            {before:null,after:U.clone(patch),entityType:'order',entityId:o.id});
          refresh();
        }});
    }),
    'c-type': el => withOrder(o => { if(!App.auth.can('order.edit'))return App.ui.toast('دسترسی ویرایش سفارش ندارید.','err');App.store.commit(()=>{o.type=el.dataset.type;},'order.edit','نوع سفارش'); refresh(); }),
    'c-customer': () => withOrder(o => (App.auth.can('club.manage')||App.auth.can('payment.credit'))?clubPicker(o):App.ui.toast('دسترسی تخصیص مشتری ندارید.','err')),
    'c-club': () => withOrder(o => (App.auth.can('club.manage')||App.auth.can('payment.credit'))?clubPicker(o):App.ui.toast('دسترسی تخصیص مشتری ندارید.','err')),
    'c-notes': () => withOrder(o => {if(!App.auth.can('order.edit'))return App.ui.toast('دسترسی ویرایش سفارش ندارید.','err');return App.ui.form({title:'یادداشت سفارش',fields:[{name:'notes',label:'توضیحات',type:'textarea',value:o.notes||''}],
      onSubmit:v=>{App.store.commit(()=>{o.notes=v.notes;},'order.edit','یادداشت سفارش');refresh();}}); }),
    'c-method': el => { stInit().cPay.method=el.dataset.method; stInit().cPay.amount=null; stInit().cPay.methodPicked=true; refresh(); },
    'c-pay-del': el => withOrder(o => { if(!App.auth.can('payment.refund'))return App.ui.toast('دسترسی اصلاح پرداخت ندارید.','err');App.pay.removePayment(o,el.dataset.id); refresh(); }),
    'c-save': () => withOrder(o => {
      if(!App.auth.can('order.save')) return App.ui.toast('دسترسی ذخیره سفارش ندارید.','err');
      const v=App.club.validateOrder(o); if(!v.ok&&o.status!=='draft') return App.ui.toast(v.error,'err');
      App.store.commit(()=>{o.updatedAt=Date.now();if(o.status==='draft')o.status='draft';},'order.save','ذخیره پیشنویس بدون چاپ فاکتور '+U.num(o.no));
      App.store.saveNow(); App.ui.toast('تغییرات ذخیره شد. هیچ دستور چاپی ارسال نشد.','ok'); refresh();
    }),
    'c-print': () => withOrder(async o => {
      if(!App.auth.can('order.print')) return App.ui.toast('دسترسی چاپ سفارش ندارید.','err');
      const rs=await App.print.printCustomerReceipt(o,{includeKitchen:true});
      const ok=rs.filter(r=>r.ok).length;
      App.ui.toast('چاپ سفارش: '+U.num(ok)+' چاپگر پاسخ دادند. فاکتور تسویه نشد و میز آزاد نشد.',ok?'ok':'err');
      rs.filter(r=>!r.ok).forEach(r=>App.ui.toast(r.error||'خطای چاپ','err'));
      refresh();
    }),
    'c-submit': () => withOrder(async o => {
      if(!App.auth.can('order.submit')) return App.ui.toast('دسترسی ثبت سفارش ندارید.','err');
      const v=App.club.validateOrder(o); if(!v.ok) return App.ui.toast(v.error,'err');
      const r=App.domain.submit(o);
      if(!r.ok) return App.ui.toast(r.error,'err');
      const res=await App.print.printKitchen(o);
      App.ui.toast(r.duplicate?'این سفارش قبلاً ثبت شده است (جلوگیری از ثبت تکراری).':'سفارش ثبت و اقلام به '+U.num(res.filter(x=>x.ok).length)+' ایستگاه ارسال شد. میز همچنان اشغال است.',r.duplicate?'err':'ok');
      res.filter(x=>!x.ok).forEach(x=>App.ui.toast(x.error,'err'));
      refresh();
    }),
    'c-settle': () => withOrder(o => {
      if(!App.auth.can('payment.settle')&&!App.auth.can('order.settlePrint')) return App.ui.toast('دسترسی تسویه ندارید.','err');
      const p=stInit().cPay;
      if(!p.methodPicked){
        const choices=(D().paymentMethods||[]).filter(x=>x.enabled!==false).map(m=>({
          label:m.name,icon:m.icon||({cash:'cash',card:'wallet',credit:'note',split:'split'}[m.kind]||'tag'),
          onClick:()=>chooseSettleMethod(m.kind==='split'?'dongi':m.kind)
        }));
        choices.push({label:'انصراف',close:true});
        App.ui.modal({title:'انتخاب روش پرداخت',body:'<p>پیش از تسویه، روش پرداخت فاکتور را انتخاب کنید. مبلغ و مشخصات تکمیلی را در پنل پرداخت بررسی نمایید.</p>',buttons:choices});
        return;
      }
      return settleAndPrint(o);
    }),
    'c-transfer': () => withOrder(o => {
      const free=D().tables.filter(t=>t.status==='free'||t.id===o.tableId);
      App.ui.form({title:'جابهجایی سفارش '+N(o.no),fields:[
        {name:'tableId',label:'میز مقصد',type:'select',options:free.map(t=>({value:t.id,label:App.model.tableLabel(t.id)})),value:o.tableId},
        {name:'reason',label:'دلیل انتقال',type:'text',value:''}],
        onSubmit:v=>{
          const r=App.domain.transfer(o,v.tableId,v.reason);
          if(!r.ok) return App.ui.toast(r.error,'err');
          App.print.broadcast('انتقال میز',o,'سفارش از '+r.transfer.fromLabel+' به '+r.transfer.toLabel+' منتقل شد').catch(()=>{});
          st().cTableId=v.tableId; App.ui.toast('سفارش منتقل شد و گزارش ثبت گردید.','ok'); App.ui.render();
        }});
    }),
    'c-preview': () => withOrder(o => {
      const inv=Object.assign({},o,{paidAt:null,tableLabel:(App.model.table(o.tableId)||{}).name||'—',
        hallLabel:(App.model.hall(o.hallId)||{}).name||'—',waiterName:o.createdByName,
        personnelName:(App.model.personnel(o.personnelId)||{}).name||'',settledByName:'—',
        subtotal:App.model.totals(o).gross,lineDiscount:App.model.totals(o).lineDiscount,
        discount:App.model.totals(o).discount,tax:App.model.totals(o).tax,levy:App.model.totals(o).levy,total:App.model.totals(o).total});
      const w=Number(D().settings.invoiceWidth)||80, html=App.print.receiptHtml(inv,w);
      App.ui.modal({title:'پیشنمایش فاکتور '+N(o.no),size:'wide',body:V.paper(html,w),buttons:[
        {label:'چاپ مرورگر',icon:'print',cls:'btn-primary',onClick:()=>App.print.browserPrint(html,w)},{label:'بستن',close:true}]});
    }),
    'c-void': () => withOrder(o => {if(!App.auth.can('order.void'))return App.ui.toast('دسترسی لغو سفارش ندارید.','err');return App.ui.confirm('سفارش '+N(o.no)+' لغو شود؟ پیام ابطال به تمام چاپگرها ارسال میشود.',()=>{
      App.store.commit(d=>{ const t=d.tables.find(x=>x.id===o.tableId); if(t){t.status='free';t.orderId=null;t.occupiedAt=null;} o.status='void'; },'order.void','لغو سفارش '+N(o.no));
      App.domain.restoreStock(o); App.print.broadcast('ابطال سفارش',o,'سفارش لغو شد').catch(()=>{});
      st().cOrderId=null; st().cTableId=null; App.ui.render();
    }); }),
  });
  function withOrderTap(id) {
    const t=App.model.table(id); if(!t)return;
    if(t.status==='reserved') return App.ui.toast('این میز رزرو شده است.','err');
    let o=t.orderId?App.model.order(t.orderId):null;
    if(!o||o.status==='paid'||o.status==='deleted'){
      if(!App.auth.can('order.create')) return App.ui.toast('دسترسی ثبت سفارش ندارید.','err');
      o=App.model.createOrder(t.id,'حضوری');
    }
    st().cTableId=t.id; st().cOrderId=o.id; st().cTakeaway=false;
    // Club: welcome message once a customer code is attached later.
    App.ui.render();
  }
  function clubPicker(o) {
    const c=App.club.cfg();
    App.ui.form({title:'مشتری و باشگاه مشتریان',
      note:'<div class="tiny muted" style="margin-bottom:8px">ثبت شماره مشتری هنگام انتخاب میز: '+(App.club.requiresCustomer()?'<b class="warn">اجباری</b>':'اختیاری')+'. پس از ثبت، پیام خوشآمدگویی ارسال میشود.</div>',
      fields:[
        {name:'code',label:'کد / شماره مشتری (جستجو)',type:'text',value:(o.customer&&o.customer.code)||''},
        {name:'firstName',label:'نام (مشتری جدید)',type:'text'},
        {name:'lastName',label:'نام خانوادگی',type:'text'},
        {name:'phone',label:'شماره موبایل',type:'tel',value:(o.customer&&o.customer.phone)||''},
        {name:'creditLimit',label:'سقف اعتبار مجاز (تومان)',type:'number',value:0,min:0},
        {name:'consent',label:'رضایت دریافت پیام',type:'checkbox',value:true}
      ], submit:'ثبت مشتری و ارسال خوشآمد',
      onSubmit:v=>{
        const r=App.club.attachCustomer(o,v);
        if(!r.ok) return App.ui.toast(r.error,'err');
        App.ui.toast('مشتری «'+App.club.fullName(r.customer)+'» ثبت شد. پیام خوشآمد ارسال شد ('+(r.welcome.channel||'')+').','ok');
        refresh();
      }});
  }
  function chooseSettleMethod(method) {
    App.ui.close();
    const p=stInit().cPay; p.method=method; p.methodPicked=true; p.amount=null;
    refresh();
    App.ui.toast('روش «'+methodName(method)+'» انتخاب شد؛ جزئیات پرداخت را بررسی و دوباره «ثبت و چاپ نهایی» را بزنید.','ok');
  }
  async function settleAndPrint(o) {
    const s=stInit(), v=App.club.validateOrder(o); if(!v.ok) return App.ui.toast(v.error,'err');
    const inventory=App.domain.stockCheck(o);if(!inventory.ok)return App.ui.toast(inventory.error+' پرداخت انجام نشد و میز آزاد نخواهد شد.','err');
    const t=App.model.totals(o), rem=Math.max(0,t.total-App.model.paid(o)), p=s.cPay;
    if (rem>0) {
      if (p.method==='dongi') {
        App.pay.setSplit(o,{mode:'equal',heads:Math.max(2,Number(p.heads)||2)});
        const shares=App.pay.shares(o,o.split);
        for (const sh of shares) {
          const res=await makePayment(o,sh.amount,{method:p.dongiMethod,label:sh.label+' · '+methodName(p.dongiMethod)},sh.id);
          if(!res.ok) return App.ui.toast(res.error,'err');
        }
      } else {
        const res=await makePayment(o,rem,{method:p.method==='dongi'?'cash':p.method,label:methodName(p.method)},'single');
        if(!res.ok) return App.ui.toast(res.error,'err');
      }
    }
    if(s.cTakeaway) App.store.commit(()=>{o.type='Take Away';},'order.edit','تعیین نوع Take Away');
    const r=App.domain.settle(o);
    if(!r.ok) return App.ui.toast(r.error,'err');
    const inv=r.invoice;
    const pr=await App.print.printInvoice(inv,Number(D().settings.invoiceWidth)||80,{});
    if(!pr.ok) App.ui.toast('فاکتور تسویه شد ولی چاپ ناموفق بود: '+(pr.error||''),'err');
    const club=App.club.sendInvoice(inv);
    s.cOrderId=null; s.cTableId=null; s.cPay.amount=null; s.cPay.methodPicked=false;
    App.ui.render();
    App.ui.toast('فاکتور '+N(inv.no)+' تسویه و چاپ شد؛ میز آزاد گردید.' + (club.ok?' لینک فاکتور برای مشتری ارسال شد.':''),'ok');
    if(!club.ok&&club.error) App.ui.toast(club.error,'err');
  }
  async function makePayment(o,amount,opt,slotId) {
    const p=stInit().cPay;
    const extra={method:opt.method,amount,label:opt.label,slotId,cashReceived:Number(p.cashReceived)||0};
    if(opt.method==='card'){
      const psps=App.pay.enabledPsps(), psp=psps.find(x=>x.id===p.pspId)||psps[0];
      if(!psp) return {ok:false,error:'هیچ درگاه PSP فعالی تنظیم نشده است'};
      App.ui.toast('در انتظار پاسخ کارتخوان…');
      const res=await App.pay.pspPay(psp,amount,o.no);
      if(!res.ok){
        App.pay.addPayment(o,Object.assign({},extra,{status:'failed',ref:res.ref,pspName:psp.name,pspId:psp.id,terminalId:psp.terminalId||'',
          trace:res.trace,pan:res.pan}));
        return {ok:false,error:'تراکنش ناموفق: '+res.message+' (میز آزاد نشد)'};
      }
      Object.assign(extra,{pspId:psp.id,pspName:psp.name,terminalId:psp.terminalId||'',merchantId:psp.merchantId||'',
        ref:res.ref,trace:res.trace,pan:res.pan,label:opt.label+' · '+psp.name,status:'success'});
    } else if(opt.method==='credit'){
      const cid=p.customerId||o.customerId, c=App.model.customer(cid);
      Object.assign(extra,{customerId:cid,customerName:c?App.club.fullName(c):'',label:opt.label});
    }
    return App.pay.addPayment(o,extra);
  }
  Object.assign(App.inputs, {
    'c-search': el => {
      st().cSearch=el.value;
      const grid=document.querySelector('#view .product-grid'); if(!grid)return;
      const d=D(), s=st(), q=el.value.trim(), gid=s.cGroupId&&s.cGroupId!=='all'?s.cGroupId:null;
      const list=d.products.filter(p=>(!gid||p.groupId===gid)&&(!q||p.name.indexOf(q)!==-1||(p.code||'').indexOf(q)!==-1));
      grid.innerHTML=list.length?list.map(productCard).join(''):empty('کالایی یافت نشد.','book');
    },
    'c-waiter': el => withOrder(o=>{ App.store.commit(()=>{o.personnelId=el.value;},'order.edit','تغییر سفارشگیر'); }),
    'c-amount': el => { stInit().cPay.amount=el.value; },
    'c-psp': el => { stInit().cPay.pspId=el.value; },
    'c-credit': el => { stInit().cPay.customerId=el.value; },
    'c-cash': el => { stInit().cPay.cashReceived=el.value; },
    'c-heads': el => { stInit().cPay.heads=Number(el.value)||2; },
    'c-dongi': el => { stInit().cPay.dongiMethod=el.value; },
    'c-takeaway': el => { stInit().cTakeaway=el.checked; }
  });
  App.views.console = consoleView;
  // Shared by the invoice screen so settlement logic has a single implementation.
  App.settleFlow = { settleAndPrint, makePayment, currentOrder, stInit };
})();
