/**
 * LED-ratio-Tool 桌面版 · 系统缩放变更监听 → 自动触发 DPI 验收
 * ============================================================================
 * 🔴 用途：Windows 11 的「设置 → 系统 → 显示 → 缩放」走 **DisplayConfig 实时
 *    应用路径**（实测：不写 `PerMonitorSettings\DpiValue`，会话内即时生效），
 *    而注册表 / `SPI_SETLOGICALDPIOVERRIDE` 两条通路要么需注销重登、要么无效。
 *    因此「切到目标缩放档 → 立刻跑验收」必须由**外部监听**触发。
 *
 * 🔴 机制：
 *    ① 主监听 `screen.on('display-metrics-changed')`（Windows 缩放/分辨率变化时触发）；
 *    ② 轮询兜底（默认 2s 一次）—— 某些驱动下事件不触发，但轮询必然收敛；
 *    ③ **所有显示器**都达到目标 scaleFactor 时，自动依次执行：
 *        - `node test/p7-dpi.mjs --port=<port>`      → 写 `test/reports/p7-dpi-<pct>.json`
 *        - `electron test/probes/probe-dpi-multidisplay.cjs` → 写 `test/reports/probe-dpi-multidisplay-<pct>.json`
 *      并落一份 signal 文件记录两个子进程的退出码。
 *
 * 🔴 纪律：
 *    · 只**观测与触发**，不修改任何系统设置；
 *    · 子进程**不注入**任何缩放参数 —— 缩放档位完全由系统真实状态决定；
 *    · 超时未达标 → 退出码 3（= 环境前置不满足），与「通过 0」「失败 1」区分。
 *
 * 用法：
 *   electron test/dpi-watch-accept.cjs --target=1.0 --port=9700 [--timeout=900]
 *   产物：test/reports/dpi-watch-accept.log、dpi-watch-accept.signal.json
 */

'use strict';

const { app, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};

const TARGET = Number(arg('target', '1.0'));
const PORT = arg('port', '9700');
const TIMEOUT_MS = Number(arg('timeout', '900')) * 1000;
const POLL_MS = Number(arg('poll', '2000'));

const HERE = __dirname;
const DESKTOP = path.join(HERE, '..');
const LOG = path.join(HERE, 'reports', 'dpi-watch-accept.log');
const SIGNAL = path.join(HERE, 'reports', 'dpi-watch-accept.signal.json');

fs.mkdirSync(path.dirname(LOG), { recursive: true });
try { fs.unlinkSync(SIGNAL); } catch (_) { /* ignore */ }

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG, line); } catch (_) { /* ignore */ }
  try { process.stdout.write(line); } catch (_) { /* ignore */ }
}

function childEnv() {
  const env = { ...process.env };
  // 🔴 子进程必须以真实 Electron / 真实 Node 身份运行，
  //    否则 ELECTRON_RUN_AS_NODE 会让 Electron 退化为纯 Node。
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || DESKTOP,
      env: childEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b) => { out += b.toString(); });
    child.stderr.on('data', (b) => { out += b.toString(); });
    child.on('error', (e) => { out += `\n[spawn error] ${e && e.message}`; });
    child.on('close', (code) => {
      try { fs.writeFileSync(opts.logFile || path.join(HERE, 'reports', 'dpi-watch-child.log'), out); } catch (_) { /* ignore */ }
      resolve({ code, out });
    });
  });
}

let started = false;
let done = false;

function currentState() {
  const ds = screen.getAllDisplays();
  return {
    displays: ds.map((d) => ({
      id: d.id, label: d.label, scaleFactor: d.scaleFactor,
      bounds: { ...d.bounds }, workArea: { ...d.workArea },
    })),
    allMatch: ds.length > 0 && ds.every((d) => Math.abs(d.scaleFactor - TARGET) < 0.01),
  };
}

async function accept() {
  if (done) return;
  done = true;
  const pct = Math.round(TARGET * 100);
  log(`✅ 达标（所有显示器 sf = ${TARGET}）→ 开始验收，档位 ${pct}%`);

  const st = currentState();
  log(`   显示器：${st.displays.map((d) => `${d.label}(id=${d.id}) sf=${d.scaleFactor} @(${d.bounds.x},${d.bounds.y}) ${d.bounds.width}×${d.bounds.height}`).join(' ｜ ')}`);

  // ① P7-5 DPI 渲染 + 窗口可达性验收
  log(`▶ 执行 p7-dpi.mjs --port=${PORT}`);
  //    用 PATH 上的真实 node（p7-dpi.mjs 是 ESM .mjs）；子进程 env 已剥离
  //    ELECTRON_RUN_AS_NODE，确保不被降级为 Electron 的 Node 模式。
  const r1 = await run('node',
    [path.join(HERE, 'p7-dpi.mjs'), `--port=${PORT}`], { logFile: path.join(HERE, 'reports', 'dpi-watch-p7dpi.log') });
  log(`   p7-dpi 退出码 = ${r1.code}`);

  // ② 多显示器四边核验
  log('▶ 执行 probe-dpi-multidisplay.cjs');
  const r2 = await run(process.execPath, [path.join(HERE, 'probes', 'probe-dpi-multidisplay.cjs')],
    { logFile: path.join(HERE, 'reports', 'dpi-watch-multidisplay.log') });
  log(`   多屏核验退出码 = ${r2.code}`);

  const signal = {
    generatedAt: new Date().toISOString(),
    target: TARGET,
    percent: pct,
    displays: st.displays,
    p7dpiExitCode: r1.code,
    multidisplayExitCode: r2.code,
    p7dpiReport: path.join(HERE, 'reports', `p7-dpi-${pct}.json`),
    multidisplayReport: path.join(HERE, 'reports', `probe-dpi-multidisplay-${pct}.json`),
    verdict: r1.code === 0 && r2.code === 0 ? 'PASS' : (r1.code === 3 || r2.code === 3 ? 'BLOCKED' : 'FAIL'),
  };
  try { fs.writeFileSync(SIGNAL, JSON.stringify(signal, null, 2)); } catch (_) { /* ignore */ }
  log(`■ 验收完成：verdict = ${signal.verdict}（p7-dpi=${r1.code} / 多屏=${r2.code}）`);
  app.exit(signal.verdict === 'PASS' ? 0 : (signal.verdict === 'BLOCKED' ? 3 : 1));
}

function check(reason) {
  if (done) return;
  const st = currentState();
  log(`check(${reason})：sf = [${st.displays.map((d) => d.scaleFactor).join(', ')}]  目标 ${TARGET}`);
  if (st.allMatch) accept();
}

app.whenReady().then(() => {
  log(`监听启动：目标 scaleFactor = ${TARGET}（${Math.round(TARGET * 100)}%），端口 ${PORT}，超时 ${TIMEOUT_MS / 1000}s`);
  const st = currentState();
  log(`   初始：${st.displays.map((d) => `${d.label}(id=${d.id}) sf=${d.scaleFactor}`).join(' ｜ ')}`);

  screen.on('display-metrics-changed', (_e, _d, changed) => {
    log(`display-metrics-changed：changed=${changed}`);
    check('event');
  });

  const timer = setInterval(() => check('poll'), POLL_MS);
  const killer = setTimeout(() => {
    if (done) return;
    log(`⛔ 超时 ${TIMEOUT_MS / 1000}s 未达到目标 scaleFactor = ${TARGET} → 环境前置不满足`);
    try {
      fs.writeFileSync(SIGNAL, JSON.stringify({
        generatedAt: new Date().toISOString(),
        target: TARGET,
        verdict: 'BLOCKED',
        reason: 'timeout: 未在超时内达到目标缩放档位',
        displays: currentState().displays,
      }, null, 2));
    } catch (_) { /* ignore */ }
    clearInterval(timer);
    app.exit(3);
  }, TIMEOUT_MS);

  check('startup');
  app.on('will-quit', () => { clearInterval(timer); clearTimeout(killer); });
});
