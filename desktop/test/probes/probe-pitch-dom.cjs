/**
 * LED-ratio-Tool 桌面版 · v1.3.0 P 值 / PX 换算 / 箱体核验 DOM 层取证探针
 * ===========================================================================
 * 🔴 用途：在真实 Chrome 渲染层加载**桌面生成副本**，验证
 *    「设置 UI → LedPitch → app.js → 结果模块」整条链路。
 *
 * ⚠️ 边界（如实披露，不得当作 Electron E2E 的替代）：
 *    · 本探针用 Chrome `file://` 加载 desktop/renderer/index.html，
 *      并用 addInitScript 桩替代 preload 的 8 个 ledApi 方法；
 *    · 它**不覆盖** Electron BrowserWindow / IPC 主进程 / 原生窗口 / 打包产物；
 *    · 完整桌面验收仍以「Desktop E2E（desktop-suite）+ GitHub CI」为准。
 *    · 用途是让新增 P 值逻辑在无 GUI / GPU 的环境里仍有一条可复跑的 UI 取证链。
 *
 * 覆盖 D-01 ~ D-18，共 18 项。
 * 用法：node test/probes/probe-pitch-dom.cjs
 * 产物：test/reports/v1.3.0/pitch-dom-check.json
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..', '..');
const REPO_DESKTOP = process.env.PW_DESKTOP_ROOT || DESKTOP;
const HTML = 'file:///' + path.join(DESKTOP, 'renderer', 'index.html').replace(/\\/g, '/');
const OUT = path.join(DESKTOP, 'test', 'reports', 'v1.3.0', 'pitch-dom-check.json');

function loadPlaywright() {
  const candidates = [
    path.join(REPO_DESKTOP, 'node_modules', 'playwright-core'),
    path.join(DESKTOP, 'node_modules', 'playwright-core'),
    'playwright-core',
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* next */ }
  }
  throw new Error('未找到 playwright-core');
}

(async () => {
  const PW = loadPlaywright();
  const browser = await PW.chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });

  await page.addInitScript(() => {
    var seed = null;
    try { seed = localStorage.getItem('__ledStubSettings'); } catch (_) { /* ignore */ }
    window.__ledSettings = seed ? JSON.parse(seed) : {
      schemaVersion: 1, tolerancePercent: 0.5, pixelPitchMm: null,
      createdAt: 'stub', updatedAt: 'stub',
    };
    function save() {
      try { localStorage.setItem('__ledStubSettings', JSON.stringify(window.__ledSettings)); } catch (_) { /* ignore */ }
    }
    window.__ledSetCalls = [];
    window.ledApi = {
      settingsGet: async () => ({ code: 0, message: 'ok', data: Object.assign({}, window.__ledSettings) }),
      settingsSet: async (p) => {
        window.__ledSetCalls.push(Object.assign({}, p));
        Object.assign(window.__ledSettings, p);
        save();
        return { code: 0, message: 'ok', data: null };
      },
      clipboardWriteText: async () => ({ code: 0, message: 'ok', data: { ok: true } }),
      specOpen: async () => ({ code: 0, message: 'ok', data: { cancelled: true } }),
      specExport: async () => ({ code: 0, message: 'ok', data: { cancelled: true } }),
      appVersion: async () => ({ code: 0, message: 'ok', data: {
        version: '1.3.0', coreVersion: 'core@1.0.1', htmlVersion: '1.0.1',
        buildTime: 'stub', electron: '45.1.0', chrome: 'stub', node: 'stub',
      } }),
      windowAction: async () => ({ code: 0, message: 'ok', data: null }),
      openExternal: async () => ({ code: 0, message: 'ok', data: null }),
    };
  });

  const results = [];
  const rec = (id, title, ok, detail) => {
    results.push({ id, title, ok: !!ok, detail });
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} ${title} ｜ ${detail}`);
  };
  const wait = (ms) => page.waitForTimeout(ms);

  async function setInput(id, value) {
    await page.evaluate(([elId, v]) => {
      const el = document.getElementById(elId);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, value]);
  }
  async function clickUnit(u) {
    await page.click(`.unit-segment[data-unit="${u}"]`);
    await wait(120);
  }
  async function openSettings() {
    const opened = await page.evaluate(() => {
      const layer = document.getElementById('modal-layer');
      return !!layer && layer.hidden === false;
    });
    if (!opened) await page.click('#ft-settings');
    await wait(150);
  }
  async function closeSettings() {
    const opened = await page.evaluate(() => {
      const layer = document.getElementById('modal-layer');
      return !!layer && layer.hidden === false;
    });
    if (opened) await page.click('#modal-close');
    await wait(120);
  }
  async function setCustomPitch(v) {
    await openSettings();
    await setInput('input-pitch-custom', v);
    await wait(320);
  }
  async function read() {
    return page.evaluate(() => ({
      pitch: window.LedPitch ? window.LedPitch.getPitch() : null,
      snap: window.LedPitch ? window.LedPitch.snapshot() : null,
      appUnit: window.LedApp ? window.LedApp.state.unit : null,
      widthText: window.LedApp ? window.LedApp.state.widthText : null,
      heightText: window.LedApp ? window.LedApp.state.heightText : null,
      ratioDom: (document.getElementById('ratio-value') || {}).textContent,
      native: (document.getElementById('pitch-native-block') || {}).textContent || '',
      cabinet: (document.getElementById('cabinet-verify-block') || {}).textContent || '',
      status: (document.getElementById('pitch-status') || {}).textContent || '',
      pitchError: (document.getElementById('pitch-error') || {}).textContent || '',
      lastSet: window.__ledSetCalls && window.__ledSetCalls.length
        ? window.__ledSetCalls[window.__ledSetCalls.length - 1] : null,
      fullText: window.LedApp ? window.LedApp.buildFullParameterText() : '',
    }));
  }

  await page.goto(HTML, { waitUntil: 'domcontentloaded' });
  await wait(500);

  /* ---- D-01 模块加载与结构 ---- */
  let s = await read();
  const d01 = await page.evaluate(() => ({
    version: window.LedPitch && window.LedPitch.MODULE_VERSION,
    presets: window.LedPitch && window.LedPitch.PITCH_PRESETS.length,
    native: !!document.getElementById('pitch-native-block'),
    cabinet: !!document.getElementById('cabinet-verify-block'),
    nativeOpen: document.getElementById('pitch-native-block') && document.getElementById('pitch-native-block').open,
    cabinetOpen: document.getElementById('cabinet-verify-block') && document.getElementById('cabinet-verify-block').open,
    scripts: Array.from(document.querySelectorAll('script')).map((x) => x.getAttribute('src')),
  }));
  rec('D-01', 'led-pitch.js 加载且两个结果模块存在、默认折叠',
    d01.version === '1.3.0' && d01.presets === 10 && d01.native && d01.cabinet &&
    d01.nativeOpen === false && d01.cabinetOpen === false && d01.scripts.includes('led-pitch.js'),
    JSON.stringify(d01));

  /* ---- D-02 首屏未配置态 ---- */
  rec('D-02', '未配置 P 时显示明确状态、估算禁用、不默认 P2.5',
    s.pitch.value === null && /未配置/.test(s.native) && /禁止/.test(s.native) && !/5600 × 1600/.test(s.native),
    `pitch=${JSON.stringify(s.pitch)} ｜ native="${s.native.slice(0, 90)}…"`);

  /* ---- D-03 设置项独立性 ---- */
  await openSettings();
  const d03 = await page.evaluate(() => ({
    tolerance: !!document.getElementById('input-tolerance'),
    pitchInput: !!document.getElementById('input-pitch-custom'),
    presets: document.querySelectorAll('.pitch-preset').length,
    status: (document.getElementById('pitch-status') || {}).textContent,
    toleranceLabel: (document.querySelector('.settings-row label[for="input-tolerance"]') || {}).textContent,
    pitchLabel: (document.querySelector('.pitch-settings-head label') || {}).textContent,
  }));
  rec('D-03', '设置模态内两项独立：容差 + LED 像素间距 P（10 个预设）',
    d03.tolerance && d03.pitchInput && d03.presets === 10 && /未配置/.test(d03.status) &&
    /容差/.test(d03.toleranceLabel) && /像素间距/.test(d03.pitchLabel),
    JSON.stringify(d03));
  await closeSettings();

  /* ---- D-04 P2.5 预设 ---- */
  await openSettings();
  await page.click('.pitch-preset[data-pitch="2.5"]');
  await wait(350);
  s = await read();
  rec('D-04', 'P2.5：14000×4000 mm → 5600 × 1600 px / 3.5 : 1，且写入 settings.set 载荷',
    s.pitch.value === 2.5 && /5600 × 1600 px/.test(s.native) && /3.5 : 1/.test(s.native) &&
    /已配置/.test(s.status) && s.lastSet && s.lastSet.pixelPitchMm === 2.5 &&
    typeof s.lastSet.tolerancePercent === 'number',
    `pitch=${s.pitch.value} ｜ status=${s.status} ｜ lastSet=${JSON.stringify(s.lastSet)} ｜ native含5600=${/5600 × 1600/.test(s.native)}`);
  await closeSettings();

  /* ---- D-05 自定义 P1.86 精度与误差 ---- */
  await setCustomPitch('1.86');
  s = await read();
  rec('D-05', 'P1.86：7526.881720 / 2150.537634 → 7527 × 2151，整数化误差显式显示',
    s.pitch.value === 1.86 && /7526\.881720/.test(s.native) && /2150\.537634/.test(s.native) &&
    /7527 × 2151 px/.test(s.native) && /整数化误差/.test(s.native) && /未静默修正/.test(s.native),
    `native="${s.native.replace(/\\s+/g, ' ').slice(0, 210)}…"`);
  await closeSettings();

  /* ---- D-06 非法输入 ---- */
  const illegal = [];
  for (const v of ['NaN', 'Infinity', '0', '-2', 'abc']) {
    await setCustomPitch(v);
    const r = await read();
    illegal.push({ v, pitch: r.pitch.value, err: r.pitchError, hasNumber: /7526\.881720/.test(r.native) });
  }
  rec('D-06', '非法 P 值（NaN/Infinity/0/负数/非数值）被拒绝、既有值不变、错误提示明确',
    illegal.every((x) => x.pitch === 1.86 && x.err.length > 0 && x.hasNumber),
    JSON.stringify(illegal));
  await closeSettings();

  /* ---- D-07 回到未配置 ---- */
  await setCustomPitch('');
  s = await read();
  rec('D-07', '清空自定义输入 → 回到未配置（null），估算再次禁用',
    s.pitch.value === null && /未配置/.test(s.status) && /禁止/.test(s.native),
    `pitch=${JSON.stringify(s.pitch)} ｜ status=${s.status}`);
  await closeSettings();

  /* ---- D-08 物理 → px（按 P 换算）---- */
  await setCustomPitch('2.5');
  await closeSettings();
  await clickUnit('mm');
  await setInput('input-width', '14000');
  await setInput('input-height', '4000');
  await wait(150);
  await clickUnit('px');
  s = await read();
  rec('D-08', '物理尺寸 → px 按 P2.5 换算为 5600 × 1600（不是 14000 × 4000）',
    s.appUnit === 'px' && s.widthText === '5600' && s.heightText === '1600' &&
    s.snap.pxOrigin === 'converted' && s.snap.physicalWidthMm === 14000,
    `unit=${s.appUnit} 文本=${s.widthText}×${s.heightText} origin=${s.snap.pxOrigin} physical=${s.snap.physicalWidthMm}`);

  /* ---- D-09 P 变更 → 换算来源的 px 显示重算 ---- */
  await setCustomPitch('1.86');
  await closeSettings();
  s = await read();
  rec('D-09', 'P 改为 1.86 后换算来源的 px 立即重算为 7527 × 2151',
    s.widthText === '7527' && s.heightText === '2151' && s.appUnit === 'px',
    `文本=${s.widthText}×${s.heightText} unit=${s.appUnit}`);

  /* ---- D-10 PX 直接输入不被 P 篡改 ---- */
  await setInput('input-width', '3840');
  await setInput('input-height', '1080');
  await wait(180);
  await setCustomPitch('3');
  await closeSettings();
  s = await read();
  rec('D-10', 'PX 直接输入 3840×1080 后改 P 值：像素值不被篡改，物理尺寸保持 14000×4000',
    s.widthText === '3840' && s.heightText === '1080' &&
    s.snap.resolutionWidthPx === 3840 && s.snap.resolutionHeightPx === 1080 &&
    s.snap.physicalWidthMm === 14000 && s.snap.physicalHeightMm === 4000 &&
    s.snap.pxOrigin === 'direct',
    `文本=${s.widthText}×${s.heightText} origin=${s.snap.pxOrigin} resolution=${s.snap.resolutionWidthPx}×${s.snap.resolutionHeightPx} physical=${s.snap.physicalWidthMm}×${s.snap.physicalHeightMm}`);

  /* ---- D-11 px → m 恢复原始物理尺寸，不反算 ---- */
  await clickUnit('m');
  s = await read();
  rec('D-11', 'px → m 恢复原始 14 m × 4 m（不反算 3.84 m）、比例回到 3.5000:1',
    s.appUnit === 'm' && s.widthText === '14' && s.heightText === '4' &&
    s.snap.physicalWidthMm === 14000 && /3\.5000/.test(s.ratioDom),
    `unit=${s.appUnit} 文本=${s.widthText}×${s.heightText} ratio=${s.ratioDom}`);

  /* ---- D-12 未配置 P 时禁止换算 ---- */
  await setCustomPitch('');
  await closeSettings();
  await clickUnit('px');
  s = await read();
  rec('D-12', '未配置 P 时物理 → px 禁止换算、给出明确提示、原物理尺寸不变',
    /未配置/.test(s.native) && /禁止/.test(s.native) &&
    s.snap.physicalWidthMm === 14000 && s.snap.physicalHeightMm === 4000,
    `native含禁止=${/禁止/.test(s.native)} physical=${s.snap.physicalWidthMm}×${s.snap.physicalHeightMm}`);
  await clickUnit('m');

  /* ---- D-13 箱体完全匹配 ---- */
  await setCustomPitch('2.5');
  await closeSettings();
  const cab = { widthMm: 500, heightMm: 500, pixelsX: 200, pixelsY: 200, cols: 28, rows: 8 };
  for (const [k, v] of Object.entries(cab)) await setInput('cabinet-' + k, v);
  await wait(200);
  s = await read();
  rec('D-13', '箱体完全匹配：拼接 14000×4000 mm / 5600×1600 px，结论「完全匹配」',
    /14000 mm/.test(s.cabinet) && /4000 mm/.test(s.cabinet) && /5600 × 1600 px/.test(s.cabinet) &&
    /完全匹配/.test(s.cabinet) && /箱体像素矩阵计算/.test(s.cabinet) && /理论 P 值估算/.test(s.cabinet),
    `cabinet="${s.cabinet.replace(/\\s+/g, ' ').slice(0, 200)}…"`);

  /* ---- D-14 箱体轻微差异 + 来源分列 ---- */
  await setInput('cabinet-pixelsX', 269);
  await setInput('cabinet-pixelsY', 269);
  await wait(200);
  s = await read();
  rec('D-14', '箱体像素矩阵与理论估算有差异时显式列出，两类来源始终分列',
    /存在差异/.test(s.cabinet) && /水平像素差异/.test(s.cabinet) &&
    s.cabinet.indexOf('理论 P 值估算') !== s.cabinet.lastIndexOf('理论 P 值估算'),
    `cabinet含差异=${/存在差异/.test(s.cabinet)} 含水平像素差异=${/水平像素差异/.test(s.cabinet)}`);

  /* ---- D-15 非法像素矩阵 ---- */
  await setInput('cabinet-pixelsX', '0');
  await wait(200);
  s = await read();
  rec('D-15', '非法像素矩阵（0）显示明确错误，不产出伪造结果',
    /箱体参数不可用/.test(s.cabinet) && /pixelsX/.test(s.cabinet),
    `cabinet="${s.cabinet.replace(/\\s+/g, ' ').slice(0, 160)}…"`);

  /* ---- D-16 持久化：settings.set 载荷 + 重新加载后回读 ---- */
  await setCustomPitch('1.667');
  await closeSettings();
  await wait(320);
  const beforeReload = await read();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(500);
  const afterReload = await read();
  rec('D-16', 'P 值持久化：settings.set 载荷正确，重新加载页面后 P1.667 回读保留',
    beforeReload.lastSet && beforeReload.lastSet.pixelPitchMm === 1.667 &&
    afterReload.pitch.value === 1.667 && /1\.667/.test(afterReload.native),
    `载荷=${JSON.stringify(beforeReload.lastSet)} ｜ 重载后 pitch=${afterReload.pitch.value} ｜ 估算模块含 P1.667=${/1\.667/.test(afterReload.native)}`);

  /* ---- D-17 画布建议 / 复制参数不被伪装 ---- */
  const d17 = await page.evaluate(() => ({
    full: window.LedApp.buildFullParameterText(),
    res: window.LedApp.buildResolutionText(),
    hasEstimateWording: /理论整数分辨率估算|原生分辨率估算/.test(window.LedApp.buildFullParameterText()),
  }));
  rec('D-17', '复制完整参数仍为既有 14 段口径，不把理论估算伪装成控制器确认分辨率',
    !d17.hasEstimateWording && /需现场确认/.test(d17.full) && /LED 控制系统接收分辨率/.test(d17.full),
    `含估算字样=${d17.hasEstimateWording} 含现场确认=${/需现场确认/.test(d17.full)}`);

  /* ---- D-18 渲染层零错误 ---- */
  rec('D-18', '渲染层无 console error / pageerror（SEC-31）',
    consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await browser.close();

  const pass = results.filter((r) => r.ok).length;
  const out = {
    generatedAt: new Date().toISOString(),
    appVersion: '1.3.0',
    boundary: 'Chrome file:// DOM 层取证，非 Electron E2E 替代；不覆盖 IPC 主进程 / 原生窗口 / 打包产物',
    summary: { total: results.length, pass, fail: results.length - pass, verdict: pass === results.length ? 'PASS' : 'FAIL' },
    results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n[v1.3.0 P 值 DOM 探针] ${out.summary.verdict}（${pass}/${results.length}）→ ${OUT}`);
  process.exit(out.summary.fail ? 1 : 0);
})().catch((e) => {
  console.error('[pitch-dom] 失败:', e);
  process.exit(1);
});
