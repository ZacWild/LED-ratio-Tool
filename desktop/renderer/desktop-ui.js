/**
 * LED-ratio-Tool 桌面版 · 桌面交互层
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-05 —— 项目负责人承担最终验收
 *   DEC-11 —— 零网络
 *   DEC-13 —— 三线版本（关于对话框显示全部三条）
 *   DEC-14 —— 客户区尺寸
 *   SEC-04 —— 只用 preload 白名单的 8 个方法
 *   SEC-31 —— 渲染层 console 零 error/warning
 *   E-4     —— 沙箱 preload 无 Buffer / setImmediate
 *
 * 🔒 本文件**不做任何业务计算** —— 比例/误差/取整一律由 core.js 产出（SEC-01）。
 * 🔒 本文件不得使用 fetch —— connect-src 'none' 会封死（E-6 / SEC-36）。
 * 🔒 本文件的所有元素引用必须使用**仓库 index.html 的真实 id**
 *    （70 个 id 契约，由 index.html 同步保证一致）。
 */
'use strict';

(function () {
  'use strict';

  var api = window.ledApi;

  /* ======================================================================
     工具
     ====================================================================== */
  function $(id) {
    return document.getElementById(id);
  }
  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }
  function text(el, value) {
    if (el) el.textContent = value;
  }

  /* ======================================================================
     缩放档位指示（EL-FT-09）
     --------------------------------------------------------------------------
     D-03 §8.1-4①：devicePixelRatio 只用于诊断显示，禁止乘布局尺寸。
     ====================================================================== */
  function updateScaleBadge() {
    var dpr = window.devicePixelRatio || 1;
    var badge = $('stage-badge');
    // stage-badge 由 app.js 负责写入比例文本 → 不覆盖它，另用 title 提示
    if (badge) {
      badge.setAttribute('title', '显示缩放 ' + Math.round(dpr * 100) + '%');
    }
  }

  /* ======================================================================
     版本信息（EL-MD-01 · DEC-13 三线全显）
     ====================================================================== */
  function loadVersion() {
    if (!api || !api.appVersion) return;
    api
      .appVersion()
      .then(function (r) {
        if (!r || r.code !== 0 || !r.data) return;
        var meta = $('core-note');
        if (meta) {
          meta.textContent =
            '桌面 ' + r.data.version + ' ｜ 内核 ' + r.data.coreVersion +
            ' ｜ HTML 版 1.0.1（独立交付）';
        }
      })
      .catch(function () {
        /* 版本信息失败不阻断 */
      });
  }

  /* ======================================================================
     设置：容差持久化（PS-01）
     --------------------------------------------------------------------------
     变更走 preload 白名单 IPC（settingsGet / settingsSet）
     失败静默（表B PS-01「写入失败静默忽略不影响主流程」）
     ====================================================================== */
  function loadSettings() {
    if (!api || !api.settingsGet) return;
    api
      .settingsGet()
      .then(function (r) {
        if (!r || r.code !== 0 || !r.data) return;
        if (typeof r.data.tolerancePercent === 'number') {
          var input = $('input-tolerance');
          if (input) input.value = String(r.data.tolerancePercent);
        }
      })
      .catch(function () {
        /* 读失败静默回退默认 */
      });
  }

  function saveTolerance() {
    var input = $('input-tolerance');
    if (!input || !api || !api.settingsSet) return;
    var raw = String(input.value).trim();
    var value = Number(raw);
    if (!raw || !isFinite(value) || value <= 0 || value > 100) {
      // 非法值不生效、保留上次值（表B PS-01）
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.removeAttribute('aria-invalid');
    api.settingsSet({ tolerancePercent: value }).catch(function () {
      /* 写失败静默 —— 本次会话内新值仍生效 */
    });
  }

  /* ======================================================================
     复制（走 preload 白名单 IPC，SEC-10 只写不读）
     --------------------------------------------------------------------------
     · 成功判据必须来自 IPC 真实返回，不得凭点击显示成功
     · 成功 1600ms 绿 / 失败 2000ms 红（D-02 ER-13）
     ====================================================================== */
  var SUCCESS_MS = 1600;
  var FAILURE_MS = 2000;

  function copyWithFeedback(button, text, originalLabel) {
    if (!api || !api.clipboardWriteText) return;
    var live = $('live-results');

    api
      .clipboardWriteText(text)
      .then(function (r) {
        if (r && r.code === 0) {
          if (button) {
            button.classList.add('is-success');
            button.textContent = '已复制';
            setTimeout(function () {
              button.classList.remove('is-success');
              button.textContent = originalLabel;
            }, SUCCESS_MS);
          }
          if (live) live.textContent = '已复制到剪贴板';
        } else {
          failCopy(button, originalLabel, live, (r && r.message) || '复制失败');
        }
      })
      .catch(function () {
        failCopy(button, originalLabel, live, '复制失败，请手动选取文本复制');
      });
  }

  function failCopy(button, originalLabel, live, message) {
    if (button) {
      button.classList.add('is-error');
      button.textContent = '复制失败';
      setTimeout(function () {
        button.classList.remove('is-error');
        button.textContent = originalLabel;
      }, FAILURE_MS);
    }
    if (live) live.textContent = message;
  }

  /* ======================================================================
     菜单动作入口（main/menu.js 通过 executeJavaScript 调此函数）
     --------------------------------------------------------------------------
     🔒 SEC-07：菜单动作不新增 IPC 通道 —— 走 window.__desktopMenu
     ====================================================================== */
  window.__desktopMenu = function (command) {
    switch (command) {
      case 'menu:copy-resolution': {
        var btn = $('btn-copy-resolution');
        var res = $('res-value');
        if (btn && res) copyWithFeedback(btn, res.textContent.trim(), '复制分辨率');
        return;
      }
      case 'menu:copy-full': {
        var btn2 = $('btn-copy-full');
        if (btn2) copyWithFeedback(btn2, buildFullParameters(), '复制完整参数');
        return;
      }
      case 'menu:open-settings': {
        var panel = $('settings-panel');
        if (panel) {
          panel.classList.add('is-open');
          var trigger = $('btn-settings');
          if (trigger) trigger.setAttribute('aria-expanded', 'true');
          var input = $('input-tolerance');
          if (input) input.focus();
        }
        return;
      }
      case 'menu:reset-defaults': {
        var w = $('input-width');
        var h = $('input-height');
        if (w) w.value = '14';
        if (h) h.value = '4';
        window.dispatchEvent(new Event('led:reset'));
        return;
      }
      case 'menu:mode-width':
      case 'menu:mode-height':
      case 'menu:mode-preset':
      case 'menu:mode-custom': {
        var mode = command.replace('menu:mode-', '');
        window.dispatchEvent(new CustomEvent('led:mode', { detail: { mode: mode } }));
        return;
      }
      case 'menu:shortcut-help':
      case 'menu:about': {
        var live = $('live-results');
        if (live) live.textContent = '该功能属 P4-B 范围';
        return;
      }
      default:
        return;
    }
  };

  /**
   * 完整参数文本 —— P4-A 占位实现。
   * 🔒 P4-B 必须改为与 HTML 版 app.js 的 14 段格式逐字一致，
   *    且宽×高不带千分位。本阶段只保证机制可跑通，不作为格式基线。
   */
  function buildFullParameters() {
    var parts = [];
    parts.push('实际屏幕尺寸: ' + readDimensionText());
    parts.push('目标比例来源: ' + readRatioSourceText());
    parts.push('目标画布模式: ' + readModeText());
    parts.push('真实宽高比: ' + textOf('ratio-value'));
    parts.push('最简整数比: ' + textOf('ratio-suffix'));
    parts.push('推荐画布分辨率: ' + textOf('res-value'));
    parts.push('实际尺寸: ' + textOf('dim-width') + ' × ' + textOf('dim-height'));
    parts.push('匹配判定: ' + textOf('core-note'));
    parts.push('② 控制系统接收分辨率: ' + valueOf('input-site-receive'));
    parts.push('③ 后期软件合成分辨率: ' + valueOf('input-site-composite'));
    parts.push('④ 实际交付视频分辨率: ' + valueOf('input-site-deliver'));
    return parts.join('\n');
  }

  function textOf(id) {
    var el = $(id);
    return el ? el.textContent.trim() : '—';
  }
  function valueOf(id) {
    var el = $(id);
    return el && el.value ? el.value : '未填写';
  }
  function readDimensionText() {
    return (
      valueOf('input-width') + ' ' + textOf('unit-width') +
      ' × ' + valueOf('input-height') + ' ' + textOf('unit-height')
    );
  }
  function readRatioSourceText() {
    var el = document.querySelector('.ratio-source[aria-checked="true"]');
    return el ? el.textContent.trim() : '屏幕实际';
  }
  function readModeText() {
    var el = document.querySelector('.canvas-mode[aria-checked="true"]');
    return el ? el.textContent.trim() : '按宽度';
  }

  /* ======================================================================
     初始化
     ====================================================================== */
  function init() {
    updateScaleBadge();
    loadSettings();
    loadVersion();

    on($('btn-settings'), 'click', function () {
      var panel = $('settings-panel');
      if (!panel) return;
      var open = panel.classList.toggle('is-open');
      var trigger = $('btn-settings');
      if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    on($('input-tolerance'), 'change', saveTolerance);
    on($('input-tolerance'), 'blur', saveTolerance);

    // 复制按钮（HTML 版已实现主路径；此处仅在桌面环境下补 IPC 通道）
    on($('btn-copy-resolution'), 'click', function () {
      if (!api || !api.clipboardWriteText) return; // HTML 路径自行处理
      var btn = this;
      var res = $('res-value');
      if (!res) return;
      var payload = res.textContent.trim();
      if (!payload || payload === '—') {
        failCopy(btn, '复制分辨率', $('live-results'), '没有可复制的分辨率');
        return;
      }
      copyWithFeedback(btn, payload.replace(/,/g, '').replace(/ × /g, '×'), '复制分辨率');
    });

    on($('btn-copy-full'), 'click', function () {
      if (!api || !api.clipboardWriteText) return;
      copyWithFeedback(this, buildFullParameters(), '复制完整参数');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
