/**
 * LED-ratio-Tool 桌面版 · 资源同步与哈希门禁
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-02 —— core.js 零改动；SHA-256 哈希锁，不一致即失败
 *   DEC-03 —— HTML 版永久保留；同步脚本不得修改源文件
 *   SEC-01 —— core.js 单一真源 + 哈希锁
 *   SEC-23 —— 零依赖
 *
 * 用法：
 *   node build/sync-assets.mjs              同步 + 校验
 *   node build/sync-assets.mjs --check-only 只校验，不写入（漂移即退出码 1）
 *   node build/sync-assets.mjs --accept-core 更新 core.lock.json 的哈希
 *                                           （须业务规则变更已获项目负责人批准）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');

/** 向上查找同时具备 index.html 与 src/core.js 的目录 → 仓库根 */
function findRepoRoot(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'index.html')) && existsSync(join(dir, 'src', 'core.js'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('未找到仓库根（需同时存在 index.html 与 src/core.js）');
}

const REPO_ROOT = findRepoRoot(desktopRoot);
const SRC_DIR = join(REPO_ROOT, 'src');
const RENDERER_DIR = join(desktopRoot, 'renderer');
const LOCK_PATH = join(desktopRoot, 'core.lock.json');

/**
 * 🔒 统一哈希口径：先归一化行尾符（CRLF→LF）再求 SHA-256。
 *    理由与 test/hash-utils.mjs 相同 —— 哈希只反映业务内容，
 *    不反映 Git checkout 策略（core.autocrlf）。
 */
const normalizeEol = (buf) =>
  Buffer.isBuffer(buf) && buf.includes(0x00)
    ? buf
    : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8');
const sha256 = (buf) => createHash('sha256').update(normalizeEol(buf)).digest('hex');

const require = createRequire(import.meta.url);
const { applyDesktopAdapter, applyIndexAdapter } = require('./desktop-adapter.cjs');

/** 需要同步的资源：逐字节一致 */
const SYNC_FILES = [
  { from: join(SRC_DIR, 'core.js'), to: join(RENDERER_DIR, 'core.js'), label: 'core.js' },
  { from: join(SRC_DIR, 'app.js'), to: join(RENDERER_DIR, 'app.js'), label: 'app.js' },
  { from: join(SRC_DIR, 'styles.css'), to: join(RENDERER_DIR, 'styles.css'), label: 'styles.css' },
  // 🔒 index.html 也必须同步 —— 复用仓库原版，保证 70 个 id 契约天然一致，
  //    杜绝自造壳导致的元素缺失。桌面差异仅由 desktop-ui.js 承担。
  { from: join(REPO_ROOT, 'index.html'), to: join(RENDERER_DIR, 'index.html'), label: 'index.html' },
];

const checkOnly = process.argv.includes('--check-only');
const acceptCore = process.argv.includes('--accept-core');

/* ---- 1. core.js 哈希门禁（SEC-01 闸 1）---- */
const coreSource = readFileSync(join(SRC_DIR, 'core.js'));
const coreHash = sha256(coreSource);
const lock = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf8')) : null;

if (acceptCore) {
  const next = {
    sha256: coreHash,
    coreVersion: 'core@1.0.1',
    note:
      'core.js 业务规则红线锁。更新必须由项目负责人确认后执行 `npm run core:accept`。',
    exports: 22,
    file: 'src/core.js',
  };
  writeFileSync(LOCK_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`[core:accept] 已更新 core.lock.json → ${coreHash}`);
  process.exit(0);
}

if (!lock) {
  console.error('[同步失败] 缺少 core.lock.json —— 无法锁定 core.js 基线');
  process.exit(1);
}
if (lock.sha256 !== coreHash) {
  console.error('[同步失败] core.js 哈希不匹配（业务规则红线被改动或文件被替换）');
  console.error(`        锁中记录: ${lock.sha256}`);
  console.error(`        当前实际: ${coreHash}`);
  console.error('        若这是经确认的业务规则变更，请执行：npm run core:accept');
  process.exit(1);
}

/* ---- 2. 同步资源 ---- */
if (!checkOnly) {
  mkdirSync(RENDERER_DIR, { recursive: true });
}

const manifest = { generatedAt: new Date().toISOString(), files: [] };
let drift = 0;

for (const file of SYNC_FILES) {
  const source = readFileSync(file.from);
  const sourceHash = sha256(source);

  if (checkOnly) {
    if (!existsSync(file.to)) {
      console.error(`[漂移] ${file.label}：桌面副本不存在`);
      drift++;
      continue;
    }
    const existing = sha256(readFileSync(file.to));
    if (existing !== sourceHash && file.label === 'app.js') {
      // app.js 经桌面适配后哈希必然不同 → 改为校验适配是否已应用
      const adapted = readFileSync(file.to, 'utf8');
      const hasAdapter = adapted.includes('desktop-adapter: persistence');
      if (!hasAdapter) {
        console.error('[漂移] app.js：桌面适配未应用（缺 desktop-adapter 标记）');
        drift++;
      } else {
        console.log('[校验] app.js 桌面适配已应用（哈希差异属预期）');
      }
    } else if (existing !== sourceHash && file.label === 'index.html') {
      const adapted = readFileSync(file.to, 'utf8');
      const problems = [];
      if (!adapted.includes('desktop-ui.js')) problems.push('缺 desktop-ui.js');
      if (!adapted.includes('app.css')) problems.push('缺 app.css');
      if (adapted.includes('src/styles.css')) problems.push('路径未重写');
      if (problems.length) {
        console.error('[漂移] index.html：' + problems.join('、'));
        drift++;
      } else {
        console.log('[校验] index.html 桌面注入已应用（哈希差异属预期）');
      }
    } else if (existing !== sourceHash) {
      console.error(`[漂移] ${file.label}：桌面副本与仓库不一致`);
      console.error(`        仓库: ${sourceHash}`);
      console.error(`        副本: ${existing}`);
      drift++;
    }
  } else {
    // 🔒 写入时归一化为 LF —— 桌面副本在任何平台都一致，
    //    且与仓库入库版本（LF）逐字节相同。
    writeFileSync(file.to, normalizeEol(source));
    console.log(`[同步] ${file.label} → ${file.to.replace(desktopRoot, 'desktop')}`);
    // 🔒 app.js 需要两处桌面适配（持久化 / 剪贴板 → IPC）。
    //    适配只作用于**桌面副本**，仓库源文件零改动（DEC-03）。
    if (file.label === 'index.html') {
      // 🔒 桌面渲染层是**扁平结构**（文件直接在 renderer/），而仓库 index.html
      //    引用 src/xxx → 必须重写为同层相对路径。
      // 注入 desktop-ui.js（放在 app.js 之后 → 其 DOMContentLoaded 回调后执行，
      // 保证 app.js 的 init() 已跑完）。
      let html = readFileSync(file.to, 'utf8');
      const before = html;
      html = html
        .replace(/href="src\/styles\.css"/g, 'href="styles.css"')
        .replace(/src="src\/core\.js"/g, 'src="core.js"')
        .replace(/src="src\/app\.js"/g, 'src="app.js"');
      if (!html.includes('desktop-ui.js')) {
        html = html.replace(
          /<script src="app\.js"><\/script>/,
          '<script src="app.js"></script>\n<script src="desktop-ui.js"></script>',
        );
      }
      if (!html.includes('app.css')) {
        html = html.replace(
          /<link rel="stylesheet" href="styles\.css">/,
          '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="app.css">',
        );
      }
      if (html !== before) {
        writeFileSync(file.to, html, 'utf8');
        console.log('[注入] index.html 路径重写 + desktop-ui.js + app.css');
      }
      // 步进按钮 data-glyph 注入（DEF-02 配套；index.html 是保护对象，只改副本）
      const ir = applyIndexAdapter(file.to);
      if (ir.applied.length) {
        console.log(`[注入] index.html 步进按钮 data-glyph：${ir.applied.length} 个`);
      }
      if (ir.skipped.length) {
        console.error(`[注入警告] 未匹配 data-glyph：${ir.skipped.join(', ')}`);
        process.exitCode = 1;
      }
    }
    if (file.label === 'app.js') {
      const r = applyDesktopAdapter(file.to);
      console.log(`[适配] app.js 桌面适配已应用: ${r.applied.join(', ') || '(无)'}`);
      if (r.skipped.length) {
        console.error(`[适配警告] 未匹配: ${r.skipped.join(', ')} —— 桌面副本可能不符合预期`);
        process.exitCode = 1;
      }
    }
  }

  manifest.files.push({
    label: file.label,
    source: file.from.replace(REPO_ROOT, '.'),
    target: file.to.replace(desktopRoot, '.'),
    sha256: sourceHash,
    bytes: source.length,
  });
}

if (drift) {
  console.error(`[同步失败] ${drift} 个资源存在漂移。执行 npm run sync 重新同步。`);
  process.exit(1);
}

if (!checkOnly) {
  writeFileSync(join(RENDERER_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

console.log(`[core] SHA-256 ${coreHash}`);
console.log(`[core] 与 core.lock.json 一致（${lock.exports} 个受保护导出）`);
console.log(checkOnly ? '[校验] 通过，无漂移' : '[同步] 完成');
process.exit(0);
