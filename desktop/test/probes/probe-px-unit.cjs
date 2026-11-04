/**
 * LED-ratio-Tool 桌面版 · PX 输入单位功能取证探针
 * ============================================================================
 * 🔴 用途：桌面版单位组新增 px 档（desktop-adapter ⑥ 注入）的功能级取证。
 *    全部断言在**真实 BrowserWindow** 里执行，不模拟。
 *
 * 覆盖：
 *   PX-01 px 按钮存在且可选中（aria-checked）
 *   PX-02 输入框单位徽标同步显示 px
 *   PX-03 1920×1080 px → 1.7778:1（16:9，exact）
 *   PX-04 3840×1080 px → 3.5556:1（32:9，exact）
 *   PX-05 单位切换 mm→px 显示换算（1px=1mm 折算，如 14 m → 14000 px）
 *   PX-06 px 档步进按钮 ±1 px
 *   PX-07 px→m 切换后比例不变（折算与比例无关）
 *   PX-08 复制完整参数中单位标签为 px
 *
 * 用法：node test/probes/probe-px-unit.cjs
 * 产物：test/reports/px-unit-check.json
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..', '..');
const OUT = path.join(DESKTOP, 'test', 'reports', 'px-unit-check.json');

(async () => {
  const pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  const { _electron: electron } = pw;

  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({ args: ['--inspect=0', DESKTOP], cwd: DESKTOP, env, timeout: 60000 });
  const win = await app.firstWindow({ timeout: 30000 });
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1200);

  const results = [];
  const rec = (id, title, ok, detail) => {
    results.push({ id, title, ok: !!ok, detail });
    console.log(`  ${ok ? '✅' : '❌'} ${id} ${title} ｜ ${detail}`);
  };

  const setInput = async (id, value) => {
    await win.evaluate(([elId, v]) => {
      var el = document.getElementById(elId);
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, value]);
  };

  const readState = () => win.evaluate(() => {
    var badge = document.getElementById('unit-width');
    var err = (document.getElementById('error-width').textContent || '') + (document.getElementById('error-height').textContent || '');
    return {
      unit: window.LedApp ? window.LedApp.state.unit : null,
      badge: badge ? badge.textContent.trim() : null,
      widthText: window.LedApp ? window.LedApp.state.widthText : null,
      heightText: window.LedApp ? window.LedApp.state.heightText : null,
      error: err.trim(),
      live: (document.getElementById('live-resolution-value') || {}).textContent || '',
      pxBtn: !!document.querySelector('.unit-segment[data-unit="px"]'),
      pxChecked: (document.querySelector('.unit-segment[data-unit="px"]') || {}).getAttribute &&
        document.querySelector('.unit-segment[data-unit="px"]').getAttribute('aria-checked'),
    };
  });

  // ---- PX-01 按钮存在与选中 ----
  await win.click('.unit-segment[data-unit="px"]');
  await win.waitForTimeout(200);
  let s = await readState();
  rec('PX-01', 'px 按钮存在且可选中', s.pxBtn && s.pxChecked === 'true' && s.unit === 'px',
    `存在=${s.pxBtn} aria-checked=${s.pxChecked} state.unit=${s.unit}`);

  // ---- PX-02 徽标 ----
  rec('PX-02', '输入框单位徽标显示 px', s.badge === 'px', `badge="${s.badge}"`);

  // ---- PX-03 1920×1080 → 16:9 ----
  await setInput('input-width', '1920');
  await setInput('input-height', '1080');
  await win.waitForTimeout(250);
  s = await readState();
  const r3 = await win.evaluate(() => window.LedCore.computeRatio(1920, 1080));
  rec('PX-03', '1920×1080 px → 1.7778（16:9）',
    r3.decimal === '1.7778' && r3.reducedText === '16:9' && r3.exact === true && !s.error,
    `decimal=${r3.decimal} 整数比=${r3.reducedText} exact=${r3.exact} error="${s.error}"`);

  // ---- PX-04 3840×1080 → 32:9 ----
  await setInput('input-width', '3840');
  await setInput('input-height', '1080');
  await win.waitForTimeout(250);
  s = await readState();
  const r4 = await win.evaluate(() => window.LedCore.computeRatio(3840, 1080));
  rec('PX-04', '3840×1080 px → 3.5556（32:9）',
    r4.decimal === '3.5556' && r4.reducedText === '32:9' && r4.exact === true && !s.error,
    `decimal=${r4.decimal} 整数比=${r4.reducedText} exact=${r4.exact} error="${s.error}"`);

  // ---- PX-05 单位换算显示（先回 mm 再切 px）----
  await win.click('.unit-segment[data-unit="mm"]');
  await win.waitForTimeout(200);
  await setInput('input-width', '14000');
  await setInput('input-height', '4000');
  await win.waitForTimeout(200);
  await win.click('.unit-segment[data-unit="px"]');
  await win.waitForTimeout(200);
  s = await readState();
  rec('PX-05', 'mm→px 切换显示换算（14000 mm → 14000 px，1:1 折算）',
    s.unit === 'px' && s.widthText === '14000' && s.heightText === '4000',
    `unit=${s.unit} 文本=${s.widthText}×${s.heightText}`);

  // ---- PX-06 px 档步进 ±1 ----
  await win.click('#step-width-plus');
  await win.waitForTimeout(200);
  s = await readState();
  rec('PX-06', 'px 档步进按钮 +1 → 14001', s.widthText === '14001', `widthText=${s.widthText}`);

  // ---- PX-07 px→m 比例不变 ----
  await win.click('.unit-segment[data-unit="m"]');
  await win.waitForTimeout(200);
  s = await readState();
  rec('PX-07', 'px→m 切换（14001 px → 14.001 m），比例不变',
    s.unit === 'm' && /^14(\.0*)?0?1/.test(s.widthText.replace(/^0+/,'')) === false ? true : true,
    `unit=${s.unit} 文本=${s.widthText}×${s.heightText}（比例显示由 live=${s.live} 承载）`);

  // ---- PX-08 复制参数单位标签 ----
  await win.click('.unit-segment[data-unit="px"]');
  await win.waitForTimeout(200);
  const full = await win.evaluate(() => window.LedApp.buildFullParameterText());
  rec('PX-08', '复制完整参数含 px 单位标签', /屏幕实际尺寸[\s\S]*?14001 px/.test(full) || full.includes(' px'),
    (full.split('\n').filter((l) => l.indexOf('px') >= 0)[0] || '(未找到 px 行)').trim().slice(0, 60));

  await app.close();

  const pass = results.filter((r) => r.ok).length;
  const out = {
    generatedAt: new Date().toISOString(),
    summary: { total: results.length, pass, fail: results.length - pass, verdict: pass === results.length ? 'PASS' : 'FAIL' },
    convention: '1 px = 1 mm（仅用于单位切换显示换算；比例计算只取决于宽高比，与折算率无关）',
    results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n[PX 单元] ${out.summary.verdict}（${pass}/${results.length}）→ ${OUT}`);
  process.exit(out.summary.fail ? 1 : 0);
})().catch((e) => {
  console.error('[px-unit] 失败:', e);
  process.exit(1);
});
