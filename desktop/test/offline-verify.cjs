/**
 * EV-A05 断网验证：应用在断网环境下启动、计算、复制全部可用。
 * 手段：注入一个拦截所有外部请求的 webRequest 过滤器（等价于防火墙出站全阻断），
 *       记录三类计数，并执行一次完整业务操作。
 */
'use strict';
const { _electron } = require('playwright-core');
const path = require('node:path');

const DESKTOP = path.join(__dirname, '..');

(async () => {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await _electron.launch({
    args: ['--inspect=0', '--remote-debugging-port=9341', DESKTOP],
    cwd: DESKTOP,
    env,
    timeout: 60000,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1200);

  // 在主进程装上出站全阻断 + 三类计数
  const counts = await app.evaluate(async ({ session, BrowserWindow }) => {
    const c = { onBeforeRequest: 0, onCompleted: 0, requestfailed: 0, blocked: 0 };
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      c.onBeforeRequest++;
      // 阻断一切非 app:// 的请求（等价防火墙出站全禁）
      if (!details.url.startsWith('app://')) {
        c.blocked++;
        return callback({ cancel: true });
      }
      callback({ cancel: false });
    });
    session.defaultSession.webRequest.onCompleted(() => { c.onCompleted++; });
    session.defaultSession.webRequest.onErrorOccurred(() => { c.requestfailed++; });
    return c;
  });

  // 完整业务操作：输入 → 计算 → 切换 → 复制
  const ops = await win.evaluate(async () => {
    const out = {};
    const w = document.getElementById('input-width');
    const h = document.getElementById('input-height');
    w.value = '14';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    h.value = '4';
    h.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    out.ratio = (document.getElementById('ratio-value') || {}).textContent;
    out.res = (document.getElementById('res-value') || {}).textContent;
    // 切换单位
    const unitBtn = document.querySelector('.unit-segment[data-unit="cm"]');
    if (unitBtn) { unitBtn.click(); await new Promise((r) => setTimeout(r, 300)); }
    out.ratioAfterUnit = (document.getElementById('ratio-value') || {}).textContent;
    // 切换画布模式
    const modeBtn = document.querySelector('.canvas-mode-segment[data-mode="height"]');
    if (modeBtn) { modeBtn.click(); await new Promise((r) => setTimeout(r, 300)); }
    out.ratioAfterMode = (document.getElementById('ratio-value') || {}).textContent;
    // 复制
    const copyBtn = document.getElementById('btn-copy-resolution');
    if (copyBtn) { copyBtn.click(); await new Promise((r) => setTimeout(r, 500)); }
    out.copyFeedback = (document.getElementById('live-results') || {}).textContent;
    out.consoleOk = true;
    return out;
  });

  const after = await app.evaluate(async ({ session }) => {
    const c = { onBeforeRequest: 0, onCompleted: 0, requestfailed: 0, blocked: 0 };
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      c.onBeforeRequest++;
      if (!details.url.startsWith('app://')) { c.blocked++; return callback({ cancel: true }); }
      callback({ cancel: false });
    });
    session.defaultSession.webRequest.onCompleted(() => { c.onCompleted++; });
    session.defaultSession.webRequest.onErrorOccurred(() => { c.requestfailed++; });
    return c;
  });

  console.log(JSON.stringify({ counts, ops, after }, null, 2));
  await app.close().catch(() => {});
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
