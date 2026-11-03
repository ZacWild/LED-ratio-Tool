/**
 * LED-ratio-Tool 桌面版 · DIP 取整验证探针（v7）
 * ============================================================================
 * 目的：验证「setContentSize 请求 680 高 → 回读 681/682」是否由
 *       **DIP → 物理像素取整**造成（而非 min track / 代码缺陷）。
 *
 * 假设：125% 缩放下，680 DIP × 1.25 = 850 物理像素（整除），
 *       但 Windows 的边框/菜单栏占的物理像素不是 1.25 的整数倍，
 *       → 客户区回读被向上取整到 681/682。
 *
 * 验证手法（无需改产品代码）：
 *   对一组高度做扫描，观察「请求 H → 回读 H'」的映射，
 *   并在**两个缩放档**（通过显示器选择）下对比。
 *   若 H' 与 H 的差值随缩放变化（100% 下 H'=H，125% 下 H'=H+1/2），
 *   即证明是**系统取整**，不是产品逻辑问题。
 *
 * 另：验证 1440×900 在 125% 下为何能命中（1440×1.25=1800 整除）。
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
    const out = { displays: [], maps: [] };

    out.displays = screen.getAllDisplays().map((d) => ({
      id: d.id, label: d.label, scaleFactor: d.scaleFactor, bounds: d.bounds, workArea: d.workArea,
    }));

    const w = BrowserWindow.getAllWindows()[0];
    // 解除最小尺寸限制，避免小尺寸被顶高
    w.setMinimumSize(1, 1);
    await sleep(300);

    const heights = [600, 640, 660, 670, 675, 678, 679, 680, 681, 682, 683, 690, 700, 784, 800, 900];
    for (const h of heights) {
      w.setContentSize(1440, h);
      await sleep(320);
      const c = w.getContentBounds();
      const b = w.getBounds();
      const d = screen.getDisplayNearestPoint(b);
      out.maps.push({
        requestedH: h,
        actualH: c.height,
        delta: c.height - h,
        actualW: c.width,
        frameDelta: { width: b.width - c.width, height: b.height - c.height },
        sf: d.scaleFactor,
      });
    }

    // 宽度映射
    const widths = [1024, 1025, 1026, 1200, 1440];
    out.widthMap = [];
    for (const ww of widths) {
      w.setContentSize(ww, 900);
      await sleep(320);
      const c = w.getContentBounds();
      out.widthMap.push({ requestedW: ww, actualW: c.width, delta: c.width - ww, actualH: c.height });
    }

    return out;
  });

  console.log('==================== 显示器拓扑 ====================');
  for (const d of probe.displays) {
    console.log(`  id=${d.id} sf=${d.scaleFactor} workArea=${d.workArea.width}×${d.workArea.height}`);
  }

  console.log('\n==================== 高度映射（请求 → 回读） ====================');
  for (const m of probe.maps) {
    console.log(`  请求 H=${m.requestedH} → 回读 ${m.actualH}（Δ ${m.delta >= 0 ? '+' : ''}${m.delta}） | 宽回读 ${m.actualW} | frameDelta ${m.frameDelta.width}×${m.frameDelta.height} | sf=${m.sf}`);
  }

  console.log('\n==================== 宽度映射 ====================');
  for (const m of probe.widthMap) {
    console.log(`  请求 W=${m.requestedW} → 回读 ${m.actualW}（Δ ${m.delta >= 0 ? '+' : ''}${m.delta}） | 高回读 ${m.actualH}`);
  }

  await app.close();
})().catch((e) => {
  console.error('probe 失败:', e);
  process.exit(1);
});
