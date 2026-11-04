/**
 * LED-ratio-Tool 桌面版 · PX 输入单位功能取证探针
 * ============================================================================
 * 🔴 用途：桌面版单位组新增 px 档（desktop-adapter ⑥ 注入）的功能级取证。
 *    全部断言在**真实 BrowserWindow** 里执行，不模拟。
 *
 * 🔴 测量口径（v2 · 2026-11-04 修正）：
 *    · **UI 输入链路优先** —— 比值断言取自实际结果 DOM（#ratio-value、
 *      #table-wrap 首行、#core-note），状态断言取自 LedApp.state；
 *      **不直接调用 LedCore.computeRatio 写死数值**（核心函数本身由
 *      单元测试与黄金向量覆盖，本探针验证的是「输入 → 渲染」链路）。
 *    · 换算验证用**真实往返**：px → m 切换后同时断言
 *      「显示值换算正确」与「比值 DOM 逐字不变」。
 *
 * 覆盖：
 *   PX-01 px 按钮存在且可选中（aria-checked）
 *   PX-02 输入框单位徽标同步显示 px
 *   PX-03 1920×1080 px → 比值 DOM=1.7778 : 1，结果表=输入尺寸 1920 px × 1080 px
 *   PX-04 3840×1080 px → 比值 DOM=3.5556 : 1（32:9）
 *   PX-05 单位切换 mm→px 显示换算（1px=1mm 折算，如 14000 mm → 14000 px）
 *   PX-06 px 档步进按钮 ±1 px
 *   PX-07 px→m 真实往返：显示换算正确（14001 px → 14.001 m）且比值 DOM 逐字不变
 *   PX-09 px 模式提示语切换（语义说明 ↔ 原提示恢复）
 *   PX-08 px 模式复制参数：语义标签「输入尺寸：」+ px 单位
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

  // 🔴 统一观测口：状态 + 实际结果 DOM（比值 / 结果表首行 / 说明行 / 徽标 / 提示语）
  const readState = () => win.evaluate(() => {
    var st = window.LedApp ? window.LedApp.state : null;
    var badge = document.getElementById('unit-width');
    var ratio = document.getElementById('ratio-value');
    var firstRow = document.querySelector('#table-wrap tbody tr');
    var rowName = firstRow ? firstRow.cells[0].textContent.trim() : null;
    var rowScreen = firstRow ? firstRow.cells[1].textContent.trim() : null;
    var note = document.getElementById('core-note');
    var err = (document.getElementById('error-width').textContent || '')
      + (document.getElementById('error-height').textContent || '');
    var hint = null;
    Array.prototype.some.call(document.querySelectorAll('.hint'), function (h) {
      if (h.textContent.indexOf('单位切换只改变显示值') >= 0 || h.textContent.indexOf('PX 模式') === 0) {
        hint = h.textContent; return true;
      }
      return false;
    });
    return {
      unit: st ? st.unit : null,
      widthMm: st ? st.widthMm : null,
      heightMm: st ? st.heightMm : null,
      widthText: st ? st.widthText : null,
      heightText: st ? st.heightText : null,
      badge: badge ? badge.textContent.trim() : null,
      ratioDom: ratio ? ratio.textContent.trim() : null,
      rowName: rowName,
      rowScreen: rowScreen,
      noteHead: note ? note.textContent.trim().slice(0, 24) : null,
      error: err.trim(),
      pxBtn: !!document.querySelector('.unit-segment[data-unit="px"]'),
      pxChecked: (document.querySelector('.unit-segment[data-unit="px"]') || { getAttribute: function () { return null; } })
        .getAttribute('aria-checked'),
      hint: hint,
    };
  });

  const clickUnit = async (u) => { await win.click(`.unit-segment[data-unit="${u}"]`); await win.waitForTimeout(250); };

  // ---- PX-01 按钮存在与选中 ----
  await clickUnit('px');
  let s = await readState();
  rec('PX-01', 'px 按钮存在且可选中', s.pxBtn && s.pxChecked === 'true' && s.unit === 'px',
    `存在=${s.pxBtn} aria-checked=${s.pxChecked} state.unit=${s.unit}`);

  // ---- PX-02 徽标 ----
  rec('PX-02', '输入框单位徽标显示 px', s.badge === 'px', `badge="${s.badge}"`);

  // ---- PX-03 1920×1080 px（UI 链路：输入 → 状态 → 结果 DOM）----
  await setInput('input-width', '1920');
  await setInput('input-height', '1080');
  await win.waitForTimeout(250);
  s = await readState();
  rec('PX-03', '1920×1080 px：比值 DOM=1.7778 : 1、结果表=输入尺寸 1920 px × 1080 px',
    s.widthMm === 1920 && s.heightMm === 1080
    && s.ratioDom.indexOf('1.7778') >= 0
    && s.rowName === '输入尺寸'
    && s.rowScreen === '1920 px × 1080 px'
    && s.noteHead.indexOf('输入像素尺寸') === 0
    && !s.error,
    `状态=${s.widthMm}×${s.heightMm}mm ｜ 比值DOM="${s.ratioDom}" ｜ 表行="${s.rowName}: ${s.rowScreen}" ｜ note="${s.noteHead}…" ｜ error="${s.error}"`);

  // ---- PX-04 3840×1080 px ----
  await setInput('input-width', '3840');
  await win.waitForTimeout(250);
  s = await readState();
  rec('PX-04', '3840×1080 px：比值 DOM=3.5556 : 1',
    s.widthMm === 3840 && s.ratioDom.indexOf('3.5556') >= 0 && !s.error,
    `状态=${s.widthMm}×${s.heightMm}mm ｜ 比值DOM="${s.ratioDom}" ｜ 表行="${s.rowScreen}"`);

  // ---- PX-05 mm→px 显示换算 ----
  await clickUnit('mm');
  await setInput('input-width', '14000');
  await setInput('input-height', '4000');
  await win.waitForTimeout(200);
  await clickUnit('px');
  s = await readState();
  rec('PX-05', 'mm→px 切换显示换算（14000 mm → 14000 px，1:1 折算）',
    s.unit === 'px' && s.widthText === '14000' && s.heightText === '4000',
    `unit=${s.unit} 文本=${s.widthText}×${s.heightText}`);

  // ---- PX-06 px 档步进 ±1 ----
  await win.click('#step-width-plus');
  await win.waitForTimeout(250);
  s = await readState();
  rec('PX-06', 'px 档步进按钮 +1 → 14001', s.widthText === '14001', `widthText=${s.widthText}`);

  // ---- PX-07 px→m 真实往返（换算正确 + 比值 DOM 逐字不变）----
  const ratioInPx = s.ratioDom; // 14001×4000 px 的比值 DOM
  await clickUnit('m');
  s = await readState();
  rec('PX-07', 'px→m 往返：14001 px → 14.001 m，比值 DOM 逐字不变',
    s.unit === 'm' && s.widthText === '14.001' && s.heightText === '4'
    && s.rowName === '实际物理尺寸'
    && s.ratioDom === ratioInPx,
    `unit=${s.unit} 文本=${s.widthText}×${s.heightText} ｜ 表行="${s.rowName}: ${s.rowScreen}" ｜ 比值DOM px态="${ratioInPx}" / m态="${s.ratioDom}"`);

  // ---- PX-09 提示语切换（m 模式应为原文；再回 px 应为语义说明）----
  rec('PX-09', 'm 模式下单位提示为原文', s.hint !== null && s.hint.indexOf('单位切换只改变显示值') === 0,
    `m 提示="${(s.hint || '').slice(0, 28)}…"`);
  await clickUnit('px');
  s = await readState();
  rec('PX-09', 'px 模式提示语切换为 px 语义说明',
    s.hint !== null && s.hint.indexOf('PX 模式用于根据输入的像素宽高计算比例') === 0
    && s.hint.indexOf('不代表屏幕的实际物理尺寸') >= 0
    && s.hint.indexOf('不代表实际像素间距') >= 0,
    `px 提示="${(s.hint || '').slice(0, 40)}…"`);

  // ---- PX-08 px 模式复制参数（语义标签）----
  const full = await win.evaluate(() => window.LedApp.buildFullParameterText());
  rec('PX-08', 'px 模式复制参数：语义标签「输入尺寸：」+ px 单位',
    /输入尺寸：\d+ px × \d+ px/.test(full),
    (full.split('\n').filter((l) => l.indexOf('尺寸') >= 0)[0] || '(未找到)').trim().slice(0, 60));

  await app.close();

  const pass = results.filter((r) => r.ok).length;
  const out = {
    generatedAt: new Date().toISOString(),
    summary: { total: results.length, pass, fail: results.length - pass, verdict: pass === results.length ? 'PASS' : 'FAIL' },
    measurementNote: '比值/尺寸断言取自实际结果 DOM 与 LedApp.state（UI 输入链路），不直接调用核心函数',
    convention: '1 px = 1 mm（仅用于单位切换显示换算；比例计算只取决于宽高比，与折算率无关；不代表实际像素间距）',
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
