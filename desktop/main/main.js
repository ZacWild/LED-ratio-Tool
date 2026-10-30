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
const MIN_CONTENT_W = 1024; // DEC-07（客户区口径，DEC-14）
const MIN_CONTENT_H = 680;
const TARGET_W = 1440; // DEC-09
const TARGET_H = 900;
const EDGE_MARGIN = 32;

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
   工作区检测（DEC-09）
   --------------------------------------------------------------------------
   V1.0 不记忆窗口位置（PS-03 → V1.1），没有 rect 可传给 getDisplayMatching。
   采用 getDisplayNearestPoint(cursor)：Windows 用户心智是「窗口开在鼠标所在屏」。
   ========================================================================== */
function planWindowBounds() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  const work = display.workArea;
  const sf = display.scaleFactor || 1;

  const width = Math.max(Math.min(TARGET_W, work.width - EDGE_MARGIN), MIN_CONTENT_W);
  const height = Math.max(Math.min(TARGET_H, work.height - EDGE_MARGIN), MIN_CONTENT_H);

  // 非客户区增量（实测 @100%：宽 16 / 高 39），随 scaleFactor 放大。
  // 这里的值只用于「记录台账」，不做布局计算。
  const frameW = width + Math.round(16 * sf);
  const frameH = height + Math.round(39 * sf);

  return {
    width,
    height,
    workArea: { x: work.x, y: work.y, width: work.width, height: work.height },
    scaleFactor: sf,
    frame: { width: frameW, height: frameH },
    // 高度档位（DEC-16）。阈值按 scaleFactor 换算，不写死 712。
    // 🔴 P4-A 只判定、不实现 ②/③ 档收纳行为（TK-72 未闭合）。
    heightTier: work.height >= frameH ? 1 : work.height >= height + Math.round(39 * sf) ? 2 : 3,
  };
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
   窗口创建
   ========================================================================== */
function createWindow() {
  const bounds = planWindowBounds();

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    useContentSize: true, // ✅ DEC-14：width/height = 客户区尺寸
    minWidth: MIN_CONTENT_W, // ✅ 与 width/height 同口径 = 最小客户区（E-3）
    minHeight: MIN_CONTENT_H,
    show: false, // 就绪后再显示，避免白屏闪烁
    title: 'LED 比例换算台',
    backgroundColor: '#141518', // 与 --bg-app 同色，消除加载期白闪
    autoHideMenuBar: false,
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

  // 台账：窗口口径实测（EV-A07 / 证据 ⑦）
  const logWindowLedger = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    const c = mainWindow.getContentBounds();
    const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    process.stdout.write(
      '[LED-WINDOW] ' +
        JSON.stringify({
          content: { width: c.width, height: c.height },
          frame: { width: b.width, height: b.height },
          delta: { width: b.width - c.width, height: b.height - c.height },
          workArea: disp.workArea,
          scaleFactor: disp.scaleFactor,
          heightTier: planWindowBounds().heightTier,
          dpr: mainWindow.webContents.getZoomFactor(),
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
