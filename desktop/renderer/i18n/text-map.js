/**
 * LED Ratio Tool · Windows 桌面版 · 静态文本 → i18n key 映射表
 * ============================================================================
 * 用途：P4-2 运行时 DOM 级注入的**单一真源**。由 ⑦ 注入到桌面副本
 *       index.html，且必须在 i18n/index.js 之前加载。
 *
 * 🔒 单一真源：本文件同时供浏览器运行时与构建期（desktop-adapter.cjs 通过
 *    require 读取做一致性断言）使用，禁止在别处再复制一份 MAP。
 *    MAP 前 61 条 = 阶段 2 写好的 I18N_TEXT_MAP 原样迁入（仅将
 *    toleranceHint 那条改指向 html.hintTolerance）；后 9 条 = P4-2 补齐。
 *
 * 🔒 契约：
 *    · 每条 [zhText, key] 中 zhText 必须与桌面副本 index.html 的 TextNode
 *      trim() 后**逐字相等**（含全角标点、× ÷ ≈、Q：/A： 前缀、结尾句号）。
 *    · key 必须在 zh-CN 与 en-US 两包同时存在，且 zh-CN[key] === zhText
 *      —— 由 i18n/index.js 的 isKeySafe() 在打标前逐条校验。
 *    · 精确相等匹配，不用正则、不做模糊/前缀匹配。
 *
 * 🔒 运行环境：Electron renderer 为 contextIsolation=true /
 *    nodeIntegration=false / sandbox=true，普通 script 里**没有**
 *    module / exports / require。故 module 分支必须加 typeof 守卫。
 *
 * 🔒 零依赖、零网络、零 HTML 字符串改写：本文件只导出数据，不碰 DOM。
 */
'use strict';

(function (global) {
  /** [中文 TextNode 文本, i18n key] —— 共 70 条（61 迁入 + 9 补齐） */
  var MAP = [
    /* ---------- 阶段 2 I18N_TEXT_MAP 原样迁入（61 条） ---------- */
    ['按屏幕物理尺寸换算画布比例与视频像素尺寸', 'html.subtitle'],
    ['目标分辨率', 'html.liveLabel'],
    ['等待换算', 'html.liveWaiting'],
    ['屏幕输入', 'html.inputPanel'],
    ['屏幕尺寸', 'html.sizeGroup'],
    ['宽高互换', 'html.btnSwap'],
    ['恢复默认值', 'html.btnReset'],
    ['单位切换只改变显示值，物理尺寸与比例保持不变。', 'html.hintUnit'],
    ['目标比例来源', 'html.ratioSourceGroup'],
    ['以屏幕实际比例', 'html.ratioSourceScreen'],
    ['以选中标准比例', 'html.ratioSourceStandard'],
    ['自定义', 'html.ratioSourceCustom'],
    ['填写整数比例 a:b，系统按此比例换算。', 'html.hintCustomRatio'],
    ['标注「俗称」的条目（如 21:9）其严格数学比例一并给出，不作为精确值参与计算。', 'html.hintColloquial'],
    ['目标画布模式', 'html.canvasModeGroup'],
    ['按宽度', 'html.canvasModeWidth'],
    ['按高度', 'html.canvasModeHeight'],
    ['常用规格', 'html.canvasModePreset'],
    ['整数倍', 'html.canvasModeCustom'],
    ['目标宽度（px）', 'html.targetWidthGroup'],
    ['目标高度（px）', 'html.targetHeightGroup'],
    ['常用制作规格', 'html.presetGroup'],
    ['自定义整数比与上限', 'html.customRatioGroup'],
    ['以屏高定 k', 'html.preferHeight'],
    ['严格落在上限内', 'html.preferBounds'],
    ['两个解都会列出：以屏高定 k 给出精确整数倍；严格落在上限内的解单独标注。', 'html.hintPrefer'],
    ['现场参数（需现场确认，本工具不推导）', 'html.siteGroup'],
    ['② LED 控制系统接收分辨率', 'html.siteReceive'],
    ['③ 后期软件视频合成分辨率', 'html.siteComposite'],
    ['④ 实际交付的视频文件分辨率', 'html.siteDeliver'],
    ['① LED 实际物理尺寸即上方「屏幕尺寸」输入项。', 'html.hintSite'],
    ['演示案例', 'html.demoGroup'],
    ['完整显示', 'html.stageFitContain'],
    ['铺满', 'html.stageFitCover'],
    ['中心线', 'html.toggleCenter'],
    ['九宫格', 'html.toggleGrid'],
    ['换算结果', 'html.resultTitle'],
    ['需现场确认', 'html.resultBadge'],
    ['候选分辨率与匹配度', 'html.candidatesBlock'],
    ['常见比例匹配表', 'html.matchTableBlock'],
    ['画幅', 'html.colFrame'],
    ['精确比例', 'html.colExactRatio'],
    ['偏差', 'html.colDeviation'],
    ['标准', 'html.colStandard'],
    ['「俗称」条目为业界约定叫法，其严格数学比例一并列出，不作为精确值使用。', 'html.hintColloquialTable'],
    ['项目', 'html.colProject'],
    ['屏幕值', 'html.colScreenValue'],
    ['画布值', 'html.colCanvasValue'],
    ['复制分辨率', 'html.btnCopyResolution'],
    ['复制完整参数', 'html.btnCopyFull'],
    ['本工具计算的是画布比例及视频像素尺寸建议。实际交付分辨率应以 LED 控制系统、播放服务器及现场技术方提供的参数为准。', 'html.disclaimer'],
    ['计算规则说明', 'html.rulesBlock'],
    ['最简整数比：把宽高统一放大到 1/1000 毫米后取整为整数对，再用最大公约数约分，还原后相对误差 ≤ 0.0000001% 才判定为精确整数比。', 'html.hintSimplestRatio'],
    ['近似值：当整数约分无法无损还原时，用连分数求分母不超过 10000 的最近有理数逼近，并明确标注「近似」，绝不与精确值混同。', 'html.hintApprox'],
    ['取整策略：画布高度取整时，在相邻整数中挑选输出比例误差最小者，并与四舍五入结果同时列出，各自代价一目了然。', 'html.hintRounding'],
    ['误差定义：宽高比相对误差 = |输出比例 − 目标比例| ÷ 目标比例；像素尺寸误差 = |取整后尺寸 − 理论尺寸| ÷ 理论尺寸，二者独立计算、分别展示。', 'html.hintErrorDef'],
    ['常见问题', 'html.faqBlock'],
    ['现场参数注意事项', 'html.siteNotesBlock'],
    ['本工具输出的是「画布比例 + 视频像素尺寸建议」。第 ②③④ 层参数属于现场事实，必须以 LED 控制系统、播放服务器及现场技术方提供的数值为准；在这些参数确认前，本工具的结果仅作参考。', 'html.hintSiteNotes'],
    ['匹配容差百分比', 'dlg.settings.toleranceLabel'],
    // 🔴 原 key 为 dlg.settings.toleranceHint，其 zh 值写的是「%APPDATA%/settings.json」，
    //    与 index.html:41 的「保存在本机浏览器中。」不一致 → 改指向 html.hintTolerance
    //    （zh 值由语言包按 DOM 原文逐字填写），dlg.settings.* 仍归设置对话框专用。
    ['容差用于判定实际比例是否算作常见标准画幅，判定结果同时影响「非标准比例」提示。设置保存在本机浏览器中。', 'html.hintTolerance'],

    /* ---------- P4-2 补齐（9 条） ---------- */
    ['设置', 'html.btnSettings'],
    ['Q：为什么 14m × 4m 不是 21:9？', 'html.faq.q1'],
    ['A：14 ÷ 4 = 3.5，其最简整数比是 7:2；21:9 的严格数学比例是 7:3 ≈ 2.3333，两者相差 50%，属于非标准比例。', 'html.faq.a1'],
    ['Q：为什么 3840 × 1646 不等于 21:9？', 'html.faq.q2'],
    ['A：3840 ÷ 1646 ≈ 2.3329，其严格整数比是 1920:823，只是与 7:3 接近但并不相等；21:9 只是业界俗称。', 'html.faq.a2'],
    ['Q：物理尺寸能推出原生像素分辨率吗？', 'html.faq.q3'],
    ['A：不能。物理尺寸只决定比例，像素分辨率由 LED 箱体数量、控制系统与播放服务器共同决定，需现场确认。', 'html.faq.a3'],
    ['Q：比例不符时该裁切还是留黑边？', 'html.faq.q4'],
    ['A：两种都是等比适配，本工具一律不建议拉伸画面。内容比屏幕宽时优先裁切（不切掉上下字幕与台标），内容比屏幕窄时优先左右留黑边以保全画面。', 'html.faq.a4']
  ];

  /**
   * 豁免规则（声明式，便于构建期/测试期读取审计）。
   * 🔴 判定顺序：i18n/index.js 在**分通道之前**统一调用 EXEMPT.match()，
   *    否则纯文本元素会走通道 A 被误打标（px 提示 hint 即为此类）。
   * 支持的 type：
   *   key        —— 按 i18n key 精确豁免
   *   id         —— 按父元素 id 精确豁免（动态覆写防御）
   *   textPrefix —— 按 TextNode trim 后前缀豁免（key 变更时的兜底）
   */
  var EXEMPT_RULES = [
    {
      type: 'key', value: 'html.hintUnit',
      reason: 'desktop-ui.js 用 h.textContent.indexOf("单位切换只改变显示值") 定位 px 提示；打标会让 PX-09 提示切换整体失效（阶段 4 唯一登记的中文遗留 / 技术债）'
    },
    { type: 'textPrefix', value: '单位切换只改变显示值', reason: '同上，按文本兜底，防 key 变更' },
    { type: 'key', value: 'html.liveWaiting', reason: '#live-resolution-value 由 app.js 运行时覆写为实际分辨率' },
    { type: 'id', value: 'live-resolution-value', reason: '动态覆写防御' },
    { type: 'key', value: 'html.resultBadge', reason: '#result-badge 由 desktop-ui.js mirrorBadge() 动态覆写' },
    { type: 'id', value: 'result-badge', reason: '动态覆写防御' },
    { type: 'id', value: 'core-note', reason: '动态覆写防御（app.js buildCoreNote）' },
    { type: 'id', value: 'stage-badge', reason: '动态覆写防御' },
    { type: 'id', value: 'warn-text', reason: '动态覆写防御' },
    { type: 'id', value: 'live-results', reason: '动态覆写防御' },
    { type: 'id', value: 'live-feedback', reason: '动态覆写防御' }
  ];

  var EXEMPT = {
    rules: EXEMPT_RULES,

    /**
     * @param {Element|null} el    TextNode 的父元素
     * @param {string} key         i18n key
     * @param {string} text        TextNode trim 后的中文原文
     * @returns {Object|null}      命中的规则（供调用方计入 exempted），未命中返回 null
     */
    match: function (el, key, text) {
      for (var i = 0; i < EXEMPT_RULES.length; i++) {
        var r = EXEMPT_RULES[i];
        if (r.type === 'key' && r.value === key) return r;
        if (r.type === 'textPrefix' && typeof text === 'string' && text.indexOf(r.value) === 0) return r;
        if (r.type === 'id' && el && el.id === r.value) return r;
      }
      return null;
    }
  };

  var api = { MAP: MAP, EXEMPT: EXEMPT };

  // 浏览器侧（sandbox renderer 无 module，守卫不可省）
  global.LedI18NTextMap = api;

  // Node 侧：供 desktop-adapter.cjs / verify-adapter.mjs require 做一致性断言
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this);
