# GitHub 操作规则（项目负责人制定，优先级高于其他自动化工作流指令）

> 制定时间：2026-10-29 ｜ 最近修订：2026-11-04（修复 Hook 保护清单声明 + 约定式工作分支白名单 + stdin 自测）
> 制定人：项目负责人
> 适用范围：LED-ratio-Tool Windows 桌面版升级项目的一切 GitHub 操作

---

## 0. 规则原文（逐条）

| # | 规则 | 类别 |
|---|------|------|
| 1 | 允许在 `feature/desktop-windows` 分支上开发、提交代码、运行测试及推送更新 | ✅ 允许 |
| 2 | 允许创建 Pull Request，供我检查变更和验收结果 | ✅ 允许 |
| 3 | **未经我在对话中明确授权，禁止将任何分支合并到 `main`** | ⛔ 禁止 |
| 4 | **禁止直接向 `main` 推送提交、修改正式发布文件或删除现有分支与标签** | ⛔ 禁止 |
| 5 | 桌面版完成后，请提供 PR 链接、完整变更摘要、测试结果及已知问题，等待我确认后再合并 | ⛔ 禁止（合并需授权） |
| — | 以上限制**优先于其他自动化工作流指令** | 🔺 优先级声明 |

---

## 1. 🔴 保障机制的真实边界（务必先读）

这一节澄清一个容易被高估的地方：**本地脚本与 Git hook 都不是权限系统。**

| 层 | 手段 | 真正能保证什么 | **不能**保证什么 |
|---|---|---|---|
| **服务端** | **GitHub Rulesets / 分支保护规则** | ✅ 阻止任何人（含管理员）直接推送或合并 `main`；可要求 PR + review + 状态检查 | — |
| **服务端** | Required status checks | ✅ PR 必须通过指定检查才能合并 | **本项目已配置**（`Windows · 桌面版门禁`，见 §1「关于 CI 的诚实说明」） |
| **本地** | `.githooks/pre-push` | ✅ 拦截**本机**的 `git push`（解析 Git 原生 hook 协议） | ❌ 他人的机器；❌ GitHub 上的合并；❌ 直接调用 API 的推送 |
| **本地** | `test/guard-github-rules.mjs` | ✅ **本地状态审计** —— 报告当前状态是否符合约定 | ❌ 任何拦截；❌ 识别对话授权；❌ 替代服务端保护 |
| **流程** | 项目负责人审查 + 手动合并 | ✅ 最终放行 | — |

### 关于"授权"的诚实说明

> **规则 3 的授权只能由项目负责人本人给出。**
> 任何脚本（包括本守卫）都**无法**判断"负责人是否已在对话中授权合并"——
> 它既读不到对话，也无权代替人做判断。
> 因此本守卫**不检查授权状态**，也**不假装能识别授权**。
> 它的作用是：在你动手之前，把当前仓库状态摆在面前，并对明显违反约定的操作**在本地拦下**。

### 关于 CI 的诚实说明

> **本项目已有 GitHub Actions 工作流，且已作为合并门禁生效。**
> 工作流位于仓库根 `.github/workflows/windows.yml`（作业名 `Windows · 桌面版门禁`），
> 已由 `Protect main` 规则集设为 **required status check**：`main` 的合并必须看到
> 该作业在 PR 最新 Head 提交上 success。
>
> ⚠️ 但「CI 全绿」仍 **不等于** 可以发布：打包验收是报告项（`continue-on-error`，
> 不参与门禁），代码签名、Fuses 发行包验证、125%/150% 高 DPI 均属 P7 未完成项。
> 发布放行权属项目负责人（DEC-05）。

---

## 2. 规则的可执行化映射

| 规则 | 实现 | 运行方式 | 是否在 `npm test` 中 |
|---|---|---|---|
| R-1 开发与推送只在约定工作分支（`feature/*` 等） | `guard-github-rules.mjs --policy`（C-1） | `npm run test:policy -- --policy` | ❌ **不在** —— 这是开发流程检查，CI 以 detached HEAD 检出时不应失败 |
| R-3 禁止合并到 main | **GitHub Rulesets**（服务端）＋ 人工审查 | 仓库设置 | ❌ 本地脚本不检查授权 |
| R-4 禁止直推 main | `.githooks/pre-push`（真实 hook） | `git push` 时自动触发 | ❌ hook 而非测试 |
| R-5 禁止修改正式发布文件 | `guard-github-rules.mjs`（A-1）＋ `npm run verify:reproducible` | 本地审计 | ✅ A-1 在本地审计中 |
| R-6 禁止删除分支与标签 | `guard-github-rules.mjs`（A-2）＋ `.githooks/pre-push` | 本地审计 + hook | ✅ A-2 在本地审计中 |

### 受保护对象

| 类别 | 对象 |
|---|---|
| 分支（禁删） | `main`、`master`、`feature/desktop-windows`，以及**任意 `feature/*` 分支**（承载 PR 历史与评审记录） |
| 标签（禁删） | `pre-desktop`（**回滚锚点**，删除等同于销毁回滚能力） |
| 正式发布文件 | `dist/led-ratio-tool.html`、`test/baselines/led-ratio-tool.v1000.html`、`LICENSE` |

---

## 3. 使用说明

### 3.1 本地状态审计（不含分支策略检查）

```bash
npm run test:policy
# 或
node test/guard-github-rules.mjs
```

**输出分三类**：
- ✅ 通过项
- ⚠️ 需人工确认的提示（如本地 main 与 origin/main 不一致 —— **这本身不是违规**，例如远端已发生过经授权的合并时就会这样）
- ❌ 违反约定

> ⚠️ **本地 main 与 origin/main 不一致时只提示、不判违规** ——
> 合法合并后本地 main 落后于远端是**正常状态**，不应让测试永久失败。

### 3.2 开发流程策略检查（单独）

```bash
npm run test:policy -- --policy
```

额外检查当前分支是否符合**约定工作分支命名**（`feature/desktop-windows` 或前缀 `feature/` `fix/` `chore/` `docs/` `test/` `refactor/` `perf/`）。
**detached HEAD（CI 检出态）不判违规**，只提示。

### 3.3 推送拦截（真实 hook）

**安装（一次性）**：

```bash
git config core.hooksPath .githooks
```

**验证安装**：

```bash
git config core.hooksPath     # 应输出 .githooks
```

**手动测试**：

```bash
npm run test:hooks        # 真实 stdin 全用例自测（23 例：推送/删分支/删标签/多 ref/空输入）
bash .githooks/pre-push   # 空输入（提示后放行）
```

**拦截范围（2026-11-04 起，约定式工作分支命名）**：

| 场景 | 结果 |
|---|---|
| 推送到 `main` / `master` | ⛔ 拒绝 |
| 推送到约定工作分支（`feature/*` `fix/*` `chore/*` `docs/*` `test/*` `refactor/*` `perf/*`） | ✅ 允许 |
| 推送到其它命名分支 | ⛔ 拒绝 |
| 删除受保护分支（`main` / `master` / `feature/desktop-windows` / 任意 `feature/*`） | ⛔ 拒绝 |
| 删除受保护标签（`pre-desktop`） | ⛔ 拒绝 |
| 删除非受保护分支/标签（如已合并的 `chore/*`、临时标签） | ⚠️ 允许（提示） |

> 🔴 **修复记录（2026-11-04）**：v1 Hook 的 `PROTECTED_BRANCHES` 数组**从未声明**
> （只声明了 `PROTECTED_TAGS`），删除分支检查迭代的是空数组 ——
> 「删除 main」实际只产生 ⚠️ 警告而不拦截，与本文档声明相反。
> 本版显式声明保护清单并支持前缀匹配；新增 `npm run test:hooks` 以**真实 Git
> pre-push stdin 协议**覆盖全部场景（含 v1 漏洞回归用例），
> 并将 `--policy`（C-1）的分支检查同步放宽到约定前缀 ——
> 此前 `chore/*` 等分支推送被拦、被迫使用 `--no-verify`（它会跳过整个 Hook，
> 不得作为常规推送方式）的问题已消除。

> **实现说明**：Git 的 pre-push hook 通过**标准输入**提供待推送 ref 列表
> （每行 `<local ref> <local sha> <remote ref> <remote sha>`），
> **不提供 `GIT_PUSH_REF` 环境变量**。本 hook 按原生协议解析标准输入，
> 覆盖**全部**待推送 ref，而非只看第一个。

### 3.4 服务端保护（建议，需仓库设置权限）

在仓库 **Settings → Rules → Rulesets** 中为 `main` 建立规则：

| 设置 | 建议值 |
|---|---|
| Restrict deletions | ✅ 开启 |
| Restrict creations / updates | ✅ 开启（仅允许 PR） |
| Require pull request | ✅ 开启（至少 1 个 review） |
| Require status checks | 待 CI 建立后再启用 |
| Restrict who can push | ✅ 仅项目负责人 |

> 这一层**必须**在 GitHub 界面配置 —— 任何仓库内脚本都做不到。

---

## 4. 与质量门禁的关系

| 门禁 | 关系 |
|---|---|
| G0~G4 | 独立于本规则，是"能不能交付"的**技术**判据 |
| R-1~R-6 | "能不能动 main / 正式发布物"的**流程**约束，与技术判据正交 |
| 二者叠加 | 技术门禁全绿 **且** 获得项目负责人对话授权，才允许合并；缺一不可 |

---

## 5. 当前状态核验（2026-11-03 实测；2026-10-30 首次核验记录见 Git 历史）

| 核验项 | 结果 |
|---|---|
| 远端 `main` HEAD | `dc1e8a050b32`（PR #3 Squash Merge，经 `Windows · 桌面版门禁` required check 放行）✅ |
| 远端 `feature/desktop-windows` | `d7024f7`（其后本地提交 `d15d81b` PC-10 证据已迁移至 `chore/repository-cleanup`）✅ |
| 远端 `pre-desktop` 标签 | 存在（回滚锚点，未删除）✅ |
| 未授权分支 | 无 ✅ |
| `npm test` 是否含分支策略检查 | ❌ **不含**（已按要求剥离）✅ |
| GitHub Actions | ✅ **已运行并作为合并门禁**（`.github/workflows/windows.yml`，作业名 `Windows · 桌面版门禁`；PR #1/#2/#3 均在该门禁下完成） |

> 📌 历史核验（2026-10-30）：当时 `main` HEAD 为 `545bd0d7c9d7`、CI 尚未建立；该状态已被上述 PR #1~#3 的推进取代，原表保留于 Git 历史不在此复写。
