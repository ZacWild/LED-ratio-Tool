/**
 * LED-ratio-Tool 桌面版 · L1 独立算术 oracle
 * ============================================================================
 * 依据：P4-BASELINE.md DEC-15（差分门禁 = 200 组可观察结果零未解释差异）
 *       P3-D09 §6.1（L1 独立算术 oracle · 完全独立 · 不 import 产品代码）
 *       TK-93（把 own* 数学函数提取到独立文件，禁止整体 import acceptance.mjs）
 *
 * 🔴🔴🔴 独立性铁律（三条，违反即本文件作废）：
 *   ① 本文件**不得** import / require 任何路径下的 `core.js`（含 desktop/renderer/core.js）；
 *   ② 本文件**不得** import `test/acceptance.mjs`（其第 1063 行 require src/core.js，
 *      会连带执行产品代码 —— 这正是 TK-93 要避免的）；
 *   ③ 本文件**不得** import `src/app.js` / `src/core.js` / `desktop/renderer/app.js`。
 *   → 所有数学必须在本文件内**独立重写**，即使与 `src/core.js` 写法不同也允许
 *     （事实上必须不同，否则「独立」二字失去意义）。
 *
 * ✅ 允许的依赖：仅 Node 内置模块（node:fs / node:path）与本目录下的纯函数文件。
 *
 * 本文件推导的期望字段（对应 P3-D09 §6.3 比对字段表）：
 *   F1  ratio                F2  decimal          F3  reducedText     F4  exact
 *   F5  ratioErrorPercent    F6  pixelErrorPercent
 *   F7  roundedHeight        F8  bestRoundedHeight F9  roundedWidth/bestRoundedWidth
 *   F10 outputWidth/Height   F11 outputRatio       F12 strictMatch
 *   F13 withinBounds         F14 exactSolution     F15 overflowPx     F17 recommended
 *   F18 warnTriggered        F20 fitAdvice.mode    F21 fitAdvice 四轴向
 *   F22 fitAdvice 四 px 值   F24 resolutionText    F26 error          F27 message
 *   F28 badge                F29 matches(16 条)    F30 键集合
 *   F19 warnText / F23 适配建议文案 / F25 fullParameterText / F16 overflowFallback
 *      → 属 **L2**（人工确认黄金向量）覆盖范围，本文件**不**生成期望值。
 *
 * 判定口径（P3-D09 §6.4）：
 *   字符串逐字符 ===（零容差）；整数严格 ===；浮点 |a-b| ≤ 1e-12 × max(1,|a|)；
 *   布尔/枚举严格 ===；键集合双向 diff = ∅。
 *
 * ---------------------------------------------------------------------------
 * 提取自 acceptance.mjs 的 own* 函数（TK-93）：ownGcd / ownToMm / ownReduced /
 * ownHeightCandidates / ownPickHeight / ownStrictMatch / ownRelErrPercent /
 * ownMaxKInBounds。迁移时保持算法等价，但**重写**为独立实现并补充注释来源。
 * ============================================================================
 */

'use strict';

/* ==========================================================================
   §1 常量（与业务红线一致，但此处为独立登记，不从产品代码读取）
   ========================================================================== */

/** 判定"精确整数比"的相对误差上限（🔒 A-01 体系外的 core 契约） */
const EXACT_REL_TOL = 1e-9;
/** 接受近似比的最大相对误差 */
const APPROX_REL_TOL = 1e-6;
/** 有理数逼近的分母上限 */
const MAX_DENOMINATOR = 10000;
/** 默认匹配容差（百分比） */
const DEFAULT_TOLERANCE_PERCENT = 0.5;
/** 21:9 俗称判定的相对偏差上限（%）🔒 A-01 */
const NEAR_21_9_PERCENT = 2.5;
/** 量化步长：1/1000 mm */
const SCALE = 1000;
/** 单位 → 毫米系数 */
const UNIT_TO_MM = { m: 1000, cm: 10, mm: 1 };

/* ==========================================================================
   §2 基础算术（独立实现）
   ========================================================================== */

/**
 * 独立的最大公约数（欧几里得辗转相除）。
 * 与 acceptance.mjs ownGcd 等价，但写法独立。
 */
function ownGcd(a, b) {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

/**
 * 独立：尺寸字符串 → 毫米。
 * 规则（自 core.js 文档 §A 反推的**契约**）：
 *   - 严格正则 `^[+-]?\d+(?:\.\d+)?$`（至多一位小数点、科学计数法/百分号/字母一律非法）；
 *   - 空串 / 纯空格 → error='empty'；
 *   - 不匹配正则 → error='nan'；
 *   - 数值 ≤ 0 → error='nonPositive'；
 *   - 单位非法 → error='unit'；
 *   - 合法 → mm = value × UNIT_TO_MM[unit]。
 */
function ownToMm(text, unit) {
  const u = ownNormalizeUnit(unit);
  const raw = text === null || text === undefined ? '' : String(text);
  const t = raw.trim();
  if (t === '') return { ok: false, error: 'empty', value: null, unit: u, mm: null };
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(t)) {
    return { ok: false, error: 'nan', value: null, unit: u, mm: null };
  }
  const value = Number(t);
  if (!isFinite(value)) return { ok: false, error: 'nan', value: null, unit: u, mm: null };
  if (value <= 0) return { ok: false, error: 'nonPositive', value, unit: u, mm: null };
  if (!u) return { ok: false, error: 'unit', value, unit: null, mm: null };
  return { ok: true, error: null, value, unit: u, mm: value * UNIT_TO_MM[u] };
}

/** 独立：单位归一化（含大小写与中文别名） */
function ownNormalizeUnit(unit) {
  if (unit === null || unit === undefined) return null;
  const key = String(unit).trim().toLowerCase();
  if (key === '') return null;
  const alias = {
    m: 'm', meter: 'm', meters: 'm', '米': 'm',
    cm: 'cm', centimeter: 'cm', centimeters: 'cm', '厘米': 'cm',
    mm: 'mm', millimeter: 'mm', millimeters: 'mm', '毫米': 'mm',
  };
  return Object.prototype.hasOwnProperty.call(alias, key) ? alias[key] : null;
}

/**
 * 独立：最简整数比（由 mm 对推导）。
 * 🔒 注意：core 在约分前会先把 mm 放大 1000 取整（消除浮点尾数噪声），
 *    因此 oracle 也必须**先量化再约分**，否则 4.135m 这类输入会算出不同结果。
 */
function ownReduced(wMm, hMm) {
  const sw = Math.round(wMm * SCALE);
  const sh = Math.round(hMm * SCALE);
  const g = ownGcd(sw, sh);
  return { a: sw / g, b: sh / g, text: (sw / g) + ':' + (sh / g) };
}

/**
 * 独立：取整高度的合法候选集合（理论值的相邻两个整数）。
 * 🔒 与 core 的 pickBestHeight 一致：候选需 ≥ 1（下界保护）。
 */
function ownHeightCandidates(theoretical) {
  const lo = Math.floor(theoretical);
  const hi = Math.ceil(theoretical);
  const out = [];
  if (lo >= 1) out.push(lo);
  if (hi >= 1 && hi !== lo) out.push(hi);
  return out;
}

/**
 * 独立：给定目标宽 W 与目标比例 R，输出高度必须是哪个整数？
 * 规则 = 在理论高的相邻整数候选中，选"输出比例误差 |W/h − R|"更小者。
 * 🔒 平局判定：core 用 `err < best.err - 1e-15` 严格小于做主判据，
 *    再以「离理论值更近」做次判据；oracle 采用同一判定口径。
 *
 * 🔒 **签名兼容说明（重要）**：
 *   acceptance.mjs 的 ownPickHeight(W, R) 是 **2 参**形式（内部自行推 t = W/R）；
 *   core.js 的 pickBestHeight(W, theoretical, R) 是 **3 参**形式。
 *   本函数**同时支持两种调用**：
 *     - 2 参 (W, R)         → 内部计算 t = W / R，等价 acceptance.mjs 口径；
 *     - 3 参 (W, theoretical, R) → 直接使用传入的理论高，等价 core.js 口径。
 *   两种形式在数学上等价（因为 W/R === theoretical），故不产生口径分歧。
 */
function ownPickHeight(W, theoreticalOrRatio, R) {
  let theoretical;
  let ratio;
  if (arguments.length >= 3) {
    theoretical = theoreticalOrRatio;
    ratio = R;
  } else {
    ratio = theoreticalOrRatio;
    theoretical = W / ratio;
  }
  const cands = ownHeightCandidates(theoretical);
  if (cands.length === 0) return 1;
  if (cands.length === 1) return cands[0];
  let best = cands[0];
  let bestErr = Math.abs(W / best - ratio);
  let bestHeightErr = Math.abs(best - theoretical);
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i];
    const e = Math.abs(W / c - ratio);
    const he = Math.abs(c - theoretical);
    if (e < bestErr - 1e-15 || (Math.abs(e - bestErr) <= 1e-15 && he < bestHeightErr - 1e-12)) {
      best = c; bestErr = e; bestHeightErr = he;
    }
  }
  return best;
}

/**
 * 独立：按高换算时的对称取整（宽度候选）。
 * 🔒 签名兼容同 ownPickHeight：2 参 (H, R) / 3 参 (H, theoretical, R)。
 */
function ownPickWidth(H, theoreticalOrRatio, R) {
  let theoretical;
  let ratio;
  if (arguments.length >= 3) {
    theoretical = theoreticalOrRatio;
    ratio = R;
  } else {
    ratio = theoreticalOrRatio;
    theoretical = H * ratio;
  }
  const lo = Math.floor(theoretical);
  const hi = Math.ceil(theoretical);
  const cands = [];
  if (lo >= 1) cands.push(lo);
  if (hi >= 1 && hi !== lo) cands.push(hi);
  if (cands.length === 0) return 1;
  if (cands.length === 1) return cands[0];
  let best = cands[0];
  let bestErr = Math.abs(best / H - ratio);
  let bestWidthErr = Math.abs(best - theoretical);
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i];
    const e = Math.abs(c / H - ratio);
    const we = Math.abs(c - theoretical);
    if (e < bestErr - 1e-15 || (Math.abs(e - bestErr) <= 1e-15 && we < bestWidthErr - 1e-12)) {
      best = c; bestErr = e; bestWidthErr = we;
    }
  }
  return best;
}

/** 独立：是否严格匹配（相对误差 ≤ 1e-9） */
function ownStrictMatch(W, H, R) {
  if (!isFinite(W) || !isFinite(H) || !isFinite(R) || H === 0) return false;
  return Math.abs(W / H - R) / R <= EXACT_REL_TOL;
}

/** 独立：宽高比相对误差百分比（|W/H − R| / R × 100） */
function ownRelErrPercent(W, H, R) {
  return Math.abs(W / H - R) / R * 100;
}

/** 独立：像素尺寸误差百分比（|实际像素 − 理论像素| / 理论像素 × 100） */
function ownPixelErrPercent(actualPx, theoreticalPx) {
  if (!isFinite(actualPx) || !isFinite(theoreticalPx) || theoreticalPx === 0) return 0;
  return Math.abs(actualPx - theoreticalPx) / theoreticalPx * 100;
}

/**
 * 独立：找出"真实误差非零、但小到会被 4 位小数显示抹成 0"的宽度样本。
 * 用于容差边界构造（避免用"看起来像"的方式造样本）。
 */
function findTinyErrorWidths(R, from, to, cap) {
  const hits = [];
  for (let w = from; w <= to && hits.length < cap; w++) {
    const H = ownPickHeight(w, R);
    const err = ownRelErrPercent(w, H, R);
    if (err > 0 && err < 0.0045) hits.push({ w, H, err });
  }
  return hits;
}

/**
 * 独立：严格落在上限内的最大整数倍 k（两个上限都不得突破）。
 */
function ownMaxKInBounds(a, b, maxW, maxH) {
  let best = 0;
  for (let k = 1; k <= 1000000; k++) {
    if (k * a <= maxW && k * b <= maxH) best = k; else break;
  }
  return best;
}

/** 独立：以屏高为基准的最大整数倍 k（可能超宽） */
function ownKByHeight(b, maxH) {
  let k = Math.floor(maxH / b);
  return k >= 1 ? k : 0;
}

/* ==========================================================================
   §3 独立格式化（与 core 的 fmt / roundTo / fmtErrorPercent 同契约）
   ========================================================================== */

/** 独立：定点格式化（负零归零，保留 d 位小数） */
function ownFmt(n, digits) {
  const d = typeof digits === 'number' && isFinite(digits) && digits >= 0
    ? Math.min(20, Math.trunc(digits))
    : 4;
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const v = Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n;
  return v.toFixed(d);
}

/** 独立：保留指定小数位（返回 Number） */
function ownRoundTo(n, digits) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const d = typeof digits === 'number' && isFinite(digits) && digits >= 0
    ? Math.min(20, Math.trunc(digits))
    : 4;
  const r = Number(n.toFixed(d));
  return Object.is(r, -0) ? 0 : r;
}

/**
 * 独立：误差百分比统一取整。
 * 🔒 契约：常规保留 4 位；**真实误差非零但 4 位会抹成 0 时，升级到 10 位**。
 */
function ownRoundErrorPercent(raw) {
  if (typeof raw !== 'number' || !isFinite(raw)) return null;
  const r4 = ownRoundTo(raw, 4);
  if (r4 !== 0) return r4;
  return ownRoundTo(raw, 10);
}

/** 独立：误差百分比统一文本格式（与 ownRoundErrorPercent 同规则） */
function ownFmtErrorPercent(raw) {
  if (typeof raw !== 'number' || !isFinite(raw)) return '—';
  if (Math.abs(raw) >= 0.00005) return ownFmt(raw, 4);
  return ownFmt(raw, 10);
}

/* ==========================================================================
   §4 连分数逼近（独立实现，用于 nearest / nearest.text）
   ========================================================================== */

/**
 * 独立：连分数（Stern-Brocot 等价）有理数逼近。
 * 与 core.bestRational 同契约：分母 ≤ maxDen，取误差最小的逼近分数；
 * 分母上限卡在部分商中间时，比较"最后收敛分数"与"中间分数"取误差更小者。
 */
function ownBestRational(value, maxDen) {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) return null;
  const limit = Math.max(1, Math.trunc(isFinite(maxDen) ? maxDen : MAX_DENOMINATOR));
  const x = Math.abs(value);

  let hPrev = 0, h = 1;
  let kPrev = 1, k = 0;
  let rest = x;

  for (let i = 0; i < 64; i++) {
    const a = Math.floor(rest);
    const hNext = a * h + hPrev;
    const kNext = a * k + kPrev;

    if (kNext > limit) {
      const t = Math.floor((limit - kPrev) / k);
      const hMid = hPrev + t * h;
      const kMid = kPrev + t * k;
      const errH = k > 0 ? Math.abs(x - h / k) : Infinity;
      const errMid = kMid > 0 ? Math.abs(x - hMid / kMid) : Infinity;
      const useMid = errMid < errH;
      const na = useMid ? hMid : h;
      const nk = useMid ? kMid : k;
      if (!(nk > 0) || !(na > 0)) return null;
      return { a: na, b: nk, relError: Math.abs(na / nk - value) / value };
    }

    hPrev = h; h = hNext;
    kPrev = k; k = kNext;

    const frac = rest - a;
    if (frac < 1e-12) break;
    rest = 1 / frac;
    if (!isFinite(rest)) break;
  }

  if (!(k > 0) || !(h > 0)) return null;
  return { a: h, b: k, relError: Math.abs(h / k - value) / value };
}

/* ==========================================================================
   §5 独立比例计算（computeRatio 同契约）
   ========================================================================== */

/**
 * 独立：由 mm 对计算比例。
 * 🔒 契约（来自 core.js 头部精度策略）：
 *   a) mm 放大 1000 取整 → 1/1000 mm 整数单位；
 *   b) 整数对约分后，还原相对误差 ≤ 1e-9 → exact=true，reduced 为最简整数比；
 *   c) 否则用连分数逼近（分母 ≤ 10000，相对误差 ≤ 1e-6 才返回 nearest）。
 */
function ownComputeRatio(widthMm, heightMm) {
  const w = typeof widthMm === 'number' ? widthMm : Number(widthMm);
  const h = typeof heightMm === 'number' ? heightMm : Number(heightMm);

  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
    return {
      ok: false, ratio: null, decimal: '', reduced: null, reducedText: '',
      exact: false, nearest: null, error: 'invalidDimension',
    };
  }

  const ratio = w / h;
  if (!isFinite(ratio)) {
    return {
      ok: false, ratio: null, decimal: '', reduced: null, reducedText: '',
      exact: false, nearest: null, error: 'overflow',
    };
  }

  const scaledW = Math.round(w * SCALE);
  const scaledH = Math.round(h * SCALE);

  if (!(scaledW > 0) || !(scaledH > 0)) {
    return {
      ok: true, ratio, decimal: ownFmt(ratio, 4), reduced: null, reducedText: '',
      exact: false, nearest: ownBuildNearest(ratio), error: null,
    };
  }

  const g = ownGcd(scaledW, scaledH);
  const a = scaledW / g;
  const b = scaledH / g;
  const restoredRatio = a / b;

  const q1 = Math.abs(w * SCALE - scaledW) / (w * SCALE);
  const q2 = Math.abs(h * SCALE - scaledH) / (h * SCALE);
  const quantRelError = (q1 + q2) / Math.max(1e-18, 1 - Math.min(q1, q2));
  const restoredRelError = Math.abs(restoredRatio - ratio) / ratio;

  const exact = restoredRelError <= EXACT_REL_TOL;
  const nearestTolerance = APPROX_REL_TOL + quantRelError;

  return {
    ok: true,
    ratio,
    decimal: ownFmt(ratio, 4),
    reduced: exact ? { a, b } : null,
    reducedText: exact ? (a + ':' + b) : '',
    exact,
    nearest: exact ? null : ownBuildNearest(ratio, nearestTolerance),
    error: null,
  };
}

/** 独立：最近有理数逼近（仅非精确时使用） */
function ownBuildNearest(ratio, tolerance) {
  const tol = isFinite(tolerance) ? tolerance : APPROX_REL_TOL;
  const ap = ownBestRational(ratio, MAX_DENOMINATOR);
  if (!ap) return null;
  if (ap.relError > tol) return null;
  return {
    a: ap.a, b: ap.b, text: ap.a + ':' + ap.b,
    exact: false, relError: ap.relError,
    relErrorPercent: ownRoundErrorPercent(ap.relError * 100),
  };
}

/* ==========================================================================
   §6 独立画布换算（canvasFromWidth / canvasFromHeight 同契约）
   ========================================================================== */

/** 独立：由目标宽度换算画布 */
function ownCanvasFromWidth(targetWidth, ratio) {
  const W = typeof targetWidth === 'number' ? targetWidth : Number(targetWidth);
  const R = typeof ratio === 'number' ? ratio : Number(ratio);

  if (!isFinite(W) || !isFinite(R) || W <= 0 || R <= 0) {
    return { ok: false, error: 'invalidInput', theoreticalHeight: null, roundedHeight: null,
      bestRoundedHeight: null, outputWidth: null, outputHeight: null, outputRatio: null,
      ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null };
  }

  const theoreticalHeight = W / R;
  const roundedHeight = Math.round(theoreticalHeight);
  const bestRoundedHeight = ownPickHeight(W, theoreticalHeight, R);

  if (!isFinite(theoreticalHeight) || !isFinite(bestRoundedHeight) || !isFinite(roundedHeight)) {
    return { ok: false, error: 'overflow', theoreticalHeight: null, roundedHeight: null,
      bestRoundedHeight: null, outputWidth: null, outputHeight: null, outputRatio: null,
      ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null };
  }

  const outputRatio = W / bestRoundedHeight;
  const ratioRelError = Math.abs(outputRatio - R) / R;
  const ratioErrorPercent = ratioRelError * 100;
  const pixelErrorPercent = ownPixelErrPercent(bestRoundedHeight, theoreticalHeight);

  return {
    ok: true, error: null,
    targetWidth: W, ratio: R,
    theoreticalHeight,
    theoreticalHeightText: ownFmt(theoreticalHeight, 4),
    roundedHeight,
    bestRoundedHeight,
    outputWidth: W,
    outputHeight: bestRoundedHeight,
    outputRatio,
    outputRatioText: ownFmt(outputRatio, 4),
    ratioErrorPercent: ownRoundErrorPercent(ratioErrorPercent),
    ratioErrorPercentText: ownFmtErrorPercent(ratioErrorPercent),
    pixelErrorPercent: ownRoundErrorPercent(pixelErrorPercent),
    pixelErrorPercentText: ownFmtErrorPercent(pixelErrorPercent),
    strictMatch: ratioRelError <= EXACT_REL_TOL,
    fitAdvice: ownFitAdvice(W, bestRoundedHeight, R),
  };
}

/** 独立：由目标高度换算画布 */
function ownCanvasFromHeight(targetHeight, ratio) {
  const H = typeof targetHeight === 'number' ? targetHeight : Number(targetHeight);
  const R = typeof ratio === 'number' ? ratio : Number(ratio);

  if (!isFinite(H) || !isFinite(R) || H <= 0 || R <= 0) {
    return { ok: false, error: 'invalidInput', theoreticalWidth: null, roundedWidth: null,
      bestRoundedWidth: null, outputWidth: null, outputHeight: null, outputRatio: null,
      ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null };
  }

  const theoreticalWidth = H * R;
  const roundedWidth = Math.round(theoreticalWidth);
  const bestRoundedWidth = ownPickWidth(H, theoreticalWidth, R);

  if (!isFinite(theoreticalWidth) || !isFinite(bestRoundedWidth) || !isFinite(roundedWidth)) {
    return { ok: false, error: 'overflow', theoreticalWidth: null, roundedWidth: null,
      bestRoundedWidth: null, outputWidth: null, outputHeight: null, outputRatio: null,
      ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null };
  }

  const outputRatio = bestRoundedWidth / H;
  const ratioRelError = Math.abs(outputRatio - R) / R;
  const ratioErrorPercent = ratioRelError * 100;
  const pixelErrorPercent = ownPixelErrPercent(bestRoundedWidth, theoreticalWidth);

  if (!isFinite(outputRatio) || !isFinite(ratioErrorPercent) || !isFinite(pixelErrorPercent)) {
    return { ok: false, error: 'overflow', theoreticalWidth: null, roundedWidth: null,
      bestRoundedWidth: null, outputWidth: null, outputHeight: null, outputRatio: null,
      ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null };
  }

  return {
    ok: true, error: null,
    targetHeight: H, ratio: R,
    theoreticalWidth,
    theoreticalWidthText: ownFmt(theoreticalWidth, 4),
    roundedWidth,
    bestRoundedWidth,
    outputWidth: bestRoundedWidth,
    outputHeight: H,
    outputRatio,
    outputRatioText: ownFmt(outputRatio, 4),
    ratioErrorPercent: ownRoundErrorPercent(ratioErrorPercent),
    ratioErrorPercentText: ownFmtErrorPercent(ratioErrorPercent),
    pixelErrorPercent: ownRoundErrorPercent(pixelErrorPercent),
    pixelErrorPercentText: ownFmtErrorPercent(pixelErrorPercent),
    strictMatch: ratioRelError <= EXACT_REL_TOL,
    fitAdvice: ownFitAdvice(bestRoundedWidth, H, R),
  };
}

/* ==========================================================================
   §7 独立适配建议（fitAdvice 同契约）
   ========================================================================== */

/**
 * 独立：等比适配建议。
 * 🔒 契约：
 *   - 比例一致（相对差 ≤ 1e-9）→ 'exact'，四个 px 全 0，四个轴向全 null；
 *   - 内容比画布宽（R > canvasRatio）→ 'crop'：左右各裁 coverCropPx，
 *     完整显示则上下各补 containBarPx；coverCropAxis='x'，containBarAxis='y'；
 *   - 内容比画布窄 → 'letterbox'：左右各补 containBarPx，
 *     铺满则上下各裁 coverCropPx；containBarAxis='x'，coverCropAxis='y'。
 */
function ownFitAdvice(canvasWidth, canvasHeight, contentRatio) {
  const W = typeof canvasWidth === 'number' ? canvasWidth : Number(canvasWidth);
  const H = typeof canvasHeight === 'number' ? canvasHeight : Number(canvasHeight);
  const R = typeof contentRatio === 'number' ? contentRatio : Number(contentRatio);

  if (!isFinite(W) || !isFinite(H) || !isFinite(R) || W <= 0 || H <= 0 || R <= 0) {
    return { ok: false, error: 'invalidInput', mode: null, cropPx: null, pillarboxPx: null,
      cropAxis: null, pillarboxAxis: null, coverCropAxis: null, containBarAxis: null };
  }

  const canvasRatio = W / H;
  if (!isFinite(canvasRatio)) {
    return { ok: false, error: 'overflow', mode: null, cropPx: null, pillarboxPx: null,
      cropAxis: null, pillarboxAxis: null, coverCropAxis: null, containBarAxis: null };
  }

  const diff = Math.abs(R - canvasRatio) / R;

  if (diff <= EXACT_REL_TOL) {
    return { ok: true, error: null, mode: 'exact',
      cropPx: 0, pillarboxPx: 0, coverCropPx: 0, containBarPx: 0,
      cropAxis: null, pillarboxAxis: null, coverCropAxis: null, containBarAxis: null,
      canvasRatio, contentRatio: R };
  }

  if (R > canvasRatio) {
    const coverCropPx = (H * R - W) / 2;
    const containBarPx = (H - W / R) / 2;
    return { ok: true, error: null, mode: 'crop',
      cropPx: ownRoundTo(coverCropPx, 4), pillarboxPx: 0,
      cropAxis: 'x', pillarboxAxis: null,
      coverCropPx: ownRoundTo(coverCropPx, 4), containBarPx: ownRoundTo(containBarPx, 4),
      coverCropAxis: 'x', containBarAxis: 'y',
      canvasRatio, contentRatio: R };
  }

  const containBarPx = (W - H * R) / 2;
  const coverCropPx = (W / R - H) / 2;
  return { ok: true, error: null, mode: 'letterbox',
    cropPx: 0, pillarboxPx: ownRoundTo(containBarPx, 4),
    cropAxis: null, pillarboxAxis: 'x',
    coverCropPx: ownRoundTo(coverCropPx, 4), containBarPx: ownRoundTo(containBarPx, 4),
    coverCropAxis: 'y', containBarAxis: 'x',
    canvasRatio, contentRatio: R };
}

/* ==========================================================================
   §8 独立整数倍画布（bestIntegerCanvas 同契约）
   ========================================================================== */

/**
 * 独立：整数倍画布求解。
 * 🔒 契约：
 *   - kHeight = floor(maxHeight / b)（以屏高定 k，可能超宽）；
 *   - kBounds = min(floor(maxWidth / a), kHeight)（两个上限都不突破）；
 *   - exactSolution **恒定**返回（以屏高定 k）；
 *   - withinBounds = kBounds ≥ 1 时的解，否则 null；
 *   - recommended = withinBounds || primary（越界解不得占据当前位）；
 *   - overflowPx = (k*a − maxWidth) > 0 时取该值，否则 0。
 */
function ownBestIntegerCanvas(a, b, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const maxWidth = Number(opts.maxWidth);
  const maxHeight = Number(opts.maxHeight);

  if (!isFinite(maxWidth) || !isFinite(maxHeight) || maxWidth <= 0 || maxHeight <= 0) {
    return { ok: false, error: 'invalidBounds', k: null, width: null, height: null,
      withinBounds: null, exactSolution: null, recommended: null, overflowPx: null };
  }

  const kHeight = ownKByHeight(b, maxHeight);
  const kBounds = Math.min(Math.floor(maxWidth / a), kHeight);

  if (kHeight < 1) {
    return { ok: false, error: 'noSolution', k: 0, width: null, height: null,
      withinBounds: null, exactSolution: null, recommended: null, overflowPx: null };
  }

  const build = (kk) => {
    const w = kk * a;
    const h = kk * b;
    const over = w - maxWidth;
    return {
      width: w, height: h, k: kk,
      outputWidth: w, outputHeight: h,
      outputRatio: w / h,
      exceedsMaxWidth: over > 0,
      overflowPx: over > 0 ? ownRoundTo(over, 4) : 0,
    };
  };

  const exactSolution = build(kHeight);
  const withinBounds = kBounds >= 1 ? build(kBounds) : null;

  const prefer = opts.prefer === 'bounds' ? 'bounds' : 'height';
  const primary = prefer === 'bounds' ? (withinBounds || exactSolution) : exactSolution;
  const recommended = withinBounds || primary;

  return {
    ok: true, error: null,
    width: primary.width, height: primary.height, k: primary.k,
    reducedText: a + ':' + b,
    outputWidth: primary.outputWidth, outputHeight: primary.outputHeight,
    outputRatio: primary.outputRatio,
    exceedsMaxWidth: primary.exceedsMaxWidth,
    overflowPx: primary.overflowPx,
    fitsInBounds: withinBounds !== null && !primary.exceedsMaxWidth,
    withinBounds, exactSolution, recommended,
    overflowFallback: primary !== recommended,
    mode: prefer,
  };
}

/* ==========================================================================
   §9 独立标准库匹配（matchStandards 同契约）
   ========================================================================== */

/**
 * 独立：标准比例库（16 条）。
 * 🔒 由 core.js STANDARDS 的**业务口径**转录为独立常量表（不是 import）。
 *    21:9 是俗称（严格值 7:3），isTrueStandard=false。
 */
const OWN_STANDARDS = Object.freeze([
  { name: '16:9', exactValue: 16 / 9, isTrueStandard: true, kind: 'ratio' },
  { name: '16:10', exactValue: 16 / 10, isTrueStandard: true, kind: 'ratio' },
  { name: '4:3', exactValue: 4 / 3, isTrueStandard: true, kind: 'ratio' },
  { name: '3:2', exactValue: 3 / 2, isTrueStandard: true, kind: 'ratio' },
  { name: '1:1', exactValue: 1, isTrueStandard: true, kind: 'ratio' },
  { name: '9:16', exactValue: 9 / 16, isTrueStandard: true, kind: 'ratio' },
  { name: '4:5', exactValue: 4 / 5, isTrueStandard: true, kind: 'ratio' },
  { name: '21:9', exactValue: 7 / 3, isTrueStandard: false, kind: 'ratio' },
  { name: '32:9', exactValue: 32 / 9, isTrueStandard: true, kind: 'ratio' },
  { name: '2.35:1', exactValue: 2.35, isTrueStandard: true, kind: 'ratio' },
  { name: '2.39:1', exactValue: 2.39, isTrueStandard: true, kind: 'ratio' },
  { name: '2.40:1', exactValue: 2.4, isTrueStandard: true, kind: 'ratio' },
  { name: '3440×1440', exactValue: 3440 / 1440, isTrueStandard: true, kind: 'resolution' },
  { name: '3840×1646', exactValue: 3840 / 1646, isTrueStandard: true, kind: 'resolution' },
  { name: '3840×2160', exactValue: 3840 / 2160, isTrueStandard: true, kind: 'resolution' },
  { name: '1920×1080', exactValue: 1920 / 1080, isTrueStandard: true, kind: 'resolution' },
]);

/**
 * 独立：把比例与标准库比对。
 * 🔒 契约：
 *   - 相对误差 = |ratio − 标准值| / 标准值 × 100%；
 *   - 先按**未取整**误差升序排序，再做展示取整；
 *   - closest = 排序后第 0 条（唯一）；
 *   - isStandard = 存在任一条 withinTolerance（误差 ≤ 容差）。
 */
function ownMatchStandards(ratio, tolerancePercent) {
  const r = typeof ratio === 'number' ? ratio : Number(ratio);
  const tol = typeof tolerancePercent === 'number' && isFinite(tolerancePercent) && tolerancePercent >= 0
    ? tolerancePercent
    : DEFAULT_TOLERANCE_PERCENT;

  if (!isFinite(r) || r <= 0) {
    return { ok: false, ratio: null, tolerance: tol, matches: [], closest: null,
      closestTrueStandard: null, isStandard: false, isTrueStandardMatch: false,
      error: 'invalidRatio' };
  }

  const rows = OWN_STANDARDS
    .map((s) => ({ s, diff: Math.abs(r - s.exactValue) / s.exactValue * 100 }))
    .sort((a, b) => a.diff - b.diff);

  const matches = rows.map((row, i) => ({
    name: row.s.name,
    value: row.s.exactValue,
    kind: row.s.kind,
    diffPercent: ownRoundErrorPercent(row.diff),
    diffPercentText: ownFmtErrorPercent(row.diff),
    exactMatch: row.diff <= EXACT_REL_TOL * 100,
    withinTolerance: row.diff <= tol,
    isTrueStandard: row.s.isTrueStandard,
    closest: i === 0,
  }));

  return {
    ok: true, ratio: r, tolerance: tol,
    matches,
    closest: matches[0] || null,
    closestTrueStandard: matches.filter((m) => m.isTrueStandard)[0] || null,
    isStandard: matches.some((m) => m.withinTolerance),
    isTrueStandardMatch: matches.some((m) => m.withinTolerance && m.isTrueStandard),
    error: null,
  };
}

/* ==========================================================================
   §10 独立徽标判定（renderBadge 同契约 · 🔒 A-08）
   ========================================================================== */

/**
 * 独立：徽标五态判定。
 * 🔒 A-08 判定优先级（不得改序）：
 *   RS-01 输入有误   ← dims 不 ok
 *   RS-05 需现场确认 ← 目标比例为空
 *   RS-02 非标准比例 ← !isStandard（**优先于** RS-03/RS-04）
 *   RS-03 取整误差   ← !strictMatch
 *   RS-04 严格匹配
 */
const OWN_BADGE = Object.freeze({
  RS01: '输入有误',
  RS02: '非标准比例',
  RS03: '取整误差',
  RS04: '严格匹配',
  RS05: '需现场确认',
});

function ownBadge(dimsOk, targetRatio, tolerancePercent, strictMatch) {
  if (!dimsOk) return { code: 'RS-01', label: OWN_BADGE.RS01 };
  if (targetRatio === null || targetRatio === undefined) {
    return { code: 'RS-05', label: OWN_BADGE.RS05 };
  }
  const match = ownMatchStandards(targetRatio, tolerancePercent);
  if (!match.isStandard) return { code: 'RS-02', label: OWN_BADGE.RS02 };
  if (!strictMatch) return { code: 'RS-03', label: OWN_BADGE.RS03 };
  return { code: 'RS-04', label: OWN_BADGE.RS04 };
}

/* ==========================================================================
   §11 独立 21:9 警示判定（renderWarnBar 同契约 · 🔒 A-01）
   ========================================================================== */

/**
 * 独立：21:9 警示是否触发。
 * 🔒 A-01：NEAR_21_9_PERCENT = 2.5（绝对常量，不随容差变化）。
 * 🔒 触发条件（与 app.js renderWarnBar 同口径）：
 *   - 目标比例不属于常见标准画幅（!isStandard）→ **触发**；
 *   - 是标准画幅，但与俗称 21:9（严格值 7/3）的偏差 ≤ 2.5% → **触发**；
 *   - 否则不触发。
 */
function ownWarnTriggered(targetRatio, tolerancePercent) {
  if (targetRatio === null || targetRatio === undefined) return false;
  const match = ownMatchStandards(targetRatio, tolerancePercent);
  if (!match.isStandard) return true;
  const std21 = match.matches.filter((m) => m.name === '21:9')[0];
  if (!std21) return false;
  const diffTo21 = Math.abs(targetRatio - std21.value) / std21.value * 100;
  return diffTo21 <= NEAR_21_9_PERCENT;
}

/** 独立：目标比例与俗称 21:9 的偏差百分比（%），用于警示文案数值核对 */
function ownDiffTo21By9(targetRatio) {
  const std21 = OWN_STANDARDS.filter((s) => s.name === '21:9')[0];
  if (!std21 || targetRatio === null || targetRatio === undefined) return Infinity;
  return Math.abs(targetRatio - std21.exactValue) / std21.exactValue * 100;
}

/* ==========================================================================
   §12 独立复制载荷构造（resolutionText · F24）
   ========================================================================== */

/**
 * 独立：复制分辨率载荷。
 * 🔒 BM-28 / app.js:102-105 契约：纯文本 `宽×高`，× 为 U+00D7（0x00D7），
 *    **不带千分位**，不加空格。
 */
function ownResolutionText(w, h) {
  if (!isFinite(w) || !isFinite(h)) return null;
  return String(w) + '×' + String(h);
}

/**
 * 🔒 ER-01~ER-04 四条错误文案（独立登记，不从产品代码读取）。
 * 🔒 四条**必须互不相同**（P3-D09 §5.1 / acceptance F1 已固化）。
 * @param {string} error  错误码（empty / nan / nonPositive / unit）
 * @param {number} value  原值（用于区分「零」与「负数」两种 nonPositive 说法）
 */
function ownErrorMessage(error, value) {
  if (error === 'empty') return '请输入尺寸';
  if (error === 'nan') return '尺寸必须是有效数字（最多一位小数点）';
  if (error === 'unit') return '单位必须是 m / cm / mm';
  if (error === 'nonPositive') {
    return (typeof value === 'number' && value < 0)
      ? '尺寸不能为负数，请输入大于 0 的数值'
      : '尺寸必须大于 0';
  }
  return '';
}

/* ==========================================================================
   §13 组合：一次性算出一组用例的全部 L1 期望字段
   ========================================================================== */

/**
 * 独立：为一组输入算出全部 L1 期望字段。
 *
 * @param {object} spec 输入规格（由 differential-200.mjs 构造）
 * @returns {object} 期望字段集合（键名与比对字段表 F1~F30 对齐）
 */
function ownExpect(spec) {
  const {
    widthText, heightText, unit,
    ratioSource = 'screen',
    standardExactValue = null,
    customRatio = null,
    canvasMode = 'width',
    targetWidth = 1920,
    targetHeight = 1080,
    preset = null,
    integerRatio = null,
    maxWidth = null,
    maxHeight = null,
    prefer = 'bounds',
    tolerance: rawTolerance = DEFAULT_TOLERANCE_PERCENT,
  } = spec;

  // 🔒 **生效容差归一化**（🔒 app.js 容差 input 处理器 + 表B PS-01）：
  //    容差只在「有限且 > 0」时才写入 state；非法值（0 / -1 / abc）**不生效**，
  //    界面继续沿用**上一个有效值**。本差分器每组开始前把容差复位为默认 0.5，
  //    故非法容差场景的生效值恒为 0.5 → 此处归一化，保证与界面一致。
  const tolerance = (typeof rawTolerance === 'number' && isFinite(rawTolerance) && rawTolerance > 0)
    ? rawTolerance
    : DEFAULT_TOLERANCE_PERCENT;

  const expected = { _covered: [] };
  const cover = (field, layer) => { expected._covered.push({ field, layer }); };

  // —— 尺寸解析 ——
  const w = ownToMm(widthText, unit);
  const h = ownToMm(heightText, unit);
  const dimsOk = w.ok && h.ok;

  // —— 目标比例 ——
  let targetRatio = null;
  let targetSource = ratioSource;
  if (ratioSource === 'standard' && standardExactValue !== null) {
    targetRatio = standardExactValue;
  } else if (ratioSource === 'custom' && customRatio) {
    const m = String(customRatio).match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
    if (m && Number(m[1]) > 0 && Number(m[2]) > 0) {
      const c = ownComputeRatio(Number(m[1]), Number(m[2]));
      targetRatio = c.ok ? c.ratio : null;
    }
  } else {
    targetRatio = dimsOk ? w.mm / h.mm : null;
    targetSource = 'screen';
  }

  // —— 屏幕实际比例（F1~F4）——
  if (dimsOk) {
    const sr = ownComputeRatio(w.mm, h.mm);
    expected.ratio = sr.ratio;
    expected.decimal = sr.decimal;
    expected.reducedText = sr.reducedText;
    expected.exact = sr.exact;
    expected.nearestText = sr.nearest ? sr.nearest.text : null;
    expected.nearestExact = sr.nearest ? sr.nearest.exact : null;
    cover('ratio', 'L1'); cover('decimal', 'L1'); cover('reducedText', 'L1');
    cover('exact', 'L1');
  } else {
    expected.ratio = null;
    expected.decimal = null;
    expected.reducedText = null;
    expected.exact = false;
    expected.nearestText = null;
    expected.nearestExact = null;
  }
  expected.dimsOk = dimsOk;
  expected.dimsError = dimsOk ? null : (w.ok ? h.error : w.error);
  // 🔒 ER-01~ER-04 四条错误文案（P3-D09 §5.1 逐条钉住，附 core.js 行号）：
  //    ER-01 empty       「请输入尺寸」                        core.js:246
  //    ER-02 nan         「尺寸必须是有效数字（最多一位小数点）」  core.js:249
  //    ER-03 nonPositive 「尺寸必须大于 0」                     core.js:256（value === 0）
  //    ER-04 nonPositive 「尺寸不能为负数，请输入大于 0 的数值」  app.js:252（value < 0）
  expected.dimsMessage = expected.dimsOk ? '' : ownErrorMessage(expected.dimsError, w.ok ? w.value : h.value);

  // —— 目标比例上的画布换算（F5~F12, F20~F22）——
  let canvas = null;
  if (targetRatio !== null) {
    if (canvasMode === 'width') {
      // 🔒 回落口径（🔒 app.js computeCandidates + primaryCandidate）：
      //    目标宽非法（≤0）→「按宽度」模式**不产出候选** → primaryCandidate
      //    回落��第一个候选（「按目标高度」）→ 界面显示的是按高度算出的画布。
      if (Number(targetWidth) > 0) {
        canvas = ownCanvasFromWidth(targetWidth, targetRatio);
      } else if (Number(targetHeight) > 0) {
        canvas = ownCanvasFromHeight(targetHeight, targetRatio);
      }
    } else if (canvasMode === 'height') {
      if (Number(targetHeight) > 0) {
        canvas = ownCanvasFromHeight(targetHeight, targetRatio);
      } else if (Number(targetWidth) > 0) {
        canvas = ownCanvasFromWidth(targetWidth, targetRatio);
      }
    } else if (canvasMode === 'preset' && preset) {
      const diff = Math.abs(preset.realRatio - targetRatio) / targetRatio * 100;
      canvas = {
        ok: true, error: null,
        theoreticalHeight: null, theoreticalWidth: null,
        roundedHeight: null, bestRoundedHeight: null,
        roundedWidth: null, bestRoundedWidth: null,
        outputWidth: preset.width, outputHeight: preset.height,
        outputRatio: preset.realRatio,
        ratioErrorPercent: ownRoundErrorPercent(diff),
        pixelErrorPercent: 0,
        strictMatch: diff !== null && diff <= EXACT_REL_TOL * 100,
        fitAdvice: ownFitAdvice(preset.width, preset.height, targetRatio),
      };
    } else if (canvasMode === 'custom' && integerRatio && maxWidth && maxHeight) {
      const ic = ownBestIntegerCanvas(integerRatio.a, integerRatio.b, { maxWidth, maxHeight, prefer });
      // 🔒 展示口径（需求 §3.5 / app.js computeCandidates）：
      //    **越界解不得占据当前位** —— 当前展示用「不超限且比例精确」的推荐解（recommended），
      //    超限的精确解作为并列解（exactSolution）一并列出。
      //    故本用例的「当前画布」= recommended（若存在），而非 primary。
      const shown = ic.ok ? (ic.recommended || ic) : null;
      canvas = {
        ok: ic.ok, error: ic.error,
        theoreticalHeight: null, theoreticalWidth: null,
        roundedHeight: null, bestRoundedHeight: null,
        roundedWidth: null, bestRoundedWidth: null,
        outputWidth: shown ? shown.width : null,
        outputHeight: shown ? shown.height : null,
        outputRatio: shown ? (shown.width / shown.height) : null,
        ratioErrorPercent: ic.ok ? ownRoundErrorPercent(0) : null,
        pixelErrorPercent: ic.ok ? 0 : null,
        strictMatch: ic.ok,
        fitAdvice: shown ? ownFitAdvice(shown.width, shown.height, shown.width / shown.height) : null,
      };
      // —— 整数倍双解（F13~F15, F17）——
      expected.withinBounds = ic.withinBounds ? {
        k: ic.withinBounds.k, width: ic.withinBounds.width, height: ic.withinBounds.height,
      } : null;
      expected.exactSolution = ic.exactSolution ? {
        k: ic.exactSolution.k, width: ic.exactSolution.width, height: ic.exactSolution.height,
      } : null;
      expected.overflowPx = ic.overflowPx;
      expected.recommended = ic.recommended ? {
        k: ic.recommended.k, width: ic.recommended.width, height: ic.recommended.height,
      } : null;
      expected.overflowFallback = ic.overflowFallback;
      expected.integerNoSolution = !ic.ok;
      cover('withinBounds', 'L1'); cover('exactSolution', 'L1');
      cover('overflowPx', 'L1'); cover('recommended', 'L1');
      cover('overflowFallback', 'L1');
    }
  }

  if (canvas) {
    expected.ratioErrorPercent = canvas.ratioErrorPercent;
    expected.pixelErrorPercent = canvas.pixelErrorPercent;
    expected.roundedHeight = canvas.roundedHeight;
    expected.bestRoundedHeight = canvas.bestRoundedHeight;
    expected.roundedWidth = canvas.roundedWidth;
    expected.bestRoundedWidth = canvas.bestRoundedWidth;
    expected.outputWidth = canvas.outputWidth;
    expected.outputHeight = canvas.outputHeight;
    expected.outputRatio = canvas.outputRatio;
    expected.strictMatch = canvas.strictMatch;
    cover('ratioErrorPercent', 'L1'); cover('pixelErrorPercent', 'L1');
    cover('roundedHeight', 'L1'); cover('bestRoundedHeight', 'L1');
    cover('roundedWidth', 'L1'); cover('bestRoundedWidth', 'L1');
    cover('outputWidth', 'L1'); cover('outputHeight', 'L1');
    cover('outputRatio', 'L1'); cover('strictMatch', 'L1');

    if (canvas.fitAdvice && canvas.fitAdvice.ok) {
      expected.fitMode = canvas.fitAdvice.mode;
      expected.fitCropAxis = canvas.fitAdvice.cropAxis;
      expected.fitPillarboxAxis = canvas.fitAdvice.pillarboxAxis;
      expected.fitCoverCropAxis = canvas.fitAdvice.coverCropAxis;
      expected.fitContainBarAxis = canvas.fitAdvice.containBarAxis;
      expected.fitCropPx = canvas.fitAdvice.cropPx;
      expected.fitPillarboxPx = canvas.fitAdvice.pillarboxPx;
      expected.fitCoverCropPx = canvas.fitAdvice.coverCropPx;
      expected.fitContainBarPx = canvas.fitAdvice.containBarPx;
      cover('fitMode', 'L1'); cover('fitCropAxis', 'L1'); cover('fitPillarboxAxis', 'L1');
      cover('fitCoverCropAxis', 'L1'); cover('fitContainBarAxis', 'L1');
      cover('fitCropPx', 'L1'); cover('fitPillarboxPx', 'L1');
      cover('fitCoverCropPx', 'L1'); cover('fitContainBarPx', 'L1');
    }
  }

  // —— 复制分辨率载荷（F24）——
  if (canvas && canvas.ok && canvas.outputWidth) {
    expected.resolutionText = ownResolutionText(canvas.outputWidth, canvas.outputHeight);
    cover('resolutionText', 'L1');
  } else {
    expected.resolutionText = null;
  }

  // —— 徽标（F28）——
  const badge = ownBadge(dimsOk, targetRatio, tolerance, canvas ? canvas.strictMatch === true : false);
  expected.badge = badge.code;
  expected.badgeLabel = badge.label;
  cover('badge', 'L1');

  // —— 21:9 警示触发（F18）——
  expected.warnTriggered = ownWarnTriggered(targetRatio, tolerance);
  expected.warnDiffTo21 = ownDiffTo21By9(targetRatio);
  cover('warnTriggered', 'L1');

  // —— 匹配表（F29）——
  if (targetRatio !== null) {
    const m = ownMatchStandards(targetRatio, tolerance);
    expected.matches = m.matches.map((x) => ({
      name: x.name, value: x.value, kind: x.kind,
      diffPercent: x.diffPercent, diffPercentText: x.diffPercentText,
      exactMatch: x.exactMatch, withinTolerance: x.withinTolerance,
      isTrueStandard: x.isTrueStandard, closest: x.closest,
    }));
    expected.isStandard = m.isStandard;
    expected.closestName = m.closest ? m.closest.name : null;
    cover('matches', 'L1');
  } else {
    expected.matches = [];
    expected.isStandard = false;
    expected.closestName = null;
  }

  return expected;
}

/* ==========================================================================
   §14 导出（ESM —— 文件扩展名为 .mjs）
   ========================================================================== */

export {
  // 常量
  EXACT_REL_TOL,
  APPROX_REL_TOL,
  MAX_DENOMINATOR,
  DEFAULT_TOLERANCE_PERCENT,
  NEAR_21_9_PERCENT,
  UNIT_TO_MM,
  OWN_STANDARDS,
  OWN_BADGE,
  // 基础
  ownGcd,
  ownToMm,
  ownNormalizeUnit,
  ownReduced,
  ownHeightCandidates,
  ownPickHeight,
  ownPickWidth,
  ownStrictMatch,
  ownRelErrPercent,
  ownPixelErrPercent,
  findTinyErrorWidths,
  ownMaxKInBounds,
  ownKByHeight,
  // 格式化
  ownFmt,
  ownRoundTo,
  ownRoundErrorPercent,
  ownFmtErrorPercent,
  // 逼近与比例
  ownBestRational,
  ownComputeRatio,
  ownBuildNearest,
  // 画布
  ownCanvasFromWidth,
  ownCanvasFromHeight,
  ownFitAdvice,
  ownBestIntegerCanvas,
  // 库与判定
  ownErrorMessage,
  ownMatchStandards,
  ownBadge,
  ownWarnTriggered,
  ownDiffTo21By9,
  ownResolutionText,
  // 组合
  ownExpect,
};
