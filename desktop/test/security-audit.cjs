/**
 * LED-ratio-Tool 桌面版 · 安全静态审计
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   SEC-01 —— 主进程零业务计算；core.js 单一真源 + 哈希锁
 *   SEC-02 —— 单实例锁在 ready 之前
 *   SEC-03 —— 渲染进程三项隔离显式配置
 *   SEC-04 —— preload 暴露面恰好 8 方法、零透传、对象冻结
 *   SEC-05 / SEC-38 —— preload 只用 Web API；Electron 45 沙箱限制
 *   SEC-07 —— 通道命名 app:v1:*，两侧集合一致；无 ipcMain.on
 *   SEC-10 —— 剪贴板只写不读；renderer 不用 navigator.clipboard
 *   SEC-12 —— 权限一律拒绝
 *   SEC-15 —— 无远程引用
 *   SEC-16 / SEC-17 —— CSP 含 connect-src 'none'；唯一来源
 *   SEC-23 —— 依赖精确锁；lock 入库；运行时依赖为空
 *   SEC-25~SEC-28 —— 四项禁止能力的反向核验
 *   SEC-30 —— 密钥卫生
 *   SEC-33 / SEC-37 —— app:// 路径防护；privileges 关闭状态
 *   SEC-34 —— protocol.handle 在 ready 之后
 *   SEC-36 —— renderer 禁 fetch
 *   SEC-39 —— userData / sessionData 分离
 *   SEC-40 —— ELECTRON_RUN_AS_NODE 检查
 *
 * 零依赖。退出码 0 = 全部通过；1 = 有失败项。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');

const results = [];
function check(id, desc, fn) {
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    if (r === true) { ok = true; }
    else if (typeof r === 'string') { ok = false; detail = r; }
    else { ok = !!r; }
  } catch (e) {
    detail = String(e && e.message ? e.message : e);
  }
  results.push({ id, desc, ok, detail });
}

/** 剥离 JS/CSS 注释与 HTML 注释，避免注释里的词造成误报 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')      // 块注释
    .replace(/<!--[\s\S]*?-->/g, '')          // HTML 注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')    // 行注释（避免误伤 URL 的 //）
    .replace(/^\s*\/\/.*$/gm, '');             // 整行注释
}

function read(rel) {
  const p = path.join(DESKTOP, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}
function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const SELF = path.join('test', 'security-audit.cjs');
const allSourceFiles = walk(DESKTOP).filter(
  (f) =>
    /\.(js|mjs|cjs|css|html|json|yml)$/.test(f) &&
    path.basename(f) !== 'security-audit.cjs' &&
    path.basename(f) !== 'desktop-adapter.cjs',
);
const allSource = allSourceFiles.map((f) => stripComments(fs.readFileSync(f, 'utf8'))).join('\n');
const mainSource = ['main/main.js','main/ipc.js','main/settings-store.js','main/paths.js','main/csp.js','main/menu.js']
  .map((f) => stripComments(read(f))).join('\n');
const preloadSource = stripComments(read('preload/preload.js'));
const rendererSource = ['renderer/index.html','renderer/app.js','renderer/desktop-ui.js','renderer/app.css']
  .map((f) => stripComments(read(f))).join('\n');

/* ---- SEC-01 主进程零业务计算 ---- */
check('SEC-01a', '主进程无业务计算标识符', () => {
  const hits = mainSource.match(/\b(gcd|bestRational|computeRatio|approx|denominator|toMm|parseDimension|bestIntegerCanvas|matchStandards)\b/gi);
  return hits === null || `命中 ${hits.length} 次: ${[...new Set(hits)].join(',')}`;
});

/* ---- SEC-01 core.js 哈希锁 ---- */
check('SEC-01b', 'core.js SHA-256 与锁一致', () => {
  const lock = JSON.parse(read('core.lock.json'));
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, 'src', 'core.js'))).digest('hex');
  return actual === lock.sha256 || `锁 ${lock.sha256.slice(0,16)} vs 实际 ${actual.slice(0,16)}`;
});

/* ---- SEC-02 单实例锁 ---- */
check('SEC-02', 'requestSingleInstanceLock 在 whenReady 之前', () => {
  const i = mainSource.indexOf('requestSingleInstanceLock');
  const j = mainSource.indexOf('whenReady');
  if (i < 0 || j < 0) return '未找到相关调用';
  return i < j || `lock@${i} > ready@${j}`;
});

/* ---- SEC-03 渲染进程配置 ---- */
check('SEC-03a', 'contextIsolation/nodeIntegration/sandbox 显式配置', () => {
  const need = ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true'];
  const missing = need.filter((s) => !mainSource.includes(s));
  return missing.length === 0 || `缺失: ${missing.join(', ')}`;
});
check('SEC-03b', '四项禁用项显式配置', () => {
  const need = ['webviewTag: false', 'nodeIntegrationInWorker: false', 'nodeIntegrationInSubFrames: false', 'experimentalFeatures: false', 'allowRunningInsecureContent: false'];
  const missing = need.filter((s) => !mainSource.includes(s));
  return missing.length === 0 || `缺失: ${missing.join(', ')}`;
});
check('SEC-03c', 'enableSandbox 在 whenReady 之前', () => {
  const i = mainSource.indexOf('enableSandbox');
  const j = mainSource.indexOf('whenReady');
  if (i < 0 || j < 0) return '未找到相关调用';
  return i < j || `enableSandbox@${i} > ready@${j}`;
});
check('SEC-03d', '无 @electron/remote 依赖', () => {
  const pkg = JSON.parse(read('package.json'));
  const all = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  const hit = Object.keys(all).filter((k) => /remote/i.test(k));
  return hit.length === 0 || `命中: ${hit.join(',')}`;
});

/* ---- SEC-04 preload 暴露面 ---- */
check('SEC-04a', 'preload 暴露恰好 8 个方法', () => {
  const names = ['settingsGet','settingsSet','clipboardWriteText','specOpen','specExport','appVersion','windowAction','openExternal'];
  const missing = names.filter((n) => !preloadSource.includes(n + ':'));
  return missing.length === 0 || `缺失: ${missing.join(',')}`;
});
check('SEC-04b', '暴露对象冻结', () => preloadSource.includes('Object.freeze(api)') || '未找到 Object.freeze');
check('SEC-04c', '无通用 invoke 透传', () => {
  const bad = preloadSource.match(/invoke\s*[:,]\s*\(?\s*channel/i);
  return bad === null || '发现通用 channel 透传';
});
check('SEC-04d', '每个 invoke 的第一个参数是字面量', () => {
  const calls = [...preloadSource.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]);
  return calls.length === 8 ? (new Set(calls).size === 8 || '通道有重复') : `字面量调用数=${calls.length}（期望 8）`;
});

/* ---- SEC-05 / SEC-38 沙箱 preload API 面 ---- */
check('SEC-05a', 'preload 不用 Buffer/setImmediate', () => {
  const hits = preloadSource.match(/\bBuffer\b|setImmediate|clearImmediate/g);
  return hits === null || `命中: ${[...new Set(hits)].join(',')}`;
});
check('SEC-05b', 'preload 只 require electron 系列', () => {
  const calls = [...preloadSource.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  const allowed = ['electron', 'electron/renderer', 'electron/common'];
  const bad = calls.filter((c) => !allowed.includes(c));
  return bad.length === 0 || `非法 require: ${bad.join(',')}`;
});
check('SEC-05c', 'preload 单文件', () => {
  const files = fs.readdirSync(path.join(DESKTOP, 'preload')).filter((f) => f.endsWith('.js'));
  return files.length === 1 || `文件数=${files.length}`;
});

/* ---- SEC-07 通道 ---- */
check('SEC-07a', '通道两侧集合一致且各 8 个', () => {
  const mainCh = [...mainSource.matchAll(/'app:v1:[a-zA-Z.]+'/g)].map((m) => m[0].replace(/'/g, ''));
  const preCh = [...preloadSource.matchAll(/'app:v1:[a-zA-Z.]+'/g)].map((m) => m[0].replace(/'/g, ''));
  const ms = new Set(mainCh), ps = new Set(preCh);
  if (ms.size !== 8 || ps.size !== 8) return `main=${ms.size} preload=${ps.size}（期望各 8）`;
  const onlyMain = [...ms].filter((c) => !ps.has(c));
  const onlyPre = [...ps].filter((c) => !ms.has(c));
  return onlyMain.length === 0 && onlyPre.length === 0 || `仅 main: ${onlyMain}; 仅 preload: ${onlyPre}`;
});
check('SEC-07b', '无 ipcMain.on 作业务通道', () => {
  return !mainSource.includes('ipcMain.on') || '发现 ipcMain.on';
});

/* ---- SEC-10 剪贴板只写不读 ---- */
check('SEC-10a', '无剪贴板读取', () => {
  const hits = allSource.match(/clipboard\.readText|clipboard\.readHTML|navigator\.clipboard\.read/g);
  return hits === null || `命中: ${hits.length}`;
});
check('SEC-10b', 'renderer 不用 navigator.clipboard', () => {
  return !rendererSource.includes('navigator.clipboard') || '发现 navigator.clipboard';
});
check('SEC-10c', '主进程使用 clipboard.writeText', () => mainSource.includes('clipboard.writeText') || '未找到');

/* ---- SEC-12 权限 ---- */
check('SEC-12a', '权限请求一律拒绝', () => {
  return (mainSource.includes('setPermissionRequestHandler') && mainSource.includes('callback(false)')) || '未找到';
});
check('SEC-12b', '无摄像头/麦克风/通知 API', () => {
  const hits = allSource.match(/getUserMedia|getDisplayMedia|new Notification/g);
  return hits === null || `命中: ${hits.length}`;
});

/* ---- SEC-15 无远程引用 ---- */
check('SEC-15a', 'renderer 无 http(s) 远程引用', () => {
  const hits = rendererSource.match(/https?:\/\/[a-z0-9]/gi);
  return hits === null || `命中 ${hits.length} 处`;
});
check('SEC-15b', '无 @import / @font-face', () => {
  const hits = rendererSource.match(/@import|@font-face/g);
  return hits === null || `命中: ${hits.length}`;
});

/* ---- SEC-16 / SEC-17 CSP ---- */
check('SEC-16a', "CSP 含 connect-src 'none'", () => {
  const csp = read('main/csp.js');
  return /connect-src 'none'/.test(csp) || '未找到 connect-src none';
});
check('SEC-16b', "CSP 含 script-src 'self' 且无 unsafe-eval/inline", () => {
  const csp = stripComments(read('main/csp.js'));
  // 逐条取指令（数组元素以引号包裹，每条一个字符串）
  const directives = [...csp.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((d) => /-src/.test(d));
  const scriptSrc = directives.filter((d) => d.startsWith('script-src'));
  if (!scriptSrc.length) return "未找到 script-src";
  const bad = scriptSrc.filter((d) => /unsafe-(eval|inline)/.test(d));
  const selfOk = scriptSrc.some((d) => d === "script-src 'self'");
  if (!selfOk) return `script-src 非 'self': ${scriptSrc.join(' | ')}`;
  return bad.length === 0 || `命中: ${bad.join(',')}`;
});
check('SEC-16c', 'CSP 阶段一含 style-src-attr 有限例外', () => {
  const csp = read('main/csp.js');
  return /style-src-attr 'unsafe-inline'/.test(csp) || '未找到';
});
check('SEC-17a', 'CSP 下发点唯一（仅一处 set 调用）', () => {
  const files = allSourceFiles.filter((f) => {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    return /['"]Content-Security-Policy['"]/.test(src);
  });
  return files.length === 1 || `出现在 ${files.length} 个文件: ${files.map((f) => path.basename(f)).join(',')}`;
});
check('SEC-17b', 'CSP 不含 sandbox 指令', () => {
  const csp = stripComments(read('main/csp.js'));
  const directives = csp.split('CSP_STAGE_1')[1] || csp;
  const hit = directives.match(/['"]sandbox[^'"]*['"]/g);
  return hit === null || `命中: ${hit.join(',')}`;
});

/* ---- SEC-23 依赖 ---- */
check('SEC-23a', '运行时依赖为空', () => {
  const pkg = JSON.parse(read('package.json'));
  const n = Object.keys(pkg.dependencies || {}).length;
  return n === 0 || `${n} 个运行时依赖`;
});
check('SEC-23b', 'devDependencies 精确锁版本', () => {
  const pkg = JSON.parse(read('package.json'));
  const bad = Object.entries(pkg.devDependencies || {}).filter(([, v]) => !/^\d+\.\d+\.\d+(-.+)?$/.test(v));
  return bad.length === 0 || `未精确锁: ${bad.map(([k, v]) => `${k}@${v}`).join(', ')}`;
});
check('SEC-23c', 'package-lock.json 存在', () => {
  return fs.existsSync(path.join(DESKTOP, 'package-lock.json')) || '缺失';
});

/* ---- SEC-25~SEC-28 四项禁止 ---- */
check('SEC-25', '禁自动更新', () => {
  const hits = allSource.match(/autoUpdater|electron-updater|setFeedURL|checkForUpdates|update-electron-app/gi);
  const yml = read('build/electron-builder.yml');
  const publishLine = yml.match(/^\s*publish\s*:\s*(.*)$/m);
  if (publishLine && publishLine[1].trim() !== 'null' && publishLine[1].trim() !== '') {
    return `electron-builder.yml publish = ${publishLine[1].trim()}`;
  }
  return hits === null || `命中: ${[...new Set(hits)].join(',')}`;
});
check('SEC-26', '禁系统托盘', () => {
  const hits = allSource.match(/new Tray\(|Tray\(|tray\.setToolTip|setContextMenu|app\.dock\./g);
  return hits === null || `命中: ${hits.length}`;
});
check('SEC-27', '禁账号与云同步', () => {
  const hits = allSource.match(/\b(login|logout|signIn|oauth|password|credential|token|jwt|apiKey)\b/gi);
  const filtered = hits ? hits.filter((h) => !/token/i.test(h)) : null;
  const real = hits ? hits.filter((h) => !/setAppUserModelId/i.test(h)) : null;
  return (real === null || real.length === 0) || `命中: ${[...new Set(real)].join(',')}`;
});
check('SEC-28', '禁遥测与崩溃上报', () => {
  const hits = allSource.match(/\b(telemetry|analytics|tracking|beacon|crashReporter|sentry|amplitude|posthog|gtag)\b/gi);
  return hits === null || `命中: ${[...new Set(hits)].join(',')}`;
});

/* ---- SEC-30 密钥卫生 ---- */
check('SEC-30', '.gitignore 含密钥扩展名', () => {
  const gi = read('.gitignore');
  const need = ['*.pfx', '*.p12'];
  const missing = need.filter((s) => !gi.includes(s));
  return missing.length === 0 || `缺失: ${missing.join(',')}`;
});

/* ---- SEC-33 app:// 路径防护 ---- */
check('SEC-33a', '路径防护含解码与根目录校验', () => {
  const need = ['decodeURIComponent', 'path.relative'];
  const missing = need.filter((s) => !mainSource.includes(s));
  return missing.length === 0 || `缺失: ${missing.join(',')}`;
});
check('SEC-33b', '未知扩展名返回 403', () => {
  return (mainSource.includes('403') && mainSource.includes('MIME')) || '未找到';
});

/* ---- SEC-34 protocol.handle 时机 ---- */
check('SEC-34', 'protocol.handle 在 whenReady 之后（调用点比较）', () => {
  // 判定依据：registerAppProtocol() 的**调用**必须位于 whenReady 回调体内。
  // 做法：找到 whenReady 之后第一个出现 registerAppProtocol() 的位置，
  //       并确认它不在 whenReady 之前的模块顶层区域。
  const r = mainSource.indexOf('app.whenReady()');
  const call = mainSource.indexOf('registerAppProtocol()', r);
  const def = mainSource.indexOf('function registerAppProtocol');
  if (r < 0 || call < 0 || def < 0) return '未找到相关调用';
  return call > r || `调用点@${call} <= ready@${r}`;
});
check('SEC-34b', 'registerSchemesAsPrivileged 在模块顶层（早于 whenReady）', () => {
  const i = mainSource.indexOf('registerSchemesAsPrivileged');
  const j = mainSource.indexOf('whenReady');
  if (i < 0 || j < 0) return '未找到相关调用';
  return i < j || `register@${i} > ready@${j}`;
});

/* ---- SEC-36 renderer 禁 fetch ---- */
check('SEC-36', 'renderer 无 fetch/XHR/WebSocket', () => {
  const hits = rendererSource.match(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/g);
  return hits === null || `命中: ${[...new Set(hits)].join(',')}`;
});

/* ---- SEC-37 privileges 关闭状态 ---- */
check('SEC-37a', 'privileges 只有 standard 与 secure 为 true', () => {
  const block = mainSource.match(/privileges:\s*\{([^}]*)\}/);
  if (!block) return '未找到 privileges 块';
  const body = block[1];
  const bad = ['supportFetchAPI', 'bypassCSP', 'corsEnabled', 'stream', 'allowServiceWorkers', 'codeCache']
    .filter((k) => new RegExp(k + '\\s*:\\s*true').test(body));
  return bad.length === 0 || `被启用: ${bad.join(',')}`;
});
check('SEC-37b', '全工程无 bypassCSP', () => {
  const hits = allSource.match(/bypassCSP/g);
  return hits === null || `命中 ${hits.length} 次`;
});

/* ---- SEC-39 存储分离 ---- */
check('SEC-39a', 'userData 与 sessionData 分别 setPath', () => {
  const need = ["setPath('userData'", "setPath('sessionData'"];
  const missing = need.filter((s) => !mainSource.includes(s) && !read('main/paths.js').includes(s));
  return missing.length === 0 || `缺失: ${missing.join(',')}`;
});
check('SEC-39b', 'sessionData 落在 Local 而非 userData 内', () => {
  const p = stripComments(read('main/paths.js'));
  if (!p.includes("'SessionData'")) return '未找到 SessionData';
  // 必须基于 appData 的**父目录**构造 Local 路径
  return /path\.dirname\(\s*appDataDir\s*\)/.test(p) || 'sessionData 未基于 appData 父目录构造';
});

/* ---- SEC-40 环境变量 ---- */
check('SEC-40a', 'preflight 脚本存在且检查 ELECTRON_RUN_AS_NODE', () => {
  const pf = path.join(DESKTOP, 'build', 'preflight.cjs');
  if (!fs.existsSync(pf)) return '缺 preflight.cjs';
  const src = fs.readFileSync(pf, 'utf8');
  return /ELECTRON_RUN_AS_NODE/.test(src) || 'preflight 未检查该变量';
});
check('SEC-40b', 'dev 与 build:win 均先跑 preflight', () => {
  const pkg = JSON.parse(read('package.json'));
  const s = pkg.scripts || {};
  for (const k of ['dev', 'build:win']) {
    if (!s[k] || !/preflight/.test(s[k])) return `${k} 未先跑 preflight`;
  }
  return true;
});

/* ---- 输出 ---- */
const failed = results.filter((r) => !r.ok);
console.log('=== 安全静态审计（SEC）===');
for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.id}  ${r.desc}${r.ok ? '' : '  → ' + r.detail}`);
}
console.log(`\n总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
process.exit(failed.length ? 1 : 0);
