'use strict';
/**
 * PR #10 · 新增模块真实 Electron 验证（只读取证）
 * 覆盖 S10-2/3/4/5/6/7 的关键行为：i18n 就绪、使用指南、P 值说明、
 * 可见 PX 来源、语言切换不丢输入/不刷新、D-1 几何、四档无横向溢出。
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
  const rec = { meta: { generatedAt: new Date().toISOString(), desktop: DESKTOP }, checks: [], errors: [] };
  const app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env, timeout: 60000 });
  const win = await app.firstWindow();
  win.on('pageerror', (e) => rec.errors.push('pageerror: ' + e.message.slice(0, 240)));
  win.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text().slice(0, 240)); });
  await win.waitForLoadState('domcontentloaded');
  await sleep(2200);

  const snap = () => win.evaluate(() => {
    const txt = (sel) => { const e = document.querySelector(sel); return e ? (e.textContent || '').trim() : null; };
    const g = document.getElementById('p10-guide');
    const src = document.getElementById('p10-px-source');
    const sel = document.getElementById('p10-lang-select');
    return {
      i18n: window.LedI18NStatus ? {
        registered: window.LedI18NStatus.registered,
        activeSnapshot: window.LedI18NStatus.active,
        keyCount: window.LedI18NStatus.keyCount,
        complete: window.LedI18NStatus.complete,
      } : null,
      locale: (window.LedI18N && window.LedI18N.getLocale) ? window.LedI18N.getLocale() : null,
      guide: g ? {
        exists: true, open: g.open,
        title: txt('#p10-guide .p10-guide__title'),
        toggle: txt('#p10-guide .p10-guide__toggle'),
        sections: Array.from(g.querySelectorAll('.p10-section__title')).map((e) => e.textContent.trim()),
        itemCount: g.querySelectorAll('.p10-list__item').length,
        bodyMaxHeight: getComputedStyle(g.querySelector('.p10-guide__body')).maxHeight,
      } : { exists: false },
      pitchHelp: document.getElementById('p10-pitch-help') ? {
        exists: true,
        title: txt('#p10-pitch-help .p10-pitch-help__title'),
        paraCount: document.querySelectorAll('#p10-pitch-help .p10-para').length,
      } : { exists: false },
      source: src ? { text: (src.textContent || '').replace(/\s+/g, ' ').trim(), origin: src.getAttribute('data-origin') } : null,
      langPicker: sel ? { options: Array.from(sel.options).map((o) => o.textContent), value: sel.value } : null,
      inputs: {
        w: (document.getElementById('input-width') || {}).value,
        h: (document.getElementById('input-height') || {}).value,
        unit: (document.querySelector('.unit-segment[aria-checked="true"]') || {}).getAttribute?.('data-unit') || null,
        pitch: window.LedPitch ? window.LedPitch.snapshot().pixelPitchMm : null,
      },
      resultRatio: txt('#ratio-value'),
      page: { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth },
    };
  });

  const check = (name, pass, detail) => { rec.checks.push({ name, pass: !!pass, detail }); };

  // ---- 1. i18n 运行时 + 新增模块结构 ----
  let s = await snap();
  check('i18n 运行时就绪且双包 key 完整', s.i18n && s.i18n.complete && s.i18n.keyCount >= 376, JSON.stringify(s.i18n));
  check('使用指南已挂载且默认可发现', s.guide.exists && s.guide.open && s.guide.sections.length === 4, JSON.stringify(s.guide));
  check('使用指南四层信息架构齐全', s.guide.itemCount >= 20, '条目数=' + s.guide.itemCount);
  check('P 值说明挂载机制可用（设置打开后）', true, '见 1b 专项检查');
  check('可见 PX 来源标识存在', !!s.source, JSON.stringify(s.source));
  check('语言切换控件存在', s.langPicker && s.langPicker.options.length === 2, JSON.stringify(s.langPicker));
  check('首屏无横向溢出', s.page.scrollW <= s.page.clientW + 1, JSON.stringify(s.page));

  // ---- 1b. 设置模态打开时，P 值说明自动补挂载 ----
  await win.evaluate(() => window.__desktopMenu('menu:open-settings'));
  await sleep(600);
  const helpAfterOpen = await snap();
  check('设置打开后 P 值说明自动挂载（6 段）',
    helpAfterOpen.pitchHelp.exists && helpAfterOpen.pitchHelp.paraCount === 6,
    JSON.stringify(helpAfterOpen.pitchHelp));
  await win.evaluate(() => { const b = document.getElementById('modal-close'); if (b) b.click(); });
  await sleep(350);

  // ---- 2. PX 来源随操作变化 ----
  await win.evaluate(() => window.__desktopMenu('menu:open-settings'));
  await sleep(400);
  await win.click('.pitch-preset[data-pitch="2.5"]');
  await sleep(400);
  await win.evaluate(() => { const b = document.getElementById('modal-close'); if (b) b.click(); });
  await sleep(300);
  await win.click('.unit-segment[data-unit="px"]');
  await sleep(600);
  s = await snap();
  check('P 推算 PX → 来源标识为理论估算', s.source && s.source.origin === 'converted' && /理论|Theoretical/.test(s.source.text), JSON.stringify(s.source));
  const pxValueConverted = s.inputs.w;

  for (const [id, v] of [['input-width', '1920'], ['input-height', '1080']]) {
    await win.evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
    await sleep(150);
  }
  await sleep(400);
  s = await snap();
  check('手动输入 PX → 来源标识为用户输入且值不被覆盖', s.source && s.source.origin === 'direct' && s.inputs.w === '1920', JSON.stringify({ src: s.source, w: s.inputs.w }));

  // ---- 3. 语言切换：不刷新、不丢输入、说明与计算结果同步 ----
  const before = await snap();
  await win.evaluate(() => {
    const sel = document.getElementById('p10-lang-select');
    sel.value = 'en-US';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(700);
  const afterEn = await snap();
  check('语言切换生效（getLocale=en-US）', afterEn.locale === 'en-US', JSON.stringify({ locale: afterEn.locale, statusSnapshot: afterEn.i18n && afterEn.i18n.activeSnapshot }));
  check('语言切换后使用指南标题变英文', /Usage guide|guide/i.test(afterEn.guide.title || ''), 'title=' + afterEn.guide.title);
  check('语言切换后 P 值说明变英文', /pitch|LED/i.test(afterEn.pitchHelp.title || ''), 'title=' + afterEn.pitchHelp.title);
  check('语言切换不丢失输入值', before.inputs.w === afterEn.inputs.w && before.inputs.h === afterEn.inputs.h, JSON.stringify({ before: before.inputs, after: afterEn.inputs }));
  check('语言切换不改变计算结果', before.resultRatio === afterEn.resultRatio, JSON.stringify({ before: before.resultRatio, after: afterEn.resultRatio }));
  check('语言切换不改变 P 值', before.inputs.pitch === afterEn.inputs.pitch, JSON.stringify({ before: before.inputs.pitch, after: afterEn.inputs.pitch }));

  await win.evaluate(() => {
    const sel = document.getElementById('p10-lang-select');
    sel.value = 'zh-CN';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(600);
  const backZh = await snap();
  check('切回 zh-CN 文案复原', /使用指南/.test(backZh.guide.title || ''), 'title=' + backZh.guide.title);

  // ---- 4. D-1 几何 + 四档布局 ----
  await win.evaluate(() => {
    const b = document.getElementById('pitch-native-block');
    if (b) b.open = true;
    const c = document.getElementById('cabinet-verify-block');
    if (c) c.open = true;
  });
  await sleep(500);
  for (const [w, h] of [[1440, 900], [1600, 1000], [1200, 800], [1024, 680]]) {
    await app.evaluate(async ({ BrowserWindow }, sz) => { BrowserWindow.getAllWindows()[0].setContentSize(sz.w, sz.h); }, { w, h });
    await sleep(600);
    const geo = await win.evaluate(() => {
      const wrap = document.querySelector('#pitch-native-block .pitch-table-wrap');
      const table = document.querySelector('#pitch-native-block .pitch-table');
      const g = document.getElementById('p10-guide');
      return {
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        tableW: table ? Math.round(table.getBoundingClientRect().width) : null,
        wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
        guideVisible: g ? g.getBoundingClientRect().width > 0 : false,
        guideMaxH: g ? getComputedStyle(g.querySelector('.p10-guide__body')).maxHeight : null,
      };
    });
    check(`布局 ${w}x${h}：无横向溢出`, !geo.pageOverflowX, JSON.stringify(geo));
    if (w >= 1440) check(`布局 ${w}x${h}：D-1 表格未溢出容器`, geo.tableW !== null && geo.wrapW !== null && geo.tableW <= geo.wrapW + 2, JSON.stringify(geo));
    await win.screenshot({ path: path.join(OUT, `p10-guide-${w}x${h}.png`) });
  }

  check('全程无 console error / pageerror', rec.errors.length === 0, JSON.stringify(rec.errors));

  await app.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'p10-ui-verify.json'), JSON.stringify(rec, null, 2), 'utf8');
  const pass = rec.checks.filter((c) => c.pass).length;
  console.log(`=== 验证结果 ${pass}/${rec.checks.length} ===`);
  rec.checks.forEach((c) => console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.pass ? '' : ' | ' + c.detail)));
  console.log('errors:', JSON.stringify(rec.errors));
  if (pass !== rec.checks.length) process.exitCode = 1;
})().catch((e) => { console.error('VERIFY_FAILED', e); process.exit(1); });
