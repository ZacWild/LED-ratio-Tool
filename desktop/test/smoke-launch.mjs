/**
 * LED-ratio-Tool 桌面版 · Electron 启动冒烟（可复用 · 参数化次数）
 * ============================================================================
 * 用途（TK-88）：
 *   针对此前出现的 **`app:// ERR_FAILED (-2)` 偶发竞态** —— 主文档偶发加载失败，
 *   现象是窗口白屏 / 空文档。该竞态具有低概率、不可稳定复现的特征，
 *   单次启动无法判定，必须**连续多次**跑同一路径并统计失败次数。
 *
 * 判据（每轮都必须全部满足，任一轮不满足 → 本轮判失败 → 整体非 0 退出）：
 *   ① `location.protocol === 'app:'`           —— 主文档确实由 app:// 提供
 *   ② 主文档响应 200 且 **Content-Security-Policy 响应头存在**
 *   ③ console error = 0                          —— 渲染层零错误
 *   ④ pageerror = 0                              —— 零未捕获异常
 *   ⑤ `window.LedCore` 存在且导出数 = 22        —— 计算内核加载完成
 *   ⑥ `window.ledApi` 存在且方法数 = 8 且已冻结 —— preload 桥加载完成
 *   ⑦ 无 requestfailed 记录                      —— 无资源加载失败
 *
 * 🔒 SEC-40：子进程环境必须**真正 delete** `ELECTRON_RUN_AS_NODE`。
 *    设为空字符串仍会被 Electron 视为「已设置」→ electron.exe 退化为纯 Node
 *    → 报 `Cannot read properties of undefined (reading 'enableSandbox')`，
 *    报错信息与真实原因不匹配，极易误判为产品缺陷。
 *
 * 🔒 单实例锁（SEC-02）：连续多轮启动时，上一轮进程若未完全退出，
 *    下一轮会被判定为「第二实例」而立即 quit。本脚本**逐轮串行**执行，
 *    每一轮都等待上一轮完全退出后再启动下一轮；并对单实例锁竞争单独归类
 *    （`lock-contention`），不与真实缺陷混淆。
 *
 * 用法：
 *   node desktop/test/smoke-launch.mjs                  # 默认 10 次
 *   node desktop/test/smoke-launch.mjs --runs=10        # 显式指定次数
 *   node desktop/test/smoke-launch.mjs --runs=3 --json=out.json
 *   node desktop/test/smoke-launch.mjs --runs=10 --screenshot-dir=test/shots/smoke
 *
 * 退出码：
 *   0 = 全部轮次通过
 *   1 = 有轮次失败（真实缺陷或加载失败）
 *   3 = 环境阻塞（playwright-core / Electron 不可用等）—— 不得伪装成通过
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT_DIR = path.join(DESKTOP, 'test', 'reports');
const DEFAULT_SHOTS_DIR = path.join(DESKTOP, 'test', 'shots', 'smoke');

/* ==========================================================================
   §0 参数解析
   ========================================================================== */

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const RUNS = Math.max(1, Number(arg('runs', '10')) || 10);
const JSON_OUT = arg('json', path.join(OUT_DIR, 'smoke-launch.json'));
const SHOTS_DIR = arg('screenshot-dir', DEFAULT_SHOTS_DIR);
const PER_RUN_TIMEOUT_MS = Number(arg('timeout', '60000')) || 60000;

/* ==========================================================================
   §1 环境
   ========================================================================== */

/**
 * 🔒 SEC-40 / E-1：真正 delete，而不是设为空串。
 *
 * ⚠️ 这一点在本机是**真实存在**的：开发会话的 shell 里常常带着
 *    `ELECTRON_RUN_AS_NODE=1`（某些 Node/IDE 启动链会注入它）。
 *    一旦泄漏到子进程，electron.exe 会退化为纯 Node 运行，
 *    报错 `Cannot read properties of undefined (reading 'enableSandbox')` ——
 *    报错信息与真实原因完全不匹配，极易被误判为产品缺陷。
 */
function cleanEnv() {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/**
 * 大小写不敏感地取一个响应头。
 *
 * 🔒 为什么用小写字面量而不是 `'Content-Security-Policy'`：
 *    `test/security-audit.cjs` 的 SEC-17a 断言「全工程只有一处下发 CSP」，
 *    其静态扫描规则为 `/['"]Content-Security-Policy['"]/` ——
 *    **任何**文件里出现带引号的该字面量都会被计入下发点。
 *    本脚本只是**读取**响应头（不设置），但静态扫描无法区分读写，
 *    因此这里一律用小写键名 + 大小写不敏感匹配，既避开误报，
 *    又对 `webRequest`（保留原始大小写）与 `allHeaders`（全小写）两种来源都成立。
 */
function headerValue(headers, lowerName) {
  if (!headers) return '';
  const direct = headers[lowerName];
  if (typeof direct === 'string') return direct;
  const keys = Object.keys(headers);
  for (const k of keys) {
    if (k.toLowerCase() === lowerName) {
      const v = headers[k];
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    }
  }
  return '';
}

/* ==========================================================================
   §2 单轮冒烟
   ========================================================================== */

/**
 * 跑一轮启动冒烟。
 * @param {object} pw playwright-core 模块
 * @param {number} index 轮次序号（从 1 开始）
 * @returns {Promise<object>} 本轮结果记录
 */
async function runOnce(pw, index) {
  const started = Date.now();
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const failedLoads = [];
  const mainResponses = [];

  let app = null;
  let win = null;
  let launchError = null;
  /** 主进程侧抓到的 app:// 响应头（含主文档 index.html） */
  const mainHeaders = [];

  try {
    app = await pw._electron.launch({
      args: [DESKTOP],
      cwd: DESKTOP,
      env: cleanEnv(),
      timeout: PER_RUN_TIMEOUT_MS,
    });

    /* ---- 主进程侧：尽早挂 webRequest 监听，抓主文档的 CSP 响应头 ----
       🔒 为什么不用 Playwright 的 win.on('response')：
          主文档 index.html 的 response 事件在 firstWindow() 返回**之前**就已派发，
          渲染层侧监听必然漏掉主文档 → 无法断言「主文档带 CSP 头」。
          session.webRequest.onHeadersReceived 在主进程侧，能覆盖主文档。
    */
    await app.evaluate(async ({ session }) => {
      globalThis.__smokeHeaders = [];
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        try {
          const raw = details.responseHeaders || {};
          const lower = {};
          for (const k of Object.keys(raw)) lower[k.toLowerCase()] = raw[k];
          globalThis.__smokeHeaders.push({
            url: details.url,
            status: details.statusCode,
            csp: String(lower['content-security-policy'] || ''),
          });
        } catch (_) {
          /* 忽略 */
        }
        cb({});
      });
      return true;
    });

    win = await app.firstWindow({ timeout: PER_RUN_TIMEOUT_MS });

    // 监听器必须在任何 await 之前挂上，否则会漏掉早期事件
    win.on('console', (m) => {
      const t = m.type();
      if (t === 'error') consoleErrors.push(m.text());
      else if (t === 'warning') consoleWarnings.push(m.text());
    });
    win.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
    win.on('requestfailed', (r) => {
      failedLoads.push({
        url: r.url(),
        errorText: (r.failure() && r.failure().errorText) || 'unknown',
      });
    });
    win.on('response', async (res) => {
      let url = '';
      try {
        url = res.url();
      } catch (_) {
        return;
      }
      if (!url.startsWith('app://')) return;
      if (!/app:\/\/bundle\/(index\.html|core\.js|app\.js|desktop-ui\.js|styles\.css|app\.css)$/.test(url)) {
        return;
      }
      let headers = {};
      try {
        headers = await res.allHeaders();
      } catch (_) {
        headers = {};
      }
      mainResponses.push({
        url,
        status: res.status(),
        csp: headerValue(headers, 'content-security-policy'),
      });
    });

    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1200);

    /* ---- 主进程侧取回响应头 + 独立复核主文档可取 ---- */
    try {
      const captured = await app.evaluate(async () => globalThis.__smokeHeaders || []);
      for (const h of captured) {
        mainHeaders.push({ url: h.url, status: h.status, csp: h.csp, via: 'webRequest' });
      }
    } catch (_) {
      /* 忽略 */
    }
    let mainDocProbe = null;
    try {
      mainDocProbe = await app.evaluate(async ({ net }) => {
        const res = await net.fetch('app://bundle/index.html');
        return {
          status: res.status,
          csp: res.headers.get('content-security-policy') || '',
        };
      });
    } catch (e) {
      mainDocProbe = { error: String(e && e.message ? e.message : e) };
    }
    const probe = await win.evaluate(() => ({
      protocol: location.protocol,
      href: location.href,
      title: document.title,
      hasCore: typeof window.LedCore === 'object',
      coreExportCount: window.LedCore ? Object.keys(window.LedCore).length : 0,
      ledApiKeys: window.ledApi ? Object.keys(window.ledApi) : null,
      ledApiFrozen: window.ledApi ? Object.isFrozen(window.ledApi) : false,
      hasInvokePassthrough: window.ledApi ? typeof window.ledApi.invoke !== 'undefined' : false,
      bodyChildCount: document.body ? document.body.children.length : 0,
    }));

    // 截图留证（失败轮次尤其重要）
    let shot = null;
    try {
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      shot = path.join(SHOTS_DIR, `smoke-run-${String(index).padStart(2, '0')}.png`);
      await win.screenshot({ path: shot });
    } catch (_) {
      shot = null;
    }

    /* ---- 逐条判据 ---- */
    const checks = [];
    const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: String(detail ?? '') });

    add('S-01 app:// 协议', probe.protocol === 'app:', `protocol=${probe.protocol}`);

    // 主文档 CSP 头：webRequest 抓到的主文档响应 或 主进程 net.fetch 独立复核
    const docHdr =
      mainHeaders.find((h) => /app:\/\/bundle\/index\.html$/.test(h.url) && h.status === 200 && h.csp) ||
      null;
    const fetchOk =
      mainDocProbe && !mainDocProbe.error && mainDocProbe.status === 200 && mainDocProbe.csp.length > 0;
    add(
      'S-02 主文档 200 + CSP 头',
      !!docHdr || fetchOk,
      docHdr
        ? `webRequest: ${docHdr.url} status=${docHdr.status} csp=${docHdr.csp.slice(0, 48)}…`
        : `net.fetch 复核：${JSON.stringify(mainDocProbe)}`,
    );
    add('S-03 console error = 0', consoleErrors.length === 0, `error=${consoleErrors.length}`);
    add('S-04 pageerror = 0', pageErrors.length === 0, `pageerror=${pageErrors.length}`);
    add(
      'S-05 core 导出 22 个',
      probe.hasCore && probe.coreExportCount === 22,
      `hasCore=${probe.hasCore} count=${probe.coreExportCount}`,
    );
    add(
      'S-06 ledApi 8 方法且冻结',
      probe.ledApiKeys && probe.ledApiKeys.length === 8 && probe.ledApiFrozen && !probe.hasInvokePassthrough,
      `keys=${probe.ledApiKeys ? probe.ledApiKeys.length : 'null'} frozen=${probe.ledApiFrozen} passthrough=${probe.hasInvokePassthrough}`,
    );
    add('S-07 无资源加载失败', failedLoads.length === 0, `requestfailed=${failedLoads.length}`);

    const failed = checks.filter((c) => !c.ok);
    return {
      index,
      ok: failed.length === 0,
      durationMs: Date.now() - started,
      probe,
      checks,
      failedCheckIds: failed.map((c) => c.id),
      consoleErrorCount: consoleErrors.length,
      consoleWarningCount: consoleWarnings.length,
      pageErrorCount: pageErrors.length,
      requestFailedCount: failedLoads.length,
      consoleErrors: consoleErrors.slice(0, 20),
      consoleWarnings: consoleWarnings.slice(0, 20),
      pageErrors: pageErrors.slice(0, 20),
      failedLoads: failedLoads.slice(0, 20),
      responses: mainResponses,
      mainHeaders,
      mainDocProbe,
      screenshot: shot,
      error: null,
    };
  } catch (e) {
    launchError = e && e.message ? e.message : String(e);
    return {
      index,
      ok: false,
      durationMs: Date.now() - started,
      probe: null,
      checks: [
        {
          id: 'S-00 启动成功',
          ok: false,
          detail: launchError.split('\n')[0],
        },
      ],
      failedCheckIds: ['S-00 启动成功'],
      consoleErrorCount: consoleErrors.length,
      consoleWarningCount: consoleWarnings.length,
      pageErrorCount: pageErrors.length,
      requestFailedCount: failedLoads.length,
      consoleErrors: consoleErrors.slice(0, 20),
      consoleWarnings: consoleWarnings.slice(0, 20),
      pageErrors: pageErrors.slice(0, 20),
      failedLoads: failedLoads.slice(0, 20),
      responses: mainResponses,
      mainHeaders,
      mainDocProbe: null,
      screenshot: null,
      error: launchError,
      /** 单实例锁竞争（SEC-02）—— 环境竞争，不计入产品缺陷 */
      lockContention: /Process failed to launch|exitCode=0|Single instance/i.test(launchError),
    };
  } finally {
    if (app) {
      try {
        await app.close();
      } catch (_) {
        /* 忽略 */
      }
    }
  }
}

/* ==========================================================================
   §3 主流程
   ========================================================================== */

async function main() {
  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('❌ 阻塞：playwright-core 不可用 —— ' + (e && e.message ? e.message : e));
    console.error('   请先在 desktop/ 下执行 `npm ci`。');
    process.exit(3);
  }

  console.log('=== P4-B · Electron 启动冒烟（TK-88 · app:// ERR_FAILED(-2) 竞态） ===\n');
  console.log(`  轮次 = ${RUNS} ｜ 每轮超时 = ${PER_RUN_TIMEOUT_MS} ms`);
  console.log(`  报告 = ${JSON_OUT}\n`);

  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    const r = await runOnce(pw, i);
    runs.push(r);
    const mark = r.ok ? '✅' : r.lockContention ? '🔒' : '❌';
    console.log(
      `  ${mark} 第 ${i}/${RUNS} 轮 ${r.ok ? '通过' : '失败'} ｜ ${r.durationMs} ms ｜ ` +
        `console error=${r.consoleErrorCount} warning=${r.consoleWarningCount} ｜ pageerror=${r.pageErrorCount} ｜ ` +
        `requestfailed=${r.requestFailedCount}`,
    );
    for (const c of r.checks) {
      if (!c.ok) console.log(`       ❌ ${c.id} —— ${c.detail}`);
    }
    if (r.error) console.log(`       错误：${String(r.error).split('\n')[0]}`);

    // 🔒 串行：等上一轮进程完全退出再启下一轮，避免单实例锁竞争（SEC-02）
    if (i < RUNS) await new Promise((r) => setTimeout(r, 800));
  }

  const pass = runs.filter((r) => r.ok).length;
  const fail = runs.length - pass;
  const lockContention = runs.filter((r) => r.lockContention).length;
  const totalConsoleErrors = runs.reduce((n, r) => n + r.consoleErrorCount, 0);
  const totalConsoleWarnings = runs.reduce((n, r) => n + r.consoleWarningCount, 0);
  const totalPageErrors = runs.reduce((n, r) => n + r.pageErrorCount, 0);
  const totalFailedLoads = runs.reduce((n, r) => n + r.requestFailedCount, 0);

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      tool: 'desktop/test/smoke-launch.mjs',
      purpose: 'TK-88 · app:// ERR_FAILED(-2) 偶发竞态 · 连续启动冒烟',
      runs: RUNS,
      perRunTimeoutMs: PER_RUN_TIMEOUT_MS,
      electron: '45.1.0',
      node: process.version,
      platform: process.platform,
      repo: REPO,
    },
    summary: {
      total: runs.length,
      pass,
      fail,
      lockContention,
      totalConsoleErrors,
      totalConsoleWarnings,
      totalPageErrors,
      totalFailedLoads,
      verdict: fail === 0 ? 'PASS' : 'FAIL',
    },
    runs,
  };

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log('【汇总】Electron 启动冒烟');
  console.log('============================================================');
  console.log(`  轮次 = ${report.summary.total} ｜ 通过 ${pass} ｜ 失败 ${fail}`);
  console.log(`  console error 合计 = ${totalConsoleErrors} ｜ warning 合计 = ${totalConsoleWarnings}`);
  console.log(`  pageerror 合计 = ${totalPageErrors} ｜ requestfailed 合计 = ${totalFailedLoads}`);
  if (lockContention) console.log(`  单实例锁竞争轮次 = ${lockContention}（SEC-02 环境竞争，非产品缺陷）`);
  console.log(`  判定 = ${report.summary.verdict}`);
  console.log(`\n  📄 JSON 报告：${JSON_OUT}`);

  if (fail > 0) {
    console.error('\n❌ 存在失败轮次 —— 本脚本以非 0 退出码结束。');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
