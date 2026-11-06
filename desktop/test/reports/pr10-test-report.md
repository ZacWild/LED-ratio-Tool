# PR #10 · 测试报告

**执行时间**：2026-11-06 23:30 ~ 2026-11-07 01:55（UTC+8）
**被测对象**：`feature/desktop-v1.3.0-pr10-guide` @ `62b472e`（基线 `origin/main` `68b24d1`）
**环境**：Windows · Electron 45.1.0 · Node 22.22.2 · 单台 100% 缩放显示器

## 1. 既有基线回归（全部本轮实际执行）

| # | 套件 | 历史基线 | 本轮 | 结果 |
|---|---|---:|---|---|
| 1 | Pitch Unit | 26 | **26/26** | ✅ |
| 2 | Settings Compatibility | 13 | **13/13** | ✅ |
| 3 | Pitch DOM 探针 | 18 | **18/18** | ✅ |
| 4 | Desktop E2E | 93 | **93/93**（console 0 / pageerror 0） | ✅ |
| 5 | HTML E2E | 85 | **85/85** | ✅ |
| 6 | Core Unit | 64 | **64/64** | ✅ |
| 7 | Security Audit | 47 | **47/47** | ✅ |
| 8 | PX Probe | 10 | **10/10** | ✅ |
| 9 | Differential | 200 | **200/200**（G-03 门禁 PASS） | ✅ |

## 2. S10-7 专项测试

### 2.1 P 值计算链实测复现（`p10-pitch-chain-probe.cjs`）
10500×3670 mm 下 P1.667→P1.86→P2→P2.5→P3 逐档真实点击：理论分辨率每次实时变化、与 `physicalMm / P` 完全一致；px 链 converted→direct 来源切换正确、手动 PX 切 P 不被覆盖、清空 P 无陈旧结果。**结论：任务书 3.1 缺陷前提不成立**（详见 implementation-report §2）。

### 2.2 新增模块验证（`p10-ui-verify.cjs`，24/24）
i18n 双包 376 key 完整加载、指南四层挂载、P 值说明 6 段、来源标识随 `pxOrigin` 切换、语言切换（zh↔en）不刷新页面/不丢输入值/不改比例结果/不改 P 值/文案复原、四档无横向溢出、1440/1600 D-1 表格未溢出、零 console/pageerror。

### 2.3 双包 Key 一致性
`vm` 实际加载两语言包：**376 / 376，集合完全一致，无缺失无重复**（`LedI18NStatus.complete = true` 同证）。

## 3. 布局回归的发现与修复（如实记录）

| 阶段 | 现象 | 判别 | 处置 |
|---|---|---|---|
| 1 | TC-H-14 FAIL（92/93） | 徽标挂 C 栏时稳定 FAIL；基线 stash 复现 PASS；移除后 PASS | 徽标移出 C 栏 → TC-H-14 恢复 |
| 2 | TC-H-11 FAIL（top=-117 确定性） | 徽标 `display:none` 后 **93/93**；指南收纳档隐藏无效 → 徽标（A 栏流内）为因 | 徽标改 header 内 absolute 悬浮（零布局影响）→ **93/93** 终验 |

判别脚本与数据：`pr10-visual-evidence/p10-h14-ab.cjs`、`p10-tier-scroll.cjs`。

## 4. 视觉三档（对照原基线，未刷新）

| 档位 | 差异像素 | 归因 |
|---|---|---|
| 1440×900 | 41,280 / 1,296,000 | `#p10-guide` 16,217 + `#stage` 10,230 + `.p10-list__item` 6,490 + `.panel__title` ⓘ 2,472… |
| 1200×800 | 3,968 / 960,000 | 同上（指南折叠态） |
| 1024×680 | 3,926 / 696,320 | 同上 |

**判定：预期 UI 变更（新增使用指南与 ⓘ 提示）**；`基准更新 = false`（未刷新、未放宽阈值），基线刷新需授权后执行。

## 5. 红线复核

- `src/core.js` / `desktop/renderer/core.js` SHA-256 = `dd49a7829618f77da4c07baafd4e5d6f08e23f8577d074c5500d006a011bcc26` ✅
- HTML 产物 `d016a66a…` / 187,852 B，`verify:reproducible` OK ✅
- 根 `index.html` / `src/app.js` / `src/styles.css` 零改动 ✅
- Adapter 幂等（两次 sync 四产物哈希一致）✅
- 无新增网络依赖（guide.js 零请求）✅
- settings schemaVersion 保持 1 ✅
