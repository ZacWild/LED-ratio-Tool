/**
 * LED-ratio-Tool 桌面版 · TC-DP 回归根因定位探针（v2 · 移屏对照）
 * ============================================================================
 * 目的：判定 Desktop E2E「TC-DP-01/02 FAIL」的根因属于哪一类：
 *   H1 显示器相关（窗口所在屏不同 → setContentSize 往返偏差不同）
 *   H2 代码相关（新 main.js 的两阶段隐藏初始化 / setMinimumSize 引入）
 *   H3 DPI 相关（窗口创建时所在屏的 scaleFactor 与最终所在屏不一致）
 *
 * 手法：把同一个窗口在**屏1（125%）**与**屏2（100%）**之间来回移动，
 *       每到一处就实测三组数据：
 *         ① setContentSize(1440,900) 往返偏差
 *         ② getMinimumSize() 读数
 *         ③ 实测最小客户区（setContentSize(1,1) 后回读）
 *
 * 不改任何产品代码。
 * ============================================================================
 */

const path = require('path');

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
  await win.waitForTimeout(1200);

  const probe = await app.evaluate(async ({ screen, BrowserWindow }) => {
    const w0 = BrowserWindow.getAllWindows()[0];
    const out = { displays: [], samples: [] };

    out.displays = screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label,
      scaleFactor: d.scaleFactor,
      bounds: d.bounds,
      workArea: d.workArea,
    }));
    out.cursor = (() => { try { return screen.getCursorScreenPoint(); } catch (e) { return null; } })();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function measureAt(tag) {
      await sleep(500);
      const b = w0.getBounds();
      const c = w0.getContentBounds();
      const d = screen.getDisplayNearestPoint(b);

      // ① setContentSize 往返
      w0.setContentSize(1440, 900);
      await sleep(400);
      const c2 = w0.getContentBounds();
      const b2 = w0.getBounds();

      // ② getMinimumSize
      let minTrack = null;
      try { minTrack = w0.getMinimumSize(); } catch (e) { minTrack = 'ERR'; }

      // ③ 实测最小客户区
      w0.setContentSize(1, 1);
      await sleep(400);
      const c3 = w0.getContentBounds();

      // 复原
      w0.setContentSize(1440, 900);
      await sleep(300);

      out.samples.push({
        tag,
        onDisplay: { id: d.id, label: d.label, scaleFactor: d.scaleFactor },
        windowBounds: { x: b.x, y: b.y, width: b.width, height: b.height },
        frameDelta: { width: b.width - c.width, height: b.height - c.height },
        contentSizeRoundTrip: {
          requested: { width: 1440, height: 900 },
          actual: { width: c2.width, height: c2.height },
          delta: { width: c2.width - 1440, height: c2.height - 900 },
          frameAfter: { width: b2.width - c2.width, height: b2.height - c2.height },
        },
        minTrack,
        actualMinContent: { width: c3.width, height: c3.height },
      });
    }

    // A. 初始（窗口当前所在位置）
    await measureAt('A · 初始位置');

    // B. 移到屏1（x=0）
    const d1 = out.displays.reduce((a, b) => (a.bounds.x <= b.bounds.x ? a : b));
    w0.setPosition(d1.bounds.x + 100, d1.bounds.y + 100);
    await measureAt(`B · 移到 ${d1.label}@x=${d1.bounds.x} (sf=${d1.scaleFactor})`);

    // C. 再移回屏2
    const d2 = out.displays.reduce((a, b) => (a.bounds.x >= b.bounds.x ? a : b));
    w0.setPosition(d2.bounds.x + 100, d2.bounds.y + 100);
    await measureAt(`C · 移到 ${d2.label}@x=${d2.bounds.x} (sf=${d2.scaleFactor})`);

    return out;
  });

  console.log('==================== 显示器拓扑 ====================');
  console.log(JSON.stringify(probe.displays, null, 1));
  console.log('光标:', JSON.stringify(probe.cursor));

  console.log('\n==================== 移屏对照 ====================');
  for (const s of probe.samples) {
    console.log(`\n■ ${s.tag}`);
    console.log(`  所在屏: ${s.onDisplay.label} id=${s.onDisplay.id} sf=${s.onDisplay.scaleFactor}`);
    console.log(`  窗口外框: ${s.windowBounds.width}×${s.windowBounds.height} @(${s.windowBounds.x},${s.windowBounds.y}) | frameDelta ${s.frameDelta.width}×${s.frameDelta.height}`);
    console.log(`  setContentSize(1440,900) → ${s.contentSizeRoundTrip.actual.width}×${s.contentSizeRoundTrip.actual.height} (Δ ${s.contentSizeRoundTrip.delta.width}, ${s.contentSizeRoundTrip.delta.height}) | 回读 frameDelta ${s.contentSizeRoundTrip.frameAfter.width}×${s.contentSizeRoundTrip.frameAfter.height}`);
    console.log(`  getMinimumSize() = [${s.minTrack}] | 实测最小客户区 = ${s.actualMinContent.width}×${s.actualMinContent.height}`);
  }

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
