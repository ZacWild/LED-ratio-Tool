'use strict';
/** PR #10 合并前审查：悬浮来源条遮挡实测（zh-CN / en-US × 三档，只读取证） */
const fs=require('node:fs'),path=require('node:path');
const D=process.env.PR10_DESKTOP, OUT=process.env.PR10_EVIDENCE;
const {_electron}=require(path.join(D,'node_modules','playwright-core'));
const env=Object.assign({},process.env);delete env.ELECTRON_RUN_AS_NODE;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const rec={meta:{generatedAt:new Date().toISOString()},cases:[],errors:[]};
 const app=await _electron.launch({args:[D],cwd:D,env,timeout:60000});
 const win=await app.firstWindow();
 win.on('pageerror',e=>rec.errors.push('pageerror: '+e.message.slice(0,200)));
 win.on('console',m=>{if(m.type()==='error')rec.errors.push('console: '+m.text().slice(0,200));});
 await win.waitForLoadState('domcontentloaded');await sleep(1800);

 const measure=()=>win.evaluate(()=>{
   const src=document.getElementById('p10-px-source');
   const rect=e=>{const r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r2:Math.round(r.right)};};
   const overlap=(a,b)=>!(a.r2<=b.l||b.r2<=a.l||a.b<=b.t||b.b<=a.t);
   const srcR=src?rect(src):null;
   const targets={};
   const sels={
     inputWidth:'#input-width',inputHeight:'#input-height',pxBtn:'.unit-segment[data-unit="px"]',
     settingsBtn:'#btn-settings',inputTitle:'.panel--input .panel__title',
     resultTitle:'.panel--result .panel__title',resValue:'#res-value',warnBar:'#warn-bar',
     headerSubtitle:'.app-header__subtitle'
   };
   for(const [k,s] of Object.entries(sels)){const e=document.querySelector(s);targets[k]=e?rect(e):null;}
   const occluded=srcR?Object.entries(targets).filter(([k,r])=>r&&overlap(srcR,r)).map(([k])=>k):null;
   return {srcVisible:srcR!==null&&src&&getComputedStyle(src).display!=='none',srcRect:srcR,
     inViewport:srcR?srcR.t>=0&&srcR.b<=innerHeight&&srcR.l>=0&&srcR.l2===undefined:true,
     srcInViewport:srcR?srcR.t>=0&&srcR.b<=innerHeight:true,occluded,targets,
     srcText:src?(src.textContent||'').replace(/\s+/g,' ').trim():null};
 });

 async function runCase(lang,locale,w,h){
   // 语言：localStorage 键 led-ratio-tool.locale（不写 settings.json）
   await win.evaluate((c)=>{localStorage.setItem('led-ratio-tool.locale',c);},locale);
   await win.reload();await win.waitForLoadState('domcontentloaded');await sleep(1800);
   await app.evaluate(async({BrowserWindow},s)=>{BrowserWindow.getAllWindows()[0].setContentSize(s.w,s.h);},{w,h});
   await sleep(500);
   // 设物理尺寸并切 px，使悬浮条以 converted 形态显示
   await win.evaluate(()=>{for(const [id,v] of [['input-width','14'],['input-height','4']]){const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}});
   await sleep(200);
   await win.click('.unit-segment[data-unit="px"]');await sleep(700);
   const r=await measure();
   r.case=lang+' @ '+w+'x'+h;r.locale=await win.evaluate(()=>window.LedI18N?window.LedI18N.getLocale():null);
   await win.screenshot({path:path.join(OUT,'p10-overlay-'+lang+'-'+w+'x'+h+'.png')});
   rec.cases.push(r);
   console.log(r.case,'| locale='+r.locale,'| srcVisible='+r.srcVisible,'| srcInViewport='+r.srcInViewport,
     '| 遮挡元素='+(r.occluded&&r.occluded.length?JSON.stringify(r.occluded):'无'),'| srcRect='+JSON.stringify(r.srcRect));
 }
 for(const [w,h] of [[1440,900],[1200,800],[1024,680]]) await runCase('zh-CN','zh-CN',w,h);
 for(const [w,h] of [[1440,900],[1200,800],[1024,680]]) await runCase('en-US','en-US',w,h);
 await app.close().catch(()=>{});
 fs.writeFileSync(path.join(OUT,'p10-overlay-occlusion.json'),JSON.stringify(rec,null,2),'utf8');
 const bad=rec.cases.filter(c=>(c.occluded&&c.occluded.length)||!c.srcInViewport);
 console.log('\n=== 汇总：'+(bad.length===0?'六种语言×档位组合均零遮挡、悬浮条不出视口':'存在遮挡/出视口 '+JSON.stringify(bad.map(b=>b.case))));
 console.log('errors:',JSON.stringify(rec.errors));
 if(bad.length)process.exitCode=1;
})().catch(e=>{console.error('FAILED',e);process.exit(1);});
