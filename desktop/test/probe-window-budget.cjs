/**
 * LED-ratio-Tool 桌面版 · 方案 A 实现细节探针（第二轮）
 * ============================================================================
 * 回答「两阶段隐藏窗口初始化 + 动态预算」能否可靠落地：
 *   ① setContentSize 后 delta 是否仍恒定（能否一次定尺）
 *   ② 两步校正（setContentSize → setPosition → 再测）是否收敛
 *   ③ Windows/Electron 是否会自动把窗口限制在工作区内（若会，可作兜底；
 *      若不会，必须自己算 —— 这决定「不得让窗口继续超出屏幕」怎么保证）
 *   ④ 能否用 maxWidth/maxHeight 表达硬上限
 *   ⑤ 多显示器（含第二块屏 x=2560、负坐标情形）的位置处理
 *   ⑥ 菜单栏/标题栏差值构成（w1 创建顺序 vs w3 的差异归因）
 *
 * 用法：node_modules/electron/dist/electron.exe test/probe-window-budget.cjs
 */
'use strict';

const { app, BrowserWindow, Menu, screen } = require('electron');

const deltaOf = (win) => {
  const b = win.getBounds();
  const c = win.getContentBounds();
  return { width: b.width - c.width, height: b.height - c.height };
};

/** 模拟方案 A 的两阶段校正，返回收敛过程 */
function twoPhase(win, work, targetW, targetH, edgeMargin) {
  const steps = [];
  // 阶段一：先用粗略估计创建，再实测
  let contentW = Math.min(targetW, Math.max(work.width - edgeMargin, 1));
  let contentH = Math.min(targetH, Math.max(work.height - edgeMargin, 1));
  win.setContentSize(contentW, contentH);
  let d = deltaOf(win);
  steps.push({ phase: '① 初值', contentW, contentH, delta: { ...d } });

  // 阶段二：用实测增量重算预算
  const maxContentW = work.width - edgeMargin - d.width;
  const maxContentH = work.height - edgeMargin - d.height;
  contentW = Math.min(targetW, maxContentW);
  contentH = Math.min(targetH, maxContentH);
  win.setContentSize(contentW, contentH);
  d = deltaOf(win);
  steps.push({ phase: '② 按实测增量校正', contentW, contentH, delta: { ...d } });

  // 阶段三：位置归位（把外框塞进工作区左上角）
  win.setPosition(work.x, work.y);
  const b = win.getBounds();
  steps.push({ phase: '③ 归位后', bounds: { x: b.x, y: b.y, width: b.width, height: b.height }, delta: deltaOf(win) });

  // 阶段四：再测一次，验证 delta 稳定 + 四边是否都在工作区内
  const b2 = win.getBounds();
  const d2 = deltaOf(win);
  const fits =
    b2.x >= work.x &&
    b2.y >= work.y &&
    b2.x + b2.width <= work.x + work.width &&
    b2.y + b2.height <= work.y + work.height;
  steps.push({
    phase: '④ 终检',
    bounds: { x: b2.x, y: b2.y, width: b2.width, height: b2.height },
    delta: d2,
    fourEdgesFit: fits,
    overflow: {
      left: Math.max(0, work.x - b2.x),
      top: Math.max(0, work.y - b2.y),
      right: Math.max(0, b2.x + b2.width - (work.x + work.width)),
      bottom: Math.max(0, b2.y + b2.height - (work.y + work.height)),
    },
  });
  return steps;
}

app.whenReady().then(async () => {
  const out = { generatedAt: new Date().toISOString(), experiments: {} };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: '文件', submenu: [{ label: '退出', role: 'quit' }] },
      { label: '编辑', submenu: [{ label: '复制', role: 'copy' }] },
      { label: '帮助', submenu: [{ label: '关于', role: 'about' }] },
    ]),
  );

  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const nearest = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  /* ---------- ⑥ 差值构成：多个 autoHideMenuBar=false 窗口的 delta 稳定性 ---------- */
  out.experiments.deltaStability = [];
  for (let i = 0; i < 3; i++) {
    const w = new BrowserWindow({
      width: 1024,
      height: 680,
      useContentSize: true,
      show: false,
      autoHideMenuBar: false,
    });
    out.experiments.deltaStability.push({
      index: i,
      delta: deltaOf(w),
      menuBarVisible: w.isMenuBarVisible(),
      bounds: w.getBounds(),
      contentBounds: w.getContentBounds(),
    });
    w.destroy();
  }
  // 对照：autoHideMenuBar=true
  {
    const w = new BrowserWindow({ width: 1024, height: 680, useContentSize: true, show: false, autoHideMenuBar: true });
    out.experiments.deltaStability.push({ index: 'autoHide=true', delta: deltaOf(w), menuBarVisible: w.isMenuBarVisible() });
    w.destroy();
  }
  // 对照：frame:false
  {
    const w = new BrowserWindow({ width: 1024, height: 680, useContentSize: true, show: false, autoHideMenuBar: false, frame: false });
    out.experiments.deltaStability.push({ index: 'frame=false', delta: deltaOf(w), menuBarVisible: w.isMenuBarVisible() });
    w.destroy();
  }

  /* ---------- ① ② ④ 两阶段校正（在真实 workArea 上） ---------- */
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: false,
    autoHideMenuBar: false,
  });
  out.experiments.twoPhase = {
    workArea: { ...nearest.workArea },
    scaleFactor: nearest.scaleFactor,
    steps: twoPhase(win, nearest.workArea, 1440, 900, 32),
  };
  out.experiments.twoPhase.initialDelta = deltaOf(win);

  /* ---------- ③ Windows 是否自动限位（请求超工作区尺寸） ---------- */
  {
    const big = new BrowserWindow({
      width: 3000,
      height: 2000,
      useContentSize: true,
      show: false,
      autoHideMenuBar: false,
    });
    out.experiments.oversizeRequest = {
      requestedContent: { width: 3000, height: 2000 },
      actualBounds: big.getBounds(),
      actualContentBounds: big.getContentBounds(),
      workArea: { ...nearest.workArea },
      note: '若 actualBounds 仍超出 workArea，说明 Windows/Electron **不会**自动限位，必须自行计算',
    };
    big.destroy();
  }

  /* ---------- ④ maxWidth/maxHeight 能否表达硬上限 ---------- */
  {
    const capped = new BrowserWindow({
      width: 3000,
      height: 2000,
      useContentSize: true,
      show: false,
      autoHideMenuBar: false,
      maxWidth: nearest.workArea.width,
      maxHeight: nearest.workArea.height,
    });
    out.experiments.maxSizeCap = {
      maxWidth: nearest.workArea.width,
      maxHeight: nearest.workArea.height,
      actualBounds: capped.getBounds(),
      actualContentBounds: capped.getContentBounds(),
      note: 'maxWidth/maxHeight 约束的是**外框**还是客户区，需实测确认',
    };
    capped.destroy();
  }

  /* ---------- ⑤ 多显示器位置（含第二块屏 x=2560） ---------- */
  out.experiments.multiDisplay = displays.map((d) => {
    const b = { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height };
    return {
      id: d.id,
      label: d.label,
      scaleFactor: d.scaleFactor,
      bounds: b,
      workArea: { ...d.workArea },
    };
  });
  // 在第二块屏上定位一次（setPosition 到非主屏）
  if (displays.length > 1) {
    const second = displays.find((d) => d.id !== primary.id);
    win.setPosition(second.workArea.x + 40, second.workArea.y + 40);
    const b = win.getBounds();
    out.experiments.secondDisplayPosition = {
      targetDisplay: { id: second.id, workArea: { ...second.workArea }, scaleFactor: second.scaleFactor },
      actualBounds: b,
      actualContentBounds: win.getContentBounds(),
      delta: deltaOf(win),
    };
  }

  /* ---------- 显示器全景（供 DPI-09 报告字段复用） ---------- */
  out.displays = {
    all: displays.map((d) => ({
      id: d.id,
      label: d.label,
      internal: d.internal,
      rotation: d.rotation,
      scaleFactor: d.scaleFactor,
      bounds: { ...d.bounds },
      workArea: { ...d.workArea },
      size: { ...d.size },
      workAreaSize: { ...d.workAreaSize },
    })),
    primary: { id: primary.id, bounds: { ...primary.bounds }, workArea: { ...primary.workArea }, scaleFactor: primary.scaleFactor },
    nearestToCursor: { id: nearest.id, bounds: { ...nearest.bounds }, workArea: { ...nearest.workArea }, scaleFactor: nearest.scaleFactor },
  };

  process.stdout.write('[PROBE-BUDGET] ' + JSON.stringify(out) + '\n');
  app.quit();
});
