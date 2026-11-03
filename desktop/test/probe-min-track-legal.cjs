/**
 * LED-ratio-Tool 桌面版 · min track 合法值探针（v9）
 * ============================================================================
 * 目的：确定 `setMinimumSize(w, h)` 在本机接受哪些 (w, h) 组合，
 *       以及各组合对应的**实测客户区下限**（floor）。
 *
 * 背景：标定过程中把 min track 下调到 (1037, 742) 时，
 *       `setMinimumSize` 抛出 "Error processing argument at index 1,
 *       conversion failure from "（Chromium 的 DIP→像素转换失败）。
 *       → 必须知道**合法取值范围**，才能设计安全的标定策略。
 *
 * 手法：对候选 (w, h) 逐个尝试 setMinimumSize，捕获异常；
 *       成功者实测 floor（setContentSize(1,1) 后回读）与 hit（请求 1024×680）。
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
  await win.waitForTimeout(1500);

  const probe = await app.evaluate(async ({ screen, BrowserWindow }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { displays: [], rows: [] };

    out.displays = screen.getAllDisplays().map((d) => ({
      id: d.id, label: d.label, scaleFactor: d.scaleFactor, workArea: d.workArea,
    }));

    async function tryOne(mw, mh) {
      const w = new BrowserWindow({
        width: 1440, height: 900, useContentSize: true, show: false, autoHideMenuBar: false,
      });
      await sleep(240);
      let setErr = null;
      try {
        w.setMinimumSize(mw, mh);
      } catch (e) {
        setErr = String(e && e.message).slice(0, 90);
      }
      let row = { m: [mw, mh], setErr };
      if (!setErr) {
        await sleep(240);
        w.setContentSize(1, 1);
        await sleep(320);
        const floor = w.getContentBounds();
        w.setContentSize(1024, 680);
        await sleep(320);
        const hit = w.getContentBounds();
        row.floor = { width: floor.width, height: floor.height };
        row.hit = { width: hit.width, height: hit.height };
      }
      w.destroy();
      await sleep(140);
      return row;
    }

    const cands = [];
    // 聚焦标定路径实际会走到的邻域：
    //   初值 = 客户区 + frameDelta = (1024+15, 680+64) = (1039, 744)
    //   下调后可能到达 (1037, 742) / (1036, 741) 等
    for (let mw = 1034; mw <= 1040; mw += 1) {
      for (let mh = 740; mh <= 746; mh += 1) {
        cands.push([mw, mh]);
      }
    }
    for (const [mw, mh] of cands) out.rows.push(await tryOne(mw, mh));

    return out;
  });

  console.log('==================== 显示器 ====================');
  for (const d of probe.displays) console.log(`  sf=${d.scaleFactor} workArea=${d.workArea.width}×${d.workArea.height}`);

  const errRows = probe.rows.filter((r) => r.setErr);
  const okRows = probe.rows.filter((r) => !r.setErr);

  console.log(`\n==================== 汇总 ====================`);
  console.log(`  总候选 ${probe.rows.length}｜setMinimumSize 抛错 ${errRows.length}｜成功 ${okRows.length}`);

  if (errRows.length) {
    console.log('\n  抛错的 (w,h) 组合：');
    // 按 w 聚合打印 h 的区间
    const byW = {};
    for (const r of errRows) {
      (byW[r.m[0]] = byW[r.m[0]] || []).push(r.m[1]);
    }
    for (const w of Object.keys(byW).sort((a, b) => a - b)) {
      console.log(`    w=${w} → h 抛错: ${byW[w].join(',')}`);
    }
    console.log('    错误样例:', errRows[0].setErr);
  }

  console.log('\n  合法组合中 floor≥1024×680 且 hit 宽度=1024 的：');
  const good = okRows.filter((r) => r.floor.width >= 1024 && r.floor.height >= 680 && r.hit.width === 1024);
  for (const r of good) {
    console.log(`    setMinimumSize(${r.m[0]},${r.m[1]}) → floor=${r.floor.width}×${r.floor.height} hit=${r.hit.width}×${r.hit.height}`);
  }
  if (!good.length) console.log('    （无）');

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
