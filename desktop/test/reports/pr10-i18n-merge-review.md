# PR #10 合并前 i18n 合轨架构审查报告

- 审查人：系统架构师 梁承宇（system-architect）
- 审查对象：`pr10-work` @ `feature/desktop-v1.3.0-pr10-guide`（`436bee4`，基线 `origin/main` = `68b24d1`）
- 审查方式：**全程只读**（读源码 + Node 实际加载语言包做只读比对，未修改任何仓库文件、未跑构建、未安装依赖）
- 结论速览：注入顺序与幂等性 **成立**；DOM 生命周期 **无重复挂载/泄漏/时序竞争**；三种失败场景 **均不阻断启动**。但发现 **1 个功能入口不可达缺陷（语言切换下拉挂在隐藏容器内）** 与 **1 处文本漂移缺陷（FAQ 第 3 问答案在 en-US 下残留中文）**，详见第 ⑤ 节。

---

## ① 注入顺序验证

### 1.1 最终产物 script 顺序（实测读 `desktop/renderer/index.html:305-314`）

```
305  <script src="led-pitch.js">
306  <script src="core.js">
307  <script src="i18n/runtime.js">
308  <script src="i18n/locales/zh-CN.js">
309  <script src="i18n/locales/en-US.js">
310  <script src="i18n/text-map.js">
311  <script src="i18n/index.js">
312  <script src="guide.js">
313  <script src="app.js">
314  <script src="desktop-ui.js">
315  </body>
```

依赖链逐对核对（全部成立）：

| 依赖 | 证据 | 判定 |
|---|---|---|
| led-pitch 先于 core | adapter `PITCH_SCRIPT_ANCHOR` 在 core.js 标签前插 led-pitch（desktop-adapter.cjs:397-398、475） | ✅ |
| runtime 先于语言包 | runtime.js 定义 `global.LedI18N`（runtime.js:275）；语言包只写 `global.LedI18NPack`（zh-CN.js:14）不依赖 runtime | ✅（顺序宽松但成立） |
| 语言包先于 index.js | index.js 从 `global.LedI18NPack` 注册（i18n/index.js:34-43） | ✅ |
| text-map 先于 index.js | index.js 动态读 `global.LedI18NTextMap`（index.js:81、121）且首次打标在脚本求值时执行（index.js:223） | ✅ |
| i18n/index.js 先于 guide.js | guide.js 的 `t()` 依赖 `LedI18N.t`（guide.js:20-23）；打标完成后 guide 才动态建节点（避免动态文本被误打标，index.js:124-129 的设计前提） | ✅ |
| 全部先于 app.js | adapter 注入锚点即 `<script src="app.js"></script>`（desktop-adapter.cjs:501、521） | ✅ |
| app.js 先于 desktop-ui.js | sync-assets.mjs:168-173 在路径重写后于 app.js 标签后插 desktop-ui.js | ✅ |

🔴 **一处注释与现实不符（不影响运行，见 ⑤-B3）**：desktop-adapter.cjs:494-495、runtime.js:25-26、i18n/index.js:7-11 均声称「app.js 依赖 LedI18N / app.js 里有 _t()」，但对 `desktop/renderer/app.js` 全文 grep `LedI18N|_t|i18n` **零匹配** —— app.js 实际完全不消费 i18n。依赖链因此"更宽松地"成立，不是缺陷，但注释会误导后续维护者。

### 1.2 sync 覆盖重建后的幂等性（代码逻辑推演，未实际跑 sync）

`sync-assets.mjs` 每次执行流程：

1. **覆盖重建**：`writeFileSync(file.to, normalizeEol(source))` 从仓库根 `index.html` 整体覆盖桌面副本（sync-assets.mjs:153、65）——任何历史注入痕迹被清零；
2. 路径重写 `src/…` → 同层（sync-assets.mjs:164-167）→ 注入 desktop-ui.js + app.css（:168-179）；
3. `applyIndexAdapter` 依固定顺序执行三组补丁：glyph（desktop-adapter.cjs:534-552）→ ⑦-B pitch 按钮/脚本/FAQ（:555，函数体 :459-489）→ **i18n 脚本块**（:558，函数体 :511-522）。

幂等性三重保证：

- **覆盖式重建**使 `applyI18nScriptsToIndex` 的幂等护栏（desktop-adapter.cjs:512 `src.includes('i18n/runtime.js')` 则跳过）在 sync 路径下实际永远走"新注入"分支，结果恒定；护栏只在**脱离 sync 单独重跑 adapter** 时兜底（实测：二次运行 applied=[…『已应用，跳过』]，产物不变）；
- 注入锚点 `<script src="app.js"></script>`（:501）在整个副本中唯一，`replace` 只替换首处，desktop-ui.js 标签文本不同不会被误命中；
- **独立补丁结构**：i18n 补丁与 ⑦ 系列锚点零交集（⑦ 用 core.js 标签 ：397，i18n 用 app.js 标签 :501；FAQ 整串替换 ：401-402 与 script 注入无共享文本），任一 skipped 均置 `exitCode=1`（sync-assets.mjs:189-192）可被门禁捕获。实施方报告"两次 sync 四产物哈希一致"（pr10-implementation-report.md:42）与此推演一致。

### 1.3 与 PR #9 ⑦ 系列补丁的互不干扰

| 交互面 | 分析 | 判定 |
|---|---|---|
| index.html 注入 | ⑦-B 锚点 `core.js` 标签 vs i18n 锚点 `app.js` 标签，且 ⑦-B 先执行（:555 先于 :558），i18n 注入不会破坏 ⑦ 已注入的 `led-pitch.js` 行 | ✅ |
| app.js 补丁 | ⑦-A 只作用于 app.js 副本（desktop-adapter.cjs:409-454），与 index.html 注入完全不同文件；`applyDesktopAdapter` 不调用 i18n 函数 | ✅ |
| 运行时语义 | ⑦ 的 px 提示整段切换依赖 `hint.textContent.indexOf('单位切换只改变显示值')` 定位（desktop-ui.js:2596）——该节点被 text-map **EXEMPT**（text-map.js:119-122），打标不会改写其文本，定位不受影响；其余 ⑦ 动态覆写点（core-note、live-*、result-badge、warn-text、stage-badge）全部在 EXEMPT id 表内（text-map.js:123-131） | ✅（EXEMPT 表正是为这场交互设计的） |

---

## ② DOM 生命周期

### 2.1 `applyTextMapToDom()` 脚本加载时同步遍历 —— 安全

- `i18n/index.js` 是 body 末尾的**经典同步脚本**（index.html:311，位于 `</body>` :315 之前），执行时 body 内全部元素已解析完毕，`document.body` 存在；同步遍历无 Racy 风险。
- 代码本身还有三层防御（index.js:144-148）：TM 未注入 / 无 body / 无 `createTreeWalker`（node:test vm 沙箱）→ 返回零计数、不抛异常。
- 打标是**一次性**动作：`hasTagged` 置位后重复调用只回报现状（index.js:130-138），明确注释了原因——desktop-ui.js 之后动态创建的 ft-mode「按宽度」/ ft-settings「设置」文本恰好命中 MAP，重复遍历会误打标并干扰 syncStatusBar。**实测 desktop-ui.js:253/273 确实动态生成这两个文本**，防重入设计是必要的且正确。
- 通道 B 的 TextNode 幂等：同一 node 只登记一次（index.js:107-112）；通道 A/B 互斥由"父元素是否纯文本"决定（index.js:182-192），且通道 A 打过标的元素跳过（:180）。

### 2.2 guide.js 的挂载 / 轮询 / 观察器 —— 无重复挂载、无泄漏、无时序竞争

- **重复挂载**：五个宿主全部按 id 幂等守卫——`#p10-guide`（guide.js:62-63）、`#p10-pitch-help`（:96-101）、`#p10-px-source`（:123-124）、`#p10-lang`（:189-191）、`.p10-tip`（:176-181）。`renderAll` 重复调用只 `clear()` 后重建内容，不新建宿主。**实测代码路径均无重复追加可能。**
- **DOMContentLoaded 分支**：guide.js 与 desktop-ui.js 同在 body 末尾、readyState 均为 'loading'，两者都挂 DOMContentLoaded（guide.js:268-272、desktop-ui.js:2679-2683）。guide.js 标签在前 → `start()` 先于 `init()` 执行。`start()` 不依赖 desktop-ui 创建的任何节点（`.panel--stage`、`.app-header__actions`、`#settings-panel` 均为静态 HTML 元素），无先后依赖。
- **40×50ms 轮询（guide.js:241-246）**：`.pitch-settings-row` 实际只在**设置模态打开时**才由 `openSettingsModal → buildPitchSettingsRow` 创建（desktop-ui.js:1819、2510-2514），并非启动期生成 → 启动期该轮询必然 2 秒超时后照常 `renderAll()`（renderPitchHelp 对无行场景安全返回 false，:95）。**功能正确，但注释「重试等待设置行生成」与实际机制不符，且是启动期 2s 空轮询**（见 ⑤-B4）。真正的兜底是 MutationObserver。
- **MutationObserver（guide.js:250-257）**：常驻（不 disconnect）、监听 body childList+subtree。回调条件 `!byId('p10-pitch-help') && .pitch-settings-row 存在`——补挂后条件即变假，自身触发的 mutation 不会造成循环；desktop-ui 每次重建模态体（openSettingsModal 先 `modalBodyEl.textContent=''`，desktop-ui.js:1771）后由 MO 重新补挂，与 renderAll 的"清空重建"分工明确，**无双重渲染**。观察器随页面生命周期常驻属设计意图（需捕捉未来任意时刻的模态打开）；回调是轻量 id 判断，性能可接受。若后续有人在此回调里加重复逻辑需注意每次 DOM 变更（含每键输入）都会触发。
- **与 desktop-ui `init()` 的竞争**：`init()` 首屏改写的是 ⑦/EXEMPT 管辖的节点（badge/hint/core-note 等），不触碰 guide 的五类节点；guide 的 `schedule()`（rAF 节流，guide.js:230-237）与 desktop-ui 的 `schedulePitchRefresh` 各自独立、都只读 `LedPitch.snapshot()`。无共享可变状态。**判定：无时序竞争。**

### 2.3 语言切换链 `setLocale` 顺序（runtime.js:182-196）

```
current = code → warnedMissing 重置 → persistLocale → applyToDom()（通道 A）
→ <html lang> → listeners[]（refreshTextNodes 通道 B → guide.renderAll）
```

- **无状态覆盖**：通道 A（`[data-i18n]` 纯文本元素 + `data-i18n-attr`）与通道 B（`textNodeTargets` 混合内容 TextNode）按构造互斥（见 2.1）；`refreshTextNodes` 从 raw 模板重算（index.js:205-212），不依赖上次结果；guide.renderAll 清空重建自身节点。三个阶段作用域不重叠。
- **顺序正确**：`applyToDom` 在 listeners 之前（runtime.js:188 → 192-194），guide.renderAll 里 renderTips 补挂的 `.p10-tip` 会在下次切语言被 `applyToDom` 的 `textContent` 覆盖掉，但 renderAll 在 listener 链中后执行、renderTips 有缺失即补（guide.js:176-181）——**自愈闭环成立**，实测推演无残留。
- **listener 异常隔离**：runtime 逐个 try/catch（runtime.js:192-194），单个监听器抛错不阻断切换。index.js:216-218 注册 `refreshTextNodes`、guide.js:260 注册 `renderAll`，各只注册一次。
- **边界披露**：desktop-ui.js **未注册任何 onLocaleChange**（全文 grep 零匹配）——状态栏 title、`ft-settings`「设置」按钮、设置模态全部动态文案、px 提示 HINT_PX/HINT_DEFAULT 在 en-US 下保持中文。这是 p10 范围边界（非本次回归），建议在 PR 描述披露，见 ⑤-B6。

---

## ③ 语言包加载失败行为推演

前置事实（实测）：zh-CN / en-US 双包各 **376 key**、key 集合完全一致（Node 实际加载 `LedI18NPack` 比对：missing=0、extra=0）；语言包 IIFE 仅写 `global.LedI18NPack[code]`（zh-CN.js:14-15），互不依赖；runtime.js 独立定义 `LedI18N`。

| 失败场景 | runtime 可用性 | guide.js `t()` | 打标/静态文案 | 阻断 app.js / desktop-ui.js？ | 启动期 pageerror？ |
|---|---|---|---|---|---|
| **A. 语言包文件缺失/404**（如 en-US.js 未同步） | ✅ 正常（runtime 在前、独立） | ✅ 正常：当前语种 zh-CN 可查；`getAvailable()` 只报 zh-CN | `index.js:37-43` 按包存在性注册，缺包静默跳过；`zhPack/enPack` 任一为 null → `isKeySafe` 恒 false（index.js:74-77）→ 全部 MAP 条目 lookup 后被跳过，**静态文案保留 HTML 原中文**（正确降级，绝不显示裸 key） | ❌ 不阻断（两文件对 i18n 零引用） | 【待确认】**预期无**：Chromium 对 script 资源加载失败只触发该元素的 `error` 事件，不进入 `window.onerror`/pageerror；但 app:// 协议下未实测 |
| **B. 语言包语法错误**（IIFE 抛错） | ✅ 正常 | ✅ 当前语种可查；切到坏包时 `setLocale` 因 `!packs[code]` 直接返回 false（runtime.js:183）——**切换失败静默无提示**，下拉框显示值与实际 locale 短暂不一致（`sel.value` 在下次 renderAll 才回正） | 同 A：缺包 → isKeySafe 拦截，静态保留中文 | ❌ 不阻断（每个 `<script>` 独立编译，后续脚本照常执行） | 【待确认】**预期有**：脚本编译/求值错误会触发 window error 事件（区别于场景 A 的资源加载失败）；需在目标 Electron 版本实测确认 |
| **C. localStorage 不可用** | ✅ 完整可用 | ✅ | ✅ 完整 | ❌ | **无**：读（runtime.js:119-127）与写（:132-138）均 try/catch 静默降级；`readStoredLocale` 返回 null → 默认 zh-CN；Electron app:// 下 localStorage 正常可用（DEC-11），且 locale 另有 settings.json 真源校准（index.js:277-284，异步、不阻塞首屏） |
| **D.（附）runtime.js 本身缺失** | ❌ `LedI18N` 未定义 | ✅ 优雅回退返回 **key 本身**（guide.js:21-23 显式守卫） | index.js:25-31 console.error 后整体早退，**不抛异常** | ❌ | **无** |

补充判定：

- **guide.js 的 `t()` 优雅回退成立**：双层回退——`LedI18N` 缺失返回 key（guide.js:21-23）；`LedI18N.t` 缺 key 先回退参照语种、再回退 key 本身并只告警一次（runtime.js:73-88）。「绝不显示空白 UI」的设计目标在四个场景下均成立。
- **不阻断 app.js/desktop-ui.js**：四场景下均不阻断——两文件对 i18n 零引用（grep 实证），即使 runtime 缺失也只是失去翻译能力。
- 🔴 **架构口径偏差（记录，不阻断）**：DEC-11 说"localStorage 可用但统一走 IPC 更可控"，i18n 的 locale 持久化直接用了 localStorage + settings.json 双写校准（index.js:273-284 注释自述"localStorage 只是缓存"）。语义自洽（locale 是 UI 偏好非业务设置），但与既有口径存在两套持久化通道，建议在文档明确这一豁免。

---

## ④ 机制可沿用性规约（负责人特别要求项）

### 4.1 直接回答：后续功能**不是**只能依赖 p10.* 局部实现

`p10.*` 只是本 PR 为新增文案选的**域前缀**，不是机制边界。这套 i18n 是通用运行时，任何在 `i18n/index.js` 之后加载的桌面渲染层代码都可直接使用完整 API 面（`global.LedI18N`，已冻结，runtime.js:258-275）：`t(key, params)` / `registerPack` / `setLocale` / `getAvailable` / `onLocaleChange` / `applyToDom` / `completenessReport`。语言包也按域预留了尚未消费的命名空间（`menu.*` / `status.*` / `dlg.*` 等，zh-CN.js:17-40，目前 desktop/main 与 desktop-ui.js 均未接入——grep 实证零引用）。

### 4.2 接入规约（新功能照此执行）

**R1 取 key**：
- 动态渲染的文案一律 `LedI18N.t(key)`，需要插值用 `{0}`/`{name}` 占位 + `t(key, params)`（runtime.js:56-65）；
- 静态 HTML 里的文案**不写 t()**，走 text-map：在 `i18n/text-map.js` 的 MAP 追加 `[中文原文, key]`（text-map.js:28-106），打标自动完成。

**R2 key 命名与双包同步**：
- 命名 `<域>.<语义>`，稳定 ASCII，永不随文案改写而变动（zh-CN.js:6-7）；新功能申请新域前缀（如 `p11.*`），不要往 `html.*`（根 index.html 静态文案专用）、`menu.*`、`dlg.*` 里混塞；
- **zh-CN.js 是参照语种（reference）**：新 key 必须同时落 zh-CN.js 与 en-US.js，且 zh-CN 值必须与 DOM TextNode 逐字相等（含全角标点）——`isKeySafe` 三重校验（双包同 key + zh 值逐字相等，index.js:61-77）不满足即静默跳过并 console.warn；
- 提交前自检：Node 加载双包跑 `LedI18N.completenessReport()`（或直接加载比对 key 集合），`complete` 必须为 true——本次实测 376/376 用的就是这条路径。

**R3 动态渲染接语言切换**：
- 模式 = 「**一次建宿主、每次切语言清空重建**」：宿主元素用 id 幂等守卫创建一次，内容节点在 `renderAll()` 里 `clear()` 后重建（照抄 guide.js 的 renderGuide/renderPitchHelp 结构，guide.js:61-90、93-111）；
- 启动时 `LedI18N.onLocaleChange(renderAll)` 注册**一次**；`setLocale` 链会先 `applyToDom()` 再通知 listeners（runtime.js:188-194），listener 内**不要**再调 `applyToDom` 或操作通道 A 节点；
- 由运行时事件驱动的局部文案（如 PX 来源标识随 `led:pitch` 变化）：事件回调里只 `t()` 取当前语种重写（照抄 guide.js schedule/rAF 节流模式，guide.js:230-237）。

**R4 两条路径的分工边界**：

| | text-map 静态打标 | `_t()`（即 `LedI18N.t`）动态渲染 |
|---|---|---|
| 适用 | **脚本加载时已存在于 HTML** 的 TextNode，中文原文逐字命中 MAP | 运行时创建/覆写的一切文本 |
| 切语言 | runtime 自动重刷（通道 A applyToDom / 通道 B refreshTextNodes） | 模块自己接 onLocaleChange 重渲染 |
| 硬约束 | 节点会被 app.js/desktop-ui 运行时覆写的**必须进 EXEMPT**（text-map.js:117-131）；纯文本子元素走通道 A、混合内容走通道 B | 宿主必须幂等；listener 异常自行兜底 |

**R5 新增桌面模块的接线位置**：脚本标签加在 desktop-adapter.cjs `I18N_SCRIPT_BLOCK` 内 app.js 之前（或 desktop-ui.js 之后——只要该模块自己建节点、不指望 text-map 自动打标即可）；桌面专属样式进 app.css（p10 样式先例 app.css:1370-1472）。

### 4.3 反模式清单（以下做法会破坏机制）

1. **指望 text-map 自动翻译运行时创建的节点**——打标是一次性启动动作（`hasTagged` 置位后不再遍历，index.js:130-138），动态节点必须走 `t()`。
2. **对被 app.js / desktop-ui.js 运行时覆写的节点打标而不进 EXEMPT**——下次覆写后语言切换会把运行时值重置回译文（result-badge / core-note / live-* 等现有豁免项就是前车之鉴）。
3. **用 `t()` 做 isKeySafe 式校验**——`t()` 返回当前语种值，en-US 冷启动时与中文原文比较会全量误判；必须读包原始值（index.js:66-73 注释已记录该教训）。
4. **用 `String.replace(string, repl)` 写译文**——`$&`/`$'` 会被当作替换模式解释；必须 split/join（index.js:98-103 已实现，勿回退）。
5. **innerHTML / 跨标签正则替换文案**——阶段 2 曾因此产生 1393 pageerror（index.js:19-20 记录）；只允许 textContent / nodeValue / DOM API。
6. **缓存 `LedI18NTextMap` 的闭包引用**——构建中间态下映射表后加载时闭包恒为 undefined；必须每次动态读全局（index.js:47-49）。
7. **在 `i18n/index.js` 之后才注册语言包**——index.js 启动序列（注册→打标→init→校准）只跑一次，后注册的包不参与首轮打标校验。
8. **listener 内部依赖执行顺序或产生非幂等副作用**——runtime 不保证 listener 之间顺序之外的任何契约（refreshTextNodes 与各模块 renderAll 的先后可变）。
9. **往根 index.html / src/ 写 i18n 标记**——DEC-03 红线：HTML 离线版冻结，i18n 资产只在 desktop/renderer/，且 `desktop/renderer/i18n/` 不进 build.mjs 输入清单（runtime.js:7-10），打标只能发生在桌面副本。
10. **新增文案只改单包**——`completenessReport` 只在控制台告警，不会阻止启动；漂移 key 会在运行期表现为裸 key 或残留中文，必须靠 R2 的提交前自检拦截。

---

## ⑤ 合并前必须处理项 与 建议级改进项

### ⑤-A 合并前必须处理（Blocker 级，2 项）

**A1. 语言切换下拉挂在 `display:none !important` 的容器内 —— 用户没有任何入口切换语言**
- 证据：guide.js:187 `var panel = byId('settings-panel') || …` → 追加 `#p10-lang`（:189-210）；而 `#settings-panel { display:none !important }`（app.css:117-119，注释自述"HTML 版的设置浮层在桌面版由自绘模态承担"）；desktop-ui.js:1743-1749 进一步说明该容器在桌面版是不可见浮层、其内输入框都必须搬出来才可见。
- 后果：`#p10-lang-select` 存在于 DOM 但**用户不可见不可达**；主进程菜单也无 locale 切换项（desktop/main grep 零匹配）。语言切换功能对用户等于不存在。
- 为何 QA 未拦截：`p10-ui-verify.cjs` 的语言切换用例（:29、:110-124）是 `getElementById` 后程序化赋值 + dispatch change，**只验证了功能链路、未验证可见性**——与其"语言切换控件存在"的检查项（:73）存在覆盖缺口。
- 处置建议：把语言选择器挂到桌面自绘设置模态（需在 `openSettingsModal` 重建 modalBodyEl 后补挂，可复用 guide.js 现有 MO 补挂模式），或 header 常驻下拉；二选一由负责人定，修复后需在 p10-ui-verify.cjs 增加"可见性 + 点击可达"断言。

**A2. FAQ 第 3 问答案文本漂移 —— en-US 下该答案残留中文（静默失效）**
- 证据链：PR #9 的 FAQ 补丁把桌面副本该行改为「A：不能由物理尺寸单独确认。v1.3.0 的 P 值估算只是理论值…」（desktop-adapter.cjs:401-402，实测 index.html:292 与之一致）；但 text-map MAP（text-map.js:103）与双包 `html.faq.a3`（zh-CN.js:384、en-US.js:384）仍是**旧文案**「A：不能。物理尺寸只决定比例…」。
- 机制后果：精确相等 lookup 落空（index.js:158-159 直接 continue，**连 skipped 计数都不进**，无任何告警）→ 该 TextNode 不打标 → 语言切换后保持中文；同节点下方的 Q3 问句正常翻译，形成中英混排。
- 处置建议（3 处小改）：MAP a3 条目 + 双包 `html.faq.a3` 值统一改为 FAQ_PATCH 文案（zh 值必须与桌面副本逐字相等，见 ④-R2）。同款漂移风险应排查 `html.hintColloquialTable` 等 ⑦ 系列改写过文案的条目——本轮核对 FAQ_PATCH 仅此一条命中。

### ⑤-B 建议级改进项（不阻断合并，6 项）

**B1. adapter/资产内三处「app.js 依赖 LedI18N / app.js 里有 _t()」注释与现实不符**（desktop-adapter.cjs:494-495、runtime.js:25-26、i18n/index.js:7-11）——app.js 零引用 i18n（grep 实证）。修正注释，否则后续维护者会误判加载顺序的强制性。

**B2. guide.js `start()` 的 40×50ms 轮询注释误导 + 启动期 2s 空转**（guide.js:240-246）：`.pitch-settings-row` 只在设置模态打开时创建（desktop-ui.js:1819），启动期轮询必然超时后走 renderAll；真正兜底是 MO（:250-257）。建议改注释为「等待设置模态首次打开」或直接删除轮询只留 MO + 立即 renderAll。

**B3. `sync-assets.mjs --check-only` 的 index.html 漂移检查未覆盖 i18n 注入**（sync-assets.mjs:131-143 只查 desktop-ui.js / app.css / led-pitch.js / 路径重写）——副本若被回退掉 i18n 块可漏检。建议补一条 `if (!adapted.includes('i18n/runtime.js')) problems.push('缺 i18n 脚本块')`。

**B4. en-US 下 desktop-ui 动态文案与主进程菜单保持中文（范围边界，建议披露而非修复）**：状态栏 title 与「设置」按钮（desktop-ui.js:251-275）、设置模态全部文案（:1774-1840）、px 提示 HINT_PX/HINT_DEFAULT（:2600-2602）、desktop/main 菜单——均未接 i18n。语言包已预留 `menu.*`/`status.*`/`dlg.*` 域。建议在 PR 描述与 docs 明示"本 PR 仅覆盖静态 HTML 文案 + p10 新增模块"，避免上线后被当缺陷报告。

**B5. 语言切换后 guide 内层 `<details>` 折叠状态被重置**（renderAll 清空重建，guide.js:84-89）——用户展开的"专业功能"等分节在切语言后收回默认态。纯体验项，可接受；若要保留可在 renderGuide 里回写 open 状态。

**B6. locale 持久化与 DEC-11「统一走 IPC」口径的双通道豁免未入文档**（runtime.js:132-138 localStorage 直写 + index.js:277-284 settings.json 校准）。语义自洽但应在 DEC 文档补一行豁免说明，防止后续审计误报。

### ⑤-C 未决不确定项（汇总）

- 【待确认】app:// 协议下 script 资源加载失败是否严格不触发 pageerror（③ 场景 A）；
- 【待确认】语言包语法错误时 Electron renderer 的 pageerror 上报路径（③ 场景 B）——建议随主理人的 Electron 实测一并验证，各注入一个坏包观察 console；
- 两次 sync 哈希一致性沿用实施方报告（pr10-implementation-report.md:42），本次未复跑（只读约束）。
