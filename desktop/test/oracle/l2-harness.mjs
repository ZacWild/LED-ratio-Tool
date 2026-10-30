/* ==========================================================================
   LED-ratio-Tool 桌面版 · L2 黄金向量判定 harness（纯逻辑，无产品代码）
   ============================================================================
   依据：
     P4-BASELINE.md DEC-15 —— 差分门禁三层期望源
     P3-D09 §6.1 —— L2 = 人工确认黄金向量（**不得**由被测实现生成期望值）
     P3-D09 §6.3 —— 30 个比对字段与判定方式
     P3-D09 §6.4 —— 判定口径（字符串逐字符 / 整数严格 / 浮点 1e-12 相对 / 布尔严格）

   🔴 本模块的职责边界：
     · **只做判定与统计**，不启动浏览器、不驱动产品 —— 那在 golden-vectors.mjs；
     · **不 import/require 任何产品代码**（core.js / app.js / acceptance.mjs）——
       期望值一律来自人工（golden.json），实际值由 golden-vectors.mjs 从产品观测；
     · 字段注册表是 `field → { keys, extract, compare }` 的**唯一权威映射**，
       消除旧实现「用 v.expected[v.field] 取值」的键名错配缺陷
       （旧代码：field='fitAdvice.describeFit' 而 expected 键是 'describeFitText'
        → v.expected[v.field] 恒为 undefined → 全部落入「未覆盖」）。

   🔴 覆盖口径（DEC-15）：
     一组通过 ⇔ L1 或 L2 至少一层覆盖且该层判定通过。
     `pending_confirmation` 的向量**不计入** L2 已确认覆盖 —— 这是机器闸，
     不靠人工承诺（TK-130）。
   ========================================================================== */

'use strict';

/* ==========================================================================
   §1 字段注册表
   ==========================================================================
   每个条目：
     keys    —— expected 对象中必须出现的键（缺任一即校验失败）
     extract —— (obs, side) => 实际值对象；obs 为 PAGE_COLLECT 的观测 + 剪贴板
     compare —— 'string' | 'bool' | 'number'
     note    —— 口径说明

   🔴 obs.clipboard：剪贴板类字段（resolutionText / fullParameterText）由
      golden-vectors.mjs 在点击复制后读取并挂到观测对象上；
      HTML 侧读 navigator.clipboard，Electron 侧读主进程 clipboard 模块。
   ========================================================================== */

const numEq = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (typeof a !== 'number' || typeof b !== 'number') return a === b;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
};

const strEq = (a, b) => {
  if (a === null || a === undefined) a = '';
  if (b === null || b === undefined) b = '';
  return String(a) === String(b);
};

/**
 * 剪贴板文本行尾归一化（CRLF / CR → LF）。
 * 🔴 实测差异：同一场景同一产品，HTML 侧经 navigator.clipboard 读出为 CRLF，
 *    Electron 侧经 IPC 读出为 LF —— **内容完全相同**，差异来自 Windows
 *    剪贴板传输层。黄金向量的 expected 统一以 LF 存储，两侧归一化后比较，
 *    否则会把传输层差异误报成业务差异（假 FAIL）。
 */
function normEol(t) {
  if (t === null || t === undefined) return null;
  return String(t).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 从候选卡 meta 中抽取等比适配文案。
 * 🔴 必须优先取**当前模式**的候选（标题带「（当前）」）—— 候选列表含
 *    「按目标宽度 / 按目标高度 / 常用规格」多项，只有当前模式那项的
 *    fitAdvice 才对应场景的目标画布。取「第一个匹配」会把别的模式的
 *    文案误当成当前结果（P4-B 实测踩到：GV-003 场景下第一项是 exact，
 *    而 letterbox 文案在第三项）。
 */
function findDescribeFit(obs) {
  const cands = obs.candidates || [];
  const withMeta = cands.filter((c) => /等比适配：(.+?)（不建议拉伸）/.exec(c.meta || ''));
  const current = withMeta.find((c) => /（当前）/.test(c.title || ''));
  const target = current || withMeta[0];
  if (!target) return null;
  const m = /等比适配：(.+?)（不建议拉伸）/.exec(target.meta || '');
  return m ? m[1] : null;
}

/** 从候选卡 meta 判断是否出现「超限回落」 */
function findOverflowFallback(obs) {
  for (const c of obs.candidates || []) {
    if (c.meta && c.meta.indexOf('所选档位的解已超宽') >= 0) return true;
  }
  return false;
}

/**
 * 从误差表抽取「宽高比相对误差」行的格式化文本（去正负号与百分号）。
 * 🔴 列位口径：buildRow() 生成 4 列（项目/屏幕/画布/偏差），偏差类行的数值在
 *    **第 4 列**（PAGE_COLLECT 记为 pixelErr），第 3 列（ratioErr）恒为 '—'。
 *    因此必须同时探测两列，取含 '%' 的那个 —— 只看 ratioErr 会永远取不到。
 */
function findFmtErrorPercent(obs) {
  for (const r of obs.tableRows || []) {
    if (r.name !== '宽高比相对误差') continue;
    const cell = [r.ratioErr, r.pixelErr].find((t) => t && t !== '—' && /%/.test(String(t)));
    if (cell) return String(cell).replace(/^\+/, '').replace(/%$/, '');
  }
  return null;
}

export const FIELD_REGISTRY = {
  /* ---- F23：等比适配方案文案 ---- */
  'fitAdvice.describeFit': {
    keys: ['describeFitText'],
    compare: 'string',
    extract: (obs) => ({ describeFitText: findDescribeFit(obs) }),
    note: '候选卡 meta 中的「等比适配：…」文案；轴向取 core.fitAdvice 的 axis 字段',
  },

  /* ---- F19：21:9 警示条文案 ---- */
  warnText: {
    keys: ['warnText'],
    compare: 'string',
    extract: (obs) => ({ warnText: obs.warnVisible ? obs.warnText : null }),
    note: '警示条隐藏时文本为 null（DOM 中该节点 textContent 为空）',
  },

  /* ---- F19：警示条可见性（与 warnText 拆分，避免布尔/文本混在一个键） ---- */
  'warnBar.visible': {
    keys: ['warnVisible'],
    compare: 'bool',
    extract: (obs) => ({ warnVisible: obs.warnVisible === true }),
    note: '警示条 display 状态；>2.5% 偏离 21:9 的标准比例不得产生警告',
  },

  /* ---- F16：整数倍超限回落 ---- */
  overflowFallback: {
    keys: ['overflowFallback'],
    compare: 'bool',
    extract: (obs) => ({ overflowFallback: findOverflowFallback(obs) }),
    note: '候选 meta 含「所选档位的解已超宽」即为 true',
  },

  /* ---- F21：最接近标准比例的文本（连分数逼近路径） ---- */
  'nearest.text': {
    keys: ['nearestText'],
    compare: 'string',
    extract: (obs) => ({ nearestText: obs.nearestText || null }),
    note: 'approx-line 的近似有理数；UI 可达输入恒为精确约分（见 GV-009 说明）',
  },

  /* ---- F24：复制分辨率载荷 ---- */
  resolutionText: {
    keys: ['resolutionText'],
    compare: 'string',
    extract: (obs) => ({ resolutionText: normEol(obs.clipboard) }),
    note: '🔒 BM-28：纯文本 宽×高，× 为 U+00D7，不带千分位',
  },

  /* ---- F25：完整参数文本 ---- */
  fullParameterText: {
    keys: ['fullParameterText'],
    compare: 'string',
    extract: (obs) => ({ fullParameterText: normEol(obs.clipboard) }),
    note: 'buildFullParameterText() 的多行载荷；行尾归一化为 LF 后比较（Windows 剪贴板传输会把 \\n 转成 \\r\\n，属传输层差异而非业务差异）',
  },

  /* ---- F28：结果徽标 ---- */
  badge: {
    keys: ['badgeCode', 'badgeLabel'],
    compare: 'string',
    extract: (obs) => ({ badgeCode: obs.badgeCode || null, badgeLabel: obs.badgeLabel || null }),
    note: 'RS-01~RS-05 五态；badgeLabel 为去图标前缀的文本',
  },

  /* ---- F26/F27：输入错误文案 ---- */
  'error.message': {
    keys: ['message'],
    compare: 'string',
    extract: (obs) => ({ message: obs.errorWidth || obs.errorHeight || null }),
    note: '宽/高任一出错即取该侧文案；负数走 describeError 专分支',
  },

  /* ---- F22：误差百分比格式化 ---- */
  fmtErrorPercent: {
    keys: ['fmtErrorPercentText'],
    compare: 'string',
    extract: (obs) => ({ fmtErrorPercentText: findFmtErrorPercent(obs) }),
    note: '误差表「宽高比相对误差」行；非零误差不得显示为 0',
  },
};

/** 徽标文案需要从 badgeText 中剥离图标前缀（▲/✓/!/Δ） */
export function withBadgeLabel(obs) {
  if (!obs || obs.badgeText == null) return obs;
  const label = String(obs.badgeText).replace(/^[▲✓!Δ]\s*/, '');
  return Object.assign({}, obs, { badgeLabel: label, badgeText: label });
}

/* ==========================================================================
   §2 向量结构校验（P0-1 要求的显式校验）
   ========================================================================== */

const VALID_STATUS = ['confirmed', 'pending_confirmation'];

/**
 * 校验单条黄金向量的结构。
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
export function validateVector(v) {
  const errors = [];
  const warnings = [];

  if (!v || typeof v !== 'object') return { ok: false, errors: ['向量不是对象'], warnings };
  if (!v.id) errors.push('missing_id');

  /* —— input ---- */
  if (!v.input || typeof v.input !== 'object' || Object.keys(v.input).length === 0) {
    errors.push('missing_input');
  }

  /* —— expected ---- */
  if (!v.expected || typeof v.expected !== 'object' || Object.keys(v.expected).length === 0) {
    errors.push('empty_expected');
  }

  /* —— field 必须在注册表中 ---- */
  const entry = FIELD_REGISTRY[v.field];
  if (!entry) {
    errors.push('unknown_field:' + v.field);
  } else if (v.expected && typeof v.expected === 'object') {
    /* —— expected 必须包含注册表要求的全部键，且值非空 ---- */
    for (const k of entry.keys) {
      if (!(k in v.expected)) {
        errors.push('missing_expected_key:' + k);
      } else {
        const val = v.expected[k];
        if (val === null || val === undefined || val === '') {
          errors.push('empty_expected_value:' + k);
        }
      }
    }
    /* —— expected 不得包含注册表之外的键（防止陈旧键悄悄失效） ---- */
    for (const k of Object.keys(v.expected)) {
      if (k === 'note') continue;
      if (entry.keys.indexOf(k) < 0) warnings.push('unexpected_expected_key:' + k);
    }
  }

  /* —— confirmation_status ---- */
  if (VALID_STATUS.indexOf(v.confirmation_status) < 0) {
    errors.push('invalid_confirmation_status:' + v.confirmation_status);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ==========================================================================
   §3 单向量判定
   ========================================================================== */

/**
 * 用给定观测判定一条向量（单侧）。
 * 🔴 判定前先做**期望值完备性闸门**：expected 缺少注册表要求的键、或值为
 *    空（null/undefined/''）时，一律判 **不通过**并给出 _validation 差异项。
 *    —— 否则「空 expected」会因 strEq('' , '') 相等而被误判为通过
 *       （P0-2 负向自检 N-3f 实测踩到，已修）。
 * @param {object} v 向量
 * @param {object} obs 观测（PAGE_COLLECT 结果 + clipboard）
 * @returns {{pass:boolean, diffs:Array<{key,expected,actual}>, actual:object}}
 */
export function judgeVector(v, obs) {
  const entry = FIELD_REGISTRY[v.field];
  if (!entry) return { pass: false, diffs: [{ key: '_field', expected: v.field, actual: '未注册' }], actual: null };
  const actual = entry.extract(withBadgeLabel(obs) || {});
  const diffs = [];
  /* —— 期望值完备性闸门 —— */
  for (const k of entry.keys) {
    const expected = v.expected ? v.expected[k] : undefined;
    if (expected === undefined || expected === null || expected === '') {
      diffs.push({ key: '_validation:' + k, expected: '<非空期望值>', actual: expected === undefined ? '缺失' : JSON.stringify(expected) });
    }
  }
  if (diffs.length > 0) return { pass: false, diffs, actual };
  for (const k of entry.keys) {
    const expected = v.expected[k];
    const got = actual[k];
    let eq;
    if (entry.compare === 'bool') eq = expected === got;
    else if (entry.compare === 'number') eq = numEq(expected, got);
    else eq = strEq(expected, got);
    if (!eq) diffs.push({ key: k, expected, actual: got });
  }
  return { pass: diffs.length === 0, diffs, actual };
}

/* ==========================================================================
   §4 汇总统计（覆盖口径）
   ========================================================================== */

/**
 * @param {Array} vectors golden.json 的 vectors
 * @param {Array} results 每条向量的执行结果
 *   { id, status: 'pass'|'fail'|'invalid'|'unreachable'|'blocked', confirmed:boolean, field }
 */
export function summarize(vectors, results) {
  const stats = {
    total: vectors.length,
    confirmed: vectors.filter((v) => v.confirmation_status === 'confirmed').length,
    pending: vectors.filter((v) => v.confirmation_status === 'pending_confirmation').length,
    executed: 0, passed: 0, failed: 0, invalid: 0, unreachable: 0, blocked: 0,
    coveredByL2Confirmed: 0,
    coveredFields: [],
    pendingFields: [],
    unreachableFields: [],
    invalidVectors: [],
  };
  for (const r of results) {
    if (r.status === 'pass' || r.status === 'fail') stats.executed++;
    if (r.status === 'pass') stats.passed++;
    if (r.status === 'fail') stats.failed++;
    if (r.status === 'invalid') { stats.invalid++; stats.invalidVectors.push(r); }
    if (r.status === 'unreachable') { stats.unreachable++; stats.unreachableFields.push(r.field); }
    if (r.status === 'blocked') stats.blocked++;
    /* 🔴 pending 不计入已确认覆盖（机器闸） */
    if (r.confirmed && r.status === 'pass') {
      stats.coveredByL2Confirmed++;
      if (stats.coveredFields.indexOf(r.field) < 0) stats.coveredFields.push(r.field);
    }
    if (!r.confirmed && r.status !== 'invalid') {
      if (stats.pendingFields.indexOf(r.field) < 0) stats.pendingFields.push(r.field);
    }
  }
  return stats;
}

export { numEq, strEq };
