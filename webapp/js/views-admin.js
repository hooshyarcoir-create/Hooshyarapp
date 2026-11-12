/* ============================================================
   Hooshyar POS — screens: menu, settings, reports + CRUD forms
   ============================================================ */
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.inputs = App.inputs || {};
App.forms = App.forms || {};

(function () {
  const U = App.util, N = U.num, M = U.money, I = U.icon;
  const V = App.views;
  const D = () => App.model.D();
  const opts = V.opts;
  const btn = V.btn, head = V.head, empty = V.empty, kpi = V.kpi;

  const SETTINGS_TABS = [
    { id:'general',  label:'عمومی',            icon:'settings' },
    { id:'halls',    label:'سالن و میزها',     icon:'grid' },
    { id:'printers', label:'چاپگرها',          icon:'print' },
    { id:'stations', label:'خطوط چاپ / گروهها', icon:'layers' },
    { id:'psps',     label:'کارتخوان و PSP',   icon:'wallet' },
    { id:'users',    label:'کاربران و دسترسی', icon:'users' },
    { id:'backup',   label:'پشتیبانگیری',      icon:'save' },
    { id:'audit',    label:'رویدادها',         icon:'clock' }
  ];

  /* ================================ MENU ================================ */
  function menu() {
    const st = App.ui.state, d = D();
    const tab = st.menuTab || 'groups';
    const canEdit = App.auth.can('menu.manage');
    let h = head('منو، گروهبندی و کالاها', 'تعریف گروه، کالا، قیمت و تعیین خط چاپ آشپزخانه',
      (canEdit ? (tab === 'groups' ? btn('group-add','گروه جدید','plus','btn-primary') : btn('product-add','کالای جدید','plus','btn-primary')) : '') +
      btn('menu-export','خروجی CSV','download','btn-sm'));
    h += '<div class="tabs"><button class="tab ' + (tab==='groups'?'active':'') + '" data-action="menu-tab" data-tab="groups">گروههای کالا (' + N(d.groups.length) + ')</button>' +
         '<button class="tab ' + (tab==='products'?'active':'') + '" data-action="menu-tab" data-tab="products">کالاها و قیمت (' + N(d.products.length) + ')</button></div>';

    if (tab === 'groups') {
      h += '<div class="grid cols-3">';
      d.groups.slice().sort((a,b)=>(a.sort||0)-(b.sort||0)).forEach(g => {
        const count = d.products.filter(p => p.groupId === g.id).length;
        const sts = (g.stationIds||[]).map(id => (App.model.station(id)||{}).name).filter(Boolean);
        h += '<div class="card"><div class="row"><span class="dot" style="width:12px;height:12px;background:' + U.esc(g.color||'#888') + '"></span><h3>' + U.esc(g.name) + '</h3><span class="spacer"></span>' +
          '<span class="badge ' + (g.active===false?'danger':'ok') + '">' + (g.active===false?'غیرفعال':'فعال') + '</span></div>' +
          '<div class="tiny muted" style="margin-top:8px">' + N(count) + ' کالا · ' + N(g.copies||1) + ' نسخه چاپ</div>' +
          '<div class="tiny" style="margin-top:6px">خط چاپ: ' + (sts.length ? sts.map(s=>'<span class="badge info">' + U.esc(s) + '</span>').join(' ') : '<span class="badge warn">تعیین نشده</span>') + '</div>' +
          (canEdit ? '<div class="row tight" style="margin-top:12px">' + btn('group-edit','ویرایش','edit','btn-sm',{id:g.id}) +
            btn('group-del','حذف','trash','btn-sm btn-danger',{id:g.id}) + '</div>' : '') + '</div>';
      });
      if (!d.groups.length) h += '<div style="grid-column:1/-1">' + empty('گروهی تعریف نشده است.','layers') + '</div>';
      h += '</div>';
    } else {
      h += '<div class="card" style="margin-bottom:12px"><div class="row"><div class="input-icon" style="flex:1">' + I('search') +
        '<input type="text" data-input="product-admin-search" placeholder="جستجو در کالاها…" value="' + U.esc(st.adminSearch||'') + '"></div>' +
        '<button class="btn btn-sm" data-action="menu-import">' + I('upload') + ' ورود CSV</button></div></div>';
      const q = (st.adminSearch||'').trim();
      const list = d.products.filter(p => !q || p.name.indexOf(q)!==-1 || (p.code||'').indexOf(q)!==-1);
      h += '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>کالا</th><th>کد</th><th>گروه</th><th>خط چاپ</th><th>قیمت (تومان)</th><th>وضعیت</th><th></th></tr></thead><tbody>';
      list.forEach(p => {
        const g = App.model.group(p.groupId);
        const sts = (p.stationIds||[]).length ? p.stationIds : (g ? g.stationIds : []);
        h += '<tr><td><b>' + U.esc(p.name) + '</b>' + (p.description ? '<div class="tiny faint">' + U.esc(p.description) + '</div>' : '') + '</td>' +
          '<td class="num">' + U.esc(p.code||'—') + '</td><td>' + (g ? '<span class="dot" style="background:' + U.esc(g.color||'#888') + '"></span> ' + U.esc(g.name) : '—') + '</td>' +
          '<td>' + (sts && sts.length ? sts.map(id => '<span class="badge info">' + U.esc((App.model.station(id)||{}).name || id) + '</span>').join(' ') : '<span class="badge warn">گروه</span>') + '</td>' +
          '<td class="num strong">' + M(p.price) + '</td>' +
          '<td><span class="badge ' + (p.active===false?'danger':'ok') + '">' + (p.active===false?'غیرفعال':'فعال') + '</span></td>' +
          '<td><div class="row tight nowrap">' + (canEdit ? '<button class="icon-btn plain" data-action="product-edit" data-id="' + p.id + '">' + I('edit','sm') + '</button><button class="icon-btn plain danger" data-action="product-del" data-id="' + p.id + '">' + I('trash','sm') + '</button>' : '') + '</div></td></tr>';
      });
      h += '</tbody></table></div>' + (list.length ? '' : empty('کالایی یافت نشد.','book')) + '</div>';
    }
    return h;
  }

  /* ================================ SETTINGS ================================ */
  function settings() {
    const st = App.ui.state, d = D();
    let tab = st.settingsTab || 'general';
    let h = head('تنظیمات سامانه', 'سالن، میز، چاپگرها، خطوط چاپ، کارتخوان و سطوح دسترسی');
    const allowed = SETTINGS_TABS.filter(t => ({
      general: true,
      halls: App.auth.can('tables.view') || App.auth.can('tables.manage'),
      printers: App.auth.can('printers.manage') || App.auth.can('kitchen.print') || App.auth.can('invoice.print'),
      stations: App.auth.can('printers.manage') || App.auth.can('kitchen.print'),
      psps: App.auth.can('settings.manage') || App.auth.can('payment.settle'),
      users: App.auth.can('users.manage'),
      backup: App.auth.can('backup.manage'),
      audit: App.auth.can('reports.view') || App.auth.can('users.manage')
    }[t.id]));
    if (!allowed.some(x => x.id === tab)) { st.settingsTab = tab = allowed.length ? allowed[0].id : 'general'; }
    h += '<div class="settings-layout"><div class="settings-nav">';
    allowed.forEach(t => { h += '<button class="' + (tab===t.id?'active':'') + '" data-action="settings-tab" data-tab="' + t.id + '">' + I(t.icon,'sm') + ' ' + t.label + '</button>'; });
    h += '</div><div>';
    h += ({ general:generalTab, halls:hallsTab, printers:printersTab, stations:stationsTab, psps:pspsTab, users:usersTab, backup:backupTab, audit:auditTab }[tab] || generalTab)();
    h += '</div></div>';
    return h;
  }

  function generalTab() {
    const s = D().settings;
    const can = App.auth.can('settings.manage');
    let h = '<div class="card"><div class="card-head"><h3>اطلاعات مجموعه و فاکتور</h3><span class="spacer"></span><span class="tiny faint">این اطلاعات بالای فاکتور چاپ میشود</span></div>' +
      '<form data-form="general"><div class="form-grid">' +
      field({ name:'restaurantName', label:'نام رستوران / مجموعه', value:s.restaurantName, disabled:!can }) +
      field({ name:'phone', label:'تلفن', value:s.phone, disabled:!can }) +
      field({ name:'address', label:'آدرس', value:s.address, disabled:!can, full:true }) +
      field({ name:'currency', label:'واحد پول', type:'select', options:[{value:'تومان',label:'تومان'},{value:'ریال',label:'ریال'}], value:s.currency, disabled:!can }) +
      field({ name:'taxPercent', label:'مالیات (٪)', type:'number', value:s.taxPercent, min:0, max:100, disabled:!can }) +
      field({ name:'servicePercent', label:'سرویس (٪)', type:'number', value:s.servicePercent, min:0, max:100, disabled:!can }) +
      field({ name:'invoiceWidth', label:'کاغذ پیشفرض فاکتور', type:'select', options:[{value:'80',label:'۸ سانتی / 80mm'},{value:'58',label:'۶ سانتی / 58mm'}], value:String(s.invoiceWidth), disabled:!can }) +
      field({ name:'kitchenWidth', label:'کاغذ پیشفرض آشپزخانه', type:'select', options:[{value:'80',label:'۸ سانتی / 80mm'},{value:'58',label:'۶ سانتی / 58mm'}], value:String(s.kitchenWidth), disabled:!can }) +
      field({ name:'headerNote', label:'متن روی برگه آشپزخانه', value:s.headerNote, disabled:!can, full:true }) +
      field({ name:'footer', label:'پانویس فاکتور', value:s.footer, disabled:!can, full:true }) +
      '</div><label class="check-line"><input type="checkbox" name="autoSave" ' + (s.autoSave?'checked':'') + ' ' + (can?'':'disabled') + '> ذخیرهسازی خودکار هنگام تغییر و بستن برنامه</label>' +
      (can ? '<button class="btn btn-primary" type="submit" style="margin-top:10px">' + I('save') + ' ذخیره تنظیمات</button>' : '') + '</form></div>';
    h += '<div class="card"><div class="card-head"><h3>وضعیت ذخیرهسازی</h3></div><div class="row"><span class="badge ok">' + I('check','sm') + ' فعال</span>' +
      '<span class="tiny muted">آخرین بروزرسانی: ' + U.esc(U.datetime(D().meta.updatedAt)) + '</span><span class="spacer"></span>' +
      btn('backup-export','دریافت نسخه پشتیبان','download','btn-sm') + '</div>' +
      '<div class="tiny faint" style="margin-top:8px">همه تغییرات بلافاصله در حافظه دستگاه (localStorage) ذخیره میشود و روی اندروید یک کپی اضافی در پوشه امن برنامه نوشته میشود؛ بنابراین با بستن یا خاموش شدن دستگاه اطلاعات از بین نمیرود.</div></div>';
    return h;
  }

  function hallsTab() {
    const d = D(), can = App.auth.can('tables.manage');
    let h = '<div class="card"><div class="card-head"><h3>سالنها</h3><span class="spacer"></span>' + (can ? btn('hall-add','سالن جدید','plus','btn-sm btn-primary') : '') + '</div>';
    d.halls.slice().sort((a,b)=>(a.sort||0)-(b.sort||0)).forEach(x => {
      h += '<div class="list-row"><span class="dot" style="width:12px;height:12px;background:' + U.esc(x.color||'#888') + '"></span><span class="lr-main"><span class="lr-title">' + U.esc(x.name) + '</span>' +
        '<span class="lr-sub">' + N(d.tables.filter(t=>t.hallId===x.id).length) + ' میز · ترتیب ' + N(x.sort||0) + '</span></span>' +
        (can ? btn('hall-edit','','edit','btn-sm','',{id:x.id}) + btn('hall-del','','trash','btn-sm btn-danger',{id:x.id}) : '') + '</div>';
    });
    if (!d.halls.length) h += empty('سالنی تعریف نشده است.','grid');
    h += '</div>';

    h += '<div class="card"><div class="card-head"><h3>میزها</h3><span class="spacer"></span>' + (can ? btn('table-add','میز جدید','plus','btn-sm btn-primary') : '') + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>نام میز</th><th>سالن</th><th>ظرفیت</th><th>موقعیت</th><th>وضعیت</th><th></th></tr></thead><tbody>';
    d.tables.slice().sort((a,b)=> a.hallId.localeCompare(b.hallId) || (a.y-b.y) || (a.x-b.x)).forEach(t => {
      const si = V.statusInfo(t.status);
      h += '<tr><td><b>' + U.esc(t.name) + '</b></td><td>' + U.esc((App.model.hall(t.hallId)||{}).name||'—') + '</td><td class="num">' + N(t.capacity) + '</td>' +
        '<td class="num">' + N(t.x) + ' , ' + N(t.y) + '</td><td><span class="badge ' + si[1] + '">' + si[0] + '</span></td>' +
        '<td><div class="row tight nowrap">' + (can ? '<button class="icon-btn plain" data-action="table-edit" data-id="' + t.id + '">' + I('edit','sm') + '</button><button class="icon-btn plain danger" data-action="table-del" data-id="' + t.id + '">' + I('trash','sm') + '</button>' : '') + '</div></td></tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function printersTab() {
    const d = D(), can = App.auth.can('printers.manage');
    const kinds = { network:'شبکه / IP', usb:'USB (XPrinter)', bluetooth:'بلوتوث', system:'چاپگر سیستم' };
    let h = '<div class="card"><div class="card-head"><h3>چاپگرها</h3><span class="spacer"></span>' +
      btn('printer-discover','جستجوی دستگاهها','search','btn-sm') +
      (can ? btn('printer-add','چاپگر جدید','plus','btn-sm btn-primary') : '') + '</div>' +
      '<div class="tiny faint" style="margin-bottom:10px">چاپگر ۸۰ میلیمتری (۸ سانتی) از طریق IP روی پورت ۹۱۰۰ یا USB / XPrinter و چاپگر ۵۸ میلیمتری (۶ سانتی) برای فاکتورهای کوچک پشتیبانی میشود. متن فارسی به صورت تصویر ESC/POS ارسال میشود تا نیازی به فونت خاص روی پرینتر نباشد.</div>';
    d.printers.forEach(p => {
      const conn = p.kind === 'network' ? (p.ip || '—') + ':' + (p.port||9100) : p.kind === 'bluetooth' ? (p.mac || 'MAC تعیین نشده') : p.kind === 'usb' ? 'VID:' + (p.vendorId||0) + ' PID:' + (p.productId||0) : 'PrintManager';
      h += '<div class="list-row"><span class="avatar">' + I(p.kind==='network'?'wifi':p.kind==='usb'?'usb':p.kind==='bluetooth'?'bluetooth':'print','sm') + '</span>' +
        '<span class="lr-main"><span class="lr-title">' + U.esc(p.name) + ' <span class="badge ' + (p.enabled?'ok':'danger') + '">' + (p.enabled?'فعال':'غیرفعال') + '</span></span>' +
        '<span class="lr-sub">' + U.esc(kinds[p.kind]||p.kind) + ' · <span class="ltr num">' + U.esc(conn) + '</span> · کاغذ ' + (p.width===58?'۶ سانتی':'۸ سانتی') + ' · ' + U.esc(p.usage==='invoice'?'فاکتور':p.usage==='kitchen'?'آشپزخانه':'مشترک') + ' · ' + N(p.copies||1) + ' نسخه</span></span>' +
        '<div class="row tight nowrap">' + btn('printer-test','تست چاپ','print','btn-sm',{id:p.id}) +
        (can ? btn('printer-edit','','edit','btn-sm',{id:p.id}) + btn('printer-del','','trash','btn-sm btn-danger',{id:p.id}) : '') + '</div></div>';
    });
    if (!d.printers.length) h += empty('چاپگری تعریف نشده است.','print');
    h += '</div>';
    const jobs = (d.printJobs||[]).slice(0,8);
    h += '<div class="card"><div class="card-head"><h3>آخرین عملیات چاپ</h3></div>';
    if (!jobs.length) h += empty('هنوز چاپی انجام نشده است.','print');
    else jobs.forEach(j => { h += '<div class="list-row"><span class="lr-main"><span class="lr-title">' + U.esc(j.printerName||'—') + ' · ' + U.esc(j.kind==='kitchen'?'آشپزخانه':j.kind==='invoice'?'فاکتور':j.kind||'چاپ') + '</span>' +
      '<span class="lr-sub">' + U.esc(U.datetime(j.at)) + ' · ' + U.esc(j.ref||'') + ' · ' + U.esc(j.info||'') + '</span></span><span class="badge ' + (j.status==='ok'?'ok':'danger') + '">' + (j.status==='ok'?'موفق':'ناموفق') + '</span></div>'; });
    h += '</div>';
    return h;
  }

  function stationsTab() {
    const d = D(), can = App.auth.can('printers.manage');
    let h = '<div class="card"><div class="card-head"><h3>خطوط چاپ آشپزخانه</h3><span class="spacer"></span>' + (can ? btn('station-add','خط چاپ جدید','plus','btn-sm btn-primary') : '') + '</div>' +
      '<div class="tiny faint" style="margin-bottom:10px">هر «خط چاپ» یک ایستگاه (مثلاً آشپزخانه گرم، سالاد، بار) است که به یک چاپگر مشخص متصل است. با اختصاص هر گروه کالا به یک خط، هنگام ارسال سفارش فقط اقلام همان گروه در آن چاپگر چاپ میشود.</div>';
    d.stations.slice().sort((a,b)=>(a.sort||0)-(b.sort||0)).forEach(s => {
      const pr = App.model.printer(s.printerId);
      const groups = d.groups.filter(g => (g.stationIds||[]).indexOf(s.id)!==-1);
      h += '<div class="list-row"><span class="avatar">' + I('print','sm') + '</span><span class="lr-main"><span class="lr-title">' + U.esc(s.name) + ' <span class="badge ' + (s.enabled?'ok':'danger') + '">' + (s.enabled?'فعال':'غیرفعال') + '</span></span>' +
        '<span class="lr-sub">چاپگر: ' + U.esc(pr ? pr.name : '⚠ تنظیم نشده') + ' · ' + N(s.copies||1) + ' نسخه · گروهها: ' + (groups.length ? groups.map(g=>U.esc(g.name)).join('، ') : 'هیچکدام') + '</span></span>' +
        (can ? '<div class="row tight nowrap">' + btn('station-edit','','edit','btn-sm',{id:s.id}) + btn('station-del','','trash','btn-sm btn-danger',{id:s.id}) + '</div>' : '') + '</div>';
    });
    h += '</div>';
    h += '<div class="card"><div class="card-head"><h3>ماتریس گروه ← خط چاپ</h3><span class="spacer"></span><span class="tiny faint">برای تغییر سریع کلیک کنید</span></div>' +
      '<div class="tbl-wrap"><table class="matrix"><thead><tr><th>گروه کالا</th>' + d.stations.map(s=>'<th>' + U.esc(s.name) + '</th>').join('') + '</tr></thead><tbody>';
    d.groups.forEach(g => {
      h += '<tr><td><span class="dot" style="background:' + U.esc(g.color||'#888') + '"></span> ' + U.esc(g.name) + '</td>' +
        d.stations.map(s => {
          const on = (g.stationIds||[]).indexOf(s.id)!==-1;
          return '<td><button class="icon-btn plain ' + (on?'ok':'') + '" data-action="matrix-toggle" data-group="' + g.id + '" data-station="' + s.id + '" ' + (can?'':'disabled') + '>' + I(on?'check':'plus','sm') + '</button></td>';
        }).join('') + '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function pspsTab() {
    const d = D(), can = App.auth.can('settings.manage');
    let h = '<div class="card"><div class="card-head"><h3>درگاههای پرداخت / کارتخوان (PSP)</h3><span class="spacer"></span>' + (can ? btn('psp-add','درگاه جدید','plus','btn-sm btn-primary') : '') + '</div>' +
      '<div class="login-error" style="margin-bottom:12px">اتصال واقعی به هر PSP نیازمند اپلیکیشن و قرارداد همان شرکت روی دستگاه اندرویدی کارتخوان است. در اینجا نام بسته (Package)، اکشن Intent و کلیدهای پاسخ هر PSP قابل تنظیم است؛ مقادیر پیشفرض نمونهای هستند و باید مطابق مستندات PSP خود اصلاح شوند. در اجرای تحت وب، تایید دستی جایگزین میشود.</div>';
    d.psps.forEach(p => {
      h += '<div class="list-row"><span class="avatar">' + I('wallet','sm') + '</span><span class="lr-main"><span class="lr-title">' + U.esc(p.name) + ' <span class="badge ' + (p.enabled?'ok':'danger') + '">' + (p.enabled?'فعال':'غیرفعال') + '</span></span>' +
        '<span class="lr-sub ltr">' + U.esc(p.packageName||'—') + ' · ' + U.esc(p.action||'—') + '</span>' +
        '<span class="lr-sub">ترمینال: <span class="num">' + U.esc(p.terminalId||'—') + '</span> · پذیرنده: <span class="num">' + U.esc(p.merchantId||'—') + '</span></span></span>' +
        '<div class="row tight nowrap">' + btn('psp-test','تست','send','btn-sm',{id:p.id}) +
        (can ? btn('psp-edit','','edit','btn-sm',{id:p.id}) + btn('psp-del','','trash','btn-sm btn-danger',{id:p.id}) : '') + '</div></div>';
    });
    h += '</div>';
    h += '<div class="card"><div class="card-head"><h3>مشتریان اعتباری</h3><span class="spacer"></span>' + btn('credit-add','مشتری جدید','plus','btn-sm') + '</div>';
    (d.customers||[]).forEach(c => { h += '<div class="list-row"><span class="lr-main"><span class="lr-title">' + U.esc(c.name) + '</span><span class="lr-sub num">' + U.esc(c.phone||'—') + '</span></span><span class="num ' + ((c.credit||0)>0?'danger':'muted') + '">بدهی: ' + M(c.credit||0) + '</span></div>'; });
    if (!(d.customers||[]).length) h += empty('مشتری اعتباری تعریف نشده است.','users');
    h += '</div>';
    return h;
  }

  function usersTab() {
    const d = D(), can = App.auth.can('users.manage');
    let h = '<div class="card"><div class="card-head"><h3>کاربران و سطوح دسترسی</h3><span class="spacer"></span>' + (can ? btn('user-add','کاربر جدید','plus','btn-sm btn-primary') : '') + '</div>' +
      '<div class="tiny faint" style="margin-bottom:10px">برای هر کاربر به صورت جداگانه مشخص کنید به کدام بخشها دسترسی دارد. نقشهای آماده فقط یک الگوی اولیه هستند و در حالت «سفارشی» میتوان تکتک مجوزها را انتخاب کرد.</div>';
    d.users.forEach(u => {
      h += '<div class="list-row"><span class="avatar">' + U.esc((u.name||'؟').slice(0,1)) + '</span><span class="lr-main"><span class="lr-title">' + U.esc(u.name) + ' <span class="badge accent">' + U.esc(App.auth.roleLabel(u)) + '</span> <span class="badge ' + (u.active?'ok':'danger') + '">' + (u.active?'فعال':'غیرفعال') + '</span></span>' +
        '<span class="lr-sub ltr">@' + U.esc(u.username) + ' · ' + N((u.permissions||[]).length) + ' مجوز</span></span>' +
        (can ? '<div class="row tight nowrap">' + btn('user-pass','رمز','lock','btn-sm',{id:u.id}) + btn('user-edit','','edit','btn-sm',{id:u.id}) +
          (u.id === (App.auth.current()||{}).id ? '' : btn('user-del','','trash','btn-sm btn-danger',{id:u.id})) + '</div>' : '') + '</div>';
    });
    h += '</div>';
    // permission reference
    const groups = {};
    App.PERMISSIONS.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
    h += '<div class="card"><div class="card-head"><h3>فهرست مجوزها</h3></div>';
    Object.keys(groups).forEach(g => {
      h += '<div class="section-title">' + U.esc(g) + '</div><div class="row tight">' + groups[g].map(p => '<span class="badge">' + U.esc(p.label) + '</span>').join('') + '</div>';
    });
    h += '</div>';
    return h;
  }

  function backupTab() {
    const d = D(), can = App.auth.can('backup.manage');
    let h = '<div class="card"><div class="card-head"><h3>پشتیبانگیری و بازیابی</h3><span class="spacer"></span><span class="tiny faint">' + U.esc(U.datetime(d.meta.updatedAt)) + '</span></div>' +
      '<div class="grid cols-2 keep">' +
      '<button class="btn btn-primary" data-action="backup-export">' + I('download') + ' دریافت فایل پشتیبان (JSON)</button>' +
      '<button class="btn" data-action="backup-import" ' + (can?'':'disabled') + '>' + I('upload') + ' بازیابی از فایل</button>' +
      '</div><div class="tiny faint" style="margin-top:10px">علاوه بر این، هنگام هر تغییر یک نسخه در حافظه محلی و روی اندروید یک کپی در پوشه اختصاصی برنامه نوشته میشود؛ هنگام بستن اپلیکیشن (onPause) نیز ذخیره نهایی انجام میشود.</div></div>';
    h += '<div class="card"><div class="card-head"><h3>نسخههای خودکار روزانه</h3></div>';
    const snaps = (d.snapshots||[]).slice().reverse();
    if (!snaps.length) h += empty('نسخهای موجود نیست.','save');
    else snaps.forEach((s,i) => { h += '<div class="list-row"><span class="avatar">' + I('save','sm') + '</span><span class="lr-main"><span class="lr-title">' + U.esc(s.label) + '</span><span class="lr-sub">' + U.esc(U.datetime(s.at)) + ' · ' + M(s.data.length/1024) + ' کیلوبایت</span></span>' +
      (can ? btn('backup-restore','بازیابی','refresh','btn-sm',{index:String((d.snapshots.length-1)-i)}) : '') + '</div>'; });
    h += '</div>';
    h += '<div class="card"><div class="card-head"><h3>دادههای نمونه و بازنشانی</h3></div><div class="row">' +
      (can ? btn('demo-clear','حذف دادههای نمونه','trash','btn-danger') + btn('reset-all','بازنشانی کامل سامانه','refresh','btn-danger') : '<span class="tiny muted">برای این عملیات دسترسی «پشتیبانگیری» لازم است.</span>') + '</div>' +
      '<div class="tiny faint" style="margin-top:8px">محیط: ' + (App.device.android ? 'دستگاه اندروید (WebView بومی)' : 'پیشنمایش مرورگر') + ' · نسخه سامانه ' + App.version + '</div></div>';
    return h;
  }

  function auditTab() {
    const d = D();
    let h = '<div class="card"><div class="card-head"><h3>گزارش رویدادها</h3><span class="spacer"></span><span class="tiny faint">' + N((d.audit||[]).length) + ' رویداد</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>جزئیات</th></tr></thead><tbody>';
    (d.audit||[]).slice(0,120).forEach(a => { h += '<tr><td class="nowrap">' + U.esc(U.datetime(a.at)) + '</td><td>' + U.esc(a.userName||'—') + '</td><td><span class="badge">' + U.esc(a.action) + '</span></td><td>' + U.esc(a.detail||'') + '</td></tr>'; });
    h += '</tbody></table></div></div>';
    return h;
  }

  /* ================================ REPORTS ================================ */
  function reports() {
    const st = App.ui.state, d = D();
    const range = st.reportRange || 'today';
    const today = U.isoDate();
    const invs = (d.invoices||[]).filter(i => {
      const day = U.isoDate(i.paidAt || i.createdAt);
      if (range === 'today') return day === today;
      if (range === 'week') return (Date.now() - (i.paidAt||i.createdAt)) <= 7*86400000;
      if (range === 'month') return (Date.now() - (i.paidAt||i.createdAt)) <= 30*86400000;
      return true;
    });
    const total = U.sum(invs, i => i.total || 0);
    const discount = U.sum(invs, i => i.discount || 0);
    const byMethod = {}, byGroup = {}, byHall = {}, byWaiter = {}, byProduct = {};
    invs.forEach(i => {
      (i.payments||[]).filter(p=>!p.reversed).forEach(p => { byMethod[p.method] = (byMethod[p.method]||0) + (p.amount||0); });
      byHall[i.hallLabel||'—'] = (byHall[i.hallLabel||'—']||0) + (i.total||0);
      byWaiter[i.waiterName||'—'] = (byWaiter[i.waiterName||'—']||0) + (i.total||0);
      (i.lines||[]).forEach(l => {
        const p = App.model.product(l.productId);
        const g = App.model.group(p ? p.groupId : l.groupId);
        const key = g ? g.name : 'سایر';
        byGroup[key] = (byGroup[key]||0) + (l.price||0)*(l.qty||0);
        byProduct[l.name] = (byProduct[l.name]||0) + (l.qty||0);
      });
    });
    let h = head('گزارشات فروش', 'خلاصه عملکرد، روشهای پرداخت و پرفروشترین کالاها', btn('report-print','چاپ گزارش','print','btn-sm'));
    h += '<div class="tabs">' + [['today','امروز'],['week','۷ روز اخیر'],['month','۳۰ روز اخیر'],['all','همه']].map(x =>
      '<button class="tab ' + (range===x[0]?'active':'') + '" data-action="report-range" data-range="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
    h += '<div class="grid cols-4 keep" style="margin-bottom:14px">' +
      kpi('تعداد فاکتورها', N(invs.length), 'تسویه شده', 'info') +
      kpi('فروش خالص', M(total), d.settings.currency, 'accent') +
      kpi('میانگین فاکتور', M(invs.length ? Math.round(total/invs.length) : 0), 'به ازای هر فاکتور', '') +
      kpi('تخفیف داده شده', M(discount), 'جمع تخفیفها', 'ok') + '</div>';
    const tbl = (title, obj, unit) => {
      let s = '<div class="card"><div class="card-head"><h3>' + title + '</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>عنوان</th><th>مقدار</th></tr></thead><tbody>';
      const keys = Object.keys(obj).sort((a,b)=>obj[b]-obj[a]);
      if (!keys.length) s += '<tr><td colspan="2">' + empty('دادهای موجود نیست.','chart') + '</td></tr>';
      keys.forEach(k => { s += '<tr><td>' + U.esc(k) + '</td><td class="num strong">' + (unit==='qty'?N(obj[k]):M(obj[k])) + '</td></tr>'; });
      return s + '</tbody></table></div></div>';
    };
    h += '<div class="grid cols-2">' + tbl('بر اساس روش پرداخت', Object.keys(byMethod).reduce((o,k)=>{ o[App.pay.methodLabel(k)] = byMethod[k]; return o; }, {})) +
      tbl('بر اساس گروه کالا', byGroup) + tbl('بر اساس سالن', byHall) + tbl('بر اساس سفارشگیر', byWaiter) + tbl('پرفروشترین کالاها (تعداد)', byProduct, 'qty') + '</div>';
    h += '<div class="card"><div class="card-head"><h3>فاکتورها</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>میز</th><th>مبلغ</th><th>پرداخت</th></tr></thead><tbody>';
    if (!invs.length) h += '<tr><td colspan="5">' + empty('فاکتوری در این بازه وجود ندارد.','receipt') + '</td></tr>';
    invs.slice(0,100).forEach(i => { h += '<tr><td class="num">' + N(i.no) + '</td><td class="nowrap">' + U.esc(U.datetime(i.paidAt||i.createdAt)) + '</td><td>' + U.esc(i.tableLabel||'—') + '</td><td class="num strong">' + M(i.total) + '</td><td>' + (i.payments||[]).map(p=>App.pay.methodLabel(p.method)).join(' + ') + '</td></tr>'; });
    h += '</tbody></table></div></div>';
    return h;
  }

  /* ------------------------------- form helpers ------------------------------- */
  function field(f) {
    const dis = f.disabled ? ' disabled' : '';
    const common = 'name="' + U.esc(f.name) + '"' + dis;
    let input;
    if (f.type === 'select') input = '<select ' + common + '>' + (f.options||[]).map(o => '<option value="' + U.esc(o.value) + '" ' + (String(o.value)===String(f.value)?'selected':'') + '>' + U.esc(o.label) + '</option>').join('') + '</select>';
    else if (f.type === 'textarea') input = '<textarea ' + common + '>' + U.esc(f.value||'') + '</textarea>';
    else input = '<input type="' + (f.type||'text') + '" ' + common + ' value="' + U.esc(f.value==null?'':f.value) + '"' + (f.min!=null?' min="'+f.min+'"':'') + (f.max!=null?' max="'+f.max+'"':'') + '>';
    return '<label class="field ' + (f.full?'full':'') + '"><span>' + U.esc(f.label) + '</span>' + input + '</label>';
  }

  function stationOptions() { return opts(D().stations, 'id', 'name'); }
  function printerOptions() { return opts(D().printers, 'id', 'name'); }

  /* -------------------------------- CRUD forms -------------------------------- */
  Object.assign(App.forms, {
    hall(id) {
      if (!App.auth.can('tables.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const x = id ? App.model.hall(id) : null;
      App.ui.form({ title:x?'ویرایش سالن':'سالن جدید', fields:[
        { name:'name', label:'نام سالن', type:'text', value:x?x.name:'', required:true },
        { name:'color', label:'رنگ', type:'color', value:x?(x.color||'#f0a44b'):'#f0a44b' },
        { name:'sort', label:'ترتیب نمایش', type:'number', value:x?(x.sort||D().halls.length+1):D().halls.length+1, min:1 }
      ], onSubmit:v => {
        App.store.commit(d => {
          if (x) Object.assign(x, { name:v.name.trim(), color:v.color, sort:Number(v.sort)||1 });
          else d.halls.push({ id:U.uid('h'), name:v.name.trim(), color:v.color, sort:Number(v.sort)||1 });
        }, 'tables.manage', x?'ویرایش سالن':'افزودن سالن «' + v.name + '»');
        App.ui.render();
      } });
    },
    table(id, hallId) {
      if (!App.auth.can('tables.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const x = id ? App.model.table(id) : null;
      App.ui.form({ title:x?'ویرایش میز':'میز جدید', fields:[
        { name:'name', label:'نام میز', type:'text', value:x?x.name:'میز ' + N(D().tables.length+1), required:true },
        { name:'hallId', label:'سالن', type:'select', options:opts(D().halls,'id','name'), value:x?x.hallId:(hallId||(D().halls[0]||{}).id) },
        { name:'capacity', label:'ظرفیت (نفر)', type:'number', value:x?x.capacity:4, min:1 },
        { name:'x', label:'ستون در نقشه', type:'number', value:x?x.x:1, min:1 },
        { name:'y', label:'ردیف در نقشه', type:'number', value:x?x.y:1, min:1 },
        { name:'status', label:'وضعیت', type:'select', options:[{value:'free',label:'آزاد'},{value:'reserved',label:'رزرو'},{value:'occupied',label:'مشغول'},{value:'billed',label:'منتظر تسویه'}], value:x?x.status:'free' }
      ], onSubmit:v => {
        App.store.commit(d => {
          const o = { name:v.name.trim(), hallId:v.hallId, capacity:Number(v.capacity)||4, x:Number(v.x)||1, y:Number(v.y)||1, status:v.status };
          if (x) Object.assign(x, o);
          else d.tables.push(Object.assign({ id:U.uid('t'), orderId:null }, o));
        }, 'tables.manage', x?'ویرایش میز':'افزودن میز «' + v.name + '»');
        App.ui.render();
      } });
    },
    group(id) {
      if (!App.auth.can('menu.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const g = id ? App.model.group(id) : null;
      App.ui.form({ title:g?'ویرایش گروه':'گروه کالای جدید', size:'wide', fields:[
        { name:'name', label:'نام گروه', type:'text', value:g?g.name:'', required:true },
        { name:'color', label:'رنگ', type:'color', value:g?(g.color||'#f0a44b'):'#f0a44b' },
        { name:'sort', label:'ترتیب نمایش', type:'number', value:g?(g.sort||D().groups.length+1):D().groups.length+1, min:1 },
        { name:'copies', label:'تعداد نسخه چاپ آشپزخانه', type:'number', value:g?(g.copies||1):1, min:1, max:5 },
        { name:'stationIds', label:'خط (های) چاپ آشپزخانه', type:'multi', options:stationOptions(), value:g?(g.stationIds||[]):[] , hint:'اقلام این گروه فقط به چاپگرهای این خطوط ارسال میشود.' },
        { name:'active', label:'گروه فعال باشد', type:'checkbox', value:g?g.active!==false:true }
      ], onSubmit:v => {
        const sts = Array.isArray(v.stationIds) ? v.stationIds.filter(Boolean) : [];
        App.store.commit(d => {
          const o = { name:v.name.trim(), color:v.color, sort:Number(v.sort)||1, copies:Math.max(1,Number(v.copies)||1), stationIds:sts, active:!!v.active };
          if (g) Object.assign(g, o); else d.groups.push(Object.assign({ id:U.uid('g') }, o));
        }, 'menu.manage', (g?'ویرایش':'افزودن') + ' گروه «' + v.name + '»');
        App.ui.render();
      } });
    },
    product(id) {
      if (!App.auth.can('menu.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const p = id ? App.model.product(id) : null;
      App.ui.form({ title:p?'ویرایش کالا':'کالای جدید', size:'wide', fields:[
        { name:'name', label:'نام کالا', type:'text', value:p?p.name:'', required:true },
        { name:'code', label:'کد کالا', type:'text', value:p?(p.code||''):'' },
        { name:'price', label:'قیمت (تومان)', type:'number', value:p?p.price:0, min:0, required:true },
        { name:'groupId', label:'گروه', type:'select', options:opts(D().groups,'id','name'), value:p?p.groupId:(D().groups[0]||{}).id },
        { name:'description', label:'توضیحات', type:'textarea', value:p?(p.description||''):'' },
        { name:'stationIds', label:'خط چاپ اختصاصی (اختیاری)', type:'multi', options:stationOptions(), value:p?(p.stationIds||[]):[], hint:'در صورت خالی بودن، خط چاپ گروه استفاده میشود.' },
        { name:'active', label:'کالا قابل فروش باشد', type:'checkbox', value:p?p.active!==false:true }
      ], onSubmit:v => {
        const sts = Array.isArray(v.stationIds) ? v.stationIds.filter(Boolean) : [];
        App.store.commit(d => {
          const o = { name:v.name.trim(), code:v.code.trim(), price:Math.max(0,Number(v.price)||0), groupId:v.groupId, description:v.description, stationIds:sts, active:!!v.active };
          if (p) Object.assign(p, o); else d.products.push(Object.assign({ id:U.uid('p'), sort:99 }, o));
        }, 'menu.manage', (p?'ویرایش':'افزودن') + ' کالای «' + v.name + '»');
        App.ui.render();
      } });
    },
    printer(id) {
      if (!App.auth.can('printers.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const p = id ? App.model.printer(id) : null;
      App.ui.form({ title:p?'ویرایش چاپگر':'تعریف چاپگر', size:'wide', note:'<div class="tiny muted" style="margin-bottom:12px">XPrinter 80mm معمولاً از USB Host (OTG) یا شبکه با IP و پورت ۹۱۰۰ استفاده میکند. چاپگر ۵۸ میلیمتری = کاغذ ۶ سانتی.</div>', fields:[
        { name:'name', label:'نام چاپگر', type:'text', value:p?p.name:'', required:true },
        { name:'kind', label:'نوع اتصال', type:'select', options:[{value:'network',label:'شبکه / IP (پورت ۹۱۰۰)'},{value:'usb',label:'USB / XPrinter (OTG)'},{value:'bluetooth',label:'بلوتوث SPP'},{value:'system',label:'چاپگر سیستم / PDF'}], value:p?p.kind:'network' },
        { name:'width', label:'عرض کاغذ', type:'select', options:[{value:'80',label:'۸۰ میلیمتر (۸ سانتی)'},{value:'58',label:'۵۸ میلیمتر (۶ سانتی)'}], value:p?String(p.width):'80' },
        { name:'usage', label:'کاربرد', type:'select', options:[{value:'invoice',label:'چاپ صورتحساب'},{value:'kitchen',label:'چاپ آشپزخانه'},{value:'both',label:'هر دو'}], value:p?p.usage:'invoice' },
        { name:'ip', label:'آدرس IP (حالت شبکه)', type:'text', value:p?(p.ip||''):'192.168.1.50', hint:'مثال: 192.168.1.50' },
        { name:'port', label:'پورت', type:'number', value:p?(p.port||9100):9100, min:1 },
        { name:'mac', label:'آدرس MAC (بلوتوث)', type:'text', value:p?(p.mac||''):'', hint:'مثال: 00:11:22:33:44:55' },
        { name:'vendorId', label:'Vendor ID (USB)', type:'number', value:p?(p.vendorId||1046):1046, hint:'XPrinter معمولاً ۱۰۴۶ (0x0416) یا ۱۱۵۵ (0x0483) است.' },
        { name:'productId', label:'Product ID (USB)', type:'number', value:p?(p.productId||20497):20497 },
        { name:'copies', label:'تعداد نسخه چاپ', type:'number', value:p?(p.copies||1):1, min:1, max:5 },
        { name:'enabled', label:'چاپگر فعال باشد', type:'checkbox', value:p?p.enabled!==false:true },
        { name:'cut', label:'برش خودکار کاغذ', type:'checkbox', value:p?p.cut!==false:true },
        { name:'drawer', label:'باز کردن کشوی پول', type:'checkbox', value:p?!!p.drawer:false }
      ], onSubmit:v => {
        App.store.commit(d => {
          const o = { name:v.name.trim(), kind:v.kind, width:Number(v.width), usage:v.usage, ip:v.ip.trim(), port:Number(v.port)||9100,
            mac:v.mac.trim(), vendorId:Number(v.vendorId)||0, productId:Number(v.productId)||0, copies:Math.max(1,Number(v.copies)||1),
            enabled:!!v.enabled, cut:!!v.cut, drawer:!!v.drawer, header:'', footer:'' };
          if (p) Object.assign(p, o); else d.printers.push(Object.assign({ id:U.uid('pr') }, o));
        }, 'printers.manage', (p?'ویرایش':'افزودن') + ' چاپگر «' + v.name + '»');
        App.ui.render();
      } });
    },
    station(id) {
      if (!App.auth.can('printers.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const s = id ? App.model.station(id) : null;
      App.ui.form({ title:s?'ویرایش خط چاپ':'خط چاپ جدید', fields:[
        { name:'name', label:'نام خط / ایستگاه', type:'text', value:s?s.name:'', required:true },
        { name:'printerId', label:'چاپگر این خط', type:'select', options:printerOptions(), value:s?s.printerId:(D().printers[0]||{}).id },
        { name:'copies', label:'تعداد نسخه', type:'number', value:s?(s.copies||1):1, min:1, max:5 },
        { name:'sort', label:'ترتیب', type:'number', value:s?(s.sort||D().stations.length+1):D().stations.length+1 },
        { name:'enabled', label:'خط فعال باشد', type:'checkbox', value:s?s.enabled!==false:true }
      ], onSubmit:v => {
        App.store.commit(d => {
          const o = { name:v.name.trim(), printerId:v.printerId, copies:Math.max(1,Number(v.copies)||1), sort:Number(v.sort)||1, enabled:!!v.enabled };
          if (s) Object.assign(s, o); else d.stations.push(Object.assign({ id:U.uid('s') }, o));
        }, 'printers.manage', (s?'ویرایش':'افزودن') + ' خط چاپ «' + v.name + '»');
        App.ui.render();
      } });
    },
    psp(id) {
      if (!App.auth.can('settings.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const p = id ? App.model.D().psps.find(x=>x.id===id) : null;
      App.ui.form({ title:p?'ویرایش درگاه PSP':'درگاه PSP جدید', size:'wide', fields:[
        { name:'name', label:'نام درگاه', type:'text', value:p?p.name:'', required:true },
        { name:'packageName', label:'Package name اپلیکیشن PSP', type:'text', value:p?(p.packageName||''):'', hint:'مثال: com.pec.payment' },
        { name:'action', label:'Action مربوط به خرید', type:'text', value:p?(p.action||''):'', hint:'مثال: ir.pec.payment.PURCHASE' },
        { name:'amountKey', label:'کلید مبلغ در Intent', type:'text', value:p?(p.amountKey||'amount'):'amount' },
        { name:'invoiceKey', label:'کلید شماره فاکتور', type:'text', value:p?(p.invoiceKey||'invoiceNumber'):'invoiceNumber' },
        { name:'terminalId', label:'شماره ترمینال', type:'text', value:p?(p.terminalId||''):'' },
        { name:'merchantId', label:'شماره پذیرنده', type:'text', value:p?(p.merchantId||''):'' },
        { name:'responseKeys', label:'کلیدهای پاسخ (JSON)', type:'textarea', value:p?JSON.stringify(p.responseKeys||{}):'{"code":"responseCode","ref":"referenceNumber","trace":"traceNumber","pan":"maskedPan"}' },
        { name:'enabled', label:'درگاه فعال باشد', type:'checkbox', value:p?p.enabled!==false:true },
        { name:'note', label:'یادداشت', type:'text', value:p?(p.note||''):'' }
      ], onSubmit:v => {
        let keys = {};
        try { keys = JSON.parse(v.responseKeys || '{}'); } catch (e) { keys = {}; }
        App.store.commit(d => {
          const o = { name:v.name.trim(), packageName:v.packageName.trim(), action:v.action.trim(), amountKey:v.amountKey||'amount',
            invoiceKey:v.invoiceKey||'invoiceNumber', terminalId:v.terminalId, merchantId:v.merchantId, responseKeys:keys, enabled:!!v.enabled, note:v.note };
          if (p) Object.assign(p, o); else d.psps.push(Object.assign({ id:U.uid('psp') }, o));
        }, 'settings.manage', (p?'ویرایش':'افزودن') + ' درگاه «' + v.name + '»');
        App.ui.render();
      } });
    },
    user(id, presetRole) {
      if (!App.auth.can('users.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const u = id ? D().users.find(x=>x.id===id) : null;
      const permFields = [];
      const byGroup = {};
      App.PERMISSIONS.forEach(p => { (byGroup[p.group] = byGroup[p.group]||[]).push({ value:p.key, label:p.label }); });
      let gi = 0;
      Object.keys(byGroup).forEach(g => permFields.push({ name:'perm_' + (gi++), label:g, type:'multi', options:byGroup[g], value:(u && u.permissions)||(App.ROLES[presetRole||'cashier'].permissions) }));
      App.ui.form({ title:u?'ویرایش کاربر':'کاربر جدید', size:'wide',
        note:'<div class="tiny muted" style="margin-bottom:10px">با انتخاب یکی از نقشها، مجوزهای همان نقش اعمال میشود. برای تنظیم دستی، نقش «سفارشی» را انتخاب کنید.</div>',
        fields:[
          { name:'username', label:'نام کاربری', type:'text', value:u?u.username:'', required:true },
          { name:'name', label:'نام و نام خانوادگی', type:'text', value:u?u.name:'', required:true },
          { name:'role', label:'نقش / سطح دسترسی', type:'select', options:Object.keys(App.ROLES).map(k=>({value:k,label:App.ROLES[k].label + ' — ' + App.ROLES[k].desc})), value:u?u.role:'waiter' },
          { name:'password', label:u?'رمز عبور جدید (در صورت تغییر خالی بگذارید)':'رمز عبور', type:'password', value:'' },
          { name:'active', label:'حساب فعال باشد', type:'checkbox', value:u?u.active!==false:true }
        ].concat(permFields),
        onSubmit:v => {
          let perms;
          if (v.role === 'custom') {
            perms = [];
            Object.keys(v).forEach(k => { if (k.indexOf('perm_')===0 && Array.isArray(v[k])) perms = perms.concat(v[k]); });
            perms = perms.filter(Boolean);
          } else perms = App.ROLES[v.role].permissions.slice();
          App.store.commit(d => {
            if (u) {
              Object.assign(u, { username:v.username.trim(), name:v.name.trim(), role:v.role, permissions:perms, active:!!v.active });
              if (v.password) u.passHash = App.auth.hash(v.password);
            } else d.users.push({ id:U.uid('u'), username:v.username.trim(), name:v.name.trim(), role:v.role, permissions:perms, active:!!v.active, passHash:App.auth.hash(v.password||'1234'), createdAt:Date.now() });
          }, 'users.manage', (u?'ویرایش':'ایجاد') + ' کاربر «' + v.username + '»');
          App.ui.render();
        } });
    },
    userPass(id) {
      if (!App.auth.can('users.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      App.ui.form({ title:'تغییر رمز عبور', fields:[{ name:'password', label:'رمز عبور جدید', type:'password', required:true }],
        onSubmit:v => { App.auth.setPassword(id, v.password); App.ui.toast('رمز عبور تغییر کرد.','ok'); } });
    }
  });

  /* ------------------------------- actions ------------------------------- */
  Object.assign(App.actions, {
    'menu-tab': el => { App.ui.state.menuTab = el.dataset.tab; App.ui.render(); },
    'settings-tab': el => { App.ui.state.settingsTab = el.dataset.tab; App.ui.render(); },
    'report-range': el => { App.ui.state.reportRange = el.dataset.range; App.ui.render(); },
    'group-add': () => App.forms.group(null),
    'group-edit': el => App.forms.group(el.dataset.id),
    'group-del': el => {
      const g = App.model.group(el.dataset.id); if (!g) return;
      const count = D().products.filter(p=>p.groupId===g.id).length;
      App.ui.confirm('گروه «' + g.name + '» حذف شود؟' + (count ? ' (' + App.util.num(count) + ' کالا بدون گروه میشود)' : ''), () => {
        App.store.commit(d => { d.groups = d.groups.filter(x=>x.id!==g.id); }, 'menu.manage', 'حذف گروه ' + g.name);
        App.ui.render();
      });
    },
    'product-add': () => App.forms.product(null),
    'product-edit': el => App.forms.product(el.dataset.id),
    'product-del': el => {
      const p = App.model.product(el.dataset.id); if (!p) return;
      App.ui.confirm('کالای «' + p.name + '» حذف شود؟', () => {
        App.store.commit(d => { d.products = d.products.filter(x=>x.id!==p.id); }, 'menu.manage', 'حذف کالا ' + p.name); App.ui.render();
      });
    },
    'hall-del': el => {
      const h = App.model.hall(el.dataset.id); if (!h) return;
      const count = D().tables.filter(t=>t.hallId===h.id).length;
      App.ui.confirm('سالن «' + h.name + '» و ' + App.util.num(count) + ' میز آن حذف شوند؟', () => {
        App.store.commit(d => { d.halls = d.halls.filter(x=>x.id!==h.id); d.tables = d.tables.filter(t=>t.hallId!==h.id); if (App.ui.state.hallId===h.id) App.ui.state.hallId = null; }, 'tables.manage', 'حذف سالن ' + h.name);
        App.ui.render();
      });
    },
    'table-del': el => {
      const t = App.model.table(el.dataset.id); if (!t) return;
      App.ui.confirm('میز «' + t.name + '» حذف شود؟', () => {
        App.store.commit(d => { d.tables = d.tables.filter(x=>x.id!==t.id); }, 'tables.manage', 'حذف میز ' + t.name); App.ui.render();
      });
    },
    'printer-add': () => App.forms.printer(null),
    'printer-edit': el => App.forms.printer(el.dataset.id),
    'printer-del': el => {
      const p = App.model.printer(el.dataset.id); if (!p) return;
      App.ui.confirm('چاپگر «' + p.name + '» حذف شود؟', () => {
        App.store.commit(d => { d.printers = d.printers.filter(x=>x.id!==p.id); d.stations.forEach(s => { if (s.printerId===p.id) s.printerId = ''; }); }, 'printers.manage', 'حذف چاپگر ' + p.name);
        App.ui.render();
      });
    },
    'printer-test': async el => {
      const p = App.model.printer(el.dataset.id); if (!p) return;
      App.ui.toast('در حال ارسال برگه تست…');
      const r = await App.print.testPrinter(p);
      if (r.ok) App.ui.toast('برگه تست به «' + p.name + '» ارسال شد. ' + (r.info||''), 'ok');
      else App.ui.toast('خطا: ' + (r.error||''), 'err');
      App.ui.render();
    },
    'printer-discover': () => {
      let usb = [], bt = [];
      if (App.device.android && window.AndroidPOS) {
        try { usb = JSON.parse(AndroidPOS.listUsbDevices() || '[]'); } catch(e) {}
        try { bt = JSON.parse(AndroidPOS.listBluetoothDevices() || '[]'); } catch(e) {}
      }
      let body = '<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>دستگاههای USB</h3></div>';
      body += usb.length ? usb.map(x=>'<div class="list-row"><span class="lr-main"><span class="lr-title">' + U.esc(x.name||'چاپگر USB') + '</span><span class="lr-sub ltr">VID ' + x.vendorId + ' / PID ' + x.productId + '</span></span></div>').join('') : empty(App.device.android?'دستگاه USB ای یافت نشد. اتصال OTG و مجوز دسترسی را بررسی کنید.':'لیست دستگاههای USB فقط روی اندروید در دسترس است.','usb');
      body += '</div><div class="card"><div class="card-head"><h3>دستگاههای بلوتوث جفت شده</h3></div>';
      body += bt.length ? bt.map(x=>'<div class="list-row"><span class="lr-main"><span class="lr-title">' + U.esc(x.name||'چاپگر') + '</span><span class="lr-sub ltr">' + U.esc(x.mac||'') + '</span></span></div>').join('') : empty(App.device.android?'چاپگر بلوتوثی یافت نشد.':'لیست بلوتوث فقط روی اندروید در دسترس است.','bluetooth');
      body += '</div>';
      App.ui.modal({ title:'جستجوی چاپگرهای متصل', size:'wide', body, buttons:[{ label:'بستن', close:true }] });
    },
    'station-add': () => App.forms.station(null),
    'station-edit': el => App.forms.station(el.dataset.id),
    'station-del': el => {
      const s = App.model.station(el.dataset.id); if (!s) return;
      App.ui.confirm('خط چاپ «' + s.name + '» حذف شود؟', () => {
        App.store.commit(d => {
          d.stations = d.stations.filter(x=>x.id!==s.id);
          d.groups.forEach(g => { g.stationIds = (g.stationIds||[]).filter(id=>id!==s.id); });
        }, 'printers.manage', 'حذف خط چاپ ' + s.name);
        App.ui.render();
      });
    },
    'matrix-toggle': el => {
      if (!App.auth.can('printers.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      const g = App.model.group(el.dataset.group), sid = el.dataset.station;
      if (!g) return;
      App.store.commit(() => {
        g.stationIds = g.stationIds || [];
        const i = g.stationIds.indexOf(sid);
        if (i === -1) g.stationIds.push(sid); else g.stationIds.splice(i,1);
      }, 'printers.manage', 'تغییر خط چاپ گروه ' + g.name);
      App.ui.render();
    },
    'psp-add': () => App.forms.psp(null),
    'psp-edit': el => App.forms.psp(el.dataset.id),
    'psp-del': el => {
      const p = D().psps.find(x=>x.id===el.dataset.id); if (!p) return;
      App.ui.confirm('درگاه «' + p.name + '» حذف شود؟', () => {
        App.store.commit(d => { d.psps = d.psps.filter(x=>x.id!==p.id); }, 'settings.manage', 'حذف درگاه ' + p.name); App.ui.render();
      });
    },
    'psp-test': async el => {
      const p = D().psps.find(x=>x.id===el.dataset.id); if (!p) return;
      const r = await App.pay.pspPay(p, 1000, 0);
      App.ui.toast(r.ok ? 'ارتباط با «' + p.name + '» برقرار شد (کد ' + r.code + ').' : 'عدم موفقیت: ' + r.message, r.ok?'ok':'err');
    },
    'user-add': () => App.forms.user(null),
    'user-edit': el => App.forms.user(el.dataset.id),
    'user-pass': el => App.forms.userPass(el.dataset.id),
    'user-del': el => {
      const u = D().users.find(x=>x.id===el.dataset.id); if (!u) return;
      App.ui.confirm('کاربر «' + u.name + '» حذف شود؟', () => {
        App.store.commit(d => { d.users = d.users.filter(x=>x.id!==u.id); }, 'users.manage', 'حذف کاربر ' + u.name); App.ui.render();
      });
    },
    'backup-export': () => {
      const name = 'hooshyar-backup-' + U.isoDate() + '-' + Date.now() + '.json';
      U.download(name, App.store.export(), 'application/json');
      App.audit('backup', 'دریافت فایل پشتیبان'); App.store.saveNow();
      App.ui.toast('فایل پشتیبان ذخیره شد.','ok');
    },
    'backup-import': () => {
      if (!App.auth.can('backup.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      App.ui.form({ title:'بازیابی از فایل پشتیبان', note:'<div class="login-error">اطلاعات فعلی به طور کامل جایگزین میشود. پیش از ادامه یک نسخه پشتیبان تهیه کنید.</div>',
        fields:[{ name:'file', label:'فایل JSON پشتیبان', type:'file', required:true }], submit:'بازیابی',
        onSubmit: v => {
          const f = v.file; if (!f) return;
          const reader = new FileReader();
          reader.onload = () => { try { App.store.import(String(reader.result)); App.ui.close(); App.ui.render(); App.ui.toast('اطلاعات بازیابی شد.','ok'); } catch (e) { App.ui.toast('خطا: ' + e.message,'err'); } };
          reader.readAsText(f);
        } });
    },
    'backup-restore': el => {
      const d = D(), s = d.snapshots[Number(el.dataset.index)];
      if (!s) return;
      App.ui.confirm('نسخه «' + s.label + '» بازیابی شود؟ اطلاعات فعلی جایگزین خواهد شد.', () => {
        try { App.store.import(s.data); App.ui.toast('نسخه خودکار بازیابی شد.','ok'); App.ui.render(); } catch(e) { App.ui.toast(e.message,'err'); }
      });
    },
    'demo-clear': () => App.ui.confirm('همه سفارشها، فاکتورها و دادههای نمونه حذف شوند؟ تنظیمات و منو باقی میمانند.', () => { App.store.clearDemo(); App.ui.render(); App.ui.toast('دادههای نمونه حذف شد.','ok'); }),
    'reset-all': () => App.ui.confirm('هشدار: سامانه به حالت اولیه بازمیگردد و همه اطلاعات (کاربران، منو، فاکتورها) پاک میشود. ادامه میدهید؟', () => {
      App.store.resetAll(); location.reload();
    }),
    'menu-export': () => {
      const rows = [['کد','نام کالا','گروه','قیمت','خطوط چاپ','فعال']];
      D().products.forEach(p => rows.push([p.code||'', p.name, (App.model.group(p.groupId)||{}).name||'', p.price, (p.stationIds||[]).join('|'), p.active===false?'0':'1']));
      const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
      U.download('hooshyar-menu.csv', csv, 'text/csv;charset=utf-8');
      App.ui.toast('فهرست کالاها صادر شد.','ok');
    },
    'menu-import': () => {
      if (!App.auth.can('menu.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      App.ui.form({ title:'ورود کالاها از CSV', note:'<div class="tiny muted" style="margin-bottom:8px">ستونها: کد، نام، گروه، قیمت، خطوط چاپ، فعال. گروههای ناشناخته ایجاد نمیشوند.</div>',
        fields:[{ name:'csv', label:'محتوای CSV', type:'textarea', required:true }], submit:'درج / بروزرسانی کالاها',
        onSubmit:v => {
          const lines = String(v.csv).split(/\r?\n/).filter(Boolean);
          let count = 0;
          App.store.commit(d => {
            lines.forEach((ln,i) => {
              if (i===0 && /کد|code/i.test(ln)) return;
              const cells = (ln.match(/("([^"]|"")*"|[^,]+)/g)||[]).map(x=>x.replace(/^"|"$/g,'').replace(/""/g,'"').trim());
              if (cells.length < 4 || !cells[1]) return;
              let g = d.groups.find(x=>x.name===cells[2]) || d.groups[0];
              if (!g) return;
              const code = cells[0];
              const existing = d.products.find(x=>x.code===code && code);
              const price = Number(String(cells[3]).replace(/[^\d]/g,'')) || 0;
              if (existing) { existing.name=cells[1]; existing.groupId=g.id; existing.price=price; }
              else d.products.push({ id:U.uid('p'), code, name:cells[1], groupId:g.id, price, description:'', stationIds:[], active:true, sort:99 });
              count++;
            });
          }, 'menu.manage', 'ورود ' + count + ' کالا از CSV');
          App.ui.render(); App.ui.toast(App.util.num(count) + ' کالا وارد/بروزرسانی شد.','ok');
        } });
    },
    'report-print': () => {
      const range = App.ui.state.reportRange || 'today';
      const rows = document.querySelectorAll('#view .tbl');
      let html = '<div class="p-center"><div class="p-title">' + U.esc(D().settings.restaurantName) + '</div><b>گزارش فروش</b><div class="p-small">' + U.datetime() + '</div></div><div class="p-sep"></div>';
      const kpis = document.querySelectorAll('#view .kpi');
      kpis.forEach(k => { html += '<div class="p-row"><span>' + U.esc(k.querySelector('.k-label').textContent) + '</span><span>' + U.esc(k.querySelector('.k-value').textContent) + '</span></div>'; });
      html += '<div class="p-sep"></div><div class="p-center p-small">سامانه هوشیار · بازه: ' + ({today:'امروز',week:'۷ روز',month:'۳۰ روز',all:'همه'}[range]) + '</div>';
      App.print.browserPrint(html, 80);
    }
  });

  /* ------------------------------- input handlers ------------------------------- */
  Object.assign(App.inputs, {
    'slot-amount': el => setDraft(el, 'amount', el.value),
    'slot-psp': el => setDraft(el, 'pspId', el.value),
    'slot-customer': el => setDraft(el, 'customerId', el.value),
    'slot-cash': el => setDraft(el, 'cashReceived', el.value),
    'slot-note': el => setDraft(el, 'note', el.value),
    'product-admin-search': el => {
      App.ui.state.adminSearch = el.value;
      const q = el.value.trim();
      document.querySelectorAll('#view table.tbl tbody tr').forEach(tr => {
        tr.style.display = (!q || tr.textContent.indexOf(q)!==-1) ? '' : 'none';
      });
    }
  });
  function setDraft(el, key, value) {
    const st = App.ui.state; st.slotDraft = st.slotDraft || {};
    st.slotDraft[el.dataset.slot] = Object.assign({}, st.slotDraft[el.dataset.slot], { [key]:value });
  }

  /* ------------------------------- form submit handlers ------------------------------- */
  App.formHandlers = App.formHandlers || {};
  Object.assign(App.formHandlers, {
    general: (form, values) => {
      if (!App.auth.can('settings.manage')) return App.ui.toast('دسترسی کافی ندارید.','err');
      App.store.commit(d => {
        const s = d.settings;
        s.restaurantName = values.restaurantName; s.address = values.address; s.phone = values.phone;
        s.currency = values.currency; s.taxPercent = Math.max(0,Number(values.taxPercent)||0);
        s.servicePercent = Math.max(0,Number(values.servicePercent)||0);
        s.invoiceWidth = Number(values.invoiceWidth)||80; s.kitchenWidth = Number(values.kitchenWidth)||80;
        s.headerNote = values.headerNote; s.footer = values.footer; s.autoSave = !!values.autoSave;
      }, 'settings.manage', 'بروزرسانی تنظیمات عمومی');
      App.ui.render(); App.ui.toast('تنظیمات ذخیره شد.','ok');
    }
  });

  App.views.menu = menu;
  App.views.settings = settings;
  App.views.reports = reports;
  App.views.SETTINGS_TABS = SETTINGS_TABS;
})();
