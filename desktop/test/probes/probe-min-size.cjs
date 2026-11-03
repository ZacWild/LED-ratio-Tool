/**
 * LED-ratio-Tool 桌面版 · 最小尺寸口径探针（第三轮）
 * ============================================================================
 * 核实两件会直接影响方案 A 实现正确性的事：
 *   ① BrowserWindow 的 minWidth/minHeight 在 useContentSize:true 下，
 *      约束的是**外框**还是**客户区**？
 *      （现有 main.js 注释声称"与 width/height 同口径 = 最小客户区（E-3）"，
 *        但同文件对非客户区高度的估算（39）与实测（65）不符，说明该口径未经实测）
 *   ② setContentSize 到低于 minWidth 时 Electron 的实际行为（截断还是允许）
 *   ③ 用户手动把窗口拖到最小时，真实客户区是多少（DEC-07 的实际下限）
 *
 * 用法：node_modules/electron/dist/electron.exe test/probes/probe-min-size.cjs
 */
'use strict';

const { app, BrowserWindow, Menu, screen } = require('electron');

const deltaOf = (w) => {
  const b = w.getBounds();
  const c = w.getContentBounds();
  return { width: b.width - c.width, height: b.height - c.height };
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '文件', submenu: [{ role: 'quit' }] }]));
  const out = { generatedAt: new Date().toISOString(), experiments: [] };

  /* ① minWidth/minHeight 口径 */
  {
    const w = new BrowserWindow({
      width: 1440,
      height: 900,
      useContentSize: true,
      show: false,
      autoHideMenuBar: false,
      minWidth: 1024,
      minHeight: 680,
    });
    // 尝试把客户区压到远低于 minWidth/minHeight
    w.setContentSize(800, 500);
    const b = w.getBounds();
    const c = w.getContentBounds();
    out.experiments.push({
      id: '① minWidth/minHeight 口径',
      requestedContent: { width: 800, height: 500 },
      actualContent: { width: c.width, height: c.height },
      actualBounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      delta: deltaOf(w),
      minWidth: w.getMinimumSize ? w.getMinimumSize() : null,
      note:
        '若 actualContent ≈ {1024,680} → minWidth/minHeight 约束**客户区**；' +
        '若 actualContent ≈ {1008,615}（= 1024-16 / 680-65）→ 约束**外框**。',
    });
    w.destroy();
  }

  /* ② 无 minWidth 的对照 */
  {
    const w = new BrowserWindow({
      width: 1440,
      height: 900,
      useContentSize: true,
      show: false,
      autoHideMenuBar: false,
    });
    w.setContentSize(800, 500);
    const c = w.getContentBounds();
    out.experiments.push({
      id: '② 无 minWidth 对照',
      requestedContent: { width: 800, height: 500 },
      actualContent: { width: c.width, height: c.height },
      delta: deltaOf(w),
    });
    w.destroy();
  }

  /* ③ minWidth 设为外框口径时的结果 */
  {
    const w = new BrowserWindow({
      width: 1440,
      height: 900,
      useContentSize: true,
      show: false,
      autoHideMenuBar: false,
      minWidth: 1024,
      minHeight: 680,
    });
    w.setContentSize(1024, 680);
    const c = w.getContentBounds();
    const b = w.getBounds();
    out.experiments.push({
      id: '③ setContentSize(1024,680) —— 恰好等于声明的最小客户区',
      actualContent: { width: c.width, height: c.height },
      actualBounds: { width: b.width, height: b.height },
      delta: deltaOf(w),
    });
    w.destroy();
  }

  /* ④ 工作区能否容纳最小客户区（DEC-07 下限的物理含义） */
  {
    const displays = screen.getAllDisplays();
    const w = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false, autoHideMenuBar: false });
    const d = deltaOf(w);
    out.minimumWorkArea = displays.map((disp) => ({
      id: disp.id,
      label: disp.label,
      scaleFactor: disp.scaleFactor,
      workArea: { ...disp.workArea },
      requiredWorkArea: {
        width: 1024 + 32 + d.width,
        height: 680 + 32 + d.height,
      },
      canHoldMinimum: disp.workArea.width >= 1024 + 32 + d.width && disp.workArea.height >= 680 + 32 + d.height,
      note: 'requiredWorkArea = 最小客户区(1024×680) + EDGE_MARGIN(32) + 实测外框增量',
    }));
    w.destroy();
  }

  process.stdout.write('[PROBE-MINSIZE] ' + JSON.stringify(out) + '\n');
  app.quit();
});
