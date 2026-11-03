/**
 * LED-ratio-Tool 桌面版 · P7 最终发行人工验收补充（可自动化部分）
 * ============================================================================
 * 覆盖任务书「四、补充人工验收」中可自动化的三项：
 *   MAN-01 窗口标题（渲染层 document.title）
 *   MAN-02 窗口标题（BrowserWindow 层 = 真实窗口标题，经 PowerShell MainWindowTitle）
 *   MAN-03 顶栏实时换算分辨率 —— 初始 waiting「等待换算」
 *   MAN-04 顶栏实时换算分辨率 —— 输入 1920×1080 → ready「1920 × 1080 px」
 *   MAN-05 顶栏实时换算分辨率 —— 非法输入 → error「暂不可计算」
 *
 * 不可自动化的部分（真机双击手感 / 任务栏图标肉眼观感）在报告里给出人工清单，
 * 不在本脚本里伪造。
 *
 * 用法：node test/p7-manual-acceptance.mjs
 * 退出码：0 = 全部通过；1 = 有失败；3 = 环境阻塞（产物缺失）
 */
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const DIST = path.join(DESKTOP, 'dist');
const REPORTS = path.join(__dirname, 'reports');
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const V = pkg.version;
const PORTABLE = path.join(DIST, `LED Ratio Tool-${V}-x64-portable.exe`);
const EXE_NAME = 'LED Ratio Tool.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const results = [];
let failures = 0;
function rec(id, title, ok, detail, extra = {}) {
  const pass = ok === null ? null : !!ok;
  results.push({ id, title, pass, detail: detail || '', ...extra });
  const mark = pass === null ? '⏭️' : pass ? '✅' : '❌';
  console.log(`  ${mark} ${id}  ${title}`);
  if (detail) console.log(`        ${detail}`);
  if (pass === false) failures++;
}

/* ============================ 原生 CDP 客户端（与 p7-acceptance 同源） ============================ */
class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP 超时：${method}`)); } }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression: `(() => { ${expression} })()`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate 异常');
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

async function launchWithCdp(exe, { port }) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const t0 = Date.now();
  let target = null;
  while (Date.now() - t0 < 60000) {
    await sleep(600);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && String(t.url).startsWith('app://'));
      if (page) { target = page; break; }
    } catch { /* 未就绪 */ }
  }
  if (!target) { try { child.kill(); } catch { /* noop */ } throw new Error('CDP 目标未出现'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
    setTimeout(() => reject(new Error('WebSocket 超时')), 15000);
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  // 等页面就绪
  for (let i = 0; i < 40; i++) {
    const ok = await cdp.eval("return document.readyState === 'complete' && !!window.LedCore && !!document.getElementById('input-width');").catch(() => false);
    if (ok) { await sleep(300); break; }
    await sleep(400);
  }
  return { cdp, close: async () => { cdp.close(); try { child.kill(); } catch { /* noop */ } } };
}

async function setInput(cdp, selector, value) {
  return cdp.eval(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok:false, reason:'元素不存在' };
    el.focus();
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return { ok:true, value: el.value };
  `);
}

function killApp() {
  spawnSync('taskkill', ['/F', '/IM', EXE_NAME], { windowsHide: true, stdio: 'ignore' });
}

/* ============================ 主流程 ============================ */
async function main() {
  console.log('=== P7 最终发行人工验收补充（可自动化）===');
  if (!fs.existsSync(PORTABLE)) {
    console.error('❌ 环境阻塞：Portable 产物缺失（先 npm run build:win）');
    process.exit(3);
  }
  fs.mkdirSync(REPORTS, { recursive: true });

  await killApp();
  const neutral = path.join(os.tmpdir(), 'LED Ratio Portable Manual');
  fs.mkdirSync(neutral, { recursive: true });
  const copy = path.join(neutral, path.basename(PORTABLE));
  fs.copyFileSync(PORTABLE, copy);
  const shaCopy = sha256(copy);

  let runP = null;
  try {
    runP = await launchWithCdp(copy, { port: 9516 });

    // MAN-01 渲染层标题
    const docTitle = String(await runP.cdp.eval('return document.title || "";')).trim();
    rec('MAN-01', '窗口标题（渲染层 document.title）= LED Ratio Tool', docTitle === 'LED Ratio Tool', `document.title「${docTitle}」`);

    // MAN-02 真实窗口标题（BrowserWindow 层）：PowerShell MainWindowTitle，英文无 GBK 乱码
    await sleep(1500); // 等窗口真正建好，MainWindowTitle 才非空
    let winTitle = '';
    try {
      const r = spawnSync('powershell', ['-NoProfile', '-Command',
        `(Get-Process -Name 'LED Ratio Tool' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty MainWindowTitle)`],
        { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      winTitle = String(r.stdout || '').trim();
    } catch (e) { winTitle = ''; }
    rec('MAN-02', '窗口标题（BrowserWindow 层 / 任务栏标题）= LED Ratio Tool', winTitle === 'LED Ratio Tool', `MainWindowTitle「${winTitle}」`);

    // MAN-03 实时分辨率 waiting 态：先清空两个输入框再断言。
    //   🔴 便携版会从 localStorage 恢复上次输入（启动即 ready 属正常），
    //      因此 waiting 态的判据是「输入为空时显示等待换算」，需显式清空。
    await setInput(runP.cdp, '#input-width', '');
    await setInput(runP.cdp, '#input-height', '');
    await sleep(600);
    const live0 = String(await runP.cdp.eval("return (document.getElementById('live-resolution-value')||{}).textContent || '';")).trim();
    rec('MAN-03', '顶栏实时分辨率 waiting 态 = 等待换算（清空输入后）', live0 === '等待换算', `清空后「${live0}」`);

    // MAN-04 输入 1920×1080 → ready「1920 × 1080 px」
    await setInput(runP.cdp, '#input-width', '1920');
    await setInput(runP.cdp, '#input-height', '1080');
    await sleep(900);
    const live1 = String(await runP.cdp.eval("return (document.getElementById('live-resolution-value')||{}).textContent || '';")).trim();
    rec('MAN-04', '顶栏实时分辨率 ready 态 = 1920 × 1080 px', live1 === '1920 × 1080 px', `输入 1920×1080 →「${live1}」`);

    // MAN-05 非法输入 → error「暂不可计算」
    await setInput(runP.cdp, '#input-width', 'abc');
    await sleep(900);
    const live2 = String(await runP.cdp.eval("return (document.getElementById('live-resolution-value')||{}).textContent || '';")).trim();
    rec('MAN-05', '顶栏实时分辨率 error 态 = 暂不可计算', live2 === '暂不可计算', `输入非法 →「${live2}」`);
  } catch (e) {
    rec('MAN-01', '窗口标题（渲染层）', false, `启动/CDP 失败：${e.message}`.slice(0, 200));
    rec('MAN-02', '窗口标题（BrowserWindow 层）', false, '前置未建立');
    rec('MAN-03', '实时分辨率初始态', false, '前置未建立');
    rec('MAN-04', '实时分辨率 ready 态', false, '前置未建立');
    rec('MAN-05', '实时分辨率 error 态', false, '前置未建立');
  } finally {
    if (runP) await runP.close();
    await killApp();
    try { fs.rmSync(neutral, { recursive: true, force: true }); } catch { /* noop */ }
  }

  const report = {
    meta: { generatedAt: new Date().toISOString(), version: V, portable: path.basename(PORTABLE), portableSha256: shaCopy },
    results,
    summary: { total: results.length, pass: results.filter((r) => r.pass === true).length, fail: results.filter((r) => r.pass === false).length, skip: results.filter((r) => r.pass === null).length, verdict: failures ? 'FAIL' : 'PASS' },
  };
  const out = path.join(REPORTS, 'p7-manual-acceptance.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\n检查项 = ${report.summary.total} ｜ 通过 ${report.summary.pass} ｜ 失败 ${report.summary.fail} ｜ 跳过 ${report.summary.skip}`);
  console.log(`判定 = ${report.summary.verdict}`);
  console.log(`📄 ${out}`);
  process.exit(failures ? 1 : 0);
}

main();
