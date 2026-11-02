/**
 * LED-ratio-Tool 桌面版 · P7-2 Electron 安全配置「实体验证」
 * ============================================================================
 * 原则：**只认最终产物**。配置文件写了 `runAsNode: false` 不等于二进制里真的关了。
 *       本脚本对已打包的 EXE 做两件事：
 *         ① 静态：从二进制里把 Electron Fuse Wire 读出来（不是读 yml）
 *         ② 动态：真的把进程跑起来，用可观测行为证明 fuse 生效
 *
 * 断言分两层，缺一不可：
 *   · 静态读到的值与「安全目标」一致（不是与配置文件一致 —— 配置可写错）
 *   · 动态行为与静态结论互相印证（静态说关，运行时必须真的关）
 *
 * 静态检查项：
 *   F-01  在 exe 中定位 Fuse Wire（sentinel 存在且唯一）
 *   F-02  Wire 头合法（version=1、长度 ≥ 8）
 *   F-03  逐项读取 8 个 fuse，与安全目标表比对
 *   F-04  与官方 @electron/fuses 的解析结果交叉一致（防自写解析器出错）
 *   F-05  exe 内 ELECTRONASAR 资源存在，且其中的 app.asar 摘要 == app.asar **header JSON** 的实测 SHA-256
 *   F-06  与「未翻转的官方 electron.exe」对比，列出被翻转的 fuse（证明翻转动作真实发生）
 *
 * 动态检查项（每一项都要真实启动进程）：
 *   D-01  ELECTRON_RUN_AS_NODE=1 → 不得退化为 Node 执行器（必须仍启动真实应用）
 *   D-02  NODE_OPTIONS=--require <marker> → marker 不得生成
 *   D-03  --inspect=<port> → 调试端口不得 LISTEN
 *   D-04a 篡改 asar header 内摘要 → 启动前即被拒（entry '<header>' 校验）
 *   D-04b 篡改主进程脚本首块 → 启动前即被拒（asar per-file hash 校验）
 *   D-04c 篡改渲染资源末块 → 必须被检测（Chromium 流校验，允许已启动后 FATAL；见边界说明）
 *   D-05  app.asar 在 + resources/app/ 恶意目录在 → 必须只跑 asar 版
 *   D-06  移走 app.asar 只留 resources/app/ → 必须拒绝加载目录版（onlyLoadAppFromAsar 生效）
 *
 * ⚠️ 关于 D-04c 的实测边界（不掩盖）：
 *   Electron 对 asar 的完整性校验有两条路径 ——
 *     · Node 侧 fs 读取：asar 库按 header 里 per-file integrity.block 做同步校验，失败即阻断 require。
 *     · Chromium 网络层读取（file:// 加载渲染资源）：asar_file_validator 按 block 流式校验，
 *       错误在「读到损坏块并结束该文件流」时抛出，此时主进程往往已经打印了启动日志。
 *   因此「篡改渲染资源」不等于「进程起不来」，但一定不等于「静默通过」——它会 FATAL 崩溃并非零退出。
 *   D-04c 断言的就是这个真实属性，而不是人为要求它必须启动失败。
 *
 * 全部动态用例结束后自动还原 resources/ 并校验 SHA-256 与原值一致。
 *
 * 用法：
 *   node test/fuses-verify.mjs                       # 默认校验 dist/win-unpacked
 *   node test/fuses-verify.mjs --exe=<路径>          # 指定 exe（如便携版/安装版）
 * 退出码：0 = 全部通过；1 = 存在不通过项；3 = 环境阻塞（产物缺失）
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const REPORTS = path.join(__dirname, 'reports');

/* ============================ 参数 ============================ */
const argExe = process.argv.find((a) => a.startsWith('--exe='));
const EXE = argExe
  ? path.resolve(argExe.slice(6))
  : path.join(DESKTOP, 'dist', 'win-unpacked', 'LED Ratio Tool.exe');
const APP_DIR = path.dirname(EXE);
const RES = path.join(APP_DIR, 'resources');
const ASAR = path.join(RES, 'app.asar');

/* ============================ Fuse 定义 ============================ */
const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
const ST = { DISABLE: 48, ENABLE: 49, REMOVED: 114, INHERIT: 144 };
const FUSE_NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
];
/**
 * 安全目标表 —— 不是「配置写的是什么」，而是「发行版应该是什么」。
 * 依据：electron-builder.yml 的 electronFuses 段 + SEC-20 安全基线。
 */
const EXPECTED = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: false,
};

const results = [];
const rec = (id, title, ok, detail, extra = {}) =>
  results.push({ id, title, ok, detail: detail || '', ...extra });

/* ============================ 1. Fuse Wire 解析 ============================ */
function readFuseWire(file) {
  const buf = fs.readFileSync(file);
  const s = Buffer.from(SENTINEL, 'ascii');
  const first = buf.indexOf(s);
  if (first === -1) throw new Error('未找到 fuse sentinel —— 该二进制不含 fuse wire');
  const last = buf.lastIndexOf(s);
  const positions = first === last ? [first] : [first, last];
  const wires = positions.map((p) => {
    const at = p + s.length;
    const version = buf[at];
    const length = buf[at + 1];
    const states = [];
    for (let i = 0; i < length; i++) states.push(buf[at + 2 + i]);
    return { sentinelAt: p, version, length, states };
  });
  return { size: buf.length, sentinelCount: positions.length, wires };
}

const stateName = (v) =>
  v === ST.DISABLE ? 'DISABLE' : v === ST.ENABLE ? 'ENABLE' : v === ST.REMOVED ? 'REMOVED' : v === ST.INHERIT ? 'INHERIT' : `0x${v.toString(16)}`;

/* ============================ 2. PE 资源读取（ELECTRONASAR） ============================ */
function readPeResource(file, wantedName) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 2) !== 'MZ') throw new Error('不是 PE 文件');
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.toString('ascii', peOff, peOff + 4) !== 'PE\0\0') throw new Error('缺 PE 签名');
  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const is64 = buf.readUInt16LE(opt) === 0x20b;
  const dd = opt + (is64 ? 112 : 96);
  const resRva = buf.readUInt32LE(dd + 2 * 8);
  if (!resRva) throw new Error('无资源目录');

  const sections = [];
  const secStart = opt + optSize;
  for (let i = 0; i < numSections; i++) {
    const s = secStart + i * 40;
    sections.push({
      vaddr: buf.readUInt32LE(s + 12),
      vsize: buf.readUInt32LE(s + 8),
      rawSize: buf.readUInt32LE(s + 16),
      rawPtr: buf.readUInt32LE(s + 20),
    });
  }
  const rva2off = (rva) => {
    for (const s of sections) {
      if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) return s.rawPtr + (rva - s.vaddr);
    }
    throw new Error(`RVA 0x${rva.toString(16)} 越界`);
  };

  const base = rva2off(resRva);
  const readDir = (off) => {
    const nNamed = buf.readUInt16LE(off + 12);
    const nId = buf.readUInt16LE(off + 14);
    const out = [];
    for (let i = 0; i < nNamed + nId; i++) {
      const e = off + 16 + i * 8;
      const nameField = buf.readUInt32LE(e);
      const offField = buf.readUInt32LE(e + 4);
      let name;
      if (nameField & 0x80000000) {
        const strAt = base + (nameField & 0x7fffffff);
        const len = buf.readUInt16LE(strAt);
        name = buf.toString('utf16le', strAt + 2, strAt + 2 + len * 2);
      } else {
        name = `#${nameField}`;
      }
      out.push({ name, subdir: (offField & 0x80000000) !== 0, off: offField & 0x7fffffff });
    }
    return out;
  };

  for (const t of readDir(base)) {
    if (!t.subdir) continue;
    for (const n of readDir(base + t.off)) {
      if (n.name !== wantedName) continue;
      const l = readDir(base + n.off)[0];
      const de = base + l.off;
      const dataRva = buf.readUInt32LE(de);
      const dataSize = buf.readUInt32LE(de + 4);
      const d = rva2off(dataRva);
      return { type: t.name, name: n.name, data: buf.subarray(d, d + dataSize) };
    }
  }
  return null;
}

/* ============================ 2.5 asar 头部解析（F-05 / D-04 共用） ============================ */
/**
 * asar 头部是 Pickle 双层封装：
 *   [4B = 4][4B headerBufLen][4B payloadSize][4B jsonLen][json …]
 * → json 起点 = 16，长度 = readUInt32LE(12)，payload 起点 = 8 + headerBufLen
 * 注意：electron-builder 的 ELECTRONASAR 存的是 **header JSON 字符串**的 SHA-256，
 *       不是整档文件哈希 —— 早期若拿整档哈希去比，必然「不一致」。
 */
function parseAsarHeader(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 16) throw new Error('asar 文件过短');
  const headerBufLen = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  if (16 + jsonLen > buf.length) throw new Error(`asar header 长度越界：jsonLen=${jsonLen} total=${buf.length}`);
  const headerText = buf.toString('utf8', 16, 16 + jsonLen);
  const header = JSON.parse(headerText);
  const files = [];
  const walk = (node, prefix) => {
    for (const [name, v] of Object.entries(node.files || {})) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (v.files) walk(v, rel);
      // ⚠️ asar header 里 offset/size 是 **字符串**（asar 为规避大文件精度问题写成字符串），
      //    直接参与加法会变成字符串拼接，导致篡改点算错。必须 Number() 归一。
      else files.push({ rel, size: Number(v.size) || 0, offset: Number(v.offset) || 0, integrity: v.integrity || null });
    }
  };
  walk(header, '');
  return { buf, headerBufLen, jsonLen, headerText, header, payloadStart: 8 + headerBufLen, files };
}
const sha256Text = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/* ============================ 2.6 Windows 句柄/进程工具 ============================ */
/** 强杀本 exe 的所有实例。破坏性用例之间必须做，否则 rename 会 EBUSY。 */
function killApp() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    const p = spawn('taskkill', ['/F', '/IM', path.basename(EXE)], { stdio: 'ignore', windowsHide: true });
    p.on('exit', () => resolve());
    p.on('error', () => resolve());
  });
}

/**
 * 带重试的文件操作 —— 打包产物在 Windows 上常被刚退出的进程短暂占用（EBUSY/EPERM）。
 * 失败一次就杀进程 + 递增等待，最多 8 次。这不是「忽略错误」，是把瞬时占用与真实失败区分开。
 */
async function withRetry(fn, label, tries = 8) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return fn();
    } catch (e) {
      last = e;
      await killApp();
      await sleep(400 + i * 300);
    }
  }
  throw new Error(`${label} 重试 ${tries} 次仍失败：${last && last.message}`);
}

/* ============================ 3. 进程探针工具 ============================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 启一个进程并限时收割。返回 { code, signal, stdout, stderr, timedOut }
 * ELECTRON_RUN_AS_NODE 之类的变量由 env 显式控制（绝不从父进程继承意外状态）。
 */
function run(exe, args, { env = {}, timeout = 8000, cwd } = {}) {
  return new Promise((resolve) => {
    const baseEnv = { ...process.env };
    delete baseEnv.ELECTRON_RUN_AS_NODE;
    delete baseEnv.NODE_OPTIONS;
    const child = spawn(exe, args, {
      cwd: cwd || APP_DIR,
      env: { ...baseEnv, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已退出 */
      }
      resolve({ code: null, signal: 'TIMEOUT', stdout, stderr, timedOut: true });
    }, timeout);
    child.on('exit', (code, signal) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut: false });
    });
  });
}

function portListening(port, timeout = 700) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const end = (v) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => end(true));
    sock.once('timeout', () => end(false));
    sock.once('error', () => end(false));
  });
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/* ============================ 4. 主流程 ============================ */
async function main() {
  console.log('=== P7-2 Electron 安全配置实体验证 ===');
  console.log(`目标产物：${EXE}`);
  if (!fs.existsSync(EXE)) {
    console.error('❌ 环境阻塞：找不到打包产物（先执行 npm run build:win）');
    process.exit(3);
  }
  console.log(`产物大小：${fs.statSync(EXE).size} B`);
  console.log(`app.asar  ：${fs.existsSync(ASAR) ? fs.statSync(ASAR).size + ' B' : '（不存在）'}\n`);
  if (!fs.existsSync(ASAR)) {
    // 没有 asar 就不是一个可验证的成品：F-05 与全部 ASAR 相关用例都失去意义。
    // 此时报「环境阻塞」而不是「验证失败」，避免把打包残缺伪装成安全配置缺陷。
    console.error('❌ 环境阻塞：exe 存在但 resources/app.asar 缺失（打包不完整）');
    process.exit(3);
  }

  /* ---------------- 静态 ---------------- */
  const wire = readFuseWire(EXE);
  rec('F-01', '在 exe 中定位 Fuse Wire（sentinel 存在）', wire.wires.length >= 1,
    `sentinel 出现 ${wire.sentinelCount} 处${wire.sentinelCount > 1 ? '（universal 双切片）' : ''}`,
    { sentinelCount: wire.sentinelCount });

  const w = wire.wires[0];
  const headOk = w.version === 1 && w.length >= FUSE_NAMES.length;
  rec('F-02', 'Wire 头合法（version=1，长度 ≥ 8）', headOk, `version=${w.version} length=${w.length}`);

  const actual = {};
  FUSE_NAMES.forEach((n, i) => {
    const v = w.states[i];
    actual[n] = v === ST.ENABLE ? true : v === ST.DISABLE ? false : stateName(v);
  });

  const mismatches = FUSE_NAMES.filter((n) => actual[n] !== EXPECTED[n]);
  rec('F-03', '8 个 fuse 逐项与安全目标一致', mismatches.length === 0,
    mismatches.length ? mismatches.map((n) => `${n}：期望 ${EXPECTED[n]}，实际 ${actual[n]}`).join('；') : '全部一致',
    { fuses: actual });

  // F-04 交叉核对官方库
  let libVerdict = '未安装 @electron/fuses（跳过交叉核对）';
  let libOk = true;
  try {
    const libPath = path.join(DESKTOP, 'node_modules', '@electron', 'fuses', 'dist', 'index.js');
    if (fs.existsSync(libPath)) {
      const lib = (await import(pathToFileURL(libPath).href)).default ?? (await import(pathToFileURL(libPath).href));
      const got = await lib.getCurrentFuseWire(EXE);
      const diff = FUSE_NAMES.filter((n, i) => {
        const libVal = got[`${i}`] !== undefined ? got[`${i}`] : got[n];
        const expectState = EXPECTED[n] ? ST.ENABLE : ST.DISABLE;
        return libVal !== undefined && libVal !== expectState;
      });
      libOk = diff.length === 0;
      libVerdict = libOk
        ? '官方库解析结果与自写解析器、与安全目标三方一致'
        : `官方库读数不符：${diff.join(', ')}`;
    }
  } catch (e) {
    libOk = false;
    libVerdict = `交叉核对失败：${e.message}`;
  }
  rec('F-04', '与官方 @electron/fuses 解析结果交叉一致', libOk, libVerdict);

  // F-05 ELECTRONASAR 资源（口径：header JSON 的哈希）
  let asarResOk = false;
  let asarResDetail = '';
  let asarIntegrity = null;
  let headerSha = '';
  try {
    const res = readPeResource(EXE, 'ELECTRONASAR');
    if (!res) {
      asarResDetail = 'exe 内没有 ELECTRONASAR 资源';
    } else {
      const raw = res.data.toString('utf8').replace(/\0+$/, '');
      const json = JSON.parse(raw);
      asarIntegrity = json;
      // electron-builder 写入的是 **数组** [{ file, alg, value }]，不是对象
      const list = Array.isArray(json) ? json : json.files ? Object.entries(json.files).map(([file, value]) => ({ file, value })) : [];
      const entry = list.find((x) => String(x.file || '').replace(/\\/g, '/').endsWith('app.asar'));
      const embedded = entry ? String(entry.value || entry.hash || '') : '';
      headerSha = fs.existsSync(ASAR) ? sha256Text(parseAsarHeader(ASAR).headerText) : '';
      asarResOk = Boolean(embedded && headerSha && embedded.toLowerCase() === headerSha.toLowerCase());
      asarResDetail = asarResOk
        ? `嵌入值 == sha256(app.asar header JSON)（${headerSha.slice(0, 16)}…，alg=${entry.alg || 'SHA256'}，条目 ${entry.file}）`
        : embedded
          ? `嵌入值与 header 哈希不一致：embedded=${embedded.slice(0, 24)}… header=${headerSha.slice(0, 24)}…`
          : '资源里没有 app.asar 条目';
    }
  } catch (e) {
    asarResDetail = `读取失败：${e.message}`;
  }
  rec('F-05', 'exe 内 ELECTRONASAR == app.asar header JSON 的 SHA-256（非整档哈希）', asarResOk, asarResDetail,
    { asarIntegrity, headerSha });

  // F-06 与未翻转的官方 electron.exe 对比
  let flipDetail = '未找到 node_modules/electron/dist/electron.exe，跳过对比';
  let flipOk = true;
  try {
    const stock = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (fs.existsSync(stock)) {
      const sw = readFuseWire(stock).wires[0];
      const flipped = FUSE_NAMES.filter((n, i) => {
        const a = sw.states[i];
        const b = w.states[i];
        return a !== b;
      });
      flipDetail = flipped.length
        ? `相对官方 electron.exe 翻转了 ${flipped.length} 个：${flipped.map((n) => `${n}(${stateName(sw.states[FUSE_NAMES.indexOf(n)])}→${stateName(w.states[FUSE_NAMES.indexOf(n)])})`).join('，')}`
        : '与官方 electron.exe 完全一致（⚠️ 说明 fuses 未被翻转）';
      flipOk = flipped.length > 0;
    }
  } catch (e) {
    flipDetail = `对比失败：${e.message}`;
  }
  rec('F-06', '相对官方 electron.exe 确实发生了 fuse 翻转', flipOk, flipDetail);

  /* ---------------- 动态 ---------------- */
  // 探针工作目录放系统临时目录，**不放 test/reports/**：
  //   reports/ 是入库的证据目录、也会作为 CI artifact 上传，
  //   塞一个 356 KB 的 asar 备份进去既污染证据也污染 artifact。
  const markerDir = path.join(os.tmpdir(), 'led-ratio-fuses-probe');
  fs.mkdirSync(markerDir, { recursive: true });
  const marker = path.join(markerDir, `nodeopt-${Date.now()}.txt`);
  const markerJs = path.join(markerDir, 'marker.cjs');
  fs.writeFileSync(markerJs, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'NODE_OPTIONS 被执行了');\n`);
  if (fs.existsSync(marker)) fs.unlinkSync(marker);

  // D-01 ELECTRON_RUN_AS_NODE
  {
    const r = await run(EXE, ['-e', "console.log('NODE_MODE_ACTIVE')"], {
      env: { ELECTRON_RUN_AS_NODE: '1' },
      timeout: 7000,
    });
    const degraded = /NODE_MODE_ACTIVE/.test(r.stdout);
    const realApp = /\[LED-VERSIONS\]/.test(r.stdout);
    rec('D-01', 'ELECTRON_RUN_AS_NODE=1 不退化为 Node 执行器', !degraded && realApp,
      degraded
        ? '❌ 二进制执行了 -e 脚本 —— RunAsNode 实际未关闭'
        : realApp
          ? '环境变量被忽略，仍启动了真实应用（stdout 有 [LED-VERSIONS]）'
          : `未执行 -e，但也没看到应用启动日志（timedOut=${r.timedOut}）`,
      { stdout: r.stdout.slice(0, 400) });
  }

  // D-02 NODE_OPTIONS
  {
    const r = await run(EXE, [], {
      env: { NODE_OPTIONS: `--require "${markerJs.replace(/\\/g, '/')}"` },
      timeout: 7000,
    });
    const fired = fs.existsSync(marker);
    if (fired) fs.unlinkSync(marker);
    rec('D-02', 'NODE_OPTIONS=--require 不被执行', !fired,
      fired ? '❌ marker 文件被生成 —— NODE_OPTIONS 实际生效' : '未生成 marker，NODE_OPTIONS 被丢弃',
      { appStarted: /\[LED-VERSIONS\]/.test(r.stdout) });
  }

  // D-03 --inspect
  {
    const port = 9339;
    let listening = false;
    const p = run(EXE, [`--inspect=${port}`], { timeout: 7000 });
    for (let i = 0; i < 12; i++) {
      await sleep(400);
      if (await portListening(port)) {
        listening = true;
        break;
      }
    }
    const r = await p;
    const dbg = /Debugger listening on/i.test(r.stdout + r.stderr);
    rec('D-03', '--inspect 不开启 Node 调试端口', !listening && !dbg,
      listening ? `❌ 端口 ${port} 处于 LISTEN` : dbg ? '❌ 出现 "Debugger listening" 输出' : `端口 ${port} 全程未监听`,
      { port, listening });
  }

  /* ---------------- 破坏性用例：先备份，结束必还原 ---------------- */
  const backup = path.join(markerDir, 'app.asar.orig');
  const evilDir = path.join(RES, 'app');
  const origHash = fs.existsSync(ASAR) ? sha256(ASAR) : null;
  let restoreOk = true;
  let restoreDetail = '';

  try {
    await killApp(); // 前序用例的进程可能还占着 asar 句柄，先清场
    fs.copyFileSync(ASAR, backup);

    // 预先算出三个篡改点（避免在 mutate 回调里抛异常打乱还原流程）
    const baseAsar = parseAsarHeader(backup);
    // ① header 内第一处 64 位摘要（per-file integrity.hash），改一个十六进制字符 → JSON 仍合法，只改字节
    const hm = /"hash"\s*:\s*"([0-9a-f]{64})"/i.exec(baseAsar.headerText);
    const headerTamperAt = hm ? 16 + hm.index + hm[0].indexOf(hm[1]) : -1;
    // ② 主进程侧脚本（Node 读取路径）首字节
    const mainEntry = baseAsar.files.find((f) => f.rel === 'main/csp.js') || baseAsar.files[0];
    const mainTamperAt = baseAsar.payloadStart + mainEntry.offset;
    // ③ 渲染资源（Chromium 网络层读取路径）末字节
    const tailEntry = baseAsar.files.find((f) => f.rel === 'renderer/styles.css') || baseAsar.files[baseAsar.files.length - 1];

    /** 篡改 → 启动 → 还原，返回只读观测结果。
     *  带双重自检：下标必须是合法整数、且字节必须真的被改动 —— 防止「空操作」把用例骗绿。 */
    const tamperTrial = async (at, mutate) => {
      if (!Number.isInteger(at) || at < 0 || at >= baseAsar.buf.length) {
        throw new Error(`篡改下标非法：${at}（应为 0..${baseAsar.buf.length - 1} 的整数）`);
      }
      const pristine = fs.readFileSync(backup);
      const buf = Buffer.from(pristine);
      mutate(buf);
      if (Buffer.compare(buf, pristine) === 0) throw new Error(`篡改未生效：@${at} 字节未发生变化`);
      await withRetry(() => fs.writeFileSync(ASAR, buf), '写入篡改后的 asar');
      const r = await run(EXE, [], { timeout: 9000 });
      await killApp();
      await withRetry(() => fs.copyFileSync(backup, ASAR), '还原 asar');
      const log = r.stdout + r.stderr;
      return { started: /\[LED-VERSIONS\]/.test(r.stdout), code: r.code, log, r };
    };

    // D-04a header 篡改
    if (headerTamperAt > 0) {
      const t = await tamperTrial(headerTamperAt, (buf) => {
        buf[headerTamperAt] = buf[headerTamperAt] === 0x61 ? 0x62 : 0x61;
      });
      const entryHeader = /Integrity check failed for asar archive entry '<header>'/i.test(t.log);
      const gotExpected = /b2251cff|Integrity check failed/i.test(t.log);
      rec(
        'D-04a',
        '篡改 asar header → 启动前即被拒（entry \'<header>\' 完整性校验）',
        !t.started && (entryHeader || gotExpected),
        t.started
          ? '❌ 篡改 header 后应用仍启动 —— EnableEmbeddedAsarIntegrityValidation 未生效'
          : entryHeader
            ? `启动前 FATAL：Integrity check failed for asar archive entry '<header>'（退出码 ${t.code}）`
            : `未启动但未见 header 校验字样（退出码 ${t.code}）`,
        { tamperAt: headerTamperAt, exitCode: t.code, stderr: t.r.stderr.slice(0, 500) },
      );
    } else {
      rec('D-04a', "篡改 asar header → 启动前即被拒", false, 'header 内未找到 64 位摘要字段，无法构造篡改点');
    }

    // D-04b 主进程脚本首块篡改
    {
      const t = await tamperTrial(mainTamperAt, (buf) => {
        buf[mainTamperAt] = buf[mainTamperAt] ^ 0xff;
      });
      const violation = /ASAR Integrity Violation/i.test(t.log);
      rec(
        'D-04b',
        '篡改主进程脚本（Node 读取路径）→ 启动前即被拒（per-file hash 校验）',
        !t.started && violation,
        t.started
          ? `❌ 篡改 ${mainEntry.rel} 后仍启动 —— 主进程侧 per-file 校验未生效`
          : violation
            ? `启动前被拒：ASAR Integrity Violation（${mainEntry.rel}@${mainEntry.offset}，退出码 ${t.code}）`
            : `未启动但未见 ASAR Integrity Violation（退出码 ${t.code}）`,
        { tamperAt: mainTamperAt, file: mainEntry.rel, exitCode: t.code, stderr: t.r.stderr.slice(0, 500) },
      );
    }

    // D-04c 渲染资源末块篡改 —— 断言「必须被检测」，不假设它一定阻断启动
    {
      const at = baseAsar.payloadStart + tailEntry.offset + tailEntry.size - 1;
      const t = await tamperTrial(at, (buf) => {
        buf[at] = buf[at] ^ 0xff;
      });
      const detected = /Failed to validate block|ASAR Integrity Violation|hash mismatch/i.test(t.log);
      const nonZero = t.code !== 0;
      rec(
        'D-04c',
        '篡改渲染资源末块 → 必须被检测并非零退出（允许已启动后 FATAL，见边界说明）',
        detected && nonZero,
        !detected
          ? '❌ 篡改后无任何校验报错 —— 渲染侧 payload 不受保护'
          : t.started
            ? `已检测但未阻断启动：应用先启动，读取 ${tailEntry.rel} 到损坏块后 FATAL（退出码 ${t.code}）—— Chromium 侧为流式 block 校验，错误时点在 stream end`
            : `启动前即被拒（退出码 ${t.code}）`,
        { tamperAt: at, file: tailEntry.rel, started: t.started, exitCode: t.code, stderr: t.r.stderr.slice(0, 500) },
      );
    }

    // D-05 asar 与恶意目录并存 → 只认 asar
    {
      await withRetry(() => fs.mkdirSync(evilDir, { recursive: true }), '创建 resources/app/');
      fs.writeFileSync(path.join(evilDir, 'package.json'), JSON.stringify({ name: 'evil', main: 'main.js' }));
      fs.writeFileSync(
        path.join(evilDir, 'main.js'),
        `require('node:fs').writeFileSync(${JSON.stringify(marker + '.evil')}, 'EVIL_DIR_LOADED');console.log('EVIL_APP_LOADED');\n`,
      );
      const r = await run(EXE, [], { timeout: 7000 });
      const evil = /EVIL_APP_LOADED/.test(r.stdout) || fs.existsSync(marker + '.evil');
      const realApp = /\[LED-VERSIONS\]/.test(r.stdout);
      rec('D-05', 'app.asar 与 resources/app/ 并存时只加载 asar', !evil && realApp,
        evil ? '❌ 加载了 resources/app/ 目录版' : realApp ? '加载的是 asar 版，目录版被忽略' : '应用未启动（异常）',
        { stdout: r.stdout.slice(0, 300) });
    }

    // D-06 移走 asar 只留目录 → 必须拒绝
    {
      await killApp();
      await withRetry(() => fs.renameSync(ASAR, ASAR + '.hidden'), '移走 app.asar');
      if (fs.existsSync(marker + '.evil')) fs.unlinkSync(marker + '.evil');
      const r = await run(EXE, [], { timeout: 9000 });
      const evil = /EVIL_APP_LOADED/.test(r.stdout) || fs.existsSync(marker + '.evil');
      const realApp = /\[LED-VERSIONS\]/.test(r.stdout);
      rec('D-06', 'onlyLoadAppFromAsar：asar 缺失时不回落到 resources/app/', !evil && !realApp,
        evil ? '❌ 回落到目录版并执行了它 —— onlyLoadAppFromAsar 未生效' : '既未加载目录版也未启动，符合「只认 asar」',
        { exitCode: r.code });
      await killApp();
      await withRetry(() => fs.renameSync(ASAR + '.hidden', ASAR), '还原 app.asar');
    }
  } catch (e) {
    restoreOk = false;
    restoreDetail = `破坏性用例异常：${e.message}`;
  } finally {
    // 无条件还原：先放回被移走的 asar，再比对哈希
    try {
      await killApp();
      if (fs.existsSync(ASAR + '.hidden')) {
        await withRetry(() => fs.renameSync(ASAR + '.hidden', ASAR), '放回 app.asar.hidden');
      }
      if (fs.existsSync(backup)) {
        const needsCopy = !fs.existsSync(ASAR) || sha256(ASAR) !== origHash;
        if (needsCopy) await withRetry(() => fs.copyFileSync(backup, ASAR), '写入原始 asar');
      }
      if (fs.existsSync(evilDir)) fs.rmSync(evilDir, { recursive: true, force: true });
      const nowHash = sha256(ASAR);
      const same = nowHash === origHash;
      if (!same) {
        restoreOk = false;
        restoreDetail = `还原后 SHA-256 不一致：orig=${origHash} now=${nowHash}`;
      } else if (!restoreDetail) {
        restoreDetail = `resources/ 已还原，app.asar SHA-256 与原始一致（${nowHash.slice(0, 16)}…）`;
      }
    } catch (e) {
      restoreOk = false;
      restoreDetail = `还原失败：${e.message}`;
    }
  }
  rec('R-01', '破坏性用例后产物已完整还原', restoreOk, restoreDetail);

  /* ---------------- 输出 ---------------- */
  console.log('=== 静态：二进制里的 Fuse Wire ===');
  console.log(`  sentinel 位置 ${w.sentinelAt} ｜ version=${w.version} ｜ length=${w.length}`);
  console.log('  wire = ' + String.fromCharCode(...w.states.slice(0, w.length)));
  console.log('');
  console.log('  ' + 'fuse'.padEnd(42) + '期望     实际     判定');
  for (let i = 0; i < FUSE_NAMES.length; i++) {
    const n = FUSE_NAMES[i];
    const a = actual[n];
    const ok = a === EXPECTED[n];
    console.log(
      `  ${n.padEnd(42)}${String(EXPECTED[n]).padEnd(9)}${String(a).padEnd(9)}${ok ? '✅' : '❌'}`,
    );
  }
  console.log('');

  console.log('=== 逐项结论 ===');
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.id}  ${r.title}`);
    if (r.detail) console.log(`        ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      exe: EXE,
      exeBytes: fs.statSync(EXE).size,
      appAsarBytes: origHash ? fs.statSync(ASAR).size : null,
      appAsarSha256: origHash,
      node: process.version,
      platform: process.platform,
    },
    fuseWire: { version: w.version, length: w.length, states: w.states.slice(0, w.length) },
    fuses: actual,
    expected: EXPECTED,
    results,
    summary: { total: results.length, pass: results.length - failed.length, fail: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' },
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'fuses-verify.json'), JSON.stringify(report, null, 2) + '\n');

  console.log('');
  console.log('============================================================');
  console.log(`  检查项 = ${report.summary.total} ｜ 通过 ${report.summary.pass} ｜ 失败 ${report.summary.fail}`);
  console.log(`  判定 = ${report.summary.verdict}`);
  console.log(`  📄 JSON 报告：${path.join(REPORTS, 'fuses-verify.json')}`);
  console.log('============================================================');

  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('未捕获异常：', e);
  process.exit(1);
});
