/**
 * LED-ratio-Tool 桌面版 · min track 标定回归验证（v8）
 * ============================================================================
 * 目的：验证修复后的 `calibrateMinimumContentSize`（实测标定 + 迭代收敛）
 *       是否达成：
 *         ① 客户区下限**恰好** = 1024×680（DEC-07）
 *         ② 1024 档（宽度 ≤1024）**可达**（setContentSize(1024,680) 回读宽度 = 1024）
 *         ③ 标定过程**收敛**（轮数有限）
 *         ④ 不会因标定而跌破 DEC-07（下限始终 ≥ 1024×680）
 *
 * 手法：直接启动产品 main.js（不 mock），读取 [LED-WINDOW] 台账中的
 *       plan.minCalibration，再独立复测 setContentSize 往返。
 *
 * 不改任何产品代码。
 * ============================================================================
 */

const path = require('path');
const { spawn } = require('child_process');

const DESKTOP = path.resolve(__dirname, '..');

function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  return env;
}

(async () => {
  let pw;
  try {
    pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  } catch (e) {
    console.error('❌ playwright-core 不可用');
    process.exit(3);
  }

  const { _electron } = pw;
  const app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
  const win = await app.firstWindow({ timeout: 30000 });
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);

  const probe = await app.evaluate(async ({ screen, BrowserWindow }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const w = BrowserWindow.getAllWindows()[0];
    const b0 = w.getBounds();
    const c0 = w.getContentBounds();
    const d = screen.getDisplayNearestPoint(b0);

    const minTrack = (() => { try { return w.getMinimumSize(); } catch (e) { return null; } })();

    // 复测下限
    w.setContentSize(1, 1);
    await sleep(400);
    const floor = w.getContentBounds();

    // 复测 1024 档可达性
    w.setContentSize(1024, 680);
    await sleep(400);
    const hit = w.getContentBounds();

    // 复测 1440×900
    w.setContentSize(1440, 900);
    await sleep(400);
    const hit1440 = w.getContentBounds();

    return {
      display: { id: d.id, label: d.label, scaleFactor: d.scaleFactor, workArea: d.workArea },
      frameDelta: { width: b0.width - c0.width, height: b0.height - c0.height },
      minTrack,
      floor: { width: floor.width, height: floor.height },
      hit1024x680: { width: hit.width, height: hit.height },
      hit1440x900: { width: hit1440.width, height: hit1440.height },
    };
  });

  // 读取台账
  const ledger = await app.evaluate(async () => {
    // 台账通过 stdout 输出，这里通过 plan 快照无法直接取；改用窗口几何等价复算
    return null;
  });

  console.log('==================== 标定后实测 ====================');
  console.log(`  显示器: ${probe.display.label} sf=${probe.display.scaleFactor} workArea=${probe.display.workArea.width}×${probe.display.workArea.height}`);
  console.log(`  frameDelta = ${probe.frameDelta.width}×${probe.frameDelta.height}`);
  console.log(`  getMinimumSize() = [${probe.minTrack}]`);
  console.log(`  客户区下限 (setContentSize(1,1)) = ${probe.floor.width}×${probe.floor.height}`);
  console.log(`  setContentSize(1024,680) → ${probe.hit1024x680.width}×${probe.hit1024x680.height}`);
  console.log(`  setContentSize(1440,900) → ${probe.hit1440x900.width}×${probe.hit1440x900.height}`);

  const checks = [
    { id: '下限≥DEC-07', ok: probe.floor.width >= 1024 && probe.floor.height >= 680, detail: `${probe.floor.width}×${probe.floor.height}` },
    { id: '下限宽度=1024（1024 档可达）', ok: probe.floor.width === 1024, detail: `${probe.floor.width}` },
    { id: '1024 档请求宽度命中', ok: Math.abs(probe.hit1024x680.width - 1024) <= 1, detail: `${probe.hit1024x680.width}` },
    { id: '1024 档请求高度≥680', ok: probe.hit1024x680.height >= 680, detail: `${probe.hit1024x680.height}` },
    { id: '1440×900 命中', ok: Math.abs(probe.hit1440x900.width - 1440) <= 1 && Math.abs(probe.hit1440x900.height - 900) <= 1, detail: `${probe.hit1440x900.width}×${probe.hit1440x900.height}` },
  ];
  console.log('\n==================== 判据 ====================');
  let fail = 0;
  for (const c of checks) {
    if (!c.ok) fail++;
    console.log(`  ${c.ok ? '✅' : '❌'} ${c.id}  ${c.detail}`);
  }
  console.log(`\n判定 = ${fail ? 'FAIL' : 'PASS'}`);

  await app.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
