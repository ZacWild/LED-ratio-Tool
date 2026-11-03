/**
 * LED-ratio-Tool 桌面版 · min track 口径对照探针（v3）
 * ============================================================================
 * 目的：定位「实测最小客户区 1023×679（比 DEC-07 的 1024×680 少 1px）」的根因，
 *       并核对 HEAD 版（构造参数 minWidth/minHeight）与新版（setMinimumSize）
 *       两条路径的实际差异。
 *
 * 观察到的矛盾：
 *   · 几何单测/台账记录：setMinimumSize(1040,745) → 实测最小客户区 1024×680 ✅
 *   · 本轮探针实测：getMinimumSize() = [1039,744]，实测最小客户区 = 1023×679 ❌
 *   → 差 1px，怀疑与 **Windows 边框取整 / 显示器 scaleFactor** 有关。
 *
 * 手法：在一个纯净 Electron 进程里，用**三种方式**各建一个窗口，逐一实测：
 *   M1 构造参数 minWidth/minHeight = 1024×680（HEAD 版路径）
 *   M2 构造参数 + setMinimumSize(1040,745)（新版路径，外框口径）
 *   M3 仅 setMinimumSize(1040,745)（无构造 min 参数）
 * 每个窗口都实测：getMinimumSize / setContentSize(1,1) 后回读客户区 /
 *                  setContentSize(1440,900) 往返偏差。
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
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { displays: [], cases: [] };

    out.displays = screen.getAllDisplays().map((d) => ({
      id: d.id, label: d.label, scaleFactor: d.scaleFactor, bounds: d.bounds, workArea: d.workArea,
    }));

    async function buildAndMeasure(tag, opts) {
      const w = new BrowserWindow({
        width: 1440, height: 900, useContentSize: true,
        show: false, autoHideMenuBar: false,
        ...opts,
      });
      await sleep(400);

      const steps = [];

      if (opts && opts.__setMinTrack) {
        w.setMinimumSize(opts.__setMinTrack[0], opts.__setMinTrack[1]);
        await sleep(300);
        steps.push({ step: 'setMinimumSize', args: opts.__setMinTrack });
      }

      const minTrack = (() => { try { return w.getMinimumSize(); } catch (e) { return 'ERR'; } })();

      // 实测最小客户区
      w.setContentSize(1, 1);
      await sleep(400);
      const minC = w.getContentBounds();

      // setContentSize 往返偏差
      w.setContentSize(1440, 900);
      await sleep(400);
      const rt = w.getContentBounds();
      const rb = w.getBounds();

      const d = screen.getDisplayNearestPoint(w.getBounds());
      const result = {
        tag,
        opts: Object.keys(opts || {}),
        onDisplay: { id: d.id, label: d.label, scaleFactor: d.scaleFactor },
        minTrack,
        actualMinContent: { width: minC.width, height: minC.height },
        roundTrip: {
          actual: { width: rt.width, height: rt.height },
          delta: { width: rt.width - 1440, height: rt.height - 900 },
          frameDelta: { width: rb.width - rt.width, height: rb.height - rt.height },
        },
        steps,
      };
      w.destroy();
      await sleep(200);
      return result;
    }

    // M1 · 构造参数 min（HEAD 版路径）
    out.cases.push(await buildAndMeasure('M1 · 构造参数 minWidth/minHeight=1024×680', {
      minWidth: 1024, minHeight: 680,
    }));

    // M2 · 构造参数 min + setMinimumSize 外框口径（新版路径）
    out.cases.push(await buildAndMeasure('M2 · 构造 min 1024×680 + setMinimumSize(1040,745)', {
      minWidth: 1024, minHeight: 680, __setMinTrack: [1040, 745],
    }));

    // M3 · 仅 setMinimumSize（无构造 min）
    out.cases.push(await buildAndMeasure('M3 · 仅 setMinimumSize(1040,745)（无构造 min）', {
      __setMinTrack: [1040, 745],
    }));

    // M4 · 构造参数 min + setMinimumSize(1039,744)（回读值口径）
    out.cases.push(await buildAndMeasure('M4 · 构造 min 1024×680 + setMinimumSize(1039,744)', {
      minWidth: 1024, minHeight: 680, __setMinTrack: [1039, 744],
    }));

    return out;
  });

  console.log('==================== 显示器拓扑 ====================');
  for (const d of probe.displays) {
    console.log(`  id=${d.id} ${d.label} sf=${d.scaleFactor} bounds=${d.bounds.width}×${d.bounds.height}@(${d.bounds.x},${d.bounds.y}) workArea=${d.workArea.width}×${d.workArea.height}`);
  }

  console.log('\n==================== min track 口径对照 ====================');
  for (const c of probe.cases) {
    console.log(`\n■ ${c.tag}`);
    console.log(`  所在屏: ${c.onDisplay.label} id=${c.onDisplay.id} sf=${c.onDisplay.scaleFactor}`);
    console.log(`  getMinimumSize() = [${c.minTrack}]`);
    console.log(`  实测最小客户区 = ${c.actualMinContent.width}×${c.actualMinContent.height}  ${c.actualMinContent.width >= 1024 && c.actualMinContent.height >= 680 ? '✅ ≥1024×680' : '❌ <1024×680'}`);
    console.log(`  setContentSize(1440,900) → ${c.roundTrip.actual.width}×${c.roundTrip.actual.height} (Δ ${c.roundTrip.delta.width}, ${c.roundTrip.delta.height}) | frameDelta ${c.roundTrip.frameDelta.width}×${c.roundTrip.frameDelta.height}`);
  }

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
