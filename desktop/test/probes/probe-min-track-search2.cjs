/**
 * LED-ratio-Tool 桌面版 · min track 精确命中 2D 搜索（v6）
 * ============================================================================
 * 目的：找出使 **客户区下限恰好 = 1024×680**（DEC-07，且 1024 档布局可达）
 *       的 setMinimumSize(M) 组合。
 *
 * 已实测的关键事实（@125% 屏）：
 *   · frameDelta（getBounds − getContentBounds） = 15×64
 *   · 但「min track → 客户区」的换算量 = **12×63**（≠ frameDelta）
 *     ⇒ 用 `minContent + frameDelta` 当 min track 会**超射**，
 *       实测 setMinimumSize(1040,745) → 客户区下限 1028×682（超 4×2）
 *       → 1024 档（宽度 ≤1024）**永远不可达** → TC-DP-04 BLOCKED。
 *
 * 手法：在同一屏上，对候选 M 做 2D 扫描，每个 M 实测两个指标：
 *   ① floor = setContentSize(1,1) 后的客户区（= 用户能拖到的下限）
 *   ② hit   = setContentSize(1024,680) 的回读（= 请求该尺寸能否达成）
 *   目标：floor ≥ 1024×680（守住 DEC-07）且 hit ≈ 1024×680（1024 档可达）
 *
 * 不改任何产品代码。
 * ============================================================================
 */

const path = require('path');

const DESKTOP = path.resolve(__dirname, '..', '..');

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
    const out = { displays: [], scan: [] };

    out.displays = screen.getAllDisplays().map((d) => ({
      id: d.id, label: d.label, scaleFactor: d.scaleFactor, bounds: d.bounds, workArea: d.workArea,
    }));

    async function probeOne(mw, mh) {
      const w = new BrowserWindow({
        width: 1440, height: 900, useContentSize: true, show: false, autoHideMenuBar: false,
      });
      await sleep(260);
      w.setMinimumSize(mw, mh);
      await sleep(260);

      w.setContentSize(1024, 680);
      await sleep(340);
      const hit = w.getContentBounds();

      w.setContentSize(1, 1);
      await sleep(340);
      const floor = w.getContentBounds();

      w.destroy();
      await sleep(140);

      return {
        m: [mw, mh],
        hit: { width: hit.width, height: hit.height },
        floor: { width: floor.width, height: floor.height },
        hitOK: Math.abs(hit.width - 1024) <= 1 && Math.abs(hit.height - 680) <= 1,
        floorOK: floor.width >= 1024 && floor.height >= 680,
      };
    }

    for (let mw = 1034; mw <= 1039; mw += 1) {
      for (let mh = 738; mh <= 745; mh += 1) {
        out.scan.push(await probeOne(mw, mh));
      }
    }
    return out;
  });

  console.log('==================== 显示器拓扑 ====================');
  for (const d of probe.displays) {
    console.log(`  id=${d.id} ${d.label} sf=${d.scaleFactor} workArea=${d.workArea.width}×${d.workArea.height}`);
  }

  console.log('\n==================== 2D 扫描 ====================');
  for (const r of probe.scan) {
    const ok = r.hitOK && r.floorOK;
    console.log(
      `  setMinimumSize(${r.m[0]},${r.m[1]})` +
      ` → hit=${r.hit.width}×${r.hit.height}${r.hitOK ? '✓' : ' '}` +
      ` floor=${r.floor.width}×${r.floor.height}${r.floorOK ? '✓' : ' '}` +
      `  ${ok ? '⭐ 命中（floor≥DEC-07 且 hit≈1024×680）' : ''}`
    );
  }

  const good = probe.scan.filter((r) => r.hitOK && r.floorOK);
  console.log('\n==================== 推荐组合 ====================');
  if (good.length) {
    // 优先选 floor 恰好 1024×680 的（最小富余）
    good.sort((a, b) =>
      (a.floor.width - 1024) + (a.floor.height - 680) - ((b.floor.width - 1024) + (b.floor.height - 680)));
    for (const g of good.slice(0, 8)) {
      console.log(`  setMinimumSize(${g.m[0]}, ${g.m[1]})  → floor=${g.floor.width}×${g.floor.height}  hit=${g.hit.width}×${g.hit.height}`);
    }
  } else {
    console.log('  （无同时满足的组合）');
  }

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
