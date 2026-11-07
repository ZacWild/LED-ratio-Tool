# S10-R8 · v1.3.0 新增功能英文翻译 · 实施蓝图与技术路径验证

**状态**：BLOCKED-CONTEXT（当前会话上下文余量不足以完成全部 ~55 处 key 化与全套验证；技术路径已原型验证可行，蓝图落盘供完整实施）
**已提交原型**：`led-pitch.js` 的 `msg(key, fallback)` 回退模式 + 3 个 key（双包 381/381 parity PASS、test:pitch 26/26 实测不破断言）

## 一、技术路径（已验证）

```js
// led-pitch.js（纯计算模块，加载早于 i18n，函数运行时才调 t()）
function msg(key, fallback) {
  var g = (typeof global !== 'undefined') ? global : window;
  return (g && g.LedI18N && typeof g.LedI18N.t === 'function') ? g.LedI18N.t(key) : fallback;
}
// message: msg('pitch.err.positive', 'P 值必须大于 0 mm')
```
- **验证结论**：node --test 无 LedI18N → 回退原文 → `/未配置/ /有限数值/` 正则断言 26/26 不破；运行时 en-US → 英文。
- **desktop-ui.js 渲染层**：同一模式（运行时 LedI18N 必在）；语言切换后需触发重刷——**零改动方案**：guide.js 的 `onLocaleChange` 回调里 `dispatchEvent(new CustomEvent('led:pitch'))` → 既有 `schedulePitchRefresh()` 刷新两个结果模块；设置行由 guide 轮询重挂（已在轮询内调 `syncPitchSettingsUI` 之外的部分）——注意 `syncPitchSettingsUI` 的状态胶囊文案需另行 key 化。
- **adapter 静态注入文案**（HINT_PX/HINT_DEFAULT/FAQ q3 已在 a3 修复覆盖）：**零 adapter 改动**，text-map MAP 增条目（原值=注入中文）+ 双包英文值 → 通道 A 翻译。
- **禁止**：text-map 打标动态节点（一次性打标，反模式 1）；MO 微任务内挂载（崩溃实证）。

## 二、key 清单（按文件，行号为 6aaeca9 基准）

### led-pitch.js（~25 处 → `pitch.*` 域，已完成 3）
| 行 | 原文 | 建议 key |
|---|---|---|
| 99 | 未配置（fmtPitch） | pitch.msg.unconfigured ✅ |
| 112 | 未配置 | （同上）✅ |
| 116 | P 值必须是有限数值（不接受 NaN / Infinity） | pitch.err.finite.short ✅ |
| 119 | P 值必须大于 0 mm | pitch.err.positive ✅ |
| 124/128/133/137 | 其余 4 条 parsePitch 错误 | pitch.err.type/format/precision/finite |
| 274/280/285 | physicalToPixels reason ×3 | pitch.reason.* |
| 292/421/432/445 | 理论 P 值估算 | pitch.source.theory |
| 336/340/343 | parseCabinetField 校验 ×3 | cabinet.err.* |
| 363/394/422/446 | 箱体像素矩阵计算 | cabinet.source.matrix |
| 375/379 | 箱体宽/高不一致警告 | cabinet.warn.w / h |
| 426 | 箱体参数非法，无法比对 | cabinet.reason.invalid |

### desktop-ui.js（渲染区 ~41 处 → `ui.pitch.*` / `ui.cabinet.*` 域）
- renderNativeModule：结果来源/物理宽×高/当前采用的 P 值/理论水平·垂直像素数量/理论整数分辨率估算/理论总像素数量/实际宽高比/整数化误差/数据语义 + 两段 hint/notice（~12）
- renderCabinetModule：结果来源/拼接总宽高/水平·垂直总像素/实际拼接分辨率/实际拼接比例 + 差异表 7 行 + 警告列表（~20）
- buildPitchSettingsRow：标题「LED 像素间距 P」/状态「未配置」/aria-label/placeholder/hint（~6）
- syncPitchSettingsUI：状态胶囊「已配置 P{x}（{x} mm）」/「未配置」（~3，注意含插值）

### text-map.js + adapter 静态注入（~6 条 → text-map MAP）
- HINT_DEFAULT（单位切换只改变显示值…）/ HINT_PX（PX 模式用于根据输入的像素宽高计算比例…）
- FAQ q3 问句、FAQ_PATCH a3 ✅（已对齐）、changeUnit 的未配置 notice（此条经 snapshot.notice → 属 led-pitch 动态）

## 三、实施批次建议（下一会话照单执行）

1. 批次 A：led-pitch.js 剩余 ~22 处（msg() 模式）→ `npm run test:pitch`（26/26，fallback 保护）+ suite 93/93（zh 原文不变）
2. 批次 B：desktop-ui.js 渲染区 ~41 处（同模式）→ suite 93/93 + pitch-dom 18/18
3. 批次 C：guide.js onLocaleChange 补 `led:pitch` 事件 + syncPitchSettingsUI 状态胶囊 key 化 → ui-verify + 语言切换场景
4. 批次 D：text-map MAP 增静态注入条目 + 双包 → pitch-dom（PX-09 类提示断言）+ 残留扫描
5. 验收：双包 parity（vm 加载比对）→ en-US 模式全页中文残留扫描（DOM textContent 中文正则，排除 `LedI18NStatus` 等）→ 四档截图 → suite/pitch-dom/pitch/26 复跑 → 视觉三档差异（不刷基线）

## 四、本轮已完成

- 技术路径原型（msg 回退模式）实测：26/26 不断言 + 双包 381/381 parity PASS
- 本蓝图（key 清单 + 行号 + 批次 + 验收清单）
- **S10-R8 判定：BLOCKED-CONTEXT**（上下文余量不足，非环境/技术阻断；路径已验证，照蓝图可实施）
