# GitHub 操作规则（项目负责人制定，优先级高于其他自动化工作流指令）

> 制定时间：2026-10-29 ｜ 最近修订：2026-10-30
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
| **服务端** | Required status checks | ✅ PR 必须通过指定检查才能合并 | 需先配置 CI（**本项目目前未配置**） |
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

> **本项目目前没有 GitHub Actions 工作流。**
> 所有测试检查目前都**只在本地执行**。本地测试通过 **不等于** GitHub Actions 检查通过。
> 后续如需服务端 CI，由项目负责人决定是否引入。

---

## 2. 规则的可执行化映射

| 规则 | 实现 | 运行方式 | 是否在 `npm test` 中 |
|---|---|---|---|
| R-1 开发与推送只在 feature 分支 | `guard-github-rules.mjs --policy`（C-1） | `npm run test:policy -- --policy` | ❌ **不在** —— 这是开发流程检查，CI 以 detached HEAD 检出时不应失败 |
| R-3 禁止合并到 main | **GitHub Rulesets**（服务端）＋ 人工审查 | 仓库设置 | ❌ 本地脚本不检查授权 |
| R-4 禁止直推 main | `.githooks/pre-push`（真实 hook） | `git push` 时自动触发 | ❌ hook 而非测试 |
| R-5 禁止修改正式发布文件 | `guard-github-rules.mjs`（A-1）＋ `npm run verify:reproducible` | 本地审计 | ✅ A-1 在本地审计中 |
| R-6 禁止删除分支与标签 | `guard-github-rules.mjs`（A-2）＋ `.githooks/pre-push` | 本地审计 + hook | ✅ A-2 在本地审计中 |

### 受保护对象

| 类别 | 对象 |
|---|---|
| 分支 | `main`、`feature/desktop-windows` |
| 标签 | `pre-desktop`（**回滚锚点**，删除等同于销毁回滚能力） |
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

额外检查当前分支是否为 `feature/desktop-windows`。
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
bash .githooks/pre-push
```

**拦截范围**：

| 场景 | 结果 |
|---|---|
| 推送到 `main` / `master` | ⛔ 拒绝 |
| 推送到允许清单外的分支 | ⛔ 拒绝 |
| 删除受保护分支（`main` / feature 分支） | ⛔ 拒绝 |
| 删除受保护标签（`pre-desktop`） | ⛔ 拒绝 |
| 推送到 `feature/desktop-windows` | ✅ 允许 |
| 删除非受保护分支/标签 | ⚠️ 允许（提示） |

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

## 5. 当前状态核验（2026-10-30 实测）

| 核验项 | 结果 |
|---|---|
| 远端 `main` HEAD | `545bd0d7c9d7` —— 未被合并任何内容 ✅ |
| 远端 `feature/desktop-windows` | `879e11b3db0d` ✅ |
| 远端 `pre-desktop` 标签 | 存在 → `545bd0d7c9d7` ✅ |
| 未授权分支 | 0 个（hook 负向测试未产生任何副作用）✅ |
| `npm test` 是否含分支策略检查 | ❌ **不含**（已按要求剥离）✅ |
| GitHub Actions | **无** —— 本项目目前没有服务端 CI |
