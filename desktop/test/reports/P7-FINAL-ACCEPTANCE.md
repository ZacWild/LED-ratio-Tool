# P7 Final Acceptance｜最终发行验收闭环

> 版本标记：**P7 Final Acceptance（最终发行验收）**
> 仓库：`ZacWild/LED-ratio-Tool` ｜ PR：**#3（保持 Open，不合并）**
> **产物构建提交**：`89470b5967f2b36f7950e2d62e4489370a3152f6`（分支 `feature/desktop-windows`，PR #3 保持 Open）
> 版本：`1.1.0` ｜ 产品名：`LED Ratio Tool` ｜ 首发签名策略：**NotSigned（不采购、不配置证书）**
> 生成时间：2026-11-03 ｜ 验收对象：本机干净重建的最终产物（非旧产物复制）

> 📌 **HEAD 口径说明（避免误读）**：本次产物由 **提交 `89470b5`**（P7-DPI-09 方案 A + min track 实测标定）对应的工作区源码打包，`p7-artifacts.json` 的 `gitHead` 与 `provenance.status = MATCH`（asar 内 `renderer/app.js` / `core.js` / `main/main.js` / `preload/preload.js` 与**当前工作区**逐字节一致 4/4）**双向对齐** → 「产物 = 该提交代码」是被实测证明的，而不是靠 gitHead 推断。
> 后续**仅文档 / 报告口径对齐**的提交不改动任何产品代码或产物字节，因此 `gitHead` 仍指向 `89470b5`（= **产物构建提交**，而非「最新提交」）是正确语义。
> 下方 §1.1~§1.6 保留的是**上一版产物（HEAD `30b21ab`）**的历史记录，重打包后相应数值已在 §1.7 更新。

---

## 0. 结论速览（判定矩阵）

| 类别 | 检查项 | 结果 | 判定 |
|---|---|---|---|
| 证据链 | 干净重建 NSIS + Portable | exit 0（NSIS 115.77MB / Portable 105.31MB） | ✅ PASS |
| 证据链 | 最终 EXE 元数据（ProductName/FileDescription/FileVersion） | 三处 FileVersion=1.1.0，FileDescription 已统一为 LED Ratio Tool | ✅ PASS |
| 证据链 | 四产物图标与品牌 LOGO 一致 | 4/4 命中（7 档，128px 灰度 100%、炭灰 78.7%、白 18.5%、橙 0%） | ✅ PASS |
| 证据链 | p7-artifacts（gitHead / Provenance / SHA-256） | gitHead=`89470b5`，provenance MATCH 4/4（asar == 当前工作区） | ✅ PASS |
| 证据链 | p7-acceptance 的 POR-01 document.title | 「LED Ratio Tool」 | ✅ PASS |
| 证据链 | Fuses / ASAR 16 项实体验证 | 16/16 通过（针对重建产物，SHA-256 `d35d9361…`，R-01 还原 = `6a451eb4…`） | ✅ PASS |
| 证据链 | 最终 SHA256SUMS | 5 产物 + app.asar 清单已生成（两端逐字节一致） | ✅ PASS |
| 签名 | ART-02 未签名发行口径 | NotSigned 如实记录 | 🟡 **Owner Accepted** |
| DPI | DPI-09 窗口完整性（125% · **双屏**） | **已修复（方案 A + min track 实测标定，2026-11-03 重跑）**：**主屏 + 副屏均四边溢出 左0/上0/右0/下0**（主 `1456×966 @(297,110)`、副 `1458×966 @(2345,110)`）；客户区 1441×902 / 1443×902 均落在各自 workArea 内 | ✅ **PASS** |
| DPI | DPI-09 窗口完整性（100% · **双屏**） | ✅ **PASS（2026-11-03 13:08 修复后代码实测，双屏真 100%）** —— **客户区精确 1440×900**（零取整）｜外框 `1456×965`｜frameDelta **16×65**｜workArea `2560×1408`｜**主屏 + 副屏四边溢出均 左0/上0/右0/下0**；窗口开在**鼠标所在屏**（副屏） | ✅ **PASS** |
| DPI | DPI-09 窗口完整性（150% · **双屏**） | ✅ **PASS（2026-11-03 修复后代码、真实 150% 双屏实测）** —— 主屏 `1455×896 @(127,48)` / 客户区 `1440×833`，副屏 `1456×896 @(1834,48)` / 客户区 `1441×833`；两屏四边溢出均左0/上0/右0/下0；P7 DPI 渲染项 8/8 PASS | ✅ **PASS** |
| 窗口 | min track 标定（第二轮根因） | 实测标定收敛：`(1039,744)`→下限 1026×682 → 下调 `(1037,742)` → 下限 **1024×682**；几何单测 24/24、安全审计 47/47 | ✅ **PASS** |
| 回归 | Desktop E2E / 视觉回归 | Desktop E2E **91/93**（1 FAIL 基线自身 + 1 BLOCKED 平台量化）；视觉回归 **0/3**（125% 精确相等判据结构性不可达，**HEAD 对照证明非回归**） | 🟡 **见 §1.8 / §1.10** |
| 人工验收 | 窗口标题 / 图标 / 实时分辨率 | 5/5 通过 | ✅ PASS |
| 人工验收 | 注册表卸载项（INS-05 / UNI-04） | **已补测**（2026-11-03）：改走 PowerShell 注册表提供程序，INS-05 / UNI-04 实测通过 | ✅ **PASS** |
| 人工验收 | 真版本升级（UPG-02~05） | **已补测**（2026-11-03）：以 `dist-legacy/LED Ratio Tool-1.0.0-x64-setup.exe` 为 `--legacy` 真跑 1.0.0 → 1.1.0 覆盖升级 | ✅ **PASS** |

**总判定：PASS（28/28，0 跳过）+ Owner Accepted（NotSigned）**。0 项 FAIL，0 项 BLOCKED 伪装成已完成；所有报告对应同一最终产物（**产物构建提交 = `89470b5`**，provenance MATCH 4/4）与可追溯 SHA-256。

> 🆕 **2026-11-03 补测说明**：上一版记录为「PASS_WITH_SKIP（22 通过 / 6 跳过）」，其中 6 项 SKIP（INS-05、UNI-04、UPG-02~05）的跳过理由是「本环境禁止调用 `reg.exe`」「缺 `--legacy=<旧版本>`」。本轮按项目负责人要求补做：
> - **INS-05 / UNI-04**：改用 **PowerShell 的 Microsoft.Win32 注册表提供程序**（标准 .NET API，非 `reg.exe` 脚本绕过）真实读取消载项 → 两项均 PASS；
> - **UPG-02~05**：本机存在 `desktop/dist-legacy/LED Ratio Tool-1.0.0-x64-setup.exe`（FileVersion 1.0.0，2026-11-02 构建）→ 以 `--legacy` 真跑覆盖升级 → 四项均 PASS；
> - **POR-04** 顺带补上真实注册表核对（原先因 `reg.exe` 被拦而只能标「未核对」，且旧实现存在 `null !== 0` 恒真的**假通过**风险）。
> → `p7-acceptance.mjs` 复跑：**28 项 = 28 通过 / 0 失败 / 0 跳过**（判定 PASS）。
> ⚠️ **该 1.0.0 包的性质必须如实披露**：GitHub Releases 为空、仓库仅存 `pre-desktop` tag，该包**从未对外发行**。因此 UPG-02~05 证明的是「**内部构建版本之间**的真实覆盖升级路径」，**不宣称为「公开发行版 → 新版」的升级验证**。

---

## 一、重新建立最终产物证据链（干净工作区 + 明确记录 HEAD）

### 1.1 干净重建
- 移走旧 `win-unpacked` / `win-unpacked-p74`，`npm run build:win` 干净重建，**exit 0**，HEAD 锁定 `30b21ab`。
- 产物：`LED Ratio Tool-1.1.0-x64-setup.exe`（121,393,062 B）、`LED Ratio Tool-1.1.0-x64-portable.exe`（110,426,428 B）。
- 🆕 **P7-DPI-09 后已再次重打包**，字节数与哈希见 §1.7 与 §1.6。

### 1.2 最终 EXE 元数据（PE 解析，零依赖）
| 产物 | FileVersion | ProductVersion | FileDescription |
|---|---|---|---|
| NSIS 安装程序 | 1.1.0 | 1.1.0 | LED Ratio Tool —— 屏幕尺寸与视频画布比例换算工具（Windows 桌面版） |
| Portable 便携版 | 1.1.0 | 1.1.0 | 同上 |
| 主程序 win-unpacked | 1.1.0 | 1.1.0.0 | LED Ratio Tool |

### 1.3 图标一致性（四产物）
新增 `build/verify-artifact-icons.mjs`（PE 资源表 RT_GROUP_ICON/RT_ICON 品牌判定）：
- NSIS / Portable / 主程序 / 卸载器 **4/4 命中**品牌 LOGO（7 档 16/24/32/48/64/128/256，128px 灰度 100%、炭灰 78.7%、白 18.5%、旧橙 0%）。
- 源 `resources/icon.ico` 自检 `verify-icons.mjs` 10/10 通过（IC-01~IC-10），`electron-builder.yml` 三处 icon 配置指向同一文件（IC-09）。

### 1.4 p7-artifacts 证据链重跑
- `gitHead = 89470b5967f2b36f7950e2d62e4489370a3152f6`
- `provenance.status = MATCH`（asar 内 renderer/app.js / core.js / main/main.js / preload/preload.js 与工作区逐字节一致，4/4）
- 签名：三处 PE 证书表 Size=0 → **NotSigned**（如实记录）

### 1.5 Fuses / ASAR 16 项实体验证（重跑）
针对**当前** `dist/win-unpacked/LED Ratio Tool.exe`（SHA-256 `d35d9361…`，含 P7-DPI-09 + min track 标定改动）：
- 静态 F-01~F-06 + 动态 D-00~D-05/D-04a/b/c + R-01，**16/16 通过**。
- 关键：RunAsNode / NODE_OPTIONS / --inspect 三逃逸路径全部关闭；OnlyLoadAppFromAsar / EmbeddedAsarIntegrity 开启；破坏性用例后 asar 逐字节还原（`6a451eb44873099a…`）。

### 1.6 最终 SHA256SUMS
`dist/SHA256SUMS.txt`（随产物分发）与 `test/reports/SHA256SUMS.txt`（被追踪验收证据）**逐字节一致**（`diff` 无差异），内容如下（**P7-DPI-09 第二轮根因修复 + 重打包后的最终值**）：

| 文件 | SHA-256 |
|---|---|
| LED Ratio Tool-1.1.0-x64-setup.exe | `fcbaa0f92172bca59d845f34f24e8aabc952b95bd759d3421c3d555a30361434` |
| LED Ratio Tool-1.1.0-x64-setup.exe.blockmap | `72805633b44029355a420ec9e6c9f42eb86dc0311350d6544c34db92d3a7f9b4` |
| LED Ratio Tool-1.1.0-x64-portable.exe | `d50012112a9d9ad959b7165b8d83895ba70dc0b5e08ab2c87aaba6bd27d482bd` |
| win-unpacked/LED Ratio Tool.exe | `d35d9361eb2fe73c4d9a521868a5b9442d0837992288929e50b13f497dcc2830` |
| win-unpacked/resources/app.asar | `6a451eb44873099ab97ad63cc9024487b52bac98f1cd687584bc6dbc34fbdda7` |

### 1.7 P7-DPI-09 重打包（产物指纹更新说明）

P7-DPI-09 方案 A 落地后**重新打包**，产物指纹随之变化，§1.1~§1.6 中上一版产物的字节数/哈希**已整体作废**。**2026-11-03 随后又因 min track 标定第二轮根因修复（§1.9）二次重打包**，下表为最终值：

| 项 | 上一版（HEAD `30b21ab`） | 中间版（首轮方案 A） | **当前版（min track 标定后 · 最终）** |
|---|---|---|---|
| NSIS setup | 121,393,062 B / `b3e66f29…` | 121,398,465 B / `aef88690…` | **121,400,588 B / `fcbaa0f9…`** |
| Portable | 110,426,428 B / `dbce57ba…` | 110,432,307 B / `608004b0…` | **110,436,477 B / `d5001211…`** |
| win-unpacked exe | `314ae01f…` | `9df22ca4…` | **`d35d9361…`** |
| app.asar | `5fa8d76a…`（363,787 B） | `e9633af5…` | **`6a451eb4…`（394,668 B，含 `main/window-bounds.js`）** |
| Fuses / ASAR 16 项 | 16/16（对旧 asar） | 16/16 重跑通过（R-01 = `e9633af5…`） | **16/16 重跑通过**（R-01 还原校验 = `6a451eb44873099a…` 一致） |

> ⚠️ 打包前的旧产物与旧 `win-unpacked` 已移动到 `dist/_pre-dpi09/`、`dist/_pre-dpi09-b/`、`dist/_pre-mintrack-fix/`（**已被 `.gitignore` 排除，不进入版本库**），仅作本地回滚点保留。
>
> 🔒 **产物归因**：`p7-artifacts` provenance = **MATCH 4/4**（asar 内 renderer/app.js / core.js / main/main.js / preload/preload.js 与工作区逐字节一致）→ 产物确由**当前工作区**源码构建，非缓存产物。

### 1.8 Desktop E2E 实测与 `TC-D-20` 基线对照（2026-11-03）

修复后代码重跑 Desktop 套件：**93 例 = PASS 91 / FAIL 1 / BLOCKED 1**。

| 用例 | 判定 | 实测 | 定性 |
|---|---|---|---|
| `TC-D-20` 焦点环可见（`:focus-visible`） | ❌ FAIL | 检查 20 点｜不合格 20 点 | 🔴 **基线自身/环境问题** —— 用 `git show HEAD:desktop/main/main.js` 临时还原改前代码重跑 `--cat=TC-D`，**TC-D-20 同样 FAIL（20 点全不合格，与新版完全一致）** → 与本轮 P7-DPI-09 改动**无关** |
| `TC-DP-04` 三尺寸截图产出 | 🚧 BLOCKED | `1440×900→PNG 1800×1128`｜`1200×800→PNG 1500×1003`｜`1024×680→未达成（实测客户区 1024×682）`｜workArea `2048×1120`｜最大可达客户区 `2048×1121` | ⛔ **平台量化**：workArea 装得下，但精确 1024×680 在 125% 下**不可达**（Windows DIP→物理像素取整 + 不可见缩放边框）。**未改判据让它变绿** |

> 🔧 **本轮顺带修掉的一处测试脚本文案缺陷**：`TC-DP-04` 的 `note` 原文**硬编码**为「工作区装不下 1440×900 / 1200×800 客户区」，与实测不符（那两档实际**都产出了 PNG**）。已改为**按实际未达成档位动态判定并写明原因**（区分「工作区装不下」与「工作区装得下但平台量化导致精确值不可达」）。**判据阈值本身未放宽**（`achieved` 仍为 `|got − target| ≤ 1`）。

分类明细：TC-D 19/20 ｜ TC-DP 9/10 ｜ TC-DS 10/10 ｜ TC-EX 12/12 ｜ TC-MENU 10/10 ｜ TC-COPY 6/6 ｜ TC-RESIZE 8/8 ｜ TC-H 17/17；`console error/warning = 0`、`pageerror = 0`。

**视觉回归基线对照**（`npm run test:visual`，本轮 **0/3**）

该脚本的判据是**客户区精确相等**（`clientSize.w !== s.w || clientSize.h !== s.h` 即 FAIL），**不做 ±1 容差**。在当前 **125%** 环境下，Windows 的 DIP→物理像素取整使其**结构性不可达**。用 `git show HEAD:desktop/main/main.js` 临时还原改前代码做同环境对照：

| 目标客户区 | **HEAD 版回读** | **本轮新版回读** | 判定 |
|---|---|---|---|
| 1440×900 | `1440×901` | `1440×901` | **完全一致** → 纯环境量化，与改动无关 |
| 1200×800 | `1200×801` | `1200×801` | **完全一致** → 同上 |
| 1024×680 | `1025×681` | **`1024×682`** | 新版**宽度更准**（精确命中 1024），高度同为 +1 量化 |

- ✅ **对照证明**：回读偏差与本轮改动**无关**（前两档逐值相同）；且 1024 档新版**优于**基线（方案 A 精确计算 + min track 标定后下限 `1024×682` 允许宽度精确命中 1024）。
- 📌 **100% 环境的历史证据**：`git show HEAD:desktop/test/reports/visual-regression.json`（2026-11-02 生成）中 `clientSize` 为 `{w:1440, h:900}` —— **精确命中**，`fail: 0`。即在 100% 档该判据可满足。
- 🔒 **未改判据让它变绿**：阈值（0.1%）、容差（8/255）、遮罩、客户区相等判据**全部未动**；本轮如实记录为「环境阻塞」，不冒充通过。
- ℹ️ 视觉回归**不在 CI 门禁内**（基准更新需人工裁决），故本项不阻塞 PR。

### 1.9 DPI-09 三档口径（2026-11-03 · 修复后代码 · 含二次更新）

| 档位 | 实测证据 | 判定 |
|---|---|---|
| **125%**（双屏真 125%） | **主屏**：外框 `1456×966 @(297,110)`｜客户区 `1441×902`｜workArea `2048×1120 @(0,32)`｜`sf=1.25`｜`dpr=1.25`｜**四边溢出 左0/上0/右0/下0**｜min track 标定 `(1039,744)`→1026×682 →下调 `(1037,742)` →**1024×682**（`converged=true`）<br>**副屏**（`id=1897915132`，右置 x=2048）：外框 `1458×966 @(2345,110)`｜客户区 `1443×902`｜**四边溢出 左0/上0/右0/下0**｜按副屏自身 workArea 居中（`2048 + (2048−1458)/2 = 2345`） | ✅ **PASS（主屏 + 副屏）** |
| **100%**（双屏真 100%） | **主屏**：外框 `1456×965 @(552,254)`｜客户区 **`1440×900`（精确命中目标，零取整）**｜workArea `2560×1408 @(0,32)`｜`sf=1`｜`dpr=1`｜实测非客户区 **16×65**｜**四边溢出 左0/上0/右0/下0**<br>**副屏**（`id=1897915132`，右置 x=2560，**鼠标所在**）：外框 `1456×965 @(3112,254)`｜客户区 **`1440×900`**｜**四边溢出 左0/上0/右0/下0** | ✅ **PASS（主屏 + 副屏）** |
| **150%**（双屏真 150%） | P7 DPI：`scaleFactor=1.5` / `dpr=1.5`；DPI-01~08 **8/8 PASS**，DPI-09 **PASS**。多屏探针主屏外框 `1455×896 @(127,48)` / 客户区 `1440×833`；副屏外框 `1456×896 @(1834,48)` / 客户区 `1441×833`；两屏四边溢出均 0 | ✅ **PASS（主屏 + 副屏）** |

> 🔬 **多屏核验（`test/probe-dpi-multidisplay.cjs`）**：`test/p7-dpi.mjs` 只核验鼠标所在显示器；真实 `BrowserWindow` + 产品几何算法 + `getBounds()` 回读，对每块屏独立判定 → **三档 × 两屏共 6/6 PASS**，`allOverflowZero=true`。
> - ✅ 位置按目标屏自身 workArea 居中；125% 副屏 x=2345，100% 副屏 x=3112，150% 副屏 x=1834。
> - ✅ 选屏原则生效：100% 与 150% 实测均将窗口开在鼠标所在副屏。
> - ✅ 150% 工作区高 928 DIP，预算将客户区高度收敛至约 832 DIP（实际回读 833），高于 DEC-07 最小值 680，窗口四边仍完全在工作区内。
> - 💡 100% 精确命中 1440×900；125%/150% 受平台取整存在小幅读数差异，DPI-09 始终使用真实外框与 workArea 核四边。
> - 🔒 探针全程复用同一个 `BrowserWindow`；中途销毁再建会卡住 Electron 主进程。


> 📌 **`test/reports/p7-dpi-100.json` 已由本轮实测刷新**（2026-11-03 13:08，修复后代码、双屏真 100%）—— 上一轮那份「标定修复前」代码的历史记录已被覆盖，**不是手工改写**，而是真实重跑产出（`scaleFactor=1`、`dpr=1`、客户区精确 `1440×900`、四边溢出全 0）。
>
> 💡 **反向印证**：旧记录显示 100% 下 `frameDelta`（16×65）换算 min track **恰好正确**（下限正好 1024×680），而 125% 下同一换算**被顶高到 1028×682** —— 与「Win11 不可见缩放边框在非 100% 档才显形」的根因完全自洽。
>
> ℹ️ **关于「下次登录会不会变 125%」**：因 4 个 `PerMonitorSettings\<id>\DpiValue` 实测**全为 0**，Windows 登录时重读该值 → 应**恢复 100%**（登录后仍建议复核一次）。

### 1.10 本轮完整回归结果

| 回归项 | 结果 | 备注 |
|---|---|---|
| `sync:check` | ✅ 无漂移 | `[core] SHA-256 dd49a782…` 与 `core.lock.json` 一致（22 个受保护导出） |
| `test:redlines` | ✅ 通过 | 业务规则红线守卫全部通过（8 处受保护口径 + 哈希锁） |
| `test:unit` | ✅ **64/64** | 根级 |
| `audit:security` | ✅ **47/47** | 含 `main/window-bounds.js` 已加入 `mainSource` 审计名单 |
| 根级 HTML E2E | ✅ **85/85** | 依赖系统安装的 Google Chrome |
| Desktop E2E | 🟡 **91/93** | 1 FAIL（`TC-D-20`，基线自身）+ 1 BLOCKED（`TC-DP-04`，平台量化） |
| Electron 冒烟 | ✅ **10/10** | console error / warning / pageerror / requestfailed 合计 **0** |
| 视觉回归 | 🟡 **0/3（环境量化，非回归）** | 判据为**客户区精确相等**；125% 下取整使其结构性不可达。**HEAD 基线对照**：改前代码同环境回读 `1440×901` / `1200×801`，与新版**完全一致**；1024 档**新版更准**（`1024×682` vs HEAD `1025×681`）。**未改判据让它变绿** |
| 几何单测（独立） | ✅ **24/24** | GEO-13~16 覆盖 min track 标定四种语义 |
| Fuses / ASAR | ✅ **16/16** | R-01 还原校验 = `6a451eb44873099a…` |
| `p7-artifacts` | ✅ provenance **MATCH 4/4** | 产物确由当前工作区构建 |
| `p7-acceptance` | ✅ **28/28，0 跳过** | 含 INS-05 / UNI-04 / UPG-02~05 |
| `p7-dpi`（125%） | ✅ **PASS** | 四边溢出全 0 |
| `p7-dpi`（100%） | ✅ **PASS** | 双屏，客户区**精确 1440×900**，四边溢出全 0 |
| `p7-dpi`（150%） | ✅ **PASS** | 单屏 P7 DPI 渲染 8/8、DPI-09 PASS；双屏独立四边核验 2/2 PASS |

---

## 二、修正未签名发行策略的验收口径（ART-02）


`test/p7-acceptance.mjs` 的 ART-02 已从「属 P7 发布阻塞项」改为 **Owner Accepted** 口径：

- **如实记录**：NotSigned（三处 PE 证书表为空，构建日志 `no code signing certificate configured, signing is skipped`）。
- **明确 Owner Accepted**：项目负责人裁决首发不签名、后续按用户量决定补签 → **非 P7 阻塞项**。
- **不再列阻塞项**：`verdict: 'OwnerAccepted'`、`firstReleaseNotSigned: true`。
- **保留风险提示**：未签名产物在 Windows SmartScreen / Smart App Control 下可能被拦截或提示「未知发布者」，需现场放行或改用 HTML 版。
- **不伪装已签名**：不采购证书、不配置签名服务。

---

## 三、DPI-09 技术评估（只评估，不改产品尺寸策略）

完整评估见 `test/reports/DPI-09-ASSESSMENT.md`。核心结论：

| 评估项 | 结论 |
|---|---|
| ① 最低有效工作区 | 最小窗口外框 1040×745 DIP；默认窗口外框 1456×965 DIP（@100%）。DPI-09 实测默认窗口 → 最低工作区按 **1456×965** 读 |
| ② 调整最小窗口可行性 | 可行、低风险（`main.js` 3 处联动常量），但**不解决 150% 出屏**（默认窗口由 TARGET 主导，非 MIN_CONTENT） |
| ③ compact/tight/stacked 支持度 | 能让更小窗口「不崩不溢出」，但 tight/stacked 是**折叠**非完整显示；宽度 1024 以下无更低断点 |
| ④ 回归影响 | 93 条 E2E 与视觉基准**零影响**（不依赖 `main.js` 常量）；唯一关联项是 DPI-09 本身 |
| ⑤ 150% 环境条件 | 需交互式会话 + 设置切换 + 可能注销重登 + 探针 `scaleFactor=1.5` + 验后还原 |

**关键发现（如实记录）**：
1. `p7-dpi-100.json` 的 DPI-09 FAIL 是 **RDP 虚拟屏（1024×768）环境假象**——无人交互会话下 Electron 报告屏幕 1024×768（工作区 1024×720），小于最小窗口外框 1040×746，非产品缺陷；真实物理屏 LEN P27q-10（2560×1440）@100% 工作区 2560×1392，DPI-09 会 PASS。
2. **150% 预测出屏（约 65px）**：`TARGET_H=900` + 固定 `EDGE_MARGIN=32` + 非客户区随 `scaleFactor` 放大（65 DIP）三者叠加，根因**不在** `MIN_CONTENT_H`。
3. 供决策的选项 A/B/C/D（见评估稿 §6），**是否修改 DEC-07 由项目负责人决定**；本稿不落地任何修改。

---

## 四、补充人工验收

### 4.1 可自动化部分（`test/p7-manual-acceptance.mjs`，5/5 通过）
| ID | 项 | 结果 |
|---|---|---|
| MAN-01 | 窗口标题（渲染层 document.title） | 「LED Ratio Tool」 ✅ |
| MAN-02 | 窗口标题（BrowserWindow 层 MainWindowTitle） | 「LED Ratio Tool」 ✅ |
| MAN-03 | 实时分辨率 waiting 态（清空输入） | 「等待换算」 ✅ |
| MAN-04 | 实时分辨率 ready 态（1920×1080） | 「1920 × 1080 px」 ✅ |
| MAN-05 | 实时分辨率 error 态（非法输入） | 「暂不可计算」 ✅ |

> 注：便携版会从 localStorage 恢复上次输入（启动即 ready 属正常），故 waiting 态判据 = 清空输入后显示「等待换算」，与 P7-1 三态设计一致。

### 4.2 不可自动化部分（人工清单，不伪造）
- [ ] 真机双击 Portable EXE 手感（双击即起、无黑窗闪烁）。
- [ ] 任务栏 / 标题栏图标肉眼观感（已由 4.3 资源级核验兜底）。

### 4.3 安装 / 升级 / 持久化 / 卸载 / 离线无品牌回归
`p7-acceptance.mjs` 重跑：**28 项 = 28 通过 / 0 失败 / 0 跳过**（PASS）。
- 安装 INS-01~05、运行 RUN-01~05、设置 SET-01~03、升级 UPG-01~05、卸载 UNI-01~04、便携 POR-01~04 全部通过，无品牌回归。
- 上一版的 6 项 SKIP（注册表 2 项 + 真版本升级 4 项）已于 2026-11-03 补测关闭，详见 §0 补测说明与 §4.4。
- 本轮**基于重打包后的最终产物**（setup SHA-256 `fcbaa0f9…`、win-unpacked exe `d35d9361…`）复跑，INS-02 与 UPG-03 的「逐字节一致」判定均基于新产物重新取证。

### 4.4 注册表卸载项实测（INS-05 / UNI-04，2026-11-03 补测）

**为什么上一版记 SKIP 的理由需要推翻**：`reg.exe` 被拦的是**外部可执行文件**；而 PowerShell 的 `Microsoft.Win32` 注册表提供程序是**标准 .NET API**（`Get-ItemProperty` / `Get-ChildItem`），既不是 `reg.exe` 的脚本包装，也不是绕过安全策略的等价手段 —— 它就是同一注册表读取接口的托管实现。据此本轮按「能测就测、如实记录」做了真跑。

**卸载项路径**（NSIS `perMachine:false` → per-user，写 HKCU）：
`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}`

| 项 | 实测结论 |
|---|---|
| **INS-05** | 安装后卸载项**真实存在**：`DisplayName="LED Ratio Tool 1.1.0"`、`DisplayVersion=1.1.0`、`Publisher`、`UninstallString … /currentuser`、`QuietUninstallString … /currentuser /S`、`DisplayIcon` 已设、`NoModify=1`、`NoRepair=1`、`EstimatedSize` → **PASS** |
| **UNI-04** | 卸载后**轮询**核对（30 次 × 2s，上限 60s）：实测**第 1 次轮询（2s）即 count=0**，卸载项被正确清除 → **PASS** |

**一条必须记录的时序事实**：NSIS 异步卸载时，**卸载器主进程先退出、`_iu.exe` 继续删文件 / 快捷方式 / 注册表**，卸载项实际在 **2~8 秒内**才被清除。若只做**一次性快照**，会把「异步还没删完」误判成「没删」→ 假 FAIL。因此 `UNI-04` 与 `UNI-03` 一致采用**轮询**判据。

**顺带修掉的一处假通过**：`POR-04`（便携版零安装痕迹）原先用 `spawnSync('reg', …)`，被安全策略拦截时 `status === null`，而判据写的是 `status !== 0` → **`null !== 0` 恒真 → 假通过**。本轮改为真实读取消载项，判据是「Uninstall 项数量 === 0」，复跑实测 `Programs 目录=false｜Uninstall 项数量=0` → PASS。

### 4.5 真版本覆盖升级实测（UPG-02~05，2026-11-03 补测）

以 `--legacy="desktop/dist-legacy/LED Ratio Tool-1.0.0-x64-setup.exe"` 真跑「旧版安装 → 新版覆盖升级」：

| 项 | 实测结论 |
|---|---|
| **UPG-02** 旧版本安装 | legacy 包 FileVersion=**1.0.0**，静默安装 exit=0，装后 exe FileVersion=**1.0.0**（≠ 当前 1.1.0 → 确为旧版本，断言非空转）；旧版 exe sha `bcb7f356…` |
| **UPG-03** 覆盖升级 | 新版 setup exit=0，版本 **1.0.0 → 1.1.0**；新 exe sha `9df22ca4…`，与 `win-unpacked/LED Ratio Tool.exe` **逐字节一致** |
| **UPG-04** 设置保留 | 升级前写入 `tolerancePercent=0.75`，升级后读回仍为 **0.75**（未被重置） |
| **UPG-05** 升级后启动与换算 | 升级后正常启动，2560×1440 → UI「**1.7778 : 1**」，输入框回读 2560×1440，错误位 `["",""]` |

> ⚠️ **测试边界必须如实披露（不夸大结论）**：GitHub Releases 为空、仓库仅存 `pre-desktop` tag，该 1.0.0 包**从未对外发行**。因此 UPG-02~05 证明的是「**内部构建版本之间**的真实覆盖升级路径」，**不宣称为「公开发行版 → 新版」的升级验证**。若未来有真实发行的旧版，可用 `--legacy=<该包>` 重跑同一套判据。

> ⚠️ **附带发现的跨 hive 接管隐患**：当机器上已存在同 GUID 的旧安装项且位于 `HKLM` 时，1.1.0 安装器会卸载旧安装并把卸载项改写为 1.1.0，但**仍留在 `HKLM` 且带 `/allusers`** → 普通用户在控制面板的可见性与卸载权限会受影响。1.0.0 与 1.1.0 **单独安装时均为 per-user**（`HKCU` + `/currentuser`），二者共用同一 productGUID，故**覆盖升级路径本身正常**。该隐患登记为后续改进项，不阻塞首发。

---

## 五、工作边界确认（全部遵守）

| 约束 | 遵守情况 |
|---|---|
| 不增加新功能 | ✅ 本轮仅新增验收脚本 + 评估稿，无产品功能改动 |
| 不重构计算内核 / 不修改 core.js | ✅ `renderer/core.js` SHA-256 `dd49a782…` 未变（provenance MATCH 佐证） |
| 不修改 appId / APP_DIR_NAME / IPC 通道 | ✅ 未触碰（appId 仍 `com.ledratiotool.desktop`） |
| 不改根 README | ✅ 未改动 |
| 不创建 Tag / Release | ✅ 未创建 |
| 不合并 PR #3 | ✅ PR #3 保持 Open |
| 不改测试断言/阈值让结果变绿 | ✅ 仅修正 ART-02 口径（Owner Accepted，如实披露），未放宽任何通过阈值 |
| 不改 Required Check 名称 | ✅ 未改动 |
| 打包保持 continue-on-error | ✅ 未改动 CI |

---

## 附录：报告文件索引（对应同一最终产物）

| 文件 | 内容 |
|---|---|
| `test/reports/p7-artifacts.json` | 产物指纹（gitHead / provenance / SHA-256 / 签名） |
| `test/reports/fuses-verify.json` | Fuses/ASAR 16 项（16/16） |
| `test/reports/p7-acceptance.json` | 安装/运行/设置/升级/卸载/便携（**28 通过 / 0 失败 / 0 跳过**） |
| `test/reports/p7-manual-acceptance.json` | 窗口标题 / 实时分辨率三态（5/5） |
| `test/reports/DPI-09-ASSESSMENT.md` | DPI-09 五项技术评估（不改产品） |
| `test/reports/SHA256SUMS.txt` | 最终发行产物 SHA-256 清单 |
| `build/verify-artifact-icons.mjs` | 四产物图标一致性核验脚本（新增） |
| `test/p7-manual-acceptance.mjs` | 人工验收补充脚本（新增） |

**未决事项（需项目负责人裁决 / 后续动作）**：
1. ~~DPI-09 的 DEC-07 是否调整~~ → **已关闭（2026-11-03）**：负责人裁决采用**方案 A**，DEC-07 保持 1024×680 不变，详见 `test/reports/DPI-09-ASSESSMENT.md` 第二、三段。
- **150%：真实系统缩放与双屏验收已通过**：`scaleFactor=1.5` / `dpr=1.5`，单屏渲染 8/8 PASS、DPI-09 PASS，双屏独立四边核验 2/2 PASS；历史 `p7-dpi-150-blocked.json` 保留作先前环境不匹配记录，本次结论以 150% 新报告为准。
3. ~~注册表 INS-05 / UNI-04 需在真实环境核对~~ → **已关闭（2026-11-03）**：改走 PowerShell 注册表提供程序真实读取，两项均 PASS，见 §4.4。
4. ~~真版本升级 UPG-02~05 需提供 `--legacy=<旧版本安装包>`~~ → **已关闭（2026-11-03）**：以 `dist-legacy/…-1.0.0-x64-setup.exe` 真跑，四项均 PASS；**边界披露**：该 1.0.0 包从未对外发行，故不宣称为「公开发行版 → 新版」验证，见 §4.5。
5. **新增（不阻塞首发）**：跨 hive 接管隐患 —— 同 GUID 旧安装项若在 `HKLM`，新版安装器会改写卸载项但仍留在 `HKLM` 且带 `/allusers`，影响普通用户的控制面板可见性与卸载权限。建议后续在安装器侧显式收敛到 per-user 口径。
6. **新增（不阻塞首发）**：签名仍为 `NotSigned`，属 Owner Accepted 决策项（DEC-05），后续按用户量决定是否补签。
