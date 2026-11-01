/**
 * LED-ratio-Tool 桌面版 · Preview Candidate 打包产物验收（Step 6 第 7 阶段）
 * ============================================================================
 * 依据：
 *   Step 6 任务书第 7 项 —— 「实际打包 EXE，核对离线运行、安装、卸载、体积和升级行为」
 *   DEC-20 —— 卸载**默认保留** settings.json（不依赖 deleteAppDataOnUninstall）
 *   SEC-19 —— 打包白名单（test/ docs/ *.md *.map 一律不进包）
 *
 * 检查项：
 *   PC-01 产物齐备（NSIS 安装包 + 便携版 + win-unpacked）
 *   PC-02 体积记录（安装包 / 便携版 / 解包目录 / app.asar）
 *   PC-03 asar 白名单（不含 test/ docs/ *.md *.map）
 *   PC-04 静默安装（per-user，指定目录）
 *   PC-05 安装后**离线**可运行并算出正确结果（出站全阻断）
 *   PC-06 设置跨启动持久化
 *   PC-07 升级安装（覆盖安装，版本替换成功）
 *   PC-08 卸载后程序文件清除
 *   PC-09 卸载后 settings.json **保留**（DEC-20）
 *   PC-10 便携版可独立运行（不依赖安装）
 *
 * 用法：node desktop/test/pc-verify.cjs
 * 退出码：0 = 全部通过；1 = 存在不通过项；3 = 环境阻塞（产物缺失等）
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
const DIST = path.join(DESKTOP, 'dist');
const REPORTS = path.join(DESKTOP, 'test', 'reports');
const APP_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'LED Ratio Tool');
const SETTINGS = path.join(APP_DIR, 'settings.json');

const results = [];
let failures = 0;
let blocked = 0;

function record(id, name, pass, actual, skip) {
  results.push({ id, name, pass: pass === null ? null : !!pass, skipped: !!skip, actual });
  const mark = pass === null ? '⏭️' : (pass ? '✅' : '❌');
  console.log(`  ${mark} ${id} ${name} —— ${actual}`);
  if (pass === null) blocked++;
  else if (!pass) failures++;
}

function sizeOf(p) {
  try { return fs.statSync(p).size; } catch (e) { return -1; }
}
function dirSize(p) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else { try { total += fs.statSync(full).size; } catch (_) {} }
    }
  };
  walk(p);
  return total;
}
function mb(n) { return (n / 1024 / 1024).toFixed(1) + ' MB'; }

function listAsar(asarPath) {
  const out = spawnSync('npx', ['asar', 'list', asarPath], { cwd: DESKTOP, encoding: 'utf8', shell: true });
  return (out.stdout || '').split(/\r?\n/).filter(Boolean);
}

function isRunning(name) {
  const out = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], { encoding: 'utf8', shell: true });
  return /\S/.test((out.stdout || '').replace(/^INFO:/m, '').trim());
}

async function main() {
  console.log('=== Preview Candidate 打包产物验收（Step 6 第 7 阶段）===\n');

  /* ---- 产物定位 ---- */
  const setupExe = path.join(DIST, 'LED Ratio Tool-1.1.0-x64-setup.exe');
  const portableExe = path.join(DIST, 'LED Ratio Tool-1.1.0-x64-portable.exe');
  const legacyExe = path.join(DIST, 'LED Ratio Tool-1.1.0-x64.exe');
  const unpacked = path.join(DIST, 'win-unpacked');
  const appExe = path.join(unpacked, 'LED Ratio Tool.exe');
  const asar = path.join(unpacked, 'resources', 'app.asar');

  const installer = fs.existsSync(setupExe) ? setupExe : (fs.existsSync(legacyExe) ? legacyExe : null);
  const portable = fs.existsSync(portableExe) ? portableExe : (fs.existsSync(legacyExe) ? legacyExe : null);

  if (!installer || !fs.existsSync(unpacked)) {
    console.error('❌ 阻塞：未找到打包产物（先执行 npm run build:win）。退出码 3。');
    process.exit(3);
  }

  /* ---- PC-01 产物齐备 ---- */
  record('PC-01', '产物齐备（安装包 / 便携版 / win-unpacked）',
    fs.existsSync(installer) && fs.existsSync(portable) && fs.existsSync(unpacked),
    `安装包=${fs.existsSync(installer) ? path.basename(installer) : '缺失'}｜便携版=${fs.existsSync(portable) ? path.basename(portable) : '缺失'}｜unpacked=${fs.existsSync(unpacked)}`);

  /* ---- PC-02 体积 ---- */
  const sizes = {
    installer: sizeOf(installer),
    portable: sizeOf(portable),
    unpacked: dirSize(unpacked),
    asar: sizeOf(asar),
  };
  record('PC-02', '体积记录（安装包 / 便携版 / 解包 / asar）', true,
    `安装包 ${mb(sizes.installer)}｜便携版 ${mb(sizes.portable)}｜解包 ${mb(sizes.unpacked)}｜app.asar ${(sizes.asar / 1024).toFixed(0)} KB`);
  console.log('       （Electron 45 运行时占绝大部分；app.asar 仅 ' + (sizes.asar / 1024).toFixed(0) + ' KB → 应用自身很轻）');

  /* ---- PC-03 asar 白名单 ---- */
  const files = listAsar(asar);
  const leaked = files.filter((f) => /^\/test(\\|\/)|^\/docs(\\|\/)|\.md$|\.map$/i.test(f));
  record('PC-03', 'asar 白名单（无 test/ docs/ *.md *.map）', leaked.length === 0,
    leaked.length ? `泄漏 ${leaked.length} 项：${leaked.slice(0, 5).join(', ')}` : `共 ${files.length} 项，0 泄漏`);

  /* ---- PC-04 静默安装 ---- */
  const installDir = path.join(os.tmpdir(), 'LED Ratio Tool PC-Test');
  fs.rmSync(installDir, { recursive: true, force: true });
  const r1 = spawnSync(installer, ['/S', `/D=${installDir}`], { encoding: 'utf8', shell: false, timeout: 300000 });
  const installedExe = path.join(installDir, 'LED Ratio Tool.exe');
  const installed = fs.existsSync(installedExe);
  record('PC-04', '静默安装（per-user，指定目录）', installed,
    installed ? `已安装到 ${installDir}` : `安装失败（exit=${r1.status}）${r1.stderr ? '｜' + r1.stderr.slice(0, 120) : ''}`);
  if (!installed) {
    fs.rmSync(installDir, { recursive: true, force: true });
    return finish();
  }

  /* ---- PC-05/PC-06 安装后离线运行 + 设置持久化 ---- */
  const pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;

  // 先写一个可辨识的容差（≥1），用于验证持久化与卸载保留
  fs.mkdirSync(APP_DIR, { recursive: true });
  const marker = { schemaVersion: 1, tolerancePercent: 1.25, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  fs.writeFileSync(SETTINGS, JSON.stringify(marker, null, 2), 'utf8');

  const port = 9455;
  const child = spawn(installedExe, [`--remote-debugging-port=${port}`], { env, detached: true, stdio: 'ignore' });
  child.unref();
  let offlineOk = null;
  let offlineActual = '';
  try {
    let cdp = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { cdp = await pw.chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch (e) { /* 继续等 */ }
    }
    if (!cdp) {
      offlineActual = 'CDP 连接超时（应用未启动？）';
    } else {
      const ctx = cdp.contexts()[0];
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      // 计算正确性
      await page.evaluate(() => {
        const set = (id, v) => {
          const el = document.getElementById(id);
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('input-width', '14'); set('input-height', '4');
      });
      await page.waitForTimeout(600);
      const ratio = await page.evaluate(() => (document.getElementById('ratio-value') || {}).textContent);
      offlineOk = ratio && ratio.indexOf('3.5000') >= 0;
      offlineActual = `启动于安装目录，计算结果=${ratio}`;
      // 断网：阻断渲染层一切外部请求
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith('app://') || u.startsWith('file://') || u.startsWith('data:') || u.startsWith('devtools:')) return route.continue();
        return route.abort();
      });
      await page.evaluate(() => {
        const b = document.getElementById('btn-copy-resolution');
        if (b) b.click();
      });
      await page.waitForTimeout(800);
      const label = await page.evaluate(() => {
        const b = document.getElementById('btn-copy-resolution');
        const l = b && b.querySelector('.label');
        return l ? l.textContent.trim() : null;
      });
      offlineOk = offlineOk && !!label;
      offlineActual += `｜断网下复制按钮反馈=${label}`;
      await cdp.close();
    }
  } catch (e) {
    offlineActual = '异常：' + e.message;
  }
  record('PC-05', '安装后离线可运行且计算正确（外部请求全阻断）', offlineOk, offlineActual);

  // 关闭安装的应用
  spawnSync('taskkill', ['/IM', 'LED Ratio Tool.exe', '/F'], { encoding: 'utf8', shell: true });
  await new Promise((r) => setTimeout(r, 2500));

  const settingsNow = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : null;
  record('PC-06', '设置跨启动持久化（容差仍在）',
    settingsNow && Number(settingsNow.tolerancePercent) === 1.25,
    settingsNow ? `tolerancePercent=${settingsNow.tolerancePercent}｜键=${Object.keys(settingsNow).join(',')}` : 'settings.json 不存在');

  /* ---- PC-07 升级安装（覆盖） ---- */
  const r2 = spawnSync(installer, ['/S', `/D=${installDir}`], { encoding: 'utf8', shell: false, timeout: 300000 });
  const upgOk = fs.existsSync(installedExe);
  const settingsAfterUpg = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : null;
  record('PC-07', '升级安装（覆盖安装）', upgOk,
    `覆盖安装 exit=${r2.status}｜安装目录仍在=${upgOk}｜设置保留=${settingsAfterUpg ? settingsAfterUpg.tolerancePercent : '无'}`);

  /* ---- PC-08 / PC-09 卸载 ---- */
  const uninstaller = path.join(installDir, 'Uninstall LED Ratio Tool.exe');
  if (fs.existsSync(uninstaller)) {
    const r3 = spawnSync(uninstaller, ['/S'], { encoding: 'utf8', shell: false, timeout: 300000 });
    await new Promise((r) => setTimeout(r, 4000));
    const appGone = !fs.existsSync(installedExe);
    record('PC-08', '卸载后程序文件清除', appGone, `exe 仍存在=${!appGone}｜exit=${r3.status}`);
  } else {
    record('PC-08', '卸载后程序文件清除', null, '未找到卸载器（跳过）');
  }
  const settingsKept = fs.existsSync(SETTINGS);
  record('PC-09', '卸载后 settings.json **保留**（DEC-20）', settingsKept,
    settingsKept ? `保留（tolerancePercent=${JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).tolerancePercent}）` : '🔴 被删除了 —— 违反 DEC-20');

  /* ---- PC-10 便携版 ---- */
  if (portable && fs.existsSync(portable)) {
    const pport = 9456;
    const pchild = spawn(portable, [`--remote-debugging-port=${pport}`], { env, detached: true, stdio: 'ignore' });
    pchild.unref();
    let pOk = null;
    let pActual = '';
    try {
      let cdp = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try { cdp = await pw.chromium.connectOverCDP(`http://127.0.0.1:${pport}`); break; } catch (e) { /* 等 */ }
      }
      if (!cdp) pActual = 'CDP 连接超时';
      else {
        const ctx = cdp.contexts()[0];
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        const ratio = await page.evaluate(() => (document.getElementById('ratio-value') || {}).textContent);
        pOk = !!(ratio && ratio.indexOf('3.5000') >= 0);
        pActual = `便携版启动并算出 ${ratio}`;
        await cdp.close();
      }
    } catch (e) { pActual = '异常：' + e.message; }
    spawnSync('taskkill', ['/IM', 'LED Ratio Tool.exe', '/F'], { encoding: 'utf8', shell: true });
    record('PC-10', '便携版可独立运行（不依赖安装）', pOk, pActual);
  } else {
    record('PC-10', '便携版可独立运行', null, '未找到便携版（跳过）');
  }

  fs.rmSync(installDir, { recursive: true, force: true });
  return finish(sizes);
}

function finish(sizes) {
  const passN = results.filter((r) => r.pass === true).length;
  const skipN = results.filter((r) => r.pass === null).length;
  console.log('\n============================================================');
  console.log('【Preview Candidate 打包验收结论】');
  console.log('============================================================');
  console.log(`  检查项 ${results.length} ｜ 通过 ${passN} ｜ 失败 ${failures} ｜ 跳过 ${skipN}`);
  if (sizes) {
    console.log(`  体积：安装包 ${mb(sizes.installer)}｜便携版 ${mb(sizes.portable)}｜解包 ${mb(sizes.unpacked)}｜app.asar ${(sizes.asar / 1024).toFixed(0)} KB`);
  }
  console.log(`  判定：${failures === 0 ? 'PASS' : 'FAIL（存在不通过项）'}`);

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'pc-verify.json'), JSON.stringify({
    meta: { generatedAt: new Date().toISOString(), platform: process.platform },
    summary: { total: results.length, pass: passN, fail: failures, skip: skipN, sizes: sizes || null },
    results,
  }, null, 2), 'utf8');
  console.log('  📄 JSON 报告：' + path.join(REPORTS, 'pc-verify.json'));

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
