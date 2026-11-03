/**
 * LED-ratio-Tool 桌面版 · min track 标定探针（v4）
 * ============================================================================
 * 目的：找出「setMinimumSize(M) → 用户可拖到的最小客户区」的**真实换算关系**，
 *       以便让 DEC-07 的 1024×680 **恰好可达**（而不是被顶成 1027×682）。
 *
 * 背景（本轮实测到的矛盾）：
 *   · frameDelta（getBounds − getContentBounds）= 15×64 @125%
 *   · setMinimumSize(1040, 745) → getMinimumSize() = [1040, 745]（原样）
 *   · 但 setContentSize(1024, 680) 实际回读 = **1027×682**（被顶高 3×2）
 *   · 而 HEAD 版（仅构造参数 minWidth/minHeight，不调 setMinimumSize）
 *     在同一屏上 TC-DP-04 能**精确命中 1024×680**
 *   → 说明「min track 口径」与「frameDelta 口径」**不是同一套换算**
 *     （Windows 11 存在不可见缩放边框，min track 含它、frameDelta 不含）。
 *
 * 手法：在一个进程里，对同一个屏，遍历多个 setMinimumSize 值 M，
 *       每个 M 都实测：
 *         · getMinimumSize()
 *         · setContentSize(1024, 680) 的实际回读（能否精确命中）
 *         · setContentSize(1, 1) 后的最小客户区
 *       再用「M − minClient」反推真实换算量，验证其是否恒定。
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

    async function probeMinTrack(tag, opts) {
      const w = new BrowserWindow({
        width: 1440, height: 900, useContentSize: true, show: false, autoHideMenuBar: false, ...opts,
      });
      await sleep(350);

      const ctor = { minWidth: opts.minWidth, minHeight: opts.minHeight };
      const minTrackBefore = (() => { try { return w.getMinimumSize(); } catch (e) { return null; } })();

      // 应用 setMinimumSize（若指定）
      if (opts.__set) {
        w.setMinimumSize(opts.__set[0], opts.__set[1]);
        await sleep(300);
      }

      // frameDelta（现窗口口径）
      const b0 = w.getBounds();
      const c0 = w.getContentBounds();
      const frameDelta = { width: b0.width - c0.width, height: b0.height - c0.height };

      // 尝试精确命中 1024×680
      w.setContentSize(1024, 680);
      await sleep(400);
      const hit = w.getContentBounds();

      // 真实最小客户区
      w.setContentSize(1, 1);
      await sleep(400);
      const minC = w.getContentBounds();
      const minTrackAfter = (() => { try { return w.getMinimumSize(); } catch (e) { return null; } })();

      w.destroy();
      await sleep(200);

      return {
        tag,
        ctor,
        minTrackBefore,
        minTrackAfter,
        frameDelta,
        hit1024x680: { width: hit.width, height: hit.height },
        exact: hit.width === 1024 && hit.height === 680,
        actualMinContent: { width: minC.width, height: minC.height },
        // 反推：min track 到客户区的换算量
        impliedFrame: {
          width: minTrackAfter ? minTrackAfter[0] - minC.width : null,
          height: minTrackAfter ? minTrackAfter[1] - minC.height : null,
        },
      };
    }

    // ① 仅构造参数（HEAD 版路径）
    out.cases.push(await probeMinTrack('C1 · 仅构造 min 1024×680（HEAD 路径）', { minWidth: 1024, minHeight: 680 }));

    // ② 构造参数 + setMinimumSize(1040,745)（当前新版路径）
    out.cases.push(await probeMinTrack('C2 · 构造 min + setMinimumSize(1040,745)（当前新版）', {
      minWidth: 1024, minHeight: 680, __set: [1040, 745],
    }));

    // ③ 仅 setMinimumSize(1040,745)
    out.cases.push(await probeMinTrack('C3 · 仅 setMinimumSize(1040,745)', { __set: [1040, 745] }));

    // ④ 仅 setMinimumSize(1037,743)
    out.cases.push(await probeMinTrack('C4 · 仅 setMinimumSize(1037,743)', { __set: [1037, 743] }));

    // ⑤ 仅 setMinimumSize(1039,744)
    out.cases.push(await probeMinTrack('C5 · 仅 setMinimumSize(1039,744)', { __set: [1039, 744] }));

    // ⑥ 仅 setMinimumSize(1035,741)
    out.cases.push(await probeMinTrack('C6 · 仅 setMinimumSize(1035,741)', { __set: [1035, 741] }));

    return out;
  });

  console.log('==================== 显示器拓扑 ====================');
  for (const d of probe.displays) {
    console.log(`  id=${d.id} ${d.label} sf=${d.scaleFactor} bounds=${d.bounds.width}×${d.bounds.height}@(${d.bounds.x},${d.bounds.y}) workArea=${d.workArea.width}×${d.workArea.height}`);
  }

  console.log('\n==================== min track 标定 ====================');
  for (const c of probe.cases) {
    console.log(`\n■ ${c.tag}`);
    console.log(`  构造 min = [${c.ctor.minWidth}, ${c.ctor.minHeight}]`);
    console.log(`  getMinimumSize: 设置前=[${c.minTrackBefore}] 设置后=[${c.minTrackAfter}]`);
    console.log(`  frameDelta = ${c.frameDelta.width}×${c.frameDelta.height}`);
    console.log(`  setContentSize(1024,680) → ${c.hit1024x680.width}×${c.hit1024x680.height}  ${c.exact ? '✅ 精确命中' : '❌ 未精确命中'}`);
    console.log(`  实际最小客户区 = ${c.actualMinContent.width}×${c.actualMinContent.height}`);
    console.log(`  反推换算量(minTrack − minClient) = ${c.impliedFrame.width}×${c.impliedFrame.height}`);
  }

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
