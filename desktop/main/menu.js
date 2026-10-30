/**
 * LED-ratio-Tool 桌面版 · 原生菜单栏
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   D-02 §9.1 —— 菜单结构：文件 / 编辑 / 视图 / 帮助
 *   D-03 §6   —— 菜单项 ↔ 动作 ↔ 快捷键 ↔ EL 编号
 *   D-05      —— accelerator 一律引用已审核的 12 组快捷键，不新增
 *   TK-71     —— V1.0 菜单不呈现 spec.open / spec.export（格式未定义 → 会成空壳项）
 *   NL-01     —— 菜单中不得出现「检查更新」
 *   SEC-07    —— 菜单动作不新增 IPC 通道（保持恰好 8 个）
 *   D-02 §11  —— SK-04 必须覆盖 Electron 默认 reload 的 Ctrl+R
 *
 * 🔒 每个菜单项必须有真实动作。不可用项置灰并注明原因。
 * 🔒 命令字符串是**主进程 → 渲染层**的唯一契约；
 *    渲染层在 window.__desktopMenu(command) 中逐一对应，名字必须完全一致。
 */

const { app, Menu } = require('electron');

/** 命令契约（主进程与渲染层共享，改一处必须改两处） */
const COMMANDS = Object.freeze({
  COPY_RESOLUTION: 'menu:copy-resolution',
  COPY_FULL_PARAMETERS: 'menu:copy-full-parameters',
  OPEN_SETTINGS: 'menu:open-settings',
  SWAP: 'menu:swap',
  RESET_DEFAULTS: 'menu:reset-defaults',
  MODE_WIDTH: 'menu:mode-width',
  MODE_HEIGHT: 'menu:mode-height',
  MODE_PRESET: 'menu:mode-preset',
  MODE_CUSTOM: 'menu:mode-custom',
  CYCLE_RATIO_SOURCE: 'menu:cycle-ratio-source',
  TOGGLE_STAGE: 'menu:toggle-stage',
  RESET_COLUMNS: 'menu:reset-columns',
  SHORTCUT_HELP: 'menu:shortcut-help',
  ABOUT: 'menu:about',
});

/**
 * 🔒 accelerator 与 registerAccelerator 的取值理由（D-05 §2 的 FS-A/FS-B/FS-C 列）：
 *
 *   D-05 规定同一组快捷键在**四种焦点状态**下行为不同（多数在输入框聚焦时
 *   「不响应」）。若把 accelerator 交给系统注册（registerAccelerator 默认 true），
 *   Electron 会在按键到达渲染层**之前**就把组合键吃掉 → 输入框内无法区分
 *   「有选区 → 原生复制」与「无选区 → 工具复制」（SK-05/SK-06 的硬要求）。
 *
 *   因此：**凡是需要按焦点状态判定的应用级快捷键，一律 registerAccelerator:false**
 *   —— 菜单里照常显示快捷键文本，实际派发由渲染层按 D-05 矩阵统一裁决。
 *   仅 Alt+F4（系统级退出）保留真实注册。
 */
function appItem(label, accelerator, command, mainWindow, id) {
  return {
    id,
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(mainWindow, command),
  };
}

/**
 * @param {object} deps
 * @param {import('electron').BrowserWindow} deps.mainWindow
 */
function buildMenu({ mainWindow }) {
  const template = [
    {
      label: '文件',
      submenu: [
        // 🔒 SK-05：Ctrl+C = 复制分辨率（宽×高，无千分位）
        appItem('复制分辨率', 'Ctrl+C', COMMANDS.COPY_RESOLUTION, mainWindow, 'copy-resolution'),
        // 🔒 SK-06：Ctrl+Shift+C = 复制完整参数（14 段）
        appItem('复制完整参数', 'Ctrl+Shift+C', COMMANDS.COPY_FULL_PARAMETERS, mainWindow, 'copy-full-parameters'),
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
        // 🔒 SK-03：Ctrl+B = 宽高互换
        appItem('宽高互换', 'Ctrl+B', COMMANDS.SWAP, mainWindow, 'swap'),
        // 🔒 SK-04：Ctrl+R = 恢复默认值（本菜单整体替换了 Electron 默认菜单，
        //    默认的「重新加载 Ctrl+R」项已不存在 → 不会刷新窗口）
        appItem('恢复默认值', 'Ctrl+R', COMMANDS.RESET_DEFAULTS, mainWindow, 'reset-defaults'),
        { type: 'separator' },
        // 🔒 SK-07：Ctrl+, = 设置
        appItem('设置…', 'Ctrl+,', COMMANDS.OPEN_SETTINGS, mainWindow, 'open-settings'),
      ],
    },
    {
      label: '视图',
      submenu: [
        // 🔒 SK-01：Ctrl+1~4 = 切画布模式
        appItem('按宽度', 'Ctrl+1', COMMANDS.MODE_WIDTH, mainWindow, 'mode-width'),
        appItem('按高度', 'Ctrl+2', COMMANDS.MODE_HEIGHT, mainWindow, 'mode-height'),
        appItem('常用规格', 'Ctrl+3', COMMANDS.MODE_PRESET, mainWindow, 'mode-preset'),
        appItem('整数倍画布', 'Ctrl+4', COMMANDS.MODE_CUSTOM, mainWindow, 'mode-custom'),
        { type: 'separator' },
        // 🔒 SK-02：Ctrl+Q = 比例来源循环
        appItem('比例来源循环', 'Ctrl+Q', COMMANDS.CYCLE_RATIO_SOURCE, mainWindow, 'cycle-ratio-source'),
        // IX-12：两栏档展开/折叠舞台；单栏/三栏档置灰并注明原因
        appItem('展开/折叠舞台', null, COMMANDS.TOGGLE_STAGE, mainWindow, 'toggle-stage'),
        // 视图：复位栏宽（恢复 A=320 / C=400）
        appItem('复位栏宽', null, COMMANDS.RESET_COLUMNS, mainWindow, 'reset-columns'),
        { type: 'separator' },
        {
          id: 'layout-tier',
          label: '布局档位：三栏',
          enabled: false,
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        // 🔒 SK-08 / SK-09：Ctrl+/ 与 F1 = 快捷键帮助
        appItem('快捷键帮助', 'F1', COMMANDS.SHORTCUT_HELP, mainWindow, 'shortcut-help'),
        appItem('关于 LED 比例换算台', null, COMMANDS.ABOUT, mainWindow, 'about'),
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

module.exports = { buildMenu, COMMANDS };
