# S9-02 · 视觉基线更新归因与证据说明

**执行：** S10-R9 · v1.3.0 FINALIZATION · S9-02
**日期：** 2026-11-17
**授权依据：** S10-R9 任务书 S9-02 第 6 条「对已经确认属于预期 UI 变化的项目，才允许更新对应视觉基线」
**阈值：** 0.100%（固定值，本次执行未放宽、未修改）

---

## 1. 更新前状态（基线停在 v1.2.0）

三张基线（baseline-1440x900 / 1200x800 / 1024x680）最后更新于 `1e0bf68`（v1.2.0，PR #6）。
PR #10（`5c40379`）引入 v1.3.0 新 UI 后基线未刷新（PR #10 自述「基线刷新待授权」）。

本次执行首轮比对（证据：`pre-accept-visual-regression.json`，DOM 归属齐全）：

| 档位 | 差异率 | 判定 | DOM 归属聚合（差异像素） |
|---|---:|---|---|
| 1440×900 | 3.1852% | FAIL | #p10-guide 16217（39.3%）/ #stage 10230（24.8%）/ .p10-list__item 6490 / .panel__title 2472 / #screen-rect 2099 / .panel.panel--result 1450 / #dim-ratio 1313 / .layout 1009 |
| 1200×800 | 0.4133% | FAIL | .panel__title 1958（49.3%）/ #result-badge 1954（49.2%）/ .panel.panel--result 56 |
| 1024×680 | 0.5638% | FAIL | .panel__title 2401（61.2%）/ #result-badge 1511（38.5%）/ .layout 14 |

## 2. 归因结论（逐项，非「整体掩盖」）

全部差异归属 **PR #10 引入的 v1.3.0 预期 UI 变更**，无真实 UI 缺陷：

| # | 归属组件 | 性质 | 判定 |
|---|---|---|---|
| A | `#p10-guide` / `.p10-list__item`（仅 1440 档） | v1.3.0 新增「使用指南 / 快速入门 / LED 专业功能」卡片（PR #10 新模块） | 预期新增 |
| B | `#stage` / `#screen-rect` / `#dim-ratio` / `.layout`（1440 档） | 舞台区被指南卡挤压的布局重排（标注标签位移，非内容变化） | 预期布局 |
| C | `.panel__title`（三档） | v1.3.0 面板标题新增 ⓘ 信息图标（PR #10「来源标识」能力） | 预期新增 |
| D | `#result-badge`（1200/1024 档） | 匹配状态徽章为 ⓘ 图标让位产生的位移（徽章文字「⚠ 非标准比例」内容未变） | 预期布局 |

### 与 PR #10 历史归因的交叉验证
PR #10 提交 `b3fb25f` 自述：「#p10-guide 16217px / #stage 挤压 10230px / .panel__title ⓘ 2472px」。
本次 DOM 归属像素数**逐项一致**（16217 / 10230 / 2472）→ 证明自 PR #10 证据采集以来视觉态零漂移，**PR #11（i18n）未引入任何视觉变化**（与 PR #11 自述「改动前后完全一致」互证）。

### 逐档视觉核查（本次执行）
- 1440×900 实际截图：单徽章 + ⓘ 图标、指南卡完整、标注标签无重叠、状态栏正常 → 无截断/重叠/溢出。
- 1200×800：两栏折叠态正常，标题行徽章位移 + ⓘ 新增，其余一致。
- 1024×680：纵向堆叠正常，徽章居中位移 + ⓘ 新增，无横向溢出。

## 3. 授权执行记录

1. **证据封存**（更新前完成）：`old-baseline/`（旧基线 3 张，SHA-256 见下）+ `pre-accept-visual-regression.json` + 本次执行的 diff/overlay/actual 截图。
2. **更新命令**：`node desktop/test/visual-regression.mjs --accept` → 3 档 BASELINE_UPDATED。
3. **更新后复验**：`node desktop/test/visual-regression.mjs` → **PASS 3/3，差异率均 0.0000%**。
4. **比对器负控**：`node desktop/test/visual-selfcheck.mjs` → **5/5 通过**（1 像素差异可检出、遮罩真实生效）→ 比对器可信，PASS 结论有效。

### 旧基线 SHA-256（回滚依据）
```
2bb165d35e219684876fa7a90de2c9e0cb91ed3567b3328da138ac71bdcd70e3  baseline-1024x680.png
0ade6cad11632680406ee66e1e04c430c5d775ec18020e0fa76fb8dfa087812d  baseline-1200x800.png
485beb63523b96000d7a425555320650f0599139292458e605d7e6c57881ba67  baseline-1440x900.png
```

## 4. 附带修复：visual-selfcheck.mjs 存量缺陷

- **问题**：`loadComparator()` 将提取出的比对器源码写入 `%TEMP%`，导致源码内 `require('./harness/visual-lib.cjs')` 按临时目录解析而失败——自初始提交 `626673f` 起即无法运行（历史工作区复现同样报错），从未产出过自检记录。
- **最小修复**：临时文件改写至 `test/` 目录（与被提取模块同级，相对路径可解析），保留原提取/清理语义。仅测试工具链文件，**不触碰业务逻辑 / 比对算法 / 阈值**。
- **修复后**：5/5 通过（解码正确 / 无损往返 / 100 万像素注入检出 / **单像素注入检出** / 遮罩区排除）。

## 5. 功能回归（原有功能、布局及交互无回归）

| 套件 | 结果 |
|---|---|
| 桌面专项 desktop-suite | 93/93 PASS，0 console error，0 pageerror |
| led-pitch（P 值） | 0 fail |
| settings-compat | 0 fail |
| pitch-dom | 18/18 PASS |
| differential-200 | 200/200 PASS |
| golden-vectors | PASS（覆盖度注记保留） |
| golden-negative-selftest | PASS |
| guard-redlines | PASS（8 处受保护业务口径） |
| core.test | 0 fail |
| HTML acceptance e2e | 85/85 PASS |

## 6. 未做事项（纪律声明）

- ❌ 未整体重建基线掩盖问题（先逐档归因、逐档核查，后按档更新）。
- ❌ 未放宽 0.100% 阈值。
- ❌ 未修改 P 值计算 / 业务逻辑 / 受保护规则 / 测试断言。
- ❌ 未删除任何失败证据（pre-accept 全套证据入库）。
