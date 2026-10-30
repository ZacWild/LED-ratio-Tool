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
| 12 组快捷键 × 4 种焦点状态 | ✅ 已实现并实测 |
| 原生菜单栏 + 底部状态栏 + 拖拽分栏 | ✅ 已实现并实测 |
| 桌面专项测试（76 条用例） | ✅ 76/76 通过 |
| 200 组差分（DEC-15） | ⚠️ **有条件通过**（差异 0 条，未覆盖字段 3036，覆盖率 69.42%） |
| Windows CI 工作流 | ✅ **工作流文件已建立**（⚠️ **尚未在 GitHub 上实际运行过**） |
| 正式安装包 / 便携版 / 签名 | ⏳ 属 P7，尚未产出 |
| 高 DPI 125% / 150% 档 | ⚠️ **本轮未实测**（本机仅 100% 缩放可用） |

> ⚠️ **本工程当前不是可交付版本。**
> ① 200 组差分只达到「有条件通过」，未达「完全通过」；
> ② CI 工作流**只是文件已建立** —— GitHub Actions 从未在本仓库实际运行过它；
> ③ 产品验收与发布放行权属项目负责人（DEC-05）。

> 📋 **设计与实现对照**见 [`DESIGN-ALIGNMENT.md`](DESIGN-ALIGNMENT.md) —— 逐条记录 P3 设计基线在桌面版的落地位置、差异、待裁决项（TK-140 ~ TK-150）。

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
| `npm run test:desktop` | **桌面专项 E2E（76 条用例）** | 0 = 全通过 / 1 = 有失败 / 2 = 有阻塞 / 3 = 环境阻塞 |
| `npm run test:differential` | **200 组差分**（DEC-15 三层期望源） | 0 = 完全通过 / 1 = 有差异 / 2 = **有条件通过** / 3 = 环境阻塞 |
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
1. npm ci（仓库根）
2. npm ci（desktop/）
3. npm run sync:check          ← 副本零漂移 + core.js 哈希锁
4. npm run audit:security      ← 47 项安全静态审计
5. npm run test:redlines       ← 8 处受保护业务口径
6. npm run test:unit           ← core.js 单元测试
7. 构建（HTML 单文件 + 桌面资源同步 + 打包配置校验）
8. Electron 启动冒烟 × 10      ← TK-88
9. 桌面 E2E（76 条）
10. 200 组差分（DEC-15）
11. 产物收集（报告 JSON + 截图 + SHA-256 清单）→ 上传
```

### 5.4 关键环境约束

| 约束 | 说明 |
|---|---|
| **`ELECTRON_RUN_AS_NODE` 必须真正 delete** | 🔒 SEC-40 / E-1：设为**空字符串仍会被 Electron 视为「已设置」** → `electron.exe` 退化为纯 Node → 报 `Cannot read properties of undefined (reading 'enableSandbox')`（报错信息与真实原因不匹配，极易误判）。CI 里用 `Remove-Item Env:ELECTRON_RUN_AS_NODE` 清除 |
| **系统 Chrome 必装** | 200 组差分与 HTML 版 E2E 用 `chromium.launch({ channel: 'chrome' })` → 需要**系统安装的** Google Chrome，只装 ms-playwright 的 chromium 不够。CI 用 `choco install googlechrome` |
| **缓存** | `desktop/node_modules` + Playwright 浏览器目录（`PLAYWRIGHT_BROWSERS_PATH`）+ Electron 二进制 |
| **产物** | `desktop/test/reports/`、`desktop/test/shots/`、`artifacts/SHA256SUMS.txt`（SHA-256 清单） |

### 5.5 🔴 关于 GitHub Ruleset 的强制约束

> **在 CI 尚未于本仓库实际成功运行过之前，禁止把任何状态检查设为 GitHub Ruleset 的必需项（required status check）。**
>
> 理由：把一个「从未成功运行过」的检查设为 required，等于给所有后续 PR 判死刑 —— 任何人推 PR 都会因为一个从未被验证能通过的工作流而被永久阻塞。
>
> 正确顺序：
> a. 先推送本工作流文件
> b. 在仓库 Actions 页面上确认**至少一次真实的绿色运行**
> c. 再由项目负责人手动把该 job 名（`Windows · 桌面版门禁`）加入 Ruleset 的 required status checks
>
> 在 (c) 完成之前，Ruleset 的 required checks **必须为空**。本文件不代替 (c)。

> 🔴 **「工作流已建立」≠「CI 已通过」**。截至本文件创建时刻，GitHub Actions **从未在本仓库实际运行过**本工作流。首次真实运行发生在本文件被推送到远端之后。

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
│       └── windows.yml           ← 🔴 真正生效的 Windows CI 工作流（23 个步骤）
├── src/                          ← 🔒 受保护：HTML 版业务源码（桌面版从这里同步）
├── index.html                    ← 🔒 受保护：HTML 版入口（桌面版从这里同步）
├── dist/led-ratio-tool.html      ← 🔒 受保护：HTML 版正式交付物
├── test/                         ← 🔒 受保护：HTML 版测试与红线守卫
└── desktop/                      ← ⬅️ 桌面版工程（本目录可改）
    ├── .github/workflows/
    │   └── windows.yml           ← 📄 指向说明（非可执行工作流）
    ├── DESIGN-ALIGNMENT.md       ← 📋 实施台账：P3 → 桌面版逐条对照 + TK-72 提案
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
        ├── smoke-launch.mjs      🆕 Electron 启动冒烟（参数化次数，TK-88）
        ├── desktop-suite.mjs     桌面专项 E2E（76 条用例）
        ├── differential-200.mjs  200 组差分执行器（DEC-15）
        ├── p4a-evidence.cjs      P4-A 的 9 项证据采集
        ├── p4b-evidence.cjs      P4-B 的 26 项证据采集
        ├── visual-regression.mjs 视觉回归
        ├── offline-verify.cjs    离线三层核验
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

**不会。** 当前实现只输出高度档位判定值（`heightTier` 1/2/3），**没有任何按高度收纳核心操作的代码路径**。

第 ②③ 档（紧凑高度模式）的**收纳清单与布局方案**已写成提案，见 [`DESIGN-ALIGNMENT.md`](DESIGN-ALIGNMENT.md) §4（TK-72）—— **须项目负责人批准后才会实现**。

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

详见 `_audit/out/P3-表C-Electron安全清单.md`，静态审计由 `npm run audit:security` 执行（47 项）。

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
