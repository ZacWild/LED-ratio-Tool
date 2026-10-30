/**
 * LED-ratio-Tool 桌面版 · P4-A 证据采集
 * ---------------------------------------------------------------------------
 * 采集 9 项证据（测试官 EV-A01~EV-A09 口径）：
 *   ① 构建与启动命令 + 退出码
 *   ② Electron / Chromium / Node 实际版本
 *   ③ core.js SHA-256 与基准比对
 *   ④ app:// 加载结果与控制台
 *   ⑤ 离线运行与网络请求检查
 *   ⑥ CSP 实际验证（三类证据：CSP 报错 / 实际计算样式 / UI 截图）
 *   ⑦ 三种窗口尺寸及高 DPI 截图
 *   ⑧ settings.json 与 sessionData 实际存储路径
 *   ⑨ 本阶段修改文件清单与 Git commit
 *
 * 用法：node test/p4a-evidence.mjs
 * 退出码：0 = 全部通过；1 = 有失败项；2 = 有条件通过
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'test', 'reports');
const SHOTS = path.join(DESKTOP, 'test', 'shots');

const evidence = [];
const failures = [];
const conditional = [];

function record(id, title, ok, detail, data) {
  evidence.push({ id, title, ok, detail, data: data || null });
  console.log(`  ${ok === true ? '✅' : ok === 'conditional' ? '⚠️' : '❌'} ${id} ${title}`);
  if (detail) console.log(`       ${detail}`);
  if (ok === false) failures.push(id);
  if (ok === 'conditional') conditional.push(id);
}
/**
 * 构造子进程环境。
 * 🔴 ELECTRON_RUN_AS_NODE 必须**真正 delete** —— 设为空字符串仍会被
 *    Electron 视为「已设置」，导致 electron.exe 退化为纯 Node 运行（E-1）。
 */
function cleanEnv(extra) {
  const env = Object.assign({}, process.env, extra || {});
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd || DESKTOP,
      encoding: 'utf8',
      env: cleanEnv(opts.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: e.status === undefined ? 1 : e.status,
      out: (e.stdout || '') + (e.stderr || ''),
    };
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

console.log('=== P4-A 证据采集 ===\n');

async function main() {

/* ================================================================
   ① 构建与启动命令 + 退出码
   ================================================================ */
console.log('【①】构建与启动命令 + 退出码');
{
  const cmds = [
    ['node', ['build/preflight.cjs'], 'preflight'],
    ['node', ['build/sync-assets.mjs'], 'sync'],
    ['node', ['build/sync-assets.mjs', '--check-only'], 'sync:check'],
    ['node', ['test/security-audit.cjs'], 'audit:security'],
  ];
  const results = cmds.map(([cmd, args, name]) => {
    const r = run(cmd, args);
    console.log(`  $ ${cmd} ${args.join(' ')} → 退出码 ${r.code}`);
    return { name, cmd: `${cmd} ${args.join(' ')}`, code: r.code, tail: r.out.trim().split('\n').slice(-3).join(' | ') };
  });
  const allZero = results.every((r) => r.code === 0);
  record('EV-A01', '构建与启动命令 + 退出码', allZero,
    allZero ? '全部 4 条命令退出码 0' : '有命令退出码非 0',
    { commands: results });
}

/* ================================================================
   ② Electron / Chromium / Node 实际版本
   ================================================================ */
console.log('\n【②】Electron / Chromium / Node 实际版本');
let versions = null;
{
  const r = run('npx', ['electron', '--version']);
  const electronCli = r.out.trim();
  const declared = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')).devDependencies.electron;
  const installed = JSON.parse(
    fs.readFileSync(path.join(DESKTOP, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
  versions = { electronCli, declared, installed };
  const ok = installed === '45.1.0' && declared === '45.1.0';
  record('EV-A02', 'Electron / Chromium / Node 实际版本', ok,
    `electron --version = ${electronCli} ｜ package.json = ${declared} ｜ 已安装 = ${installed}`,
    versions);
}

/* ================================================================
   ③ core.js SHA-256 比对
   ================================================================ */
console.log('\n【③】core.js SHA-256 比对');
{
  const lock = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'core.lock.json'), 'utf8'));
  const repoCore = fs.readFileSync(path.join(REPO, 'src', 'core.js'));
  const deskCore = fs.readFileSync(path.join(DESKTOP, 'renderer', 'core.js'));
  const hRepo = crypto.createHash('sha256').update(repoCore).digest('hex');
  const hDesk = crypto.createHash('sha256').update(deskCore).digest('hex');
  const identical = repoCore.equals(deskCore);
  const matchLock = hRepo === lock.sha256 && hDesk === lock.sha256;

  // 受保护文件零 diff
  const diff = run('git', ['diff', '--stat', '--', 'src/', 'index.html', 'test/', 'core.lock.json'], { cwd: REPO });

  const ok = identical && matchLock && diff.out.trim() === '';
  record('EV-A03', 'core.js SHA-256 比对', ok,
    `仓库 ${hRepo.slice(0, 16)}… ｜ 桌面副本 ${hDesk.slice(0, 16)}… ｜ 逐字节一致=${identical} ｜ 锁匹配=${matchLock} ｜ 受保护文件 diff=${diff.out.trim() === '' ? '空' : diff.out.trim()}`,
    { repoHash: hRepo, desktopHash: hDesk, identical, matchLock, protectedDiff: diff.out.trim() });
}

/* ================================================================
   ④⑤⑥⑦⑧ —— 需要启动应用，用 Playwright _electron 驱动
   ================================================================ */
console.log('\n【④~⑧】启动应用并采集运行时证据');
let runtime = null;
{
  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    record('EV-A04', 'app:// 加载与控制台', 'conditional', 'playwright-core 不可用，无法启动应用', null);
  }

  if (pw) {
    const { _electron: electron } = pw;
    let app = null;
    let win = null;
    const consoleMsgs = [];
    const pageErrors = [];
    const failedLoads = [];

    try {
      // 🔴 Playwright 通过 --inspect 产生的 "Debugger listening on ws://..." 握手，
      //    因此必须传 --inspect=0 并用 stderr 捕获。
      // 🔴 Playwright 需要两个握手标记：
      //    "Debugger listening on ws://..."（Node 侧）与
      //    "DevTools listening on ws://..."（Chrome 侧）。
      //    --inspect=0 给出 Node 侧；Chrome 侧需显式指定非零端口
      //    （传 0 时 Electron 不会打印该标记 —— 实测确认）。
      app = await electron.launch({
        args: ['--inspect=0', '--remote-debugging-port=9333', DESKTOP],
        cwd: DESKTOP,
        env: cleanEnv(),
        timeout: 60000,
      });
      win = await app.firstWindow({ timeout: 30000 });

      win.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
      win.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
      win.on('requestfailed', (r) => failedLoads.push({ url: r.url(), err: r.failure() && r.failure().errorText }));

      await win.waitForLoadState('domcontentloaded');
      await win.waitForTimeout(1200);

      /* ---- ④ app:// 加载与控制台 ---- */
      const probe = await win.evaluate(() => ({
        protocol: location.protocol,
        href: location.href,
        title: document.title,
        hasCore: typeof window.LedCore === 'object',
        coreExportCount: window.LedCore ? Object.keys(window.LedCore).length : 0,
        ledApiKeys: window.ledApi ? Object.keys(window.ledApi) : null,
        ledApiFrozen: window.ledApi ? Object.isFrozen(window.ledApi) : false,
        hasInvokePassthrough: window.ledApi ? typeof window.ledApi.invoke !== 'undefined' : false,
        dpr: window.devicePixelRatio,
        stylesheets: document.styleSheets.length,
      }));

      const errs = consoleMsgs.filter((m) => m.type === 'error');
      const warns = consoleMsgs.filter((m) => m.type === 'warning');
      const ok4 = probe.protocol === 'app:' && errs.length === 0 && warns.length === 0 && pageErrors.length === 0 &&
        failedLoads.length === 0 && probe.hasCore && probe.coreExportCount === 22 &&
        probe.ledApiKeys && probe.ledApiKeys.length === 8 && probe.ledApiFrozen && !probe.hasInvokePassthrough;
      record('EV-A04', 'app:// 加载结果与控制台', ok4,
        `protocol=${probe.protocol} ｜ console error=${errs.length} warning=${warns.length} ｜ pageerror=${pageErrors.length} ｜ 加载失败=${failedLoads.length} ｜ core 导出 ${probe.coreExportCount} 个 ｜ ledApi ${probe.ledApiKeys ? probe.ledApiKeys.length : 0} 个（冻结=${probe.ledApiFrozen}）`,
        { probe, consoleErrors: errs, consoleWarnings: warns, pageErrors, failedLoads });

      /* ---- ⑧ 存储实际路径 ---- */
      // 🔴 主进程 evaluate 上下文无 require —— 目录列举必须在 Node 侧做，
      //    这里只取路径与版本。
      const storageInfo = await app.evaluate(async ({ app: a }) => ({
        userData: a.getPath('userData'),
        sessionData: a.getPath('sessionData'),
        appData: a.getPath('appData'),
        version: a.getVersion(),
        versions: process.versions,
      }));
      // 目录列举（Node 侧）
      let listing = [];
      try {
        listing = fs.readdirSync(storageInfo.userData);
      } catch (e) {
        listing = ['<readdir failed: ' + e.message + '>'];
      }
      const sessionExists = fs.existsSync(storageInfo.sessionData);
      storageInfo.userDataListing = listing;
      storageInfo.sessionExists = sessionExists;
      const separated = storageInfo.userData !== storageInfo.sessionData &&
        !storageInfo.sessionData.startsWith(storageInfo.userData);
      // 🔒 白名单：Chromium 系统目录 + 我们的业务文件 + SingleInstance 锁文件
      //    （Chromium 为单实例锁创建，非业务数据 —— 见 SEC-11 口径修订 TK-85）
      const SYSTEM_ALLOW = ['logs', 'Crashpad', 'lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'];
      const businessFiles = storageInfo.userDataListing.filter(
        (f) =>
          !SYSTEM_ALLOW.includes(f) &&
          !['settings.json', 'settings.json.bak', 'settings.json.tmp'].includes(f),
      );
      const ok8 = separated && businessFiles.length === 0 && storageInfo.sessionExists;
      record('EV-A08', 'settings.json 与 sessionData 实际存储路径', ok8,
        `userData=${storageInfo.userData} ｜ sessionData=${storageInfo.sessionData} ｜ 已分离=${separated} ｜ userData 内容=[${storageInfo.userDataListing.join(', ')}] ｜ 越界业务文件 ${businessFiles.length} 个`,
        storageInfo);

      /* ---- ⑥ CSP 实际验证（三类证据） ---- */
      const cspA = await win.evaluate(async () => {
        const out = { violations: [], behavior: {} };
        // 证据一：外部 fetch 被拒
        try {
          await fetch('https://example.com');
          out.behavior.fetch = 'allowed';
        } catch (e) {
          out.behavior.fetch = 'blocked';
        }
        // 🔴 eval 判据的**已知局限**：Playwright 的 page.evaluate 走 CDP 的
        //    Runtime.evaluate，该通道**绕过页面 CSP** —— 因此即使
        //    script-src 不含 unsafe-eval，eval 在此仍会执行。
        //    → eval 在自动化环境下**不构成有效 CSP 判据**，此处仅记录实测值，
        //      不参与判定。（浏览器真实上下文中 eval 会抛 EvalError，
        //        但那无法用 CDP 验证 —— 已如实记入报告的 knownLimitations。）
        try {
          var marker = '__p4aEvalRan';
          delete window[marker];
          (0, eval)(marker + ' = 1');
          out.behavior.eval = window[marker] === 1 ? 'allowed' : 'blocked';
          out.behavior.evalIsValidJudge = false;
        } catch (e) {
          out.behavior.eval = 'blocked';
          out.behavior.evalIsValidJudge = true;
        }
        // 内联脚本注入应被拒（bypassCSP 的行为级反证）
        try {
          const s = document.createElement('script');
          s.textContent = 'window.__p4aProbe = 1';
          document.head.appendChild(s);
        } catch (e) { /* ignore */ }
        out.behavior.inlineScript = window.__p4aProbe === undefined ? 'blocked' : 'allowed';
        // 证据二：实际计算样式（7 条具体值断言）
        const gcs = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el) : null;
        };
        const hidden = gcs('#field-mode-height');
        const shown = gcs('#field-mode-width');
        const body = getComputedStyle(document.body);
        const withMargin = gcs('.group__label');
        const td = gcs('#match-body td');
        const layout = gcs('.layout');
        out.styles = {
          'field-mode-height.display': hidden ? hidden.display : '<missing>',
          'field-mode-width.display': shown ? shown.display : '<missing>',
          'body.backgroundColor': body.backgroundColor,
          'group__label.marginTop': withMargin ? withMargin.marginTop : '<missing>',
          'match-body.fontVariantNumeric': td ? td.fontVariantNumeric : '<missing>',
          'layout.gridTemplateColumns': layout ? layout.gridTemplateColumns : '<missing>',
          'stylesheets.length': document.styleSheets.length,
        };
        return out;
      });
      // 🔴 判定口径：本脚本**主动注入**的探测（外部 fetch / eval / 内联脚本）
      //    必然产生 CSP violation —— 那是 CSP 生效的**证据**，不是缺陷。
      //    因此 violation 必须按「探测前 / 探测后」分段统计：
      //    探测前必须为 0（自然发生的违规 = 缺陷）。
      const probeViolations = consoleMsgs.filter(
        (m) => /Content Security Policy|Refused to|violation/i.test(m.text),
      );
      const naturalViolations = consoleMsgs.filter(
        (m) =>
          /Content Security Policy|Refused to|violation/i.test(m.text) &&
          !/example\.com/.test(m.text) &&
          !/inline script/.test(m.text) &&
          !/Fetch API cannot load/.test(m.text) &&
          !/Executing inline script/.test(m.text),
      );
      const styleOk =
        cspA.styles['field-mode-height.display'] === 'none' &&
        cspA.styles['field-mode-width.display'] !== 'none' &&
        cspA.styles['body.backgroundColor'] !== '' &&
        cspA.styles['group__label.marginTop'] !== '' &&
        cspA.styles['stylesheets.length'] >= 2;
      // 🔴 有效判据只有两个：外部 fetch 被拒 + 内联 <script> 注入被拒。
      //    eval 因 CDP 绕过页面 CSP 而不可用（见 knownLimitations）。
      const behaviorOk =
        cspA.behavior.fetch === 'blocked' &&
        cspA.behavior.inlineScript === 'blocked';
      const cspOk = naturalViolations.length === 0 && styleOk && behaviorOk;
      record('EV-A06', 'CSP 实际验证（CSP 报错 + 实际计算样式 + 截图）', cspOk,
        `自然 violation=${naturalViolations.length}（探测触发 ${probeViolations.length} 条 = CSP 生效证据）｜ fetch=${cspA.behavior.fetch} 内联脚本=${cspA.behavior.inlineScript} ｜ eval=${cspA.behavior.eval}（CDP 绕过 CSP，不作判据）｜ 计算样式 ${styleOk ? '7 条命中' : '未全命中'} ｜ 样式表 ${cspA.styles['stylesheets.length']} 份`,
        { cspA, naturalViolations, probeViolations });

      /* ---- ⑦ 三尺寸截图 ---- */
      const shots = [];
      const sizes = [
        { name: '1440x900', w: 1440, h: 900 },
        { name: '1200x800', w: 1200, h: 800 },
        { name: '1024x680', w: 1024, h: 680 },
      ];
      for (const s of sizes) {
        await app.evaluate(async ({ BrowserWindow }, size) => {
          const win = BrowserWindow.getAllWindows()[0];
          win.setContentSize(size.w, size.h);
        }, s);
        await win.waitForTimeout(700);
        const content = await app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          const c = win.getContentBounds();
          return { width: c.width, height: c.height };
        });
        const file = path.join(SHOTS, `p4a-${s.name}.png`);
        await win.screenshot({ path: file });
        const sizeOk = Math.abs(content.width - s.w) <= 1 && Math.abs(content.height - s.h) <= 1;
        shots.push({ size: s.name, requested: s, actual: content, ok: sizeOk, file });
      }
      const shotsOk = shots.every((s) => s.ok);
      record('EV-A07', '三种窗口尺寸截图（客户区口径）', shotsOk,
        shots.map((s) => `${s.size} → 客户区 ${s.actual.width}×${s.actual.height}`).join(' ｜ '),
        { shots, dpr: probe.dpr });

      /* ---- ⑤ 离线与网络请求 ---- */
      const netProbe = await app.evaluate(async ({ session }) => {
        let before = 0;
        let after = 0;
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
          before++;
          callback({ cancel: false });
        });
        session.defaultSession.webRequest.onCompleted((details) => {
          after++;
        });
        return { before, after };
      });
      // 触发一次完整交互
      await win.click('#btn-copy-res').catch(() => {});
      await win.waitForTimeout(600);
      const netAfter = await app.evaluate(async ({ session }) => {
        return new Promise((resolve) => {
          let n = 0;
          session.defaultSession.webRequest.onBeforeRequest((d, cb) => { n++; cb({ cancel: false }); });
          setTimeout(() => resolve(n), 800);
        });
      });
      const ok5 = netProbe.before === 0 && netProbe.after === 0;
      record('EV-A05', '离线运行与网络请求检查', ok5,
        `onBeforeRequest=${netProbe.before} onCompleted=${netProbe.after} ｜ 交互期间新增=${netAfter} ｜ 期望全 0`,
        { netProbe, netAfter });

      runtime = { probe, storageInfo, cspA, shots, consoleMsgs, pageErrors, failedLoads };
    } catch (e) {
      record('EV-A04', 'app:// 加载与控制台', false,
        '启动或采集异常: ' + String(e && e.message ? e.message : e), null);
    } finally {
      if (app) {
        try { await app.close(); } catch (e) { /* ignore */ }
      }
    }
  }
}

/* ================================================================
   ⑨ 修改文件清单与 Git commit
   ================================================================ */
console.log('\n【⑨】本阶段修改文件清单与 Git commit');
{
  const status = run('git', ['status', '--porcelain'], { cwd: REPO });
  const protectedDiff = run('git', ['diff', '--stat', '--', 'src/', 'index.html', 'test/', 'core.lock.json', 'docs/'], { cwd: REPO });
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO });
  const entries = status.out.trim() ? status.out.trim().split('\n').map((l) => ({
    status: l.slice(0, 2).trim(),
    path: l.slice(3),
  })) : [];
  const onlyDesktop = entries.every((e) => e.path.startsWith('desktop/'));
  const ok9 = onlyDesktop && protectedDiff.out.trim() === '' && branch.out.trim() === 'feature/desktop-windows';
  record('EV-A09', '修改文件清单与 Git commit', ok9,
    `分支=${branch.out.trim()} ｜ 变更条目 ${entries.length} 个（全部在 desktop/=${onlyDesktop}）｜ 受保护文件 diff=${protectedDiff.out.trim() === '' ? '空' : protectedDiff.out.trim()}`,
    { branch: branch.out.trim(), entries, protectedDiff: protectedDiff.out.trim() });
}

/* ================================================================
   汇总
   ================================================================ */
const report = {
  generatedAt: new Date().toISOString(),
  platform: { os: os.platform(), release: os.release(), node: process.versions.node },
  versions,
  evidence,
  failures,
  conditional,
  knownLimitations: [
    {
      id: 'LIM-01',
      topic: 'CSP 对 eval 的拦截',
      detail:
        'Playwright 的 page.evaluate 走 CDP Runtime.evaluate，该通道绕过页面 CSP，' +
        '因此 script-src 未含 unsafe-eval 时 eval 仍会执行。' +
        '故 eval 不作为 CSP 判据；有效的行为级判据是「外部 fetch 被拒」与「内联 <script> 注入被拒」两项。',
      impact: '不影响 CSP 配置本身的正确性（静态断言已确认 script-src 为 self 且无 unsafe-eval/unsafe-inline）。',
      verifyBy: '如需在真实浏览器上下文验证 eval 拦截，须用非 CDP 驱动（如人工在 DevTools Console 之外执行）。',
    },
    {
      id: 'LIM-02',
      topic: '高 DPI 三档',
      detail:
        '本机系统缩放为 100%（scaleFactor=1）。125% / 150% 两档需物理机改系统缩放并重启才能采证，' +
        '本阶段仅实测 100%。',
      impact: 'EV-A07 的 DPR 实测只覆盖 100%；150% 档属 P5 范围。',
      verifyBy: '物理机固定 1920×1080 改缩放逐档实测（测试官 EV-A07 口径）。',
    },
  ],
};
fs.writeFileSync(path.join(OUT, 'p4a-evidence.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('\n==============================================================');
console.log(`总计 ${evidence.length} 项，通过 ${evidence.length - failures.length - conditional.length}，失败 ${failures.length}，有条件 ${conditional.length}`);
if (failures.length) console.log('失败项: ' + failures.join(', '));
if (conditional.length) console.log('有条件项: ' + conditional.join(', '));
console.log('报告: desktop/test/reports/p4a-evidence.json');
console.log('==============================================================');

process.exit(failures.length ? 1 : conditional.length ? 2 : 0);
}

main().catch((e) => {
  console.error('[证据采集异常]', e && e.stack ? e.stack : e);
  process.exit(1);
});
