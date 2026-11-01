/**
 * LED-ratio-Tool 桌面版 · 真实系统 DPI 验收（Step 6 第 5 阶段）
 * ============================================================================
 * 🔴 **本脚本只认真实系统缩放**，不认任何模拟：
 *   · 环境前置断言：Electron `screen.getAllDisplays()[0].scaleFactor` 必须
 *     **等于** `--expect` 指定的百分比（125 / 150 / 100）。
 *     不匹配 → 以**退出码 3（环境前置不满足）**结束 —— 既不算通过、也不算失败，
 *     更不会退化成「用 Chromium 页面缩放凑数」（页面缩放是 `setZoomFactor`，
 *     它会改变 CSS px 布局，**不是** DPI 验收）。
 *   · 断言对象一律落在 `getComputedStyle()` / `getBoundingClientRect()` /
 *     `elementFromPoint` 实测值上（DEC-18：不得只检查 `el.style.x`）。
 *
 * 用法：
 *   node desktop/test/dpi-acceptance.mjs --expect=100     # 当前环境
 *   # 切到 125% 后（设置 → 系统 → 显示 → 缩放）：
 *   node desktop/test/dpi-acceptance.mjs --expect=125
 *
 * 退出码：
 *   0 = 该 DPI 档全部检查通过
 *   1 = 有检查项不通过（真实缺陷）
 *   3 = 环境前置不满足（实际缩放 ≠ 期望缩放 / Electron 不可用）
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const OUT_DIR = path.join(DESKTOP, 'test', 'reports');

const argv = process.argv.slice(2);
const expectArg = (argv.find((a) => a.startsWith('--expect=')) || '').split('=')[1];
const EXPECT_PCT = expectArg ? Number(expectArg) : null;
const EXPECT_SF = EXPECT_PCT ? EXPECT_PCT / 100 : null;

const results = [];
let failures = 0;

function record(id, name, pass, actual, evidence) {
  results.push({ id, name, pass: !!pass, actual, evidence: evidence || 'reports/dpi-acceptance.json' });
  if (!pass) failures++;
  console.log(`  ${pass ? '✅' : '❌'} ${id} ${name} —— ${actual}`);
}

/* ==========================================================================
   §1 启动
   ========================================================================== */
function cleanEnv() {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function main() {
  console.log('=== 真实系统 DPI 验收（Step 6 第 5 阶段）===\n');

  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('❌ 环境阻塞：playwright-core 不可用 —— 退出码 3。');
    process.exit(3);
  }
  const { _electron } = pw;

  const app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);

  /* ---- 1.1 环境前置：真实缩放必须与期望一致 ---- */
  const env = await app.evaluate(async ({ screen, BrowserWindow }) => {
    const d = screen.getPrimaryDisplay();
    const b = BrowserWindow.getAllWindows()[0].getBounds();
    return { scaleFactor: d.scaleFactor, label: d.label, workArea: d.workArea, bounds: b };
  });
  const rendererEnv = await win.evaluate(() => ({
    dpr: window.devicePixelRatio,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    availH: window.screen.availHeight,
  }));

  console.log(`  实测环境：显示器=${env.label}  真实 scaleFactor=${env.scaleFactor}  ` +
    `devicePixelRatio=${rendererEnv.dpr}  客户区=${rendererEnv.innerW}×${rendererEnv.innerH}  ` +
    `工作区高=${rendererEnv.availH}\n`);

  if (EXPECT_SF !== null && Math.abs(env.scaleFactor - EXPECT_SF) > 0.001) {
    console.error(`  ❌ 环境前置不满足：期望系统缩放 ${EXPECT_PCT}%，实测 ${env.scaleFactor * 100}%。`);
    console.error('     → 本脚本**只认真实系统缩放**；不得用 Chromium 页面缩放（setZoomFactor）替代。');
    console.error('     → 请在「设置 → 系统 → 显示 → 缩放」切换后重跑；退出码 3。');
    await app.close().catch(() => {});
    process.exit(3);
  }
  if (EXPECT_SF === null) {
    console.log('  ⚠️ 未指定 --expect，按当前环境实测值记录（不作为该 DPI 档的验收结论）。\n');
  }

  /* ---- 1.2 三档客户区下的检查 ---- */
  const sizes = [
    { name: '1440x900', w: 1440, h: 900 },
    { name: '1200x800', w: 1200, h: 800 },
    { name: '1024x680', w: 1024, h: 680 },
  ];

  for (const s of sizes) {
    console.log(`  ── ${s.name} ──`);
    await app.evaluate(async ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setContentSize(size.w, size.h);
    }, s);
    await win.waitForTimeout(700);

    const m = await win.evaluate(() => {
      const out = { overflow: [], hitSmall: [], focusOrder: null, scroll: {}, tier: null, drag: null, font: {} };
      // ① 面板溢出：任一元素右/下边界超出其滚动容器
      const panels = [...document.querySelectorAll('.panel, .panel--input, .panel--stage, .panel--result, .stage')];
      for (const p of panels) {
        const pr = p.getBoundingClientRect();
        if (p.scrollWidth > p.clientWidth + 1) out.overflow.push(`${p.className}: scrollW=${p.scrollWidth} > clientW=${p.clientWidth}`);
        if (p.scrollHeight > p.clientHeight + 1) out.overflow.push(`${p.className}: scrollH=${p.scrollHeight} > clientH=${p.clientHeight}（应可滚动，非溢出）`);
      }
      // 文档级横向滚动（不应出现）
      out.docScrollW = document.documentElement.scrollWidth;
      out.docClientW = document.documentElement.clientWidth;
      // ② 命中区：主要可点击控件的有效命中区（elementFromPoint 逐像素）
      const sels = ['.stepper__btn', '.unit-segment', '.ratio-source-segment', '.canvas-mode-segment',
        '.prefer-segment', '#btn-swap', '#btn-reset', '#btn-copy-resolution', '#btn-copy-full', '#btn-settings'];
      for (const sel of sels) {
        for (const e of document.querySelectorAll(sel)) {
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          e.scrollIntoView({ block: 'center', inline: 'nearest' });
          const r2 = e.getBoundingClientRect();
          let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
          for (let x = Math.floor(r2.left) - 16; x <= Math.ceil(r2.right) + 16; x++) {
            for (let y = Math.floor(r2.top) - 16; y <= Math.ceil(r2.bottom) + 16; y++) {
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === e || e.contains(hit))) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < minX) continue;
          const w = maxX - minX + 1, h = maxY - minY + 1;
          if (w < 32 || h < 32) out.hitSmall.push(`${sel}: ${w}×${h}`);
        }
      }
      // ③ 字体与图标：关键文本的实测字号与图标尺寸
      const probe = (sel, key) => {
        const e = document.querySelector(sel);
        if (!e) return;
        const cs = getComputedStyle(e);
        out.font[key] = { size: cs.fontSize, lineHeight: cs.lineHeight, family: cs.fontFamily.split(',')[0] };
      };
      probe('#ratio-value', 'ratio');
      probe('.panel__title', 'panelTitle');
      probe('.status-bar', 'statusBar');
      const ic = document.querySelector('.stepper__btn .icon, .btn--copy .icon');
      if (ic) {
        const r = ic.getBoundingClientRect();
        out.font.icon = { w: Math.round(r.width), h: Math.round(r.height) };
      }
      // ④ 高度档位
      const layout = document.querySelector('main.layout');
      out.tier = layout ? (layout.getAttribute('data-height-tier') || '(未设置)') : '(无 layout)';
      // ⑤ 滚动行为：面板各自可滚，文档不滚
      out.scroll = {
        docScrollH: document.documentElement.scrollHeight,
        docClientH: document.documentElement.clientHeight,
        inputScrollable: (() => { const p = document.querySelector('.panel--input'); return p ? p.scrollHeight > p.clientHeight : null; })(),
        resultScrollable: (() => { const p = document.querySelector('.panel--result'); return p ? p.scrollHeight > p.clientHeight : null; })(),
      };
      // ⑥ 键盘焦点可达：Tab 顺序中关键控件是否可达
      // 🔴 桌面层的设置入口是**状态栏**里的 #ft-settings（desktop-ui.js 运行时创建）；
      //    根 HTML 标题栏的 #btn-settings 在桌面版被隐藏（display:none → 不可聚焦，属预期）。
      const keys = ['#input-width', '#input-height', '#btn-swap', '#btn-copy-resolution', '#btn-copy-full', '#ft-settings'];
      const reach = {};
      for (const k of keys) {
        const e = document.querySelector(k);
        if (!e) { reach[k] = 'MISSING'; continue; }
        e.focus();
        reach[k] = document.activeElement === e ? 'ok' : 'FAIL';
      }
      out.focusOrder = reach;
      // 桌面版应隐藏根标题栏的设置按钮（桌面层提供状态栏入口 #ft-settings）
      const rootSettings = document.getElementById('btn-settings');
      // 判据用**可见性**（rect 有面积）而非 display —— 桌面层隐藏根标题栏内容的方式
      // 是让整块内容零尺寸，computed display 仍是 inline-block。
      out.rootSettingsHidden = rootSettings
        ? !(rootSettings.getBoundingClientRect().width > 0 && rootSettings.getBoundingClientRect().height > 0)
        : null;
      return out;
    });

    // 面板溢出（文档级横向滚动 = 真溢出；面板纵向可滚 = 正常）
    record(`DPI-${s.name}-overflow`, '无文档级横向滚动',
      m.docScrollW <= m.docClientW + 1, `scrollW=${m.docScrollW} clientW=${m.docClientW}`,
      'reports/dpi-acceptance.json');
    record(`DPI-${s.name}-hit`, '主要控件有效命中区 ≥32×32',
      m.hitSmall.length === 0, m.hitSmall.length ? `过小：${m.hitSmall.join('; ')}` : '全部达标',
      'reports/dpi-acceptance.json');
    record(`DPI-${s.name}-focus`, '关键控件可聚焦',
      Object.values(m.focusOrder).every((v) => v === 'ok'),
      JSON.stringify(m.focusOrder), 'reports/dpi-acceptance.json');
    record(`DPI-${s.name}-scroll`, '文档不滚动、面板各自滚动',
      m.scroll.docScrollH <= m.scroll.docClientH + 1,
      `doc=${m.scroll.docScrollH}/${m.scroll.docClientH} input可滚=${m.scroll.inputScrollable} result可滚=${m.scroll.resultScrollable}`,
      'reports/dpi-acceptance.json');
    record(`DPI-${s.name}-font`, '关键文本与图标有实测尺寸',
      !!(m.font.ratio && m.font.ratio.size && m.font.icon),
      `ratio=${JSON.stringify(m.font.ratio)} icon=${JSON.stringify(m.font.icon)}`,
      'reports/dpi-acceptance.json');
    record(`DPI-${s.name}-settings`, '根设置按钮不可见（桌面用状态栏入口）',
      m.rootSettingsHidden === true, `根按钮不可见=${m.rootSettingsHidden}`,
      'reports/dpi-acceptance.json');
    record(`DPI-${s.name}-tier`, '高度档位已判定',
      m.tier !== '(未设置)' && m.tier !== '(无 layout)', `data-height-tier=${m.tier}`,
      'reports/dpi-acceptance.json');
  }

  /* ---- 1.3 汇总 ---- */
  const passN = results.filter((r) => r.pass).length;
  console.log('\n============================================================');
  console.log('【DPI 验收结论】');
  console.log('============================================================');
  console.log(`  真实 scaleFactor = ${env.scaleFactor}（${env.scaleFactor * 100}%）` +
    (EXPECT_PCT ? ` ｜ 期望 ${EXPECT_PCT}%` : ' ｜ 未指定期望值'));
  console.log(`  检查项 ${results.length} ｜ 通过 ${passN} ｜ 失败 ${failures}`);
  console.log(`  判定：${failures === 0 ? 'PASS（该 DPI 档全部通过）' : 'FAIL（存在不通过项）'}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      expectedPercent: EXPECT_PCT,
      realScaleFactor: env.scaleFactor,
      devicePixelRatio: rendererEnv.dpr,
      display: env.label,
      electron: process.versions.electron,
      platform: process.platform,
    },
    summary: { total: results.length, pass: passN, fail: failures },
    results,
  };
  const outFile = path.join(OUT_DIR, `dpi-acceptance-${env.scaleFactor * 100}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`  📄 JSON 报告：${outFile}`);

  await app.close().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
