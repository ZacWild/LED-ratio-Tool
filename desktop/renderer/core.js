/**
 * LED 大屏比例与视频画布换算工具 —— 计算核心
 * ---------------------------------------------------------------------------
 * 设计约束（改动前请先读）：
 * 1. 纯函数：零 DOM、零 window、零 localStorage、零 console、零第三方依赖。
 *    非法输入一律返回带 error 字段的结果对象，绝不抛异常。
 * 2. 双端可用：浏览器 <script> 直接引入（挂 globalThis.LedCore），
 *    Node 端用 CommonJS require 引入（module.exports）。
 * 3. 精度纪律（本文件的核心契约）：
 *    - ratio / decimal 是权威值，永远来自用户输入的物理尺寸，不被任何近似值覆盖；
 *    - 近似整数比只能出现在 nearest，且必须带 exact:false；
 *    - 任何取整都必须同时给出「误差」与「是否严格匹配」两个标志位；
 *    - 禁止因为"看起来像 21:9"这类俗称去改写真实计算出来的比例。
 *
 * 精度策略（computeRatio）：
 *   a) 把 mm 值放大 1000 取整，得到 1/1000 mm 精度的整数单位
 *      （14000mm → 14000000）。这一步同时清掉了浮点乘法的尾数噪声
 *      （4.135m → 4135.000000000001mm → 4135000）。
 *   b) 若该整数对可用最大公约数整除得 a:b，且还原后相对误差 ≤ 1e-9，
 *      则 exact = true，reduced 即最简整数比。
 *      输入小数超过 3 位时，取整引入的相对误差会被计入容差（量化误差本就是
 *      输入精度的一部分，不该据此判定"不精确"，但必须显式暴露出来）。
 *   c) 否则用连分数（Stern-Brocot 等价）有理数逼近求最近比，
 *      分母上限 10000，相对误差 ≤ 1e-6 才返回 nearest，且 nearest.exact = false。
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    globalThis.LedCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ===================== 常量 ===================== */

  /** 单位 → 毫米的换算系数 */
  const UNIT_TO_MM = { m: 1000, cm: 10, mm: 1 };

  /** 单位别名表：大小写不敏感，并兼容中文写法，避免 UI 传参踩坑 */
  const UNIT_ALIASES = {
    m: 'm', meter: 'm', meters: 'm', '米': 'm',
    cm: 'cm', centimeter: 'cm', centimeters: 'cm', '厘米': 'cm',
    mm: 'mm', millimeter: 'mm', millimeters: 'mm', '毫米': 'mm'
  };

  /** 判定"精确整数比"的相对误差上限 */
  const EXACT_REL_TOL = 1e-9;

  /** 判定"近似比可用"的相对误差上限 */
  const APPROX_REL_TOL = 1e-6;

  /** 有理数逼近的分母上限 */
  const MAX_DENOMINATOR = 10000;

  /** 标准比例库的默认匹配容差（百分比） */
  const DEFAULT_TOLERANCE_PERCENT = 0.5;

  /** 缩放到整数单位时的倍率：1/1000 mm */
  const SCALE = 1000;

  /* ===================== 基础工具 ===================== */

  /**
   * 非有限数保护：任何对外数值都不允许是 NaN / Infinity。
   * @param {number} n 待检值
   * @param {number} fallback 兜底值
   * @returns {number}
   */
  function finiteOr(n, fallback) {
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  }

  /**
   * 统一数值格式化出口。边界（UI 展示层）一律走这里，
   * 避免各处手写 toFixed 导致同一类数值出现不同位数的展示。
   * @param {number} n 数值
   * @param {number} [digits=4] 小数位
   * @returns {string}
   */
  function fmt(n, digits) {
    const d = typeof digits === 'number' && Number.isFinite(digits) && digits >= 0
      ? Math.min(20, Math.trunc(digits))
      : 4;
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    // 负零与极小负数统一显示为 0，避免出现 "-0.0000" 这种脏展示
    const v = Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n;
    return v.toFixed(d);
  }

  /**
   * 数值保留指定小数位（返回 Number，供计算与比较使用）。
   * 用 toFixed 再转 Number，避免 Math.round(x * 10^d) / 10^d 的二进制误差。
   * @param {number} n 数值
   * @param {number} [digits=4] 小数位
   * @returns {number|null}
   */
  function roundTo(n, digits) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    const d = typeof digits === 'number' && Number.isFinite(digits) && digits >= 0
      ? Math.min(20, Math.trunc(digits))
      : 4;
    const r = Number(n.toFixed(d));
    return Object.is(r, -0) ? 0 : r;
  }

  /**
   * 误差百分比的统一取整规则。
   * 常规量级统一保留 4 位小数（符合展示规范）；
   * 但当真实误差非零、4 位小数会把它抹成 0 时，改为保留更高精度 ——
   * 绝不允许"取整后误差显示为 0"（那会让调用方误以为毫无误差）。
   * @param {number} raw 原始百分比数值
   * @returns {number|null}
   */
  function roundErrorPercent(raw) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const r4 = roundTo(raw, 4);
    if (r4 !== 0) return r4;
    return roundTo(raw, 10);
  }

  /**
   * 误差百分比的统一文本格式（与 roundErrorPercent 同规则）。
   * @param {number} raw 原始百分比数值
   * @returns {string}
   */
  function fmtErrorPercent(raw) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return '—';
    if (Math.abs(raw) >= 0.00005) return fmt(raw, 4);
    const s = fmt(raw, 10);
    return s;
  }

  /**
   * 最大公约数（整数）。内部用于约分，输入会被截断为整数。
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  function gcd(a, b) {
    let x = Math.abs(Math.trunc(finiteOr(a, 0)));
    let y = Math.abs(Math.trunc(finiteOr(b, 0)));
    while (y) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x;
  }

  /**
   * 连分数（Stern-Brocot 等价）有理数逼近：求分母 ≤ maxDen 的最佳逼近。
   * 采用"中间分数"策略：分母上限卡在某个部分商中间时，
   * 除了最后一个收敛分数，还要比较中间分数，取误差更小者。
   * @param {number} value 目标正实数
   * @param {number} [maxDen=10000] 分母上限
   * @returns {{a:number,b:number,relError:number}|null}
   */
  function bestRational(value, maxDen) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    const limit = Math.max(1, Math.trunc(finiteOr(maxDen, MAX_DENOMINATOR)));
    const x = Math.abs(value);

    // 连分数展开的收敛分数递推：h/k 为当前收敛分数，hPrev/kPrev 为上一个
    let hPrev = 0, h = 1;
    let kPrev = 1, k = 0;
    let rest = x;

    for (let i = 0; i < 64; i++) {
      const a = Math.floor(rest);
      const hNext = a * h + hPrev;
      const kNext = a * k + kPrev;

      if (kNext > limit) {
        // 下一个收敛分数超限：在 [hPrev/kPrev, h/k] 之间找中间分数
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
      if (frac < 1e-12) break;          // 已经是有限小数，收敛结束
      rest = 1 / frac;
      if (!Number.isFinite(rest)) break;
    }

    if (!(k > 0) || !(h > 0)) return null;
    return { a: h, b: k, relError: Math.abs(h / k - value) / value };
  }

  /* ===================== A. 单位与尺寸解析 ===================== */

  /**
   * 单位归一化。
   * @param {string} unit
   * @returns {string|null} 归一化后的单位，识别失败返回 null
   */
  function normalizeUnit(unit) {
    if (unit === null || unit === undefined) return null;
    const key = String(unit).trim().toLowerCase();
    if (key === '') return null;
    return Object.prototype.hasOwnProperty.call(UNIT_ALIASES, key) ? UNIT_ALIASES[key] : null;
  }

  /**
   * 尺寸字符串 → 毫米。
   * 严格正则：只允许"可选正负号 + 数字 + 至多一位小数点 + 前后空格"，
   * 字母、多个小数点、科学计数法、百分号一律判为非法字符。
   * @param {string|number} input 用户输入
   * @param {string} unit 单位 m/cm/mm（大小写不敏感，也接受米/厘米/毫米）
   * @returns {{ok:boolean, mm:number|null, error:string|null, value:number|null, unit:string|null, message:string}}
   */
  function parseDimension(input, unit) {
    const u = normalizeUnit(unit);

    // 数值型入参走数值判定（避免 1e-7 这类指数写法被字符串化后误判为非法字符）
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        return { ok: false, mm: null, error: 'nan', value: null, unit: u, message: '尺寸不是有效数字' };
      }
      if (input <= 0) {
        return { ok: false, mm: null, error: 'nonPositive', value: input, unit: u, message: '尺寸必须大于 0' };
      }
      if (!u) {
        return { ok: false, mm: null, error: 'unit', value: input, unit: null, message: '单位必须是 m / cm / mm' };
      }
      return { ok: true, mm: input * UNIT_TO_MM[u], error: null, value: input, unit: u, message: '' };
    }

    const raw = (input === null || input === undefined ? '' : String(input));
    const text = raw.trim();

    if (text === '') {
      return { ok: false, mm: null, error: 'empty', value: null, unit: u, message: '请输入尺寸' };
    }
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
      return { ok: false, mm: null, error: 'nan', value: null, unit: u, message: '尺寸必须是有效数字（最多一位小数点）' };
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      return { ok: false, mm: null, error: 'nan', value: null, unit: u, message: '尺寸不是有效数字' };
    }
    if (value <= 0) {
      return { ok: false, mm: null, error: 'nonPositive', value: value, unit: u, message: '尺寸必须大于 0' };
    }
    if (!u) {
      return { ok: false, mm: null, error: 'unit', value: value, unit: null, message: '单位必须是 m / cm / mm' };
    }
    return { ok: true, mm: value * UNIT_TO_MM[u], error: null, value: value, unit: u, message: '' };
  }

  /**
   * 数值 → 毫米（不做正负与格式校验，只做单位换算）。
   * 非法输入返回 null，不抛异常。
   * @param {number|string} value
   * @param {string} unit
   * @returns {number|null}
   */
  function toMm(value, unit) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      const u = normalizeUnit(unit);
      if (!u) return null;
      return value * UNIT_TO_MM[u];
    }
    const parsed = parseDimension(value, unit);
    return parsed.ok ? parsed.mm : null;
  }

  /* ===================== B. 比例计算 ===================== */

  /**
   * 计算宽高比。
   * @param {number} widthMm 宽（毫米）
   * @param {number} heightMm 高（毫米）
   * @returns {object} 比例结果对象
   */
  function computeRatio(widthMm, heightMm) {
    const w = typeof widthMm === 'number' ? widthMm : Number(widthMm);
    const h = typeof heightMm === 'number' ? heightMm : Number(heightMm);

    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return {
        ok: false, ratio: null, decimal: '', reduced: null, reducedText: '',
        exact: false, nearest: null, precision: null,
        error: 'invalidDimension', message: '宽高必须是大于 0 的有限数'
      };
    }

    const ratio = w / h;

    // 宽高相差悬殊时（1e308 : 1e-308）比值会溢出成 Infinity —— 必须拦住，
    // 否则后续所有计算都会被污染，且对外数值不允许出现非有限值。
    if (!Number.isFinite(ratio)) {
      return {
        ok: false, ratio: null, decimal: '', reduced: null, reducedText: '',
        exact: false, nearest: null, precision: null,
        error: 'overflow', message: '宽高相差过大，比例超出可表示范围'
      };
    }

    // 量化到 1/1000 mm 的整数单位；这一步同时消除浮点乘法尾数噪声
    const scaledW = Math.round(w * SCALE);
    const scaledH = Math.round(h * SCALE);

    if (!(scaledW > 0) || !(scaledH > 0)) {
      // 尺寸小于 0.0005mm，量化后归零，无法做整数约分 → 退回近似路径
      return {
        ok: true, ratio: ratio, decimal: fmt(ratio, 4), reduced: null, reducedText: '',
        exact: false, nearest: buildNearest(ratio), precision: buildPrecision('approximation', 0, 0, 0, 0, Infinity, EXACT_REL_TOL),
        error: null, message: ''
      };
    }

    const g = gcd(scaledW, scaledH);
    const a = scaledW / g;
    const b = scaledH / g;
    const restoredRatio = a / b;

    // 量化的相对误差：|scaledW - w*1000| / (w*1000) 等
    const q1 = Math.abs(w * SCALE - scaledW) / (w * SCALE);
    const q2 = Math.abs(h * SCALE - scaledH) / (h * SCALE);
    // 量化比值相对真实比值的偏差上界：|(1+e1)/(1+e2) - 1| ≤ (q1+q2)/(1-min(q1,q2))
    // 用这个上界（而不是简单相加）避免边界抖动导致"精确/不精确"判定反复横跳
    const quantRelError = (q1 + q2) / Math.max(1e-18, 1 - Math.min(q1, q2));
    const restoredRelError = Math.abs(restoredRatio - ratio) / ratio;

    // exact 的判定用严格容差 1e-9：只有"整数约分真的还原了输入比例"才算精确。
    // 输入精度不足时（还原误差 > 1e-9），约分结果只是近似 —— 绝不当成精确值展示，
    // 改走连分数逼近，并带上 exact:false 标记。
    const exact = restoredRelError <= EXACT_REL_TOL;

    // 取整引入的相对误差计入"近似比"的接受容差：
    // 输入本身精度不够时，不该因为量化噪声而否掉一个本来很贴切的逼近比。
    const nearestTolerance = APPROX_REL_TOL + quantRelError;

    const precision = buildPrecision(
      exact ? 'scaled-integer-gcd' : 'continued-fraction-approximation',
      scaledW, scaledH, g, quantRelError, restoredRelError, nearestTolerance
    );

    return {
      ok: true,
      ratio: ratio,
      decimal: fmt(ratio, 4),
      reduced: exact ? { a: a, b: b } : null,
      reducedText: exact ? (a + ':' + b) : '',
      exact: exact,
      nearest: exact ? null : buildNearest(ratio, nearestTolerance),
      precision: precision,
      error: null,
      message: ''
    };
  }

  /**
   * 组装精度说明对象（把"为什么这么判"讲清楚，UI 可直接展示）。
   */
  function buildPrecision(strategy, scaledW, scaledH, g, quantRelError, restoredRelError, nearestTolerance) {
    const q = finiteOr(quantRelError, 0);
    const hasRestored = typeof restoredRelError === 'number' && Number.isFinite(restoredRelError);
    const r = hasRestored ? restoredRelError : 0;
    return {
      strategy: strategy,
      scale: SCALE,
      scaledWidth: scaledW,
      scaledHeight: scaledH,
      gcd: g,
      // 取整（量化到 1/1000 mm）引入的相对误差：输入精度不足的代价，必须可见
      quantizationRelError: q,
      quantizationRelErrorPercent: roundTo(q * 100, 4),
      // 整数约分还原回真实比例后的相对误差
      restoredRelError: hasRestored ? r : null,
      restoredRelErrorPercent: hasRestored ? roundTo(r * 100, 4) : null,
      exactTolerance: EXACT_REL_TOL,
      exactToleranceText: fmt(EXACT_REL_TOL, 12),
      // 接受近似比时的容差 = 基础容差 + 取整引入的误差
      nearestTolerance: finiteOr(nearestTolerance, APPROX_REL_TOL),
      nearestToleranceText: fmt(nearestTolerance, 12),
      approxRelTolerance: APPROX_REL_TOL,
      maxDenominator: MAX_DENOMINATOR,
      quantized: q > 0,
      note: q > 0
        ? '输入小数超过 1/1000 mm，取整引入的相对误差 ' + fmt(q * 100, 6) + '% 已计入近似比容差'
        : '输入精度为 1/1000 mm 以内，整数约分可无损还原'
    };
  }

  /**
   * 求最近的有理数逼近比（仅在非精确时使用）。
   * @param {number} ratio
   * @param {number} [tolerance] 接受近似比的最大相对误差
   * @returns {object|null}
   */
  function buildNearest(ratio, tolerance) {
    const tol = finiteOr(tolerance, APPROX_REL_TOL);
    const ap = bestRational(ratio, MAX_DENOMINATOR);
    if (!ap) return null;
    if (ap.relError > tol) return null;
    return {
      a: ap.a,
      b: ap.b,
      text: ap.a + ':' + ap.b,
      exact: false,
      relError: ap.relError,
      relErrorPercent: roundErrorPercent(ap.relError * 100)
    };
  }

  /* ===================== C. 常见比例库 ===================== */

  /**
   * 常见画幅 / 分辨率库。
   * - exactValue：该条目的权威比例值（比值本身就是权威，不带"约等于"语义）。
   * - isTrueStandard：名称是否是严格数学标准。21:9 是俗称（严格比例为 7:3），
   *   故标记 false，避免 UI 把它当成真值去覆盖用户算出来的比例。
   * - kind：'ratio' 为画幅比例，'resolution' 为真实分辨率（供"与常见规格对比"）。
   */
  const STANDARDS = [
    { name: '16:9', exactValue: 16 / 9, isTrueStandard: true, kind: 'ratio', note: '标准宽屏比例，主流显示与视频常用' },
    { name: '16:10', exactValue: 16 / 10, isTrueStandard: true, kind: 'ratio', note: '笔记本与部分工业显示常用' },
    { name: '4:3', exactValue: 4 / 3, isTrueStandard: true, kind: 'ratio', note: '传统标屏、监控常用' },
    { name: '3:2', exactValue: 3 / 2, isTrueStandard: true, kind: 'ratio', note: '摄影与相机传感器常用' },
    { name: '1:1', exactValue: 1, isTrueStandard: true, kind: 'ratio', note: '正方形，异形拼接与像素立方常见' },
    { name: '9:16', exactValue: 9 / 16, isTrueStandard: true, kind: 'ratio', note: '竖屏，短视频全屏比例' },
    { name: '4:5', exactValue: 4 / 5, isTrueStandard: true, kind: 'ratio', note: '竖版内容常用' },
    {
      name: '21:9', exactValue: 7 / 3, isTrueStandard: false, kind: 'ratio',
      note: '21:9 为俗称标注，各分辨率实际比例不同；其严格数学比例为 7:3 ≈ 2.3333'
    },
    { name: '32:9', exactValue: 32 / 9, isTrueStandard: true, kind: 'ratio', note: '双屏拼接 / 带鱼屏比例' },
    { name: '2.35:1', exactValue: 2.35, isTrueStandard: true, kind: 'ratio', note: '电影宽银幕常用小数比例' },
    { name: '2.39:1', exactValue: 2.39, isTrueStandard: true, kind: 'ratio', note: '电影与流媒体常用小数比例' },
    { name: '2.40:1', exactValue: 2.4, isTrueStandard: true, kind: 'ratio', note: 'DCI 2.40:1 影院标准' },
    { name: '3440×1440', exactValue: 3440 / 1440, isTrueStandard: true, kind: 'resolution', resolution: { width: 3440, height: 1440 }, note: '真实超宽分辨率，严格比例 43:18 ≈ 2.3889' },
    { name: '3840×1646', exactValue: 3840 / 1646, isTrueStandard: true, kind: 'resolution', resolution: { width: 3840, height: 1646 }, note: '真实超宽分辨率，严格比例 1920:823 ≈ 2.3329' },
    { name: '3840×2160', exactValue: 3840 / 2160, isTrueStandard: true, kind: 'resolution', resolution: { width: 3840, height: 2160 }, note: '4K，严格 16:9' },
    { name: '1920×1080', exactValue: 1920 / 1080, isTrueStandard: true, kind: 'resolution', resolution: { width: 1920, height: 1080 }, note: '1080p，严格 16:9' }
  ];

  /**
   * 把比例与常见库比对。
   * 相对误差定义：|ratio - 标准值| / 标准值 * 100%
   * @param {number} ratio 待测比例
   * @param {number} [tolerancePercent=0.5] 容差（百分比）
   * @returns {object}
   */
  function matchStandards(ratio, tolerancePercent) {
    const r = typeof ratio === 'number' ? ratio : Number(ratio);
    const tol = typeof tolerancePercent === 'number' && Number.isFinite(tolerancePercent) && tolerancePercent >= 0
      ? tolerancePercent
      : DEFAULT_TOLERANCE_PERCENT;

    if (!Number.isFinite(r) || r <= 0) {
      return {
        ok: false, ratio: null, tolerance: tol, matches: [], closest: null,
        closestTrueStandard: null, isStandard: false, isTrueStandardMatch: false,
        error: 'invalidRatio', message: '比例必须是大于 0 的有限数'
      };
    }

    // 先按原始误差排序，再做展示取整 —— 排序必须用未取整值，否则极小误差会被并列打乱
    const rows = STANDARDS.map(function (s) {
      const diff = Math.abs(r - s.exactValue) / s.exactValue * 100;
      return { s: s, diff: diff };
    }).sort(function (a, b) {
      return a.diff - b.diff;
    });

    const matches = rows.map(function (row, i) {
      const s = row.s;
      const diff = row.diff;
      return {
        name: s.name,
        value: s.exactValue,
        kind: s.kind,
        resolution: s.resolution || null,
        diffPercent: roundErrorPercent(diff),
        diffPercentText: fmtErrorPercent(diff),
        exactMatch: diff <= EXACT_REL_TOL * 100,
        withinTolerance: diff <= tol,
        isTrueStandard: s.isTrueStandard,
        note: s.note,
        closest: (i === 0)
      };
    });

    const closest = matches[0] || null;
    const closestTrueStandard = matches.filter(function (m) { return m.isTrueStandard; })[0] || null;

    return {
      ok: true,
      ratio: r,
      tolerance: tol,
      matches: matches,
      closest: closest,
      closestTrueStandard: closestTrueStandard,
      // 超出容差 ⇒ 非标准比例（UI 需要据此提示"非标准比例"）
      isStandard: matches.some(function (m) { return m.withinTolerance; }),
      isTrueStandardMatch: matches.some(function (m) { return m.withinTolerance && m.isTrueStandard; }),
      error: null,
      message: ''
    };
  }

  /* ===================== D. 视频画布换算 ===================== */

  /**
   * 在整数高度候选中，挑输出比例最贴近目标比例的那个。
   * 候选只有 floor/ceil 两个（|W/h - r| 在 h < W/r 时单调减、h > W/r 时单调增），
   * 但必须显式比较"输出比例误差"，不能直接拿 Math.round 顶替——
   * 取整策略必须由误差说了算，而不是由四舍五入说了算。
   */
  function pickBestHeight(targetWidth, theoretical, ratio) {
    const lower = Math.floor(theoretical);
    const upper = Math.ceil(theoretical);
    const candidates = [];
    if (lower >= 1) candidates.push(lower);
    if (upper >= 1 && upper !== lower) candidates.push(upper);

    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      const h = candidates[i];
      const err = Math.abs(targetWidth / h - ratio);
      const heightErr = Math.abs(h - theoretical);
      if (best === null
        || err < best.err - 1e-15
        || (Math.abs(err - best.err) <= 1e-15 && heightErr < best.heightErr - 1e-12)) {
        best = { height: h, err: err, heightErr: heightErr };
      }
    }
    // 理论上界：连理论高度都小于 1px 时，至少给 1px，避免除零
    return best ? best.height : 1;
  }

  /**
   * 由目标宽度换算画布高度。
   * @param {number} targetWidth 目标宽度（px）
   * @param {number} ratio 目标比例（宽/高）
   * @returns {object}
   */
  function canvasFromWidth(targetWidth, ratio) {
    const W = typeof targetWidth === 'number' ? targetWidth : Number(targetWidth);
    const R = typeof ratio === 'number' ? ratio : Number(ratio);

    if (!Number.isFinite(W) || !Number.isFinite(R) || W <= 0 || R <= 0) {
      return {
        ok: false, error: 'invalidInput', message: '目标宽度与比例必须是大于 0 的有限数',
        theoreticalHeight: null, roundedHeight: null, bestRoundedHeight: null,
        outputWidth: null, outputHeight: null, outputRatio: null,
        ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null
      };
    }

    const theoreticalHeight = W / R;
    const roundedHeight = Math.round(theoreticalHeight);
    const bestRoundedHeight = pickBestHeight(W, theoreticalHeight, R);

    // 极端比例会让理论高度溢出（1e-308 之类）—— 对外数值必须有限，
    // 这种情况直接报错，绝不把 Infinity 交给 UI。
    if (!Number.isFinite(theoreticalHeight) || !Number.isFinite(bestRoundedHeight)
      || !Number.isFinite(roundedHeight)) {
      return {
        ok: false, error: 'overflow', message: '目标宽度与比例组合导致高度超出可表示范围',
        theoreticalHeight: null, roundedHeight: null, bestRoundedHeight: null,
        outputWidth: null, outputHeight: null, outputRatio: null,
        ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null
      };
    }

    const outputRatio = W / bestRoundedHeight;
    const ratioRelError = Math.abs(outputRatio - R) / R;
    const ratioErrorPercent = ratioRelError * 100;
    const pixelErrorPercent = Math.abs(bestRoundedHeight - theoreticalHeight) / theoreticalHeight * 100;

    return {
      ok: true,
      error: null,
      message: '',
      targetWidth: W,
      ratio: R,
      theoreticalHeight: theoreticalHeight,
      theoreticalHeightText: fmt(theoreticalHeight, 4),
      roundedHeight: roundedHeight,
      bestRoundedHeight: bestRoundedHeight,
      outputWidth: W,
      outputHeight: bestRoundedHeight,
      outputRatio: outputRatio,
      outputRatioText: fmt(outputRatio, 4),
      ratioErrorPercent: roundErrorPercent(ratioErrorPercent),
      ratioErrorPercentText: fmtErrorPercent(ratioErrorPercent),
      pixelErrorPercent: roundErrorPercent(pixelErrorPercent),
      pixelErrorPercentText: fmtErrorPercent(pixelErrorPercent),
      // 只有输出比例与目标比例的相对误差 ≤ 1e-9 才算严格匹配
      strictMatch: ratioRelError <= EXACT_REL_TOL,
      fitAdvice: fitAdvice(W, bestRoundedHeight, R)
    };
  }

  /**
   * 由目标高度换算画布宽度（与 canvasFromWidth 对称）。
   * @param {number} targetHeight 目标高度（px）
   * @param {number} ratio 目标比例（宽/高）
   * @returns {object}
   */
  function canvasFromHeight(targetHeight, ratio) {
    const H = typeof targetHeight === 'number' ? targetHeight : Number(targetHeight);
    const R = typeof ratio === 'number' ? ratio : Number(ratio);

    if (!Number.isFinite(H) || !Number.isFinite(R) || H <= 0 || R <= 0) {
      return {
        ok: false, error: 'invalidInput', message: '目标高度与比例必须是大于 0 的有限数',
        theoreticalWidth: null, roundedWidth: null, bestRoundedWidth: null,
        outputWidth: null, outputHeight: null, outputRatio: null,
        ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null
      };
    }

    const theoreticalWidth = H * R;
    const roundedWidth = Math.round(theoreticalWidth);
    const bestRoundedWidth = pickBestWidth(H, theoreticalWidth, R);

    // 同 canvasFromWidth：溢出必须报错，不能把 Infinity 交给 UI
    if (!Number.isFinite(theoreticalWidth) || !Number.isFinite(bestRoundedWidth)
      || !Number.isFinite(roundedWidth)) {
      return {
        ok: false, error: 'overflow', message: '目标高度与比例组合导致宽度超出可表示范围',
        theoreticalWidth: null, roundedWidth: null, bestRoundedWidth: null,
        outputWidth: null, outputHeight: null, outputRatio: null,
        ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null
      };
    }

    const outputRatio = bestRoundedWidth / H;
    const ratioRelError = Math.abs(outputRatio - R) / R;
    const ratioErrorPercent = ratioRelError * 100;
    const pixelErrorPercent = Math.abs(bestRoundedWidth - theoreticalWidth) / theoreticalWidth * 100;

    // 输出比例仍可能因目标高度过小而溢出 —— 对外数值必须有限
    if (!Number.isFinite(outputRatio) || !Number.isFinite(ratioErrorPercent)
      || !Number.isFinite(pixelErrorPercent)) {
      return {
        ok: false, error: 'overflow', message: '目标高度与比例组合导致结果超出可表示范围',
        theoreticalWidth: null, roundedWidth: null, bestRoundedWidth: null,
        outputWidth: null, outputHeight: null, outputRatio: null,
        ratioErrorPercent: null, pixelErrorPercent: null, strictMatch: false, fitAdvice: null
      };
    }

    return {
      ok: true,
      error: null,
      message: '',
      targetHeight: H,
      ratio: R,
      theoreticalWidth: theoreticalWidth,
      theoreticalWidthText: fmt(theoreticalWidth, 4),
      roundedWidth: roundedWidth,
      bestRoundedWidth: bestRoundedWidth,
      outputWidth: bestRoundedWidth,
      outputHeight: H,
      outputRatio: outputRatio,
      outputRatioText: fmt(outputRatio, 4),
      ratioErrorPercent: roundErrorPercent(ratioErrorPercent),
      ratioErrorPercentText: fmtErrorPercent(ratioErrorPercent),
      pixelErrorPercent: roundErrorPercent(pixelErrorPercent),
      pixelErrorPercentText: fmtErrorPercent(pixelErrorPercent),
      strictMatch: ratioRelError <= EXACT_REL_TOL,
      fitAdvice: fitAdvice(bestRoundedWidth, H, R)
    };
  }

  /**
   * 在整数宽度候选中挑输出比例最贴近目标比例的那个（与 pickBestHeight 对称）。
   */
  function pickBestWidth(targetHeight, theoretical, ratio) {
    const lower = Math.floor(theoretical);
    const upper = Math.ceil(theoretical);
    const candidates = [];
    if (lower >= 1) candidates.push(lower);
    if (upper >= 1 && upper !== lower) candidates.push(upper);

    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      const w = candidates[i];
      const err = Math.abs(w / targetHeight - ratio);
      const widthErr = Math.abs(w - theoretical);
      if (best === null
        || err < best.err - 1e-15
        || (Math.abs(err - best.err) <= 1e-15 && widthErr < best.widthErr - 1e-12)) {
        best = { width: w, err: err, widthErr: widthErr };
      }
    }
    return best ? best.width : 1;
  }

  /**
   * 等比适配建议：内容塞进目标画布时，该裁切还是该留黑边。
   *
   * 判定规则（两种方案都是等比缩放，绝不建议拉伸画面）：
   * - 比例一致 → 'exact'，不裁不补；
   * - 内容比画布宽（多出来的在左右）→ 推荐 'crop'：左右各裁掉一半溢出部分。
   *   裁左右对画面损伤最小（不会切掉上下字幕/台标），大屏铺满也更干净；
   * - 内容比画布窄（多出来的在上下）→ 推荐 'letterbox'：左右补黑边完整保留内容。
   *   若改成上下裁切，会直接切掉字幕与画面下缘，代价更大。
   *
   * 两种方案的量化数值都会返回（coverCropPx / containBarPx），
   * 供 UI 画叠加层或做方案切换。
   *
   * ★ 轴向说明（UI 画叠加层必须知道，否则无法判断该往哪边画裁切/黑边）：
   * 每个数值都配有对应的轴标记，'x' = 左右方向，'y' = 上下方向，null = 不适用。
   * 推荐方案（cropPx / pillarboxPx）恒为左右方向（'x'）：
   *   内容太宽 → 裁左右；内容太窄 → 左右补边。
   * 备选方案则是上下方向（'y'）。
   *
   * @param {number} canvasWidth 画布宽（px）
   * @param {number} canvasHeight 画布高（px）
   * @param {number} contentRatio 内容比例（宽/高）
   * @returns {object}
   */
  function fitAdvice(canvasWidth, canvasHeight, contentRatio) {
    const W = typeof canvasWidth === 'number' ? canvasWidth : Number(canvasWidth);
    const H = typeof canvasHeight === 'number' ? canvasHeight : Number(canvasHeight);
    const R = typeof contentRatio === 'number' ? contentRatio : Number(contentRatio);

    if (!Number.isFinite(W) || !Number.isFinite(H) || !Number.isFinite(R) || W <= 0 || H <= 0 || R <= 0) {
      return {
        ok: false, error: 'invalidInput', message: '画布尺寸与内容比例必须是大于 0 的有限数',
        mode: null, cropPx: null, pillarboxPx: null,
        cropAxis: null, pillarboxAxis: null, coverCropAxis: null, containBarAxis: null
      };
    }

    const canvasRatio = W / H;
    const diff = Math.abs(R - canvasRatio) / R;

    // 画布比例本身溢出（极端宽高比）时无法判定适配方案，直接报错
    if (!Number.isFinite(canvasRatio)) {
      return {
        ok: false, error: 'overflow', message: '画布宽高相差过大，比例超出可表示范围',
        mode: null, cropPx: null, pillarboxPx: null,
        cropAxis: null, pillarboxAxis: null, coverCropAxis: null, containBarAxis: null
      };
    }

    if (diff <= EXACT_REL_TOL) {
      return {
        ok: true, error: null, message: '', mode: 'exact',
        cropPx: 0, pillarboxPx: 0, coverCropPx: 0, containBarPx: 0,
        cropAxis: null, pillarboxAxis: null, coverCropAxis: null, containBarAxis: null,
        canvasRatio: canvasRatio, contentRatio: R,
        note: '内容比例与画布一致，无需裁切或补边'
      };
    }

    if (R > canvasRatio) {
      // 内容更宽：铺满要裁左右；完整显示内容则上下补边
      const coverCropPx = (H * R - W) / 2;      // 左右各裁多少
      const containBarPx = (H - W / R) / 2;     // 上下各补多少
      return {
        ok: true, error: null, message: '', mode: 'crop',
        cropPx: roundTo(coverCropPx, 4), pillarboxPx: 0,
        cropAxis: 'x', pillarboxAxis: null,
        coverCropPx: roundTo(coverCropPx, 4), containBarPx: roundTo(containBarPx, 4),
        coverCropAxis: 'x', containBarAxis: 'y',
        canvasRatio: canvasRatio, contentRatio: R,
        note: '内容比画布宽，等比铺满需左右各裁 ' + fmt(coverCropPx, 2)
          + 'px（若要完整显示内容则上下各补 ' + fmt(containBarPx, 2) + 'px 黑边）'
      };
    }

    // 内容更窄：保留完整内容，左右补边；铺满则上下裁切
    const containBarPx = (W - H * R) / 2;       // 左右各补多少
    const coverCropPx = (W / R - H) / 2;       // 上下各裁多少
    return {
      ok: true, error: null, message: '', mode: 'letterbox',
      cropPx: 0, pillarboxPx: roundTo(containBarPx, 4),
      cropAxis: null, pillarboxAxis: 'x',
      coverCropPx: roundTo(coverCropPx, 4), containBarPx: roundTo(containBarPx, 4),
      coverCropAxis: 'y', containBarAxis: 'x',
      canvasRatio: canvasRatio, contentRatio: R,
      note: '内容比画布窄，等比保留完整内容需左右各补 ' + fmt(containBarPx, 2)
        + 'px 黑边（若要铺满则上下各裁 ' + fmt(coverCropPx, 2) + 'px）'
    };
  }

  /* ===================== E. 整数倍画布 ===================== */

  /**
   * 把传入的 ratio 归一为整数比 {a,b}。
   * 支持三种入参：数字 / {a,b} / computeRatio 的结果对象。
   */
  function resolveIntegerRatio(ratio) {
    // 1) computeRatio 结果对象
    if (ratio && typeof ratio === 'object' && !Array.isArray(ratio)) {
      if (ratio.reduced && Number.isFinite(ratio.reduced.a) && Number.isFinite(ratio.reduced.b) && ratio.reduced.b > 0) {
        const target = Number.isFinite(ratio.ratio) && ratio.ratio > 0 ? ratio.ratio : ratio.reduced.a / ratio.reduced.b;
        return { a: ratio.reduced.a, b: ratio.reduced.b, target: target, relError: Math.abs(ratio.reduced.a / ratio.reduced.b - target) / target };
      }
      if (ratio.nearest && Number.isFinite(ratio.nearest.a) && Number.isFinite(ratio.nearest.b) && ratio.nearest.b > 0) {
        const target = Number.isFinite(ratio.ratio) && ratio.ratio > 0 ? ratio.ratio : ratio.nearest.a / ratio.nearest.b;
        return { a: ratio.nearest.a, b: ratio.nearest.b, target: target, relError: Math.abs(ratio.nearest.a / ratio.nearest.b - target) / target };
      }
      if (Number.isFinite(ratio.a) && Number.isFinite(ratio.b) && ratio.b > 0) {
        return { a: ratio.a, b: ratio.b, target: ratio.a / ratio.b, relError: 0 };
      }
      return null;
    }

    // 2) 纯数字：用连分数逼近还原整数比
    const v = typeof ratio === 'number' ? ratio : Number(ratio);
    if (!Number.isFinite(v) || v <= 0) return null;
    const ap = bestRational(v, MAX_DENOMINATOR);
    if (!ap) return null;
    return { a: ap.a, b: ap.b, target: v, relError: ap.relError };
  }

  /**
   * 整数倍画布（模式 D）。
   *
   * k 的取法：以屏高为基准（LED 屏按高度整数倍拼装），k = floor(maxHeight / b)，
   * 画布 = k*a × k*b。当该解超出 maxWidth 时，仍返回它作为"精确拼装尺寸"，
   * 同时给出 exceedsMaxWidth / overflowPx 提示，并额外给出严格落在
   * maxWidth × maxHeight 之内的 withinBounds 解供 UI 切换。
   * 可用 options.prefer = 'bounds' 改为以"两个上限都不得突破"为准。
   *
   * @param {number|object} ratio 比例（数字 / {a,b} / computeRatio 结果）
   * @param {{maxWidth:number,maxHeight:number,prefer?:string}} options
   * @returns {object}
   */
  function bestIntegerCanvas(ratio, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxWidth = Number(opts.maxWidth);
    const maxHeight = Number(opts.maxHeight);

    if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight) || maxWidth <= 0 || maxHeight <= 0) {
      return {
        ok: false, width: null, height: null, k: null, exact: false,
        ratioErrorPercent: null, note: 'maxWidth / maxHeight 必须是大于 0 的有限数',
        error: 'invalidBounds', message: 'maxWidth / maxHeight 必须是大于 0 的有限数'
      };
    }

    const resolved = resolveIntegerRatio(ratio);
    if (!resolved) {
      return {
        ok: false, width: null, height: null, k: null, exact: false,
        ratioErrorPercent: null, note: '无法解析比例', error: 'invalidRatio', message: '无法解析比例'
      };
    }

    const a = resolved.a;
    const b = resolved.b;
    const kHeight = Math.floor(maxHeight / b);
    const kBounds = Math.min(Math.floor(maxWidth / a), kHeight);
    const prefer = opts.prefer === 'bounds' ? 'bounds' : 'height';
    const k = prefer === 'bounds' ? kBounds : kHeight;

    if (k < 1) {
      // 连 1 倍都放不下 —— 真正的无解
      return {
        ok: false, width: null, height: null, k: 0, exact: false,
        outputWidth: null, outputHeight: null, strictMatch: false,
        pixelErrorPercent: null, pixelErrorPercentText: null, fitAdvice: null,
        ratioErrorPercent: null, note: '最小整数倍已超出给定上限',
        error: 'noSolution', message: '最小整数倍已超出给定上限'
      };
    }

    const width = k * a;
    const height = k * b;

    // 极端比例（如 1e308）会让 k*a 溢出成 Infinity —— 对外数值必须有限，
    // 这种比例根本没有可用的整数倍画布，必须明确报错而不是吐出一个 Infinity。
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return {
        ok: false, width: null, height: null, k: null, exact: false,
        outputWidth: null, outputHeight: null, strictMatch: false,
        pixelErrorPercent: null, pixelErrorPercentText: null, fitAdvice: null,
        ratioErrorPercent: null, note: '比例数值过大，超出可表示范围',
        error: 'overflow', message: '比例数值过大，超出可表示范围'
      };
    }

    const outputRatio = width / height;
    const ratioErrorPercent = Math.abs(outputRatio - resolved.target) / resolved.target * 100;
    const exact = resolved.relError <= EXACT_REL_TOL;

    /**
     * 组装一个整数倍解的完整字段集。
     * 字段集与 canvasFromWidth / canvasFromHeight 保持一致，
     * UI 消费 result 时统一按这套契约读 —— 缺字段会让整条渲染链路静默失效。
     */
    function buildSolution(kk) {
      const w = kk * a;
      const h = kk * b;
      const over = w - maxWidth;
      // fitAdvice 传自身比例（width/height）：整数倍画布是用户自己指定的画布，
      // 它的比例天然等于目标比例；屏/画布的适配关系由舞台叠加层单独表达。
      return {
        width: w,
        height: h,
        k: kk,
        outputWidth: w,
        outputHeight: h,
        outputRatio: w / h,
        outputRatioText: fmt(w / h, 4),
        strictMatch: exact,
        pixelErrorPercent: 0,
        pixelErrorPercentText: fmtErrorPercent(0),
        fitAdvice: fitAdvice(w, h, w / h),
        exceedsMaxWidth: over > 0,
        overflowPx: over > 0 ? roundTo(over, 4) : 0
      };
    }

    // 两个解恒定同时给出：精确解（以屏高定 k，可能超宽）与界内解
    const exactSolution = buildSolution(kHeight);
    const withinBounds = kBounds >= 1 ? buildSolution(kBounds) : null;

    // 主解按用户所选档位（height = 以屏高定 k；bounds = 严格落在上限内）
    const primary = prefer === 'bounds' ? (withinBounds || exactSolution) : exactSolution;
    // 推荐解：需求 §3.5「优先寻找不超过上限、且比例精确的最大可用画布」
    // 越界解不得占据当前位，UI 应优先展示它（见 recommended 字段）
    const recommended = withinBounds || primary;

    let note;
    if (!exact) {
      note = '比例无法用有限整数比精确表示，已用分母 ≤ ' + MAX_DENOMINATOR
        + ' 的有理数逼近 ' + a + ':' + b + ' 代替，误差 ' + fmtErrorPercent(ratioErrorPercent) + '%';
    } else if (!withinBounds) {
      note = '以屏高 ' + maxHeight + ' 为基准的最小整数倍拼装尺寸为 ' + primary.width + '×' + primary.height
        + '（k=' + primary.k + '），但没有任何整数倍能同时落在 ' + maxWidth + '×' + maxHeight + ' 之内';
    } else if (primary.exceedsMaxWidth) {
      note = '以屏高 ' + maxHeight + ' 为基准的最小整数倍拼装尺寸为 ' + primary.width + '×' + primary.height
        + '（k=' + primary.k + '），宽度超出上限 ' + primary.overflowPx + 'px；'
        + '严格落在 ' + maxWidth + '×' + maxHeight + ' 之内的最大整数倍为 '
        + withinBounds.width + '×' + withinBounds.height + '（k=' + withinBounds.k + '）';
    } else {
      note = '以屏高 ' + maxHeight + ' 为基准的最小整数倍拼装尺寸为 ' + primary.width + '×' + primary.height
        + '（k=' + primary.k + '），严格落在 ' + maxWidth + '×' + maxHeight + ' 之内';
    }

    return {
      ok: true,
      error: null,
      message: '',
      width: primary.width,
      height: primary.height,
      k: primary.k,
      exact: exact,
      reducedText: a + ':' + b,
      outputWidth: primary.outputWidth,
      outputHeight: primary.outputHeight,
      outputRatio: primary.outputRatio,
      outputRatioText: primary.outputRatioText,
      ratioErrorPercent: roundErrorPercent(ratioErrorPercent),
      ratioErrorPercentText: fmtErrorPercent(ratioErrorPercent),
      strictMatch: primary.strictMatch,
      pixelErrorPercent: primary.pixelErrorPercent,
      pixelErrorPercentText: primary.pixelErrorPercentText,
      fitAdvice: primary.fitAdvice,
      mode: prefer,
      exceedsMaxWidth: primary.exceedsMaxWidth,
      overflowPx: primary.overflowPx,
      fitsInBounds: withinBounds !== null && !primary.exceedsMaxWidth,
      // 界内解（严格落在 maxWidth×maxHeight 之内）
      withinBounds: withinBounds,
      // 精确解（以屏高定 k，比例精确但可能超宽）—— 恒定返回，任何档位都不会消失
      exactSolution: exactSolution,
      // 推荐解：不超限且比例精确的最大解（越界解不得占据当前位）
      recommended: recommended,
      // 用户所选档位对应的解（当它超宽时与推荐解不同）
      preferred: primary,
      overflowFallback: primary !== recommended,
      note: note
    };
  }

  /* ===================== F. 预设规格 ===================== */

  /**
   * 常见分辨率预设。realRatio 由像素宽高实算，不做任何"约等于标准比例"的加工。
   */
  const PRESETS = [
    { name: '1920×1080', width: 1920, height: 1080, note: '1080p 主流标准屏' },
    { name: '2560×1440', width: 2560, height: 1440, note: '2K 标准屏' },
    { name: '3440×1440', width: 3440, height: 1440, note: '超宽屏，严格比例 43:18' },
    { name: '3840×2160', width: 3840, height: 2160, note: '4K，严格 16:9' },
    { name: '3840×1646', width: 3840, height: 1646, note: '超宽屏，严格比例 1920:823' },
    { name: '4096×2160', width: 4096, height: 2160, note: 'DCI 4K，严格 256:135' },
    { name: '5120×2160', width: 5120, height: 2160, note: '5K 电影宽幅，严格 64:27' }
  ].map(function (p) {
    const g = gcd(p.width, p.height);
    const realRatio = p.width / p.height;
    return {
      name: p.name,
      width: p.width,
      height: p.height,
      realRatio: realRatio,
      realRatioText: fmt(realRatio, 4),
      ratioText: (p.width / g) + ':' + (p.height / g),
      note: p.note
    };
  });

  /* ===================== G. 演示案例 ===================== */

  /**
   * 演示案例：全部由上面的真实函数现算，保证 UI 展示与计算结果永远一致。
   * 每个案例带中文名、中文说明与可直接渲染的 result 数据。
   */
  function buildDemoCases() {
    const cases = [];

    // 案例 A：14m × 4m 超宽工程屏
    {
      const r = computeRatio(14000, 4000);
      const canvas = canvasFromWidth(4900, r.ratio);
      const std = matchStandards(r.ratio);
      const m21 = std.matches.filter(function (m) { return m.name === '21:9'; })[0];
      cases.push({
        id: 'case-a-14m-4m',
        name: '14m × 4m 超宽工程屏（3.5:1）',
        description: '真实计算比例 3.5，最简整数比 7:2；4900px 宽 → 4900×1400 严格匹配；不会被误判为 21:9。',
        inputs: { width: '14', height: '4', unit: 'm' },
        result: {
          ratio: r.ratio,
          decimal: r.decimal,
          reducedText: r.reducedText,
          exact: r.exact,
          theoreticalHeight: canvas.theoreticalHeight,
          canvasWidth: canvas.outputWidth,
          canvasHeight: canvas.outputHeight,
          strictMatch: canvas.strictMatch,
          ratioErrorPercent: canvas.ratioErrorPercent,
          isStandardRatio: std.isStandard,
          matches21x9: m21.withinTolerance,
          diffPercent21x9: m21.diffPercent,
          note: '3.5 与 21:9（7:3 ≈ 2.3333）相差 ' + fmt(m21.diffPercent, 2) + '%，远超 0.5% 容差，不会被判成 21:9。'
        }
      });
    }

    // 案例 B：目标比例 21:9（7:3），3840px 宽
    {
      const r = computeRatio(21000, 9000);
      const canvas = canvasFromWidth(3840, r.ratio);
      cases.push({
        id: 'case-b-21x9-3840',
        name: '21:9（7:3）目标比例 · 3840px 宽',
        description: '严格整数比 7:3；3840px 宽理论高 1645.7143px，取整 1646px，比例有微小误差（非严格匹配）。',
        inputs: { width: '21', height: '9', unit: 'm' },
        result: {
          ratio: r.ratio,
          decimal: r.decimal,
          reducedText: r.reducedText,
          exact: r.exact,
          theoreticalHeight: canvas.theoreticalHeight,
          theoreticalHeightText: canvas.theoreticalHeightText,
          canvasWidth: canvas.outputWidth,
          canvasHeight: canvas.outputHeight,
          outputRatioText: canvas.outputRatioText,
          strictMatch: canvas.strictMatch,
          ratioErrorPercent: canvas.ratioErrorPercent,
          pixelErrorPercent: canvas.pixelErrorPercent,
          note: '3840×1646 的实际比例是 ' + canvas.outputRatioText + '，与 7:3 存在微小偏差，属正常取整误差。'
        }
      });
    }

    // 案例 C：3440×1440 真实超宽分辨率
    {
      const r = computeRatio(3440, 1440);
      const std = matchStandards(r.ratio);
      const m21 = std.matches.filter(function (m) { return m.name === '21:9'; })[0];
      cases.push({
        id: 'case-c-3440x1440',
        name: '3440×1440 真实超宽分辨率',
        description: '严格比例 43:18 ≈ 2.3889，不是 21:9；与 2.39:1 接近。',
        inputs: { width: '3440', height: '1440', unit: 'mm' },
        result: {
          ratio: r.ratio,
          decimal: r.decimal,
          reducedText: r.reducedText,
          exact: r.exact,
          isStandardRatio: std.isStandard,
          matches21x9: m21.withinTolerance,
          diffPercent21x9: m21.diffPercent,
          closest: std.closest ? std.closest.name : null,
          closestDiffPercent: std.closest ? std.closest.diffPercent : null,
          note: '3440×1440 的严格整数比是 43:18，与 21:9（7:3）相差 ' + fmt(m21.diffPercent, 2) + '%，超出容差。'
        }
      });
    }

    // 案例 D：16:9 标准屏两种分辨率
    {
      const c1920 = canvasFromWidth(1920, 16 / 9);
      const c3840 = canvasFromWidth(3840, 16 / 9);
      cases.push({
        id: 'case-d-16x9',
        name: '16:9 标准屏（1920×1080 / 3840×2160）',
        description: '两种分辨率都严格命中 16:9，不产生任何取整误差。',
        // 必须给出物理尺寸：缺了尺寸，UI 载入后会退化成空输入的错误态
        inputs: { width: '16', height: '9', unit: 'm' },
        result: {
          ratio: 16 / 9,
          decimal: fmt(16 / 9, 4),
          reducedText: '16:9',
          exact: true,
          canvasWidth: 1920,
          canvasHeight: 1080,
          canvas1920: { width: c1920.outputWidth, height: c1920.outputHeight, strictMatch: c1920.strictMatch, ratioErrorPercent: c1920.ratioErrorPercent },
          canvas3840: { width: c3840.outputWidth, height: c3840.outputHeight, strictMatch: c3840.strictMatch, ratioErrorPercent: c3840.ratioErrorPercent },
          note: '1920×1080 与 3840×2160 的实际比例与 16:9 完全一致，strictMatch 均为 true。'
        }
      });
    }

    // 案例 E：65:36 变形比例
    {
      const r = computeRatio(65000, 36000);
      const canvas = canvasFromWidth(1920, r.ratio);
      const integerCanvas = bestIntegerCanvas(65 / 36, { maxWidth: 1920, maxHeight: 1080 });
      cases.push({
        id: 'case-e-65x36',
        name: '65:36 变形比例（非 16:9）',
        description: '1920px 宽理论高 1063.3846px，整数 1920×1063 非严格匹配并显示误差；精确整数倍方案为 1950×1080。',
        inputs: { width: '65', height: '36', unit: 'm' },
        result: {
          ratio: r.ratio,
          decimal: r.decimal,
          reducedText: r.reducedText,
          exact: r.exact,
          theoreticalHeight: canvas.theoreticalHeight,
          theoreticalHeightText: canvas.theoreticalHeightText,
          canvasWidth: canvas.outputWidth,
          canvasHeight: canvas.outputHeight,
          strictMatch: canvas.strictMatch,
          ratioErrorPercent: canvas.ratioErrorPercent,
          pixelErrorPercent: canvas.pixelErrorPercent,
          exactCanvas: { width: integerCanvas.width, height: integerCanvas.height, k: integerCanvas.k, exact: integerCanvas.exact },
          withinBounds: integerCanvas.withinBounds,
          note: integerCanvas.note
        }
      });
    }

    // 案例 F：异常输入、单位换算、互换反转、极端比例
    {
      const r14 = computeRatio(14000, 4000);
      const swapped = computeRatio(4000, 14000);
      const extreme = computeRatio(100000, 1);
      cases.push({
        id: 'case-f-robustness',
        name: '异常输入与数值健壮性',
        description: '本案例故意不填尺寸，用于演示错误提示。空/0/负数/非法字符分别返回对应错误；单位切换不改变比例；宽高互换比例反转；极端长宽比不产生 NaN/Infinity。',
        inputs: {},
        result: {
          // 载入后界面据此给出引导，避免用户以为工具坏了
          guidance: '本案例演示的是错误输入状态：屏幕尺寸故意留空，因此右侧显示输入有误属正常现象。可在上方直接输入尺寸查看正常换算结果。',
          errors: {
            empty: parseDimension('', 'm').error,
            zero: parseDimension('0', 'm').error,
            negative: parseDimension('-3', 'm').error,
            illegal: parseDimension('12abc', 'm').error
          },
          unitSwitch: {
            meters: parseDimension('14', 'm').mm,
            centimeters: parseDimension('1400', 'cm').mm,
            millimeters: parseDimension('14000', 'mm').mm,
            sameRatio: r14.ratio
          },
          swappedRatio: swapped.ratio,
          inverseRatio: 1 / r14.ratio,
          decimalInput: {
            value: parseDimension('3.75', 'm').mm,
            centimeters: parseDimension('2.34', 'cm').mm
          },
          extreme: {
            ratio: extreme.ratio,
            decimal: extreme.decimal,
            reducedText: extreme.reducedText,
            finite: Number.isFinite(extreme.ratio) && Number.isFinite(extreme.decimal.length)
          }
        }
      });
    }

    return cases;
  }

  const DEMO_CASES = buildDemoCases();

  /* ===================== 导出 ===================== */

  return {
    // A. 单位与尺寸解析
    parseDimension: parseDimension,
    toMm: toMm,
    UNIT_TO_MM: UNIT_TO_MM,
    // B. 比例计算
    computeRatio: computeRatio,
    gcd: gcd,
    bestRational: bestRational,
    // C. 常见比例库
    matchStandards: matchStandards,
    STANDARDS: STANDARDS,
    // D. 视频画布换算
    canvasFromWidth: canvasFromWidth,
    canvasFromHeight: canvasFromHeight,
    fitAdvice: fitAdvice,
    // E. 整数倍画布
    bestIntegerCanvas: bestIntegerCanvas,
    // F. 预设规格
    PRESETS: PRESETS,
    // G. 演示案例
    DEMO_CASES: DEMO_CASES,
    // H. 工具
    fmt: fmt,
    roundTo: roundTo,
    // 误差百分比的统一取整与格式化：UI 必须用这两个，
    // 否则各写各的 toFixed 会出现"误差显示 0% + 标着存在取整误差"的自相矛盾
    roundErrorPercent: roundErrorPercent,
    fmtErrorPercent: fmtErrorPercent,
    // 阈值常量（UI 若要做自定义容差可直接取用）
    EXACT_REL_TOL: EXACT_REL_TOL,
    APPROX_REL_TOL: APPROX_REL_TOL,
    MAX_DENOMINATOR: MAX_DENOMINATOR,
    DEFAULT_TOLERANCE_PERCENT: DEFAULT_TOLERANCE_PERCENT
  };
});
