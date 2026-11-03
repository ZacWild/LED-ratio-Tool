# P7 Final Acceptance｜最终发行验收闭环

> 版本标记：**P7 Final Acceptance（最终发行验收）**
> 仓库：`ZacWild/LED-ratio-Tool` ｜ PR：**#3（保持 Open，不合并）**
> HEAD：`30b21ab605db190e2b2545be2a7351edceaa8dd2`（分支 `feature/desktop-windows`）
> 版本：`1.1.0` ｜ 产品名：`LED Ratio Tool` ｜ 首发签名策略：**NotSigned（不采购、不配置证书）**
> 生成时间：2026-11-03 ｜ 验收对象：本机干净重建的最终产物（非旧产物复制）

---

## 0. 结论速览（判定矩阵）

| 类别 | 检查项 | 结果 | 判定 |
|---|---|---|---|
| 证据链 | 干净重建 NSIS + Portable | exit 0（NSIS 115.77MB / Portable 105.31MB） | ✅ PASS |
| 证据链 | 最终 EXE 元数据（ProductName/FileDescription/FileVersion） | 三处 FileVersion=1.1.0，FileDescription 已统一为 LED Ratio Tool | ✅ PASS |
| 证据链 | 四产物图标与品牌 LOGO 一致 | 4/4 命中（7 档，128px 灰度 100%、炭灰 78.7%、白 18.5%、橙 0%） | ✅ PASS |
| 证据链 | p7-artifacts（gitHead / Provenance / SHA-256） | gitHead=30b21ab，provenance MATCH 4/4 | ✅ PASS |
| 证据链 | p7-acceptance 的 POR-01 document.title | 「LED Ratio Tool」 | ✅ PASS |
| 证据链 | Fuses / ASAR 16 项实体验证 | 16/16 通过（针对重建产物，SHA-256 `314ae01f…`） | ✅ PASS |
| 证据链 | 最终 SHA256SUMS | 5 产物 + app.asar 清单已生成 | ✅ PASS |
| 签名 | ART-02 未签名发行口径 | NotSigned 如实记录 | 🟡 **Owner Accepted** |
| DPI | DPI-09 窗口完整性 | 只评估不改；125%/150% 环境未就绪 | ⛔ **BLOCKED（待决策）** |
| 人工验收 | 窗口标题 / 图标 / 实时分辨率 | 5/5 通过 | ✅ PASS |
| 人工验收 | 注册表卸载项（INS-05 / UNI-04） | 本环境禁 reg.exe，给可行方案 | ⏭️ **SKIP（不伪造）** |
| 人工验收 | 真版本升级（UPG-02~05） | 缺 `--legacy=<旧版本>` | ⏭️ **SKIP** |

**总判定：PASS_WITH_SKIP + Owner Accepted（NotSigned）**。0 项 FAIL，0 项 BLOCKED 伪装成已完成；所有报告对应同一最终产物（HEAD=30b21ab）与可追溯 SHA-256。

---

## 一、重新建立最终产物证据链（干净工作区 + 明确记录 HEAD）

### 1.1 干净重建
- 移走旧 `win-unpacked` / `win-unpacked-p74`，`npm run build:win` 干净重建，**exit 0**，HEAD 锁定 `30b21ab`。
- 产物：`LED Ratio Tool-1.1.0-x64-setup.exe`（121,393,062 B）、`LED Ratio Tool-1.1.0-x64-portable.exe`（110,426,428 B）。

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
- `gitHead = 30b21ab605db190e2b2545be2a7351edceaa8dd2`
- `provenance.status = MATCH`（asar 内 renderer/app.js / core.js / main/main.js / preload/preload.js 与工作区逐字节一致，4/4）
- 签名：三处 PE 证书表 Size=0 → **NotSigned**（如实记录）

### 1.5 Fuses / ASAR 16 项实体验证（重跑）
针对 `dist/win-unpacked/LED Ratio Tool.exe`（SHA-256 `314ae01f…`）：
- 静态 F-01~F-06 + 动态 D-00~D-05/D-04a/b/c + R-01，**16/16 通过**。
- 关键：RunAsNode / NODE_OPTIONS / --inspect 三逃逸路径全部关闭；OnlyLoadAppFromAsar / EmbeddedAsarIntegrity 开启；破坏性用例后 asar 逐字节还原（`5fa8d76a…`）。

### 1.6 最终 SHA256SUMS
`dist/SHA256SUMS.txt`（随产物分发）与 `test/reports/SHA256SUMS.txt`（被追踪验收证据）一致：

| 文件 | SHA-256 |
|---|---|
| LED Ratio Tool-1.1.0-x64-setup.exe | `b3e66f290b9455ad403171684d6f1a56858000fffc12ebc4474b68e6224fdc25` |
| LED Ratio Tool-1.1.0-x64-setup.exe.blockmap | `36d1aa423e432e1254498f6d5c90f7da7b1d7a5e76f43a81511daae0a2b4d6f2` |
| LED Ratio Tool-1.1.0-x64-portable.exe | `dbce57ba3dafce9a49a10146320e36653ee388c7b1cf8e2a11a6ea8b1b7ee5a1` |
| win-unpacked/LED Ratio Tool.exe | `314ae01f1f3ade2e0cec44aef0e3a936625dd96b5b73970dc7ffadf65393d7b4` |
| win-unpacked/resources/app.asar | `5fa8d76af70336c6cc67fe7698c631b5558ce10dd4df2c634aea7b03755cbd59` |

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
`p7-acceptance.mjs` 重跑：**28 项 = 22 通过 / 0 失败 / 6 跳过**（PASS_WITH_SKIP）。
- 安装 INS-01~04、运行 RUN-01~05、设置 SET-01~03、卸载 UNI-01~03、便携 POR-01~04 全部通过，无品牌回归。
- 6 项 SKIP：注册表 2 项（INS-05 / UNI-04，本环境禁 reg.exe）+ 真版本升级 4 项（UPG-02~05，缺 `--legacy=<旧版本>`）。

### 4.4 注册表 SKIP 可行方案（不伪造，本轮保留 SKIP）
- **卸载项路径**（NSIS `perMachine:false` → HKCU）：
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.ledratiotool.desktop`
- **可行核对命令**（平台允许的 PowerShell .NET Registry API，非 `reg.exe`）：
  ```powershell
  # 安装后核对存在
  Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.ledratiotool.desktop' |
    Select-Object DisplayName, DisplayVersion, Publisher, UninstallString, InstallLocation
  # 卸载后核对清除
  Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.ledratiotool.desktop'  # 应为 False
  ```
- 已实测本机 PowerShell `Test-Path` 可读注册表（无 reg.exe 黑名单拦截），方案技术可行；但本轮遵守「不得用其他 shell/脚本绕过 reg.exe」的既定约束，**保持 SKIP 不伪造**，交由负责人在真实交互环境执行。

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
| `test/reports/p7-acceptance.json` | 安装/运行/设置/升级/卸载/便携（22 通过 / 6 跳过） |
| `test/reports/p7-manual-acceptance.json` | 窗口标题 / 实时分辨率三态（5/5） |
| `test/reports/DPI-09-ASSESSMENT.md` | DPI-09 五项技术评估（不改产品） |
| `test/reports/SHA256SUMS.txt` | 最终发行产物 SHA-256 清单 |
| `build/verify-artifact-icons.mjs` | 四产物图标一致性核验脚本（新增） |
| `test/p7-manual-acceptance.mjs` | 人工验收补充脚本（新增） |

**未决事项（需项目负责人裁决 / 后续动作）**：
1. DPI-09 的 DEC-07 是否调整（选项 A/B/C/D，见评估稿 §6）。
2. 125% / 150% 需在真实物理屏交互会话实测（当前 BLOCKED）。
3. 注册表 INS-05 / UNI-04 需在真实环境用 §4.4 命令核对（本轮 SKIP）。
4. 真版本升级 UPG-02~05 需提供 `--legacy=<旧版本安装包>`（本轮 SKIP）。
