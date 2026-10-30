/**
 * LED-ratio-Tool 桌面版 · 渲染层适配补丁
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   P3-BASELINE §6 —— 复制必须走 preload 白名单 IPC 剪贴板接口
 *   SEC-10         —— 剪贴板只写不读；renderer 不得使用 navigator.clipboard
 *   PS-01          —— 匹配容差持久化到 settings.json（经 IPC）
 *   DEC-11         —— app:// 是安全上下文，localStorage 可用，但统一走 IPC 更可控
 *
 * 🔒 本补丁只做**两处**适配，绝不改动业务逻辑：
 *   ① 持久化：localStorage 读写 → ledApi.settingsGet / settingsSet
 *   ② 剪贴板：navigator.clipboard / legacyCopy → ledApi.clipboardWriteText
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
 * 对同步后的 app.js 应用桌面适配。
 * @param {string} filePath desktop/renderer/app.js 的绝对路径
 * @returns {{applied: string[], skipped: string[]}}
 */
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

  // ---- ③ 注入适配函数 ---- */
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

module.exports = { applyDesktopAdapter };

if (require.main === module) {
  const target = path.join(__dirname, '..', 'renderer', 'app.js');
  const r = applyDesktopAdapter(target);
  console.log('[desktop-adapter] 已应用:', r.applied.join(', ') || '(无)');
  if (r.skipped.length) console.log('[desktop-adapter] 未匹配:', r.skipped.join(', '));
}
