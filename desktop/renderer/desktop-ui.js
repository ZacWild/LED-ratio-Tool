/**
 * LED-ratio-Tool 桌面版 · 桌面交互层（P4-B）
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-05 —— 项目负责人承担最终验收
 *   DEC-08 —— 1280px 是三栏切换阈值
 *   DEC-11 —— 零网络（不得使用 fetch）
 *   DEC-13 —— 三线版本，全部从 IPC `app:v1:app.version` 实读
 *   DEC-14 —— 客户区尺寸口径
 *   DEC-16 —— 高度降级三档；TK-72 未闭合前**只判定不收纳**
 *   SEC-04 —— 只用 preload 白名单的 8 个方法
 *   SEC-10 —— 剪贴板只写不读
 *   SEC-31 —— 渲染层 console 零 error/warning
 *   E-4     —— 沙箱 preload 无 Buffer / setImmediate
 *   D-01    —— 三尺寸线框、EL-xx 元素编号、三层 sticky、跨断点行为
 *   D-02    —— IX-01~IX-20、ER-01~ER-14、焦点顺序、模态焦点锁与归还
 *   D-03    —— 视觉规范、EL-FT-09 缩放档位、EL-IN-35 折叠头、EL-MD-06 遮罩
 *   D-05    —— 12 组快捷键 × 4 种焦点状态的完整矩阵
 *   F-01~F-18 —— 桌面版功能边界（表 A）
 *
 * 🔒 本文件**不做任何业务计算** —— 比例/误差/取整一律由 core.js 产出；
 *    本文件对 app.js 私有函数的复用通过 desktop-adapter 暴露的 LedApp 接口完成，
 *    不复制任何算法（SEC-01 / DEC-02）。
 * 🔒 本文件不得使用 fetch —— connect-src 'none' 会封死（E-6 / SEC-36）。
 * 🔒 本文件不得新增 IPC 通道 —— 菜单动作走 window.__desktopMenu（SEC-07）。
 */
'use strict';

(function () {
  'use strict';

  var api = window.ledApi;

  /* ======================================================================
     0 · 常量
     ====================================================================== */
  var TIER_THREE = 'three';        // ≥1280px 三栏
  var TIER_TWO = 'two';            // 1025~1279px 两栏（舞台折叠为摘要）
  var TIER_STACKED = 'stacked';    // ≤1024px 三面板纵向堆叠（IX-13 窄化口径）
  var BREAKPOINT_THREE = 1280;     // DEC-08
  var BREAKPOINT_STACKED = 1024;   // 窄窗口下限（DEC-07）

  var COL_INPUT_MIN = 280;         // D-01 §2.2
  var COL_INPUT_MAX = 420;
  var COL_INPUT_DEFAULT = 320;
  var COL_RESULT_MIN = 360;        // D-01 §2.2
  var COL_RESULT_MAX = 560;
  var COL_RESULT_DEFAULT = 400;
  var COL_STEP = 8;                // D-05 SK-12
  var COL_STEP_FINE = 2;           // Shift + ←/→

  var IX13_CONTENT_MIN = 300;      // IX-13 触发基准（A 栏内容盒宽）

  /* ======================================================================
     1 · 工具
     ====================================================================== */
  function $(id) {
    return document.getElementById(id);
  }
  function on(el, ev, fn, capture) {
    if (el) el.addEventListener(ev, fn, !!capture);
  }
  function text(el, value) {
    if (el) el.textContent = value == null ? '' : String(value);
  }
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }
  function app() {
    return window.LedApp;
  }

  /* ---- 布局档位 ---- */
  var layout = null;
  var inputPanel = null;
  var stagePanel = null;
  var resultPanel = null;
  var tier = null;               // 首次 applyTier 时才落档（changed = true）
  var stageExpanded = false;

  /* ---- 栏宽 ---- */
  var colInput = COL_INPUT_DEFAULT;
  var colResult = COL_RESULT_DEFAULT;

  /* ---- 模态 ---- */
  var modalLayer = null;
  var modalEl = null;
  var modalTitleEl = null;
  var modalBodyEl = null;
  var modalFootEl = null;
  var modalOpen = false;
  var modalTrigger = null;

  /* ---- 版本（三线，唯一来源 = IPC） ---- */
  var versionData = null;

  /* ---- 状态栏元素 ---- */
  var ft = {};

  /* ======================================================================
     2 · 桌面外壳搭建
     --------------------------------------------------------------------------
     🔒 仓库根 index.html 是受保护对象，桌面副本由 sync-assets.mjs 逐字节同步。
        因此**新增 DOM 一律在运行时构建**，不修改 HTML 文件。
     ====================================================================== */
  function buildShell() {
    layout = document.querySelector('.layout');
    inputPanel = document.querySelector('.panel--input');
    stagePanel = document.querySelector('.panel--stage');
    resultPanel = document.querySelector('.panel--result');
    if (!layout || !inputPanel || !stagePanel || !resultPanel) return false;

    moveUnitSegment();
    restructureResultPanel();
    buildStatusBar();
    buildModalLayer();
    buildDragHandles();
    buildStageSummary();
    return true;
  }

  /**
   * EL-HD-01 单位分段迁入 A 栏「屏幕尺寸」组（D-01 §1.1）。
   * 🔒 只移动节点、不改属性 → app.js 的 document 级查询与事件绑定不受影响。
   */
  function moveUnitSegment() {
    var seg = document.querySelector('.app-header .segmented');
    if (!seg) return;
    var group = inputPanel.querySelector('.group');
    if (!group) return;
    var row = group.querySelector('.field-row');
    if (row) row.insertAdjacentElement('afterend', seg);
    else group.appendChild(seg);
  }

  /**
   * 结果栏重排：核心卡 + 警示条吸顶（层①②），复制组吸底（层③）（D-01 §2.4）。
   * 🔒 只移动节点 → app.js 的 els 引用全部保持有效。
   */
  function restructureResultPanel() {
    var title = resultPanel.querySelector('.panel__title');
    var liveResults = $('live-results');
    var liveFeedback = $('live-feedback');
    var coreRatio = document.querySelector('.panel--result .core-ratio');
    var approx = $('approx-line');
    var res = $('res-value');
    var note = $('core-note');
    var warn = $('warn-bar');
    var copyRow = document.querySelector('.panel--result .btn-row');

    var moved = [coreRatio, approx, res, note, warn, copyRow, liveFeedback];

    // ① 核心结果卡
    var core = document.createElement('div');
    core.className = 'result-core';
    if (coreRatio) core.appendChild(coreRatio);
    if (approx) core.appendChild(approx);
    if (res) core.appendChild(res);
    if (note) core.appendChild(note);

    // ② 吸顶层（核心卡 + 警示条）
    var sticky = document.createElement('div');
    sticky.className = 'result-sticky-top';
    sticky.appendChild(core);
    if (warn) sticky.appendChild(warn);

    // ③ 正文容器（保持原有相对顺序）
    var body = document.createElement('div');
    body.className = 'result-body';

    // ④ 吸底复制组
    var actions = document.createElement('div');
    actions.className = 'result-actions';
    if (copyRow) actions.appendChild(copyRow);

    var original = Array.prototype.slice.call(resultPanel.children);
    for (var i = 0; i < original.length; i++) {
      var c = original[i];
      if (c === title || c === liveResults) continue;
      if (moved.indexOf(c) >= 0) continue;
      body.appendChild(c);
    }

    resultPanel.insertBefore(sticky, liveResults);
    resultPanel.insertBefore(body, liveResults);
    resultPanel.insertBefore(actions, liveResults);
    if (liveFeedback) resultPanel.appendChild(liveFeedback);
  }

  /* ======================================================================
     3 · 状态栏（EL-FT-01~09 · D-03 §5.2）
     ====================================================================== */
  function buildStatusBar() {
    var bar = document.createElement('footer');
    bar.className = 'status-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', '状态栏');

    function item(id, cls, title, text0) {
      var el = document.createElement('span');
      el.id = id;
      el.className = 'status-bar__item' + (cls ? ' ' + cls : '');
      el.title = title || '';
      el.textContent = text0 || '';
      return el;
    }
    function sep() {
      var el = document.createElement('span');
      el.className = 'status-bar__sep';
      return el;
    }

    ft.unit = item('ft-unit', '', '当前单位', '—');
    ft.ratio = item('ft-ratio', '', '当前屏幕实际比例', '—');
    ft.mode = item('ft-mode', '', '当前画布模式', '按宽度');
    ft.badge = item('ft-badge', 'status-bar__badge', '匹配状态徽标', '—');

    ft.error = document.createElement('button');
    ft.error.type = 'button';
    ft.error.id = 'ft-error';
    ft.error.className = 'status-bar__item status-bar__error';
    ft.error.title = '当前首个错误（点击跳转到该字段）';

    var spacer = document.createElement('span');
    spacer.className = 'status-bar__spacer';

    ft.layout = item('ft-layout', '', '布局档位', '三栏');
    ft.message = item('ft-message', '', '状态提示（复制结果等）', '');

    ft.settings = document.createElement('button');
    ft.settings.type = 'button';
    ft.settings.id = 'ft-settings';
    ft.settings.className = 'status-bar__item status-bar__btn';
    ft.settings.title = '设置（Ctrl+,）';
    ft.settings.textContent = '设置';

    ft.scale = item('ft-scale', '', '系统显示缩放档位', '100%');

    bar.appendChild(ft.unit);
    bar.appendChild(sep());
    bar.appendChild(ft.ratio);
    bar.appendChild(sep());
    bar.appendChild(ft.mode);
    bar.appendChild(sep());
    bar.appendChild(ft.badge);
    bar.appendChild(sep());
    bar.appendChild(ft.error);
    bar.appendChild(spacer);
    bar.appendChild(ft.layout);
    bar.appendChild(sep());
    bar.appendChild(ft.message);
    bar.appendChild(sep());
    bar.appendChild(ft.settings);
    bar.appendChild(sep());
    bar.appendChild(ft.scale);

    document.body.appendChild(bar);

    on(ft.settings, 'click', function () {
      openSettingsModal(ft.settings);
    });
    on(ft.error, 'click', function () {
      focusFirstInvalidField();
    });
  }

  /**
   * 徽标镜像：把结果栏徽标的**图标 + 文字**复制到状态栏（颜色非唯一载体原则）。
   * 🔒 只复制渲染结果，不做任何判定 —— 判定仍由 app.js 的 renderBadge 唯一负责。
   */
  function mirrorBadge(target, badge) {
    target.textContent = '';
    if (!badge) {
      target.textContent = '—';
      return;
    }
    var state = '';
    var classes = (badge.className || '').split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      if (classes[i].indexOf('badge--') === 0) state = classes[i];
    }
    target.className = 'status-bar__item status-bar__badge ' +
      (state ? 'status-' + state : '');
    var icon = badge.querySelector('.icon');
    var label = badge.querySelector('span:not(.icon)');
    if (icon) target.appendChild(icon.cloneNode(true));
    if (label) target.appendChild(label.cloneNode(true));
    if (!icon && !label) target.textContent = badge.textContent.trim();
  }

  /* ======================================================================
     4 · 状态栏刷新（EL-FT-01~09）
     --------------------------------------------------------------------------
     🔒 app.js 没有对外的「更新完成」事件 → 用 MutationObserver 观察关键节点，
        保证状态栏与界面同步（≤100ms，D-02 §9.2）。
     ====================================================================== */
  function syncStatusBar() {
    var unitEl = $('unit-width');
    text(ft.unit, unitEl ? unitEl.textContent.trim() : '—');

    var ratioEl = $('ratio-value');
    if (ratioEl) {
      var raw = ratioEl.textContent.replace(/\s+/g, '');
      text(ft.ratio, raw && raw !== '—:—' ? raw.replace(':', ' : ') : '—');
    } else {
      text(ft.ratio, '—');
    }

    var modeSeg = document.querySelector('.canvas-mode-segment[aria-checked="true"]');
    text(ft.mode, modeSeg ? modeSeg.textContent.trim() : '按宽度');

    mirrorBadge(ft.badge, $('result-badge'));
    ft.badge.title = '匹配状态徽标（与结果栏同源）';

    text(ft.error, firstErrorText());

    var live = $('live-feedback');
    text(ft.message, live ? live.textContent.trim() : '');

    ft.scale.textContent = Math.round((window.devicePixelRatio || 1) * 100) + '%';
    ft.scale.title = '系统显示缩放档位（DPR 仅用于诊断，不参与布局计算）';
  }

  /**
   * EL-FT-05：当前**首个**错误（字段级 → 区域级）。
   * 🔒 文案一律取界面已渲染的原文（core 的 message），本层不另写校验。
   */
  function firstErrorText() {
    var w = $('error-width');
    if (w && w.textContent.trim()) return w.textContent.trim();
    var h = $('error-height');
    if (h && h.textContent.trim()) return h.textContent.trim();
    var list = $('candidate-list');
    if (list) {
      var msgs = list.querySelectorAll('.mode-item__meta span');
      for (var i = 0; i < msgs.length; i++) {
        var t = msgs[i].textContent.trim();
        if (t && (t.indexOf('超出给定上限') >= 0 || t.indexOf('超出可表示范围') >= 0)) {
          return t;
        }
      }
    }
    return '';
  }

  function focusFirstInvalidField() {
    var w = $('error-width');
    if (w && w.textContent.trim()) {
      var wi = $('input-width');
      if (wi) {
        wi.focus();
        scrollIntoPanel(inputPanel, wi);
      }
      return;
    }
    var h = $('error-height');
    if (h && h.textContent.trim()) {
      var hi = $('input-height');
      if (hi) {
        hi.focus();
        scrollIntoPanel(inputPanel, hi);
      }
    }
  }

  function scrollIntoPanel(panel, el) {
    if (!panel || !el) return;
    try {
      el.scrollIntoView({ block: 'nearest' });
    } catch (_) {
      /* 旧内核忽略 */
    }
  }

  /* ======================================================================
     5 · 三档响应式布局（DEC-08 / D-01 §2~§4 / IX-13）
     ====================================================================== */
  function detectTier() {
    var w = document.documentElement.clientWidth;
    if (w >= BREAKPOINT_THREE) return TIER_THREE;
    if (w > BREAKPOINT_STACKED) return TIER_TWO;
    return TIER_STACKED;
  }

  function tierLabel(t) {
    if (t === TIER_THREE) return '三栏';
    if (t === TIER_TWO) return '两栏（舞台折叠为摘要）';
    return '三面板纵向堆叠（窄窗口）';
  }

  function applyTier(next) {
    var changed = next !== tier;
    tier = next;
    layout.setAttribute('data-layout', next);

    if (changed) {
      if (next === TIER_TWO) {
        // 舞台整体折叠 → 摘要插入 C 栏顶部（EL-ST-15）
        if (stageExpanded) collapseStage();
        if (stagePanel.parentNode !== layout) layout.appendChild(stagePanel);
        stagePanel.classList.remove('is-inline');
        stagePanel.style.display = 'none';
        showStageSummary(true);
      } else {
        showStageSummary(false);
        if (stagePanel.parentNode !== layout) layout.appendChild(stagePanel);
        stagePanel.classList.remove('is-inline');
        stagePanel.style.display = '';
        stageExpanded = false;
      }
    }

    applyColumnWidths();
    positionHandles();
    applyIx13();
    syncStatusBar();
    updateStageSummary();
    text(ft.layout, tierLabel(tier));

    // 舞台几何依赖实测像素 → 档位切换后触发一次重绘（app.js 的 resize 路径）
    if (changed) window.dispatchEvent(new Event('resize'));
  }

  function applyColumnWidths() {
    layout.style.setProperty('--col-input', colInput + 'px');
    layout.style.setProperty('--col-result', colResult + 'px');
  }

  /**
   * IX-13：A 栏内容盒宽 < 300px 时，「现场参数」「演示案例」两组默认折叠。
   * 🔒 折叠状态**不持久化**（D-01 §4.2 规则 2）。
   */
  function applyIx13() {
    var contentWidth = inputPanel.clientWidth - 32;
    var narrow = contentWidth < IX13_CONTENT_MIN;
    var groups = [findGroupByLabel('现场参数'), findGroupByLabel('演示案例')];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (!g) continue;
      ensureGroupToggle(g);
      if (narrow) g.classList.add('is-collapsed');
    }
  }

  function findGroupByLabel(prefix) {
    var groups = inputPanel.querySelectorAll('.group');
    for (var i = 0; i < groups.length; i++) {
      var lbl = groups[i].querySelector('.group__label');
      if (lbl && lbl.textContent.indexOf(prefix) === 0) return groups[i];
    }
    return null;
  }

  function ensureGroupToggle(group) {
    if (group.querySelector('.group__toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'group__toggle';
    btn.setAttribute('aria-expanded', 'true');
    function sync() {
      var collapsed = group.classList.contains('is-collapsed');
      btn.textContent = collapsed ? '展开' : '折叠';
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    btn.addEventListener('click', function () {
      group.classList.toggle('is-collapsed');
      sync();
    });
    group.insertBefore(btn, group.firstChild);
    sync();
  }

  /* ======================================================================
     6 · 舞台折叠摘要（EL-ST-15 / EL-ST-16 · D-01 §3.4）
     --------------------------------------------------------------------------
     🔒 摘要的四个字段全部是既有结果的**转述**，不做任何新的比例/误差/取整运算。
     ====================================================================== */
  var stageSummary = null;
  var stageSummaryRatio = null;
  var stageSummaryBadge = null;
  var stageSummaryFit = null;
  var stageSummaryToggle = null;

  function buildStageSummary() {
    stageSummary = document.createElement('div');
    stageSummary.className = 'stage-summary';
    stageSummary.setAttribute('data-el', 'EL-ST-15');

    stageSummaryRatio = document.createElement('span');
    stageSummaryRatio.className = 'stage-summary__ratio';
    stageSummaryRatio.textContent = '— : —';

    stageSummaryBadge = document.createElement('span');
    stageSummaryBadge.className = 'status-bar__badge';

    stageSummaryFit = document.createElement('span');
    stageSummaryFit.className = 'stage-summary__fit';

    stageSummaryToggle = document.createElement('button');
    stageSummaryToggle.type = 'button';
    stageSummaryToggle.className = 'stage-summary__toggle';
    stageSummaryToggle.setAttribute('data-el', 'EL-ST-16');
    stageSummaryToggle.textContent = '展开舞台';
    stageSummaryToggle.addEventListener('click', function () {
      toggleStage();
    });

    stageSummary.appendChild(stageSummaryRatio);
    stageSummary.appendChild(stageSummaryBadge);
    stageSummary.appendChild(stageSummaryFit);
    stageSummary.appendChild(stageSummaryToggle);

    resultPanel.insertBefore(stageSummary, resultPanel.firstChild);
    stageSummary.hidden = true;
  }

  function showStageSummary(show) {
    if (!stageSummary) return;
    stageSummary.hidden = !show;
  }

  function updateStageSummary() {
    if (!stageSummary || stageSummary.hidden) return;
    var ratioEl = $('ratio-value');
    if (ratioEl) {
      var raw = ratioEl.textContent.replace(/\s+/g, '');
      stageSummaryRatio.textContent = raw && raw !== '—:—' ? raw.replace(':', ' : ') : '— : —';
    }
    mirrorBadge(stageSummaryBadge, $('result-badge'));
    stageSummaryFit.textContent = currentFitAdvice();
  }

  /**
   * 等比适配结论 —— 取 app.js 已渲染的「等比适配方案」行（既有结果转述）。
   */
  function currentFitAdvice() {
    var a = app();
    if (!a || !a.describeFit) return '';
    try {
      var dims = a.readDimensions();
      if (!dims.ok) return '';
      var target = a.resolveTargetRatio();
      var cands = a.computeCandidates(target.ratio);
      var primary = a.primaryCandidate(cands);
      var res = primary ? primary.result : null;
      if (!res || !res.ok || !res.fitAdvice || !res.fitAdvice.ok) return '';
      return '适配：' + a.describeFit(res.fitAdvice);
    } catch (_) {
      return '';
    }
  }

  function toggleStage() {
    if (tier !== TIER_TWO) return;
    if (stageExpanded) collapseStage();
    else expandStage();
  }

  function expandStage() {
    stageExpanded = true;
    stagePanel.classList.add('is-inline');
    resultPanel.insertBefore(stagePanel, stageSummary.nextSibling);
    stagePanel.style.display = '';
    stageSummaryToggle.textContent = '折叠舞台';
    window.dispatchEvent(new Event('resize'));
  }

  function collapseStage() {
    stageExpanded = false;
    stagePanel.classList.remove('is-inline');
    layout.appendChild(stagePanel);
    stagePanel.style.display = 'none';
    stageSummaryToggle.textContent = '展开舞台';
    window.dispatchEvent(new Event('resize'));
  }

  /* ======================================================================
     7 · 分栏拖拽手柄（EL-HD-07 / EL-HD-08 · F-14 · IX-08）
     ====================================================================== */
  var handleA = null;
  var handleC = null;

  function buildDragHandles() {
    handleA = document.createElement('button');
    handleA.type = 'button';
    handleA.className = 'drag-handle';
    handleA.id = 'drag-handle-a';
    handleA.setAttribute('role', 'separator');
    handleA.setAttribute('aria-orientation', 'vertical');
    handleA.setAttribute('aria-label', '调整输入栏宽度');
    handleA.setAttribute('data-el', 'EL-HD-07');

    handleC = document.createElement('button');
    handleC.type = 'button';
    handleC.className = 'drag-handle';
    handleC.id = 'drag-handle-c';
    handleC.setAttribute('role', 'separator');
    handleC.setAttribute('aria-orientation', 'vertical');
    handleC.setAttribute('aria-label', '调整结果栏宽度');
    handleC.setAttribute('data-el', 'EL-HD-08');

    layout.insertBefore(handleA, stagePanel);
    layout.insertBefore(handleC, resultPanel);

    bindHandleDrag(handleA, 'input');
    bindHandleDrag(handleC, 'result');
  }

  function bindHandleDrag(handle, which) {
    var dragging = false;
    var startX = 0;
    var startW = 0;

    on(handle, 'pointerdown', function (e) {
      if (tier === TIER_STACKED) return;
      dragging = true;
      startX = e.clientX;
      startW = which === 'input' ? colInput : colResult;
      handle.classList.add('is-dragging');
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {
        /* 忽略 */
      }
      e.preventDefault();
    });

    on(handle, 'pointermove', function (e) {
      if (!dragging) return;
      var delta = e.clientX - startX;
      if (which === 'input') colInput = clamp(startW + delta, COL_INPUT_MIN, COL_INPUT_MAX);
      else colResult = clamp(startW + delta, COL_RESULT_MIN, COL_RESULT_MAX);
      applyColumnWidths();
      positionHandles();
      syncStatusBar();
    });

    function stop(e) {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('is-dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* 忽略 */
      }
      window.dispatchEvent(new Event('resize'));
    }
    on(handle, 'pointerup', stop);
    on(handle, 'pointercancel', stop);
  }

  function positionHandles() {
    if (!layout) return;
    var lr = layout.getBoundingClientRect();
    var ir = inputPanel.getBoundingClientRect();
    if (tier === TIER_THREE) {
      var sr = stagePanel.getBoundingClientRect();
      handleA.hidden = false;
      handleC.hidden = false;
      handleA.style.left = Math.round(ir.right - lr.left) + 'px';
      handleC.style.left = Math.round(sr.right - lr.left) + 'px';
    } else if (tier === TIER_TWO) {
      handleA.hidden = false;
      handleC.hidden = true;
      handleA.style.left = Math.round(ir.right - lr.left) + 'px';
    } else {
      handleA.hidden = true;
      handleC.hidden = true;
    }
  }

  /**
   * SK-12 / IX-08：调整栏宽。
   * 🔒 三栏档调整 **C 结果栏**（D-05 SK-12 原意）；
   *    两栏档 C 为弹性列（自动占满剩余），此时调整 **A 输入栏** ——
   *    这是唯一能让"调整栏宽"产生可见效果的固定列（TK-101 记录该档位差异）。
   */
  function adjustResultColumn(dir, step) {
    if (tier === TIER_THREE) {
      colResult = clamp(colResult + dir * step, COL_RESULT_MIN, COL_RESULT_MAX);
    } else if (tier === TIER_TWO) {
      colInput = clamp(colInput - dir * step, COL_INPUT_MIN, COL_INPUT_MAX);
    } else {
      return;
    }
    applyColumnWidths();
    positionHandles();
    syncStatusBar();
    window.dispatchEvent(new Event('resize'));
  }

  function adjustColumnOfHandle(handle, dir, step) {
    if (handle === handleA) {
      colInput = clamp(colInput + dir * step, COL_INPUT_MIN, COL_INPUT_MAX);
    } else {
      colResult = clamp(colResult + dir * step, COL_RESULT_MIN, COL_RESULT_MAX);
    }
    applyColumnWidths();
    positionHandles();
    syncStatusBar();
    window.dispatchEvent(new Event('resize'));
  }

  function resetColumns() {
    colInput = COL_INPUT_DEFAULT;
    colResult = COL_RESULT_DEFAULT;
    applyColumnWidths();
    positionHandles();
    syncStatusBar();
    window.dispatchEvent(new Event('resize'));
  }

  /* ======================================================================
     8 · 复制（走 preload 白名单 IPC · SEC-10 只写不读）
     --------------------------------------------------------------------------
     🔒 载荷来源：app.js 的 buildResolutionText() / buildFullParameterText()
        （由 desktop-adapter 暴露）—— 与 HTML 版**同一个函数**，逐字一致。
     🔒 成功/失败判据来自 IPC **真实返回**（app.js 的 showCopyFeedback 由
        desktop-adapter 的 desktopCopyText 驱动），不得点击后立即虚报。
     ====================================================================== */
  function copyResolution() {
    var a = app();
    if (!a || !a.copyText || !a.buildResolutionText) return;
    var btn = $('btn-copy-resolution');
    a.copyText(a.buildResolutionText(), btn);
  }

  function copyFullParameters() {
    var a = app();
    if (!a || !a.copyText || !a.buildFullParameterText) return;
    var btn = $('btn-copy-full');
    a.copyText(a.buildFullParameterText(), btn);
  }

  /* ======================================================================
     9 · 业务动作桥（led:mode / led:reset 等）
     --------------------------------------------------------------------------
     🔒 所有动作都通过**激活界面上的真实控件**完成 → 复用 app.js 自己的
        状态机与 update()，桌面层不复制任何业务规则（DEC-02 / SEC-01）。
     ====================================================================== */
  function clickIfExists(el) {
    if (el && typeof el.click === 'function') el.click();
  }

  function setCanvasMode(mode) {
    if (!mode) return;
    clickIfExists(document.querySelector('.canvas-mode-segment[data-mode="' + mode + '"]'));
  }

  function setRatioSource(source) {
    if (!source) return;
    clickIfExists(document.querySelector('.ratio-source-segment[data-source="' + source + '"]'));
  }

  function cycleRatioSource() {
    var cur = document.querySelector('.ratio-source-segment[aria-checked="true"]');
    var order = ['screen', 'standard', 'custom'];
    var idx = cur ? order.indexOf(cur.getAttribute('data-source')) : 0;
    setRatioSource(order[(idx + 1) % order.length]);
  }

  function swapDimensions() {
    clickIfExists($('btn-swap'));
  }

  function resetDefaults() {
    clickIfExists($('btn-reset'));
  }

  /* ======================================================================
     10 · 焦点状态判定（D-05 §1）
     ====================================================================== */
  function focusState() {
    if (modalOpen) return 'D';
    var el = document.activeElement;
    if (!el || el === document.body) return 'A';
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return 'B';
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SELECT') return 'C';
    if (el.getAttribute('role') === 'radio') return 'C';
    return 'A';
  }

  function hasSelection() {
    var el = document.activeElement;
    if (!el) return false;
    if (typeof el.selectionStart === 'number') {
      return el.selectionStart !== el.selectionEnd;
    }
    return false;
  }

  function closest(el, selector) {
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  /* ======================================================================
     11 · 12 组快捷键 × 4 种焦点状态（D-05 §2 完整矩阵）
     ====================================================================== */
  function onKeyDown(e) {
    var key = e.key;
    var mod = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    var alt = e.altKey;
    var fs = focusState();

    /* ---- SK-10 Esc：四级优先级，对话框 → 警示条 → 无动作 ---- */
    if (key === 'Escape') {
      if (fs === 'D') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
        return;
      }
      if (fs === 'B') return; // 原生取消选区；**不关闭警示条**（D-05 差异 D-2）
      if (warnBarVisible()) {
        e.preventDefault();
        e.stopPropagation();
        dismissWarnBar();
      }
      return;
    }

    /* ---- FS-D：对话框打开时，除 Esc 与 Tab 焦点锁外全部失效 ---- */
    if (fs === 'D') {
      if (key === 'Tab') trapFocus(e);
      return;
    }

    /* ---- SK-11 ↑/↓ 尺寸步进（既有业务行为，不劫持 ←/→） ---- */
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      handleArrowKey(e, fs);
      return;
    }

    /* ---- SK-12 Alt+←/→ 调整栏宽 ---- */
    if (alt && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      e.preventDefault();
      if (fs === 'B') return; // FS-B 不响应（输入中改栏宽会造成布局跳动）
      adjustResultColumn(key === 'ArrowRight' ? 1 : -1, shift ? COL_STEP_FINE : COL_STEP);
      return;
    }

    /* ---- 拖拽手柄上的 ←/→（IX-08 的键盘等价，不占快捷键组） ---- */
    if (!mod && !alt && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      var handle = closest(document.activeElement, '.drag-handle');
      if (handle) {
        e.preventDefault();
        adjustColumnOfHandle(handle, key === 'ArrowRight' ? 1 : -1, shift ? COL_STEP_FINE : COL_STEP);
        return;
      }
      if (key === 'Home' || key === 'End') {
        var h2 = closest(document.activeElement, '.drag-handle');
        if (h2) {
          e.preventDefault();
          if (h2 === handleA) colInput = key === 'Home' ? COL_INPUT_MIN : COL_INPUT_MAX;
          else colResult = key === 'Home' ? COL_RESULT_MIN : COL_RESULT_MAX;
          applyColumnWidths();
          positionHandles();
          window.dispatchEvent(new Event('resize'));
          return;
        }
      }
    }

    if (!mod) return;

    /* ---- SK-01 Ctrl+1~4 切画布模式 ---- */
    if (!shift && !alt && key >= '1' && key <= '4') {
      e.preventDefault();
      if (fs === 'B') return; // 不切模式、**不插入字符**
      setCanvasMode(['width', 'height', 'preset', 'custom'][Number(key) - 1]);
      return;
    }

    /* ---- SK-02 Ctrl+Q 比例来源循环 ---- */
    if (!shift && !alt && (key === 'q' || key === 'Q')) {
      e.preventDefault();
      if (fs === 'B') return;
      cycleRatioSource();
      return;
    }

    /* ---- SK-03 Ctrl+B 宽高互换 ---- */
    if (!shift && !alt && (key === 'b' || key === 'B')) {
      e.preventDefault();
      if (fs === 'B') return;
      swapDimensions();
      return;
    }

    /* ---- SK-04 Ctrl+R 恢复默认值（**永远不得刷新窗口**） ---- */
    if (!shift && !alt && (key === 'r' || key === 'R')) {
      e.preventDefault();
      if (fs === 'B') return;
      resetDefaults();
      return;
    }

    /* ---- SK-05 Ctrl+C / SK-06 Ctrl+Shift+C 复制 ---- */
    if (!alt && (key === 'c' || key === 'C')) {
      if (shift) {
        if (fs === 'B') {
          if (hasSelection()) return; // 原生复制选区
          e.preventDefault();
          return;
        }
        e.preventDefault();
        copyFullParameters();
        return;
      }
      if (fs === 'B') {
        if (hasSelection()) return; // 原生复制选区
        e.preventDefault(); // 无选区 → 不触发工具复制
        return;
      }
      e.preventDefault();
      copyResolution();
      return;
    }

    /* ---- SK-07 Ctrl+, 设置 ---- */
    if (!shift && !alt && key === ',') {
      e.preventDefault();
      openSettingsModal(document.activeElement);
      return;
    }

    /* ---- SK-08 Ctrl+/ 快捷键帮助 ---- */
    if (!shift && !alt && key === '/') {
      e.preventDefault();
      openShortcutHelpModal(document.activeElement);
      return;
    }

    /* ---- SK-09 F1 快捷键帮助 ---- */
    if (key === 'F1') {
      e.preventDefault();
      openShortcutHelpModal(document.activeElement);
      return;
    }
  }

  /**
   * SK-11 的分控件处理。
   * 🔒 尺寸输入框内的 ↑/↓ 由 app.js 实现（app.js:1771-1795，已 preventDefault）
   *    → 本层**不劫持**，直接放行，保证既有业务行为零回退。
   */
  function handleArrowKey(e, fs) {
    var el = document.activeElement;
    if (fs === 'B') {
      // 尺寸框 → app.js 处理；其它文本框 → 原生光标移动
      return;
    }
    if (fs === 'C') {
      var group = closest(el, '[role="radiogroup"]');
      if (group) {
        e.preventDefault();
        moveRadioSelection(group, e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      var list = closest(el, '.list--scroll');
      if (list) {
        e.preventDefault();
        moveListFocus(list, e.key === 'ArrowDown' ? 1 : -1);
      }
    }
    // FS-A → 不响应
  }

  /** roving tabindex：组内用方向键切换并立即生效（IX-15 / F-06） */
  function moveRadioSelection(group, dir) {
    var items = group.querySelectorAll('[role="radio"]');
    if (!items.length) return;
    var cur = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('aria-checked') === 'true') cur = i;
    }
    var next = (cur + dir + items.length) % items.length;
    if (cur < 0) next = 0;
    items[next].focus();
    items[next].click();
  }

  /** 列表内上下移动焦点，**不自动提交**（避免误触载入） */
  function moveListFocus(list, dir) {
    var items = list.querySelectorAll('button, [tabindex]');
    if (!items.length) return;
    var cur = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i] === document.activeElement) cur = i;
    }
    var next = clamp(cur + dir, 0, items.length - 1);
    if (cur < 0) next = 0;
    items[next].focus();
  }

  /* ======================================================================
     12 · 原生对话框（设置 / 关于 / 快捷键帮助）
     --------------------------------------------------------------------------
     🔒 D-03 §5.3：全部自绘模态（Windows 原生对话框无输入框控件）。
     🔒 IX-17 焦点锁 + IX-18 焦点归还。
     ====================================================================== */
  function buildModalLayer() {
    modalLayer = document.createElement('div');
    modalLayer.className = 'modal-layer';
    modalLayer.id = 'modal-layer';
    modalLayer.hidden = true;

    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.id = 'modal-scrim';

    modalEl = document.createElement('div');
    modalEl.className = 'modal';
    modalEl.id = 'desktop-modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('aria-labelledby', 'modal-title');

    var head = document.createElement('div');
    head.className = 'modal__head';
    modalTitleEl = document.createElement('h2');
    modalTitleEl.className = 'modal__title';
    modalTitleEl.id = 'modal-title';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal__close';
    close.id = 'modal-close';
    close.setAttribute('aria-label', '关闭');
    close.textContent = '×';
    on(close, 'click', function () {
      closeModal();
    });
    head.appendChild(modalTitleEl);
    head.appendChild(close);

    modalBodyEl = document.createElement('div');
    modalBodyEl.className = 'modal__body';
    modalBodyEl.id = 'modal-body';

    modalFootEl = document.createElement('div');
    modalFootEl.className = 'modal__foot';
    modalFootEl.id = 'modal-foot';

    modalEl.appendChild(head);
    modalEl.appendChild(modalBodyEl);
    modalEl.appendChild(modalFootEl);
    modalLayer.appendChild(scrim);
    modalLayer.appendChild(modalEl);
    document.body.appendChild(modalLayer);

    on(scrim, 'click', function () {
      closeModal();
    });
  }

  function openModal(title, trigger) {
    modalTrigger = trigger && document.contains(trigger) ? trigger : null;
    text(modalTitleEl, title);
    modalLayer.hidden = false;
    modalOpen = true;
    document.body.classList.add('is-modal-open');
    // 背景失活：modal 之外的界面不可聚焦（FS-D 的模态独占定义）
    var header = document.querySelector('.app-header');
    if (header) header.setAttribute('inert', '');
    if (layout) layout.setAttribute('inert', '');
    var bar = document.querySelector('.status-bar');
    if (bar) bar.setAttribute('inert', '');
  }

  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false;
    modalLayer.hidden = true;
    document.body.classList.remove('is-modal-open');
    var header = document.querySelector('.app-header');
    if (header) header.removeAttribute('inert');
    if (layout) layout.removeAttribute('inert');
    var bar = document.querySelector('.status-bar');
    if (bar) bar.removeAttribute('inert');
    // 🔒 容差输入框搬回驻留位（否则下次打开设置对话框时已被清空）
    var tol = $('input-tolerance');
    if (tol && settingsSink && tol.parentNode !== settingsSink) {
      settingsSink.appendChild(tol);
    }
    // IX-18：焦点归还**触发元素**；触发元素不存在或不可聚焦 → 归还到 EL-IN-02
    var t = modalTrigger;
    var focusable =
      t &&
      t !== document.body &&
      t !== document.documentElement &&
      document.contains(t) &&
      typeof t.focus === 'function';
    if (focusable) {
      t.focus();
    } else {
      var w = $('input-width');
      if (w) w.focus();
    }
    modalTrigger = null;
  }

  function modalFocusables() {
    if (!modalEl) return [];
    return Array.prototype.slice.call(
      modalEl.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function trapFocus(e) {
    var f = modalFocusables();
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---- 设置对话框（EL-STB-01~04） ---- */
  /**
   * 🔒 容差输入框必须**搬进模态**才可见可聚焦：
   *    HTML 版的 #settings-panel 在桌面版是隐藏浮层（app.css display:none），
   *    输入框留在里面 → 不可见、无法聚焦、无法校验。
   *    搬迁保持元素同一性 → app.js 的 els.toleranceInput 引用与「即时生效」
   *    逻辑（app.js:1731-1738）完全不变。
   */
  var settingsSink = null;
  var toleranceWired = false;

  function ensureSettingsSink() {
    if (settingsSink) return settingsSink;
    settingsSink = document.createElement('div');
    settingsSink.id = 'desktop-settings-sink';
    settingsSink.style.display = 'none';
    document.body.appendChild(settingsSink);
    var input = $('input-tolerance');
    var panel = $('settings-panel');
    if (input && panel) {
      panel.appendChild(input);
      settingsSink.appendChild(input);
    }
    return settingsSink;
  }

  function openSettingsModal(trigger) {
    if (modalOpen) return;
    ensureSettingsSink();
    modalBodyEl.textContent = '';
    modalFootEl.textContent = '';

    var row = document.createElement('div');
    row.className = 'settings-row';
    var label = document.createElement('label');
    label.className = 'group__label';
    label.setAttribute('for', 'input-tolerance');
    label.textContent = '匹配容差百分比';
    var input = $('input-tolerance');
    if (input) {
      input.classList.add('input', 'settings-input');
      input.removeAttribute('style');
    }
    row.appendChild(label);
    if (input) row.appendChild(input);

    var hint = document.createElement('p');
    hint.className = 'hint settings-hint';
    hint.textContent = '容差用于判定实际比例是否算作常见标准画幅，判定结果同时影响「非标准比例」提示。设置保存在本机（%APPDATA%/LED Ratio Tool/settings.json）。';

    var err = document.createElement('p');
    err.className = 'settings-error';
    err.id = 'settings-error';

    modalBodyEl.appendChild(row);
    modalBodyEl.appendChild(hint);
    modalBodyEl.appendChild(err);

    if (input && !toleranceWired) {
      toleranceWired = true;
      on(input, 'input', function () {
        var v = Number(String(input.value).trim());
        if (!String(input.value).trim() || !isFinite(v) || v <= 0) {
          text(err, '容差需大于 0（本次输入不生效，保留上次有效值）');
          input.setAttribute('aria-invalid', 'true');
        } else {
          text(err, '');
          input.removeAttribute('aria-invalid');
        }
      });
    } else if (input) {
      text(err, '');
      input.removeAttribute('aria-invalid');
    }

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn';
    ok.textContent = '确定';
    on(ok, 'click', function () {
      closeModal();
    });
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost';
    cancel.textContent = '关闭';
    on(cancel, 'click', function () {
      closeModal();
    });
    modalFootEl.appendChild(cancel);
    modalFootEl.appendChild(ok);

    openModal('设置', trigger);
    if (input) {
      input.focus();
      try {
        input.select();
      } catch (_) {
        /* 忽略 */
      }
    }
  }

  /* ---- 关于对话框（EL-MD-01 · DEC-13 三线版本） ---- */
  function openAboutModal(trigger) {
    if (modalOpen) return;
    modalBodyEl.textContent = '';
    modalFootEl.textContent = '';

    var list = document.createElement('div');
    list.className = 'about-list';

    function row(k, v) {
      var kk = document.createElement('div');
      kk.className = 'about-list__k';
      kk.textContent = k;
      var vv = document.createElement('div');
      vv.className = 'about-list__v';
      vv.textContent = v;
      list.appendChild(kk);
      list.appendChild(vv);
    }

    var v = versionData || {};
    row('应用名称', 'LED 比例换算台');
    row('桌面版本', v.version || '—');
    row('计算内核', v.coreVersion || '—');
    row('HTML 版', v.htmlVersion || '—');
    row('Electron', v.electron || '—');
    row('Chromium', v.chrome || '—');
    row('Node', v.node || '—');
    row('构建时间', v.buildTime || '—');
    row('应用标识', 'com.ledratiotool.desktop');

    var note = document.createElement('p');
    note.className = 'hint';
    note.style.marginTop = 'var(--space-4)';
    note.textContent = '桌面版与 HTML 版共用同一份计算内核（core.js），计算结果逐字一致；HTML 版永久保留，可作为离线备份。';

    modalBodyEl.appendChild(list);
    modalBodyEl.appendChild(note);

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn';
    ok.textContent = '关闭';
    on(ok, 'click', function () {
      closeModal();
    });
    modalFootEl.appendChild(ok);

    openModal('关于', trigger);
    var closeBtn = $('modal-close');
    if (closeBtn) closeBtn.focus();
  }

  /* ---- 快捷键帮助（EL-MD-02 · D-05 §2 的 12 × 4 矩阵） ---- */
  var SHORTCUT_ROWS = [
    ['SK-01', 'Ctrl+1 / 2 / 3 / 4', '切画布模式：按宽/按高/常用规格/整数倍',
      '执行', '不响应', '执行', '不响应'],
    ['SK-02', 'Ctrl+Q', '比例来源循环：屏幕实际→标准→自定义',
      '执行', '不响应', '执行', '不响应'],
    ['SK-03', 'Ctrl+B', '宽高互换',
      '执行', '不响应', '执行', '不响应'],
    ['SK-04', 'Ctrl+R', '恢复默认值（不会刷新窗口）',
      '执行', '不响应', '执行', '不响应'],
    ['SK-05', 'Ctrl+C', '复制分辨率（宽×高，无千分位）',
      '执行', '原生：有选区才复制', '执行', '不响应'],
    ['SK-06', 'Ctrl+Shift+C', '复制完整参数（14 段）',
      '执行', '原生：有选区才复制', '执行', '不响应'],
    ['SK-07', 'Ctrl+,', '打开设置对话框',
      '执行', '执行', '执行', '不响应'],
    ['SK-08', 'Ctrl+/', '打开快捷键帮助',
      '执行', '执行', '执行', '不响应'],
    ['SK-09', 'F1', '打开快捷键帮助',
      '执行', '执行', '执行', '不响应'],
    ['SK-10', 'Esc', '关闭对话框 → 关闭警示条',
      '关闭警示条', '原生取消选区', '关闭警示条', '关闭对话框'],
    ['SK-11', '↑ / ↓（Shift=×10）', '尺寸步进（既有业务行为）',
      '不响应', '尺寸框步进/其它原生', '分段切换/列表移动', '不响应'],
    ['SK-12', 'Alt+← / →（Shift=±2px）', '调整结果栏宽度（三栏档）/ 输入栏宽度（两栏档）',
      '执行', '不响应', '执行', '不响应'],
  ];

  function openShortcutHelpModal(trigger) {
    if (modalOpen) return;
    modalBodyEl.textContent = '';
    modalFootEl.textContent = '';

    var table = document.createElement('table');
    table.className = 'shortcut-table';
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    ['编号', '快捷键', '动作', '普通焦点', '输入框聚焦', '交互控件聚焦', '对话框打开'].forEach(function (h) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var i = 0; i < SHORTCUT_ROWS.length; i++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < SHORTCUT_ROWS[i].length; c++) {
        var td = document.createElement('td');
        td.textContent = SHORTCUT_ROWS[i][c];
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.style.marginTop = 'var(--space-3)';
    hint.textContent = '说明：「普通焦点」= 焦点在面板空白区；「输入框聚焦」= 焦点在文本输入框；「交互控件聚焦」= 焦点在分段按钮/列表项/开关；「对话框打开」= 模态独占，除 Esc 外全部失效。文本编辑语义绝对优先 —— 输入框内的 Ctrl+C / Ctrl+X / Ctrl+V / 方向键均不被劫持。';

    modalBodyEl.appendChild(table);
    modalBodyEl.appendChild(hint);

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn';
    ok.textContent = '关闭';
    on(ok, 'click', function () {
      closeModal();
    });
    modalFootEl.appendChild(ok);

    openModal('快捷键帮助（12 组）', trigger);
    var closeBtn = $('modal-close');
    if (closeBtn) closeBtn.focus();
  }

  /* ======================================================================
     13 · 警示条（D-02 §4.3 优先级 2）
     ====================================================================== */
  function warnBarVisible() {
    var bar = $('warn-bar');
    return !!(bar && bar.style.display !== 'none');
  }

  function dismissWarnBar() {
    clickIfExists($('btn-warn-close'));
  }

  /* ======================================================================
     14 · 版本（三线版本 · 唯一来源 = IPC app:v1:app.version）
     ====================================================================== */
  function loadVersion() {
    if (!api || !api.appVersion) return Promise.resolve(null);
    return api
      .appVersion()
      .then(function (r) {
        if (r && r.code === 0 && r.data) {
          versionData = r.data;
          return versionData;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  /* ======================================================================
     15 · 菜单命令入口（main/menu.js 通过 executeJavaScript 调此函数）
     --------------------------------------------------------------------------
     🔒 SEC-07：菜单动作不新增 IPC 通道 —— 走 window.__desktopMenu
     🔒 命令名与 main/menu.js 的 COMMANDS 一一对应。
     ====================================================================== */
  window.__desktopMenu = function (command) {
    switch (command) {
      case 'menu:copy-resolution':
        copyResolution();
        return;
      case 'menu:copy-full-parameters':
        copyFullParameters();
        return;
      case 'menu:open-settings':
        openSettingsModal(document.activeElement);
        return;
      case 'menu:swap':
        swapDimensions();
        return;
      case 'menu:reset-defaults':
        resetDefaults();
        return;
      case 'menu:mode-width':
      case 'menu:mode-height':
      case 'menu:mode-preset':
      case 'menu:mode-custom':
        // 🔒 通过业务事件派发 → 由下方监听器执行（app.js 不监听自定义事件）
        window.dispatchEvent(
          new CustomEvent('led:mode', {
            detail: { mode: command.replace('menu:mode-', '') },
          })
        );
        return;
      case 'menu:cycle-ratio-source':
        cycleRatioSource();
        return;
      case 'menu:toggle-stage':
        toggleStage();
        return;
      case 'menu:reset-columns':
        resetColumns();
        return;
      case 'menu:shortcut-help':
        openShortcutHelpModal(document.activeElement);
        return;
      case 'menu:about':
        openAboutModal(document.activeElement);
        return;
      default:
        return;
    }
  };

  /**
   * 菜单状态查询（主进程用于置灰不可用项，D-05 §4）。
   * 🔒 只读查询，不新增 IPC 通道。
   */
  window.__desktopMenuState = function () {
    var a = app();
    var canCopyResolution = false;
    var canCopyFull = false;
    try {
      if (a && a.buildResolutionText) canCopyResolution = !!a.buildResolutionText();
      if (a && a.buildFullParameterText) canCopyFull = !!a.buildFullParameterText();
    } catch (_) {
      /* 载荷不可生成 → 置灰 */
    }
    return {
      canCopyResolution: canCopyResolution,
      canCopyFull: canCopyFull,
      canToggleStage: tier === TIER_TWO,
      layoutLabel: tierLabel(tier),
      tier: tier,
    };
  };

  /* ======================================================================
     16 · 业务事件监听（led:mode / led:reset）
     --------------------------------------------------------------------------
     🔒 app.js **不**监听这两个自定义事件 → 若无此监听器，菜单的
        「切换画布模式」「恢复默认值」实际无效（本轮修复的缺陷之一）。
     ====================================================================== */
  on(window, 'led:mode', function (e) {
    var mode = e && e.detail ? e.detail.mode : null;
    if (mode) setCanvasMode(mode);
  });

  on(window, 'led:reset', function () {
    resetDefaults();
  });

  /* ======================================================================
     17 · 观察器：状态栏同步 + roving tabindex
     ====================================================================== */
  function installObservers() {
    if (typeof MutationObserver !== 'function') return;

    var watched = [
      $('ratio-value'),
      $('res-value'),
      $('core-note'),
      $('error-width'),
      $('error-height'),
      $('unit-width'),
      $('warn-bar'),
      $('live-feedback'),
      $('result-badge'),
      $('candidate-list'),
    ];
    var obs = new MutationObserver(function () {
      syncStatusBar();
      updateStageSummary();
    });
    for (var i = 0; i < watched.length; i++) {
      if (watched[i]) {
        obs.observe(watched[i], {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
      }
    }

    // roving tabindex（F-06 / IX-15）
    var groups = document.querySelectorAll('[role="radiogroup"]');
    for (var g = 0; g < groups.length; g++) {
      (function (group) {
        var o = new MutationObserver(function () {
          applyRovingTabindex(group);
        });
        o.observe(group, {
          attributes: true,
          attributeFilter: ['aria-checked'],
          subtree: true,
        });
        applyRovingTabindex(group);
      })(groups[g]);
    }
  }

  /**
   * roving tabindex：整组只占 1 个 Tab 位，落在当前 aria-checked="true" 的项上。
   */
  function applyRovingTabindex(group) {
    var items = group.querySelectorAll('[role="radio"]');
    if (!items.length) return;
    var checked = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('aria-checked') === 'true') checked = items[i];
    }
    if (!checked) checked = items[0];
    for (var j = 0; j < items.length; j++) {
      items[j].setAttribute('tabindex', items[j] === checked ? '0' : '-1');
    }
  }

  /* ======================================================================
     18 · 初始化
     ====================================================================== */
  function init() {
    if (!buildShell()) return;
    ensureSettingsSink();

    on(document, 'keydown', onKeyDown, true);

    // 尺寸变更 → 档位判定（rAF 节流，同帧合并）
    var resizeFrame = 0;
    on(window, 'resize', function () {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(function () {
        resizeFrame = 0;
        applyTier(detectTier());
      });
    });

    installObservers();
    loadVersion();

    // 首次落档（changed = true → 执行进入档位的过渡）
    applyTier(detectTier());
    syncStatusBar();
    updateStageSummary();
    positionHandles();
    applyIx13();

    // 启动焦点落 EL-IN-02（D-02 §3.1 F-01）
    var w = $('input-width');
    if (w) {
      try {
        w.focus({ preventScroll: true });
      } catch (_) {
        w.focus();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
