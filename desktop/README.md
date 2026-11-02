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
| 最小窗口 / 高 DPI / 工作区检测 | ✅ 已实现并实测（100% 缩放档） |
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
| 高 DPI **100%** 档 | ✅ **21/21 通过**（`scaleFactor = 1` 实读，非模拟） |
| Windows CI 工作流 | ✅ **已在 GitHub 实际运行并通过**（次数与逐次结论以 Actions 页面为准，本表不写死以免每次推送即过期）。`feature/desktop-windows` 上 push run **#35** / pull_request run **#36**（`a05defd`）均 success、36 步 0 失败。`Protect main` 规则集已把 **`Windows · 桌面版门禁`** 设为 required status check；PR #1 已合并进 `main`（squash → `626673f`） |
| 正式安装包 / 签名 / 完整安装链路 | ⏳ **尚待 P7 验收**。CI 中的打包步骤只产出 Preview Candidate 与尺寸报告（**不参与门禁**）；当前未发布、未签名 |
| 高 DPI **125% / 150%** 档 | ⛔ **BLOCKED（环境未就绪）**：需人工切换系统缩放（必要时注销重登）后按 `DPI-ACCEPTANCE.md` 执行，**未用模拟手段冒充** |

> 📅 **本文档数据截止：2026-11-02，分支 `feature/desktop-windows` @ `b48aaa8`**。数字均取自 `desktop/test/reports/` 下的真实报告与 GitHub Actions 实际运行记录，不手工估算。本文档自身的后续文档提交不计入上述测试数据。

> ✅ **当前测试门禁全部通过**：桌面 E2E 93/93、HTML E2E 85/85、单元测试 64/64、安全审计 47/47、200 组差分完全通过、视觉回归 3/3、100% 缩放档 21/21。

> ⚠️ **但本工程仍不是可交付版本。**
> ① **125% / 150% 高 DPI 未验收** —— BLOCKED，需人工切换系统缩放；
> ② **正式安装包、代码签名与完整安装链路尚待 P7 验收**；
> ③ 产品验收与发布放行权属项目负责人（DEC-05）—— **测试通过 ≠ 可以发布**。
> ④ **UI Polish 属视觉打磨，不改变发行状态** —— 它只动了 `renderer/app.css`，不产出安装包、不做签名，也不覆盖 ①②。

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
| `npm run test:dpi` | 真实系统 DPI 验收（`--expect=100/125/150`） | 0 = 通过 / 1 = 失败 / 3 = 环境不匹配 |
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
10. Electron 启动冒烟 × 10      ← TK-88
11. 桌面 E2E 前置环境取证（工作区 / 最大可达客户区 / 当前档位）
12. 桌面 E2E（93 条）
13. 桌面 E2E 后置环境取证
14. 黄金向量负向自检（P0-2）
15. L2 黄金向量独立套件（22 向量：21 执行 + 1 不适用）
16. 200 组差分（DEC-15）
17. 真实 DPI 验收（100% 档，21 项）
18. 打包 + Preview Candidate 产物验收（**只出报告，不参与门禁**）
19. 生成产物 SHA-256 清单 → 上传报告 / 截图 / CI 日志 → 汇总门禁结果
```

> 🔵 GitHub Actions 中的实际作业共 **36 个步骤**（含 setup / checkout / 缓存与 Post 收尾），上表按「逻辑门禁」归并展示。
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
| CI 真实运行 | ✅ 已在 GitHub 实际运行并通过（次数以 Actions 页面为准）。`a05defd` 上 push run **#35** / pull_request run **#36** 均 **success**，36 步 0 失败；合并后 `main`（`626673f`）上 workflow_dispatch run **#37** 同样 success |
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
│       └── windows.yml           ← 🔴 真正生效的 Windows CI 工作流（29 个定义步骤 → 实际作业 36 步）
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
| 默认分支 `main` | `626673f` —— PR #1 的 squash 合并提交（`feat(desktop): add Electron-based Windows desktop application`） |
| 开发分支 `feature/desktop-windows` | `a05defd` —— PR #1 合并时的 head，**分支保留未删除**；内容已全部并入 `main` |
| PR #1 | **Closed · merged**（2026-11-02T06:18:01Z，squash → `626673f`）。合并前 `mergeable_state = clean`，required check `Windows · 桌面版门禁` 在 head `a05defd` 上 success |
| Tag | 仅 **1 个**：`pre-desktop`（桌面版开发起点）。**当前工作尚无正式版本 Tag** |
| Release | **0 个** —— 未发布任何版本，与「正式安装包 / 签名尚待 P7 验收」（§一）一致 |
| 合并动作 | ✅ **已由项目负责人执行 Squash Merge**（`626673f`）。合并后 `main` 受 `Protect main` 保护，后续改动仍须走 PR + required check |

> 🔒 上表是**抓取时快照**，不是承诺。Tag / Release / 合并状态一律以 GitHub 实时页面为准；本文档不代替 GitHub 上的真实状态。
