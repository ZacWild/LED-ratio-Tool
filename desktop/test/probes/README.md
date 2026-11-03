# test/probes/ · 一次性取证探针（历史诊断脚本）

> 本目录存放桌面版开发过程中的**取证用一次性探针**（diagnostic probes）。
> 它们**不属于** `npm run` 正式门禁（正式测试见仓库根 `desktop/README.md` §测试门禁），
> 也不被 CI 调用；其价值在于：**结论可复现** —— 报告中的每个根因判断
> 都能通过对应探针重新实测验证。

## 与正式测试的关系

| 类别 | 位置 | 调用方式 |
|---|---|---|
| 正式自动化测试 | `desktop/test/*.mjs` / `*.cjs`（根层） | `npm run test:*`，CI 门禁 |
| 可复用验收工具链 | `desktop/test/dpi-*.cjs`、`dpi-run.cmd` 等 | DPI 验收流程（`desktop/DPI-ACCEPTANCE.md`） |
| **一次性取证探针** | **`desktop/test/probes/`（本目录）** | `node` / `electron` 手动执行 |
| 验收证据 | `desktop/test/reports/` | 由上述脚本产出 |

## 探针清单（按取证专题分组）

### DPI / 窗口几何取证（P7-DPI-09 根因链）

| 探针 | 轮次 | 用途 | 关键结论 |
|---|---|---|---|
| `probe-frame-delta.cjs` | 第一轮 | 原生非客户区增量（frameDelta）实测 | 100% 恒 16×65，与客户区尺寸无关 |
| `probe-window-budget.cjs` | 第二轮 | 方案 A（窗口预算）实现细节 | 收敛与多显示器定位行为 |
| `probe-min-size.cjs` | 第三轮 | 最小尺寸口径 | `setMinimumSize` 换算口径 |
| `probe-win-limit.cjs` | 第四轮 | Windows 自动限位口径 | 限位与 workArea 的关系 |
| `probe-min-visible.cjs` | 第五轮 | 最小客户区「显示态 vs 隐藏态」 | 隐藏态测量陷阱 |
| `probe-tcdp-regression.cjs` | v2 · 移屏对照 | TC-DP 回归根因 | 偏差恒定 +2/+8，与屏无关 |
| `probe-min-track-contrast.cjs` | v3 · 对照 | min track 口径对照 | 两口径不相等 |
| `probe-min-track-calibrate.cjs` | v4 · 标定 | min track → 客户区下限标定 | 15×64 ≠ 12×63（根因） |
| `probe-min-track-search.cjs` | v5 | min track 精确命中搜索 | 单轴扫描 |
| `probe-min-track-search2.cjs` | v6 | 2D 扫描（1034~1039 × 738~745） | 125% 下 best = 1024×682 |
| `probe-min-track-verify.cjs` | v8 · 回归 | 标定修后验证 | 5/5 PASS |
| `probe-min-track-legal.cjs` | v9 | 49 组候选 min track 合法性 | 全部合法不抛错 |
| `probe-dip-rounding.cjs` | v7 | DIP → 物理像素取整映射 | 125% 下请求 H 几乎恒 +1（系统取整） |
| `probe-dpi-multidisplay.cjs` | 复用探针 | **多显示器 DPI-09 四边核验** | 每屏独立判定；`dpi-watch-accept.cjs` 会调用它 |

### 系统环境 / 安装取证（P7-5）

| 探针 | 用途 |
|---|---|
| `probe-displays-now.cjs` | 当前全部显示器的 scaleFactor / bounds / workArea 快照 → `reports/probe-displays-now.json` |
| `probe-uninstall-registry.cjs` | NSIS 安装 → 注册表卸载项 → 卸载清除 全链路实测 |

## 使用约定

- 输出统一落 `desktop/test/reports/`（历史报告原样保留，不覆盖）。
- 这些探针**不改任何系统设置**（观测 / 触发分离纪律见各文件头注释）。
- 路径口径：脚本内以 `__dirname` 向上两级定位 `desktop/`（移入本目录时已同步修正）。
