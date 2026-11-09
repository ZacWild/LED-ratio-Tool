/**
 * LED Ratio Tool · Windows 桌面版 i18n 引导
 * ============================================================================
 * 职责：把已加载的语言包注册进运行时、**给静态中文文本节点打 i18n 标记**、
 *       恢复语言偏好、把文案套到 DOM 上、做 Key 完整性自检。
 *
 * 加载顺序（由 desktop-adapter.cjs 注入桌面副本 index.html）：
 *   core.js → i18n/runtime.js → i18n/locales/zh-CN.js → i18n/locales/en-US.js
 *          → i18n/text-map.js → **i18n/index.js** → app.js → desktop-ui.js
 *
 * 🔒 必须在 app.js 之前执行 —— app.js 里的 _t() 调用要能立即取到文案。
 * 🔒 本文件零依赖、离线可用；不发任何网络请求。
 *
 * 🔒 P4-2 全 TextNode 覆盖（阶段 4）：
 *    用 DOM API 遍历全部 TextNode，按 text-map.js 的「中文原文 → key」精确映射：
 *      通道 A：父元素无子元素 → setAttribute('data-i18n', key)，走既有 applyToDom()
 *      通道 B：父元素含子元素（如 <br>、徽标 span）→ 直接改 TextNode.nodeValue，
 *              并登记到 textNodeTargets，由 onLocaleChange 回调在切语言时重刷
 *    全程零 HTML 字符串改写、零 innerHTML、零新增元素 —— 结构上不可能复现
 *    阶段 2 文本级正则跨标签匹配导致的 1393 pageerror。
 */
'use strict';

(function (global) {
  var I18N = global.LedI18N;
  if (!I18N) {
    if (global.console && global.console.error) {
      global.console.error('[i18n] runtime.js 未先加载，i18n 引导跳过');
    }
    return;
  }

  // 1. 注册语言包（顺序即优先级：zh-CN 为参照语种，必须先注册）
  var packs = global.LedI18NPack || {};
  var codes = ['zh-CN', 'en-US'];
  var registered = [];
  for (var i = 0; i < codes.length; i++) {
    var code = codes[i];
    if (packs[code]) {
      I18N.registerPack(code, packs[code]);
      registered.push(code);
    }
  }

  /* ==================== 2. P4-2 静态文本打标（必须在 init() 之前） ==================== */

  // 🔴 不缓存 TM：映射表由 ⑦ 注入到 index.js 之前，但若脚本顺序异常或
  //    构建中间态（⑦ 尚未落地）时被后加载，闭包缓存会恒为 undefined，
  //    导致 LedI18NTextMapApply() 重跑也无效。故每次动态读全局。
  var zhPack = packs['zh-CN'] || null;
  var enPack = packs['en-US'] || null;

  /** 通道 B 的 TextNode 登记表：{ node, raw, text, key }；用于切语言重刷 + 去重 */
  var textNodeTargets = [];

  /** 是否已完成过一次有效遍历（TM 与 DOM 齐备） */
  var hasTagged = false;
  var lastExempted = 0;
  var lastSkipped = 0;

  function hasKey(dict, key) {
    return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
  }

  /**
   * 前置校验（裁决 2）：key 必须在 zh-CN 与 en-US 两包都存在，且 zh-CN 参照值
   * 与 DOM TextNode 原文逐字相等。
   *
   * 🔴 必须读语言包的**参照语种原值**，不能用 I18N.t(key)：
   *    t() 返回的是「当前语言」的值，若启动时 locale 已是 en-US，
   *    用 t() 与中文原文比较会全量不等 → 所有 key 被误判为不安全。
   *    运行时未暴露按语种取值接口，故直接读已加载的全局语言包对象。
   */
  function isKeySafe(key, text) {
    if (!hasKey(zhPack, key) || !hasKey(enPack, key)) return false;
    return zhPack[key] === text;
  }

  /** 精确相等查表（不用正则、不做前缀/模糊匹配） */
  function lookup(text) {
    var TM = global.LedI18NTextMap;
    if (!TM || !TM.MAP) return null;
    var map = TM.MAP;
    for (var k = 0; k < map.length; k++) {
      if (map[k][0] === text) return map[k][1];
    }
    return null;
  }

  function matchExempt(el, key, text) {
    var TM = global.LedI18NTextMap;
    if (!TM || !TM.EXEMPT || typeof TM.EXEMPT.match !== 'function') return null;
    return TM.EXEMPT.match(el, key, text);
  }

  /**
   * 用当前语种译文替换 TextNode，保留 raw 的前导/尾随空白。
   * 🔴 用 split/join 而非 String.replace(string, repl)：后者会把译文里的
   *    $& / $' 等当作替换模式解释；split/join 是纯字面量替换。
   */
  function writeTextNode(node, raw, text, key) {
    var value = I18N.t(key);
    node.nodeValue = raw.split(text).join(value);
  }

  /** 同一 node 只登记一次（幂等） */
  function registerTarget(node, raw, text, key) {
    for (var k = 0; k < textNodeTargets.length; k++) {
      if (textNodeTargets[k].node === node) return;
    }
    textNodeTargets.push({ node: node, raw: raw, text: text, key: key });
  }

  /**
   * 遍历 document.body 下全部 TextNode 并打标。幂等，可重复调用。
   * @returns {{tagged:number, textNodeTargets:number, exempted:number,
   *            skipped:number, domTagged:number}} 当前状态统计
   */
  function applyTextMapToDom() {
    var doc = global.document;
    var TM = global.LedI18NTextMap;

    // 🔴 幂等：打标是「一次性启动动作」。desktop-ui.js 在本文件之后才动态创建
    //    状态栏元素（ft-mode「按宽度」/ ft-settings「设置」），其文本恰好命中
    //    MAP；若允许重复遍历，会把这些动态元素误打上 data-i18n，造成
    //    [data-i18n] 数量漂移并干扰 syncStatusBar() 的动态文案。
    //    故完成一次有效遍历后，重复调用只回报现状、不再遍历/打标。
    //    注意：「TM 未注入 / 无完整 DOM」的提前返回**不**置位，以保留
    //    构建中间态下映射表后加载时重跑生效的能力。
    if (hasTagged) {
      return {
        tagged: 0,
        textNodeTargets: textNodeTargets.length,
        exempted: lastExempted,
        skipped: lastSkipped,
        domTagged: (doc && doc.querySelectorAll && doc.querySelectorAll('[data-i18n]').length) || 0
      };
    }

    var result = { tagged: 0, textNodeTargets: 0, exempted: 0, skipped: 0, domTagged: 0 };

    // 防御：映射表未注入（构建中间态）、或宿主无完整 DOM（node:test vm 沙箱）
    // —— 任一缺失都安全降级，绝不抛异常、绝不阻断 init()。
    if (!TM || !doc || !doc.body || typeof doc.createTreeWalker !== 'function') {
      return result;
    }

    var showText = (global.NodeFilter && global.NodeFilter.SHOW_TEXT) || 4;
    var walker = doc.createTreeWalker(doc.body, showText);
    var node;

    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      if (raw == null) continue;
      var text = raw.trim();
      if (!text) continue;

      var key = lookup(text);
      if (!key) continue;

      // ① 逐字一致性前置校验：不满足则保留原中文，绝不显示裸 key / 空白
      if (!isKeySafe(key, text)) {
        result.skipped++;
        if (global.console && global.console.warn) {
          global.console.warn('[i18n] text-map 跳过：' + key);
        }
        continue;
      }

      var el = node.parentElement;

      // ② 豁免必须在分通道之前统一判定：豁免项多为纯文本元素，
      //    若只在通道 B 判定，会走通道 A 被打标（如 px 提示 hint → PX-09 失效）。
      if (matchExempt(el, key, text)) {
        result.exempted++;
        continue;
      }

      // ③ 幂等：通道 A 已打过标的元素跳过，避免重复登记到通道 B
      if (el && el.hasAttribute && el.hasAttribute('data-i18n')) continue;

      var isPureText = !!(el && el.children && el.children.length === 0);

      if (isPureText && el.setAttribute) {
        // 通道 A：纯文本元素 → 走既有 applyToDom()（setLocale 自动重刷）
        el.setAttribute('data-i18n', key);
        result.tagged++;
      } else {
        // 通道 B：混合内容元素 → 直接改 TextNode，不新增元素、不碰子元素
        writeTextNode(node, raw, text, key);
        registerTarget(node, raw, text, key);
      }
    }

    result.textNodeTargets = textNodeTargets.length;
    result.domTagged = (doc.querySelectorAll && doc.querySelectorAll('[data-i18n]').length) || result.tagged;

    hasTagged = true;
    lastExempted = result.exempted;
    lastSkipped = result.skipped;
    return result;
  }

  /** 用当前语种重刷通道 B 的全部 TextNode（从 raw 模板重算，幂等） */
  function refreshTextNodes() {
    for (var k = 0; k < textNodeTargets.length; k++) {
      var t = textNodeTargets[k];
      try {
        writeTextNode(t.node, t.raw, t.text, t.key);
      } catch (e) { /* 单个节点失效不得阻断语言切换 */ }
    }
  }

  // 切语言时重刷通道 B（applyToDom 只负责通道 A 与 data-i18n-attr）。
  // runtime.js 的 setLocale 先调 applyToDom() 再触发 listeners，二者无冲突。
  if (I18N.onLocaleChange) {
    I18N.onLocaleChange(refreshTextNodes);
  }

  /** 可重复调用的诊断入口（幂等）；供测试与开发者工具读取统计 */
  global.LedI18NTextMapApply = applyTextMapToDom;

  var mapStats = applyTextMapToDom();

  /* ==================== 3. 恢复语言偏好 + 刷 DOM + 同步 <html lang> ==================== */
  var active = I18N.init();

  // 🔴 冷启动 locale != zh-CN 时必须补刷通道 B：
  //    打标发生在 init() 之前，此时 runtime 内部 current 仍是初始值 'zh-CN'，
  //    通道 B 的 TextNode 写入的是中文；init() 读回持久化偏好（如 en-US）后
  //    只调 applyToDom()（仅覆盖通道 A 与 data-i18n-attr），**不触发**
  //    onLocaleChange，若不补刷，FAQ 8 条与结果面板标题会残留中文。
  //    QA 的 TC-BH-04「en-US 独立冷启动」正是这条路径。
  refreshTextNodes();

  // 4. Key 完整性自检：缺 key 在开发期就暴露，不等到切语言才炸
  var report = I18N.completenessReport();
  if (!report.ok && global.console && global.console.warn) {
    var codesWithDrift = Object.keys(report.missing).filter(function (c) {
      return report.missing[c].length || (report.extra[c] && report.extra[c].length);
    });
    for (var j = 0; j < codesWithDrift.length; j++) {
      var c = codesWithDrift[j];
      global.console.warn(
        '[i18n] key 集合与参照语种不一致：' + c +
        ' 缺 ' + report.missing[c].length + ' 个、多 ' + (report.extra[c] ? report.extra[c].length : 0) + ' 个'
      );
    }
  }

  // 5. 暴露只读诊断信息（供测试与开发者工具读取，不含可写入口）
  global.LedI18NStatus = Object.freeze({
    registered: registered,
    active: active,
    keyCount: report.refKeyCount,
    complete: report.ok,
    // P4-2 诊断字段（首次打标快照）
    tagged: mapStats.tagged,
    textNodeTargets: mapStats.textNodeTargets,
    exempted: mapStats.exempted,
    skipped: mapStats.skipped
  });


  /* ==================== 7. S10-R8 批次 D · 动态文案事件驱动重渲染 ==================== */
  (function () {
    var TM = global.LedI18NTextMap;
    var D = TM && TM.DYNAMIC;
    var doc = global.document;
    if (!D || !D.EXACT || !D.TPL || !doc) return;

    // ① 给单位提示打稳定标记（此时文本仍为中文），解除 desktop-ui.js 对中文文本的依赖
    var hints = doc.querySelectorAll('.hint');
    for (var h = 0; h < hints.length; h++) {
      if (hints[h].textContent.indexOf('单位切换只改变显示值') >= 0) {
        hints[h].setAttribute('data-hint-unit', '1');
        break;
      }
    }

    var tpls = D.TPL.map(function (r) { return { key: r[0], re: new RegExp(r[1]) }; });
    var ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'aria-description'];
    var CJK2 = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
    var origText = new WeakMap();   // TextNode -> 原始中文（trim 后）
    var origAttr = new WeakMap();   // Element  -> { attr: 原始中文 }

    /** 通道 B 已登记的 TextNode 由 refreshTextNodes() 管理，动态层不得覆盖 */
    function isChannelBNode(node) {
      for (var k = 0; k < textNodeTargets.length; k++) {
        if (textNodeTargets[k].node === node) return true;
      }
      return false;
    }
    /** 中文原文 → 当前语种译文；未登记则原样返回（验收会如实报残留） */
    function tr(zh) {
      var key = Object.prototype.hasOwnProperty.call(D.EXACT, zh) ? D.EXACT[zh] : null;
      var params = null;
      if (!key) {
        for (var i = 0; i < tpls.length; i++) {
          var m = zh.match(tpls[i].re);
          if (m) {
            key = tpls[i].key;
            params = m.slice(1).map(function (v) {
              var k2 = Object.prototype.hasOwnProperty.call(D.EXACT, v) ? D.EXACT[v] : null;
              return k2 ? I18N.t(k2) : v;
            });
            break;
          }
        }
      }
      if (!key) return zh;
      return I18N.t(key, params);
    }
    function targetOf(orig) {
      return I18N.getLocale() === 'zh-CN' ? orig : tr(orig);
    }
    function translateTextNode(node) {
      var raw = node.nodeValue;
      if (raw == null) return;
      var text = raw.trim();
      if (!text) return;
      // 已被通道 A / 通道 B 管理的静态节点不重复处理
      if (isChannelBNode(node)) return;
      var p = node.parentElement;
      if (p && p.closest && p.closest('[data-i18n]')) return;
      if (CJK2.test(text)) origText.set(node, text);
      var orig = origText.get(node);
      if (!orig) return;
      var value = targetOf(orig);
      if (value === text) return;
      node.nodeValue = raw.split(text).join(value);
    }
    function translateAttrs(el) {
      var saved = origAttr.get(el) || {};
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i], cur = el.getAttribute(a);
        if (cur == null) continue;
        var t = cur.trim();
        if (CJK2.test(t)) saved[a] = t;
        var orig = saved[a];
        if (!orig) continue;
        var value = targetOf(orig);
        if (value !== t) el.setAttribute(a, value);
      }
      origAttr.set(el, saved);
    }
    function translateDynamic() {
      if (!doc.body || !doc.createTreeWalker) return;
      var show = (global.NodeFilter && global.NodeFilter.SHOW_TEXT) || 4;
      var walker = doc.createTreeWalker(doc.body, show);
      var node;
      while ((node = walker.nextNode())) translateTextNode(node);
      var all = doc.body.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) translateAttrs(all[j]);
    }

    // 🔒 事件驱动：语言切换 / P 值联动 / 用户输入点击 → 下一个宏任务统一重渲染
    //    无 MutationObserver、无 setInterval、无一次性 data-i18n 打标。
    var dynTimer = 0;
    function scheduleDynamic() {
      if (dynTimer) return;
      dynTimer = global.setTimeout(function () {
        dynTimer = 0;
        translateDynamic();
        // app.js 的状态栏在 rAF 中更新：同一事件后再跑一帧，非轮询
        if (global.requestAnimationFrame) global.requestAnimationFrame(translateDynamic);
      }, 0);
    }
    if (I18N.onLocaleChange) I18N.onLocaleChange(scheduleDynamic);
    global.addEventListener('led:pitch', scheduleDynamic);
    global.addEventListener('led:locale', scheduleDynamic);
    doc.addEventListener('input', scheduleDynamic, true);
    doc.addEventListener('click', scheduleDynamic, true);
    doc.addEventListener('change', scheduleDynamic, true);
    // setTimeout(0) 排在所有同步 DOMContentLoaded 回调（app.js / desktop-ui.js init）之后
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', scheduleDynamic);
    else scheduleDynamic();
    global.addEventListener('load', scheduleDynamic);
    global.LedI18NDynamicStatus = Object.freeze({
      exact: Object.keys(D.EXACT).length,
      templates: D.TPL.length,
      refresh: function () { scheduleDynamic(); }
    });
  })();
  if (global.console && global.console.debug) {
    global.console.debug(
      '[i18n] 已就绪：' + registered.join('/') + '，当前 ' + active +
      '，key ' + report.refKeyCount + ' 个，完整=' + report.ok +
      '，打标=' + mapStats.tagged + '/TextNode=' + mapStats.textNodeTargets +
      '/豁免=' + mapStats.exempted + '/跳过=' + mapStats.skipped
    );
  }

  // 6. F5 修复：从 settings.json 校准 locale（R1 唯一真源）
  //    settings.json 是跨进程持久化真源，localStorage 只是缓存。
  //    启动后异步校准，不阻塞首屏。若 locale 变化，setLocale 会触发
  //    applyToDom()（通道 A）+ onLocaleChange（通道 B）自动重刷，无需重新打标。
  if (global.ledApi && global.ledApi.settingsGet) {
    global.ledApi.settingsGet().then(function (r) {
      var saved = r && r.data && r.data.locale;
      if (saved && saved !== I18N.getLocale()) {
        I18N.setLocale(saved);
      }
    }).catch(function () { /* settings.json 不可用时静默回退 localStorage */ });
  }
})(typeof window !== 'undefined' ? window : this);
