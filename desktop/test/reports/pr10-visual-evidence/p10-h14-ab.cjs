'use strict';
const path=require('node:path');
const D=process.env.PR10_DESKTOP;
const {_electron}=require(path.join(D,'node_modules','playwright-core'));
const env=Object.assign({},process.env);delete env.ELECTRON_RUN_AS_NODE;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const app=await _electron.launch({args:[D],cwd:D,env,timeout:60000});
 const win=await app.firstWindow();await win.waitForLoadState('domcontentloaded');await sleep(1800);
 const anchor=()=>win.evaluate(()=>{
   const panel=document.querySelector('.panel--result');const pr=panel.getBoundingClientRect();
   const sticky=panel.querySelector('.result-sticky-top'),actions=panel.querySelector('.result-actions');
   const top=sticky?sticky.getBoundingClientRect().bottom:pr.top;
   const bottom=actions?actions.getBoundingClientRect().top:pr.bottom;
   const titles=[...panel.querySelectorAll('.result-block__title')];
   let fb=null;
   for(const t of titles){const r=t.getBoundingClientRect();if(r.height<=0)continue;
     if(r.top>=top-1&&r.bottom<=bottom+1)return {text:t.textContent.trim(),offset:Math.round(r.top-top),scrollTop:Math.round(panel.scrollTop)};
     if(!fb&&r.top>=top-1)fb={text:t.textContent.trim(),offset:Math.round(r.top-top),scrollTop:Math.round(panel.scrollTop)};}
   return fb||{text:null,scrollTop:Math.round(panel.scrollTop)};
 });
 async function run(label){
   await app.evaluate(async({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);});
   await sleep(500);
   await win.evaluate(()=>{for(const [id,v] of [['input-width','14'],['input-height','4']]){const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}
     document.querySelector('.panel--result').scrollTop=420;});
   await sleep(350);const before=await anchor();
   await app.evaluate(async({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1200,800);});
   await sleep(400);const mid=await anchor();
   await app.evaluate(async({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);});
   await sleep(400);const after=await anchor();
   console.log(label,'前=',JSON.stringify(before),'两栏=',JSON.stringify(mid),'回三栏=',JSON.stringify(after));
   return {before,mid,after};
 }
 console.log('=== A：保留全部新增模块 ===');await run('A');
 console.log('=== B：临时移除 #p10-px-source ===');
 await win.evaluate(()=>{const e=document.getElementById('p10-px-source');if(e)e.remove();});await run('B');
 console.log('=== C：再移除 #p10-guide ===');
 await win.evaluate(()=>{const e=document.getElementById('p10-guide');if(e)e.remove();});await run('C');
 await app.close().catch(()=>{});
})().catch(e=>{console.error(e);process.exit(1);});
