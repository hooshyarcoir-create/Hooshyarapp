/* Offline-first synchronization client. The local store stays authoritative on-device;
 * the remote API uses optimistic revisions and never silently overwrites conflicts. */
'use strict';
window.App=window.App||{};
App.sync=(function(){
  const VERSION_KEY='hooshyar.sync.base.v1',PENDING_KEY='hooshyar.sync.pending.v1',CONFLICT_KEY='hooshyar.sync.conflict.v1',INFO_KEY='hooshyar.sync.info.v1',TOKEN_KEY='hooshyar.sync.token.v1';
  let timer=null,running=false,applyingRemote=false;
  const storage=()=>window.localStorage;
  const readJson=(key,fallback)=>{try{return JSON.parse(storage().getItem(key)||'null')||fallback;}catch(_){return fallback;}};
  const config=()=>App.store&&App.store.data&&App.store.data.settings&&App.store.data.settings.connection||{};
  const info=()=>readJson(INFO_KEY,{});
  const writeInfo=patch=>{const next=Object.assign({},info(),patch,{updatedAt:Date.now()});storage().setItem(INFO_KEY,JSON.stringify(next));return next;};
  const baseVersion=()=>{const v=storage().getItem(VERSION_KEY);return v==null?null:Number(v);};
  const setBaseVersion=v=>storage().setItem(VERSION_KEY,String(Number(v)||0));
  const pending=()=>!!storage().getItem(PENDING_KEY);
  const conflict=()=>readJson(CONFLICT_KEY,null);
  const apiUrl=()=>{let x=String(config().apiUrl||'').trim().replace(/\/+$/,'');if(!x&&typeof location!=='undefined'&&/^https?:$/.test(location.protocol))x=new URL('/api.php',location.origin).href;if(!x)return '';return /\.php$/i.test(x)?x:x+'/api.php';};
  const token=()=>storage().getItem(TOKEN_KEY)||'';
  async function request(op,body){
    const endpoint=apiUrl();if(!endpoint)throw new Error('نشانی API در تنظیمات وارد نشده است.');
    const key=token();if(!key)throw new Error('توکن اتصال را در تنظیمات وارد کنید.');
    const response=await fetch(endpoint+'?op='+encodeURIComponent(op),{method:body?'POST':'GET',headers:{'Authorization':'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    let payload={};try{payload=await response.json();}catch(_){}
    if(!response.ok){const error=new Error(payload.error||('خطای سرور '+response.status));error.status=response.status;error.payload=payload;throw error;}
    return payload;
  }
  function saveConflict(remote){
    const value={remoteVersion:Number(remote.version)||0,remoteState:remote.state||null,createdAt:Date.now()};
    storage().setItem(CONFLICT_KEY,JSON.stringify(value));
    writeInfo({state:'conflict',error:'تغییر هم‌زمان روی سرور پیدا شد؛ انتخاب دستی لازم است.'});
    return value;
  }
  function clearPending(){storage().removeItem(PENDING_KEY);}
  function newOperationId(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():('op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
  function markPending(){
    if(applyingRemote||config().mode!=='hybrid')return;
    storage().setItem(PENDING_KEY,JSON.stringify({baseVersion:baseVersion(),changedAt:Date.now(),operationId:newOperationId()}));
    writeInfo({state:navigator.onLine?'pending':'offline',error:''});
    if(config().autoSync&&navigator.onLine){clearTimeout(timer);timer=setTimeout(()=>syncNow().catch(()=>{}),900);}
  }
  function applyRemote(remote){
    if(!remote||!remote.state)throw new Error('پاسخ سرور دادهٔ معتبری ندارد.');
    applyingRemote=true;
    try{
      const incoming=App.util.clone(remote.state);
      incoming.settings=incoming.settings||{};
      incoming.settings.connection=App.util.clone(config());
      App.store.import(JSON.stringify(incoming));setBaseVersion(remote.version);clearPending();storage().removeItem(CONFLICT_KEY);
    }
    finally{applyingRemote=false;}
    writeInfo({state:'synced',lastSyncedAt:Date.now(),error:''});
  }
  async function pushCurrent(expected){
    const queued=readJson(PENDING_KEY,{}),operationId=queued.operationId||newOperationId();
    if(!queued.operationId)storage().setItem(PENDING_KEY,JSON.stringify({baseVersion:Number(expected)||0,changedAt:Date.now(),operationId}));
    let result;
    const snapshot=JSON.parse(App.store.export());
    if(snapshot.settings)delete snapshot.settings.connection; // endpoint, mode and platform are device-local, never replicated
    try{result=await request('push',{expectedVersion:Number(expected)||0,operationId,state:snapshot});}
    catch(error){if(error.status===409&&error.payload&&error.payload.conflict)saveConflict(error.payload);throw error;}
    setBaseVersion(result.version);
    const latest=readJson(PENDING_KEY,{});
    if(latest.operationId===operationId)clearPending();
    else if(pending())storage().setItem(PENDING_KEY,JSON.stringify(Object.assign({},latest,{baseVersion:Number(result.version)})));
    storage().removeItem(CONFLICT_KEY);
    writeInfo({state:pending()?'pending':'synced',lastSyncedAt:Date.now(),error:''});
    return result;
  }
  async function syncNow(){
    if(running)return {busy:true};
    const c=config();if(c.mode!=='hybrid')throw new Error('حالت اتصال روی «فقط آفلاین» است؛ برای همگام‌سازی، حالت آنلاین و آفلاین را انتخاب کنید.');
    if(!navigator.onLine)throw new Error('اتصال اینترنت در دسترس نیست؛ تغییرات روی دستگاه نگه داشته شده‌اند.');
    if(conflict())throw new Error('تعارض همگام‌سازی دارید؛ ابتدا یکی از نسخه‌ها را انتخاب کنید.');
    running=true;writeInfo({state:'checking',error:''});
    try{
      const remote=await request('status');
      if(remote.driver&&c.backend&&remote.driver!==c.backend)throw new Error('پایگاه‌دادهٔ سرور ('+remote.driver+') با انتخاب تنظیمات برنامه ('+c.backend+') یکسان نیست.');
      const base=baseVersion(),hasPending=pending();
      if(base==null){
        if(Number(remote.version)===0){setBaseVersion(0);storage().setItem(PENDING_KEY,JSON.stringify({baseVersion:0,changedAt:Date.now(),operationId:newOperationId()}));return await pushCurrent(0);}
        const incoming=await request('pull',{});saveConflict(incoming);return {conflict:true};
      }
      if(Number(remote.version)!==base){
        if(!hasPending&&Number(remote.version)>base){const incoming=await request('pull',{});applyRemote(incoming);return {pulled:true};}
        if(hasPending){try{return await pushCurrent(base);}catch(error){if(error.status===409)return {conflict:true};throw error;}}
        const incoming=await request('pull',{});saveConflict(incoming);return {conflict:true};
      }
      if(hasPending)return await pushCurrent(base);
      writeInfo({state:'synced',lastSyncedAt:info().lastSyncedAt||Date.now(),error:''});
      return {unchanged:true};
    }catch(error){writeInfo({state:navigator.onLine?'error':'offline',error:error.message||'خطای همگام‌سازی'});throw error;}
    finally{running=false;}
  }
  async function testConnection(){
    try{const r=await request('status');const c=config();if(r.driver&&c.backend&&r.driver!==c.backend)throw new Error('سرور روی '+r.driver+' تنظیم شده ولی برنامه '+c.backend+' را انتخاب کرده است.');writeInfo({state:'connected',driver:r.driver,serverVersion:r.version,error:''});return r;}
    catch(error){writeInfo({state:navigator.onLine?'error':'offline',error:error.message||'اتصال ناموفق'});throw error;}
  }
  async function useServer(){const c=conflict();if(!c||!c.remoteState)throw new Error('نسخهٔ سرور برای حل تعارض در دسترس نیست.');applyRemote({version:c.remoteVersion,state:c.remoteState});return true;}
  async function useDevice(){const c=conflict();if(!c)throw new Error('تعارضی برای حل وجود ندارد.');
    const current=await request('status');if(Number(current.version)!==Number(c.remoteVersion)){const fresh=await request('pull',{});saveConflict(fresh);throw new Error('سرور دوباره تغییر کرده است؛ نسخه‌های تازه دریافت شد.');}
    storage().setItem(VERSION_KEY,String(c.remoteVersion));storage().setItem(PENDING_KEY,JSON.stringify({baseVersion:c.remoteVersion,changedAt:Date.now(),operationId:newOperationId()}));storage().removeItem(CONFLICT_KEY);return await pushCurrent(c.remoteVersion);
  }
  function status(){const s=info(),c=conflict();return {state:s.state|| (navigator.onLine?'idle':'offline'),error:s.error||'',lastSyncedAt:s.lastSyncedAt||0,baseVersion:baseVersion(),pending:pending(),conflict:!!c,conflictAt:c&&c.createdAt,remoteVersion:c&&c.remoteVersion,driver:s.driver||''};}
  function setToken(value){if(value)storage().setItem(TOKEN_KEY,String(value).trim());else storage().removeItem(TOKEN_KEY);}
  function init(){
    if(!App.store||!App.store.data)return;
    window.addEventListener('online',()=>{writeInfo({state:'pending'});if(config().mode==='hybrid'&&config().autoSync)syncNow().catch(()=>{});});
    window.addEventListener('offline',()=>writeInfo({state:'offline'}));
    setInterval(()=>{if(config().mode==='hybrid'&&config().autoSync&&navigator.onLine&&!running)syncNow().catch(()=>{});},60000);
    if(config().mode==='hybrid'&&pending()&&config().autoSync&&navigator.onLine)syncNow().catch(()=>{});
  }
  App.actions=App.actions||{};
  Object.assign(App.actions,{
    'sync-test':async()=>{try{const r=await testConnection();App.ui.toast('اتصال برقرار است · '+(r.driver||'')+' · نسخه '+App.util.num(r.version),'ok');}catch(e){App.ui.toast(e.message,'err');}App.ui.refresh();},
    'sync-now':async()=>{try{const r=await syncNow();App.ui.toast(r.conflict?'تعارض پیدا شد؛ انتخاب کنید دادهٔ سرور یا دستگاه حفظ شود.':r.pulled?'داده‌های سرور دریافت شد.':'همگام‌سازی انجام شد.','ok');}catch(e){App.ui.toast(e.message,'err');}App.ui.refresh();},
    'sync-clear-token':()=>App.ui.confirm('توکن اتصال فقط از این دستگاه پاک می‌شود؛ ادامه می‌دهید?',()=>{setToken('');writeInfo({state:'idle',error:''});App.ui.toast('توکن دستگاه پاک شد.','ok');App.ui.refresh();}),
    'sync-use-server':()=>App.ui.confirm('دادهٔ محلی دستگاه با نسخهٔ سرور جایگزین می‌شود. ابتدا از داده‌های محلی نسخهٔ پشتیبان بگیرید. ادامه می‌دهید؟',async()=>{try{await useServer();App.ui.toast('نسخهٔ سرور دریافت شد.','ok');}catch(e){App.ui.toast(e.message,'err');}App.ui.refresh();},'حفظ نسخهٔ سرور'),
    'sync-use-device':()=>App.ui.confirm('نسخهٔ فعلی این دستگاه جایگزین کل دادهٔ سرور می‌شود. این کار را فقط پس از بررسی نسخه‌های پشتیبان انجام دهید. ادامه می‌دهید؟',async()=>{try{await useDevice();App.ui.toast('نسخهٔ دستگاه روی سرور ثبت شد.','ok');}catch(e){App.ui.toast(e.message,'err');}App.ui.refresh();},'حفظ نسخهٔ دستگاه')
  });
  return {init,status,syncNow,testConnection,setToken,localChanged:markPending,conflict,apiUrl};
})();
