/**
 * LED-ratio-Tool 桌面版 · 渲染层适配补丁
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   P3-BASELINE §6 —— 复制必须走 preload 白名单 IPC 剪贴板接口
 *   SEC-10         —— 剪贴板只写不读；renderer 不得使用 navigator.clipboard
 *   PS-01          —— 匹配容差持久化到 settings.json（经 IPC）
 *   DEC-11         —— app:// 是安全上下文，localStorage 可用，但统一走 IPC 更可控
 *
 * 🔒 本补丁只做适配，绝不改动仓库源文件的业务逻辑：
 *   ① 持久化：localStorage 读写 → ledApi.settingsGet / settingsSet
 *   ② 剪贴板：navigator.clipboard / legacyCopy → ledApi.clipboardWriteText
 *   ③ 复制反馈：**已上移到 src/app.js**（TK-101 · Step 6 第 2 阶段）——
 *        原版 HTML 的 showCopyFeedback 已改为「复原时写回各自原始标签」，
 *        桌面版直接继承该修复，**不再需要**适配器补丁（单一实现，避免两份逻辑漂移）
 *   ④ 能力暴露：把 app.js 的内部函数挂到 LedApp 上，供桌面交互层**复用**
 *      —— 复制载荷与 HTML 版逐字一致的唯一可靠做法（不重复实现任何计算）
 *   ⑤ 步进按钮 data-glyph 注入（index.html 副本）
 *   ⑥ PX 输入单位（v1.2.0 桌面专属）：UNIT_SPEC 增 px 档 + 单位按钮注入
 *   ⑦ **P 值 / 真实 PX 换算（v1.3.0）**：移除 1 px = 1 mm 假设
 *      —— 维度解析交给桌面专属纯模块 renderer/led-pitch.js；
 *         物理尺寸与像素分辨率语义分离；物理↔px 切换读取全局 P 值；
 *         未配置 P 时禁止换算并给出明确提示；px→物理不反算、不覆盖原物理尺寸。
 *      全部补丁只作用于**桌面副本**（DEC-03：HTML 版零回灌）。
 *
 * 🔒 应用方式：由 build/sync-assets.mjs 在同步 app.js 之后应用，
 *    **不修改仓库源文件**（DEC-03：HTML 版零回灌）。
 *    src/core.js 哈希锁、src/app.js、根 index.html 均零改动。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * 持久化适配：把 loadSettings / saveSettings 的 localStorage 换成 IPC。
 * 保留原有的「静默降级」语义（写入失败静默忽略，不阻断启动）。
 */
const PERSIST_PATCH = `/* ---- desktop-adapter: persistence → IPC ---- */
  function desktopApplySettings(data) {
    if (!data) return;
    if (typeof data.tolerancePercent !== 'number') return;
    state.tolerancePercent = data.tolerancePercent;
    var t = document.getElementById('input-tolerance');
    if (t) t.value = String(data.tolerancePercent);
    /* v1.3.0：P 值从既有 settings.get 载荷读取，字段缺失 = 未配置（null），
       绝不默认 P2.5；不改动容差的任何既有行为。 */
    if (globalThis.LedPitch) {
      globalThis.LedPitch.setPitch(
        Object.prototype.hasOwnProperty.call(data, 'pixelPitchMm') ? data.pixelPitchMm : null
      );
      globalThis.LedPitch.setActiveUnit(state.unit);
      globalThis.dispatchEvent(new CustomEvent('led:pitch', { detail: { source: 'settings' } }));
    }
  }
  function desktopLoadSettings() {
    if (!window.ledApi || !window.ledApi.settingsGet) return;
    try {
      var r = window.ledApi.settingsGet();
      // 🔴 preload 的 settingsGet 是 ipcRenderer.invoke，返回 \u002a\u002aPromise\u002a\u002a 而不是对象。
      //    早期实现直接判断 r.code === 0 → 判据恒为假，**持久化设置永远不生效**：
      //    P7-5 实测 settings.json 里已是 1.75，重启后输入框仍是默认 0.5。
      //    此处同时兼容「同步返回」与「Promise」两种形态，避免再次回归。
      if (r && typeof r.then === 'function') {
        r.then(function (res) {
          if (res && res.code === 0 && res.data) desktopApplySettings(res.data);
        }).catch(function () { /* 读取失败静默降级为默认值 */ });
      } else if (r && r.code === 0 && r.data) {
        desktopApplySettings(r.data);
      }
    } catch (e) { /* 静默降级为默认值 */ }
  }
  function desktopSaveSettings() {
    if (!window.ledApi || !window.ledApi.settingsSet) return;
    try {
      var lp = globalThis.LedPitch;
      var r = window.ledApi.settingsSet({
        tolerancePercent: state.tolerancePercent,
        // v1.3.0：在既有 settings.set 载荷内增 1 个可选字段；通道与 preload 接口不变。
        // 未配置时为 null → settings-store 不落盘该键，settings.json 仍是原有 4 键形态。
        pixelPitchMm: lp ? lp.getPitch().value : null
      });
      if (r && r.code !== 0) { /* 写入失败静默忽略，本次会话内仍生效 */ }
    } catch (e) { /* 同上 */ }
  }
  /* P 值变更后，若当前 px 值来自「由物理尺寸换算」，按新 P 重新换算显示值；
     若用户直接输入过 px，则此处不得调用，真实像素值保持原样。 */
  function desktopSetDimensionText(w, h) {
    if (globalThis.LedPitch) globalThis.LedPitch.markPxConverted(w, h);
    state.widthText = String(w);
    state.heightText = String(h);
    var iw = document.getElementById('input-width');
    var ih = document.getElementById('input-height');
    if (iw) iw.value = state.widthText;
    if (ih) ih.value = state.heightText;
    update();
  }
`;

/**
 * 剪贴板适配：走 preload 白名单 IPC，失败不降级到 execCommand
 * （Electron 下 execCommand 不可靠，且 SEC-10 要求只写不读）。
 */
const CLIPBOARD_PATCH = `/* ---- desktop-adapter: clipboard → IPC ---- */
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
`;


/**
 * 能力暴露适配：把 app.js 的内部函数挂到 LedApp 导出对象上。
 *
 * 🔒 为什么需要：任务书要求「完整参数文本必须与 src/app.js:1450 的
 *    buildFullParameterText() 逐项核对 —— 字段、顺序、名称、空值规则完全一致」。
 *    而 buildFullParameterText / buildResolutionText / copyText 都是 app.js
 *    IIFE 内的私有函数，桌面版**无法直接调用**。
 * 🔒 三条可选路径的比较：
 *    A. 在桌面层重写一份 → 必然出现字段/顺序漂移，且重复实现计算 → 违反红线
 *    B. 修改仓库 src/app.js → 受保护对象，禁止
 *    C. 在桌面副本上暴露内部函数 → 载荷**按构造逐字一致**，且不重复任何计算 ✅
 * 🔒 暴露的是**既有函数本身**（其内部仍全部调用 core.js），
 *    不新增任何计算、不改变任何业务规则（DEC-02 / A-01~A-08 不动）。
 */
const EXPORTS_PATCH = `/* ---- desktop-adapter: expose internals for the desktop interaction layer ---- */
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
    defaultTolerancePercent: Core.DEFAULT_TOLERANCE_PERCENT,
    // v1.3.0 桌面专属适配入口（不涉及任何新计算，只是复用既有状态/更新链路）
    refresh: update,
    setDimensionText: desktopSetDimensionText,
    persistSettings: desktopSaveSettings,
    changeUnit: changeUnit
  };
`;


/**
 * ③ 步进按钮命中区适配：为按钮注入 data-glyph
 *
 * 🔴 P4-B 缺陷 DEF-02 的配套改动。
 * 根目录 index.html 是**受保护对象**（用户明确要求不得为桌面版方便而修改
 * 原版 HTML），因此不能在那里加属性。
 *
 * 桌面版把步进按钮改为「实体 32×32 命中区 + ::before 绘制 24×24 视觉符号」
 * （见 app.css）。::before 的 content 取自 attr(data-glyph)，
 * 因此桌面副本的按钮上必须有 data-glyph 属性。
 *
 * 做法：同步 index.html 后，对**桌面副本**注入 data-glyph，
 * 并把原文字内容清空（避免重复渲染）。
 * 仓库源文件零改动。
 */
const GLYPH_MAP = [
  { id: 'step-width-minus', glyph: '−' },
  { id: 'step-width-plus', glyph: '+' },
  { id: 'step-height-minus', glyph: '−' },
  { id: 'step-height-plus', glyph: '+' },
];

/**
 * ⑦ P 值 / 真实 PX 换算适配（桌面版专属 · v1.3.0 · 2026-11-05）
 *
 * 🔴 移除 v1.2.0 的「1 px = 1 mm」假设：
 *    物理尺寸（m/cm/mm）与像素分辨率（px）是**两种不同语义**。
 *    px 输入作为真实像素数量处理，绝不覆盖物理尺寸字段；
 *    物理尺寸 ↔ px 切换一律经全局 P 值换算（renderer/led-pitch.js）。
 *
 * 🔒 边界（任务书 §8，逐条核对）：
 *   · **不修改** `src/core.js`（哈希锁保护）/ `src/app.js` / 根 `index.html`；
 *   · 全部补丁只作用于**桌面副本**（DEC-03：HTML 版 1.0.1 零回灌）；
 *   · 不改 appId / IPC 通道 / preload 暴露接口 / 用户数据目录 / 安全策略；
 *   · 新计算全部在桌面专属纯模块 `led-pitch.js`，本补丁只做「接线」。
 *
 * 🔴 换算规则：
 *    theoreticalWidthPx = physicalWidthMm / pixelPitchMm（高同理），
 *    整数估算 Math.round，连续值与取整误差同时保留。
 *    未配置 P → 禁止物理↔px 换算并给出明确提示；
 *    px → m/cm/mm → 恢复原始物理尺寸，不反算、不覆盖；
 *    px 直接输入的值不因 P 值变化被篡改。
 *
 * 应用点：
 *   A. app.js 副本 —— UNIT_SPEC 增 px 档；注入 DESKTOP_PARSE() 维度解析；
 *      7 处 `Core.parseDimension(…, state.unit)` 改为 DESKTOP_PARSE(..., axis)；
 *      readDimensions() 增加显式语义字段；changeUnit() 增加 P 值换算分支；
 *   B. index.html 副本 —— 注入 `led-pitch.js`（core.js 之前）与 px 单位按钮，
 *      并把 FAQ 中「物理尺寸不能推出分辨率」补上 v1.3.0 理论估算的边界说明。
 */
const PITCH_UNIT_SPEC_ANCHOR = `  var UNIT_SPEC = {
    m: { step: 0.1, digits: 3, label: 'm' },
    cm: { step: 1, digits: 3, label: 'cm' },
    mm: { step: 10, digits: 1, label: 'mm' }
  };`;
const PITCH_UNIT_SPEC_PATCH = `  /* ---- desktop-adapter: pitch-unit (v1.3.0) ----
     🔴 v1.2.0 的 "1 px = 1 mm" 假设已移除。
     物理尺寸与像素分辨率是两种不同语义：
       · physicalWidthMm / physicalHeightMm 只由 m/cm/mm 输入写入；
       · resolutionWidthPx / resolutionHeightPx 只由 px 输入写入；
       · 物理 ↔ px 切换一律经全局 P 值换算，未配置 P 时禁止换算。
     app.js 既有的 widthMm / heightMm 只是无量纲比例链路的载体，
     在 px 模式下承载像素数用于比例计算，绝不写回物理尺寸字段。 */
  function DESKTOP_PARSE(text, unit, axis) {
    var lp = globalThis.LedPitch;
    if (unit === 'px') {
      if (!lp) return { ok: false, mm: null, px: null, value: null, error: 'unit', message: '像素解析模块未加载' };
      var p = lp.parsePixelCount(text);
      if (p.ok && (axis === 'width' || axis === 'height')) lp.recordResolutionPx(axis, p.px);
      return p;
    }
    var d = Core.parseDimension(text, unit);
    if (d.ok && lp && (axis === 'width' || axis === 'height')) lp.recordPhysicalMm(axis, d.mm);
    return d;
  }
  var UNIT_SPEC = {
    m: { step: 0.1, digits: 3, label: 'm' },
    cm: { step: 1, digits: 3, label: 'cm' },
    mm: { step: 10, digits: 1, label: 'mm' },
    px: { step: 1, digits: 0, label: 'px' }
  };`;

/** 7 处 core 维度调用点 → DESKTOP_PARSE（4 种形态，计数断言保证锚点不漂移） */
const PITCH_CALL_REWRITES = [
  ['Core.parseDimension(state.widthText, state.unit)', "DESKTOP_PARSE(state.widthText, state.unit, 'width')", 2],
  ['Core.parseDimension(state.heightText, state.unit)', "DESKTOP_PARSE(state.heightText, state.unit, 'height')", 2],
  ['Core.parseDimension(text, state.unit)', "DESKTOP_PARSE(text, state.unit, 'dimension')", 1],
  ['Core.parseDimension(newText, state.unit)', "DESKTOP_PARSE(newText, state.unit, 'dimension')", 2],
];

/** readDimensions()：在既有返回结构上增加显式数据语义字段（不改既有 6 个字段） */
const PITCH_READ_DIMS_ANCHOR = `  function readDimensions() {
    var w = Core.parseDimension(state.widthText, state.unit);
    var h = Core.parseDimension(state.heightText, state.unit);
    return {
      ok: w.ok && h.ok,
      widthMm: w.ok ? w.mm : null,
      heightMm: h.ok ? h.mm : null,
      widthError: w.ok ? '' : describeError(w),
      heightError: h.ok ? '' : describeError(h)
    };
  }`;
const PITCH_READ_DIMS_PATCH = `  function readDimensions() {
    var w = Core.parseDimension(state.widthText, state.unit);
    var h = Core.parseDimension(state.heightText, state.unit);
    var lp = globalThis.LedPitch;
    var snap = lp ? lp.snapshot() : null;
    return {
      ok: w.ok && h.ok,
      widthMm: w.ok ? w.mm : null,
      heightMm: h.ok ? h.mm : null,
      widthError: w.ok ? '' : describeError(w),
      heightError: h.ok ? '' : describeError(h),
      /* v1.3.0 显式语义：物理尺寸 / 像素分辨率 / P 值分离，绝不互相覆盖 */
      physicalWidthMm: snap ? snap.physicalWidthMm : null,
      physicalHeightMm: snap ? snap.physicalHeightMm : null,
      resolutionWidthPx: snap ? snap.resolutionWidthPx : null,
      resolutionHeightPx: snap ? snap.resolutionHeightPx : null,
      pixelPitchMm: snap ? snap.pixelPitchMm : null,
      activeUnit: state.unit,
      dimensionSemantic: state.unit === 'px' ? 'resolution' : 'physical'
    };
  }`;

/** changeUnit()：物理 ↔ px 走 P 值换算；px → 物理恢复原始尺寸、不反算 */
const PITCH_CHANGE_UNIT_ANCHOR = `  function changeUnit(next) {
    var dims = readDimensions();
    if (dims.ok) {
      state.widthMm = dims.widthMm;
      state.heightMm = dims.heightMm;
      state.widthText = formatMm(dims.widthMm, next);
      state.heightText = formatMm(dims.heightMm, next);
    }
    state.unit = next;
    update();
  }`;
const PITCH_CHANGE_UNIT_PATCH = `  function changeUnit(next) {
    var lp = globalThis.LedPitch;
    var prev = state.unit;
    if (lp && prev === 'px' && next !== 'px') {
      /* px → m/cm/mm：恢复进入 px 前保存的原始物理尺寸，绝不反算、绝不覆盖。 */
      var phys = lp.getPhysical();
      if (phys.ok) {
        state.widthText = formatMm(phys.widthMm, next);
        state.heightText = formatMm(phys.heightMm, next);
        state.widthMm = phys.widthMm;
        state.heightMm = phys.heightMm;
      }
      lp.setActiveUnit(next);
      lp.clearNotice();
      state.unit = next;
      update();
      return;
    }
    if (lp && prev !== 'px' && next === 'px') {
      /* 物理 → px：必须读取全局 P；未配置则禁止换算并给出明确提示。 */
      var d0 = readDimensions();
      var pitch = lp.getPitch();
      if (pitch.unconfigured || pitch.value === null) {
        lp.setNotice('未配置 LED 像素间距 P：已禁止物理尺寸 → 像素分辨率换算。可直接输入真实像素数量；原始物理尺寸保持不变。');
        state.widthText = '';
        state.heightText = '';
        lp.setActiveUnit('px');
        lp.markPxDirect();
        state.unit = 'px';
        update();
        return;
      }
      if (d0.ok) {
        var est = lp.physicalToPixels(d0.widthMm, d0.heightMm, pitch.value);
        if (est.ok) {
          state.widthText = String(est.integerWidthPx);
          state.heightText = String(est.integerHeightPx);
          lp.markPxConverted(est.integerWidthPx, est.integerHeightPx);
        }
      }
      lp.clearNotice();
      lp.setActiveUnit('px');
      state.unit = 'px';
      update();
      return;
    }
    /* m/cm/mm 之间：沿用 v1.2.0 原有换算逻辑，物理尺寸不变、只换显示值。 */
    var dims = readDimensions();
    if (dims.ok) {
      state.widthMm = dims.widthMm;
      state.heightMm = dims.heightMm;
      state.widthText = formatMm(dims.widthMm, next);
      state.heightText = formatMm(dims.heightMm, next);
    }
    if (lp) { lp.setActiveUnit(next); lp.clearNotice(); }
    state.unit = next;
    update();
  }`;

/**
 * ⑥-C px 模式语义文案（桌面副本条件化）。
 * 🔴 px 输入**不代表** LED 屏的实际物理尺寸（像素间距未知），
 *    原「实际物理尺寸 / 屏幕实际尺寸」说法在 px 模式下会误导用户
 *    把像素输入当成物理尺寸。px 模式下改为「输入尺寸 / 输入像素尺寸」；
 *    m/cm/mm 模式文案逐字不变（EV-B03 复制载荷对照不受影响）。
 *    提示语的整段切换由 desktop-ui.js 承担（DOM 层，见其 px 提示块）。
 */
const PX_LABEL_REWRITES = [
  // ① 结果表首行行名（src/app.js:619）
  ["      name: '实际物理尺寸',", "      name: (state.unit === 'px' ? '输入尺寸' : '实际物理尺寸'),", 1],
  // ② core-note（src/app.js:585，结果面板说明行）
  // 🔒 `to` 以闭括号收尾、**不追加 `+`** —— 原句余式自带 ` + formatMm(...)`，
  //    若再补 `+` 会拼成 `+ + formatMm(...)`（一元正号），formatMm 返回 '' 时
  //    会被 Number 化为 0，破坏显示语义（v1 注入缺陷，已修正并纳入 skipped 断言）。
  ["    parts.push('屏幕实际尺寸 '", "    parts.push((state.unit === 'px' ? '输入像素尺寸 ' : '屏幕实际尺寸 ')", 1],
  // ③ 复制完整参数首段（src/app.js:1506）
  ["    lines.push('屏幕实际尺寸：'", "    lines.push((state.unit === 'px' ? '输入尺寸：' : '屏幕实际尺寸：')", 1],
];

/** px 按钮注入锚点：mm 按钮整行 */
const PX_BUTTON_ANCHOR = `<button type="button" class="segmented__item unit-segment" data-unit="mm" role="radio" aria-checked="false">mm</button>`;
const PX_BUTTON_HTML = `<button type="button" class="segmented__item unit-segment" data-unit="px" role="radio" aria-checked="false" title="按真实像素分辨率输入；物理尺寸 ↔ px 切换需按全局 LED 像素间距 P 换算，未配置 P 时禁止换算">px</button>`;

/** 桌面专属计算模块注入锚点：core.js 脚本标签（sync 已把 src/ 前缀重写） */
const PITCH_SCRIPT_ANCHOR = '<script src="core.js"></script>';
const PITCH_SCRIPT_HTML = '<script src="led-pitch.js"></script>\n<script src="core.js"></script>';

/** FAQ：v1.3.0 追加「理论估算 ≠ 已确认分辨率」边界（仅桌面副本） */
const FAQ_ANCHOR = 'Q：物理尺寸能推出原生像素分辨率吗？<br>A：不能。物理尺寸只决定比例，像素分辨率由 LED 箱体数量、控制系统与播放服务器共同决定，需现场确认。';
const FAQ_PATCH = 'Q：物理尺寸能推出原生像素分辨率吗？<br>A：不能由物理尺寸单独确认。v1.3.0 的 P 值估算只是理论值，不等于控制器已确认的输入分辨率；实际像素分辨率仍由 LED 箱体数量、控制系统与播放服务器共同决定，需现场确认。';

/**
 * ⑦-A 对同步后的 app.js 桌面副本应用 P 值 / 真实 PX 换算补丁。
 * 顺序：UNIT_SPEC → readDimensions → 7 处调用点 → 文案 → changeUnit。
 * 任一锚点不匹配都进 skipped，由 sync-assets.mjs 置 exitCode=1。
 */
function applyPitchUnitToApp(src, applied, skipped) {
  if (src.includes('desktop-adapter: pitch-unit')) {
    applied.push('pitch-unit（已应用，跳过）');
    return src;
  }
  if (!src.includes(PITCH_UNIT_SPEC_ANCHOR)) {
    skipped.push('pitch-unit:UNIT_SPEC');
    return src;
  }
  let out = src.replace(PITCH_UNIT_SPEC_ANCHOR, PITCH_UNIT_SPEC_PATCH);
  let allOk = true;

  const blockRewrites = [
    [PITCH_READ_DIMS_ANCHOR, PITCH_READ_DIMS_PATCH, 'pitch-unit:readDimensions'],
    [PITCH_CHANGE_UNIT_ANCHOR, PITCH_CHANGE_UNIT_PATCH, 'pitch-unit:changeUnit'],
  ];
  for (const [from, to, label] of blockRewrites) {
    const count = out.split(from).length - 1;
    if (count !== 1) {
      skipped.push(`${label} 期望 1 处、实测 ${count} 处`);
      allOk = false;
      continue;
    }
    out = out.split(from).join(to);
  }
  for (const [from, to, expect] of PITCH_CALL_REWRITES) {
    const count = out.split(from).length - 1;
    if (count !== expect) {
      skipped.push(`pitch-unit:调用点 "${from}" 期望 ${expect} 处、实测 ${count} 处`);
      allOk = false;
      continue;
    }
    out = out.split(from).join(to);
  }
  for (const [from, to, expect] of PX_LABEL_REWRITES) {
    const count = out.split(from).length - 1;
    if (count !== expect) {
      skipped.push(`pitch-unit:文案 "${from.slice(0, 24)}…" 期望 ${expect} 处、实测 ${count} 处`);
      allOk = false;
      continue;
    }
    out = out.split(from).join(to);
  }
  if (allOk) applied.push('pitch-unit');
  return out;
}

/**
 * ⑦-B 对同步后的 index.html 桌面副本注入 px 单位按钮、计算模块脚本与 FAQ 边界。
 */
function applyPitchButtonToIndex(src, applied, skipped) {
  if (!src.includes('data-unit="px"')) {
    if (!src.includes(PX_BUTTON_ANCHOR)) {
      skipped.push('pitch-button:anchor');
    } else {
      src = src.replace(PX_BUTTON_ANCHOR, PX_BUTTON_ANCHOR + '\n        ' + PX_BUTTON_HTML);
      applied.push('pitch-button');
    }
  } else {
    applied.push('pitch-button（已应用，跳过）');
  }

  if (!src.includes('led-pitch.js')) {
    if (!src.includes(PITCH_SCRIPT_ANCHOR)) {
      skipped.push('pitch-script:anchor');
    } else {
      src = src.replace(PITCH_SCRIPT_ANCHOR, PITCH_SCRIPT_HTML);
      applied.push('pitch-script');
    }
  } else {
    applied.push('pitch-script（已应用，跳过）');
  }

  if (src.includes(FAQ_ANCHOR)) {
    src = src.split(FAQ_ANCHOR).join(FAQ_PATCH);
    applied.push('pitch-faq');
  } else if (!src.includes(FAQ_PATCH)) {
    skipped.push('pitch-faq:anchor');
  }
  return src;
}

/**
 * PR #10 · i18n 运行时 + 使用指南脚本注入（桌面副本 index.html）
 * ---------------------------------------------------------------------------
 * 🔒 注入位置必须在 `<script src="app.js">` **之前**：app.js 与 guide.js
 *    都依赖 LedI18N 已注册语言包；desktop-ui.js 在 app.js 之后，天然可用。
 * 🔒 独立补丁：不改动 ⑦ 系列的 pitch 注入，避免与 PR #9 的补丁体系冲突。
 * 🔒 幂等：已注入则跳过；sync 每次从根 index.html 覆盖后再注入，结果恒定。
 * 🔒 HTML 离线版冻结：根 index.html / src/* 零改动，i18n 与 guide.js 只在
 *    desktop/renderer/ 内，不进入 build.mjs 的 HTML 产物输入清单。
 */
const I18N_SCRIPT_ANCHOR = '<script src="app.js"></script>';
const I18N_SCRIPT_BLOCK = [
  '<script src="i18n/runtime.js"></script>',
  '<script src="i18n/locales/zh-CN.js"></script>',
  '<script src="i18n/locales/en-US.js"></script>',
  '<script src="i18n/text-map.js"></script>',
  '<script src="i18n/index.js"></script>',
  '<script src="guide.js"></script>',
].join('\n');

function applyI18nScriptsToIndex(src, applied, skipped) {
  if (src.includes('i18n/runtime.js')) {
    applied.push('i18n-scripts（已应用，跳过）');
    return src;
  }
  if (!src.includes(I18N_SCRIPT_ANCHOR)) {
    skipped.push('i18n-scripts:anchor');
    return src;
  }
  applied.push('i18n-scripts');
  return src.replace(I18N_SCRIPT_ANCHOR, I18N_SCRIPT_BLOCK + '\n' + I18N_SCRIPT_ANCHOR);
}

/**
 * 对同步后的 index.html 应用桌面适配。
 * @param {string} filePath desktop/renderer/index.html 的绝对路径
 * @returns {{applied: string[], skipped: string[]}}
 */
function applyIndexAdapter(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const applied = [];
  const skipped = [];

  for (const { id, glyph } of GLYPH_MAP) {
    // 匹配该按钮的完整开标签 + 内容 + 闭标签（内容可能是 − 或 +）
    const re = new RegExp(`(<button[^>]*id="${id}"[^>]*>)([^<]*)(</button>)`);
    const m = src.match(re);
    if (!m) {
      skipped.push(`glyph:${id}`);
      continue;
    }
    let openTag = m[1];
    // 已有 data-glyph 则不重复注入
    if (!/data-glyph=/.test(openTag)) {
      // 🔴 属性必须落在**开标签内部**（m[1] 以 '>' 结尾），
      //    且要保留原文字内容作为 ::before 的备用来源。
      openTag = openTag.replace(/\s*>$/, '') + ` data-glyph="${glyph}">`;
    }
    // 保留原文字内容（::before 的 content 优先取 data-glyph，文字作为无障碍回退）
    src = src.replace(re, (all, o, text, c) => openTag + text + c);
    applied.push(`glyph:${id}`);
  }

  // ⑦-B px 单位按钮 + led-pitch.js 注入 + FAQ 边界（桌面专属）
  src = applyPitchButtonToIndex(src, applied, skipped);

  // PR #10 i18n 运行时 + 使用指南脚本（桌面专属，独立于 ⑦ 系列）
  src = applyI18nScriptsToIndex(src, applied, skipped);

  fs.writeFileSync(filePath, src, 'utf8');
  return { applied, skipped };
}

function applyDesktopAdapter(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const applied = [];
  const skipped = [];

  // ---- ① 剪贴板：替换 copyText 函数体 ---- */
  const copyRe = /  function copyText\(text, button\) \{[\s\S]*?\n  \}\n/;
  if (copyRe.test(src)) {
    src = src.replace(copyRe, CLIPBOARD_PATCH + '  function copyText(text, button) {\n    desktopCopyText(text, button);\n  }\n');
    applied.push('clipboard');
  } else {
    skipped.push('clipboard');
  }

  // ---- ② 持久化：把 localStorage 读写换成 IPC ---- */
  // loadSettings：localStorage.getItem 那一段
  const loadRe = /(  function loadSettings\(\) \{)[\s\S]*?(\n  \})/;
  if (loadRe.test(src)) {
    src = src.replace(
      loadRe,
      '$1\n    desktopLoadSettings();\n  }',
    );
    applied.push('persistence.load');
  } else {
    skipped.push('persistence.load');
  }

  // saveSettings：localStorage.setItem 那一段
  const saveRe = /(  function saveSettings\(\) \{)[\s\S]*?(\n  \})/;
  if (saveRe.test(src)) {
    src = src.replace(saveRe, '$1\n    desktopSaveSettings();\n  }');
    applied.push('persistence.save');
  } else {
    skipped.push('persistence.save');
  }

  // ---- ④ 能力暴露：把内部函数挂到 LedApp 导出对象上 ---- */
  const exportsRe = /  return \{ init: init, state: state \};\n/;
  if (exportsRe.test(src)) {
    src = src.replace(exportsRe, EXPORTS_PATCH);
    applied.push('exports');
  } else {
    skipped.push('exports');
  }

  // ---- ⑤ 注入适配函数 ---- */
  if (!src.includes('desktop-adapter: persistence')) {
    const anchor = '  /**\n   * 复制：优先剪贴板 API';
    if (src.includes(anchor)) {
      src = src.replace(anchor, PERSIST_PATCH + '\n' + anchor);
    } else {
      // 兜底：插到最后一个顶层函数之前
      const idx = src.lastIndexOf('\n  function ');
      if (idx > 0) {
        src = src.slice(0, idx) + '\n' + PERSIST_PATCH + src.slice(idx);
      }
    }
  }

  // ---- ⑦ P 值 / 真实 PX 换算（v1.3.0 桌面专属；替换 v1.2.0 的 1px=1mm 假设）---- */
  src = applyPitchUnitToApp(src, applied, skipped);

  fs.writeFileSync(filePath, src, 'utf8');
  return { applied, skipped };
}

module.exports = { applyDesktopAdapter, applyIndexAdapter };

if (require.main === module) {
  const target = path.join(__dirname, '..', 'renderer', 'app.js');
  const r = applyDesktopAdapter(target);
  console.log('[desktop-adapter] 已应用:', r.applied.join(', ') || '(无)');
  if (r.skipped.length) console.log('[desktop-adapter] 未匹配:', r.skipped.join(', '));
}
