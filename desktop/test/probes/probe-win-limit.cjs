/**
 * LED-ratio-Tool 桌面版 · Windows 自动限位口径精确探针（第四轮）
 * ============================================================================
 * 待解之谜（由 GEO-08 交叉验证触发）：
 *   现象 A（探针③，无 min）：请求客户区 3000×2000 → 实际客户区 2544×1353
 *            = workArea(2560×1392) − (16, 39)  ← 宽度、高度**都**被截断
 *   现象 B（历史实测 p7-dpi-100，minWidth=1024/minHeight=680）：客户区 1024×681
 *            宽度 1024 **未**被截到 1024−16=1008；高度 688 被截到 720−39=681
 *   → 两个方向的限位规则**不对称**，必须实测确认，不能靠推算。
 *
 * 本探针用同一块真实显示器（workArea 2560×1392）做受控对照：
 *   E1 无 min，请求 3000×2000            → 复现现象 A
 *   E2 min=1024/680，请求 3000×2000      → 现象 B 的机制
 *   E3 min=1024/680，请求 1024×688       → 复现历史实测的 681？
 *   E4 无 min，请求 1024×688             → 无 min 时高度会被截到哪？
 *   E5 min=1024/680，请求 1440×900       → 正常尺寸是否受影响
 *   E6 min=1024/680 + autoHideMenuBar=false，逐步 setContentSize 逼近边界
 *
 * 用法：node_modules/electron/dist/electron.exe test/probes/probe-win-limit.cjs
 */
'use strict';

const { app, BrowserWindow, Menu, screen } = require('electron');

const snap = (w) => {
  const b = w.getBounds();
  const c = w.getContentBounds();
  return {
    bounds: { width: b.width, height: b.height },
    content: { width: c.width, height: c.height },
    delta: { width: b.width - c.width, height: b.height - c.height },
    minSize: w.getMinimumSize(),
  };
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '文件', submenu: [{ role: 'quit' }] }]));
  const disp = screen.getPrimaryDisplay();
  const out = {
    generatedAt: new Date().toISOString(),
    workArea: { ...disp.workArea },
    limits: {
      widthMinus16: disp.workArea.width - 16,
      heightMinus39: disp.workArea.height - 39,
      note: '现象 A 的截断口径 = workArea − (16, 39)；16/39 = 边框宽 / 标题栏+边框高（不含菜单栏 26）',
    },
    experiments: [],
  };

  const run = (label, opts, request) => {
    const w = new BrowserWindow({ show: false, autoHideMenuBar: false, useContentSize: true, ...opts });
    w.setContentSize(request.width, request.height);
    const s = snap(w);
    out.experiments.push({ label, request, ...s });
    w.destroy();
  };

  run('E1 无 min，请求 3000×2000', {}, { width: 3000, height: 2000 });
  run('E2 min=1024/680，请求 3000×2000', { minWidth: 1024, minHeight: 680 }, { width: 3000, height: 2000 });
  run('E3 min=1024/680，请求 1024×688', { minWidth: 1024, minHeight: 680 }, { width: 1024, height: 688 });
  run('E4 无 min，请求 1024×688', {}, { width: 1024, height: 688 });
  run('E5 min=1024/680，请求 1440×900', { minWidth: 1024, minHeight: 680 }, { width: 1440, height: 900 });
  run('E6 min=1024/680，请求 1440×1360（逼近工作区高度）', { minWidth: 1024, minHeight: 680 }, { width: 1440, height: 1360 });

  // E7：逐步逼近，找出客户区高度的**实际上限**
  {
    const w = new BrowserWindow({ show: false, autoHideMenuBar: false, useContentSize: true, minWidth: 1024, minHeight: 680 });
    const ladder = [];
    for (const h of [900, 1200, 1300, 1353, 1354, 1360, 1380, 1400, 2000]) {
      w.setContentSize(1440, h);
      ladder.push({ requested: h, actual: snap(w).content.height });
    }
    out.experiments.push({ label: 'E7 高度阶梯（min=1024/680）', ladder });
    w.destroy();
  }

  // E8：宽度阶梯
  {
    const w = new BrowserWindow({ show: false, autoHideMenuBar: false, useContentSize: true, minWidth: 1024, minHeight: 680 });
    const ladder = [];
    for (const wd of [1024, 2000, 2544, 2545, 2600, 3000]) {
      w.setContentSize(wd, 900);
      ladder.push({ requested: wd, actual: snap(w).content.width });
    }
    out.experiments.push({ label: 'E8 宽度阶梯（min=1024/680）', ladder });
    w.destroy();
  }

  // E9：min 声明值是否高于 Windows 限位时，min 是否优先（宽度方向）
  {
    const w = new BrowserWindow({ show: false, autoHideMenuBar: false, useContentSize: true, minWidth: 1024, minHeight: 680 });
    w.setContentSize(1024, 900);
    const a = snap(w);
    out.experiments.push({
      label: 'E9 min 是否优先于 Windows 限位（宽度 1024 vs 限位 2544，不构成对照）',
      snapshot: a,
      note: 'E2 已覆盖真正的对照（请求 3000 宽时 min=1024 是否压过限位 2544）',
    });
    w.destroy();
  }

  process.stdout.write('[PROBE-LIMIT] ' + JSON.stringify(out) + '\n');
  app.quit();
});
