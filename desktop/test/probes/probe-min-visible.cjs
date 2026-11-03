/**
 * LED-ratio-Tool 桌面版 · 最小客户区「显示态 vs 隐藏态」探针（第五轮）
 * ============================================================================
 * 待解之谜（由方案 A 的最小尺寸校准引出）：
 *   隐藏态校准时，实测「用户能拖到的最小客户区」= 1024×706，
 *   但 getBounds().height − getContentBounds().height = 745−706 = **39**（不是 65）——
 *   说明**隐藏态**下菜单栏不计入非客户区，于是 min track 的换算结果偏大 26。
 *
 *   🔴 必须确认**显示态**下菜单栏是否占位：
 *      · 若显示态 delta 回到 65 → 用户实际最小客户区 = 745−65 = **680**（DEC-07 守住 ✓）
 *      · 若显示态 delta 仍是 39   → 用户实际最小客户区 = 706，方案 A 的校准会把下限
 *                                   误调到 706（比 DEC-07 更严），必须改用显示态校准。
 *
 * 用法：node_modules/electron/dist/electron.exe test/probes/probe-min-visible.cjs
 */
'use strict';

const { app, BrowserWindow, Menu, screen } = require('electron');

const read = (w) => {
  const b = w.getBounds();
  const c = w.getContentBounds();
  return {
    bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    content: { width: c.width, height: c.height },
    delta: { width: b.width - c.width, height: b.height - c.height },
    minSize: w.getMinimumSize(),
  };
};

app.whenReady().then(async () => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: '文件', submenu: [{ role: 'quit' }] },
      { label: '编辑', submenu: [{ role: 'copy' }] },
      { label: '帮助', submenu: [{ role: 'about' }] },
    ]),
  );

  const out = { generatedAt: new Date().toISOString(), steps: [] };

  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: false,
    autoHideMenuBar: false,
    minWidth: 1024,
    minHeight: 680,
  });

  // ① 隐藏态：初始 + 压到最小
  out.steps.push({ phase: '① 隐藏态 初始', ...read(w) });
  w.setContentSize(1, 1);
  out.steps.push({ phase: '② 隐藏态 压到最小', ...read(w) });

  // ③ 显示后再压到最小（模拟用户拖拽下限）
  w.show();
  await new Promise((r) => setTimeout(r, 800));
  out.steps.push({ phase: '③ 显示后（未压）', ...read(w) });
  w.setContentSize(1, 1);
  await new Promise((r) => setTimeout(r, 500));
  out.steps.push({ phase: '④ 显示态 压到最小', ...read(w) });

  // ⑤ 恢复目标尺寸，看 delta 是否回到 65
  w.setContentSize(1440, 900);
  await new Promise((r) => setTimeout(r, 500));
  out.steps.push({ phase: '⑤ 显示态 恢复 1440×900', ...read(w) });

  // ⑥ 校准后再测：把 minHeight 调到 680+26=706，重复「显示态压到最小」
  w.setMinimumSize(1024, 706);
  w.setContentSize(1, 1);
  await new Promise((r) => setTimeout(r, 500));
  out.steps.push({ phase: '⑥ 校准后(minHeight=706) 显示态压到最小', ...read(w) });

  // ⑦ 反向：若把 minHeight 设成 680，显示态实际能到多少
  w.setMinimumSize(1024, 680);
  w.setContentSize(1, 1);
  await new Promise((r) => setTimeout(r, 500));
  out.steps.push({ phase: '⑦ 原样(minHeight=680) 显示态压到最小', ...read(w) });

  // ⑧ 结论推导
  const s4 = out.steps.find((s) => s.phase.startsWith('④'));
  const s6 = out.steps.find((s) => s.phase.startsWith('⑥'));
  const s7 = out.steps.find((s) => s.phase.startsWith('⑦'));
  out.conclusion = {
    hiddenMinContent: out.steps.find((s) => s.phase.startsWith('②')).content,
    visibleMinContent_originalMin680: s7 ? s7.content : null,
    visibleMinContent_afterCalibration: s6 ? s6.content : null,
    visibleDelta_original: s7 ? s7.delta : null,
    visibleDelta_afterCalibration: s6 ? s6.delta : null,
    visibleDelta_afterRestore: out.steps.find((s) => s.phase.startsWith('⑤')).delta,
    note:
      '若 ⑦ 的 content.height = 680 → 显示态下 min track 已能到 DEC-07 下限，' +
      '则方案 A 的校准应改为「**显示态**测量」；若 = 706 → 校准有效。',
  };

  process.stdout.write('[PROBE-MINVIS] ' + JSON.stringify(out) + '\n');
  app.quit();
});
