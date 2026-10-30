/* ==========================================================================
   LED 大屏比例与视频画布换算工具 · 交互与渲染逻辑
   依赖：src/core.js（须先加载，暴露 globalThis.LedCore）
   铁律：本文件不做任何比例 / 约分 / 误差 / 适配方案的计算，
        全部调用 LedCore 的导出函数；此处只做状态管理、渲染与交互。
        裁切与黑边的方向一律读 core.fitAdvice 返回的 axis 字段，
        绝不自行比较比例来猜方向。
   ========================================================================== */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    globalThis.LedApp = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var Core = (typeof globalThis !== 'undefined' && globalThis.LedCore)
    || (typeof require === 'function' ? require('./core.js') : null);
  if (!Core) {
    throw new Error('未找到 LedCore，请先加载 src/core.js');
  }

  /* ===================== 常量 ===================== */

  var STORAGE_KEY = 'ledRatioTool.settings';
  var WARN_STORAGE_KEY = 'ledRatioTool.warnDismissed';
  var COPY_OK_MS = 1600;
  var COPY_FAIL_MS = 2000;
  var DEFAULT_WIDTH = '14';
  var DEFAULT_HEIGHT = '4';
  var DEFAULT_UNIT = 'm';
  var DEFAULT_CUSTOM_CANVAS_RATIO = '65:36';
  var STAGE_PADDING = 32;
  /**
   * 目标比例与俗称 21:9（严格值 7:3）的邻近阈值。
   * 2.5% 恰好把 3440×1440（43:18，差 2.3810%）圈进来 —— 真实超宽分辨率
   * 最容易被误当成 21:9，必须澄清；同时把 16:9（23.81%）、4:3（42.86%）、
   * 1:1（57.14%）排除在外，避免对明显不同的比例误报。
   */
  var NEAR_21_9_PERCENT = 2.5;

  /** 各单位下步进步长与显示精度（m/cm 最多 3 位、mm 最多 1 位） */
  var UNIT_SPEC = {
    m: { step: 0.1, digits: 3, label: 'm' },
    cm: { step: 1, digits: 3, label: 'cm' },
    mm: { step: 10, digits: 1, label: 'mm' }
  };

  /** 现场需确认的参数层（第 ②③④ 层，本工具不推导） */
  var SITE_FIELDS = [
    { key: 'siteReceive', label: '② LED 控制系统接收分辨率' },
    { key: 'siteComposite', label: '③ 后期软件视频合成分辨率' },
    { key: 'siteDeliver', label: '④ 实际交付的视频文件分辨率' }
  ];

  /* ===================== 通用工具 ===================== */

  /**
   * 千分位规则（§6）：≥ 10000 才加逗号，4 位数保持行业习惯写法。
   */
  function withSeparator(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value >= 10000 ? value.toLocaleString('zh-CN') : String(value);
  }

  /**
   * 偏差百分比：2 位小数、正值带 +、零值显示 0。
   * ★ 必须走 core 的 fmtErrorPercent：core 内部对"非零但 4 位小数会抹成 0"的
   *   极小误差有保底精度，若 UI 自己写 toFixed(2)，
   *   就会出现"误差 0% + 徽章写着存在取整误差"的自相矛盾。
   */
  function formatDeviation(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    if (value === 0) return '0';
    return (value > 0 ? '+' : '') + Core.fmtErrorPercent(value) + '%';
  }

  /**
   * 比例展示：最多 4 位有效小数、末尾去零（2.35 不写成 2.3500）。
   */
  function formatRatioValue(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var text = Core.fmt(value, 4);
    if (text.indexOf('.') >= 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    return text;
  }

  /**
   * 分辨率展示：宽度 × 高度（× 为 U+00D7）。
   */
  function formatResolution(w, h) {
    if (!isFinite(w) || !isFinite(h)) return '—';
    return withSeparator(w) + ' × ' + withSeparator(h);
  }

  /**
   * 纯文本分辨率（复制用，不加千分位，严格用 × 连接）。
   */
  function plainResolution(w, h) {
    if (!isFinite(w) || !isFinite(h)) return '';
    return String(w) + '×' + String(h);
  }

  /**
   * 把 mm 值按当前单位格式化为显示串（换算的是显示值，权威值仍是 mm）。
   */
  function formatMm(mm, unit) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '';
    var spec = UNIT_SPEC[unit] || UNIT_SPEC.m;
    var divisor = unit === 'm' ? 1000 : (unit === 'cm' ? 10 : 1);
    var text = Core.fmt(mm / divisor, spec.digits);
    if (text.indexOf('.') >= 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    return text;
  }

  /**
   * 解析 "a:b" 形式的整数比例，返回 {a, b} 或 null（仅做字符串切分与校验）。
   */
  function parseRatioPair(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return null;
    var parts = raw.split(':');
    if (parts.length !== 2) return null;
    var left = parts[0].trim();
    var right = parts[1].trim();
    if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) return null;
    var a = Number(left);
    var b = Number(right);
    if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
    return { a: a, b: b };
  }

  /**
   * 相对误差：与 core.matchStandards 完全同口径 |a − b| / b × 100%。
   * core 未提供"任意两比例互相比较"的接口，此处仅镜像其公开的误差定义，
   * 用于"常用规格与目标比例"的吻合度展示。
   */
  function relativeDiffPercent(value, base) {
    if (!isFinite(value) || !isFinite(base) || base === 0) return null;
    return Math.abs(value - base) / base * 100;
  }

  /* ===================== 状态 ===================== */

  var state = {
    widthText: DEFAULT_WIDTH,
    heightText: DEFAULT_HEIGHT,
    unit: DEFAULT_UNIT,
    /** 权威物理尺寸（毫米）；单位切换时只改显示值，不动这两个值 */
    widthMm: null,
    heightMm: null,
    ratioSource: 'screen',       // 'screen' | 'standard' | 'custom'
    standardKey: null,
    customRatioText: '',
    canvasMode: 'width',         // 'width' | 'height' | 'preset' | 'custom'
    targetWidth: '1920',
    targetHeight: '1080',
    presetKey: null,
    customCanvasMaxWidth: '',
    customCanvasMaxHeight: '',
    customCanvasRatio: DEFAULT_CUSTOM_CANVAS_RATIO,
    // 默认「严格落在上限内」：需求 §3.5 要求优先找不超限且比例精确的最大解
    customCanvasPrefer: 'bounds',
    /** 演示案例载入后的引导文案（异常输入类案例用于说明"这是故意的"） */
    demoGuidance: '',
    siteReceive: '',
    siteComposite: '',
    siteDeliver: '',
    tolerancePercent: Core.DEFAULT_TOLERANCE_PERCENT,
    showCenter: false,
    showGrid: false,
    /** 舞台画布适配策略：'contain' 完整显示（默认，不切字幕台标）/ 'cover' 铺满 */
    stageMode: 'contain'
  };

  var els = {};
  var resizeFrame = 0;
  /** 舞台当前屏幕矩形与画布外框的实测像素范围（供 JS 兜底缩放使用） */
  var stageScreenBox = { width: 0, height: 0 };
  var stageCanvasBox = { left: 0, top: 0, width: 0, height: 0, unionWidth: 0, unionHeight: 0 };

  /* ===================== 设置持久化 ===================== */

  function loadSettings() {
    desktopLoadSettings();
  }

  function saveSettings() {
    desktopSaveSettings();
  }

  function warnDismissed() {
    try {
      return window.sessionStorage.getItem(WARN_STORAGE_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function setWarnDismissed() {
    try {
      window.sessionStorage.setItem(WARN_STORAGE_KEY, '1');
    } catch (err) {
      // 忽略写入失败
    }
  }

  /* ===================== 计算（全部委托 core） ===================== */

  /**
   * 解析当前宽高输入。
   * 错误文案直接取 core 的 message（core 是唯一事实来源，UI 不另写一套）。
   * 唯一的例外：core 把 0 与负数都归入 nonPositive 且共用同一句 message，
   * 而任务书要求「0 / 负数」给出不同提示。此处按 core 返回的 error 与 value
   * 做最小区分——只用 core 的判定结果，不重新实现校验逻辑。
   */
  function readDimensions() {
    var w = Core.parseDimension(state.widthText, state.unit);
    var h = Core.parseDimension(state.heightText, state.unit);
    return {
      ok: w.ok && h.ok,
      widthMm: w.ok ? w.mm : null,
      heightMm: h.ok ? h.mm : null,
      widthError: w.ok ? '' : describeError(w),
      heightError: h.ok ? '' : describeError(h)
    };
  }

  /**
   * 把 core 的错误结果转成提示文案。
   * core 的 error 分为 empty / nan / nonPositive 三类，三类文案互不相同；
   * nonPositive 内部再按 value 是否为 0 区分「零」与「负数」两种说法。
   */
  function describeError(result) {
    if (result.error === 'nonPositive' && result.value < 0) {
      return '尺寸不能为负数，请输入大于 0 的数值';
    }
    return result.message;
  }

  function findStandard(key) {
    for (var i = 0; i < Core.STANDARDS.length; i++) {
      if (Core.STANDARDS[i].name === key) return Core.STANDARDS[i];
    }
    return null;
  }

  function findPreset(key) {
    for (var i = 0; i < Core.PRESETS.length; i++) {
      if (Core.PRESETS[i].name === key) return Core.PRESETS[i];
    }
    return null;
  }

  /**
   * 当前使用的目标比例。
   * ratio 一律来自 core 计算或 core 的标准库原值，UI 不自行做比例运算。
   */
  function resolveTargetRatio() {
    if (state.ratioSource === 'standard' && state.standardKey) {
      var std = findStandard(state.standardKey);
      if (std) {
        return { ratio: std.exactValue, source: 'standard', label: std.name, standard: std };
      }
    }
    if (state.ratioSource === 'custom') {
      var pair = parseRatioPair(state.customRatioText);
      if (pair) {
        // 交给 core 计算比例，UI 不自行约分或求小数
        var computed = Core.computeRatio(pair.a, pair.b);
        return { ratio: computed.ratio, source: 'custom', label: pair.a + ':' + pair.b };
      }
      return { ratio: null, source: 'custom', label: '' };
    }
    var dims = readDimensions();
    if (!dims.ok) return { ratio: null, source: 'screen', label: '' };
    var r = Core.computeRatio(dims.widthMm, dims.heightMm);
    return { ratio: r.ratio, source: 'screen', label: '' };
  }

  /**
   * 产出全部候选画布结果。
   * 每个模式的换算都调用 core，UI 只负责挑选与展示。
   */
  function computeCandidates(targetRatio) {
    var out = [];
    if (targetRatio == null) return out;

    // 模式 A：按目标宽度
    var wNum = Number(state.targetWidth);
    if (isFinite(wNum) && wNum > 0) {
      out.push({ mode: 'width', label: '按目标宽度', result: Core.canvasFromWidth(wNum, targetRatio) });
    }

    // 模式 B：按目标高度
    var hNum = Number(state.targetHeight);
    if (isFinite(hNum) && hNum > 0) {
      out.push({ mode: 'height', label: '按目标高度', result: Core.canvasFromHeight(hNum, targetRatio) });
    }

    // 模式 C：常用制作规格（预设自身即目标画布）
    if (state.presetKey) {
      var preset = findPreset(state.presetKey);
      if (preset) {
        var diff = relativeDiffPercent(preset.realRatio, targetRatio);
        var match = Core.matchStandards(preset.realRatio, state.tolerancePercent);
        out.push({
          mode: 'preset',
          label: '常用规格',
          preset: preset,
          result: {
            ok: true,
            outputWidth: preset.width,
            outputHeight: preset.height,
            outputRatio: preset.realRatio,
            ratioErrorPercent: diff,
            pixelErrorPercent: 0,
            strictMatch: diff !== null && diff <= Core.EXACT_REL_TOL * 100,
            fitAdvice: Core.fitAdvice(preset.width, preset.height, targetRatio),
            isStandard: match.isStandard
          }
        });
      }
    }

    // 模式 D：自定义整数倍画布
    var pair = parseRatioPair(state.customCanvasRatio);
    var maxW = Number(state.customCanvasMaxWidth);
    var maxH = Number(state.customCanvasMaxHeight);
    if (pair && isFinite(maxW) && maxW > 0 && isFinite(maxH) && maxH > 0) {
      var raw = Core.bestIntegerCanvas(pair, {
        maxWidth: maxW,
        maxHeight: maxH,
        prefer: state.customCanvasPrefer
      });
      // 需求 §3.5：越界解不得占据当前位 —— 当前展示用「不超限且比例精确」的推荐解，
      // 超限的精确解作为并列解一并列出（core 的 exactSolution / withinBounds 恒定返回）。
      var display = raw;
      if (raw.ok && raw.recommended && raw.recommended !== raw) {
        display = Object.assign({}, raw, {
          width: raw.recommended.width,
          height: raw.recommended.height,
          k: raw.recommended.k,
          outputWidth: raw.recommended.outputWidth,
          outputHeight: raw.recommended.outputHeight,
          outputRatio: raw.recommended.outputRatio,
          outputRatioText: raw.recommended.outputRatioText,
          strictMatch: raw.recommended.strictMatch,
          pixelErrorPercent: raw.recommended.pixelErrorPercent,
          pixelErrorPercentText: raw.recommended.pixelErrorPercentText,
          fitAdvice: raw.recommended.fitAdvice,
          exceedsMaxWidth: false,
          overflowPx: 0
        });
      }
      out.push({ mode: 'custom', label: '整数倍画布', result: display, raw: raw });
    }

    return out;
  }

  /**
   * 当前模式对应的候选（用于顶部核心分辨率与舞台画布轮廓）。
   */
  function primaryCandidate(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].mode === state.canvasMode) return candidates[i];
    }
    return candidates.length ? candidates[0] : null;
  }

  /* ===================== 渲染：输入区 ===================== */

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function replayFade(node) {
    if (!node) return;
    node.classList.remove('is-updated');
    void node.offsetWidth;
    node.classList.add('is-updated');
  }

  function renderInputState(dims) {
    if (document.activeElement !== els.widthInput) els.widthInput.value = state.widthText;
    if (document.activeElement !== els.heightInput) els.heightInput.value = state.heightText;

    // 演示案例引导说明（异常输入类案例说明"这是故意留空的"）
    if (els.demoGuidance) {
      if (state.demoGuidance) {
        els.demoGuidance.textContent = state.demoGuidance;
        els.demoGuidance.style.display = '';
      } else {
        els.demoGuidance.textContent = '';
        els.demoGuidance.style.display = 'none';
      }
    }

    els.widthWrap.classList.toggle('is-error', !!dims.widthError);
    els.heightWrap.classList.toggle('is-error', !!dims.heightError);
    setText(els.widthError, dims.widthError);
    setText(els.heightError, dims.heightError);

    var unitLabel = (UNIT_SPEC[state.unit] || UNIT_SPEC.m).label;
    setText(els.widthUnit, unitLabel);
    setText(els.heightUnit, unitLabel);

    var segments = document.querySelectorAll('.unit-segment');
    for (var i = 0; i < segments.length; i++) {
      segments[i].setAttribute('aria-checked', segments[i].dataset.unit === state.unit ? 'true' : 'false');
    }
  }

  /* ===================== 渲染：结果面板 ===================== */

  function renderResult(dims, target, candidates) {
    var screenRatio = dims.ok ? Core.computeRatio(dims.widthMm, dims.heightMm) : null;
    var primary = primaryCandidate(candidates);

    // —— 核心比例值 ——
    if (screenRatio) {
      els.ratioValue.classList.remove('is-empty');
      els.ratioValue.textContent = '';
      els.ratioValue.appendChild(document.createTextNode(screenRatio.decimal));
      var sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = ':';
      els.ratioValue.appendChild(sep);
      els.ratioValue.appendChild(document.createTextNode('1'));
    } else {
      els.ratioValue.classList.add('is-empty');
      setText(els.ratioValue, '— : —');
    }

    // 精确 / 近似严格分开：近似值另起一行，绝不与精确值混在同一字段
    var suffixText = '';
    var suffixApprox = false;
    if (screenRatio && screenRatio.exact) {
      suffixText = '（整数比 ' + screenRatio.reducedText + '）';
    } else if (screenRatio && screenRatio.nearest) {
      suffixText = '（约化值）';
      suffixApprox = true;
    }
    setText(els.ratioSuffix, suffixText);
    els.ratioSuffix.classList.toggle('is-approx', suffixApprox);

    if (screenRatio && screenRatio.nearest && !screenRatio.exact) {
      els.approxLine.style.display = '';
      // 同样走 core 的保底精度：近似值的相对误差不能被显示成 0.0000%
      setText(els.approxLine, '约化值（近似） ' + screenRatio.nearest.text
        + ' · 相对误差 ' + Core.fmtErrorPercent(screenRatio.nearest.relErrorPercent) + '%');
    } else {
      els.approxLine.style.display = 'none';
    }

    // —— 核心分辨率 ——
    var res = primary ? primary.result : null;
    if (res && res.ok && res.outputWidth) {
      els.resValue.textContent = '';
      els.resValue.appendChild(document.createTextNode(withSeparator(res.outputWidth)));
      var rsep = document.createElement('span');
      rsep.className = 'sep';
      rsep.textContent = '×';
      els.resValue.appendChild(rsep);
      els.resValue.appendChild(document.createTextNode(withSeparator(res.outputHeight)));
    } else {
      setText(els.resValue, '—');
    }

    renderBadge(dims, screenRatio, target, primary);
    setText(els.coreNote, buildCoreNote(dims, target, primary));
    renderTable(dims, screenRatio, target, primary);
    renderMatchTable(target);
    renderCandidates(target, candidates);
    setText(els.liveResults, buildLiveSummary(dims, screenRatio, primary));
    renderWarnBar(screenRatio, target, primary);
  }

  function renderBadge(dims, screenRatio, target, primary) {
    var badge = els.resultBadge;
    badge.className = 'badge';
    badge.textContent = '';

    var icon = document.createElement('span');
    icon.className = 'icon';
    var label = document.createElement('span');

    if (!dims.ok) {
      badge.classList.add('badge--error');
      icon.textContent = '!';
      label.textContent = '输入有误';
    } else if (target.ratio == null) {
      badge.classList.add('badge--muted');
      icon.textContent = '!';
      label.textContent = '需现场确认';
    } else {
      // 判定优先级：目标比例不是标准画幅 > 画布存在取整误差 > 严格匹配。
      // 「非标准比例」必须优先于「严格匹配」——否则 14m×4m 在宽度恰好整除时
      // 会被标成严格匹配，掩盖了"它不是 21:9"这一关键事实。
      var match = Core.matchStandards(target.ratio, state.tolerancePercent);
      var strict = primary && primary.result && primary.result.ok && primary.result.strictMatch === true;
      if (!match.isStandard) {
        badge.classList.add('badge--warning');
        icon.textContent = '▲';
        label.textContent = '非标准比例';
      } else if (!strict) {
        badge.classList.add('badge--info');
        icon.textContent = 'Δ';
        label.textContent = '取整误差';
      } else {
        badge.classList.add('badge--success');
        icon.textContent = '✓';
        label.textContent = '严格匹配';
      }
    }

    badge.appendChild(icon);
    badge.appendChild(label);
  }

  function buildCoreNote(dims, target, primary) {
    if (!dims.ok) return '请先修正左侧输入，右侧结果将自动更新。';
    var unitLabel = (UNIT_SPEC[state.unit] || UNIT_SPEC.m).label;
    var parts = [];
    parts.push('屏幕实际尺寸 ' + formatMm(dims.widthMm, state.unit) + ' ' + unitLabel
      + ' × ' + formatMm(dims.heightMm, state.unit) + ' ' + unitLabel);

    if (target.source === 'screen') {
      parts.push('目标比例取自屏幕实际比例');
    } else if (target.source === 'standard') {
      parts.push('目标比例取自标准画幅 ' + target.label);
    } else {
      parts.push('目标比例取自自定义 ' + target.label);
    }

    var res = primary ? primary.result : null;
    if (res && res.ok && res.outputWidth) {
      parts.push('画布 ' + formatResolution(res.outputWidth, res.outputHeight));
    }
    return parts.join(' · ');
  }

  /**
   * 误差表格（§6）：4 列 项目名 / 屏幕值 / 画布值 / 偏差。
   */
  function renderTable(dims, screenRatio, target, primary) {
    var tbody = els.tableBody;
    tbody.textContent = '';
    if (!dims.ok) {
      els.tableWrap.style.display = 'none';
      return;
    }
    els.tableWrap.style.display = '';

    var res = primary ? primary.result : null;
    var rows = [];

    rows.push({
      name: '实际物理尺寸',
      screen: formatMm(dims.widthMm, state.unit) + ' ' + (UNIT_SPEC[state.unit] || UNIT_SPEC.m).label
        + ' × ' + formatMm(dims.heightMm, state.unit) + ' ' + (UNIT_SPEC[state.unit] || UNIT_SPEC.m).label,
      canvas: '—'
    });

    rows.push({
      name: '实际比例',
      screen: formatRatioValue(screenRatio.ratio) + ' : 1',
      canvas: target.ratio != null ? formatRatioValue(target.ratio) + ' : 1' : '—'
    });

    rows.push({
      name: '最简整数比',
      screen: screenRatio.exact ? screenRatio.reducedText
        : (screenRatio.nearest ? screenRatio.nearest.text + '（近似）' : '无有限整数比'),
      canvas: target.ratio != null ? ratioTextOf(target.ratio) : '—'
    });

    rows.push({
      name: '目标画布分辨率',
      screen: '—',
      canvas: res && res.ok && res.outputWidth ? formatResolution(res.outputWidth, res.outputHeight) : '—'
    });

    // 宽高比相对误差（比例误差）
    if (res && res.ok && typeof res.ratioErrorPercent === 'number') {
      rows.push({ name: '宽高比相对误差', screen: '—', canvas: '—', deviation: res.ratioErrorPercent });
    }

    // 像素尺寸误差（与比例误差分行分列，不得混为一谈）
    if (res && res.ok && typeof res.pixelErrorPercent === 'number') {
      rows.push({ name: '像素尺寸误差', screen: '—', canvas: '—', deviation: res.pixelErrorPercent });
    }

    if (res && res.ok && typeof res.strictMatch === 'boolean') {
      rows.push({
        name: '匹配判定',
        screen: '—',
        canvas: res.strictMatch ? '严格匹配' : '存在取整误差',
        text: true,
        okState: res.strictMatch
      });
    }

    if (res && res.ok && res.fitAdvice && res.fitAdvice.ok) {
      rows.push({ name: '等比适配方案', screen: '—', canvas: describeFit(res.fitAdvice), text: true });
    }

    for (var i = 0; i < rows.length; i++) {
      tbody.appendChild(buildRow(rows[i]));
    }
  }

  function buildRow(row) {
    var tr = document.createElement('tr');

    var tdName = document.createElement('td');
    tdName.textContent = row.name;
    tr.appendChild(tdName);

    var tdScreen = document.createElement('td');
    tdScreen.textContent = row.screen;
    tr.appendChild(tdScreen);

    var tdCanvas = document.createElement('td');
    if (row.text) {
      tdCanvas.className = 'is-text';
      tdCanvas.textContent = row.canvas;
      if (row.okState === true) tdCanvas.style.color = 'var(--success)';
    } else {
      tdCanvas.textContent = row.canvas;
    }
    tr.appendChild(tdCanvas);

    var tdDev = document.createElement('td');
    if (row.deviation === undefined || row.deviation === null) {
      tdDev.textContent = '—';
    } else {
      tdDev.textContent = formatDeviation(row.deviation);
      if (row.deviation === 0) tdDev.className = 'is-zero';
    }
    tr.appendChild(tdDev);

    return tr;
  }

  /**
   * 目标比例对应的整数比文本。
   * 用 core 的 bestRational 还原最简整数对（如 21:9 → 7:3），
   * UI 不自行约分，也不自行判断精确性。
   */
  function ratioTextOf(ratio) {
    var ap = Core.bestRational(ratio, Core.MAX_DENOMINATOR);
    if (!ap) return '—';
    if (ap.relError <= Core.EXACT_REL_TOL) return ap.a + ':' + ap.b;
    return ap.a + ':' + ap.b + '（近似）';
  }

  /**
   * 描述 fitAdvice 结果；轴向一律取 core 返回的 axis 字段。
   */
  function describeFit(fit) {
    if (!fit || !fit.ok) return '—';
    if (fit.mode === 'exact') return '比例一致，无需裁切或补边';
    var axisWord = function (axis) {
      if (axis === 'x') return '左右';
      if (axis === 'y') return '上下';
      return '';
    };
    if (fit.mode === 'crop') {
      return '需裁切（' + axisWord(fit.cropAxis) + '各 ' + Core.fmt(fit.cropPx, 2) + 'px）';
    }
    return '需留黑边（' + axisWord(fit.pillarboxAxis) + '各 ' + Core.fmt(fit.pillarboxPx, 2) + 'px）';
  }

  /* ===================== 渲染：候选明细（模式 E） ===================== */

  function renderCandidates(target, candidates) {
    var box = els.candidateList;
    box.textContent = '';
    if (!candidates.length) {
      var empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = '请设置目标宽度、高度，或选择常用规格 / 自定义整数比。';
      box.appendChild(empty);
      return;
    }
    for (var i = 0; i < candidates.length; i++) {
      box.appendChild(buildCandidateItem(candidates[i], target));
    }
  }

  function buildCandidateItem(item, target) {
    var r = item.result;
    var wrap = document.createElement('div');
    wrap.className = 'mode-item';

    var head = document.createElement('div');
    head.className = 'mode-item__head';

    var title = document.createElement('span');
    title.className = 'mode-item__title';
    title.textContent = item.label + (item.mode === state.canvasMode ? '（当前）' : '');
    head.appendChild(title);

    var res = document.createElement('span');
    res.className = 'mode-item__res';
    if (r && r.ok && r.outputWidth) {
      res.textContent = formatResolution(r.outputWidth, r.outputHeight);
    } else if (r && r.ok && r.width) {
      res.textContent = formatResolution(r.width, r.height);
    } else {
      res.textContent = '—';
    }
    head.appendChild(res);
    wrap.appendChild(head);

    var meta = document.createElement('div');
    meta.className = 'mode-item__meta';

    // 理论值（未取整）
    if (r && r.ok && typeof r.theoreticalHeight === 'number') {
      meta.appendChild(metaSpan('理论高 ' + Core.fmt(r.theoreticalHeight, 4) + 'px'));
    } else if (r && r.ok && typeof r.theoreticalWidth === 'number') {
      meta.appendChild(metaSpan('理论宽 ' + Core.fmt(r.theoreticalWidth, 4) + 'px'));
    }

    // 实际像素比例
    if (r && r.ok && typeof r.outputRatio === 'number' && isFinite(r.outputRatio)) {
      meta.appendChild(metaSpan('实际像素比例 ' + formatRatioValue(r.outputRatio) + ' : 1'));
    }

    // 目标屏幕比例
    if (target.ratio != null) {
      meta.appendChild(metaSpan('目标屏幕比例 ' + formatRatioValue(target.ratio) + ' : 1'));
    }

    // 与目标比例的宽高比误差
    if (r && r.ok && typeof r.ratioErrorPercent === 'number' && isFinite(r.ratioErrorPercent)) {
      var ratioErr = metaSpan('与目标比例的宽高比误差 ' + formatDeviation(r.ratioErrorPercent));
      if (r.ratioErrorPercent !== 0) ratioErr.classList.add('is-warn');
      meta.appendChild(ratioErr);
    }

    // 像素尺寸误差（独立字段）
    if (r && r.ok && typeof r.pixelErrorPercent === 'number' && isFinite(r.pixelErrorPercent)) {
      var pixelErr = metaSpan('像素尺寸误差 ' + formatDeviation(r.pixelErrorPercent));
      if (r.pixelErrorPercent !== 0) pixelErr.classList.add('is-warn');
      meta.appendChild(pixelErr);
    }

    // 取整代价：四舍五入结果与"按比例误差最小"结果同时列出
    if (r && r.ok && typeof r.roundedHeight === 'number' && typeof r.bestRoundedHeight === 'number'
      && r.roundedHeight !== r.bestRoundedHeight) {
      meta.appendChild(metaSpan('四舍五入取整 ' + r.roundedHeight + 'px · 按比例误差最小取整 ' + r.bestRoundedHeight + 'px'));
    } else if (r && r.ok && typeof r.roundedWidth === 'number' && typeof r.bestRoundedWidth === 'number'
      && r.roundedWidth !== r.bestRoundedWidth) {
      meta.appendChild(metaSpan('四舍五入取整 ' + r.roundedWidth + 'px · 按比例误差最小取整 ' + r.bestRoundedWidth + 'px'));
    }

    // 是否严格匹配
    if (r && r.ok && typeof r.strictMatch === 'boolean') {
      var strict = metaSpan(r.strictMatch ? '✓ 严格匹配' : 'Δ 存在取整误差');
      strict.classList.add(r.strictMatch ? 'is-ok' : 'is-warn');
      meta.appendChild(strict);
    }

    // 等比适配方案（绝不建议拉伸）
    if (r && r.ok && r.fitAdvice && r.fitAdvice.ok) {
      meta.appendChild(metaSpan('等比适配：' + describeFit(r.fitAdvice) + '（不建议拉伸）'));
    }

    // 模式 D 的双解并列：两个解恒定同时呈现，越界解不得消失（需求 §3.5）
    if (item.mode === 'custom' && item.raw && item.raw.ok) {
      var raw = item.raw;
      var bounds = raw.withinBounds;
      var exactSol = raw.exactSolution;
      if (bounds) {
        meta.appendChild(metaSpan('严格落在上限内 ' + formatResolution(bounds.width, bounds.height)
          + '（k=' + bounds.k + '）'));
      } else {
        meta.appendChild(metaSpan('没有任何整数倍能同时落在给定上限内'));
      }
      if (exactSol) {
        var exactText = '精确解 ' + formatResolution(exactSol.width, exactSol.height) + '（k=' + exactSol.k + '）';
        if (exactSol.exceedsMaxWidth) {
          exactText += '，超出上限 ' + Core.fmt(exactSol.overflowPx, 0) + 'px';
        }
        meta.appendChild(metaSpan(exactText));
      }
      if (raw.overflowFallback) {
        meta.appendChild(metaSpan('所选档位的解已超宽，当前采用不超限的解'));
      }
    }
    if (item.mode === 'custom' && r && !r.ok) {
      meta.appendChild(metaSpan(r.message || '无法生成整数倍画布'));
    }

    wrap.appendChild(meta);
    return wrap;
  }

  /**
   * 常见比例匹配表（任务书要求）：名称 / 精确比例数值 / 与实际比例的差异百分比 /
   * 是否属于常见标准画幅，并标出最接近项。
   * 数据全部来自 core.matchStandards，UI 不自行计算偏差。
   */
  function renderMatchTable(target) {
    var tbody = els.matchBody;
    tbody.textContent = '';
    if (target.ratio == null) return;

    var match = Core.matchStandards(target.ratio, state.tolerancePercent);

    for (var i = 0; i < match.matches.length; i++) {
      var m = match.matches[i];
      var tr = document.createElement('tr');
      if (m.closest) tr.className = 'is-closest';

      var tdName = document.createElement('td');
      tdName.textContent = m.name;
      if (m.closest) {
        var flag = document.createElement('span');
        flag.className = 'tag tag--closest';
        flag.textContent = '最接近';
        tdName.appendChild(flag);
      }
      if (m.isTrueStandard === false) {
        var colloquial = document.createElement('span');
        colloquial.className = 'tag tag--colloquial';
        colloquial.textContent = '俗称';
        tdName.appendChild(colloquial);
      }
      tr.appendChild(tdName);

      // 精确比例数值：俗称条目同时给出严格数学值
      var tdValue = document.createElement('td');
      if (m.isTrueStandard === false) {
        var ap = Core.bestRational(m.value, Core.MAX_DENOMINATOR);
        tdValue.textContent = ap ? (ap.a + ':' + ap.b) : formatRatioValue(m.value);
        tdValue.title = '精确值 ' + formatRatioValue(m.value) + ' : 1';
      } else {
        tdValue.textContent = formatRatioValue(m.value) + ' : 1';
      }
      tr.appendChild(tdValue);

      var tdDiff = document.createElement('td');
      tdDiff.textContent = formatDeviation(m.diffPercent);
      if (m.diffPercent === 0) tdDiff.className = 'is-zero';
      tr.appendChild(tdDiff);

      var tdStd = document.createElement('td');
      tdStd.className = 'is-text';
      if (m.withinTolerance) {
        tdStd.textContent = m.exactMatch ? '精确命中' : '容差内';
        tdStd.style.color = 'var(--success)';
      } else {
        tdStd.textContent = '非标准';
      }
      tr.appendChild(tdStd);

      tbody.appendChild(tr);
    }
  }

  function metaSpan(text) {
    var span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  function buildLiveSummary(dims, screenRatio, primary) {
    if (!dims.ok) return '输入有误，请修正屏幕尺寸。';
    var text = '实际比例 ' + screenRatio.decimal + ' 比 1';
    var res = primary ? primary.result : null;
    if (res && res.ok && res.strictMatch === true) {
      text += '，严格匹配';
    } else if (res && res.ok) {
      text += '，存在取整误差';
    }
    if (res && res.ok && res.outputWidth) {
      text += '，画布 ' + withSeparator(res.outputWidth) + ' 乘 ' + withSeparator(res.outputHeight);
    }
    return text;
  }

  /**
   * 警示条：需用户处理的提示，可关闭且会话内记忆。
   * 两种触发情形：
   * 1) 目标比例不属于任何常见标准画幅 → 明确写出"非标准比例"，
   *    并点明它与俗称 21:9 的差距（超宽异形比例最常被误当成 21:9，必须写出来）。
   * 2) 目标比例是标准画幅，但与俗称 21:9 足够接近（真实超宽分辨率最容易被
   *    误当成 21:9）→ 澄清它不是 21:9。
   *    判据用相对 21:9 严格值 7:3 的偏差：≤ 2.5% 视为"就是 21:9 那一类"才提示；
   *    > 2.5% 说明离 21:9 很远（16:9 差 23.81%、4:3 差 42.86%、1:1 差 57.14%），
   *    此时提 21:9 纯属误导，只保留通用提示。
   */
  function renderWarnBar(screenRatio, target, primary) {
    if (!screenRatio || !target.ratio || warnDismissed()) {
      els.warnBar.style.display = 'none';
      return;
    }
    var match = Core.matchStandards(target.ratio, state.tolerancePercent);
    var std21 = match.matches.filter(function (m) { return m.name === '21:9'; })[0];
    var diffTo21 = std21 ? (Math.abs(target.ratio - std21.value) / std21.value * 100) : Infinity;

    var msg = '';
    if (!match.isStandard) {
      // 非标准画幅：必须写明它与俗称 21:9 的差距，避免被误当成 21:9
      msg = '目标比例不属于常见标准画幅（容差 ' + Core.fmt(state.tolerancePercent, 2) + '%）。';
      if (std21) {
        msg += '目标比例与俗称 21:9（严格值 7:3）相差 ' + Core.fmtErrorPercent(diffTo21) + '%，不能按 21:9 处理。';
      }
    } else if (std21 && diffTo21 <= NEAR_21_9_PERCENT) {
      // 是标准画幅，但与 21:9 足够接近 → 澄清它不是俗称 21:9
      msg = '目标比例最接近「' + (match.closest ? match.closest.name : '') + '」，'
        + '目标比例与俗称 21:9（严格值 7:3）相差 ' + Core.fmtErrorPercent(diffTo21) + '%，不能按 21:9 解读。';
    } else {
      els.warnBar.style.display = 'none';
      return;
    }
    setText(els.warnText, msg);
    els.warnBar.style.display = '';
  }

  /* ===================== 列表渲染 ===================== */

  function renderStandardList() {
    var box = els.standardList;
    box.textContent = '';
    for (var i = 0; i < Core.STANDARDS.length; i++) {
      // 用 IIFE 固定循环变量：var 是函数级作用域，
      // 直接在循环里监听会全部捕获最后一个条目（点击 21:9 却选中 1920×1080）。
      (function (s) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list__item';
        btn.dataset.key = s.name;

        var name = document.createElement('span');
        name.className = 'list__name';
        // 俗称条目必须显式标注，避免把 21:9 当成精确比例使用
        name.textContent = s.isTrueStandard === false ? s.name + '（俗称）' : s.name;
        btn.appendChild(name);

        var meta = document.createElement('span');
        meta.className = 'list__meta';
        // 俗称条目必须同时展示严格数学值（如 21:9 → 7:3），由 core 的 bestRational 还原
        if (s.isTrueStandard === false) {
          var ap = Core.bestRational(s.exactValue, Core.MAX_DENOMINATOR);
          meta.textContent = ap ? (ap.a + ':' + ap.b) : formatRatioValue(s.exactValue);
          meta.title = '严格数学比例 ' + formatRatioValue(s.exactValue) + ' : 1';
        } else {
          meta.textContent = formatRatioValue(s.exactValue) + ' : 1';
        }
        btn.appendChild(meta);

        btn.addEventListener('click', function () {
          state.standardKey = s.name;
          state.ratioSource = 'standard';
          syncRatioSourceButtons();
          update();
        });
        box.appendChild(btn);
      })(Core.STANDARDS[i]);
    }
  }

  /**
   * 当前屏幕实际比例（物理宽 ÷ 高）；输入无效时为 null。
   */
  function currentScreenRatio() {
    var dims = readDimensions();
    return dims.ok ? Core.computeRatio(dims.widthMm, dims.heightMm).ratio : null;
  }

  /**
   * 预设列表项 meta：真实比例（core PRESETS 的 realRatioText，4 位保底精度）
   * + 与屏幕实际比例的偏差百分比。偏差一律走 formatDeviation（内部即 core 的
   * fmtErrorPercent）—— 与结果区/匹配表同口径：非零误差不得被取整显示成 0.00%
   * （§3.4，P1-3 同款规则），精确为 0 时显示 0。
   * core 未提供"任意两比例互相比较"的接口，偏差值镜像 core 公开的误差定义
   * （|a − b| ÷ b × 100%，见 relativeDiffPercent），格式化仍走 core。
   */
  function presetMetaText(p, screenRatio) {
    var diff = screenRatio != null ? relativeDiffPercent(p.realRatio, screenRatio) : null;
    var diffText = diff == null ? '—' : formatDeviation(diff);
    return p.realRatioText + ' · 偏差 ' + diffText;
  }

  /**
   * 屏幕尺寸变化时刷新预设列表 meta（列表只在 init 构建一次，
   * 这里只更新文字不重建 DOM，避免每次输入重建打断列表滚动位置）。
   */
  function renderPresetMeta(dims) {
    var screenRatio = dims.ok ? Core.computeRatio(dims.widthMm, dims.heightMm).ratio : null;
    var metas = els.presetList.querySelectorAll('.list__meta');
    for (var i = 0; i < metas.length && i < Core.PRESETS.length; i++) {
      var p = Core.PRESETS[i];
      setText(metas[i], presetMetaText(p, screenRatio));
      metas[i].title = '真实比例 ' + p.realRatioText + ' : 1，与屏幕实际比例 '
        + (screenRatio != null ? formatRatioValue(screenRatio) : '—') + ' 的偏差';
    }
  }

  function renderPresetList() {
    var box = els.presetList;
    box.textContent = '';
    for (var i = 0; i < Core.PRESETS.length; i++) {
      // 同样用 IIFE 固定循环变量，避免闭包捕获到最后一个预设
      (function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list__item';
        btn.dataset.key = p.name;

        var name = document.createElement('span');
        name.className = 'list__name';
        name.textContent = p.name;
        btn.appendChild(name);

        var meta = document.createElement('span');
        meta.className = 'list__meta';
        // §3.4：列表层即展示真实比例与「与屏幕实际比例的偏差」，不必逐个点选才可见
        meta.textContent = presetMetaText(p, currentScreenRatio());
        btn.appendChild(meta);

        btn.addEventListener('click', function () {
          state.presetKey = p.name;
          state.canvasMode = 'preset';
          syncCanvasModeButtons();
          update();
        });
        box.appendChild(btn);
      })(Core.PRESETS[i]);
    }
  }

  function renderDemoList() {
    var box = els.demoList;
    box.textContent = '';
    for (var i = 0; i < Core.DEMO_CASES.length; i++) {
      (function (demo) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list__item';
        btn.title = demo.description;

        var name = document.createElement('span');
        name.className = 'list__name';
        name.textContent = demo.name;
        btn.appendChild(name);

        var meta = document.createElement('span');
        meta.className = 'list__meta';
        meta.textContent = '载入';
        btn.appendChild(meta);

        btn.addEventListener('click', function () { loadDemoCase(demo); });
        box.appendChild(btn);
      })(Core.DEMO_CASES[i]);
    }
  }

  /**
   * 载入演示案例：把案例的物理尺寸换算成当前单位后回填。
   */
  function loadDemoCase(demo) {
    var inputs = demo.inputs || {};
    var unit = inputs.unit;
    if (unit !== 'm' && unit !== 'cm' && unit !== 'mm') unit = state.unit;

    state.unit = unit;
    if (inputs.width !== undefined && inputs.height !== undefined) {
      var w = Core.parseDimension(String(inputs.width), unit);
      var h = Core.parseDimension(String(inputs.height), unit);
      if (w.ok && h.ok) {
        state.widthMm = w.mm;
        state.heightMm = h.mm;
        state.widthText = formatMm(w.mm, unit);
        state.heightText = formatMm(h.mm, unit);
      }
    } else {
      // 异常输入案例：留空以呈现空状态与错误提示，并给出引导说明
      state.widthText = '';
      state.heightText = '';
      state.widthMm = null;
      state.heightMm = null;
    }

    // 案例自带引导说明时展示，避免用户把"故意留空"误认为工具坏了
    state.demoGuidance = (demo.result && demo.result.guidance) ? demo.result.guidance : '';

    state.ratioSource = 'screen';
    state.standardKey = null;
    state.canvasMode = 'width';

    // 案例自带画布尺寸时一并载入，便于直接看到换算结果
    var result = demo.result || {};
    if (result.canvasWidth) state.targetWidth = String(result.canvasWidth);
    if (result.canvasHeight) state.targetHeight = String(result.canvasHeight);

    syncRatioSourceButtons();
    syncCanvasModeButtons();
    update();
  }

  function syncSelectionStates() {
    var stdItems = els.standardList.querySelectorAll('.list__item');
    for (var i = 0; i < stdItems.length; i++) {
      var isSel = stdItems[i].dataset.key === state.standardKey && state.ratioSource === 'standard';
      stdItems[i].classList.toggle('is-selected', isSel);
      stdItems[i].setAttribute('aria-pressed', isSel ? 'true' : 'false');
    }

    var presetItems = els.presetList.querySelectorAll('.list__item');
    for (var j = 0; j < presetItems.length; j++) {
      var isPre = presetItems[j].dataset.key === state.presetKey && state.canvasMode === 'preset';
      presetItems[j].classList.toggle('is-selected', isPre);
      presetItems[j].setAttribute('aria-pressed', isPre ? 'true' : 'false');
    }
  }

  /* ===================== 可视化 ===================== */

  /**
   * 绘制屏幕矩形与目标画布轮廓。
   *
   * 轴向铁律：裁切 / 黑边的方向与数值一律取 core.fitAdvice 返回的
   * coverCropAxis / containBarAxis / cropAxis / pillarboxAxis，
   * UI 绝不自行比较比例来猜方向。
   */
  function renderStage(dims, target, candidates) {
    if (!dims.ok) {
      setText(els.dimRatio, '— : —');
      setText(els.dimWidth, '—');
      setText(els.dimHeight, '—');
      els.canvasRect.style.display = 'none';
      clearHatch();
      return;
    }

    // 屏幕矩形按真实物理比例绘制（CSS aspect-ratio 为主，JS 兜底）
    var screenRatio = Core.computeRatio(dims.widthMm, dims.heightMm).ratio;
    els.screenRect.style.setProperty('--screen-ratio', dims.widthMm + ' / ' + dims.heightMm);

    var unitLabel = (UNIT_SPEC[state.unit] || UNIT_SPEC.m).label;
    setText(els.dimRatio, formatRatioValue(screenRatio) + ' : 1');
    setText(els.dimWidth, formatMm(dims.widthMm, state.unit) + ' ' + unitLabel);
    setText(els.dimHeight, formatMm(dims.heightMm, state.unit) + ' ' + unitLabel);

    // 目标画布比例：有换算结果时用实际输出比例，否则用目标比例
    var primary = primaryCandidate(candidates);
    var res = primary ? primary.result : null;
    var canvasRatio = null;
    if (res && res.ok && res.outputWidth && res.outputHeight) {
      canvasRatio = res.outputRatio;
    } else if (target.ratio != null) {
      canvasRatio = target.ratio;
    }

    if (canvasRatio == null) {
      els.canvasRect.style.display = 'none';
      clearHatch();
      return;
    }

    els.canvasRect.style.display = '';
    setText(els.canvasLabel, formatRatioValue(canvasRatio) + ' 画布');

    // 屏幕矩形实测尺寸。
    // 必须用边框盒（offsetWidth/offsetHeight）：CSS aspect-ratio 作用于边框盒，
    // 用内边距盒（clientWidth）会把 3.5 的比例算成 3.53，导致画布轮廓对不齐。
    // offsetWidth 不受 transform 影响，与子元素的布局坐标系一致。
    var sw = els.screenRect.offsetWidth;
    var sh = els.screenRect.offsetHeight;
    if (!sw || !sh) return;
    var box = {
      sw: sw,
      sh: sh,
      bl: els.screenRect.clientLeft,   // 左边框宽度（内边距为 0）
      bt: els.screenRect.clientTop    // 上边框宽度
    };
    stageScreenBox = { width: sw, height: sh };

    // 方向与数值一律来自 core（策略恒定字段，两种策略都有值）
    var fit = Core.fitAdvice(sw, sh, canvasRatio);
    applyStageGeometry(fit, box, canvasRatio);
  }

  /**
   * 按 fitAdvice 的结果摆放画布轮廓与裁切 / 黑边区。
   *
   * ★ 字段组铁律：叠加层必须用「策略恒定字段」
   *   cover  → fit.coverCropPx / fit.coverCropAxis
   *   contain→ fit.containBarPx / fit.containBarAxis
   *   这两组无论 core 推荐哪种 mode 都有值，因此两种策略都能画出来。
   *   （fit.cropPx / fit.pillarboxPx 是 core 的「推荐方案快捷字段」，二者互斥，
   *     另一组恒为 0/null，用它们画叠加层会丢掉另一种策略。）
   *
   * ★ 轴向铁律：按屏高还是按屏宽撑满，完全由 axis 字段决定，
   *   UI 绝不自行比较 R 与 sw/sh 的大小来猜方向。
   *
   * ★ 坐标系铁律：一切几何以「屏幕矩形边框盒」为基准。
   *   CSS 的 aspect-ratio 作用于边框盒，而绝对定位子元素的包含块是内边距盒
   *   （内边距盒比边框盒小 2px 边框）。若用 clientWidth（内边距盒）去算比例，
   *   会得到 3.53 而非真实的 3.5，画布轮廓也就对不齐屏幕。
   *   因此：sw/sh 取 offsetWidth/offsetHeight（边框盒、不含 transform 影响），
   *   摆放时再减去边框宽度 clientLeft/clientTop 换算到内边距盒坐标。
   *
   * @param {object} fit core.fitAdvice 结果
   * @param {object} box {sw, sh, bl, bt} 屏幕矩形边框盒尺寸与边框宽度
   * @param {number} canvasRatio 目标画布比例
   */
  function applyStageGeometry(fit, box, canvasRatio) {
    if (!fit || !fit.ok || !canvasRatio) {
      clearHatch();
      return;
    }

    var R = canvasRatio;
    var sw = box.sw;
    var sh = box.sh;

    if (fit.mode === 'exact') {
      // 比例一致：画布轮廓与屏矩形重合（虚线略微外扩，§5.3 情形 ①）
      setCanvasGeometry(-3, -3, sw + 6, sh + 6, false, box);
      clearHatch();
      updateStageBadge(fit, 'exact');
      return;
    }

    if (state.stageMode === 'cover') {
      // 铺满：画布溢出屏矩形，超出部分被裁切
      if (fit.coverCropAxis === 'x') {
        // 裁切在左右：画布按屏高撑满，左右各溢出 |left|
        var cw = sh * R;
        var left = (sw - cw) / 2;          // 负值 = 溢出
        setCanvasGeometry(left, 0, cw, sh, true, box);
        addHatch('crop', 'x', fit.coverCropPx, sw, sh, '此处被裁切', box);
      } else {
        // 裁切在上下：画布按屏宽撑满，上下各溢出 |top|
        var ch = sw / R;
        var top = (sh - ch) / 2;           // 负值 = 溢出
        setCanvasGeometry(0, top, sw, ch, true, box);
        addHatch('crop', 'y', fit.coverCropPx, sw, sh, '此处被裁切', box);
      }
      updateStageBadge(fit, 'cover');
      return;
    }

    // 完整显示：画布落在屏矩形内部，剩余区为留黑边区
    if (fit.containBarAxis === 'x') {
      // 黑边在左右：画布按屏高撑满，左右各留 bar 宽的黑边
      var cw2 = sh * R;
      var bar = (sw - cw2) / 2;
      setCanvasGeometry(bar, 0, cw2, sh, false, box);
      addHatch('bar', 'x', fit.containBarPx, sw, sh, '留黑边', box);
    } else {
      // 黑边在上下：画布按屏宽撑满，上下各留 bar 高的黑边
      var ch2 = sw / R;
      var bar2 = (sh - ch2) / 2;
      setCanvasGeometry(0, bar2, sw, ch2, false, box);
      addHatch('bar', 'y', fit.containBarPx, sw, sh, '留黑边', box);
    }
    updateStageBadge(fit, 'contain');
  }

  /**
   * 摆放画布轮廓。传入的是「边框盒坐标系」下的位置与尺寸，
   * 内部换算到绝对定位所用的内边距盒坐标系。
   */
  function setCanvasGeometry(left, top, w, h, overflow, box) {
    els.canvasRect.style.left = (left - box.bl) + 'px';
    els.canvasRect.style.top = (top - box.bt) + 'px';
    els.canvasRect.style.width = w + 'px';
    els.canvasRect.style.height = h + 'px';
    els.canvasRect.classList.toggle('is-overflow', !!overflow);
    // 记录画布外框范围，供 JS 兜底缩放时把溢出部分一并算进去
    stageCanvasBox = {
      left: left,
      top: top,
      width: w,
      height: h,
      unionWidth: Math.max(box.sw, w),
      unionHeight: Math.max(box.sh, h)
    };
  }

  function clearHatch() {
    var nodes = [els.hatchLeft, els.hatchRight, els.hatchTop, els.hatchBottom];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i]) nodes[i].style.display = 'none';
    }
  }

  /**
   * 舞台角标：标明当前生效的适配策略与结果。
   * 颜色不作为唯一信息载体 —— 图标形状与文字同时承载语义。
   * @param {object} fit core.fitAdvice 结果
   * @param {string} mode 当前策略 'contain' | 'cover' | 'exact'
   */
  function updateStageBadge(fit, mode) {
    var badge = els.stageBadge;
    if (!badge) return;
    // 只切换状态色类，保留 stage__badge 定位类：
    // 若整体覆盖 className，徽章会退回文档流成为 flex 子项，
    // 挤占舞台宽度导致屏幕矩形被压窄、画布轮廓与实测尺寸对不上。
    badge.classList.remove('badge--success', 'badge--warning', 'badge--info', 'badge--muted', 'badge--error');

    var icon = document.createElement('span');
    icon.className = 'icon';
    var label = document.createElement('span');

    if (mode === 'exact') {
      badge.classList.add('badge--success');
      icon.textContent = '✓';
      label.textContent = '等比适配';
    } else if (mode === 'cover') {
      badge.classList.add('badge--warning');
      icon.textContent = '▲';
      label.textContent = '铺满 · 溢出部分被裁切';
    } else {
      badge.classList.add('badge--muted');
      icon.textContent = '▣';
      label.textContent = '完整显示 · 留黑边';
    }
    badge.textContent = '';
    badge.appendChild(icon);
    badge.appendChild(label);
  }

  /**
   * 叠加裁切区 / 黑边区。语义由区内文字承载，颜色与 hatch 仅为辅助（§10.4）。
   *
   * 标签可读性处理：裁切/黑边可能只有 1–2px 宽（比例差异极小时），
   * 文字放在带内会被压扁看不见。此时把文字改为"贴边外置"，
   * 保证"哪里被裁/哪里留黑边"始终有文字可读。
   */
  function addHatch(kind, axis, size, sw, sh, labelText, box) {
    clearHatch();
    if (size <= 0) return;

    // 带宽小于文字高度时，文字移到带外侧（用 is-outside 类切换定位）
    var outside = size < 16;
    var nodes = axis === 'x' ? [els.hatchLeft, els.hatchRight] : [els.hatchTop, els.hatchBottom];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node) continue;
      node.style.display = 'block';
      node.className = 'hatch-area ' + (kind === 'crop' ? 'hatch-area--crop' : 'hatch-area--bar');
      if (axis === 'x') {
        // 左右带：落在屏幕左右边缘内侧
        node.style.left = (i === 0 ? 0 : sw - size) - box.bl + 'px';
        node.style.top = (0 - box.bt) + 'px';
        node.style.width = size + 'px';
        node.style.height = sh + 'px';
      } else {
        // 上下带：落在屏幕上下边缘内侧
        node.style.left = (0 - box.bl) + 'px';
        node.style.top = (i === 0 ? 0 : sh - size) - box.bt + 'px';
        node.style.width = sw + 'px';
        node.style.height = size + 'px';
      }
      var label = node.querySelector('.hatch-area__label');
      if (label) {
        label.textContent = labelText;
        label.classList.toggle('is-outside', outside);
        if (axis === 'x') {
          // 左右带：文字竖向居中贴在带的外侧
          label.style.top = '50%';
          label.style.left = '';
          label.style.transform = outside
            ? (i === 0 ? 'translate(-100%, -50%)' : 'translate(0, -50%)')
            : 'translate(-50%, -50%)';
        } else {
          // 上下带：文字横向居中
          label.style.left = '50%';
          label.style.top = '';
          label.style.transform = outside
            ? (i === 0 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)')
            : 'translate(-50%, -50%)';
        }
      }
    }
  }

  function applyGuides() {
    els.guideCenterH.style.display = state.showCenter ? 'block' : 'none';
    els.guideCenterV.style.display = state.showCenter ? 'block' : 'none';
    els.guideGrid.style.display = state.showGrid ? 'block' : 'none';
  }

  /**
   * JS 兜底（§5.1）：老浏览器未实现 transferred 约束时按 scale 显式收缩，
   * 避免屏幕矩形撑破舞台。cover 策略下画布会溢出屏幕，
   * 缩放时须把溢出部分一并算进去，否则溢出部分会被舞台裁掉看不见。
   */
  function fitStageFallback() {
    var stage = els.stage;
    var rect = els.screenRect;
    var availW = stage.clientWidth - STAGE_PADDING * 2;
    var availH = stage.clientHeight - STAGE_PADDING * 2;
    if (!availW || !availH) return;

    var w = rect.offsetWidth;
    var h = rect.offsetHeight;
    if (!w || !h) return;

    // 画布可能超出屏幕矩形（cover 策略），取两者并集作为需要容纳的范围
    var needW = Math.max(w, stageCanvasBox.unionWidth || w);
    var needH = Math.max(h, stageCanvasBox.unionHeight || h);

    if (needW > availW || needH > availH) {
      var scale = Math.min(availW / needW, availH / needH);
      rect.style.transform = 'scale(' + scale + ')';
    } else {
      rect.style.transform = '';
    }
  }

  /* ===================== 复制 ===================== */

  function buildResolutionText() {
    var dims = readDimensions();
    var target = resolveTargetRatio();
    var candidates = computeCandidates(target.ratio);
    var primary = primaryCandidate(candidates);
    var res = primary ? primary.result : null;
    if (!res || !res.ok || !res.outputWidth) return null;
    return plainResolution(res.outputWidth, res.outputHeight);
  }

  function buildFullParameterText() {
    var dims = readDimensions();
    var target = resolveTargetRatio();
    var candidates = computeCandidates(target.ratio);
    var primary = primaryCandidate(candidates);
    if (!dims.ok) return null;

    var unitLabel = (UNIT_SPEC[state.unit] || UNIT_SPEC.m).label;
    var screenRatio = Core.computeRatio(dims.widthMm, dims.heightMm);
    var res = primary ? primary.result : null;
    var lines = [];

    lines.push('LED 屏比例换算参数');
    lines.push('屏幕实际尺寸：' + formatMm(dims.widthMm, state.unit) + ' ' + unitLabel
      + ' × ' + formatMm(dims.heightMm, state.unit) + ' ' + unitLabel);
    lines.push('实际比例：' + screenRatio.decimal + ' : 1');
    lines.push('最简整数比例：' + (screenRatio.exact ? screenRatio.reducedText
      : (screenRatio.nearest ? screenRatio.nearest.text + '（近似）' : '无有限整数比')));
    lines.push('目标比例来源：' + (target.source === 'screen' ? '屏幕实际比例'
      : (target.source === 'standard' ? '标准画幅 ' + target.label : '自定义 ' + target.label)));

    if (res && res.ok && res.outputWidth) {
      lines.push('目标画布分辨率：' + plainResolution(res.outputWidth, res.outputHeight));
      lines.push('输出比例：' + formatRatioValue(res.outputRatio) + ' : 1');
      lines.push('宽高比相对误差：' + formatDeviation(res.ratioErrorPercent));
      lines.push('像素尺寸误差：' + formatDeviation(res.pixelErrorPercent));
      lines.push('是否严格匹配：' + (res.strictMatch ? '是' : '否（存在取整误差）'));
      if (res.fitAdvice && res.fitAdvice.ok) {
        lines.push('等比适配方案：' + describeFit(res.fitAdvice) + '（不建议拉伸画面）');
      }
    }

    lines.push('');
    lines.push('以下参数需现场确认（本工具不推导）：');
    for (var i = 0; i < SITE_FIELDS.length; i++) {
      var f = SITE_FIELDS[i];
      lines.push('  ' + f.label + '：' + (state[f.key] ? state[f.key] : '未填写'));
    }

    return lines.join('\n');
  }

/* ---- desktop-adapter: persistence → IPC ---- */
  function desktopLoadSettings() {
    if (!window.ledApi || !window.ledApi.settingsGet) return;
    try {
      var r = window.ledApi.settingsGet();
      if (r && r.code === 0 && r.data && typeof r.data.tolerancePercent === 'number') {
        state.tolerancePercent = r.data.tolerancePercent;
        var t = document.getElementById('input-tolerance');
        if (t) t.value = String(r.data.tolerancePercent);
      }
    } catch (e) { /* 静默降级为默认值 */ }
  }
  function desktopSaveSettings() {
    if (!window.ledApi || !window.ledApi.settingsSet) return;
    try {
      var r = window.ledApi.settingsSet({ tolerancePercent: state.tolerancePercent });
      if (r && r.code !== 0) { /* 写入失败静默忽略，本次会话内仍生效 */ }
    } catch (e) { /* 同上 */ }
  }

  /**
   * 复制：优先剪贴板 API，失败退回 execCommand；反馈必须真实反映复制结果。
   */
/* ---- desktop-adapter: clipboard → IPC ---- */
  function desktopCopyText(text, button) {
    if (!text) { showCopyFeedback(button, false); return; }
    if (!window.ledApi || !window.ledApi.clipboardWriteText) {
      showCopyFeedback(button, false);
      return;
    }
    try {
      var r = window.ledApi.clipboardWriteText(text);
      if (r && typeof r.then === 'function') {
        r.then(function (res) {
          showCopyFeedback(button, !!(res && res.code === 0));
        }, function () {
          showCopyFeedback(button, false);
        });
      } else {
        showCopyFeedback(button, false);
      }
    } catch (e) {
      showCopyFeedback(button, false);
    }
  }
  function copyText(text, button) {
    desktopCopyText(text, button);
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

/* ---- desktop-adapter: copy feedback — restore each button's own label ---- */
  function showCopyFeedback(button, ok) {
    var icon = button.querySelector('.icon');
    var label = button.querySelector('.label');
    if (!icon || !label) return;
    // 🔒 记住各自原始文案与图标（首次使用时捕获）
    if (!button.getAttribute('data-desktop-orig-label')) {
      button.setAttribute('data-desktop-orig-label', label.textContent);
    }
    if (!button.getAttribute('data-desktop-orig-icon')) {
      button.setAttribute('data-desktop-orig-icon', icon.textContent);
    }
    var origLabel = button.getAttribute('data-desktop-orig-label');
    var origIcon = button.getAttribute('data-desktop-orig-icon');
    if (ok) {
      button.classList.add('is-success');
      button.classList.remove('is-error');
      icon.textContent = '✓';
      label.textContent = '已复制';
      setText(els.liveFeedback, '已复制到剪贴板');
      window.setTimeout(function () {
        button.classList.remove('is-success');
        icon.textContent = origIcon;
        label.textContent = origLabel;
      }, COPY_OK_MS);
    } else {
      button.classList.add('is-error');
      button.classList.remove('is-success');
      icon.textContent = '!';
      label.textContent = '复制失败';
      setText(els.liveFeedback, '复制失败，请手动选取文本复制');
      window.setTimeout(function () {
        button.classList.remove('is-error');
        icon.textContent = origIcon;
        label.textContent = origLabel;
      }, COPY_FAIL_MS);
    }
  }

  /* ===================== 事件绑定 ===================== */

  function bindEvents() {
    els.widthInput.addEventListener('input', function () {
      state.widthText = els.widthInput.value;
      var parsed = Core.parseDimension(state.widthText, state.unit);
      if (parsed.ok) state.widthMm = parsed.mm;
      update();
    });
    els.heightInput.addEventListener('input', function () {
      state.heightText = els.heightInput.value;
      var parsed = Core.parseDimension(state.heightText, state.unit);
      if (parsed.ok) state.heightMm = parsed.mm;
      update();
    });

    els.widthInput.addEventListener('keydown', function (e) { handleStepKey(e, 'width'); });
    els.heightInput.addEventListener('keydown', function (e) { handleStepKey(e, 'height'); });

    els.widthMinus.addEventListener('click', function () { stepDimension('width', -1, false); });
    els.widthPlus.addEventListener('click', function () { stepDimension('width', 1, false); });
    els.heightMinus.addEventListener('click', function () { stepDimension('height', -1, false); });
    els.heightPlus.addEventListener('click', function () { stepDimension('height', 1, false); });

    var unitSegments = document.querySelectorAll('.unit-segment');
    for (var i = 0; i < unitSegments.length; i++) {
      unitSegments[i].addEventListener('click', function (e) {
        var next = e.currentTarget.dataset.unit;
        if (next === state.unit) return;
        changeUnit(next);
      });
    }

    els.swapButton.addEventListener('click', function () {
      var w = state.widthText;
      var h = state.heightText;
      state.widthText = h;
      state.heightText = w;
      var wm = state.widthMm;
      state.widthMm = state.heightMm;
      state.heightMm = wm;
      update();
    });

    els.resetButton.addEventListener('click', function () {
      state.unit = DEFAULT_UNIT;
      state.widthText = DEFAULT_WIDTH;
      state.heightText = DEFAULT_HEIGHT;
      state.widthMm = Core.parseDimension(DEFAULT_WIDTH, DEFAULT_UNIT).mm;
      state.heightMm = Core.parseDimension(DEFAULT_HEIGHT, DEFAULT_UNIT).mm;
      state.ratioSource = 'screen';
      state.standardKey = null;
      state.customRatioText = '';
      state.canvasMode = 'width';
      state.targetWidth = '1920';
      state.targetHeight = '1080';
      state.presetKey = null;
      state.siteReceive = '';
      state.siteComposite = '';
      state.siteDeliver = '';
      // 整数比模式的自定义字段也要复位：残留值会在下次进入该模式时意外生效
      state.customCanvasMaxWidth = '';
      state.customCanvasMaxHeight = '';
      state.customCanvasRatio = DEFAULT_CUSTOM_CANVAS_RATIO;
      state.customCanvasPrefer = 'bounds';
      state.demoGuidance = '';
      syncRatioSourceButtons();
      syncCanvasModeButtons();
      syncPreferButtons();
      update();
    });

    var sourceSegments = document.querySelectorAll('.ratio-source-segment');
    for (var s = 0; s < sourceSegments.length; s++) {
      sourceSegments[s].addEventListener('click', function (e) {
        state.ratioSource = e.currentTarget.dataset.source;
        if (state.ratioSource === 'standard' && !state.standardKey) {
          state.standardKey = '16:9';
        }
        syncRatioSourceButtons();
        update();
      });
    }

    els.customRatioInput.addEventListener('input', function () {
      state.customRatioText = els.customRatioInput.value;
      var pair = parseRatioPair(state.customRatioText);
      setText(els.canvasRatioError, pair ? '' : '请输入形如 65:36 的正整数比例');
      if (pair) {
        state.ratioSource = 'custom';
        syncRatioSourceButtons();
      }
      update();
    });

    var modeSegments = document.querySelectorAll('.canvas-mode-segment');
    for (var m = 0; m < modeSegments.length; m++) {
      modeSegments[m].addEventListener('click', function (e) {
        state.canvasMode = e.currentTarget.dataset.mode;
        syncCanvasModeButtons();
        update();
      });
    }

    els.targetWidthInput.addEventListener('input', function () {
      state.targetWidth = els.targetWidthInput.value;
      update();
    });
    els.targetHeightInput.addEventListener('input', function () {
      state.targetHeight = els.targetHeightInput.value;
      update();
    });
    els.customCanvasMaxWidth.addEventListener('input', function () {
      state.customCanvasMaxWidth = els.customCanvasMaxWidth.value;
      update();
    });
    els.customCanvasMaxHeight.addEventListener('input', function () {
      state.customCanvasMaxHeight = els.customCanvasMaxHeight.value;
      update();
    });
    els.customCanvasRatio.addEventListener('input', function () {
      state.customCanvasRatio = els.customCanvasRatio.value;
      var pair = parseRatioPair(state.customCanvasRatio);
      setText(els.canvasRatioError, pair ? '' : '请输入形如 65:36 的正整数比例');
      update();
    });
    var preferSegments = document.querySelectorAll('.prefer-segment');
    for (var p = 0; p < preferSegments.length; p++) {
      preferSegments[p].addEventListener('click', function (e) {
        state.customCanvasPrefer = e.currentTarget.dataset.prefer;
        syncPreferButtons();
        update();
      });
    }

    els.siteReceive.addEventListener('input', function () { state.siteReceive = els.siteReceive.value; update(); });
    els.siteComposite.addEventListener('input', function () { state.siteComposite = els.siteComposite.value; update(); });
    els.siteDeliver.addEventListener('input', function () { state.siteDeliver = els.siteDeliver.value; update(); });

    els.copyResolution.addEventListener('click', function () {
      copyText(buildResolutionText(), els.copyResolution);
    });
    els.copyFull.addEventListener('click', function () {
      copyText(buildFullParameterText(), els.copyFull);
    });

    els.toggleCenter.addEventListener('click', function () {
      state.showCenter = !state.showCenter;
      els.toggleCenter.classList.toggle('is-on', state.showCenter);
      els.toggleCenter.setAttribute('aria-pressed', state.showCenter ? 'true' : 'false');
      applyGuides();
    });
    els.toggleGrid.addEventListener('click', function () {
      state.showGrid = !state.showGrid;
      els.toggleGrid.classList.toggle('is-on', state.showGrid);
      els.toggleGrid.setAttribute('aria-pressed', state.showGrid ? 'true' : 'false');
      applyGuides();
    });

    // 舞台适配策略切换：完整显示（contain，默认）/ 铺满（cover）
    var stageModeSegments = document.querySelectorAll('.stage-mode-segment');
    for (var sm = 0; sm < stageModeSegments.length; sm++) {
      stageModeSegments[sm].addEventListener('click', function (e) {
        state.stageMode = e.currentTarget.dataset.mode;
        syncStageModeButtons();
        update();
      });
    }

    els.settingsToggle.addEventListener('click', function () {
      var open = els.settings.classList.toggle('is-open');
      els.settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) els.toleranceInput.focus();
    });
    els.toleranceInput.addEventListener('input', function () {
      var v = Number(els.toleranceInput.value);
      if (isFinite(v) && v > 0) {
        state.tolerancePercent = v;
        saveSettings();
        update();
      }
    });
    document.addEventListener('click', function (e) {
      if (!els.settings.classList.contains('is-open')) return;
      if (els.settings.contains(e.target) || els.settingsToggle.contains(e.target)) return;
      els.settings.classList.remove('is-open');
      els.settingsToggle.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && els.settings.classList.contains('is-open')) {
        els.settings.classList.remove('is-open');
        els.settingsToggle.setAttribute('aria-expanded', 'false');
        els.settingsToggle.focus();
      }
    });

    els.warnClose.addEventListener('click', function () {
      setWarnDismissed();
      els.warnBar.style.display = 'none';
    });

    window.addEventListener('resize', function () {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(function () {
        resizeFrame = 0;
        var dims = readDimensions();
        var target = resolveTargetRatio();
        var candidates = computeCandidates(target.ratio);
        renderStage(dims, target, candidates);
        fitStageFallback();
      });
    });
  }

  function handleStepKey(e, which) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    stepDimension(which, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
  }

  function stepDimension(which, direction, fast) {
    var spec = UNIT_SPEC[state.unit] || UNIT_SPEC.m;
    var step = spec.step * (fast ? 10 : 1);
    var text = which === 'width' ? state.widthText : state.heightText;
    var parsed = Core.parseDimension(text, state.unit);
    if (!parsed.ok) return;
    var next = parsed.value + direction * step;
    if (next <= 0) return;
    var newText = Core.fmt(next, spec.digits);
    if (newText.indexOf('.') >= 0) newText = newText.replace(/0+$/, '').replace(/\.$/, '');
    if (which === 'width') {
      state.widthText = newText;
      state.widthMm = Core.parseDimension(newText, state.unit).mm;
    } else {
      state.heightText = newText;
      state.heightMm = Core.parseDimension(newText, state.unit).mm;
    }
    update();
  }

  /**
   * 单位切换：物理尺寸不变，只换显示值。
   */
  function changeUnit(next) {
    var dims = readDimensions();
    if (dims.ok) {
      state.widthMm = dims.widthMm;
      state.heightMm = dims.heightMm;
      state.widthText = formatMm(dims.widthMm, next);
      state.heightText = formatMm(dims.heightMm, next);
    }
    state.unit = next;
    update();
  }

  function syncRatioSourceButtons() {
    var segments = document.querySelectorAll('.ratio-source-segment');
    for (var i = 0; i < segments.length; i++) {
      segments[i].setAttribute('aria-checked',
        segments[i].dataset.source === state.ratioSource ? 'true' : 'false');
    }
    els.customRatioField.style.display = state.ratioSource === 'custom' ? '' : 'none';
  }

  function syncCanvasModeButtons() {
    var segments = document.querySelectorAll('.canvas-mode-segment');
    for (var i = 0; i < segments.length; i++) {
      segments[i].setAttribute('aria-checked',
        segments[i].dataset.mode === state.canvasMode ? 'true' : 'false');
    }
    els.modeWidthField.style.display = state.canvasMode === 'width' ? '' : 'none';
    els.modeHeightField.style.display = state.canvasMode === 'height' ? '' : 'none';
    els.modePresetField.style.display = state.canvasMode === 'preset' ? '' : 'none';
    els.modeCustomField.style.display = state.canvasMode === 'custom' ? '' : 'none';
  }

  function syncPreferButtons() {
    var segments = document.querySelectorAll('.prefer-segment');
    for (var i = 0; i < segments.length; i++) {
      segments[i].setAttribute('aria-checked',
        segments[i].dataset.prefer === state.customCanvasPrefer ? 'true' : 'false');
    }
  }

  function syncStageModeButtons() {
    var segments = document.querySelectorAll('.stage-mode-segment');
    for (var i = 0; i < segments.length; i++) {
      segments[i].setAttribute('aria-checked',
        segments[i].dataset.mode === state.stageMode ? 'true' : 'false');
    }
  }

  /* ===================== 主更新循环 ===================== */

  function update() {
    var dims = readDimensions();
    var target = resolveTargetRatio();
    var candidates = computeCandidates(target.ratio);

    renderInputState(dims);
    renderPresetMeta(dims);   // 预设列表 meta 的「与屏幕偏差」随屏幕尺寸实时刷新
    syncSelectionStates();
    renderResult(dims, target, candidates);
    renderStage(dims, target, candidates);
    fitStageFallback();

    if (document.activeElement !== els.toleranceInput) els.toleranceInput.value = state.tolerancePercent;
    if (document.activeElement !== els.customRatioInput) els.customRatioInput.value = state.customRatioText;
    if (document.activeElement !== els.targetWidthInput) els.targetWidthInput.value = state.targetWidth;
    if (document.activeElement !== els.targetHeightInput) els.targetHeightInput.value = state.targetHeight;
    if (document.activeElement !== els.customCanvasMaxWidth) els.customCanvasMaxWidth.value = state.customCanvasMaxWidth;
    if (document.activeElement !== els.customCanvasMaxHeight) els.customCanvasMaxHeight.value = state.customCanvasMaxHeight;
    if (document.activeElement !== els.customCanvasRatio) els.customCanvasRatio.value = state.customCanvasRatio;
    if (document.activeElement !== els.siteReceive) els.siteReceive.value = state.siteReceive;
    if (document.activeElement !== els.siteComposite) els.siteComposite.value = state.siteComposite;
    if (document.activeElement !== els.siteDeliver) els.siteDeliver.value = state.siteDeliver;

    replayFade(els.ratioValue);

    // 舞台几何依赖屏幕矩形的实测像素，而实测值要等布局落定才准确：
    // 首帧时徽章/列表尚未稳定，直接量会拿到过期尺寸，导致画布轮廓与屏幕对不上。
    // 故在下一帧再按最终布局重算一次（只重画舞台，不重算业务结果）。
    scheduleStageRepaint();
  }

  /**
   * 在下一帧重画舞台（合并同一帧内的多次请求）。
   */
  var stageRepaintFrame = 0;
  function scheduleStageRepaint() {
    if (stageRepaintFrame) return;
    stageRepaintFrame = requestAnimationFrame(function () {
      stageRepaintFrame = 0;
      var dims = readDimensions();
      var target = resolveTargetRatio();
      var candidates = computeCandidates(target.ratio);
      renderStage(dims, target, candidates);
      fitStageFallback();
    });
  }

  /* ===================== 初始化 ===================== */

  function cacheElements() {
    els.widthInput = document.getElementById('input-width');
    els.heightInput = document.getElementById('input-height');
    els.widthWrap = document.getElementById('wrap-width');
    els.heightWrap = document.getElementById('wrap-height');
    els.widthUnit = document.getElementById('unit-width');
    els.heightUnit = document.getElementById('unit-height');
    els.widthError = document.getElementById('error-width');
    els.heightError = document.getElementById('error-height');
    els.widthMinus = document.getElementById('step-width-minus');
    els.widthPlus = document.getElementById('step-width-plus');
    els.heightMinus = document.getElementById('step-height-minus');
    els.heightPlus = document.getElementById('step-height-plus');
    els.swapButton = document.getElementById('btn-swap');
    els.resetButton = document.getElementById('btn-reset');
    els.standardList = document.getElementById('standard-list');
    els.customRatioField = document.getElementById('field-custom-ratio');
    els.customRatioInput = document.getElementById('input-custom-ratio');
    els.modeWidthField = document.getElementById('field-mode-width');
    els.modeHeightField = document.getElementById('field-mode-height');
    els.modePresetField = document.getElementById('field-mode-preset');
    els.modeCustomField = document.getElementById('field-mode-custom');
    els.targetWidthInput = document.getElementById('input-target-width');
    els.targetHeightInput = document.getElementById('input-target-height');
    els.presetList = document.getElementById('preset-list');
    els.customCanvasMaxWidth = document.getElementById('input-canvas-max-width');
    els.customCanvasMaxHeight = document.getElementById('input-canvas-max-height');
    els.customCanvasRatio = document.getElementById('input-canvas-ratio');
    els.canvasRatioError = document.getElementById('error-canvas-ratio');
    els.siteReceive = document.getElementById('input-site-receive');
    els.siteComposite = document.getElementById('input-site-composite');
    els.siteDeliver = document.getElementById('input-site-deliver');
    els.demoList = document.getElementById('demo-list');
    els.demoGuidance = document.getElementById('demo-guidance');
    els.resultBadge = document.getElementById('result-badge');
    els.ratioValue = document.getElementById('ratio-value');
    els.ratioSuffix = document.getElementById('ratio-suffix');
    els.approxLine = document.getElementById('approx-line');
    els.resValue = document.getElementById('res-value');
    els.coreNote = document.getElementById('core-note');
    els.tableWrap = document.getElementById('table-wrap');
    els.tableBody = document.getElementById('table-body');
    els.matchBody = document.getElementById('match-body');
    els.candidateList = document.getElementById('candidate-list');
    els.liveResults = document.getElementById('live-results');
    els.liveFeedback = document.getElementById('live-feedback');
    els.copyResolution = document.getElementById('btn-copy-resolution');
    els.copyFull = document.getElementById('btn-copy-full');
    els.warnBar = document.getElementById('warn-bar');
    els.warnText = document.getElementById('warn-text');
    els.warnClose = document.getElementById('btn-warn-close');
    els.stage = document.getElementById('stage');
    els.screenRect = document.getElementById('screen-rect');
    els.canvasRect = document.getElementById('canvas-rect');
    els.canvasLabel = document.getElementById('canvas-label');
    els.dimRatio = document.getElementById('dim-ratio');
    els.dimWidth = document.getElementById('dim-width');
    els.dimHeight = document.getElementById('dim-height');
    els.hatchLeft = document.getElementById('hatch-left');
    els.hatchRight = document.getElementById('hatch-right');
    els.hatchTop = document.getElementById('hatch-top');
    els.hatchBottom = document.getElementById('hatch-bottom');
    els.guideCenterH = document.getElementById('guide-center-h');
    els.guideCenterV = document.getElementById('guide-center-v');
    els.guideGrid = document.getElementById('guide-grid');
    els.stageBadge = document.getElementById('stage-badge');
    els.toggleCenter = document.getElementById('toggle-center');
    els.toggleGrid = document.getElementById('toggle-grid');
    els.settingsToggle = document.getElementById('btn-settings');
    els.settings = document.getElementById('settings-panel');
    els.toleranceInput = document.getElementById('input-tolerance');
  }

  function init() {
    cacheElements();
    loadSettings();
    state.widthMm = Core.parseDimension(DEFAULT_WIDTH, DEFAULT_UNIT).mm;
    state.heightMm = Core.parseDimension(DEFAULT_HEIGHT, DEFAULT_UNIT).mm;

    renderStandardList();
    renderPresetList();
    renderDemoList();
    bindEvents();
    syncRatioSourceButtons();
    syncCanvasModeButtons();
    syncPreferButtons();
    syncStageModeButtons();
    update();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

/* ---- desktop-adapter: expose internals for the desktop interaction layer ---- */
  return {
    init: init,
    state: state,
    // 🔒 只暴露既有函数，不新增计算；全部实现仍委托 core.js（DEC-02）。
    buildResolutionText: buildResolutionText,
    buildFullParameterText: buildFullParameterText,
    copyText: copyText,
    readDimensions: readDimensions,
    resolveTargetRatio: resolveTargetRatio,
    computeCandidates: computeCandidates,
    primaryCandidate: primaryCandidate,
    describeFit: describeFit,
    formatMm: formatMm,
    formatDeviation: formatDeviation,
    formatResolution: formatResolution,
    plainResolution: plainResolution,
    ratioTextOf: ratioTextOf,
    buildCoreNote: buildCoreNote,
    buildLiveSummary: buildLiveSummary,
    renderBadge: renderBadge,
    unitSpec: UNIT_SPEC,
    siteFields: SITE_FIELDS,
    defaultTolerancePercent: Core.DEFAULT_TOLERANCE_PERCENT
  };
});
