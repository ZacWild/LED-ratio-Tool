/**
 * LED-ratio-Tool 桌面版 · 窗口几何预算（方案 A · 纯函数模块）
 * ============================================================================
 * 职责：把「窗口该开多大、开在哪」这件事变成**可单测的纯计算**，
 *      Electron 交互（创建窗口 / 实测 / 摆位）留在 main.js。
 *
 * 🔒 本模块**零依赖**（不 require electron）—— 几何单元测试可以直接 require 它，
 *    不必启动 Electron 进程。
 *
 * 🔒 SEC-01：本模块只做**窗口几何**，不含任何业务换算（core.js 的领域）。
 *
 * ---------------------------------------------------------------------------
 * 为什么需要它（实测根因，P7-DPI-09 Remediation）
 * ---------------------------------------------------------------------------
 * 旧算法只从工作区扣 EDGE_MARGIN，不扣原生非客户区：
 *     contentH = max(min(TARGET_H, workArea.height - EDGE_MARGIN), MIN_CONTENT_H)
 *
 * 而 Windows 在创建窗口时**自己会做一次限位**，但它的限位口径是
 * 「客户区 + 标题栏/边框」——**不含原生菜单栏**：
 *     实测：请求客户区 3000×2000 → Windows 限成 客户区 = workArea.height − 39
 *     （39 = 标题栏 + 边框，@100% 实测）
 *
 * 本项目 `autoHideMenuBar: false` 且设置了应用菜单，真实非客户区是
 *     39（标题栏+边框） + 26（原生菜单栏） = 65
 *     （实测：autoHideMenuBar:true 的窗口 delta 高 = 39；:false 的窗口 delta 高 = 65）
 *
 * 于是最终外框高 = (workArea.height − 39) + 65 = workArea.height + 26
 * → **底部恒定超出工作区 26 DIP**，与 DPI-09 历史实测 overBottom = 26 完全吻合。
 *
 * ⚠️ 旧代码里的 `39 * sf` 估算**恰好等于 Windows 自己的限位口径**，
 *    所以「看起来算过了」，实际漏计了菜单栏 26 —— 这就是那 26 DIP 的来源。
 *
 * ---------------------------------------------------------------------------
 * 方案 A 的做法
 * ---------------------------------------------------------------------------
 * 不再依赖任何推算，也**不依赖 Windows 的自动限位**（实测它按 −39 限位，
 * 同样漏菜单栏；`maxWidth/maxHeight` 亦然）。改为：
 *   ① 运行时**实测** frameDelta = getBounds() − getContentBounds()
 *   ② 预算：maxContent = workArea − EDGE_MARGIN − frameDelta
 *   ③ 客户区 = min(TARGET, maxContent)，且不低于 MIN_CONTENT
 *   ④ 工作区连最小窗口都装不下时 → **如实标记**，不偷偷缩小 DEC-07 下限
 */

/* ==========================================================================
   单一真源常量（main.js 与本模块共用，禁止在别处复制粘贴）
   ========================================================================== */
const WINDOW_GEOMETRY = Object.freeze({
  /** DEC-07 最小**客户区**（DIP）—— 本轮不修改 */
  minContentWidth: 1024,
  minContentHeight: 680,
  /** DEC-09 启动目标**客户区**（DIP）—— 本轮不修改 */
  targetWidth: 1440,
  targetHeight: 900,
  /** 窗口与工作区边缘的呼吸间距（DIP）—— 本轮不修改 */
  edgeMargin: 32,
});

/* ==========================================================================
   纯函数
   ========================================================================== */

/**
 * 计算客户区尺寸预算（方案 A 核心公式）。
 *
 * @param {object} p
 * @param {{width:number,height:number}} p.workArea   目标显示器工作区（DIP）
 * @param {{width:number,height:number}} p.frameDelta  实测非客户区增量（DIP）
 * @param {object} [p.options] 覆盖默认常量（仅供单元测试）
 * @returns {object} 预算结果
 */
function computeContentBudget({ workArea, frameDelta, options = {} }) {
  const g = { ...WINDOW_GEOMETRY, ...options };

  // ① 扣除「间距 + 实测外框增量」后，工作区最多能容纳多少客户区
  const maxContentWidth = workArea.width - g.edgeMargin - frameDelta.width;
  const maxContentHeight = workArea.height - g.edgeMargin - frameDelta.height;

  // ② 目标尺寸不得超过可用预算
  const desiredWidth = Math.min(g.targetWidth, maxContentWidth);
  const desiredHeight = Math.min(g.targetHeight, maxContentHeight);

  // ③ DEC-07 下限：**不得为了通过而下调**
  const contentWidth = Math.max(desiredWidth, g.minContentWidth);
  const contentHeight = Math.max(desiredHeight, g.minContentHeight);

  // ④ 工作区是否容得下产品最小窗口
  const fitsMinimum = maxContentWidth >= g.minContentWidth && maxContentHeight >= g.minContentHeight;

  return {
    contentWidth,
    contentHeight,

    /** 可用预算（未被 MIN 夹紧前的实际值） */
    maxContentWidth,
    maxContentHeight,
    desiredWidth,
    desiredHeight,

    /** 是否触到 DEC-07 下限（客户区恰好等于 MIN_CONTENT_*） */
    atMinimum:
      contentWidth === g.minContentWidth || contentHeight === g.minContentHeight,
    /** 是否**因** DEC-07 下限被抬高（desired < MIN → content > desired） */
    clampedToMinimum: contentWidth !== desiredWidth || contentHeight !== desiredHeight,

    /** false = 当前工作区**无法容纳**产品最小窗口（必须如实报告，不得伪装通过） */
    fitsMinimum,
    exceedsMinimum: !fitsMinimum,
    /** 工作区距离容纳最小窗口还差多少 */
    shortfall: {
      width: Math.max(0, g.minContentWidth - maxContentWidth),
      height: Math.max(0, g.minContentHeight - maxContentHeight),
    },
    /** 容纳产品最小窗口所需的最低工作区（供 DPI-09 的 BLOCKED 记录使用） */
    requiredWorkArea: {
      width: g.minContentWidth + g.edgeMargin + frameDelta.width,
      height: g.minContentHeight + g.edgeMargin + frameDelta.height,
    },
    /** 容纳目标尺寸所需的最低工作区 */
    requiredWorkAreaForTarget: {
      width: g.targetWidth + g.edgeMargin + frameDelta.width,
      height: g.targetHeight + g.edgeMargin + frameDelta.height,
    },
    edgeMargin: g.edgeMargin,
    frameDelta: { width: frameDelta.width, height: frameDelta.height },
  };
}

/**
 * 计算窗口位置 —— 外框在**工作区内居中**。
 *
 * 🔴 与旧行为的差异（有意为之）：Windows 默认按**屏幕 bounds** 居中，
 *    任务栏在底部时窗口会偏下；本函数按**工作区**居中，
 *    保证外框四边都在 workArea 内（DEC-09「适应目标屏幕可用工作区」）。
 *
 * @param {object} p
 * @param {{x:number,y:number,width:number,height:number}} p.workArea
 * @param {{width:number,height:number}} p.frameSize 外框尺寸（DIP）
 * @returns {{x:number,y:number}}
 */
function computeWindowPosition({ workArea, frameSize }) {
  const x = Math.round(workArea.x + (workArea.width - frameSize.width) / 2);
  const y = Math.round(workArea.y + (workArea.height - frameSize.height) / 2);
  return { x, y };
}

/**
 * 把外框夹紧到工作区内（处理负坐标、超出、任务栏缩减等）。
 *
 * @param {object} p
 * @param {{x:number,y:number,width:number,height:number}} p.workArea
 * @param {{width:number,height:number}} p.frameSize
 * @param {{x:number,y:number}} [p.desired] 期望位置（缺省=工作区内居中）
 * @returns {{x:number,y:number,clamped:boolean}}
 */
function clampWindowPosition({ workArea, frameSize, desired }) {
  const base = desired || computeWindowPosition({ workArea, frameSize });
  const maxX = workArea.x + workArea.width - frameSize.width;
  const maxY = workArea.y + workArea.height - frameSize.height;
  const x = Math.min(Math.max(base.x, workArea.x), Math.max(workArea.x, maxX));
  const y = Math.min(Math.max(base.y, workArea.y), Math.max(workArea.y, maxY));
  return { x, y, clamped: x !== base.x || y !== base.y };
}

/**
 * 四边核验：窗口外框是否完整落在工作区内。
 *
 * 🔴 本函数是 DPI-09 的**唯一**几何判据 —— 四条边全过才算 fits。
 *
 * @param {{x:number,y:number,width:number,height:number}} bounds  外框
 * @param {{x:number,y:number,width:number,height:number}} workArea
 * @returns {{fits:boolean, overflow:{left:number,top:number,right:number,bottom:number}, edges:{...}}}
 */
function checkFitsWorkArea(bounds, workArea) {
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;

  const overflow = {
    left: Math.max(0, workArea.x - left),
    top: Math.max(0, workArea.y - top),
    right: Math.max(0, right - workRight),
    bottom: Math.max(0, bottom - workBottom),
  };

  return {
    fits: overflow.left === 0 && overflow.top === 0 && overflow.right === 0 && overflow.bottom === 0,
    overflow,
    edges: { left, top, right, bottom },
    workAreaEdges: { left: workArea.x, top: workArea.y, right: workRight, bottom: workBottom },
  };
}

/**
 * Chromium / Electron 的最小尺寸换算。
 *
 * 🔴 实测事实（test/probe-min-size.cjs + test/probe-min-visible.cjs）：
 *
 *   ① **构造参数** `minWidth/minHeight` = **客户区口径**，Chromium 内部会换算成
 *      Windows 的 min track size（**外框**口径）并自动加上边框：
 *          声明 1024×680 → getMinimumSize() = [1040, 745]
 *          （= 1024+16 / 680+39 —— 加的是**边框**，不含原生菜单栏 26）
 *      但客户区 = 外框 − (16, **65**)，于是客户区实际下限 = 1024 × **654**
 *      → **声明的 680 守不住**，用户实际只能拖到 654 高（README §6 记录的既存限制）。
 *
 *   ② **`setMinimumSize(w,h)`** = **外框口径且不自动加边框**：
 *          setMinimumSize(1024, 706) → getMinimumSize() = [1024, 706]（原样）
 *      → 传客户区口径的数字给它会**把下限调低**（实测客户区掉到 1008×641）。
 *
 *   ③ 🔴 **「min track 口径」与「frameDelta 口径」不是同一套换算**（本轮实测发现）：
 *          frameDelta（getBounds − getContentBounds）= 15×64 @125%
 *          但「min track → 客户区下限」的实测换算量 = **12×63**
 *      两者差 3×1 —— 差额来自 Windows 11 的**不可见缩放边框**
 *      （resize border 计入 min track，但不计入 getBounds）。
 *      ⇒ 若按 `客户区 + frameDelta` 下发 min track，**下限会被顶高**：
 *          setMinimumSize(1040, 745) → 客户区下限 **1028×682**（超 4×2）
 *          → 宽度 1024 档（≤1024 的堆叠布局）**永远不可达**
 *          → Desktop E2E 的 TC-DP-04 判 BLOCKED。
 *
 *   ④ 因此 min track **不能由 frameDelta 换算得出**，必须**实测标定**：
 *      先设初值 → 实测客户区下限 → 若下限 > DEC-07 则**逐步下调** min track，
 *      直到下限**恰好等于** DEC-07（实测标定落在 1036~1037 × 742~745 @125%）。
 *
 *   ⑤ 平台量化（实测）：125% 下 `setContentSize(1024, 680)` 恒回读 **1024×681**
 *      （高度 680×1.25=850 物理像素需向上取整到 8px 网格）。
 *      这与 min track 无关，是 **DIP→物理像素的系统取整**，非产品缺陷。
 *
 * @param {object} p
 * @param {{width:number,height:number}} p.frameDelta 实测非客户区增量（DIP）
 * @param {{width:number,height:number}} [p.minTrackDelta]
 *        **实测标定**的「min track → 客户区」换算量（DIP）。
 *        缺省时回退到 `frameDelta`（仅在未标定时使用，实际由 main.js 标定后传入）。
 * @param {object} [p.options] 覆盖默认常量
 * @returns {{minWidth:number,minHeight:number}} **外框口径**的 min track size
 */
function computeMinTrackSize({ frameDelta, minTrackDelta, options = {} }) {
  const g = { ...WINDOW_GEOMETRY, ...options };
  // 🔴 优先使用实测标定值；无标定值时才回退 frameDelta（并由调用方做实测验证）。
  const d = minTrackDelta || frameDelta;
  return {
    minWidth: g.minContentWidth + d.width,
    minHeight: g.minContentHeight + d.height,
  };
}

/**
 * 标定「min track → 客户区下限」的换算量。
 *
 * 🔴 纯函数部分：给定一次实测结果，算出「下一次该把 min track 调多少」。
 *    实际的「设置 → 实测」往返在 main.js 中完成（需要真实 BrowserWindow）。
 *
 * 标定策略（依据 computeMinTrackSize 的实测结论 ③④）：
 *   · min track 偏大 → 客户区下限被顶高（1024 档不可达）→ 必须**下调** min track
 *   · min track 偏小 → 客户区下限低于 DEC-07 → **破坏 DEC-07**，不可接受
 *   ⇒ 目标：让下限**恰好等于** DEC-07
 *     （若平台量化使其不可精确命中，则取「≥ DEC-07 的最小可达值」，并如实记录）。
 *
 * @param {object} p
 * @param {{minWidth:number,minHeight:number}} p.currentMinTrack 当前下发的 min track（外框口径）
 * @param {{width:number,height:number}} p.actualMinContent 实测客户区下限（DIP）
 * @param {{width:number,height:number}} [p.target] 目标客户区下限（默认 DEC-07）
 * @returns {{minWidth:number,minHeight:number,adjusted:boolean,excess:{width:number,height:number}}}
 */
function calibrateMinTrack({ currentMinTrack, actualMinContent, target }) {
  const g = target || { width: WINDOW_GEOMETRY.minContentWidth, height: WINDOW_GEOMETRY.minContentHeight };

  // 实测下限超出目标的量 = min track 需要下调的量
  const excess = {
    width: actualMinContent.width - g.width,
    height: actualMinContent.height - g.height,
  };

  // 🔴 **分轴判定**：宽度与高度会因平台量化（Windows 不可见缩放边框 +
  //    DIP→物理像素取整）而不同步 —— 实测 125% 下宽度可精确命中 1024，
  //    高度恒被顶到 682。若按「双轴同时达标」判定，会继续下调高度，
  //    实测 1037×740 → 下限 1024×678 → **跌破 DEC-07 的 680**。
  //    ⇒ 任一轴已达标即**停止下调**，保留已实测的合格下限。
  const widthOk = excess.width <= 0;
  const heightOk = excess.height <= 0;
  if (widthOk || heightOk) {
    return {
      minWidth: currentMinTrack.minWidth,
      minHeight: currentMinTrack.minHeight,
      adjusted: false,
      excess,
    };
  }

  // 下调 min track（不得低于客户区下限本身，否则下限会跌破 DEC-07）
  return {
    minWidth: Math.max(g.width, currentMinTrack.minWidth - excess.width),
    minHeight: Math.max(g.height, currentMinTrack.minHeight - excess.height),
    adjusted: true,
    excess,
  };
}

/**
 * 从实测 frameDelta 中拆出「原生菜单栏高度」。
 *
 * 依据实测：delta.height = 标题栏+边框(39 @100%) + 菜单栏(26 @100%)；
 * 边框部分可由 `autoHideMenuBar:true` 的对照窗口测得。
 * 本函数接受**两个**实测值做差，避免依赖任何硬编码常量。
 *
 * @param {{height:number}} withMenuBar   有菜单栏窗口的 delta
 * @param {{height:number}} withoutMenuBar 无菜单栏窗口的 delta
 * @returns {number} 菜单栏高度（DIP）
 */
function deriveMenuBarHeight({ withMenuBar, withoutMenuBar }) {
  return Math.max(0, withMenuBar.height - withoutMenuBar.height);
}

module.exports = {
  WINDOW_GEOMETRY,
  computeContentBudget,
  computeWindowPosition,
  clampWindowPosition,
  checkFitsWorkArea,
  computeMinTrackSize,
  calibrateMinTrack,
  deriveMenuBarHeight,
};
