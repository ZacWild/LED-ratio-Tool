# 高 DPI 真实验收指引（TK-148 · 125% / 150%）

> **本文件回答一件事**：在**真实 Windows 系统缩放**下，桌面版在 100% / 125% / 150% 三档是否可用、由谁在什么环境怎么验、验完怎么还原。
> 配套脚本：`test/dpi-acceptance.mjs`（判定逻辑，勿改）；一键入口：`test/dpi-run.cmd`。
>
> 🔴 **本文件不代替验收结论**。125% / 150% 当前状态为 **BLOCKED（环境未就绪）**，见 §1 与 §8。
> 🔴 **禁止用任何模拟手段冒充真实缩放**：`setZoomFactor`（页面缩放）、`--force-device-scale-factor`、
> CDP 视口模拟、`webContents.setZoomLevel` 一律**不构成** DPI 验收。脚本的退出码 3 就是为此设的闸。

---

## 1. 结论速览（截至本轮实测）

| 档位 | 状态 | 实测结果 | 报告文件 | 说明 |
|---|---|---|---|---|
| **100%** | ✅ **已实测通过** | `scaleFactor=1`，**21/21 通过，0 失败** | `test/reports/dpi-acceptance-100.json` | 本机当前档位，本轮实跑 |
| **125%** | ⛔ **BLOCKED（环境未就绪）** | 无法切换 → 未执行 | ——（不得产出） | 阻塞点：需人工切换系统缩放（可能要注销重登） |
| **150%** | ⛔ **BLOCKED（环境未就绪）** | 无法切换 → 未执行 | ——（不得产出） | 同上 |

**阻塞点原话（写进台账）**：
> 125% / 150% 需**人工**在「设置 → 系统 → 显示 → 缩放」切换到目标档位（必要时注销并重新登录）后，再执行本指引 §4 的命令。
> 本轮执行环境为无人交互会话，已尝试 §8 列出的两种无交互切换手段，均**未能**让新启动的 Electron 报告目标 `scaleFactor`，故**按 BLOCKED 登记，不得记为通过**。

---

## 2. 判定口径（先看这一节，再动手）

### 2.1 唯一环境前置

```
Electron: screen.getAllDisplays()[0].scaleFactor === 期望百分比 / 100
```

- 等于 → 进入检查项判定（退出码 0 / 1）。
- **不等于 → 退出码 3（环境前置不满足）**：既不算通过、也不算失败，**不产生该档的验收结论**。
- 参考量：`window.devicePixelRatio` 应同值；客户区与 `BrowserWindow.getContentSize()` 一致。

### 2.2 退出码含义

| 退出码 | 含义 | 验收动作 |
|---|---|---|
| `0` | 该档 **全部检查项通过** | 记「通过」，归档报告 JSON |
| `1` | 有检查项**不通过**（真实缺陷） | 按 P0–P3 分级登记缺陷，不得改阈值/改断言迁就 |
| `3` | **环境前置不满足**（实际缩放 ≠ 期望 / Electron 不可用 / playwright-core 缺失） | 不算结论。先修环境再跑，**不得**用模拟手段绕过 |

### 2.3 检查项（7 项 × 3 个客户区尺寸 = 21 项/档）

三个客户区尺寸：`1440×900`（三栏）、`1200×800`（两栏）、`1024×680`（纵向堆叠）。

| 检查项 ID 后缀 | 断言内容 | 通过标准 |
|---|---|---|
| `-overflow` | 文档级横向滚动 | `scrollWidth === clientWidth`（无横向溢出/滚动条） |
| `-hit` | 主要控件有效命中区（含内边距/伪元素扩展） | 实测 ≥ **32×32** CSS px |
| `-focus` | 关键控件可聚焦 | `#input-width` `#input-height` `#btn-swap` `#btn-copy-resolution` `#btn-copy-full` `#ft-settings` 全部可聚焦 |
| `-scroll` | 滚动归属 | 文档不滚动（`scrollHeight === clientHeight`），A 栏 / C 栏各自可滚 |
| `-font` | 关键文本与图标实测尺寸 | 比例文本 40px/48px JetBrains Mono；图标 14×14（**读 `getComputedStyle` / `getBoundingClientRect`，不看 `el.style`**，DEC-18） |
| `-settings` | 根设置入口 | 根按钮不可见（桌面版走状态栏入口） |
| `-tier` | 高度档位判定 | `data-height-tier` ∈ {standard, compact, tight} 且与客户区高度自洽 |

> 高 DPI 下**不做**像素 diff：像素基线只在 100% 缩放下有意义（见 `test/visual-regression.mjs` 头部说明 TK-38）。
> 高 DPI 的验收对象是**布局/命中区/尺寸自洽**，不是像素。

---

## 3. 本机原始状态（动手前必读，还原时对照）

| 项 | 值 |
|---|---|
| OS | Windows 11 家庭版 中文版，build **26300** |
| 显示器 | **LEN P27q-10**（单显示器，面板 2560×1440） |
| 系统缩放 | **100%** |
| Electron `scaleFactor` | **1** |
| `devicePixelRatio` | **1** |
| `HKCU\Control Panel\Desktop\Win8DpiScaling` | **0** |
| `HKCU\Control Panel\Desktop\LogPixels` | **未设置（不存在）** |
| `PerMonitorSettings\<LEN61A8…3E^582A99…>` `DpiValue` | **0** |
| `PerMonitorSettings\<LEN61A8…74^10E5B2…>` `DpiValue` | **1**（历史遗留，非当前显示器） |
| `PerMonitorSettings\<LEN61A816843009…>` `DpiValue` | **0** |

> ⚠️ **不要用改注册表代替系统设置**。`PerMonitorSettings\DpiValue` 写入后**必须注销重登**才可能生效，
> 且失败时极易留下半生效状态（本轮已实测：写入后广播 `WM_SETTINGCHANGE` 无效，见 §8）。
> 验收一律走「设置」应用，注册表只用于**核对**与**还原核对**。

---

## 4. 每档执行命令

前提：**任何时候只能有一个 Electron 实例**（单实例锁）。执行前确认没有残留的桌面版进程与之前的测试进程。

```bat
:: 在仓库根或任意目录均可（脚本内部按自身位置定位，不依赖 cwd）
desktop\test\dpi-run.cmd --expect=100
desktop\test\dpi-run.cmd --expect=125
desktop\test\dpi-run.cmd --expect=150
```

等价的原生命令（与上表完全一致，仅便于排查）：

```bat
cd /d <repo>\desktop
node test\dpi-acceptance.mjs --expect=100
node test\dpi-acceptance.mjs --expect=125
node test\dpi-acceptance.mjs --expect=150
```

报告输出：`desktop\test\reports\dpi-acceptance-<pct>.json`
（`<pct>` ∈ `100` / `125` / `150`；含 `meta.expectedPercent`、`meta.realScaleFactor`、`meta.devicePixelRatio`、`meta.display` 与 21 条 `results`）

> 归档要求：三档报告 **必须来自三次独立执行**，不得把 100% 的报告复制成 125% 的。`meta.realScaleFactor` 是唯一凭据。

---

## 5. 切换步骤（验收人操作顺序）

> 每切一次档位都要走完整流程；**切档 → 注销 → 重探 → 跑验收 → 切回**。

1. **收尾先断电**：确认没有 Electron 实例在跑（任务管理器看 `electron` / `LED-ratio`）。
2. 打开 **设置 → 系统 → 显示 → 缩放**（Scale）。
3. 选目标档位：**125%**（或 **150%**）。
   - 若该档位不在下拉列表里：说明显示器 EDID 未报告该档，改用「自定义缩放」输入 125 / 150。
4. **按系统提示注销**：若提示「需要注销才能应用」，必须 开始 → 用户头像 → **注销** → 重新登录。
   （Windows 11 多数情况可即时生效；但**以 §6 的探针结果为准**，不以「看起来变大了」为准。）
5. **跑探针确认**（见 §6），必须打印 `scaleFactor=1.25` 或 `1.5`。
6. 执行 §4 对应 `--expect` 命令，记录退出码 / 通过项数 / 失败项原文 / 报告文件名。
7. 切回 **100%**，按 §7 还原并复核。
8. 把结果填进 §9 的记录表。

---

## 6. 生效判据（唯一）：探针

**判据只有一条**：新启动的 Electron 报告的 `screen.getAllDisplays()[0].scaleFactor` 等于目标值。

```bat
cd /d <repo>\desktop
node -e "const p=require('./node_modules/playwright-core');(async()=>{const e=Object.assign({},process.env);delete e.ELECTRON_RUN_AS_NODE;const a=await p._electron.launch({args:['.'],cwd:process.cwd(),env:e,timeout:60000});const w=await a.firstWindow();await w.waitForLoadState('domcontentloaded');await w.waitForTimeout(1200);const i=await a.evaluate(async({screen})=>({sf:screen.getAllDisplays()[0].scaleFactor,size:screen.getAllDisplays()[0].size}));const r=await w.evaluate(()=>({dpr:window.devicePixelRatio}));console.log('scaleFactor='+i.sf+' devicePixelRatio='+r.dpr+' size='+JSON.stringify(i.size));await a.close();})();"
```

期望输出示例（125%）：

```
scaleFactor=1.25 devicePixelRatio=1.25 size={"width":2560,"height":1440}
```

判读：
- `scaleFactor` **等于**目标 → 环境就绪，可跑 §4。
- `scaleFactor` 仍为 `1` → 切换**未生效**。**停止**，不要跑 125/150 的验收（会拿到退出码 3，且容易被人误读成"通过/失败"）。
- `scaleFactor` 与目标差一档（如 1.5）→ 切错了档，按实际值改 `--expect` 或重切。

---

## 7. 还原步骤（硬性，失败必须上报）

1. 设置 → 系统 → 显示 → 缩放 → **100%**；如需注销则注销重登。
2. 跑 §6 探针，确认：`scaleFactor=1 devicePixelRatio=1`。
3. 核对注册表与本机原始状态（§3）一致：
   - `Win8DpiScaling=0`、`LogPixels` 不存在
   - 三个 `PerMonitorSettings` 键的 `DpiValue` 分别为 **0 / 1 / 0**
4. 若探针仍不是 1，或注册表与 §3 不一致：**立即如实上报**（说明卡在哪一档、已尝试什么、当前实测值），不得以"应该没问题"收尾。

---

## 8. 本轮已尝试的「无交互切换」手段与失败证据（供下一位验收人省时间）

| # | 手段 | 具体做法 | 结果 | 判据 |
|---|---|---|---|---|
| a | `SystemParametersInfoW(SPI_SETLOGICALDPIOVERRIDE=0x009F, …)` | Python 3.13 ctypes，三种调用变体：① `uiParam=0, pvParam=(void*)1, SPIF_UPDATEINIFILE\|SPIF_SENDCHANGE` ② `uiParam=1, pvParam=NULL` ③ `uiParam=0, pvParam=&DWORD(1), fWinIni=0` | **均返回 TRUE（1），但无效** | 新进程 `GetDpiForSystem()=96`；新启 Electron `scaleFactor=1` |
| b | 改 `HKCU\Control Panel\Desktop\PerMonitorSettings\…\DpiValue` = 1（125%）+ 广播变更 | 改写两个 `DpiValue=0` 的键（含当前显示器候选），Python `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Desktop"/NULL, …)` 均返回 1 | **无效**，且注册表被系统保持为写入值（需手工还原） | 同上：`scaleFactor=1` |

结论：本机（Win11 build 26300）**DPI 变更需要交互式「设置」应用操作，且很可能需要注销重登**。
无交互路径在当前权限/会话下不可行 → 按 BLOCKED 登记，**不做任何降级伪造**（未使用 `setZoomFactor` / `--force-device-scale-factor`）。

> 本轮注册表已**完整还原**至 §3 原始值，并已用探针复核 `scaleFactor=1`（详见交付回传）。

---

## 9. 验收记录表（验收人填写，一次一行）

| 日期 | 档位 | 执行人 | 探针 `scaleFactor` | 退出码 | 通过项/总项 | 失败项原文 | 报告文件 | 已还原到 100% |
|---|---|---|---|---|---|---|---|---|
| 2026-11-02 | 100% | 凌无缺（QA） | 1 | 0 | **21/21** | 无 | `dpi-acceptance-100.json` | ✅ 全程 100%，无需还原 |
| | 125% | | | | | | `dpi-acceptance-125.json` | ☐ |
| | 150% | | | | | | `dpi-acceptance-150.json` | ☐ |

---

## 10. 未覆盖与已知风险

1. **125% / 150% 未实测**：本文件只提供可执行路径，不构成该两档的验收结论。发布前必须补齐。
2. **多显示器 / 混合 DPI 未覆盖**：本轮为单显示器。混合 DPI 下窗口跨屏拖动会触发 `DPI changed` 事件，
   现有脚本未覆盖（属后续 TK）。
3. **Windows 缩放档位存在「非 25% 步进」**（如 175%、225%）：本工程只承诺 100 / 125 / 150 三档，
   其余档位出现布局问题按新缺陷登记，不得据此回退已通过的档位。
4. **注销重登会重置会话内状态**：`settings` 与 `sessionData` 在注销后仍保留（落盘），
   验收前建议记录一份「默认状态」快照，避免把"用户残留设置"误判成 DPI 缺陷。
