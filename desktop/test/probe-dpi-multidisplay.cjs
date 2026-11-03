/**
 * LED-ratio-Tool 桌面版 · 多显示器 DPI-09 四边核验探针（真实窗口 · 真实工作区）
 * ============================================================================
 * 🔴 用途：P7-DPI-09 的 DPI-09 判据要求「窗口四边落在 **workArea** 内」。
 *    `test/p7-dpi.mjs` 只核验**鼠标所在的那一块屏**；当机器上有多块屏、
 *    且各屏缩放 / 任务栏 / 位置不同时，主屏通过**不能**推出副屏也通过。
 *    本探针补上这一缺口（2026-11-03 双屏 125% 实测）。
 *
 * 🔴 取证纪律（与主验收一致）：
 *    ① 显示器数据**全部来自 Electron `screen` API 的真实回读**，不构造虚拟屏；
 *    ② 窗口位置**用产品算法**（`main/window-bounds.js` 的纯函数）算出，
 *       再用真实 `setPosition` / `setContentSize` 施加，最后**回读真实 bounds**；
 *    ③ 四边溢出用产品自带的 `checkFitsWorkArea`（DPI-09 的唯一几何判据）；
 *    ④ 坐标一律 **DIP**（Electron 原生口径），**不乘 scaleFactor**；
 *    ⑤ 每块屏的结论**独立判定**，任一块失败即整体 FAIL，不做平均、不做取舍。
 *
 * 🔴 实现注意：**全程复用同一个 BrowserWindow**。
 *    实测（probe-frame-delta.cjs）：非客户区增量与客户区尺寸无关
 *    （800×600 / 1024×680 / 1440×900 / 1600×1000 恒为 16×65 @100%），
 *    故中途 `destroy()` 再新建窗口既无必要、又会卡住 Electron 主进程。
 *
 * 用法：
 *   node test/probe-dpi-multidisplay.cjs
 *   产物：test/reports/probe-dpi-multidisplay.json
 */

'use strict';

const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'reports', 'probe-dpi-multidisplay.json');
const wb = require(path.join(REPO, 'main', 'window-bounds.js'));

/** 等一拍，让 setPosition / setContentSize 的异步生效落地 */
function settle(ms = 300) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  await app.whenReady();

  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const cursor = screen.getCursorScreenPoint();
  const cursorDisplay = screen.getDisplayNearestPoint(cursor) || primary;

  // ── 单窗口，全流程复用 ───────────────────────────────────────────────
  const win = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: wb.WINDOW_GEOMETRY.targetWidth,
    height: wb.WINDOW_GEOMETRY.targetHeight,
    autoHideMenuBar: false,
  });
  await settle();

  // ① 实测非客户区增量（DIP）—— 与产品 measureFrameDelta() 同口径
  const pb = win.getBounds();
  const pc = win.getContentBounds();
  const frameDelta = { width: pb.width - pc.width, height: pb.height - pc.height };

  const results = [];
  for (const d of displays) {
    const workArea = {
      x: d.workArea.x, y: d.workArea.y,
      width: d.workArea.width, height: d.workArea.height,
    };

    // ② 产品算法：预算 → 位置 → 夹紧
    const budget = wb.computeContentBudget({ workArea, frameDelta });
    const frameSize = {
      width: budget.contentWidth + frameDelta.width,
      height: budget.contentHeight + frameDelta.height,
    };
    const desired = wb.computeWindowPosition({ workArea, frameSize });
    const clamped = wb.clampWindowPosition({ workArea, frameSize, desired });

    // ③ 真实施加 + 回读
    win.setContentSize(budget.contentWidth, budget.contentHeight);
    await settle();
    win.setPosition(clamped.x, clamped.y);
    await settle();

    const bounds = win.getBounds();
    const contentBounds = win.getContentBounds();
    const fit = wb.checkFitsWorkArea(bounds, workArea);

    results.push({
      display: {
        id: d.id, label: d.label, scaleFactor: d.scaleFactor,
        isPrimary: d.id === primary.id,
        bounds: { ...d.bounds }, workArea,
      },
      cursorOnThisDisplay: d.id === cursorDisplay.id,
      budget: {
        contentWidth: budget.contentWidth,
        contentHeight: budget.contentHeight,
        maxContentWidth: budget.maxContentWidth,
        maxContentHeight: budget.maxContentHeight,
        atMinimum: budget.atMinimum,
        clampedToMinimum: budget.clampedToMinimum,
        fitsMinimum: budget.fitsMinimum,
        shortfall: budget.shortfall,
        requiredWorkArea: budget.requiredWorkArea,
      },
      plannedPosition: { desired, clamped },
      actual: {
        bounds, contentBounds,
        frameDelta: {
          width: bounds.width - contentBounds.width,
          height: bounds.height - contentBounds.height,
        },
      },
      // 🔴 DPI-09 的唯一几何判据：四边全过才算 fits
      fits: fit.fits,
      overflow: fit.overflow,
      edges: fit.edges,
      workAreaEdges: fit.workAreaEdges,
      verdict: fit.fits ? 'PASS' : 'FAIL',
    });
  }

  win.destroy();

  // ④ 汇总
  const pass = results.filter((r) => r.verdict === 'PASS').length;
  const fail = results.length - pass;
  const allOverflowZero = results.every(
    (r) => r.overflow.left === 0 && r.overflow.top === 0 && r.overflow.right === 0 && r.overflow.bottom === 0
  );

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: `${process.platform} ${process.arch}`,
      note: '坐标系 = DIP（Electron 原生口径），不乘 scaleFactor',
      method: '真实 BrowserWindow + 产品 window-bounds.js 算法 + 真实 getBounds() 回读',
    },
    env: {
      displayCount: displays.length,
      primaryDisplayId: primary.id,
      cursorPoint: cursor,
      cursorDisplayId: cursorDisplay.id,
      cursorDisplayLabel: cursorDisplay.label,
      cursorIsOnPrimary: cursorDisplay.id === primary.id,
      measuredFrameDelta: frameDelta,
      pickTargetDisplayRule: 'getDisplayNearestPoint(getCursorScreenPoint()) → 鼠标所在显示器优先',
    },
    summary: {
      total: results.length,
      pass,
      fail,
      allOverflowZero,
      verdict: fail === 0 && allOverflowZero ? 'PASS' : 'FAIL',
    },
    results,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  app.exit(fail === 0 && allOverflowZero ? 0 : 1);
})().catch((e) => {
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(OUT), 'probe-dpi-multidisplay-error.txt'),
      String((e && e.stack) || e)
    );
  } catch (_) { /* ignore */ }
  app.exit(3);
});
