# LED-ratio-Tool · Windows 桌面版

LED 大屏物理尺寸 → 视频画布分辨率换算工具的 Windows 桌面版本。
业务内核与 HTML 版**完全相同**（`core.js` 逐字节复用，SHA-256 哈希锁保护），桌面版只增加原生外壳与桌面交互。

---

## 一、当前状态

| 能力 | 状态 |
|---|---|
| Electron 启动与窗口初始化 | ✅ 已实现并实测 |
| `app://` 本地资源加载 | ✅ 已实现并实测 |
| preload 与 IPC 最小安全边界（8 方法） | ✅ 已实现并实测 |
| CSP 阶段一配置与安全验证 | ✅ 已实现并实测 |
| `core.js` 原样复用（SHA-256 锁） | ✅ 已实现并实测 |
| settings 与 sessionData 分离 | ✅ 已实现并实测 |
| 最小窗口 / 高 DPI / 工作区检测 | ✅ 已实现并实测（100% / 125% 两档真机，见 §1.5） |
| **完整业务 UI（F-01~F-18）** | ✅ **已实现**（16 项全通过 / 2 项有缺口，见 `DESIGN-ALIGNMENT.md` §5） |
| 三档响应式布局（1280 三栏 / 两栏 / 1024 纵向堆叠） | ✅ 已实现并分别验收 |
| 高度降级三档（DEC-16 `standard` / `compact` / `tight`） | ✅ **②/③ 档收纳已实施**（TK-72 闭合，`TC-H-01~15` 15/15 通过；四类核心操作任何档位都不隐藏） |
| 12 组快捷键 × 4 种焦点状态 | ✅ 已实现并实测 |
| 原生菜单栏 + 底部状态栏 + 拖拽分栏 | ✅ 已实现并实测 |
| TK-161 结果锚点条按「实际列数」显示 | ✅ **已实施**（规则 RC-161-1 + `E1` 例外 `stacked × tight`，见 `DESIGN-ALIGNMENT.md` §11.1） |
| **UI Polish（滚动条 / 分段按钮 / 滚动区域）** | ✅ **已完成**（`b48aaa8`，仅改 `renderer/app.css`）：自绘滚动条（命中区 10px / 视觉滑块 6px）、分段按钮三档全部单行、列表留白与内外层滚动隔离。详见 §1.1 |
| 桌面专项 E2E | ✅ **93/93 通过**（TC-D 20 / TC-DP 10 / TC-DS 10 / TC-EX 12 / TC-MENU 10 / TC-COPY 6 / TC-RESIZE 8 / TC-H 17） |
| HTML 版 E2E | ✅ **85/85 通过**（依赖系统安装的 Google Chrome） |
| `core.js` 单元测试 | ✅ **64/64 通过** |
| 业务红线守卫 | ✅ **8 处受保护口径**（A-01~A-08）+ `core.js` SHA-256 哈希锁 |
| 安全静态审计 | ✅ **47/47 通过** |
| 200 组差分（DEC-15） | ✅ **完全通过**：200/200 执行，差异 **0** 条，未覆盖字段 **0**，字段级覆盖率 **100%**（43 个字段 / 6,882 条 L1 断言） |
| 视觉回归 | ✅ **3/3 通过**（1440×900 / 1200×800 / 1024×680，阈值 0.1%）：三张基准已于 `b48aaa8` **按授权更新**至 UI Polish 后的实际画面，重跑差异 **0.0000%**、更新 0 项（明细见 §1.1） |
| 高 DPI **100%** 档 | ✅ **21/21 通过**（`scaleFactor = 1` 实读，非模拟）+ P7-5 产物验收 **8/8** |
| Windows CI 工作流 | ✅ **已在 GitHub 实际运行并通过**（次数与逐次结论以 Actions 页面为准，本表不写死以免每次推送即过期）。`Protect main` 规则集已把 **`Windows · 桌面版门禁`** 设为 required status check；PR #1（→ `626673f`）、PR #2（→ `a1dc1ae`）均在该门禁下合并。本轮 D-08 图标 + P7-2 安全实证的 required check 结果以 **PR #3** 页面实时状态为准 |
| **品牌图标（D-08 最终 LOGO）** | ✅ **已完成**（`cc9be31`）：最终 LOGO → `icon.ico` 7 档（16~128 = BMP，256 = PNG）+ `icon-256x256.png`，旧占位图已删除。exe / 安装包 / 便携版 / 已安装程序 / 卸载器 / 快捷方式 / 标题栏 / 任务栏 **八处实测同源**（前五处与 png 为**逐字节一致**，快捷方式为 .lnk 字段核对，标题栏与任务栏为实截核对），并新增 `verify:icons` 10 项自检进入 CI 门禁。详见 §1.2 |
| **Electron 安全配置实体验证（P7-2）** | ✅ **已完成**（`76e893b`）：拿最终产物验证，不读配置。Fuse Wire `010011001` 8 项全部符合安全目标、与官方 `@electron/fuses` 三方一致、相对官方 `electron.exe` 翻转 7 个；`ELECTRON_RUN_AS_NODE=1` / `NODE_OPTIONS` / `--inspect` 三项运行时攻击全部无效；asar 不放行目录回落；三种篡改位置分别验证并披露覆盖范围边界；并含「清场基线」防止断言空转。`test:fuses` 16/16，已进 CI 条件门禁。详见 §1.3 |
| **正式生产打包（P7-4）** | ✅ **已完成**：NSIS 安装包 + Portable 便携版双形态、同版本 `1.1.0`，版本/大小/SHA-256/签名状态四项齐备（`test/reports/p7-artifacts.json`，SHA-256 经 `certutil` 三方复核一致）。**签名状态 = NotSigned**（`no code signing certificate configured`，PE 证书表 Size=0）→ 仍为发布阻塞项。详见 §1.4 |
| **真实 Windows 环境验收（P7-5）** | ✅ **已完成（28 项 / 26 通过 / 2 SKIP / 0 失败）**：安装·启动·卸载、覆盖安装·版本升级（1.0.0→1.1.0）、设置持久化与数据保留、便携版中立目录与断网可用全部实测。过程中**改掉 1 个真实产品缺陷**（`settingsGet` 是 Promise，按同步对象判断导致持久化永不生效）与 3 处假判据。详见 §1.5 |
| **产品品牌统一（P7-1 · Brand Identity Unification）** | ✅ **已完成**：产品身份全面统一为 `LED Ratio Tool`——窗口标题、应用内品牌栏（品牌图标 + 名称）、顶栏实时换算分辨率（数据同源 + 三态）、快捷方式名、关于窗、HTML `<title>`、EXE 文件描述；内部技术身份（`appId` / `APP_DIR_NAME` / IPC 通道）保持稳定不变。根 HTML 版 85/85、桌面冒烟 0 报错、图标自检 10/10。详见 §1.6 |
| 高 DPI **125%** 档 | ✅ **8/8 渲染项通过**（系统级缩放真实切换，`scaleFactor=1.25` / `dpr=1.25` 双证） |
| 高 DPI **150%** 档 | ⛔ **BLOCKED（本环境不可达）**：`SPI_SETLOGICALDPIOVERRIDE` 只到 `index=1`（125%），`index=2/3/4` 一律回落 `GetDpiForSystem=120`；注册表 `PerMonitorSettings\SIMULATED_…\DpiValue=2` 写入后应用实测仍 `1.25`、工作区仍 `820×567`，生效需注销重登（会终止本会话）。**未用模拟手段冒充**，详见 §1.5 ⑥ |
| **窗口完整可达（DPI-09）** | ❌ **三档全部不通过**：本机 1024×768（工作区 1024×720）下，`MIN_CONTENT_W/H = 1024×680`（DEC-07）+ 边框 15/64 → 100% 溢出 16/26px、125% 溢出 219/177px。属**预存尺寸策略**，须决策（见 §1.5 ⑤），本节不擅自改设计 |

> 📅 **本文档数据截止：2026-11-02（P7-4 / P7-5 轮次），分支 `feature/desktop-windows`**。数字均取自 `desktop/test/reports/` 下的真实报告与 GitHub Actions 实际运行记录，不手工估算。本文档自身的后续文档提交不计入上述测试数据。

> ✅ **当前测试门禁全部通过**：桌面 E2E 93/93、HTML E2E 85/85、单元测试 64/64、安全审计 47/47、200 组差分完全通过、视觉回归 3/3、100% 缩放档 21/21、图标自检 10/10、最终产物安全实证 16/16、**P7-5 产物级验收 26/26（另 2 项 SKIP）**、**P7-5 DPI 渲染 100%/125% 各 8/8**。

> ⚠️ **但本工程仍不是可交付版本。**（P7-4 / P7-5 完成后依旧成立，只是阻塞项被写实了）
> ① **代码签名仍缺失** —— 双形态产物已出，但三处 PE 证书表全为空（`NotSigned`）。签名不是「有更好」，是「没有就无法证明产物未被替换」；
> ② **150% 高 DPI 未验收** —— 本环境不可达（不是没测，是测了但环境给不出 150%），见 §1.5 ⑥。125% 已真机实测通过；
> ③ **窗口完整可达性（DPI-09）三档不通过** —— 这是 P7-5 新暴露的**预存尺寸策略**问题，须在发布前决策（§1.5 ⑤），不得当成「已验收」；
> ④ 产品验收与发布放行权属项目负责人（DEC-05）—— **测试通过 ≠ 可以发布**；PR 保持 Open，不自行合并。

> 📋 **设计与实现对照**见 [`DESIGN-ALIGNMENT.md`](DESIGN-ALIGNMENT.md) —— 逐条记录 P3 设计基线在桌面版的落地位置、差异、待裁决项（TK-140 ~ TK-150）。

### 1.1 UI Polish（2026-11-02 · `b48aaa8`）

只改 `desktop/renderer/app.css`（+105/−7）与三张视觉基准；未动 `src/core.js` / `src/app.js`、TK-161 与 `E1` 规则、主进程、IPC、安全策略、构建配置与依赖。

| 优化项 | 关键做法 | 实测结果 |
|---|---|---|
| **自绘滚动条** | 根因不是配色，而是同一选择器同时写了 `scrollbar-width: thin` 与 `::-webkit-scrollbar` —— Chromium 121+ 只要见到前者就**改用平台原生滚动条并忽略 webkit 着色**。删掉 `scrollbar-width`，让 `::-webkit-scrollbar` 成为唯一真源：轨道 `#17191D`、滑块 `#3C424B`、悬停/按下 `#59616D`，2px 透明边框 + `padding-box` 裁切 | 命中区 **10px**、视觉滑块 **6px**（两侧各 2px 透明）；四类滚动容器（`.list--scroll` 三个实例 / `.table-wrap` 两个 / `.modal__body`）**几何 0 差异**；滚轮、拖滑块、`PageDown` / `End`、悬停提亮全部正常；**未**使用 `display:none` / `scrollbar-width:none` / `overflow:hidden`，可发现性保留 |
| **分段按钮单行化** | 不是字太大，而是 `flex:1` 均分 + 左右各 8px 内边距把可用宽压到比文本窄 1~2px（「以选中标准比例」需 91px 只分到 89px、「常用规格」需 52px 只剩 51px）。三组 `__item` 改 `flex:1 1 auto`、左右内边距 8→4px、`white-space:nowrap`；容器保留 `flex-wrap` 兜底（极窄时不裁字） | 三档验收尺寸下 **100% 单行**：容器高度恒 **32px**（= 单行 28 + 上下 padding 4；折成两行会升到 62px），项内 `scrollWidth ≤ clientWidth` 无裁切；字号与命中区（视觉 28 + 上下各 4px 透明 = 36）均未变 |
| **滚动区域与信息密度** | `.list--scroll` 上下各 4px 留白（末行不再与卡片下沿糊在一起）；含折叠按钮的分组标签行高 18→32px 与芯片同高（原先芯片中心低 7px、32px 浮动按钮溢出组盒 14px 并压到下一组 2px）；列表 / 表格 / 模态正文加 `overscroll-behavior: contain` | 芯片与标签对齐、不再压到下一组；内层滚到底不再带动外层面板（滚轮 Δ180 时面板 Δ0）；客户区尺寸与面板高度**零变化** |

**视觉基准（三张，已按授权更新）**

| 基准 | 更新前差异 | 更新后状态 | 新 Blob SHA |
|---|---|---|---|
| `baseline-1440x900.png` | 3.5439% | ✅ PASS（0.0000%） | `42ad967e29474ca10c336a3dfce93a751c68cf71` |
| `baseline-1200x800.png` | 3.4673% | ✅ PASS（0.0000%） | `078ec98fe43030d3456901e6752779af9c63255b` |
| `baseline-1024x680.png` | 0.7495% | ✅ PASS（0.0000%） | `8dbba4938c57d521cbda167b7729a816792cc8f7` |

> 🔒 只更新上面三张，**未动其他基准、未重建历史基准**；更新后基准与 `test/shots/visual-*.png` 字节一致，重跑视觉回归 **3/3 PASS、更新 0 项**。
> 🔒 自绘滚动条带来的文字差异已定性为**像素级重栅格化**而非排版变化：A/B 对照（把 `scrollbar-width: thin` 加回）下 **284 / 287 / 287 条文本节点矩形 0 差异**（位置、宽高、字号、行高逐条比对），差异仅落在字形边缘与滚动条条带；放大 5 倍目视清晰，锐度指标略优于旧版。
> ⚠️ **UI Polish 不改变发行状态**：正式安装包 / 代码签名 / 完整安装链路仍待 P7，**125% 与 150% 高 DPI 仍为 BLOCKED** —— 见 §一 的 ①②。

### 1.2 品牌图标（D-08 · 最终 LOGO 落地）

| 项 | 内容 |
|---|---|
| **源图** | `LED Ratio 图形标志 透明底.png` 594×594 RGBA；**只有 4 种不透明色**：`#27251F` 45.3% / `#1B1D21` 24.2% / `#F0A832` 21.9% / `#6E747E` 0.6%；有效内容 **570×570 居中**，四边透明留白 12px（2.0%） |
| **生成物** | `resources/icon.ico` **7 档 / 103,608 B**；`resources/icon-256x256.png` **1,458 B**。原占位图（6,268 B，7 档全 PNG 压缩）已删除替换 |
| **ico 内部构成** | 16 / 24 / 32 / 48 / 64 / 128 = **32bpp BMP + AND 掩码**（自下而上 BGRA，掩码在 alpha<128 处置位，兼容忽略 alpha 的旧渲染器）；256 = **PNG**（IHDR 与目录项一致） |
| **缩放算法** | 预乘 alpha 的**可分离面积平均**（box/area），每次都从 594 原图**直降**目标尺寸，不逐级减半 —— 避免透明边缘出现暗色晕圈与累积误差 |
| **16×16 特例** | 源图上下橙框仅 12/594，在 16px 下 = **0.32px**：忠实缩放会丢掉上下边框、只剩左右两根橙柱，「橙框」品牌特征被破坏。故 16 档改用**等宽 2px 橙环 + 深色内屏**的简化剪影（内部横条/细线舍弃）；**32 档及以上仍为忠实重采样**，与源图构图逐像素对应 |

**集成点（全部指向同一份 ico）**

| 位置 | 配置 | 作用 |
|---|---|---|
| 应用 exe | `win.icon` | rcedit 写入 exe 资源表 → 任务栏、窗口标题栏、桌面/开始菜单快捷方式的**默认图标源** |
| NSIS 安装程序 | `nsis.installerIcon` | `setup.exe` 自身图标 + 助手式安装器界面图标（MUI_ICON）+ 快捷方式图标 |
| NSIS 卸载程序 | `nsis.uninstallerIcon` | 安装后生成的 `Uninstall *.exe` 图标 |
| 开发版窗口 | `main.js` 的 `BrowserWindow.icon`（**仅 `!app.isPackaged`**） | 打包版由 Windows 回落到 exe 内嵌图标，无需重复指定；开发版没有 exe，不指定就会显示 Electron 默认图标 |
| ~~`nsis.installerHeaderIcon`~~ | **未配置（有意）** | scheme.json 标注 *one-click installer only*，本项目 `oneClick:false` → 该键无效，配了也只是一段死配置 |

**资源自检 `build/verify-icons.mjs`（10 项，已接入 `build:win` 与 CI 门禁）**

ICO 头 → 尺寸集合 → 偏移不越界不重叠 → DIB 头（40B / 32bpp / BI_RGB / height=2×width）→ 品牌色占比 ≥50% → **不含旧占位色** `#FFC169` / `#8A9099` / `#17181C` → 内容铺满 ≥90% 且四边留白对称 → `icon-256x256.png` 与 256 条目**字节一致** → yml 三个引用可解析 → `main.js` 引用可解析。
> 🔒 断言对象是**真正随包发出去的那份资源**，不是配置字符串 —— 占位图若被回退，IC-05/IC-06 立刻失败。

**实测验收（本机真实打包 + 静默安装，非推断）**

| 核验对象 | 方法 | 结果 |
|---|---|---|
| `dist/win-unpacked/LED Ratio Tool.exe` | 解析 PE 的 `RT_GROUP_ICON` + `RT_ICON` 重组为 .ico，与 `resources/icon.ico` 比对 | ✅ 7 档齐备，**字节完全一致** |
| `...-setup.exe`（安装包） | 同上 | ✅ **字节完全一致** |
| `...-portable.exe`（便携版） | 同上 | ✅ **字节完全一致** |
| 已安装 `LED Ratio Tool.exe` | 静默安装到独立目录后同上 | ✅ **字节完全一致** |
| `Uninstall LED Ratio Tool.exe` | 同上（安装目录内生成） | ✅ **字节完全一致**（同目录生成的 `uninstallerIcon.ico` 亦一致） |
| 桌面 / 开始菜单快捷方式 | 解析 `.lnk` 的 LinkInfo + StringData + ExtraData | ✅ 目标 = 已安装 exe，`iconLocation` **显式指向同一 exe、索引 0** —— 无独立 .ico 路径，不存在旧图标回退面 |
| 窗口标题栏（打包版） | Win32 `BitBlt` 实截窗口 | ✅ 「橙框 + 深色内屏」品牌标 |
| 窗口标题栏（开发版） | 同上（`electron .` 未打包运行） | ✅ 同一品牌标，**不再是 Electron 默认图标**（验证 `main.js` 的 dev 分支真实生效） |
| 任务栏 | 实截主屏任务栏 | ✅ 运行中的实例显示品牌标 + 活动指示条 |
| 旧占位图残留 | 旧 exe 内嵌图标重组 = `f1dda010…` / 6,268 B；新 = `0498c249…` / 103,608 B | ✅ 已全部替换；仓库内已无旧配色素材 |

> 🔒 **有意未做**：`index.html` 未加 favicon。桌面版没有标签页，不需要；HTML 单文件版受「零 `link href` / 零 http(s)」自包含约束（`ACCEPTANCE.md` 已列）——加 `data:` favicon 会破坏该口径，故不加。
> ⚠️ **图标落地同样不改变发行状态**：仍未做代码签名（P7 BLOCKED），125% / 150% 高 DPI 仍未验收。本节只证明「品牌标识在各处统一、无旧图标或占位图」，**不构成可发布结论**。

### 1.3 P7-2 · Electron 安全配置实体验证（拿最终产物验证）

> 验收口径来自任务原文：**「拿最终产物验证，而不是仅凭配置文件认定安全配置已经生效。」**
> 因此本节所有结论都来自 `dist/win-unpacked/LED Ratio Tool.exe` 这个 249,865,728 B 的二进制本身，以及**把它真的跑起来**的可观测行为。`build/electron-builder.yml` 里的 `electronFuses` 段只作为「安全目标表」的来源，**不作为证据**。
>
> 一键复现：`npm run test:fuses` → 16/16。报告：`test/reports/fuses-verify.json`。

**① 静态：从二进制里把 Fuse Wire 读出来**

Electron 的 fuse 不是配置项，而是 exe 里的一段固定结构：`SENTINEL(32B) + [version][length][N×state]`，state 只有 `48='0'`（DISABLE）/ `49='1'`（ENABLE）/ `114='r'`（REMOVED）/ `144`（INHERIT）。

| 项 | 实测 |
|---|---|
| sentinel 位置 | `202514712`，**全文件唯一一处** |
| wire 头 | `version = 1`、`length = 9`（第 9 位属新增 fuse，`@electron/fuses@1.8.0` 未覆盖） |
| wire 原文 | `010011001` |
| 交叉核对 | 自写解析器 ≡ 官方 `@electron/fuses` 读数 ≡ 安全目标表，**三方一致** |
| 相对官方 `electron.exe` | **翻转了 7 个**（仅 `LoadBrowserProcessSpecificV8Snapshot` 未变，因其官方默认已是 DISABLE） |

| # | fuse | 安全目标 | 二进制实测 | 判定 |
|---|---|---|---|---|
| 0 | `RunAsNode` | 关 | DISABLE | ✅ |
| 1 | `EnableCookieEncryption` | 开 | ENABLE | ✅ |
| 2 | `EnableNodeOptionsEnvironmentVariable` | 关 | DISABLE | ✅ |
| 3 | `EnableNodeCliInspectArguments` | 关 | DISABLE | ✅ |
| 4 | `EnableEmbeddedAsarIntegrityValidation` | 开 | ENABLE | ✅ |
| 5 | `OnlyLoadAppFromAsar` | 开 | ENABLE | ✅ |
| 6 | `LoadBrowserProcessSpecificV8Snapshot` | 关 | DISABLE | ✅ |
| 7 | `GrantFileProtocolExtraPrivileges` | 关 | DISABLE | ✅ |

**② 动态：把进程跑起来，用行为证明「关」是真关**

每一条都是真实 spawn 进程，不读配置、不 mock。

| 编号 | 攻击动作 | 实测结果 |
|---|---|---|
| D-00 | （基线，非攻击）先清场再空参数启动 | 应用正常启动、stdout 有 `[LED-VERSIONS]` —— 确认后续用例**不是空转** |
| D-01 | `ELECTRON_RUN_AS_NODE=1` + `-e "console.log('NODE_MODE_ACTIVE')"` | 脚本**未被执行**；stdout 出现真实应用启动日志 `[LED-VERSIONS]` —— 环境变量被忽略，未退化为 Node 执行器 |
| D-02 | `NODE_OPTIONS=--require <marker.cjs>` | marker 文件**未生成**，`NODE_OPTIONS` 被丢弃 |
| D-03 | `--inspect=9339` | 端口 9339 **全程未 LISTEN**，无 `Debugger listening` 输出 |
| D-05 | 放一个 `resources/app/`（内含打印 `EVIL_APP_LOADED` 的恶意 `main.js`）与 `app.asar` 并存 | 加载的是 asar 版，`resources/app/` 被忽略 |
| D-06 | 移走 `app.asar`，只留 `resources/app/` | **既未加载目录版、也未启动** —— 不回落 |
| R-01 | 破坏性用例跑完 | `app.asar` SHA-256 回到 `a0e64f77…`，与原始**逐字节一致** |

**③ `ELECTRONASAR` 摘要的口径（这里曾经判错，记下来）**

exe 的 PE 资源里有 `type="INTEGRITY", id="ELECTRONASAR"`，内容是 **JSON 数组**：

```json
[{ "file": "resources\\app.asar", "alg": "SHA256", "value": "b2251cff…" }]
```

**`value` 是 asar header JSON 字符串的 SHA-256，不是整档文件的哈希。** 整档哈希是 `a0e64f77…`，拿它去比必然「不一致」——首跑就是这么误判的。现在的断言是 `sha256(header JSON) == value`，实测 `b2251cffcadbfa9d…` 完全吻合。

**④ ASAR 完整性校验的实测覆盖范围（受控实验，四个位置各试一次）**

这一条最值得记：**「完整性校验生效」不是一句话，它取决于篡改落在哪里、以及由谁去读**。

| 篡改位置 | 启动是否被阻断 | Electron 实际报错 | 退出码 |
|---|---|---|---|
| header 内的 `integrity.hash`（改 1 个十六进制字符，JSON 仍合法） | ✅ **启动前阻断** | `asar_util.cc:357 Integrity check failed for asar archive entry '<header>'` | `0x80000003` |
| payload 首文件 `main/csp.js` 首字节 | ✅ **启动前阻断** | `ASAR Integrity Violation: got a hash mismatch` | 1 |
| `renderer/core.js` 内部偏移 +5000 | ⚠️ **应用先启动，随后 FATAL** | `asar_file_validator.cc:129 Failed to validate block while ending ASAR file stream` | `0x80000003` |
| `renderer/styles.css` 末字节 | ⚠️ **应用先启动，随后 FATAL** | 同上 | `0x80000003` |

结论（**这也是本节的边界披露**）：Electron 对 asar 的校验有两条路径 ——

- **Node 侧 `fs` 读取**：asar 库按 header 里 per-file 的 `integrity.blocks` 做同步哈希校验，失败即阻断 `require`。所以改主进程脚本 = 起不来。
- **Chromium 网络层读取**（`file://` 加载渲染资源）：`asar_file_validator` 按 block 流式校验，错误在「读到损坏块并结束该文件流」时抛出。所以改渲染资源 = 进程已经起来了一部分、打印了启动日志，然后 FATAL 崩溃。

也就是说：**完整性校验确实覆盖 payload 内容（不是只覆盖 header），但渲染资源的篡改不保证在进程启动前被拦截。** 它绝不会静默通过，只是失败的时点晚于启动。D-04c 的断言因此写成「**必须被检测且非零退出**」而不是「必须启动失败」—— 把边界写进断言，而不是用错误的断言掩盖它。

**⑤ 本轮修掉的三处口径错误（都由首跑实测暴露，不是推测）**

| # | 错误 | 真因 | 修正 |
|---|---|---|---|
| 1 | F-05 报「嵌入摘要与实测不一致」 | 拿**整档** SHA-256 去比；且 PE 资源是**数组**不是对象 | 改为 `sha256(header JSON) == value`，按数组解析 |
| 2 | D-04 报「篡改后仍正常启动」 | 篡改点选在 `Math.floor(len/2)`，落在**渲染 payload**；而该路径是流式校验、错误时点在 stream end | 拆成 D-04a/b/c 三个位置，分别对应三种真实机制 |
| 3 | D-04c 一开始报「无任何校验报错」 | asar header 里 `offset`/`size` 是**字符串**（asar 为规避大文件精度问题），`payloadStart + offset` 变成字符串拼接 → 篡改下标算成天文数字 → **写入空操作** | `Number()` 归一，并新增自检：**篡改必须真的改变字节**，否则直接抛错，杜绝空操作骗绿 |

**⑥ CI 首跑抓到的「空转假绿」（本地全绿、runner 上暴露）**

首次上 CI（run #48）时 D-01 失败、其余看着全绿。翻报告才发现：**D-02 的 `appStarted` 也是 `false`** —— 也就是说前两个用例里应用根本没启动，而「marker 未生成」照样成立、断言照样通过。

- **真因**：打包验收步骤（`test:pc`）可能留下实例，Windows **单实例锁**让后续新进程**静默退出**（stdout 只有一个 `\r\n`）。D-04 段开头本来就有 `killApp()`，所以之后的 D-05 一切正常——这也解释了为什么只有前两条"不启动"。
- **危害**：如果只把 D-01 修成「看到启动日志就算过」，D-02/D-03 依然是**假绿**——它们断言的是"某个坏结果没发生"，而"没发生"的最省事解释就是"进程压根没跑"。
- **修法**（不是放宽断言，而是**加前置条件**）：新增 **D-00 清场基线** —— 先 `taskkill` 并**轮询确认进程真的消失**，再空参数启动一次，必须看到 `[LED-VERSIONS]`；同时把 D-02/D-03 的断言改成「**坏结果没发生**」+「**应用确实已启动**」两个条件同时成立。这样一来，环境起不来就红，不会再有空转通过。

**⑦ CI 口径**

新增步骤「P7-2 Fuses 实体验证（产物在则必过）」：

- **不**塞进 `continue-on-error` 的打包步骤——那等于「验证失败也是绿」，正是 P7-2 要消灭的东西；
- **不**设为无条件门禁——它的输入是打包产物，而打包本身不门禁（联网下载 NSIS/7zip 受网络波动影响）；
- 因此口径写死为：**产物存在时它必须通过（失败即红）；产物缺失时记 SKIP 并在 Step Summary 明示，绝不记 PASS。**

**在 GitHub 上的真实运行记录**（不写「应该能过」）：

| 运行 | 提交 | 结果 | 说明 |
|---|---|---|---|
| run #48 / #49 | `ee47b28` | ❌ **failure** | 步骤 28 失败，**仅 D-01 一条**：`timedOut=false`、stdout 只有一个空行 —— 进程静默退出。翻报告发现 D-02 的 `appStarted` 也是 `false`，即**前两条是空转假绿**（见 ⑥）。根因是单实例锁残留 |
| run #50 / #51 | `3aa20dc` | ✅ **success** | 步骤 28 success；日志中 `检查项 = 16 ｜ 通过 16 ｜ 失败 0`；报告里 D-00~D-03 的 `appStarted` 全部为 `true`（**无空转**）；D-04a/b/c 行为与本地一致；R-01 还原后 asar SHA-256 一致 |

> 💡 这两次运行本身就是本条门禁的价值证明：**如果当初把它塞进 `continue-on-error` 的打包步骤，run #48 会是绿的，而「D-02 空转通过」这个缺陷就会一直藏着。**

> 🔒 **本节能证明什么**：这版二进制的 8 个 fuse 与安全目标一致、`RunAsNode`/`NODE_OPTIONS`/`--inspect` 在运行时确实无效、asar 不放行目录回落、篡改会被检测。
> ⛔ **本节不能证明什么**：**代码签名仍然缺失**（P7 尚未完成），因此「产物未被替换」这一属性无法由本节背书；ASAR 校验保护的是「构建后未被改动」，不是「产物来自可信发布者」。签名与 125%/150% DPI 依旧是发行阻塞项。

### 1.4 P7-4 · 正式生产打包（双形态产物）

> 🔴 **这一节是正式生产构建，不是 CI 的 Preview Candidate。**
> CI 里的打包步骤只用来验证「能不能打出来」且带 `continue-on-error`（失败不拦门禁）；本节是**在本机按发布口径真打一次**，并把四项硬指标（版本号 / 文件大小 / SHA-256 / 签名状态）落成可复核的文件。

**① 构建口径**

| 项 | 值 |
|---|---|
| 命令 | `npm run build:win`（= `preflight` → `verify:icons` → `sync-assets` → `electron-builder --win --x64`） |
| 源码提交 | `aa6de608d1434abe20c4bd513938ec2865c870c8` |
| 版本真源 | `desktop/package.json` → `1.1.0`（DEC-13 三线版本唯一真源，不在别处手写） |
| 耗时 | `real 2m16.694s` |
| 构建日志关键行 | `updating asar integrity executable resource` → `executing @electron/fuses` → **4 处** `no code signing certificate configured, signing is skipped` |

**② 产物指纹（`test/reports/p7-artifacts.json`，SHA-256 经 `certutil -hashfile` 三方复核一致）**

| 产物 | 版本 | 大小 | 签名状态 | SHA-256 |
|---|---|---|---|---|
| `LED Ratio Tool-1.1.0-x64-setup.exe`（NSIS） | 1.1.0 | 115.77 MB | **NotSigned**（证书表 Size=0） | `732c4603ed4fe9c913a7b869af58df72ff68ee0e100032714a1b6fbbf8029dc2` |
| `LED Ratio Tool-1.1.0-x64-portable.exe`（便携版） | 1.1.0 | 105.30 MB | **NotSigned**（证书表 Size=0） | `957bb99b67d82a314bf1fabb2480bcc6969d4d84f7c75a51e5f958855a560be4` |
| `dist/win-unpacked/LED Ratio Tool.exe` | 1.1.0 | 238.29 MB | **NotSigned**（证书表 Size=0） | `c798d7f03a7ce016cc8c7e2fd07fd52cee3938160ad1862962e5f9f9eac5c58a` |
| `…-setup.exe.blockmap` | — | 0.12 MB | 不适用（非 PE） | `fe82e735a0797322829f4cf42d817788c122688434dce2e241962ea0751fb665` |

**③ 怎么"证明"签名状态（不依赖 PowerShell）**

`test/p7-artifacts.mjs` 零依赖、纯 Node 解析 PE：

- 版本号来自 `RT_VERSION(16)` 资源里的 `VS_FIXEDFILEINFO`（签名 `0xfeef04bd`，`ms@+8 / ls@+12 / pms@+16 / pls@+20`，各取 `hi=>>>16`、`lo=&0xffff`）——读的是**文件里写死的**版本，不是 `package.json` 的期望值；
- 签名判据来自**数据目录索引 4（证书表）**：`dd = opt + (is64 ? 112 : 96)`，`dd + 4*8` 处的 `Size > 0` 即存在 Authenticode 签名块。三处产物 `Size` 全为 0 → `NotSigned`，与构建日志的 4 条 `signing is skipped` 互相印证。

> 🔒 **本节结论**：产物是**能装、能跑、版本正确**的正式构建；但 **`NotSigned` 是明确的发布阻塞项**，不得在任何位置写成「已签名」或「签名就绪」。签名需要证书与私钥，属发布决策与凭据授权范围（DEC-05），不在 P7-4 的施工范围。

### 1.5 P7-5 · 真实 Windows 环境验收

> 这是 P7 里唯一「拿装好的东西在真 Windows 上跑一遍」的环节。凡是没跑成、跑不动、环境给不出的，本节一律记为 **BLOCKED / SKIP** 并写明原因，**不换算成通过**。

**① 总结果（`test/reports/p7-acceptance.json`）**

```
检查项 = 28 ｜ 通过 26 ｜ 失败 0 ｜ 跳过 2
判定 = PASS_WITH_SKIP（exit 0）
```

| 组 | 覆盖 | 结果 |
|---|---|---|
| ART-01~02 | 验收对象与 P7-4 指纹一致（防调包）+ 签名状态披露 | 2/2 ✅ |
| INS-01~05 | 静默安装到独立目录 / 装后主程序与 `win-unpacked` **逐字节一致** / 卸载器生成 / 桌面+开始菜单快捷方式 | 4 ✅ + 1 ⏭️ |
| RUN-01~05 | 安装版启动并完成布局（台账实测）/ 1920×1080→`1.7778 : 1` / 3840×1080→`3.5556 : 1` / **运行期 zero 出网**（6 条请求全为 `app:` `data:`）/ 控制台 0 error | 5/5 ✅ |
| SET-01~03 | 改设置立即落盘 / `settings.json` 只含 4 个白名单键 / **重启后读回** | 3/3 ✅（首跑失败→见 ②） |
| UPG-01~05 | 同版本覆盖安装保留设置 / 装 1.0.0 作基线 / 升级到 1.1.0 后主程序 sha 与 1.1.0 一致 / 设置保留 / 升级后换算正确 | 5/5 ✅ |
| UNI-01~04 | 静默卸载后程序文件清除 / **`settings.json` 按 DEC-20 保留**（`tolerancePercent=2.5`）/ 快捷方式清除（轮询至异步卸载完成）/ 注册表项清除 | 3 ✅ + 1 ⏭️ |
| POR-01~04 | 便携版在**中立目录**启动 / `--proxy-server=127.0.0.1:9` 黑洞代理下换算仍正确且外部请求 0 条 / 无 `loadingFailed` / 不创建 Programs 目录 | 4/4 ✅ |

**② 首跑抓到的真实产品缺陷（这是本节最有价值的产出）**

| 现象 | 真因 | 修法 |
|---|---|---|
| `SET-03` 重启后输入框回落默认 `0.5`，但 `settings.json` 里明明是 `1.75` | `desktop-adapter.cjs` 的 `desktopLoadSettings()` 把 `window.ledApi.settingsGet()` 当**同步对象**判断 `r.code === 0`，而 preload 的它其实是 `ipcRenderer.invoke` → **返回 Promise** → 判据恒假 → **持久化容差重启后永不生效** | 兼容两态（`typeof r.then === 'function'` 走 `.then`，否则按同步对象）。`npm run sync` 注入后开发态实测 `1.75`，正式产物复测 `SET-03` 由假转真 |

> 注：同一个仓库里 `desktopCopyText()` 早就处理了 Promise（`if (r && typeof r.then === 'function')`），**唯独 settings 漏了** —— 属「同类缺陷只修一处」的典型。这类缺陷只有跨进程重启才暴露，单元测试与冒烟都看不见。

**③ 同时修掉的 3 处「假判据」（测试自身的问题，不是产品的问题）**

| # | 假象 | 真因 | 修法 |
|---|---|---|---|
| 1 | `POR-02` 断言 `1.6000 : 1` 而 UI 显示 `1.6 : 1` | 应用 `formatRatioValue` = `Core.fmt(v,4)` 后**去尾零** | 期望值复刻产品规则（`ratioText()`），不再手写字面量 |
| 2 | `UPG-05` 读到 `0.0097 : 1` | 填值早于页面初始化完成 → 被初始化覆盖 | 启动后等 `readyState==='complete' && window.LedCore && #input-width` 再操作，并同时校验输入框回读值与错误位 |
| 3 | `POR-04` 报「无注册表项」通过 | `spawnSync('reg', …)` 被安全策略拦截时 `status === null`，而判据写的是 `status !== 0` → **`null !== 0` 恒真 → 假通过** | 删除该调用，只对「Programs 目录未被创建」判定，注册表部分明确标为**未核对** |

**④ 两项 SKIP 的口径（不得记为通过）**

`INS-05`（注册表卸载项）与 `UNI-04`（卸载后注册表项清除）—— 本环境**禁止调用 `reg.exe`**（`PROGRAM BLOCKED BY SECURITY POLICY`）。按规矩**不绕过**（不改用其他 shell/脚本/等价手段），两项记 `pass: null` 并在报告中注明「未核对」。控制面板可见性由 NSIS 的 `Uninstall` 写入行为保证，但**保证 ≠ 实测**，故不写成已验证。

**⑤ 高 DPI 三档实测（真实系统缩放，非浏览器缩放 / 非 Playwright 模拟）**

| 档位 | 系统缩放证据 | 渲染正确性（DPI-01~08） | 窗口可达性（DPI-09） |
|---|---|---|---|
| **100%** | 新进程 `GetDpiForSystem=96`｜`scaleFactor=1`｜`dpr=1` | **8/8 ✅** | ❌ 溢出 16 / 26 px |
| **125%** | 新进程 `GetDpiForSystem=120`｜`scaleFactor=1.25`｜`dpr=1.25`｜注册表 `DpiValue=1` | **8/8 ✅** | ❌ 溢出 219 / 177 px |
| **150%** | ⛔ 不可达（见 ⑥） | — | — |

- **DPI-01~08 覆盖**：系统缩放一致性 / `devicePixelRatio` 同步且 `outerWidth÷innerWidth≈1`（证明确实**没有**用 `zoomFactor` 冒充）/ 无文档级横向溢出 / 可交互控件命中区 ≥32×32 / 四类核心操作（输入·结果·复制）全部可见 / `#ratio-value` 显示 `1.7778:1` 且**可见**（不是对隐藏元素取 `innerText`）/ 舞台折叠符合 DEC-16 / 截图存证（`test/shots/p7-dpi/dpi-<pct>.png`）。
- **为什么原先 125% 被判 BLOCKED 是错的**：`SystemParametersInfo(SPI_SETLOGICALDPIOVERRIDE, 1)` 可以做到**系统级**切换，且必须用**新进程**读 `GetDpiForSystem`（既有进程读到的是陈旧值）。实测：设置后新进程 120、台账 `scaleFactor=1.25`、注册表 `DpiValue=1`，恢复后回到 96 / `DpiValue=0` —— 四条证据同向。
- **DPI-09 是本轮新暴露的问题（不是新引入的）**：`MIN_CONTENT_W/H = 1024×680`（DEC-07）**优先于**工作区收敛 `min(work.width - EDGE_MARGIN)`，而 `EDGE_MARGIN=32` 又没算边框（实测 15/64）。于是 1024×768（工作区 1024×720）下 100% 就差 26px；125% 时工作区只剩 820×567，差 219/177px。按同一公式**推算**（本机分辨率不足以实测，故标注为推算）：1366×768@125% 垂直溢出约 168px、1920×1080@150% 约 56px —— 也就是说这不是只有小屏才有的边角情况。**处置需决策**：缩小最小尺寸下限 / 该档改两栏 / 允许窗口内滚动，三条路都要动设计基线（DEC-07/DEC-09），P7-5 不擅自改。

**⑥ 150% 为什么记 BLOCKED（而不是"没测"或"算了"）**

| 尝试 | 结果 |
|---|---|
| `SPI_SETLOGICALDPIOVERRIDE` = 1 | ✅ `GetDpiForSystem=120`（125%） |
| `SPI_SETLOGICALDPIOVERRIDE` = 2 / 3 / 4 | ❌ 一律回到 `120`（API 接受调用，系统只给到 125%） |
| 从 100% 直接置 2（跳过 125%） | ❌ 仍是 `120` |
| 连续三次置 1（测是否按"相对步进"解释） | ❌ 恒为 `120`，确认是**绝对值且上限 125%** |
| 注册表 `…\PerMonitorSettings\SIMULATED_10DE_21C4_…\DpiValue = 2` | 写入成功，但**应用台账仍 `scaleFactor=1.25`、工作区仍 `820×567`** → 会话未采纳 |

→ 结论：**该设置在 Windows 记录下来了，但需要注销/重新登录才会应用**；本会话不可注销（会终止验收环境）。故 150% 记 **BLOCKED（环境不可达）**，报告 `test/reports/p7-dpi-150-blocked.json` 已落盘，`p7-dpi.mjs --expect=150` 以**退出码 3** 结束（`3 = 环境前置不满足`，与「通过 0」和「失败 1」都区分开）。**未截图、未判定、未记为通过。**

**⑦ 本机环境事实（报告里必须披露，不能默认当成普通物理屏）**

| 项 | 实测 |
|---|---|
| 显示器 | 逻辑名 `SIMULATED_10DE_21C4_00000001_00000000_1100…`，物理分辨率 1024×768，工作区 1024×720 |
| 会话 | `SESSIONNAME=Console`（非远程会话） |
| 结论 | 该显示适配器名称表明它**很可能不是普通物理显示器**（虚拟/模拟适配器）。这直接影响 ⑤ 里 DPI-09 的可推广性，故在此单列，不用它推断真实用户的屏幕分布 |

> 🔒 **本节能证明什么**：这两种形态的产物在真 Windows 上能装、能起、能卸、能升级、设置与数据按 DEC-20 保留、断网照样算得对；100%/125% 两档在真实系统缩放下渲染与换算正确。
> ⛔ **本节不能证明什么**：① 150% 未验证；② 签名仍缺失；③ 窗口可达性三档不通过；④ 注册表两项未核对；⑤ 本机显示器疑似虚拟适配器，DPI-09 的结论不能直接外推到所有真机。

### 1.6 P7-1 · 产品品牌统一（Brand Identity Unification）

用户提供最终 LOGO（`LOGO2.jpg`），要求把产品身份全面统一为 **`LED Ratio Tool`**，并新增应用内品牌栏 + 顶栏实时换算分辨率。落地点如下：

**第一层 · Windows 原生层**
| 位置 | 旧值 | 新值 | 载体 |
|---|---|---|---|
| 窗口标题 | `LED 比例换算台`（BrowserWindow）/ `LED 大屏比例…`（HTML title） | `LED Ratio Tool` | `main/main.js:255` + `index.html` `<title>` |
| 快捷方式名 | `LED 比例换算台` | `LED Ratio Tool` | `build/electron-builder.yml:41` `shortcutName` |
| 安装包 / 便携版文件名 | 已为 `LED Ratio Tool-…` | 不变 | `${productName}` |
| EXE 文件描述 | `LED 屏比例换算台 —— …` | `LED Ratio Tool —— …` | `desktop/package.json` `description` |
| 图标（任务栏 / 标题栏 / 开始菜单 / 桌面 / 安装包 / 卸载器） | 最终 LOGO | 不变（`icon.ico` 7 档） | `resources/icon.ico` |

**第二层 · 应用内品牌栏**
- 左侧：品牌图标（同母版导出的透明背景 PNG，`renderer/brand-logo.png`，以 `data:` URI 内联进 `index.html`）+ `LED Ratio Tool` + 副标题。
- 右侧：**实时换算分辨率**（如 `3840 × 2160 px`），做成明显结果展示而非普通状态文字。

**实时分辨率三条硬规则（均满足）**
1. **数据同源**：复用 `primaryCandidate(candidates).result` 的 `outputWidth/outputHeight`，与主结果面板 `#res-value` 完全一致，不重新实现计算。
2. **实时同步**：挂在 `update()` 主渲染循环，物理尺寸 / 比例模式 / 画布设置变化即同步刷新。
3. **无效态**：宽或高为空 → `等待换算`；输入非法（非数值 / 负数 / 目标比例不可解）→ `暂不可计算`；绝不残留上一组有效分辨率。三态实测：`1920 × 549 px`（ready）/ `等待换算`（waiting）/ `暂不可计算`（error）。

**内部技术身份保持稳定（未动）**：`appId = com.ledratiotool.desktop`、`APP_DIR_NAME = LED Ratio Tool`、设置目录、存储路径、IPC 通道（恰好 8 个）、测试标识全部不变——随意改动会被 Windows 视为另一个应用，破坏旧版升级与设置继承。

**验收结果**：根 HTML 版 `test:e2e` **85/85**、`test:unit` **64/64**、`test:redlines` 通过；`verify:icons` **10/10**（含「不含旧占位橙 #F0A832」）；`sync:check` 无漂移；桌面冒烟 2/2 通过（0 console error/warning/pageerror）；`p7-artifacts` 归因 **MATCH 4/4**（asar 内源码与工作区逐字节一致）。签名状态仍为 **NotSigned**（与 §1.4 口径一致）。


---

## 二、环境要求

| 项 | 要求 |
|---|---|
| 操作系统 | Windows 10 1809+ / Windows 11 x64（DEC-04；Win7/8/8.1 不支持，用 HTML 版） |
| Node.js | ≥ 20（实测 v22.22.2） |
| npm | ≥ 9（实测 10.9.7） |
| VC++ 运行库 | Microsoft Visual C++ 2015-2022 Redistributable (x64) —— Electron postinstall 需要 |
| 系统环境变量 | **`ELECTRON_RUN_AS_NODE` 必须未设置** —— 见下方「常见问题」第 1 条 |
| Git | ≥ 2.x（仅开发需要） |

### 运行时版本（🔒 锁定，不可改）

| 组件 | 版本 | 说明 |
|---|---|---|
| Electron | **45.1.0** | DEC-01；生命周期终点 **2027-04-27** |
| Chromium | **156.0.8078.49** | Electron 45.1.0 内置 |
| Node | **24.22.1** | Electron 45.1.0 内置 |
| 桌面应用版本 | **1.1.0** | `package.json.version` |
| 计算内核 | **core@1.0.1** | `core.lock.json` |
| HTML 版 | **1.0.1** | 仓库根 `package.json`（永久保留，DEC-03） |

> 🔒 三线版本在「关于」对话框中**全部实读**，不手工维护（DEC-13 / TK-74）。

---

## 三、安装与运行

### 3.1 安装依赖

```bash
cd led-ratio-tool-repo/desktop
npm ci          # 精确锁版本（package-lock.json 入库）
```

> 🔒 `dependencies` 为**空** —— 运行时零第三方依赖（SEC-23a）。

### 3.2 启动

```bash
cd desktop

npm run preflight    # ① 前置检查：环境变量 + VC++ 运行库 + Node 版本
npm run sync         # ② 从仓库根同步 core.js / app.js / styles.css / index.html + 哈希门禁
npm run dev          # ③ 启动桌面版（= preflight + sync + electron .）
```

> 💡 `npm run dev` 已内含 `preflight` + `sync`，日常开发直接 `npm run dev` 即可。

### 3.3 开发模式建议

| 场景 | 做法 |
|---|---|
| 改业务逻辑 | 改**仓库根** `src/` 下的文件 → `npm run sync` → 重启。**不要**直接改 `desktop/renderer/` 下的副本（下次同步会被覆盖） |
| 改桌面交互 | 改 `desktop/renderer/desktop-ui.js` |
| 改桌面样式 | 改 `desktop/renderer/app.css`（桌面专属增量）；**不要**改 `desktop/renderer/styles.css`（它是 `src/styles.css` 的逐字节副本） |
| 改主进程 | 改 `desktop/main/` 下文件 |
| 改了 `src/core.js` | 🔒 **必须**先取得项目负责人批准，再执行 `npm run core:accept` 更新哈希锁 |

---

## 四、测试与检查

> 全部命令在 `desktop/` 目录下执行（根目录命令注明前缀）。

### 4.1 门禁命令（与 CI 工作流一一对应）

| 命令 | 作用 | 退出码 |
|---|---|---|
| `npm run sync:check` | 桌面副本零漂移 + `core.js` SHA-256 哈希锁 | 0 = 通过 / 1 = 漂移 |
| `npm run audit:security` | **47 项**安全静态审计 | 0 = 全通过 / 1 = 有失败 |
| `npm run test:smoke` | **Electron 启动冒烟连续 10 次**（TK-88 竞态） | 0 = 全通过 / 1 = 有轮次失败 / 3 = 环境阻塞 |
| `npm run test:desktop` | **桌面专项 E2E（93 条用例）** | 0 = 全通过 / 1 = 有失败 / 2 = 有阻塞 / 3 = 环境阻塞 |
| `npm run test:differential` | **200 组差分**（DEC-15 三层期望源） | 0 = 完全通过 / 1 = 有差异 / 2 = **有条件通过** / 3 = 环境阻塞 |
| `npm run test:golden` | L2 黄金向量独立套件（22 向量：21 执行 + 1 不适用） | 0 / 1 |
| `npm run test:dpi` | 真实系统 DPI 验收（`--expect=100/125/150`，旧套件 21 项） | 0 = 通过 / 1 = 失败 / 3 = 环境不匹配 |
| `npm run test:p7-artifacts` | **P7-4 产物指纹**：版本号 / 大小 / SHA-256 / 签名状态（零依赖 PE 解析，不依赖 PowerShell） | 0 = 采集成功 / 1 = 有产物缺失 |
| `npm run test:p7-acceptance -- --legacy="dist-legacy/…-1.0.0-x64-setup.exe"` | **P7-5 产物级验收 28 项**：安装·启动·卸载、覆盖安装·版本升级、设置持久化、便携版与断网可用。⚠️ 需先 `npm run build:win`；`--legacy` 缺省时升级组记 SKIP | 0 = 无失败（可能含 SKIP）/ 1 = 有失败 / 3 = 环境阻塞 |
| `npm run test:p7-dpi -- --expect=100 --exe="<安装版 exe>"` | **P7-5 真机 DPI 验收 9 项**：8 项渲染正确性 + 1 项窗口可达性。只认真实系统缩放，`--expect` 与实测不符直接 **exit 3** | 0 = 该档全通过 / 1 = 有失败 / 3 = 环境前置不满足 |
| `npm run test:fuses` | **P7-2 最终产物安全实证（16 项）**：Fuse Wire 静态读取 + 运行时攻击 + ASAR 篡改三路径 + onlyLoadAppFromAsar。⚠️ 需要先 `npm run build:win` 产出 `dist/win-unpacked` | 0 = 全通过 / 1 = 有失败 / 3 = 环境阻塞（产物缺失） |
| `npm run test:visual` | 视觉回归（3 档，阈值 0.1%）。⚠️ **未纳入 CI 门禁**，本地/授权后手动执行 | 0 = 通过 / 1 = 超阈值 |
| `npm run evidence:p4a` | P4-A 的 9 项证据采集 | 0 / 1 / 2 |
| `npm run evidence:p4b` | P4-B 的 26 项证据采集 | 0 / 1 / 2 |

### 4.2 仓库根的门禁命令

| 命令 | 作用 |
|---|---|
| `cd .. && npm run test:redlines` | **8 处受保护业务口径**守卫（A-01~A-08）+ `core.js` 哈希锁 |
| `cd .. && npm run test:unit` | `core.js` 单元测试（**64/64**） |
| `cd .. && npm run build` | 构建 HTML 单文件版（`dist/led-ratio-tool.html`） |
| `cd .. && npm run test:e2e:noshots` | HTML 版 E2E（需系统安装的 Google Chrome） |

### 4.3 启动冒烟（`test:smoke`）说明

针对此前出现的 **`app:// ERR_FAILED (-2)` 偶发竞态** —— 该竞态低概率、不可稳定复现，单次启动无法判定，必须连续多轮跑同一路径。

```bash
cd desktop
npm run test:smoke                        # 默认 10 次
node test/smoke-launch.mjs --runs=3       # 自定义次数
node test/smoke-launch.mjs --runs=10 --json=test/reports/smoke.json
```

**每轮的 7 条判据**（任一轮不满足 → 该轮判失败 → 整体非 0 退出）：

| 编号 | 判据 |
|---|---|
| S-01 | `location.protocol === 'app:'` |
| S-02 | 主文档 `index.html` 响应 **200** 且带 **CSP 响应头** |
| S-03 | console error = 0 |
| S-04 | pageerror = 0 |
| S-05 | `window.LedCore` 存在且导出数 = 22 |
| S-06 | `window.ledApi` 存在、方法数 = 8、已冻结、无通用透传 |
| S-07 | 无 `requestfailed` 记录 |

**报告**：`desktop/test/reports/smoke-launch.json`（含每轮的 console error / warning / pageerror 计数、截图路径、逐条判据明细）。
**截图**：`desktop/test/shots/smoke/smoke-run-NN.png`（每轮一张）。

### 4.4 退出码语义（🔴 不要把「阻塞」当「通过」）

| 退出码 | 含义 | CI 中的处置 |
|---|---|---|
| 0 | 全部通过 | 通过 |
| 1 | 存在失败 | **失败** |
| 2 | 存在 BLOCKED / 有条件通过 | **失败**（阻塞 ≠ 通过） |
| 3 | 环境阻塞（依赖不可用、Electron 起不来） | **失败**（不得伪装成通过） |

---

## 五、CI（Windows）

### 5.1 工作流位置

| 路径 | 作用 |
|---|---|
| **仓库根 `.github/workflows/windows.yml`** | ✅ **真正生效的工作流** —— GitHub Actions 只执行仓库根的 `.github/workflows/` |
| `desktop/.github/workflows/windows.yml` | 📄 **指向说明**（不会被 GitHub 执行），说明工作流真实位置与关键约束 |

> 🔴 **为什么工作流在仓库根**：GitHub Actions **只执行仓库根 `.github/workflows/` 下的 yml**。放在 `desktop/` 下的工作流「看起来已建立」却**一次都不会运行** —— 这与「不得声称 CI 已通过」的纪律直接冲突。任务书已明确授权新建根 `.github/` 目录（该目录不含任何受保护文件）。

### 5.2 触发条件

- `push` 到 `feature/desktop-windows`
- `pull_request` 面向 `feature/desktop-windows` 或 `main`
- `workflow_dispatch`（手动触发）

### 5.3 门禁顺序

```
1. 检出 + 清除 ELECTRON_RUN_AS_NODE（SEC-40）
2. 安装 Node 20 / Google Chrome，恢复缓存（Playwright 浏览器 / Electron 二进制 / desktop/node_modules）
3. npm ci（仓库根）
4. npm ci（desktop/）
5. npm run sync:check          ← 副本零漂移 + core.js 哈希锁
6. npm run audit:security      ← 47 项安全静态审计
7. npm run test:redlines       ← 8 处受保护业务口径
8. npm run test:unit           ← core.js 单元测试（64 条）
9. 构建（HTML 单文件 + 桌面资源同步 + 打包配置校验）
9.5 品牌图标资源自检（`verify:icons` 10 项 · D-08）
10. Electron 启动冒烟 × 10      ← TK-88
11. 桌面 E2E 前置环境取证（工作区 / 最大可达客户区 / 当前档位）
12. 桌面 E2E（93 条）
13. 桌面 E2E 后置环境取证
14. 黄金向量负向自检（P0-2）
15. L2 黄金向量独立套件（22 向量：21 执行 + 1 不适用）
16. 200 组差分（DEC-15）
17. 真实 DPI 验收（100% 档，21 项）
18. 打包 + Preview Candidate 产物验收（**只出报告，不参与门禁**）
18.5 P7-2 Fuses 实体验证（`test:fuses` 16 项 · **产物在则必过，产物缺失记 SKIP**）
19. 生成产物 SHA-256 清单 → 上传报告 / 截图 / CI 日志 → 汇总门禁结果
```

> 🔵 GitHub Actions 中的实际作业步骤数**随门禁项增减而变**（本轮新增 18.5 后为 **38**），上表按「逻辑门禁」归并展示；以 Actions 页面该次运行的实际步骤为准，本表不写死数字。
> ⚠️ **视觉回归（`npm run test:visual`）不在 CI 门禁内** —— 基准是否应更新需人工裁决，故只在本地或经授权后执行。

### 5.4 关键环境约束

| 约束 | 说明 |
|---|---|
| **`ELECTRON_RUN_AS_NODE` 必须真正 delete** | 🔒 SEC-40 / E-1：设为**空字符串仍会被 Electron 视为「已设置」** → `electron.exe` 退化为纯 Node → 报 `Cannot read properties of undefined (reading 'enableSandbox')`（报错信息与真实原因不匹配，极易误判）。CI 里用 `Remove-Item Env:ELECTRON_RUN_AS_NODE` 清除 |
| **系统 Chrome 必装** | 200 组差分与 HTML 版 E2E 用 `chromium.launch({ channel: 'chrome' })` → 需要**系统安装的** Google Chrome，只装 ms-playwright 的 chromium 不够。CI 用 `choco install googlechrome` |
| **缓存** | `desktop/node_modules` + Playwright 浏览器目录（`PLAYWRIGHT_BROWSERS_PATH`）+ Electron 二进制 |
| **产物** | `desktop/test/reports/`、`desktop/test/shots/`、`artifacts/SHA256SUMS.txt`（SHA-256 清单） |

### 5.5 Ruleset 必需状态检查（已按顺序完成配置）

> ✅ **配置路径（已完成，留档）**：a. 先推送工作流文件 → b. 在 Actions 页面确认**至少一次真实的绿色运行** → c. 由项目负责人把该 job 名（`Windows · 桌面版门禁`）加入 Ruleset 的 required status checks。**三步均已完成，本条不再作为待办。**
>
> 为什么当初强调这个顺序（保留说明，避免以后再犯）：把一个「从未成功运行过」的检查设为 required，等于给所有后续 PR 判死刑 —— 任何人推 PR 都会因为一个从未被验证能通过的工作流而被永久阻塞。

**当前实际状态（2026-11-02）**

| 项 | 状态 |
|---|---|
| CI 真实运行 | ✅ 已在 GitHub 实际运行并通过（次数以 Actions 页面为准）。`a05defd` 上 push run **#35** / pull_request run **#36** 均 **success**，全部步骤 0 失败；合并后 `main`（`626673f`）上 workflow_dispatch run **#37** 同样 success |
| Ruleset `Protect main` | ✅ 已配置 `required_status_checks`，context = **`Windows · 桌面版门禁`**（与作业名逐字节一致）；`strict = false`、`bypass_actors = []` |
| 效果验证 | ✅ PR #1 合并前 `mergeable_state` 由 `unstable` 转为 **`clean`**，且 **已于 2026-11-02 合并进 `main`**（squash → `626673f`）—— 说明必需检查已真实生效 |

> 上述 a / b / c 三步均已完成：工作流已推送、已有多次真实绿色运行、必需检查已由项目负责人配置。

> ✅ **「工作流已建立」≠「CI 已通过」** —— 本仓库已越过该门槛：CI 不仅建立了，而且已在 `feature/desktop-windows` 上**真实运行并通过**（见上表）。

---

## 六、存储位置

> 🔒 **DEC-19**：`userData` 与 `sessionData` **必须分离**，且分属 Roaming / Local 两个根目录。

### 6.1 用户设置

```
%APPDATA%\LED Ratio Tool\
├── settings.json          ← 业务持久化（当前仅匹配容差，schema 精确 4 键）
├── settings.json.bak      ← 上一版备份
├── settings.json.tmp      ← 写入中间态（rename 后即消失）
├── logs\                  ← Chromium 系统目录
├── Crashpad\              ← Chromium 系统目录
└── lockfile               ← Chromium 单实例锁（非业务数据）
```

> `%APPDATA%` 典型值：`C:\Users\<用户名>\AppData\Roaming`
> 目录名 `LED Ratio Tool`（含空格）由 `desktop/main/paths.js` 的 `APP_DIR_NAME` **单点定义**。

### 6.2 Chromium 会话与缓存（与用户设置**分离**）

```
%LOCALAPPDATA%\LED Ratio Tool\SessionData\
```

> `%LOCALAPPDATA%` 典型值：`C:\Users\<用户名>\AppData\Local`
> 🔒 这条路径**不是**从 `%APPDATA%` 推导的 —— `paths.js` 直接取 `LOCALAPPDATA` 环境变量，并用 `%APPDATA%\..\Local` 交叉校验（两者不一致时以环境变量为准）。

### 6.3 `settings.json` 的 4 个键（白名单精确）

| 键 | 说明 |
|---|---|
| `schemaVersion` | 设置文件结构版本 |
| `tolerancePercent` | 匹配容差百分比（`> 0` 才生效） |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

> 🔒 写入是**原子写**：先备份 → 写 `.tmp` → `rename`（SEC-09）。写入前会校验键集合 ⊆ 4 键。

### 6.4 彻底清除个人设置

1. **关闭应用**（必须先退出，否则 `lockfile` 与 `sessionData` 会被重新创建）
2. 删除用户设置目录：
   ```powershell
   Remove-Item -Recurse -Force "$env:APPDATA\LED Ratio Tool"
   ```
3. 删除 Chromium 会话与缓存目录：
   ```powershell
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\LED Ratio Tool"
   ```
4. 重新启动应用 → 匹配容差恢复默认值 **0.5**；所有本地状态回到首次安装态

> 💡 **也可以只清设置、保留会话缓存**（保留 Chromium 的本地缓存，只清业务设置）：
> ```powershell
> Remove-Item -Recurse -Force "$env:APPDATA\LED Ratio Tool"
> ```

### 6.5 卸载行为

**卸载默认保留** `settings.json` —— 重装后自动恢复容差（DEC-20）。
应用**不写任何数据删除逻辑**；`deleteAppDataOnUninstall` 是 one-click 安装器专用选项，本项目 `oneClick: false`，该键无效 —— **不依赖它**保证任何行为。

> 🔒 桌面版**不提供**「清除设置」按钮（TK-76 裁定：设置项只有容差一项；D-02 §9.3 不含清除项）→ 清除方法只能按 §6.4 手工执行。

---

## 七、目录结构

```
led-ratio-tool-repo/
├── .github/
│   └── workflows/
│       └── windows.yml           ← 🔴 真正生效的 Windows CI 工作流（30 个定义步骤 → 实际作业 37 步）
├── src/                          ← 🔒 受保护：HTML 版业务源码（桌面版从这里同步）
├── index.html                    ← 🔒 受保护：HTML 版入口（桌面版从这里同步）
├── dist/led-ratio-tool.html      ← 🔒 受保护：HTML 版正式交付物
├── test/                         ← 🔒 受保护：HTML 版测试与红线守卫
└── desktop/                      ← ⬅️ 桌面版工程（本目录可改）
    ├── .github/workflows/
    │   └── windows.yml           ← 📄 指向说明（非可执行工作流）
    ├── DESIGN-ALIGNMENT.md       ← 📋 实施台账：P3 → 桌面版逐条对照 + TK 提案与 RC 裁决
    ├── DPI-ACCEPTANCE.md         ← 📐 125% / 150% 高 DPI 真实验收指引（当前 BLOCKED）
    ├── README.md                 ← 📖 本文件
    ├── PROTECTED.md              ← 受保护业务口径登记（A-01~A-08）
    ├── core.lock.json            ← core.js SHA-256 哈希锁
    ├── package.json              ← scripts / engines / 精确锁依赖
    ├── main/
    │   ├── main.js               生命周期 / app:// 协议 / 窗口 / 安全拦截 / 高度档位判定
    │   ├── ipc.js                8 个 IPC handler 的唯一注册处
    │   ├── settings-store.js     settings.json 原子写 + .bak + 损坏回退
    │   ├── paths.js              userData / sessionData 固化（目录名唯一来源）
    │   ├── csp.js                CSP 唯一来源（buildCSP）
    │   └── menu.js               原生菜单栏（文件/编辑/视图/帮助）
    ├── preload/
    │   └── preload.js            contextBridge 8 方法（单文件，零依赖，只用 Web API）
    ├── renderer/
    │   ├── index.html            ← 由 ../index.html 同步 + 桌面注入
    │   ├── core.js               ← 由 ../src/core.js 逐字节同步
    │   ├── app.js                ← 由 ../src/app.js 同步 + 桌面适配
    │   ├── styles.css            ← 由 ../src/styles.css 逐字节同步
    │   ├── app.css               桌面专属增量样式（新增 6 个 token）
    │   └── desktop-ui.js         桌面交互层（菜单联动 / 快捷键 / 布局档位 / 状态栏）
    ├── build/
    │   ├── sync-assets.mjs       同步 + 哈希门禁 + manifest
    │   ├── desktop-adapter.cjs   app.js 的两处桌面适配（持久化 / 剪贴板 → IPC）
    │   ├── preflight.cjs         启动前置检查（SEC-40 / VC++ / Node 版本）
    │   └── electron-builder.yml  打包配置（P7 使用）
    └── test/
        ├── security-audit.cjs    47 项安全静态审计
        ├── fuses-verify.mjs      P7-2 最终产物安全实证（Fuse Wire / ASAR 完整性 / onlyLoadAppFromAsar）
        ├── smoke-launch.mjs      Electron 启动冒烟（参数化次数，TK-88）
        ├── desktop-suite.mjs     桌面专项 E2E（93 条用例）
        ├── differential-200.mjs  200 组差分执行器（DEC-15）
        ├── golden-vectors.mjs    L2 黄金向量独立套件（22 向量）
        ├── golden-negative-selftest.mjs 黄金向量负向自检（P0-2）
        ├── visual-regression.mjs 视觉回归（3 档，未纳入 CI 门禁）
        ├── visual-selfcheck.mjs  视觉回归自检
        ├── dpi-acceptance.mjs    真实系统 DPI 验收（--expect=100/125/150）
        ├── dpi-run.cmd           DPI 验收一键入口（CRLF 固定）
        ├── pc-verify.mjs         打包产物 / Preview Candidate 验收
        ├── p4a-evidence.cjs      P4-A 的 9 项证据采集
        ├── p4b-evidence.cjs      P4-B 的 26 项证据采集
        ├── offline-verify.cjs    离线三层核验
        ├── harness/              PNG 解码 / 像素比对 / 页面探针公共库
        ├── oracle/               L1 独立 oracle
        ├── vectors/golden.json   L2 黄金向量
        ├── reports/              测试报告 JSON
        ├── shots/                截图
        └── baselines/shots/      基准截图
```

---

## 八、常见问题

### 1. 启动报 `Cannot read properties of undefined (reading 'enableSandbox')`

**原因**：`ELECTRON_RUN_AS_NODE` 被设置了。该变量会让 `electron.exe` **退化为纯 Node 运行**（`require('electron')` 只返回路径字符串），`app` 因此是 `undefined`。

> ⚠️ **报错信息与真实原因完全不匹配**，极易被误判为代码缺陷。它与业务代码、依赖版本**毫无关系**。

**处置**（清除该环境变量）：

```powershell
# PowerShell（当前会话）
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# CMD
set ELECTRON_RUN_AS_NODE=

# 永久删除（用户级）
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'User')
```

**验证**：`npm run preflight` 会检查这一项，通过时会打印 `[前置检查通过] … ELECTRON_RUN_AS_NODE 未设置`。

> 🔴 **必须是「真正 delete」，不是设为空字符串** —— Electron 判定的是「环境变量是否存在」，空字符串同样算存在。CI 里用 `Remove-Item Env:ELECTRON_RUN_AS_NODE`（见 §5.4）。

### 2. 启动报 `Process failed to launch / exitCode=0`，或窗口秒退

**原因**：**单实例锁**竞争（SEC-02）。桌面版实现了 `app.requestSingleInstanceLock()` —— 若已有一个实例在运行，第二个实例会立即 `app.quit()`。

**处置**：
- 确认任务管理器里没有残留的 `LED Ratio Tool` 进程（可用 `taskkill /F /IM "LED Ratio Tool.exe"`）
- 这是**环境竞争，不是产品缺陷** —— 测试脚本对此有专门的重试逻辑

### 3. `npm ci` 报缺 VC++ 运行库 / electron postinstall 失败

**原因**：缺 Microsoft Visual C++ 2015-2022 Redistributable (x64)。

**处置**：安装 VC++ 运行库后重试。`npm run preflight` 会检查 `vcruntime140.dll` / `vcruntime140_1.dll` / `vcruntime140_threads.dll` 三个文件。

### 4. `npm run sync:check` 报「core.js 哈希不匹配」

**原因**：**业务规则红线被改动**，或 `src/core.js` 被替换。

**处置**：
- 🔒 **不要**直接改哈希锁来"绕过" —— 先确认改动是否已获项目负责人批准
- 若已获批准：`npm run core:accept`（会更新 `core.lock.json` 的 `sha256` 与 `coreVersion`）
- 若未获批准：回退 `src/core.js` 的改动

### 5. `npm run sync:check` 报「app.js 桌面适配未应用」

**原因**：`desktop/renderer/app.js` 不是由 `sync` 生成的，而是手工编辑过。

**处置**：执行 `npm run sync` 重新同步（会重新施加桌面适配）。

### 6. 窗口最小尺寸拖不到 1024×680

**原因**：这不是 bug。Windows 的窗口管理器会**按外框**施加最小尺寸限制，实际**客户区**会略小于 1024×680。

**口径说明**（🔒 DEC-14）：
- 窗口尺寸**一律按客户区口径**：`useContentSize: true`
- `minWidth/minHeight` 与 `width/height` **同一口径 = 客户区**
- 🔴 **不得用 `setContentSize` 做下界保证** —— 实测它**不遵守** `minHeight`（`setContentSize(1024, 640)` 实测客户区为 1024×654）

### 7. 三栏 / 两栏 / 纵向堆叠的切换规则

| 客户区宽度 | 布局 | 舞台 |
|---|---|---|
| ≥ 1280px | **三栏**（输入 / 舞台 / 结果） | 完整舞台 |
| 1025 ~ 1279px | **两栏**（输入 / 结果） | 折叠为摘要头（可展开） |
| ≤ 1024px | **三面板纵向堆叠**（输入 / 舞台 / 结果） | 紧凑舞台 |

> 🔒 1280px 是**布局阈值**，不是最小窗口宽度（DEC-08）。窗口永远不滚动，只有面板滚动。

### 8. 窗口高度不足时会不会隐藏核心操作

**核心操作一个都不隐藏。** 高度不足时只做「收纳」—— 压缩 chrome 与折叠说明性内容，不碰输入输出。这是 DEC-16 的高度三档设计，**TK-72 已闭合、②/③ 档收纳已实施**（逐条清单见 [`DESIGN-ALIGNMENT.md`](DESIGN-ALIGNMENT.md) §4）。

🔒 **四类元素在任何档位都不得隐藏、不得移出可达范围**：① 输入（屏幕宽 / 高）② 结果（比例值 / 分辨率）③ 警告（21:9 警示条）④ 复制（两个复制入口）。`TC-H-11` 实测三档全部满足。

档位由**渲染层自算**（`desktop-ui.js` → `decideHeightTier()`；阈值 `MIN_CLIENT_H = 680` / `STANDARD_CLIENT_H = 784` / `FRAME_DELTA = 65`，`resize` 时 rAF 节流重算），写在 `.layout[data-height-tier]` 并**镜像到 `<html>`** 作为标题条/状态栏的样式钩子（两处由同一函数写入，不会漂移）：

| 档位 | 判据 | 已实施的收纳动作 |
|---|---|---|
| ① `standard` | `clientH ≥ 784` | **无收纳**。说明块恒常展开，**不提供折叠入口**（折叠头 `hidden`，不占 Tab 位） |
| ② `compact` | `680 ≤ clientH < 784` | 标题条副标题单行省略（标题保留）· 三栏/两栏档面板 `gap` 16→12 · 标准库列表限高 `min(30vh, 200px)`（**仍可滚动访问**）· C 栏四个说明块默认折叠为单个「说明」折叠头（原生 `<button>`，`Enter`/`Space` 可展开） |
| ③ `tight` | `clientH < 680`，或**工作区放不下**最小标准客户区（`workH < 745`） | 副标题隐藏 · 标题条 40→28 · 状态栏 28→24（错误出口与设置入口均保留）· 三栏档舞台折叠（网格等同两栏）· 纵向堆叠档**保留 B 行**、舞台内容折叠为行内摘要 + 就地展开入口 · 新增结果分段锚点条 `[比例][候选][匹配][误差][复制]` · 说明块默认折叠（同 ② 档） |

> 🔒 **高度轴与宽度轴正交**（TK-147）：`stacked × tight` 叠加时三个面板**仍纵向排列、一个都不隐藏**，只是舞台内容折叠（`TC-H-15` 实测面板 3/3 可见、`grid-template-areas` 未变）。
> 🔒 **折叠 ≠ 删除**（TK-146）：说明块折叠用 `display:none`，展开后**条目数不变**（`TC-H-05` 实测 10→10）。
> 💡 **只读诊断**：`window.__desktopHeightTier.info()` 可读出当前档位与判据实参，供测试取证与台账使用 —— 不含业务计算、不新增 IPC 通道。

### 9. 如何查看版本号

- 应用内：帮助 → 关于（显示应用名、桌面版本、计算内核版本、HTML 版版本、Electron / Chromium / Node 版本、构建时间、应用标识）
- 命令行：`npm run dev` 启动后，控制台会打印 `[LED-VERSIONS] {...}` 与 `[LED-STORAGE] {...}`

### 10. 端口 / 网络相关问题

**本应用零网络。** `connect-src 'none'`，不自动更新、不系统托盘、不账号云同步、不遥测、不崩溃上报（NL-01~NL-13）。
若发现任何出网请求，那是**缺陷**，请上报。

---

## 九、业务红线

核心计算逻辑与已确认的业务规则**不可改动**。

- 机器闸：`core.lock.json`（SHA-256）+ 仓库根 `test/guard-redlines.mjs`（8 处受保护口径 A-01~A-08）
- 人类索引：[`PROTECTED.md`](PROTECTED.md)

**任何涉及红线的修改必须提交三件套**：变更原因、影响面分析、回归测试，且须项目负责人确认。

---

## 十、安全基线

| 能力 | 实现 |
|---|---|
| 进程隔离 | `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` |
| 暴露面 | 恰好 8 个方法，零通用透传，对象冻结 |
| 内容来源 | `app://` 自定义协议，路径穿越防护三步（解码 → 归一化 → `path.relative` 判 `..`） |
| CSP | `default-src 'none'` + `connect-src 'none'` + `script-src 'self'`（无 unsafe-eval/inline），唯一来源 `main/csp.js` |
| 网络 | 运行时出网计数 = 0 |
| 禁用项 | 自动更新 / 系统托盘 / 账号云同步 / 遥测崩溃上报 —— 四层反向核验 |
| Electron Fuses（二进制级） | 8 个 fuse 从 exe 实际读出（`010011001`）：`RunAsNode` / `NODE_OPTIONS` / CLI Inspect 全关，`CookieEncryption` / ASAR 完整性 / `onlyLoadAppFromAsar` 全开。**验证对象是产物不是配置**，见 §1.3 |
| 打包完整性 | `ELECTRONASAR` 内嵌 header 哈希 + asar 自身 per-file `integrity.blocks`；三种篡改位置实测均被检测（覆盖边界见 §1.3 ④） |

上表每一项都有对应的机器检查：实现位置为 `main/csp.js`（CSP 唯一来源）、`preload/preload.js`（8 方法冻结暴露）、`main/ipc.js`（8 个 handler 唯一注册处）、`main/main.js`（协议与安全拦截），检查项的唯一来源是 `desktop/test/security-audit.cjs`。执行 `npm run audit:security` → **47/47 通过**（最新记录见 [`DESIGN-ALIGNMENT.md`](DESIGN-ALIGNMENT.md)）。

---

## 十一、GitHub 操作规则

本工程受项目负责人的 GitHub 操作规则约束，详见仓库根 `GITHUB-RULES.md` 与 `test/guard-github-rules.mjs`（机器闸）。

| # | 规则 |
|---|---|
| 1 | ✅ 允许在 `feature/desktop-windows` 上开发、提交、测试、推送 |
| 2 | ✅ 允许创建 PR |
| 3 | ⛔ **未经授权禁止合并到 `main`** |
| 4 | ⛔ 禁止直推 main、禁止修改正式 HTML 交付物、禁止删除分支与标签 |
| 5 | ⛔ 完成后给 PR 链接 + 变更摘要 + 测试结果 + 已知问题，**等确认后再合并** |

> 🔒 本次授权**不代表**桌面应用已通过产品验收或获得正式发布许可（DEC-05）。

### 11.1 当前实际状态（GitHub API 实读快照）

| 项 | 实际状态 |
|---|---|
| 默认分支 `main` | `a1dc1ae` —— PR #2 的 squash 合并提交（CI Maintenance） |
| 开发分支 `feature/desktop-windows` | `cc9be31`（D-08 品牌图标）—— **分支保留未删除**，作为后续改动的提交入口 |
| PR #1 | **Closed · merged**（2026-11-02T06:18:01Z，squash → `626673f`）。合并前 `mergeable_state = clean`，required check `Windows · 桌面版门禁` 在 head `a05defd` 上 success |
| PR #2 | **Closed · merged**（2026-11-02T08:19:35Z，squash → `a1dc1ae`）。内容：Actions 升级 Node 24 / 汇总脚本插值修复 / 过期 Ruleset 说明校正 |
| PR #3 | **Open**（base `main`）：D-08 品牌图标落地 + **P7-2 最终产物安全实证**（同一分支追加，PR 自动更新）。head 提交与 required check 结果以 PR 页面实时状态为准，**本文件不复刻** |
| Tag | 仅 **1 个**：`pre-desktop`（桌面版开发起点）。**当前工作尚无正式版本 Tag** |
| Release | **0 个** —— 未发布任何版本，与「正式安装包 / 签名尚待 P7 验收」（§一）一致 |
| 合并动作 | ✅ **已由项目负责人执行 Squash Merge**（`626673f`、`a1dc1ae`）。合并后 `main` 受 `Protect main` 保护，后续改动仍须走 PR + required check |
| ⚠️ squash 合并的分支陷阱 | 每次 squash 合并后，原分支的 merge-base 会退回旧 base；若直接在其上开新 PR，上一轮的文件会被算成「双方各自新增」→ add/add 冲突。处理：`git rebase --onto origin/main <旧 base> feature/desktop-windows` 把提交重落到新 `main` 之上（本轮已按此处理：重落后与新 `main` 的差异收敛为 **8 文件 +388/−10**） |

> 🔒 上表是**抓取时快照**，不是承诺。Tag / Release / 合并状态一律以 GitHub 实时页面为准；本文档不代替 GitHub 上的真实状态。
