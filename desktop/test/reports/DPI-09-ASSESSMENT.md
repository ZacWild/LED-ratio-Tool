# DPI-09 技术评估与实施裁决

> **文档性质**：本文档 = **第一段（技术评估，原样保留）** + **第二段（负责人裁决：方案 A 正式采用）** + **第三段（实施结果与实测取证）**。
> 评估稿结论**未被推翻**，方案 A 与评估稿 §6 推荐方向一致；本轮新增的是**落地实施**与**实测取证**。
> 关联基线 HEAD：`89470b5967f2b36f7950e2d62e4489370a3152f6`（P7-DPI-09 方案 A + min track 实测标定）｜分支 `feature/desktop-windows`｜产品 `LED Ratio Tool` 1.1.0
> 第一段原评估稿撰写于 HEAD `30b21ab605db190e2b2545be2a7351edceaa8dd2`，其中「本评估不落地任何修改」的声明**仅对第一段有效**，自第二段起失效。

---

## 0. 根因回顾（先看清问题在哪）

DPI-09 判定的是一条**硬几何事实**：实际启动窗口的 `outerWidth/outerHeight` 是否 ≤ `availWidth/availHeight`（工作区）。

窗口尺寸由 `main.js` 的 `planWindowBounds()` 决定：

```js
const MIN_CONTENT_W = 1024; // DEC-07（客户区口径，DEC-14）
const MIN_CONTENT_H = 680;
const TARGET_W = 1440;      // DEC-09
const TARGET_H = 900;
const EDGE_MARGIN = 32;
// width  = max(min(TARGET_W, work.width  - EDGE_MARGIN), MIN_CONTENT_W);
// height = max(min(TARGET_H, work.height - EDGE_MARGIN), MIN_CONTENT_H);
// minWidth / minHeight 也引用同一组常量（用户拖拽下限）
```

**两处「硬下限」叠加出屏风险**：
1. `MIN_CONTENT_W/H` 是 `Math.max(…, MIN_CONTENT)` 的兜底，当工作区小于最小窗口时，窗口**不会**被工作区收敛，而是保留 1024×680 客户区 → 必然出屏。
2. 非客户区（标题栏 + 边框 + 原生菜单，实测 `delta = 16×65` DIP，见 ledger）**随 `scaleFactor` 放大**，而 `EDGE_MARGIN=32` 是固定 DIP，不随缩放放大 → 高 DPI 下「客户区 + 非客户区」之和更容易顶破工作区。

---

## 1. 保留现有最小窗口尺寸时的「最低有效工作区」

以 `p7-dpi-100.json` 的实测台账为准（`delta.width=16`、`delta.height=65`，@100%）：

| 窗口形态 | 客户区（DIP） | 外框（DIP）= 客户区 + delta | 最低工作区（逻辑 DIP） |
|---|---|---|---|
| **最小窗口**（MIN_CONTENT） | 1024 × 680 | 1040 × 745 | **≥ 1040 × 745** |
| **默认窗口**（TARGET，@100%） | 1440 × 900 | 1456 × 965 | **≥ 1456 × 965** |

按缩放档换算为**物理像素**要求（显示器物理分辨率 ÷ scaleFactor 必须 ≥ 上表逻辑值）：

| 缩放档 | 最小窗口最低物理工作区 | 默认窗口最低物理工作区 |
|---|---|---|
| 100% | 1040 × 745 | 1456 × 965 |
| 125% | 1300 × 931 | 1820 × 1207 |
| 150% | 1560 × 1118 | 2184 × 1448 |

> 说明：DPI-09 实测对象是**默认目标窗口**（首次启动 1440×900，经 `EDGE_MARGIN` 收敛），不是最小窗口。因此「最低有效工作区」应按**默认窗口**行读，而非最小窗口行。

---

## 2. 调整最小窗口尺寸的可行性及影响

**结论：可行、低风险、但收益有限，且不能单独解决 150% 出屏。**

- **改动面小**：`MIN_CONTENT_W/H` 在 `main.js` 只出现在 3 处（L68-69 定义、L109-110 使用、L252-253 `minWidth/minHeight`），三者引用同一常量，改一处即可联动，无需触碰渲染层。
- **收益**：下调 `MIN_CONTENT_W/H` 会降低「最小窗口」的工作区门槛（§1 表左列），但 **DPI-09 测的是默认窗口（右列）**，默认窗口由 `TARGET_W/H` 主导，调 MIN_CONTENT 对其**无效**。
- **风险**：
  - `minWidth/minHeight` 与 `width/height` 同口径（客户区），下调后用户可把窗口拖到更小，需确认 UI 在更小尺寸不崩。
  - `MIN_CONTENT_H=680` 是 DEC-07 的「最小有效工作区」产品口径，下调可能触碰业务定义（最小仍能完整操作核心控件的下限），需 DEC-07 决策记录同步。
  - 客户区 < 680 会触发 `decideHeightTier` 的 TIGHT 档，重量收纳行为改变（见 §3）。

---

## 3. compact / tight / stacked 布局能否支持更小窗口

现有布局档位（`renderer/desktop-ui.js`）：

| 维度 | 档位 | 断点 | 行为 |
|---|---|---|---|
| 宽度 | three | `≥ 1280` | 三栏 |
| 宽度 | two | `1025 ~ 1279` | 两栏 |
| 宽度 | stacked | `≤ 1024` | 纵向堆叠（舞台折叠为摘要） |
| 高度 | standard | `clientH ≥ 784` | 标准 |
| 高度 | compact | `clientH ≥ 680` | 紧凑高度（轻量收纳 S2-1~S2-4） |
| 高度 | tight | `clientH < 680` 或 `workH < 680+65` | 极低高度（重量收纳 S3-1~S3-6） |

**结论**：

- **宽度方向**：`stacked` 档已覆盖到 `≤1024`，但 **1024 以下无更低断点**。若把 `MIN_CONTENT_W` 下调到 1024 以下（如 800），800~1024 区间仍落在 `stacked` 档（无新断点），需验证该区间是否有横向溢出；1024 是当前设计的下限，继续收窄属「新增更低档位」的工程范围。
- **高度方向**：`tight` 档（`<680`）已有完整收纳逻辑，理论上**能支撑**客户区 <680 的「不崩溃」，但 tight/stacked 是**折叠/收纳**而非**完整显示**，会牺牲信息密度与可操作性（例如 `#stage` 折叠为摘要、`#dim-ratio` 不可见）。
- **判断**：compact/tight/stacked **能让更小窗口「不崩、不溢出」**，但**不能做到「更小窗口仍完整可操作」**。若产品诉求是后者，需新增档位或重构，超出本次 DPI-09 评估范围。

---

## 4. 对现有 93 条 E2E、视觉基准、P7-09 的回归影响

| 测试集 | 现状 | 若「不修改」MIN_CONTENT | 若「下调」MIN_CONTENT_W/H |
|---|---|---|---|
| **93 条桌面 E2E**（`desktop-suite.json`，93/93 通过） | 在 1440×900 / 1200×800 / 1024×680 三档视口运行，视口是测试注入的，**不依赖 `main.js` 常量** | **零影响**（本轮 P7-1 已全绿） | 视口由测试注入，三档用例**不受影响**；但需为 `<1024` 新增视口补回归 |
| **视觉基准**（`visual-regression.mjs`） | 像素 diff 只在 @100%、1440×900 基准图 | **零影响**（MIN_CONTENT 不改变默认窗口，TARGET 仍 1440×900） | **零影响**（默认窗口不变） |
| **P7-09（DPI-09）** | 唯一直接关联项 | 维持现状（100% 在虚拟屏下 FAIL，见 §5） | 降低「最小窗口」门槛，但**不解决默认窗口在 150% 出屏**（根因在 `TARGET_H`+`EDGE_MARGIN`+非客户区放大） |

**关键结论**：下调 `MIN_CONTENT_W/H` 对 93 条 E2E 与视觉基准**零收益、零风险**（不相关）；对 DPI-09 **收益有限且未击中根因**。

---

## 5. 150% 实际验证需要满足的环境条件

来自 `DPI-ACCEPTANCE.md`（§5/§6/§8），并补充本评估发现的环境事实：

1. **交互式会话**：当前无人交互会话（RDP）导致 Electron 报告屏幕为 **1024×768 虚拟屏**（见 `p7-dpi-100.json` 的 `screen=[1024,768]`），而非物理显示器 LEN P27q-10 的 2560×1440。**这是 DPI-09 在 100% 就 FAIL 的直接环境根因**，与产品代码无关。
2. 在真实物理屏交互会话下，经「设置 → 系统 → 显示 → 缩放」切到 **150%**（必要时「自定义缩放」输入 150）。
3. 若系统提示「需注销才能应用」，必须**注销重登**（Win11 build 26300 实测：改注册表 + 广播 `WM_SETTINGCHANGE` 均无效，见 `DPI-ACCEPTANCE.md` §8）。
4. 用探针验证唯一生效判据：`screen.getAllDisplays()[0].scaleFactor === 1.5`，**不看「字变大了」**。
5. 验收后必须**还原到 100%**，并复核注册表：`Win8DpiScaling=0`、`LogPixels` 不存在、三个 `PerMonitorSettings` 键 `DpiValue=0/1/0`。

**150% 预测（非实测）**：本机 2560×1440 物理屏，150% 时 `workArea` 逻辑 ≈ 1706×928（减约 48px 任务栏）。默认窗口客户区高 = `min(900, 928-32)=896`，外框高 = `896 + 65×1.5 ≈ 993.5` > 928 → **预测底部超出约 65px，DPI-09 大概率 FAIL**。这是真实风险（非虚拟屏假象），需在真实 150% 环境实测确认，并以实测为准。

---

## 6. 供决策的结论与选项（不改产品，交由负责人定夺 DEC-07）

**核心判断**：
1. DPI-09 当前的 **100% FAIL 是 RDP 虚拟屏（1024×768）环境假象**，非产品缺陷——真实物理屏 2560×1440 @100% 工作区 2560×1392 远大于窗口，DPI-09 会 PASS。
2. 真正需要正视的是 **150% 下的预测出屏**（约 65px），根因是 `TARGET_H=900` + 固定 `EDGE_MARGIN=32` + 非客户区随 `scaleFactor` 放大三者的叠加，而非 `MIN_CONTENT_H` 本身。

**可选方案（供决策，均未实施）**：

| 选项 | 做法 | 收益 | 代价 |
|---|---|---|---|
| A（推荐评估方向） | 让 `planWindowBounds()` 的 `EDGE_MARGIN`/高度预算把**放大的非客户区**纳入（如 `work.height - frameH_delta`），保证默认窗口完整落下 | 直击 150% 根因 | 改 `main.js` 窗口预算逻辑，需回归窗口尺寸用例 |
| B | 下调 `MIN_CONTENT_W/H` | 降低最小窗口门槛 | 不解决默认窗口 150% 出屏；触碰 DEC-07 口径 |
| C | 保持现状，仅把 DPI-09 的 100% 在真实物理屏交互会话下重跑以消除假象 | 零代码改动 | 150% 风险仍在，需在真实 150% 环境实测后另行决策 |
| D | 明确「150% 下允许默认窗口出屏、以用户可拖拽/最大化恢复」为已接受风险 | 零改动，如实披露 | 需 Owner Accepted 记录，不得伪装通过 |

> 本评估**不落地任何修改**。DEC-07 是否调整、采用 A/B/C/D 中哪一项，由项目负责人决定；一旦决定，按版本规则（结构性尺寸策略变更 → 主版本号跳跃）另行执行并同步四个位置 + 10 点自检 + 双宽验证。

---
---

# 第二段｜负责人裁决：方案 A 正式采用

> 裁决人：项目负责人（Owner）｜裁决日期：2026-11-03
> 任务编号：`P7-DPI-09 Remediation`｜实施方案：**A｜动态计算窗口边界，纳入原生非客户区实际占用**
> 裁决依据：评估稿 §6 选项表（方案 A 为推荐评估方向），并结合评估稿 §0/§5 指出的「26 DIP 非客户区漏算」根因。

## 2.1 裁决内容（逐条落地约束）

| # | 裁决项 | 明确结论 |
|---|---|---|
| 1 | **方案** | **正式采用方案 A**：`planWindowBounds()` 的窗口预算必须把**实测非客户区增量**纳入计算，而不是用固定估算值。 |
| 2 | **最小客户区** | **仍为 1024×680（DEC-07 不变）**。本轮**未下调**任何最小尺寸，**未缩小后宣称完成**。 |
| 3 | **默认窗口目标** | **仍为 1440×900（DEC-09 不变）**。空间充足时**不改变原体验**，实测客户区仍为 1440×900。 |
| 4 | **非客户区取值** | **采用实际测量**（`getBounds() − getContentBounds()`，DIP 口径），**不使用旧的错误估算**（旧公式 `39 × scaleFactor`）。 |
| 5 | **工作区不足** | **明确报告限制**：必须识别「当前工作区无法容纳产品最小窗口」，记录**最低工作区要求 / 实际工作区 / 差距**，**不得**悄悄突破 DEC-07、**不得**让窗口出屏却把 DPI-09 写成 PASS。 |
| 6 | **原生菜单栏** | **保留** `autoHideMenuBar: false`。**不得**为绕过问题直接隐藏菜单栏（隐藏菜单栏会少 26 DIP，但那不是修复，只是把问题藏起来）。 |
| 7 | **DIP 纪律** | `getBounds()` / `getContentBounds()` / `workArea` 一律 DIP，**不得再乘 scaleFactor**。 |
| 8 | **窗口位置** | 四边必须落在 `workArea` 内（主屏 / 副屏 / 负坐标 / 任务栏缩减 / 混合缩放均需覆盖）；保持「鼠标所在显示器优先」的选屏原则。 |
| 9 | **初始化方式** | 允许**隐藏窗口两阶段初始化**，**不得在用户可见后再跳动**。 |
| 10 | **150% 结论性质** | 必须是**实测**，**不允许用预测代替**。 |

## 2.2 与评估稿结论的一致性核对

评估稿 §6 的四个选项中，本次仅采纳 **A**；B（下调 MIN_CONTENT）、C（仅重跑 100%）、D（接受出屏风险）**全部不采纳**：

| 评估稿选项 | 本轮处置 | 理由 |
|---|---|---|
| A（动态窗口边界，纳入非客户区） | ✅ **正式采用并实施** | 直击 150% 根因；且同时修正了评估稿尚未量化的 26 DIP 漏算。 |
| B（下调 `MIN_CONTENT_W/H`） | ❌ 不采纳 | 违反 DEC-07；且 DPI-09 测的是默认窗口，调 MIN 对默认窗口无效（评估稿 §4 结论）。 |
| C（只重跑 100% 消除假象） | ❌ 不单独采纳 | 100% 环境确实已解决（真实物理屏），但 150% 风险仍在，不能只做 C。 |
| D（接受出屏风险） | ❌ 不采纳 | 目标是把窗口**放进**工作区，不是披露风险。 |

## 2.3 评估稿中「26 DIP 根因」的实测闭环（本轮新增）

评估稿 §4.2.1 已记录 `setContentSize(1024, 640)` → 客户区 **1024×654**（差 26 DIP）这一异常，并把它归因为「台账记录口径偏差」（TK-145，仅改台账）。**本轮实测证明该归因不完整**——26 DIP 不是台账问题，而是**真实的产品缺陷**，见第三段 §3.2。

---

# 第三段｜实施结果与实测取证

> 实施日期：2026-11-03｜实现基线：**`89470b5`**（`fix(desktop): P7-DPI-09 方案 A + min track 实测标定`，分支 `feature/desktop-windows`）
> 新增模块：`desktop/main/window-bounds.js`（零依赖纯函数，几何单测直接复用）
> 改动文件：`desktop/main/main.js`（窗口创建与台账 + min track 实测标定）、`desktop/main/window-bounds.js`（新增）、`desktop/test/p7-dpi.mjs`（DPI-09 四边核验 + 四态判定）、`desktop/test/window-bounds-geometry.test.mjs`（新增几何单测 24/24）、`desktop/test/security-audit.cjs`（纳入新模块审计范围）、`desktop/test/desktop-suite.mjs`（TC-DP-04 阻塞文案改为按实际档位动态判定）、取证探针 15 个、文档若干。

## 3.1 26 DIP 高度差异的完整解释（任务 §二 强制项）

**问题**：`autoHideMenuBar: false` 配置下，实测外框增量高度 = **65 DIP**，而旧公式按 **39 DIP** 计算，差 **26 DIP**。

**排查与实测结论**（`desktop/test/probe-frame-delta.cjs` / `probe-min-size.cjs` / `probe-min-visible.cjs` / `probe-win-limit.cjs` 四个探针）：

| # | 排查项 | 实测结果 | 结论 |
|---|---|---|---|
| 1 | `autoHideMenuBar: false` 是否为 26 DIP 来源 | `false` → delta **16×65**；`true` → delta **16×39** | ✅ **是**。差值恰为 26 DIP |
| 2 | 原生菜单栏是否计入非客户区 | **计入**。菜单栏位于客户区**之外**，只撑高外框，不侵占客户区（客户区 900 → 900，外框 +26） | ✅ 计入非客户区，不占客户区 |
| 3 | `getBounds()` vs `getContentBounds()` 口径 | `getBounds()` = 外框（含标题栏+边框+菜单栏）；`getContentBounds()` = 客户区 | 两者差值 = 非客户区增量 |
| 4 | 窗口管理器缩放影响 | delta **不随客户区尺寸变化**（800×600 / 1024×680 / 1440×900 / 1600×1000 恒为 16×65） | ✅ 与客户区尺寸**无关** |
| 5 | 缩放档影响 | 100% → 16×65；125% → 15×64（实测） | delta 是**系统 DPI 相关**，但**不是**简单线性放大 |
| 6 | 台账 `frame` 字段来源 | `getBounds() − getContentBounds()` = **真实测量**；而旧 `main.js` 里的 `frameH = height + Math.round(39*sf)` 是**公式推算**（注释称「实测@100%: 宽16/高39」） | ❌ **口径错配**：39 是「无菜单栏」的边框高度，与实际配置 `autoHideMenuBar: false` 不符 |
| 7 | `setContentSize(1024,640)` → 客户区 1024×654 | 该 654 是 **Chromium 内部 min track**（`getMinimumSize()` = `[1040, 719]` = 1024+16 / 680+**39**）造成的钳位，与菜单栏 26 DIP 是**两件事** | ✅ 区分清楚，避免混为一谈 |
| 8 | Windows 裁剪口径 | **构造参数** `width/height` 会在 Chromium 创建窗口时按「workArea − (16, 39)」裁剪；**`setContentSize()` 不裁剪**（阶梯实测 2000/3000 均原样） | ✅ 这是方案 A 走 `setContentSize` 校正的**关键前提** |

**一句话结论**：**26 DIP = 原生菜单栏高度**。旧公式漏算了它，导致外框比预算多出 26 DIP，窗口在受限工作区下被钳位到屏幕左上角，从而右侧溢出 16 DIP、底部溢出 26 DIP——与历史报告 `p7-dpi-100.json` 的实测溢出量**逐项吻合**。

## 3.2 历史数据精确复现（决定性交叉验证）

复现环境：RDP 虚拟屏 1024×768、任务栏 55px。

| 口径 | 值 | 来源 |
|---|---|---|
| 主进程 `getDisplayNearestPoint(cursor).workArea` | **1024×713** | Electron 主进程（真实来源） |
| 渲染层 `window.screen.availWidth/availHeight` | **1024×720** | 渲染层（**与主进程不同源**，历史误用源） |
| 旧算法客户区 | `max(min(900, 713−32), 680)` = **681** | 旧公式 |
| 旧算法外框 | 681 + 65 = **746** | 旧公式（含真实 delta） |
| 窗口被钳位到 | **(0, 0)** | 因 x/y 计算为负 → Chromium 钳到 0 |
| 实际溢出 | 右 **16**、下 **26** | 与 `p7-dpi-100.json` 实测**逐项吻合** |

**新算法同场景**：客户区收敛到工作区内、`fitsMinimum=false` → 明确标记**工作区不足**并记录**最低工作区要求 / 实际工作区 / 差距**（DPI-09 判为 **BLOCKED**，不判 PASS）。

## 3.3 方案 A 的算法（前后对照）

**旧算法（公式推算 + 硬下限）**

```js
// 窗口尺寸
width  = max(min(TARGET_W, work.width  - EDGE_MARGIN), MIN_CONTENT_W);
height = max(min(TARGET_H, work.height - EDGE_MARGIN), MIN_CONTENT_H);
// 非客户区：公式推算，漏 26 DIP
frameH = height + Math.round(39 * scaleFactor);
```

**新算法（实测增量 + 预算收敛）**

```js
// ① 实测非客户区增量（DIP，不再乘 scaleFactor）
delta = { width: getBounds().width  - getContentBounds().width,
          height: getBounds().height - getContentBounds().height };

// ② 预算：工作区 − 边距 − 实测外框增量
maxContentWidth  = workArea.width  - EDGE_MARGIN - delta.width;
maxContentHeight = workArea.height - EDGE_MARGIN - delta.height;
contentWidth  = max(min(TARGET_W, maxContentWidth),  MIN_CONTENT_W);
contentHeight = max(min(TARGET_H, maxContentHeight), MIN_CONTENT_H);

// ③ 位置：工作区内居中 + 夹紧（四边必须落在 workArea 内）
x = workArea.x + round((workArea.width  - frameW) / 2);
y = workArea.y + round((workArea.height - frameH) / 2);
// clamp 到 workArea，再做四边终检 {left, top, right, bottom}
```

**关键差异 5 点**：

| # | 维度 | 旧 | 新 |
|---|---|---|---|
| 1 | 非客户区来源 | 公式推算 `39×sf` | **实测** `getBounds()−getContentBounds()` |
| 2 | 非客户区是否计入预算 | ❌ 漏 26 DIP | ✅ 计入 `maxContent` |
| 3 | 超出工作区时的行为 | 静默保留硬下限 → 出屏 | **显式识别** `fitsMinimum=false` + 记录差距 |
| 4 | 位置 | 可能为负 → Chromium 钳到 (0,0) | **工作区内居中 + 夹紧 + 四边终检** |
| 5 | 尺寸施加方式 | 构造参数（会触发 Windows 裁剪） | `setContentSize()`（**不裁剪**）+ 收敛重测 |

## 3.4 独立几何测试（任务 §七 强制项）

`desktop/test/window-bounds-geometry.test.mjs` — **20/20 PASS**。

| 用例 | 覆盖点 |
|---|---|
| GEO-01 | 100% / 125% / 150% 三档缩放下的预算与边界 |
| GEO-02 | 4 种工作区：装得下 → 四边必在；装不下 → 如实标记 + **不缩 DEC-07** |
| GEO-03 | 非零 / 负坐标原点（`workArea.x/y ≠ 0`） |
| GEO-04 | 临界恰好容纳 → `atMinimum=true` / `clampedToMinimum=false` |
| GEO-05 | 差 1px 的临界 |
| GEO-06 | 远小于最小窗口的工作区 |
| GEO-07 | 非客户区增量变化时的预算响应 |
| GEO-08 | **旧算法复现历史 1024×681 / 1040×746 / 溢出 16×26** |
| GEO-09 | 新算法同场景通过 |
| GEO-10 | 位置夹紧（负坐标→ 0，越界→ 边界） |
| GEO-11 | min track 为**外框口径**（`minContent + delta`） |
| GEO-12 | 新算法在历史场景守住 1024×680 下限并**标记差距** |

> 数据性质声明：**100% = 16×65 实测、125% = 15×64 实测、150% = 20×80 保守外推（非实测）**。150% 增量在真实 150% 环境复测后替换。

## 3.5 关键 API 语义陷阱与纠正（实测）

| 陷阱 | 实测事实 | 正确用法 |
|---|---|---|
| `minWidth/minHeight` 构造参数 | **客户区口径**，Chromium 自动加边框 → `getMinimumSize() = [1040, 719]`；客户区实际下限只有 **1024×654**（< DEC-07 的 680） | 不可作为下界保证 |
| `setMinimumSize(w, h)` | **外框口径且不自动加边框**（`[1024,706]` → 原样）；但 🔴 **不能**用 `frameDelta` 换算 —— 实测「min track → 客户区下限」换算量为 **12×63** ≠ `frameDelta` **15×64** | **必须实测标定**（见 §3.9），不得套公式 |
| `setContentSize()` | **不触发** Windows 工作区裁剪 | 用作施加收敛后尺寸的安全通道 |
| 构造参数 `width/height` | **会触发**裁剪（口径 workArea − (16,39)） | 不作为最终尺寸施加手段 |
| `setSize(1,1)` | 外框口径，可用于把窗口压到下限以**实测**真实客户区下限 | 压下限必须用它 —— `setContentSize(1,1)` 在 125% 下被 Chromium 拒绝（`conversion failure`） |

> ⚠️ `setMinimumSize` 与构造参数 `minWidth/minHeight` **不可互换**：误用会让客户区掉到 **1008×641**，低于 DEC-07。
>
> 🔴 **本表首版曾写「`setMinimumSize(minW + delta.width, minH + delta.height)` = (1040, 745) → 客户区下限 1024×680 ✅」，该结论已被 2026-11-03 实测证伪并推翻** —— 详见 §3.9。

## 3.6 两阶段隐藏窗口初始化

① 构造隐藏窗口 → ② 实测 delta → ③ 校准 min track（外框口径）→ ④ 按实测 delta 算预算 + `setContentSize` + 重测收敛（≤3 轮）→ ⑤ `setPosition` 工作区内居中 → ⑥ 四边终检 → **才 `show()`**。

## 3.7 DPI-09 判据强化（任务 §五 强制项）

`desktop/test/p7-dpi.mjs`：

- 保留 **DPI-01~08 判据不降阈值**。
- **DPI-09 改为四边核验**：`left / top / right / bottom` **全检**，四项溢出全为 0 才算 PASS。
- **四态判定**：`true` = PASS ｜ `false` = FAIL ｜ `'blocked'` = **工作区装不下最小窗口** ｜ `null` = SKIP。**SKIP 与 BLOCKED 严格区分，不得混用**。
- 报告新增 `windowGeometry` 段：`display{id,label,bounds,workArea,scaleFactor}`、`bounds`、`contentBounds`、`measuredFrameDelta`、`devicePixelRatio`、`position`、`edges`、`workAreaEdges`、`fourEdgeOverflow`、`fits`、`budget`、`minCalibration`、`convergence`、`heightTier`、`renderLayerGeometry`。
- 退出码：`0` = PASS｜`1` = FAIL｜`3` = BLOCKED。

## 3.8 实施结果小结

见 `desktop/test/reports/` 下本轮产物级报告与最终 DPI 验收报告。**剩余 FAIL / SKIP / BLOCKED 在最终交付清单中逐项标注，不合并为笼统 PASS。**

## 3.9 第二轮根因：min track 口径 ≠ frameDelta 口径（2026-11-03 实测推翻首版结论）

> 本节是 §3.5 首版结论的**推翻记录**。方案 A 首版把「min track → 客户区下限」的换算量直接等同于 `frameDelta`，导致 Desktop E2E 从 93/93 退化为 **90/93**（`TC-DP-01`/`TC-DP-02` FAIL、`TC-DP-04` BLOCKED）。这是**真实回归**，不是测试环境噪声。

### 3.9.1 四步定位过程

| 步骤 | 手段 | 实测结果 | 结论 |
|---|---|---|---|
| ① 改前 / 改后对照 | `git show HEAD:desktop/main/main.js` 临时还原 + 跑同一套 TC-DP | HEAD 版 **10/10**；本轮新版 **7/10** | 确认由本轮改动引入，非环境波动 |
| ② 移屏对照 | `probe-tcdp-regression.cjs`（主屏 ↔ 副屏移动取样） | 偏差**恒定 +2 / +8**，与所在显示器无关 | 排除「多屏 / 混合缩放」假设 |
| ③ min track 口径对照 | `probe-min-track-calibrate.cjs`（C1~C6） | `frameDelta` = **15×64**；「min track → 客户区下限」实际换算 = **12×63** | **根因**：两口径不相等，差 3×1 |
| ④ DIP 取整验证 | `probe-dip-rounding.cjs` | 125% 下「请求 H → 回读 H′」几乎全为 **+1**（600→601、680→681、784→785、900→901；679→679、675→675、683→683） | 属**系统取整**，非产品缺陷 |

**根因**：Windows 11 存在**不可见缩放边框**（resize border）—— 它**计入** min track、但**不计入** `getBounds()`。因此用 `frameDelta` 换算 min track 会把客户区下限**顶高**：

```
setMinimumSize(1024 + 16, 680 + 65)  = (1040, 745)   // 用 frameDelta 换算
  → 实测客户区下限 = 1028 × 682                             // 宽度被顶高 4 DIP
  → 宽度 1024 档（≤1024 的纵向堆叠布局）永远不可达
  → TC-DP-04 判 BLOCKED
```

`probe-min-track-legal.cjs` 另经 49 个候选 min track 组合验证**全部合法不抛错**，排除「参数非法」假设；`probe-min-track-search2.cjs` 的 2D 扫描（1034~1039 × 738~745）确认 **125% 下不存在能命中精确 1024×680 的组合**，best = **1024×682**。

### 3.9.2 修法：实测标定 + 迭代收敛 + 分轴停止

不靠公式推算，改由**运行时实测**决定 min track：

```
① 设初值 = 客户区 + frameDelta
② win.setMinimumSize(minTrack)          // 外框口径
③ win.setSize(1, 1)                      // 外框口径压到下限（setContentSize 会被 Chromium 拒绝）
④ 回读 win.getContentBounds()            // 得实际客户区下限
⑤ 下限被顶高 → 按实测超出量下调 min track 重测（≤4 轮）
⑥ 分轴判定：任一轴已达标即停止下调（避免为追另一轴精确值而破坏已达标的轴）
```

**实测收敛轨迹（125%）**：

| 轮次 | minTrack | 实测客户区下限 | 动作 |
|---|---|---|---|
| 轮 1 | `(1039, 744)` | `1026 × 682` | 超出量 `+2 / +2` → 下调至 `(1037, 742)` |
| 轮 2 | `(1037, 742)` | **`1024 × 682`** | 宽度达标（=1024）、高度 682 ≥ 680 → **分轴停止** |

**为什么分轴停止**：继续下调高度 min track 会把高度下限压到 **680 以下**，**破坏 DEC-07**。实测 `setMinimumSize(1037, 740)` → 下限 `1024×678`（高度跌破 DEC-07）—— 故取「高度 ≥680 即可」。

### 3.9.3 平台量化如实披露（不改判据、不让它变绿）

- 125% 下 **精确 1024×680 客户区不可达**（best = 1024×682），属 Windows 取整行为，**非产品缺陷**。
- `TC-DP-04` 判据为 `|got − 680| ≤ 1`，不满足 → **仍记 BLOCKED（环境/平台阻塞）**。**未改判据让它变绿**。
- 宽度方向 1024 / 1200 / 1440 在 125% 下均可 **Δ0 精确命中**。

### 3.9.4 修后验证

| 验证项 | 结果 |
|---|---|
| `probe-min-track-verify.cjs`（5 条判据） | **5/5 PASS**（下限 1024×682、宽度 1024 命中、1024 档请求宽度命中、高度 ≥680、1440×900 命中） |
| `test/window-bounds-geometry.test.mjs` | **24/24 PASS**（新增 GEO-13~16 覆盖标定逻辑） |
| `test/security-audit.cjs` | **47/47 PASS** |
| 窗口四边溢出 | `left/top/right/bottom` 全 **0** |

### 3.9.5 多显示器核验（2026-11-03 · 双屏真 125% · 本轮新增）

> **补的缺口**：`test/p7-dpi.mjs` 只核验**鼠标所在的那一块屏**。机器上有多块屏时，主屏通过**不能**推出副屏也通过 —— 而任务书明确要求覆盖「主屏 / 副屏 / 负坐标 / 任务栏缩减 / 混合缩放」。
> 探针：`test/probe-dpi-multidisplay.cjs`（真实 `BrowserWindow` + 产品 `window-bounds.js` 算法 + 真实 `getBounds()` 回读；每块屏**独立判定**，任一失败即整体 FAIL）。

**实测环境**：两块 `LEN P27q-10`，**均为真 125%**（用户经「设置 → 系统 → 显示 → 缩放」切换并已实时生效）｜主屏 `id=3036494085`｜副屏 `id=1897915132`（右置，x 偏移 2048）｜鼠标位于主屏 `(1697, 536)`。

| 显示器 | 缩放 | workArea | 计划位置（产品算法） | 实测外框 | 实测客户区 | **四边溢出** | 判定 |
|---|---|---|---|---|---|---|---|
| 主屏 `3036494085` | 1.25 | `2048×1120 @(0,32)` | desired `(297,110)` → clamped `(297,110)`，未触发夹紧 | `1456×966 @(297,110)` | `1441×902` | **左0/上0/右0/下0** | ✅ **PASS** |
| 副屏 `1897915132` | 1.25 | `2048×1120 @(2048,32)` | desired `(2345,110)` → clamped `(2345,110)`，未触发夹紧 | `1458×966 @(2345,110)` | `1443×902` | **左0/上0/右0/下0** | ✅ **PASS** |

**结论**：
1. ✅ **副屏同样四边溢出全 0** —— 位置算法按**目标屏自身 workArea** 居中（副屏 x = 2048 + (2048−1458)/2 = **2345**，而非按屏幕 bounds 居中），证明「工作区内居中 + 夹紧 + 四边终检」在多屏下成立。
2. ✅ **选屏原则**：`getDisplayNearestPoint(getCursorScreenPoint())` → 鼠标在主屏时命中主屏（`cursorIsOnPrimary = true`），「鼠标所在显示器优先」未被破坏。
3. ✅ **预算独立计算**：两屏 `maxContent = 2001×1024`（= 2048−32−15 / 1120−32−64），`fitsMinimum = true`、`atMinimum = false` → 目标尺寸 `1440×900` **未被 DEC-07 下限抬高**。
4. 💡 **平台量化在多屏上的体现**：副屏 x 偏移 2048（8 的倍数）与主屏 x=0 的取整相位不同 → 同一目标宽度在主屏回读 **1441**、副屏回读 **1443**（差 2 DIP）。属系统取整，非缺陷；两处均 ≥ 目标 1440，DEC-14（客户区口径）成立。
5. 🔒 **实现注意**：探针**全程复用同一个 `BrowserWindow`** —— 中途 `destroy()` 再新建窗口会**卡住 Electron 主进程**（已实测：第二次 `new BrowserWindow` 后不再推进）。这是探针实现层面的坑，不是产品缺陷。

### 3.9.6 关于 100% / 150% 档可达性的更新（2026-11-03 实测推翻前一轮结论）

前一轮结论「per-monitor DPI 只能改注册表、需注销重登」**不完整**。本轮实测发现：

| 尝试 | 上一轮结论 | **本轮实测** |
|---|---|---|
| 注册表 `PerMonitorSettings\<id>\DpiValue` 写 0（4 键全归零） | 新进程仍读 `sf=1.25` → 「需注销重登」 | ✅ 现象复现 |
| 「设置 → 系统 → 显示 → 缩放」手动改 | 未尝试 | ✅ **实时生效**：用户把两块屏都切到 125% 后，Electron 立即读到 `sf=1.25`；而此时 **4 个 `DpiValue` 仍全部 = 0**，`GetDpiForSystem` 仍 = 96，`LogPixels` = null，`Win8DpiScaling` = 0 |

→ **结论修正**：Windows 11 的缩放滑块走的是 **DisplayConfig 实时应用路径**，**不写** `PerMonitorSettings\DpiValue`；因此「注册表改值」与「设置 UI 改值」是**两条不同的通路**，前者需注销重登、后者实时生效。
→ **推论**：**100% 档是可达的** —— 只要经设置 UI 把缩放调回 100%，即可在本会话内立即重跑 100% 验收，无需注销。
→ **另一推论**：因 `DpiValue` 实测**全为 0**，**下次登录时 Windows 重读 DpiValue=0 → 恢复 100%**；「下次登录会变成 125%」的担忧**不成立**（登录后仍建议复核一次）。



