/* ==========================================================================
   LED-ratio-Tool 桌面版 · 视觉比对库（零依赖，CJS）
   ============================================================================
   从 visual-regression.mjs 提取为共享模块：遮罩 / 阈值 / 像素比对 / 叠加图。
   🔴 阈值与通道容差是**固定值** —— 放宽须经项目负责人书面批准（TK-38）。
   ========================================================================== */

'use strict';

const { decodePng, encodePng } = require('./png-lib.cjs');

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

  const allBlocks = [...blocks.entries()]
    .map(([k, n]) => {
      const [bx, by] = k.split(',').map(Number);
      return { x: bx * blockSize, y: by * blockSize, w: blockSize, h: blockSize, pixels: n };
    });
  const regions = allBlocks.slice().sort((p, q) => q.pixels - p.pixels).slice(0, 12);

  return { total, diff, masked, ratio: diff / total, diffImage: diffImg, regions, allBlocks };
}

/**
 * 生成半透明叠加图
/**
 * 生成半透明叠加图（baseline 50% + actual 50%）。
 * 用途：P1-1 要求的第 4 类证据 —— 人眼可直接看出「哪里动了、动了多少」。
 * @returns {Buffer} RGBA
 */
function blendOverlay(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error('尺寸不一致，无法叠加');
  }
  const out = Buffer.alloc(a.width * a.height * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.round((a.data[i] + b.data[i]) / 2);
    out[i + 1] = Math.round((a.data[i + 1] + b.data[i + 1]) / 2);
    out[i + 2] = Math.round((a.data[i + 2] + b.data[i + 2]) / 2);
    out[i + 3] = 255;
  }
  return out;
}


module.exports = { MASKS, THRESHOLD_RATIO, CHANNEL_TOLERANCE, comparePixels, blendOverlay };
