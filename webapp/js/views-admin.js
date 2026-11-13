/* Hooshyar POS v2 — information base, security and configuration. */
'use strict';
window.App=window.App||{}; App.actions=App.actions||{}; App.inputs=App.inputs||{};
(function(){
  const U=App.util, D=()=>App.model.D(), V=App.views, N=U.num;
  const TABS=[
    ['products','کالا و موجودی','menu.manage','products'],['groups','گروه کالا','menu.manage','groups'],
    ['halls','سالن‌ها','tables.manage','halls'],['tables','میزها','tables.manage','tables'],
    ['stations','ایستگاه‌های چاپ','printers.manage','stations'],['printers','چاپگرها','printers.manage','printers'],
    ['users','کاربران','users.manage','users'],['cashRegisters','صندوق‌های نقدی','settings.manage','cashRegisters'],['roles','سطوح دسترسی','roles.manage','roles'],
    ['personnel','پرسنل و پورسانت','users.manage','personnel'],['customers','مشتریان','customers.manage','customers'],
    ['payments','روش‌های پرداخت','settings.manage','paymentMethods'],['psps','درگاه‌های کارتخوان','psp.manage','psps']
  ];
  const schemas={
    products:{title:'کالا',perm:'menu.manage',fields:[['name','نام کالا','text',1],['code','کد کالا','text'],['groupId','گروه','select','groups'],['price','قیمت (ریال)','number'],['stock','موجودی','number'],['stockReason','دلیل اصلاح موجودی','text'],['minStock','حداقل موجودی','number'],['trackStock','کنترل موجودی','checkbox'],['stationIds','ایستگاه چاپ اختصاصی','multi','stations'],['taxPercent','مالیات ٪','number'],['levyPercent','عوارض ٪','number'],['commissionPercent','پورسانت ٪','number'],['description','شرح','textarea'],['active','فعال','checkbox']]},
    groups:{title:'گروه کالا',perm:'menu.manage',fields:[['name','نام گروه','text',1],['color','رنگ','text'],['stationIds','ایستگاه‌های چاپ','multi','stations'],['copies','تعداد چاپ','number'],['commissionPercent','پورسانت ٪','number'],['active','فعال','checkbox']]},
    halls:{title:'سالن',perm:'tables.manage',fields:[['name','نام سالن','text',1],['color','رنگ','text'],['sort','ترتیب','number']]},
    tables:{title:'میز',perm:'tables.manage',fields:[['name','نام میز','text',1],['hallId','سالن','select','halls'],['capacity','ظرفیت','number'],['x','موقعیت افقی','number'],['y','موقعیت عمودی','number']]},
    stations:{title:'ایستگاه چاپ',perm:'printers.manage',fields:[['name','نام ایستگاه','text',1],['printerId','چاپگر','select','printers'],['copies','تعداد نسخه','number'],['enabled','فعال','checkbox']]},
    printers:{title:'چاپگر',perm:'printers.manage',fields:[['name','نام چاپگر','text',1],['usage','کاربری','select',[['invoice','فاکتور'],['kitchen','آشپزخانه'],['both','هر دو']]],['kind','نوع اتصال','select',[['network','شبکه'],['usb','USB'],['bluetooth','Bluetooth']]],['ip','IP','text'],['port','درگاه','number'],['mac','MAC بلوتوث','text'],['width','عرض کاغذ','select',[['58','۵۸ میلی‌متر'],['80','۸۰ میلی‌متر']]],['copies','تعداد نسخه','number'],['enabled','فعال','checkbox'],['cut','برش کاغذ','checkbox'],['drawer','کشوی پول','checkbox']]},
    users:{title:'کاربر',perm:'users.manage',fields:[['name','نام نمایشی','text',1],['username','نام کاربری','text',1],['role','نقش پیش‌فرض','select',[['admin','مدیر کل'],['manager','مدیر سالن'],['cashier','صندوقدار'],['waiter','سفارشگیر'],['kitchen','آشپزخانه']]],['roleIds','سطوح دسترسی افزوده','multi','roles'],['pspId','کارتخوان / PSP تخصیص‌یافته','select','psps'],['cashRegisterId','صندوق نقدی تخصیص‌یافته','select','cashRegisters'],['maxDiscountPercent','سقف تخفیف ٪','number'],['active','فعال','checkbox'],['password','رمز عبور (برای کاربر جدید الزامی)','password']]},
    cashRegisters:{title:'صندوق نقدی',perm:'settings.manage',fields:[['name','نام صندوق','text',1],['code','کد صندوق','text'],['enabled','فعال','checkbox']]},
    roles:{title:'سطح دسترسی',perm:'roles.manage',fields:[['name','عنوان سطح','text',1],['permissions','مجوزها','multi','permissions'],['maxDiscountPercent','سقف تخفیف ٪','number'],['maxDiscountAmount','سقف مبلغ تخفیف','number']]},
    personnel:{title:'پرسنل',perm:'users.manage',fields:[['code','کد پرسنلی','text'],['name','نام کامل','text',1],['phone','تلفن','text'],['userId','حساب کاربری','select','users'],['commissionPercent','پورسانت ٪','number'],['active','فعال','checkbox']]},
    customers:{title:'مشتری',perm:'customers.manage',fields:[['code','کد مشتری','text'],['firstName','نام','text',1],['lastName','نام خانوادگی','text'],['phone','تلفن همراه','text'],['creditLimit','سقف اعتبار','number'],['consent','رضایت پیام‌رسانی','checkbox']]},
    paymentMethods:{title:'روش پرداخت',perm:'settings.manage',fields:[['name','عنوان روش','text',1],['kind','نوع','select',[['cash','نقدی'],['card','کارتخوان'],['credit','اعتباری'],['split','دنگی'],['other','سایر']]],['enabled','فعال','checkbox']]},
    psps:{title:'کارتخوان / PSP',perm:'psp.manage',fields:[['name','نام PSP','text',1],['packageName','نام بسته اندروید','text'],['action','نام Action','text'],['terminalId','شناسه پایانه','text'],['merchantId','شناسه پذیرنده','text'],['enabled','فعال','checkbox'],['note','یادداشت','textarea']]}
  };
  const labels={products:['نام','کد','گروه','قیمت','موجودی','حداقل','وضعیت'],groups:['گروه کالا','اقلام','ایستگاه‌ها','فعال'],halls:['نام سالن','میزها','رنگ'],tables:['میز','سالن','ظرفیت','وضعیت'],stations:['ایستگاه','چاپگر','نسخه','وضعیت'],printers:['چاپگر','اتصال','کاربری','عرض','وضعیت'],users:['نام','شناسه ورود','نقش','سطوح دسترسی','تخصیص پرداخت','وضعیت'],cashRegisters:['نام صندوق','کد صندوق','وضعیت'],roles:['سطح دسترسی','تعداد مجوز','سقف تخفیف','نوع'],personnel:['نام','کد','تلفن','پورسانت','حساب'],customers:['مشتری','کد','تلفن','اعتبار','رضایت'],paymentMethods:['روش پرداخت','نوع','وضعیت'],psps:['درگاه','پکیج','پایانه','وضعیت']};
  function recordText(kind,x){ const d=D(); switch(kind){case'products':return [x.name,x.code,(d.groups.find(g=>g.id===x.groupId)||{}).name||'',N(x.price),N(x.stock),N(x.minStock),x.active?'فعال':'غیرفعال'];case'groups':return [x.name,(d.products.filter(p=>p.groupId===x.id).length), (x.stationIds||[]).map(id=>(d.stations.find(s=>s.id===id)||{}).name||id).join('، ')||'—',x.active?'فعال':'غیرفعال'];case'halls':return [x.name,d.tables.filter(t=>t.hallId===x.id).length,x.color||''];case'tables':return [x.name,(d.halls.find(h=>h.id===x.hallId)||{}).name||'—',N(x.capacity),x.status==='occupied'?'اشغال':'آزاد'];case'stations':return [x.name,(d.printers.find(p=>p.id===x.printerId)||{}).name||'—',N(x.copies),x.enabled?'فعال':'غیرفعال'];case'printers':return [x.name,x.kind==='network'?(x.ip+':'+x.port):x.kind,x.usage,N(x.width)+'mm',x.enabled?'فعال':'غیرفعال'];case'users':return [x.name,x.username,App.auth.roleLabel(x),(x.roleIds||[]).length+' سطح',[(d.psps.find(p=>p.id===x.pspId)||{}).name,(d.cashRegisters.find(r=>r.id===x.cashRegisterId)||{}).name].filter(Boolean).join(' · ')||'—',x.active?'فعال':'غیرفعال'];case'cashRegisters':return [x.name,x.code||'—',x.enabled?'فعال':'غیرفعال'];case'roles':return [x.name,(x.permissions||[]).length,N(x.maxDiscountPercent)+'٪',x.builtin?'پیش‌فرض':'سفارشی'];case'personnel':return [x.name,x.code||'—',x.phone||'—',N(x.commissionPercent)+'٪',(d.users.find(u=>u.id===x.userId)||{}).name||'—'];case'customers':return [[x.firstName,x.lastName].filter(Boolean).join(' '),x.code||'—',x.phone||'—',N(x.credit)+' / '+N(x.creditLimit),x.consent?'دارد':'ندارد'];case'paymentMethods':return [x.name,x.kind,x.enabled?'فعال':'غیرفعال'];case'psps':return [x.name,x.packageName||'—',x.terminalId||'—',x.enabled?'فعال':'غیرفعال'];default:return[];} }
  function optionsFor(src){const d=D(); if(src==='permissions')return App.PERMISSIONS.map(p=>({value:p.key,label:p.group+' · '+p.label}));return (d[src]||[]).map(x=>({value:x.id,label:x.name||x.username||x.id}));}
  function fieldsFor(kind,obj){return schemas[kind].fields.map(([name,label,type,arg])=>{let value=obj?obj[name]:undefined, typeOut=type, options;
    if(type==='select'){if(Array.isArray(arg)) options=arg.map(x=>({value:x[0],label:x[1]}));else options=optionsFor(arg);}
    if(type==='multi')options=optionsFor(arg);
    if(name==='password'&&obj){return {name,label:'رمز عبور جدید (اختیاری)',type:'password'};}
    if(name==='stock'&&obj)value=obj.stock;
    if(value==null&&!obj&&type==='checkbox') value=['active','enabled','trackStock','cut'].includes(name);
    return {name,label,type:typeOut,value,options,required:!!arg&&type!=='select'&&type!=='multi',full:type==='textarea'||type==='multi'};
  });}
  function entityForm(kind,obj){const sc=schemas[kind]; if(!App.auth.can(sc.perm))return App.ui.toast('دسترسی کافی نیست.','err');
    App.ui.form({title:(obj?'ویرایش ':'افزودن ')+sc.title,fields:fieldsFor(kind,obj),submit:'ذخیره اطلاعات',onSubmit:v=>{
      if(kind==='users'&&!obj&&!v.password)return App.ui.toast('رمز عبور الزامی است.','err');
      const id=obj?obj.id:U.uid(kind.slice(0,-1)); const item=obj?U.clone(obj):{id};
      Object.keys(v).forEach(k=>{if(k==='password'||k==='stock'||k==='stockReason')return; if(['active','enabled','trackStock','cut','drawer','consent'].includes(k))item[k]=!!v[k];else if(['price','stock','minStock','capacity','x','y','copies','width','port','taxPercent','levyPercent','commissionPercent','maxDiscountPercent','maxDiscountAmount','creditLimit','sort'].includes(k))item[k]=Number(v[k])||0;else item[k]=v[k];});
      if(kind==='products'){item.discount=item.discount||{type:'amount',value:0};item.stationIds=item.stationIds||[];item.stock=Number(v.stock)||0;item.initialStock=item.stock;item.trackStock=v.trackStock!==false;}
      if(kind==='users'){if(v.password) item.passHash=App.auth.hash(v.password);item.permissions=item.permissions||[];item.roleIds=item.roleIds||[];}
      if(kind==='roles'){item.builtin=!!(obj&&obj.builtin);}
      if(kind==='customers'){item.credit=Number(item.credit)||0;item.purchaseCount=item.purchaseCount||0;item.purchaseTotal=item.purchaseTotal||0;}
      if(kind==='tables'){item.status=item.status||'free';item.orderId=item.orderId||null;}
      if(kind==='printers'){item.port=item.port||9100;item.copies=item.copies||1;item.kind=item.kind||'network';}
      App.store.commit(d=>{const arr=d[kind],at=arr.findIndex(x=>x.id===id);if(at<0)arr.push(item);else arr[at]=item;
        if(kind==='products'&&obj&&Number(obj.stock)!==Number(item.stock)){const a=App.auth.actor();d.stockMoves=d.stockMoves||[];d.stockMoves.unshift({id:U.uid('sm'),at:Date.now(),productId:id,productName:item.name,delta:Number(item.stock)-Number(obj.stock),before:Number(obj.stock)||0,after:Number(item.stock)||0,kind:'manual-adjustment',reason:v.stockReason||'',by:a.id,byName:a.name});if(d.stockMoves.length>2000)d.stockMoves.length=2000;}
      },sc.perm,(obj?'ویرایش ':'افزودن ')+sc.title+' «'+(item.name||item.username||'')+'»',{entityType:kind,entityId:id});
      App.ui.state.baseTab=kind;App.ui.render();App.ui.toast('اطلاعات ذخیره شد.','ok');
    }});
  }
  function hallForm(hall){
    if(!App.auth.can('tables.manage'))return App.ui.toast('دسترسی مدیریت سالن ندارید.','err');
    App.ui.form({title:hall?'ویرایش سالن':'ساخت سالن جدید',submit:hall?'ذخیره تغییرات':'ایجاد سالن',fields:[
      {name:'name',label:'نام سالن (مثلاً آلاچیق)',type:'text',required:true,value:hall?hall.name:''},
      {name:'color',label:'رنگ سالن',type:'color',value:hall?hall.color:'#f0a44b'}
    ],onSubmit:v=>{
      const name=String(v.name||'').trim();if(!name)return App.ui.toast('نام سالن را وارد کنید.','err');
      const id=hall?hall.id:U.uid('hall');
      App.store.commit(d=>{
        let item=d.halls.find(x=>x.id===id);
        if(!item){item={id,sort:d.halls.length+1};d.halls.push(item);}
        const oldName=item.name;item.name=name;item.color=v.color||'#f0a44b';
        if(oldName&&oldName!==name)d.tables.filter(t=>t.hallId===id&&t.autoGenerated).forEach(t=>{t.name=name+' '+U.num(t.sequence);});
      },'tables.manage',hall?'ویرایش سالن «'+name+'»':'ساخت سالن «'+name+'»',{entityType:'hall',entityId:id});
      App.ui.state.baseHallId=id;App.ui.state.baseTab='halls';App.ui.render();App.ui.toast(hall?'اطلاعات سالن به‌روزرسانی شد.':'سالن ساخته شد؛ اکنون تعداد میزهای موردنیاز را در همین صفحه اضافه کنید.','ok');
    }});
  }
  function hallCards(){
    const d=D(),st=App.ui.state;let h=V.head('سالن و میزها','سالن را انتخاب کنید؛ میزهای همان سالن در همین صفحه نمایش داده می‌شوند. تعداد واردشده به میزهای موجود اضافه خواهد شد.',V.btn('base-add','ساخت سالن','plus','btn-primary btn-sm'));
    h+='<div class="hall-management-grid">'+(d.halls||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0)).map(x=>{
      const ts=d.tables.filter(t=>t.hallId===x.id),busy=ts.filter(t=>t.status==='occupied'||t.orderId).length;
      return '<article class="hall-management-card '+(st.baseHallId===x.id?'selected':'')+'"><button class="hall-open" data-action="base-hall-open" data-id="'+U.esc(x.id)+'" aria-pressed="'+(st.baseHallId===x.id)+'"><span class="hall-color" style="--hall-color:'+U.esc(x.color||'#f0a44b')+'"></span><span class="hall-card-copy"><b>'+U.esc(x.name)+'</b><small>'+N(ts.length)+' میز · '+N(busy)+' مشغول · '+N(ts.length-busy)+' آزاد</small></span><span class="hall-open-arrow">'+(st.baseHallId===x.id?'✓':'‹')+'</span></button><button class="btn btn-sm" data-action="base-hall-edit" data-id="'+U.esc(x.id)+'">ویرایش نام و رنگ سالن</button></article>';
    }).join('')||'<div class="card">هنوز سالنی نساخته‌اید. ابتدا «ساخت سالن» را بزنید.</div>'+'</div>';
    const hall=(d.halls||[]).find(x=>x.id===st.baseHallId);
    if(hall)h+=tableManagement(hall);
    else if(d.halls.length)h+='<div class="card hall-select-hint">برای دیدن فهرست میزها و افزودن میز، روی کارت سالن کلیک کنید.</div>';
    return h;
  }
  function tableRowsForHall(hall){
    const ts=D().tables.filter(t=>t.hallId===hall.id).sort((a,b)=>(a.sequence||a.y*100+a.x)-(b.sequence||b.y*100+b.x));
    return ts.map(t=>'<tr><td><b>'+U.esc(t.name)+'</b>'+(t.autoGenerated?'<div class="tiny faint">ساخته‌شده خودکار · '+N(t.sequence)+'</div>':'')+'</td><td>'+N(t.capacity||0)+' نفر</td><td>'+(t.status==='occupied'?'<span class="badge warn">مشغول</span>':t.status==='reserved'?'<span class="badge info">رزرو</span>':'<span class="badge ok">آزاد</span>')+'</td><td>'+(t.orderId?'<span class="num">فاکتور '+N((D().orders.find(o=>o.id===t.orderId)||{}).no)+'</span>':'—')+'</td><td><button class="btn btn-sm" data-action="base-table-edit" data-id="'+U.esc(t.id)+'">ویرایش میز</button></td></tr>').join('');
  }
  function tableManagement(hall){
    const d=D(),ts=d.tables.filter(t=>t.hallId===hall.id),busy=ts.filter(t=>t.status==='occupied'||t.orderId).length;
    return '<section class="card hall-table-section"><div class="card-head"><span class="hall-color" style="--hall-color:'+U.esc(hall.color||'#f0a44b')+'"></span><h3>میزهای سالن «'+U.esc(hall.name)+'»</h3><span class="spacer"></span><span class="badge">'+N(ts.length)+' میز موجود</span><span class="badge warn">'+N(busy)+' مشغول</span></div>'+
      '<form data-form="table-count" class="table-count-form"><input type="hidden" name="hallId" value="'+U.esc(hall.id)+'"><label class="field"><span>تعداد میز جدید برای افزودن</span><input type="number" name="count" value="1" min="1" max="200" required></label><button class="btn btn-primary" type="submit">افزودن میزها</button></form>'+
      '<p class="tiny muted">تعداد را به‌صورت «چند میز جدید اضافه شود؟» وارد کنید. شماره‌گذاری از آخرین میز ادامه پیدا می‌کند؛ مثلاً افزودن ۱۰ میز به میزهای ۱ تا ۱۰، میزهای ۱۱ تا ۲۰ را می‌سازد.</p>'+
      '<div class="table-scroll"><table class="tbl"><thead><tr><th>میز</th><th>ظرفیت</th><th>وضعیت</th><th>سفارش</th><th>عملیات</th></tr></thead><tbody>'+
      (tableRowsForHall(hall)||'<tr><td colspan="5" class="muted">هنوز میزی در این سالن نیست؛ تعداد میزهای جدید را وارد و «افزودن میزها» را بزنید.</td></tr>')+
      '</tbody></table></div></section>';
  }
  function addHallTables(hallId,count){
    if(!App.auth.can('tables.manage'))return {ok:false,error:'دسترسی مدیریت میزها ندارید.'};
    const d=D(),hall=d.halls.find(x=>x.id===hallId);if(!hall)return {ok:false,error:'سالن پیدا نشد.'};
    count=Math.floor(Number(count));const current=d.tables.filter(t=>t.hallId===hallId);
    if(!Number.isFinite(count)||count<1||count>200)return {ok:false,error:'تعداد میزهای جدید باید بین ۱ تا ۲۰۰ باشد.'};
    if(current.length+count>200)return {ok:false,error:'تعداد میزهای یک سالن نمی‌تواند از ۲۰۰ بیشتر شود.'};
    const lastSeq=Math.max(current.length,...current.map(t=>Number(t.sequence)||0));
    App.store.commit(data=>{
      for(let i=1;i<=count;i++){
        const seq=lastSeq+i,id=U.uid('table');
        data.tables.push({id,hallId,name:hall.name+' '+U.num(seq),capacity:4,x:(seq-1)%4+1,y:Math.floor((seq-1)/4)+1,
          sort:seq,sequence:seq,autoGenerated:true,status:'free',orderId:null,occupiedAt:null});
      }
    },'tables.manage','افزودن '+N(count)+' میز ('+N(lastSeq+1)+' تا '+N(lastSeq+count)+') به سالن «'+hall.name+'»',{entityType:'hall',entityId:hallId});
    return {ok:true,added:count,first:lastSeq+1,last:lastSeq+count};
  }
  function tableEdit(table){
    if(!App.auth.can('tables.manage'))return App.ui.toast('دسترسی مدیریت میزها ندارید.','err');
    App.ui.form({title:'ویرایش میز «'+table.name+'»',fields:[
      {name:'name',label:'نام میز',type:'text',required:true,value:table.name},
      {name:'capacity',label:'ظرفیت (نفر)',type:'number',min:1,value:table.capacity||4}
    ],onSubmit:v=>{const name=String(v.name||'').trim();if(!name)return App.ui.toast('نام میز الزامی است.','err');
      App.store.commit(d=>{const t=d.tables.find(x=>x.id===table.id);if(t){t.name=name;t.capacity=Math.max(1,Number(v.capacity)||4);}},'tables.manage','ویرایش میز «'+name+'»',{entityType:'table',entityId:table.id});
      App.ui.state.baseHallId=table.hallId;App.ui.render();App.ui.toast('میز به‌روزرسانی شد.','ok');
    }});
  }
  function base(){const st=App.ui.state;let visible=TABS.filter(t=>App.auth.can(t[2]));if(!visible.length)return '<div class="card">دسترسی اطلاعات پایه ندارید.</div>';if(!visible.some(t=>t[0]===st.baseTab))st.baseTab=visible[0][0];const tab=st.baseTab,kind=(TABS.find(t=>t[0]===tab)||[])[3]||tab;
    if(kind==='halls'||kind==='tables')return hallCards();
    const rows=D()[kind]||[];
    let h=V.head('اطلاعات پایه','تعریف و نگهداری داده‌های عملیاتی، کاربران و موجودی',V.btn('base-add','افزودن','plus','btn-primary btn-sm'));
    h+='<section class="card"><div class="card-head"><h3>'+((TABS.find(t=>t[0]===tab)||[])[1])+'</h3><span class="spacer"></span><span class="badge">'+N(rows.length)+' مورد</span></div>'+
      (kind==='products'&&App.auth.can('menu.manage')?'<div class="base-product-tools">'+V.btn('base-bulk','ویرایش گروهی کالاها','layers','btn-sm btn-outline')+'</div>':'')+
      '<div class="table-scroll"><table class="tbl"><thead><tr>'+labels[kind].map(x=>'<th>'+x+'</th>').join('')+'<th>عملیات</th></tr></thead><tbody>';
    h+=rows.map(x=>'<tr>'+recordText(kind,x).map(v=>'<td>'+U.esc(v)+'</td>').join('')+'<td>'+(kind==='printers'?'<button class="btn btn-sm btn-outline" data-action="base-test-printer" data-id="'+x.id+'">تست چاپ</button> ':'')+'<button class="btn btn-sm" data-action="base-edit" data-kind="'+kind+'" data-id="'+x.id+'">ویرایش</button> <button class="btn btn-sm btn-danger" data-action="base-delete" data-kind="'+kind+'" data-id="'+x.id+'">حذف</button></td></tr>').join('')||'<tr><td colspan="'+(labels[kind].length+1)+'" class="muted">اطلاعاتی ثبت نشده است.</td></tr>';
    h+='</tbody></table></div></section>';
    if(kind==='products')h+='<div class="card"><b>کنترل موجودی</b><p class="muted tiny">موجودی با ثبت سفارش کسر می‌شود؛ حذف منطقی و بازیابی فاکتور نیز گردش موجودی را اصلاح می‌کند. هشدار کمبود در پیشخوان نمایش داده می‌شود.</p></div>';
    return h;
  }
  function settings(){
    const d=D(),s=d.settings,sub=App.ui.state.settingsTab||'general';
    const tabs=[['general','مشخصات رستوران'],['finance','مالی و چاپ'],['club','باشگاه مشتریان'],['connection','نسخه‌ها و اتصال'],['backup','پشتیبان‌گیری']];
    const tab=tabs.find(x=>x[0]===sub)||tabs[0];
    let h=V.head('تنظیمات سامانه','پیکربندی نسخه‌ها، اتصال یکپارچه، همگام‌سازی آفلاین و تنظیمات کسب‌وکار');
    h+='<div class="chips">'+tabs.map(t=>'<button class="chip '+(sub===t[0]?'active':'')+'" data-action="settings-tab" data-id="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
    h+='<section class="card"><div class="card-head"><h3>'+tab[1]+'</h3></div>';
    if(sub==='backup')h+='<p>نسخه پشتیبان شامل اطلاعات عملیاتی، کاربران، گزارش ممیزی و تنظیمات است. فایل را در محل امن نگهداری کنید.</p><div class="row">'+V.btn('backup-export','دانلود نسخه پشتیبان','download','btn-primary')+'<label class="btn">بازیابی نسخه پشتیبان<input type="file" accept="application/json" data-input="backup-import" hidden></label>'+V.btn('backup-demo','بازنشانی داده نمونه','refresh','btn-danger btn-sm')+'</div>';
    else if(sub==='connection'){
      const c=s.connection||{},ss=App.sync?App.sync.status():{},stateLabels={idle:'آماده',offline:'آفلاین؛ داده روی دستگاه است',pending:'در صف همگام‌سازی',checking:'در حال بررسی سرور',connected:'اتصال برقرار',synced:'همگام‌شده',conflict:'تعارض؛ انتخاب دستی لازم است',error:'خطای اتصال'};
      h+='<p class="muted">انتخاب نسخهٔ اجرایی و اتصال همهٔ دستگاه‌ها به یک API مشترک. اطلاعات حساب دیتابیس فقط در فایل تنظیمات PHP روی سرور قرار می‌گیرد؛ این صفحه هرگز رمز SQL را ذخیره نمی‌کند.</p>'+
        '<form data-form="settings-connection" class="form-grid">'+
        '<label class="field"><span>نسخه / دستگاه</span><select name="platform">'+[['auto','تشخیص خودکار'],['windows-electron','ویندوز · برنامهٔ مستقل'],['android','اندروید (اپ بومی)']].map(x=>'<option value="'+x[0]+'" '+((c.platform||'auto')===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></label>'+
        '<label class="field"><span>شیوهٔ کار دستگاه</span><select name="mode"><option value="offline" '+((c.mode||'offline')==='offline'?'selected':'')+'>کاملاً مستقل و آفلاین · بدون اتصال به سرور</option><option value="hybrid" '+(c.mode==='hybrid'?'selected':'')+'>آفلاین + همگام‌سازی وقتی شبکه وصل شد</option></select></label>'+
        '<label class="field"><span>دیتابیس سمت سرور</span><select name="backend"><option value="mysql" '+((c.backend||'mysql')==='mysql'?'selected':'')+'>MySQL / PHP</option><option value="sqlsrv" '+(c.backend==='sqlsrv'?'selected':'')+'>SQL Server 2014 به بالا</option></select></label>'+
        '<label class="field"><span>نشانی API مشترک</span><input name="apiUrl" type="url" value="'+U.esc(c.apiUrl||'')+'" placeholder="https://server.example.com/api.php"></label>'+
        '<label class="field full"><span>توکن دستگاه (از مدیر سرور دریافت شود)</span><input name="clientToken" type="password" autocomplete="new-password" value="" placeholder="خالی بگذارید تا توکن ذخیره‌شده تغییر نکند"></label>'+
        '<div class="field full"><label class="check-line"><input type="checkbox" name="autoSync" '+(c.autoSync?'checked':'')+'> همگام‌سازی خودکار هنگام اتصال اینترنت</label></div>'+
        '<div class="field full tiny muted">سیاست تعارض: دستی و امن؛ اگر هم دستگاه و هم سرور تغییر کرده باشند، هیچ‌کدام بی‌صدا جایگزین نمی‌شود و پیش از انتخاب، نسخه‌ها را پشتیبان بگیرید.</div>'+
        '<div class="field full"><button class="btn btn-primary" type="submit">ذخیره تنظیمات اتصال</button></div></form>'+
        '<div class="divider"></div><div class="connection-status"><div class="t-row"><span>وضعیت</span><b>'+U.esc(stateLabels[ss.state]||'آماده')+'</b></div><div class="t-row"><span>نسخهٔ پایهٔ سرور</span><span class="num">'+(ss.baseVersion==null?'—':N(ss.baseVersion))+'</span></div><div class="t-row"><span>تغییرات منتظر ارسال</span><span>'+(ss.pending?'دارد':'ندارد')+'</span></div><div class="t-row"><span>آخرین همگام‌سازی</span><span>'+(ss.lastSyncedAt?U.datetime(ss.lastSyncedAt):'—')+'</span></div>'+(ss.error?'<div class="badge danger full">'+U.esc(ss.error)+'</div>':'')+'</div>'+
        '<div class="row tight" style="margin-top:12px">'+V.btn('sync-test','آزمایش اتصال','wifi','btn-sm')+V.btn('sync-now','همگام‌سازی اکنون','refresh','btn-primary btn-sm')+V.btn('sync-clear-token','پاک‌کردن توکن این دستگاه','trash','btn-sm')+(ss.conflict?V.btn('sync-use-server','حفظ نسخهٔ سرور','download','btn-sm')+V.btn('sync-use-device','ارسال نسخهٔ این دستگاه','upload','btn-danger btn-sm'):'')+'</div>'+
        '<div class="tiny muted" style="margin-top:10px">انتخاب «حفظ نسخهٔ این دستگاه» کل دادهٔ سرور را با این دستگاه جایگزین می‌کند؛ انتخاب «حفظ نسخهٔ سرور» دادهٔ این دستگاه را با نسخهٔ سرور جایگزین می‌کند. تصمیم‌ها فقط پس از تأیید انجام می‌شوند.</div>';
    }
    else if(sub==='general'||sub==='finance'||sub==='club'){
      let fields=sub==='general'?[['restaurantName','نام رستوران','text'],['address','نشانی','text'],['phone','تلفن','text'],['currency','واحد پول','text'],['footer','متن پایانی فاکتور','text'],['headerNote','پیام سفارش','text']]:sub==='finance'?[['taxPolicy','سیاست مالیات','select',[['invoice','مالیات فاکتور'],['item','مالیات هر کالا']]],['taxPercent','مالیات ٪','number'],['levyPercent','عوارض ٪','number'],['levyFixed','عوارض ثابت','number'],['calcOrder','ترتیب تخفیف و مالیات','select',[['discount-first','ابتدا تخفیف'],['tax-first','ابتدا مالیات']]],['invoiceWidth','عرض چاپ فاکتور','select',[['58','۵۸ میلی‌متر'],['80','۸۰ میلی‌متر']]],['kitchenWidth','عرض چاپ آشپزخانه','select',[['58','۵۸ میلی‌متر'],['80','۸۰ میلی‌متر']]],['stockPolicy','زمان کسر موجودی','select',[['on-submit','هنگام ثبت سفارش'],['on-settle','هنگام تسویه']]],['commissionPolicy','سیاست محاسبه پورسانت','select',[['product','بر اساس کالا'],['group','بر اساس گروه'],['personnel','بر اساس پرسنل']]],['printMeta','چاپ اطلاعات کامل روی فاکتور','checkbox'],['printVersion','چاپ شماره نسخه و نوبت چاپ','checkbox'],['autoSave','ذخیره‌سازی خودکار','checkbox']]:[['enabled','فعال بودن باشگاه','checkbox'],['customerRequired','الزام ثبت مشتری برای سفارش','checkbox'],['welcomeMessage','پیام خوش‌آمدگویی','text'],['invoiceMessage','متن ارسال لینک فاکتور','text'],['smsProvider','روش ارسال پیام','select',[['android','پیامک اندروید'],['whatsapp','واتساپ'],['share','اشتراک‌گذاری']]],['linkBase','نشانی میزبانی فاکتور (اختیاری)','text'],['consent','الزام رضایت پیام‌رسانی','checkbox']];
      h+='<form data-form="settings-'+sub+'" class="form-grid">'+fields.map(f=>{let name=f[0],label=f[1],type=f[2],value=sub==='club'?s.club[name]:s[name],input='';if(type==='select')input='<select name="'+name+'">'+f[3].map(o=>'<option value="'+o[0]+'" '+(String(value)===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>';else if(type==='checkbox')input='<label class="check-line"><input type="checkbox" name="'+name+'" '+(value?'checked':'')+'> '+label+'</label>';else input='<input name="'+name+'" type="'+type+'" value="'+U.esc(value==null?'':value)+'">';return type==='checkbox'?'<div class="field">'+input+'</div>':'<label class="field"><span>'+label+'</span>'+input+'</label>';}).join('')+'<div class="field full"><button class="btn btn-primary" type="submit">ذخیره تنظیمات</button></div></form>';
    }
    h+='</section>';return h;
  }
  Object.assign(App.actions,{
    'base-nav':el=>{App.ui.state.baseTab=el.dataset.tab;App.ui.state.baseMenuOpen=true;App.ui.go('base');},
    'base-menu-toggle':()=>{App.ui.state.baseMenuOpen=!App.ui.state.baseMenuOpen;App.ui.render();},
    'base-tab':el=>{App.ui.state.baseTab=el.dataset.id;App.ui.render();},
    'base-hall-open':el=>{App.ui.state.baseHallId=el.dataset.id;App.ui.state.baseTab='halls';App.ui.state.baseMenuOpen=true;App.ui.render();},
    'base-hall-edit':el=>{const h=D().halls.find(x=>x.id===el.dataset.id);if(h)hallForm(h);},
    'base-table-edit':el=>{const t=D().tables.find(x=>x.id===el.dataset.id);if(t)tableEdit(t);},
    'base-add':()=>{const kind=(TABS.find(t=>t[0]===App.ui.state.baseTab)||[])[3]||App.ui.state.baseTab;if(kind==='halls')return hallForm(null);if(kind==='tables'){App.ui.toast('برای افزودن میز، سالن را انتخاب و تعداد کل را تنظیم کنید.','');return;}entityForm(kind,null);},
    'base-edit':el=>{let obj=(D()[el.dataset.kind]||[]).find(x=>x.id===el.dataset.id);if(obj&&el.dataset.kind==='roles'&&obj.builtin)return App.ui.toast('سطوح دسترسی پیش‌فرض محافظت‌شده هستند؛ یک سطح سفارشی بسازید.','err');if(obj)entityForm(el.dataset.kind,obj);},
    'base-delete':el=>{const kind=el.dataset.kind,obj=(D()[kind]||[]).find(x=>x.id===el.dataset.id);if(!obj)return;if(kind==='roles'&&obj.builtin)return App.ui.toast('حذف سطح دسترسی پیش‌فرض مجاز نیست.','err');if(kind==='users'&&obj.id===App.auth.current().id)return App.ui.toast('نمی‌توان حساب فعال را حذف کرد.','err');App.ui.confirm('این مورد حذف شود؟ این عملیات در گزارش ممیزی ثبت خواهد شد.',()=>{App.store.commit(d=>{d[kind]=d[kind].filter(x=>x.id!==obj.id);},'base.delete','حذف '+kind+' '+(obj.name||obj.username),{entityType:kind,entityId:obj.id});App.ui.render();});},
    'base-test-printer':async el=>{if(!App.auth.can('printers.manage'))return App.ui.toast('دسترسی مدیریت چاپگر ندارید.','err');const p=App.model.printer(el.dataset.id);if(!p)return;App.ui.toast('در حال ارسال صفحه تست…');const r=await App.print.testPrinter(p);App.ui.toast(r.ok?'صفحه تست چاپ شد.':(r.error||'خطای چاپ'),r.ok?'ok':'err');},
    'base-bulk':()=>{const kind=App.ui.state.baseTab;if(kind!=='products')return App.ui.toast('ویرایش گروهی فعلاً برای کالاها در دسترس است.','err');App.ui.form({title:'ویرایش گروهی کالاها',note:'عملیات روی همه کالاها در گروه انتخابی اعمال می‌شود.',fields:[{name:'groupId',label:'گروه کالا (خالی یعنی همه)',type:'select',options:[{value:'',label:'همه گروه‌ها'},...optionsFor('groups')]},{name:'kind',label:'عملیات',type:'select',options:[{value:'price',label:'تغییر قیمت ثابت'}, {value:'discount',label:'تعیین تخفیف درصدی'}, {value:'stock',label:'تعیین موجودی'}, {value:'active',label:'فعال‌سازی'}]},{name:'value',label:'مقدار','type':'number'}],onSubmit:v=>{let ids=D().products.filter(p=>!v.groupId||p.groupId===v.groupId).map(p=>p.id);let op={kind:v.kind,mode:v.kind==='price'?'fixed':v.kind==='discount'?'percent':'',value:Number(v.value)||0};if(v.kind==='active')op.value=Number(v.value)!==0;let r=App.domain.bulkProducts(ids,op);App.ui.toast('ویرایش گروهی روی '+N(r.count)+' کالا انجام شد.','ok');App.ui.render();}});},
    'settings-tab':el=>{App.ui.state.settingsTab=el.dataset.id;App.ui.render();},
    'backup-export':()=>{const data=JSON.stringify(D(),null,2);U.download('hooshyar-backup-'+U.isoDate()+'.json',data,'application/json');},
    'backup-demo':()=>App.ui.confirm('تمام داده‌های فعلی جایگزین داده نمونه می‌شوند. ابتدا نسخه پشتیبان بگیرید.',()=>{localStorage.removeItem('hooshyar.pos.data.v2');localStorage.removeItem('hooshyar.pos.session.v2');location.reload();},'بازنشانی داده‌ها')
  });
  App.formHandlers['table-count']=(form,v)=>{const r=addHallTables(v.hallId,v.count);if(!r.ok)return App.ui.toast(r.error,'err');App.ui.state.baseHallId=v.hallId;App.ui.state.baseTab='halls';App.ui.render();App.ui.toast(N(r.added)+' میز جدید ساخته شد: شمارهٔ '+N(r.first)+' تا '+N(r.last)+'.','ok');};
  App.inputs['backup-import']=el=>{const file=el.files&&el.files[0];if(!file)return;const rd=new FileReader();rd.onload=()=>{try{const parsed=JSON.parse(rd.result);if(!parsed.meta||!Array.isArray(parsed.products)||!Array.isArray(parsed.users))throw Error('ساختار فایل معتبر نیست');App.ui.confirm('داده‌های فعلی با نسخه پشتیبان جایگزین شوند؟',()=>{localStorage.setItem('hooshyar.pos.data.v2',JSON.stringify(parsed));location.reload();});}catch(e){App.ui.toast('بازیابی ناموفق: '+e.message,'err');}};rd.readAsText(file);};
  ['general','finance','club'].forEach(section=>App.formHandlers['settings-'+section]=(form,v)=>{if(!App.auth.can('settings.manage'))return App.ui.toast('دسترسی کافی نیست.','err');App.store.commit(d=>{const target=section==='club'?d.settings.club:d.settings;Object.keys(v).forEach(k=>{target[k]=['autoSave','printMeta','printVersion','enabled','customerRequired','consent'].includes(k)?!!v[k]:['taxPercent','levyPercent','levyFixed','invoiceWidth','kitchenWidth'].includes(k)?Number(v[k])||0:v[k];});},'settings.manage','به‌روزرسانی تنظیمات '+section);App.ui.render();App.ui.toast('تنظیمات ذخیره شد.','ok');});
  App.formHandlers['settings-connection']=(form,v)=>{if(!App.auth.can('settings.manage'))return App.ui.toast('دسترسی تغییر اتصال ندارید.','err');if(v.clientToken&&App.sync)App.sync.setToken(v.clientToken);App.store.commit(d=>{d.settings.connection=Object.assign({},d.settings.connection||{},{platform:v.platform||'auto',mode:v.mode||'offline',backend:v.backend||'mysql',apiUrl:String(v.apiUrl||'').trim(),autoSync:!!v.autoSync,conflictPolicy:'manual'});},'settings.manage','به‌روزرسانی نسخه و اتصال سامانه');App.ui.render();App.ui.toast('تنظیمات نسخه و اتصال ذخیره شد.','ok');};
  App.views.base=base;App.views.settings=settings;
})();
