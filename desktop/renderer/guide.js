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
  function ensureSourceHost() {
    var el = byId('p10-px-source');
    if (el) return el;
    var anchor = doc.querySelector('.app-header__actions');
    if (!anchor) return null;
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
    var label = t('p10.px.originLabel');
    var value, note;
    if (unit !== 'px') {
      value = t('p10.px.none');
      note = '';
    } else if (origin === 'converted') {
      value = t('p10.px.originTheory');
      note = t('p10.px.originConvertedNote');
    } else {
      value = t('p10.px.originUser');
      note = t('p10.px.originDirectNote');
    }
    clear(el);
    el.appendChild(mk('span', 'p10-px-source__label', label + '：'));
    el.appendChild(mk('span', 'p10-px-source__value', value));
    if (note) el.appendChild(mk('span', 'p10-px-source__note', note));
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
    var panel = byId('settings-panel') || doc.querySelector('.settings');
    if (!panel) return;
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
      panel.appendChild(wrap);
    }
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
