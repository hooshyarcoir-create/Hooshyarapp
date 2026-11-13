/* ============================================================================
 * Hooshyar POS v2 — shared UI helpers, two-step login, management dashboard
 * ==========================================================================*/
'use strict';
window.App = window.App || {};
App.actions = App.actions || {};
App.inputs = App.inputs || {};
App.formHandlers = App.formHandlers || {};

App.views = (function () {
  const U = App.util, N = U.num, M = U.money, I = U.icon;
  const D = () => App.model.D();
  const opts = (arr,vk,lk) => (arr||[]).map(x=>({ value:x[vk], label:x[lk] }));

  function head(title,sub,actions) {
    return '<div class="page-head"><div><h2>'+title+'</h2><p>'+(sub||'')+'</p></div><div class="spacer"></div>'+(actions||'')+'</div>';
  }
  function empty(text,ico) { return '<div class="empty">'+I(ico||'info','lg')+'<div>'+text+'</div></div>'; }
  function kpi(label,value,foot,cls) {
    return '<div class="kpi '+(cls||'')+'"><div class="k-label">'+label+'</div><div class="k-value num">'+value+'</div><div class="k-foot">'+(foot||'')+'</div></div>';
  }
  function btn(action,label,ico,cls,data) {
    let d=''; Object.keys(data||{}).forEach(k=>{ d += ' data-'+k+'="'+U.esc(data[k])+'"'; });
    return '<button class="btn '+(cls||'')+'" data-action="'+action+'"'+d+'>'+(ico?I(ico):'')+' '+label+'</button>';
  }
  function statusBadge(s) { return '<span class="badge '+App.domain.statusClass(s)+'">'+App.domain.statusLabel(s)+'</span>'; }
  function paper(html,w) { return '<div class="paper-stage"><div class="paper '+(Number(w)===58?'w58':'')+'">'+html+'</div></div>'; }
  function chips(items,action,active,key) {
    return '<div class="chips">'+items.map(x=>'<button class="chip '+(String(active)===String(x[key||'id'])?'active':'')+'" data-action="'+action+'" data-id="'+U.esc(x[key||'id'])+'">'+U.esc(x.label)+'</button>').join('')+'</div>';
  }
  function table(headers,rows,foot) {
    let h='<div class="tbl-wrap"><table class="tbl"><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
    h += rows.length ? rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('') : '<tr><td colspan="'+headers.length+'">'+empty('دادهای موجود نیست.','chart')+'</td></tr>';
    if (foot) h += '<tfoot><tr>'+foot.map(c=>'<td>'+c+'</td>').join('')+'</tr></tfoot>';
    return h+'</tbody></table></div>';
  }
  /** Dependency-free responsive SVG bar chart. */
  function barChart(data, o) {
    o = o || {};
    const height = o.height || 170, max = Math.max(1, ...data.map(d=>Number(d.value)||0));
    const n = Math.max(1,data.length), gap = o.gap == null ? 8 : o.gap;
    const W = 100, bw = (100 - gap*(n-1))/n;
    let bars = '';
    data.forEach((d,i) => {
      const v = Math.max(0,Number(d.value)||0), h = Math.max(v>0?1.5:0, v/max*(height-40));
      const x = i*(bw+gap), y = height-24-h;
      bars += '<rect x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+bw.toFixed(2)+'" height="'+h.toFixed(2)+'" rx="1.2" fill="'+(o.color||'var(--accent)')+'" opacity="'+(0.55+0.45*v/max).toFixed(2)+'"><title>'+U.esc(d.label)+': '+U.esc(o.fmt?o.fmt(v):N(v))+'</title></rect>';
      if (o.labels !== false && (n<=12 || i%Math.ceil(n/12)===0))
        bars += '<text x="'+(x+bw/2).toFixed(2)+'" y="'+(height-7)+'" text-anchor="middle" font-size="3.4" fill="var(--faint)">'+U.esc(d.label)+'</text>';
    });
    return '<svg class="chart" viewBox="0 0 '+W+' '+height+'" preserveAspectRatio="none" role="img" aria-label="نمودار">'+
      '<line x1="0" y1="'+(height-24)+'" x2="100" y2="'+(height-24)+'" stroke="var(--line)" stroke-width="0.5"/> '+bars+'</svg>';
  }

  /* ---------------------------- two-step login ---------------------------- */
  function login() {
    const st = App.ui.state, s = D().settings;
    if (st.loginStep !== 2 || !st.loginUserId) {
      const users = App.auth.users();
      const selected=st.loginCandidateId||'';
      const picked=users.find(u=>u.id===selected);
      return '<div class="login-box">' +
        '<div class="login-head"><div class="brand-mark">ه</div><h2>'+U.esc(s.restaurantName)+'</h2><p>مرحله ۱ از ۲ · کاربر خود را از فهرست انتخاب کنید</p></div>' +
        (users.length ? '<label class="field login-user-field"><span>کاربر ورود</span><div class="login-select-wrap"><select class="login-user-select" data-input="login-user" aria-label="انتخاب کاربر"><option value="">— انتخاب کاربر —</option>'+users.map(u=>'<option value="'+U.esc(u.id)+'" '+(u.id===selected?'selected':'')+'>'+U.esc(u.name)+' · '+U.esc(u.username)+' · '+U.esc(App.auth.roleLabel(u))+'</option>').join('')+'</select><span class="login-select-icon">⌄</span></div></label>'+
          '<div class="login-user-preview '+(picked?'ready':'')+'">'+(picked?'<span class="avatar">'+U.esc((picked.name||'?').slice(0,1))+'</span><span><b>'+U.esc(picked.name)+'</b><small>'+U.esc(App.auth.roleLabel(picked))+'</small></span><span class="badge accent">انتخاب شد</span>':'<span class="login-preview-dot"></span><span><b>ابتدا کاربر را انتخاب کنید</b><small>نقش کاربر پس از انتخاب نمایش داده می‌شود</small></span>')+'</div>'+
          '<button class="btn btn-primary btn-block btn-lg" data-action="login-continue" '+(picked?'':'disabled')+'>'+I('check')+' ادامه ورود</button>' : empty('هیچ کاربر فعالی تعریف نشده است.','users')) +
        '<div class="login-foot">سامانه مدیریت عملیات رستوران · نسخه '+App.version+'</div></div>';
    }
    const u = App.auth.users().find(x=>x.id===st.loginUserId);
    return '<div class="login-box">' +
      '<div class="login-head"><div class="brand-mark">ه</div><h2>'+U.esc(s.restaurantName)+'</h2><p>مرحله ۲ از ۲ · رمز عبور</p></div>' +
      '<div id="login-error"></div>' +
      '<div class="card" style="margin-bottom:16px;display:flex;gap:10px;align-items:center"><span class="avatar">'+U.esc((u.name||'?').slice(0,1))+'</span><div><b>'+U.esc(u.name)+'</b><div class="tiny muted">'+U.esc(App.auth.roleLabel(u))+'</div></div><span class="spacer"></span>'+btn('login-back','تغییر کاربر','refresh','btn-sm')+'</div>' +
      '<form data-form="login" autocomplete="off"><input type="hidden" name="userId" value="'+U.esc(st.loginUserId)+'">' +
        '<label class="field"><span>رمز عبور</span><div class="input-icon">'+I('lock')+'<input type="password" name="password" placeholder="••••" autocomplete="current-password" required autofocus></div></label>' +
        '<label class="check-line" style="margin-bottom:14px"><input type="checkbox" name="remember" checked> مرا به خاطر بسپار</label>' +
        '<button class="btn btn-primary btn-block btn-lg" type="submit">'+I('check')+' ورود به کنسول</button></form>' +
      '<div class="login-foot">حساب پیشفرض: <b>admin / ۱۲۳۴</b> · صندوق: cashier / ۲۲۲۲ · سالن: waiter / ۳۳۳۳</div></div>';
  }

  /* ----------------------------- dashboard ----------------------------- */
  function dashboard() {
    const f = App.report.defaultFilters(); f.range='today';
    const today = U.isoDate();
    const all = App.report.filter({ from:'', to:'', status:'' });
    const todays = all.filter(i => U.isoDate(i.paidAt||i.createdAt) === today);
    const month = all.filter(i => (Date.now()-(i.paidAt||i.createdAt)) <= 30*86400000);
    const s = App.report.summary(todays), sm = App.report.summary(month);
    const items = App.report.items(all).slice(0,10), low = App.report.items(all).slice(-5).reverse();
    const waiters = App.report.waiters(todays), alerts = App.report.stockAlerts();
    let h = head('پیشخوان مدیریت', 'شاخصهای لحظهای فروش، عملکرد و هشدارها',
      btn('nav','کنسول فروش','grid','btn-primary',{screen:'console'}) + btn('nav','گزارشات','chart','btn-sm',{screen:'reports'}));
    h += '<div class="grid cols-4 keep" style="margin-bottom:14px">' +
      kpi('فروش امروز',M(s.total),N(s.count)+' فاکتور','accent') +
      kpi('فروش ۳۰ روز',M(sm.total),N(sm.count)+' فاکتور','info') +
      kpi('سفارشات جاری',N(App.report.orders().length),'میز اشغال','warn') +
      kpi('میانگین فاکتور',M(s.average),D().settings.currency,'ok') + '</div>';
    h += '<div class="grid cols-2">' +
      '<div class="card"><div class="card-head"><h3>تفکیک فروش امروز</h3></div>' +
        Object.keys(s.byMethod).map(k=>'<div class="t-row"><span>'+U.esc(App.report.METHOD_LABEL[k]||k)+'</span><span class="num strong">'+M(s.byMethod[k])+'</span></div>').join('') +
        (Object.keys(s.byMethod).length?'':'<div class="tiny faint">فروشی ثبت نشده است.</div>') +
        '<div class="divider"></div><div class="t-row total"><span>جمع</span><span class="num">'+M(s.total)+'</span></div></div>' +
      '<div class="card"><div class="card-head"><h3>نمودار فروش ساعتی</h3></div>'+barChart(App.report.hourly(todays),{height:150,fmt:v=>M(v)})+'</div>' +
      '<div class="card"><div class="card-head"><h3>کالاهای پرفروش</h3><span class="spacer"></span><span class="tiny faint">تعداد فروش</span></div>' +
        barChart(items.map(x=>({label:x.name.slice(0,9),value:x.qty})),{height:160,color:'var(--ok)',fmt:v=>N(v)}) +
        '<div class="divider"></div>'+items.slice(0,5).map(x=>'<div class="t-row"><span>'+U.esc(x.name)+'</span><span class="num strong">'+N(x.qty)+'</span></div>').join('')+'</div>' +
      '<div class="card"><div class="card-head"><h3>نمودار فروش ۱۴ روز</h3></div>'+barChart(App.report.daily(all,14),{height:150,color:'var(--info)',fmt:v=>M(v)})+'</div>' +
      '<div class="card"><div class="card-head"><h3>عملکرد سفارشگیرها (امروز)</h3></div>' +
        (waiters.length?waiters.map(w=>'<div class="list-row"><span class="lr-main"><span class="lr-title">'+U.esc(w.name)+'</span><span class="lr-sub">'+N(w.orders)+' فاکتور · پورسانت '+M(w.commission)+'</span></span><span class="num strong">'+M(w.amount)+'</span></div>').join(''):empty('دادهای ثبت نشده است.','users'))+'</div>' +
      '<div class="card"><div class="card-head"><h3>هشدار موجودی</h3><span class="spacer"></span><span class="badge warn">'+N(alerts.length)+' کالا</span></div>' +
        (alerts.length?alerts.map(a=>'<div class="list-row"><span class="lr-main"><span class="lr-title">'+U.esc(a.name)+'</span><span class="lr-sub">'+U.esc(a.status.label)+' · فروش رفته '+N(a.sold)+'</span></span><span class="badge '+a.status.cls+' num">'+N(a.stock)+'</span></div>').join(''):empty('همه کالاها موجود هستند.','layers'))+'</div>' +
      '</div>';
    h += '<div class="card"><div class="card-head"><h3>کالاهای کمفروش</h3></div>' +
      (low.length?low.map(x=>'<div class="t-row"><span>'+U.esc(x.name)+'</span><span class="num">'+N(x.qty)+'</span></div>').join(''):'<div class="tiny faint">—</div>')+'</div>';
    return h;
  }

  return { head, empty, kpi, btn, statusBadge, paper, chips, table, barChart, opts, login, dashboard };
})();

Object.assign(App.actions, {
  'login-continue': () => {
    const st=App.ui.state; if(!st.loginCandidateId)return App.ui.toast('ابتدا یک کاربر انتخاب کنید.','err');
    st.loginUserId=st.loginCandidateId;st.loginStep=2;App.ui.render();
  },
  'login-back': () => { App.ui.state.loginStep=1;App.ui.state.loginUserId=null;App.ui.render(); }
});
App.inputs['login-user']=el=>{App.ui.state.loginCandidateId=el.value||'';App.ui.render();};
