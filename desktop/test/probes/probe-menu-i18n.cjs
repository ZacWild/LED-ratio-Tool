/**
 * S10-R9 缺陷修复证据探针 · 原生菜单 i18n
 * ---------------------------------------------------------------------------
 * 验证四条断言（不属 desktop-suite 93 项，独立取证）：
 *   P1  默认（zh-CN）菜单四组为中文：文件/编辑/视图/帮助
 *   P2  LedI18N.setLocale('en-US') 后菜单即时切英文：File/Edit/View/Help
 *       且视图菜单动态项（布局档位前缀）同步英文
 *   P3  切语言后 settings.json 落盘 locale: 'en-US'（R1 真源）
 *   P4  重启后菜单冷启动即英文（主进程从 settings.json 读 locale）
 * 退出码：0 = 全部 PASS；1 = 任一 FAIL。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..', '..');
const SETTINGS = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
  'LED Ratio Tool',
  'settings.json',
);

function fail(msg) {
  console.error('[probe-menu-i18n] FAIL: ' + msg);
  process.exit(1);
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function readMenu(app) {
  return app.evaluate(async ({ Menu }) => {
    const m = Menu.getApplicationMenu();
    if (!m) return { groups: [], items: {} };
    const items = {};
    const walk = (list, prefix) => {
      for (const it of list) {
        if (it.id) items[prefix + it.id] = it.label;
        if (it.submenu) walk(it.submenu.items, prefix);
      }
    };
    walk(m.items, '');
    return { groups: m.items.map((g) => g.label), items };
  });
}

(async () => {
  let pw;
  try {
    pw = require('playwright');
  } catch (_) {
    pw = require('playwright-core');
  }
  const { _electron } = pw;

  /* ---------- P1 + P2 + P3：单次会话 ---------- */
  const app = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
  await app.evaluate(() => true);
  await new Promise((r) => setTimeout(r, 1200));

  // P1：显式归位 zh-CN（探针自包含，不受上次残留 locale 影响）后断言中文菜单
  const win = await app.firstWindow();
  await win.evaluate(() => window.LedI18N.setLocale('zh-CN'));
  await new Promise((r) => setTimeout(r, 800));

  const m1 = await readMenu(app);
  const zhOk = ['文件', '编辑', '视图', '帮助'].every((g) => m1.groups.includes(g));
  console.log('[probe-menu-i18n] P1 zh groups =', JSON.stringify(m1.groups), zhOk ? 'PASS' : 'FAIL');
  if (!zhOk) fail('P1 zh-CN 菜单不是中文四组');

  // 切语言必须走渲染层（window.LedI18N 在 renderer 上下文）
  await win.evaluate(() => window.LedI18N.setLocale('en-US'));
  await new Promise((r) => setTimeout(r, 800));

  const m2 = await readMenu(app);
  const enOk = ['File', 'Edit', 'View', 'Help'].every((g) => m2.groups.includes(g));
  const tierPrefix = m2.items['layout-tier'] || '';
  const tierOk = /^Layout tier:/.test(tierPrefix);
  console.log('[probe-menu-i18n] P2 en groups =', JSON.stringify(m2.groups), enOk ? 'PASS' : 'FAIL');
  console.log('[probe-menu-i18n] P2 layout-tier =', JSON.stringify(tierPrefix), tierOk ? 'PASS' : 'FAIL');
  if (!enOk) fail('P2 切英文后菜单未即时英文化');
  if (!tierOk) fail('P2 动态项布局档位前缀未英文化');

  await app.close();
  await new Promise((r) => setTimeout(r, 800));

  let onDisk = null;
  try {
    onDisk = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch (e) {
    fail('P3 settings.json 读取失败: ' + e.message);
  }
  const p3ok = onDisk && onDisk.locale === 'en-US';
  console.log('[probe-menu-i18n] P3 settings.json locale =', JSON.stringify(onDisk && onDisk.locale), p3ok ? 'PASS' : 'FAIL');
  if (!p3ok) fail('P3 settings.json 未落盘 locale=en-US');

  /* ---------- P4：重启冷启动 ---------- */
  const app2 = await _electron.launch({ args: [DESKTOP], cwd: DESKTOP, env: cleanEnv(), timeout: 60000 });
  await app2.evaluate(() => true);
  await new Promise((r) => setTimeout(r, 1200));
  const m3 = await readMenu(app2);
  const coldOk = ['File', 'Edit', 'View', 'Help'].every((g) => m3.groups.includes(g));
  console.log('[probe-menu-i18n] P4 cold-start groups =', JSON.stringify(m3.groups), coldOk ? 'PASS' : 'FAIL');
  await app2.close();
  if (!coldOk) fail('P4 重启后菜单冷启动未保持英文');

  console.log('[probe-menu-i18n] 4/4 PASS');
  process.exit(0);
})().catch((e) => fail('异常: ' + (e && e.message)));
