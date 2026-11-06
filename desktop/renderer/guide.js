'use strict';
/**
 * PR #10 · 使用指南 / P 值说明 / PX 来源标识 / 语言切换
 * ============================================================================
 * 设计约束（任务书 S10-2 ~ S10-7）：
 *  · 零硬编码中文 UI 文案 —— 所有可见文本走 LedI18N.t(key)；
 *  · 不改动 desktop-ui.js / app.js / desktop-adapter.cjs 的既有补丁体系，
 *    本模块只追加 DOM，不与 v1.3.0 的 P 值渲染链耦合；
 *  · 语言切换不刷新页面、不丢失输入 —— 只重渲染本模块创建的节点；
 *  · 不使用 innerHTML、不做跨标签文本正则替换；
 *  · 独立于 HTML 离线版（本文件只在桌面副本 index.html 中加载）。
 *
 * 加载顺序（由 desktop-adapter.cjs 注入）：
 *   core.js → i18n/runtime.js → i18n/locales/* → i18n/text-map.js
 *          → i18n/index.js → **guide.js** → app.js → desktop-ui.js
 */
(function (global) {
  var doc = global.document;

  function t(key) {
    var i = global.LedI18N;
    return (i && typeof i.t === 'function') ? i.t(key) : key;
  }
  function mk(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function byId(id) { return doc.getElementById(id); }
  function clear(e) { while (e && e.firstChild) e.removeChild(e.firstChild); }

  /** 把 "标题：说明|标题：说明" 渲染成分点列表（中英文冒号均兼容）。 */
  function buildList(itemsKey) {
    var ul = mk('ul', 'p10-list');
    String(t(itemsKey)).split('|').forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var li = mk('li', 'p10-list__item');
      var m = line.match(/^([^:：]+)[:：]\s*([\s\S]*)$/);
      if (m) {
        li.appendChild(mk('strong', 'p10-list__term', m[1].trim() + '：'));
        li.appendChild(doc.createTextNode(m[2].trim()));
      } else {
        li.textContent = line;
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function buildSection(titleKey, itemsKey, open) {
    var d = mk('details', 'p10-section');
    d.open = !!open;
    d.appendChild(mk('summary', 'p10-section__title', t(titleKey)));
    d.appendChild(buildList(itemsKey));
    return d;
  }

  /* ---------------- 1. 中间栏「使用指南」 ---------------- */
  function ensureGuideHost() {
    var host = byId('p10-guide');
    if (host) return host;
    var stage = doc.querySelector('.panel--stage');
    if (!stage) return null;
    var wrap = mk('details', 'p10-guide');
    wrap.id = 'p10-guide';
    wrap.open = true;                    // 默认可见标题 + 快速入门，能被发现
    var head = mk('summary', 'p10-guide__head');
    head.appendChild(mk('span', 'p10-guide__icon', 'ⓘ'));
    head.appendChild(mk('span', 'p10-guide__title', ''));
    head.appendChild(mk('span', 'p10-guide__toggle', ''));
    wrap.appendChild(head);
    wrap.appendChild(mk('div', 'p10-guide__body'));
    stage.appendChild(wrap);           // 画幅预览区域下方，不改动三栏结构
    return wrap;
  }

  function renderGuide() {
    var wrap = ensureGuideHost();
    if (!wrap) return;
    wrap.querySelector('.p10-guide__title').textContent = t('p10.guide.title');
    wrap.querySelector('.p10-guide__toggle').textContent = t('p10.guide.toggle');
    var body = wrap.querySelector('.p10-guide__body');
    clear(body);
    body.appendChild(buildSection('p10.guide.quick.title', 'p10.guide.quick.items', true));
    body.appendChild(buildSection('p10.guide.pro.title', 'p10.guide.pro.items', false));
    body.appendChild(buildSection('p10.guide.params.title', 'p10.guide.params.items', false));
    body.appendChild(buildSection('p10.guide.modules.title', 'p10.guide.modules.items', false));
  }

  /* ---------------- 2. 设置行内的「P 值说明」 ---------------- */
  function renderPitchHelp() {
    var row = doc.querySelector('.pitch-settings-row');
    if (!row) return false;
    var box = byId('p10-pitch-help');
    if (!box) {
      box = mk('details', 'p10-pitch-help');
      box.id = 'p10-pitch-help';
      row.appendChild(box);            // 追加在原有 hint / error 之后
    }
    clear(box);
    box.appendChild(mk('summary', 'p10-pitch-help__title', t('p10.pitch.title')));
    var body = mk('div', 'p10-pitch-help__body');
    [
      'p10.pitch.definition', 'p10.pitch.purpose', 'p10.pitch.choose',
      'p10.pitch.firstUse', 'p10.pitch.switch', 'p10.pitch.caution',
    ].forEach(function (k) { body.appendChild(mk('p', 'p10-para', t(k))); });
    box.appendChild(body);
    return true;
  }

  /* ---------------- 3. 「可见 PX 来源标识」（悬浮在顶部单位分段旁） ----------------
     🔒 必须是 absolute 悬浮、挂在 .layout 之外的 header 内：
        · 挂 .panel--result 顶部 → 改变 C 栏内容高度，破坏 TK-141 /
          TC-H-14 滚动锚点（2026-11-07 A/B 判别实证 FAIL）；
        · 挂 .panel--input 组内 → 改变 A 栏内容高度，600px 收纳档下
          破坏 TC-H-11「三档关键元素可见可达」（同日 suite 实证，
          display:none 后恢复 93/93）。
        header 在 .layout 之外 + absolute 不占文档流 → 对三档布局零影响；
        且紧贴 px 单位按钮，仅在 px 模式显示，语义最贴切。 */
  /* ---------------- 3. 「可见 PX 来源标识」（header 右上紧凑徽标） ----------------
     🔒 三次实测定型的挂载规约（回归约束，长期保留）：
        · 挂 C 栏流内 → 破坏 TC-H-14 滚动锚点（改内容高度）；
        · 挂 A 栏流内 → 破坏 TC-H-11 三档可达（600px 档 scrollIntoView 残留）；
        · 挂 .app-header__actions → 该容器被 EL-HD-01 moveUnitSegment()
          迁空（0×0），是游离假象，不可用；
        · 最终：absolute 挂 .app-header__live（目标分辨率徽标）左侧空白，
          不进入任何文档流、不遮挡交互元素；仅 px 模式显示。 */
  function ensureSourceHost() {
    var anchor = doc.querySelector('.app-header__live');
    if (!anchor || anchor.getBoundingClientRect().width === 0) return null;
    var el = byId('p10-px-source');
    if (el && el.parentElement === anchor) return el;
    if (el) el.parentNode.removeChild(el);
    el = mk('div', 'p10-px-source');
    el.id = 'p10-px-source';
    el.setAttribute('role', 'status');
    anchor.appendChild(el);
    return el;
  }

  function renderSource() {
    var el = ensureSourceHost();
    if (!el) return;
    var lp = global.LedPitch;
    var snap = (lp && lp.snapshot) ? lp.snapshot() : null;
    var unit = (doc.querySelector('.unit-segment[aria-checked="true"]') || {}).getAttribute
      ? doc.querySelector('.unit-segment[aria-checked="true"]').getAttribute('data-unit') : null;
    var origin = snap ? snap.pxOrigin : null;
    clear(el);
    el.removeAttribute('title');
    // 堆叠档（≤1024 宽）输入面板上移至 header 行内，悬浮徽标会遮挡输入框
    // → 隐藏（断点适配约束：不得遮挡交互元素、不得影响断点切换）。
    var layoutEl = doc.querySelector('.layout');
    if (layoutEl && layoutEl.getAttribute('data-layout') === 'stacked') {
      el.setAttribute('data-origin', 'none');
      return;
    }
    if (unit !== 'px') {
      // 仅 px 模式显示；m/cm/mm 下隐藏（CSS data-origin="none"）
      el.setAttribute('data-origin', 'none');
      return;
    }
    var text, tip;
    if (origin === 'converted') {
      text = t('p10.px.badge.theory');
      tip = t('p10.px.originConvertedNote');
    } else {
      text = t('p10.px.badge.user');
      tip = t('p10.px.originDirectNote');
    }
    el.appendChild(mk('span', 'p10-px-source__value', text));
    el.setAttribute('title', tip);
    el.setAttribute('data-origin', origin || 'none');
  }

  /* ---------------- 4. 结果分层说明 + 局部帮助提示 ---------------- */
  var TIPS = [
    { sel: '#pitch-native-block > summary', key: 'p10.layer.theoryNote' },
    { sel: '#cabinet-verify-block > summary', key: 'p10.layer.cabinetNote' },
    { sel: '.panel--result .panel__title', key: 'p10.layer.actualNote' },
    { sel: '#input-tolerance', key: 'p10.guide.params.items' },
  ];

  function renderTips() {
    TIPS.forEach(function (item) {
      var node = doc.querySelector(item.sel);
      if (!node) return;
      node.setAttribute('title', t(item.key));
      // 表单控件是空元素，不能追加子节点，只用原生 title 提示。
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName)) return;
      var tip = node.querySelector(':scope > .p10-tip');
      if (!tip) {
        tip = mk('span', 'p10-tip', 'ⓘ');
        tip.setAttribute('aria-hidden', 'true');
        node.appendChild(tip);
      }
    });
  }

  /* ---------------- 5. 设置面板的语言切换 ---------------- */
  function renderLangPicker() {
    /* 语言切换入口挂在**桌面自绘设置模态**内（openSettingsModal 每次打开
       都重建 modalBody）——根 #settings-panel 在桌面版是 display:none 的
       隐藏浮层（架构审查 Blocker A1），挂那里用户永远看不到。
       挂载点 = .pitch-settings-row 之后（模态 body 末尾）；
       元素同一性移动（不重建）→ select 的 change 监听不重复绑定。 */
    var pitchRow = doc.querySelector('.pitch-settings-row');
    var modalBody = pitchRow ? pitchRow.parentElement : null;
    if (!modalBody) return;
    var wrap = byId('p10-lang');
    if (!wrap) {
      wrap = mk('div', 'settings-row p10-lang');
      wrap.id = 'p10-lang';
      var label = mk('label', 'group__label', '');
      label.id = 'p10-lang-label';
      var select = mk('select', 'input settings-input');
      select.id = 'p10-lang-select';
      select.setAttribute('aria-labelledby', 'p10-lang-label');
      ['zh-CN', 'en-US'].forEach(function (code) {
        var o = mk('option', '', '');
        o.value = code;
        o.setAttribute('data-key', code === 'zh-CN' ? 'p10.lang.zh' : 'p10.lang.en');
        select.appendChild(o);
      });
      select.addEventListener('change', function () {
        var i = global.LedI18N;
        if (i && i.setLocale) i.setLocale(select.value);
      });
      wrap.appendChild(label);
      wrap.appendChild(select);
    }
    if (wrap.parentElement !== modalBody) modalBody.appendChild(wrap);
    wrap.querySelector('#p10-lang-label').textContent = t('p10.lang.label');
    var sel = wrap.querySelector('#p10-lang-select');
    Array.prototype.forEach.call(sel.options, function (o) {
      o.textContent = t(o.getAttribute('data-key'));
    });
    var i = global.LedI18N;
    if (i && i.getLocale) sel.value = i.getLocale();
  }

  /* ---------------- 6. 统一重渲染 + 事件绑定 ---------------- */
  function renderAll() {
    renderGuide();
    renderPitchHelp();
    renderSource();
    renderTips();
    renderLangPicker();
  }

  var frame = 0;
  function schedule() {
    if (frame) return;
    frame = global.requestAnimationFrame(function () {
      frame = 0;
      renderSource();
    });
  }

  function start() {
    // desktop-ui.js 的 init() 与本文档可能同帧触发；重试等待设置行生成。
    var tries = 0;
    (function wait() {
      var ready = !!doc.querySelector('.pitch-settings-row');
      if (!ready && tries++ < 40) { global.setTimeout(wait, 50); return; }
      renderAll();
    })();

    // 设置模态内的 P 值行是打开时才动态生成的：行出现时自动补挂说明，
    // 语言切换由 renderAll() 清空重建，二者不会重复渲染。
    if (global.MutationObserver) {
      // 🔒 MO 回调内只挂 P 值说明，**禁止挂语言下拉**：
      //    2026-11-07 实证——MO 微任务内执行 renderLangPicker 会在打开设置
      //    模态瞬间触发 [RENDERER CRASH]（渲染进程级致命错误，无 JS 异常），
      //    语言下拉改由下方 500ms 轮询挂载。
      var mo = new MutationObserver(function () {
        if (!byId('p10-pitch-help') && doc.querySelector('.pitch-settings-row')) {
          renderPitchHelp();
        }
      });
      mo.observe(doc.body, { childList: true, subtree: true });
    }

    var i = global.LedI18N;
    if (i && i.onLocaleChange) i.onLocaleChange(renderAll);
    global.addEventListener('led:pitch', schedule);
    doc.addEventListener('input', schedule, true);
    doc.addEventListener('click', schedule, true);
    // 首次渲染后补一次（覆盖异步持久化回读）
    global.setTimeout(renderAll, 600);
    // 语言下拉轮询挂载：设置模态每次打开都重建 body（wrap 被移除），轮询重挂；
    // 500ms 轻量检查，物理上不可能触发 mutation 风暴（见上 MO 注释）。
    global.setInterval(function () {
      var row = doc.querySelector('.pitch-settings-row');
      if (!row) return;
      var wrap = byId('p10-lang');
      if (!wrap || wrap.parentElement !== row.parentElement) renderLangPicker();
    }, 500);
    // 语言下拉轮询挂载：模态每次打开都重建 body（wrap 被移除），轮询重挂；
    // 500ms 轻量检查，物理上不可能触发 mutation 风暴（见上 MO 注释）。
    global.setInterval(function () {
      var row = doc.querySelector('.pitch-settings-row');
      if (!row) return;
      var wrap = byId('p10-lang');
      if (!wrap || wrap.parentElement !== row.parentElement) renderLangPicker();
    }, 500);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // 只读诊断，供自动化测试读取，不提供可写入口
  global.LedGuideStatus = Object.freeze({
    version: '1.0.0',
    render: renderAll,
  });
})(typeof window !== 'undefined' ? window : this);
