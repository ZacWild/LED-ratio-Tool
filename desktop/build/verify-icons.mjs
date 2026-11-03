/**
 * LED-ratio-Tool 桌面版 · 品牌图标资源自检
 * ============================================================================
 * 依据：
 *   P7-1  —— 品牌统一：最终 LOGO（LOGO2.jpg）＝白 #F8F8F8「错位双层取景框」+ 炭灰 #262626 底
 *   任务书 —— 「清理旧占位图标，核对所有资源引用」
 *
 * 检查项：
 *   IC-01 icon.ico 存在且 ICO 头合法（reserved=0 / type=1 / count>0）
 *   IC-02 尺寸集合齐备：16/24/32/48/64/128/256，全部 32bpp、正方形
 *   IC-03 目录项偏移/长度不越界、不重叠，且覆盖整个数据区
 *   IC-04 每个 BMP 条目头部合法（40 字节 DIB、height=2×width、BI_RGB 32bpp）
 *   IC-05 像素为品牌色（白 #F8F8F8 + 炭灰 #262626 合计 ≥ 90%，容差归类抗锯齿边缘）
 *   IC-06 不含旧品牌橙 #F0A832 及旧占位色（#FFC169 / #8A9099 / #17181C 等，各自 < 1%）
 *   IC-07 内容铺满画布（bbox 宽 ≥ 画布 90%，四边留白对称）
 *   IC-08 icon-256x256.png 与 ico 的 256 条目**字节一致**（同源同编码）
 *   IC-09 electron-builder.yml 中 icon / installerIcon / uninstallerIcon 均指向存在的文件
 *   IC-10 main/main.js 若引用 resources 图标，该文件必须存在
 *
 * 零依赖（只用 node 内置模块 + 手写 ICO/DIB 解析）。
 * 退出码：0 = 全部通过；1 = 存在不通过项
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const ICON_ICO = path.join(DESKTOP, 'resources', 'icon.ico');
const ICON_PNG = path.join(DESKTOP, 'resources', 'icon-256x256.png');
const BUILDER_YML = path.join(DESKTOP, 'build', 'electron-builder.yml');
const MAIN_JS = path.join(DESKTOP, 'main', 'main.js');

const REQUIRED_SIZES = [16, 24, 32, 48, 64, 128, 256];
// 品牌色（P7-1 最终 LOGO：白框 + 炭灰底）—— 用作深浅两相的判定基准
const BRAND_WHITE = [248, 248, 248]; // #F8F8F8
const BRAND_DARK = [38, 38, 38];     // #262626
// 旧品牌橙（D-08 时代外框）+ 旧占位暖色 —— 出现即说明回退到旧素材。
// 🔴 旧 logo 的深色（#17181C/#27251F/#1B1D21）与新炭灰 #262626 同为「近黑」，
//    在 RGB 距离上重叠，无法当判别器 —— 真正的判别色是**橙**。
const LEGACY = [
  { hex: '#F0A832', rgb: [240, 168, 50] },
  { hex: '#FFC169', rgb: [255, 193, 105] },
];
// 容差：把抗锯齿边缘/JPEG 噪声归入邻近的目标色（RGB 欧氏距离）
const TOL = 40;

const results = [];
const check = (id, desc, fn) => {
  try {
    const r = fn();
    results.push({ id, desc, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (e) {
    results.push({ id, desc, ok: false, detail: e.message });
  }
};

const hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

/* ---------------- ICO / DIB 解析 ---------------- */
function parseIco(buf) {
  if (buf.length < 6) throw new Error('文件过短');
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  if (reserved !== 0) throw new Error(`reserved=${reserved}（应为 0）`);
  if (type !== 1) throw new Error(`type=${type}（应为 1=ICO）`);
  if (count < 1) throw new Error('条目数=0');
  if (buf.length < 6 + count * 16) throw new Error('目录区被截断');

  const entries = [];
  for (let i = 0; i < count; i++) {
    const p = 6 + i * 16;
    entries.push({
      width: buf[p] === 0 ? 256 : buf[p],
      height: buf[p + 1] === 0 ? 256 : buf[p + 1],
      colors: buf[p + 2],
      planes: buf.readUInt16LE(p + 4),
      bpp: buf.readUInt16LE(p + 6),
      bytes: buf.readUInt32LE(p + 8),
      offset: buf.readUInt32LE(p + 12),
    });
  }
  return { count, entries };
}

/** BMP 条目 → {w,h,rgba}；只支持 32bpp BI_RGB（本项目就用这种） */
function decodeBmpEntry(buf, e) {
  const b = buf.subarray(e.offset, e.offset + e.bytes);
  if (b.length < 40) throw new Error('DIB 头被截断');
  const biSize = b.readUInt32LE(0);
  const w = b.readInt32LE(4);
  const h2 = b.readInt32LE(8);
  const planes = b.readUInt16LE(12);
  const bpp = b.readUInt16LE(14);
  const comp = b.readUInt32LE(16);
  if (biSize !== 40) throw new Error(`biSize=${biSize}（应为 40）`);
  if (planes !== 1) throw new Error(`planes=${planes}`);
  if (bpp !== 32) throw new Error(`bpp=${bpp}（应为 32）`);
  if (comp !== 0) throw new Error(`compression=${comp}（应为 0=BI_RGB）`);
  if (h2 !== w * 2) throw new Error(`biHeight=${h2}（应为 2×${w}）`);

  const px = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const s = 40 + ((w - 1 - y) * w + x) * 4; // 自下而上 BGRA
      const d = (y * w + x) * 4;
      px[d] = b[s + 2];
      px[d + 1] = b[s + 1];
      px[d + 2] = b[s];
      px[d + 3] = b[s + 3];
    }
  }
  return { w, h: w, rgba: px };
}

function colorStats(rgba, w, h) {
  const hist = new Map();
  let opaque = 0;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    opaque++;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const k = hex(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  return { hist, opaque, minX, minY, maxX, maxY };
}

const share = (hist, opaque, color) => ((hist.get(color) || 0) / opaque) * 100;

/** 容差归类占比：把「欧氏距离 ≤ tol 的像素」计入目标色 —— 抗锯齿边缘会被归到邻近的纯色 */
function nearShare(hist, opaque, rgb, tol) {
  let n = 0;
  for (const [k, v] of hist) {
    // colorStats 的键是 '#RRGGBB'
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(k);
    if (!m) continue;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const d = Math.sqrt((r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2);
    if (d <= tol) n += v;
  }
  return (n / opaque) * 100;
}

/** 单色（灰度）像素占比：r≈g≈b，含白、炭灰及其中间过渡 —— 新 LOGO 是纯单色构图 */
function grayShare(hist, opaque) {
  let n = 0;
  for (const [k, v] of hist) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(k);
    if (!m) continue;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 24) n += v;
  }
  return (n / opaque) * 100;
}

/* ---------------- 读取 ---------------- */
let icoBuf = null;
let ico = null;
try {
  icoBuf = fs.readFileSync(ICON_ICO);
  ico = parseIco(icoBuf);
} catch (e) {
  /* IC-01 会报出具体错误 */
}

/* ---------------- IC-01 ---------------- */
check('IC-01', 'icon.ico 存在且 ICO 头合法', () => {
  if (!fs.existsSync(ICON_ICO)) return '缺少 desktop/resources/icon.ico';
  const { count } = parseIco(icoBuf);
  return count === REQUIRED_SIZES.length || `条目数=${count}（应为 ${REQUIRED_SIZES.length}）`;
});

/* ---------------- IC-02 ---------------- */
check('IC-02', '尺寸集合 16/24/32/48/64/128/256 齐备且均为 32bpp 正方形', () => {
  if (!ico) return 'ICO 无法解析';
  const sizes = ico.entries.map((e) => e.width);
  const missing = REQUIRED_SIZES.filter((s) => !sizes.includes(s));
  if (missing.length) return `缺少尺寸 ${missing.join('/')}`;
  const extra = sizes.filter((s) => !REQUIRED_SIZES.includes(s));
  if (extra.length) return `存在多余尺寸 ${extra.join('/')}`;
  const bad = ico.entries.filter((e) => e.width !== e.height || e.bpp !== 32);
  if (bad.length) return `非正方形或非 32bpp：${bad.map((e) => `${e.width}×${e.height}@${e.bpp}`).join(', ')}`;
  return true;
});

/* ---------------- IC-03 ---------------- */
check('IC-03', '目录项偏移/长度合法、不重叠且铺满数据区', () => {
  if (!ico) return 'ICO 无法解析';
  const sorted = [...ico.entries].sort((a, b) => a.offset - b.offset);
  let cursor = 6 + ico.count * 16;
  for (const e of sorted) {
    if (e.offset < cursor) return `条目 ${e.width}px 与前一项重叠（offset=${e.offset} < ${cursor}）`;
    if (e.offset !== cursor) return `条目 ${e.width}px 与前一区间存在空隙（${cursor} → ${e.offset}）`;
    if (e.offset + e.bytes > icoBuf.length) return `条目 ${e.width}px 越界`;
    cursor = e.offset + e.bytes;
  }
  return cursor === icoBuf.length || `数据尾部有 ${icoBuf.length - cursor} 字节未归属任何条目`;
});

/* ---------------- IC-04 / IC-05 / IC-06 / IC-07 ---------------- */
const bmpEntries = [];
check('IC-04', '每个 BMP 条目 DIB 头合法（40 字节 / 32bpp / BI_RGB / height=2×width）', () => {
  if (!ico) return 'ICO 无法解析';
  for (const e of ico.entries) {
    const isPng = icoBuf.readUInt32BE(e.offset) === 0x89504e47;
    if (isPng) {
      // 256 档允许 PNG 压缩：只校验 IHDR 与目录项一致
      const wPng = icoBuf.readUInt32BE(e.offset + 16);
      const hPng = icoBuf.readUInt32BE(e.offset + 20);
      if (wPng !== e.width || hPng !== e.height) {
        return `${e.width}px PNG 条目的 IHDR 为 ${wPng}×${hPng}`;
      }
      continue;
    }
    bmpEntries.push({ e, ...decodeBmpEntry(icoBuf, e) });
  }
  return bmpEntries.length > 0 || '没有任何 BMP 条目（小尺寸必须用 BMP 以兼容 legacy 渲染）';
});

check('IC-05', '品牌为「白框 + 炭灰底」单色构图（灰度 ≥ 95%，深浅两相俱在）', () => {
  if (!bmpEntries.length) return '无 BMP 条目可取样';
  const bad = [];
  for (const { e, w, h, rgba } of bmpEntries) {
    const { hist, opaque } = colorStats(rgba, w, h);
    const gray = grayShare(hist, opaque);
    const light = nearShare(hist, opaque, BRAND_WHITE, 60);
    const dark = nearShare(hist, opaque, BRAND_DARK, 60);
    if (gray < 95) bad.push(`${e.width}px 单色仅 ${gray.toFixed(1)}%`);
    if (light < 5) bad.push(`${e.width}px 白框占比过低（${light.toFixed(1)}%）`);
    if (dark < 60) bad.push(`${e.width}px 炭灰底占比过低（${dark.toFixed(1)}%）`);
  }
  return bad.length ? bad.join('；') : true;
});

check('IC-06', '不含旧品牌橙 #F0A832 / 旧占位暖色 #FFC169', () => {
  if (!bmpEntries.length) return '无 BMP 条目可取样';
  const bad = [];
  for (const { e, w, h, rgba } of bmpEntries) {
    const { hist, opaque } = colorStats(rgba, w, h);
    for (const c of LEGACY) {
      const s = nearShare(hist, opaque, c.rgb, TOL);
      if (s >= 1) bad.push(`${e.width}px 含旧色 ${c.hex} ${s.toFixed(1)}%`);
    }
  }
  return bad.length ? bad.join('；') : true;
});

check('IC-07', '内容铺满画布（bbox 宽 ≥ 90%，四边留白对称）', () => {
  if (!bmpEntries.length) return '无 BMP 条目可取样';
  const bad = [];
  for (const { e, w, h, rgba } of bmpEntries) {
    const { minX, minY, maxX, maxY } = colorStats(rgba, w, h);
    if (maxX < 0) {
      bad.push(`${e.width}px 全透明`);
      continue;
    }
    const fill = ((maxX - minX + 1) / w) * 100;
    if (fill < 90) bad.push(`${e.width}px 内容仅占 ${fill.toFixed(0)}% 宽`);
    const l = minX;
    const r = w - 1 - maxX;
    const t = minY;
    const b = h - 1 - maxY;
    if (Math.abs(l - r) > 1 || Math.abs(t - b) > 1) {
      bad.push(`${e.width}px 留白不对称（左${l} 右${r} 上${t} 下${b}）`);
    }
  }
  return bad.length ? bad.join('；') : true;
});

/* ---------------- IC-08 ---------------- */
check('IC-08', 'icon-256x256.png 与 ico 的 256 条目字节一致', () => {
  if (!fs.existsSync(ICON_PNG)) return '缺少 desktop/resources/icon-256x256.png';
  if (!ico) return 'ICO 无法解析';
  const e = ico.entries.find((x) => x.width === 256);
  if (!e) return 'ICO 内无 256 条目';
  const png = fs.readFileSync(ICON_PNG);
  const inner = icoBuf.subarray(e.offset, e.offset + e.bytes);
  if (png.length !== inner.length) return `长度不一致（png ${png.length}B / ico 条目 ${inner.length}B）`;
  return png.equals(inner) || '内容不一致（两者不是同一次渲染产物）';
});

/* ---------------- IC-09 ---------------- */
check('IC-09', 'electron-builder.yml 的 icon / installerIcon / uninstallerIcon 均指向存在的文件', () => {
  if (!fs.existsSync(BUILDER_YML)) return '缺少 build/electron-builder.yml';
  const yml = fs.readFileSync(BUILDER_YML, 'utf8');
  const keys = ['icon', 'installerIcon', 'uninstallerIcon'];
  const problems = [];
  for (const k of keys) {
    const m = yml.match(new RegExp(`^\\s*${k}:\\s*(\\S+)\\s*$`, 'm'));
    if (!m) {
      problems.push(`未配置 ${k}`);
      continue;
    }
    const p = path.join(DESKTOP, m[1]);
    if (!fs.existsSync(p)) problems.push(`${k} → ${m[1]} 不存在`);
  }
  return problems.length ? problems.join('；') : true;
});

/* ---------------- IC-10 ---------------- */
check('IC-10', 'main/main.js 引用的 resources 图标文件存在', () => {
  const src = fs.readFileSync(MAIN_JS, 'utf8');
  const hits = [...src.matchAll(/['"]icon\.ico['"]/g)];
  if (!hits.length) return 'main.js 未引用 icon.ico（打包版靠 exe 内嵌图标，属预期）';
  return fs.existsSync(ICON_ICO) || 'main.js 引用了 icon.ico，但 resources/icon.ico 不存在';
});

/* ---------------- 输出 ---------------- */
const failed = results.filter((r) => !r.ok);
console.log('=== 品牌图标资源自检（IC）===');
for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.id}  ${r.desc}${r.ok ? '' : '  → ' + r.detail}`);
}

if (ico) {
  console.log('\n=== icon.ico 条目 ===');
  for (const e of ico.entries) {
    const isPng = icoBuf.readUInt32BE(e.offset) === 0x89504e47;
    console.log(
      `  ${String(e.width).padStart(3)}×${String(e.height).padStart(3)}  ${String(e.bpp).padStart(2)}bpp  ${String(e.bytes).padStart(6)}B  ${isPng ? 'PNG' : 'BMP'}`,
    );
  }
  console.log(`  合计 ${ico.count} 档 / ${icoBuf.length} B`);
}

if (failed.length) {
  console.error(`\n[失败] ${failed.length} 项不通过`);
  process.exit(1);
}
console.log(`\n[通过] ${results.length} 项全部通过`);
