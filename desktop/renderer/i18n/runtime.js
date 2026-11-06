/**
 * LED Ratio Tool · Windows 桌面版 i18n 运行时
 * ============================================================================
 * 用途：为桌面渲染层提供 `t(key, params)` 查表、缺 key 回退、语言切换、
 *      语言偏好持久化、Key 完整性检查。**桌面独占**，不进入 HTML 单文件产物。
 *
 * 🔒 为什么放在 desktop/renderer/i18n/：
 *    build.mjs 的 inlineAssets() 只内联 src/core.js、src/app.js、src/styles.css、
 *    index.html 四个文件 —— 本目录根本不会被 HTML 构建读取，
 *    因此「桌面 i18n 不污染 HTML 产物」由构建输入清单天然保证。
 *
 * 🔒 为什么不用 ES module：
 *    桌面渲染层现有脚本（core.js / app.js / desktop-ui.js）均为普通 <script>
 *    顺序加载、共享全局作用域；本运行时保持同一形态，避免引入模块加载差异。
 *
 * 🔒 零依赖：不引 npm 包，不发网络请求，完全离线可用。
 *
 * 用法：
 *   LedI18N.t('status.unit')                      // → '当前单位'
 *   LedI18N.t('dlg.versionRow', { value: '1.2.0' }) // → '桌面版本 1.2.0'
 *   LedI18N.setLocale('en-US')                    // 切换语言并持久化
 *   LedI18N.missingKeys()                         // Key 完整性检查
 *
 * 加载顺序（由 desktop-adapter.cjs 注入到桌面副本 index.html）：
 *   core.js → i18n/runtime.js → i18n/locales/zh-CN.js → i18n/locales/en-US.js
 *          → i18n/index.js → app.js → desktop-ui.js
 */
'use strict';

(function (global) {
  /** 语言偏好在 localStorage 中的键名 */
  var STORAGE_KEY = 'led-ratio-tool.locale';

  /** 已注册语言包：code → { key: value } */
  var packs = Object.create(null);

  /** 当前语言 */
  var current = 'zh-CN';

  /** 源语种（Key 完整性检查的参照基准） */
  var REFERENCE = 'zh-CN';

  /** 语言切换监听器 */
  var listeners = [];

  /** 缺 key 只告警一次，避免刷屏 */
  var warnedMissing = Object.create(null);

  /** 支持的语言白名单 */
  var SUPPORTED = ['zh-CN', 'en-US'];

  /**
   * 插值：把模板里的 {0} {1} … 或 {name} 替换为 params 对应值。
   * params 为数组时按序号；为对象时按名字。未提供的占位符原样保留。
   */
  function interpolate(template, params) {
    if (!params) return template;
    return String(template).replace(/\{(\w+)\}/g, function (all, key) {
      if (Array.isArray(params)) {
        var idx = Number(key);
        return isNaN(idx) || idx < 0 || idx >= params.length ? all : String(params[idx]);
      }
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : all;
    });
  }

  /**
   * 查表取文案。缺 key 时回退为 key 本身（绝不显示空白 UI），并只告警一次。
   * @param {string} key   形如 'status.unit' 的稳定 ASCII key
   * @param {Array|Object} [params] 插值参数
   * @returns {string}
   */
  function t(key, params) {
    var pack = packs[current];
    var value = pack && Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : undefined;
    if (value === undefined) {
      // 缺 key 回退：先试源语种，再退回 key 本身
      var ref = packs[REFERENCE];
      value = ref && Object.prototype.hasOwnProperty.call(ref, key) ? ref[key] : key;
      if (!warnedMissing[key]) {
        warnedMissing[key] = true;
        if (global.console && global.console.warn) {
          global.console.warn('[i18n] 缺失 key：' + key + '（locale=' + current + '）');
        }
      }
    }
    return interpolate(value, params);
  }

  /**
   * 注册语言包。同一 code 重复注册做浅合并（后注册者覆盖同名 key）。
   * @param {string} code 例如 'zh-CN'
   * @param {Object} dict key → 文案
   */
  function registerPack(code, dict) {
    if (typeof code !== 'string' || !code) throw new Error('[i18n] registerPack: code 必须是非空字符串');
    if (!dict || typeof dict !== 'object') throw new Error('[i18n] registerPack: dict 必须是对象');
    var target = packs[code] || (packs[code] = Object.create(null));
    var keys = Object.keys(dict);
    for (var i = 0; i < keys.length; i++) {
      target[keys[i]] = dict[keys[i]];
    }
    return keys.length;
  }

  /** 当前语言 */
  function getLocale() {
    return current;
  }

  /** 已注册的语言 code 列表 */
  function getAvailable() {
    return SUPPORTED.filter(function (c) { return !!packs[c]; });
  }

  /**
   * 从持久化存储读取语言偏好。非法值一律回退默认。
   */
  function readStoredLocale() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw && SUPPORTED.indexOf(raw) >= 0 && packs[raw]) return raw;
    } catch (e) {
      // localStorage 不可用（隐私模式/配额）→ 静默回退默认，不阻断启动
    }
    return null;
  }

  /**
   * 持久化语言偏好。写失败静默忽略（本次会话内仍生效）。
   */
  function persistLocale(code) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, code);
    } catch (e) {
      /* 写入失败静默忽略 */
    }
  }

  /**
   * 把本地化文案套到 DOM 上。支持两种标记：
   *   data-i18n="key"                          → 写 textContent
   *   data-i18n-attr="aria-label:key,title:key2" → 写对应属性
   * 只处理桌面副本 index.html 里的静态文案；动态文案由各处调用 t() 生成。
   */
  function applyToDom(root) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) return 0;
    var changed = 0;

    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;
      var text = t(key);
      if (el.textContent !== text) { el.textContent = text; changed++; }
    }

    var attrNodes = scope.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var node = attrNodes[j];
      var spec = node.getAttribute('data-i18n-attr') || '';
      var parts = spec.split(',');
      for (var k = 0; k < parts.length; k++) {
        var pair = parts[k].split(':');
        var attr = (pair[0] || '').trim();
        var akey = (pair[1] || '').trim();
        if (!attr || !akey) continue;
        var val = t(akey);
        if (node.getAttribute(attr) !== val) { node.setAttribute(attr, val); changed++; }
      }
    }
    return changed;
  }

  /**
   * 切换语言：更新 current、持久化、重刷 DOM、通知监听器。
   * @param {string} code
   * @returns {boolean} 是否切换成功
   */
  function setLocale(code) {
    if (SUPPORTED.indexOf(code) < 0 || !packs[code]) return false;
    if (code === current) return false;
    current = code;
    warnedMissing = Object.create(null);
    persistLocale(code);
    applyToDom();
    if (global.document && global.document.documentElement) {
      global.document.documentElement.setAttribute('lang', code);
    }
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](code); } catch (e) { /* 监听器异常不得阻断切换 */ }
    }
    return true;
  }

  /** 注册语言切换监听器；返回取消订阅函数。 */
  function onLocaleChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  /**
   * Key 完整性检查：以 REFERENCE 语种为基准，检查其它语种是否缺 key、是否有多余 key。
   * @returns {{ok: boolean, reference: string, locales: Object, missing: Object, extra: Object}}
   *   missing[code] = 该语种缺少的 key 列表
   *   extra[code]   = 该语种多出的 key 列表（参照语种没有的）
   */
  function completenessReport() {
    var ref = packs[REFERENCE] || {};
    var refKeys = Object.keys(ref).sort();
    var locales = {};
    var missing = {};
    var extra = {};
    var ok = true;

    var codes = Object.keys(packs);
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      var keys = Object.keys(packs[code]).sort();
      locales[code] = keys.length;
      if (code === REFERENCE) continue;
      var miss = refKeys.filter(function (k) { return !Object.prototype.hasOwnProperty.call(packs[code], k); });
      var ext = keys.filter(function (k) { return !Object.prototype.hasOwnProperty.call(ref, k); });
      missing[code] = miss;
      extra[code] = ext;
      if (miss.length || ext.length) ok = false;
    }
    return { ok: ok, reference: REFERENCE, refKeyCount: refKeys.length, locales: locales, missing: missing, extra: extra };
  }

  /** 便捷布尔判定：所有语种 key 集合与参照语种一致 */
  function isComplete() {
    return completenessReport().ok;
  }

  /**
   * 初始化：注册外部传入的语言包后调用，恢复持久化偏好并刷 DOM。
   * 幂等；不抛异常。
   * @returns {string} 实际生效的语言
   */
  function init() {
    var stored = readStoredLocale();
    if (stored) current = stored;
    if (global.document && global.document.documentElement) {
      global.document.documentElement.setAttribute('lang', current);
    }
    applyToDom();
    return current;
  }

  /** 暴露给渲染层的只读接口 */
  var api = {
    t: t,
    registerPack: registerPack,
    getLocale: getLocale,
    setLocale: setLocale,
    getAvailable: getAvailable,
    onLocaleChange: onLocaleChange,
    applyToDom: applyToDom,
    init: init,
    completenessReport: completenessReport,
    isComplete: isComplete,
    STORAGE_KEY: STORAGE_KEY,
    SUPPORTED: SUPPORTED,
    REFERENCE: REFERENCE
  };

  // 🔒 冻结接口面，防止运行时被意外改写（与 preload 的 SEC-04 口径一致）
  global.LedI18N = Object.freeze(api);
})(typeof window !== 'undefined' ? window : this);
