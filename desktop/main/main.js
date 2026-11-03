/**
 * LED-ratio-Tool 桌面版 · 主进程
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-09 —— 启动窗口目标 1440×900，须适应目标屏幕可用工作区
 *   DEC-11 —— app:// 协议；不启用 bypassCSP
 *   DEC-12 —— appId 永久锁定 com.ledratiotool.desktop
 *   DEC-13 —— 桌面应用版本 1.1.0
 *   DEC-14 —— useContentSize: true，以客户区尺寸验收
 *   DEC-19 —— userData / sessionData 分离
 *   SEC-01~SEC-15 —— 进程模型、渲染配置、IPC、权限、内容加载
 *   E-8      —— protocol.handle 必须在 app.whenReady() 之后
 *
 * ⚠️ 本文件不含任何业务计算（SEC-01 静态断言）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, protocol, net, screen, shell } = require('electron');

const { applyStoragePaths, APP_ID } = require('./paths');
const { buildCSP } = require('./csp');
const { registerIpc } = require('./ipc');
const { buildMenu } = require('./menu');
const {
  WINDOW_GEOMETRY,
  computeContentBudget,
  clampWindowPosition,
  checkFitsWorkArea,
  computeMinTrackSize,
  calibrateMinTrack,
} = require('./window-bounds');

/* ==========================================================================
   启动顺序（硬约束）
   --------------------------------------------------------------------------
   ① enableSandbox          ← ready 之前（SEC-03）
   ② setPath('userData')    ← ready 之前（DEC-19 / SEC-39）
   ③ setPath('sessionData') ← ready 之前（DEC-19 / SEC-39）
   ④ requestSingleInstanceLock ← ready 之前（SEC-02）
   ⑤ setAppUserModelId     （SEC-24）
   ⑥ registerSchemesAsPrivileged ← 模块顶层（E-8）
   ⑦ whenReady → protocol.handle ← ready 之后（E-8）
   ========================================================================== */

app.enableSandbox(); // ①

const storage = applyStoragePaths(app.getPath('appData')); // ② ③

const gotLock = app.requestSingleInstanceLock(); // ④
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(APP_ID); // ⑤

/* ⑥ —— 模块顶层注册特权协议（E-8：register 顶层 / handle 在 ready 后） */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true, // ✅ 开：按 URL 标准解析，协议层即归一化 ..
      secure: true, // ✅ 开：成为安全上下文，localStorage/sessionStorage 可用
      // ❌ 以下一律不设置（默认 false）：
      // supportFetchAPI —— DEC-11「按需」，实测判定为不需要（E-6/E-7）
      // bypassCSP       —— DEC-11 明令禁止
      // corsEnabled / stream / allowServiceWorkers / codeCache —— DEC-11 不用
    },
  },
]);

/* ---- 常量 ---- */
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
// 🔴 窗口几何常量的**单一真源**在 main/window-bounds.js（纯函数，可单测）。
//    这里只做别名绑定，便于本文件内引用并保留 DEC 标注。
const MIN_CONTENT_W = WINDOW_GEOMETRY.minContentWidth; // DEC-07（客户区口径，DEC-14）
const MIN_CONTENT_H = WINDOW_GEOMETRY.minContentHeight;
const TARGET_W = WINDOW_GEOMETRY.targetWidth; // DEC-09
const TARGET_H = WINDOW_GEOMETRY.targetHeight;
const EDGE_MARGIN = WINDOW_GEOMETRY.edgeMargin;

/** MIME 白名单 —— 未知扩展名直接 403（SEC-33） */
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
});

let mainWindow = null;
let menuStateTimer = null;

/**
 * 🔒 三线版本（DEC-13）—— 全工程**唯一**的版本真源。
 *   桌面 1.1.0    ← app.getVersion()（读 desktop/package.json）
 *   内核 core@1.0.1 ← core.lock.json 的 coreVersion
 *   HTML 1.0.1    ← 仓库根 package.json 的 version（HTML 版永久保留，DEC-03）
 * 渲染层只允许通过 IPC `app:v1:app.version` 读取，不得在多处手工维护。
 */
const HTML_VERSION = '1.0.1';

/* ==========================================================================
   工作区检测（DEC-09）· 方案 A
   --------------------------------------------------------------------------
   V1.0 不记忆窗口位置（PS-03 → V1.1），没有 rect 可传给 getDisplayMatching。
   采用 getDisplayNearestPoint(cursor)：Windows 用户心智是「窗口开在鼠标所在屏」。

   🔴 方案 A（P7-DPI-09 Remediation）—— 与旧实现的根本差别：
      旧：contentH = max(min(TARGET_H, work.height − EDGE_MARGIN), MIN_CONTENT_H)
          只扣了间距，**没扣原生非客户区**；而 Windows 自身的限位口径
          「客户区 + 标题栏/边框」**不含原生菜单栏**（本项目 autoHideMenuBar:false，
          菜单栏常驻，实测占 26 DIP @100%）→ 外框底部恒定超出工作区 26 DIP。
      新：运行时**实测** frameDelta = getBounds() − getContentBounds()，
          预算 = 工作区 − EDGE_MARGIN − 实测 frameDelta，再由纯函数收口。
   ========================================================================== */

/**
 * 选屏 —— 保持「鼠标所在显示器优先」（DEC-09 / PS-03）。
 * 多显示器、负坐标、混合缩放一律走 Electron 原生 workArea，不自行推算。
 */
function pickTargetDisplay() {
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
}

/**
 * 实测原生非客户区增量（DIP）。
 *
 * 🔴 坐标体系纪律：Electron 的 getBounds()/getContentBounds()/workArea
 *    **一律是 DIP（逻辑像素）**，返回值**不得再乘 scaleFactor**。
 *    物理像素 = DIP × scaleFactor，仅供台账展示，不参与任何计算。
 *
 * 实测依据（test/probe-frame-delta.cjs）：
 *    autoHideMenuBar:false  → delta 16×65（39 标题栏/边框 + 26 原生菜单栏）
 *    autoHideMenuBar:true   → delta 16×39（无菜单栏）
 *    frame:false            → delta 0×0
 *    且 delta 与客户区尺寸**无关**（800×600 / 1024×680 / 1440×900 / 1600×1000 恒为 16×65）
 */
function measureFrameDelta(win) {
  const b = win.getBounds();
  const c = win.getContentBounds();
  return { width: b.width - c.width, height: b.height - c.height };
}

/**
 * 窗口预算（方案 A 核心）—— 纯计算委托给 main/window-bounds.js。
 *
 * @param {{width:number,height:number}} frameDelta 实测非客户区增量
 * @param {object} display  目标显示器（Electron 原生）
 * @param {{x:number,y:number,width:number,height:number}} work 工作区（DIP）
 */
function planWindowBounds(frameDelta, display, work) {
  const budget = computeContentBudget({ workArea: work, frameDelta });
  const frameW = budget.contentWidth + frameDelta.width;
  const frameH = budget.contentHeight + frameDelta.height;

  return {
    width: budget.contentWidth,
    height: budget.contentHeight,
    workArea: { x: work.x, y: work.y, width: work.width, height: work.height },
    scaleFactor: display.scaleFactor || 1,
    display: {
      id: display.id,
      label: display.label,
      bounds: { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height },
      workArea: { x: work.x, y: work.y, width: work.width, height: work.height },
      scaleFactor: display.scaleFactor || 1,
    },
    /** 实测非客户区增量（不再使用 39*sf 的错误估算） */
    frameDelta: { width: frameDelta.width, height: frameDelta.height },
    frame: { width: frameW, height: frameH },
    budget,
    // 高度档位（DEC-16）。改用实测 frameDelta，与渲染层 decideHeightTier 同源口径。
    heightTier: work.height >= frameH ? 1 : work.height >= budget.contentHeight + frameDelta.height ? 2 : 3,
  };
}

/**
 * 校正「用户可拖拽的最小客户区」—— 让它真正等于 DEC-07 的 1024×680。
 *
 * 🔴 实测事实（test/probe-min-size.cjs / test/probe-min-visible.cjs /
 *              test/probe-min-track-calibrate.cjs / test/probe-min-track-search2.cjs）：
 *   · 构造参数 `minWidth/minHeight` 是**客户区口径**，Chromium 会自动加边框
 *     （+16 / +39）换算成外框口径的 min track，而客户区又要减掉含菜单栏的
 *     65 → 声明 680 实际只保证客户区 ≥ **654**（README §6 记录的既存限制）。
 *   · `setMinimumSize(w,h)` 是**外框口径且不自动加边框** —— 与构造参数语义不同，
 *     两者不可互换。
 *   · 🔴 **「min track 口径」与「frameDelta 口径」不是同一套换算**：
 *     实测 frameDelta = 15×64 @125%，而「min track → 客户区下限」= **12×63**。
 *     差额来自 Windows 11 的**不可见缩放边框**（计入 min track，不计入 getBounds）。
 *     ⇒ 按 `客户区 + frameDelta` 下发 min track 会**顶高下限**：
 *         setMinimumSize(1040, 745) → 客户区下限 **1028×682**
 *         → 宽度 1024 档（≤1024 的堆叠布局）**永远不可达**。
 *
 *   因此本函数**不做换算推算**，改为**实测标定 + 迭代收敛**：
 *     ① 设初值（客户区 + frameDelta，外框口径）
 *     ② 压到最小，**实测**真实客户区下限
 *     ③ 若下限 > DEC-07（被顶高）→ 按超出量**下调** min track，重测（≤4 轮）
 *     ④ 收敛判据：下限**恰好等于** DEC-07；若平台量化使其不可精确命中，
 *        则取「≥ DEC-07 的最小可达值」并**如实记录**实际下限。
 *
 *   🔴 绝不允许为了「看起来通过」而让下限跌破 DEC-07。
 */
function calibrateMinimumContentSize(win, frameDelta) {
  const trace = [];
  const MAX_ROUNDS = 4;

  let minTrack = computeMinTrackSize({ frameDelta });
  let actual = { width: 0, height: 0 };
  let converged = false;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // 🔒 setMinimumSize 在某些边界值下会抛 "conversion failure"（Chromium 内部
    //    把 DIP→像素转换失败抛出）→ 必须捕获，否则整个窗口创建流程崩掉。
    //    回退策略：保留上一轮可用的 min track，停止标定并如实记录。
    try {
      win.setMinimumSize(minTrack.minWidth, minTrack.minHeight);
    } catch (e) {
      trace.push({ round, step: 'setMinimumSize 抛错（参数被平台拒绝）', minTrack: { ...minTrack }, error: String(e && e.message) });
      if (round === 1) {
        // 首轮就失败 → 用初始值再试一次，仍失败则放弃标定（保留框架默认值）
        const fallback = computeMinTrackSize({ frameDelta });
        try {
          win.setMinimumSize(fallback.minWidth, fallback.minHeight);
          minTrack = { minWidth: fallback.minWidth, minHeight: fallback.minHeight };
          trace.push({ round, step: '回退到 frameDelta 口径 min track', minTrack: { ...minTrack } });
        } catch (e2) {
          trace.push({ round, step: '回退同样失败，放弃 min track 标定', error: String(e2 && e2.message) });
        }
      }
      break;
    }
    // 🔒 **实测陷阱**：`setContentSize(1, 1)` 在 min track 已生效后会被 Chromium
    //    拒绝（抛 "Error processing argument at index 1, conversion failure"）——
    //    1 DIP 在 125% 下无法转换成合法物理像素。
    //    ⇒ 改用 `setSize(1, 1)`（外框口径），并用 try/catch 兜住所有异常。
    let floorErr = null;
    try {
      win.setSize(1, 1);
    } catch (e) {
      floorErr = String(e && e.message);
    }
    const c = win.getContentBounds();
    actual = { width: c.width, height: c.height };
    trace.push({
      round,
      step: 'setMinimumSize(外框口径)+实测下限',
      minTrack: { ...minTrack },
      actualMinContent: { ...actual },
      ...(floorErr ? { floorError: floorErr } : {}),
    });

    // 下限已**恰好**等于 DEC-07 → 收敛
    if (actual.width === MIN_CONTENT_W && actual.height === MIN_CONTENT_H) {
      converged = true;
      break;
    }
    // 下限已 ≤ DEC-07 → 满足约束（平台量化导致无法更小），不再下调
    if (actual.width <= MIN_CONTENT_W && actual.height <= MIN_CONTENT_H) {
      converged = true;
      break;
    }
    // 🔴 **分轴判定**：宽度与高度可能因平台量化而不同步。
    //   · 宽度已达标（=1024）但高度仍 >680（如 1024×682）→ 继续下调只会
    //     让高度**跌破** DEC-07（实测 1037×740 → 下限 1024×678 < 680），
    //     因此**必须停止下调**，保留已实测的合格下限。
    //   · 平台量化（125% 下 680 不可精确命中，实测恒为 681/682）不是产品缺陷。
    const widthOk = actual.width <= MIN_CONTENT_W;
    const heightOk = actual.height <= MIN_CONTENT_H;
    if (widthOk || heightOk) {
      converged = true;
      trace.push({
        round,
        step: '分轴收敛：保留已达标轴（平台量化使另一轴无法精确命中 DEC-07）',
        minTrack: { ...minTrack },
        actualMinContent: { ...actual },
        note:
          '宽度与高度受 Windows 不可见缩放边框与 DIP→物理像素取整影响，' +
          '无法同时精确命中 1024×680；保留实测下限（≥ DEC-07）即为最优解。',
      });
      break;
    }
    // 下限被顶高 → 按超出量下调 min track 后重测
    const next = calibrateMinTrack({ currentMinTrack: minTrack, actualMinContent: actual });
    if (!next.adjusted || next.minWidth === minTrack.minWidth && next.minHeight === minTrack.minHeight) {
      trace.push({ round, step: '标定停滞（下调量已为 0 或触及安全下界）', minTrack: { ...minTrack } });
      break;
    }
    trace.push({ round, step: '按实测超出量下调 min track', excess: next.excess, nextMinTrack: { minWidth: next.minWidth, minHeight: next.minHeight } });
    minTrack = { minWidth: next.minWidth, minHeight: next.minHeight };
  }

  const ok = actual.width >= MIN_CONTENT_W && actual.height >= MIN_CONTENT_H;
  return { ok, converged, trace, minTrack, actualMinContent: actual };
}

/**
 * 应用客户区尺寸并**收敛校验**：Windows 在创建/改尺寸时会自做限位，
 * 实测其口径为「客户区 + 标题栏/边框」（不含菜单栏），
 * 因此每轮都要**重新实测** frameDelta，变了就按新值重算预算再试。
 */
function applyContentSizeWithConvergence(win, work, initialDelta) {
  let frameDelta = { ...initialDelta };
  let budget = computeContentBudget({ workArea: work, frameDelta });
  const trace = [];
  for (let round = 1; round <= 3; round++) {
    win.setContentSize(budget.contentWidth, budget.contentHeight);
    const b = win.getBounds();
    const c = win.getContentBounds();
    const measured = { width: b.width - c.width, height: b.height - c.height };
    trace.push({
      round,
      requested: { width: budget.contentWidth, height: budget.contentHeight },
      actualContent: { width: c.width, height: c.height },
      measuredFrameDelta: measured,
    });
    if (measured.width === frameDelta.width && measured.height === frameDelta.height) {
      return { budget, frameDelta: measured, trace, converged: true };
    }
    frameDelta = measured;
    budget = computeContentBudget({ workArea: work, frameDelta });
  }
  return { budget, frameDelta, trace, converged: false };
}

/* ==========================================================================
   app:// 协议处理（SEC-33 / SEC-34 / SEC-35）
   ========================================================================== */
function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch (_) {
      return new Response('bad request', { status: 400 });
    }

    let rel = url.pathname;
    if (rel === '/' || rel === '') rel = '/index.html';

    // ① 解码 —— %2e%2e%2f 形式 URL 解析器不解码，必须自己解（E-9）
    let decoded;
    try {
      decoded = decodeURIComponent(rel);
    } catch (_) {
      return new Response('bad request', { status: 400 });
    }
    if (decoded.includes('\0')) {
      return new Response('bad request', { status: 400 });
    }

    // ② 归一化 + 根目录约束 —— 前缀比较必须带 path.sep
    const root = path.resolve(RENDERER_ROOT);
    const target = path.resolve(root, '.' + path.sep + decoded.replace(/^[\\/]+/, ''));
    const relPath = path.relative(root, target);
    if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
      return new Response('forbidden', { status: 403 });
    }

    // ③ 存在性与类型
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return new Response('not found', { status: 404 });
    }

    // ④ MIME 白名单 —— 未知扩展名 403，不回落 octet-stream
    const type = MIME[path.extname(target).toLowerCase()];
    if (!type) {
      return new Response('forbidden', { status: 403 });
    }

    // ⑤ 流式响应 + CSP 响应头（SEC-35：头与体同时构造）
    try {
      const base = await net.fetch('file://' + target.replace(/\\/g, '/'));
      const headers = new Headers(base.headers);
      headers.set('Content-Type', type);
      headers.set('Content-Security-Policy', buildCSP());
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(base.body, { status: 200, headers });
    } catch (_) {
      return new Response('internal error', { status: 500 });
    }
  });
}

/* ==========================================================================
   安全拦截（挂在 web-contents-created，覆盖未来所有窗口，SEC-14 / SEC-12）
   ========================================================================== */
function installSecurityInterceptors() {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith('app://')) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
    contents.session.setPermissionCheckHandler(() => false);
  });
}

/* ==========================================================================
   菜单状态同步（D-05 §4「置灰」规则）
   --------------------------------------------------------------------------
   🔒 硬规则：任何在当前状态下不可用的菜单项必须**置灰**，鼠标悬停给出原因，
      不得「点了没反应」。
   🔒 载荷是否可生成、当前布局档位、舞台是否折叠 —— 这些都是渲染层的知识，
      主进程不重复实现业务判断（SEC-01）。
   🔒 同步通道用 executeJavaScript（只读查询），**不新增 IPC 通道**（SEC-07）。
   ========================================================================== */
function syncMenuState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  mainWindow.webContents
    .executeJavaScript('window.__desktopMenuState ? window.__desktopMenuState() : null', true)
    .then((state) => {
      if (!state) return;
      const set = (id, props) => {
        const item = menu.getMenuItemById(id);
        if (!item) return;
        if (props.enabled !== undefined) item.enabled = props.enabled;
        if (props.label !== undefined) item.label = props.label;
      };
      // 载荷为 null 时置灰（D-05 §4）
      set('copy-resolution', { enabled: !!state.canCopyResolution });
      set('copy-full-parameters', { enabled: !!state.canCopyFull });
      // 舞台折叠/展开只在两栏档可用；单栏/三栏档置灰并注明原因
      set('toggle-stage', {
        enabled: !!state.canToggleStage,
        label: state.canToggleStage ? '展开/折叠舞台' : '展开/折叠舞台（当前布局档位无独立舞台面板）',
      });
      // 只读项：布局档位
      set('layout-tier', { label: '布局档位：' + (state.layoutLabel || '—') });
    })
    .catch(() => {
      /* 渲染层未就绪时忽略 */
    });
}

/* ==========================================================================
   窗口创建（方案 A · 两阶段隐藏窗口初始化）
   --------------------------------------------------------------------------
   阶段① 用目标尺寸创建**隐藏**窗口
   阶段② 实测原生非客户区增量（getBounds − getContentBounds）
   阶段③ 校准最小客户区（保证用户拖拽下限真 = DEC-07 的 1024×680）
   阶段④ 按实测增量重算预算 → 应用客户区尺寸 → 重新实测（收敛校验）
   阶段⑤ 位置归位：把**完整外框**放进工作区（工作区内居中）
   阶段⑥ 终检四边 → 全部通过才允许 show()
   🔴 整个过程在 show:false 期间完成，用户不会看到窗口先大后小地跳动。
   ========================================================================== */
function createWindow() {
  const display = pickTargetDisplay();
  const work = {
    x: display.workArea.x,
    y: display.workArea.y,
    width: display.workArea.width,
    height: display.workArea.height,
  };

  // ── 阶段①：创建隐藏窗口（初值取目标尺寸，随后按实测增量校正）──
  mainWindow = new BrowserWindow({
    width: TARGET_W,
    height: TARGET_H,
    useContentSize: true, // ✅ DEC-14：width/height = 客户区尺寸
    minWidth: MIN_CONTENT_W, // ✅ 与 width/height 同口径 = 最小客户区（E-3）
    minHeight: MIN_CONTENT_H,
    show: false, // 就绪后再显示，避免白屏闪烁
    title: 'LED Ratio Tool',
    // 🔒 D-08 品牌图标（任务栏 / 标题栏）：
    //    打包版**不设**该键 —— Windows 对未显式指定图标的窗口回落到 exe 内嵌图标，
    //    即 electron-builder 的 win.icon（resources/icon.ico），无需重复指定。
    //    开发版没有 exe，不指定就会显示 Electron 默认图标，故仅在未打包时挂载。
    //    resources/ 属 buildResources、不在 files 白名单内，不进 asar —— 因此
    //    打包运行时该路径本就不存在，用 app.isPackaged 分支而不是存在性判断。
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '..', 'resources', 'icon.ico') }),
    backgroundColor: '#141518', // 与 --bg-app 同色，消除加载期白闪
    autoHideMenuBar: false, // 🔒 原生菜单栏常驻（不得为绕过几何问题而隐藏）
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true, // ✅ SEC-03
      nodeIntegration: false, // ✅ SEC-03
      sandbox: true, // ✅ SEC-03
      webviewTag: false, // ✅ SEC-03
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      experimentalFeatures: false,
      allowRunningInsecureContent: false,
      spellcheck: false, // 现场输入尺寸数字，禁拼写检查下划线
      backgroundThrottling: false,
      // 🔒 D-02 §11 约束 3：交付版禁用开发者工具入口。
      //    同时使 Chromium 的 Ctrl+Shift+C「检查元素」绑定在交付版**不存在**，
      //    SK-06（复制完整参数）因此不会被 DevTools 抢占（D-02 §11 约束 2）。
      //    开发版（未打包）保留 DevTools 以便排障。
      devTools: !app.isPackaged,
    },
  });

  // ── 阶段②：实测原生非客户区增量（DIP；严禁再乘 scaleFactor）──
  const initialDelta = measureFrameDelta(mainWindow);

  // ── 阶段③：校准最小客户区（Chromium 的 min track 口径会漏掉菜单栏）──
  const minCalibration = calibrateMinimumContentSize(mainWindow, initialDelta);

  // ── 阶段④：按实测增量重算预算 → 应用客户区尺寸 → 重新实测（收敛校验）──
  const applied = applyContentSizeWithConvergence(mainWindow, work, initialDelta);

  // ── 阶段⑤：位置归位（外框四边必须落在工作区内）──
  const frameNow = mainWindow.getBounds();
  const pos = clampWindowPosition({
    workArea: work,
    frameSize: { width: frameNow.width, height: frameNow.height },
  });
  mainWindow.setPosition(pos.x, pos.y);

  // ── 阶段⑥：终检（以**最终真实几何**为准，不采信任何预算推算）──
  const finalBounds = mainWindow.getBounds();
  const finalContent = mainWindow.getContentBounds();
  const finalDelta = {
    width: finalBounds.width - finalContent.width,
    height: finalBounds.height - finalContent.height,
  };
  const fit = checkFitsWorkArea(finalBounds, work);
  const plan = planWindowBounds(finalDelta, display, work);

  /** 窗口计划快照（供台账与 DPI-09 取用，避免重复计算/重复选屏） */
  const windowPlan = {
    display: plan.display,
    bounds: { x: finalBounds.x, y: finalBounds.y, width: finalBounds.width, height: finalBounds.height },
    contentBounds: {
      x: finalContent.x,
      y: finalContent.y,
      width: finalContent.width,
      height: finalContent.height,
    },
    content: { width: finalContent.width, height: finalContent.height },
    frameDelta: finalDelta,
    workArea: work,
    scaleFactor: plan.scaleFactor,
    heightTier: plan.heightTier,
    fitsWorkArea: fit.fits,
    overflow: fit.overflow,
    edges: fit.edges,
    budget: {
      fitsMinimum: plan.budget.fitsMinimum,
      exceedsMinimum: plan.budget.exceedsMinimum,
      clampedToMinimum: plan.budget.clampedToMinimum,
      maxContentWidth: plan.budget.maxContentWidth,
      maxContentHeight: plan.budget.maxContentHeight,
      shortfall: plan.budget.shortfall,
      requiredWorkArea: plan.budget.requiredWorkArea,
      requiredWorkAreaForTarget: plan.budget.requiredWorkAreaForTarget,
    },
    minCalibration: {
      ok: minCalibration.ok,
      converged: minCalibration.converged,
      trace: minCalibration.trace,
    },
    convergence: { converged: applied.converged, trace: applied.trace },
  };

  // 台账：窗口口径实测（EV-A07 / 证据 ⑦）
  // 🔴 字段口径全部为 Electron 原生实测值（DIP），不做任何缩放换算。
  const logWindowLedger = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    const c = mainWindow.getContentBounds();
    const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wk = { x: disp.workArea.x, y: disp.workArea.y, width: disp.workArea.width, height: disp.workArea.height };
    const d = { width: b.width - c.width, height: b.height - c.height };
    const f = checkFitsWorkArea(b, wk);
    process.stdout.write(
      '[LED-WINDOW] ' +
        JSON.stringify({
          // 显示器（真实选中目标 + 光标最近显示器）
          display: {
            id: disp.id,
            label: disp.label,
            bounds: { x: disp.bounds.x, y: disp.bounds.y, width: disp.bounds.width, height: disp.bounds.height },
            workArea: wk,
            scaleFactor: disp.scaleFactor,
          },
          // 真实窗口几何：getBounds = 外框，getContentBounds = 客户区
          bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
          contentBounds: { x: c.x, y: c.y, width: c.width, height: c.height },
          content: { width: c.width, height: c.height },
          frame: { width: b.width, height: b.height },
          delta: d,
          workArea: wk,
          scaleFactor: disp.scaleFactor,
          heightTier: windowPlan.heightTier,
          // 🔴 这是**页面缩放因子**，不是 devicePixelRatio（dpr 由渲染层 window.devicePixelRatio 提供）
          zoomFactor: mainWindow.webContents.getZoomFactor(),
          // 四边核验
          fitsWorkArea: f.fits,
          overflow: f.overflow,
          edges: f.edges,
          // 初始计划与限制（方案 A）
          plan: windowPlan,
        }) +
        '\n',
    );
  };

  mainWindow.once('ready-to-show', () => {
    logWindowLedger();
    mainWindow.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    logWindowLedger();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 🔴 不在此处 loadURL —— 由调用方在 IPC 注册完成后再加载，
  //    否则渲染层可能在 handler 就绪前就调用 settings.get。
  return mainWindow;
}

/**
 * 加载主文档 —— 必须在 IPC 注册之后调用。
 */
function loadMainDocument(win) {
  win.loadURL('app://bundle/index.html');
}

/* ==========================================================================
   运行时版本台账（证据 ②）
   ========================================================================== */
function logRuntimeVersions() {
  process.stdout.write('[LED-VERSIONS] ' + JSON.stringify(process.versions) + '\n');
  process.stdout.write(
    '[LED-STORAGE] ' +
      JSON.stringify({
        userData: storage.userData,
        sessionData: storage.sessionData,
        appData: app.getPath('appData'),
      }) +
      '\n',
  );
  process.stdout.write('[LED-CSP] ' + buildCSP() + '\n');
}

/* ==========================================================================
   生命周期
   ========================================================================== */
app.whenReady().then(() => {
  registerAppProtocol(); // 🔴 必须在 ready 之后（E-8）
  installSecurityInterceptors();

  // 🔴 IPC 必须**先于窗口创建**注册 —— 否则窗口开始加载时渲染层调用
  //    settings.get 会得到 "No handler registered"（实测教训）。
  const win = createWindow();

  registerIpc({
    mainWindow: win,
    userDataDir: storage.userData,
    appVersion: app.getVersion(),
    coreVersion: 'core@1.0.1',
    htmlVersion: HTML_VERSION,
  });

  Menu.setApplicationMenu(buildMenu({ mainWindow: win }));

  // 🔴 加载放在 IPC 注册与菜单设置之后 —— 保证渲染层首次调用 IPC 时 handler 就绪
  loadMainDocument(win);

  // 菜单状态同步（D-05 §4 置灰规则）—— 只读查询，不新增 IPC 通道
  if (menuStateTimer) clearInterval(menuStateTimer);
  menuStateTimer = setInterval(syncMenuState, 900);
  win.webContents.on('did-finish-load', () => {
    syncMenuState();
  });

  logRuntimeVersions();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      Menu.setApplicationMenu(buildMenu({ mainWindow: w }));
      loadMainDocument(w);
    }
  });
});

// 退出前清理菜单状态轮询
app.on('will-quit', () => {
  if (menuStateTimer) clearInterval(menuStateTimer);
});

// 关闭唯一窗口后进程完全退出（SEC-26 反向核验的最强证据）
app.on('window-all-closed', () => {
  app.quit();
});

// 第二实例：聚焦已有窗口（SEC-02）
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
