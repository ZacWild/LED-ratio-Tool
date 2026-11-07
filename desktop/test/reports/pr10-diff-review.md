# PR #10 实际 Diff 审查报告

- 审查人：凌无缺（qa-engineer）
- 审查方式：只读 git 命令 + 文件审查（未修改仓库、未运行 Electron）
- 审查对象：`C:\Users\A\WorkBuddy\2026-10-29-11-12-26\pr10-work`，分支 `feature/desktop-v1.3.0-pr10-guide`
- 范围：`68b24d1..436bee4`（62b472e feat / b3fb25f test / 436bee4 docs），基线 `68b24d1` = origin/main（PR #9 squash 后）
- i18n 资产源分支：本地 `feature/windows-i18n-en-US`

**总结论：六项全部 ✅ 通过，未发现阻断性问题。** 另有 1 个非阻断观察项（manifest.json 的 bytes 字段，见文末）。

---

## 1. 冻结文件零改动 ✅

**命令与证据：**

```bash
git diff --stat 68b24d1..436bee4          # 全量 40 个文件变更，全部位于 desktop/ 下
git diff 68b24d1..436bee4 -- src/core.js src/app.js src/styles.css index.html \
  core.lock.json desktop/core.lock.json dist/led-ratio-tool.html package.json VERSION | wc -l
# 输出：0
```

全量 diff 文件清单中，冻结文件零出现：`src/core.js`、`src/app.js`、`src/styles.css`、根 `index.html`、根 `core.lock.json`、`desktop/core.lock.json`、`dist/led-ratio-tool.html`、根 `package.json`、`VERSION` 均不在变更列表中（diff 输出 0 行）。

**core.js 内容哈希核对**（注：`git rev-parse <commit>:<path>` 得到的是 git blob SHA，非内容哈希，故用 cat-file 重算）：

```bash
git cat-file blob 436bee4:desktop/renderer/core.js | sha256sum
# dd49a7829618f77da4c07baafd4e5d6f08e23f8577d074c5500d006a011bcc26  ✅ 与预期完全一致
git diff 68b24d1..436bee4 -- desktop/renderer/core.js | wc -l   # 0
```

**结论：** 冻结文件零改动，`desktop/renderer/core.js` 哈希逐字匹配，HTML 离线版冻结约束成立。

## 2. D-1 桌面端隔离 ✅

**命令与证据：**

```bash
git diff 68b24d1..436bee4 -- desktop/renderer/app.css
```

`app.css` diff 全文核对，仅两处：

1. **`.pitch-table td:not(:first-child)` 块**（@约 1255 行）：恰好新增 `white-space: normal;` + `word-break: break-word;` 两行及 4 行注释（说明 D-1 补齐动机），无其他属性改动。
2. **文件末尾样式追加**（@1358 行后，+126 行总增量中的其余部分）：纯追加 `.p10-guide` / `.p10-section` / `.p10-pitch-help` / `.p10-px-source` / `.p10-tip` / `.p10-lang` 系列 PR #10 样式，全部为新增选择器，未改动任何既有规则；颜色全部走 `var(--token)`，并含 `compact/tight` 档隐藏 `.p10-guide` 的追加规则。

`src/styles.css` 已在第 1 项确认零 diff → D-1 修复不会影响 HTML 离线版。

**结论：** diff 边界与任务书描述完全一致。

## 3. guide.js DOM 操作边界 ✅

**命令与证据：**

```bash
grep -nE 'innerHTML|insertAdjacentHTML|document\.write|outerHTML' desktop/renderer/guide.js
# 唯一命中：第 10 行注释「不使用 innerHTML、不做跨标签文本正则替换」——声明本身，无实际调用
```

全文（279 行）逐段审查：

- **API 白名单合规：** 仅使用 `createElement` + `textContent` + `appendChild` + `createTextNode` + `setAttribute`（`mk()` 工具函数统一收口，guide.js:24-29）。唯一的字符串→DOM 解析是对 i18n 文案用 `split('|')` + `match(/^([^:：]+)[:：]\s*([\s\S]*)$/)`（guide.js:36-46），仅在**单标签内部**拆分「标题：说明」，无跨标签正则替换。未发现任何 HTML 解析类 API。
- **创建的全部元素与挂载点：**

  | 功能 | 创建元素 | 挂载点 |
  |---|---|---|
  | B 栏指南 | `details#p10-guide`（含 summary.p10-guide__head：icon/title/toggle 三个 span + div.p10-guide__body，body 内 4 个 `details.p10-section`） | `.panel--stage` **appendChild 追加**（guide.js:61-77） |
  | 设置行说明 | `details#p10-pitch-help`（summary + 6 个 p.p10-para） | `.pitch-settings-row` **appendChild 追加**（guide.js:93-111） |
  | header 悬浮标识 | `div#p10-px-source`（role=status，label/value/note 三个 span） | `.app-header__actions` **appendChild 追加**（guide.js:122-132） |
  | 语言下拉 | `div#p10-lang`（label#p10-lang-label + select#p10-lang-select + 2 个 option） | 设置面板 **appendChild 追加**（guide.js:186-219） |
  | ⓘ 角标 | `span.p10-tip`（aria-hidden） | 4 处既有 summary/标题节点内 **appendChild 追加**（guide.js:162-183） |

- **无删除既有节点：** 唯一的 `removeChild` 在 `clear()`（guide.js:31），仅清空**本模块自己创建**的容器（`.p10-guide__body`、`#p10-pitch-help`、`#p10-px-source`），且容器非空必然是本模块上次渲染产物。不触碰任何既有 DOM。
- **无全局事件覆盖：** 仅 `addEventListener` 追加（select 的 change、`led:pitch`、doc 的 input/click capture、DOMContentLoaded、LedI18N.onLocaleChange 回调），无 `onclick=` 属性赋值、无对既有 handler 的替换。对既有节点唯一属性写入是 `setAttribute('title', ...)`（原生存欠提示）与 `#p10-px-source` 自身的 `data-origin`。
- **`LedGuideStatus` 只读：** `Object.freeze({ version: '1.0.0', render: renderAll })`（guide.js:275-278），冻结对象，无可写状态入口。⚠️ 微小备注：`render` 属性可调用重渲染函数，但这是供自动化测试读取诊断的既有设计，非状态篡改入口。

**结论：** DOM 边界完全符合任务书约束。

## 4. i18n 资产原样复用核对 ✅

**命令与证据：**

```bash
git diff feature/windows-i18n-en-US 436bee4 -- \
  desktop/renderer/i18n/runtime.js desktop/renderer/i18n/index.js desktop/renderer/i18n/text-map.js | wc -l
# 输出：0 —— runtime / index / text-map 三文件与源分支逐字节一致
```

**locales key 集合对比**（用 `grep -oE "p10\.[a-zA-Z.]+" | sort -u` 提取两版 key 集合再 diff）：

- `zh-CN.js`：新增 **34** 个 `p10.*` key，删除 0 个，既有 key 值零改动（diff 上下文显示追加块从 `@@ -395,5 +395,43 @@` 开始，全部为 `+` 行）。
- `en-US.js`：新增 **34** 个 `p10.*` key，删除 0 个。
- zh 与 en 的 `p10.*` key 集合**完全一致**（`diff` 无输出），无缺漏 key。

**结论：** runtime/index/text-map 原样复用，locales 仅追加恰好 34 个 `p10.*` key，符合预期。

## 5. 测试资产完整性 ✅

**命令与证据：**

```bash
git diff --name-status 68b24d1..436bee4 -- desktop/test/ | grep -vE '^A' | grep -E '\.(mjs|cjs)'
# 无输出（exit 1 = 无匹配）—— test/ 下没有任何「修改/删除」的 .mjs/.cjs 断言文件
git diff 68b24d1..436bee4 -- desktop/package.json | wc -l    # 0 —— scripts 零改动
```

`desktop/test/` 下的变更全部为：
- **新增（A）**：`reports/pr10-visual-evidence/` 目录（4 张截图 + 4 个 .cjs 探针脚本 + 2 个 JSON）及 3 份 PR #10 报告 markdown；
- **修改（M）**：仅测试**产出物** JSON（desktop-suite / differential-200 / px-unit-check / pitch-dom-check / visual-regression）与截图 PNG，无断言逻辑变更。

**结论：** 无断言修改、scripts 零改动，测试资产完整。

## 6. adapter diff 边界 ✅

**命令与证据：**

```bash
git diff 68b24d1..436bee4 -- desktop/build/desktop-adapter.cjs
```

diff 全文核对，仅两处：

1. **新增块**（@488 行后，+36 行）：`I18N_SCRIPT_ANCHOR` 常量（`'<script src="app.js"></script>'`）、`I18N_SCRIPT_BLOCK`（6 个 script 标签：runtime → locales/zh-CN → locales/en-US → text-map → index → guide.js）、`applyI18nScriptsToIndex()` 函数——含幂等保护（已含 `i18n/runtime.js` 则跳过）、锚点缺失保护（skipped 上报）、注入位置在 `app.js` 之前。
2. **`applyIndexAdapter()` 内一行调用**（@554 行后）：`src = applyI18nScriptsToIndex(src, applied, skipped);`，插在 ⑦-B `applyPitchButtonToIndex` 之后。

⑦ 系列补丁函数（含 `applyPitchButtonToIndex`）零改动。旁证：`desktop/renderer/index.html` 的 +6 行 diff 恰为该注入块的产物（6 个 script 标签插在 `core.js` 与 `app.js` 之间），与 adapter 逻辑自洽。

**结论：** adapter diff 边界与任务书描述完全一致。

---

## 观察项（非阻断，不判 ❌）

**manifest.json 的 `bytes` 字段与 `sha256` 不一致**：`desktop/renderer/manifest.json` 中四个文件的 `sha256` 全部保持不变（core.js 仍为 `dd49a782…`），但 `bytes` 全部变小（如 core.js 55865→54620，app.js 85631→83555）。sha256 相同则字节数必然相同，推测是 `bytes` 按本地工作区文件（CRLF 行尾）统计、而 `sha256` 按规范化的源内容计算所致。**不影响冻结判定与任何审查结论**（以 sha256 为准），建议后续统一 manifest 字段口径，避免误导后续审查者。

## 附：desktop/renderer/ 范围内完整变更清单（供交叉核对）

| 文件 | 变更 | 归属 |
|---|---|---|
| renderer/index.html | +6（i18n/guide 脚本注入产物） | adapter 注入 |
| renderer/app.css | +126（D-1 两行 + PR #10 样式追加） | 第 2 项 |
| renderer/guide.js | +279（新文件） | 第 3 项 |
| renderer/i18n/*（4 文件） | +1161（新文件，源分支原样 + 34 个 p10.* key） | 第 4 项 |
| renderer/manifest.json | 仅 generatedAt 时间戳 + bytes 字段（sha256 全不变） | 观察项 |
| renderer/core.js、styles.css、desktop-ui.js、led-pitch.js、app.js | 零改动 | — |
