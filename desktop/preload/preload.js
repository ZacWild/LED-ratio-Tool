/**
 * LED-ratio-Tool 桌面版 · preload 桥
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   SEC-04 —— 暴露面恰好 8 个方法，零通用透传，对象冻结
 *   SEC-05 —— preload 只用 Web API
 *   SEC-38 —— 沙箱 preload 的 API 面约束
 *   E-4     —— Electron 45.1.0 实测：
 *              Buffer / setImmediate / clearImmediate = undefined
 *              require('events'|'timers'|'url'|'path'|'fs'|'os'|'child_process'|'buffer') = module not found
 *              require('electron'|'electron/renderer'|'electron/common') = OK
 *              URL / URLSearchParams / TextEncoder / TextDecoder / atob / btoa /
 *              setTimeout / clearTimeout / setInterval / queueMicrotask = 可用
 *
 * 🔒 本文件必须单文件（沙箱 preload 不支持 CommonJS 拆包）。
 * 🔒 本文件不得使用 Buffer / setImmediate / require('events'|'timers'|'url')。
 * 🔒 本文件不得引入任何 npm 依赖。
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 8 个方法，每个的第一个 invoke 参数都是字面量字符串（SEC-07）。
 * 通道名与 main/ipc.js 的 CHANNELS 必须完全一致。
 */
const api = {
  settingsGet: () => ipcRenderer.invoke('app:v1:settings.get'),
  settingsSet: (patch) => ipcRenderer.invoke('app:v1:settings.set', patch),
  clipboardWriteText: (text) => ipcRenderer.invoke('app:v1:clipboard.writeText', { text }),
  specOpen: () => ipcRenderer.invoke('app:v1:spec.open'),
  specExport: (payload) => ipcRenderer.invoke('app:v1:spec.export', payload),
  appVersion: () => ipcRenderer.invoke('app:v1:app.version'),
  windowAction: (action) => ipcRenderer.invoke('app:v1:window.action', { action }),
  openExternal: (url) => ipcRenderer.invoke('app:v1:shell.openExternal', { url }),
};

contextBridge.exposeInMainWorld('ledApi', Object.freeze(api));
