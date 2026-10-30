/**
 * LED-ratio-Tool 桌面版 · IPC 契约
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   SEC-04 —— 暴露面恰好 8 个方法，零通用透传
 *   SEC-06 —— 统一信封 {code, message, data}；不回传堆栈/绝对路径/环境变量
 *   SEC-07 —— 通道一律 app:v1:<域>.<动作>，两侧集合一致
 *   SEC-08 —— 不信任渲染进程，入参逐项校验
 *   SEC-10 —— 剪贴板只写不读
 *   DEC-11 —— connect-src 'none' 保持零网络
 *
 * 🔒 主进程**不含任何业务计算**。本文件不出现 gcd / bestRational /
 *    computeRatio / approx / denominator / toMm / parseDimension 等词
 *    （SEC-01 静态断言）。
 */
'use strict';

const { ipcMain, clipboard, BrowserWindow, shell } = require('electron');
const { readSettings, writeSettings } = require('./settings-store');

/** 统一信封 */
const ok = (data = null) => ({ code: 0, message: 'ok', data });
const bad = (code, message) => ({ code, message, data: null });

/** 通道清单 —— 恰好 8 个，与 preload 侧集合必须一致（SEC-07） */
const CHANNELS = Object.freeze({
  SETTINGS_GET: 'app:v1:settings.get',
  SETTINGS_SET: 'app:v1:settings.set',
  CLIPBOARD_WRITE: 'app:v1:clipboard.writeText',
  SPEC_OPEN: 'app:v1:spec.open',
  SPEC_EXPORT: 'app:v1:spec.export',
  APP_VERSION: 'app:v1:app.version',
  WINDOW_ACTION: 'app:v1:window.action',
  OPEN_EXTERNAL: 'app:v1:shell.openExternal',
});

/** V1.0 允许打开外部链接的主机白名单 —— 空集（功能不可用但安全，SEC-13） */
const EXTERNAL_HOST_ALLOWLIST = Object.freeze([]);

const WINDOW_ACTIONS = Object.freeze(['minimize', 'maximize', 'close', 'restore']);

/**
 * SEC-08 来源校验：只接受主窗口主 frame 的调用。
 * 纵深防御 —— 防未来新增第二窗口时跨窗口调用。
 */
function assertTrustedFrame(event, mainWindow) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow) throw new Error('untrusted frame');
  if (event.senderFrame !== win.webContents.mainFrame) throw new Error('untrusted frame');
}

/**
 * SEC-08 字段白名单取用，杜绝原型污染。
 */
function pickOnly(obj, whitelist) {
  const out = Object.create(null);
  for (const key of Object.keys(obj || {})) {
    if (whitelist.includes(key)) out[key] = obj[key];
  }
  return out;
}

/**
 * 注册全部 IPC handler。
 * @param {object} deps
 * @param {import('electron').BrowserWindow} deps.mainWindow
 * @param {string} deps.userDataDir
 * @param {string} deps.appVersion
 * @param {string} deps.coreVersion
 * @param {string} deps.htmlVersion
 */
function registerIpc({ mainWindow, userDataDir, appVersion, coreVersion, htmlVersion }) {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        assertTrustedFrame(event, mainWindow);
        return await fn(payload, event);
      } catch (err) {
        // 🔒 不回传堆栈 / 绝对路径 / 环境变量（SEC-06）
        const msg = err && err.message ? String(err.message) : 'unknown error';
        return bad(4001, msg.replace(/[A-Za-z]:\\[^\s'"]+/g, '<path>'));
      }
    });
  };

  /* 1. 读设置 */
  handle(CHANNELS.SETTINGS_GET, () => {
    const r = readSettings(userDataDir);
    return ok(r.settings);
  });

  /* 2. 写设置 */
  handle(CHANNELS.SETTINGS_SET, (payload) => {
    const picked = pickOnly(payload, ['tolerancePercent']);
    return writeSettings(userDataDir, picked);
  });

  /* 3. 写剪贴板（只写不读，SEC-10） */
  handle(CHANNELS.CLIPBOARD_WRITE, (payload) => {
    const text = payload && payload.text;
    if (typeof text !== 'string') return bad(4002, 'text 必须是字符串');
    if (text.length > 100000) return bad(4002, 'text 超出长度上限');
    try {
      clipboard.writeText(text);
      return ok({ ok: true });
    } catch (_) {
      return bad(5001, '剪贴板写入失败');
    }
  });

  /* 4. 打开规格文件 —— V1.0 恒 cancelled，不开系统对话框（TK-71 解释 A） */
  handle(CHANNELS.SPEC_OPEN, () => ok({ cancelled: true }));

  /* 5. 导出规格文件 —— 同上；但入参仍按白名单校验（SEC-08） */
  handle(CHANNELS.SPEC_EXPORT, (payload) => {
    const picked = pickOnly(payload, ['suggestedName', 'content']);
    if (
      picked.suggestedName !== undefined &&
      (typeof picked.suggestedName !== 'string' ||
        picked.suggestedName.length > 128 ||
        /[\\/]|\.\./.test(picked.suggestedName))
    ) {
      return bad(4002, 'suggestedName 非法');
    }
    if (
      picked.content !== undefined &&
      (typeof picked.content !== 'string' || picked.content.length > 100000)
    ) {
      return bad(4002, 'content 非法');
    }
    return ok({ cancelled: true });
  });

  /* 6. 版本信息 —— 三线版本（DEC-13）
   * 🔒 三条版本线**一次性**从本 IPC 返回，渲染层不得在多处手工维护。 */
  handle(CHANNELS.APP_VERSION, () =>
    ok({
      version: appVersion,
      coreVersion,
      htmlVersion,
      buildTime: new Date().toISOString(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    }),
  );

  /* 7. 窗口动作 */
  handle(CHANNELS.WINDOW_ACTION, (payload) => {
    const action = payload && payload.action;
    if (!WINDOW_ACTIONS.includes(action)) return bad(4002, 'action 不在白名单内');
    if (!mainWindow || mainWindow.isDestroyed()) return bad(4001, '窗口不可用');
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    else if (action === 'close') mainWindow.close();
    else if (action === 'restore') mainWindow.restore();
    return ok({ ok: true });
  });

  /* 8. 外部链接 —— 仅 https + 主机白名单（SEC-13） */
  handle(CHANNELS.OPEN_EXTERNAL, async (payload) => {
    const url = payload && payload.url;
    if (typeof url !== 'string') return bad(4002, 'url 必须是字符串');
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return bad(4002, 'url 无法解析');
    }
    if (parsed.protocol !== 'https:') return bad(4002, '只允许 https 协议');
    if (!EXTERNAL_HOST_ALLOWLIST.includes(parsed.hostname)) {
      return bad(4002, '目标主机不在允许清单内');
    }
    await shell.openExternal(parsed.toString());
    return ok({ ok: true });
  });
}

module.exports = { registerIpc, CHANNELS };
