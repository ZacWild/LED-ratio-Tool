/**
 * LED-ratio-Tool 桌面版 · 视觉回归
 * ============================================================================
 * 依据：
 *   P3-D09 §9.2 A-5（截图作为附件；像素 diff 基线是否纳入 → TK-38）
 *   P3-D09 TK-38（建议纳入，但**只对 3 张基准图**做；高 DPI 下像素 diff 天然不成立 → 只在 100% 缩放下做）
 *   P3-BASELINE DEC-14（以**客户区**尺寸验收）
 *   P3-BASELINE §2 E-3（非客户区增量 16×39 DIP @100%）
 *
 * 三个档位（客户区口径）：
 *   1440×900（三栏）｜1200×800（两栏）｜1024×680（窄窗口纵向堆叠）
 *
 * 🔒 遮罩规则（**有规则、可审计**，不用于掩盖布局错误）：
 *   M1 动态文本区 —— 顶栏版本行（版本号随构建变化）
 *   M2 焦点环 —— 截图前统一 blur，避免焦点态差异
 *   其余**不做任何遮罩**；阈值固定 0.1% 像素差（P3-D09 TK-38 建议值），
 *   🔴 **不得为通过而放宽阈值** —— 放宽阈值须由项目负责人书面批准并登记 TK。
 *
 * 用法：
 *   node desktop/test/visual-regression.mjs            # 与基准比对
 *   node desktop/test/visual-regression.mjs --accept   # 用当前截图更新基准（需显式授权）
 *   node desktop/test/visual-regression.mjs --baseline # 只打印基准信息
 *
 * 退出码：0 = 全部在阈值内；1 = 存在超阈值差异；2 = 基准缺失且未 --accept；3 = 环境阻塞
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP = path.join(__dirname, '..');
const OUT_DIR = path.join(DESKTOP, 'test', 'reports');
const SHOTS_DIR = path.join(DESKTOP, 'test', 'shots');
const BASELINE_DIR = path.join(DESKTOP, 'test', 'baselines', 'shots');

/** 三个档位（客户区尺寸 · DEC-14） */
const SIZES = [
  { name: '1440x900', w: 1440, h: 900, layout: 'three' },
  { name: '1200x800', w: 1200, h: 800, layout: 'two' },
  { name: '1024x680', w: 1024, h: 680, layout: 'stacked' },
];

/* 遮罩 / 阈值 / 像素比对 / 叠加图已提取至共享库 test/harness/visual-lib.cjs */
const {
  MASKS, THRESHOLD_RATIO, CHANNEL_TOLERANCE, comparePixels, blendOverlay,
} = require('./harness/visual-lib.cjs');
const { decodePng, encodePng } = require('./harness/png-lib.cjs');

/* ==========================================================================
   §2 差异区域 DOM 归属
   ========================================================================== */

const DOM_ATTRIB = `
(function (regions) {
  function describe(el) {
    if (!el) return null;
    var sel = '';
    if (el.id) sel = '#' + el.id;
    else if (el.className && typeof el.className === 'string' && el.className.trim()) {
      sel = '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    } else sel = el.tagName ? el.tagName.toLowerCase() : 'unknown';
    var r = el.getBoundingClientRect();
    return {
      selector: sel,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    };
  }
  function semanticAncestor(el) {
    var cur = el;
    for (var i = 0; i < 6 && cur; i++) {
      if (cur.id || (cur.className && typeof cur.className === 'string' && /panel|field|stepper|segmented|badge|warn|stage|canvas|mode-item|table|input|btn|list/.test(cur.className))) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return el;
  }
  return regions.map(function (rg) {
    var cx = rg.x + rg.w / 2, cy = rg.y + rg.h / 2;
    var pts = [[cx, cy], [rg.x + 4, rg.y + 4], [rg.x + rg.w - 4, rg.y + rg.h - 4]];
    var hits = [];
    for (var i = 0; i < pts.length; i++) {
      var el = document.elementFromPoint(pts[i][0], pts[i][1]);
      if (el) {
        var d = describe(semanticAncestor(el));
        if (d) hits.push(d);
      }
    }
    return { region: { x: rg.x, y: rg.y, w: rg.w, h: rg.h }, hits: hits };
  });
})
`;

/* ==========================================================================
   §3 主流程
   ========================================================================== */

function cleanEnv() {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function main() {
  const argv = process.argv.slice(2);
  const accept = argv.includes('--accept');
  const baselineOnly = argv.includes('--baseline');

  console.log('=== P4-B · 视觉回归（三尺寸 · 客户区口径 · DEC-14）===\n');
  console.log(`  阈值：像素差 ≤ ${(THRESHOLD_RATIO * 100).toFixed(3)}%（固定值，放宽须项目负责人书面批准）`);
  console.log(`  单像素通道容差：${CHANNEL_TOLERANCE}/255（抗锯齿噪声）`);
  console.log(`  遮罩：${MASKS.map((m) => m.id + '（' + m.reason + '）').join(' ｜ ')}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  fs.mkdirSync(BASELINE_DIR, { recursive: true });

  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('❌ 阻塞：playwright-core 不可用。');
    process.exit(3);
  }

  if (baselineOnly) {
    for (const s of SIZES) {
      const f = path.join(BASELINE_DIR, `baseline-${s.name}.png`);
      if (!fs.existsSync(f)) { console.log(`  ${s.name}: 基准缺失`); continue; }
      const img = decodePng(fs.readFileSync(f));
      console.log(`  ${s.name}: ${img.width}×${img.height}  ${(fs.statSync(f).size / 1024).toFixed(1)} KB`);
    }
    process.exit(0);
  }

  const { _electron } = pw;
  let app = null;
  let win = null;
  let attempts = 0;
  let lastErr = null;
  for (let i = 1; i <= 6; i++) {
    try {
      app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
      win = await app.firstWindow({ timeout: 30000 });
      attempts = i;
      break;
    } catch (e) {
      lastErr = e;
      if (i < 6) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  if (!win) {
    console.error('❌ 阻塞：Electron 桌面版无法启动 —— ' + (lastErr ? lastErr.message.split('\n')[0] : '未知'));
    process.exit(3);
  }
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);

  const results = [];
  let failCount = 0;
  let missingBaseline = 0;

  for (const s of SIZES) {
    // 🔴 截图前统一 blur：焦点环差异属交互态噪声，不是布局差异
    await win.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await app.evaluate(async ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setContentSize(size.w, size.h);
    }, s);
    await win.waitForTimeout(600);
    await win.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await win.waitForTimeout(150);

    const actualFile = path.join(SHOTS_DIR, `visual-${s.name}.png`);
    await win.screenshot({ path: actualFile });
    const actual = decodePng(fs.readFileSync(actualFile));

    const clientSize = await app.evaluate(async ({ BrowserWindow }) => {
      const c = BrowserWindow.getAllWindows()[0].getContentSize();
      return { w: c[0], h: c[1] };
    });

    const baselineFile = path.join(BASELINE_DIR, `baseline-${s.name}.png`);
    const rec = {
      size: s.name, layout: s.layout,
      requested: { w: s.w, h: s.h },
      clientSize,
      actualFile: path.relative(DESKTOP, actualFile).replace(/\\/g, '/'),
      baselineFile: path.relative(DESKTOP, baselineFile).replace(/\\/g, '/'),
      actualSize: { w: actual.width, h: actual.height },
    };

    if (clientSize.w !== s.w || clientSize.h !== s.h) {
      rec.verdict = 'FAIL';
      rec.reason = `客户区回读 ${clientSize.w}×${clientSize.h} ≠ 期望 ${s.w}×${s.h}（DEC-14）`;
      failCount++;
      results.push(rec);
      console.log(`  ❌ ${s.name} 客户区回读不符：${rec.reason}`);
      continue;
    }

    if (!fs.existsSync(baselineFile)) {
      if (accept) {
        fs.copyFileSync(actualFile, baselineFile);
        rec.verdict = 'BASELINE_CREATED';
        rec.reason = '基准不存在，已按 --accept 建立基准';
        results.push(rec);
        console.log(`  📌 ${s.name} 基准已建立（--accept）`);
        continue;
      }
      rec.verdict = 'NO_BASELINE';
      rec.reason = '基准不存在（需 --accept 建立）';
      missingBaseline++;
      results.push(rec);
      console.log(`  ⚠️ ${s.name} 基准缺失 → 该档位未判定（不计入通过）`);
      continue;
    }

    const baseline = decodePng(fs.readFileSync(baselineFile));
    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      rec.verdict = 'FAIL';
      rec.reason = `基准尺寸 ${baseline.width}×${baseline.height} 与实际 ${actual.width}×${actual.height} 不一致`;
      failCount++;
      results.push(rec);
      console.log(`  ❌ ${s.name} ${rec.reason}`);
      continue;
    }

    const cmp = comparePixels(baseline, actual, MASKS);
    const diffFile = path.join(OUT_DIR, `visual-diff-${s.name}.png`);
    fs.writeFileSync(diffFile, encodePng(actual.width, actual.height, cmp.diffImage));

    /* ---- P1-1 证据 ④：半透明叠加图（baseline 50% + actual 50%）---- */
    const overlayFile = path.join(OUT_DIR, `visual-overlay-${s.name}.png`);
    try {
      const overlay = blendOverlay(baseline, actual);
      fs.writeFileSync(overlayFile, encodePng(actual.width, actual.height, overlay));
    } catch (e) {
      console.log(`       ⚠️ overlay 生成失败：${e.message}`);
    }

    /* ---- P1-1 证据 ⑤：差异区域 DOM 归属（**全部**差异块，按选择器聚合）---- */
    let domAttrib = null;
    let domAgg = null;
    if (cmp.allBlocks.length) {
      try {
        // 🔴 字符串 evaluate 必须自带**调用**（与 PAGE_COLLECT 同口径）——
        //    只传函数表达式不会被执行，返回值会被序列化成 undefined。
        const regionsArg = JSON.stringify(cmp.allBlocks);
        domAttrib = await win.evaluate('(' + DOM_ATTRIB + ')(' + regionsArg + ')');
        // 按选择器聚合：回答「差异像素分别属于哪些组件」
        const agg = new Map();
        for (const a of domAttrib) {
          const hit = a.hits && a.hits[0];
          const key = hit ? hit.selector : '(未命中)';
          const px = cmp.allBlocks.find((b) => b.x === a.region.x && b.y === a.region.y);
          const n = px ? px.pixels : 0;
          agg.set(key, (agg.get(key) || 0) + n);
        }
        domAgg = [...agg.entries()].sort((p, q) => q[1] - p[1])
          .map(([selector, pixels]) => ({ selector, pixels }));
      } catch (e) {
        domAttrib = { error: e.message };
      }
    }

    rec.diffPixels = cmp.diff;
    rec.totalPixels = cmp.total;
    rec.maskedPixels = cmp.masked;
    rec.diffRatio = Number((cmp.ratio * 100).toFixed(4));
    rec.diffRatioValue = cmp.ratio;
    rec.threshold = THRESHOLD_RATIO;
    rec.diffFile = path.relative(DESKTOP, diffFile).replace(/\\/g, '/');
    rec.overlayFile = path.relative(DESKTOP, overlayFile).replace(/\\/g, '/');
    rec.baselineFileAbs = baselineFile;
    rec.hotRegions = cmp.regions;
    rec.domAttribution = domAttrib;
    rec.domAttributionAggregate = domAgg;

    if (cmp.ratio > THRESHOLD_RATIO) {
      rec.verdict = 'FAIL';
      rec.reason = `像素差 ${(cmp.ratio * 100).toFixed(4)}% 超阈值 ${(THRESHOLD_RATIO * 100).toFixed(3)}%`;
      failCount++;
    } else {
      rec.verdict = 'PASS';
      rec.reason = `像素差 ${(cmp.ratio * 100).toFixed(4)}% ≤ 阈值 ${(THRESHOLD_RATIO * 100).toFixed(3)}%`;
    }
    results.push(rec);
    console.log(`  ${rec.verdict === 'PASS' ? '✅' : '❌'} ${s.name} ${rec.reason}`);
    if (cmp.regions.length) {
      console.log(`       差异热点：${cmp.regions.slice(0, 3).map((r) => `(${r.x},${r.y}) ${r.pixels}px`).join(' ｜ ')}`);
    }
    if (domAgg) {
      const totPx = domAgg.reduce((a, x) => a + x.pixels, 0);
      console.log('       差异像素的组件归属（全部差异块聚合）：');
      for (const x of domAgg.slice(0, 8)) {
        console.log(`         ${x.selector} → ${x.pixels} px（${(x.pixels / totPx * 100).toFixed(1)}%）`);
      }
    }
  }

  await app.close().catch(() => {});

  console.log('\n============================================================');
  console.log('【汇总】视觉回归');
  console.log('============================================================');
  console.log(`  档位数 = ${SIZES.length} ｜ PASS ${results.filter((r) => r.verdict === 'PASS').length} ｜ FAIL ${failCount} ｜ 无基准 ${missingBaseline}`);
  console.log(`  启动重试次数：${attempts}`);

  fs.writeFileSync(path.join(OUT_DIR, 'visual-regression.json'), JSON.stringify({
    meta: {
      generatedAt: new Date().toISOString(),
      thresholdRatio: THRESHOLD_RATIO,
      channelTolerance: CHANNEL_TOLERANCE,
      masks: MASKS,
      electron: '45.1.0',
      node: process.version,
      platform: process.platform,
    },
    summary: { total: SIZES.length, fail: failCount, noBaseline: missingBaseline },
    results,
  }, null, 2), 'utf8');
  console.log(`  📄 JSON 报告：${path.join(OUT_DIR, 'visual-regression.json')}`);

  if (missingBaseline > 0 && failCount === 0) process.exit(2);
  if (failCount > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
