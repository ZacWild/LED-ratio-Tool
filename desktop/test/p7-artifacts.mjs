/**
 * LED-ratio-Tool 桌面版 · P7-4 正式产物指纹
 * ============================================================================
 * 为每个交付物给出**可核验的身份信息**：
 *   版本号（PE 的 FileVersion / ProductVersion，不是 package.json 的字符串）
 *   字节大小
 *   SHA-256
 *   签名状态（PE 证书表是否非空 —— 空即未签名，这一点不依赖任何外部工具）
 *
 * 为什么不用 PowerShell 的 Get-AuthenticodeSignature：
 *   那需要从 Node 里拉起 PowerShell，本工程的自动化环境会拦截这条路径。
 *   而「未签名」的判定只需要一件事：**PE 的可选头里 Certificate Table
 *   （数据目录第 5 项，索引 4）的 Size 是否为 0**。Size=0 ⇒ 文件里根本
 *   没有 Authenticode 签名块。这个判据是确定性的，且可在任何机器上复现。
 *
 * 用法：node test/p7-artifacts.mjs
 * 退出码：0 = 产物齐备且指纹采集完成；3 = 产物缺失（环境阻塞）
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const DIST = path.join(DESKTOP, 'dist');
const REPORTS = path.join(__dirname, 'reports');

const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const V = pkg.version;

const ARTIFACTS = [
  { key: 'nsis', label: 'NSIS 安装程序', file: path.join(DIST, `LED Ratio Tool-${V}-x64-setup.exe`) },
  { key: 'portable', label: 'Portable 便携版', file: path.join(DIST, `LED Ratio Tool-${V}-x64-portable.exe`) },
  { key: 'app', label: '应用主程序（win-unpacked）', file: path.join(DIST, 'win-unpacked', 'LED Ratio Tool.exe') },
  { key: 'uninstaller', label: '卸载器（安装后生成）', file: null, optional: true },
  { key: 'blockmap', label: '安装包 blockmap', file: path.join(DIST, `LED Ratio Tool-${V}-x64-setup.exe.blockmap`), optional: true, notPe: true },
];

/* ============================ PE 解析 ============================ */
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
      name: buf.toString('ascii', s, s + 8).replace(/\0+$/, ''),
      vsize: buf.readUInt32LE(s + 8),
      vaddr: buf.readUInt32LE(s + 12),
      rawSize: buf.readUInt32LE(s + 16),
      rawPtr: buf.readUInt32LE(s + 20),
    });
  }
  return { buf, peOff, opt, is64, dd, sections, numSections };
}

/** 证书表（Authenticode 签名块）：数据目录索引 4 */
function readCertTable(buf) {
  const pe = readSections(buf);
  const off = pe.dd + 4 * 8;
  const vaddr = buf.readUInt32LE(off);
  const size = buf.readUInt32LE(off + 4);
  return { certificateTableOffset: vaddr, certificateTableSize: size, signed: size > 0 };
}

/** 从 RT_VERSION 资源里读 FileVersion / ProductVersion（VS_FIXEDFILEINFO + StringFileInfo） */
function readVersionInfo(buf) {
  const pe = readSections(buf);
  const resRva = buf.readUInt32LE(pe.dd + 2 * 8);
  if (!resRva) return null;
  const rva2off = (rva) => {
    for (const s of pe.sections) {
      if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) return s.rawPtr + (rva - s.vaddr);
    }
    return -1;
  };
  const base = rva2off(resRva);
  if (base < 0) return null;
  const readDir = (off) => {
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
  };

  // 找 type=16 (RT_VERSION)
  for (const t of readDir(base)) {
    if (!t.subdir || t.id !== 16) continue;
    for (const n of readDir(base + t.off)) {
      if (!n.subdir) continue;
      const l = readDir(base + n.off)[0];
      if (!l) continue;
      const de = base + l.off;
      const dataRva = buf.readUInt32LE(de);
      const dataSize = buf.readUInt32LE(de + 4);
      const d = rva2off(dataRva);
      if (d < 0) continue;
      const res = buf.subarray(d, d + dataSize);

      // VS_FIXEDFILEINFO 在 "VS_VERSION_INFO\0" 之后按 4 字节对齐
      let fixed = null;
      const keyEnd = res.indexOf(Buffer.from([0, 0]));
      for (let p = 0; p + 52 <= res.length; p++) {
        if (res.readUInt32LE(p) === 0xfeef04bd) {
          const ms = res.readUInt32LE(p + 8);
          const ls = res.readUInt32LE(p + 12);
          const pms = res.readUInt32LE(p + 16);
          const pls = res.readUInt32LE(p + 20);
          fixed = {
            fileVersion: `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`,
            productVersion: `${pms >>> 16}.${pms & 0xffff}.${pls >>> 16}.${pls & 0xffff}`,
          };
          break;
        }
      }
      // StringFileInfo：直接扫 UTF-16LE 的 "FileVersion" / "ProductVersion"
      const utf16 = res.toString('utf16le');
      const grab = (name) => {
        const i = utf16.indexOf(name + '\u0000');
        if (i < 0) return null;
        // 值在同名键之后、下一个键名之前；取紧随其后的非空串
        const rest = utf16.slice(i + name.length + 1);
        const parts = rest.split('\u0000').filter((x) => x.trim().length);
        return parts.length ? parts[0].trim() : null;
      };
      return {
        fileVersion: grab('FileVersion') || (fixed && fixed.fileVersion) || null,
        productVersion: grab('ProductVersion') || (fixed && fixed.productVersion) || null,
        fileDescription: grab('FileDescription') || null,
        companyName: grab('CompanyName') || null,
        fixed,
        _keyEnd: keyEnd,
      };
    }
  }
  return null;
}

const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (d) => h.update(d));
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(DESKTOP, '..'), encoding: 'utf8' });
  return (r.stdout || '').trim();
}

/**
 * 🔴 归因校验（PROV）：产物到底是哪个源码构建的？
 *    `git rev-parse HEAD` 只能说明"采集指纹时 HEAD 指向哪"，**不能**说明
 *    "产物由它构建" —— 若打包时工作区是脏的（本轮就是这样：HEAD=aa6de60，
 *    但 SET-03 修复尚未提交），光记 HEAD 会把产物错标成旧提交。
 *    所以直接把 asar 里的源码文件与工作区同路径文件做 SHA-256 比对：
 *    一致 = 产物确实由当前工作区内容构建；不一致 = 明确报出，不猜。
 *    @electron/asar 由打包工具链自带；解析不到时记 SKIP，不假装通过。
 */
function verifyProvenance() {
  const asarPath = path.join(DESKTOP, 'dist', 'win-unpacked', 'resources', 'app.asar');
  const files = ['renderer/app.js', 'renderer/core.js', 'main/main.js', 'preload/preload.js'];
  if (!fs.existsSync(asarPath)) {
    return { status: 'SKIP', reason: 'dist/win-unpacked/resources/app.asar 不存在（先打包）', files: [] };
  }
  let asar;
  try {
    asar = require('@electron/asar');
  } catch {
    return { status: 'SKIP', reason: '无法解析 @electron/asar（工具链未安装）', files: [] };
  }
  const out = [];
  for (const rel of files) {
    const diskPath = path.join(DESKTOP, rel);
    if (!fs.existsSync(diskPath)) {
      out.push({ file: rel, status: 'MISSING_LOCAL' });
      continue;
    }
    let packed;
    try {
      packed = asar.extractFile(asarPath, rel);
    } catch {
      out.push({ file: rel, status: 'NOT_IN_ASAR' });
      continue;
    }
    const a = crypto.createHash('sha256').update(packed).digest('hex');
    const b = crypto.createHash('sha256').update(fs.readFileSync(diskPath)).digest('hex');
    out.push({ file: rel, asarSha256: a, worktreeSha256: b, match: a === b });
  }
  const judged = out.filter((r) => typeof r.match === 'boolean');
  return {
    status: judged.length && judged.every((r) => r.match) ? 'MATCH' : 'MISMATCH',
    asar: path.relative(DESKTOP, asarPath),
    files: out,
  };
}

async function main() {
  console.log('=== P7-4 正式产物指纹 ===\n');
  console.log(`版本号（package.json）= ${V}`);
  console.log(`源码提交 = ${gitHead() || '(未知)'}\n`);

  const missing = ARTIFACTS.filter((a) => a.file && !fs.existsSync(a.file));
  const required = ARTIFACTS.filter((a) => !a.optional);
  if (required.some((a) => !fs.existsSync(a.file))) {
    for (const a of required) if (!fs.existsSync(a.file)) console.error(`❌ 缺失：${a.file}`);
    console.error('\n❌ 环境阻塞：正式产物不齐（先执行 npm run build:win）');
    process.exit(3);
  }

  const rows = [];
  for (const a of ARTIFACTS) {
    if (!a.file || !fs.existsSync(a.file)) {
      rows.push({ key: a.key, label: a.label, exists: false });
      continue;
    }
    const st = fs.statSync(a.file);
    const sig = a.notPe ? { signed: null, certificateTableSize: null, status: '不适用（非 PE）' } : {};
    let ver = null;
    if (!a.notPe) {
      // 只为读头部/资源，整文件读入做 PE 解析（<=250MB，可接受）
      const buf = fs.readFileSync(a.file);
      const ct = readCertTable(buf);
      Object.assign(sig, ct, {
        status: ct.signed ? 'SIGNED（存在证书表）' : 'NotSigned（证书表为空）',
      });
      ver = readVersionInfo(buf);
    }
    const sha = await sha256File(a.file);
    rows.push({
      key: a.key,
      label: a.label,
      file: path.basename(a.file),
      exists: true,
      bytes: st.size,
      sha256: sha,
      fileVersion: ver && ver.fileVersion,
      productVersion: ver && ver.productVersion,
      fileDescription: ver && ver.fileDescription,
      signature: {
        signed: sig.signed,
        certificateTableSize: sig.certificateTableSize,
        status: sig.status,
      },
    });
  }

  console.log('产物                                版本              大小           签名');
  console.log('─'.repeat(96));
  for (const r of rows) {
    if (!r.exists) {
      console.log(`${r.label.padEnd(32)}（不存在）`);
      continue;
    }
    const mb = (r.bytes / 1024 / 1024).toFixed(2) + ' MB';
    console.log(
      `${r.file.padEnd(40)}${String(r.fileVersion || '-').padEnd(10)}${mb.padStart(12)}   ${r.signature.status}`,
    );
    console.log(`  ${r.sha256}`);
  }

  const provenance = verifyProvenance();

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      version: V,
      gitHead: gitHead(),
      provenance,
      electron: (() => {
        try {
          return JSON.parse(fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
        } catch {
          return null;
        }
      })(),
      productName: 'LED Ratio Tool',
      missingOptional: missing.map((m) => m.key),
    },
    artifacts: rows,
    signatureSummary: {
      anySigned: rows.some((r) => r.exists && r.signature.signed === true),
      verdict: rows.every((r) => !r.exists || r.signature.signed !== true)
        ? '全部未签名（无代码签名证书）'
        : '存在已签名产物',
    },
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, 'p7-artifacts.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(`\n📄 ${out}`);
  console.log(`🔏 签名结论：${report.signatureSummary.verdict}`);
  if (provenance.status === 'MATCH') {
    console.log(`🔗 归因：asar 内源码与工作区 ${provenance.files.filter((f) => f.match).length}/${provenance.files.filter((f) => typeof f.match === 'boolean').length} 个文件逐字节一致（产物确由当前源码构建）`);
  } else if (provenance.status === 'MISMATCH') {
    console.log('🔴 归因：产物内源码与工作区不一致，见 report.meta.provenance.files —— 不得把 gitHead 当作构建提交');
  } else {
    console.log(`⏭️ 归因：${provenance.status}（${provenance.reason}）`);
  }
}

main().catch((e) => {
  console.error('未捕获异常：', e);
  process.exit(1);
});
