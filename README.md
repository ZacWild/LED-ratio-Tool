# LED Ratio Tool

> LED 大屏比例与视频画布换算工具 —— **一个品牌，两种独立的离线交付形态**。

将 LED 屏幕的实际宽高换算为真实比例，并辅助计算视频画布尺寸、比例误差及等比适配方式。

本项目源于作者在实际工作中经常和 LED 大屏（异形、特长屏）视频制作中的需求有联系，每次都在实际比例和像素转换的痛苦中。作者希望把这个实际工作中用得上的小工具分享给有类似需求的人，也方便其他使用者查看、反馈和改进。

**当前版本：**

| 交付形态 | 版本 | 状态 |
|---|---|---|
| HTML 离线版（单文件） | 1.0.1 | ✅ 已发布（随仓库分发） |
| Windows 桌面版（Electron） | 1.2.0 | ✅ 已发布（[GitHub Release v1.2.0](https://github.com/ZacWild/LED-ratio-Tool/releases/tag/v1.2.0)） |

---

## 它能做什么

- 根据 LED 屏幕的物理宽高，计算真实宽高比与最简整数比。
- 按指定宽度、指定高度、常用分辨率或整数倍方式换算画布尺寸。
- 对比候选分辨率与目标比例的误差。
- 提示画面比例不一致时的裁切或留边方案。
- 复制换算结果与现场参数说明，方便交接给后期或现场技术人员。

两种交付形态共用同一套计算内核（`src/core.js`），核心换算能力一致，只是运行方式不同；桌面版在此基础上另提供**桌面专属能力**（如 px 输入单位、原生菜单与全局快捷键、本地设置持久化），HTML 离线版不含这些。

---

## 两种版本怎么选

| | HTML 离线版 | Windows 桌面版 |
|---|---|---|
| **版本** | 1.0.1 | 1.2.0 |
| **运行方式** | 本地浏览器打开单文件 | 独立 Windows 应用（Electron） |
| **是否需要安装** | 否，双击即用 | 安装版需要一次安装；便携版免安装 |
| **数据保存** | 浏览器 localStorage | 本地用户设置目录（持久化，卸载重装可保留） |
| **输入单位** | m / cm / mm | m / cm / mm / **px**（按像素分辨率直接输入） |
| **获取方式** | 仓库 `dist/` 目录直接下载 | [GitHub Release v1.2.0](https://github.com/ZacWild/LED-ratio-Tool/releases/tag/v1.2.0) |
| **适合场景** | 快速临时使用、跨系统（任何有浏览器的设备） | Windows 日常工具化使用、独立窗口、原生菜单与快捷键 |

---

## HTML 离线版（v1.0.1）

**下载：** [下载 led-ratio-tool.html](https://github.com/ZacWild/LED-ratio-Tool/raw/refs/heads/main/dist/led-ratio-tool.html)，保存到本地后使用浏览器打开即可。
如果没有发布版本，也可以在仓库的 `dist/` 目录中获取 `led-ratio-tool.html`。

1. 双击打开 HTML 文件，无需安装。
2. 输入 LED 屏幕的实际宽度和高度，并确认单位。
3. 选择目标比例与画布换算模式。
4. 查看分辨率和误差，使用「复制完整参数」整理交付信息。

- 完全自包含的单文件：无外链、无 CDN、无网络请求，可微信传 / U 盘拷 / 邮件发。
- 工具在本地浏览器中计算，不需要联网，也不会主动上传输入的数据。
- 源码与它共用：`index.html` + `src/`（`core.js` 计算内核 / `app.js` 交互 / `styles.css` 样式）。

---

## Windows 桌面版（v1.2.0）

Windows 桌面版是与 HTML 版共用同一计算内核的原生应用，额外提供：

- **px 输入单位**（v1.2.0 新增）：可直接按 LED 控制器 / 视频画布的原生像素分辨率输入（如 `1920×1080` → `1.7778:1`、`3840×1080` → `3.5556:1`）。内部折算约定为 **1 px = 1 mm**，该约定只影响单位切换时的显示换算，比例计算只取决于宽高比、与折算率无关；px 模式下结果文案自动改为「输入尺寸」，避免被误读为物理尺寸。
- 独立应用窗口、原生菜单栏、全局快捷键（如 `Ctrl+C` 复制结果、`Ctrl+B` 宽高互换）。
- 深色专业工作台界面与品牌图标（安装/便携/任务栏/标题栏同源）。
- **本地设置持久化**：容差等设置保存在本机用户目录，升级重装不丢失。
- 完全离线运行，不联网、不上传数据。

**正式发行包**（[Release v1.2.0](https://github.com/ZacWild/LED-ratio-Tool/releases/tag/v1.2.0)，2026-11-04 发布）：

| 包 | 下载 | 说明 |
|---|---|---|
| 安装版（NSIS） | [LED.Ratio.Tool-1.2.0-x64-setup.exe](https://github.com/ZacWild/LED-ratio-Tool/releases/download/v1.2.0/LED.Ratio.Tool-1.2.0-x64-setup.exe) | 向导式安装，含开始菜单 / 卸载项 |
| 便携版（Portable） | [LED.Ratio.Tool-1.2.0-x64-portable.exe](https://github.com/ZacWild/LED-ratio-Tool/releases/download/v1.2.0/LED.Ratio.Tool-1.2.0-x64-portable.exe) | 免安装，双击即用，适合 U 盘携带 |
| 校验清单 | [SHA256SUMS.txt](https://github.com/ZacWild/LED-ratio-Tool/releases/download/v1.2.0/SHA256SUMS.txt) | 两个 EXE 的 SHA-256 |

下载后可用 `SHA256SUMS.txt` 核对文件完整性（`sha256sum -c SHA256SUMS.txt`，或 `certutil -hashfile <文件> SHA256`）。

> ⚠️ **关于未签名的说明**：本工具**未做代码签名**（项目规模所限，项目负责人已接受该状态）。首次运行时 Windows SmartScreen 可能出现提示，点击「更多信息 → 仍要运行」即可。工具不联网、不上传数据（安装版仅写标准卸载项等系统信息）。

**发行状态**：**已正式发布**。桌面版已完成开发与完整验收（真实 Windows 环境安装 / 卸载 / 升级、显示缩放、便携版、安全配置等）。请只从 [Releases](https://github.com/ZacWild/LED-ratio-Tool/releases) 页面下载官方安装包，勿信任任何非官方渠道。

---

## 重要说明

**屏幕物理尺寸不等于 LED 控制系统的原生像素分辨率。** 本工具根据输入尺寸计算比例和画布建议，不会推导控制器、播放服务器实际支持的分辨率。

正式交付前，请向现场技术方确认：

- LED 控制系统接收分辨率
- 后期合成分辨率
- 最终交付文件分辨率

不要仅凭工具计算结果判断现场设备一定能够播放；具体参数以控制系统、播放设备及现场技术方确认为准。

另外，行业俗称不一定等于严格数学比例。例如，严格的 **21:9 = 7:3 ≈ 2.3333:1**。请以实际尺寸计算出的比例为准，不要直接用俗称替代实测结果。

---

## 项目目录结构

```text
LED-ratio-Tool/
├── README.md / CHANGELOG.md / VERSION / DELIVERY.md / DESIGN-SPEC.md   项目文档
├── index.html                     HTML 版开发版入口（需与 src/ 同目录使用）
├── src/                           HTML 版源码（core.js / app.js / styles.css）
├── build.mjs                      HTML 版零依赖构建脚本
├── dist/led-ratio-tool.html       ★ HTML 离线单文件版（主交付物）
├── test/                          HTML 版测试（单元 / 90 项验收 / 红线守卫 / 截图）
├── desktop/                       ★ Windows 桌面版（Electron）
│   ├── main/ preload/ renderer/   主进程 / 预加载 / 渲染层源码
│   ├── build/                     打包与资源同步脚本（electron-builder 配置）
│   ├── resources/                 品牌图标
│   ├── test/                      桌面版测试套件
│   │   ├── reports/               验收报告与原始证据（JSON / 截图）
│   │   └── probes/                一次性取证探针（历史诊断脚本）
│   └── README.md                  桌面版状态、测试矩阵与使用说明
└── .github/workflows/             Windows CI 门禁
```

---

## 开发与测试

项目零第三方 npm 依赖。修改计算逻辑后：

**HTML 版**

```bash
node --test test/core.test.mjs   # 单元测试
node build.mjs                   # 重新构建 dist/led-ratio-tool.html
```

修改前端代码后，请重新构建单文件版，避免离线版仍保留旧内容。

**Windows 桌面版**

桌面版有独立的测试矩阵（资源同步校验、安全审计、桌面 E2E、200 组差分、视觉回归、三档显示缩放验收、打包验证等），开发与测试方法见 [`desktop/README.md`](desktop/README.md)。桌面版共用根目录的 `src/core.js` 计算内核（SHA-256 哈希锁保护，逐字节复用）。

---

## 版本信息

- **`VERSION` 文件（仓库根目录）记录 HTML 离线版的版本号**，当前为 `1.0.1`。
- **Windows 桌面版的版本号**记录在 [`desktop/package.json`](desktop/package.json)，当前为 `1.2.0`；正式发行包见 [Releases](https://github.com/ZacWild/LED-ratio-Tool/releases)。
- 两种交付形态独立演进、独立编号；完整变更历史见 [`CHANGELOG.md`](CHANGELOG.md)。

---

## 项目开发历程与 AI 协作

本项目**不是「一句话生成」的产物**。它是在项目负责人主导下，由多个 AI 模型分阶段协作实现，并依靠 Git 版本管理、自动化测试、CI 与人工验收逐步收敛的软件项目。

作者本人没有编程基础，也不是职业开发者 —— 在本项目中承担的是**产品负责人**角色：提出使用场景、定义需求与验收标准、决定开发范围、执行测试验收，并对最终发行授权。代码实现由多个 AI 模型在 Tencent WorkBuddy 中**分阶段协作**完成，并非某一个模型一次性产出。

| 开发阶段 | 使用模型 | 工作范围 |
|---|---|---|
| P1–P3 | Space Bunny | 项目前期主体开发 |
| P4–P5 | Step5-preview | 功能完善、测试与 Preview 阶段 |
| P6 | MiniMax M3.1 Flash | Release Readiness、测试体系完善、缺陷修复、打包与 CI |
| RC 收尾及后续 | DeepSeek V4.1 | 遗留问题处理、局部修复、工程文档、PR 与发行准备 |

**质量保障链路**（每个阶段都需通过才算完成）

- **Git 与 PR**：开发在功能分支进行，`main` 受规则集保护，合并需项目负责人授权（详见 [`GITHUB-RULES.md`](GITHUB-RULES.md)）。
- **自动化测试**：单元测试、业务红线守卫、桌面 E2E、200 组差分、视觉回归、高 DPI 验收等门禁，逐项条数与当前状态见 [`desktop/README.md`](desktop/README.md)。
- **CI**：GitHub Actions 在每次推送与 PR 时执行完整门禁，其状态检查已纳入分支保护。
- **人工验收**：产品负责人对可用性、视觉与发行条件做最终判定 —— **自动化通过不等于可以发布**。

---

## 许可证与反馈

- 许可证：[MIT](LICENSE)
- 仓库：[ZacWild/LED-ratio-Tool](https://github.com/ZacWild/LED-ratio-Tool)
- 欢迎通过 [Issues](https://github.com/ZacWild/LED-ratio-Tool/issues) 提交问题、错误反馈或功能建议。
- AI 生成的代码不代表绝对没有问题；用于正式项目时，请结合现场参数自行核验计算结果。
