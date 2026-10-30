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

/** 🔒 像素差阈值（TK-38 建议值）—— 固定值，放宽须经项目负责人书面批准 */
const THRESHOLD_RATIO = 0.001; // 0.1%

/** 🔒 单像素颜色差容差（抗锯齿噪声）—— 固定值 */
const CHANNEL_TOLERANCE = 8; // /255

/**
 * 🔒 遮罩区（归一化坐标 · [x0,y0,x1,y1]）—— **有规则、可审计**
 * M1：顶栏版本行 —— 版本号随构建变化，属**已知动态文本**。
 *     范围：右侧 260px × 顶部 34px（客户端区坐标）。
 */
const MASKS = [
  { id: 'M1-version-line', rect: [1180, 0, 1440, 34], reason: '顶栏版本行（版本号随构建变化）' },
];

/* ==========================================================================
   §1 最小 PNG 解码器（零依赖）
   ---------------------------------------------------------------------------
   Electron 截图是 8bit RGBA / RGB PNG。本模块实现「IHDR 解析 → IDAT 拼接 →
   inflate → 逐扫描行反滤波（filter 0~4）→ RGBA 像素数组」。
   🔴 只支持 8bit、非隔行（interlace=0）—— Electron 截图恒为此形态；
      若遇隔行 PNG 直接抛错（不静默降级）。
   ========================================================================== */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null, trns = null;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      trns = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (bitDepth !== 8) throw new Error('仅支持 8bit PNG（实际 ' + bitDepth + '）');
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('未知 colorType ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const line = raw.subarray(src, src + stride);
    src += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const rawByte = line[x];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          v = rawByte + pred;
          break;
        }
        default: throw new Error('未知 PNG filter ' + filter);
      }
      cur[x] = v & 0xff;
    }
  }

  // 统一转成 RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    let r, g, b, a = 255;
    if (colorType === 6) {
      r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3];
    } else if (colorType === 2) {
      r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2];
    } else if (colorType === 0) {
      r = g = b = out[i];
    } else if (colorType === 4) {
      r = g = b = out[i * 2]; a = out[i * 2 + 1];
    } else if (colorType === 3) {
      const idx = out[i];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, data: rgba };
}

/** 编码为 PNG（用于输出 diff 图） */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });

  const chunks = [];
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const mkChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, crc]);
  };
  chunks.push(sig, mkChunk('IHDR', ihdr), mkChunk('IDAT', idat), mkChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ==========================================================================
   §2 像素比对
   ========================================================================== */

/**
 * 比对两张 RGBA 图。
 * @returns {{total:number, diff:number, ratio:number, diffImage:Buffer, regions:Array}}
 */
function comparePixels(a, b, masks) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`尺寸不一致：基准 ${a.width}×${a.height} vs 实际 ${b.width}×${b.height}`);
  }
  const w = a.width, h = a.height;
  const total = w * h;
  const maskBuf = new Uint8Array(total);
  for (const m of masks) {
    const [x0, y0, x1, y1] = m.rect;
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) maskBuf[y * w + x] = 1;
    }
  }

  const diffImg = Buffer.alloc(w * h * 4);
  let diff = 0;
  let masked = 0;
  // 差异按 32×32 区块聚合，便于定位
  const blockSize = 32;
  const blocks = new Map();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = y * w + x;
      // diff 图底色：原图灰度
      const gray = Math.round((a.data[i] * 0.299 + a.data[i + 1] * 0.587 + a.data[i + 2] * 0.114) * 0.35 + 25);
      diffImg[i] = gray; diffImg[i + 1] = gray; diffImg[i + 2] = gray; diffImg[i + 3] = 255;

      if (maskBuf[p]) { masked++; continue; }

      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
      if (dr > CHANNEL_TOLERANCE || dg > CHANNEL_TOLERANCE || db > CHANNEL_TOLERANCE || da > CHANNEL_TOLERANCE) {
        diff++;
        diffImg[i] = 255; diffImg[i + 1] = 0; diffImg[i + 2] = 0; diffImg[i + 3] = 255;
        const bx = Math.floor(x / blockSize), by = Math.floor(y / blockSize);
        const key = bx + ',' + by;
        blocks.set(key, (blocks.get(key) || 0) + 1);
      }
    }
  }

  const regions = [...blocks.entries()]
    .map(([k, n]) => {
      const [bx, by] = k.split(',').map(Number);
      return { x: bx * blockSize, y: by * blockSize, w: blockSize, h: blockSize, pixels: n };
    })
    .sort((p, q) => q.pixels - p.pixels)
    .slice(0, 12);

  return { total, diff, masked, ratio: diff / total, diffImage: diffImg, regions };
}

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

    rec.diffPixels = cmp.diff;
    rec.totalPixels = cmp.total;
    rec.maskedPixels = cmp.masked;
    rec.diffRatio = Number((cmp.ratio * 100).toFixed(4));
    rec.diffRatioValue = cmp.ratio;
    rec.threshold = THRESHOLD_RATIO;
    rec.diffFile = path.relative(DESKTOP, diffFile).replace(/\\/g, '/');
    rec.hotRegions = cmp.regions;

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
