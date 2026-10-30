/**
 * LED-ratio-Tool 桌面版 · 200 组差分测试执行器（DEC-15）
 * ============================================================================
 * 依据：
 *   P4-BASELINE.md DEC-15 —— 差分门禁 = 200 组可观察结果零未解释差异
 *   P3-D09 §6.1 —— 三层期望源（L1 独立 oracle / L2 人工确认黄金向量 / L3 双版比对）
 *   P3-D09 §6.2 —— 8 组输入矩阵分配（30/40/20/30/30/30/10/10）
 *   P3-D09 §6.3 —— 30 个比对字段与判定方式
 *   P3-D09 §6.4 —— 差异容忍度；「差异 = 0 条」的诚实定义
 *   P3-D09 §6.5 —— 失败归因路径（7 步）
 *   P3-D09 §6.6 —— 执行方式与独立性自检（机器闸）
 *
 * 🔴 判定规则（DEC-15）：
 *   一组通过 ⇔ **L1 或 L2 至少一层覆盖** 且该层判定通过。
 *   L3（HTML ↔ 桌面双版比对）**不可单独作为正确性判据** —— 两版共用同一 core.js，
 *   一致只能证明「两次运行一致」，不能证明任一版正确。
 *
 * 🔴 报告三行口径（P3-D09 §6.4）：
 *   差异条数 = N ｜ 未覆盖字段数 = M ｜ L1/L2 覆盖率 = P%
 *   **N = 0 但 M > 0 → 判「有条件通过」，不得写「完全通过」。**
 *
 * 用法：
 *   node desktop/test/differential-200.mjs            # 全量 200 组
 *   node desktop/test/differential-200.mjs --group=G1  # 只跑指定组
 *   node desktop/test/differential-200.mjs --list      # 只打印输入矩阵
 *
 * 退出码：
 *   0 = 全部通过且未覆盖字段数 = 0
 *   1 = 存在差异条数 > 0（有差异）
 *   2 = 差异条数 = 0 但存在未覆盖字段（有条件通过）
 *   3 = 执行环境阻塞（Electron / Chrome 不可用等）—— 不得伪装成通过
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT_DIR = path.join(DESKTOP, 'test', 'reports');
const VECTORS_DIR = path.join(DESKTOP, 'test', 'vectors');

/* ==========================================================================
   §0 独立加载 L1 oracle（动态 import，ESM）
   ========================================================================== */

let oracle = null;
async function loadOracle() {
  if (oracle) return oracle;
  const mod = await import(pathToFileURL(path.join(__dirname, 'oracle', 'independent-oracle.mjs')).href);
  oracle = mod;
  return oracle;
}

/* ==========================================================================
   §1 独立性与环境前置检查（机器闸 —— P3-D09 §6.6）
   ========================================================================== */

function cleanEnv() {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE; // 🔴 E-1 / SEC-40
  return env;
}

/**
 * 带重试的 Electron 启动。
 *
 * 🔴 为什么需要重试：桌面版实现了 `app.requestSingleInstanceLock()`（SEC-02）。
 *    当研发角色**并行**运行桌面应用时，本测试实例会被判定为「第二实例」而
 *    立即 `app.quit()` —— 表现为「Process failed to launch / exitCode=0」。
 *    这是**环境竞争**，不是产品缺陷；重试是正确处置。
 *    ⚠ 不得为了让测试跑通而关闭单实例锁（那会掩盖 SEC-02 的真实行为）。
 */
async function launchElectronWithRetry(pw, attempts = 6) {
  const { _electron } = pw;
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      // 🔴 不传 --inspect / --remote-debugging-port —— Playwright `_electron` 自行注入
      //    `--inspect=0 --remote-debugging-port=0`；手动再传会造成参数冲突导致进程秒退。
      const app = await _electron.launch({
        args: [DESKTOP],
        cwd: DESKTOP,
        env: cleanEnv(),
        timeout: 60000,
      });
      return { app, attempts: i };
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        const wait = 1500 * i;
        console.log(`     ⏳ Electron 启动第 ${i} 次失败（可能是单实例锁竞争），${wait} ms 后重试…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/**
 * 🔴 机器闸：静态扫描差分器自身与 oracle，命中 core.js / acceptance.mjs 引用即退出码 1。
 * 「独立性自检必须是一道机器闸，不靠人工承诺」（P3-D09 §6.6）。
 */
function runIndependenceGate() {
  const { checkFiles } = require(path.join(__dirname, 'oracle', 'independence-check.cjs'));
  const targets = [
    path.join(__dirname, 'differential-200.mjs'),
    path.join(__dirname, 'oracle', 'independent-oracle.mjs'),
  ];
  const results = checkFiles(targets);
  const failed = results.filter((r) => !r.ok);
  return { ok: failed.length === 0, results, failed };
}

/* ==========================================================================
   §2 输入矩阵（8 组 · 200 条 · 确定性生成 —— P3-D09 §6.2）
   ========================================================================== */

const STANDARDS_16 = [
  '16:9', '16:10', '4:3', '3:2', '1:1', '9:16', '4:5', '21:9',
  '32:9', '2.35:1', '2.39:1', '2.40:1', '3440×1440', '3840×1646', '3840×2160', '1920×1080',
];

/** 标准库条目的精确比例值（独立登记，供 oracle 侧使用） */
const STANDARD_EXACT = {
  '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '3:2': 3 / 2, '1:1': 1,
  '9:16': 9 / 16, '4:5': 4 / 5, '21:9': 7 / 3, '32:9': 32 / 9,
  '2.35:1': 2.35, '2.39:1': 2.39, '2.40:1': 2.4,
  '3440×1440': 3440 / 1440, '3840×1646': 3840 / 1646,
  '3840×2160': 3840 / 2160, '1920×1080': 1920 / 1080,
};

/** 常用规格（独立登记） */
const PRESETS = {
  '1920×1080': { width: 1920, height: 1080, realRatio: 1920 / 1080 },
  '2560×1440': { width: 2560, height: 1440, realRatio: 2560 / 1440 },
  '3440×1440': { width: 3440, height: 1440, realRatio: 3440 / 1440 },
  '3840×2160': { width: 3840, height: 2160, realRatio: 3840 / 2160 },
  '3840×1646': { width: 3840, height: 1646, realRatio: 3840 / 1646 },
  '4096×2160': { width: 4096, height: 2160, realRatio: 4096 / 2160 },
  '5120×2160': { width: 5120, height: 2160, realRatio: 5120 / 2160 },
};

const G1_SCREENS = [
  { widthText: '14', heightText: '4', unit: 'm' },
  { widthText: '3840', heightText: '2160', unit: 'mm' },
];

const G2_TARGETS = [1920, 3840, 1080, 2160, 2560, 1440, 1280, 720, 800, 1000];

const G3_SIZES = [
  { w: 14, h: 4 }, { w: 16, h: 9 }, { w: 20, h: 5 }, { w: 3.75, h: 1.25 },
  { w: 43.18, h: 18 }, { w: 65, h: 36 }, { w: 32, h: 9 }, { w: 1, h: 1 },
];

/** G4 自定义比例的合法与非法分支 */
const G4_CUSTOM_VALID = ['65:36', '16:9', '4:3', '21:9', '32:9', '256:135', '1:1', '43:18'];
const G4_CUSTOM_INVALID = ['6', '65:', ':36', '0:36', 'a:b', '65:0'];

const G5_RATIOS = ['65:36', '16:9', '4:3', '32:9', '21:9', '1:1', '256:135'];
const G5_BOUNDS = [
  { maxWidth: 1920, maxHeight: 1080 },
  { maxWidth: 3840, maxHeight: 2160 },
  { maxWidth: 1280, maxHeight: 720 },
  { maxWidth: 100, maxHeight: 100 },
  { maxWidth: 1920, maxHeight: 100 },
];

/** G6 边界与异常输入 */
const G6_ABNORMAL = [
  { widthText: '', heightText: '4', unit: 'm', note: '空字符串' },
  { widthText: '   ', heightText: '4', unit: 'm', note: '纯空格' },
  { widthText: '0', heightText: '4', unit: 'm', note: '零' },
  { widthText: '-0', heightText: '4', unit: 'm', note: '负零' },
  { widthText: '-4', heightText: '4', unit: 'm', note: '负数' },
  { widthText: 'abc', heightText: '4', unit: 'm', note: '字母' },
  { widthText: '12abc', heightText: '4', unit: 'm', note: '混合数字' },
  { widthText: '1.2.3', heightText: '4', unit: 'm', note: '多小数点' },
  { widthText: '1e5', heightText: '4', unit: 'm', note: '科学计数法' },
  { widthText: '12%', heightText: '4', unit: 'm', note: '百分号' },
  { widthText: 'm', heightText: '4', unit: 'm', note: '单位字母混入' },
  { widthText: '14.5', heightText: '4', unit: 'm', note: '一位小数（合法）' },
  { widthText: '3.75', heightText: '1.25', unit: 'm', note: '浮点精度（合法）' },
  { widthText: '2.34', heightText: '1', unit: 'cm', note: 'cm 小数（合法）' },
  { widthText: '100000', heightText: '1', unit: 'mm', note: '极端宽高比 100000:1' },
  { widthText: '0.001', heightText: '100000', unit: 'mm', note: '极端宽高比 1:100000' },
  { widthText: '0.0000001', heightText: '1', unit: 'mm', note: '极小值 1e-7mm' },
  { widthText: '99999999999999999999', heightText: '1', unit: 'mm', note: '超长数值' },
  { widthText: '14', heightText: '', unit: 'm', note: '高度为空' },
  { widthText: '14', heightText: '0', unit: 'm', note: '高度为零' },
  { widthText: '14', heightText: '-4', unit: 'm', note: '高度为负' },
  { widthText: '14', heightText: 'abc', unit: 'm', note: '高度非法' },
  { widthText: '14', heightText: '4', unit: 'x', note: '非法单位' },
  { widthText: '14', heightText: '4', unit: '', note: '空单位' },
  { widthText: '14', heightText: '4', unit: 'm', note: '基线（对照）' },
];

const G7_DEMOS = [
  { id: 'case-a-14m-4m', label: '案例A 14m×4m' },
  { id: 'case-b-21x9-3840', label: '案例B 21:9 @3840' },
  { id: 'case-c-3440x1440', label: '案例C 3440×1440' },
  { id: 'case-d-16x9', label: '案例D 16:9' },
  { id: 'case-e-65x36', label: '案例E 65:36 整数倍' },
  { id: 'case-f-robustness', label: '案例F 异常输入（空态）' },
];

const G8_TOLERANCES = [0.1, 0.5, 1.0, 2.0, 5.0, 10, 50, 100];
const G8_TOLERANCE_ILLEGAL = [0, -1];

/**
 * 确定性生成 200 组输入。
 * 🔒 生成规则固定（P3-D09 §6.2），失败可复现。
 */
function buildMatrix() {
  const rows = [];
  let n = 0;
  const push = (group, note, spec) => {
    n += 1;
    rows.push({
      id: 'DT-' + String(n).padStart(3, '0'),
      group,
      note,
      spec: Object.assign({
        unit: 'm',
        ratioSource: 'screen',
        canvasMode: 'width',
        targetWidth: 1920,
        targetHeight: 1080,
        prefer: 'bounds',
        tolerance: 0.5,
      }, spec),
    });
  };

  // —— G1 标准比例库基线组：16 条 × 2 个代表屏幕 = 30 条（DT-001~030）——
  // 16×2 = 32 > 30 → 取前 15 个标准 × 2 屏幕 = 30 条
  for (let i = 0; i < 15; i++) {
    const std = STANDARDS_16[i];
    for (let s = 0; s < 2; s++) {
      const sc = G1_SCREENS[s];
      push('G1', `标准库 ${std} × 屏幕 ${sc.widthText}${sc.unit}×${sc.heightText}${sc.unit}`,
        {
          widthText: sc.widthText, heightText: sc.heightText, unit: sc.unit,
          ratioSource: 'standard', standardKey: std,
          standardExactValue: STANDARD_EXACT[std],
          canvasMode: 'width', targetWidth: 1920,
        });
    }
  }

  // —— G2 画布模式轮转组：4 模式 × 10 目标值 = 40 条（DT-031~070）——
  const g2Modes = ['width', 'height', 'preset', 'custom'];
  const g2PresetNames = Object.keys(PRESETS);
  for (let mi = 0; mi < g2Modes.length; mi++) {
    const mode = g2Modes[mi];
    for (let ti = 0; ti < 10; ti++) {
      const tv = G2_TARGETS[ti];
      const spec = {
        widthText: '14', heightText: '4', unit: 'm',
        canvasMode: mode,
        targetWidth: mode === 'width' ? tv : 1920,
        targetHeight: mode === 'height' ? tv : 1080,
      };
      if (mode === 'preset') {
        const pn = g2PresetNames[ti % g2PresetNames.length];
        spec.presetKey = pn;
        spec.preset = PRESETS[pn];
      }
      if (mode === 'custom') {
        spec.integerRatio = { a: 65, b: 36 };
        spec.maxWidth = tv >= 100 ? 1920 : 100;
        spec.maxHeight = tv >= 100 ? 1080 : 100;
        spec.customCanvasRatio = '65:36';
      }
      push('G2', `画布模式 ${mode} × 目标值 ${tv}`, spec);
    }
  }

  // —— G3 单位等价组：同一物理尺寸的 m/cm/mm × 8 组 = 24 → 取 20 条（DT-071~090）——
  // 分配规则：前 6 组尺寸各 3 个单位（m/cm/mm）= 18 条；后 2 组尺寸各 1 个单位（m）= 2 条；
  // 合计 20 条。三种单位写法必须覆盖到 6 组尺寸的完整等价性。
  const g3UnitsPerSize = [3, 3, 3, 3, 3, 3, 1, 1];
  for (let si = 0; si < G3_SIZES.length; si++) {
    const s = G3_SIZES[si];
    const allUnits = ['m', 'cm', 'mm'];
    const units = allUnits.slice(0, g3UnitsPerSize[si]);
    for (const u of units) {
      const factor = u === 'm' ? 1 : (u === 'cm' ? 100 : 1000);
      const wv = s.w * factor;
      const hv = s.h * factor;
      push('G3', `单位等价 ${s.w}×${s.h}（${u}）`, {
        widthText: String(wv), heightText: String(hv), unit: u,
        canvasMode: 'width', targetWidth: 1920,
      });
    }
  }

  // —— G4 比例来源组：screen × 4 + standard × 12 + custom × 14 = 30 条（DT-091~120）——
  const g4Screens = [
    { widthText: '14', heightText: '4', unit: 'm' },
    { widthText: '3840', heightText: '2160', unit: 'mm' },
    { widthText: '3440', heightText: '1440', unit: 'mm' },
    { widthText: '16', heightText: '9', unit: 'm' },
  ];
  for (const s of g4Screens) {
    push('G4', `比例来源 screen（${s.widthText}×${s.heightText}）`, {
      widthText: s.widthText, heightText: s.heightText, unit: s.unit,
      ratioSource: 'screen', canvasMode: 'width', targetWidth: 1920,
    });
  }
  for (let i = 0; i < 12; i++) {
    const std = STANDARDS_16[i % STANDARDS_16.length];
    push('G4', `比例来源 standard ${std}`, {
      widthText: '14', heightText: '4', unit: 'm',
      ratioSource: 'standard', standardKey: std,
      standardExactValue: STANDARD_EXACT[std],
      canvasMode: 'width', targetWidth: 1920,
    });
  }
  for (let i = 0; i < 8; i++) {
    const cr = G4_CUSTOM_VALID[i];
    push('G4', `比例来源 custom 合法 ${cr}`, {
      widthText: '14', heightText: '4', unit: 'm',
      ratioSource: 'custom', customRatio: cr,
      canvasMode: 'width', targetWidth: 1920,
    });
  }
  for (let i = 0; i < 6; i++) {
    const cr = G4_CUSTOM_INVALID[i];
    push('G4', `比例来源 custom 非法 ${cr}`, {
      widthText: '14', heightText: '4', unit: 'm',
      ratioSource: 'custom', customRatio: cr,
      canvasMode: 'width', targetWidth: 1920,
    });
  }

  // —— G5 整数倍组：7 比例 × 5 上限 × 2 档位 = 70 → 取 30 条（DT-121~150）——
  // 构造：先铺 prefer=bounds 的 7×2 组（14 条），再铺 prefer=height 的 7×2 组（14 条），
  // 最后补 2 条极端上限（无解 / 越界）
  let g5 = 0;
  const g5Targets = [];
  for (const p of ['bounds', 'height']) {
    for (const b of G5_BOUNDS) {
      for (const r of G5_RATIOS) {
        g5Targets.push({ prefer: p, bounds: b, ratio: r });
      }
    }
  }
  // 选取 30 条：保证三态（无解 / 界内 / 越界）全覆盖
  const g5Picked = [];
  const pickByState = (pred, count) => {
    let c = 0;
    for (const t of g5Targets) {
      if (c >= count) break;
      if (pred(t)) { g5Picked.push(t); c++; }
    }
  };
  // 无解：上限 100×100 下 65:36 与 256:135
  pickByState((t) => t.bounds.maxWidth === 100 && t.bounds.maxHeight === 100 &&
    (t.ratio === '65:36' || t.ratio === '256:135'), 4);
  // 越界：上限 1920×100 下的高比例
  pickByState((t) => t.bounds.maxWidth === 1920 && t.bounds.maxHeight === 100 &&
    (t.ratio === '32:9' || t.ratio === '21:9' || t.ratio === '4:3'), 4);
  // 界内：1920×1080 与 3840×2160
  pickByState((t) => t.bounds.maxWidth === 1920 && t.bounds.maxHeight === 1080, 6);
  pickByState((t) => t.bounds.maxWidth === 3840 && t.bounds.maxHeight === 2160, 6);
  pickByState((t) => t.bounds.maxWidth === 1280 && t.bounds.maxHeight === 720, 6);
  // 其余补齐至 30
  for (const t of g5Targets) {
    if (g5Picked.length >= 30) break;
    if (!g5Picked.includes(t)) g5Picked.push(t);
  }
  for (const t of g5Picked.slice(0, 30)) {
    const [a, b] = t.ratio.split(':').map(Number);
    g5 += 1;
    push('G5', `整数倍 ${t.ratio} 上限 ${t.bounds.maxWidth}×${t.bounds.maxHeight} 档位 ${t.prefer}`, {
      widthText: '14', heightText: '4', unit: 'm',
      ratioSource: 'screen',
      canvasMode: 'custom',
      integerRatio: { a, b },
      customCanvasRatio: t.ratio,
      maxWidth: t.bounds.maxWidth,
      maxHeight: t.bounds.maxHeight,
      prefer: t.prefer,
    });
  }

  // —— G6 边界与异常组：30 条（DT-151~180）——
  for (const a of G6_ABNORMAL) {
    if (rows.filter((r) => r.group === 'G6').length >= 30) break;
    push('G6', `边界异常：${a.note}`, {
      widthText: a.widthText, heightText: a.heightText, unit: a.unit,
      ratioSource: 'screen', canvasMode: 'width', targetWidth: 1920,
    });
  }
  // 补足到 30：容差非法 / 目标宽高非法 / 整数比非法 / 上限非法
  const g6Extras = [
    { note: '容差 0（非法，不生效）', tolerance: 0 },
    { note: '容差 -1（非法，不生效）', tolerance: -1 },
    { note: '容差 abc（非法）', tolerance: 'abc' },
    { note: '目标宽 0', targetWidth: 0 },
    { note: '目标高 0', targetHeight: 0 },
  ];
  for (const x of g6Extras) {
    if (rows.filter((r) => r.group === 'G6').length >= 30) break;
    push('G6', `边界异常：${x.note}`, {
      widthText: '14', heightText: '4', unit: 'm',
      ratioSource: 'screen', canvasMode: 'width',
      targetWidth: x.targetWidth !== undefined ? x.targetWidth : 1920,
      targetHeight: x.targetHeight !== undefined ? x.targetHeight : 1080,
      tolerance: x.tolerance !== undefined ? x.tolerance : 0.5,
    });
  }

  // —— G7 演示案例组：6 条案例 + 4 条变体 = 10 条（DT-181~190）——
  // 🔒 演示案例**自带输入**（载入后覆盖界面尺寸），故 spec 必须登记案例自身的
  //    宽/高/单位，否则「界面观测」与「按 spec 计算的 Core 观测」必然不一致。
  //    案例输入取自 core.js DEMO_CASES 的 inputs 字段（独立誊写，见下表）。
  //    ⚠ 案例还自带**目标画布宽**（app.js loadDemoCase 会把 result.canvasWidth
  //      写入 state.targetWidth）→ spec 的 targetWidth 必须与之一致。
  const DEMO_INPUTS = {
    'case-a-14m-4m': { widthText: '14', heightText: '4', unit: 'm', targetWidth: 4900 },
    'case-b-21x9-3840': { widthText: '21', heightText: '9', unit: 'm', targetWidth: 3840 },
    'case-c-3440x1440': { widthText: '3440', heightText: '1440', unit: 'mm', targetWidth: 1920 },
    'case-d-16x9': { widthText: '16', heightText: '9', unit: 'm', targetWidth: 1920 },
    'case-e-65x36': { widthText: '65', heightText: '36', unit: 'm', targetWidth: 1920 },
    'case-f-robustness': { widthText: '', heightText: '', unit: 'm', targetWidth: 1920 },
  };
  for (const d of G7_DEMOS) {
    const di = DEMO_INPUTS[d.id] || { widthText: '14', heightText: '4', unit: 'm', targetWidth: 1920 };
    push('G7', `演示案例 ${d.label}`, {
      demoId: d.id,
      widthText: di.widthText, heightText: di.heightText, unit: di.unit,
      ratioSource: 'screen', canvasMode: 'width',
      targetWidth: di.targetWidth, targetHeight: 1080,
    });
  }
  const g7Variants = [
    { note: '案例A 变体：改单位 cm', widthText: '1400', heightText: '400', unit: 'cm' },
    { note: '案例A 变体：改目标宽 4900', widthText: '14', heightText: '4', unit: 'm', targetWidth: 4900 },
    { note: '案例A 变体：比例来源改 standard 16:9', widthText: '14', heightText: '4', unit: 'm', ratioSource: 'standard', standardKey: '16:9', standardExactValue: 16 / 9 },
    { note: '案例A 变体：画布模式改整数倍', widthText: '14', heightText: '4', unit: 'm', canvasMode: 'custom', integerRatio: { a: 65, b: 36 }, customCanvasRatio: '65:36', maxWidth: 1920, maxHeight: 1080 },
  ];
  for (const v of g7Variants) {
    push('G7', `演示案例 ${v.note}`, {
      widthText: v.widthText, heightText: v.heightText, unit: v.unit,
      ratioSource: v.ratioSource || 'screen',
      standardKey: v.standardKey, standardExactValue: v.standardExactValue,
      canvasMode: v.canvasMode || 'width',
      targetWidth: v.targetWidth || 1920, targetHeight: 1080,
      integerRatio: v.integerRatio, customCanvasRatio: v.customCanvasRatio,
      maxWidth: v.maxWidth, maxHeight: v.maxHeight,
    });
  }

  // —— G8 容差变更组：8 合法 × 2 输入 + 2 非法 = 10 条（DT-191~200）——
  const g8Inputs = [
    { widthText: '14', heightText: '4', unit: 'm' },
    { widthText: '3440', heightText: '1440', unit: 'mm' },
  ];
  for (let i = 0; i < 8; i++) {
    const tol = G8_TOLERANCES[i];
    const inp = g8Inputs[i % 2];
    push('G8', `容差 ${tol} × 输入 ${inp.widthText}×${inp.heightText}`, {
      widthText: inp.widthText, heightText: inp.heightText, unit: inp.unit,
      ratioSource: 'screen', canvasMode: 'width', targetWidth: 1920,
      tolerance: tol,
    });
  }
  for (let i = 0; i < 2; i++) {
    const tol = G8_TOLERANCE_ILLEGAL[i];
    const inp = g8Inputs[i];
    push('G8', `容差非法 ${tol} × 输入 ${inp.widthText}×${inp.heightText}`, {
      widthText: inp.widthText, heightText: inp.heightText, unit: inp.unit,
      ratioSource: 'screen', canvasMode: 'width', targetWidth: 1920,
      tolerance: tol,
    });
  }

  return rows;
}

/* ==========================================================================
   §3 页面驱动（在 HTML 版与 Electron 渲染层内注入同一段脚本）
   ========================================================================== */

/**
 * 🔴 在页面上下文里执行的操作脚本（HTML 与 Electron **完全相同**）。
 * 目的：保证 L3 双版对照是「相同输入、相同操作状态」下的对照。
 * 注意：此处**不产生任何期望值**，只采集可观察结果。
 */
const PAGE_SETUP = `
window.__dtSetInput = function (id, value) {
  var el = document.getElementById(id);
  if (!el) return false;
  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};
window.__dtClick = function (selector) {
  var el = document.querySelector(selector);
  if (!el) return false;
  el.click();
  return true;
};
window.__dtClickByKey = function (containerId, key) {
  var box = document.getElementById(containerId);
  if (!box) return false;
  var items = box.querySelectorAll('[data-key]');
  for (var i = 0; i < items.length; i++) {
    if (items[i].getAttribute('data-key') === key) { items[i].click(); return true; }
  }
  return false;
};
/**
 * 🔒 Core 探针：按 P3-D09 §6.6「注入方式：通过 page.evaluate 调用各自的 Core.*，输出 JSON」
 *    在**每个版本自己的页面上下文**里调用该版本自带的 Core，计算本组的业务结果。
 *    ⚠ 这是**观测通道**（actual），不是期望通道 —— 期望值一律来自 L1 独立 oracle。
 *    ⚠ 目标比例的解析规则镜像 app.js resolveTargetRatio()，
 *       但**只用 Core 原语**（findStandard / computeRatio / parseDimension），
 *       不复制任何业务算法 —— 与 app.js 的分歧会被「DOM 观测 vs Core 观测」的交叉校验暴露。
 */
window.__dtProbeCore = function (spec) {
  var C = window.LedCore;
  if (!C) return null;
  var out = {};

  // 🔒 **生效容差归一化**（🔒 app.js 容差 input 处理器 + 表B PS-01）：
  //    非法容差（0 / -1 / abc）不写入 state → 界面沿用上一个有效值；
  //    本差分器每组开始前把容差复位为默认 0.5 → 非法场景的生效值恒为 0.5。
  var tolerance = (typeof spec.tolerance === 'number' && isFinite(spec.tolerance) && spec.tolerance > 0)
    ? spec.tolerance
    : C.DEFAULT_TOLERANCE_PERCENT;
  out.effectiveTolerance = tolerance;

  // —— ① 尺寸解析 ——
  var w = C.parseDimension(spec.widthText, spec.unit);
  var h = C.parseDimension(spec.heightText, spec.unit);
  var dimsOk = w.ok && h.ok;
  out.dimsOk = dimsOk;
  out.dimsError = dimsOk ? null : (w.ok ? h.error : w.error);
  out.dimsMessage = dimsOk ? '' : (w.ok ? h.message : w.message);

  // —— ② 目标比例（镜像 app.js resolveTargetRatio，只用 Core 原语）——
  var targetRatio = null, targetLabel = '';
  if (spec.ratioSource === 'standard' && spec.standardKey) {
    for (var i = 0; i < C.STANDARDS.length; i++) {
      if (C.STANDARDS[i].name === spec.standardKey) {
        targetRatio = C.STANDARDS[i].exactValue; targetLabel = C.STANDARDS[i].name; break;
      }
    }
  } else if (spec.ratioSource === 'custom') {
    var mm = String(spec.customRatio == null ? '' : spec.customRatio).match(/^\\s*(\\d+)\\s*:\\s*(\\d+)\\s*$/);
    if (mm && Number(mm[1]) > 0 && Number(mm[2]) > 0) {
      var cc = C.computeRatio(Number(mm[1]), Number(mm[2]));
      targetRatio = cc.ok ? cc.ratio : null;
      targetLabel = mm[1] + ':' + mm[2];
    }
  } else if (dimsOk) {
    var sr = C.computeRatio(w.mm, h.mm);
    targetRatio = sr.ok ? sr.ratio : null;
  }
  out.targetRatio = targetRatio;
  out.targetLabel = targetLabel;

  // —— ③ 屏幕实际比例 ——
  if (dimsOk) {
    var s2 = C.computeRatio(w.mm, h.mm);
    out.screenRatio = s2.ratio;
    out.screenDecimal = s2.decimal;
    out.screenReducedText = s2.reducedText;
    out.screenExact = s2.exact;
    out.screenNearestText = s2.nearest ? s2.nearest.text : null;
  } else {
    out.screenRatio = null; out.screenDecimal = null; out.screenReducedText = null;
    out.screenExact = false; out.screenNearestText = null;
  }

  // —— ④ 画布候选 ——
  var canvas = null;
  if (targetRatio !== null) {
    if (spec.canvasMode === 'width') {
      // 🔒 回落口径（🔒 app.js computeCandidates + primaryCandidate）：
      //    目标宽非法 → 「按宽度」无候选 → 回落「按目标高度」
      if (Number(spec.targetWidth) > 0) {
        canvas = C.canvasFromWidth(Number(spec.targetWidth), targetRatio);
      } else if (Number(spec.targetHeight) > 0) {
        canvas = C.canvasFromHeight(Number(spec.targetHeight), targetRatio);
      }
    } else if (spec.canvasMode === 'height') {
      if (Number(spec.targetHeight) > 0) {
        canvas = C.canvasFromHeight(Number(spec.targetHeight), targetRatio);
      } else if (Number(spec.targetWidth) > 0) {
        canvas = C.canvasFromWidth(Number(spec.targetWidth), targetRatio);
      }
    } else if (spec.canvasMode === 'preset' && spec.preset) {
      // 🔒 与 app.js computeCandidates 的 preset 分支同口径：
      //    ratioErrorPercent 走 core 的 roundErrorPercent（4 位，必要时升 10 位）
      var pDiff = Math.abs(spec.preset.realRatio - targetRatio) / targetRatio * 100;
      canvas = {
        ok: true, error: null,
        outputWidth: spec.preset.width, outputHeight: spec.preset.height,
        outputRatio: spec.preset.realRatio,
        ratioErrorPercent: C.roundErrorPercent(pDiff),
        pixelErrorPercent: 0,
        strictMatch: pDiff !== null && pDiff <= C.EXACT_REL_TOL * 100,
        fitAdvice: C.fitAdvice(spec.preset.width, spec.preset.height, targetRatio),
      };
    } else if (spec.canvasMode === 'custom' && spec.maxWidth && spec.maxHeight) {
      var pair = String(spec.customCanvasRatio || '').match(/^\\s*(\\d+)\\s*:\\s*(\\d+)\\s*$/);
      if (pair) {
        var ic = C.bestIntegerCanvas({ a: Number(pair[1]), b: Number(pair[2]) }, {
          maxWidth: Number(spec.maxWidth), maxHeight: Number(spec.maxHeight), prefer: spec.prefer || 'bounds'
        });
        out.integer = ic.ok ? {
          width: ic.width, height: ic.height, k: ic.k, exact: ic.exact,
          reducedText: ic.reducedText,
          overflowPx: ic.overflowPx, exceedsMaxWidth: ic.exceedsMaxWidth,
          fitsInBounds: ic.fitsInBounds, mode: ic.mode, overflowFallback: ic.overflowFallback,
          withinBounds: ic.withinBounds ? { k: ic.withinBounds.k, width: ic.withinBounds.width, height: ic.withinBounds.height } : null,
          exactSolution: ic.exactSolution ? { k: ic.exactSolution.k, width: ic.exactSolution.width, height: ic.exactSolution.height } : null,
          recommended: ic.recommended ? { k: ic.recommended.k, width: ic.recommended.width, height: ic.recommended.height } : null,
          error: ic.error, note: ic.note, message: ic.message,
        } : { error: ic.error, message: ic.message, note: ic.note, k: ic.k };
        // 🔒 展示口径（需求 §3.5 / app.js computeCandidates）：
        //    当前展示用「不超限且比例精确」的推荐解（recommended），越界解不得占据当前位。
        var shown = ic.ok ? (ic.recommended || ic) : null;
        canvas = ic.ok ? {
          ok: true, error: null,
          outputWidth: shown.width, outputHeight: shown.height, outputRatio: shown.width / shown.height,
          ratioErrorPercent: ic.ratioErrorPercent, pixelErrorPercent: ic.pixelErrorPercent,
          strictMatch: ic.strictMatch, fitAdvice: C.fitAdvice(shown.width, shown.height, shown.width / shown.height),
        } : { ok: false, error: ic.error, message: ic.message };
      }
    }
  }

  // —— ⑤ 画布字段 ——
  if (canvas) {
    out.canvasOk = canvas.ok === true;
    out.outputWidth = canvas.outputWidth;
    out.outputHeight = canvas.outputHeight;
    out.outputRatio = canvas.outputRatio;
    out.ratioErrorPercent = canvas.ratioErrorPercent;
    out.pixelErrorPercent = canvas.pixelErrorPercent;
    out.roundedHeight = typeof canvas.roundedHeight === 'number' ? canvas.roundedHeight : null;
    out.bestRoundedHeight = typeof canvas.bestRoundedHeight === 'number' ? canvas.bestRoundedHeight : null;
    out.roundedWidth = typeof canvas.roundedWidth === 'number' ? canvas.roundedWidth : null;
    out.bestRoundedWidth = typeof canvas.bestRoundedWidth === 'number' ? canvas.bestRoundedWidth : null;
    out.strictMatch = canvas.strictMatch === true;
    out.theoreticalHeightText = canvas.theoreticalHeightText || null;
    out.theoreticalWidthText = canvas.theoreticalWidthText || null;
    out.canvasError = canvas.ok ? null : canvas.error;
    out.canvasMessage = canvas.ok ? '' : (canvas.message || '');
    var fa = canvas.fitAdvice;
    out.fit = (fa && fa.ok) ? {
      mode: fa.mode, cropAxis: fa.cropAxis, pillarboxAxis: fa.pillarboxAxis,
      coverCropAxis: fa.coverCropAxis, containBarAxis: fa.containBarAxis,
      cropPx: fa.cropPx, pillarboxPx: fa.pillarboxPx,
      coverCropPx: fa.coverCropPx, containBarPx: fa.containBarPx,
    } : null;
  } else {
    out.canvasOk = false;
    out.outputWidth = null; out.outputHeight = null; out.outputRatio = null;
    out.ratioErrorPercent = null; out.pixelErrorPercent = null;
    out.roundedHeight = null; out.bestRoundedHeight = null;
    out.roundedWidth = null; out.bestRoundedWidth = null;
    out.strictMatch = false;
    out.theoreticalHeightText = null; out.theoreticalWidthText = null;
    out.canvasError = null; out.canvasMessage = '';
    out.fit = null;
  }

  // —— ⑥ 徽标五态（镜像 app.js renderBadge 的判定优先级 · 🔒 A-08）——
  var badge = null;
  if (!dimsOk) badge = 'RS-01';
  else if (targetRatio === null) badge = 'RS-05';
  else {
    var m = C.matchStandards(targetRatio, tolerance);
    if (!m.isStandard) badge = 'RS-02';
    else if (!out.strictMatch) badge = 'RS-03';
    else badge = 'RS-04';
  }
  out.badge = badge;

  // —— ⑦ 21:9 警示触发（镜像 app.js renderWarnBar · 🔒 A-01）——
  var warnTriggered = false;
  if (dimsOk && targetRatio !== null) {
    var m2 = C.matchStandards(targetRatio, tolerance);
    if (!m2.isStandard) warnTriggered = true;
    else {
      var s21 = null;
      for (var j = 0; j < m2.matches.length; j++) if (m2.matches[j].name === '21:9') s21 = m2.matches[j];
      if (s21) {
        var d21 = Math.abs(targetRatio - s21.value) / s21.value * 100;
        warnTriggered = d21 <= 2.5;
      }
    }
  }
  out.warnTriggered = warnTriggered;

  // —— ⑧ 匹配表 ——
  if (targetRatio !== null) {
    var m3 = C.matchStandards(targetRatio, tolerance);
    out.matches = m3.matches.map(function (x) {
      return {
        name: x.name, value: x.value, kind: x.kind,
        diffPercent: x.diffPercent, diffPercentText: x.diffPercentText,
        exactMatch: x.exactMatch, withinTolerance: x.withinTolerance,
        isTrueStandard: x.isTrueStandard, closest: x.closest,
      };
    });
    out.isStandard = m3.isStandard;
    out.closestName = m3.closest ? m3.closest.name : null;
  } else {
    out.matches = []; out.isStandard = false; out.closestName = null;
  }

  // —— ⑨ 复制分辨率载荷（🔒 BM-28：纯文本 宽×高，U+00D7，无千分位）——
  out.resolutionText = (out.outputWidth && out.outputHeight)
    ? (String(out.outputWidth) + '\u00d7' + String(out.outputHeight)) : null;

  return out;
};
window.__dtApply = function (spec) {
  // 复位到确定性初始态（禁用持久化干扰）
  var reset = document.getElementById('btn-reset');
  if (reset) reset.click();
  // 单位
  if (spec.unit) {
    window.__dtClick('.unit-segment[data-unit="' + spec.unit + '"]');
  }
  // 宽高
  window.__dtSetInput('input-width', spec.widthText);
  window.__dtSetInput('input-height', spec.heightText);
  // 比例来源
  if (spec.ratioSource === 'standard') {
    window.__dtClick('.ratio-source-segment[data-source="standard"]');
    if (spec.standardKey) window.__dtClickByKey('standard-list', spec.standardKey);
  } else if (spec.ratioSource === 'custom') {
    window.__dtClick('.ratio-source-segment[data-source="custom"]');
    window.__dtSetInput('input-custom-ratio', spec.customRatio || '');
  } else {
    window.__dtClick('.ratio-source-segment[data-source="screen"]');
  }
  // 画布模式
  window.__dtClick('.canvas-mode-segment[data-mode="' + spec.canvasMode + '"]');
  if (spec.canvasMode === 'preset' && spec.presetKey) {
    window.__dtClickByKey('preset-list', spec.presetKey);
  }
  if (spec.canvasMode === 'custom') {
    window.__dtSetInput('input-canvas-ratio', spec.customCanvasRatio || '');
    window.__dtSetInput('input-canvas-max-width', spec.maxWidth == null ? '' : spec.maxWidth);
    window.__dtSetInput('input-canvas-max-height', spec.maxHeight == null ? '' : spec.maxHeight);
    window.__dtClick('.prefer-segment[data-prefer="' + (spec.prefer || 'bounds') + '"]');
  }
  // 目标宽高
  if (spec.targetWidth != null) window.__dtSetInput('input-target-width', spec.targetWidth);
  if (spec.targetHeight != null) window.__dtSetInput('input-target-height', spec.targetHeight);
  // 容差：🔴 先复位为默认 0.5（建立确定性基线），再施加本组的容差值
  //    —— 非法容差（0 / -1 / abc）在界面上不生效，会沿用这个 0.5 基线。
  window.__dtSetInput('input-tolerance', '0.5');
  if (spec.tolerance != null) window.__dtSetInput('input-tolerance', spec.tolerance);
  // 演示案例（必须**最后**载入 —— 案例自带尺寸，会覆盖前面的输入）
  if (spec.demoId && typeof spec.demoIndex === 'number') {
    var demos = document.querySelectorAll('#demo-list .list__item');
    if (demos[spec.demoIndex]) demos[spec.demoIndex].click();
  }
  return true;
};
`;

/** 采集可观察结果（HTML 与 Electron 完全相同） */
const PAGE_COLLECT = `
(function () {
  function g(id) { var e = document.getElementById(id); return e ? e.textContent.trim() : null; }
  function vis(id) {
    var e = document.getElementById(id);
    if (!e) return false;
    var cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && e.style.display !== 'none';
  }
  var badgeEl = document.getElementById('result-badge');
  var badgeText = badgeEl ? badgeEl.textContent.trim() : null;
  var badgeCode = null;
  if (badgeEl) {
    var cls = badgeEl.className || '';
    if (cls.indexOf('badge--error') >= 0) badgeCode = 'RS-01';
    else if (cls.indexOf('badge--muted') >= 0) badgeCode = 'RS-05';
    else if (cls.indexOf('badge--warning') >= 0) badgeCode = 'RS-02';
    else if (cls.indexOf('badge--info') >= 0) badgeCode = 'RS-03';
    else if (cls.indexOf('badge--success') >= 0) badgeCode = 'RS-04';
  }
  var matchRows = [];
  var mb = document.getElementById('match-body');
  if (mb) {
    var trs = mb.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      var tds = trs[i].children;
      matchRows.push({
        name: tds[0] ? tds[0].textContent.replace(/最接近|俗称/g, '').trim() : null,
        value: tds[1] ? tds[1].textContent.trim() : null,
        diff: tds[2] ? tds[2].textContent.trim() : null,
        std: tds[3] ? tds[3].textContent.trim() : null,
        closest: trs[i].className.indexOf('is-closest') >= 0,
      });
    }
  }
  var tableRows = [];
  var tb = document.getElementById('table-body');
  if (tb) {
    var trs2 = tb.querySelectorAll('tr');
    for (var j = 0; j < trs2.length; j++) {
      var tds2 = trs2[j].children;
      tableRows.push({
        name: tds2[0] ? tds2[0].textContent.trim() : null,
        value: tds2[1] ? tds2[1].textContent.trim() : null,
        ratioErr: tds2[2] ? tds2[2].textContent.trim() : null,
        pixelErr: tds2[3] ? tds2[3].textContent.trim() : null,
      });
    }
  }
  var cands = [];
  var cl = document.getElementById('candidate-list');
  if (cl) {
    var items = cl.querySelectorAll('.mode-item');
    for (var k = 0; k < items.length; k++) {
      var head = items[k].querySelector('.mode-item__head');
      var meta = items[k].querySelector('.mode-item__meta');
      cands.push({
        title: head ? head.querySelector('.mode-item__title').textContent.trim() : null,
        res: head ? head.querySelector('.mode-item__res').textContent.trim() : null,
        meta: meta ? meta.textContent.replace(/\\s+/g, ' ').trim() : null,
      });
    }
  }
  return {
    ratioValue: g('ratio-value'),
    ratioSuffix: g('ratio-suffix'),
    approxLine: g('approx-line'),
    approxVisible: vis('approx-line'),
    resValue: g('res-value'),
    coreNote: g('core-note'),
    badgeText: badgeText,
    badgeCode: badgeCode,
    badgeClass: badgeEl ? badgeEl.className : null,
    warnVisible: vis('warn-bar'),
    warnText: g('warn-text'),
    errorWidth: g('error-width'),
    errorHeight: g('error-height'),
    errorCanvasRatio: g('error-canvas-ratio'),
    matchRows: matchRows,
    tableRows: tableRows,
    candidates: cands,
    liveResults: g('live-results'),
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
    toleranceValue: (function () {
      var e = document.getElementById('input-tolerance');
      return e ? e.value : null;
    })(),
    canvasRatioValue: (function () {
      var e = document.getElementById('input-canvas-ratio');
      return e ? e.value : null;
    })(),
    maxWidthValue: (function () {
      var e = document.getElementById('input-canvas-max-width');
      return e ? e.value : null;
    })(),
    maxHeightValue: (function () {
      var e = document.getElementById('input-canvas-max-height');
      return e ? e.value : null;
    })(),
  };
})
`;

/* ==========================================================================
   §4 比对引擎
   ========================================================================== */

/** 浮点相对容差（P3-D09 §6.4：|a−b| ≤ 1e-12 × max(1,|a|)） */
function numEq(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (typeof a !== 'number' || typeof b !== 'number') return a === b;
  if (a === b) return true;
  const tol = 1e-12 * Math.max(1, Math.abs(a));
  return Math.abs(a - b) <= tol;
}

/** 字符串逐字符比较（零容差） */
function strEq(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return String(a) === String(b);
}

/**
 * 从采集结果中抽取可比较字段（供 L3 双版对照）。
 * 🔴 字段清单对应 P3-D09 §6.3 的 F1~F30 中「UI 可观察」的部分。
 */
function extractObservable(c) {
  return {
    ratioValue: c.ratioValue,
    ratioSuffix: c.ratioSuffix,
    approxVisible: c.approxVisible,
    resValue: c.resValue,
    badgeCode: c.badgeCode,
    badgeText: c.badgeText,
    warnVisible: c.warnVisible,
    warnText: c.warnText,
    errorWidth: c.errorWidth,
    errorHeight: c.errorHeight,
    errorCanvasRatio: c.errorCanvasRatio,
    matchRowCount: c.matchRows.length,
    matchRows: c.matchRows,
    tableRows: c.tableRows,
    candidateCount: c.candidates.length,
    candidates: c.candidates,
    ratioSourceActive: c.ratioSourceActive,
    canvasModeActive: c.canvasModeActive,
    preferActive: c.preferActive,
    unitActive: c.unitActive,
    toleranceValue: c.toleranceValue,
  };
}

/** 键集合双向 diff */
function keyDiff(a, b) {
  const ka = Object.keys(a || {}).sort();
  const kb = Object.keys(b || {}).sort();
  const onlyA = ka.filter((k) => !kb.includes(k));
  const onlyB = kb.filter((k) => !ka.includes(k));
  return { onlyA, onlyB, empty: onlyA.length === 0 && onlyB.length === 0 };
}

/* ==========================================================================
   §5 主流程
   ========================================================================== */

async function main() {
  const argv = process.argv.slice(2);
  const listOnly = argv.includes('--list');
  const groupArg = (argv.find((a) => a.startsWith('--group=')) || '').split('=')[1];
  const outJson = (argv.find((a) => a.startsWith('--out=')) || '').split('=')[1];

  console.log('=== P4-B · 200 组差分测试（DEC-15）===\n');

  /* ---- 5.0 独立性机器闸 ---- */
  const gate = runIndependenceGate();
  console.log('【0】独立性自检（机器闸 · TK-93 / P3-D09 §6.6）');
  for (const r of gate.results) {
    console.log(`     ${r.ok ? '✅' : '❌'} ${r.file} → ${r.ok ? '0 命中（未引用 core.js / acceptance.mjs）' : '命中 ' + r.hits.length + ' 处'}`);
    for (const h of r.hits) console.log(`        ↳ L${h.line}: ${h.label} → ${h.text}`);
  }
  if (!gate.ok) {
    console.error('\n❌ 独立性自检失败 —— 差分器不得引用产品代码。退出码 1。');
    process.exit(1);
  }

  /* ---- 5.1 构建输入矩阵 ---- */
  const matrix = buildMatrix();
  const byGroup = {};
  for (const r of matrix) byGroup[r.group] = (byGroup[r.group] || 0) + 1;
  console.log(`\n【1】输入矩阵：共 ${matrix.length} 组`);
  console.log('     ' + Object.keys(byGroup).map((g) => `${g}=${byGroup[g]}`).join(' ｜ '));
  const EXPECT_GROUP = { G1: 30, G2: 40, G3: 20, G4: 30, G5: 30, G6: 30, G7: 10, G8: 10 };
  const groupOk = Object.keys(EXPECT_GROUP).every((g) => byGroup[g] === EXPECT_GROUP[g]);
  console.log(`     ${groupOk ? '✅' : '❌'} 分组配比与 P3-D09 §6.2 一致（30/40/20/30/30/30/10/10）`);
  if (matrix.length !== 200) {
    console.error(`❌ 输入矩阵条数 = ${matrix.length}，应为 200。退出码 1。`);
    process.exit(1);
  }
  if (listOnly) {
    for (const r of matrix) console.log(`  ${r.id} [${r.group}] ${r.note}`);
    process.exit(0);
  }

  /* ---- 5.2 加载 L1 oracle ---- */
  const O = await loadOracle();
  console.log('\n【2】L1 独立 oracle：已加载（纯函数，无产品代码依赖）');

  /* ---- 5.3 加载 L2 黄金向量 ---- */
  const goldenPath = path.join(VECTORS_DIR, 'golden.json');
  let golden = { vectors: [], meta: {} };
  if (fs.existsSync(goldenPath)) {
    golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  }
  const goldenConfirmed = (golden.vectors || []).filter((v) => v.confirmation_status === 'confirmed');
  const goldenPending = (golden.vectors || []).filter((v) => v.confirmation_status !== 'confirmed');
  console.log(`\n【3】L2 黄金向量：共 ${(golden.vectors || []).length} 条 ｜ 已确认 ${goldenConfirmed.length} 条 ｜ 待确认 ${goldenPending.length} 条`);
  if (goldenPending.length > 0) {
    console.log(`     ⚠️ ${goldenPending.length} 条待项目负责人确认 → 其覆盖字段在统计中记为「未覆盖」（计入 M）`);
  }

  /* ---- 5.4 启动 HTML 版（Chrome）与 Electron 版 ---- */
  const rows = groupArg ? matrix.filter((r) => r.group === groupArg) : matrix;

  let pw = null;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('\n❌ 阻塞：playwright-core 不可用，无法驱动 HTML 版与 Electron 版。');
    console.error('   ' + e.message);
    process.exit(3);
  }

  const { chromium, _electron } = pw;

  console.log('\n【4】启动双版本驱动');
  // —— HTML 版 ——
  let browser = null;
  let htmlPage = null;
  const htmlConsole = [];
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    htmlPage = await ctx.newPage();
    htmlPage.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') htmlConsole.push(m.type() + ': ' + m.text()); });
    htmlPage.on('pageerror', (e) => htmlConsole.push('pageerror: ' + e.message));
    await htmlPage.goto(pathToFileURL(path.join(REPO, 'index.html')).href, { waitUntil: 'domcontentloaded' });
    await htmlPage.evaluate(PAGE_SETUP);
    console.log('     ✅ HTML 版已就绪（Chrome · file://index.html）');
  } catch (e) {
    console.error('     ❌ HTML 版启动失败：' + e.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(3);
  }

  // —— Electron 桌面版 ——
  let electronApp = null;
  let electronWin = null;
  let electronAttempts = 0;
  const elConsole = [];
  const elPageErrors = [];
  try {
    const launched = await launchElectronWithRetry(pw);
    electronApp = launched.app;
    electronAttempts = launched.attempts;
    electronWin = await electronApp.firstWindow({ timeout: 30000 });
    electronWin.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') elConsole.push(m.type() + ': ' + m.text()); });
    electronWin.on('pageerror', (e) => elPageErrors.push(String(e && e.message ? e.message : e)));
    await electronWin.waitForLoadState('domcontentloaded');
    await electronWin.waitForTimeout(1500);
    await electronWin.evaluate(PAGE_SETUP);
    console.log(`     ✅ Electron 桌面版已就绪（app://bundle/index.html）${electronAttempts > 1 ? ' ｜ 启动重试 ' + electronAttempts + ' 次（单实例锁竞争）' : ''}`);
  } catch (e) {
    console.error('     ❌ Electron 桌面版启动失败：' + e.message);
    console.error('     🔴 这是「阻塞：待研发完成」，不得伪造通过。');
    if (browser) await browser.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    process.exit(3);
  }

  /* ---- 5.4.5 🔴 探针自检（TK-134）----
     目的：防止「某段分支整段未执行」被误判为「零差异」。
     做法：注入一组**已知答案**的输入，断言探针**确实产出了预期字段**。
     🔴 若探针因任何原因（转义、序列化、分支遗漏）未产出这些字段，
        本自检即失败 → 退出码 3 → **「差分 0 条」结论一律作废**。
     🔴 这正是本轮实测踩到的真实故障：PAGE_SETUP 模板字面量里的 \s / \d 被 JS 吞掉，
        导致整数倍分支整段未执行，而当时差分仍报「0 差异」（假通过）。 */
  console.log('\n【4.5】探针自检（TK-134 · 防「分支静默未执行」被误判为零差异）');
  let probeSelfCheckOk = true;
  try {
    const probeSpec = {
      unit: 'm', ratioSource: 'screen', canvasMode: 'custom',
      targetWidth: 1920, targetHeight: 1080, prefer: 'bounds', tolerance: 0.5,
      widthText: '14', heightText: '4',
      integerRatio: { a: 65, b: 36 },
      customCanvasRatio: '65:36', maxWidth: 1920, maxHeight: 1080,
    };
    const probeOut = await htmlPage.evaluate((s) => window.__dtProbeCore(s), probeSpec);
    const probeChecks = [
      ['integer 分支已执行', !!(probeOut && probeOut.integer)],
      ['withinBounds.k = 29', !!(probeOut && probeOut.integer && probeOut.integer.withinBounds && probeOut.integer.withinBounds.k === 29)],
      ['exactSolution.k = 30', !!(probeOut && probeOut.integer && probeOut.integer.exactSolution && probeOut.integer.exactSolution.k === 30)],
      ['recommended.k = 29', !!(probeOut && probeOut.integer && probeOut.integer.recommended && probeOut.integer.recommended.k === 29)],
      ['outputWidth = 1885', !!(probeOut && probeOut.outputWidth === 1885)],
      ['fitAdvice 已产出', !!(probeOut && probeOut.fit && probeOut.fit.mode)],
      ['matches 16 行', !!(probeOut && probeOut.matches && probeOut.matches.length === 16)],
      ['自定义比例正则可用', await htmlPage.evaluate(() => {
        // 直接验证页内正则确实能匹配 a:b 形式（模板字面量转义问题的探针）
        const m = String('65:36').match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
        return !!(m && Number(m[1]) === 65 && Number(m[2]) === 36);
      })],
    ];
    for (const [name, pass] of probeChecks) {
      console.log(`     ${pass ? '✅' : '❌'} ${name}`);
      if (!pass) probeSelfCheckOk = false;
    }
  } catch (e) {
    probeSelfCheckOk = false;
    console.log('     ❌ 探针自检异常：' + e.message);
  }
  if (!probeSelfCheckOk) {
    console.error('\n❌ 探针自检失败 —— 探针存在分支未执行/字段未产出的情况。');
    console.error('   本轮「差异条数 = 0」的结论**一律作废**（可能是假通过）。退出码 3。');
    if (browser) await browser.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    process.exit(3);
  }
  console.log('     ✅ 探针自检通过（关键分支均已确认执行）');

  /* ---- 5.5 逐组执行 ---- */
  console.log(`\n【5】执行 ${rows.length} 组（每组：L1 期望 → HTML 观测 → Electron 观测 → 三层判定）\n`);

  const results = [];
  let diffCount = 0;         // N：字段级不一致项总数
  let uncoveredCount = 0;    // M：未覆盖字段数（字段级，出现一次计一次）
  const uncoveredDetail = {};
  const diffDetail = [];
  const uncoveredFields = new Set();
  const coveredFields = new Set();
  let coveredTotal = 0;
  let coveredByL1 = 0;
  let coveredByL2 = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const spec = Object.assign({}, row.spec);

    // —— 演示案例：补下标 ——
    if (spec.demoId) {
      const idx = G7_DEMOS.findIndex((d) => d.id === spec.demoId);
      spec.demoIndex = idx;
    }

    // —— L1 期望 ——
    let l1 = null;
    let l1Error = null;
    try {
      l1 = O.ownExpect(spec);
    } catch (e) {
      l1Error = e.message;
    }

    // —— HTML 观测 ——
    let htmlObs = null;
    let htmlCore = null;
    let htmlErr = null;
    try {
      await htmlPage.evaluate((s) => window.__dtApply(s), spec);
      htmlObs = await htmlPage.evaluate('(' + PAGE_COLLECT + ')()');
      htmlCore = await htmlPage.evaluate((s) => window.__dtProbeCore(s), spec);
    } catch (e) { htmlErr = e.message; }

    // —— Electron 观测（DOM 通道 + Core 通道）——
    let elObs = null;
    let elCore = null;
    let elErr = null;
    try {
      await electronWin.evaluate((s) => window.__dtApply(s), spec);
      elObs = await electronWin.evaluate('(' + PAGE_COLLECT + ')()');
      elCore = await electronWin.evaluate((s) => window.__dtProbeCore(s), spec);
    } catch (e) { elErr = e.message; }

    const rec = {
      id: row.id, group: row.group, note: row.note, spec,
      l1: l1Error ? null : l1, l1Error,
      html: htmlObs, htmlCore, htmlError: htmlErr,
      electron: elObs, elCore, electronError: elErr,
      diffs: [], uncovered: [], verdict: 'UNKNOWN',
    };

    if (htmlErr || elErr || l1Error) {
      rec.verdict = 'BLOCKED';
      rec.diffs.push({ field: '_execution', layer: 'L0', expected: '采集成功', actual: htmlErr || elErr || l1Error });
      diffCount += 1;
      results.push(rec);
      console.log(`  ⚠️ ${row.id} [${row.group}] ${row.note} → 采集异常：${htmlErr || elErr || l1Error}`);
      continue;
    }

    const h = extractObservable(htmlObs);
    const e = extractObservable(elObs);

    /* ---- L3：双版比对（仅作交叉校验，不可单独作为正确性判据）---- */
    const l3Diffs = [];
    const l3Keys = keyDiff(h, e);
    if (!l3Keys.empty) {
      l3Diffs.push({ field: '_keySet', layer: 'L3', expected: l3Keys.onlyA.length ? l3Keys.onlyA : '∅', actual: l3Keys.onlyB.length ? l3Keys.onlyB : '∅' });
    }
    for (const k of Object.keys(h)) {
      if (k === 'matchRows' || k === 'candidates' || k === 'tableRows') {
        const a = JSON.stringify(h[k]);
        const b = JSON.stringify(e[k]);
        if (a !== b) l3Diffs.push({ field: k, layer: 'L3', expected: a, actual: b });
        continue;
      }
      const a = h[k]; const b = e[k];
      const eq = typeof a === 'boolean' || typeof b === 'boolean' ? a === b
        : (typeof a === 'number' || typeof b === 'number') ? numEq(a, b)
          : strEq(a, b);
      if (!eq) l3Diffs.push({ field: k, layer: 'L3', expected: a, actual: b });
    }

    /* ---- L1：独立 oracle 判定（对照 Core 通道 —— 高精度、可逐字段覆盖）---- */
    const l1Diffs = [];
    const l1Uncovered = [];
    const cov = new Map((l1._covered || []).map((c) => [c.field, c.layer]));

    /**
     * 判定单个字段。
     * 🔒 口径（P3-D09 §6.4）：
     *   - 字符串逐字符 ===（零容差）
     *   - 整数严格 ===
     *   - 浮点 |a−b| ≤ 1e-12 × max(1,|a|)（相对容差）
     *   - 布尔/枚举严格 ===
     *   - 键集合双向 diff = ∅
     */
    const check = (field, expected, actual, layer) => {
      if (expected === undefined) { l1Uncovered.push(field); uncoveredCount += 1; uncoveredFields.add(field); return; }
      coveredTotal += 1;
      if (layer === 'L1') coveredByL1 += 1; else if (layer === 'L2') coveredByL2 += 1;
      coveredFields.add(field);
      const eq = typeof expected === 'boolean' || typeof actual === 'boolean' ? expected === actual
        : (typeof expected === 'number' || typeof actual === 'number') ? numEq(expected, actual)
          : strEq(expected, actual);
      if (!eq) l1Diffs.push({ field, layer, expected, actual });
    };

    /**
     * 同时对 HTML 与 Electron 两个 Core 通道判定（任一不一致即记差异）。
     * 🔒 覆盖口径三分法：
     *    ① **已覆盖**：期望值存在且两侧都有实际值 → 计入 coveredTotal；
     *    ② **不适用**：期望值不存在（该字段对本场景无意义，如「按宽度」模式没有 roundedWidth）
     *       且两侧实际值均为 null → **既不计入覆盖、也不计入未覆盖**；
     *    ③ **未覆盖**：期望值存在但取不到实际值（或反之）→ 计入 M。
     *    ② 与 ③ 必须分开，否则 M 会虚高。
     */
    const checkBoth = (field, expected, pick, layer) => {
      const hv = pick(htmlCore);
      const ev = pick(elCore);
      if (expected === undefined) {
        // 期望值不存在 → 判「不适用」还是「未覆盖」取决于实际值
        if ((hv === null || hv === undefined) && (ev === null || ev === undefined)) {
          rec.naFields = rec.naFields || [];
          rec.naFields.push(field);
          return;                                   // ② 不适用
        }
        l1Uncovered.push(field); uncoveredCount += 1; uncoveredFields.add(field);
        return;                                     // ③ 未覆盖
      }
      if (hv === undefined || ev === undefined) {
        l1Uncovered.push(field); uncoveredCount += 1; uncoveredFields.add(field); return;
      }
      coveredTotal += 1;
      if (layer === 'L1') coveredByL1 += 1; else if (layer === 'L2') coveredByL2 += 1;
      coveredFields.add(field);
      const eqH = typeof expected === 'boolean' || typeof hv === 'boolean' ? expected === hv
        : (typeof expected === 'number' || typeof hv === 'number') ? numEq(expected, hv) : strEq(expected, hv);
      const eqE = typeof expected === 'boolean' || typeof ev === 'boolean' ? expected === ev
        : (typeof expected === 'number' || typeof ev === 'number') ? numEq(expected, ev) : strEq(expected, ev);
      if (!eqH) l1Diffs.push({ field, layer, side: 'html', expected, actual: hv });
      if (!eqE) l1Diffs.push({ field, layer, side: 'electron', expected, actual: ev });
    };

    const hc = htmlCore || {};
    const ec = elCore || {};
    // 🔒 空态判定（用于 DOM 与 Core 两侧的空值归一化）：
    //    ① dimsInvalid —— 尺寸非法（空/非法字符/非正数）→ 无任何结果
    //    ② noTarget   —— 尺寸合法但**目标比例为空**（自定义比例非法 / 未选标准）
    //       → 屏幕比例仍显示，但**画布**无输出（#res-value = "—"）
    const dimsInvalid = hc.dimsOk === false;
    const noTarget = !dimsInvalid && hc.targetRatio === null;

    // —— F1~F4：比例四件 ——
    checkBoth('ratio', l1.ratio, (x) => x.screenRatio, 'L1');
    checkBoth('decimal', l1.decimal, (x) => x.screenDecimal, 'L1');
    checkBoth('reducedText', l1.reducedText, (x) => x.screenReducedText, 'L1');
    checkBoth('exact', l1.exact, (x) => x.screenExact, 'L1');
    checkBoth('nearest.text', l1.nearestText, (x) => x.screenNearestText, 'L1');

    // —— F5/F6：两类误差 ——
    checkBoth('ratioErrorPercent', l1.ratioErrorPercent, (x) => x.ratioErrorPercent, 'L1');
    checkBoth('pixelErrorPercent', l1.pixelErrorPercent, (x) => x.pixelErrorPercent, 'L1');

    // —— F7~F9：取整两值 ——
    checkBoth('roundedHeight', l1.roundedHeight, (x) => x.roundedHeight, 'L1');
    checkBoth('bestRoundedHeight', l1.bestRoundedHeight, (x) => x.bestRoundedHeight, 'L1');
    checkBoth('roundedWidth', l1.roundedWidth, (x) => x.roundedWidth, 'L1');
    checkBoth('bestRoundedWidth', l1.bestRoundedWidth, (x) => x.bestRoundedWidth, 'L1');

    // —— F10/F11/F12：输出尺寸与严格匹配 ——
    checkBoth('outputWidth', l1.outputWidth, (x) => x.outputWidth, 'L1');
    checkBoth('outputHeight', l1.outputHeight, (x) => x.outputHeight, 'L1');
    checkBoth('outputRatio', l1.outputRatio, (x) => x.outputRatio, 'L1');
    checkBoth('strictMatch', l1.strictMatch, (x) => x.strictMatch, 'L1');

    // —— F13~F15/F17：整数倍双解 ——
    // 🔒 统一取 **k**（整数倍解的标尺），对象形态在 JSON 报告里另存
    checkBoth('withinBounds.k', l1.withinBounds ? l1.withinBounds.k : undefined,
      (x) => (x.integer && x.integer.withinBounds) ? x.integer.withinBounds.k : null, 'L1');
    checkBoth('exactSolution.k', l1.exactSolution ? l1.exactSolution.k : undefined,
      (x) => (x.integer && x.integer.exactSolution) ? x.integer.exactSolution.k : null, 'L1');
    checkBoth('overflowPx', l1.overflowPx, (x) => (x.integer ? x.integer.overflowPx : null), 'L1');
    checkBoth('recommended.k', l1.recommended ? l1.recommended.k : undefined,
      (x) => (x.integer && x.integer.recommended) ? x.integer.recommended.k : null, 'L1');
    // 双解的完整形态（k + 宽高）也逐字比对
    checkBoth('withinBounds.wh', l1.withinBounds ? (l1.withinBounds.width + 'x' + l1.withinBounds.height) : undefined,
      (x) => (x.integer && x.integer.withinBounds) ? (x.integer.withinBounds.width + 'x' + x.integer.withinBounds.height) : null, 'L1');
    checkBoth('exactSolution.wh', l1.exactSolution ? (l1.exactSolution.width + 'x' + l1.exactSolution.height) : undefined,
      (x) => (x.integer && x.integer.exactSolution) ? (x.integer.exactSolution.width + 'x' + x.integer.exactSolution.height) : null, 'L1');

    // —— F18：21:9 警示触发 ——
    checkBoth('warnTriggered', l1.warnTriggered, (x) => x.warnTriggered, 'L1');

    // —— F20~F22：适配建议 ——
    checkBoth('fitMode', l1.fitMode, (x) => (x.fit ? x.fit.mode : null), 'L1');
    checkBoth('fitCropAxis', l1.fitCropAxis, (x) => (x.fit ? x.fit.cropAxis : null), 'L1');
    checkBoth('fitPillarboxAxis', l1.fitPillarboxAxis, (x) => (x.fit ? x.fit.pillarboxAxis : null), 'L1');
    checkBoth('fitCoverCropAxis', l1.fitCoverCropAxis, (x) => (x.fit ? x.fit.coverCropAxis : null), 'L1');
    checkBoth('fitContainBarAxis', l1.fitContainBarAxis, (x) => (x.fit ? x.fit.containBarAxis : null), 'L1');
    checkBoth('fitCropPx', l1.fitCropPx, (x) => (x.fit ? x.fit.cropPx : null), 'L1');
    checkBoth('fitPillarboxPx', l1.fitPillarboxPx, (x) => (x.fit ? x.fit.pillarboxPx : null), 'L1');
    checkBoth('fitCoverCropPx', l1.fitCoverCropPx, (x) => (x.fit ? x.fit.coverCropPx : null), 'L1');
    checkBoth('fitContainBarPx', l1.fitContainBarPx, (x) => (x.fit ? x.fit.containBarPx : null), 'L1');

    // —— F24：复制分辨率载荷 ——
    checkBoth('resolutionText', l1.resolutionText, (x) => x.resolutionText, 'L1');

    // —— F26/F27：错误码与文案 ——
    checkBoth('error', l1.dimsError, (x) => x.dimsError, 'L1');
    checkBoth('message', l1.dimsMessage, (x) => x.dimsMessage, 'L1');

    // —— F28：徽标五态 ——
    checkBoth('badge', l1.badge, (x) => x.badge, 'L1');

    // —— F29：匹配表 ——
    // 🔒 目标比例为 null 时匹配表**为空**（0 行，无 closest）→ 期望值随场景变化
    const expectMatchCount = l1.matches ? l1.matches.length : 0;
    const expectClosestCount = l1.matches ? l1.matches.filter((m) => m.closest).length : 0;
    checkBoth('matches.count', expectMatchCount, (x) => (x.matches ? x.matches.length : null), 'L1');
    checkBoth('matches.closestUnique', expectClosestCount, (x) => (x.matches ? x.matches.filter((m) => m.closest).length : null), 'L1');
    checkBoth('matches.names', (l1.matches || []).map((m) => m.name).join(','), (x) => (x.matches ? x.matches.map((m) => m.name).join(',') : ''), 'L1');

    // —— F30：键集合双向 diff ——
    check('keys', '∅', l3Keys.empty ? '∅' : '≠∅', 'L1');

    // —— 附加交叉校验：DOM 观测 vs Core 观测（同一版本内自洽性）——
    //    若二者不一致 → 说明 app.js 的渲染路径与 core 结果脱节（架构问题）。
    // 🔒 空态归一化：尺寸非法时 DOM 显示 "— : —" / "—"，Core 侧为 null → 两侧都归一为 '—'
    const normDomRatio = (() => {
      if (!h.ratioValue) return null;
      const t = String(h.ratioValue).replace(/\s/g, '').replace(/:1$/, '');
      return (t === '—:—' || t === '—') ? '—' : t;
    })();
    const normCoreRatio = (hc.screenDecimal != null) ? hc.screenDecimal
      : (normDomRatio === '—' ? '—' : null);
    // 🔒 屏幕比例：目标比例为空时屏幕比例**仍然有效**（尺寸合法）→ Core 侧有值，DOM 侧也有值
    // 🔒 空态时 DOM 的 #res-value 为 "—"（parseResDim 返回 null），
    //    Core 侧同样无输出 → 两侧统一归一为 '—'（不适用语义一致即通过）
    const domDim = (which) => {
      const v = parseResDim(h.resValue, which);
      if (v !== null) return v;
      return (h.resValue === '—' || h.resValue === null) ? '—' : null;
    };
    const normDomW = domDim('w');
    // 🔒 无画布输出时 DOM 恒显示 "—"（三种成因：尺寸非法 / 目标比例为空 / 整数倍无解）
    const normCoreW = (hc.outputWidth != null) ? hc.outputWidth
      : (normDomW === '—' ? '—' : null);
    const normDomH = domDim('h');
    const normCoreH = (hc.outputHeight != null) ? hc.outputHeight
      : (normDomH === '—' ? '—' : null);
    // 🔒 **目标宽/高非法时的回落口径**（🔒 app.js computeCandidates）：
    //    目标宽为 0 → 「按宽度」模式**不产出候选** → primaryCandidate 回落��
    //    第一个候选（「按目标高度」）→ 界面显示的是**按高度**算出的画布。
    //    Core 探针的 custom 分支同理：目标宽非法时该模式无输出。
    const targetWidthInvalid = !(Number(spec.targetWidth) > 0);
    const targetHeightInvalid = !(Number(spec.targetHeight) > 0);
    const fallbackToHeight = (spec.canvasMode === 'width' && targetWidthInvalid && !targetHeightInvalid);
    // 🔒 **单位可达性守卫**：UI 的单位分段只提供 m / cm / mm 三项，
    //    非法单位（如 'x'）**在界面上不可表达** —— Core 探针能报 error='unit'，
    //    但 DOM 仍停留在上一个合法单位 → 两侧本就不可能一致。
    //    故此类场景**跳过 DOM↔Core 自洽性交叉校验**（L1 层对 error/message 的判定仍照常进行）。
    const unitReachable = ['m', 'cm', 'mm'].indexOf(spec.unit) >= 0;
    if (unitReachable) {
      check('domVsCore.ratio', normDomRatio, normCoreRatio, 'L1');
      check('domVsCore.outputWidth', normDomW, normCoreW, 'L1');
      check('domVsCore.outputHeight', normDomH, normCoreH, 'L1');
      // 🔒 DOM 徽标文本含图标前缀（▲/✓/!/Δ），Core 探针给的是代码（RS-01~RS-05）
      //    → 用 DOM 的 class 判定出的代码比对（extractObservable 已归一为 badgeCode）
      check('domVsCore.badge', h.badgeCode, (hc.badge || null), 'L1');
    } else {
      rec.naFields = rec.naFields || [];
      rec.naFields.push('domVsCore.*（单位在 UI 上不可表达）');
    }

    /* ---- L2：黄金向量（仅 confirmed 生效）---- */
    const l2Diffs = [];
    const l2Uncovered = [];
    for (const v of goldenConfirmed) {
      if (!v.expected) continue;
      const entry = v.expected[v.field] !== undefined ? v.expected[v.field] : null;
      if (entry === null || entry === undefined) {
        l2Uncovered.push(v.id + ':' + v.field);
        uncoveredCount += 1;
        uncoveredFields.add(v.field);
        continue;
      }
      coveredTotal += 1; coveredByL2 += 1; coveredFields.add(v.field);
      let actual = null;
      if (v.field === 'fitAdvice.describeFit') {
        actual = findDescribeFit(h.candidates) ;
      } else if (v.field === 'warnText') {
        actual = h.warnText;
      } else if (v.field === 'badge') {
        actual = h.badgeText;
      } else if (v.field === 'resolutionText') {
        actual = findResolutionText(h);
      } else if (v.field === 'overflowFallback') {
        actual = findOverflowFallback(h);
      } else if (v.field === 'error.message') {
        actual = h.errorWidth || h.errorHeight;
      } else if (v.field === 'fmtErrorPercent') {
        actual = findFmtErrorPercent(h);
      } else {
        l2Uncovered.push(v.id + ':' + v.field);
        uncoveredCount += 1; uncoveredFields.add(v.field);
        continue;
      }
      if (!strEq(entry, actual)) l2Diffs.push({ field: v.field, layer: 'L2', vector: v.id, expected: entry, actual });
    }

    // 🔒 待确认的 L2 向量 → 其字段**仅在 L1 也未覆盖时**才计为未覆盖。
    //    理由（DEC-15）：判定规则是「L1 或 L2 至少一层覆盖」——
    //    字段已由 L1 覆盖时，L2 待确认**不影响**该字段的覆盖状态，
    //    否则会把已覆盖字段重复计入 M，虚高「未覆盖字段数」。
    for (const v of goldenPending) {
      if (coveredFields.has(v.field)) continue;
      uncoveredCount += 1;
      uncoveredFields.add(v.field);
      l2Uncovered.push(v.id + ':' + v.field + '(pending_confirmation)');
    }

    /* ---- 汇总 ---- */
    rec.l1Diffs = l1Diffs;
    rec.l2Diffs = l2Diffs;
    rec.l3Diffs = l3Diffs;
    rec.uncovered = l1Uncovered.concat(l2Uncovered);
    rec.notApplicable = rec.naFields || [];
    rec.l1Covered = cov;

    const allDiffs = l1Diffs.concat(l2Diffs);
    diffCount += allDiffs.length;
    if (allDiffs.length > 0) {
      rec.verdict = 'FAIL';
      for (const d of allDiffs) diffDetail.push(Object.assign({ id: row.id, group: row.group, note: row.note }, d));
    } else if (rec.uncovered.length > 0) {
      rec.verdict = 'CONDITIONAL';
    } else {
      rec.verdict = 'PASS';
    }

    results.push(rec);
    const mark = rec.verdict === 'PASS' ? '✅' : rec.verdict === 'CONDITIONAL' ? '🟡' : '❌';
    const extra = allDiffs.length ? ` ｜ 差异 ${allDiffs.length} 条：${allDiffs.map((d) => d.field).join(', ')}`
      : (rec.uncovered.length ? ` ｜ 未覆盖 ${rec.uncovered.length} 字段` : '');
    console.log(`  ${mark} ${row.id} [${row.group}] ${row.note}${extra}`);
  }

  /* ---- 5.6 汇总与报告 ---- */
  const coveragePct = coveredTotal + uncoveredCount > 0
    ? (coveredTotal / (coveredTotal + uncoveredCount) * 100) : 0;

  const htmlCons = htmlConsole.length;
  const elCons = elConsole.length;
  const elErrs = elPageErrors.length;

  console.log('\n============================================================');
  console.log('【6】差分结论');
  console.log('============================================================');
  console.log(`  差异条数 = ${diffCount} ｜ 未覆盖字段数 = ${uncoveredCount} ｜ L1/L2 覆盖率 = ${coveragePct.toFixed(2)}%`);
  console.log(`  L1 覆盖 ${coveredByL1} 项 ｜ L2(已确认) 覆盖 ${coveredByL2} 项 ｜ L3 交叉校验 ${rows.length} 组`);
  const naTotal = results.reduce((a, r) => a + (r.notApplicable ? r.notApplicable.length : 0), 0);
  const naFields = [...new Set(results.flatMap((r) => r.notApplicable || []))];
  console.log(`  不适用字段（该场景无此字段，不计入覆盖也不计入未覆盖）：${naTotal} 项次 ｜ ${naFields.join(', ') || '无'}`);
  const passN = results.filter((r) => r.verdict === 'PASS').length;
  const condN = results.filter((r) => r.verdict === 'CONDITIONAL').length;
  const failN = results.filter((r) => r.verdict === 'FAIL').length;
  const blockN = results.filter((r) => r.verdict === 'BLOCKED').length;
  console.log(`  组判定：PASS ${passN} ｜ CONDITIONAL ${condN} ｜ FAIL ${failN} ｜ BLOCKED ${blockN}`);
  console.log(`  HTML 版 console error/warning = ${htmlCons} ｜ Electron 版 = ${elCons} ｜ pageerror = ${elErrs}`);
  if (diffDetail.length) {
    console.log('\n  ── 差异明细（逐字段）──');
    for (const d of diffDetail.slice(0, 60)) {
      console.log(`    ${d.id} [${d.group}] ${d.field} (${d.layer}) 期望=${JSON.stringify(d.expected)} 实际=${JSON.stringify(d.actual)}`);
    }
    if (diffDetail.length > 60) console.log(`    … 其余 ${diffDetail.length - 60} 条见 JSON 报告`);
  }
  const verdict = diffCount > 0 ? 'FAIL（有未解释差异）'
    : (uncoveredCount > 0 ? 'CONDITIONAL（有条件通过 —— N=0 但 M>0）'
      : 'PASS（完全通过）');
  console.log(`\n  🔴 门禁判定（G-03 差分项）：${verdict}`);

  /* ---- 5.7 落盘 ---- */
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      rule: 'DEC-15',
      independenceGate: gate,
      groupCounts: byGroup,
      total: matrix.length,
      executed: rows.length,
      consoleErrors: { html: htmlCons, electron: elCons, pageError: elErrs },
    },
    summary: {
      diffCount,
      uncoveredCount,
      coveragePercent: Number(coveragePct.toFixed(2)),
      coveredByL1,
      coveredByL2,
      passCount: passN, conditionalCount: condN, failCount: failN, blockedCount: blockN,
      verdict,
    },
    uncoveredFields: [...uncoveredFields],
    diffs: diffDetail,
    results,
  };
  const jsonPath = outJson || path.join(OUT_DIR, 'differential-200-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  📄 JSON 报告：${jsonPath}`);

  /* ---- 5.8 清理 ---- */
  await browser.close().catch(() => {});
  if (electronApp) await electronApp.close().catch(() => {});

  /* ---- 5.9 退出码 ---- */
  if (blockN > 0) process.exit(3);
  if (diffCount > 0) process.exit(1);
  if (uncoveredCount > 0) process.exit(2);
  process.exit(0);
}

/* ==========================================================================
   §6 辅助解析函数
   ========================================================================== */

function parseRatioFromText(t) {
  if (!t) return null;
  const m = String(t).match(/([0-9.]+)\s*:\s*1/);
  if (!m) return null;
  return Number(m[1]);
}

function parseResDim(t, which) {
  if (!t || t === '—') return null;
  const m = String(t).match(/([\d,]+)\s*×\s*([\d,]+)/);
  if (!m) return null;
  const v = which === 'w' ? m[1] : m[2];
  return Number(v.replace(/,/g, ''));
}

function findDescribeFit(cands) {
  for (const c of cands || []) {
    const m = /等比适配：(.+?)（不建议拉伸）/.exec(c.meta || '');
    if (m) return m[1];
  }
  return null;
}

function findResolutionText(h) {
  // 显示值带千分位与空格；复制载荷不带。此处从候选卡的分辨率提取纯文本形式。
  for (const c of h.candidates || []) {
    if (c.res && c.res !== '—') {
      const m = /([\d,]+)\s*×\s*([\d,]+)/.exec(c.res);
      if (m) return m[1].replace(/,/g, '') + '×' + m[2].replace(/,/g, '');
    }
  }
  return null;
}

function findOverflowFallback(h) {
  for (const c of h.candidates || []) {
    if (c.meta && c.meta.indexOf('所选档位的解已超宽') >= 0) return true;
  }
  return false;
}

function findFmtErrorPercent(h) {
  for (const r of h.tableRows || []) {
    if (r.ratioErr && /%/.test(r.ratioErr)) return r.ratioErr.replace(/^\+/, '').replace(/%$/, '');
  }
  return null;
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
