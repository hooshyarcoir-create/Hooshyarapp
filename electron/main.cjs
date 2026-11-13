'use strict';
const {app,BrowserWindow,shell}=require('electron');
const path=require('path');
function createWindow(){
  const win=new BrowserWindow({width:1440,height:920,minWidth:900,minHeight:620,show:false,autoHideMenuBar:true,backgroundColor:'#0f1116',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))shell.openExternal(url);return {action:'deny'};});
  win.loadFile(path.join(__dirname,'..','webapp','index.html'));
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
