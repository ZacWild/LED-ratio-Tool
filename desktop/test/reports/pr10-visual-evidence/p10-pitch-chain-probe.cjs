'use strict';
/**
 * PR #10 / S10-1 缺陷实测复现探针（只读取证，不改产品代码）
 *
 * 场景（任务书 3.1 / 9.2）：物理尺寸 10500 × 3670 mm，
 *   依次 P1.86 → P2.0 → P2.5 → P3.0，验证 LED 理论原生分辨率是否随 P 变化。
 * 同时验证 PX 换算是否随 P 变化、手动输入 PX 是否被覆盖。
 *
 * 用法：
 *   PR10_DESKTOP=<desktop 绝对路径> PR10_EVIDENCE=<证据目录> node p10-pitch-chain-probe.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const DESKTOP = process.env.PR10_DESKTOP;
const OUT = process.env.PR10_EVIDENCE;
const { _electron } = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const rec = {
    meta: { generatedAt: new Date().toISOString(), desktop: DESKTOP, scenario: '10500 × 3670 mm, P1.86→P2.0→P2.5→P3.0' },
    steps: [],
    pxOrigin: {},
    errors: [],
  };
  const app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env, timeout: 60000 });
  const win = await app.firstWindow();
  win.on('pageerror', (e) => rec.errors.push('pageerror: ' + e.message.slice(0, 200)));
  win.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text().slice(0, 200)); });
  await win.waitForLoadState('domcontentloaded');
  await sleep(1800);

  // 读取理论估算表格（label → value）
  const readTheory = () => win.evaluate(() => {
    const block = document.getElementById('pitch-native-block');
    if (!block) return { missing: true };
    const rows = {};
    block.querySelectorAll('.pitch-table tbody tr').forEach((tr) => {
      const td = tr.children;
      if (td.length >= 2) rows[(td[0].textContent || '').trim()] = (td[1].textContent || '').trim();
    });
    const notices = Array.from(block.querySelectorAll('.pitch-notice, .pitch-unavailable, .pitch-warn'))
      .map((e) => (e.textContent || '').trim());
    return {
      rows,
      notices,
      open: block.open,
      rawText: (block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    };
  });

  const readState = () => win.evaluate(() => ({
    snap: window.LedPitch ? window.LedPitch.snapshot() : null,
    pitch: window.LedPitch ? window.LedPitch.getPitch() : null,
    width: (document.getElementById('input-width') || {}).value,
    height: (document.getElementById('input-height') || {}).value,
    activeUnit: (document.querySelector('.unit-segment[aria-checked="true"]') || {}).dataset?.unit,
    pitchStatus: (document.getElementById('pitch-status') || {}).textContent,
  }));

  const setPhysical = async () => {
    // 切到 mm 后输入 10500 × 3670
    await win.click('.unit-segment[data-unit="mm"]');
    await sleep(400);
    for (const [id, v] of [['input-width', '10500'], ['input-height', '3670']]) {
      await win.evaluate(([i, val]) => {
        const e = document.getElementById(i);
        e.value = val;
        e.dispatchEvent(new Event('input', { bubbles: true }));
      }, [id, v]);
      await sleep(150);
    }
    await sleep(500);
  };

  const openSettings = async () => {
    await win.evaluate(() => window.__desktopMenu('menu:open-settings'));
    await sleep(450);
  };
  const closeSettings = async () => {
    await win.evaluate(() => { const b = document.getElementById('modal-close'); if (b) b.click(); });
    await sleep(350);
  };
  const clickPreset = async (value) => {
    await openSettings();
    await win.click(`.pitch-preset[data-pitch="${value}"]`);
    await sleep(500);
    const s = await readState();
    await closeSettings();
    await sleep(350);
    return s;
  };

  // ---- 0. 设定物理尺寸 ----
  await setPhysical();
  await win.evaluate(() => {
    const b = document.getElementById('pitch-native-block');
    if (b) b.open = true;
  });
  await sleep(400);
  rec.initial = await readState();

  // ---- 1. P 值逐档切换 ----
  for (const p of ['1.667', '1.86', '2', '2.5', '3']) {
    const st = await clickPreset(p);
    const theory = await readTheory();
    rec.steps.push({ preset: p, stateAfterClick: st, theory });
  }

  // ---- 2. 切回 P2.0 后切到 px 单位，观察换算值 ----
  await clickPreset('2');
  await win.click('.unit-segment[data-unit="px"]');
  await sleep(700);
  rec.pxOrigin.afterP2 = await readState();

  // ---- 3. 用户手动输入 PX 后切换 P，检查是否被覆盖 ----
  for (const [id, v] of [['input-width', '1920'], ['input-height', '1080']]) {
    await win.evaluate(([i, val]) => {
      const e = document.getElementById(i);
      e.value = val;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);
    await sleep(180);
  }
  await sleep(400);
  rec.pxOrigin.manual = await readState();
  await clickPreset('2.5');
  rec.pxOrigin.afterManualThenP25 = await readState();

  // ---- 4. 清空 P 值 ----
  await openSettings();
  await win.evaluate(() => {
    const i = document.getElementById('input-pitch-custom');
    if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(500);
  await closeSettings();
  rec.pxOrigin.afterClear = { state: await readState(), theory: await readTheory() };

  await app.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'p10-pitch-chain-probe.json'), JSON.stringify(rec, null, 2), 'utf8');

  // 控制台摘要
  console.log('=== 初始物理尺寸 ===');
  console.log(JSON.stringify(rec.initial));
  console.log('\n=== P 值切换 → 理论分辨率 ===');
  for (const s of rec.steps) {
    const r = s.theory.rows || {};
    console.log(`P${s.preset}: snap.pixelPitchMm=${s.stateAfterClick.snap?.pixelPitchMm} | 理论水平=${r['理论水平像素数量（连续值）']} | 理论垂直=${r['理论垂直像素数量（连续值）']} | 整数=${r['理论整数分辨率估算']} | 当前P行=${r['当前采用的 P 值']}`);
  }
  console.log('\n=== PX 来源 ===');
  for (const [k, v] of Object.entries(rec.pxOrigin)) {
    console.log(k, '->', JSON.stringify(v.state ? { w: v.state.width, h: v.state.height, unit: v.state.activeUnit, pxOrigin: v.state.snap?.pxOrigin, pitch: v.state.snap?.pixelPitchMm } : v));
  }
  console.log('\nerrors:', JSON.stringify(rec.errors));
})().catch((e) => { console.error('PROBE_FAILED', e); process.exit(1); });
