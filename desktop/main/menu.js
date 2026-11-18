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
 *
 * i18n（S10-R9 缺陷修复）：
 *   菜单标签与渲染层共享同一语言包真源（renderer/i18n/locales/*），
 *   按当前 locale 取值（menu.* / main.* 键），缺失时回退 zh-CN 原文。
 *   语言包经 require() 在 Node 侧消费（IIFE 注册到 module.exports.LedI18NPack）。
 */

const { app, Menu } = require('electron');

/* ---------------------------------------------------------------------------
 * 语言包加载（与渲染层同一真源；require 幂等，模块缓存保证只解析一次）
 * ------------------------------------------------------------------------ */
const LOCALE_PACKS = {
  'zh-CN': require('../renderer/i18n/locales/zh-CN.js').LedI18NPack['zh-CN'],
  'en-US': require('../renderer/i18n/locales/en-US.js').LedI18NPack['en-US'],
};

/** 支持的语言白名单（与 renderer/i18n/runtime.js SUPPORTED 一致） */
const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en-US']);

/**
 * 按 locale 取菜单文案。回退链：指定语言 → zh-CN → 键名本身。
 * @param {string} key 语言包键（menu.* / main.*）
 * @param {string} locale 'zh-CN' | 'en-US'
 */
function menuLabel(key, locale) {
  const pack = LOCALE_PACKS[SUPPORTED_LOCALES.includes(locale) ? locale : 'zh-CN'] || {};
  return pack[key] || (LOCALE_PACKS['zh-CN'] && LOCALE_PACKS['zh-CN'][key]) || key;
}

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
 * @param {string} [deps.locale] 当前语言（zh-CN | en-US），缺省 zh-CN
 */
function buildMenu({ mainWindow, locale }) {
  const L = (key) => menuLabel(key, locale);
  const template = [
    {
      label: L('menu.file'),
      submenu: [
        // 🔒 SK-05：Ctrl+C = 复制分辨率（宽×高，无千分位）
        appItem(L('menu.file.copyResolution'), 'Ctrl+C', COMMANDS.COPY_RESOLUTION, mainWindow, 'copy-resolution'),
        // 🔒 SK-06：Ctrl+Shift+C = 复制完整参数（14 段）
        appItem(L('menu.file.copyFullParameters'), 'Ctrl+Shift+C', COMMANDS.COPY_FULL_PARAMETERS, mainWindow, 'copy-full-parameters'),
        { type: 'separator' },
        {
          label: L('menu.file.exit'),
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: L('menu.edit'),
      submenu: [
        // 🔒 SK-03：Ctrl+B = 宽高互换
        appItem(L('menu.edit.swap'), 'Ctrl+B', COMMANDS.SWAP, mainWindow, 'swap'),
        // 🔒 SK-04：Ctrl+R = 恢复默认值（本菜单整体替换了 Electron 默认菜单，
        //    默认的「重新加载 Ctrl+R」项已不存在 → 不会刷新窗口）
        appItem(L('menu.edit.resetDefaults'), 'Ctrl+R', COMMANDS.RESET_DEFAULTS, mainWindow, 'reset-defaults'),
        { type: 'separator' },
        // 🔒 SK-07：Ctrl+, = 设置
        appItem(L('menu.edit.settings'), 'Ctrl+,', COMMANDS.OPEN_SETTINGS, mainWindow, 'open-settings'),
      ],
    },
    {
      label: L('menu.view'),
      submenu: [
        // 🔒 SK-01：Ctrl+1~4 = 切画布模式
        appItem(L('menu.view.modeWidth'), 'Ctrl+1', COMMANDS.MODE_WIDTH, mainWindow, 'mode-width'),
        appItem(L('menu.view.modeHeight'), 'Ctrl+2', COMMANDS.MODE_HEIGHT, mainWindow, 'mode-height'),
        appItem(L('menu.view.modePreset'), 'Ctrl+3', COMMANDS.MODE_PRESET, mainWindow, 'mode-preset'),
        appItem(L('menu.view.modeCustom'), 'Ctrl+4', COMMANDS.MODE_CUSTOM, mainWindow, 'mode-custom'),
        { type: 'separator' },
        // 🔒 SK-02：Ctrl+Q = 比例来源循环
        appItem(L('menu.view.cycleRatioSource'), 'Ctrl+Q', COMMANDS.CYCLE_RATIO_SOURCE, mainWindow, 'cycle-ratio-source'),
        // IX-12：两栏档展开/折叠舞台；单栏/三栏档置灰并注明原因
        appItem(L('menu.view.toggleStage'), null, COMMANDS.TOGGLE_STAGE, mainWindow, 'toggle-stage'),
        // 视图：复位栏宽（恢复 A=320 / C=400）
        appItem(L('menu.view.resetColumns'), null, COMMANDS.RESET_COLUMNS, mainWindow, 'reset-columns'),
        { type: 'separator' },
        {
          id: 'layout-tier',
          label: L('menu.view.layoutTier'),
          enabled: false,
        },
      ],
    },
    {
      label: L('menu.help'),
      submenu: [
        // 🔒 SK-08 / SK-09：Ctrl+/ 与 F1 = 快捷键帮助
        appItem(L('menu.help.shortcutHelp'), 'F1', COMMANDS.SHORTCUT_HELP, mainWindow, 'shortcut-help'),
        appItem(L('menu.help.about'), null, COMMANDS.ABOUT, mainWindow, 'about'),
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

module.exports = { buildMenu, menuLabel, COMMANDS, SUPPORTED_LOCALES };
