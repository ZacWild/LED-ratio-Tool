'use strict';
const path=require('node:path');
const D=process.env.PR10_DESKTOP;
const {_electron}=require(path.join(D,'node_modules','playwright-core'));
const env=Object.assign({},process.env);delete env.ELECTRON_RUN_AS_NODE;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const app=await _electron.launch({args:[D],cwd:D,env,timeout:60000});
 const win=await app.firstWindow();await win.waitForLoadState('domcontentloaded');await sleep(1800);
 const probe=()=>win.evaluate(()=>{
   const L=document.querySelector('.layout');
   return {tier:document.documentElement.getAttribute('data-height-tier'),
     layoutScrollH:L.scrollHeight,layoutClientH:L.clientHeight,layoutScrollable:L.scrollHeight>L.clientHeight+1,
     layoutTop:L.scrollTop,bodyScrollH:document.body.scrollHeight,winH:innerHeight,
     guideH:document.getElementById('p10-guide')?Math.round(document.getElementById('p10-guide').getBoundingClientRect().height):0,
     inputTop:Math.round(document.getElementById('input-width').getBoundingClientRect().top)};
 });
 // 1440x900 → 1440x600（第③档）→ 模拟 TC-H-10 点击锚点 → 回 1440x900
 await app.evaluate(async({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);});await sleep(500);
 console.log('900档:',JSON.stringify(await probe()));
 await app.evaluate(async({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,600);});await sleep(600);
 console.log('600档:',JSON.stringify(await probe()));
 // 点击锚点条最后一项（模拟 TC-H-10）
 await win.evaluate(()=>{const items=document.querySelectorAll('.result-anchors__item');if(items.length)items[items.length-1].click();});await sleep(400);
 console.log('600档点击锚点后:',JSON.stringify(await probe()));
 await app.evaluate(async({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1440,900);});await sleep(600);
 console.log('回900档:',JSON.stringify(await probe()));
 await app.close().catch(()=>{});
})().catch(e=>{console.error(e);process.exit(1);});
