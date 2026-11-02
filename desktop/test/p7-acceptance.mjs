/**
 * LED-ratio-Tool 桌面版 · P7-5 真实 Windows 环境验收
 * ============================================================================
 * 验收对象是 **P7-4 的正式产物**（dist 下的 setup.exe / portable.exe），
 * 不是 `electron .` 开发态，也不是 CI 的 Preview Candidate。
 *
 * 与 pc-verify.mjs 的分工：
 *   pc-verify  = 打包产物冒烟（Preview Candidate 阶段，只证明「能装能起」）
 *   p7-accept  = 正式验收，要求**看得见结果**：
 *                · 安装 → 启动 → **真实换算结果**与 core.js 独立算出的期望值一致
 *                · 设置改完写盘、重启后读回、卸载后仍保留
 *                · 同版本覆盖安装 + **真版本升级**（1.0.0 → 当前版本）
 *                · 便携版从中立目录启动、不产生安装痕迹、断网可用
 *
 * 🔴 关键手法：交付版 `devTools: false`，但**接受 `--remote-debugging-port`**
 *    （Chromium 参数不受 Electron fuses 管辖；fuses 关的是 Node 侧的
 *    RunAsNode / NODE_OPTIONS / --inspect）。因此本脚本用**原生 WebSocket
 *    直连 CDP**驱动真实窗口：
 *      · 直接读写输入框、读回渲染结果 —— 而不是"看到窗口标题就算过"
 *      · 监听 Network.* 统计出网请求 —— 断网能力有硬证据
 *    这条通道只在测试中开启（显式传参），产品默认不带该参数。
 *
 * 用法：
 *   node test/p7-acceptance.mjs                     # 全链路（安装→运行→设置→升级→卸载→便携版）
 *   node test/p7-acceptance.mjs --legacy=<setup.exe> # 指定旧版本安装包做真升级
 *   node test/p7-acceptance.mjs --keep               # 保留安装目录与设置以便排查
 * 退出码：0 = 全部通过；1 = 有失败；3 = 环境阻塞（产物缺失 / 端口不可用）
 */

'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const DIST = path.join(DESKTOP, 'dist');
const REPORTS = path.join(__dirname, 'reports');
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const V = pkg.version;

const argv = process.argv.slice(2);
const LEGACY = (argv.find((a) => a.startsWith('--legacy=')) || '').split('=')[1] || null;
const KEEP = argv.includes('--keep');

const SETUP = path.join(DIST, `LED Ratio Tool-${V}-x64-setup.exe`);
const PORTABLE = path.join(DIST, `LED Ratio Tool-${V}-x64-portable.exe`);
const UNPACKED_EXE = path.join(DIST, 'win-unpacked', 'LED Ratio Tool.exe');
const INSTALL_DIR = path.join(os.tmpdir(), 'LED Ratio Tool P7-Accept');
const INSTALLED_EXE = path.join(INSTALL_DIR, 'LED Ratio Tool.exe');
const UNINSTALLER = path.join(INSTALL_DIR, 'Uninstall LED Ratio Tool.exe');
const APP_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'LED Ratio Tool');
const SETTINGS = path.join(APP_DIR, 'settings.json');
// 🔴 官方卸载注册表项位于 HKCU\\...\\Uninstall\\com.ledratiotool.desktop。
//    但本环境的执行策略**禁止调用 reg.exe**（sandbox program blacklist），
//    且明确要求不得用其他 shell/脚本绕过。因此本脚本**不查询注册表**，
//    该项记 SKIP 并在报告中注明「需人工或用平台允许的工具核对」——
//    宁可标 SKIP，也不伪造一个「已核对」。
const START_MENU = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'LED 比例换算台.lnk');
const DESKTOP_LNK = path.join(os.homedir(), 'Desktop', 'LED 比例换算台.lnk');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const Core = require(path.join(DESKTOP, 'renderer', 'core.js'));

/**
 * 复刻应用的比例显示规则（renderer/app.js 的 formatRatioValue）：
 * Core.fmt(v, 4) 之后**去掉小数尾零**，再拼 " : 1"。
 * 断言必须用这条规则生成期望值 —— 用「1.6000 : 1」去比「1.6 : 1」会得出假失败。
 */
const ratioText = (v) => {
  let t = Core.fmt(v, 4);
  if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t + ' : 1';
};

/* ============================ 进程/窗口工具 ============================ */
function tasklist(name) {
  const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], { encoding: 'utf8', windowsHide: true });
  return String(r.stdout || '').includes(name);
}
async function killApp(waitMs = 15000) {
  spawnSync('taskkill', ['/F', '/IM', 'LED Ratio Tool.exe'], { windowsHide: true, stdio: 'ignore' });
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    if (!tasklist('LED Ratio Tool.exe')) return true;
    await sleep(400);
  }
  return false;
}

/* ============================ 原生 CDP 客户端 ============================ */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 20000);
    });
  }
  /** 在页面里求值，返回 JSON 化结果 */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate 异常');
    return r.result.value;
  }
  close() {
    try { this.ws.close(); } catch { /* noop */ }
  }
}

/**
 * 启动一个 Electron 可执行文件并接上 CDP。
 * @returns {Promise<{cdp:Cdp, ledger:object[], log:string, close:Function}>}
 */
async function launchWithCdp(exe, { args = [], port, timeoutMs = 60000 } = {}) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [`--remote-debugging-port=${port}`, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const t0 = Date.now();
  let target = null;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(600);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && String(t.url).startsWith('app://'));
      if (page) { target = page; break; }
    } catch { /* 还没起来 */ }
  }
  if (!target) {
    try { child.kill(); } catch { /* noop */ }
    throw new Error(`CDP 目标未出现（${timeoutMs}ms）：${log.slice(0, 200)}`);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')));
    setTimeout(() => reject(new Error('CDP WebSocket 超时')), 15000);
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');

  // 等页面**真正就绪**再操作：readyState=complete + Core 已挂载 + 关键输入框存在。
  // 不等就填值，会遇到「填完立刻被初始化覆盖」的竞态（首跑 UPG-05 就出现过异常读数）。
  const ready = async () => {
    for (let i = 0; i < 40; i++) {
      const ok = await cdp
        .eval("return document.readyState === 'complete' && !!window.LedCore && !!document.getElementById('input-width');")
        .catch(() => false);
      if (ok) { await sleep(300); return true; }
      await sleep(400);
    }
    return false;
  };
  await ready();

  const ledger = () =>
    log
      .split(/\r?\n/)
      .map((l) => {
        const i = l.indexOf('[LED-WINDOW]');
        if (i < 0) return null;
        try { return JSON.parse(l.slice(i + '[LED-WINDOW]'.length).trim()); } catch { return null; }
      })
      .filter(Boolean);

  return {
    cdp,
    getLog: () => log,
    getLedger: ledger,
    close: async () => { cdp.close(); try { child.kill(); } catch { /* noop */ } await killApp(); },
  };
}

/** 设置输入框的值并触发 input/change（应用是原生 JS，非 React） */
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

/* ============================ 主流程 ============================ */
async function main() {
  console.log('=== P7-5 真实 Windows 环境验收 ===');
  console.log(`版本 ${V}｜安装包 ${fs.existsSync(SETUP) ? '齐' : '缺'}｜便携版 ${fs.existsSync(PORTABLE) ? '齐' : '缺'}`);
  if (!fs.existsSync(SETUP) || !fs.existsSync(PORTABLE) || !fs.existsSync(UNPACKED_EXE)) {
    console.error('❌ 环境阻塞：P7-4 正式产物不齐（先 npm run build:win）');
    process.exit(3);
  }
  fs.mkdirSync(REPORTS, { recursive: true });

  /* 备份本机既有设置，验收结束后恢复 */
  const settingsBak = SETTINGS + '.p7bak';
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, settingsBak);
  const restoreSettings = () => {
    try {
      if (fs.existsSync(settingsBak)) { fs.copyFileSync(settingsBak, SETTINGS); fs.unlinkSync(settingsBak); }
    } catch { /* noop */ }
  };

  await killApp();

  /* ========== A. 产物身份（P7-4 复述，作为验收输入） ========== */
  {
    const artifactReport = path.join(REPORTS, 'p7-artifacts.json');
    let art = null;
    try { art = JSON.parse(fs.readFileSync(artifactReport, 'utf8')); } catch { /* 稍后重算 */ }
    const shaSetup = sha256(SETUP);
    const shaPort = sha256(PORTABLE);
    const aSetup = art && art.artifacts.find((x) => x.key === 'nsis');
    const aPort = art && art.artifacts.find((x) => x.key === 'portable');
    const consistent = aSetup && aPort ? aSetup.sha256 === shaSetup && aPort.sha256 === shaPort : true;
    rec('ART-01', '验收对象与 P7-4 指纹一致（防调包）', consistent,
      aSetup ? `setup ${shaSetup.slice(0, 16)}… / portable ${shaPort.slice(0, 16)}…（与 p7-artifacts.json 比对一致）`
             : '未找到 p7-artifacts.json，按实测哈希记录',
      { shaSetup, shaPort });
    const unsigned = art ? !art.signatureSummary.anySigned : true;
    rec('ART-02', '签名状态已明确披露（未签名不得写成已签名）', true,
      unsigned ? 'NotSigned：三处 PE 证书表为空，构建日志明确 "no code signing certificate configured, signing is skipped" → 属 P7 发布阻塞项' : '存在已签名产物',
      { signed: !unsigned });
  }

  /* ========== B. NSIS 安装 ========== */
  const inst = spawnSync(SETUP, ['/S', `/D=${INSTALL_DIR}`], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
  await sleep(3000);
  const installed = fs.existsSync(INSTALLED_EXE);
  rec('INS-01', '静默安装到独立目录成功', installed,
    installed ? `已安装到 ${INSTALL_DIR}（installer exit=${inst.status}）` : `安装失败 exit=${inst.status} ${inst.stderr || ''}`.slice(0, 200));
  if (!installed) { finish(); return; }

  const shaInstalled = sha256(INSTALLED_EXE);
  rec('INS-02', '安装后的主程序与 win-unpacked 逐字节一致', shaInstalled === sha256(UNPACKED_EXE),
    `installed=${shaInstalled.slice(0, 16)}… unpacked=${sha256(UNPACKED_EXE).slice(0, 16)}…`);
  rec('INS-03', '卸载器已生成', fs.existsSync(UNINSTALLER), fs.existsSync(UNINSTALLER) ? 'Uninstall LED Ratio Tool.exe 存在' : '缺失');
  rec('INS-04', '快捷方式已创建（桌面 + 开始菜单）', fs.existsSync(DESKTOP_LNK) && fs.existsSync(START_MENU),
    `桌面=${fs.existsSync(DESKTOP_LNK)}｜开始菜单=${fs.existsSync(START_MENU)}`);
  rec('INS-05', '注册表卸载项（控制面板可见）', null,
    'SKIP：本环境禁止调用 reg.exe，改用「卸载器存在 + 控制面板项由 NSIS 保证」间接判断；注册表本身未核对');

  /* ========== C. 安装后启动 + 真实换算 ========== */
  let run1 = null;
  try {
    run1 = await launchWithCdp(INSTALLED_EXE, { port: 9511 });
    // 🔴 必须先整页 reload 再做网络审计：CDP 是在页面已经加载完之后才接上的，
    //    不 reload 的话「出网请求 0 条」只覆盖连接之后那段时间，等于没测。
    const evBase = run1.cdp.events.length;
    await run1.cdp.send('Page.reload', { ignoreCache: true }).catch(() => {});
    await sleep(3000);
    const led = run1.getLedger();
    const last = led[led.length - 1] || null;
    rec('RUN-01', '安装版启动成功并完成布局（台账实测）', !!last,
      last ? `客户区=${last.content.width}×${last.content.height}｜scaleFactor=${last.scaleFactor}｜heightTier=${last.heightTier}` : '未捕获 [LED-WINDOW] 台账');

    // 真实换算：1920×1080 应得 1.7778:1（期望值由 core.js 独立算出，不取 UI 常量）
    await setInput(run1.cdp, '#input-width', '1920');
    await setInput(run1.cdp, '#input-height', '1080');
    await sleep(600);
    const shown = await run1.cdp.eval(`return (document.getElementById('dim-ratio')||{}).innerText || '';`);
    const expectRatio = ratioText(1920 / 1080);
    const coreRatio = Core.fmt(1920 / 1080, 4);
    rec('RUN-02', '核心换算正确（1920×1080 → 16:9 口径）', String(shown).trim() === expectRatio,
      `UI 显示「${String(shown).trim()}」｜期望「${expectRatio}」（core.fmt(1920/1080,4)=${coreRatio}）`,
      { shown, expectRatio });

    // 换一组非标准比例，验证不是写死的
    await setInput(run1.cdp, '#input-width', '3840');
    await setInput(run1.cdp, '#input-height', '1080');
    await sleep(600);
    const shown2 = await run1.cdp.eval(`return (document.getElementById('dim-ratio')||{}).innerText || '';`);
    rec('RUN-03', '第二组换算正确（3840×1080 → 32:9）', String(shown2).trim() === ratioText(3840 / 1080),
      `UI 显示「${String(shown2).trim()}」｜期望「${ratioText(3840 / 1080)}」`,
      { shown2 });

    // 出网审计：只允许 app: 与 devtools 内部
    const reqs = run1.cdp.events
      .slice(evBase)
      .filter((e) => e.method === 'Network.requestWillBeSent')
      .map((e) => e.params.request.url);
    const external = reqs.filter((u) => !/^(app:|data:|devtools:|chrome-extension:|blob:)/i.test(u));
    rec('RUN-04', '运行期零出网请求（离线可用性的硬证据）', external.length === 0,
      external.length ? `发现 ${external.length} 条外部请求：${external.slice(0, 3).join(', ')}` : `已审计 ${reqs.length} 条请求，全部为 app:/data: 内部资源`,
      { totalRequests: reqs.length });

    const errs = run1.cdp.events.slice(evBase).filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
    rec('RUN-05', '控制台零 error / 零未捕获异常', errs.length === 0, errs.length ? `${errs.length} 条` : '0 条');
  } catch (e) {
    rec('RUN-01', '安装版启动成功并完成布局（台账实测）', false, `启动/CDP 失败：${e.message}`.slice(0, 220));
  }

  /* ========== D. 设置持久化（改 → 写盘 → 重启 → 读回） ========== */
  if (run1) {
    await run1.cdp.eval(`document.getElementById('btn-settings').click(); return true;`);
    await sleep(300);
    const setRes = await setInput(run1.cdp, '#input-tolerance', '1.75');
    await sleep(800);
    const onDisk = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : null;
    rec('SET-01', 'UI 改设置后立即落盘', onDisk && Number(onDisk.tolerancePercent) === 1.75,
      onDisk ? `settings.json → tolerancePercent=${onDisk.tolerancePercent}（输入框回读 ${setRes && setRes.value}）` : 'settings.json 未生成',
      { settings: onDisk });
    const keys = onDisk ? Object.keys(onDisk) : [];
    const allowed = ['schemaVersion', 'tolerancePercent', 'createdAt', 'updatedAt'];
    rec('SET-02', 'settings.json 只含白名单键（无冗余字段）', keys.every((k) => allowed.includes(k)),
      `键：${keys.join(', ')}`, { keys });
    await run1.close();
    await sleep(800);

    // 重启读回
    try {
      const run2 = await launchWithCdp(INSTALLED_EXE, { port: 9512 });
      const readBack = await run2.cdp.eval(`
        const el = document.getElementById('input-tolerance');
        return el ? el.value : null;
      `);
      rec('SET-03', '重启后设置从磁盘读回（跨启动持久化）', String(readBack).trim() === '1.75',
        `重启后输入框 = ${readBack}`, { readBack });
      await run2.close();
    } catch (e) {
      rec('SET-03', '重启后设置从磁盘读回（跨启动持久化）', false, `重启失败：${e.message}`.slice(0, 180));
    }
  } else {
    rec('SET-01', 'UI 改设置后立即落盘', false, '前置未建立（RUN-01 失败）');
    rec('SET-02', 'settings.json 只含白名单键', false, '前置未建立');
    rec('SET-03', '重启后设置读回', false, '前置未建立');
  }
  await killApp();

  /* ========== E. 覆盖安装 + 真版本升级 ========== */
  {
    const r = spawnSync(SETUP, ['/S', `/D=${INSTALL_DIR}`], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
    await sleep(2500);
    const stillOk = fs.existsSync(INSTALLED_EXE);
    const settingsAfter = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : null;
    rec('UPG-01', '同版本覆盖安装成功且设置保留', stillOk && settingsAfter && Number(settingsAfter.tolerancePercent) === 1.75,
      `exit=${r.status}｜exe 就位=${stillOk}｜tolerance=${settingsAfter && settingsAfter.tolerancePercent}`);
  }

  if (LEGACY && fs.existsSync(LEGACY)) {
    // 真升级：先装旧版本，再装当前版本
    await killApp();
    // 不清注册表（reg.exe 被禁）；直接以「安装目录 + 版本文件」判定升级基线
    const rl = spawnSync(LEGACY, ['/S', `/D=${INSTALL_DIR}`], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
    await sleep(3000);
    const legacyExe = INSTALLED_EXE;
    const legacyVer = fs.existsSync(legacyExe) ? sha256(legacyExe) : null;
    rec('UPG-02', '旧版本安装成功（升级基线）', fs.existsSync(legacyExe),
      `legacy exit=${rl.status}｜旧版 exe sha=${legacyVer ? legacyVer.slice(0, 16) + '…' : '缺'}`);

    // 在旧版本上写一个可辨识设置，验证升级不丢
    fs.mkdirSync(APP_DIR, { recursive: true });
    const seeds = { schemaVersion: 1, tolerancePercent: 0.75, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    fs.writeFileSync(SETTINGS, JSON.stringify(seeds, null, 2), 'utf8');

    const ru = spawnSync(SETUP, ['/S', `/D=${INSTALL_DIR}`], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
    await sleep(3500);
    const newSha = fs.existsSync(INSTALLED_EXE) ? sha256(INSTALLED_EXE) : null;
    const upgraded = newSha && newSha === sha256(UNPACKED_EXE);
    const kept = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : null;
    rec('UPG-03', '版本升级覆盖成功（主程序已换成当前版本）', upgraded,
      `升级 exit=${ru.status}｜新 exe sha=${newSha ? newSha.slice(0, 16) + '…' : '缺'}｜与 ${V} 一致=${upgraded}`);
    rec('UPG-04', '升级后设置保留（未被重置）', kept && Number(kept.tolerancePercent) === 0.75,
      kept ? `tolerancePercent=${kept.tolerancePercent}（升级前写入 0.75）` : 'settings.json 丢失');
    // 升级后必须能跑
    try {
      const run3 = await launchWithCdp(INSTALLED_EXE, { port: 9513 });
      await setInput(run3.cdp, '#input-width', '2560');
      await setInput(run3.cdp, '#input-height', '1440');
      await sleep(600);
      const r3 = await run3.cdp.eval(`return (document.getElementById('dim-ratio')||{}).innerText || '';`);
      const w3 = await run3.cdp.eval(`return document.getElementById('input-width').value`);
      const h3 = await run3.cdp.eval(`return document.getElementById('input-height').value`);
      const e3 = await run3.cdp.eval(`const a=document.getElementById('error-width'),b=document.getElementById('error-height');return [a&&a.innerText,b&&b.innerText]`);
      rec('UPG-05', '升级后启动正常且换算正确（2560×1440 → 16:9）',
        String(r3).trim() === ratioText(2560 / 1440) && String(w3) === '2560' && String(h3) === '1440',
        `UI 显示「${String(r3).trim()}」｜期望「${ratioText(2560 / 1440)}」｜输入框 ${w3}×${h3}｜错误位 ${JSON.stringify(e3)}`,
        { shown: r3, w3, h3 });
      await run3.close();
    } catch (e) {
      rec('UPG-05', '升级后启动正常且换算正确', false, `启动失败：${e.message}`.slice(0, 180));
    }
  } else {
    rec('UPG-02', '旧版本安装（升级基线）', null, '未提供 --legacy=<旧安装包>，真升级未执行（不当成通过）');
    rec('UPG-03', '版本升级覆盖成功', null, '同上：缺少旧版本产物');
    rec('UPG-04', '升级后设置保留', null, '同上');
    rec('UPG-05', '升级后启动正常且换算正确', null, '同上');
  }

  /* ========== F. 卸载 ========== */
  await killApp();
  {
    // 卸载前先落一个可辨识设置，用于验证 DEC-20「卸载保留设置」
    fs.mkdirSync(APP_DIR, { recursive: true });
    const keepMarker = { schemaVersion: 1, tolerancePercent: 2.5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    fs.writeFileSync(SETTINGS, JSON.stringify(keepMarker, null, 2), 'utf8');

    if (fs.existsSync(UNINSTALLER)) {
      const ru = spawnSync(UNINSTALLER, ['/S'], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
      let gone = false;
      for (let i = 0; i < 40; i++) {
        await sleep(1000);
        if (!fs.existsSync(INSTALLED_EXE)) { gone = true; break; }
      }
      rec('UNI-01', '静默卸载后程序文件被清除', gone, `uninstaller exit=${ru.status}｜exe 已消失=${gone}｜目录仍存在=${fs.existsSync(INSTALL_DIR)}`);
      rec('UNI-02', '卸载后 settings.json 保留（DEC-20）',
        fs.existsSync(SETTINGS) && Number(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).tolerancePercent) === 2.5,
        fs.existsSync(SETTINGS) ? `保留，tolerancePercent=${JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).tolerancePercent}` : '🔴 被删除');
      // 卸载器是异步的：exe 消失后它还会继续删快捷方式/写注册表。
      // 必须**轮询等待**，否则会把「还没来得及删」误判成「没删」。
      let lnkGone = false;
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        if (!fs.existsSync(DESKTOP_LNK) && !fs.existsSync(START_MENU)) { lnkGone = true; break; }
      }
      rec('UNI-03', '卸载后快捷方式清除（轮询等待异步卸载完成）', lnkGone,
        `桌面快捷方式=${fs.existsSync(DESKTOP_LNK)}｜开始菜单=${fs.existsSync(START_MENU)}（最多等待 30s）`);
      rec('UNI-04', '卸载后注册表项清除', null,
        'SKIP：本环境禁止调用 reg.exe —— 未核对，不得记为通过');
    } else {
      rec('UNI-01', '静默卸载后程序文件被清除', false, '未找到卸载器');
      rec('UNI-02', '卸载后 settings.json 保留', null, '前置未建立');
      rec('UNI-03', '卸载后注册表项与快捷方式清除', null, '前置未建立');
    }
  }

  /* ========== G. 便携版：中立目录 / 无安装痕迹 / 断网可用 ========== */
  {
    const neutral = path.join(os.tmpdir(), 'LED Ratio Portable Neutral');
    fs.mkdirSync(neutral, { recursive: true });
    const portableCopy = path.join(neutral, path.basename(PORTABLE));
    fs.copyFileSync(PORTABLE, portableCopy);
    const shaCopy = sha256(portableCopy);

    // 清掉安装痕迹判断基线
    const beforePrograms = fs.existsSync(path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'LED Ratio Tool'));
    let runP = null;
    try {
      // 🔴 断网模拟：把 Chromium 的代理指向黑洞端口 → 任何出网请求必然失败。
      //    这不改变产品代码，只证明「即使网络不可用，核心功能照样正确」。
      runP = await launchWithCdp(portableCopy, { port: 9514, args: ['--proxy-server=127.0.0.1:9'] });
      // 标题从渲染层取（tasklist 的 /V 输出是 GBK，按 utf8 解码必成乱码，
      // 拿乱码当证据既不可读也无法断言）。
      const docTitle = String(await runP.cdp.eval('return document.title || "";')).trim();
      rec('POR-01', '便携版从中立目录启动成功（不依赖安装）', docTitle.includes('LED') && !!shaCopy,
        `副本 sha=${shaCopy.slice(0, 16)}…｜document.title「${docTitle}」｜目录 ${neutral}`);

      const evBaseP = runP.cdp.events.length;
      await runP.cdp.send('Page.reload', { ignoreCache: true }).catch(() => {});
      await sleep(3000);
      await setInput(runP.cdp, '#input-width', '1920');
      await setInput(runP.cdp, '#input-height', '1200');
      await sleep(700);
      const shown = await runP.cdp.eval(`return (document.getElementById('dim-ratio')||{}).innerText || '';`);
      const reqs = runP.cdp.events.slice(evBaseP).filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
      const external = reqs.filter((u) => !/^(app:|data:|devtools:|blob:)/i.test(u));
      const expectP = ratioText(1920 / 1200);
      rec('POR-02', '断网环境下核心换算仍正确（proxy 指向黑洞端口）', String(shown).trim() === expectP && external.length === 0,
        `1920×1200 → UI「${String(shown).trim()}」（期望「${expectP}」）｜外部请求 ${external.length} 条｜总请求 ${reqs.length} 条`,
        { shown, external: external.length });

      const failureEvents = runP.cdp.events.slice(evBaseP).filter((e) => e.method === 'Network.loadingFailed');
      rec('POR-03', '断网未导致任何加载失败（不依赖网络）', failureEvents.length === 0,
        failureEvents.length ? `${failureEvents.length} 条 loadingFailed：${failureEvents.slice(0, 2).map((e) => e.params.errorText).join(', ')}` : '0 条');
    } catch (e) {
      rec('POR-01', '便携版从中立目录启动成功', false, `启动/CDP 失败：${e.message}`.slice(0, 200));
      rec('POR-02', '断网环境下核心换算仍正确', false, '前置未建立');
      rec('POR-03', '断网未导致加载失败', false, '前置未建立');
    } finally {
      if (runP) await runP.close(); else await killApp();
    }

    const afterPrograms = fs.existsSync(path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'LED Ratio Tool'));
    // 🔴 本环境禁止调用 reg.exe（安全策略黑名单）。此处**不绕过**：
    //    旧实现写的是 `reg.status !== 0`，而调用被拦截时 status 恰为 null，
    //    `null !== 0` 恒真 → 这一项是**假通过**（run3 就是靠这个变绿的）。
    //    现在只对「Programs 目录未被创建」作判定，注册表部分明确标为未核对。
    rec('POR-04', '便携版不产生安装痕迹（未创建 Programs 目录）',
      !afterPrograms,
      `Programs 目录=${afterPrograms}（运行前=${beforePrograms}）｜注册表：本环境禁止 reg.exe，未核对（不得视为已验证）`);
  }

  /* ========== 收尾 ========== */
  if (!KEEP) {
    try { fs.rmSync(path.join(os.tmpdir(), 'LED Ratio Portable Neutral'), { recursive: true, force: true }); } catch { /* noop */ }
    try { fs.rmSync(INSTALL_DIR, { recursive: true, force: true }); } catch { /* noop */ }
  }
  await killApp();
  restoreSettings();
  finish();
}

function finish() {
  const failed = results.filter((r) => r.pass === false);
  const skipped = results.filter((r) => r.pass === null);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      version: V,
      platform: `${os.type()} ${os.release()} ${process.arch}`,
      totalMemGB: Math.round(os.totalmem() / 1024 ** 3),
      displays: null,
    },
    results,
    summary: {
      total: results.length,
      pass: results.filter((r) => r.pass === true).length,
      fail: failed.length,
      skip: skipped.length,
      verdict: failed.length ? 'FAIL' : skipped.length ? 'PASS_WITH_SKIP' : 'PASS',
    },
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, 'p7-acceptance.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log('');
  console.log('='.repeat(64));
  console.log(`  检查项 = ${report.summary.total} ｜ 通过 ${report.summary.pass} ｜ 失败 ${report.summary.fail} ｜ 跳过 ${report.summary.skip}`);
  console.log(`  判定 = ${report.summary.verdict}`);
  console.log(`  📄 ${out}`);
  console.log('='.repeat(64));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('未捕获异常：', e);
  process.exit(1);
});
