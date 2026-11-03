/**
 * LED-ratio-Tool 桌面版 · 原生非客户区增量实测探针
 * ============================================================================
 * 目的（P7-DPI-09 Remediation 前置）：解释 main.js 台账里
 *   实测 delta（100%: 16×65 / 125%: 15×64）
 * 与代码里公式推算 delta（16*sf / 39*sf，即 100%: 16×39）
 * 之间那 **26 DIP 的高度差异**到底来自哪里。
 *
 * 排查清单（任务书 §二）：
 *   ① autoHideMenuBar: false —— 菜单栏是否常驻并计入非客户区
 *   ② 原生菜单栏是否包含在测量的非客户区内（用 setMenuBarVisibility 对比隔离）
 *   ③ getBounds() 与 getContentBounds() 的口径差异
 *   ④ Windows 标题栏 / 边框 / 系统 DPI 对几何的影响
 *   ⑤ 台账里的 frame 是真实窗口还是公式推算（台账 delta 来自实测，frame 字段是推算）
 *
 * 🔴 坐标体系纪律：Electron 的 screen/bounds/workArea **一律是 DIP（逻辑像素）**，
 *    本探针不把任何返回值再乘 scaleFactor；只在「物理像素」一栏单独标注推算值。
 *
 * 用法：node_modules/electron/dist/electron.exe test/probes/probe-frame-delta.cjs
 * 输出：stdout 一行 [PROBE-FRAME] {json}
 */
'use strict';

const { app, BrowserWindow, Menu, screen } = require('electron');

/** 窗口几何快照 —— 全部为 Electron 原生返回值（DIP），不做任何缩放换算 */
function snap(win, label) {
  const b = win.getBounds();
  const c = win.getContentBounds();
  const s = win.getSize();
  const cs = win.getContentSize();
  return {
    label,
    getBounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    getContentBounds: { x: c.x, y: c.y, width: c.width, height: c.height },
    delta: { width: b.width - c.width, height: b.height - c.height },
    getSize: { width: s[0], height: s[1] },
    getContentSize: { width: cs[0], height: cs[1] },
    menuBarVisible: win.isMenuBarVisible(),
    // 仅供对照：Windows 边框/标题栏/菜单栏在物理像素下的占用（不参与任何计算）
    physicalPx: {
      scaleFactor: screen.getPrimaryDisplay().scaleFactor,
      note: '仅推算参考，实际判定一律用 DIP 口径的 delta',
    },
  };
}

app.whenReady().then(async () => {
  const out = {
    generatedAt: new Date().toISOString(),
    electron: process.versions.electron,
    os: `${process.platform} ${process.arch}`,
    displays: {},
    snapshots: [],
  };

  /* ---------- ① 显示器全景（含坐标体系判定素材） ---------- */
  const cursor = screen.getCursorScreenPoint();
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const nearest = screen.getDisplayNearestPoint(cursor);
  const matching = screen.getDisplayMatching({ x: 0, y: 0, width: 1, height: 1 });

  const pack = (d) => ({
    id: d.id,
    label: d.label,
    internal: d.internal,
    rotation: d.rotation,
    scaleFactor: d.scaleFactor,
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    size: { ...d.size },
    workAreaSize: { ...d.workAreaSize },
  });

  out.displays = {
    cursor,
    all: all.map(pack),
    primary: pack(primary),
    nearestToCursor: pack(nearest),
    matchingOrigin: pack(matching),
    // 坐标体系判定：Electron 的 bounds 与 size 同为 DIP；物理像素由 size*scaleFactor 推算
    primaryPhysicalPx: {
      width: primary.size.width * primary.scaleFactor,
      height: primary.size.height * primary.scaleFactor,
      note: '推算值，仅用于确认 Electron 返回的是 DIP 而非物理像素',
    },
    // 工作区被任务栏削减的量（DIP）
    taskbarInset: {
      width: primary.bounds.width - primary.workArea.width,
      height: primary.bounds.height - primary.workArea.height,
    },
  };

  /* ---------- ② 菜单栏贡献隔离 ---------- */
  // 场景 A：先创建窗口（此时还没有应用菜单）→ 测一次
  const w1 = new BrowserWindow({
    width: 1024,
    height: 680,
    useContentSize: true,
    show: false,
    autoHideMenuBar: false,
    title: 'probe A',
  });
  out.snapshots.push(snap(w1, 'A. useContentSize=true, autoHideMenuBar=false, 尚未设置应用菜单'));

  // 场景 B：设置应用菜单（复刻 main.js 的真实顺序：菜单在 createWindow 之后设置）→ 再测
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: '文件', submenu: [{ label: '退出', role: 'quit' }] },
      { label: '编辑', submenu: [{ label: '复制', role: 'copy' }] },
      { label: '帮助', submenu: [{ label: '关于', role: 'about' }] },
    ]),
  );
  out.snapshots.push(snap(w1, 'B. 设置应用菜单之后（复刻 main.js 真实顺序）'));

  // 场景 C：隐藏菜单栏 → 隔离出菜单栏贡献的高度
  w1.setMenuBarVisibility(false);
  out.snapshots.push(snap(w1, 'C. setMenuBarVisibility(false) —— 菜单栏隐藏'));

  // 场景 D：恢复菜单栏可见
  w1.setMenuBarVisibility(true);
  out.snapshots.push(snap(w1, 'D. setMenuBarVisibility(true) —— 菜单栏恢复'));

  // 场景 E：不同客户区尺寸下 delta 是否恒定（标题栏/边框不随客户区变化）
  for (const [w, h] of [
    [800, 600],
    [1024, 680],
    [1440, 900],
    [1600, 1000],
  ]) {
    w1.setContentSize(w, h);
    out.snapshots.push(snap(w1, `E. setContentSize(${w}×${h}) —— delta 是否恒定`));
  }

  // 场景 F：autoHideMenuBar: true 的新窗口（另一种菜单栏配置）
  const w2 = new BrowserWindow({
    width: 1024,
    height: 680,
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    title: 'probe F',
  });
  out.snapshots.push(snap(w2, 'F. autoHideMenuBar=true 的独立窗口'));

  // 场景 G：useContentSize: false（width/height 解释为外框）
  const w3 = new BrowserWindow({
    width: 1040,
    height: 746,
    useContentSize: false,
    show: false,
    autoHideMenuBar: false,
    title: 'probe G',
  });
  out.snapshots.push(snap(w3, 'G. useContentSize=false（1040×746 期望=外框）'));

  // 场景 H：frame:false（无原生边框，用于对照差值构成）
  const w4 = new BrowserWindow({
    width: 1024,
    height: 680,
    useContentSize: true,
    show: false,
    autoHideMenuBar: false,
    frame: false,
    title: 'probe H',
  });
  out.snapshots.push(snap(w4, 'H. frame=false（对照：差值构成）'));

  /* ---------- ③ 汇总：菜单栏贡献 = B.delta.height - C.delta.height ---------- */
  const byLabel = Object.fromEntries(out.snapshots.map((s) => [s.label.split('.')[0].trim(), s]));
  const menuBarContribution =
    byLabel.B && byLabel.C ? byLabel.B.delta.height - byLabel.C.delta.height : null;

  out.conclusions = {
    menuBarHeightContribution: menuBarContribution,
    note:
      'menuBarHeightContribution = B(B.设置菜单后 delta.height) − C(菜单栏隐藏 delta.height)；' +
      '若 ≈ 26 则说明 main.js 公式里的 39 **漏计了原生菜单栏**（39 + 菜单栏 ≈ 65）。',
    legacyFormulaEstimate: { width: 16, height: 39, source: 'main.js planWindowBounds():16*sf / 39*sf（公式推算）' },
    legacyFormulaDelta: { width: 16, height: 39 },
    measuredDelta: { width: byLabel.A && byLabel.A.delta.width, height: byLabel.B && byLabel.B.delta.height },
  };

  process.stdout.write('[PROBE-FRAME] ' + JSON.stringify(out) + '\n');
  app.quit();
});
