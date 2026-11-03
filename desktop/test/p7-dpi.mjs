/**
 * LED-ratio-Tool 桌面版 · P7-5 真机 DPI 验收（100% / 125% / 150%）
 * ============================================================================
 * 🔴 只认**真实系统缩放**，三条硬规矩：
 *   ① 期望值来自命令行 `--expect=<百分比>`，实测值来自 **Windows 的
 *      scaleFactor**（应用台账里的 `screen.getDisplayNearestPoint().scaleFactor`）
 *      与渲染层 `devicePixelRatio`。两者都必须等于期望值，否则以
 *      **退出码 3（环境前置不满足）**结束 —— 不算通过、更不算失败。
 *   ② **绝不用** `setZoomFactor` / 浏览器缩放 / Playwright 的 deviceScaleFactor
 *      冒充 DPI。页面缩放只改 CSS px，与系统 DPI 不是一回事。
 *   ③ 断言对象是**计算后的样式与几何**（getBoundingClientRect / getComputedStyle），
 *      不是 `el.style.*` 这类声明值。
 *
 * 被测对象是**已安装的正式产物**（`--exe=` 可指定），不是 `electron .`。
 * 每档输出：报告 JSON + 截图 PNG（供人工复核真实观感）。
 *
 * 用法：
 *   node test/p7-dpi.mjs --expect=100
 *   node test/p7-dpi.mjs --expect=125 --exe="C:\...\LED Ratio Tool.exe"
 * 退出码：0 = 该档全部通过；1 = 有检查项不通过；3 = 环境前置不满足
 */

'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const REPORTS = path.join(__dirname, 'reports');
const SHOTS = path.join(__dirname, 'shots', 'p7-dpi');
const Core = require(path.join(DESKTOP, 'renderer', 'core.js'));

const argv = process.argv.slice(2);
const expectArg = (argv.find((a) => a.startsWith('--expect=')) || '').split('=')[1];
const EXE = (argv.find((a) => a.startsWith('--exe=')) || '').split('=')[1] ||
  path.join(DESKTOP, 'dist', 'win-unpacked', 'LED Ratio Tool.exe');
const PORT = Number((argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 9600);

const EXPECT_PCT = expectArg ? Number(expectArg) : null;
const EXPECT_SF = EXPECT_PCT ? EXPECT_PCT / 100 : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ratioText = (v) => {
  let t = Core.fmt(v, 4);
  if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t + ' : 1';
};
// 🔴 结果面板 #ratio-value 与舞台叠加层 #dim-ratio 是**两套呈现**，格式不同：
//    面板 = Core.computeRatio().decimal（= fmt(ratio,4)，**保留尾零**）+ ':' + '1'  → "1.6000:1"
//    舞台 = formatRatioValue()（去尾零）+ ' : 1'                              → "1.6 : 1"
//    两处各有其职责（面板是权威数值，舞台是给人看的友好读数），
//    断言必须各自复刻自己的规则，否则必然产生假失败。
const panelRatioText = (v) => Core.fmt(v, 4) + ':1';

const results = [];
let failures = 0;
let blocked = 0;
// group: 'render' = 该 DPI 下渲染/布局是否正确；'fit' = 窗口尺寸策略是否让内容可达。
// 分开统计是为了让结论可读：渲染全绿而尺寸策略失败，与"渲染就错"不是一回事。
//
// 🔴 四态严格区分（P7-DPI-09 Remediation 强化）：
//   true       → PASS     实际窗口完整处于工作区
//   false      → FAIL     环境满足产品最小窗口要求，窗口仍然出屏
//   'blocked'  → BLOCKED  当前工作区连产品最小窗口都容纳不了（环境限制，不算通过也不算失败）
//   null       → SKIP     本项**没有实际执行**（数据缺失 / 流程未走到）—— 不得与 BLOCKED 混用
function rec(id, title, ok, detail, extra = {}) {
  const group = extra.group || 'render';
  delete extra.group;
  const pass = ok === null ? null : ok === 'blocked' ? 'blocked' : !!ok;
  results.push({ id, title, pass, detail: detail || '', group, ...extra });
  const mark = pass === null ? '⏭️' : pass === 'blocked' ? '🚧' : pass ? '✅' : '❌';
  console.log(`  ${mark} ${id}  ${title}`);
  if (detail) console.log(`        ${detail}`);
  if (pass === false) failures++;
  if (pass === 'blocked') blocked++;
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP 超时 ${method}`)); } }, 20000);
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expr} })()`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate 异常');
    return r.result.value;
  }
}

async function main() {
  console.log('=== P7-5 真机 DPI 验收 ===');
  console.log(`  期望系统缩放 = ${EXPECT_PCT ? EXPECT_PCT + '%' : '(未指定，按实测记录)'}`);
  console.log(`  被测可执行文件 = ${EXE}\n`);
  if (!fs.existsSync(EXE)) {
    console.error('❌ 环境阻塞：找不到被测 exe');
    process.exit(3);
  }
  fs.mkdirSync(SHOTS, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  let target = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await sleep(600);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && String(t.url).startsWith('app://'));
      if (target) break;
    } catch { /* 未就绪 */ }
  }
  if (!target) {
    try { child.kill(); } catch { /* noop */ }
    console.error('❌ 环境阻塞：CDP 目标未出现');
    process.exit(3);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('CDP 连接失败')));
    setTimeout(() => rej(new Error('CDP 连接超时')), 15000);
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  for (let i = 0; i < 40; i++) {
    const ok = await cdp.eval("return document.readyState === 'complete' && !!window.LedCore;").catch(() => false);
    if (ok) break;
    await sleep(400);
  }
  await sleep(800);

  // 系统 DPI：以应用自报的 scaleFactor 为准（它是 screen API 的真实读数）
  const ledgerLine = log.split(/\r?\n/).filter((l) => l.includes('[LED-WINDOW]')).pop() || '';
  let ledger = null;
  try { ledger = JSON.parse(ledgerLine.slice(ledgerLine.indexOf('[LED-WINDOW]') + 12).trim()); } catch { /* noop */ }

  const sys = await cdp.eval(`
    const s = window.screen || {};
    return {
      dpr: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: s.width, screenHeight: s.height,
      availWidth: s.availWidth, availHeight: s.availHeight,
      availLeft: s.availLeft, availTop: s.availTop,
      screenX: window.screenX, screenY: window.screenY,
      outerWidth: window.outerWidth, outerHeight: window.outerHeight,
      zoomFactor: (window.outerWidth && window.innerWidth) ? window.outerWidth / window.innerWidth : null
    };
  `);

  const scaleFromLedger = ledger ? ledger.scaleFactor : null;
  const scalePct = scaleFromLedger != null ? Math.round(scaleFromLedger * 100) : null;

  // ---- 环境前置：必须与期望一致，否则退出码 3（不通过也不失败）----
  if (EXPECT_SF !== null) {
    const okSys = scaleFromLedger != null && Math.abs(scaleFromLedger - EXPECT_SF) < 0.001;
    const okDpr = Math.abs(sys.dpr - EXPECT_SF) < 0.001;
    if (!okSys || !okDpr) {
      console.log(`  ⛔ 环境前置不满足：期望 ${EXPECT_PCT}%，实测 scaleFactor=${scaleFromLedger}、dpr=${sys.dpr}`);
      ws.close(); try { child.kill(); } catch { /* noop */ }
      // 仍然落一份报告，避免"没跑过"与"跑过但不满足"混为一谈
      fs.writeFileSync(path.join(REPORTS, `p7-dpi-${EXPECT_PCT}-blocked.json`), JSON.stringify({
        meta: { generatedAt: new Date().toISOString(), exe: EXE, expectedPercent: EXPECT_PCT },
        blocked: true, measured: { scaleFactor: scaleFromLedger, dpr: sys.dpr },
      }, null, 2) + '\n');
      process.exit(3);
    }
    rec('DPI-01', '系统缩放与期望一致（scaleFactor 来自 screen API）', okSys,
      `期望 ${EXPECT_PCT}%｜ledger.scaleFactor=${scaleFromLedger}（${scalePct}%）`);
    rec('DPI-02', '渲染层 devicePixelRatio 同步（未使用页面缩放）', okDpr,
      `期望 ${EXPECT_SF}｜dpr=${sys.dpr}｜window.outerWidth/innerWidth=${Number(sys.zoomFactor).toFixed(4)}（≈1 表示没有 zoomFactor 缩放）`);
  } else {
    rec('DPI-01', '系统缩放（按实测记录，不作判定）', null, `实测 ${scalePct}%（scaleFactor=${scaleFromLedger}）`);
  }

  // ---- 布局与可达性（断言计算后的样式/几何）----
  // 🔴 控件清单依据产品自身的 DEC-16 契约：**输入 / 结果 / 警告 / 复制四类核心操作
  //    在任何高度档位都不得隐藏**；舞台（.panel--stage 内的画布与叠加标签
  //    #dim-ratio 等）在 tight 档是**设计上折叠**的，不能当作"被 DPI 挤掉"。
  //    首跑把 #dim-ratio 列进必见清单 → 在 1024×768 工作区（tight 档）必然失败，
  //    那是判据错误，不是产品缺陷。
  const geom = await cdp.eval(`
    const de = document.documentElement;
    const overflowDoc = de.scrollWidth - de.clientWidth;
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0,
        fontSize: cs.fontSize,
        text: (el.innerText || '').trim(),
        inViewport: r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0
      };
    };
    const core = ['#input-width','#input-height','#ratio-value','#btn-swap','#btn-copy-resolution','#btn-copy-full'];
    const boxes = {};
    for (const sel of core) boxes[sel] = probe(sel);
    const stageEl = document.getElementById('stage');   // 真正的画布容器（.panel--stage 是外框）
    const stagePanel = document.querySelector('.panel--stage');
    const stageCs = stageEl ? getComputedStyle(stageEl) : null;
    return {
      overflowDoc, innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      boxes,
      tier: de.getAttribute('data-height-tier'),
      layout: (document.querySelector('.layout') || {}).getAttribute
        ? document.querySelector('.layout').getAttribute('data-layout') : null,
      stage: stageEl ? { display: stageCs.display, h: Math.round(stageEl.getBoundingClientRect().height) } : null,
      stagePanel: stagePanel ? { display: getComputedStyle(stagePanel).display, h: Math.round(stagePanel.getBoundingClientRect().height) } : null,
      stageOverlay: probe('#dim-ratio')
    };
  `);

  rec('DPI-03', '无文档级横向溢出', geom.overflowDoc <= 1,
    `scrollWidth-clientWidth = ${geom.overflowDoc}（视口 ${geom.innerWidth}×${geom.innerHeight}，高度档位 ${geom.tier}，布局 ${geom.layout}）`);

  // 舞台按 DEC-16 折叠属合规；展开时必须给出可见的叠加标签 —— 两种情况分别记录，不混为一谈。
  // 折叠发生在 #stage（画布容器）上，.panel--stage 外框仍保留行内摘要（TK-147）。
  const stageCollapsed = !geom.stage || geom.stage.display === 'none' || geom.stage.h === 0;
  rec('DPI-08', '舞台折叠符合 DEC-16（折叠时叠加标签允许不可见）',
    stageCollapsed ? !(geom.stageOverlay && geom.stageOverlay.visible)
      : !!(geom.stageOverlay && geom.stageOverlay.visible),
    stageCollapsed
      ? `tight 档折叠 #stage（display=${geom.stage ? geom.stage.display : '缺失'}，外框 .panel--stage 仍占 ${geom.stagePanel ? geom.stagePanel.h : 0}px 作行内摘要）→ #dim-ratio 不可见属设计行为`
      : `#stage 展开（高 ${geom.stage.h}px）→ #dim-ratio 可见=${geom.stageOverlay && geom.stageOverlay.visible}`);

  // 命中区只对**可交互**元素有意义（输入框/按钮）。#ratio-value 是文本标签，
  // 拿 32×32 去卡它属于把"触控目标"和"文本"混为一谈 → 单独只查可见性（DPI-05）。
  const INTERACTIVE = ['#input-width', '#input-height', '#btn-swap', '#btn-copy-resolution', '#btn-copy-full'];
  const tiny = INTERACTIVE.map((sel) => [sel, geom.boxes[sel]])
    .filter(([, b]) => b && b.visible && (b.w < 32 || b.h < 32));
  rec('DPI-04', '可交互控件命中区 ≥32×32 CSS px', tiny.length === 0,
    tiny.length ? `偏小：${tiny.map(([k, b]) => `${k}(${b.w}×${b.h})`).join('，')}`
      : INTERACTIVE.map((sel) => geom.boxes[sel] ? `${sel.replace('#', '')}=${geom.boxes[sel].w}×${geom.boxes[sel].h}` : `${sel}=缺失`).join('｜'));

  const hidden = Object.entries(geom.boxes).filter(([, b]) => !b || !b.visible);
  rec('DPI-05', '四类核心操作（输入/结果/复制）全部可见', hidden.length === 0,
    hidden.length ? `不可见：${hidden.map(([k]) => k).join('，')}` : `${Object.keys(geom.boxes).length} 个核心控件均 visible`);

  // ---- 窗口几何：四边核验（DPI-09 · 方案 A 强化版）----
  // 🔴 判据（任务书 §五，唯一口径）：
  //     用**最终真实窗口外框**（主进程 BrowserWindow.getBounds()）与
  //     **真实工作区矩形**（display.workArea）核对四条边，四项全满足才算 PASS：
  //         window.left   >= workArea.left
  //         window.top    >= workArea.top
  //         window.right  <= workArea.right
  //         window.bottom <= workArea.bottom
  //    绝不能只看客户区宽高，也不能只检查右侧和底部。
  //
  // 🔴 状态区分：
  //     PASS    → 四边全部满足
  //     FAIL    → 环境满足产品最小窗口要求（budget.fitsMinimum=true），窗口仍然出屏
  //     BLOCKED → 当前工作区连产品最小窗口都容纳不了（budget.fitsMinimum=false）
  //     SKIP    → 主进程台账缺几何字段，本项**没有实际执行**
  const winGeo = (() => {
    if (!ledger) return null;
    const g = {
      display: ledger.display || null,
      bounds: ledger.bounds || null,
      contentBounds: ledger.contentBounds || null,
      delta: ledger.delta || null,
      overflowFromLedger: ledger.overflow || null,
      fitsFromLedger: ledger.fitsWorkArea,
      budget: (ledger.plan && ledger.plan.budget) || null,
      minCalibration: (ledger.plan && ledger.plan.minCalibration) || null,
      convergence: (ledger.plan && ledger.plan.convergence) || null,
      heightTier: ledger.heightTier,
    };
    if (!g.display || !g.display.workArea || !g.bounds) return g;
    const wa = g.display.workArea;
    const b = g.bounds;
    const edges = { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
    const workEdges = { left: wa.x, top: wa.y, right: wa.x + wa.width, bottom: wa.y + wa.height };
    const overflow = {
      left: Math.max(0, workEdges.left - edges.left),
      top: Math.max(0, workEdges.top - edges.top),
      right: Math.max(0, edges.right - workEdges.right),
      bottom: Math.max(0, edges.bottom - workEdges.bottom),
    };
    g.edges = edges;
    g.workAreaEdges = workEdges;
    g.overflow = overflow;
    g.fits = overflow.left === 0 && overflow.top === 0 && overflow.right === 0 && overflow.bottom === 0;
    return g;
  })();

  if (!winGeo || !winGeo.bounds || !winGeo.display) {
    // 🚫 SKIP：本项没有实际执行 —— 与 BLOCKED 严格区分
    rec('DPI-09', '窗口完整落在当前工作区内（四边核验）', null,
      'SKIP：主进程台账缺少窗口几何字段（display.workArea / getBounds），本项未实际执行；不得与 BLOCKED 混用',
      { group: 'fit', status: 'SKIP' });
  } else {
    const wa = winGeo.display.workArea;
    const b = winGeo.bounds;
    const ov = winGeo.overflow;
    const fitsMin = winGeo.budget ? winGeo.budget.fitsMinimum : null;
    const detail =
      `外框 getBounds() ${b.width}×${b.height} @(${b.x},${b.y})｜工作区 workArea ${wa.width}×${wa.height} @(${wa.x},${wa.y})` +
      `｜客户区 getContentBounds() ${winGeo.contentBounds ? winGeo.contentBounds.width + '×' + winGeo.contentBounds.height : '—'}` +
      `｜实测非客户区 ${winGeo.delta ? winGeo.delta.width + '×' + winGeo.delta.height : '—'}` +
      `｜四边溢出 左${ov.left}/上${ov.top}/右${ov.right}/下${ov.bottom}` +
      `｜显示器 id=${winGeo.display.id} sf=${winGeo.display.scaleFactor}` +
      (fitsMin === false
        ? `｜BLOCKED 原因：当前工作区装不下产品最小窗口（最低需 ${winGeo.budget.requiredWorkArea.width}×${winGeo.budget.requiredWorkArea.height}，` +
          `实际 ${wa.width}×${wa.height}，差距 ${winGeo.budget.shortfall.width}×${winGeo.budget.shortfall.height}）`
        : '');

    if (winGeo.fits) {
      rec('DPI-09', '窗口完整落在当前工作区内（四边核验）', true, detail,
        { group: 'fit', status: 'PASS', overflow: ov, edges: winGeo.edges, workAreaEdges: winGeo.workAreaEdges });
    } else if (fitsMin === false) {
      // 🚧 环境限制：工作区装不下最小窗口 → BLOCKED，不算 PASS 也不算 FAIL
      rec('DPI-09', '窗口完整落在当前工作区内（四边核验）', 'blocked', detail,
        { group: 'fit', status: 'BLOCKED', overflow: ov, edges: winGeo.edges, workAreaEdges: winGeo.workAreaEdges,
          requiredWorkArea: winGeo.budget.requiredWorkArea, shortfall: winGeo.budget.shortfall });
    } else {
      rec('DPI-09', '窗口完整落在当前工作区内（四边核验）', false, detail,
        { group: 'fit', status: 'FAIL', overflow: ov, edges: winGeo.edges, workAreaEdges: winGeo.workAreaEdges });
    }
  }

  // ---- 该 DPI 下核心换算仍正确 ----
  const setInput = async (sel, val) => cdp.eval(`
    const el = document.querySelector(${JSON.stringify(sel)});
    el.focus(); el.value = ${JSON.stringify(String(val))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur(); return el.value;
  `);
  await setInput('#input-width', '1920');
  await setInput('#input-height', '1080');
  await sleep(600);
  // 🔴 读数必须取自**用户真正看得见的节点**（#ratio-value 在结果面板，DEC-16 保证任何档位可见）。
  //    旧实现读 #dim-ratio：那是舞台叠加标签，tight 档 display:none —— 对隐藏元素取
  //    innerText 会退化成 textContent，于是"读到正确值"却根本没显示给用户，属伪证据。
  const readRatio = await cdp.eval(`
    const el = document.getElementById('ratio-value');
    if (!el) return { text: '', visible: false, w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      text: (el.innerText || '').trim(),
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
      w: Math.round(r.width), h: Math.round(r.height),
      fontSize: cs.fontSize
    };
  `);
  const shown = String(readRatio.text || '').trim();
  const expectR = panelRatioText(1920 / 1080);
  rec('DPI-06', '核心换算正确且结果对用户可见（1920×1080 → 16:9）',
    shown === expectR && readRatio.visible === true,
    `#ratio-value 显示「${shown}」｜期望「${expectR}」｜可见=${readRatio.visible}（${readRatio.w}×${readRatio.h}，字号 ${readRatio.fontSize}）`);

  // ---- 截图存证 ----
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(SHOTS, `dpi-${scalePct || 'na'}.png`);
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  rec('DPI-07', '截图已留存（供人工复核真实观感）', fs.existsSync(shotPath),
    `${shotPath}（${(fs.statSync(shotPath).size / 1024).toFixed(0)} KB）`);

  ws.close();
  try { child.kill(); } catch { /* noop */ }
  spawnSync('taskkill', ['/F', '/IM', 'LED Ratio Tool.exe'], { windowsHide: true, stdio: 'ignore' });

  const byGroup = (g) => {
    const rs = results.filter((r) => r.group === g);
    return {
      total: rs.length,
      pass: rs.filter((r) => r.pass === true).length,
      fail: rs.filter((r) => r.pass === false).length,
      blocked: rs.filter((r) => r.pass === 'blocked').length,
      skip: rs.filter((r) => r.pass === null).length,
    };
  };
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      exe: EXE,
      expectedPercent: EXPECT_PCT,
      node: process.version,
      os: `${os.type()} ${os.release()}`,
    },
    measured: { scaleFactor: scaleFromLedger, scalePercent: scalePct, dpr: sys.dpr, screen: [sys.screenWidth, sys.screenHeight], avail: [sys.availWidth, sys.availHeight], ledger },
    geometry: geom,
    // 🔴 窗口几何全量证据（任务书 §五「每次测试必须记录」）：
    //    显示器 id/bounds/workArea/scaleFactor、getBounds、getContentBounds、
    //    实测非客户区宽高、devicePixelRatio、窗口最终位置与完整外框、四边溢出量。
    windowGeometry: {
      display: winGeo ? winGeo.display : null,
      bounds: winGeo ? winGeo.bounds : null,
      contentBounds: winGeo ? winGeo.contentBounds : null,
      measuredFrameDelta: winGeo ? winGeo.delta : null,
      devicePixelRatio: sys.dpr,
      position: winGeo && winGeo.bounds ? { x: winGeo.bounds.x, y: winGeo.bounds.y } : null,
      edges: winGeo ? winGeo.edges || null : null,
      workAreaEdges: winGeo ? winGeo.workAreaEdges || null : null,
      fourEdgeOverflow: winGeo ? winGeo.overflow || null : null,
      fits: winGeo ? winGeo.fits : null,
      budget: winGeo ? winGeo.budget : null,
      minCalibration: winGeo ? winGeo.minCalibration : null,
      convergence: winGeo ? winGeo.convergence : null,
      heightTier: winGeo ? winGeo.heightTier : null,
      renderLayerGeometry: {
        // 渲染层自报（与主进程真实外框并列留证，便于交叉核对两个口径）
        screenX: sys.screenX, screenY: sys.screenY,
        outerWidth: sys.outerWidth, outerHeight: sys.outerHeight,
        innerWidth: sys.innerWidth, innerHeight: sys.innerHeight,
        availWidth: sys.availWidth, availHeight: sys.availHeight,
      },
    },
    results,
    summary: {
      total: results.length,
      pass: results.filter((r) => r.pass === true).length,
      fail: failures,
      blocked,
      skip: results.filter((r) => r.pass === null).length,
      // 两组分开：渲染正确性 / 窗口可达性
      render: byGroup('render'),
      fit: byGroup('fit'),
      // 🔴 判定：FAIL > BLOCKED > PASS（三态不合并、不笼统）
      verdict: failures ? 'FAIL' : blocked ? 'BLOCKED' : 'PASS',
    },
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, `p7-dpi-${scalePct || 'na'}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

  console.log('');
  console.log(`  检查项 = ${report.summary.total} ｜ 通过 ${report.summary.pass} ｜ 失败 ${report.summary.fail} ｜ 阻塞 ${report.summary.blocked} ｜ 跳过 ${report.summary.skip}`);
  console.log(`  · 渲染正确性（DPI-01~08）: ${report.summary.render.pass}/${report.summary.render.total} 通过`);
  console.log(`  · 窗口可达性（DPI-09）  : ${report.summary.fit.pass}/${report.summary.fit.total} 通过` +
    (report.summary.fit.blocked ? `（阻塞 ${report.summary.fit.blocked}）` : ''));
  console.log(`  判定 = ${report.summary.verdict}（该档 ${scalePct}%）`);
  console.log(`  📄 ${out}`);
  // 退出码：0 = 该档全部通过；1 = 有 FAIL；3 = 环境阻塞（工作区装不下最小窗口）
  process.exit(failures ? 1 : blocked ? 3 : 0);
}

main().catch((e) => {
  console.error('未捕获异常：', e);
  process.exit(1);
});
