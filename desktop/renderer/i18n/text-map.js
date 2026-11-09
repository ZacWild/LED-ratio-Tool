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
    ['A：不能由物理尺寸单独确认。v1.3.0 的 P 值估算只是理论值，不等于控制器已确认的输入分辨率；实际像素分辨率仍由 LED 箱体数量、控制系统与播放服务器共同决定，需现场确认。', 'html.faq.a3'],
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


  /* ==================== S10-R8 批次 D · 动态文案单一真源 ====================
     app.js 是根 src/app.js 的同步副本（冻结，不得改写），其运行时生成的中文文案
     由 i18n/index.js 的执行器按当前语种重新生成。本表只提供数据，不碰 DOM。
     🔒 EXACT：中文原文 → key（精确相等）；
     🔒 TPL：[key, 正则源, zh 模板, en 模板]，捕获组按序作为 {0}{1}… 参数。
        zh 模板必须能逐字还原匹配到的原文，保证 zh-CN 下幂等。 */
  var DYNAMIC = {
    EXACT: {
      "单位切换只改变显示值，物理尺寸与比例保持不变。": "html.hintUnit",
      "PX 模式用于根据输入的像素宽高计算比例，不代表屏幕的实际物理尺寸。物理尺寸切换为 px 需按全局 LED 像素间距 P 换算；未配置 P 时禁止换算，可直接输入真实像素数量，原始物理尺寸保持不变。PX 输入与 P 值都不代表实际像素间距，也不能确认真实屏幕物理尺寸。": "html.hintPx",
      "21:9（俗称）": "dyn.list219Colloquial",
      "折叠": "dyn.collapse",
      "14m × 4m 超宽工程屏（3.5:1）": "dyn.demoWide",
      "载入": "dyn.demoLoad",
      "21:9（7:3）目标比例 · 3840px 宽": "dyn.demo219",
      "3440×1440 真实超宽分辨率": "dyn.demo3440",
      "16:9 标准屏（1920×1080 / 3840×2160）": "dyn.demo169",
      "65:36 变形比例（非 16:9）": "dyn.demo6536",
      "异常输入与数值健壮性": "dyn.demoInvalid",
      "非标准比例": "dyn.nonStandardRatio",
      "展开舞台": "dyn.expandStage",
      "比例": "dyn.anchorRatio",
      "候选": "dyn.anchorCandidates",
      "匹配": "dyn.anchorMatch",
      "误差": "dyn.anchorError",
      "复制": "dyn.anchorCopy",
      "实际物理尺寸": "dyn.colActualPhysical",
      "实际比例": "dyn.colActualRatio",
      "最简整数比": "dyn.colSimplestRatio",
      "目标画布分辨率": "dyn.colTargetResolution",
      "宽高比相对误差": "dyn.colAspectError",
      "像素尺寸误差": "dyn.colPixelError",
      "匹配判定": "dyn.colMatchVerdict",
      "等比适配方案": "dyn.colFitPlan",
      "输入尺寸": "dyn.colInputSize",
      "存在取整误差": "dyn.roundingError",
      "按宽度": "dyn.ftModeWidth",
      "设置": "dyn.ftSettings",
      "输入有误": "dyn.invalidInput",
      "请先修正左侧输入，右侧结果将自动更新。": "dyn.fixLeft",
      "输入有误，请修正屏幕尺寸。": "dyn.fixSize",
      "尺寸必须是有效数字（最多一位小数点）": "dyn.errDimensionFormat",
      "尺寸必须大于 0": "dyn.errDimensionPositive",
      "暂不可计算": "dyn.notComputable",
      "容差用于判定实际比例是否算作常见标准画幅，判定结果同时影响「非标准比例」提示。设置保存在本机（%APPDATA%/LED Ratio Tool/settings.json）。": "dyn.toleranceHint",
      "关闭": "dyn.closeModal",
      "确定": "dyn.ok",
      "关闭提示": "dyn.closeTip",
      "输入": "dyn.inputPanel",
      "如 14": "dyn.placeholder14",
      "如 4": "dyn.placeholder4",
      "减小宽度": "dyn.decWidth",
      "增大宽度": "dyn.incWidth",
      "减小高度": "dyn.decHeight",
      "增大高度": "dyn.incHeight",
      "单位切换": "dyn.unitSwitch",
      "按真实像素分辨率输入；物理尺寸 ↔ px 切换需按全局 LED 像素间距 P 换算，未配置 P 时禁止换算": "dyn.pxSegmentTip",
      "目标比例来源": "dyn.ratioSourceGroup",
      "目标画布模式": "dyn.canvasModeGroup",
      "如 1920 × 1080": "dyn.placeholder1920",
      "如 3840 × 2160": "dyn.placeholder3840",
      "屏幕比例可视化": "dyn.stagePanel",
      "换算结果": "dyn.resultPanel",
      "结果分段快速跳转": "dyn.anchorBar",
      "状态栏": "dyn.statusBar",
      "当前单位": "dyn.ftUnitTip",
      "当前屏幕实际比例": "dyn.ftRatioTip",
      "当前画布模式": "dyn.ftModeTip",
      "匹配状态徽标（与结果栏同源）": "dyn.ftBadgeTip",
      "布局档位": "dyn.ftLayoutTip",
      "状态提示（复制结果等）": "dyn.ftMessageTip",
      "设置（Ctrl+,）": "dyn.ftSettingsTip",
      "系统显示缩放档位（DPR 仅用于诊断，不参与布局计算）": "dyn.ftScaleTip",
      "当前首个错误（点击跳转到该字段）": "dyn.ftErrorTip",
      "LED Ratio Tool 标志": "dyn.logoAlt",
      "按目标宽度（当前）": "dyn.modeWidthCurrent",
      "按目标高度": "dyn.modeHeight",
      "Δ 存在取整误差": "dyn.deltaRounding",
      "✓ 严格匹配": "dyn.exactMatch",
      "等比适配：比例一致，无需裁切或补边（不建议拉伸）": "dyn.aspectFitMatch",
      "最接近": "dyn.closest",
      "非标准": "dyn.nonStandard",
      "俗称": "dyn.colloquial",
      "展开说明": "dyn.expandNotes",
      "收起说明": "dyn.collapseNotes",
      "请设置目标宽度、高度，或选择常用规格 / 自定义整数比。": "dyn.targetHint",
      "真实计算比例 3.5，最简整数比 7:2；4900px 宽 → 4900×1400 严格匹配；不会被误判为 21:9。": "dyn.demoTip1",
      "严格整数比 7:3；3840px 宽理论高 1645.7143px，取整 1646px，比例有微小误差（非严格匹配）。": "dyn.demoTip2",
      "严格比例 43:18 ≈ 2.3889，不是 21:9；与 2.39:1 接近。": "dyn.demoTip3",
      "两种分辨率都严格命中 16:9，不产生任何取整误差。": "dyn.demoTip4",
      "1920px 宽理论高 1063.3846px，整数 1920×1063 非严格匹配并显示误差；精确整数倍方案为 1950×1080。": "dyn.demoTip5",
      "本案例故意不填尺寸，用于演示错误提示。空/0/负数/非法字符分别返回对应错误；单位切换不改变比例；宽高互换比例反转；极端长宽比不产生 NaN/Infinity。": "dyn.demoTip6",
      "三面板纵向堆叠": "dyn.ftStackedLabel",
      "用于视频制作、画布设置与 LED 屏幕比例换算。切换 P 值不改变这些结果。": "dyn.panelResultTip",
      "屏幕物理尺寸：LED 屏实际宽高，是比例与理论估算的输入|画布比例：当前宽高比与最简整数比|目标比例：要适配的画布比例|候选分辨率：按目标比例给出的整数尺寸建议|换算偏差：候选尺寸与目标比例的差异|容差设置：判断候选结果是否可接受的最大偏差百分比|理论估算值：由物理尺寸 ÷ P 推得，不等于控制器已确认分辨率|箱体规格差异告警：拼接规格与理论估算不一致时明确提示|单位切换及结果来源：m / cm / mm 只改变显示值；px 模式会标明数值是理论推算还是用户输入": "dyn.toleranceInputTip",
      "匹配容差百分比": "dyn.settingsToleranceLabel",
      "Q：为什么 14m × 4m 不是 21:9？": "dyn.faqQ1",
      "A：14 ÷ 4 = 3.5，其最简整数比是 7:2；21:9 的严格数学比例是 7:3 ≈ 2.3333，两者相差 50%，属于非标准比例。": "dyn.faqA1",
      "Q：为什么 3840 × 1646 不等于 21:9？": "dyn.faqQ2",
      "A：3840 ÷ 1646 ≈ 2.3329，其严格整数比是 1920:823，只是与 7:3 接近但并不相等；21:9 只是业界俗称。": "dyn.faqA2",
      "Q：物理尺寸能推出原生像素分辨率吗？": "dyn.faqQ3",
      "A：不能由物理尺寸单独确认。v1.3.0 的 P 值估算只是理论值，不等于控制器已确认的输入分辨率；实际像素分辨率仍由 LED 箱体数量、控制系统与播放服务器共同决定，需现场确认。": "dyn.faqA3",
      "Q：比例不符时该裁切还是留黑边？": "dyn.faqQ4",
      "A：两种都是等比适配，本工具一律不建议拉伸画面。内容比屏幕宽时优先裁切（不切掉上下字幕与台标），内容比屏幕窄时优先左右留黑边以保全画面。": "dyn.faqA4",
    },
    TPL: [
      ["dyn.fitCrop", "^适配：需裁切（左右各 (.+)）$", "适配：需裁切（左右各 {0}）", "Fit: crop {0} on each side"],
      ["dyn.cropOnly", "^需裁切（左右各 (.+)）$", "需裁切（左右各 {0}）", "Crop {0} on each side"],
      ["dyn.integerRatioSuffix", "^（整数比 (.+)）$", "（整数比 {0}）", " (integer ratio {0})"],
      ["dyn.coreNotePhysical", "^屏幕实际尺寸 (.+) · 目标比例取自屏幕实际比例 · 画布 (.+)$", "屏幕实际尺寸 {0} · 目标比例取自屏幕实际比例 · 画布 {1}", "Screen physical size {0} | target ratio from actual screen ratio | canvas {1}"],
      ["dyn.coreNotePx", "^输入像素尺寸 (.+) · 目标比例取自屏幕实际比例 · 画布 (.+)$", "输入像素尺寸 {0} · 目标比例取自屏幕实际比例 · 画布 {1}", "Input pixel dimensions {0} | target ratio from actual screen ratio | canvas {1}"],
      ["dyn.liveResults", "^实际比例 (.+) 比 (.+)，存在取整误差，画布 (.+) 乘 (.+)$", "实际比例 {0} 比 {1}，存在取整误差，画布 {2} 乘 {3}", "Actual ratio {0} to {1}, rounding error present, canvas {2} by {3}"],
      ["dyn.ftLayoutStacked", "^(.+)（窄窗口） · 极低高度$", "{0}（窄窗口） · 极低高度", "{0} (narrow window) | very low height"],
      ["dyn.warnColloquial", "^目标比例不属于常见标准画幅（容差 (.+)）。目标比例与俗称 (.+)（严格值 (.+)）相差 (.+)，不能按 .+ 处理。$", "目标比例不属于常见标准画幅（容差 {0}）。目标比例与俗称 {1}（严格值 {2}）相差 {3}，不能按 {1} 处理。", "The target ratio is not a common standard frame (tolerance {0}). It differs from the colloquial {1} (strict value {2}) by {3}, so it must not be treated as {1}."],
      ["dyn.theoreticalHeight", "^理论高 (.+)px$", "理论高 {0}px", "Theoretical height {0} px"],
      ["dyn.theoreticalWidth", "^理论宽 (.+)px$", "理论宽 {0}px", "Theoretical width {0} px"],
      ["dyn.actualPixelRatio", "^实际像素比例 (.+)$", "实际像素比例 {0}", "Actual pixel ratio {0}"],
      ["dyn.targetScreenRatio", "^目标屏幕比例 (.+)$", "目标屏幕比例 {0}", "Target screen ratio {0}"],
      ["dyn.aspectError", "^与目标比例的宽高比误差 (.+)$", "与目标比例的宽高比误差 {0}", "Aspect ratio error vs target {0}"],
      ["dyn.pixelSizeError", "^像素尺寸误差 (.+)$", "像素尺寸误差 {0}", "Pixel size error {0}"],
      ["dyn.aspectFitCrop", "^等比适配：需裁切（左右各 (.+)）（不建议拉伸）$", "等比适配：需裁切（左右各 {0}）（不建议拉伸）", "Aspect fit: crop {0} on each side (stretch not recommended)"],
      ["dyn.strictRatioTitle", "^严格数学比例 (.+)$", "严格数学比例 {0}", "Strict mathematical ratio {0}"],
      ["dyn.exactValueTitle", "^精确值 (.+)$", "精确值 {0}", "Exact value {0}"],
      ["dyn.canvasLabel", "^(.+) 画布$", "{0} 画布", "{0} canvas"],
      ["dyn.ftLayoutGeneric", "^(.+) · (.+)$", "{0} · {1}", "{0} | {1}"],
    ]
  };
  var api = { MAP: MAP, EXEMPT: EXEMPT, DYNAMIC: DYNAMIC };

  // 浏览器侧（sandbox renderer 无 module，守卫不可省）
  global.LedI18NTextMap = api;

  // Node 侧：供 desktop-adapter.cjs / verify-adapter.mjs require 做一致性断言
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this);
