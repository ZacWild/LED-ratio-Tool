/**
 * LED-ratio-Tool 桌面版 · CSP 唯一来源
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-11 —— app:// 协议；不启用 bypassCSP；connect-src 'none' 保持
 *   DEC-17 —— CSP 必须两阶段；最终测试必须检查 CSP 报错 / 实际计算样式 / UI 截图
 *   SEC-16 —— 精确最小放宽
 *   SEC-17 —— 全工程只能有一处 CSP 定义
 *   SEC-35 —— CSP 响应头必须与响应体同时构造
 *
 * 🔴 全工程唯一 CSP 定义点。任何其它文件出现 "Content-Security-Policy"
 *    字面量都会被 security-audit.mjs 判为失败。
 */

/**
 * 阶段一：有限的内联样式例外，保证界面功能完整。
 *
 * 为什么需要 'unsafe-inline'：
 *   实测 index.html 有 31 处 style="..."，其中 14 处是 display:none 的初始态。
 *   CSP 的 style-src 同时约束 <style> 块与 style= 属性式内联 —— 若写
 *   style-src 'self'（不含 unsafe-inline），这 31 处会全部失效 → 字段显隐
 *   失效 → 界面直接破版。
 *
 * 最小化边界：
 *   · style-src 保留 'self' → 远程样式表仍被拒
 *   · style-src-attr 'unsafe-inline' → 只放开属性式内联，不放开远程样式表
 *   · script-src 不含 unsafe-inline / unsafe-eval → 脚本仍严格封闭
 *   · connect-src 'none' → 零网络请求（含对本机 app:// 的 fetch）
 *   · 不含 sandbox 指令 → 避免破坏 preload 与剪贴板
 *   · 不含 report-uri / report-to → 避免产生网络出口
 */
const CSP_STAGE_1 = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "media-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "manifest-src 'none'",
].join('; ');

/**
 * 阶段二：31 处静态内联样式迁移到 app.css 后收紧。
 *
 * 前置条件（缺一不可）：
 *   ① 31 处全部迁完（grep style="..." 计数为 0）
 *   ② app-ready 引导机制已实现（14 个初始隐藏元素 × 5 状态断言通过）
 *   ③ CSSOM 赋值不受 CSP 影响（setAttribute('style') 命中 0）
 *   ④ 三尺寸 × 关键状态截图 diff = 0
 *
 * 🔴 阶段一与阶段二必须与迁移在同一轮提交内完成，不允许出现
 *    "先收紧、后迁移"的中间态 —— 那会让界面破版。
 */
const CSP_STAGE_2 = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "media-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "manifest-src 'none'",
].join('; ');

/**
 * 当前启用的阶段。
 * P4-A 只启用阶段一；阶段二属 P4-B/P5（DEC-17 两阶段计划）。
 */
const ACTIVE_STAGE = 1;

/**
 * @returns {string} 当前生效的 CSP 头值
 */
function buildCSP() {
  return ACTIVE_STAGE === 2 ? CSP_STAGE_2 : CSP_STAGE_1;
}

module.exports = { buildCSP, CSP_STAGE_1, CSP_STAGE_2, ACTIVE_STAGE };
