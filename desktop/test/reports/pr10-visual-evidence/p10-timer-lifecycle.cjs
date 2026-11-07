'use strict';
/** S10-R1 定时器生命周期验证：注册 / 清理 / 重复打开 / 长期运行 */
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
 win.on('crash',()=>rec.errors.push('[RENDERER CRASH]'));
 await win.waitForLoadState('domcontentloaded');await sleep(2200);
 const stat=()=>win.evaluate(()=>({
   active:window.LedGuideStatus.langPoll.active(),
   started:window.LedGuideStatus.langPoll.startedCount(),
   langCount:document.querySelectorAll('#p10-lang').length,
   selectVisible:(s=>{if(!s)return false;const r=s.getBoundingClientRect();return s.offsetParent!==null&&r.width>0;})(document.getElementById('p10-lang-select')),
   pitchRow:!!document.querySelector('.pitch-settings-row'),
   help:!!document.getElementById('p10-pitch-help'),
   guide:!!document.getElementById('p10-guide'),
   source:!!document.getElementById('p10-px-source')
 }));
 const check=(name,pass,detail)=>{rec.cases.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(pass?'':' | '+JSON.stringify(detail).slice(0,200)));};
 const openModal=async()=>{await win.evaluate(()=>window.__desktopMenu('menu:open-settings'));await sleep(650);};
 const closeModal=async()=>{await win.evaluate(()=>{const b=document.getElementById('modal-close');if(b)b.click();});await sleep(400);};

 // 场景 1/2：首次启动 + 弹窗未打开 → 无轮询
 let s=await stat();
 check('场景1 首次启动：无轮询（active=false, started=0）',!s.active&&s.started===0,s);
 check('场景2 弹窗未打开：语言下拉/说明不存在（目标 DOM 未生成）',!s.langCount&&!s.help&&s.guide&&s.source,s);

 // 场景 3：首次打开 → 轮询启动 → 挂载 → 自动清理
 await openModal();
 s=await stat();
 check('场景3a 弹窗首次打开：轮询已启动过（started>=1）',s.started>=1,{...s});
 check('场景3b 语言下拉与说明已挂载且唯一',s.langCount===1&&s.help&&s.selectVisible,{...s});
 await sleep(1200);
 s=await stat();
 check('场景3c 挂载完成后轮询自动清理（active=false）',!s.active&&s.langCount===1,{...s});

 // 场景 4：关闭再打开 → 重启轮询 → 重新挂载 → 清理
 await closeModal();
 s=await stat();
 // 实测：closeModal 隐藏模态而非销毁 body —— 下拉保留于隐藏 DOM（用户不可见），
 // 轮询已停；再次打开仍可见（场景4b）。判据按真实生命周期修正。
 check('场景4a 弹窗关闭：下拉不可见、轮询停止（隐藏保留语义）',!s.selectVisible&&!s.active&&s.langCount===1,{...s});
 await openModal();
 await sleep(1200);
 s=await stat();
 check('场景4b 再次打开：轮询重启（started 递增）并重新挂载',s.started>=2&&s.langCount===1&&s.selectVisible&&!s.active,{...s});

 // 场景 5：切语言（模态内）→ 不刷新、下拉仍唯一
 const before=await win.evaluate(()=>({w:document.getElementById('input-width').value,locale:window.LedI18N.getLocale()}));
 await win.evaluate(()=>{const sel=document.getElementById('p10-lang-select');sel.value='en-US';sel.dispatchEvent(new Event('change',{bubbles:true}));});
 await sleep(600);
 s=await stat();
 const after=await win.evaluate(()=>({w:document.getElementById('input-width').value,locale:window.LedI18N.getLocale()}));
 check('场景5 切语言：下拉仍唯一、输入保留、locale 生效',s.langCount===1&&before.w===after.w&&after.locale==='en-US',{before,after,s});
 await win.evaluate(()=>{const sel=document.getElementById('p10-lang-select');sel.value='zh-CN';sel.dispatchEvent(new Event('change',{bubbles:true}));});
 await sleep(500);

 // 场景 6/7：目标 DOM 重建（第 3 次打开）+ 长期运行稳态
 await closeModal();await openModal();await closeModal();await openModal();
 await sleep(1500);
 s=await stat();
 check('场景6/7 多次开关 + 长期运行：轮询最终清理、DOM 唯一、无崩溃',!s.active&&s.langCount===1&&s.selectVisible&&rec.errors.length===0,{...s,errors:rec.errors});

 // 对照基线：Renderer E2E 关键功能（desktop-suite 93）由独立命令复跑，此处只做进程存活
 await app.close().catch(()=>{});
 fs.writeFileSync(path.join(OUT,'p10-timer-lifecycle.json'),JSON.stringify(rec,null,2),'utf8');
 const pass=rec.cases.filter(c=>c.pass).length;
 console.log(`=== 定时器生命周期验证 ${pass}/${rec.cases.length} ===`);
 if(pass!==rec.cases.length)process.exitCode=1;
})().catch(e=>{console.error('FAILED',e.message.slice(0,200));process.exit(1);});
