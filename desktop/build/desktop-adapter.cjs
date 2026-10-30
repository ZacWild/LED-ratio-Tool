/**
 * LED-ratio-Tool 桌面版 · 渲染层适配补丁
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   P3-BASELINE §6 —— 复制必须走 preload 白名单 IPC 剪贴板接口
 *   SEC-10         —— 剪贴板只写不读；renderer 不得使用 navigator.clipboard
 *   PS-01          —— 匹配容差持久化到 settings.json（经 IPC）
 *   DEC-11         —— app:// 是安全上下文，localStorage 可用，但统一走 IPC 更可控
 *
 * 🔒 本补丁只做**四处**适配，绝不改动业务逻辑：
 *   ① 持久化：localStorage 读写 → ledApi.settingsGet / settingsSet
 *   ② 剪贴板：navigator.clipboard / legacyCopy → ledApi.clipboardWriteText
 *   ③ 复制反馈：复原时恢复**各自原始标签**（D-02 §4.5 Q-02 既有缺陷）
 *   ④ 能力暴露：把 app.js 的内部函数挂到 LedApp 上，供桌面交互层**复用**
 *      —— 复制载荷与 HTML 版逐字一致的唯一可靠做法（不重复实现任何计算）
 *
 * 🔒 应用方式：由 build/sync-assets.mjs 在同步 app.js 之后应用，
 *    **不修改仓库源文件**（DEC-03：HTML 版零回灌）。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * 持久化适配：把 loadSettings / saveSettings 的 localStorage 换成 IPC。
 * 保留原有的「静默降级」语义（写入失败静默忽略，不阻断启动）。
 */
const PERSIST_PATCH = `/* ---- desktop-adapter: persistence → IPC ---- */
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
 * 复制反馈适配：修复 HTML 版既有缺陷 Q-02（D-02 §4.5）。
 *
 * 🔒 HTML 版 showCopyFeedback 复原时统一写 `label.textContent = '复制'`。
 *    对 `#btn-copy-full`（原文案「复制完整参数」）而言，任何一次复制后该按钮
 *    文案**永久变成「复制」**，不会恢复。
 * 🔒 桌面版修法（纯展示层，不涉及业务规则）：首次反馈时记下**各自原始标签**
 *    与原始图标，复原时写回原值。
 */
const FEEDBACK_PATCH = `/* ---- desktop-adapter: copy feedback — restore each button's own label ---- */
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
    defaultTolerancePercent: Core.DEFAULT_TOLERANCE_PERCENT
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

  // ---- ③ 复制反馈：恢复各自原始标签（修复 HTML 版既有缺陷 Q-02）---- */
  const feedbackRe = /  function showCopyFeedback\(button, ok\) \{[\s\S]*?\n  \}\n/;
  if (feedbackRe.test(src)) {
    src = src.replace(feedbackRe, FEEDBACK_PATCH);
    applied.push('copy-feedback');
  } else {
    skipped.push('copy-feedback');
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
