/**
 * LED-ratio-Tool 桌面版 · 打包产物品牌图标一致性核验
 * ============================================================================
 * 目的：P7 Final Acceptance —— 确认「安装程序 / Portable / win-unpacked 主程序 /
 *       卸载器」四个产物的图标资源与品牌 LOGO 一致（白框取景框 + 炭灰底，
 *       非旧占位橙、非默认 Electron 图标）。
 *
 * 依据：
 *   · build/verify-icons.mjs 已证源 resources/icon.ico 品牌构图正确（IC-01~IC-10）。
 *   · electron-builder.yml 的 win.icon / installerIcon / uninstallerIcon 均指向 icon.ico。
 *   本脚本补齐「打包后 exe 的 PE 资源表里实际嵌入了什么图标」这最后一环。
 *
 * 手法（纯 Node，零依赖）：
 *   1. PE 解析：e_lfanew → COFF → 可选头 → 数据目录[2]=资源表 → 三层目录
 *      （type → name → lang）定位 RT_GROUP_ICON(14) 与 RT_ICON(3)。
 *   2. RT_GROUP_ICON 里是 GRPICONDIR（描述图标组）；RT_ICON 里是各 nID 的 DIB 图像。
 *   3. 对每个 DIB 做 32bpp BI_RGB 解码 → 品牌色判定（灰度 ≥ 95%、深浅两相俱在、
 *      无旧橙 #F0A832 / #FFC169）。
 *
 * 判定口径：一个产物「通过」= 至少存在一个图标组，其内含 ≥16px 的条目解码后
 *   满足品牌构图；「不通过」= 所有图标组均不含品牌构图（可能回退默认图标 / 旧图标）。
 *
 * 退出码：0 = 全部产物通过；1 = 存在产物不通过或解析异常。
 */
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const DIST = path.join(DESKTOP, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const V = pkg.version;

const argv = process.argv.slice(2);
const uninstallerArg = (argv.find((a) => a.startsWith('--uninstaller=')) || '').split('=')[1] || null;
// 卸载器默认探测 p7-acceptance 的安装目录（安装后生成，不随 dist 走）
const DEFAULT_UNINSTALLER = path.join(os.tmpdir(), 'LED Ratio Tool P7-Accept', 'Uninstall LED Ratio Tool.exe');

const TARGETS = [
  { key: 'nsis', label: 'NSIS 安装程序', file: path.join(DIST, `LED Ratio Tool-${V}-x64-setup.exe`) },
  { key: 'portable', label: 'Portable 便携版', file: path.join(DIST, `LED Ratio Tool-${V}-x64-portable.exe`) },
  { key: 'app', label: '主程序（win-unpacked）', file: path.join(DIST, 'win-unpacked', 'LED Ratio Tool.exe') },
  { key: 'uninstaller', label: '卸载器（安装后生成）', file: uninstallerArg || DEFAULT_UNINSTALLER, optional: true },
];

// 品牌色（与 verify-icons.mjs 同源）
const BRAND_WHITE = [248, 248, 248];
const BRAND_DARK = [38, 38, 38];
const LEGACY = [
  { hex: '#F0A832', rgb: [240, 168, 50] },
  { hex: '#FFC169', rgb: [255, 193, 105] },
];
const TOL = 40;

/* ============================ PE 资源解析 ============================ */
function readSections(buf) {
  const peOff = buf.readUInt32LE(0x3c);
  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const is64 = buf.readUInt16LE(opt) === 0x20b;
  const dd = opt + (is64 ? 112 : 96);
  const sections = [];
  const secStart = opt + optSize;
  for (let i = 0; i < numSections; i++) {
    const s = secStart + i * 40;
    sections.push({
      vsize: buf.readUInt32LE(s + 8),
      vaddr: buf.readUInt32LE(s + 12),
      rawSize: buf.readUInt32LE(s + 16),
      rawPtr: buf.readUInt32LE(s + 20),
    });
  }
  return { buf, dd, sections };
}

function makeRva2off(buf, sections) {
  return (rva) => {
    for (const s of sections) {
      if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) {
        return s.rawPtr + (rva - s.vaddr);
      }
    }
    return -1;
  };
}

/** 资源目录遍历：读一层（type / name / lang），返回条目数组 */
function readDir(buf, off) {
  const nNamed = buf.readUInt16LE(off + 12);
  const nId = buf.readUInt16LE(off + 14);
  const out = [];
  for (let i = 0; i < nNamed + nId; i++) {
    const e = off + 16 + i * 8;
    const nameField = buf.readUInt32LE(e);
    const offField = buf.readUInt32LE(e + 4);
    out.push({
      id: nameField & 0x80000000 ? -1 : nameField,
      subdir: (offField & 0x80000000) !== 0,
      off: offField & 0x7fffffff,
    });
  }
  return out;
}

/**
 * 提取某个资源类型下的所有 (nameId → data) 映射。
 * @returns {Map<number, Buffer>}  key = 资源名/ID，value = 数据 Buffer
 */
function extractResourceByType(buf, typeId) {
  const pe = readSections(buf);
  const resRva = buf.readUInt32LE(pe.dd + 2 * 8);
  if (!resRva) return new Map();
  const rva2off = makeRva2off(buf, pe.sections);
  const base = rva2off(resRva);
  if (base < 0) return new Map();

  const map = new Map();
  for (const t of readDir(buf, base)) {
    if (!t.subdir || t.id !== typeId) continue;
    for (const n of readDir(buf, base + t.off)) {
      if (!n.subdir) continue;
      for (const l of readDir(buf, base + n.off)) {
        if (l.subdir) continue;
        const de = base + l.off;
        const dataRva = buf.readUInt32LE(de);
        const dataSize = buf.readUInt32LE(de + 4);
        const d = rva2off(dataRva);
        if (d < 0) continue;
        map.set(n.id, buf.subarray(d, d + dataSize));
      }
    }
  }
  return map;
}

/* ============================ 图标解码与品牌判定 ============================ */
/** GRPICONDIRENTRY（14 字节）解析 */
function parseGroupIcon(data) {
  if (data.length < 6) return null;
  const count = data.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const p = 6 + i * 14;
    if (p + 14 > data.length) break;
    entries.push({
      width: data[p] === 0 ? 256 : data[p],
      height: data[p + 1] === 0 ? 256 : data[p + 1],
      bpp: data.readUInt16LE(p + 6),
      bytes: data.readUInt32LE(p + 8),
      nid: data.readUInt16LE(p + 12),
    });
  }
  return { count, entries };
}

/** 32bpp BI_RGB DIB → RGBA 像素（自下而上 BGRA，与 verify-icons.mjs 同源） */
function decodeDib(data) {
  if (data.length < 40) return null;
  const biSize = data.readUInt32LE(0);
  const w = data.readInt32LE(4);
  const h2 = data.readInt32LE(8);
  const planes = data.readUInt16LE(12);
  const bpp = data.readUInt16LE(14);
  const comp = data.readUInt32LE(16);
  if (biSize !== 40 || planes !== 1 || bpp !== 32 || comp !== 0) return null;
  if (h2 !== w * 2) return null;
  if (data.length < 40 + w * w * 4) return null;
  const px = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const s = 40 + ((w - 1 - y) * w + x) * 4;
      const d = (y * w + x) * 4;
      px[d] = data[s + 2];
      px[d + 1] = data[s + 1];
      px[d + 2] = data[s];
      px[d + 3] = data[s + 3];
    }
  }
  return { w, h: w, rgba: px };
}

function grayShare(rgba, w) {
  let n = 0, opaque = 0;
  for (let i = 0; i < w * w; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    opaque++;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 24) n++;
  }
  return { n, opaque, share: opaque ? (n / opaque) * 100 : 0 };
}

function nearShare(rgba, w, rgb, tol) {
  let n = 0, opaque = 0;
  for (let i = 0; i < w * w; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    opaque++;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const d = Math.sqrt((r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2);
    if (d <= tol) n++;
  }
  return { n, share: opaque ? (n / opaque) * 100 : 0 };
}

/** 判定一组图标是否命中品牌构图（白框 + 炭灰底、灰度、无橙） */
function assessIcons(groupEntries, iconData) {
  let best = null;
  for (const e of groupEntries) {
    const data = iconData.get(e.nid);
    if (!data || e.width < 16) continue;
    const px = decodeDib(data);
    if (!px) continue;
    const gray = grayShare(px.rgba, px.w);
    const white = nearShare(px.rgba, px.w, BRAND_WHITE, TOL);
    const dark = nearShare(px.rgba, px.w, BRAND_DARK, TOL);
    const legacyOrange = LEGACY.reduce((sum, l) => sum + nearShare(px.rgba, px.w, l.rgb, TOL).share, 0);
    const hit = gray.share >= 95 && white.share >= 10 && dark.share >= 10 && legacyOrange < 1;
    const cand = { width: e.width, hit, gray: gray.share.toFixed(1), white: white.share.toFixed(1), dark: dark.share.toFixed(1), orange: legacyOrange.toFixed(1) };
    if (!best || e.width > best.width) best = cand;
  }
  return best;
}

/* ============================ 主流程 ============================ */
let allPass = true;
console.log('=== 打包产物品牌图标一致性核验（PE 资源表）===');

for (const t of TARGETS) {
  if (!fs.existsSync(t.file)) {
    if (t.optional) {
      console.log(`  ⏭️  ${t.key}（${t.label}）：未安装，不存在 → 跳过（安装后生成）`);
      continue;
    }
    console.log(`  ❌ ${t.key}（${t.label}）：文件不存在 ${t.file}`);
    allPass = false;
    continue;
  }
  try {
    const buf = fs.readFileSync(t.file);
    const groups = extractResourceByType(buf, 14); // RT_GROUP_ICON
    const icons = extractResourceByType(buf, 3);   // RT_ICON
    if (groups.size === 0) {
      console.log(`  ❌ ${t.key}（${t.label}）：无 RT_GROUP_ICON 资源（可能无图标/默认 Electron）`);
      allPass = false;
      continue;
    }
    // 汇总所有组的图标：取各组品牌判定，任一组命中即通过
    let groupHit = false;
    let groupDetail = [];
    for (const [gid, gdata] of groups) {
      const g = parseGroupIcon(gdata);
      if (!g) continue;
      const a = assessIcons(g.entries, icons);
      const hit = a ? a.hit : false;
      if (hit) groupHit = true;
      groupDetail.push(`组${gid}(${g.entries.length}档:${g.entries.map((e) => e.width).join('/')})→${a ? `${a.width}px 灰度${a.gray}% 白${a.white}% 炭灰${a.dark}% 橙${a.orange}% ${a.hit ? '✅' : '✗'}` : '无可判定条目'}`);
    }
    if (groupHit) {
      console.log(`  ✅ ${t.key}（${t.label}）：命中品牌图标`);
      for (const d of groupDetail) console.log(`       ${d}`);
    } else {
      console.log(`  ❌ ${t.key}（${t.label}）：未命中品牌图标（疑似旧占位/默认图标）`);
      for (const d of groupDetail) console.log(`       ${d}`);
      allPass = false;
    }
  } catch (e) {
    console.log(`  ❌ ${t.key}（${t.label}）：解析异常 ${e.message}`);
    allPass = false;
  }
}

console.log(allPass ? '\n[通过] 所有产物图标与品牌 LOGO 一致' : '\n[不通过] 存在产物图标不一致');
process.exit(allPass ? 0 : 1);
