# PR #10 描述（供负责人在 GitHub 创建 PR 时粘贴）

**标题**：`feat(desktop): complete LED pitch resolution workflow and usage guide`

**分支**：`feature/desktop-v1.3.0-pr10-guide` → `main`（4 提交：62b472e / b3fb25f / 436bee4 / 691a5b6）

---

## 1. 本次解决的问题

- **原任务书的缺陷判定经实测撤销**：真实 Electron 逐档实测（10500×3670 mm，P1.667→P3）证明 P 值切换后理论分辨率实时更新、PX 换算正确响应、`converted/direct` 来源语义正常、手动 PX 不被覆盖、console/pageerror 为 0 ——「P 值切换后理论分辨率不更新」不成立，**未对正确的计算链做任何重构**。
- 实际补齐：结果来源不可见、P 值功能缺少说明、各模块缺少使用指引。
- i18n 基础资产此前从未进入 main，本 PR 将其与功能完善一并合轨。

## 2. 本次实现的功能

1. **i18n 基础资产合轨 + 双语言资源**：复用已验收的自包含资产（runtime/index/text-map/locales），adapter 新增独立注入补丁；34 个新增 key，双包 378/378 集合一致。
2. **P 值说明与四层使用指南**：设置模态内 6 段折叠说明（默认值口径=未配置）+ B 栏 ⓘ 指南（快速入门/专业功能/参数与结果/逐模块说明）。
3. **PX 来源标识**：px 模式下 header 悬浮徽标「理论估算（由 P 值推算）/用户输入」，随 `pxOrigin` 实时切换；stacked 档隐藏。
4. **D-1 表格显示修复**：`app.css` 值列折行补齐进 main（仅桌面端，`src/styles.css` 零改动）。
5. **原计算链实测确认正常**，未做无必要的重构（现有测试 A-08/B-07/D-09 已覆盖该行为）。
6. **语言切换**：设置模态内 zh-CN/en-US 下拉，切换不刷新页面、不丢输入、不改变计算结果。

## 3. 测试证据

- 九项基线全达标：Pitch 26/26 · Settings 13/13 · PitchDOM 18/18 · Desktop 93/93 · HTML 85/85 · Core 64/64 · Security 47/47 · PX 10/10 · Differential 200/200。
- 新增模块 Electron 验证 24/24（`p10-ui-verify.cjs`，含语言下拉模态内真实可见性断言）。
- 悬浮徽标遮挡实测：zh/en × 1440/1200/1024 六组合零遮挡（`p10-overlay-occlusion.cjs`）。
- Adapter 幂等（两次 sync 四产物哈希一致）、双包一致性（vm 实际加载比对）。
- **NOT RUN 项**：Main Process E2E / i18n 既有套件（main 基线无该资产）；Main Process E2E 以 24 项专项验证替代覆盖。
- **视觉基线待审事项**：三档 3 FAIL 为预期 UI 变更（差异 100% 归因新增模块，归因数据在 `visual-regression.json`），基线未刷新，待人工审阅差异图后授权更新。
- Core SHA-256 `dd49a782…bcc26`、HTML `d016a66a…`/187,852 B 零改动。

## 4. 审查发现并已修复（691a5b6）

- A1：语言下拉曾挂隐藏容器（不可达）→ 迁入设置模态；MO 微任务挂载会触发 [RENDERER CRASH]（实证）→ 改轮询挂载。
- A2：FAQ 第 3 问桌面文案已被 ⑦ 改写但 text-map/双包未跟 → en-US 残留中文 → 三处对齐。
- 详见 `desktop/test/reports/pr10-implementation-report.md` 第三部分。

## 5. 合并前审查

- diff 审查（六项）全过：冻结文件零改动、D-1 仅桌面端、guide.js DOM 边界干净、i18n 资产原样复用、测试资产零断言修改、adapter diff 边界精确（`pr10-diff-review.md`）。
- i18n 合轨架构审查：注入顺序/幂等成立、DOM 生命周期无泄漏、失败不阻断启动、可沿用性规约与反模式清单（`pr10-i18n-merge-review.md`）。
- 边界披露：desktop-ui.js 既有动态文案（状态栏、px 提示 HINT_PX 等）本轮未接 onLocaleChange，en-US 下保持中文 —— 属 p10 范围边界，非回归。
