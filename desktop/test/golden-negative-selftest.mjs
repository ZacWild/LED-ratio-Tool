/**
 * LED-ratio-Tool 桌面版 · 黄金向量负向自检测试（P0-2）
 * ============================================================================
 * 目的：验证**测试程序自身**是可靠的 —— 一个无法失败的测试没有价值。
 * 依据：任务书 Step 5 §三 P0-2「补充测试程序自身的负向测试」。
 *
 * 必测项：
 *   N-1 输入与 Golden Vector 不匹配时，不得错误命中
 *   N-2 expected 故意设置错误时，测试必须失败
 *   N-3 expected 缺失时，不得误报通过
 *   N-4 pending 向量不得计入确认覆盖
 *   N-5 同一输入的 HTML 与 Electron 结果能够进行有效对照
 *   N-6 未注册字段必须被显式拒绝（防止字段映射静默失效）
 *
 * 分层：
 *   · 逻辑层（N-1~N-4、N-6）：纯函数，无需浏览器 —— 快速、确定性；
 *   · 应用层（N-5）：真实驱动 HTML 与 Electron，任一端不可用即报 BLOCKED（退出码 3），
 *     不得伪装成通过。
 *
 * 退出码：
 *   0 = 全部负向用例行为符合预期
 *   1 = 有用例行为不符合预期（测试程序自身有缺陷）
 *   3 = 应用层无法执行（环境阻塞）
 */

'use strict';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');

const { FIELD_REGISTRY, validateVector, judgeVector, summarize } = await import('./oracle/l2-harness.mjs');
const { PAGE_SETUP, PAGE_COLLECT } = await import('./harness/page-probes.mjs');

const failures = [];
const notes = [];

function check(id, name, pass, detail) {
  const mark = pass ? '✅' : '❌';
  console.log(`  ${mark} ${id} ${name}${detail ? ' —— ' + detail : ''}`);
  if (!pass) failures.push(`${id} ${name}${detail ? '：' + detail : ''}`);
}

/* ==========================================================================
   §1 逻辑层负向测试
   ========================================================================== */

function logicTests() {
  console.log('【逻辑层】负向测试（纯函数，无浏览器）\n');

  /* ---- N-1：错配输入不得命中 ---- */
  {
    // GV-001 的 expected（crop 0.75px）拿去比对 GV-002 场景的观测（exact）→ 必须失败
    const v001 = { id: 'X-001', field: 'fitAdvice.describeFit', input: {}, expected: { describeFitText: '需裁切（左右各 0.75px）' }, confirmation_status: 'confirmed' };
    const obsFromOtherScenario = { candidates: [{ title: '常用规格（当前）', res: '1920 × 1080', meta: '等比适配：比例一致，无需裁切或补边（不建议拉伸）' }] };
    const j = judgeVector(v001, obsFromOtherScenario);
    check('N-1', '错配输入不得错误命中', j.pass === false,
      `期望「需裁切（左右各 0.75px）」比对「比例一致…」的观测 → judge.pass=${j.pass}（应为 false）`);
  }

  /* ---- N-2：expected 故意错误必须失败 ---- */
  {
    const v = { id: 'X-002', field: 'fitAdvice.describeFit', input: {}, expected: { describeFitText: '需裁切（左右各 0.76px）' }, confirmation_status: 'confirmed' };
    const obs = { candidates: [{ title: '按目标宽度（当前）', res: '1920 × 549', meta: '等比适配：需裁切（左右各 0.75px）（不建议拉伸）' }] };
    const j = judgeVector(v, obs);
    check('N-2a', '错误 expected（数值差 0.01）必须失败', j.pass === false, `judge.pass=${j.pass}`);
    const v2 = { id: 'X-002b', field: 'badge', input: {}, expected: { badgeCode: 'RS-04', badgeLabel: '严格匹配' }, confirmation_status: 'confirmed' };
    const obs2 = { badgeCode: 'RS-02', badgeText: '▲ 非标准比例' };
    const j2 = judgeVector(v2, obs2);
    check('N-2b', '错误 expected（徽标态错）必须失败', j2.pass === false, `judge.pass=${j2.pass}`);
  }

  /* ---- N-3：expected 缺失不得误报通过 ---- */
  {
    const cases = [
      ['expected 整个缺失', { id: 'X-003a', field: 'badge', input: { unit: 'm' }, confirmation_status: 'confirmed' }],
      ['expected 键缺失', { id: 'X-003b', field: 'badge', input: { unit: 'm' }, expected: { badgeCode: 'RS-04' }, confirmation_status: 'confirmed' }],
      ['expected 值为 null', { id: 'X-003c', field: 'badge', input: { unit: 'm' }, expected: { badgeCode: 'RS-04', badgeLabel: null }, confirmation_status: 'confirmed' }],
      ['expected 值为空串', { id: 'X-003d', field: 'warnText', input: { unit: 'm' }, expected: { warnText: '' }, confirmation_status: 'confirmed' }],
      ['input 缺失', { id: 'X-003e', field: 'warnText', input: {}, expected: { warnText: 'x' }, confirmation_status: 'confirmed' }],
    ];
    for (const [name, v] of cases) {
      const r = validateVector(v);
      check('N-3', `${name} → 校验必须失败`, r.ok === false, `errors=[${r.errors.join(', ')}]`);
    }
    // 且：即便强行执行，缺失 expected 的向量也不得判 pass
    const v = { id: 'X-003f', field: 'warnText', input: {}, expected: {}, confirmation_status: 'confirmed' };
    const obs = { warnVisible: false, warnText: null };
    const j = judgeVector(v, obs);
    check('N-3f', '空 expected 强行执行也不得判 pass', j.pass === false, `judge.pass=${j.pass}`);
  }

  /* ---- N-4：pending 不得计入确认覆盖 ---- */
  {
    const vectors = [
      { id: 'P-1', field: 'badge', input: {}, expected: { badgeCode: 'RS-04', badgeLabel: '严格匹配' }, confirmation_status: 'pending_confirmation' },
      { id: 'P-2', field: 'warnText', input: {}, expected: { warnText: 'x' }, confirmation_status: 'confirmed' },
    ];
    // 两条都「通过」，但只有 confirmed 那条计入覆盖
    const results = [
      { id: 'P-1', field: 'badge', confirmed: false, status: 'pass' },
      { id: 'P-2', field: 'warnText', confirmed: true, status: 'pass' },
    ];
    const s = summarize(vectors, results);
    check('N-4a', 'pending 通过不计入已确认覆盖', s.coveredByL2Confirmed === 1,
      `coveredByL2Confirmed=${s.coveredByL2Confirmed}（应为 1，只计 confirmed 的 P-2）`);
    check('N-4b', 'pending 字段列入待确认清单', s.pendingFields.indexOf('badge') >= 0,
      `pendingFields=[${s.pendingFields.join(', ')}]`);
    // 全部 pending 时覆盖必须为 0
    const s2 = summarize(vectors, [{ id: 'P-1', field: 'badge', confirmed: false, status: 'pass' }, { id: 'P-2', field: 'warnText', confirmed: false, status: 'pass' }]);
    check('N-4c', '全部 pending 时已确认覆盖 = 0', s2.coveredByL2Confirmed === 0,
      `coveredByL2Confirmed=${s2.coveredByL2Confirmed}`);
  }

  /* ---- N-6：未注册字段必须被拒绝 ---- */
  {
    const v = { id: 'X-006', field: 'not.a.real.field', input: { unit: 'm' }, expected: { whatever: 'x' }, confirmation_status: 'confirmed' };
    const r = validateVector(v);
    check('N-6', '未注册字段必须被显式拒绝', r.ok === false && r.errors.some((e) => e.indexOf('unknown_field') === 0),
      `errors=[${r.errors.join(', ')}]`);
  }

  /* ---- N-7：注册表自身的键集合一致性（防字段注册表漂移） ---- */
  {
    // 每个字段的 extract 必须在给定最小观测时可调用且返回注册表要求的键
    const probe = {
      candidates: [], tableRows: [], warnVisible: false, warnText: null,
      badgeCode: null, badgeText: null, errorWidth: null, errorHeight: null,
      clipboard: null, nearestText: null,
    };
    let ok = true;
    const detail = [];
    for (const [field, entry] of Object.entries(FIELD_REGISTRY)) {
      try {
        const out = entry.extract(probe);
        for (const k of entry.keys) {
          if (!(k in out)) { ok = false; detail.push(`${field} 缺键 ${k}`); }
        }
      } catch (e) { ok = false; detail.push(`${field} extract 抛异常：${e.message}`); }
    }
    check('N-7', '注册表 extract 对空观测可调用且返回全部注册键', ok, detail.join('; ') || '全部字段通过');
  }
}

/* ==========================================================================
   §2 应用层负向测试（N-5：双版对照有效性）
   ========================================================================== */

async function appTests() {
  console.log('\n【应用层】N-5 同一输入双版对照有效性（真实驱动）\n');

  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.log('  ⚠️ BLOCKED：playwright-core 不可用 —— 应用层无法执行（退出码 3）。');
    return 'blocked';
  }
  const { chromium, _electron } = pw;

  let browser = null;
  let htmlPage = null;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    htmlPage = await ctx.newPage();
    await htmlPage.goto('file://' + path.join(REPO, 'index.html').replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    await htmlPage.evaluate(PAGE_SETUP);
  } catch (e) {
    console.log('  ⚠️ BLOCKED：HTML 版启动失败 —— ' + e.message);
    if (browser) await browser.close().catch(() => {});
    return 'blocked';
  }

  let electronApp = null;
  let electronWin = null;
  try {
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    electronApp = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env, timeout: 60000 });
    electronWin = await electronApp.firstWindow({ timeout: 30000 });
    await electronWin.waitForLoadState('domcontentloaded');
    await electronWin.waitForTimeout(1500);
    await electronWin.evaluate(PAGE_SETUP);
  } catch (e) {
    console.log('  ⚠️ BLOCKED：Electron 启动失败 —— ' + e.message);
    if (browser) await browser.close().catch(() => {});
    return 'blocked';
  }

  // 用**同一个 input** 驱动两端，取同一字段，断言观测一致
  const spec = { unit: 'm', widthText: '14', heightText: '4', ratioSource: 'screen', canvasMode: 'width', targetWidth: 1920 };
  try {
    await htmlPage.evaluate((s) => window.__dtApply(s), spec);
    await htmlPage.waitForTimeout(250);
    const htmlObs = await htmlPage.evaluate('(' + PAGE_COLLECT + ')()');
    await electronWin.evaluate((s) => window.__dtApply(s), spec);
    await electronWin.waitForTimeout(250);
    const elObs = await electronWin.evaluate('(' + PAGE_COLLECT + ')()');

    const sameBadge = htmlObs.badgeCode === elObs.badgeCode;
    check('N-5a', '同输入双版 badgeCode 一致', sameBadge, `html=${htmlObs.badgeCode} electron=${elObs.badgeCode}`);
    const sameCands = JSON.stringify(htmlObs.candidates) === JSON.stringify(elObs.candidates);
    check('N-5b', '同输入双版候选列表一致', sameCands, sameCands ? '逐字一致' : '存在差异');
    const sameRes = htmlObs.resValue === elObs.resValue;
    check('N-5c', '同输入双版分辨率文本一致', sameRes, `html=${htmlObs.resValue} electron=${elObs.resValue}`);

    // N-5d：换一个**不同**输入，两端仍应一致（证明不是「恒定一致」的假象）
    const spec2 = { unit: 'mm', widthText: '3440', heightText: '1440', ratioSource: 'standard', standardKey: '3440×1440', canvasMode: 'width', targetWidth: 1920 };
    await htmlPage.evaluate((s) => window.__dtApply(s), spec2);
    await htmlPage.waitForTimeout(250);
    const h2 = await htmlPage.evaluate('(' + PAGE_COLLECT + ')()');
    await electronWin.evaluate((s) => window.__dtApply(s), spec2);
    await electronWin.waitForTimeout(250);
    const e2 = await electronWin.evaluate('(' + PAGE_COLLECT + ')()');
    const same2 = JSON.stringify(h2.candidates) === JSON.stringify(e2.candidates);
    check('N-5d', '换输入后双版仍一致', same2, same2 ? '逐字一致' : '存在差异');

    // N-5e：双版对同一向量判定必须给出相同结论（judge 层）
    const v = { id: 'SELF', field: 'badge', input: spec, expected: { badgeCode: htmlObs.badgeCode, badgeLabel: (htmlObs.badgeText || '').replace(/^[▲✓!Δ]\s*/, '') }, confirmation_status: 'confirmed' };
    const jh = judgeVector(v, htmlObs);
    const je = judgeVector(v, elObs);
    check('N-5e', '双版对同向量判定结论一致', jh.pass === je.pass && jh.pass === true,
      `html.pass=${jh.pass} electron.pass=${je.pass}`);
  } catch (e) {
    console.log('  ⚠️ 应用层执行异常：' + e.message);
    failures.push('N-5 应用层执行异常：' + e.message);
  } finally {
    await browser.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
  }
  return 'ok';
}

/* ==========================================================================
   §3 主流程
   ========================================================================== */

async function main() {
  console.log('=== 黄金向量负向自检测试（P0-2）===\n');
  logicTests();
  const appResult = await appTests();

  console.log('\n============================================================');
  console.log('【自检结论】');
  console.log('============================================================');
  if (failures.length === 0) {
    console.log('  ✅ 全部负向用例行为符合预期 —— 测试程序自身可靠。');
  } else {
    console.log(`  ❌ ${failures.length} 个用例行为不符合预期：`);
    for (const f of failures) console.log('     · ' + f);
  }
  if (appResult === 'blocked') {
    console.log('  ⚠️ 应用层（N-5）因环境阻塞未执行 —— 逻辑层已通过，但双版对照未经本轮验证。');
  }

  if (failures.length > 0) process.exit(1);
  if (appResult === 'blocked') process.exit(3);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ 自检执行器异常：', e && e.stack ? e.stack : e);
  process.exit(3);
});
