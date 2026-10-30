/**
 * LED-ratio-Tool 桌面版 · L2 黄金向量独立测试套件
 * ============================================================================
 * 依据：
 *   P4-BASELINE.md DEC-15 —— 三层期望源（L1 oracle / L2 黄金向量 / L3 双版比对）
 *   P3-D09 §6.1 —— L2 必须由人工确认，且**每条向量用自己的 input 驱动**
 *   TK-130 —— pending_confirmation 不计入已确认覆盖（机器闸）
 *
 * 🔴 本套件与 200 组差分（differential-200.mjs）**完全独立**：
 *    旧实现把黄金向量循环嵌在 200 组场景的内层，用**当前场景的实际值**去比对
 *    **另一条输入的预期值** —— 一旦向量被确认，必然产生跨输入的假差异
 *    （或假通过）。本套件每条向量：
 *      ① 用自己的 input 驱动 HTML 与 Electron 两端（相同输入）；
 *      ② 通过字段注册表取实际值（field → expected key → extractor 显式映射）；
 *      ③ 结构校验不过的向量**显式报出**，不静默跳过。
 *
 * 🔴 pending_confirmation 的向量**照常执行**（用于验证研发推导值与产品一致），
 *    但其覆盖**不计入** L2 已确认统计 —— 这是机器闸，见 l2-harness.summarize。
 *
 * 用法：
 *   node desktop/test/golden-vectors.mjs
 *   node desktop/test/golden-vectors.mjs --out=report.json
 *
 * 退出码：
 *   0 = 全部向量判定通过（无差异）
 *   1 = 存在差异（expected ≠ actual）或结构校验失败
 *   3 = 执行环境阻塞（Electron / Chrome 不可用）—— 不得伪装成通过
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT_DIR = path.join(DESKTOP, 'test', 'reports');
const VECTORS_DIR = path.join(DESKTOP, 'test', 'vectors');

const { PAGE_SETUP, PAGE_COLLECT } = await import('./harness/page-probes.mjs');
const {
  FIELD_REGISTRY, validateVector, judgeVector, summarize,
} = await import('./oracle/l2-harness.mjs');

/* ==========================================================================
   §1 独立性机器闸（P3-D09 §6.6）
   ========================================================================== */

function runIndependenceGate() {
  const { checkFiles } = require(path.join(__dirname, 'oracle', 'independence-check.cjs'));
  const targets = [
    path.join(__dirname, 'golden-vectors.mjs'),
    path.join(__dirname, 'oracle', 'l2-harness.mjs'),
    path.join(__dirname, 'harness', 'page-probes.mjs'),
  ];
  const results = checkFiles(targets);
  const failed = results.filter((r) => !r.ok);
  return { ok: failed.length === 0, results, failed };
}

/* ==========================================================================
   §2 启动双版本
   ========================================================================== */

function cleanEnv() {
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function launchElectronWithRetry(pw, attempts = 6) {
  const { _electron } = pw;
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
      return { app, attempts: i };
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        const wait = 1500 * i;
        console.log(`     ⏳ Electron 启动第 ${i} 次失败（可能是单实例锁竞争），${wait} ms 后重试…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/** 剪贴板类字段 → 复制按钮 id */
const CLIPBOARD_BUTTON = {
  resolutionText: 'btn-copy-resolution',
  fullParameterText: 'btn-copy-full',
};

/* ==========================================================================
   §3 主流程
   ========================================================================== */

async function main() {
  const argv = process.argv.slice(2);
  const outJson = (argv.find((a) => a.startsWith('--out=')) || '').split('=')[1];
  const onlyId = (argv.find((a) => a.startsWith('--id=')) || '').split('=')[1];

  console.log('=== L2 黄金向量独立测试套件（DEC-15 · TK-130）===\n');

  /* ---- 3.0 独立性闸 ---- */
  const gate = runIndependenceGate();
  console.log('【0】独立性自检（机器闸）');
  for (const r of gate.results) {
    console.log(`     ${r.ok ? '✅' : '❌'} ${r.file} → ${r.ok ? '0 命中' : '命中 ' + r.hits.length + ' 处'}`);
  }
  if (!gate.ok) {
    console.error('\n❌ 独立性自检失败 —— 退出码 1。');
    process.exit(1);
  }

  /* ---- 3.1 加载并校验向量 ---- */
  const goldenPath = path.join(VECTORS_DIR, 'golden.json');
  if (!fs.existsSync(goldenPath)) {
    console.error('❌ 缺少 golden.json —— 退出码 3（环境/数据缺失，不是产品失败）。');
    process.exit(3);
  }
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  let vectors = golden.vectors || [];
  if (onlyId) vectors = vectors.filter((v) => v.id === onlyId);
  console.log(`\n【1】加载黄金向量：共 ${vectors.length} 条`);

  const validations = new Map();
  const valid = [];
  const invalid = [];
  for (const v of vectors) {
    const r = validateVector(v);
    validations.set(v.id, r);
    if (r.ok && v.reachability !== 'ui-unreachable') valid.push(v);
    else invalid.push(v);
  }
  console.log(`     结构校验：通过 ${valid.length} ｜ 未通过 ${invalid.length}`);
  for (const v of invalid) {
    const r = validations.get(v.id);
    if (v.reachability === 'ui-unreachable') {
      console.log(`     ⚪ ${v.id}（${v.field}）UI 不可达 —— 不执行、不计覆盖、不判失败`);
      console.log(`        理由：${v.review.note.slice(0, 120)}…`);
    } else {
      console.log(`     ❌ ${v.id}（${v.field}）结构校验失败：${r.errors.join('; ')}`);
    }
  }

  /* ---- 3.2 启动双版本 ---- */
  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('\n❌ 阻塞：playwright-core 不可用。退出码 3。');
    process.exit(3);
  }
  const { chromium, _electron } = pw;

  let browser = null;
  let htmlPage = null;
  const htmlConsole = [];
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    htmlPage = await ctx.newPage();
    htmlPage.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') htmlConsole.push(m.type() + ': ' + m.text()); });
    htmlPage.on('pageerror', (e) => htmlConsole.push('pageerror: ' + e.message));
    await htmlPage.goto('file://' + path.join(REPO, 'index.html').replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    await htmlPage.evaluate(PAGE_SETUP);
    console.log('\n【2】HTML 版已就绪（Chrome · file://index.html）');
  } catch (e) {
    console.error('     ❌ HTML 版启动失败：' + e.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(3);
  }

  let electronApp = null;
  let electronWin = null;
  const elConsole = [];
  const elPageErrors = [];
  try {
    const launched = await launchElectronWithRetry(pw);
    electronApp = launched.app;
    electronWin = await electronApp.firstWindow({ timeout: 30000 });
    electronWin.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') elConsole.push(m.type() + ': ' + m.text()); });
    electronWin.on('pageerror', (e) => elPageErrors.push(String(e && e.message ? e.message : e)));
    await electronWin.waitForLoadState('domcontentloaded');
    await electronWin.waitForTimeout(1500);
    await electronWin.evaluate(PAGE_SETUP);
    console.log('     ✅ Electron 桌面版已就绪（app://bundle/index.html）');
  } catch (e) {
    console.error('     ❌ Electron 桌面版启动失败：' + e.message);
    console.error('     🔴 阻塞：待研发完成，不得伪造通过。退出码 3。');
    if (browser) await browser.close().catch(() => {});
    process.exit(3);
  }

  /* ---- 3.3 探针自检（防「字段整段未产出」被误判为通过） ---- */
  console.log('\n【3】探针自检（已知输入必须产出已知字段）');
  const probeSpec = {
    unit: 'm', widthText: '14', heightText: '4', ratioSource: 'screen',
    canvasMode: 'width', targetWidth: 1920,
  };
  const probeOk = await (async () => {
    try {
      await htmlPage.evaluate((s) => window.__dtApply(s), probeSpec);
      const obs = await htmlPage.evaluate('(' + PAGE_COLLECT + ')()');
      const checks = [
        ['candidates 非空', Array.isArray(obs.candidates) && obs.candidates.length > 0],
        ['badgeCode 已产出', !!obs.badgeCode],
        ['tableRows 非空', Array.isArray(obs.tableRows) && obs.tableRows.length > 0],
        ['warnText 字段存在', 'warnText' in obs],
        ['errorWidth 字段存在', 'errorWidth' in obs],
      ];
      for (const [name, pass] of checks) {
        console.log(`     ${pass ? '✅' : '❌'} ${name}`);
        if (!pass) return false;
      }
      return true;
    } catch (e) {
      console.log('     ❌ 探针自检异常：' + e.message);
      return false;
    }
  })();
  if (!probeOk) {
    console.error('\n❌ 探针自检失败 —— 本轮结论作废。退出码 3。');
    if (browser) await browser.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    process.exit(3);
  }

  /* ---- 3.4 逐向量执行 ---- */
  console.log(`\n【4】逐向量执行（每条：自身 input → HTML 观测 → Electron 观测 → 判定）\n`);
  const results = [];
  let diffCount = 0;

  for (const v of valid) {
    const entry = FIELD_REGISTRY[v.field];
    const spec = Object.assign({}, v.input);
    const rec = { id: v.id, field: v.field, confirmed: v.confirmation_status === 'confirmed', status: 'UNKNOWN' };

    /* —— 驱动并观测两侧 —— */
    const observe = async (page, isElectron) => {
      await page.evaluate((s) => window.__dtApply(s), spec);
      await page.waitForTimeout(250);
      const obs = await page.evaluate('(' + PAGE_COLLECT + ')()');
      const btnId = CLIPBOARD_BUTTON[v.field];
      if (btnId) {
        await page.evaluate((id) => { const b = document.getElementById(id); if (b) b.click(); }, btnId);
        await page.waitForTimeout(450);
        obs.clipboard = isElectron
          ? await electronApp.evaluate(async ({ clipboard }) => clipboard.readText())
          : await page.evaluate(() => navigator.clipboard.readText());
      }
      return obs;
    };

    let htmlObs = null;
    let elObs = null;
    let execErr = null;
    try {
      htmlObs = await observe(htmlPage, false);
      elObs = await observe(electronWin, true);
    } catch (e) {
      execErr = e.message;
    }

    if (execErr) {
      rec.status = 'blocked';
      rec.error = execErr;
      diffCount += 1;
      results.push(rec);
      console.log(`  ⚠️ ${v.id} [${v.field}] 采集异常：${execErr}`);
      continue;
    }

    /* —— 判定（expected vs 两侧 actual） —— */
    const htmlJudge = judgeVector(v, htmlObs);
    const elJudge = judgeVector(v, elObs);
    /* —— L3 交叉校验：同输入两侧观测是否一致 —— */
    const crossConsistent = JSON.stringify(htmlJudge.actual) === JSON.stringify(elJudge.actual);

    rec.expected = {};
    for (const k of entry.keys) rec.expected[k] = v.expected[k];
    rec.htmlActual = htmlJudge.actual;
    rec.electronActual = elJudge.actual;
    rec.crossConsistent = crossConsistent;

    if (htmlJudge.pass && elJudge.pass) {
      rec.status = 'pass';
      const conf = rec.confirmed ? '' : '（pending，不计入已确认覆盖）';
      const cross = crossConsistent ? '' : ' ⚠️ 两侧实际值不一致';
      console.log(`  ✅ ${v.id} [${v.field}] ${entry.keys.map((k) => k + '=' + JSON.stringify(v.expected[k])).join(' ')}${conf}${cross}`);
    } else {
      rec.status = 'fail';
      rec.diffs = [];
      diffCount += 1;
      for (const d of htmlJudge.diffs) rec.diffs.push(Object.assign({ side: 'html' }, d));
      for (const d of elJudge.diffs) rec.diffs.push(Object.assign({ side: 'electron' }, d));
      console.log(`  ❌ ${v.id} [${v.field}]`);
      for (const d of rec.diffs) {
        console.log(`       ${d.side} ${d.key}：期望=${JSON.stringify(d.expected)} 实际=${JSON.stringify(d.actual)}`);
      }
    }
    results.push(rec);
  }

  /* ---- 3.5 汇总 ---- */
  /* 🔴 口径一致性：未通过结构校验 / UI 不可达的向量也必须进入统计，
     否则「头部说未通过 1、汇总说 0」自相矛盾。 */
  const statsResults = results.slice();
  for (const v of invalid) {
    const r = validations.get(v.id);
    if (v.reachability === 'ui-unreachable') {
      statsResults.push({ id: v.id, field: v.field, confirmed: false, status: 'unreachable' });
    } else {
      statsResults.push({ id: v.id, field: v.field, confirmed: false, status: 'invalid', errors: r.errors });
    }
  }
  const stats = summarize(vectors, statsResults);
  console.log('\n============================================================');
  console.log('【5】L2 汇总');
  console.log('============================================================');
  console.log(`  向量总数 ${stats.total} ｜ 已确认 ${stats.confirmed} ｜ 待确认 ${stats.pending}`);
  console.log(`  结构校验通过并执行 ${stats.executed} ｜ 通过 ${stats.passed} ｜ 失败 ${stats.failed} ｜ 阻塞 ${stats.blocked}`);
  console.log(`  结构校验未通过 ${stats.invalid} ｜ UI 不可达 ${stats.unreachable}`);
  console.log(`  🔴 L2 已确认覆盖字段数 = ${stats.coveredByL2Confirmed}（pending 不计入 —— 机器闸 TK-130）`);
  console.log(`  待确认字段：${stats.pendingFields.join(', ') || '无'}`);
  if (stats.unreachableFields.length) console.log(`  UI 不可达字段：${stats.unreachableFields.join(', ')}`);
  const crossBad = results.filter((r) => r.crossConsistent === false);
  console.log(`  L3 交叉校验（同输入双版观测一致）：${results.length - crossBad.length}/${results.length}`);
  for (const r of crossBad) {
    console.log(`    ⚠️ ${r.id}：HTML=${JSON.stringify(r.htmlActual)} Electron=${JSON.stringify(r.electronActual)}`);
  }
  console.log(`  HTML console error/warning = ${htmlConsole.length} ｜ Electron = ${elConsole.length} ｜ pageerror = ${elPageErrors.length}`);

  const verdict = diffCount > 0 ? 'FAIL（存在差异或采集阻塞）' : 'PASS（已执行向量全部通过）';
  console.log(`\n  门禁判定：${verdict}`);
  console.log('  ⚠️ 注意：本套件 PASS 只表示「研发推导的 expected 与产品实际一致」；');
  console.log('     由于全部向量仍为 pending_confirmation，L2 **尚未**提供已确认覆盖。');

  /* ---- 3.6 落盘 ---- */
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      suite: 'golden-vectors',
      rule: 'DEC-15 / TK-130',
      independenceGate: gate.ok,
      consoleErrors: { html: htmlConsole.length, electron: elConsole.length, pageError: elPageErrors.length },
    },
    summary: {
      total: stats.total, confirmed: stats.confirmed, pending: stats.pending,
      executed: stats.executed, passed: stats.passed, failed: stats.failed,
      invalid: stats.invalid, unreachable: stats.unreachable, blocked: stats.blocked,
      coveredByL2Confirmed: stats.coveredByL2Confirmed,
      coveredFields: stats.coveredFields, pendingFields: stats.pendingFields,
      unreachableFields: stats.unreachableFields,
      diffCount, verdict,
    },
    validations: Object.fromEntries([...validations].map(([k, v]) => [k, { ok: v.ok, errors: v.errors, warnings: v.warnings }])),
    results,
  };  const jsonPath = outJson || path.join(OUT_DIR, 'golden-vectors-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  📄 JSON 报告：${jsonPath}`);

  await browser.close().catch(() => {});
  if (electronApp) await electronApp.close().catch(() => {});

  if (diffCount > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ 执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
