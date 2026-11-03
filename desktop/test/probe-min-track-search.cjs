/**
 * LED-ratio-Tool 桌面版 · min track 精确命中搜索（v5）
 * ============================================================================
 * 目的：找到让**客户区恰好 1024×680**（DEC-07 下限，且可被精确请求到）
 *       的 setMinimumSize(M) 值。
 *
 * v4 已测出的关键事实（@125% 屏，frameDelta = 15×64）：
 *   setMinimumSize(1040,745) → 实际最小客户区 1028×682
 *     ⇒ minTrack − minClient = **12×63**
 *     ⇒ 「min track 口径」的换算量与 frameDelta(15×64) **不是同一套**
 *   而构造参数路径（HEAD）：minTrack=[1038,743] → 实际最小客户区 1025×656
 *     ⇒ 高度 743−656 = **87**（含菜单栏 26 + 边框）
 *
 * 手法：对 M 的两个分量各自做**线性扫描**（而不是二分），
 *       因为换算关系在 Windows 11 上带「像素取整」，不严格单调。
 *       对每个 M，实测 setContentSize(1024,680) 的实际回读，
 *       找出能**精确命中 1024×680** 的 M 组合。
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
    const out = { displays: [], scan: [], hits: [] };

    out.displays = screen.getAllDisplays().map((d) => ({
      id: d.id, label: d.label, scaleFactor: d.scaleFactor, bounds: d.bounds, workArea: d.workArea,
    }));

    async function tryMinTrack(mw, mh) {
      const w = new BrowserWindow({
        width: 1440, height: 900, useContentSize: true, show: false, autoHideMenuBar: false,
      });
      await sleep(280);
      w.setMinimumSize(mw, mh);
      await sleep(280);

      w.setContentSize(1024, 680);
      await sleep(360);
      const hit = w.getContentBounds();

      w.setContentSize(1, 1);
      await sleep(360);
      const minC = w.getContentBounds();
      const mt = (() => { try { return w.getMinimumSize(); } catch (e) { return null; } })();

      w.destroy();
      await sleep(160);

      return {
        minTrack: [mw, mh],
        getMinimumSize: mt,
        hit: { width: hit.width, height: hit.height },
        exact: hit.width === 1024 && hit.height === 680,
        minClient: { width: minC.width, height: minC.height },
        implied: mt ? { width: mt[0] - minC.width, height: mt[1] - minC.height } : null,
      };
    }

    // 宽度扫描（M_w 固定 1040，M_h 遍历 738..748）
    for (let mh = 736; mh <= 748; mh += 1) {
      const r = await tryMinTrack(1040, mh);
      out.scan.push(r);
      if (r.exact) out.hits.push(r);
    }
    // 高度命中后，再扫宽度
    if (out.hits.length) {
      const mh = out.hits[0].minTrack[1];
      for (let mw = 1030; mw <= 1046; mw += 1) {
        const r = await tryMinTrack(mw, mh);
        out.scan.push(r);
        if (r.exact) out.hits.push(r);
      }
    }
    return out;
  });

  console.log('==================== 显示器拓扑 ====================');
  for (const d of probe.displays) {
    console.log(`  id=${d.id} ${d.label} sf=${d.scaleFactor} workArea=${d.workArea.width}×${d.workArea.height}`);
  }

  console.log('\n==================== 扫描结果 ====================');
  for (const r of probe.scan) {
    const flag = r.exact ? '✅ 精确命中 1024×680' : '';
    console.log(
      `  setMinimumSize(${r.minTrack[0]},${r.minTrack[1]})` +
      ` → getMinSize=[${r.getMinimumSize}]` +
      ` setContentSize(1024,680)→${r.hit.width}×${r.hit.height}` +
      ` minClient=${r.minClient.width}×${r.minClient.height}` +
      ` implied=${r.implied.width}×${r.implied.height}  ${flag}`
    );
  }

  console.log('\n==================== 精确命中组合 ====================');
  if (probe.hits.length) {
    for (const h of probe.hits) console.log(`  setMinimumSize(${h.minTrack[0]}, ${h.minTrack[1]})`);
  } else {
    console.log('  （本轮扫描范围内无精确命中组合）');
  }

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
