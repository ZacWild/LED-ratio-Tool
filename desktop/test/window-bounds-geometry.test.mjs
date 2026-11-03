/**
 * LED-ratio-Tool 桌面版 · 窗口预算几何单元测试（P7-DPI-09 Remediation · 方案 A）
 * ============================================================================
 * 目标：对 main/window-bounds.js 的**纯函数**做独立几何验证，覆盖任务书 §七
 *      要求的全部情形：
 *        · 100% / 125% / 150%
 *        · 不同工作区大小
 *        · 非零 workArea.x / y（含负坐标副屏）
 *        · 最小窗口临界值
 *        · 默认窗口可完整放入的情况
 *        · 当前工作区小于产品最小窗口的情况
 *        · 原生非客户区增量变化的情况
 *
 * 🔴 数据性质声明（重要）：
 *    本文件的 frameDelta 为**实测值或明确标注的保守外推值**：
 *      · 100% → 16×65  实测（test/probes/probe-frame-delta.cjs）
 *      · 125% → 15×64  实测（任务书实测表）
 *      · 150% → 20×80  **保守外推**（Windows 边框/菜单栏并非线性缩放，
 *                       真实值必须在 150% 真实环境实测 —— 本文件不冒充实测）
 *    模拟数据仅用于**算法单元测试**，不能替代真实 DPI 验收。
 *
 * 用法：node test/window-bounds-geometry.test.mjs
 * 退出码：0 = 全部通过；1 = 存在失败
 */
'use strict';

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WB = require(path.join(__dirname, '..', 'main', 'window-bounds.js'));

const {
  WINDOW_GEOMETRY,
  computeContentBudget,
  computeWindowPosition,
  clampWindowPosition,
  checkFitsWorkArea,
  computeMinTrackSize,
  calibrateMinTrack,
} = WB;

/* ---------------- 测试框架（与工程既有脚本风格一致：rec + 退出码） ---------------- */
const results = [];
let failures = 0;
function t(id, title, fn) {
  try {
    const detail = fn();
    results.push({ id, title, pass: true, detail: detail || '' });
    console.log(`  ✅ ${id}  ${title}`);
    if (detail) console.log(`        ${detail}`);
  } catch (e) {
    failures++;
    results.push({ id, title, pass: false, detail: e.message });
    console.log(`  ❌ ${id}  ${title}`);
    console.log(`        ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}｜期望 ${expected}，实际 ${actual}`);
}

/* ---------------- 固定素材 ---------------- */
const DELTA_100 = { width: 16, height: 65 }; // 实测
const DELTA_125 = { width: 15, height: 64 }; // 实测（任务书实测表）
const DELTA_150 = { width: 20, height: 80 }; // 保守外推（**非实测**，须在 150% 环境核实）

const WORK_REAL_100 = { x: 0, y: 0, width: 2560, height: 1392 }; // LEN P27q-10 @100%（含任务栏 48 DIP）

console.log('=== 窗口预算几何单元测试（方案 A）===');
console.log(`常量：MIN=${WINDOW_GEOMETRY.minContentWidth}×${WINDOW_GEOMETRY.minContentHeight} TARGET=${WINDOW_GEOMETRY.targetWidth}×${WINDOW_GEOMETRY.targetHeight} EDGE=${WINDOW_GEOMETRY.edgeMargin}`);

/* ===================== 一、三档缩放 × 真实机工作区 ===================== */
for (const [label, delta, note] of [
  ['100%', DELTA_100, '实测'],
  ['125%', DELTA_125, '实测'],
  ['150%', DELTA_150, '保守外推（非实测）'],
]) {
  t(`GEO-01-${label}`, `${label} 缩放下默认窗口完整落入工作区（delta ${delta.width}×${delta.height}，${note}）`, () => {
    const budget = computeContentBudget({ workArea: WORK_REAL_100, frameDelta: delta });
    eq(budget.contentWidth, WINDOW_GEOMETRY.targetWidth, '客户区宽应保持目标 1440');
    eq(budget.contentHeight, WINDOW_GEOMETRY.targetHeight, '客户区高应保持目标 900');
    assert(budget.fitsMinimum, '工作区应能容纳产品最小窗口');

    // 用最终外框做四边核验（与运行时同一判据）
    const frame = { width: budget.contentWidth + delta.width, height: budget.contentHeight + delta.height };
    const pos = computeWindowPosition({ workArea: WORK_REAL_100, frameSize: frame });
    const bounds = { x: pos.x, y: pos.y, width: frame.width, height: frame.height };
    const fit = checkFitsWorkArea(bounds, WORK_REAL_100);
    assert(fit.fits, `四边应全部在内，实际溢出 ${JSON.stringify(fit.overflow)}`);
    return `客户区 ${budget.contentWidth}×${budget.contentHeight}｜外框 ${frame.width}×${frame.height} @(${pos.x},${pos.y})｜四边溢出 0`;
  });
}

/* ===================== 二、不同工作区大小 ===================== */
const WORK_CASES = [
  { label: '1920×1040（1080p 全屏）', work: { x: 0, y: 0, width: 1920, height: 1040 } },
  { label: '1366×728（1366×768 笔记本）', work: { x: 0, y: 0, width: 1366, height: 728 } },
  { label: '1280×720（720p）', work: { x: 0, y: 0, width: 1280, height: 720 } },
  { label: '2560×1440（无任务栏，完整屏）', work: { x: 0, y: 0, width: 2560, height: 1440 } },
];
for (const c of WORK_CASES) {
  t(`GEO-02-${c.label}`, `工作区 ${c.label}：装得下则四边必在内，装不下必须如实标记`, () => {
    const budget = computeContentBudget({ workArea: c.work, frameDelta: DELTA_100 });
    const frame = { width: budget.contentWidth + DELTA_100.width, height: budget.contentHeight + DELTA_100.height };
    const pos = computeWindowPosition({ workArea: c.work, frameSize: frame });
    const fit = checkFitsWorkArea({ x: pos.x, y: pos.y, width: frame.width, height: frame.height }, c.work);

    if (budget.fitsMinimum) {
      // 工作区装得下产品最小窗口 → 外框**必须**完整落入
      assert(fit.fits, `四边溢出 ${JSON.stringify(fit.overflow)}`);
      return `客户区 ${budget.contentWidth}×${budget.contentHeight}｜外框 ${frame.width}×${frame.height}｜四边溢出 0`;
    }
    // 工作区装不下产品最小窗口 → **不得**偷偷缩小 DEC-07 下限，必须如实标记并给出差距
    assert(!fit.fits, '装不下最小窗口时外框理应超出工作区（这是限制，不是缺陷）');
    // 只在**被 MIN 夹紧的维度**上断言等于下限；未被夹的维度应充分利用可用空间
    if (budget.maxContentWidth < WINDOW_GEOMETRY.minContentWidth) {
      eq(budget.contentWidth, WINDOW_GEOMETRY.minContentWidth, '**不得**为通过而缩小 DEC-07 宽度下限');
    } else {
      eq(budget.contentWidth, budget.maxContentWidth, '宽度未被夹紧时应等于可用预算');
    }
    if (budget.maxContentHeight < WINDOW_GEOMETRY.minContentHeight) {
      eq(budget.contentHeight, WINDOW_GEOMETRY.minContentHeight, '**不得**为通过而缩小 DEC-07 高度下限');
    } else {
      eq(budget.contentHeight, budget.maxContentHeight, '高度未被夹紧时应等于可用预算');
    }
    assert(budget.shortfall.width > 0 || budget.shortfall.height > 0, '必须记录差距');
    return `装不下最小窗口（如实标记）｜最大可用客户区 ${budget.maxContentWidth}×${budget.maxContentHeight}` +
      `｜差距 ${budget.shortfall.width}×${budget.shortfall.height}｜客户区 ${budget.contentWidth}×${budget.contentHeight}` +
      `｜最低工作区要求 ${budget.requiredWorkArea.width}×${budget.requiredWorkArea.height}`;
  });
}

/* ===================== 三、非零 / 负数 workArea 原点 ===================== */
const ORIGIN_CASES = [
  { label: '副屏在右（x=2560）', work: { x: 2560, y: 0, width: 2560, height: 1392 } },
  { label: '副屏在左（x=-2560，负坐标）', work: { x: -2560, y: 0, width: 2560, height: 1392 } },
  { label: '副屏在上（y=-1440）', work: { x: 0, y: -1440, width: 2560, height: 1392 } },
  { label: '任务栏在左（x=80）', work: { x: 80, y: 0, width: 2480, height: 1440 } },
];
for (const c of ORIGIN_CASES) {
  t(`GEO-03-${c.label}`, `工作区原点 ${c.label}：位置与四边均正确`, () => {
    const budget = computeContentBudget({ workArea: c.work, frameDelta: DELTA_100 });
    const frame = { width: budget.contentWidth + DELTA_100.width, height: budget.contentHeight + DELTA_100.height };
    const pos = computeWindowPosition({ workArea: c.work, frameSize: frame });
    assert(pos.x >= c.work.x, `x 应 ≥ workArea.x（${pos.x} < ${c.work.x}）`);
    assert(pos.y >= c.work.y, `y 应 ≥ workArea.y（${pos.y} < ${c.work.y}）`);
    assert(pos.x + frame.width <= c.work.x + c.work.width, '右边应 ≤ workArea.right');
    assert(pos.y + frame.height <= c.work.y + c.work.height, '底边应 ≤ workArea.bottom');
    return `位置 @(${pos.x},${pos.y})｜外框 ${frame.width}×${frame.height}`;
  });
}

/* ===================== 四、最小窗口临界值 ===================== */
t('GEO-04-临界恰好容纳', '工作区恰好等于最低工作区要求 → 客户区正好等于 DEC-07 下限', () => {
  const budget = computeContentBudget({ workArea: WORK_REAL_100, frameDelta: DELTA_100 });
  const req = budget.requiredWorkArea;
  const tight = { x: 0, y: 0, width: req.width, height: req.height };
  const b2 = computeContentBudget({ workArea: tight, frameDelta: DELTA_100 });
  assert(b2.fitsMinimum, '恰好容纳时应 fitsMinimum=true');
  eq(b2.contentWidth, WINDOW_GEOMETRY.minContentWidth, '客户区宽应为 1024');
  eq(b2.contentHeight, WINDOW_GEOMETRY.minContentHeight, '客户区高应为 680');
  eq(b2.atMinimum, true, '应标记为触到 DEC-07 下限');
  eq(b2.clampedToMinimum, false, '恰好等于下限时不算「被抬高」');
  eq(b2.shortfall.width, 0, '不应有宽度差距');
  eq(b2.shortfall.height, 0, '不应有高度差距');
  return `最低工作区要求 ${req.width}×${req.height}｜客户区 ${b2.contentWidth}×${b2.contentHeight}｜atMinimum=${b2.atMinimum}`;
});

t('GEO-05-临界差 1px', '工作区比最低要求少 1px → 必须识别为「装不下最小窗口」', () => {
  const req = computeContentBudget({ workArea: WORK_REAL_100, frameDelta: DELTA_100 }).requiredWorkArea;
  const tight = { x: 0, y: 0, width: req.width - 1, height: req.height };
  const b2 = computeContentBudget({ workArea: tight, frameDelta: DELTA_100 });
  assert(!b2.fitsMinimum, '应 fitsMinimum=false');
  assert(b2.exceedsMinimum, '应 exceedsMinimum=true');
  eq(b2.shortfall.width, 1, '宽度差距应为 1');
  eq(b2.contentWidth, WINDOW_GEOMETRY.minContentWidth, '**不得**为通过而缩小 DEC-07 下限');
  return `工作区 ${tight.width}×${tight.height}｜差距 ${b2.shortfall.width}px｜客户区仍为 ${b2.contentWidth}×${b2.contentHeight}`;
});

t('GEO-06-远小于最小窗口', '工作区远小于产品最小窗口 → 差距如实记录', () => {
  const small = { x: 0, y: 0, width: 800, height: 600 };
  const b2 = computeContentBudget({ workArea: small, frameDelta: DELTA_100 });
  assert(!b2.fitsMinimum, '应 fitsMinimum=false');
  eq(b2.shortfall.width, 1024 - (800 - 32 - 16), '宽度差距计算错误');
  eq(b2.shortfall.height, 680 - (600 - 32 - 65), '高度差距计算错误');
  eq(b2.contentWidth, 1024, '客户区宽度仍应是 DEC-07 下限');
  eq(b2.contentHeight, 680, '客户区高度仍应是 DEC-07 下限');
  return `工作区 800×600｜最大可用客户区 ${b2.maxContentWidth}×${b2.maxContentHeight}｜差距 ${b2.shortfall.width}×${b2.shortfall.height}`;
});

/* ===================== 五、非客户区增量变化 ===================== */
t('GEO-07-增量变化', '同一工作区下 frameDelta 变化 → 预算随之变化（不得写死 65）', () => {
  const a = computeContentBudget({ workArea: WORK_REAL_100, frameDelta: { width: 16, height: 65 } });
  const b = computeContentBudget({ workArea: WORK_REAL_100, frameDelta: { width: 20, height: 80 } });
  eq(a.maxContentHeight, 1392 - 32 - 65, '100% 增量下可用高度计算错误');
  eq(b.maxContentHeight, 1392 - 32 - 80, '150% 增量下可用高度计算错误');
  assert(b.maxContentHeight < a.maxContentHeight, '增量变大 → 可用高度应变小');
  // 工作区紧张时，增量差异会直接改变客户区尺寸
  const tight = { x: 0, y: 0, width: 1200, height: 800 };
  const c = computeContentBudget({ workArea: tight, frameDelta: { width: 16, height: 65 } });
  const d = computeContentBudget({ workArea: tight, frameDelta: { width: 16, height: 39 } });
  assert(d.contentHeight > c.contentHeight, '增量变小 → 客户区应更大');
  return `增量 65 → 可用高 ${a.maxContentHeight}；增量 80 → 可用高 ${b.maxContentHeight}`;
});

/* ===================== 六、旧算法回归防护（把「26 DIP 出屏」固化成断言） ===================== */
t('GEO-08-旧算法出屏固化', '旧算法复现历史实测（客户区 1024×681 / 外框 1040×746 / 溢出 16×26）', () => {
  // 🔴 决定性交叉验证：把根因模型代入历史失败场景，算出的客户区/外框/溢出量
  //    必须与 test/reports/p7-dpi-100.json 的实测**逐项吻合**。
  //
  //    历史场景还原（RDP 虚拟屏 1024×768，任务栏 55px）：
  //      · 主进程 planWindowBounds 读 getDisplayNearestPoint(cursor).workArea = 1024×713
  //      · p7-dpi.mjs 读的是**渲染层** window.screen.availWidth/availHeight = 1024×720
  //      （两个口径不同源 —— 这正是历史溢出量的来源）
  const mainWork = { x: 0, y: 0, width: 1024, height: 713 }; // 主进程口径
  const renderAvail = { x: 0, y: 0, width: 1024, height: 720 }; // 渲染层口径（p7-dpi 实测）

  // 旧算法：content = max(min(TARGET, work − EDGE_MARGIN), MIN_CONTENT)
  const legacyW = Math.max(Math.min(1440, mainWork.width - 32), 1024);
  const legacyH = Math.max(Math.min(900, mainWork.height - 32), 680);
  eq(legacyW, 1024, '客户区宽应等于历史实测的 1024');
  eq(legacyH, 681, '客户区高应等于历史实测的 681（= 713 − 32）');
  // 真实外框 = 客户区 + 实测非客户区增量（16×65，含菜单栏 26）
  const frameW = legacyW + DELTA_100.width;
  const frameH = legacyH + DELTA_100.height;
  eq(frameW, 1040, '外框宽应等于历史实测的 1040');
  eq(frameH, 746, '外框高应等于历史实测的 746');

  // 位置：Windows 居中后把负坐标钳到 (0,0) → 溢出全部落在右/下两侧
  const centered = computeWindowPosition({ workArea: renderAvail, frameSize: { width: frameW, height: frameH } });
  const pos = clampWindowPosition({
    workArea: renderAvail,
    frameSize: { width: frameW, height: frameH },
    desired: centered,
  });
  eq(pos.x, 0, '历史实测窗口 x=0');
  eq(pos.y, 0, '历史实测窗口 y=0');
  const fit = checkFitsWorkArea({ x: pos.x, y: pos.y, width: frameW, height: frameH }, renderAvail);
  assert(!fit.fits, '旧算法在该工作区必然出屏');
  eq(fit.overflow.right, 16, '右侧溢出应等于历史实测的 16');
  eq(fit.overflow.bottom, 26, '底部溢出应等于历史实测的 26（= 漏计的原生菜单栏）');
  return `模型复现历史实测：客户区 ${legacyW}×${legacyH}｜外框 ${frameW}×${frameH} @(${pos.x},${pos.y})` +
    `｜溢出 右${fit.overflow.right} 下${fit.overflow.bottom}（与 p7-dpi-100.json 完全一致）`;
});

t('GEO-12-新算法在同一历史场景', '新算法在同一 1024×713 工作区把 DEC-07 下限守住并如实标记差距', () => {
  const work = { x: 0, y: 0, width: 1024, height: 713 };
  const budget = computeContentBudget({ workArea: work, frameDelta: DELTA_100 });
  // 713 − 32 − 65 = 616 < 680 → 工作区装不下 DEC-07 最小高度，必须如实标记
  assert(!budget.fitsMinimum, '该工作区应被识别为「装不下产品最小窗口」');
  eq(budget.contentWidth, 1024, '宽度方向客户区保持 1024');
  eq(budget.contentHeight, 680, '高度方向客户区保持 DEC-07 下限 680（不偷偷缩小）');
  eq(budget.shortfall.height, 680 - (713 - 32 - 65), '高度差距应为 64');
  eq(budget.requiredWorkArea.height, 680 + 32 + 65, '最低工作区高度要求计算错误');
  return `客户区 ${budget.contentWidth}×${budget.contentHeight}｜最大可用 ${budget.maxContentWidth}×${budget.maxContentHeight}` +
    `｜差距 ${budget.shortfall.width}×${budget.shortfall.height}｜如实标记 exceedsMinimum=true`;
});

t('GEO-09-新算法在同一场景通过', '同一紧张工作区，新算法（扣实测增量）外框完整落入', () => {
  const tight = { x: 0, y: 0, width: 2560, height: 800 };
  const budget = computeContentBudget({ workArea: tight, frameDelta: DELTA_100 });
  const frame = { width: budget.contentWidth + DELTA_100.width, height: budget.contentHeight + DELTA_100.height };
  const pos = computeWindowPosition({ workArea: tight, frameSize: frame });
  const fit = checkFitsWorkArea({ x: pos.x, y: pos.y, width: frame.width, height: frame.height }, tight);
  assert(fit.fits, `新算法应通过，实际溢出 ${JSON.stringify(fit.overflow)}`);
  return `客户区 ${budget.contentWidth}×${budget.contentHeight}｜外框 ${frame.width}×${frame.height}｜四边溢出 0`;
});

/* ===================== 七、位置夹紧 ===================== */
t('GEO-10-位置夹紧', '外框大于工作区时，位置被夹到工作区内（不越界）', () => {
  const work = { x: 0, y: 0, width: 800, height: 600 };
  const p = clampWindowPosition({ workArea: work, frameSize: { width: 1040, height: 745 } });
  assert(p.x >= work.x && p.y >= work.y, '应夹在工作区左上角内侧');
  assert(p.clamped, '应标记 clamped');
  return `夹紧后 @(${p.x},${p.y}) clamped=${p.clamped}`;
});

t('GEO-11-最小 track 换算', 'min track 必须用**外框口径**下发（客户区 + 实测增量）', () => {
  // 🔴 实测陷阱（test/probes/probe-min-visible.cjs）：
  //   · 构造参数 minWidth/minHeight = 客户区口径，Chromium 自动加边框(16/39) → getMinimumSize()=[1040,719]
  //     而客户区 = 外框 − (16,65) → 声明 680 实际只保证客户区 ≥ 654（DEC-07 失守）
  //   · setMinimumSize(w,h) = 外框口径且**不**自动加边框 → 传客户区数字会把下限调低
  //   因此正确做法：setMinimumSize(客户区 + 实测增量) = (1040, 745) → 客户区 1024×680
  const m = computeMinTrackSize({ frameDelta: DELTA_100 });
  eq(m.minWidth, 1024 + 16, '宽度 min track 应为客户区下限 + 实测增量');
  eq(m.minHeight, 680 + 65, '高度 min track 应为客户区下限 + 实测增量');
  // 换算回去：外框下限 − 实测增量 = 客户区下限
  eq(m.minWidth - DELTA_100.width, WINDOW_GEOMETRY.minContentWidth, '宽度反算应等于 DEC-07 下限');
  eq(m.minHeight - DELTA_100.height, WINDOW_GEOMETRY.minContentHeight, '高度反算应等于 DEC-07 下限');
  // 增量变化时必须跟着变（不得写死 65）
  const m150 = computeMinTrackSize({ frameDelta: DELTA_150 });
  eq(m150.minHeight, 680 + 80, '150% 增量下 min track 应随实测值变化');
  return `100%: setMinimumSize(${m.minWidth},${m.minHeight}) → 客户区下限 ${m.minWidth - DELTA_100.width}×${m.minHeight - DELTA_100.height}`;
});

t('GEO-13-min track 标定（顶高时下调）', '实测下限被顶高时，按超出量**下调** min track', () => {
  // 🔴 实测事实（test/probes/probe-min-track-calibrate.cjs / probe-min-track-search2.cjs）：
  //   「min track → 客户区下限」的换算量 ≠ frameDelta（125% 下前者 12×63、后者 15×64，
  //   差额是 Windows 11 不可见缩放边框）⇒ 按 frameDelta 下发会把下限顶高。
  //   实测：setMinimumSize(1039,744) → 下限 1026×682（宽度顶高 2px）。
  //   标定应把它下调到 (1037,742) → 实测下限 1024×682（宽度达标）。
  const r = calibrateMinTrack({
    currentMinTrack: { minWidth: 1039, minHeight: 744 },
    actualMinContent: { width: 1026, height: 682 },
  });
  eq(r.adjusted, true, '下限被顶高时必须触发调整');
  eq(r.excess.width, 2, '宽度超出量应为 2');
  eq(r.excess.height, 2, '高度超出量应为 2');
  eq(r.minWidth, 1037, '宽度 min track 应下调 2');
  eq(r.minHeight, 742, '高度 min track 应下调 2');
  return `setMinimumSize(1039,744)→实测 1026×682 ⇒ 标定为 (${r.minWidth},${r.minHeight}) → 实测下限 1024×682`;
});

t('GEO-14-min track 标定（已达标时不调整）', '任一轴已达标即**不得**再下调（否则会跌破 DEC-07）', () => {
  // 🔴 实测：1037×740 → 下限 1024×678（高度已跌破 680）⇒ 必须停在 742。
  //   判定是**分轴**的：宽度已达标（1024）即停止下调，高度不再追（否则跌破 680）。
  const r = calibrateMinTrack({
    currentMinTrack: { minWidth: 1037, minHeight: 742 },
    actualMinContent: { width: 1024, height: 682 },
  });
  eq(r.adjusted, false, '宽度已达标时不得再调整');
  eq(r.minWidth, 1037, 'min track 宽度应保持不变');
  eq(r.minHeight, 742, 'min track 高度应保持不变（再降会跌破 680）');
  eq(r.excess.width, 0, '宽度超出量应为 0');
  eq(r.excess.height, 2, '高度超出量应如实记录为 2（平台量化导致）');
  return '下限 1024×682（≥DEC-07）→ 保持 min track (1037,742)，不再下调';
});

t('GEO-16-min track 标定双轴未达标', '两轴都超出时才下调，且下调量 = 各自超出量', () => {
  const r = calibrateMinTrack({
    currentMinTrack: { minWidth: 1040, minHeight: 745 },
    actualMinContent: { width: 1028, height: 682 },
  });
  eq(r.adjusted, true, '两轴均超出时必须调整');
  eq(r.minWidth, 1040 - 4, '宽度应按超出量 4 下调');
  eq(r.minHeight, 745 - 2, '高度应按超出量 2 下调');
  return `setMinimumSize(1040,745)→实测 1028×682 ⇒ 标定为 (${r.minWidth},${r.minHeight})`;
});

t('GEO-15-min track 标定安全下界', '下调不得让 min track 跌破客户区下限本身', () => {
  const r = calibrateMinTrack({
    currentMinTrack: { minWidth: 1026, minHeight: 682 },
    actualMinContent: { width: 1024, height: 1000 },
  });
  assert(r.minWidth >= 1024, 'min track 宽度不得跌破客户区下限');
  assert(r.minHeight >= 680, 'min track 高度不得跌破客户区下限');
  return `极端超出量 → 下调后 min track (${r.minWidth},${r.minHeight})，仍守住 DEC-07`;
});

/* ===================== 汇总 ===================== */
console.log('');
console.log(`检查项 = ${results.length} ｜ 通过 ${results.filter((r) => r.pass).length} ｜ 失败 ${failures}`);
console.log(`判定 = ${failures ? 'FAIL' : 'PASS'}`);
process.exit(failures ? 1 : 0);
