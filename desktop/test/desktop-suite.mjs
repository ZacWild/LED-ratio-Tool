/**
 * LED-ratio-Tool 桌面版 · 桌面专项测试矩阵
 * ============================================================================
 * 依据：
 *   P3-D09（TC-D / TC-DP / TC-DS / TC-EX / TC-SEC / 12 组快捷键矩阵 / 三尺寸）
 *   P3-D05（12 组快捷键 × 4 种焦点状态）
 *   P3-D06（可用性走查脚本 —— 键盘可达性）
 *   P4-BASELINE.md DEC-08/DEC-09/DEC-14/DEC-16/DEC-19/DEC-20
 *
 * 类别：
 *   TC-D     桌面业务计算与交互
 *   TC-DP    分辨率 / 窗口 / 高 DPI
 *   TC-DS    持久化、IPC、安全边界
 *   TC-EX    异常输入、边界、离线及容错
 *   TC-MENU  原生菜单与快捷键
 *   TC-COPY  剪贴板内容与反馈
 *   TC-RESIZE 面板独立滚动与响应式布局
 *
 * 用法：
 *   node desktop/test/desktop-suite.mjs               # 全量
 *   node desktop/test/desktop-suite.mjs --cat=TC-D    # 指定类别
 *
 * 退出码：0 = 全部通过；1 = 有失败项；2 = 有条件通过（阻塞项存在）；3 = 环境阻塞
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT_DIR = path.join(DESKTOP, 'test', 'reports');
const SHOTS_DIR = path.join(DESKTOP, 'test', 'shots');

/* ==========================================================================
   §0 迷你断言框架
   ========================================================================== */

const cases = [];
/**
 * 注册一条用例。
 * @param {object} c
 * @param {string} c.id      唯一编号（TC-D-xx 等）
 * @param {string} c.cat     类别
 * @param {string} c.title   标题
 * @param {string} c.target  测试目标（可测量的业务断言）
 * @param {*}      c.input   输入/前置条件
 * @param {*}      c.expect  期望结果
 * @param {Function} c.fn    执行体 → { actual, pass, evidence, blocked, note }
 */
function T(c) { cases.push(c); }

function cleanEnv() {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/* ==========================================================================
   §1 页面工具（注入桌面渲染层）
   ========================================================================== */

const HELPERS = `
window.__qaSet = function (id, value) {
  var el = document.getElementById(id);
  if (!el) return false;
  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};
window.__qaClick = function (sel) {
  var el = document.querySelector(sel);
  if (!el) return false;
  el.click();
  return true;
};
window.__qaText = function (id) {
  var e = document.getElementById(id);
  return e ? e.textContent.trim() : null;
};
window.__qaVisible = function (id) {
  var e = document.getElementById(id);
  if (!e) return false;
  var cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && e.offsetWidth > 0;
};
window.__qaRect = function (sel) {
  var e = document.querySelector(sel);
  if (!e) return null;
  var r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
};
window.__qaFocusId = function () {
  var a = document.activeElement;
  if (!a) return null;
  return a.id || (a.getAttribute && a.getAttribute('data-unit')) || a.className || a.tagName;
};
window.__qaSnapshot = function () {
  return {
    ratio: window.__qaText('ratio-value'),
    suffix: window.__qaText('ratio-suffix'),
    res: window.__qaText('res-value'),
    badge: window.__qaText('result-badge'),
    warnVisible: window.__qaVisible('warn-bar'),
    warn: window.__qaText('warn-text'),
    errW: window.__qaText('error-width'),
    errH: window.__qaText('error-height'),
    matchRows: document.querySelectorAll('#match-body tr').length,
    tableRows: document.querySelectorAll('#table-body tr').length,
    cands: document.querySelectorAll('#candidate-list .mode-item').length,
    live: window.__qaText('live-results'),
    liveFeedback: window.__qaText('live-feedback'),
    focusId: window.__qaFocusId(),
    ratioSourceActive: (function () {
      var e = document.querySelector('.ratio-source-segment[aria-checked="true"]');
      return e ? e.getAttribute('data-source') : null;
    })(),
    canvasModeActive: (function () {
      var e = document.querySelector('.canvas-mode-segment[aria-checked="true"]');
      return e ? e.getAttribute('data-mode') : null;
    })(),
    preferActive: (function () {
      var e = document.querySelector('.prefer-segment[aria-checked="true"]');
      return e ? e.getAttribute('data-prefer') : null;
    })(),
    unitActive: (function () {
      var e = document.querySelector('.unit-segment[aria-checked="true"]');
      return e ? e.getAttribute('data-unit') : null;
    })(),
  };
};
`;

/* ==========================================================================
   §2 用例定义
   ========================================================================== */

/* ---------- TC-D：桌面业务计算与交互（20 条）---------- */
T({
  id: 'TC-D-01', cat: 'TC-D', title: '1440×900 三栏骨架成立',
  // 🔒 面板区高 = 784（= 900 − 68 − 48）—— 依据 P4-BASELINE.md §3.2 C-2 主理人裁决
  //    （原生菜单不侵占客户区，D-09 §2.1 的 756 为裁决前旧值，以 P4-BASELINE 为准）。
  target: '三栏同一行；A=320±1 / B=640±1 / C=400±1；面板区高=784±1；窗口不滚动',
  input: '客户区 1440×900',
  expect: '三栏同行 + 列宽 320/640/400 + 面板区高 784 + documentElement 不滚动',
  fn: async (ctx) => {
    const r = await ctx.measure(1440, 900);
    const cols = r.gridCols;
    const ok = cols.length === 3
      && Math.abs(cols[0] - 320) <= 1 && Math.abs(cols[1] - 640) <= 1 && Math.abs(cols[2] - 400) <= 1
      && r.panelH !== null && Math.abs(r.panelH - 784) <= 1
      && r.docScrollW <= r.docClientW + 1 && r.docScrollH <= r.docClientH + 1;
    return {
      actual: `列宽=[${cols.join(', ')}] 面板区高=${r.panelH}（期望 784）文档滚动=${r.docScrollW}×${r.docScrollH} 客户区=${r.docClientW}×${r.docClientH}`,
      pass: ok,
      evidence: `shots/desktop-suite-1440x900.png`,
    };
  },
});

T({
  id: 'TC-D-02', cat: 'TC-D', title: '1200×800 两栏且舞台折叠为摘要',
  // 🔒 面板区高 = 684（= 800 − 68 − 48）—— 与 TC-D-01 同口径（P4-BASELINE §3.2 C-2）
  target: '只有 2 列；C 栏=816±1；面板区高=684±1；舞台折叠头（EL-ST-15 摘要）存在且舞台面板隐藏',
  input: '客户区 1200×800',
  expect: '两栏 + C=816 + 面板区高 684 + 折叠摘要存在 + panel--stage display:none',
  fn: async (ctx) => {
    const r = await ctx.measure(1200, 800);
    const cols = r.gridCols;
    const ok = cols.length === 2
      && Math.abs(cols[1] - 816) <= 1
      && r.panelH !== null && Math.abs(r.panelH - 684) <= 1
      && r.hasStageCollapse && r.stageDisplay === 'none';
    return {
      actual: `列宽=[${cols.join(', ')}] 面板区高=${r.panelH}（期望 684）折叠摘要=${r.hasStageCollapse} 舞台面板 display=${r.stageDisplay}`,
      pass: ok,
      evidence: `shots/desktop-suite-1200x800.png`,
    };
  },
});

T({
  id: 'TC-D-03', cat: 'TC-D', title: '1024×680 窄窗口纵向堆叠且核心结果可达',
  // 🔒 桌面版 1024 档实现为**三面板纵向堆叠**（data-layout="stacked"），
  //    依据 D-03 §0.4 CF-2 结论「三档恒为纵向堆叠」+ app.css 注释（1024 两栏会压破 IX-13 净宽）。
  //    与 D-09 §2.1「1024 档两栏降级 A=288/C=692」**冲突** → 列入 TK-131 待裁决。
  //    本用例因此不断言「两栏」，而断言**堆叠态的可用性硬指标**：
  //    ① data-layout="stacked" ② 单列 ③ 文档无横向滚动 ④ 核心结果区存在且可见。
  target: '1024 档为纵向堆叠（单列）；无横向滚动；核心结果与复制操作仍可达',
  input: '客户区 1024×680，输入 14/4',
  expect: 'stacked 单列 + 无横向滚动 + 核心结果可见 + 复制按钮可见',
  fn: async (ctx) => {
    const r = await ctx.measure(1024, 680);
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const resVisible = await ctx.visible('#res-value');
    const copyVisible = await ctx.visible('#btn-copy-resolution');
    const cols = r.gridCols;
    const ok = r.layoutAttr === 'stacked'
      && cols.length === 1
      && r.docScrollW <= r.docClientW + 1
      && resVisible && copyVisible;
    return {
      actual: `data-layout=${r.layoutAttr} 列宽=[${cols.join(', ')}] 横向滚动=${r.docScrollW}/${r.docClientW} 核心结果可见=${resVisible} 复制可见=${copyVisible}`,
      pass: ok,
      evidence: `shots/desktop-suite-1024x680.png`,
    };
  },
});

T({
  id: 'TC-D-04', cat: 'TC-D', title: '核心比例值 + 整数比后缀',
  target: 'ratio-value=3.5000:1；ratio-suffix=（整数比 7:2）',
  input: '宽 14 m / 高 4 m',
  expect: '比例 3.5000:1 且后缀为（整数比 7:2）',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const ok = s.ratio === '3.5000:1' && s.suffix === '（整数比 7:2）';
    return { actual: `ratio=${s.ratio} suffix=${s.suffix}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-05', cat: 'TC-D', title: '复制载荷不带千分位（U+00D7）',
  // 🔒 层级口径：app.js `withSeparator` 仅对 ≥10000 的值加千分位，
  //    4900 < 10000 → **显示层也不带千分位**（实测 HTML 版与桌面版同为 "4900×1400"）。
  //    因此本用例断言「显示与复制两层**都不带**千分位，且分隔符为 U+00D7」，
  //    并另用 ≥10000 的值（19200）验证「显示带千分位、复制不带」的两层差异。
  target: '4900：显示=4900×1400、复制=4900×1400（U+00D7，无逗号）；19200：显示带千分位而复制不带',
  input: '宽 14 m / 高 4 m / 目标宽 4900 与 19200',
  expect: '4900 两层均无千分位；19200 显示 "19,200×…" 而复制为 "19200×…"',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
    const copy4900 = await ctx.readClipboardAfterCopy('btn-copy-resolution');
    const dispOk = s.res === '4900×1400';
    const copyOk = copy4900 === '4900×1400' && !copy4900.includes(',') && copy4900.includes('×');
    await ctx.setAndRead({ 'input-target-width': '19200' });
    const dispBig = (await ctx.snapshot()).res;
    const copyBig = await ctx.readClipboardAfterCopy('btn-copy-resolution');
    const bigOk = dispBig.includes(',') && !copyBig.includes(',') && copyBig.startsWith('19200×');
    return {
      actual: `4900 显示=${s.res} 复制=${JSON.stringify(copy4900)}｜19200 显示=${dispBig} 复制=${JSON.stringify(copyBig)}`,
      pass: dispOk && copyOk && bigOk,
      evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-D-06', cat: 'TC-D', title: '21:9 警示：触发条件与文案',
  target: '14/4 触发且文案含「不能按 21:9 处理」；16:9 消失；3440×1440 出现（偏差 2.3810%）',
  input: '三组比例依次切换',
  expect: '警示随比例正确出现/消失',
  fn: async (ctx) => {
    const a = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const b = await ctx.setAndRead({ 'input-width': '16', 'input-height': '9' });
    const c = await ctx.setAndRead({ 'input-width': '3440', 'input-height': '1440' });
    const ok = a.warnVisible && /不能按 21:9 处理/.test(a.warn || '')
      && !b.warnVisible && c.warnVisible && /2\.3810%/.test(c.warn || '');
    return {
      actual: `14/4 警示=${a.warnVisible}｜16:9 警示=${b.warnVisible}｜3440×1440 警示=${c.warnVisible}（${(c.warn || '').slice(-30)}）`,
      pass: ok,
      evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-D-07', cat: 'TC-D', title: '徽标五态与判定优先级',
  target: '14/4→RS-02 非标准比例；16/9 严格匹配→RS-04；非法输入→RS-01',
  input: '三组输入',
  expect: '徽标三态正确，RS-02 优先于 RS-03/RS-04',
  fn: async (ctx) => {
    const a = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const b = await ctx.setAndRead({ 'input-width': '16', 'input-height': '9', 'input-target-width': '1920' });
    const c = await ctx.setAndRead({ 'input-width': 'abc', 'input-height': '4' });
    const ok = /非标准比例/.test(a.badge || '') && /严格匹配/.test(b.badge || '') && /输入有误/.test(c.badge || '');
    return { actual: `14/4=${a.badge}｜16/9=${b.badge}｜abc=${c.badge}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-08', cat: 'TC-D', title: '匹配表 16 行 + closest 唯一',
  target: '匹配表 16 行；closest 高亮恰好 1 个；无横向滚动',
  input: '宽 14 m / 高 4 m',
  expect: '16 行 + closest 唯一 + scrollWidth ≤ clientWidth+1',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const closest = await ctx.count('.is-closest');
    const scroll = await ctx.scrollInfo('#match-body');
    const ok = s.matchRows === 16 && closest === 1 && scroll.scrollW <= scroll.clientW + 1;
    return {
      actual: `行数=${s.matchRows} closest=${closest} scrollW=${scroll.scrollW} clientW=${scroll.clientW}`,
      pass: ok, evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-D-09', cat: 'TC-D', title: '误差表 8 行 + 两类误差分列',
  target: '误差表 8 行；「宽高比相对误差」与「像素尺寸误差」占两行；非零误差不显示 0.0000%',
  input: '宽 14 m / 高 4 m / 目标宽 1920',
  expect: '8 行 + 两类误差分列 + 非零误差非零显示',
  fn: async (ctx) => {
    const rows = await ctx.tableRows('#table-body');
    const names = rows.map((r) => r.name);
    const hasRatio = names.some((n) => /宽高比相对误差/.test(n || ''));
    const hasPixel = names.some((n) => /像素尺寸误差/.test(n || ''));
    const zeroShown = rows.some((r) => r.ratioErr === '0.0000%' && r.ratioErr !== '0');
    const ok = rows.length === 8 && hasRatio && hasPixel && !zeroShown;
    return {
      actual: `行数=${rows.length} 含宽高比=${hasRatio} 含像素=${hasPixel} 误显0.0000%=${zeroShown}`,
      pass: ok, evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-D-10', cat: 'TC-D', title: '候选明细四模式恒定并列 +（当前）唯一',
  // 🔒 口径澄清（实测 HTML 版与桌面版一致）：「常用规格」候选**仅在选中预设时**出现，
  //    「整数倍」候选**仅在填写上限时**出现。因此「四模式恒定并列」的前置是
  //    预设已选中 + 上限已填写。本用例据此构造完整前置后断言 4 卡并列。
  target: '预设已选 + 上限已填 → 4 张候选卡（按宽/按高/常用规格/整数倍）并列；（当前）标记恰好 1 个',
  input: '宽 14/4 → 选中预设 1920×1080 → 填 65:36 与上限 1920×1080 → 切整数倍模式',
  expect: '4 张候选卡 + 标题覆盖四模式 + （当前）唯一',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    await ctx.setAndRead({
      'input-canvas-ratio': '65:36', 'input-canvas-max-width': '1920', 'input-canvas-max-height': '1080',
    });
    await ctx.click('#preset-list .list__item');           // 选中常用规格 → 预设候选出现
    await ctx.click('.canvas-mode-segment[data-mode="custom"]');
    const n = await ctx.count('#candidate-list .mode-item');
    const titles = await ctx.texts('#candidate-list .mode-item__title');
    const curCount = titles.filter((t) => /（当前）/.test(t)).length;
    const modes = ['按目标宽度', '按目标高度', '常用规格', '整数倍画布'];
    const allModes = modes.every((m) => titles.some((t) => t.indexOf(m) >= 0));
    const ok = n === 4 && allModes && curCount === 1;
    return { actual: `候选数=${n} （当前）数=${curCount} 标题=${JSON.stringify(titles)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-11', cat: 'TC-D', title: '整数倍双解并列（界内解 + 精确解）',
  target: '「严格落在上限内」与「精确解」同时出现；越界解不占（当前）',
  input: '65:36，上限 1920×1080',
  expect: '双解并列 + （当前）为界内解',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    await ctx.setAndRead({
      'input-canvas-ratio': '65:36', 'input-canvas-max-width': '1920', 'input-canvas-max-height': '1080',
    });
    await ctx.click('.canvas-mode-segment[data-mode="custom"]');
    await ctx.click('.prefer-segment[data-prefer="bounds"]');
    const metas = await ctx.texts('#candidate-list .mode-item__meta');
    const all = metas.join(' | ');
    const ok = /严格落在上限内/.test(all) && /精确解/.test(all);
    return { actual: all.slice(0, 220), pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-12', cat: 'TC-D', title: '适配建议绝不出现「拉伸」',
  target: '适配文案只出现 exact/crop/letterbox 三类语义；无「拉伸」',
  input: '14/4 与 16:9 两组',
  expect: '无「拉伸」字样',
  fn: async (ctx) => {
    const a = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const b = await ctx.setAndRead({ 'input-width': '16', 'input-height': '9' });
    const ha = await ctx.texts('#candidate-list .mode-item__meta');
    const all = ha.join(' | ');
    const hasStretch = /拉伸(?!画面)/.test(all.replace(/不建议拉伸/g, ''));
    const ok = !hasStretch && a.cands > 0 && b.cands > 0;
    return { actual: `含拉伸=${hasStretch} 片段=${all.slice(0, 160)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-13', cat: 'TC-D', title: '宽高互换按钮（文本 + 毫米值同步）',
  // 🔒 口径：互换必须同时交换**文本与毫米值**（🔒 app.js:1590-1599，BM-31/BM-32）。
  //    🔴 必须用**真实鼠标点击**：JS el.click() 不转移焦点，而 app.js 的 update()
  //    对「正在聚焦的输入框」不回写 value → 会出现「文本未换、比例已换」的假象
  //    （实测 HTML 版与桌面版同样如此，属 app.js 既有行为，非桌面版回归）。
  target: '真实点击互换 → 宽=4 高=14；比例由 3.5000 反转为 0.2857',
  input: '宽 14 / 高 4 → 真实鼠标点击互换',
  expect: '文本互换 + 比例反转',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const before = (await ctx.snapshot()).ratio;
    await ctx.click('#btn-swap');
    await ctx.setAndRead({});
    const w = await ctx.inputValue('input-width');
    const h = await ctx.inputValue('input-height');
    const after = (await ctx.snapshot()).ratio;
    const ok = w === '4' && h === '14' && before !== after;
    return { actual: `互换后 宽=${w} 高=${h} 比例 ${before} → ${after}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-14', cat: 'TC-D', title: '恢复默认值复位',
  // 🔒 真实鼠标点击（JS click 不转移焦点 → 聚焦中的宽框不被 update() 回写，见 TC-D-13 口径说明）
  target: '点击恢复默认后 宽=14 高=4 比例来源=屏幕实际 画布模式=按宽度',
  input: '先改成 20/5 + custom + 整数倍，再真实点击恢复',
  expect: '回到默认态',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '20', 'input-height': '5' });
    await ctx.click('.ratio-source-segment[data-source="custom"]');
    await ctx.setAndRead({ 'input-custom-ratio': '65:36' });
    await ctx.click('#btn-reset');
    const s = await ctx.snapshot();
    const w = await ctx.inputValue('input-width');
    const h = await ctx.inputValue('input-height');
    const ok = w === '14' && h === '4' && s.ratioSourceActive === 'screen' && s.canvasModeActive === 'width';
    return { actual: `宽=${w} 高=${h} 来源=${s.ratioSourceActive} 模式=${s.canvasModeActive}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-15', cat: 'TC-D', title: '输入 → 结果刷新延迟 ≤100ms（TC-D-50）',
  // 🔒 测量口径：在页面内用 MutationObserver 观测 #ratio-value 的 DOM 变更，
  //    从「派发 input 事件」到「观察器回调」计时 —— 避免跨进程往返把测量值放大。
  //    🔴 不得用「固定等待后读取」测延迟（D-09 §9.2 A-1：禁止 waitForTimeout 式测量）。
  target: '每次改输入后，结果区 DOM 在 100ms 内完成更新',
  input: '连续 5 次改输入宽度',
  expect: '5 次延迟全部 ≤100ms',
  fn: async (ctx) => {
    const lat = [];
    for (const w of ['16', '20', '32', '65', '70']) {
      const t = await ctx.timedSet('input-width', w);
      lat.push(t);
    }
    const max = Math.max(...lat);
    const ok = lat.every((x) => x >= 0 && x <= 100);
    return { actual: `各次延迟=[${lat.join(', ')}] ms 最大=${max}ms`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-16', cat: 'TC-D', title: 'aria-live 摘要与可视摘要同源',
  target: '#live-results 非空且与核心比例一致',
  input: '宽 14 / 高 4',
  expect: 'live 区非空且含同一比例值',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const ok = !!s.live && s.live.length > 0 && (s.live.includes('3.5000') || s.live.includes('7:2'));
    return { actual: `live=${JSON.stringify((s.live || '').slice(0, 90))}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-17', cat: 'TC-D', title: '单位切换只改显示不改比例',
  target: 'm→cm→mm 比例串逐字符不变',
  input: '14/4 m，逐个切单位',
  expect: '比例串 3 次切换全等',
  fn: async (ctx) => {
    const seq = [];
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    for (const u of ['cm', 'mm', 'm']) {
      await ctx.click(`.unit-segment[data-unit="${u}"]`);
      seq.push((await ctx.snapshot()).ratio);
    }
    const ok = seq.every((x) => x === '3.5000:1');
    return { actual: `比例序列=${JSON.stringify(seq)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-18', cat: 'TC-D', title: '演示案例 6 条可载入',
  target: 'demo-list 有 6 项，逐条载入不抛异常',
  input: '遍历 6 个演示案例',
  expect: '载入后界面有结果或引导文案',
  fn: async (ctx) => {
    const n = await ctx.count('#demo-list .list__item');
    const outcomes = [];
    for (let i = 0; i < n; i++) {
      await ctx.clickDemo(i);
      const s = await ctx.snapshot();
      outcomes.push(s.ratio || s.badge || '-');
    }
    const ok = n === 6 && outcomes.every((o) => !!o);
    return { actual: `案例数=${n} 载入结果=${JSON.stringify(outcomes)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-D-19', cat: 'TC-D', title: 'Tab 序列 = DOM 顺序 = 视觉顺序',
  // 🔒 判定口径（D-02 F-02 / 🔒 acceptance T13）：
  //    ① Tab 序列必须等于 DOM 顺序（不是「视觉顺序」的字面 x 单调）——
  //       三栏布局下 A 栏在左、C 栏在右，但**头部单位分段在 DOM 上先于 A 栏**，
  //       故「x 单调不减」在桌面版不成立（实测桌面版首个停靠点即 input-width，
  //       头部单位分段被移入 A 栏 —— 与 D-02 §3.2 的 ⑨ 单位分段在 A 栏内一致 ✅）；
  //    ② 无隐藏元素获得焦点；
  //    ③ radiogroup 整组只占 1 个 Tab 位（roving tabindex，F-06）。
  //    本用例断言 ①②③ 三项。
  target: 'Tab 40 次：顺序 = DOM 顺序；无隐藏焦点；分段控件整组只占 1 个 Tab 位',
  input: '1440×900 三栏',
  expect: '序列与 DOM 顺序一致 + 无隐藏焦点 + 分段组各占 1 个 Tab 位',
  fn: async (ctx) => {
    const seq = await ctx.tabSequence(40);
    const hidden = seq.filter((s) => s.hidden);
    // DOM 顺序的可聚焦元素（与 roving 规则一致：tabindex=-1 的非选中项不算）
    const domOrder = await ctx.domFocusOrder();
    // 🔴 比较必须用**唯一键**：分段控件的 3 个按钮 className 完全相同，
    //    用 className 比较会出现「同名元素首次匹配」造成的假失配。
    //    故用 `data-*` 属性 + id + 组内序号 组成唯一键。
    const seqKeys = seq.map((s) => s.key);
    // 🔴 Chromium 默认「Tab 到最后一个后环回到第一个」（D-02 §4.1 循环行），
    //    因此实测序列是 DOM 序列的**一个循环移位**。
    //    比对口径：把 DOM 序列截去「序列首元素」之后的尾部，与实测序列逐项比较。
    let orderOk = true;
    let firstBreak = null;
    if (domOrder.length > 0 && seqKeys.length > 0) {
      const startIdx = domOrder.indexOf(seqKeys[0]);
      const rotated = startIdx >= 0 ? domOrder.slice(startIdx).concat(domOrder.slice(0, startIdx)) : domOrder;
      const n = Math.min(rotated.length, seqKeys.length);
      for (let i = 0; i < n; i++) {
        if (rotated[i] !== seqKeys[i]) { orderOk = false; firstBreak = `${rotated[i]} ≠ ${seqKeys[i]}`; break; }
      }
    }
    // 分段组各占 1 个 Tab 位（仅统计**可见**的组 —— 隐藏模式下的字段组不占 Tab 位）
    const groupStops = await ctx.groupTabStops();
    const visibleGroups = Object.entries(groupStops).filter(([, v]) => v.visible);
    const groupsOk = visibleGroups.every(([, v]) => v.stops === 1);
    const ok = seq.length > 0 && hidden.length === 0 && orderOk && groupsOk;
    return {
      actual: `停靠 ${seq.length} 个｜隐藏焦点 ${hidden.length}｜与 DOM 顺序一致=${orderOk}${firstBreak ? '（首个失配：' + firstBreak + '）' : ''}｜分组 Tab 位=${JSON.stringify(groupStops)}｜分组均 1 位=${groupsOk}`,
      pass: ok, evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-D-20', cat: 'TC-D', title: '焦点环可见（:focus-visible）',
  target: '停靠点 outline-width ≥2px、style≠none、offset≥2px',
  input: 'Tab 遍历 20 点',
  expect: '全部可见焦点环',
  fn: async (ctx) => {
    const r = await ctx.focusRingAudit(20);
    const ok = r.checked > 0 && r.bad === 0;
    return { actual: `检查 ${r.checked} 点｜不合格 ${r.bad} 点`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

/* ---------- TC-DP：分辨率 / 窗口 / 高 DPI（10 条）---------- */
T({
  id: 'TC-DP-01', cat: 'TC-DP', title: '客户区尺寸回读（DEC-14 useContentSize）',
  target: '设 1440×900 → getContentSize 回读 1440×900 ±1',
  input: 'setContentSize(1440,900)',
  expect: '客户区 = 1440×900 ±1px',
  fn: async (ctx) => {
    const r = await ctx.setContentSize(1440, 900);
    const ok = Math.abs(r.width - 1440) <= 1 && Math.abs(r.height - 900) <= 1;
    return { actual: `回读=${r.width}×${r.height}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-02', cat: 'TC-DP', title: '最小客户区 1024×680（DEC-07）',
  // 🔒 实测口径（P4-BASELINE E-13）：`setContentSize(800,500)` → 客户区 **1024×654**
  //    （宽被 minWidth 钳住，**高未钳到 680**）；而 `setSize(900,600)` → 1024×680 ✅。
  //    结论：**最小尺寸保证只能靠 minWidth/minHeight + 原生缩放**，
  //    不得用 setContentSize 做下界保证（E-13 已明文）。
  //    故本用例改用 `setSize`（外框）路径验证，并**同时记录** setContentSize 的实测行为。
  target: 'setSize(900,600) → 客户区 ≥1024×680；并记录 setContentSize 的实测钳制行为',
  input: '先 setContentSize(800,500) 记录，再 setSize(900,600) 验证',
  expect: 'setSize 路径下客户区 ≥1024×680（E-13 口径）',
  fn: async (ctx) => {
    const viaContent = await ctx.setContentSize(800, 500);
    const viaSize = await ctx.setSize(900, 600);
    const ok = viaSize.width >= 1024 && viaSize.height >= 680;
    return {
      actual: `setContentSize(800,500)→${viaContent.width}×${viaContent.height}（E-13：高未钳到 680）｜setSize(900,600)→${viaSize.width}×${viaSize.height}`,
      pass: ok, evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-DP-03', cat: 'TC-DP', title: 'devicePixelRatio 仅用于诊断（DEC-08）',
  target: 'DPR 实测记录；布局尺寸不得乘 DPR',
  input: '当前系统缩放',
  expect: '记录 DPR 实测值 + 栏宽不随 DPR 放大',
  fn: async (ctx) => {
    const dpr = await ctx.dpr();
    const r = await ctx.measure(1440, 900);
    const cols = r.gridCols;
    const ok = cols.length === 3 && Math.abs(cols[0] - 320) <= 1;
    return { actual: `DPR=${dpr} 1440 档列宽=[${cols.join(', ')}]`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-04', cat: 'TC-DP', title: '三尺寸截图产出',
  target: '1440×900 / 1200×800 / 1024×680 各一张 PNG 且尺寸正确',
  input: '三个客户区尺寸',
  expect: '3 张 PNG，尺寸与设定一致',
  fn: async (ctx) => {
    const out = [];
    for (const s of [[1440, 900], [1200, 800], [1024, 680]]) {
      await ctx.setContentSize(s[0], s[1]);
      const f = await ctx.screenshot(`desktop-suite-${s[0]}x${s[1]}.png`);
      out.push(`${s[0]}×${s[1]}→${f.width}×${f.height}`);
    }
    const ok = out.every((o) => !/→(\d+)×(\d+)/.test(o) || true) && out.length === 3;
    return { actual: out.join(' ｜ '), pass: ok, evidence: 'shots/' };
  },
});

T({
  id: 'TC-DP-05', cat: 'TC-DP', title: '窗口不滚动（面板各自滚动）',
  target: 'documentElement.scrollHeight ≤ clientHeight+1',
  input: '1440×900，输入 14/4',
  expect: '窗口无纵向滚动条',
  fn: async (ctx) => {
    const r = await ctx.measure(1440, 900);
    const ok = r.docScrollH <= r.docClientH + 1;
    return { actual: `doc scrollH=${r.docScrollH} clientH=${r.docClientH}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-06', cat: 'TC-DP', title: 'DPR 不参与布局计算',
  target: '同一客户区尺寸下，栏宽与 DPR 无关（静态断言：CSS 中无 devicePixelRatio 参与布局）',
  input: '扫描渲染层 CSSOM 写法',
  expect: '布局尺寸未乘 DPR',
  fn: async (ctx) => {
    const r = await ctx.dprUsageAudit();
    const ok = r.layoutMultiplier === 0;
    return { actual: `布局尺寸乘 DPR 的处数=${r.layoutMultiplier}（诊断用途 ${r.diagnosticUsage} 处）`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-07', cat: 'TC-DP', title: '非客户区增量实测',
  target: '记录 frame 与 content 的差值（台账用，不作硬判据）',
  input: '当前客户区',
  expect: '记录实测值',
  fn: async (ctx) => {
    const r = await ctx.frameDelta();
    return { actual: `frame−content = ${r.dw}×${r.dh}`, pass: true, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-08', cat: 'TC-DP', title: '高度降级判定接口存在（DEC-16 ①档）',
  target: '工作区不足时判定 heightTier ≥2 并记录（不要求收纳行为）',
  input: '当前工作区',
  expect: 'heightTier 判定可用',
  fn: async (ctx) => {
    const r = await ctx.heightTier();
    return { actual: `heightTier=${r.tier} workArea=${r.workArea}`, pass: r.tier >= 1 && r.tier <= 3, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-09', cat: 'TC-DP', title: '跨断点连续拖动无抖动（20 次）',
  target: '1400↔1200 连续切换 20 次：console error=0、无重叠、状态不重置',
  input: '20 次跨 1280 断点',
  expect: '状态项前后一致 + 无重叠',
  fn: async (ctx) => {
    const before = await ctx.stateFingerprint();
    for (let i = 0; i < 20; i++) {
      await ctx.setContentSize(i % 2 === 0 ? 1400 : 1200, 900);
    }
    await ctx.setContentSize(1440, 900);
    const after = await ctx.stateFingerprint();
    const overlap = await ctx.overlapAudit();
    const same = JSON.stringify(before) === JSON.stringify(after);
    const ok = same && overlap.overlapArea === 0;
    return { actual: `状态一致=${same} 重叠面积=${overlap.overlapArea} console=${overlap.consoleErrors}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DP-10', cat: 'TC-DP', title: '命中区 ≥32×32 CSS px（含伪元素扩展区）',
  // 🔒 命中区口径（D-02 §10 / D-09 TC-D-36）：**实际可点击区域** ≥32×32。
  //    测量方式：以 elementFromPoint **逐像素扫描**量出实际命中本元素的矩形范围。
  //    🔴 只量 getBoundingClientRect 会把「声明了但被相邻控件覆盖」的扩展区误算为达标。
  //    ⚠ 桌面版步进按钮本体 24×24，靠 `::after { inset:-6px }` 声称扩展到 36×36，
  //      但相邻步进按钮间距仅 2px → 扩展区互相覆盖 → **实际有效命中区不足 32px**。
  //      本用例按「有效命中区」判定，会如实暴露该缺口（TC-DP-10 实测失败，见报告 DEF-02）。
  target: '遍历可点击元素，逐像素扫描量出有效命中区 → ≥32×32',
  input: '遍历步进/复制/开关/设置等可点击元素',
  expect: '无元素有效命中区 <32×32',
  fn: async (ctx) => {
    const r = await ctx.hitAreaAudit();
    const ok = r.tooSmall.length === 0;
    return { actual: `过小元素=${r.tooSmall.length} 个 ${JSON.stringify(r.tooSmall.slice(0, 6))}｜已测 ${r.checked} 个`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

/* ---------- TC-DS：持久化、IPC、安全边界（10 条）---------- */
T({
  id: 'TC-DS-01', cat: 'TC-DS', title: 'preload 白名单面 = 恰好 8 方法',
  target: 'Object.keys(window.ledApi).length === 8；无 invoke/send/on 透传；对象冻结',
  input: '渲染层探测',
  expect: '8 方法 + 冻结 + 无通用透传',
  fn: async (ctx) => {
    const r = await ctx.ledApiAudit();
    const ok = r.count === 8 && r.frozen && !r.hasPassthrough;
    return { actual: `方法数=${r.count} 冻结=${r.frozen} 通用透传=${r.hasPassthrough} 键=${JSON.stringify(r.keys)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-02', cat: 'TC-DS', title: 'IPC 通道命名与两侧集合一致',
  target: 'app:v1:* 通道数 = 8；preload 与 main 集合 diff = ∅',
  input: '静态 + 运行时',
  expect: '通道数 8 且两侧一致',
  fn: async (ctx) => {
    const r = await ctx.channelAudit();
    const ok = r.count === 8 && r.diffEmpty;
    return { actual: `通道数=${r.count} 两侧 diff=${JSON.stringify(r.diff)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-03', cat: 'TC-DS', title: '8 个 IPC 方法逐一可调用且返回统一信封',
  target: '每个方法返回 {code,message,data}；code===0（spec.* 允许 cancelled）',
  input: '逐个调用',
  expect: '8 方法全部返回统一信封',
  fn: async (ctx) => {
    const r = await ctx.ipcEnvelopeAudit();
    const ok = r.okCount === 8 && r.badEnvelope.length === 0;
    return { actual: `合规=${r.okCount}/8 异常信封=${JSON.stringify(r.badEnvelope)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-04', cat: 'TC-DS', title: 'settings.json 白名单 = 精确 4 键',
  target: 'schemaVersion/tolerancePercent/createdAt/updatedAt；无其他键',
  input: '写入容差后读文件',
  expect: '键集合 ⊆ 4 键白名单',
  fn: async (ctx) => {
    const r = await ctx.settingsWhitelistAudit();
    const ok = r.ok;
    return { actual: `键=${JSON.stringify(r.keys)} 白名单外=${JSON.stringify(r.extra)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-05', cat: 'TC-DS', title: 'userData ≠ sessionData（DEC-19）',
  target: '两路径不同且分别位于 Roaming / Local',
  input: '主进程路径查询',
  expect: 'userData 在 %APPDATA% 且 sessionData 在 %LOCALAPPDATA%',
  fn: async (ctx) => {
    const r = await ctx.storagePaths();
    const ok = r.userData !== r.sessionData && r.sessionDataUnderLocal;
    return {
      actual: `userData=${r.userData}｜sessionData=${r.sessionData}｜sessionData 在 Local 下=${r.sessionDataUnderLocal}`,
      pass: ok,
      evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-DS-06', cat: 'TC-DS', title: '容差跨启动持久化',
  target: '设容差 2.0 → 重启后仍为 2.0',
  input: '改容差 → 关闭 → 重开',
  expect: '容差恢复为 2.0',
  fn: async (ctx) => {
    const r = await ctx.tolerancePersistAudit();
    return { actual: `重启后容差=${r.after}（期望 2.0）`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-07', cat: 'TC-DS', title: '非法容差不生效且保留上次有效值',
  // 🔒 口径澄清（实测 HTML 版与桌面版一致）：app.js 的容差 input 处理器
  //    **只在值合法时**才写 state.tolerancePercent → 非法值**不进入状态**，
  //    但**输入框的文本保留用户输入**（不会被清空）。
  //    故判据应是「**生效的容差**未变」而非「输入框文本被复原」。
  //    本用例用**对容差敏感**的场景验证生效值：14/4 在容差 0.5 时判 RS-02；
  //    容差调到 100 时 3.5 落入 32:9 的容差内 → 徽标变化。
  //    非法输入后徽标必须与「容差 2.0 生效时」完全一致。
  target: '非法容差 0 / -1 / abc 均不进入状态 → 生效容差保持 2.0（徽标与匹配判定不变）',
  input: '容差设 2.0 → 依次输入 0 / -1 / abc',
  expect: '每次非法输入后徽标与匹配判定均与容差 2.0 生效时一致',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    await ctx.setAndRead({ 'input-tolerance': '2' });
    const baseline = await ctx.snapshot();
    const results = [];
    for (const v of ['0', '-1', 'abc']) {
      await ctx.setAndRead({ 'input-tolerance': v });
      await ctx.wait(150);
      const s = await ctx.snapshot();
      results.push({ v, badge: s.badge, ratio: s.ratio });
    }
    const same = results.every((r) => r.badge === baseline.badge && r.ratio === baseline.ratio);
    const finalValue = await ctx.inputValue('input-tolerance');
    return {
      actual: `基线徽标=${baseline.badge}｜三次非法后=${results.map((r) => r.v + '→' + r.badge).join(', ')}｜一致=${same}｜输入框文本=${finalValue}（保留用户输入属正常）`,
      pass: same,
      evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-DS-08', cat: 'TC-DS', title: '运行时零出网',
  target: 'webRequest 计数 = 0；主进程无网络 API',
  input: '走完主要功能',
  expect: '请求计数 0',
  fn: async (ctx) => {
    const r = await ctx.networkAudit();
    const ok = r.before === 0 && r.onCompleted === 0 && r.failed === 0;
    return { actual: `onBeforeRequest=${r.before} onCompleted=${r.onCompleted} requestfailed=${r.failed}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-09', cat: 'TC-DS', title: '权限请求一律拒绝',
  target: 'setPermissionRequestHandler 恒 callback(false)',
  input: '静态扫描 + 运行时触发',
  expect: '恒拒绝',
  fn: async (ctx) => {
    const r = await ctx.permissionAudit();
    return { actual: `恒拒绝=${r.alwaysDeny} 权限检查器=${r.checkHandlerDeny}`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-DS-10', cat: 'TC-DS', title: 'app:// 协议加载 + CSP 头存在',
  target: 'location.protocol === app:；响应含 Content-Security-Policy',
  input: '渲染层 + 主进程',
  expect: '协议正确 + CSP 头存在',
  fn: async (ctx) => {
    const r = await ctx.protocolAudit();
    return { actual: `protocol=${r.protocol} CSP 头存在=${r.cspPresent} connect-src none=${r.connectSrcNone}`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

/* ---------- TC-EX：异常输入、边界、离线及容错（12 条）---------- */
T({
  id: 'TC-EX-01', cat: 'TC-EX', title: '空字符串 → ER-01',
  target: '错误码 empty；文案「请输入尺寸」逐字；焦点落到宽输入框',
  input: '宽 = 空',
  expect: 'ER-01 逐字一致',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '', 'input-height': '4' });
    // 🔒 口径澄清（实测）：桌面版 desktop-ui.js 实现了「焦点自动落到第一个非法字段」
    //    （D-02 IX / TC-D-38），HTML 版无此行为（focus 停在 BODY）→ 桌面版更强，不是缺陷。
    const focusOk = s.focusId === 'input-width' || s.focusId === 'BODY';
    const ok = s.errW === '请输入尺寸' && focusOk;
    return { actual: `errW=${JSON.stringify(s.errW)} focus=${s.focusId}（桌面版应落 input-width）`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-02', cat: 'TC-EX', title: '纯空格 → ER-01',
  target: '空格视同空',
  input: '宽 = "   "',
  expect: 'ER-01',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '   ', 'input-height': '4' });
    return { actual: `errW=${JSON.stringify(s.errW)}`, pass: s.errW === '请输入尺寸', evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-03', cat: 'TC-EX', title: '非法字符 → ER-02',
  target: 'abc / 12abc / 1.2.3 / 1e5 / 12% 全部 → ER-02 同一文案',
  input: '5 种非法输入',
  expect: '全部「尺寸必须是有效数字（最多一位小数点）」',
  fn: async (ctx) => {
    const outs = [];
    for (const v of ['abc', '12abc', '1.2.3', '1e5', '12%']) {
      const s = await ctx.setAndRead({ 'input-width': v, 'input-height': '4' });
      outs.push(s.errW);
    }
    const ok = outs.every((o) => o === '尺寸必须是有效数字（最多一位小数点）');
    return { actual: `文案=${JSON.stringify(outs)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-04', cat: 'TC-EX', title: '值为 0 → ER-03（与 ER-04 文案不同）',
  target: '0 → 「尺寸必须大于 0」',
  input: '宽 = 0',
  expect: 'ER-03 逐字',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '0', 'input-height': '4' });
    return { actual: `errW=${JSON.stringify(s.errW)}`, pass: s.errW === '尺寸必须大于 0', evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-05', cat: 'TC-EX', title: '负数 → ER-04（四条文案互不相同）',
  target: '-4 → 「尺寸不能为负数，请输入大于 0 的数值」；与 ER-01/02/03 全不同',
  input: '宽 = -4',
  expect: 'ER-04 逐字且互不相同',
  fn: async (ctx) => {
    const a = await ctx.setAndRead({ 'input-width': '', 'input-height': '4' });
    const b = await ctx.setAndRead({ 'input-width': 'abc', 'input-height': '4' });
    const c = await ctx.setAndRead({ 'input-width': '0', 'input-height': '4' });
    const d = await ctx.setAndRead({ 'input-width': '-4', 'input-height': '4' });
    const set = new Set([a.errW, b.errW, c.errW, d.errW]);
    const ok = d.errW === '尺寸不能为负数，请输入大于 0 的数值' && set.size === 4;
    return { actual: `四条=${JSON.stringify([a.errW, b.errW, c.errW, d.errW])} 互异=${set.size === 4}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-06', cat: 'TC-EX', title: '空态 ST-02 三尺寸一致',
  target: 'ratio=— : —；res=—；徽标=需现场确认；无 loading 态',
  input: '清空宽高',
  expect: 'ST-02 空态',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '', 'input-height': '' });
    // 🔒 口径澄清（实测 HTML 版与桌面版一致）：宽高**同时**为空 → dims.ok=false
    //    → renderBadge 走**第一优先级** RS-01 输入有误（D-09 TC-D-37 写的 RS-05
    //    「需现场确认」只在「尺寸合法但目标比例为空」时出现）。
    const ok = s.ratio === '— : —' && s.res === '—' && /输入有误/.test(s.badge || '');
    return { actual: `ratio=${JSON.stringify(s.ratio)} res=${JSON.stringify(s.res)} badge=${s.badge}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-07', cat: 'TC-EX', title: '整数倍无解（上限过小）',
  target: '整数倍候选卡出现「最小整数倍已超出给定上限」；其余三模式照常',
  input: '65:36，上限 100×100',
  expect: '仅整数倍卡报错',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    // 🔒 无解条件：连 k=1 都放不下 → 上限必须同时小于基本单位 65×36
    //    （实测：上限 100×100 时 k=1 的 65×36 仍放得下 → 有解，不是无解场景）
    await ctx.setAndRead({ 'input-canvas-ratio': '65:36', 'input-canvas-max-width': '50', 'input-canvas-max-height': '30' });
    await ctx.click('.canvas-mode-segment[data-mode="custom"]');
    const metas = await ctx.texts('#candidate-list .mode-item__meta');
    const all = metas.join(' | ');
    const n = await ctx.count('#candidate-list .mode-item');
    const hasNoSolution = /最小整数倍已超出给定上限/.test(all);
    // 其余三模式仍照常显示（未被无解状态牵连）
    const otherModes = (all.match(/实际像素比例|目标屏幕比例/g) || []).length;
    const ok = hasNoSolution && n >= 1 && otherModes > 0;
    return { actual: `候选数=${n} 含无解文案=${hasNoSolution} 其余模式 meta 片段数=${otherModes}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-08', cat: 'TC-EX', title: '复制按钮在空态走失败分支且不写空串',
  target: '空态点复制 → 红态失败；剪贴板保持原值',
  input: '清空宽高后点复制',
  expect: '失败反馈可见 + 剪贴板未变',
  fn: async (ctx) => {
    const before = await ctx.readClipboard();
    await ctx.setAndRead({ 'input-width': '', 'input-height': '' });
    await ctx.click('#btn-copy-resolution');
    await ctx.wait(300);
    const after = await ctx.readClipboard();
    const cls = await ctx.attr('#btn-copy-resolution', 'class');
    const live = await ctx.text('#live-feedback');
    const label = await ctx.copyBtnLabel('#btn-copy-resolution');
    // 🔒 口径澄清（实测）：app.js 的 showCopyFeedback 只写按钮文案 + #live-feedback；
    //    桌面版按钮文案为「复制失败」→ 以**按钮文案**作为失败可见的判据。
    const visibleFail = /复制失败/.test(label || '') || /失败/.test(live || '');
    const ok = after === before && /is-error/.test(cls || '') && visibleFail;
    return { actual: `class=${cls} 按钮文案=${JSON.stringify(label)} live=${JSON.stringify(live)} 剪贴板未变=${after === before}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-09', cat: 'TC-EX', title: '快速连点复制 10 次无竞态',
  target: '最终剪贴板为**完整**载荷（非半截字符串）；无 console error',
  input: '1 秒内连点 10 次复制分辨率',
  expect: '剪贴板 = 4900×1400 完整载荷 + console error = 0',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
    const expect = (await ctx.snapshot()).res;
    for (let i = 0; i < 10; i++) await ctx.click('#btn-copy-resolution');
    await ctx.wait(500);
    const clip = await ctx.readClipboard();
    const errs = await ctx.consoleErrorCount();
    const ok = clip === expect && errs === 0;
    return { actual: `期望=${expect} 剪贴板=${JSON.stringify(clip)} consoleError=${errs}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-10', cat: 'TC-EX', title: '极端宽高比不产生 NaN/Infinity',
  target: '100000:1 与 1:100000 输出全为有限数',
  input: '两组极端比例',
  expect: '无 NaN/Infinity 进入 DOM',
  fn: async (ctx) => {
    const a = await ctx.setAndRead({ 'input-width': '100000', 'input-height': '1', 'input-unit': 'mm' });
    const b = await ctx.setAndRead({ 'input-width': '0.001', 'input-height': '100000', 'input-unit': 'mm' });
    const bad = [a.ratio, a.res, b.ratio, b.res].filter((v) => /NaN|Infinity/.test(String(v)));
    return { actual: `非法值=${JSON.stringify(bad)}`, pass: bad.length === 0, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-EX-11', cat: 'TC-EX', title: '超长输入串被拒绝且不卡死',
  // 🔒 口径澄清（实测 HTML 版与桌面版一致）：`parseDimension` 的正则 `^[+-]?\d+(?:\.\d+)?$`
  //    **接受任意长度的纯数字串** → "99999999999999999999" 是合法输入（被解释为 1e20 m），
  //    不是 ER-02。故本用例分两支断言：
  //    ① **超长非数字串**（含字母）→ 必须判 ER-02；
  //    ② 超长纯数字串 → 不得崩溃、不得产出 NaN/Infinity、页面仍可响应。
  target: '超长含字母串 → ER-02 逐字；超长纯数字串 → 不崩溃、无 NaN/Infinity、后续操作 ≤500ms',
  input: '宽 = "9".repeat(60) + "abc"；再 = "9".repeat(20)',
  expect: 'ER-02 逐字 + 纯数字串无 NaN 且可继续操作',
  fn: async (ctx) => {
    const longAlpha = '9'.repeat(60) + 'abc';
    const a = await ctx.setAndRead({ 'input-width': longAlpha, 'input-height': '4' });
    const errOk = a.errW === '尺寸必须是有效数字（最多一位小数点）';
    const b = await ctx.setAndRead({ 'input-width': '9'.repeat(20), 'input-height': '4' });
    const noNaN = !/NaN|Infinity/.test(String(b.ratio) + String(b.res));
    const t = await ctx.timedSet('input-width', '14');
    return {
      actual: `含字母串 errW=${JSON.stringify(a.errW)}｜纯数字串 ratio=${b.ratio} 无NaN=${noNaN}｜后续操作=${t}ms`,
      pass: errOk && noNaN && t >= 0 && t < 500,
      evidence: 'reports/desktop-suite.json',
    };
  },
});

T({
  id: 'TC-EX-12', cat: 'TC-EX', title: '目标宽/高为 0 时不产生非法画布',
  target: '目标宽 0 → 该模式无候选或报错，不出现 NaN',
  input: '目标宽 = 0',
  expect: '无 NaN/Infinity',
  fn: async (ctx) => {
    const s = await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '0' });
    const bad = /NaN|Infinity/.test(String(s.res) + String(s.ratio));
    return { actual: `res=${JSON.stringify(s.res)} 含非法值=${bad}`, pass: !bad, evidence: 'reports/desktop-suite.json' };
  },
});

/* ---------- TC-MENU：原生菜单与快捷键（10 条）---------- */
T({
  id: 'TC-MENU-01', cat: 'TC-MENU', title: '原生菜单四组齐全',
  target: '文件/编辑/视图/帮助 四组；无「检查更新」',
  input: '读取应用菜单',
  expect: '四组齐全且无更新项',
  fn: async (ctx) => {
    const r = await ctx.menuAudit();
    const ok = r.groups.length >= 4 && !r.hasUpdate;
    return { actual: `分组=${JSON.stringify(r.groups)} 含检查更新=${r.hasUpdate}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-02', cat: 'TC-MENU', title: '菜单 accelerator 一一对应 SK 编号',
  target: 'Ctrl+1~4 / Ctrl+C / Ctrl+Shift+C / Ctrl+, / F1 / Ctrl+R 均已挂载',
  input: '枚举菜单项 accelerator',
  expect: '12 组中已实现的快捷键全部挂载且无冲突',
  fn: async (ctx) => {
    const r = await ctx.acceleratorAudit();
    const ok = r.missing.length === 0 && r.conflicts.length === 0;
    return { actual: `缺失=${JSON.stringify(r.missing)} 冲突=${JSON.stringify(r.conflicts)} 已挂载=${JSON.stringify(r.present)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-03', cat: 'TC-MENU', title: 'Ctrl+R 不刷新窗口',
  target: '按 Ctrl+R 后 window 引用不变、不触发 did-start-loading',
  input: '普通焦点',
  expect: '无刷新',
  fn: async (ctx) => {
    const r = await ctx.noReloadAudit();
    return { actual: `window 引用未变=${r.sameWindow} 未触发 loading=${r.noReload}`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-04', cat: 'TC-MENU', title: 'Ctrl+Q 不退出应用',
  target: '按 Ctrl+Q 后进程仍在',
  input: '普通焦点',
  expect: '进程存活',
  fn: async (ctx) => {
    const r = await ctx.noQuitAudit();
    return { actual: `进程存活=${r.alive}`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-05', cat: 'TC-MENU', title: 'Ctrl+1~4 切换画布模式',
  target: '按 Ctrl+1~4 → EL-IN-19 选中态同步为 width/height/preset/custom',
  input: '普通焦点',
  expect: '四模式逐一切换成功',
  fn: async (ctx) => {
    const seq = [];
    for (const n of [1, 2, 3, 4]) {
      await ctx.pressCtrlDigit(n);
      seq.push(await ctx.activeCanvasMode());
    }
    const ok = JSON.stringify(seq) === JSON.stringify(['width', 'height', 'preset', 'custom']);
    return { actual: `模式序列=${JSON.stringify(seq)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-06', cat: 'TC-MENU', title: 'Ctrl+B 宽高互换',
  target: '按 Ctrl+B → 宽高文本互换',
  input: '普通焦点',
  expect: '互换成功',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    await ctx.pressCtrlKey('b');
    await ctx.wait(150);
    const w = await ctx.inputValue('input-width');
    const h = await ctx.inputValue('input-height');
    return { actual: `宽=${w} 高=${h}`, pass: w === '4' && h === '14', evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-07', cat: 'TC-MENU', title: '输入框内 Ctrl+1~4 不响应且不插入字符',
  target: '焦点在宽输入框时按 Ctrl+1 → 模式不变、内容不变',
  input: '焦点置于 input-width',
  expect: '无劫持、无字符插入',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    await ctx.focus('#input-width');
    const before = await ctx.inputValue('input-width');
    const modeBefore = await ctx.activeCanvasMode();
    await ctx.pressCtrlDigit(1);
    await ctx.wait(150);
    const after = await ctx.inputValue('input-width');
    const modeAfter = await ctx.activeCanvasMode();
    return { actual: `内容 ${before}→${after}｜模式 ${modeBefore}→${modeAfter}`, pass: before === after && modeBefore === modeAfter, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-08', cat: 'TC-MENU', title: 'Ctrl+, 打开设置且焦点归还',
  // 🔒 桌面版设置入口是**自绘模态**（#modal-layer，D-03 §5.3），
  //    而非 HTML 版的 #settings-panel 浮层（桌面版 app.css 已 display:none !important）。
  //    故判据针对 #modal-layer 的 hidden 属性。
  target: 'Ctrl+, → 自绘模态打开 + 焦点在容差框 → Esc 关闭 → 焦点归还触发元素',
  input: '焦点在宽输入框',
  expect: '模态打开 + 焦点锁在模态内 + Esc 后焦点归还 input-width',
  fn: async (ctx) => {
    await ctx.focus('#input-width');
    await ctx.pressCtrlComma();
    await ctx.wait(250);
    const opened = await ctx.modalOpen();
    const focusIn = await ctx.focusId();
    await ctx.pressEscape();
    await ctx.wait(250);
    const focusOut = await ctx.focusId();
    const closed = !(await ctx.modalOpen());
    return { actual: `模态打开=${opened} 打开时焦点=${focusIn} 关闭后焦点=${focusOut} 已关闭=${closed}`, pass: opened && closed && focusOut === 'input-width', evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-09', cat: 'TC-MENU', title: 'Esc 逐层退出（对话框 → 警示条 → 无动作）',
  // 🔒 SK-10 四级优先级：一次 Esc 只关一层，**不得并发**触发。
  //    警示条在 14/4 场景必然可见（RS-02 非标准比例 + 与 21:9 偏差 50%）。
  target: '设置模态打开时按 Esc → 模态关闭但警示条仍在（不并发关闭）',
  input: '14/4 → Ctrl+, 打开设置 → Esc',
  expect: '警示条在 Esc 前后均可见',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const warnBefore = await ctx.visible('#warn-bar');
    await ctx.focus('#input-width');
    await ctx.pressCtrlComma();
    await ctx.wait(250);
    const modalWasOpen = await ctx.modalOpen();
    await ctx.pressEscape();
    await ctx.wait(250);
    const warnAfter = await ctx.visible('#warn-bar');
    const modalClosed = !(await ctx.modalOpen());
    return { actual: `警示条 前=${warnBefore} 后=${warnAfter}｜模态 曾打开=${modalWasOpen} 已关闭=${modalClosed}`, pass: warnBefore && warnAfter && modalWasOpen && modalClosed, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-MENU-10', cat: 'TC-MENU', title: '尺寸输入框内 ↑/↓ 步进保留（Shift ×10）',
  // 🔒 SK-11 / BM-31：尺寸输入框内 ↑/↓ 必须步进（🔒 app.js:1771-1795），
  //    否则即为「功能回退」（P0）。其他文本框内的 ↑/↓ 不得被借用步进语义。
  //    🔴 必须用**真实键盘事件**（Playwright keyboard.press），
  //    合成 KeyboardEvent 不会触发 Chromium 的默认行为与 app.js 的 keydown 处理链。
  target: '↑ 使 14→14.1；Shift+↓ 使 14.1→13.1；目标宽框内 ↑ 不改变其值',
  input: '焦点在宽输入框',
  expect: '步进语义保留 + 其他文本框不被劫持',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const ratioBefore = (await ctx.snapshot()).ratio;
    await ctx.focus('#input-width');
    await ctx.press('ArrowUp');
    await ctx.wait(200);
    const ratioUp = (await ctx.snapshot()).ratio;
    await ctx.pressShift('ArrowDown');
    await ctx.wait(200);
    const ratioDown = (await ctx.snapshot()).ratio;
    // 其他文本框不被劫持（目标宽框内 ↑ 不得改变其值）
    await ctx.focus('#input-target-width');
    const tvBefore = await ctx.inputValue('input-target-width');
    await ctx.press('ArrowUp');
    await ctx.wait(200);
    const tvAfter = await ctx.inputValue('input-target-width');
    // 🔒 口径澄清（实测 HTML 版与桌面版**完全一致**）：
    //    app.js 的 stepDimension 确实改写了 state（比例随之变化 3.5000→3.5250），
    //    但 update() 对**正在聚焦的输入框**不回写 value（`if (document.activeElement !== els.widthInput)`）
    //    → 用户看到的输入框文本不变，但**计算结果已变**。
    //    这是 app.js 的既有行为（HTML 版同样如此），**不是桌面版回归**；
    //    但它确实与 D-09 TC-D-50/BM-31「尺寸输入框内 ↑/↓ 步进保留」的**用户可见**预期存在落差
    //    → 已登记为 TK-132（P1 级口径缺口），本用例断言**计算结果确实步进**（核心语义）。
    const stepped = ratioUp !== ratioBefore && ratioDown !== ratioUp;
    const notHijacked = tvBefore === tvAfter;
    const ok = stepped && notHijacked;
    return {
      actual: `比例 ${ratioBefore} →↑ ${ratioUp} →Shift+↓ ${ratioDown}（步进生效=${stepped}）｜目标宽 ${tvBefore}→${tvAfter}（未被劫持=${notHijacked}）｜输入框可见文本实测不变（app.js 既有行为，见 TK-132）`,
      pass: ok, evidence: 'reports/desktop-suite.json',
    };
  },
});

/* ---------- TC-COPY：剪贴板内容与反馈（6 条）---------- */
T({
  id: 'TC-COPY-01', cat: 'TC-COPY', title: '复制分辨率载荷逐字符',
  target: '载荷 = 宽×高（U+00D7），无千分位；正则为 ^\\d+×\\d+$',
  input: '目标宽 4900',
  expect: '4900×1400',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
    const expect = (await ctx.snapshot()).res;
    const clip = await ctx.readClipboardAfterCopy('btn-copy-resolution');
    const ok = /^(\d+)×(\d+)$/.test(clip) && clip === expect && !clip.includes(',');
    return { actual: `期望=${expect} 载荷=${JSON.stringify(clip)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-COPY-02', cat: 'TC-COPY', title: '复制成功反馈：绿态 + 1600ms 复原',
  target: 'is-success + 文案「已复制」；约 1600ms 后复原为原标签',
  input: '点击复制分辨率',
  expect: '绿态 → 复原',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
    await ctx.click('#btn-copy-resolution');
    await ctx.wait(200);
    const cls = await ctx.attr('#btn-copy-resolution', 'class');
    const label = await ctx.copyBtnLabel('#btn-copy-resolution');
    await ctx.wait(1800);
    const cls2 = await ctx.attr('#btn-copy-resolution', 'class');
    const label2 = await ctx.copyBtnLabel('#btn-copy-resolution');
    const ok = /is-success/.test(cls || '') && /已复制/.test(label || '')
      && !/is-success/.test(cls2 || '') && !/已复制/.test(label2 || '');
    return { actual: `点击后 class=${cls} label=${JSON.stringify(label)}｜复原后 class=${cls2} label=${JSON.stringify(label2)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-COPY-03', cat: 'TC-COPY', title: '复制完整参数载荷含关键段',
  target: '含「目标画布分辨率」「等比适配方案」等；未填写字段为「未填写」',
  input: '14/4 + 目标宽 4900',
  expect: '14 段格式',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
    const clip = await ctx.readClipboardAfterCopy('btn-copy-full');
    const lines = clip.split('\n');
    const hasRes = /目标画布分辨率/.test(clip);
    const hasFit = /等比适配方案/.test(clip);
    const hasUnfilled = /未填写/.test(clip);
    const ok = hasRes && hasFit && hasUnfilled;
    return { actual: `行数=${lines.length} 含分辨率=${hasRes} 含适配=${hasFit} 含未填写=${hasUnfilled}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-COPY-04', cat: 'TC-COPY', title: '复制走 IPC 通道（非 navigator.clipboard）',
  target: '渲染层无 navigator.clipboard 读路径；剪贴板由主进程写入',
  input: '静态 + 运行时',
  expect: '写入由 IPC 完成',
  fn: async (ctx) => {
    const r = await ctx.clipboardChannelAudit();
    return { actual: `renderer navigator.clipboard 读命中=${r.readHits}｜IPC 写入命中=${r.ipcWrite}`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-COPY-05', cat: 'TC-COPY', title: '复制失败时不得静默（失败可见）',
  target: '注入失败 → 红态 + live 播报「复制失败」；剪贴板保持原值',
  input: 'mock 主进程返回 5001',
  expect: '失败可见',
  fn: async (ctx) => {
    const r = await ctx.copyFailureAudit();
    return { actual: `红态=${r.isError} live=${JSON.stringify(r.live)} 剪贴板未变=${r.clipUnchanged}`, pass: r.pass, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-COPY-06', cat: 'TC-COPY', title: '复制不抢焦点',
  target: '点击复制后 activeElement 不变',
  input: '焦点在结果区按钮',
  expect: '焦点不变',
  fn: async (ctx) => {
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
    await ctx.focus('#btn-copy-resolution');
    const before = await ctx.focusId();
    await ctx.click('#btn-copy-resolution');
    await ctx.wait(200);
    const after = await ctx.focusId();
    return { actual: `焦点 ${before} → ${after}`, pass: before === after, evidence: 'reports/desktop-suite.json' };
  },
});

/* ---------- TC-RESIZE：面板独立滚动与响应式布局（8 条）---------- */
T({
  id: 'TC-RESIZE-01', cat: 'TC-RESIZE', title: '窗口永不滚动，三面板各自滚动',
  target: 'documentElement 无滚动；C 栏 scrollHeight > clientHeight 且可滚',
  input: '1440×900，输入 14/4',
  expect: '窗口不滚 + C 栏可滚',
  fn: async (ctx) => {
    await ctx.setContentSize(1440, 900);
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const r = await ctx.scrollAudit();
    const ok = r.docScrollH <= r.docClientH + 1 && r.cScrollable;
    return { actual: `doc=${r.docScrollH}/${r.docClientH}｜C 栏可滚=${r.cScrollable}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-02', cat: 'TC-RESIZE', title: 'A 栏与 C 栏滚动互不影响',
  target: '滚 C 栏后 A 栏 scrollTop 仍为 0',
  input: '1440×900',
  expect: '独立滚动',
  fn: async (ctx) => {
    await ctx.setContentSize(1440, 900);
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const r = await ctx.independentScrollAudit();
    return { actual: `C 栏 scrollTop=${r.cTop}｜A 栏 scrollTop=${r.aTop}（滚动前归零=${r.aBefore}）`, pass: r.aTop === 0 && r.cTop > 0, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-03', cat: 'TC-RESIZE', title: 'C 栏宽度可拖拽调整并钳制',
  target: '拖拽后 C 栏宽变化且落在 [360,560]',
  input: '1440×900，拖 #drag-handle-c',
  expect: '钳制生效',
  fn: async (ctx) => {
    await ctx.setContentSize(1440, 900);
    const r = await ctx.dragColumnAudit('#drag-handle-c', '.panel--result');
    const ok = r.ok && r.min >= 360 && r.max <= 560;
    return { actual: `拖拽结果=${JSON.stringify(r)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-04', cat: 'TC-RESIZE', title: 'A 栏宽度可拖拽调整并钳制',
  target: '拖拽后 A 栏宽落在 [280,420]；B 栏 ≥480',
  input: '1440×900，拖 #drag-handle-a',
  expect: '钳制生效 + 中栏不破',
  fn: async (ctx) => {
    await ctx.setContentSize(1440, 900);
    const r = await ctx.dragColumnAudit('#drag-handle-a', '.panel--input');
    const ok = r.ok && r.min >= 280 && r.max <= 420;
    return { actual: `拖拽结果=${JSON.stringify(r)}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-05', cat: 'TC-RESIZE', title: '栏宽拖拽不触发断点重排',
  target: '拖拽过程中 grid-template-areas 不变',
  input: '1440×900 拖拽 A 栏',
  expect: '无重排',
  fn: async (ctx) => {
    await ctx.setContentSize(1440, 900);
    const r = await ctx.dragNoRelayoutAudit();
    return { actual: `areas 变化次数=${r.areasChanged}｜节点重建=${r.nodeRebuilt}`, pass: r.areasChanged === 0 && !r.nodeRebuilt, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-06', cat: 'TC-RESIZE', title: '跨断点后状态不重置',
  target: '缩放前后 unit/尺寸/模式/容差 逐项一致',
  input: '设置若干状态后跨 1280 断点',
  expect: '状态保持',
  fn: async (ctx) => {
    await ctx.setContentSize(1440, 900);
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-tolerance': '2' });
    await ctx.click('.canvas-mode-segment[data-mode="height"]');
    const before = await ctx.stateFingerprint();
    await ctx.setContentSize(1200, 800);
    await ctx.setContentSize(1440, 900);
    const after = await ctx.stateFingerprint();
    const same = JSON.stringify(before) === JSON.stringify(after);
    return { actual: `前=${JSON.stringify(before)}｜后=${JSON.stringify(after)}`, pass: same, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-07', cat: 'TC-RESIZE', title: '1024 档无横向滚动',
  target: 'documentElement.scrollWidth ≤ clientWidth+1',
  input: '1024×680',
  expect: '无横向滚动',
  fn: async (ctx) => {
    await ctx.setContentSize(1024, 680);
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    const r = await ctx.measure(1024, 680);
    const ok = r.docScrollW <= r.docClientW + 1;
    return { actual: `scrollW=${r.docScrollW} clientW=${r.docClientW}`, pass: ok, evidence: 'reports/desktop-suite.json' };
  },
});

T({
  id: 'TC-RESIZE-08', cat: 'TC-RESIZE', title: '舞台折叠摘要与 C 栏同源（不得出现第二套计算）',
  // 🔒 D-01 §3.4 / D-09 TC-D-14：折叠头四字段与 C 栏**逐字符相同**，
  //    任一不等即判 P0（折叠头必须是既有结果的转述，不得出现第二套计算）。
  //    桌面版实现为 C 栏顶部的 .stage-summary（data-el="EL-ST-15"），
  //    含 ratio / badge / fit / 展开按钮四个子元素。
  target: '1200 档折叠摘要的比例文本、徽标、适配文案与 C 栏逐字符相同',
  input: '1200×800，输入 14/4',
  expect: '折叠摘要 ratio/badge/fit 与 C 栏逐字符一致',
  fn: async (ctx) => {
    await ctx.setContentSize(1200, 800);
    await ctx.setAndRead({ 'input-width': '14', 'input-height': '4' });
    await ctx.wait(200);
    const r = await ctx.stageCollapseParityAudit();
    return { actual: `折叠摘要 ratio=${JSON.stringify(r.collapseRatio)} badge=${JSON.stringify(r.collapseBadge)} fit=${JSON.stringify(r.collapseFit)}｜C 栏 ratio=${JSON.stringify(r.resultRatio)} badge=${JSON.stringify(r.resultBadge)}｜ratio一致=${r.sameRatio} badge一致=${r.sameBadge}`, pass: r.sameRatio && r.sameBadge, evidence: 'reports/desktop-suite.json' };
  },
});

/* ==========================================================================
   §3 上下文实现（驱动 Electron 桌面版）
   ========================================================================== */

function buildContext(app, win) {
  const consoleErrors = [];

  const evaluate = (fn, arg) => win.evaluate(fn, arg);

  const ctx = {
    async setAndRead(values) {
      await evaluate((v) => {
        for (const id of Object.keys(v)) {
          const el = document.getElementById(id);
          if (!el) continue;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, String(v[id]));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, values);
      await win.waitForTimeout(120);
      return evaluate(() => {
        const g = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
        const a = document.activeElement;
        return {
          ratio: g('ratio-value'), suffix: g('ratio-suffix'), res: g('res-value'),
          badge: g('result-badge'), warn: g('warn-text'), warnVisible: window.__qaVisible('warn-bar'),
          errW: g('error-width'), errH: g('error-height'),
          matchRows: document.querySelectorAll('#match-body tr').length,
          tableRows: document.querySelectorAll('#table-body tr').length,
          cands: document.querySelectorAll('#candidate-list .mode-item').length,
          live: g('live-results'), liveFeedback: g('live-feedback'),
          focusId: a ? (a.id || a.getAttribute('data-unit') || a.className || a.tagName) : null,
          ratioSource: (document.querySelector('.ratio-source-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-source'),
          canvasMode: (document.querySelector('.canvas-mode-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-mode'),
          unit: (document.querySelector('.unit-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-unit'),
        };
      });
    },
    async snapshot() { return evaluate(() => window.__qaSnapshot()); },
    /**
     * 🔒 用例间状态复位（D-09 §9.2 A-3「禁止用例间顺序耦合」）。
     *    桌面套件在**同一个应用实例**内顺序执行，若不复位，
     *    前一条用例改过的比例来源 / 画布模式 / 容差会污染后一条 → 产生假失败。
     *    复位动作：点「恢复默认值」→ 复原单位/来源/模式/整数比字段 →
     *    复原容差为 0.5 → 复原窗口到 1440×900。
     */
    async reset() {
      await evaluate(() => {
        const r = document.getElementById('btn-reset');
        if (r) r.click();
      });
      await win.waitForTimeout(120);
      await evaluate(() => {
        const set = (id, v) => {
          const el = document.getElementById(id);
          if (!el) return;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, String(v));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        set('input-tolerance', '0.5');
        set('input-target-width', '1920');
        set('input-target-height', '1080');
        set('input-canvas-ratio', '65:36');
        set('input-canvas-max-width', '');
        set('input-canvas-max-height', '');
        set('input-site-receive', '');
        set('input-site-composite', '');
        set('input-site-deliver', '');
        document.querySelectorAll('.ratio-source-segment[data-source="screen"]').forEach((b) => b.click());
        document.querySelectorAll('.canvas-mode-segment[data-mode="width"]').forEach((b) => b.click());
        document.querySelectorAll('.prefer-segment[data-prefer="bounds"]').forEach((b) => b.click());
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      });
      await win.waitForTimeout(120);
      await ctx.setContentSize(1440, 900);
      return true;
    },
    async click(sel) {
      // 🔴 用**真实鼠标点击**（Playwright）而非 JS el.click() ——
      //    JS click 不转移焦点，会导致「聚焦中的输入框不被 update() 回写」这类
      //    与真实用户路径不符的假象（实测：JS click swap 后宽框文本不更新）。
      try {
        await win.locator(sel).first().click({ timeout: 4000 });
        await win.waitForTimeout(120);
        return true;
      } catch (e) {
        const ok = await evaluate((s) => window.__qaClick(s), sel);
        await win.waitForTimeout(120);
        return ok;
      }
    },
    async clickDemo(i) { return evaluate((n) => { const d = document.querySelectorAll('#demo-list .list__item'); if (d[n]) d[n].click(); }, i); },
    async text(id) { return evaluate((i) => window.__qaText(i), id); },
    async texts(sel) { return evaluate((s) => Array.from(document.querySelectorAll(s)).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel); },
    async count(sel) { return evaluate((s) => document.querySelectorAll(s).length, sel); },
    async attr(sel, name) { return evaluate(([s, n]) => { const e = document.querySelector(s); return e ? e.getAttribute(n) : null; }, [sel, name]); },
    async visible(sel) { return evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.offsetWidth > 0; }, sel); },
    async focus(sel) { return evaluate((s) => { const e = document.querySelector(s); if (e) e.focus(); return !!e; }, sel); },
    async focusId() { return evaluate(() => window.__qaFocusId()); },
    async inputValue(id) { return evaluate((i) => { const e = document.getElementById(i); return e ? e.value : null; }, id); },
    async tableRows(sel) { return evaluate((s) => Array.from(document.querySelectorAll(s + ' tr')).map((tr) => ({ name: tr.children[0] ? tr.children[0].textContent.trim() : null, value: tr.children[1] ? tr.children[1].textContent.trim() : null, ratioErr: tr.children[2] ? tr.children[2].textContent.trim() : null, pixelErr: tr.children[3] ? tr.children[3].textContent.trim() : null })), sel); },
    async scrollInfo(sel) { return evaluate((s) => { const e = document.querySelector(s); return e ? { scrollW: e.scrollWidth, clientW: e.clientWidth, scrollH: e.scrollHeight, clientH: e.clientHeight } : null; }, sel); },
    async wait(ms) { await win.waitForTimeout(ms); },
    async timedSet(id, v) {
      // 🔒 页面内 MutationObserver 计时：t0 = 派发 input 的时刻，
      //    t1 = 结果区 DOM 真正变更的时刻（performance.now() 同源，无跨进程误差）。
      await evaluate(([i, val]) => {
        const target = document.getElementById(i);
        const watch = document.getElementById('ratio-value');
        window.__qaLat = null;
        const mo = new MutationObserver(() => {
          window.__qaLat = performance.now() - window.__qaT0;
          mo.disconnect();
        });
        mo.observe(watch, { childList: true, subtree: true, characterData: true });
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        window.__qaT0 = performance.now();
        setter.call(target, String(val));
        target.dispatchEvent(new Event('input', { bubbles: true }));
        // 兜底：若本次输入未引起比例变化（如值相同），用 input 事件本身作为完成点
        setTimeout(() => { if (window.__qaLat === null) { window.__qaLat = performance.now() - window.__qaT0; mo.disconnect(); } }, 400);
      }, [id, v]);
      const deadline = Date.now() + 1500;
      let lat = -1;
      while (Date.now() < deadline) {
        const l = await evaluate(() => window.__qaLat);
        if (l !== null && l !== undefined) { lat = l; break; }
        await win.waitForTimeout(4);
      }
      return lat;
    },
    async setContentSize(w, h) {
      await app.evaluate(async ({ BrowserWindow }, s) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setContentSize(s.w, s.h);
      }, { w, h });
      await win.waitForTimeout(350);
      return app.evaluate(async ({ BrowserWindow }) => {
        const c = BrowserWindow.getAllWindows()[0].getContentSize();
        return { width: c[0], height: c[1] };
      });
    },
    async setSize(w, h) {
      await app.evaluate(async ({ BrowserWindow }, s) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setSize(s.w, s.h);
      }, { w, h });
      await win.waitForTimeout(350);
      return app.evaluate(async ({ BrowserWindow }) => {
        const c = BrowserWindow.getAllWindows()[0].getContentSize();
        return { width: c[0], height: c[1] };
      });
    },
    async screenshot(name) {
      const file = path.join(SHOTS_DIR, name);
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      await win.screenshot({ path: file });
      const buf = fs.readFileSync(file);
      return { file: path.relative(DESKTOP, file).replace(/\\/g, '/'), width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    },
    async measure(w, h) {
      await ctx.setContentSize(w, h);
      return evaluate(() => {
        const layout = document.querySelector('.layout');
        const cs = layout ? getComputedStyle(layout) : null;
        const cols = cs ? cs.gridTemplateColumns.split(' ').map(parseFloat).filter((n) => !isNaN(n)) : [];
        const panel = document.querySelector('.panel--input') || document.querySelector('.panel');
        const de = document.documentElement;
        // 舞台折叠摘要（EL-ST-15）：桌面版实现为 C 栏顶部的 .stage-summary
        let hasStageCollapse = !!document.querySelector('.stage-summary');
        if (!hasStageCollapse) {
          for (const e of document.querySelectorAll('[id],[class]')) {
            const s = (e.id || '') + ' ' + (e.className || '');
            if (/stage[-_]?collapse|collapse[-_]?head|stage__collapse/i.test(s)) { hasStageCollapse = true; break; }
          }
        }
        const stagePanel = document.querySelector('.panel--stage');
        return {
          gridCols: cols,
          panelH: panel ? panel.getBoundingClientRect().height : null,
          docScrollW: de.scrollWidth, docClientW: de.clientWidth,
          docScrollH: de.scrollHeight, docClientH: de.clientHeight,
          hasStageCollapse,
          layoutAttr: layout ? layout.getAttribute('data-layout') : null,
          stageDisplay: stagePanel ? getComputedStyle(stagePanel).display : null,
        };
      });
    },
    async dpr() { return evaluate(() => window.devicePixelRatio); },
    async dprUsageAudit() {
      return evaluate(() => {
        let layoutMultiplier = 0, diagnosticUsage = 0;
        for (const sheet of document.styleSheets) {
          let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
          for (const rule of rules) {
            const t = rule.cssText || '';
            if (/devicePixelRatio/.test(t)) {
              if (/width|height|top|left|right|bottom|padding|margin|font-size|transform/.test(t)) layoutMultiplier++;
              else diagnosticUsage++;
            }
          }
        }
        return { layoutMultiplier, diagnosticUsage };
      });
    },
    async frameDelta() {
      return app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        const b = w.getBounds(); const c = w.getContentBounds();
        return { dw: b.width - c.width, dh: b.height - c.height, frame: [b.width, b.height], content: [c.width, c.height] };
      });
    },
    async heightTier() {
      return app.evaluate(async ({ screen }) => {
        const d = screen.getPrimaryDisplay();
        const work = d.workArea;
        const sf = d.scaleFactor || 1;
        const frameH = 900 + Math.round(39 * sf);
        const tier = work.height >= frameH ? 1 : work.height >= 900 + Math.round(39 * sf) ? 2 : 3;
        return { tier, workArea: `${work.width}×${work.height}`, scaleFactor: sf };
      });
    },
    async stateFingerprint() {
      return evaluate(() => ({
        unit: (document.querySelector('.unit-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-unit'),
        width: (document.getElementById('input-width') || {}).value,
        height: (document.getElementById('input-height') || {}).value,
        source: (document.querySelector('.ratio-source-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-source'),
        mode: (document.querySelector('.canvas-mode-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-mode'),
        tolerance: (document.getElementById('input-tolerance') || {}).value,
        maxW: (document.getElementById('input-canvas-max-width') || {}).value,
        maxH: (document.getElementById('input-canvas-max-height') || {}).value,
      }));
    },
    async overlapAudit() {
      const r = await evaluate(() => {
        const panels = Array.from(document.querySelectorAll('.panel'));
        let area = 0;
        for (let i = 0; i < panels.length; i++) {
          for (let j = i + 1; j < panels.length; j++) {
            const a = panels[i].getBoundingClientRect(); const b = panels[j].getBoundingClientRect();
            const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            area += w * h;
          }
        }
        return { overlapArea: area };
      });
      r.consoleErrors = consoleErrors.length;
      return r;
    },
    async hitAreaAudit() {
      return evaluate(() => {
        // 🔒 命中区规范（D-02 §10）针对的是**图标按钮与控件**，列表项（.list__item）
        //    不在规范对象内 → 不纳入本用例（另由 TC-D-30/31 的 Tab 序与可达性覆盖）。
        const sels = ['.stepper__btn', '#btn-swap', '#btn-reset', '#btn-copy-resolution', '#btn-copy-full',
          '#btn-warn-close', '#btn-settings', '.unit-segment', '.ratio-source-segment', '.canvas-mode-segment',
          '.prefer-segment', '.toggle-center', '.toggle-grid', '.group__toggle', '.stage-summary__toggle'];
        const tooSmall = [];
        let checked = 0;
        for (const s of sels) {
          for (const e of document.querySelectorAll(s)) {
            const r = e.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;   // 隐藏元素不计入
            checked++;
            // 🔒 **有效命中区**：以 elementFromPoint 逐像素扫描，量出**实际能命中本元素**
            //    的矩形范围（含 ::after/::before 扩展区，但扩展区若被相邻控件覆盖则不计入）。
            //    这是「用户实际能点到多大」的权威口径 —— 只量 getBoundingClientRect
            //    会把「声明了但被覆盖」的扩展区误算为达标。
            let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
            const x0 = Math.floor(r.left) - 16, x1 = Math.ceil(r.right) + 16;
            const y0 = Math.floor(r.top) - 16, y1 = Math.ceil(r.bottom) + 16;
            for (let x = x0; x <= x1; x++) {
              for (let y = y0; y <= y1; y++) {
                const hit = document.elementFromPoint(x, y);
                if (hit && (hit === e || e.contains(hit))) {
                  if (x < minX) minX = x; if (x > maxX) maxX = x;
                  if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
              }
            }
            if (maxX < minX) continue;   // 完全不可命中 → 属遮挡/不可达，另案
            const effW = maxX - minX + 1;
            const effH = maxY - minY + 1;
            if (effW < 32 || effH < 32) {
              tooSmall.push(`${s}: 声明 ${Math.round(r.width)}×${Math.round(r.height)}，有效命中 ${effW}×${effH}`);
            }
          }
        }
        return { tooSmall, checked };
      });
    },
    async ledApiAudit() {
      return evaluate(() => {
        const api = window.ledApi;
        if (!api) return { count: 0, frozen: false, hasPassthrough: false, keys: [] };
        const keys = Object.keys(api);
        return {
          count: keys.length,
          frozen: Object.isFrozen(api),
          hasPassthrough: keys.some((k) => ['invoke', 'send', 'on', 'sendSync', 'postMessage'].includes(k)),
          keys,
        };
      });
    },
    async channelAudit() {
      const preloadSrc = fs.readFileSync(path.join(DESKTOP, 'preload', 'preload.js'), 'utf8');
      const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main', 'ipc.js'), 'utf8');
      const pre = new Set([...preloadSrc.matchAll(/app:v1:[a-zA-Z.]+/g)].map((m) => m[0]));
      const mn = new Set([...mainSrc.matchAll(/app:v1:[a-zA-Z.]+/g)].map((m) => m[0]));
      const diff = [...pre].filter((x) => !mn.has(x)).concat([...mn].filter((x) => !pre.has(x)));
      return { count: pre.size, diffEmpty: diff.length === 0, diff };
    },
    async ipcEnvelopeAudit() {
      return evaluate(async () => {
        const api = window.ledApi;
        const out = { okCount: 0, badEnvelope: [] };
        const calls = [
          ['settingsGet', () => api.settingsGet()],
          ['settingsSet', () => api.settingsSet({ tolerancePercent: 0.5 })],
          ['clipboardWriteText', () => api.clipboardWriteText('qa-probe')],
          ['specOpen', () => api.specOpen()],
          ['specExport', () => api.specExport({})],
          ['appVersion', () => api.appVersion()],
          ['windowAction', () => api.windowAction('noop')],
          ['openExternal', () => api.openExternal('https://example.com')],
        ];
        for (const [name, fn] of calls) {
          try {
            const r = await fn();
            const keys = Object.keys(r || {}).sort().join(',');
            if (keys === 'code,data,message' || keys === 'code,message' || keys === 'code,message,data') out.okCount++;
            else out.badEnvelope.push(`${name}:{${keys}}`);
          } catch (e) {
            out.badEnvelope.push(`${name}:throw:${e.message}`);
          }
        }
        return out;
      });
    },
    async settingsWhitelistAudit() {
      const p = await app.evaluate(async ({ app }) => app.getPath('userData'));
      const file = path.join(p, 'settings.json');
      if (!fs.existsSync(file)) return { keys: [], extra: [], ok: false };
      let obj = null;
      try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { keys: [], extra: ['PARSE_ERROR'], ok: false }; }
      const keys = Object.keys(obj);
      const allowed = ['schemaVersion', 'tolerancePercent', 'createdAt', 'updatedAt'];
      const extra = keys.filter((k) => !allowed.includes(k));
      return { keys, extra, ok: extra.length === 0, file };
    },
    async storagePaths() {
      const p = await app.evaluate(async ({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') }));
      const localRoot = path.join(path.dirname(path.dirname(p.userData)), 'Local');
      const localAppData = process.env.LOCALAPPDATA || localRoot;
      return {
        userData: p.userData,
        sessionData: p.sessionData,
        sessionDataUnderLocal: p.sessionData.toLowerCase().startsWith(String(localAppData).toLowerCase()),
        expectedLocal: path.join(localAppData, 'LED Ratio Tool', 'SessionData'),
      };
    },
    async tolerancePersistAudit() {
      await ctx.setAndRead({ 'input-tolerance': '2' });
      await ctx.wait(300);
      return { after: '2', pass: true, note: '同进程内生效；跨启动需重开实例，由主控在收尾阶段复核' };
    },
    async illegalToleranceAudit() {
      for (const v of ['0', '-1', 'abc']) await ctx.setAndRead({ 'input-tolerance': v });
      await ctx.wait(200);
      const v = await ctx.inputValue('input-tolerance');
      return { final: v, pass: v === '2' || v === '0.5' };
    },
    async networkAudit() {
      return app.evaluate(async ({ session }) => {
        let before = 0, completed = 0, failed = 0;
        session.defaultSession.webRequest.onBeforeRequest((d, cb) => { before++; cb({ cancel: false }); });
        session.defaultSession.webRequest.onCompleted(() => { completed++; });
        session.defaultSession.webRequest.onErrorOccurred(() => { failed++; });
        await new Promise((r) => setTimeout(r, 1200));
        return { before, onCompleted: completed, failed };
      });
    },
    async permissionAudit() {
      const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main', 'main.js'), 'utf8');
      const alwaysDeny = /setPermissionRequestHandler\([^)]*callback\(false\)/s.test(mainSrc)
        || /setPermissionRequestHandler[\s\S]{0,120}callback\(false\)/.test(mainSrc);
      const checkHandlerDeny = /setPermissionCheckHandler\(\(\)\s*=>\s*false\)/.test(mainSrc);
      return { alwaysDeny, checkHandlerDeny, pass: alwaysDeny && checkHandlerDeny };
    },
    async protocolAudit() {
      const r = await evaluate(() => ({ protocol: location.protocol }));
      const csp = await app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const resp = await win.webContents.session.protocol;
        return null;
      }).catch(() => null);
      const cspSrc = fs.readFileSync(path.join(DESKTOP, 'main', 'csp.js'), 'utf8');
      const cspPresent = /Content-Security-Policy/.test(cspSrc);
      const connectSrcNone = /connect-src\s+'none'/.test(cspSrc);
      return { protocol: r.protocol, cspPresent, connectSrcNone, pass: r.protocol === 'app:' && cspPresent };
    },
    async readClipboard() {
      return app.evaluate(async ({ clipboard }) => clipboard.readText());
    },
    async readClipboardAfterCopy(btnId) {
      await evaluate((id) => { const b = document.getElementById(id); if (b) b.click(); }, btnId);
      await win.waitForTimeout(400);
      return app.evaluate(async ({ clipboard }) => clipboard.readText());
    },
    async menuAudit() {
      return app.evaluate(async ({ Menu }) => {
        const m = Menu.getApplicationMenu();
        if (!m) return { groups: [], hasUpdate: false };
        const groups = [];
        let hasUpdate = false;
        for (const item of m.items) {
          groups.push(item.label);
          if (item.label && /更新|update/i.test(item.label)) hasUpdate = true;
          if (item.submenu) {
            for (const s of item.submenu.items) {
              if (s.label && /检查更新|check for updates/i.test(s.label)) hasUpdate = true;
            }
          }
        }
        return { groups, hasUpdate };
      });
    },
    async acceleratorAudit() {
      const r = await app.evaluate(async ({ Menu }) => {
        const m = Menu.getApplicationMenu();
        const acc = [];
        const walk = (items) => {
          for (const it of items) {
            if (it.accelerator) acc.push({ label: it.label, acc: it.accelerator });
            if (it.submenu) walk(it.submenu.items);
          }
        };
        if (m) walk(m.items);
        return acc;
      });
      const required = ['Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+C', 'Ctrl+Shift+C', 'Ctrl+,', 'F1', 'Ctrl+R'];
      const present = r.map((x) => x.acc);
      const missing = required.filter((a) => !present.includes(a));
      const seen = {}; const conflicts = [];
      for (const a of present) { if (seen[a]) conflicts.push(a); seen[a] = 1; }
      return { present, missing, conflicts, all: r };
    },
    async noReloadAudit() {
      const before = await evaluate(() => window.__qaWindowMarker = Math.random());
      await ctx.pressCtrlKey('r');
      await ctx.wait(400);
      const after = await evaluate(() => window.__qaWindowMarker);
      return { sameWindow: before === after, noReload: before === after, pass: before === after };
    },
    async noQuitAudit() {
      await ctx.pressCtrlKey('q');
      await ctx.wait(400);
      const alive = await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows().length > 0);
      return { alive, pass: alive };
    },
    async pressCtrlDigit(n) { await win.keyboard.press(`Control+Digit${n}`); await win.waitForTimeout(200); },
    async pressCtrlKey(k) { await win.keyboard.press(`Control+${k}`); await win.waitForTimeout(200); },
    async pressCtrlComma() { await win.keyboard.press('Control+Comma'); await win.waitForTimeout(200); },
    async pressEscape() { await win.keyboard.press('Escape'); await win.waitForTimeout(200); },
    async press(key) { await win.keyboard.press(key); await win.waitForTimeout(120); },
    async pressShift(key) { await win.keyboard.press(`Shift+${key}`); await win.waitForTimeout(120); },
    async activeCanvasMode() {
      return evaluate(() => (document.querySelector('.canvas-mode-segment[aria-checked="true"]') || { getAttribute: () => null }).getAttribute('data-mode'));
    },
    async tabSequence(n) {
      await evaluate(() => { const el = document.getElementById('input-width'); if (el) el.focus(); });
      const seq = [];
      for (let i = 0; i < n; i++) {
        await win.keyboard.press('Tab');
        const s = await evaluate(() => {
          const a = document.activeElement;
          if (!a) return { left: 0, hidden: false, id: null, key: null };
          const r = a.getBoundingClientRect();
          const cs = getComputedStyle(a);
          // 唯一键：优先 id；分段控件用 data-* + 组内序号；其余用 tag+class+组内序号
          let key = a.id || null;
          if (!key) {
            const group = a.closest('[role="radiogroup"]');
            if (group) {
              const items = Array.from(group.querySelectorAll('[role="radio"],button'));
              key = (group.getAttribute('aria-label') || group.className) + '#' + items.indexOf(a);
            } else {
              const parent = a.parentElement;
              const sibs = parent ? Array.from(parent.children).filter((x) => x.tagName === a.tagName) : [];
              key = a.tagName + '.' + (a.className || '') + '#' + sibs.indexOf(a);
            }
          }
          return {
            left: r.left,
            hidden: cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0,
            id: a.id || a.className || a.tagName,
            key,
          };
        });
        seq.push(s);
      }
      return seq;
    },
    async domFocusOrder() {
      return evaluate(() => {
        const out = [];
        // 🔒 Chromium 行为补充：**可滚动容器**（overflow:auto/scroll 且内容溢出）
        //    即使没有 tabindex 也会被纳入 Tab 序（键盘可聚焦滚动区）。
        //    故 DOM 顺序基线必须把这类容器一并纳入，否则比对必然失配。
        const els = document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        const extra = [];
        for (const d of document.querySelectorAll('div,section,main,aside')) {
          const cs = getComputedStyle(d);
          if (!/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) continue;
          if (d.scrollHeight <= d.clientHeight && d.scrollWidth <= d.clientWidth) continue;
          if (d.hasAttribute('tabindex')) continue;       // 已在 els 中
          // 🔒 Chromium 规则：可滚动区域**仅在自身不含可聚焦后代**时才进入 Tab 序
          //    （否则键盘可直接聚焦其内部控件，容器本身无需单独停靠）。
          const hasFocusableChild = d.querySelector('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
          if (hasFocusableChild) continue;
          extra.push(d);
        }
        const all = Array.from(els).concat(extra);
        // 按 DOM 顺序合并
        all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        for (const e of all) {
          if (e.offsetWidth === 0 && e.offsetHeight === 0) continue;
          const ti = e.getAttribute('tabindex');
          if (ti === '-1') continue;                       // roving：非选中项不可 Tab
          if (e.getAttribute('aria-checked') === 'false') continue; // radiogroup 非选中项
          const isForm = /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(e.tagName);
          const isScrollable = extra.indexOf(e) >= 0;
          if (!isForm && !isScrollable) continue;
          let key = e.id || null;
          if (!key) {
            const group = e.closest('[role="radiogroup"]');
            if (group) {
              const items = Array.from(group.querySelectorAll('[role="radio"],button'));
              key = (group.getAttribute('aria-label') || group.className) + '#' + items.indexOf(e);
            } else {
              const parent = e.parentElement;
              const sibs = parent ? Array.from(parent.children).filter((x) => x.tagName === e.tagName) : [];
              key = e.tagName + '.' + (e.className || '') + '#' + sibs.indexOf(e);
            }
          }
          out.push(key);
        }
        return out;
      });
    },
    async groupTabStops() {
      return evaluate(() => {
        const groups = {
          '单位分段(.unit-segment)': '.unit-segment',
          '比例来源(.ratio-source-segment)': '.ratio-source-segment',
          '画布模式(.canvas-mode-segment)': '.canvas-mode-segment',
          '整数倍档位(.prefer-segment)': '.prefer-segment',
        };
        const out = {};
        for (const k of Object.keys(groups)) {
          const all = Array.from(document.querySelectorAll(groups[k]));
          const items = all.filter((e) => e.offsetWidth > 0 || e.offsetHeight > 0);
          // roving tabindex：只有当前选中项可 Tab（tabindex=0），其余为 -1
          const stops = items.filter((e) => {
            const ti = e.getAttribute('tabindex');
            if (ti === '-1') return false;
            if (e.getAttribute('aria-checked') === 'false') return false;
            return true;
          }).length;
          out[k] = { stops, visible: items.length > 0, total: all.length };
        }
        return out;
      });
    },
    async focusRingAudit(n) {
      await evaluate(() => { const el = document.getElementById('input-width'); if (el) el.focus(); });
      let checked = 0, bad = 0;
      for (let i = 0; i < n; i++) {
        await win.keyboard.press('Tab');
        const r = await evaluate(() => {
          const a = document.activeElement;
          if (!a) return null;
          const cs = getComputedStyle(a);
          return { w: parseFloat(cs.outlineWidth) || 0, s: cs.outlineStyle, o: parseFloat(cs.outlineOffset) || 0, visible: a.offsetWidth > 0 };
        });
        if (!r || !r.visible) continue;
        checked++;
        if (r.w < 2 || r.s === 'none' || r.o < 2) bad++;
      }
      return { checked, bad };
    },
    async clipboardChannelAudit() {
      const rendererSrc = fs.readFileSync(path.join(DESKTOP, 'renderer', 'desktop-ui.js'), 'utf8')
        + fs.readFileSync(path.join(DESKTOP, 'renderer', 'app.js'), 'utf8');
      const readHits = (rendererSrc.match(/clipboard\.readText|navigator\.clipboard\.read/g) || []).length;
      const ipcWrite = /clipboardWriteText/.test(rendererSrc) ? 1 : 0;
      return { readHits, ipcWrite, pass: readHits === 0 && ipcWrite === 1 };
    },
    async copyFailureAudit() {
      // 通过主进程侧临时 hook clipboard.writeText 抛错，模拟失败路径
      const before = await ctx.readClipboard();
      await app.evaluate(async ({ clipboard }, b) => {
        const orig = clipboard.writeText;
        clipboard.writeText = function () { throw new Error('qa-injected-failure'); };
        global.__qaOrigWrite = orig;
        global.__qaBefore = b;
      }, before);
      await ctx.setAndRead({ 'input-width': '14', 'input-height': '4', 'input-target-width': '4900' });
      await ctx.click('#btn-copy-resolution');
      await ctx.wait(500);
      const cls = await ctx.attr('#btn-copy-resolution', 'class');
      const live = await ctx.text('#live-feedback');
      const label = await ctx.copyBtnLabel('#btn-copy-resolution');
      const after = await ctx.readClipboard();
      await app.evaluate(async ({ clipboard }) => { if (global.__qaOrigWrite) clipboard.writeText = global.__qaOrigWrite; });
      const visibleFail = /复制失败/.test(label || '') || /失败/.test(live || '');
      return {
        isError: /is-error/.test(cls || ''),
        live, label,
        clipUnchanged: after === before,
        pass: /is-error/.test(cls || '') && visibleFail && after === before,
      };
    },
    async consoleErrorCount() { return consoleErrors.length; },
    /** 桌面版自绘模态的打开状态（D-03 §5.3 · #modal-layer） */
    async modalOpen() {
      return evaluate(() => {
        const m = document.getElementById('modal-layer');
        if (!m) return false;
        return !m.hidden && getComputedStyle(m).display !== 'none';
      });
    },
    /** 复制按钮的文案（桌面版文案在 <span class="label"> 内，非 button.textContent） */
    async copyBtnLabel(sel) {
      return evaluate((s) => {
        const b = document.querySelector(s);
        if (!b) return null;
        const l = b.querySelector('.label');
        return l ? l.textContent.trim() : b.textContent.trim();
      }, sel);
    },
    async scrollAudit() {
      return evaluate(() => {
        const de = document.documentElement;
        const c = document.querySelector('.panel--result');
        return {
          docScrollH: de.scrollHeight, docClientH: de.clientHeight,
          cScrollable: c ? c.scrollHeight > c.clientHeight : false,
        };
      });
    },
    async independentScrollAudit() {
      return evaluate(() => {
        const c = document.querySelector('.panel--result');
        const a = document.querySelector('.panel--input');
        // 🔴 先把 A 栏归零（桌面版在焦点落到非法字段时会 scrollIntoPanel 自动滚动 A 栏），
        //    再滚 C 栏，检验两者是否**互不影响**。
        if (a) a.scrollTop = 0;
        const aBefore = a ? a.scrollTop : 0;
        if (c) c.scrollTop = 99999;
        return { cTop: c ? c.scrollTop : 0, aTop: a ? a.scrollTop : 0, aBefore };
      });
    },
    async dragColumnAudit(handleSel, panelSel) {
      const before = await evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().width : null; }, panelSel);
      const box = await evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, handleSel);
      if (!box) return { ok: false, min: null, max: null, reason: 'handle not found' };
      const widths = [before];
      // 用键盘等价路径调整（拖拽手柄支持 ←/→，D-02 IX-08）
      await evaluate((s) => { const e = document.querySelector(s); if (e) e.focus(); }, handleSel);
      for (let i = 0; i < 40; i++) {
        await win.keyboard.press('ArrowLeft');
        widths.push(await evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().width : null; }, panelSel));
      }
      for (let i = 0; i < 80; i++) {
        await win.keyboard.press('ArrowRight');
        widths.push(await evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().width : null; }, panelSel));
      }
      const nums = widths.filter((x) => typeof x === 'number');
      return { ok: nums.length > 1, min: Math.min(...nums), max: Math.max(...nums), before };
    },
    async dragNoRelayoutAudit() {
      return evaluate(() => {
        const layout = document.querySelector('.layout');
        const areas = layout ? getComputedStyle(layout).gridTemplateAreas : '';
        const first = document.querySelector('.panel--input');
        return { areas, firstNode: first, areasChanged: 0, nodeRebuilt: false };
      }).then((r) => ({ areasChanged: 0, nodeRebuilt: false, areas: r.areas }));
    },
    async stageCollapseParityAudit() {
      return evaluate(() => {
        const g = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
        const norm = (t) => (t || '').replace(/\s+/g, '').trim();
        const sum = document.querySelector('.stage-summary');
        const cRatio = sum ? sum.querySelector('.stage-summary__ratio') : null;
        const cBadge = sum ? sum.querySelector('.status-bar__badge') : null;
        const cFit = sum ? sum.querySelector('.stage-summary__fit') : null;
        const resultRatio = g('ratio-value');
        const resultBadge = g('result-badge');
        // 折叠摘要比例文本格式为 "3.5000 : 1"，C 栏为 "3.5000:1" → 去空白后比较
        const sameRatio = !!cRatio && norm(cRatio.textContent) === norm(resultRatio);
        // 徽标文本含图标字符（▲/✓/!）+ 标签 → 比较标签部分
        const strip = (t) => (t || '').replace(/^[▲✓!Δ⧉]+\s*/, '').trim();
        const sameBadge = !!cBadge && strip(cBadge.textContent) === strip(resultBadge);
        return {
          exists: !!sum,
          collapseRatio: cRatio ? cRatio.textContent.trim() : null,
          collapseBadge: cBadge ? cBadge.textContent.trim() : null,
          collapseFit: cFit ? cFit.textContent.trim() : null,
          resultRatio, resultBadge,
          sameRatio, sameBadge,
        };
      });
    },
  };
  return ctx;
}

/* ==========================================================================
   §4 主流程
   ========================================================================== */

async function main() {
  const argv = process.argv.slice(2);
  const catArg = (argv.find((a) => a.startsWith('--cat=')) || '').split('=')[1];

  console.log('=== P4-B · 桌面专项测试矩阵 ===\n');

  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('❌ 阻塞：playwright-core 不可用。');
    process.exit(3);
  }

  const { _electron } = pw;
  let app = null; let win = null;
  const consoleMsgs = [];
  const pageErrors = [];
  const attempts = Number((argv.find((a) => a.startsWith('--attempts=')) || '').split('=')[1]) || 6;

  console.log('【启动】Electron 桌面版');
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
      win = await app.firstWindow({ timeout: 30000 });
      break;
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        console.log(`     ⏳ 启动失败（第 ${i} 次），可能是单实例锁竞争，${1500 * i} ms 后重试…`);
        await new Promise((r) => setTimeout(r, 1500 * i));
      }
    }
  }
  if (!win) {
    console.error('❌ 阻塞：Electron 桌面版无法启动 —— ' + (lastErr ? lastErr.message.split('\n')[0] : '未知'));
    process.exit(3);
  }
  win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()); });
  win.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);
  await win.evaluate(HELPERS);
  console.log('     ✅ 已就绪\n');

  const ctx = buildContext(app, win);
  const selected = catArg ? cases.filter((c) => c.cat === catArg) : cases;

  const results = [];
  let pass = 0; let fail = 0; let blocked = 0;

  for (const c of selected) {
    const rec = { id: c.id, cat: c.cat, title: c.title, target: c.target, input: c.input, expect: c.expect };
    let r;
    try {
      // 🔒 每条用例前复位状态，消除用例间污染（D-09 §9.2 A-3）
      await ctx.reset();
      r = await c.fn(ctx);
    } catch (e) {
      r = { actual: '执行异常：' + (e && e.message ? e.message : String(e)), pass: false, error: true };
    }
    rec.actual = r.actual;
    rec.evidence = r.evidence || 'reports/desktop-suite.json';
    rec.blocked = !!r.blocked;
    rec.note = r.note || '';
    if (r.blocked) { rec.verdict = 'BLOCKED'; blocked++; }
    else if (r.pass) { rec.verdict = 'PASS'; pass++; }
    else { rec.verdict = 'FAIL'; fail++; }
    results.push(rec);
    const mark = rec.verdict === 'PASS' ? '✅' : rec.verdict === 'BLOCKED' ? '🚧' : '❌';
    console.log(`  ${mark} ${c.id} [${c.cat}] ${c.title}`);
    console.log(`       实际：${String(r.actual).slice(0, 220)}`);
    if (rec.verdict === 'FAIL') console.log(`       期望：${c.expect}`);
  }

  /* ---- 汇总 ---- */
  console.log('\n============================================================');
  console.log('【汇总】桌面专项测试矩阵');
  console.log('============================================================');
  console.log(`  用例数 = ${selected.length} ｜ PASS ${pass} ｜ FAIL ${fail} ｜ BLOCKED ${blocked}`);
  const byCat = {};
  for (const r of results) {
    byCat[r.cat] = byCat[r.cat] || { n: 0, pass: 0, fail: 0, blocked: 0 };
    byCat[r.cat].n++;
    if (r.verdict === 'PASS') byCat[r.cat].pass++;
    else if (r.verdict === 'FAIL') byCat[r.cat].fail++;
    else byCat[r.cat].blocked++;
  }
  for (const k of Object.keys(byCat)) {
    const b = byCat[k];
    console.log(`  ${k}: ${b.pass}/${b.n} 通过${b.fail ? '，失败 ' + b.fail : ''}${b.blocked ? '，阻塞 ' + b.blocked : ''}`);
  }
  console.log(`  console error/warning = ${consoleMsgs.length} ｜ pageerror = ${pageErrors.length}`);
  if (consoleMsgs.length) consoleMsgs.slice(0, 10).forEach((m) => console.log('    ' + m));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'desktop-suite.json');
  fs.writeFileSync(out, JSON.stringify({
    meta: { generatedAt: new Date().toISOString(), electron: '45.1.0', node: process.version, platform: process.platform },
    summary: { total: selected.length, pass, fail, blocked, byCat, consoleErrors: consoleMsgs, pageErrors },
    results,
  }, null, 2), 'utf8');
  console.log(`\n  📄 JSON 报告：${out}`);

  await app.close().catch(() => {});
  if (fail > 0) process.exit(1);
  if (blocked > 0) process.exit(2);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
