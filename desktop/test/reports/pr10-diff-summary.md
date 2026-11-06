# PR #10 · Diff 摘要

**分支**：`feature/desktop-v1.3.0-pr10-guide`（base `main` `68b24d1`）
**提交**：`62b472e` 实现（10 文件 +2050/-5） + `b3fb25f` 回归证据（17 文件）

## 新增（7 文件）

| 文件 | 行数 | 说明 |
|---|---:|---|
| `desktop/renderer/i18n/runtime.js` | 276 | i18n 运行时（复用 i18n 分支已验收资产，原样） |
| `desktop/renderer/i18n/index.js` | 285 | 引导 + 全 TextNode 打标（同上） |
| `desktop/renderer/i18n/text-map.js` | 163 | 1.2.0 静态文本映射（同上） |
| `desktop/renderer/i18n/locales/zh-CN.js` | 432 | 语言包（含新增 34 个 `p10.*` key） |
| `desktop/renderer/i18n/locales/en-US.js` | 432 | 同上 |
| `desktop/renderer/guide.js` | 233 | **本 PR 新写**：使用指南 / P 值说明 / PX 来源标识 / 语言切换（零依赖、零硬编码中文） |
| `desktop/test/reports/pr10-*.md` + 证据 | — | 四份交付物与判别脚本 |

## 修改（4 文件）

| 文件 | 变更 | 说明 |
|---|---|---|
| `desktop/build/desktop-adapter.cjs` | +40 | 新增 `applyI18nScriptsToIndex`（独立补丁，⑦ 系列零改动） |
| `desktop/renderer/app.css` | +6 / +112 | D-1 值列折行（+2，S5-9 补齐）+ 指南/来源/提示样式 |
| `desktop/renderer/index.html` | +6 | sync 注入 6 个 script 标签（生成物） |
| `desktop/renderer/app.js` / `desktop-ui.js` / `manifest.json` | 哈希级 | sync 重建，与源一致 |

## 冻结红线核对（全部零改动）

`src/core.js`（`dd49a782…bcc26`）、`src/app.js`、`src/styles.css`、根 `index.html`、`dist/led-ratio-tool.html`（`d016a66a…` / 187,852 B）、`core.lock.json`、IPC 通道与 preload 接口、`schemaVersion`。

## 测试资产变化

- **零断言删除 / 零阈值放宽 / 零基线刷新**。
- 新增：`pr10-visual-evidence/`（4 档截图 + 4 个判别/验证脚本 + 2 份 JSON 数据）。
- `desktop-suite.json` 等报告 JSON 与截图为执行产物（M），随证据 commit 入库。
