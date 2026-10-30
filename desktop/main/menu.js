/**
 * LED-ratio-Tool 桌面版 · 原生菜单栏
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   D-02 §9.1 —— 菜单结构：文件 / 编辑 / 视图 / 帮助
 *   D-05      —— accelerator 一律引用已审核的快捷键，不新增
 *   TK-71     —— V1.0 菜单不呈现 spec.open / spec.export（格式未定义 → 会成空壳项）
 *   NL-01     —— 菜单中不得出现「检查更新」
 *   SEC-07    —— 菜单动作不新增 IPC 通道（保持恰好 8 个）
 *
 * 🔒 每个菜单项必须有真实动作。不可用项置灰并注明原因。
 */
'use strict';

const { app, Menu } = require('electron');

/**
 * @param {object} deps
 * @param {import('electron').BrowserWindow} deps.mainWindow
 */
function buildMenu({ mainWindow }) {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '复制分辨率',
          accelerator: 'Ctrl+Shift+C',
          click: () => send(mainWindow, 'menu:copy-resolution'),
        },
        {
          label: '复制完整参数',
          accelerator: 'Ctrl+C',
          click: () => send(mainWindow, 'menu:copy-full-parameters'),
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        {
          label: '设置…',
          accelerator: 'Ctrl+,',
          click: () => send(mainWindow, 'menu:open-settings'),
        },
        { type: 'separator' },
        {
          label: '快捷键帮助',
          accelerator: 'F1',
          click: () => send(mainWindow, 'menu:shortcut-help'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '恢复默认值',
          accelerator: 'Ctrl+R',
          click: () => send(mainWindow, 'menu:reset-defaults'),
        },
        { type: 'separator' },
        {
          label: '完全显示',
          accelerator: 'Ctrl+1',
          click: () => send(mainWindow, 'menu:mode-width'),
        },
        {
          label: '按高度',
          accelerator: 'Ctrl+2',
          click: () => send(mainWindow, 'menu:mode-height'),
        },
        {
          label: '常用规格',
          accelerator: 'Ctrl+3',
          click: () => send(mainWindow, 'menu:mode-preset'),
        },
        {
          label: '整数倍画布',
          accelerator: 'Ctrl+4',
          click: () => send(mainWindow, 'menu:mode-custom'),
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 LED 比例换算台',
          click: () => send(mainWindow, 'menu:about'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

/**
 * 把菜单动作转发给渲染层。
 * 🔒 用 executeJavaScript 调 desktop-ui.js 的内部函数 —— 不新增 IPC 通道（SEC-07）。
 */
function send(mainWindow, command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `window.__desktopMenu && window.__desktopMenu(${JSON.stringify(command)})`,
      true,
    )
    .catch(() => {
      /* 渲染层未就绪时忽略 */
    });
}

module.exports = { buildMenu };
