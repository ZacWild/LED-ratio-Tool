/* ==========================================================================
   LED-ratio-Tool 桌面版 · 页面探针（共享 harness）
   ============================================================================
   本文件是**观测通道**，不是期望通道：
     · `PAGE_SETUP`   —— 注入 page 上下文，提供 __dtApply（驱动）/ __dtProbeCore（观测）
     · `PAGE_COLLECT` —— 采集 DOM 可观察结果
   两者原先内联在 differential-200.mjs 中；黄金向量套件（golden-vectors.mjs）
   需要同一套探针驱动**自己的 input**，故提取为共享模块，避免两处漂移。

   🔴 独立性：本文件不得 import/require 任何 core.js / app.js / acceptance.mjs。
      `window.LedCore` 是**被测产品自带的运行时副本**，属观测通道，允许使用。
   ========================================================================== */

export const PAGE_SETUP = `
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

export const PAGE_COLLECT = `
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
