/**
 * LED 大屏比例与视频画布换算工具 · 交付前总验收脚本
 * ---------------------------------------------------------------------------
 * 运行：node led-ratio-tool/test/acceptance.mjs
 * 退出码：0 = 全部通过；非 0 = 存在失败项
 *
 * ★ 断言纪律（重要）：
 *   本脚本是**独立验收方**，不复用产品代码作为"标准答案"。
 *   所有期望值由本文件内的独立算术推导（ownGcd / ownToMm / ownPickHeight），
 *   断言的是**不变量**（比例关系、误差非零性、字段齐备性、轴向正确性、
 *   语义不矛盾、字段不缺失），而不是"某个具体颜色/某个写死数值"。
 *   需求变化时本脚本不应因数值变化而误报。
 *
 * 用法：
 *   node test/acceptance.mjs              # 全量验收
 *   node test/acceptance.mjs --no-shots   # 跳过截图
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * 解析 playwright-core —— 四级回退，不依赖任何特定机器的绝对路径。
 *
 * ① 项目内依赖        → node_modules/playwright-core（npm install 后即可用）
 * ② 环境变量 PW_CORE  → 覆盖（用于特殊安装位置）
 * ③ 全局 npm 根目录   → npm root -g 下的 playwright-core
 * ④ 明确报错          → 给出可执行的安装指引，不静默失败
 *
 * 🔒 **浏览器要求**：本脚本用 `chromium.launch({ channel: 'chrome' })` 启动
 *    **系统已安装的 Google Chrome**（不是 playwright 下载的 Chromium）。
 *    → 因此**不需要**执行 `npx playwright install chromium`；
 *    → 但**必须**在机器上安装 Google Chrome。
 *    → 若改用 `chromium.launch()`（无 channel），则需先跑
 *      `npx playwright install chromium` 下载浏览器。
 */
function resolvePlaywright() {
  const candidates = [];

  // ① 项目内依赖（首选）
  candidates.push(['项目内依赖 node_modules/playwright-core', 'playwright-core']);
  candidates.push(['项目内依赖 node_modules/@playwright/test', '@playwright/test']);

  // ② 环境变量覆盖
  if (process.env.PW_CORE) {
    candidates.unshift([`环境变量 PW_CORE（${process.env.PW_CORE}）`, process.env.PW_CORE]);
  }

  for (const [label, spec] of candidates) {
    try {
      const mod = require(spec);
      if (mod && mod.chromium) {
        return { chromium: mod.chromium, source: label };
      }
    } catch {
      /* 继续尝试下一个 */
    }
  }

  // ③ 全局 npm 根目录
  try {
    const { execFileSync } = require('node:child_process');
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const spec = join(globalRoot, 'playwright-core');
    const mod = require(spec);
    if (mod && mod.chromium) {
      return { chromium: mod.chromium, source: `全局 npm 根目录（${spec}）` };
    }
  } catch {
    /* 继续 */
  }

  // ④ 明确报错
  console.error(
    [
      '',
      '❌ 找不到 playwright-core —— 无法执行端到端验收。',
      '',
      '本项目已把 playwright-core 声明为**开发依赖**，请在仓库根目录执行：',
      '',
      '    npm install',
      '',
      '若你的环境把依赖装在别处，可用环境变量指定：',
      '',
      '    # Windows CMD',
      '    set PW_CORE=C:\\path\\to\\playwright-core',
      '    # Windows PowerShell',
      '    $env:PW_CORE = "C:\\path\\to\\playwright-core"',
      '    # bash / zsh',
      '    PW_CORE=/path/to/playwright-core npm run test:e2e',
      '',
      '⚠️ 浏览器要求：本脚本用系统已安装的 **Google Chrome**（channel: chrome）。',
      '   请确认机器上已安装 Chrome；否则安装后再运行。',
      '   （不需要执行 npx playwright install chromium —— 除非你把脚本改成不带 channel 的启动方式）',
      '',
    ].join('\n'),
  );
  process.exit(2);
}

const { chromium, source: PW_SOURCE } = resolvePlaywright();

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SHOTS = join(here, 'shots');
const TAKE_SHOTS = !process.argv.includes('--no-shots');

const DEV_URL = pathToFileURL(join(ROOT, 'index.html')).href;
const DIST_URL = pathToFileURL(join(ROOT, 'dist', 'led-ratio-tool.html')).href;

/* ==========================================================================
   0. 独立算术 oracle（不复用产品代码）
   ========================================================================== */

/** 独立的最大公约数 */
function ownGcd(a, b) {
  a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b));
  while (b) { const t = a % b; a = b; b = t; }
  return a || 1;
}

/** 独立的最简整数比（由 mm 对推导） */
function ownReduced(wMm, hMm) {
  const g = ownGcd(wMm, hMm);
  return { a: wMm / g, b: hMm / g, text: (wMm / g) + ':' + (hMm / g) };
}

/** 独立：米/厘米/毫米字符串 → mm（对齐 core 的量化规则：mm×1000 取整） */
function ownToMm(text, unit) {
  const factor = unit === 'm' ? 1000 : (unit === 'cm' ? 10 : 1);
  const v = Number(String(text).trim());
  if (!isFinite(v)) return null;
  return Math.round(v * factor * 1000);
}

/** 独立：取整高度的合法候选集合（理论值的相邻两个整数） */
function ownHeightCandidates(theoretical) {
  const lo = Math.floor(theoretical), hi = Math.ceil(theoretical);
  return lo === hi ? [lo] : [lo, hi];
}

/**
 * 独立：给定目标宽 W 与目标比例 R，输出高度必须是哪个整数？
 * 规则 = 在理论高相邻两个整数中，选"输出比例误差更小"的那个。
 */
function ownPickHeight(W, R) {
  const t = W / R;
  const cands = ownHeightCandidates(t);
  if (cands.length === 1) return cands[0];
  let best = cands[0], bestErr = Math.abs(W / best - R);
  for (const c of cands.slice(1)) {
    const e = Math.abs(W / c - R);
    if (e < bestErr) { best = c; bestErr = e; }
  }
  return best;
}

/** 独立：是否严格匹配（相对误差 ≤ 1e-9） */
function ownStrictMatch(W, H, R) {
  if (!isFinite(W) || !isFinite(H) || !isFinite(R) || H === 0) return false;
  return Math.abs(W / H - R) / R <= 1e-9;
}

/** 独立：相对误差百分比（未取整的原始值） */
function ownRelErrPercent(W, H, R) {
  return Math.abs(W / H - R) / R * 100;
}

/** 独立：找出"真实误差非零、但小到会被 2 位小数显示抹成 0"的宽度样本 */
function findTinyErrorWidths(R, from, to, cap) {
  const hits = [];
  for (let w = from; w <= to && hits.length < cap; w++) {
    const H = ownPickHeight(w, R);
    const err = ownRelErrPercent(w, H, R);
    if (err > 0 && err < 0.0045) hits.push({ w, H, err });
  }
  return hits;
}

/** 独立：独立枚举"不超上限且比例精确"的最大整数倍 k */
function ownMaxKInBounds(a, b, maxW, maxH) {
  let best = 0;
  for (let k = 1; k <= 100000; k++) {
    if (k * a <= maxW && k * b <= maxH) best = k; else break;
  }
  return best;
}

/* ==========================================================================
   1. 迷你断言框架
   ========================================================================== */

const results = [];
let currentGroup = '(未分组)';

function group(name) { currentGroup = name; }

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function t(id, desc, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ group: currentGroup, id, desc, ok: true, note: note || '', ms: Date.now() - started });
    console.log(`  ✅ ${id}  ${desc}${note ? '  — ' + note : ''}`);
  } catch (err) {
    results.push({ group: currentGroup, id, desc, ok: false, note: err.message, ms: Date.now() - started });
    console.log(`  ❌ ${id}  ${desc}\n        ↳ ${err.message}`);
  }
}

/* ==========================================================================
   2. 浏览器工具
   ========================================================================== */

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({
    viewport: viewport || { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') page.__errors.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => page.__errors.push('pageerror: ' + e.message));
  page.__external = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) page.__external.push(r.url()); });
  return page;
}

/** 读出结果面板的关键状态 */
async function readState(page) {
  return page.evaluate(() => {
    const g = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
    const q = (sel) => [...document.querySelectorAll(sel)];
    return {
      ratioValue: g('ratio-value'),
      ratioSuffix: g('ratio-suffix'),
      approxLine: g('approx-line'),
      approxVisible: document.getElementById('approx-line').style.display !== 'none',
      resValue: g('res-value'),
      coreNote: g('core-note'),
      badge: g('result-badge'),
      warnVisible: document.getElementById('warn-bar').style.display !== 'none',
      warn: g('warn-text'),
      live: g('live-results'),
      tableRows: q('#table-body tr').map((tr) => [...tr.children].map((td) => td.textContent.trim())),
      matchRows: q('#match-body tr').map((tr) => [...tr.children].map((td) => td.textContent.trim())),
      candidates: q('#candidate-list .mode-item').map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
      standardItems: q('#standard-list .list__item').map((el) => ({
        key: el.dataset.key, text: el.textContent.replace(/\s+/g, ' ').trim(),
      })),
      presetItems: q('#preset-list .list__item').map((el) => ({
        key: el.dataset.key, name: el.querySelector('.list__name').textContent.trim(),
        meta: el.querySelector('.list__meta').textContent.trim(),
      })),
      demoItems: q('#demo-list .list__item').map((el) => ({ title: el.getAttribute('title') || '' })),
      errors: { w: g('error-width'), h: g('error-height') },
      inputs: {
        width: document.getElementById('input-width').value,
        height: document.getElementById('input-height').value,
        unit: document.querySelector('.unit-segment[aria-checked="true"]').dataset.unit,
        targetWidth: document.getElementById('input-target-width').value,
        targetHeight: document.getElementById('input-target-height').value,
        maxWidth: document.getElementById('input-canvas-max-width').value,
        maxHeight: document.getElementById('input-canvas-max-height').value,
        canvasRatio: document.getElementById('input-canvas-ratio').value,
        ratioSource: document.querySelector('.ratio-source-segment[aria-checked="true"]').dataset.source,
        canvasMode: document.querySelector('.canvas-mode-segment[aria-checked="true"]').dataset.mode,
        prefer: document.querySelector('.prefer-segment[aria-checked="true"]').dataset.prefer,
      },
      canvasLabel: g('canvas-label'),
      stageBadge: g('stage-badge'),
    };
  });
}

/** 读出舞台几何（用于轴向断言） */
async function readStage(page) {
  return page.evaluate(() => {
    const box = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { display: cs.display, w: el.offsetWidth, h: el.offsetHeight, label: el.textContent.trim() };
    };
    const sr = document.getElementById('screen-rect');
    return {
      screen: { w: sr.offsetWidth, h: sr.offsetHeight },
      canvas: box('canvas-rect'),
      L: box('hatch-left'), R: box('hatch-right'), T: box('hatch-top'), B: box('hatch-bottom'),
    };
  });
}

/** 读取剪贴板 */
async function readClip(page) {
  try { return await page.evaluate(() => navigator.clipboard.readText()); }
  catch (e) { return 'CLIP_READ_ERR:' + e.message; }
}

/** 设置可见输入 */
async function setInput(page, sel, value) {
  await page.fill(sel, value);
  await page.waitForTimeout(320);
}

/** 复位到初始态 */
async function resetAll(page) {
  await page.click('#btn-reset');
  await page.waitForTimeout(350);
}

/** 解析 "3.5 : 1" / "1.8056 : 1" / "2.3889 : 1" 形式的比例文本 */
function parseRatioText(txt) {
  const m = String(txt).match(/([\d.]+)\s*:\s*1/);
  return m ? parseFloat(m[1]) : NaN;
}

/* ==========================================================================
   3. 验收主流程
   ========================================================================== */

const browser = await chromium.launch({ channel: 'chrome' });
if (TAKE_SHOTS) mkdirSync(SHOTS, { recursive: true });

const page = await newPage(browser, { width: 1440, height: 1100 });
await page.goto(DEV_URL);
await page.waitForTimeout(600);

/* ---------------- 3.1 案例 A–F（开发版） ---------------- */

group('A. 案例 A：14m×4m 超宽工程屏');

await t('A1', '实际比例由物理尺寸算出（独立 oracle 比对，非写死值）', async () => {
  const s = await readState(page);
  const wMm = ownToMm('14', 'm'), hMm = ownToMm('4', 'm');
  const expected = (wMm / hMm).toFixed(4);
  assert(s.ratioValue.replace(/\s/g, '') === expected + ':1', `期望 ${expected}:1，实际 ${s.ratioValue}`);
  return `屏幕比例 ${s.ratioValue}`;
});

await t('A2', '最简整数比由实际输入约分得出，且不等于 21:9 的整数比', async () => {
  const s = await readState(page);
  const exp = ownReduced(ownToMm('14', 'm'), ownToMm('4', 'm'));
  assert(s.ratioSuffix.includes(exp.text), `期望含 ${exp.text}，实际 ${s.ratioSuffix}`);
  const exp21 = ownReduced(21, 9).text;
  assert(!s.ratioSuffix.includes(exp21), `不得出现 21:9 的整数比 ${exp21}，实际 ${s.ratioSuffix}`);
  return s.ratioSuffix;
});

await t('A3', '页面明确提示"不是标准 21:9"，且该提示可见', async () => {
  const s = await readState(page);
  assert(s.warnVisible, '警示条未显示');
  assert(/21:9/.test(s.warn), `警示文案未提 21:9：${s.warn}`);
  assert(/非标准|不能按/.test(s.warn), `警示文案未表达"非标准/不能按 21:9"：${s.warn}`);
  return s.warn.slice(0, 46) + '…';
});

await t('A4', '结果徽章判为"非标准比例"，未被"严格匹配"覆盖', async () => {
  const s = await readState(page);
  assert(/非标准/.test(s.badge), `徽章应为非标准比例，实际 ${s.badge}`);
  return s.badge;
});

await t('A5', '目标宽 4900 → 理论高与输出分辨率自洽（理论高=W/R，输出高为相邻整数之一）', async () => {
  await setInput(page, '#input-target-width', '4900');
  const s = await readState(page);
  const R = ownToMm('14', 'm') / ownToMm('4', 'm');
  const theo = 4900 / R;
  const pick = ownPickHeight(4900, R);
  const m = /(\d+)\s*×\s*(\d+)/.exec(s.resValue);
  assert(m, `未解析出分辨率：${s.resValue}`);
  const [, W, H] = m.map(Number);
  assert(W === 4900, `宽度应为 4900，实际 ${W}`);
  assert(H === pick, `取整高度应为 ${pick}（理论 ${theo.toFixed(4)}），实际 ${H}`);
  assert(ownHeightCandidates(theo).includes(H), `高度 ${H} 不在理论值的相邻整数集合内`);
  const cand = s.candidates.find((c) => c.startsWith('按目标宽度'));
  assert(cand && cand.includes(theo.toFixed(4)), `候选卡未给出理论高 ${theo.toFixed(4)}px：${cand}`);
  assert(cand && /严格匹配/.test(cand), `候选卡未判定严格匹配：${cand}`);
  assert(ownStrictMatch(W, H, R), `独立复核：${W}×${H} 对 ${R} 不应严格匹配`);
  return `${s.resValue}（理论高 ${theo.toFixed(4)}，严格匹配）`;
});

await t('A6', '一键复制分辨率格式为 "宽×高"（× 连接符、无千分位），且真实写入剪贴板', async () => {
  await page.click('#btn-copy-resolution');
  await page.waitForTimeout(500);
  const clip = await readClip(page);
  const m = /^(\d+)×(\d+)$/.exec(clip);
  assert(m, `剪贴板内容格式不符（期望 宽×高 形式）：${JSON.stringify(clip)}`);
  assert(m[1] === '4900' && m[2] === '1400', `剪贴板内容错误：${clip}`);
  const label = await page.locator('#btn-copy-resolution .label').textContent();
  assert(/已复制/.test(label), `按钮未给出成功反馈：${label}`);
  const live = await page.locator('#live-feedback').textContent();
  assert(live.trim().length > 0, 'aria-live 区域无播报');
  return `剪贴板 "${clip}"，反馈 "${label.trim()}"`;
});

group('B. 案例 B：21:9（俗称）目标比例');

await t('B1', '21:9 在比例库中标为"俗称"并给出严格数学值（独立 gcd 推导）', async () => {
  const s = await readState(page);
  const item = s.standardItems.find((i) => i.key === '21:9');
  assert(item, '比例库中没有 21:9 条目');
  assert(/俗称/.test(item.text), `21:9 未标俗称：${item.text}`);
  const exp = ownReduced(21, 9).text;
  assert(item.text.includes(exp), `21:9 严格值应为 ${exp}，实际 ${item.text}`);
  return item.text;
});

await t('B2', '目标宽 3840 → 理论高 = 3840/R，整数高取相邻整数，输出自洽', async () => {
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(200);
  await page.click('#standard-list .list__item[data-key="21:9"]');
  await page.waitForTimeout(300);
  await setInput(page, '#input-target-width', '3840');
  const s = await readState(page);
  const R = ownReduced(21, 9).a / ownReduced(21, 9).b;
  const theo = 3840 / R;
  const pick = ownPickHeight(3840, R);
  const m = /(\d+)\s*×\s*(\d+)/.exec(s.resValue);
  assert(m, `未解析出分辨率：${s.resValue}`);
  const [, W, H] = m.map(Number);
  assert(W === 3840, `宽度应为 3840，实际 ${W}`);
  assert(H === pick, `取整高度应为 ${pick}（理论 ${theo.toFixed(4)}），实际 ${H}`);
  const cand = s.candidates.find((c) => c.startsWith('按目标宽度'));
  assert(cand && cand.includes(theo.toFixed(4)), `候选卡未给出理论高 ${theo.toFixed(4)}px：${cand}`);
  return `${s.resValue}（理论高 ${theo.toFixed(4)}）`;
});

await t('B3', '取整误差被展示且不得声称严格等于 21:9', async () => {
  const s = await readState(page);
  const row = s.tableRows.find((r) => r[0] === '匹配判定');
  assert(row && /存在取整误差/.test(row[2]), `表格匹配判定未表达取整误差：${row && row.join('|')}`);
  const errRow = s.tableRows.find((r) => r[0] === '宽高比相对误差');
  assert(errRow && errRow[3] !== '—', '宽高比相对误差为空');
  assert(!/严格匹配/.test(s.badge), `徽章不得声称严格匹配，实际 ${s.badge}`);
  const cand = s.candidates.find((c) => c.startsWith('按目标宽度'));
  assert(cand && /存在取整误差/.test(cand), `候选卡未表达取整误差：${cand}`);
  const R = 7 / 3, W = 3840, H = ownPickHeight(3840, R);
  const exp = ownRelErrPercent(W, H, R);
  const shown = parseFloat(String(errRow[3]).replace('%', '').replace('+', ''));
  assert(Math.abs(shown - exp) < 0.011, `误差显示 ${errRow[3]} 与独立计算 ${exp.toFixed(4)}% 不符`);
  assert(exp > 0, '独立复核：此处本应存在非零取整误差');
  return `误差 ${errRow[3]}（独立算 ${exp.toFixed(4)}%）`;
});

group('C. 案例 C：3440×1440 不得误判为严格 21:9');

await t('C1', '实际比例独立复算为 3440/1440', async () => {
  await page.click('#standard-list .list__item[data-key="3440×1440"]');
  await page.waitForTimeout(400);
  const s = await readState(page);
  const exp = (3440 / 1440).toFixed(4);
  const row = s.tableRows.find((r) => r[0] === '实际比例');
  assert(row && parseRatioText(row[2]).toFixed(4) === exp, `目标比例列应为 ${exp}，实际 ${row && row.join('|')}`);
  return `目标比例 ${row[2]}`;
});

await t('C2', '与 21:9 的实质偏差被显式提示（不得按 21:9 解读）', async () => {
  const s = await readState(page);
  assert(s.warnVisible, '警示条未显示');
  assert(/21:9/.test(s.warn) && /不能按/.test(s.warn), `警示文案未澄清 21:9：${s.warn}`);
  const expDiff = Math.abs(3440 / 1440 - 7 / 3) / (7 / 3) * 100;
  const shown = parseFloat((s.warn.match(/([\d.]+)%/) || [])[1]);
  assert(Math.abs(shown - expDiff) < 0.01, `偏差显示 ${shown}% 与独立计算 ${expDiff.toFixed(4)}% 不符：${s.warn}`);
  return s.warn.slice(0, 50) + '…';
});

group('D. 案例 D：1920×1080 与 3840×2160 对 16:9 均严格匹配');

await t('D1', '16:9 与两种常见分辨率在匹配表中都标为"精确命中"且偏差为 0', async () => {
  await page.click('#standard-list .list__item[data-key="16:9"]');
  await page.waitForTimeout(400);
  const s = await readState(page);
  for (const key of ['16:9', '1920×1080', '3840×2160']) {
    const row = s.matchRows.find((r) => r[0].startsWith(key));
    assert(row, `匹配表缺少 ${key}`);
    assert(row[3] === '精确命中', `${key} 应为精确命中，实际 ${row.join('|')}`);
    assert(parseFloat(row[2]) === 0, `${key} 偏差应为 0，实际 ${row[2]}`);
  }
  return '三行均精确命中';
});

await t('D2', '结果徽章对 16:9 判定为严格匹配', async () => {
  const s = await readState(page);
  assert(/严格匹配/.test(s.badge), `徽章应为严格匹配，实际 ${s.badge}`);
  return s.badge;
});

group('E. 案例 E：65:36 变形比例');

await t('E1', '实际比例独立复算为 65/36，最简整数比独立 gcd 推导', async () => {
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '65:36');
  await page.waitForTimeout(300);
  const s = await readState(page);
  const exp = (65 / 36).toFixed(4);
  const row = s.tableRows.find((r) => r[0] === '实际比例');
  assert(row && parseRatioText(row[2]).toFixed(4) === exp, `目标比例列应为 ${exp}，实际 ${row && row.join('|')}`);
  const expRed = ownReduced(65, 36).text;
  const redRow = s.tableRows.find((r) => r[0] === '最简整数比');
  assert(redRow && redRow[2].startsWith(expRed), `最简整数比应为 ${expRed}，实际 ${redRow && redRow.join('|')}`);
  return `目标比例 ${row[2]}，整数比 ${redRow[2]}`;
});

await t('E2', '目标宽 1920 → 理论高自洽，输出不标为严格匹配且展示取整误差', async () => {
  await page.click('.canvas-mode-segment[data-mode="width"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-target-width', '1920');
  const s = await readState(page);
  const R = 65 / 36;
  const theo = 1920 / R;
  const pick = ownPickHeight(1920, R);
  const m = /(\d+)\s*×\s*(\d+)/.exec(s.resValue);
  assert(m, `未解析出分辨率：${s.resValue}`);
  const [, W, H] = m.map(Number);
  assert(W === 1920 && H === pick, `期望 1920×${pick}（理论 ${theo.toFixed(4)}），实际 ${s.resValue}`);
  assert(!ownStrictMatch(W, H, R), '独立复核：此解本应非严格匹配');
  const row = s.tableRows.find((r) => r[0] === '匹配判定');
  assert(row && /存在取整误差/.test(row[2]), `匹配判定未表达取整误差：${row && row.join('|')}`);
  const errRow = s.tableRows.find((r) => r[0] === '宽高比相对误差');
  assert(errRow && errRow[3] !== '—' && errRow[3] !== '0', `取整误差未展示：${errRow && errRow.join('|')}`);
  const cand = s.candidates.find((c) => c.startsWith('按目标宽度'));
  assert(cand && /存在取整误差/.test(cand), `候选卡未表达取整误差：${cand}`);
  return `${s.resValue}（理论高 ${theo.toFixed(4)}，误差 ${errRow[3]}）`;
});

await t('E3', '精确解 1950×1080 被提供（比例精确命中 65:36）', async () => {
  const s = await readState(page);
  const exact = s.candidates.find((c) => /1950\s*×\s*1080/.test(c) && /严格匹配/.test(c));
  assert(exact, `候选中缺少严格匹配的 1950×1080 精确解：\n${s.candidates.join('\n')}`);
  assert(ownStrictMatch(1950, 1080, 65 / 36), '独立复核：1950×1080 对 65:36 应严格匹配');
  return '候选卡给出 1950×1080 且判定严格匹配';
});

group('F. 案例 F：异常输入与数值健壮性');

await t('F1', '空值 / 0 / 负数 / 非法字符给出四种互不相同的提示', async () => {
  const msgs = [];
  for (const bad of ['', '0', '-3', '12abc']) {
    await setInput(page, '#input-width', bad);
    const s = await readState(page);
    const msg = s.errors.w;
    assert(msg && msg.length > 0, `输入 "${bad}" 无错误提示`);
    assert(/输入有误/.test(s.badge), `输入 "${bad}" 徽章未变为输入有误，实际 ${s.badge}`);
    msgs.push(msg);
  }
  assert(new Set(msgs).size === 4, `四种提示不互异：${JSON.stringify(msgs)}`);
  return msgs.map((m, i) => `${i}: ${m}`).join(' / ');
});

await t('F2', '单位切换只改显示值，比例保持不变', async () => {
  await resetAll(page);
  const seen = [];
  for (const u of ['m', 'cm', 'mm']) {
    await page.click(`.unit-segment[data-unit="${u}"]`);
    await page.waitForTimeout(300);
    const s = await readState(page);
    seen.push({ u, ratio: s.ratioValue, w: s.inputs.width, h: s.inputs.height });
  }
  const ratios = new Set(seen.map((x) => x.ratio));
  assert(ratios.size === 1, `切换单位后比例变了：${JSON.stringify(seen)}`);
  assert(new Set(seen.map((x) => x.w)).size === 3, `单位切换未改变显示值：${JSON.stringify(seen)}`);
  return seen.map((x) => `${x.u}:${x.w}×${x.h}`).join(' ');
});

await t('F3', '宽高互换后比例反转（互为倒数）', async () => {
  const before = (await readState(page)).ratioValue;
  await page.click('#btn-swap');
  await page.waitForTimeout(350);
  const after = (await readState(page)).ratioValue;
  const b = parseFloat(before), a = parseFloat(after);
  assert(isFinite(a) && isFinite(b) && a > 0 && b > 0, `比例解析失败：${before} / ${after}`);
  const inv = 1 / b;
  assert(Math.abs(a - inv) < 5e-4, `互换后比例 ${a} 与倒数 ${inv.toFixed(4)} 不符（原 ${b}）`);
  await page.click('#btn-swap');
  await page.waitForTimeout(300);
  return `${b} ⇄ ${a}`;
});

await t('F4', '小数输入无精度错误（3.75 / 1.25 比例为精确整数）', async () => {
  await resetAll(page);
  await setInput(page, '#input-width', '3.75');
  await setInput(page, '#input-height', '1.25');
  const s = await readState(page);
  const exp = (ownToMm('3.75', 'm') / ownToMm('1.25', 'm')).toFixed(4);
  assert(s.ratioValue.replace(/\s/g, '') === exp + ':1', `期望 ${exp}:1，实际 ${s.ratioValue}`);
  assert(/整数比/.test(s.ratioSuffix), `小数精确比例未标为整数比：${s.ratioSuffix}`);
  return `${s.ratioValue} ${s.ratioSuffix}`;
});

await t('F5', '极端长宽比不崩溃，无 NaN / Infinity / undefined 泄漏到 DOM', async () => {
  await resetAll(page);
  await setInput(page, '#input-width', '100000');
  await setInput(page, '#input-height', '1');
  const s = await readState(page);
  assert(/\d/.test(s.ratioValue), `极端比例无输出：${s.ratioValue}`);
  const dirty = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const st = el.getAttribute('style') || '';
      if (/NaN|Infinity|undefined/.test(st)) bad.push((el.id || el.className) + '@style');
      const txt = el.textContent || '';
      if (el.children.length === 0 && /NaN|Infinity|undefined/.test(txt)) bad.push((el.id || el.className) + '@text');
    });
    return bad;
  });
  assert(dirty.length === 0, `DOM 中出现非法数值：${dirty.join(', ')}`);
  return `比例 ${s.ratioValue}，输出 ${s.resValue}`;
});

/* ---------------- 3.2 需求章节逐条 ---------------- */

group('§2.1 / §2.2 输入与比例基础');

await t('S221-1', '输入即时更新（无需点任何按钮即可改变结果）', async () => {
  await resetAll(page);
  const before = (await readState(page)).resValue;
  await setInput(page, '#input-width', '20');
  const after = (await readState(page)).resValue;
  assert(before !== after, `输入后结果未变化（仍为 ${after}）`);
  return `${before} → ${after}`;
});

await t('S221-2', '单位切换 / 宽高互换 / 恢复默认值 三个按钮均生效', async () => {
  await resetAll(page);
  const base = await readState(page);
  await setInput(page, '#input-width', '20');
  const changed = await readState(page);
  assert(changed.ratioValue !== base.ratioValue, '改输入后比例未变');
  await resetAll(page);
  const reset = await readState(page);
  assert(reset.ratioValue === base.ratioValue, `恢复默认值后比例未回到初始：${reset.ratioValue}`);
  assert(reset.inputs.width === base.inputs.width, '恢复默认值后输入框未回填');
  return '改输入 → 恢复默认值 往返正常';
});

await t('S222-1', '最简整数比由实际物理尺寸推导（不得套用画幅名称）', async () => {
  await resetAll(page);
  await setInput(page, '#input-width', '20');
  await setInput(page, '#input-height', '5');
  const s = await readState(page);
  const exp = ownReduced(ownToMm('20', 'm'), ownToMm('5', 'm'));
  assert(s.ratioSuffix.includes(exp.text), `期望 ${exp.text}，实际 ${s.ratioSuffix}`);
  const expRatio = (ownToMm('20', 'm') / ownToMm('5', 'm')).toFixed(4);
  assert(s.ratioValue.replace(/\s/g, '').startsWith(expRatio), `比例应为 ${expRatio}，实际 ${s.ratioValue}`);
  return `${s.ratioValue} ${s.ratioSuffix}`;
});

await t('S222-2', '非精确比值必须标注为"近似"，且原始小数比例保持权威不被近似值覆盖', async () => {
  await resetAll(page);
  await setInput(page, '#input-width', '1.23456789');
  await setInput(page, '#input-height', '0.1');
  const s = await readState(page);
  assert(/近似/.test(s.ratioSuffix) || /近似/.test(s.approxLine), `未标注近似：${s.ratioSuffix} / ${s.approxLine}`);
  assert(s.approxVisible, '近似值未单独成行展示');
  const exp = (ownToMm('1.23456789', 'm') / ownToMm('0.1', 'm')).toFixed(4);
  assert(s.ratioValue.replace(/\s/g, '') === exp + ':1', `权威小数比例应为 ${exp}:1，实际 ${s.ratioValue}`);
  return `${s.ratioValue} ${s.ratioSuffix}｜${s.approxLine}`;
});

group('§2.3 比例库与匹配表');

await t('S23-1', '匹配表每行含 名称 / 精确值 / 差异百分比 / 是否真标准 四类信息', async () => {
  await resetAll(page);
  const s = await readState(page);
  assert(s.matchRows.length >= 10, `匹配表行数过少：${s.matchRows.length}`);
  for (const r of s.matchRows) {
    assert(r.length === 4, `行列数不足 4：${r.join('|')}`);
    assert(r[0].length > 0, '名称为空');
    assert(/[\d.]/.test(r[1]), `精确值缺少数值：${r.join('|')}`);
    assert(/%/.test(r[2]), `差异百分比缺失：${r.join('|')}`);
    assert(r[3].length > 0, `是否真标准缺失：${r.join('|')}`);
  }
  return `${s.matchRows.length} 行字段齐备`;
});

await t('S23-2', '21:9 在匹配表中标"俗称"；3440×1440 与 3840×1646 单独对比', async () => {
  const s = await readState(page);
  const r21 = s.matchRows.find((r) => r[0].startsWith('21:9'));
  assert(r21 && /俗称/.test(r21[0]), `21:9 行未标俗称：${r21 && r21.join('|')}`);
  const a = s.matchRows.find((r) => r[0].startsWith('3440×1440'));
  const b = s.matchRows.find((r) => r[0].startsWith('3840×1646'));
  assert(a && b, '3440×1440 / 3840×1646 未单独成行');
  assert(a[1] !== b[1], `两条严格比例应不同，实际同为 ${a[1]}`);
  return `21:9=${r21.join('|')}｜3440×1440=${a.join('|')}｜3840×1646=${b.join('|')}`;
});

await t('S23-3', '超容差比例判为"非标准"，且标准匹配不覆盖实际比例', async () => {
  const s = await readState(page);
  const row = s.matchRows.find((r) => r[0].startsWith('21:9'));
  assert(row && row[3] === '非标准', `14m×4m 场景下 21:9 应判非标准，实际 ${row && row.join('|')}`);
  const actRow = s.tableRows.find((r) => r[0] === '实际比例');
  const expScreen = (ownToMm('14', 'm') / ownToMm('4', 'm')).toFixed(4);
  assert(parseRatioText(actRow[1]).toFixed(4) === expScreen, `实际比例屏幕列应为 ${expScreen}，实际 ${actRow && actRow.join('|')}`);
  assert(parseRatioText(s.ratioValue).toFixed(4) === expScreen, `顶部实际比例被覆盖：${s.ratioValue}`);
  return `21:9 → ${row[3]}；实际比例仍为 ${actRow[1]}`;
});

group('§3.2 / §3.3 模式 A（按宽）与模式 B（按高）');

await t('S32-1', '按宽 / 按高两个候选均给出 理论高度 · 实际像素比例 · 目标比例 · 两类误差 · 匹配判定 · 适配方案', async () => {
  await resetAll(page);
  await setInput(page, '#input-target-width', '1920');
  const s = await readState(page);
  // 模式 A 按宽 → 理论高；模式 B 按高 → 理论宽（对称，见 core.canvasFromHeight）
  const spec = [
    { key: '按目标宽度', field: '理论高' },
    { key: '按目标高度', field: '理论宽' },
  ];
  const common = ['实际像素比例', '目标屏幕比例', '与目标比例的宽高比误差', '像素尺寸误差', '等比适配'];
  for (const sp of spec) {
    const cand = s.candidates.find((c) => c.startsWith(sp.key));
    assert(cand, `缺少候选 ${sp.key}`);
    for (const n of [sp.field, ...common]) assert(cand.includes(n), `${sp.key} 候选缺字段「${n}」：${cand}`);
    assert(/严格匹配|存在取整误差/.test(cand), `${sp.key} 候选缺"是否严格匹配"判定：${cand}`);
  }
  return '两个候选字段齐备（按宽给理论高 / 按高给理论宽）';
});

await t('S32-2', '两种取整策略结果不同时必须同时列出（不得静默取整后声称一致）', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '1920:823');
  await page.waitForTimeout(250);
  // 独立找一个"四舍五入"与"按比例误差最小"结论不同的宽度
  const R = 1920 / 823;
  let probe = null;
  for (let w = 100; w <= 5000 && !probe; w++) {
    const H = ownPickHeight(w, R);
    const rounded = Math.round(w / R);
    if (rounded !== H) probe = { w, rounded, best: H };
  }
  assert(probe, '独立扫描未找到两种取整策略结论不同的宽度');
  await setInput(page, '#input-target-width', String(probe.w));
  const s = await readState(page);
  const cand = s.candidates.find((c) => c.startsWith('按目标宽度'));
  assert(cand, '无按目标宽度候选');
  assert(/四舍五入取整/.test(cand) && /按比例误差最小取整/.test(cand),
    `两种取整结论不同（四舍五入 ${probe.rounded} vs 误差最小 ${probe.best}），必须同时列出：${cand}`);
  assert(/存在取整误差/.test(cand), `未声明存在取整误差：${cand}`);
  return `宽 ${probe.w}：${probe.rounded} vs ${probe.best}，两者均已列出`;
});

group('§3.4 模式 C：常用规格预设');

await t('S34-1', '七种预设全部存在', async () => {
  await resetAll(page);
  const s = await readState(page);
  const want = ['1920×1080', '2560×1440', '3440×1440', '3840×2160', '3840×1646', '4096×2160', '5120×2160'];
  for (const w of want) {
    assert(s.presetItems.some((i) => i.key === w), `缺少预设 ${w}`);
  }
  assert(s.presetItems.length === want.length, `预设数量异常：${s.presetItems.length}`);
  return s.presetItems.length + ' 项';
});

await t('S34-2', '每个预设的真实比例与"与屏幕比例的偏差"在候选卡中可被呈现（以屏幕比例为源逐一验证）', async () => {
  await resetAll(page);
  const screenR = ownToMm('14', 'm') / ownToMm('4', 'm');
  for (const item of (await readState(page)).presetItems) {
    const [w, h] = item.key.split('×').map(Number);
    const pr = w / h;
    const expDiff = Math.abs(pr - screenR) / screenR * 100;
    await page.click('.canvas-mode-segment[data-mode="preset"]');
    await page.waitForTimeout(150);
    await page.click(`#preset-list .list__item[data-key="${item.key}"]`);
    await page.waitForTimeout(350);
    const s = await readState(page);
    const cand = s.candidates.find((c) => c.startsWith('常用规格'));
    assert(cand, `${item.key} 无常用规格候选`);
    assert(cand.includes(pr.toFixed(4)), `${item.key} 候选未给出真实比例 ${pr.toFixed(4)}：${cand}`);
    const m = cand.match(/与目标比例的宽高比误差\s*([+\-]?[\d.]+)%/);
    assert(m, `${item.key} 候选未给出偏差百分比：${cand}`);
    const shown = Math.abs(parseFloat(m[1]));
    assert(Math.abs(shown - expDiff) < 0.011, `${item.key} 偏差 ${shown}% 与独立计算 ${expDiff.toFixed(4)}% 不符`);
  }
  return '7 项真实比例与偏差均自洽';
});

await t('S34-3', '预设列表项自身展示真实比例与偏差（列表不能只重复名称）', async () => {
  const s = await readState(page);
  const screenR = ownToMm('14', 'm') / ownToMm('4', 'm');
  const missing = [];
  for (const item of s.presetItems) {
    const [w, h] = item.key.split('×').map(Number);
    const pr = (w / h).toFixed(4);
    const expDiff = Math.abs(w / h - screenR) / screenR * 100;
    if (!item.meta.includes(pr)) { missing.push(`${item.key}(缺比例 ${pr})`); continue; }
    // 偏差按核心层 fmtErrorPercent 的 4 位保底精度展示（非零误差不得被取整抹成 0.00%）；
    // 本断言只独立复核数值口径：显示值与独立计算的偏差必须一致（容差同 S34-2），不锁死小数位
    const m = item.meta.match(/偏差\s*([-+]?[\d.]+)%?/);
    if (!m) { missing.push(`${item.key}(缺与屏幕偏差)`); continue; }
    const shown = parseFloat(m[1]);
    if (!(Math.abs(shown - expDiff) < 0.011)) {
      missing.push(`${item.key}(偏差 ${shown}% 与独立计算 ${expDiff.toFixed(4)}% 不符)`);
    }
  }
  assert(missing.length === 0,
    `以下预设列表项未展示真实比例/与屏幕偏差：${missing.join('、')}（当前 meta 形如 "${s.presetItems[0].meta}"）`);
  return '7 项列表均含比例与偏差';
});

group('§3.5 模式 D：自定义整数比画布');

await t('S35-1', '整数比求解所需能力齐备（固定宽 / 固定高 / 最大宽 / 最大高 / 自定义整数比）', async () => {
  await resetAll(page);
  const has = await page.evaluate(() => ({
    maxW: !!document.getElementById('input-canvas-max-width'),
    maxH: !!document.getElementById('input-canvas-max-height'),
    ratio: !!document.getElementById('input-canvas-ratio'),
    fixedW: !!document.getElementById('input-target-width'),
    fixedH: !!document.getElementById('input-target-height'),
  }));
  for (const [k, v] of Object.entries(has)) assert(v, `缺少能力：${k}`);
  return Object.keys(has).join(' / ');
});

await t('S35-2', '"严格落在上限内"档给出不超限且比例精确的最大整数倍解（独立枚举验证）', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '65:36');
  await page.click('.canvas-mode-segment[data-mode="custom"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-canvas-max-width', '1920');
  await setInput(page, '#input-canvas-max-height', '1080');
  await page.click('.prefer-segment[data-prefer="bounds"]');
  await page.waitForTimeout(450);
  const s = await readState(page);
  const k = ownMaxKInBounds(65, 36, 1920, 1080);
  const expW = k * 65, expH = k * 36;
  const cand = s.candidates.find((c) => c.startsWith('整数倍画布'));
  assert(cand, '无整数倍画布候选');
  assert(new RegExp(`${expW}\\s*×\\s*${expH}`).test(cand),
    `不超限且精确的最大解应为 ${expW}×${expH}（k=${k}），实际候选：${cand}`);
  assert(ownStrictMatch(expW, expH, 65 / 36), '独立复核：该解对 65:36 应严格匹配');
  return `k=${k} → ${expW}×${expH}`;
});

await t('S35-3', '精确解 1950×1080 在两个求解档位下都可见（不得只在其中一档出现）', async () => {
  const seen = [];
  for (const prefer of ['height', 'bounds']) {
    await page.click(`.prefer-segment[data-prefer="${prefer}"]`);
    await page.waitForTimeout(450);
    const s = await readState(page);
    const cand = s.candidates.find((c) => c.startsWith('整数倍画布'));
    assert(cand, `${prefer} 档无整数倍画布候选`);
    assert(/1950\s*×\s*1080/.test(cand),
      `"${prefer}" 档未提供精确解 1950×1080：${cand}`);
    seen.push(prefer);
  }
  // 越界解必须标注超出量
  await page.click('.prefer-segment[data-prefer="height"]');
  await page.waitForTimeout(450);
  const s = await readState(page);
  const cand = s.candidates.find((c) => c.startsWith('整数倍画布'));
  assert(/超出上限/.test(cand), `未标注越界量：${cand}`);
  const m = cand.match(/超出上限\s*(\d+)px/);
  assert(m, `越界量未给出具体 px 数：${cand}`);
  const expOverflow = 1950 - 1920;
  assert(parseInt(m[1], 10) === expOverflow, `越界量应为 ${expOverflow}px，实际 ${m[1]}`);
  return `两档均可见；越界量 ${m[1]}`;
});

await t('S35-4', '默认档位主解必须是不超限且比例精确的最大解（越界解不得占据当前位）', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '65:36');
  await page.click('.canvas-mode-segment[data-mode="custom"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-canvas-max-width', '1920');
  await setInput(page, '#input-canvas-max-height', '1080');
  // 显式复位到产品声明的默认档位（state.customCanvasPrefer = 'height'），
  // 避免依赖前序用例遗留的档位状态导致顺序耦合。
  await page.click('.prefer-segment[data-prefer="height"]');
  await page.waitForTimeout(450);
  const s = await readState(page);
  const cand = s.candidates.find((c) => c.startsWith('整数倍画布'));
  const m = /整数倍画布（当前）\s*(\d+)\s*×\s*(\d+)/.exec(cand);
  assert(m, `无法解析当前主解：${cand}`);
  const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
  assert(w <= 1920 && h <= 1080,
    `默认档位主解 ${w}×${h} 超出给定上限 1920×1080（需求 §3.5：优先找不超限且比例精确的最大解）；越界解应作为并列解呈现`);
  return `默认主解 ${w}×${h}`;
});

group('§3.6 模式 E：候选明细字段');

await t('S36-1', '每个候选都展示 输出分辨率 / 实际像素比例 / 目标比例 / 两类误差 / 匹配判定 / 适配方案', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '65:36');
  await page.waitForTimeout(250);
  const need = ['实际像素比例', '目标屏幕比例', '与目标比例的宽高比误差', '像素尺寸误差', '等比适配'];
  for (const mode of ['width', 'height', 'custom']) {
    await page.click(`.canvas-mode-segment[data-mode="${mode}"]`);
    await page.waitForTimeout(150);
    if (mode === 'custom') {
      await setInput(page, '#input-canvas-max-width', '1920');
      await setInput(page, '#input-canvas-max-height', '1080');
    }
    const s = await readState(page);
    const cand = s.candidates.find((c) => c.includes('（当前）'));
    assert(cand, `模式 ${mode} 无当前候选`);
    for (const n of need) assert(cand.includes(n), `模式 ${mode} 当前候选缺字段「${n}」：${cand}`);
    assert(/\d+\s*×\s*\d+/.test(cand), `模式 ${mode} 当前候选缺输出分辨率：${cand}`);
    assert(/严格匹配|存在取整误差/.test(cand), `模式 ${mode} 当前候选缺"是否严格匹配"判定：${cand}`);
  }
  return '三种模式的当前候选字段齐备';
});

await t('S36-2', '与目标比例的宽高比误差与像素尺寸误差分列两个独立字段', async () => {
  const s = await readState(page);
  const rows = s.tableRows.map((r) => r[0]);
  const i1 = rows.indexOf('宽高比相对误差');
  const i2 = rows.indexOf('像素尺寸误差');
  assert(i1 >= 0, '结果表格缺「宽高比相对误差」行');
  assert(i2 >= 0, '结果表格缺「像素尺寸误差」行');
  assert(i1 !== i2, '两类误差未分列');
  const cand = s.candidates.find((c) => c.includes('（当前）'));
  assert(/与目标比例的宽高比误差/.test(cand) && /像素尺寸误差/.test(cand), '候选卡未分列两类误差');
  return '表格两行 + 候选卡两字段';
});

await t('S36-3', '优先提示等比适配，不得默认建议拉伸', async () => {
  const s = await readState(page);
  for (const cand of s.candidates) {
    // 只在"建议拉伸 / 请拉伸 / 拉伸画面"且未被"不"字否定时判为拉伸建议
    const bad = cand.match(/(?<!不)建议拉伸|(?<!不)请拉伸|(?<!不)拉伸画面/);
    assert(!bad, `候选出现拉伸建议：${cand}`);
    if (/等比适配/.test(cand)) assert(/不建议拉伸/.test(cand), `等比适配未附"不建议拉伸"：${cand}`);
  }
  return s.candidates.length + ' 个候选均无拉伸建议';
});

group('§4 四层参数与免责提示');

await t('S4-1', '四层参数（①物理尺寸 ②接收分辨率 ③合成分辨率 ④交付文件分辨率）均显式呈现', async () => {
  const txt = await page.evaluate(() => document.body.innerText);
  for (const m of ['①', '②', '③', '④']) assert(txt.includes(m), `页面缺少层级标记 ${m}`);
  for (const kw of ['物理尺寸', '接收分辨率', '合成分辨率', '交付']) {
    assert(txt.includes(kw), `页面缺少参数层次「${kw}」`);
  }
  return '①②③④ 四个标记与四个参数名均在页面上';
});

await t('S4-2', '① 物理尺寸层被明确指向"屏幕尺寸"输入项', async () => {
  const txt = await page.evaluate(() => document.body.innerText);
  assert(/①[^\n]*物理尺寸/.test(txt), '① 层未与"物理尺寸"关联');
  assert(/①[^\n]*屏幕尺寸|屏幕尺寸[^\n]*①/.test(txt), '① 层未指向"屏幕尺寸"输入项');
  return '① 已明确绑定屏幕尺寸输入项';
});

await t('S4-3', '§4 原文提示一字不差出现在页面上', async () => {
  const REQUIRED = '本工具计算的是画布比例及视频像素尺寸建议。实际交付分辨率应以 LED 控制系统、播放服务器及现场技术方提供的参数为准。';
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ''));
  assert(txt.includes(REQUIRED.replace(/\s+/g, '')), '§4 原文提示缺失或被改写');
  return '原文逐字命中';
});

group('§5.3 屏幕与画布可视化');

await t('S53-1', '屏幕矩形按真实物理比例绘制（14m×4m 应为明显超宽）', async () => {
  await resetAll(page);
  await page.waitForTimeout(300);
  const st = await readStage(page);
  const exp = ownToMm('14', 'm') / ownToMm('4', 'm');
  const got = st.screen.w / st.screen.h;
  assert(Math.abs(got - exp) / exp < 0.02, `屏幕矩形比例 ${got.toFixed(3)} 与 ${exp.toFixed(3)} 不符`);
  assert(got > 2.5, `屏幕矩形应为明显超宽，实际 ${got.toFixed(3)}`);
  return `${st.screen.w}×${st.screen.h} ≈ ${got.toFixed(3)}:1`;
});

await t('S53-2', '画布轮廓叠加在屏幕矩形之上，且带文字标签', async () => {
  const st = await readStage(page);
  assert(st.canvas && st.canvas.w > 0 && st.canvas.h > 0, '画布轮廓未渲染');
  assert(st.canvas.label && st.canvas.label.length > 0, '画布轮廓无文字标签');
  return `画布 ${st.canvas.w}×${st.canvas.h}「${st.canvas.label}」`;
});

await t('S53-3', '21:9 目标下 contain 黑边落在左右（轴向由 core 的 axis 字段决定）', async () => {
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(150);
  await page.click('#standard-list .list__item[data-key="21:9"]');
  await page.waitForTimeout(200);
  await page.click('.stage-mode-segment[data-mode="contain"]');
  await page.waitForTimeout(500);
  const st = await readStage(page);
  const sideVisible = (st.L.display !== 'none') || (st.R.display !== 'none');
  const vertBar = (st.L.display !== 'none' && st.L.h > st.L.w) || (st.R.display !== 'none' && st.R.h > st.R.w);
  const horizBar = (st.T.display !== 'none' && st.T.w > st.T.h) || (st.B.display !== 'none' && st.B.w > st.B.h);
  assert(sideVisible, 'contain 模式下未见黑边区');
  assert(vertBar && !horizBar, `黑边轴向错误（L=${JSON.stringify(st.L)} T=${JSON.stringify(st.T)}）`);
  const lbl = (st.L.display !== 'none' ? st.L.label : st.R.label) || '';
  assert(/黑边/.test(lbl), `黑边区缺文字标签：${lbl}`);
  return `左右竖条（L ${st.L.w}×${st.L.h}，R ${st.R.w}×${st.R.h}），标签「${lbl}」`;
});

await t('S53-4', '21:9 目标下 cover 裁切落在上下', async () => {
  await page.click('.stage-mode-segment[data-mode="cover"]');
  await page.waitForTimeout(500);
  const st = await readStage(page);
  const sideVisible = (st.L.display !== 'none') || (st.R.display !== 'none');
  const horizBar = (st.T.display !== 'none' && st.T.w > st.T.h) || (st.B.display !== 'none' && st.B.w > st.B.h);
  const vertBar = (st.L.display !== 'none' && st.L.h > st.L.w) || (st.R.display !== 'none' && st.R.h > st.R.w);
  assert(horizBar && !vertBar, `裁切轴向错误（L=${JSON.stringify(st.L)} T=${JSON.stringify(st.T)}）`);
  assert(!sideVisible, 'cover 模式下仍出现黑边区');
  const lbl = (st.T.display !== 'none' ? st.T.label : st.B.label) || '';
  assert(/裁切/.test(lbl), `裁切区缺文字标签：${lbl}`);
  return `上下横条（T ${st.T.w}×${st.T.h}，B ${st.B.w}×${st.B.h}），标签「${lbl}」`;
});

group('§6 十二项交互');

await t('S6-1', '常见比例快选：点选比例库条目即改变目标比例', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(150);
  await page.click('#standard-list .list__item[data-key="4:3"]');
  await page.waitForTimeout(350);
  const s = await readState(page);
  const row = s.tableRows.find((r) => r[0] === '实际比例');
  const exp = (4 / 3).toFixed(4);
  assert(row && parseRatioText(row[2]).toFixed(4) === exp, `目标比例未变为 4:3：${row && row.join('|')}`);
  return row[2];
});

await t('S6-2', '自定义比例：输入 a:b 即按该比例换算', async () => {
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '16:10');
  const s = await readState(page);
  const row = s.tableRows.find((r) => r[0] === '实际比例');
  const exp = (16 / 10).toFixed(4);
  assert(row && parseRatioText(row[2]).toFixed(4) === exp, `目标比例应为 ${exp}，实际 ${row && row.join('|')}`);
  return row[2];
});

await t('S6-3', '多种输出规格：候选列表同时给出按宽与按高两种规格', async () => {
  await resetAll(page);
  await page.click('.canvas-mode-segment[data-mode="height"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-target-height', '1080');
  await page.click('.canvas-mode-segment[data-mode="width"]');
  await page.waitForTimeout(250);
  const s = await readState(page);
  assert(s.candidates.length >= 2, `候选数量不足：${s.candidates.length}`);
  const modes = s.candidates.map((c) => c.split(/[（ ]/)[0]);
  assert(modes.some((m) => m.includes('按目标宽度')) && modes.some((m) => m.includes('按目标高度')),
    `未同时给出按宽/按高两种规格：${modes.join(', ')}`);
  return s.candidates.length + ' 个候选';
});

await t('S6-4', '比例误差提示：结果表格给出宽高比相对误差与像素尺寸误差', async () => {
  const s = await readState(page);
  const r1 = s.tableRows.find((r) => r[0] === '宽高比相对误差');
  const r2 = s.tableRows.find((r) => r[0] === '像素尺寸误差');
  assert(r1 && r2, '两类误差行缺失');
  assert(r1[3] !== '—' && r2[3] !== '—', '误差值为空');
  return `宽高比 ${r1[3]} / 像素 ${r2[3]}`;
});

await t('S6-5', '一键复制完整参数：真实写入剪贴板且内容含关键字段', async () => {
  await resetAll(page);
  await page.click('#btn-copy-full');
  await page.waitForTimeout(500);
  const clip = await readClip(page);
  assert(clip && clip.length > 20, `剪贴板内容过短：${JSON.stringify(clip)}`);
  for (const kw of ['LED 屏比例换算参数', '实际比例', '最简整数比例', '目标画布分辨率', '是否严格匹配']) {
    assert(clip.includes(kw), `复制内容缺字段「${kw}」`);
  }
  const label = await page.locator('#btn-copy-full .label').textContent();
  assert(/已复制/.test(label), `按钮未给出成功反馈：${label}`);
  return `${clip.split('\n').length} 行，关键字段齐备`;
});

await t('S6-6', '复制失败时给出失败反馈（不是静默失败）', async () => {
  await resetAll(page);
  await page.click('.canvas-mode-segment[data-mode="custom"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-canvas-max-width', '10');
  await setInput(page, '#input-canvas-max-height', '10');
  await setInput(page, '#input-canvas-ratio', '65:36');
  await page.waitForTimeout(400);
  await page.click('#btn-copy-resolution');
  await page.waitForTimeout(500);
  const label = await page.locator('#btn-copy-resolution .label').textContent();
  const live = await page.locator('#live-feedback').textContent();
  assert(/失败/.test(label), `无解场景按钮未给出失败反馈：${label}`);
  assert(/失败/.test(live), `无解场景 aria-live 未播报失败：${live}`);
  return `按钮「${label.trim()}」，播报「${live.trim()}」`;
});

await t('S6-7', '恢复默认值按钮恢复全部输入态', async () => {
  await resetAll(page);
  const s = await readState(page);
  assert(s.inputs.width === '14' && s.inputs.height === '4', `输入未恢复：${s.inputs.width}×${s.inputs.height}`);
  assert(s.inputs.unit === 'm', `单位未恢复：${s.inputs.unit}`);
  assert(s.inputs.targetWidth === '1920', `目标宽度未恢复：${s.inputs.targetWidth}`);
  assert(s.inputs.ratioSource === 'screen', `比例来源未恢复：${s.inputs.ratioSource}`);
  assert(s.inputs.canvasMode === 'width', `画布模式未恢复：${s.inputs.canvasMode}`);
  return '输入 / 单位 / 目标宽 / 比例来源 / 画布模式 全部复位';
});

await t('S6-8', '加载演示案例：非"异常输入"类案例须载入出可用结果', async () => {
  await resetAll(page);
  const n = (await readState(page)).demoItems.length;
  assert(n >= 6, `演示案例数量不足：${n}`);
  const outcomes = [];
  for (let i = 0; i < n; i++) {
    await page.click(`#demo-list .list__item >> nth=${i}`);
    await page.waitForTimeout(400);
    const s = await readState(page);
    outcomes.push({ i, title: s.demoItems[i].title, w: s.inputs.width, h: s.inputs.height, ratio: s.ratioValue, badge: s.badge });
  }
  // 只有标题明示"异常输入/健壮性"的案例允许呈现错误态（其空态即演示目标本身）
  const isErrorDemo = (o) => /异常|健壮|空\/0|非法/.test(o.title);
  const bad = outcomes.filter((o) => /输入有误/.test(o.badge) && !isErrorDemo(o));
  assert(bad.length === 0,
    `以下演示案例载入后为错误态（标题并未声明是异常输入类）：${bad.map((o) => `#${o.i}「${o.title.slice(0, 30)}…」`).join('、')}`);
  return outcomes.map((o) => `#${o.i} ${o.ratio}`).join(' ');
});

await t('S6-9', '演示案例 D 声明的 inputs.ratio 必须真正生效（不得是无人读取的死字段）', async () => {
  // 独立核验：core 声明的 demo 字段是否真的被 app.js 消费
  const appSrc = readFileSync(join(ROOT, 'src', 'app.js'), 'utf8');
  const consumed = new Set([...appSrc.matchAll(/(inputs|result|demo)\.(\w+)/g)].map((m) => m[1] + '.' + m[2]));
  // 找出所有 demo 里声明、却无人读取的字段（排除 demo/demo.result 这类容器名）
  const core = require(join(ROOT, 'src', 'core.js'));
  const dead = [];
  for (const d of core.DEMO_CASES) {
    for (const k of Object.keys(d.inputs || {})) {
      if (!consumed.has('inputs.' + k)) dead.push(`${d.id}.inputs.${k}`);
    }
    for (const k of Object.keys(d.result || {})) {
      if (!consumed.has('result.' + k)) dead.push(`${d.id}.result.${k}`);
    }
  }
  // demo.result 里的诊断字段（ratio/decimal/note 等）是给测试与文档用的快照，允许不被 UI 消费；
  // 但 inputs.* 是"如何载入"的契约，必须被消费。
  const deadInputs = dead.filter((d) => d.includes('.inputs.'));
  assert(deadInputs.length === 0,
    `以下 demo 的 inputs 字段声明后无人读取（死字段 → 演示意图未实现）：${deadInputs.join('、')}`);
  // 行为验证：载入案例 D 后应落在 16:9 目标比例上并产出严格命中分辨率
  await resetAll(page);
  const idx = (await readState(page)).demoItems.findIndex((d) => /16:9/.test(d.title) && /严格命中/.test(d.title));
  assert(idx >= 0, '未找到 16:9 演示案例');
  await page.click(`#demo-list .list__item >> nth=${idx}`);
  await page.waitForTimeout(500);
  const s = await readState(page);
  assert(/\d+\s*×\s*\d+/.test(s.resValue),
    `案例 D 载入后未产出任何分辨率（res="${s.resValue}"，badge="${s.badge}"）—— 其声明的 16:9 目标比例未生效`);
  assert(/严格匹配/.test(s.badge), `案例 D 载入后未判定严格匹配，badge="${s.badge}"`);
  return `案例 D 载入即产出 ${s.resValue}（${s.badge}）`;
});

group('§5.1 / §5.2 视觉禁令');

await t('V1-1', '无侧边导航 / 无卡片堆叠', async () => {
  const c = await page.evaluate(() => ({
    nav: document.querySelectorAll('nav, aside, .sidebar, .nav, .side-nav').length,
    panels: document.querySelectorAll('.panel').length,
    nested: document.querySelectorAll('.panel .panel').length,
    cards: document.querySelectorAll('.card, .panel--card').length,
  }));
  assert(c.nav === 0, `存在侧边导航元素 ${c.nav} 个`);
  assert(c.nested === 0, `存在嵌套面板 ${c.nested} 个`);
  assert(c.cards === 0, `存在卡片元素 ${c.cards} 个`);
  assert(c.panels === 3, `面板数应为 3，实际 ${c.panels}`);
  return `3 面板 / 0 侧栏 / 0 嵌套 / 0 卡片`;
});

await t('V1-2', '渐变仅允许出现在裁切/黑边 hatch（功能语义）', async () => {
  const grads = await page.evaluate(() => {
    const out = [];
    for (const s of document.styleSheets) {
      let rules; try { rules = s.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (r.style && /gradient/i.test(r.style.backgroundImage || '')) {
          out.push((r.selectorText || '(no-selector)') + ' :: ' + (r.style.backgroundImage || '').slice(0, 70));
        }
      }
    }
    return out;
  });
  for (const g of grads) {
    assert(/repeating-linear-gradient/.test(g), `存在非 hatch 渐变：${g}`);
    assert(/hatch/.test(g), `渐变不在 hatch 规则上：${g}`);
  }
  return `${grads.length} 处渐变，全部为 hatch`;
});

await t('V1-3', '圆角只用 4 / 6 / 8px，且不出现胶囊形按钮', async () => {
  const info = await page.evaluate(() => {
    const radii = new Set(); const capsules = [];
    document.querySelectorAll('button, .segmented__item, .list__item, .tool-toggle, .stepper__btn, input').forEach((el) => {
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      const h = el.offsetHeight;
      if (el.offsetWidth === 0 && h === 0) return;   // 隐藏元素不参与
      radii.add(r);
      if (r > 0 && h > 0 && r >= h / 2) capsules.push((el.id || el.className) + ` r=${r} h=${h}`);
    });
    return { radii: [...radii].sort((a, b) => a - b), capsules };
  });
  for (const r of info.radii) {
    assert([0, 4, 6, 8].includes(r), `圆角 ${r}px 不在 4/6/8 刻度内`);
  }
  assert(info.capsules.length === 0, `存在胶囊形按钮：${info.capsules.join(', ')}`);
  return `圆角取值 ${info.radii.join('/')}px，无胶囊形`;
});

await t('V1-4', '无巨大标题；数据才是视觉主角', async () => {
  const sizes = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return { h1: getComputedStyle(h1).fontSize, h1Text: h1.textContent.trim() };
  });
  assert(parseFloat(sizes.h1) <= 24, `主标题字号 ${sizes.h1} 过大（上限 24px）`);
  return `h1 "${sizes.h1Text}" ${sizes.h1}`;
});

await t('V1-5', '动效白名单：仅少量短动画，且尊重 prefers-reduced-motion', async () => {
  const css = readFileSync(join(ROOT, 'src', 'styles.css'), 'utf8');
  const keyframes = (css.match(/@keyframes/g) || []).length;
  assert(keyframes <= 2, `@keyframes 数量 ${keyframes} 超过白名单 2`);
  const durs = [...css.matchAll(/(\d+)ms/g)].map((m) => parseInt(m[1], 10));
  const long = durs.filter((d) => d > 200);
  assert(long.length === 0, `存在超过 200ms 的动效：${long.join(', ')}ms`);
  assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css), '缺少 prefers-reduced-motion 降级');
  assert(/transition:\s*none\s*!important/.test(css), 'reduced-motion 未禁用 transition');
  return `${keyframes} 组 keyframes，最长 ${Math.max(...durs)}ms，reduced-motion 已覆盖`;
});

group('§7 代码与工程约束');

await t('S7-1', 'core.js 为纯函数（不含 DOM / window / storage 引用）', async () => {
  const src = readFileSync(join(ROOT, 'src', 'core.js'), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const kw of ['document', 'window', 'localStorage', 'navigator', 'sessionStorage']) {
    assert(!new RegExp('\\b' + kw + '\\b').test(body), `core.js 出现 ${kw} 引用`);
  }
  assert(!/console\./.test(body), 'core.js 出现 console 调用');
  return '零 DOM / 零 window / 零 storage / 零 console';
});

await t('S7-2', 'UI 层不重复实现比例换算（核心计算一律走 core）', async () => {
  const src = readFileSync(join(ROOT, 'src', 'app.js'), 'utf8');
  assert(!/function\s+gcd\s*\(/.test(src), 'app.js 自实现 gcd');
  assert(!/function\s+bestRational\s*\(/.test(src), 'app.js 自实现 bestRational');
  assert(!/function\s+computeRatio\s*\(/.test(src), 'app.js 自实现 computeRatio');
  assert(!/\b(targetWidth|targetHeight)\s*\/\s*(target|state\.)?(ratio|R)\b/.test(src), 'app.js 出现自实现的比例换算');
  return '换算与约分全部委托 core';
});

await t('S7-3', '无硬编码色值（颜色一律走 :root 变量）', async () => {
  const css = readFileSync(join(ROOT, 'src', 'styles.css'), 'utf8');
  const lines = css.split('\n');
  let inRoot = false; const offenders = [];
  lines.forEach((l, i) => {
    if (/^\s*:root\s*\{/.test(l)) { inRoot = true; return; }
    if (inRoot) { if (/^\s*\}/.test(l)) inRoot = false; return; }
    if (/#[0-9A-Fa-f]{3,8}\b/.test(l)) offenders.push((i + 1) + ': ' + l.trim());
  });
  assert(offenders.length === 0, `:root 之外存在硬编码色值：${offenders.join(' | ')}`);
  const app = readFileSync(join(ROOT, 'src', 'app.js'), 'utf8');
  assert(!/#[0-9A-Fa-f]{6}\b/.test(app), 'app.js 存在硬编码色值');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert(!/#[0-9A-Fa-f]{6}\b/.test(html), 'index.html 存在硬编码色值');
  return '色值全部集中在 :root';
});

await t('S7-4', '响应式：四档断点均无横向溢出，且栏序符合规格', async () => {
  for (const w of [1440, 1100, 760, 375]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      areas: getComputedStyle(document.querySelector('.layout')).gridTemplateAreas,
    }));
    assert(o.sw <= o.cw + 1, `${w}px 出现横向溢出：scrollWidth ${o.sw} > clientWidth ${o.cw}`);
    if (w >= 1101) assert(/a b c/.test(o.areas), `${w}px 期望三栏 a b c，实际 ${o.areas}`);
    else if (w >= 761) assert(/a b/.test(o.areas), `${w}px 期望两栏，实际 ${o.areas}`);
    else assert(/a c b/.test(o.areas.replace(/"/g, '')), `${w}px 期望单栏 a c b，实际 ${o.areas}`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(300);
  return '1440 / 1100 / 760 / 375 四档均无溢出';
});

await t('S7-5', '键盘可达：Tab 序列覆盖关键控件，焦点环可见，Esc 可关闭设置面板', async () => {
  await resetAll(page);
  const order = await page.evaluate(() => {
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(sel)]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.id || e.className.split(' ')[0]);
  });
  assert(order.length >= 20, `可 Tab 到达的交互元素过少：${order.length}`);
  for (const id of ['input-width', 'input-height', 'btn-swap', 'btn-copy-resolution', 'btn-copy-full', 'toggle-center', 'toggle-grid']) {
    assert(order.includes(id), `Tab 序列缺少 ${id}`);
  }
  // 焦点环：用真实键盘 Tab 触发 :focus-visible
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement; const cs = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className, w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
  });
  assert(parseFloat(ring.w) >= 1 && ring.style !== 'none', `焦点环不可见：${JSON.stringify(ring)}`);
  // Esc 关闭设置
  await page.click('#btn-settings');
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => document.getElementById('settings-panel').className.includes('is-open'));
  assert(opened, '设置面板未打开');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const closed = await page.evaluate(() => !document.getElementById('settings-panel').className.includes('is-open'));
  assert(closed, 'Esc 未关闭设置面板');
  const badTab = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')]
    .filter((e) => parseInt(e.getAttribute('tabindex'), 10) > 0).map((e) => e.id || e.className));
  assert(badTab.length === 0, `存在 tabindex > 0：${badTab.join(', ')}`);
  return `${order.length} 个可聚焦控件，焦点环 ${ring.w} ${ring.style}，Esc 生效`;
});

await t('S7-6', 'Enter 键可激活分段控件（键盘可完成单位切换）', async () => {
  await resetAll(page);
  await page.focus('.unit-segment[data-unit="cm"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const s = await readState(page);
  assert(s.inputs.unit === 'cm', `Enter 未激活单位切换，实际单位 ${s.inputs.unit}`);
  return `Enter 切换单位 → ${s.inputs.unit}`;
});

group('§10 无障碍');

await t('A11Y-1', 'aria-live 区域存在且结果变化时被更新', async () => {
  const info = await page.evaluate(() => {
    const a = document.getElementById('live-results');
    const b = document.getElementById('live-feedback');
    return {
      aRole: a.getAttribute('role'), aLive: a.getAttribute('aria-live'), aText: a.textContent.trim(),
      bRole: b.getAttribute('role'), bLive: b.getAttribute('aria-live'),
    };
  });
  assert(info.aLive === 'polite' && info.aRole === 'status', `#live-results 缺少 aria-live：${JSON.stringify(info)}`);
  assert(info.bLive === 'polite', '#live-feedback 缺少 aria-live');
  assert(info.aText.length > 0, '#live-results 无内容');
  return `live-results="${info.aText}"`;
});

await t('A11Y-2', '输入错误提示使用 role="alert"', async () => {
  const roles = await page.evaluate(() => ['error-width', 'error-height', 'error-canvas-ratio']
    .map((id) => { const el = document.getElementById(id); return { id, role: el ? el.getAttribute('role') : null }; }));
  for (const r of roles) assert(r.role === 'alert', `${r.id} 缺少 role="alert"`);
  return '三处错误位均为 role="alert"';
});

await t('A11Y-3', '徽章/状态不只靠颜色区分（图标 + 文字双通道）', async () => {
  const s = await readState(page);
  assert(/[✓▲Δ!✉▣⧉]/.test(s.badge), `徽章缺图标字符：${s.badge}`);
  assert(s.badge.replace(/[^\u4e00-\u9fa5]/g, '').length >= 2, `徽章缺文字说明：${s.badge}`);
  const cand = s.candidates.find((c) => c.includes('（当前）'));
  assert(/✓ 严格匹配|Δ 存在取整误差/.test(cand), `候选卡匹配状态缺文字+图标双通道：${cand}`);
  return s.badge;
});

/* ---------------- 3.3 技术验收（双文件） ---------------- */

group('C. 技术验收');

await t('T1', 'dist 单文件版完全自包含（无外链 / 无 CDN / 无网络请求）', async () => {
  const html = readFileSync(join(ROOT, 'dist', 'led-ratio-tool.html'), 'utf8');
  assert(!/<link[^>]+href=/i.test(html), '存在 <link href> 外链');
  assert(!/<script[^>]+src=/i.test(html), '存在 <script src> 外链');
  assert(!/@import/i.test(html), '存在 CSS @import');
  assert(!/https?:\/\//i.test(html), '存在 http(s) 远程引用');
  const dpage = await newPage(browser, { width: 1440, height: 1000 });
  await dpage.goto(DIST_URL);
  await dpage.waitForTimeout(900);
  assert(dpage.__external.length === 0, `运行时发起外部请求：${dpage.__external.join(', ')}`);
  const s = await readState(dpage);
  assert(/\d/.test(s.ratioValue), '离线版无输出');
  await dpage.close();
  return '零外链 / 零网络请求';
});

await t('T2', 'dist 内容与 src 当前版本一致（离线版未过期）', async () => {
  const html = readFileSync(join(ROOT, 'dist', 'led-ratio-tool.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
  // 与 build.mjs 的 toLf() 同口径：构建把内联资源规范化为 LF，
  // 因此这里也按 LF 比较，避免 Windows 工作区 CRLF 造成假失败。
  // 比较强度不变 —— 仍是逐字节严格相等，只是不再受行尾符噪声影响。
  const toLf = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const core = toLf(readFileSync(join(ROOT, 'src', 'core.js'), 'utf8'));
  const app = toLf(readFileSync(join(ROOT, 'src', 'app.js'), 'utf8'));
  const css = toLf(readFileSync(join(ROOT, 'src', 'styles.css'), 'utf8'));
  assert(scripts.some((s) => s === core), 'dist 内联 core.js 与 src 不一致（离线版已过期）');
  assert(scripts.some((s) => s === app), 'dist 内联 app.js 与 src 不一致（离线版已过期）');
  const m = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
  assert(m && m[1] === css, 'dist 内联 styles.css 与 src 不一致（离线版已过期）');
  return 'core.js / app.js / styles.css 三者均同步';
});

await t('T3', 'console 零 error / 零 warning（开发版与离线版各测一次）', async () => {
  assert(page.__errors.length === 0, `开发版 console 不干净：${page.__errors.join(' | ')}`);
  const dpage = await newPage(browser, { width: 1440, height: 1000 });
  await dpage.goto(DIST_URL);
  await dpage.waitForTimeout(900);
  await dpage.click('.ratio-source-segment[data-source="standard"]');
  await dpage.waitForTimeout(200);
  await dpage.click('#standard-list .list__item[data-key="21:9"]');
  await dpage.waitForTimeout(400);
  await dpage.click('.canvas-mode-segment[data-mode="custom"]');
  await dpage.waitForTimeout(400);
  assert(dpage.__errors.length === 0, `离线版 console 不干净：${dpage.__errors.join(' | ')}`);
  await dpage.close();
  return '两个文件 console 均干净';
});

await t('T4', '离线版与开发版核心结果一致（行为对等）', async () => {
  const dpage = await newPage(browser, { width: 1440, height: 1000 });
  await dpage.goto(DIST_URL);
  await dpage.waitForTimeout(800);
  const ds = await readState(dpage);
  const ps = await readState(page);
  assert(ds.ratioValue === ps.ratioValue, `比例不一致：dev ${ps.ratioValue} vs dist ${ds.ratioValue}`);
  assert(ds.resValue === ps.resValue, `分辨率不一致：dev ${ps.resValue} vs dist ${ds.resValue}`);
  assert(ds.tableRows.length === ps.tableRows.length, '结果表格行数不一致');
  await dpage.close();
  return `比例 ${ds.ratioValue} / 输出 ${ds.resValue} 一致`;
});

await t('T5', '非零取整误差不得显示为 0（自相矛盾防护）', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(150);
  await page.click('#standard-list .list__item[data-key="21:9"]');
  await page.waitForTimeout(250);
  const samples = findTinyErrorWidths(7 / 3, 1000, 20000, 3);
  assert(samples.length > 0, '独立扫描未找到小误差样本');
  for (const smp of samples) {
    await setInput(page, '#input-target-width', String(smp.w));
    const s = await readState(page);
    const errRow = s.tableRows.find((r) => r[0] === '宽高比相对误差');
    const shown = parseFloat(String(errRow[3]).replace('%', '').replace('+', ''));
    assert(shown !== 0,
      `宽 ${smp.w}（真实误差 ${smp.err.toFixed(6)}% 非零）却显示为 ${errRow[3]} —— 出现"误差 0% + 存在取整误差"的自相矛盾`);
    const cand = s.candidates.find((c) => c.startsWith('按目标宽度'));
    const cm = cand.match(/与目标比例的宽高比误差\s*([+\-]?[\d.]+)%/);
    assert(cm && parseFloat(cm[1]) !== 0, `宽 ${smp.w} 候选卡同样把非零误差显示为 ${cm && cm[1]}%`);
  }
  return `${samples.length} 个小误差样本（最小 ${samples[0].err.toFixed(6)}%）均正确显示非零`;
});

await t('T6', '近似值行的相对误差不得显示为 0（与"近似"标注自洽）', async () => {
  await resetAll(page);
  await setInput(page, '#input-width', '1.23456789');
  await setInput(page, '#input-height', '0.1');
  const s = await readState(page);
  const m = s.approxLine.match(/相对误差\s*([\d.]+)%/);
  assert(m, `近似行未给出相对误差：${s.approxLine}`);
  assert(parseFloat(m[1]) !== 0, `非零近似误差被显示为 ${m[1]}%（与"近似"标注自相矛盾）：${s.approxLine}`);
  return `近似行：${s.approxLine}`;
});

await t('T7', '警示条不得对"明显不同于 21:9"的标准比例误报', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(150);
  for (const key of ['16:9', '4:3', '1:1']) {
    await page.click(`#standard-list .list__item[data-key="${key}"]`);
    await page.waitForTimeout(350);
    const st = await readState(page);
    const r = st.tableRows.find((x) => x[0] === '实际比例');
    const targetR = parseRatioText(r[2]);
    const diffTo21 = Math.abs(targetR - 7 / 3) / (7 / 3) * 100;
    if (diffTo21 > 10) {
      assert(!st.warnVisible, `目标 ${key}（距 21:9 达 ${diffTo21.toFixed(1)}%）仍弹出 21:9 警示：${st.warn}`);
    }
  }
  return '16:9 / 4:3 / 1:1 均不再误报 21:9 警示';
});

await t('T8', '警示条关闭状态按会话记忆（§12.16：可关闭且会话内记忆）', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(150);
  await page.click('#standard-list .list__item[data-key="16:9"]');
  await page.waitForTimeout(350);
  // 造一个必须警示的非标准比例
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '5:3');
  await page.waitForTimeout(500);
  const st1 = await readState(page);
  assert(st1.warnVisible, '非标准比例未触发警示条，无法验证关闭行为');
  await page.click('#btn-warn-close');
  await page.waitForTimeout(300);
  const dismissed = await page.evaluate(() => document.getElementById('warn-bar').style.display === 'none');
  assert(dismissed, '点击关闭后警示条未隐藏');
  const remembered = await page.evaluate(() => window.sessionStorage.getItem('ledRatioTool.warnDismissed') === '1');
  assert(remembered, '关闭状态未写入会话存储（§12.16 要求会话内记忆）');
  return '关闭后隐藏且会话内记忆';
});

await t('T9', '模式 D（整数倍画布）端到端可用：顶部结果 / 结果表格 / 两个复制按钮 / 舞台', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="custom"]');
  await page.waitForTimeout(150);
  await setInput(page, '#input-custom-ratio', '65:36');
  await page.click('.canvas-mode-segment[data-mode="custom"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-canvas-max-width', '1920');
  await setInput(page, '#input-canvas-max-height', '1080');
  await page.waitForTimeout(500);
  const s = await readState(page);
  assert(/\d+\s*×\s*\d+/.test(s.resValue), `顶部核心分辨率为空：${s.resValue}`);
  const resRow = s.tableRows.find((r) => r[0] === '目标画布分辨率');
  assert(resRow && /\d+\s*×\s*\d+/.test(resRow[2]), `结果表格"目标画布分辨率"为空：${resRow && resRow.join('|')}`);
  for (const row of ['宽高比相对误差', '像素尺寸误差', '匹配判定', '等比适配方案']) {
    assert(s.tableRows.some((r) => r[0] === row), `结果表格缺「${row}」行`);
  }
  await page.click('#btn-copy-resolution');
  await page.waitForTimeout(500);
  const clip = await readClip(page);
  assert(/^\d+×\d+$/.test(clip), `复制分辨率为空或格式错：${JSON.stringify(clip)}`);
  const label = await page.locator('#btn-copy-resolution .label').textContent();
  assert(/已复制/.test(label), `复制失败：${label}`);
  await page.click('#btn-copy-full');
  await page.waitForTimeout(500);
  const clip2 = await readClip(page);
  assert(clip2.includes('目标画布分辨率'), '复制完整参数缺「目标画布分辨率」');
  assert(clip2.includes('是否严格匹配'), '复制完整参数缺「是否严格匹配」');
  const st = await readStage(page);
  const labelTxt = st.canvas.label || '';
  const expRatio = (65 / 36).toFixed(4);
  assert(labelTxt.startsWith(expRatio), `舞台画布比例应为 ${expRatio}，实际标签「${labelTxt}」`);
  return `顶部 ${s.resValue}，表格齐备，复制 "${clip}"，舞台 ${labelTxt}`;
});

await t('T10', '模式 D 当前候选含 §3.6 要求的全部字段（像素尺寸误差 / 匹配判定 / 适配方案）', async () => {
  const s = await readState(page);
  const cand = s.candidates.find((c) => c.startsWith('整数倍画布'));
  assert(cand, '无整数倍画布候选');
  for (const n of ['实际像素比例', '目标屏幕比例', '与目标比例的宽高比误差', '像素尺寸误差', '严格匹配', '等比适配']) {
    assert(cand.includes(n), `整数倍候选缺字段「${n}」：${cand}`);
  }
  return cand.slice(0, 110) + '…';
});

await t('T11', '结果表格不得用目标比例覆盖实际屏幕比例（§2.3）', async () => {
  const s = await readState(page);
  const row = s.tableRows.find((r) => r[0] === '实际比例');
  assert(row, '缺实际比例行');
  const expScreen = (ownToMm('14', 'm') / ownToMm('4', 'm')).toFixed(4);
  assert(parseRatioText(row[1]).toFixed(4) === expScreen, `屏幕值列应为 ${expScreen}，实际 ${row.join('|')}`);
  assert(row[2] !== row[1], '画布值列与屏幕值列相同，疑似被覆盖');
  return `屏幕 ${row[1]} / 画布 ${row[2]}`;
});

await t('T12', '交互命中区不小于 36×36px（§9 触摸目标）', async () => {
  await resetAll(page);
  await page.click('.ratio-source-segment[data-source="standard"]');
  await page.waitForTimeout(150);
  await page.click('#standard-list .list__item[data-key="16:9"]');
  await page.waitForTimeout(350);
  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, input, .list__item, .segmented__item').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.width < 36 || r.height < 36) {
        out.push((el.id || el.className) + ` ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
      }
    });
    return out;
  });
  assert(small.length === 0, `命中区小于 36×36px：${small.join(', ')}`);
  return '全部交互元素命中区达标';
});

await t('T13', '桌面端 Tab 顺序与视觉顺序一致（§10.1 焦点顺序）', async () => {
  const info = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('main > section')].map((s) => {
      const r = s.getBoundingClientRect();
      return { cls: s.className, x: r.left, y: r.top };
    });
    const visual = rects.slice().sort((a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y)).map((r) => r.cls);
    const dom = [...document.querySelectorAll('main > section')].map((s) => s.className);
    return { dom, visual };
  });
  const kind = (c) => (c.includes('panel--input') ? 'A' : c.includes('panel--stage') ? 'B' : c.includes('panel--result') ? 'C' : '?');
  const domSeq = info.dom.map(kind).join('');
  const visSeq = info.visual.map(kind).join('');
  assert(domSeq === visSeq, `DOM 顺序 ${domSeq} 与桌面视觉顺序 ${visSeq} 不一致（§10.1 要求 DOM 顺序 = 视觉顺序）`);
  return `DOM ${domSeq} = 视觉 ${visSeq}`;
});

await t('T14', '「恢复默认值」应复位整数比模式的自定义字段', async () => {
  await resetAll(page);
  await page.click('.canvas-mode-segment[data-mode="custom"]');
  await page.waitForTimeout(200);
  await setInput(page, '#input-canvas-max-width', '3000');
  await setInput(page, '#input-canvas-max-height', '2000');
  await setInput(page, '#input-canvas-ratio', '32:9');
  await page.waitForTimeout(300);
  await resetAll(page);
  const s = await readState(page);
  assert(s.inputs.maxWidth === '' && s.inputs.maxHeight === '' && s.inputs.canvasRatio === '65:36',
    `恢复默认值后整数比字段未复位：maxW="${s.inputs.maxWidth}" maxH="${s.inputs.maxHeight}" ratio="${s.inputs.canvasRatio}"（上限应清空、比例应回到默认 65:36）`);
  return '整数比字段已复位';
});

/* ---------------- 3.4 截图 ---------------- */

if (TAKE_SHOTS) {
  group('截图');

  await t('SHOT-1', '桌面三栏', async () => {
    await resetAll(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS, '01-desktop-3col.png') });
    return '01-desktop-3col.png';
  });

  await t('SHOT-2', '移动单栏（375px）', async () => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, '02-mobile-1col.png') });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.waitForTimeout(400);
    return '02-mobile-1col.png';
  });

  await t('SHOT-3', '21:9 · 完整显示（左右黑边）', async () => {
    await resetAll(page);
    await page.click('.ratio-source-segment[data-source="standard"]');
    await page.waitForTimeout(150);
    await page.click('#standard-list .list__item[data-key="21:9"]');
    await page.waitForTimeout(200);
    await page.click('.stage-mode-segment[data-mode="contain"]');
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, '03-21x9-contain.png') });
    return '03-21x9-contain.png';
  });

  await t('SHOT-4', '21:9 · 铺满（上下裁切）', async () => {
    await page.click('.stage-mode-segment[data-mode="cover"]');
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, '04-21x9-cover.png') });
    return '04-21x9-cover.png';
  });

  await t('SHOT-5', '65:36 精确解 1950×1080（整数倍模式）', async () => {
    await resetAll(page);
    await page.click('.ratio-source-segment[data-source="custom"]');
    await page.waitForTimeout(150);
    await setInput(page, '#input-custom-ratio', '65:36');
    await page.click('.canvas-mode-segment[data-mode="custom"]');
    await page.waitForTimeout(200);
    // 注意：#input-canvas-ratio 不会被"恢复默认值"复位（T14 缺陷），这里显式设定
    await setInput(page, '#input-canvas-ratio', '65:36');
    await setInput(page, '#input-canvas-max-width', '1920');
    await setInput(page, '#input-canvas-max-height', '1080');
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, '05-65x36-exact-1950x1080.png') });
    return '05-65x36-exact-1950x1080.png';
  });

  await t('SHOT-6', '异常输入态', async () => {
    await resetAll(page);
    await setInput(page, '#input-width', '12abc');
    await page.screenshot({ path: join(SHOTS, '06-invalid-input.png') });
    return '06-invalid-input.png';
  });
}

/* ---------------- 4. 汇总 ---------------- */

await page.close();
await browser.close();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const byGroup = new Map();
for (const r of results) {
  if (!byGroup.has(r.group)) byGroup.set(r.group, []);
  byGroup.get(r.group).push(r);
}

console.log('\n' + '='.repeat(78));
console.log('验收结果汇总');
console.log('='.repeat(78));
for (const [g, rs] of byGroup) {
  const p = rs.filter((r) => r.ok).length;
  console.log(`\n【${g}】 ${p}/${rs.length}`);
  for (const r of rs) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.id}  ${r.desc}`);
    if (!r.ok) console.log(`      ↳ ${r.note}`);
  }
}
console.log('\n' + '='.repeat(78));
console.log(`总计：${results.length} 项，通过 ${passed}，失败 ${failed.length}`);
console.log(`通过率：${(passed / results.length * 100).toFixed(1)}%`);
if (failed.length) {
  console.log('\n失败项：');
  for (const f of failed) console.log(`  ❌ [${f.group}] ${f.id} — ${f.note}`);
}
console.log('='.repeat(78));

process.exit(failed.length ? 1 : 0);
