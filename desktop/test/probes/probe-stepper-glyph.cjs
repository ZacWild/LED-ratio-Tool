/**
 * LED-ratio-Tool 桌面版 · 步进按钮符号位置取证探针
 * ============================================================================
 * 🔴 用途：量化 +/− 视觉符号在 32×32 实体按钮内的**实际渲染位置**，
 *    为「符号视觉居中」补丁提供改前/改后对照证据。
 *
 * 测量口径（全部实测，不推算）：
 *   ① 按钮 getBoundingClientRect（应为 32×32）
 *   ② ::before 计算样式（position/inset/width/height/border/z-index）
 *      —— 用于暴露 styles.css → app.css 级联残留
 *   ③ 符号「墨迹」像素包围盒：对按钮截图解码，取亮度 > 100 的像素
 *      （背景/边框亮度 ≤ 60，符号 #E8EAED ≈ 234），计算墨迹中心与按钮中心偏差
 *   ④ 有效命中区：elementFromPoint 逐像素扫描（与 desktop-suite hitAreaAudit 同口径）
 *
 * 用法：
 *   node test/probes/probe-stepper-glyph.cjs
 * 产物：test/reports/stepper-glyph.json + test/shots/stepper-glyph/*.png
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..', '..');
const OUT_JSON = path.join(DESKTOP, 'test', 'reports', 'stepper-glyph.json');
const OUT_SHOTS = path.join(DESKTOP, 'test', 'shots', 'stepper-glyph');

const PW_PATH = path.join(DESKTOP, 'node_modules', 'playwright-core');

(async () => {
  const pw = require(PW_PATH);
  const { _electron: electron } = pw;

  fs.mkdirSync(OUT_SHOTS, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: ['--inspect=0', DESKTOP],
    cwd: DESKTOP,
    env,
    timeout: 60000,
  });
  const win = await app.firstWindow({ timeout: 30000 });
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1200);

  const IDS = ['step-width-minus', 'step-width-plus', 'step-height-minus', 'step-height-plus'];
  const results = [];

  for (const id of IDS) {
    // 让 .stepper 可见：focus 所在输入框触发 :focus-within（opacity 0→1）
    await win.evaluate((bid) => {
      const btn = document.getElementById(bid);
      const wrap = btn.closest('.input-wrap');
      const input = wrap ? wrap.querySelector('.input') : null;
      if (input) input.focus();
    }, id);
    await win.waitForTimeout(200);

    const geo = await win.evaluate((bid) => {
      const el = document.getElementById(bid);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el, '::before');
      const bcs = getComputedStyle(el);
      return {
        button: { x: r.x, y: r.y, w: r.width, h: r.height },
        before: {
          content: cs.content,
          position: cs.position,
          top: cs.top, left: cs.left, right: cs.right, bottom: cs.bottom,
          width: cs.width, height: cs.height,
          borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle,
          zIndex: cs.zIndex,
        },
        buttonOutline: bcs.outlineWidth + ' ' + bcs.outlineStyle + ' ' + bcs.outlineColor,
        center: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      };
    }, id);

    // 有效命中区（与 desktop-suite hitAreaAudit 同口径）
    const hit = await win.evaluate((bid) => {
      const e = document.getElementById(bid);
      const rr = e.getBoundingClientRect();
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      const x0 = Math.floor(rr.left) - 16, x1 = Math.ceil(rr.right) + 16;
      const y0 = Math.floor(rr.top) - 16, y1 = Math.ceil(rr.bottom) + 16;
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const hitEl = document.elementFromPoint(x, y);
          if (hitEl && (hitEl === e || e.contains(hitEl))) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      return { w: maxX - minX + 1, h: maxY - minY + 1 };
    }, id);

    // 截图 + 墨迹分析
    const el = win.locator(`#${id}`);
    const shot = path.join(OUT_SHOTS, `${id}.png`);
    await el.screenshot({ path: shot });

    results.push({ id, ...geo, hitArea: hit, shot });
  }

  await app.close();

  // 墨迹分析（decodePng：8bit RGBA）
  const { decodePng } = require(path.join(DESKTOP, 'test', 'harness', 'png-lib.cjs'));
  for (const r of results) {
    const img = decodePng(fs.readFileSync(r.shot));
    const scale = img.width / r.button.w; // 处理 DPI 缩放
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, count = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const lum = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
        if (lum > 100) {
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (count === 0) { r.ink = { found: false }; continue; }
    const inkCx = ((minX + maxX) / 2) / scale;
    const inkCy = ((minY + maxY) / 2) / scale;
    r.ink = {
      found: true,
      pixels: count,
      bboxPx: { minX, minY, maxX, maxY },
      centerInButtonCoords: {
        x: +(inkCx).toFixed(2),
        y: +(inkCy).toFixed(2),
      },
      offsetFromButtonCenter: {
        x: +(inkCx - r.button.w / 2).toFixed(2),
        y: +(inkCy - r.button.h / 2).toFixed(2),
      },
    };
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    method: '真实 BrowserWindow + getBoundingClientRect + ::before 计算样式 + 截图墨迹包围盒 + elementFromPoint 命中区扫描',
    glyphOffsetTolerancePx: 1.5,
    results,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2) + '\n');
  console.log(`[stepper-glyph] 已写 ${OUT_JSON}`);
  for (const r of results) {
    const off = r.ink && r.ink.found ? `offset=(${r.ink.offsetFromButtonCenter.x}, ${r.ink.offsetFromButtonCenter.y})px` : 'ink not found';
    console.log(`  ${r.id}: button ${r.button.w}x${r.button.h} | hit ${r.hitArea.w}x${r.hitArea.h} | ::before ${r.before.position}@${r.before.top},${r.before.left} ${r.before.width}x${r.before.height} | ${off}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('[stepper-glyph] 失败:', e);
  process.exit(1);
});
