/**
 * LED-ratio-Tool 桌面版 · P 值 / 原生分辨率估算 / 箱体规格核验（v1.3.0）
 * ===========================================================================
 * 🔒 定位：**桌面专属、零依赖、零 DOM 的纯计算模块**。
 *    · 不修改 src/core.js（哈希锁）/ src/app.js（受保护源）/ 根 index.html；
 *    · 不引入任何新 IPC 通道、不发起网络请求、不读写剪贴板；
 *    · 不含任何 core.js 已有算法（比例约分 / 画布取整 / 适配判定一律不重复实现）。
 *
 * 🔒 数据语义（任务书 §3.1）：
 *    physicalWidthMm / physicalHeightMm  —— 只由 m/cm/mm 输入写入
 *    resolutionWidthPx / resolutionHeightPx —— 只由 px 输入写入
 *    pixelPitchMm —— 全局 P 值，null 表示「未配置」，绝不默认 P2.5
 *    两者**永不互相覆盖**；px 直接输入不得改写物理尺寸字段。
 *
 * 🔒 换算口径（任务书 §3 / §4）：
 *    theoreticalWidthPx  = physicalWidthMm  / pixelPitchMm
 *    theoreticalHeightPx = physicalHeightMm / pixelPitchMm
 *    整数估算用 Math.round（正数即四舍五入，0.5 向上）；连续值完整保留，
 *    并显式给出带符号的整数化误差，绝不静默修正。
 *
 * 运行形态：浏览器沙箱下挂 globalThis.LedPitch；Node 下走 module.exports（便于单测）。
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    globalThis.LedPitch = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MODULE_VERSION = '1.3.0';
  var MAX_PITCH_DECIMALS = 6;

  /** 常见 P 值预设（mm）。数值按原值保存，不做任何显示精度截断。 */
  var PITCH_PRESETS = Object.freeze([
    { label: 'P0.9', value: 0.9 },
    { label: 'P1.25', value: 1.25 },
    { label: 'P1.5', value: 1.5 },
    { label: 'P1.667', value: 1.667 },
    { label: 'P1.86', value: 1.86 },
    { label: 'P2', value: 2 },
    { label: 'P2.5', value: 2.5 },
    { label: 'P3', value: 3 },
    { label: 'P4', value: 4 },
    { label: 'P5', value: 5 },
  ]);

  var CABINET_DEFAULTS = Object.freeze({
    widthMm: 500,
    heightMm: 500,
    pixelsX: 200,
    pixelsY: 200,
    cols: 1,
    rows: 1,
  });

  var state = {
    physicalWidthMm: null,
    physicalHeightMm: null,
    resolutionWidthPx: null,
    resolutionHeightPx: null,
    pixelPitchMm: null,
    activeUnit: 'm',
    pxOrigin: null,            // 'converted' | 'direct' | null
    convertedWidthPx: null,
    convertedHeightPx: null,
    notice: '',
    cabinet: {
      widthMm: CABINET_DEFAULTS.widthMm,
      heightMm: CABINET_DEFAULTS.heightMm,
      pixelsX: CABINET_DEFAULTS.pixelsX,
      pixelsY: CABINET_DEFAULTS.pixelsY,
      cols: CABINET_DEFAULTS.cols,
      rows: CABINET_DEFAULTS.rows,
    },
  };

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /** 保留小数、去尾零；不用于任何内部计算，只用于展示。 */
  function fmtTrim(value, digits) {
    if (!isFiniteNumber(value)) return '—';
    var s = value.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /** 连续理论值固定 6 位小数展示（内部仍是完整 IEEE-754 值）。 */
  function fmtContinuous(value) {
    if (!isFiniteNumber(value)) return '—';
    return value.toFixed(6);
  }

  function fmtPitch(value) {
    if (value === null || value === undefined) return '未配置';
    return fmtTrim(value, MAX_PITCH_DECIMALS);
  }

  /**
   * P 值校验。
   * 合法域：大于 0 的有限数值；空值 = 未配置（合法，value=null）。
   * 拒绝：NaN / ±Infinity / 0 / 负数 / 非数值串 / 超 6 位小数。
   * 存储的是 Number 原值，不做任何四舍五入，避免显示精度丢失实际值。
   */
  /* S10-R8 i18n 原型：运行时经 LedI18N.t(key) 取当前语种；
     node --test 环境无 LedI18N → 回退 fallback（= zh-CN 原文），
     既有 26 项正则断言（/未配置/ /有限数值/）不受影响。 */
  function msg(key, fallback) {
    var g = (typeof global !== 'undefined') ? global : window;
    return (g && g.LedI18N && typeof g.LedI18N.t === 'function') ? g.LedI18N.t(key) : fallback;
  }

  function parsePitch(raw) {
    if (raw === null || raw === undefined ||
        (typeof raw === 'string' && raw.trim() === '')) {
      return { ok: true, value: null, unconfigured: true, error: '', message: msg('pitch.msg.unconfigured', '未配置') };
    }
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) {
        return { ok: false, value: null, unconfigured: false, error: 'finite', message: msg('pitch.err.finite.short', 'P 值必须是有限数值（不接受 NaN / Infinity）') };
      }
      if (raw <= 0) {
        return { ok: false, value: null, unconfigured: false, error: 'positive', message: msg('pitch.err.positive', 'P 值必须大于 0 mm') };
      }
      return { ok: true, value: raw, unconfigured: false, error: '', message: 'ok' };
    }
    if (typeof raw !== 'string') {
      return { ok: false, value: null, unconfigured: false, error: 'type', message: 'P 值必须是数值' };
    }
    var s = raw.trim();
    if (!/^[+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) {
      return { ok: false, value: null, unconfigured: false, error: 'format', message: 'P 值只能输入大于 0 的数值（mm）' };
    }
    var plain = s.split(/[eE]/)[0];
    var decimals = (plain.split('.')[1] || '').length;
    if (decimals > MAX_PITCH_DECIMALS) {
      return { ok: false, value: null, unconfigured: false, error: 'precision', message: 'P 值小数位数不得超过 ' + MAX_PITCH_DECIMALS + ' 位' };
    }
    var v = Number(s);
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, value: null, unconfigured: false, error: 'finite', message: 'P 值必须是大于 0 的有限数值（不接受 NaN / Infinity / 0 / 负数）' };
    }
    return { ok: true, value: v, unconfigured: false, error: '', message: 'ok' };
  }

  /** 设置全局 P 值；失败时不改动既有值。 */
  function setPitch(raw) {
    var r = parsePitch(raw);
    if (!r.ok) {
      state.notice = r.message;
      return r;
    }
    state.pixelPitchMm = r.value;
    state.notice = r.unconfigured
      ? '未配置 LED 像素间距 P：已禁止物理尺寸 ↔ 像素分辨率换算。可直接输入真实像素数量；原始物理尺寸保持不变。'
      : '';
    return r;
  }

  function getPitch() {
    return {
      ok: true,
      value: state.pixelPitchMm,
      unconfigured: state.pixelPitchMm === null,
      formatted: fmtPitch(state.pixelPitchMm),
    };
  }

  /** px 输入解析：返回与 core.parseDimension 兼容的形状 + 真实 px 语义字段。 */
  function parsePixelCount(raw) {
    var s = String(raw == null ? '' : raw).trim();
    var base = { ok: false, mm: null, px: null, value: null, unit: 'px', error: '', message: '', semantic: 'resolution' };
    if (!s) {
      base.error = 'empty';
      base.message = '请输入像素数量';
      return base;
    }
    if (!/^[+]?\d+(?:\.\d+)?$/.test(s)) {
      base.error = 'nan';
      base.message = '像素数量只能输入非负整数或数值';
      return base;
    }
    var v = Number(s);
    if (!Number.isFinite(v)) {
      base.error = 'nan';
      base.message = '像素数量不是有限数值';
      return base;
    }
    if (v <= 0) {
      base.error = 'nonPositive';
      base.value = v;
      base.message = v === 0 ? '像素数量不能为 0' : '像素数量不能为负数';
      return base;
    }
    base.ok = true;
    base.px = v;
    base.value = v;
    /* 🔒 mm 字段只是 app.js 既有无量纲比例链路的载体，绝不代表物理毫米；
       真实语义由 state.resolutionWidthPx / resolutionHeightPx 承载。 */
    base.mm = v;
    base.message = 'ok';
    return base;
  }

  function recordPhysicalMm(axis, mm) {
    if (!isFiniteNumber(mm)) return;
    if (axis === 'width') state.physicalWidthMm = mm;
    else if (axis === 'height') state.physicalHeightMm = mm;
  }

  function recordResolutionPx(axis, px) {
    if (!isFiniteNumber(px)) return;
    if (axis === 'width') state.resolutionWidthPx = px;
    else if (axis === 'height') state.resolutionHeightPx = px;
    /* 来源自动判别：若当前 px 值来自「由物理尺寸换算」，显示值必然等于
       换算时登记的 converted*；一旦用户直接编辑使二者不等，即标记为 direct，
       此后 P 值变化不再篡改该真实像素输入。 */
    if (state.pxOrigin === 'converted') {
      if ((axis === 'width' && px !== state.convertedWidthPx) ||
          (axis === 'height' && px !== state.convertedHeightPx)) {
        state.pxOrigin = 'direct';
      }
    } else if (state.activeUnit === 'px') {
      state.pxOrigin = 'direct';
    }
  }

  function markPxDirect() {
    state.pxOrigin = 'direct';
  }

  function markPxConverted(wPx, hPx) {
    state.pxOrigin = 'converted';
    state.convertedWidthPx = wPx;
    state.convertedHeightPx = hPx;
  }

  function setActiveUnit(unit) {
    state.activeUnit = unit;
  }

  function setNotice(message) {
    state.notice = String(message || '');
  }

  function clearNotice() {
    state.notice = '';
  }

  function getPhysical() {
    return {
      ok: isFiniteNumber(state.physicalWidthMm) && isFiniteNumber(state.physicalHeightMm),
      widthMm: state.physicalWidthMm,
      heightMm: state.physicalHeightMm,
    };
  }

  function snapshot() {
    return {
      physicalWidthMm: state.physicalWidthMm,
      physicalHeightMm: state.physicalHeightMm,
      resolutionWidthPx: state.resolutionWidthPx,
      resolutionHeightPx: state.resolutionHeightPx,
      pixelPitchMm: state.pixelPitchMm,
      activeUnit: state.activeUnit,
      pxOrigin: state.pxOrigin,
      notice: state.notice,
      cabinet: Object.assign({}, state.cabinet),
    };
  }

  /** 纯换算：物理毫米 → 理论像素（连续值 + 整数估算 + 误差）。 */
  function physicalToPixels(physicalWidthMm, physicalHeightMm, pixelPitchMm) {
    var p = parsePitch(pixelPitchMm);
    if (!p.ok || p.unconfigured) {
      return {
        ok: false,
        reason: p.unconfigured ? '未配置 LED 像素间距 P，禁止执行物理尺寸 → 像素分辨率换算' : p.message,
        pixelPitchMm: null,
      };
    }
    if (!isFiniteNumber(physicalWidthMm) || !isFiniteNumber(physicalHeightMm) ||
        physicalWidthMm <= 0 || physicalHeightMm <= 0) {
      return { ok: false, reason: '屏幕物理尺寸不可用或非法', pixelPitchMm: p.value };
    }
    var w = physicalWidthMm / p.value;
    var h = physicalHeightMm / p.value;
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      return { ok: false, reason: '换算结果不是有限数值（P 值过小或物理尺寸过大）', pixelPitchMm: p.value };
    }
    var iw = Math.round(w);
    var ih = Math.round(h);
    return {
      ok: true,
      reason: '',
      source: '理论 P 值估算',
      pixelPitchMm: p.value,
      physicalWidthMm: physicalWidthMm,
      physicalHeightMm: physicalHeightMm,
      theoreticalWidthPx: w,
      theoreticalHeightPx: h,
      integerWidthPx: iw,
      integerHeightPx: ih,
      totalPixelsTheoretical: w * h,
      totalPixelsInteger: iw * ih,
      aspectRatio: physicalWidthMm / physicalHeightMm,
      roundingErrorWidthPx: iw - w,
      roundingErrorHeightPx: ih - h,
      roundingErrorWidthPercent: (iw - w) / w * 100,
      roundingErrorHeightPercent: (ih - h) / h * 100,
      hasRoundingError: iw !== w || ih !== h,
      formatted: {
        theoreticalWidthPx: fmtContinuous(w),
        theoreticalHeightPx: fmtContinuous(h),
        integerResolution: iw + ' × ' + ih + ' px',
        totalPixelsTheoretical: fmtContinuous(w * h),
        totalPixelsInteger: String(iw * ih),
        aspectRatio: fmtTrim(physicalWidthMm / physicalHeightMm, 6) + ' : 1',
        roundingErrorWidthPx: (iw - w >= 0 ? '+' : '') + fmtContinuous(iw - w),
        roundingErrorHeightPx: (ih - h >= 0 ? '+' : '') + fmtContinuous(ih - h),
        pitch: 'P' + fmtPitch(p.value) + '（' + fmtPitch(p.value) + ' mm）',
      },
    };
  }

  /** 模块 A：LED 原生分辨率估算（输入也可以用 snapshot 的字段）。 */
  function estimateNativeResolution(input) {
    var o = input || {};
    var wMm = isFiniteNumber(o.physicalWidthMm) ? o.physicalWidthMm : state.physicalWidthMm;
    var hMm = isFiniteNumber(o.physicalHeightMm) ? o.physicalHeightMm : state.physicalHeightMm;
    var pitch = (o.pixelPitchMm !== undefined) ? o.pixelPitchMm : state.pixelPitchMm;
    return physicalToPixels(wMm, hMm, pitch);
  }

  /** 单个箱体字段校验。 */
  function parseCabinetField(raw, kind) {
    var s = String(raw == null ? '' : raw).trim();
    var integerOnly = (kind === 'pixelsX' || kind === 'pixelsY' || kind === 'cols' || kind === 'rows');
    if (!s || !/^[+]?\d+(?:\.\d+)?$/.test(s)) {
      return { ok: false, value: null, message: '必须输入大于 0 的' + (integerOnly ? '整数' : '数值') };
    }
    var v = Number(s);
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, value: null, message: '必须输入大于 0 的有限数值' };
    }
    if (integerOnly && !Number.isInteger(v)) {
      return { ok: false, value: null, message: '像素数与箱体数量必须为整数' };
    }
    return { ok: true, value: v, message: 'ok' };
  }

  /**
   * 模块 B：箱体 / 模组规格核验。
   * 返回的所有结果都带 source 标记，与理论估算严格分列。
   */
  function computeCabinetSpec(input) {
    var o = Object.assign({}, state.cabinet, input || {});
    var keys = ['widthMm', 'heightMm', 'pixelsX', 'pixelsY', 'cols', 'rows'];
    var errors = [];
    var v = {};
    for (var i = 0; i < keys.length; i++) {
      var r = parseCabinetField(o[keys[i]], keys[i]);
      if (!r.ok) errors.push(keys[i] + '：' + r.message);
      else v[keys[i]] = r.value;
    }
    if (errors.length) {
      return { ok: false, source: '箱体像素矩阵计算', errors: errors, warnings: [], input: o };
    }

    var totalWidthMm = v.widthMm * v.cols;
    var totalHeightMm = v.heightMm * v.rows;
    var totalWidthPx = v.pixelsX * v.cols;
    var totalHeightPx = v.pixelsY * v.rows;
    var physical = getPhysical();
    var warnings = [];

    if (physical.ok) {
      if (Math.abs(totalWidthMm - physical.widthMm) > 0.0001) {
        warnings.push('箱体拼接总宽度与屏幕物理宽度不一致（' +
          fmtTrim(totalWidthMm, 3) + ' mm vs ' + fmtTrim(physical.widthMm, 3) + ' mm）');
      }
      if (Math.abs(totalHeightMm - physical.heightMm) > 0.0001) {
        warnings.push('箱体拼接总高度与屏幕物理高度不一致（' +
          fmtTrim(totalHeightMm, 3) + ' mm vs ' + fmtTrim(physical.heightMm, 3) + ' mm）');
      }
      var expectedCols = physical.widthMm / v.widthMm;
      var expectedRows = physical.heightMm / v.heightMm;
      if (Math.abs(expectedCols - v.cols) > 0.0001) {
        warnings.push('横向箱体数量与物理宽度不匹配（期望约 ' + fmtTrim(expectedCols, 3) + '，当前 ' + v.cols + '）');
      }
      if (Math.abs(expectedRows - v.rows) > 0.0001) {
        warnings.push('纵向箱体数量与物理高度不匹配（期望约 ' + fmtTrim(expectedRows, 3) + '，当前 ' + v.rows + '）');
      }
    }

    return {
      ok: true,
      source: '箱体像素矩阵计算',
      errors: [],
      warnings: warnings,
      input: o,
      values: v,
      totalWidthMm: totalWidthMm,
      totalHeightMm: totalHeightMm,
      totalWidthPx: totalWidthPx,
      totalHeightPx: totalHeightPx,
      actualResolution: totalWidthPx + ' × ' + totalHeightPx + ' px',
      actualAspectRatio: totalWidthPx / totalHeightPx,
      cabinetAspectRatio: v.pixelsX / v.pixelsY,
      formatted: {
        totalWidthMm: fmtTrim(totalWidthMm, 3) + ' mm',
        totalHeightMm: fmtTrim(totalHeightMm, 3) + ' mm',
        totalWidthPx: String(totalWidthPx) + ' px',
        totalHeightPx: String(totalHeightPx) + ' px',
        actualResolution: totalWidthPx + ' × ' + totalHeightPx + ' px',
        actualAspectRatio: fmtTrim(totalWidthPx / totalHeightPx, 6) + ' : 1',
      },
    };
  }

  /** 箱体结果 vs 理论 P 值估算：差异显式列出，两者绝不合并。 */
  function compareCabinetToTheory(cabinetResult, theoryResult) {
    var base = {
      ok: false,
      leftSource: '理论 P 值估算',
      rightSource: '箱体像素矩阵计算',
      reason: '',
    };
    if (!cabinetResult || !cabinetResult.ok) {
      base.reason = '箱体参数非法，无法比对';
      return base;
    }
    if (!theoryResult || !theoryResult.ok) {
      base.reason = theoryResult && theoryResult.reason
        ? theoryResult.reason
        : '理论 P 值估算不可用，无法比对';
      return base;
    }
    var dw = cabinetResult.totalWidthPx - theoryResult.integerWidthPx;
    var dh = cabinetResult.totalHeightPx - theoryResult.integerHeightPx;
    var dmmW = cabinetResult.totalWidthMm - theoryResult.physicalWidthMm;
    var dmmH = cabinetResult.totalHeightMm - theoryResult.physicalHeightMm;
    var dRatio = cabinetResult.actualAspectRatio - theoryResult.aspectRatio;
    var relPx = Math.sqrt(dw * dw + dh * dh) /
      Math.sqrt(theoryResult.integerWidthPx * theoryResult.integerWidthPx +
                theoryResult.integerHeightPx * theoryResult.integerHeightPx) * 100;
    return {
      ok: true,
      leftSource: '理论 P 值估算',
      rightSource: '箱体像素矩阵计算',
      reason: '',
      deltaWidthPx: dw,
      deltaHeightPx: dh,
      deltaWidthMm: dmmW,
      deltaHeightMm: dmmH,
      deltaAspectRatio: dRatio,
      relativePixelDeviationPercent: relPx,
      exactMatch: dw === 0 && dh === 0 && Math.abs(dmmW) < 0.0001 && Math.abs(dmmH) < 0.0001,
      verdict: (dw === 0 && dh === 0 && Math.abs(dmmW) < 0.0001 && Math.abs(dmmH) < 0.0001)
        ? '完全匹配'
        : '存在差异（理论估算 ≠ 箱体确认，需现场复核）',
      formatted: {
        deltaWidthPx: (dw >= 0 ? '+' : '') + String(dw) + ' px',
        deltaHeightPx: (dh >= 0 ? '+' : '') + String(dh) + ' px',
        deltaWidthMm: (dmmW >= 0 ? '+' : '') + fmtTrim(dmmW, 3) + ' mm',
        deltaHeightMm: (dmmH >= 0 ? '+' : '') + fmtTrim(dmmH, 3) + ' mm',
        deltaAspectRatio: (dRatio >= 0 ? '+' : '') + fmtTrim(dRatio, 6),
        relativePixelDeviationPercent: fmtTrim(relPx, 4) + '%',
      },
    };
  }

  function setCabinetField(key, raw) {
    if (!(key in state.cabinet)) return { ok: false, message: '未知箱体字段：' + key };
    var r = parseCabinetField(raw, key);
    if (r.ok) state.cabinet[key] = r.value;
    return r;
  }

  function reset() {
    state.physicalWidthMm = null;
    state.physicalHeightMm = null;
    state.resolutionWidthPx = null;
    state.resolutionHeightPx = null;
    state.pixelPitchMm = null;
    state.activeUnit = 'm';
    state.pxOrigin = null;
    state.convertedWidthPx = null;
    state.convertedHeightPx = null;
    state.notice = '';
    state.cabinet = Object.assign({}, CABINET_DEFAULTS);
  }

  return {
    MODULE_VERSION: MODULE_VERSION,
    MAX_PITCH_DECIMALS: MAX_PITCH_DECIMALS,
    PITCH_PRESETS: PITCH_PRESETS,
    CABINET_DEFAULTS: CABINET_DEFAULTS,
    state: state,
    parsePitch: parsePitch,
    setPitch: setPitch,
    getPitch: getPitch,
    formatPitch: fmtPitch,
    fmtTrim: fmtTrim,
    fmtContinuous: fmtContinuous,
    parsePixelCount: parsePixelCount,
    recordPhysicalMm: recordPhysicalMm,
    recordResolutionPx: recordResolutionPx,
    markPxDirect: markPxDirect,
    markPxConverted: markPxConverted,
    setActiveUnit: setActiveUnit,
    setNotice: setNotice,
    clearNotice: clearNotice,
    getPhysical: getPhysical,
    snapshot: snapshot,
    physicalToPixels: physicalToPixels,
    estimateNativeResolution: estimateNativeResolution,
    parseCabinetField: parseCabinetField,
    setCabinetField: setCabinetField,
    computeCabinetSpec: computeCabinetSpec,
    compareCabinetToTheory: compareCabinetToTheory,
    reset: reset,
  };
});
