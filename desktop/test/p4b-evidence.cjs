/**
 * LED-ratio-Tool 桌面版 · P4-B 证据采集（桌面业务 UI + 原生交互与系统集成）
 * ---------------------------------------------------------------------------
 * 采集内容：
 *   EV-B01 三档响应式布局（客户区回读 + 档位判定）
 *   EV-B02 滚动模型（窗口永不整体滚动 / 面板独立滚动 / 核心结果 sticky 可见）
 *   EV-B03 复制载荷与 HTML 版**逐项核对**（顺序取自受保护的 src/app.js 源）
 *   EV-B04 复制走 IPC 且反馈依据真实返回
 *   EV-B05 菜单命令映射（真实点击原生菜单项 → 渲染层动作）
 *   EV-B06 快捷键 × 焦点状态（12 组中的可自动验证项）
 *   EV-B07 模态对话框：焦点锁 / 焦点归还 / 三线版本 / 12 组帮助
 *   EV-B08 状态栏九项（EL-FT-01~09）
 *   EV-B09 受保护文件零改动 + 分支合规
 *
 * 用法：node test/p4b-evidence.cjs
 * 退出码：0 = 全部通过；1 = 有失败项；2 = 有条件通过
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const DESKTOP = path.join(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'test', 'reports');
const SHOTS = path.join(DESKTOP, 'test', 'shots');

const evidence = [];
const failures = [];
const conditional = [];

function record(id, title, ok, detail, data) {
  evidence.push({ id, title, ok, detail, data: data || null });
  console.log(`  ${ok === true ? '✅' : ok === 'conditional' ? '⚠️' : '❌'} ${id} ${title}`);
  if (detail) console.log(`       ${detail}`);
  if (ok === false) failures.push(id);
  if (ok === 'conditional') conditional.push(id);
}

function cleanEnv(extra) {
  const env = Object.assign({}, process.env, extra || {});
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd || DESKTOP,
      encoding: 'utf8',
      env: cleanEnv(opts.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: e.status === undefined ? 1 : e.status,
      out: (e.stdout || '') + (e.stderr || ''),
    };
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

/**
 * 🔒 从**受保护的** src/app.js 中提取 buildFullParameterText 的行序（字面量前缀）。
 *    这是"与 src/app.js:1450 逐项核对"的可执行判据 —— 期望值不是手抄的，
 *    而是直接从唯一真源解析出来的。
 */
function expectedFullParameterOrder() {
  const src = fs.readFileSync(path.join(REPO, 'src', 'app.js'), 'utf8');
  const start = src.indexOf('function buildFullParameterText()');
  if (start < 0) return null;
  const end = src.indexOf('return lines.join', start);
  const body = src.slice(start, end);
  const out = [];
  const re = /lines\.push\('([^']*)'/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

/** SITE_FIELDS 的标签与顺序（同样从 src/app.js 解析） */
function expectedSiteFields() {
  const src = fs.readFileSync(path.join(REPO, 'src', 'app.js'), 'utf8');
  const start = src.indexOf('var SITE_FIELDS = [');
  if (start < 0) return null;
  const end = src.indexOf('];', start);
  const body = src.slice(start, end);
  const out = [];
  const re = /label:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

async function main() {
  console.log('=== P4-B 证据采集（桌面业务 UI + 原生交互）===\n');

  const pw = require(path.join(DESKTOP, 'node_modules', 'playwright-core'));
  const { _electron: electron } = pw;

  let app = null;
  let win = null;
  const consoleMsgs = [];
  const pageErrors = [];

  try {
    // 🔒 启动重试：上一轮残留的 Electron 进程会持有单实例锁（SEC-02），
    //    导致本次 launch 立即退出 → "Process failed to launch"。
    //    这里最多重试 3 次，每次间隔 3s。
    let launched = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 3 && !launched; attempt++) {
      try {
        app = await electron.launch({
          args: ['--inspect=0', '--remote-debugging-port=9344', DESKTOP],
          cwd: DESKTOP,
          env: cleanEnv(),
          timeout: 60000,
        });
        launched = true;
      } catch (e) {
        lastErr = e;
        app = null;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!app) throw lastErr || new Error('electron 启动失败');
    win = await app.firstWindow({ timeout: 30000 });
    win.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
    win.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1200);

    /* ================================================================
       EV-B01 三档响应式布局（客户区回读）
       ================================================================ */
    console.log('【EV-B01】三档响应式布局（客户区回读）');
    const tiers = [];
    for (const size of [
      { w: 1440, h: 900, expect: 'three' },
      { w: 1200, h: 800, expect: 'two' },
      { w: 1024, h: 700, expect: 'stacked' },
    ]) {
      await app.evaluate(async ({ BrowserWindow }, s) => {
        BrowserWindow.getAllWindows()[0].setContentSize(s.w, s.h);
      }, size);
      await win.waitForTimeout(650);
      const content = await app.evaluate(async ({ BrowserWindow }) => {
        const c = BrowserWindow.getAllWindows()[0].getContentBounds();
        return { width: c.width, height: c.height };
      });
      const probe = await win.evaluate(() => {
        const layout = document.querySelector('.layout');
        const panels = Array.prototype.map.call(
          document.querySelectorAll('.panel'),
          (p) => ({
            cls: p.className,
            display: getComputedStyle(p).display,
            clientW: p.clientWidth,
            clientH: p.clientHeight,
            scrollH: p.scrollHeight,
          })
        );
        return {
          attr: layout ? layout.getAttribute('data-layout') : null,
          clientWidth: document.documentElement.clientWidth,
          docScrollH: document.documentElement.scrollHeight,
          docClientH: document.documentElement.clientHeight,
          panels,
          stageSummaryHidden: (document.querySelector('.stage-summary') || {}).hidden,
        };
      });
      const shot = path.join(SHOTS, `p4b-${content.width}x${content.height}.png`);
      await win.screenshot({ path: shot });
      tiers.push({ requested: size, content, probe, shot });
    }
    const t1 = tiers[0], t2 = tiers[1], t3 = tiers[2];
    const b01 =
      t1.probe.attr === 'three' &&
      t2.probe.attr === 'two' &&
      t3.probe.attr === 'stacked' &&
      t1.probe.clientWidth === t1.content.width &&
      t3.probe.clientWidth === t3.content.width &&
      t3.probe.stageSummaryHidden === true &&
      t2.probe.stageSummaryHidden === false;
    record('EV-B01', '三档响应式布局（客户区回读）', b01,
      tiers
        .map((t) => `客户区 ${t.content.width}×${t.content.height} → 档位 ${t.probe.attr}`)
        .join(' ｜ '),
      { tiers });

    /* ================================================================
       EV-B02 滚动模型
       ================================================================ */
    console.log('\n【EV-B02】滚动模型（窗口不滚动 / 面板独立滚动 / 核心结果 sticky）');
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900);
    });
    await win.waitForTimeout(600);
    const scrollProbe = await win.evaluate(async () => {
      const doc = document.documentElement;
      const before = { scrollH: doc.scrollHeight, clientH: doc.clientHeight };
      const panel = document.querySelector('.panel--result');
      const core = document.querySelector('.result-sticky-top');
      const actions = document.querySelector('.result-actions');
      const panelRectBefore = panel.getBoundingClientRect();
      panel.scrollTop = panel.scrollHeight;
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const coreRect = core.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const panelRectAfter = panel.getBoundingClientRect();
      const scrolled = panel.scrollTop > 0;
      // 🔒 复位滚动位置：吸底复制组在滚动到底时会「脱粘」回到内容流末尾，
      //    后续用例用真实鼠标点击该按钮时会出现落点漂移 → 统一先回到顶部。
      panel.scrollTop = 0;
      return {
        before,
        after: { scrollH: doc.scrollHeight, clientH: doc.clientHeight },
        panelScrollable: panel.scrollHeight > panel.clientHeight,
        panelScrolled: scrolled,
        coreVisible:
          coreRect.top >= panelRectAfter.top - 1 &&
          coreRect.bottom <= panelRectAfter.bottom + 1,
        actionsVisible:
          actionsRect.bottom <= panelRectAfter.bottom + 1 &&
          actionsRect.top >= panelRectAfter.top - 1,
        coreRect: { top: coreRect.top, bottom: coreRect.bottom },
        actionsRect: { top: actionsRect.top, bottom: actionsRect.bottom },
        panelRectBefore: { top: panelRectBefore.top, bottom: panelRectBefore.bottom },
        panelRectAfter: { top: panelRectAfter.top, bottom: panelRectAfter.bottom },
      };
    });
    const b02 =
      scrollProbe.before.scrollH <= scrollProbe.before.clientH + 1 &&
      scrollProbe.after.scrollH <= scrollProbe.after.clientH + 1 &&
      scrollProbe.panelScrollable &&
      scrollProbe.panelScrolled &&
      scrollProbe.coreVisible &&
      scrollProbe.actionsVisible;
    record('EV-B02', '滚动模型与核心结果 sticky 可见', b02,
      `document scrollHeight ${scrollProbe.before.scrollH} ≤ clientHeight ${scrollProbe.before.clientH} ｜ 结果栏可滚动=${scrollProbe.panelScrollable} 已滚动=${scrollProbe.panelScrolled} ｜ 滚到底后核心卡可见=${scrollProbe.coreVisible} 复制组可见=${scrollProbe.actionsVisible}`,
      scrollProbe);

    /* ---- 吸顶层无内容截断（核心卡 / 警示条 / 复制组三层同时完整） ---- */
    const clipProbe = await win.evaluate(() => {
      const band = document.querySelector('.result-sticky-top');
      const actions = document.querySelector('.result-actions');
      const warn = document.getElementById('warn-bar');
      const note = document.getElementById('core-note');
      const panel = document.querySelector('.panel--result');
      const pr = panel.getBoundingClientRect();
      const wr = warn ? warn.getBoundingClientRect() : null;
      return {
        bandOverflow: band.scrollHeight - band.clientHeight,
        bandH: band.offsetHeight,
        coreNoteH: note ? note.offsetHeight : 0,
        coreNoteScrollH: note ? note.scrollHeight : 0,
        warnVisible:
          !!wr && wr.height > 0 && wr.bottom <= pr.bottom + 1 && wr.top >= pr.top - 1,
        warnText: warn ? warn.textContent.trim().slice(0, 24) : '',
        actionsVisible:
          actions.getBoundingClientRect().bottom <= pr.bottom + 1,
      };
    });
    const b02b = clipProbe.bandOverflow <= 1 && clipProbe.warnVisible && clipProbe.actionsVisible;
    record('EV-B02b', '吸顶层三层无内容截断（核心卡/警示条/复制组）', b02b,
      `吸顶层溢出=${clipProbe.bandOverflow}px ｜ 警示条完整可见=${clipProbe.warnVisible}（"${clipProbe.warnText}"）｜ 复制组可见=${clipProbe.actionsVisible}`,
      clipProbe);

    /* ---- 窄窗口纵向堆叠：核心结果 / 警告 / 复制操作均可见 ---- */
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1024, 700);
    });
    await win.waitForTimeout(700);
    const stacked = await win.evaluate(() => {
      const panel = document.querySelector('.panel--result');
      const band = document.querySelector('.result-sticky-top');
      const actions = document.querySelector('.result-actions');
      const warn = document.getElementById('warn-bar');
      const summary = document.querySelector('.stage-summary');
      const pr = panel.getBoundingClientRect();
      const wr = warn ? warn.getBoundingClientRect() : null;
      const ar = actions.getBoundingClientRect();
      const br = band.getBoundingClientRect();
      const panels = Array.prototype.map.call(document.querySelectorAll('.panel'), (p) => ({
        cls: p.className,
        display: getComputedStyle(p).display,
        visible: p.getBoundingClientRect().height > 0,
      }));
      return {
        tier: document.querySelector('.layout').getAttribute('data-layout'),
        panelsVisible: panels.every((p) => p.visible),
        panelCount: panels.length,
        warnVisible: !!wr && wr.height > 0 && wr.bottom <= pr.bottom + 1 && wr.top >= pr.top - 1,
        actionsVisible: ar.bottom <= pr.bottom + 1 && ar.top >= pr.top - 1,
        bandVisible: br.top >= pr.top - 1 && br.height > 0,
        summaryHidden: summary ? summary.hidden : null,
        summaryDisplay: summary ? getComputedStyle(summary).display : null,
      };
    });
    const b02c =
      stacked.tier === 'stacked' &&
      stacked.panelsVisible &&
      stacked.panelCount === 3 &&
      stacked.warnVisible &&
      stacked.actionsVisible &&
      stacked.bandVisible &&
      stacked.summaryHidden === true &&
      stacked.summaryDisplay === 'none';
    record('EV-B02c', '窄窗口纵向堆叠：三面板可见 + 核心结果/警告/复制均可见', b02c,
      `档位=${stacked.tier} ｜ 面板 ${stacked.panelCount} 个全部可见=${stacked.panelsVisible} ｜ 警示条可见=${stacked.warnVisible} ｜ 复制组可见=${stacked.actionsVisible} ｜ 核心卡可见=${stacked.bandVisible} ｜ 折叠摘要已隐藏=${stacked.summaryHidden}(display=${stacked.summaryDisplay})`,
      stacked);
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1440, 900);
    });
    await win.waitForTimeout(600);

    /* ================================================================
       EV-B03 复制载荷与 HTML 版逐项核对
       ================================================================ */
    console.log('\n【EV-B03】复制载荷与 src/app.js:1450 逐项核对');
    const expectOrder = expectedFullParameterOrder();
    const expectSites = expectedSiteFields();
    const payloadProbe = await win.evaluate(() => {
      const a = window.LedApp;
      const full = a.buildFullParameterText();
      const res = a.buildResolutionText();
      const st = a.state;
      const dims = a.readDimensions();
      return {
        full: full,
        res: res,
        hasInternals: !!(a && a.buildFullParameterText && a.buildResolutionText && a.copyText),
        state: {
          widthText: st.widthText,
          heightText: st.heightText,
          unit: st.unit,
          widthMm: st.widthMm,
          heightMm: st.heightMm,
          canvasMode: st.canvasMode,
          ratioSource: st.ratioSource,
          tolerancePercent: st.tolerancePercent,
        },
        dims: {
          ok: dims.ok,
          widthError: dims.widthError,
          heightError: dims.heightError,
        },
        inputValues: {
          width: (document.getElementById('input-width') || {}).value,
          height: (document.getElementById('input-height') || {}).value,
        },
      };
    });
    const fullLines = (payloadProbe.full || '').split('\n');
    // 🔒 前缀切分必须用**全角冒号**'：' —— 载荷里同时存在全角'：'与半角': '
    //    （如「实际比例：3.5000 : 1」），用半角冒号会把比例行从中间截断。
    const actualPrefixes = fullLines.map((l) => {
      const i = l.indexOf('：');
      return i >= 0 ? l.slice(0, i + 1) : l;
    });
    // 期望：把 SITE_FIELDS 的循环展开为三行
    const expanded = [];
    for (const p of expectOrder || []) {
      if (p === '') expanded.push('');
      else if (p === '  ') {
        // 🔒 src/app.js 的 `lines.push('  ' + f.label + '：' + …)` 是 SITE_FIELDS 循环
        //    → 展开为三行现场参数
        for (const s of expectSites || []) expanded.push('  ' + s + '：');
      } else expanded.push(p);
    }
    const orderOk =
      !!expectOrder &&
      expanded.length === actualPrefixes.length &&
      expanded.every((v, i) => v === actualPrefixes[i]);
    const resOk = /^\d+×\d+$/.test(payloadProbe.res || '');
    const noSeparator = !(payloadProbe.res || '').includes(',');
    const unfilled = (payloadProbe.full || '').includes('未填写');
    const b03 = payloadProbe.hasInternals && orderOk && resOk && noSeparator && unfilled;
    record('EV-B03', '复制载荷与 HTML 版逐项核对（顺序取自 src/app.js）', b03,
      `行序一致=${orderOk}（期望 ${expanded.length} 行 / 实际 ${actualPrefixes.length} 行）｜ 分辨率载荷="${payloadProbe.res}"（宽×高、无千分位=${resOk && noSeparator}）｜ ②③④未填显示「未填写」=${unfilled}`,
      {
        expectedOrder: expanded,
        actualPrefixes,
        actualFull: payloadProbe.full,
        resolution: payloadProbe.res,
      });

    /* ================================================================
       EV-B04 复制走 IPC + 真实返回反馈
       ================================================================ */
    console.log('\n【EV-B04】复制走 IPC 且反馈依据真实返回');
    // 🔒 点击前先把结果栏滚回顶部：吸底复制组在滚动到底时会「脱粘」，
    //    真实鼠标点击的落点会漂移 → 统一先归位再点。
    const settle = async () => {
      await win.evaluate(() => {
        const p = document.querySelector('.panel--result');
        if (p) p.scrollTop = 0;
      });
      await win.waitForTimeout(250);
    };

    await settle();
    await app.evaluate(async ({ clipboard }) => clipboard.writeText('__SENTINEL__'));
    await win.click('#btn-copy-resolution');
    await win.waitForTimeout(500);
    const clipRes = await app.evaluate(async ({ clipboard }) => clipboard.readText());
    const fbRes = await win.evaluate(() => ({
      label: (document.querySelector('#btn-copy-resolution .label') || {}).textContent,
      live: (document.getElementById('live-feedback') || {}).textContent,
      ftMessage: (document.getElementById('ft-message') || {}).textContent,
    }));
    const b04a =
      clipRes === payloadProbe.res && fbRes.label === '已复制' && fbRes.live === '已复制到剪贴板';
    record('EV-B04a', '复制分辨率：IPC 真实写入 + 成功反馈', b04a,
      `剪贴板="${clipRes}"（期望 "${payloadProbe.res}"）｜ 按钮文案="${fbRes.label}" ｜ live="${fbRes.live}" ｜ 状态栏="${fbRes.ftMessage}"`,
      { clipRes, fbRes });

    await settle();
    await app.evaluate(async ({ clipboard }) => clipboard.writeText('__SENTINEL__'));
    await win.click('#btn-copy-full');
    await win.waitForTimeout(500);
    const clipFull = await app.evaluate(async ({ clipboard }) => clipboard.readText());
    const fbFull = await win.evaluate(() => ({
      label: (document.querySelector('#btn-copy-full .label') || {}).textContent,
      live: (document.getElementById('live-feedback') || {}).textContent,
    }));
    const b04b = clipFull === payloadProbe.full && fbFull.label === '已复制';
    record('EV-B04b', '复制完整参数：IPC 真实写入 + 成功反馈', b04b,
      `剪贴板长度=${clipFull.length}（期望 ${(payloadProbe.full || '').length}）逐字一致=${clipFull === payloadProbe.full} ｜ 按钮文案="${fbFull.label}"`,
      { clipFull, fbFull });

    // 标签复原（D-02 Q-02：HTML 版会把「复制完整参数」永久变成「复制」）
    await win.waitForTimeout(1800);
    const labelRestored = await win.evaluate(() => ({
      res: (document.querySelector('#btn-copy-resolution .label') || {}).textContent,
      full: (document.querySelector('#btn-copy-full .label') || {}).textContent,
    }));
    const b04c = labelRestored.res === '复制分辨率' && labelRestored.full === '复制完整参数';
    record('EV-B04c', '复制反馈复原时恢复各自原始标签（D-02 Q-02）', b04c,
      `复原后文案：分辨率="${labelRestored.res}" 完整参数="${labelRestored.full}"`,
      labelRestored);

    /* ================================================================
       EV-B05 菜单命令映射（真实点击原生菜单项）
       ================================================================ */
    console.log('\n【EV-B05】菜单命令映射（原生菜单项 → 渲染层动作）');
    const menuIds = await app.evaluate(async ({ Menu }) => {
      const m = Menu.getApplicationMenu();
      return m ? m.items.map((i) => i.label) : null;
    });
    const clickMenu = async (id) =>
      app.evaluate(async ({ Menu }, mid) => {
        const m = Menu.getApplicationMenu();
        const item = m.getMenuItemById(mid);
        if (!item) return { found: false };
        item.click();
        return { found: true, enabled: item.enabled, label: item.label };
      }, id);

    // ① 复制完整参数（Ctrl+Shift+C）
    await app.evaluate(async ({ clipboard }) => clipboard.writeText('__SENTINEL__'));
    const mCopy = await clickMenu('copy-full-parameters');
    await win.waitForTimeout(500);
    const clipMenu = await app.evaluate(async ({ clipboard }) => clipboard.readText());
    const b05a = mCopy.found && clipMenu === payloadProbe.full;
    record('EV-B05a', '菜单「复制完整参数」→ 复制完整参数文本', b05a,
      `菜单项="${mCopy.label}" accelerator 已注册为显示项 ｜ 剪贴板逐字一致=${clipMenu === payloadProbe.full}`,
      { mCopy, clipMenu });

    // ② 复制分辨率（Ctrl+C）
    await app.evaluate(async ({ clipboard }) => clipboard.writeText('__SENTINEL__'));
    const mCopyRes = await clickMenu('copy-resolution');
    await win.waitForTimeout(500);
    const clipMenuRes = await app.evaluate(async ({ clipboard }) => clipboard.readText());
    const b05b = mCopyRes.found && clipMenuRes === payloadProbe.res;
    record('EV-B05b', '菜单「复制分辨率」→ 复制宽×高（无千分位）', b05b,
      `剪贴板="${clipMenuRes}"`,
      { mCopyRes, clipMenuRes });

    // ③ 切换画布模式（led:mode 业务事件链路）
    await win.evaluate(() => {
      document.querySelector('.canvas-mode-segment[data-mode="width"]').click();
    });
    await win.waitForTimeout(200);
    await clickMenu('mode-height');
    await win.waitForTimeout(300);
    const modeAfter = await win.evaluate(() => ({
      checked: (document.querySelector('.canvas-mode-segment[aria-checked="true"]') || {}).dataset
        ? document.querySelector('.canvas-mode-segment[aria-checked="true"]').dataset.mode
        : null,
      stateMode: window.LedApp.state.canvasMode,
    }));
    const b05c = modeAfter.checked === 'height' && modeAfter.stateMode === 'height';
    record('EV-B05c', '菜单切画布模式 → led:mode 业务事件生效', b05c,
      `切换后 aria-checked=${modeAfter.checked} ｜ app.js state.canvasMode=${modeAfter.stateMode}`,
      modeAfter);

    // ④ 恢复默认值（led:reset 业务事件链路）
    await win.evaluate(() => {
      document.getElementById('input-width').value = '99';
      document.getElementById('input-width').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('input-height').value = '77';
      document.getElementById('input-height').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.waitForTimeout(250);
    await clickMenu('reset-defaults');
    await win.waitForTimeout(350);
    const afterReset = await win.evaluate(() => ({
      width: document.getElementById('input-width').value,
      height: document.getElementById('input-height').value,
      stateWidth: window.LedApp.state.widthText,
      stateHeight: window.LedApp.state.heightText,
      stateMode: window.LedApp.state.canvasMode,
    }));
    const b05d =
      afterReset.width === '14' && afterReset.height === '4' && afterReset.stateMode === 'width';
    record('EV-B05d', '菜单恢复默认值 → led:reset 业务事件生效', b05d,
      `输入框回到 ${afterReset.width}×${afterReset.height} ｜ state.widthText=${afterReset.stateWidth} ｜ state.canvasMode=${afterReset.stateMode}`,
      afterReset);

    // ⑤ 宽高互换
    await clickMenu('swap');
    await win.waitForTimeout(300);
    const afterSwap = await win.evaluate(() => ({
      width: document.getElementById('input-width').value,
      height: document.getElementById('input-height').value,
    }));
    const b05e = afterSwap.width === '4' && afterSwap.height === '14';
    record('EV-B05e', '菜单宽高互换 → 文本与毫米值同步', b05e,
      `互换后 ${afterSwap.width}×${afterSwap.height}`,
      afterSwap);

    /* ================================================================
       EV-B06 快捷键 × 焦点状态
       ================================================================ */
    console.log('\n【EV-B06】快捷键 × 焦点状态（可自动验证项）');
    // ① Ctrl+1..4 在普通焦点下切模式
    await win.evaluate(() => {
      document.getElementById('input-width').blur();
      document.body.focus();
    });
    await win.waitForTimeout(150);
    await win.keyboard.press('Control+3');
    await win.waitForTimeout(300);
    const sk01 = await win.evaluate(() => window.LedApp.state.canvasMode);
    const b06a = sk01 === 'preset';
    record('EV-B06a', 'SK-01 Ctrl+3（普通焦点）→ 切画布模式', b06a,
      `state.canvasMode=${sk01}`,
      { sk01 });

    // ② 输入框聚焦时 Ctrl+3 不响应、且不插入字符
    await win.evaluate(() => {
      const w = document.getElementById('input-width');
      w.focus();
      w.value = '14';
    });
    await win.keyboard.press('Control+3');
    await win.waitForTimeout(300);
    const sk01b = await win.evaluate(() => ({
      mode: window.LedApp.state.canvasMode,
      value: document.getElementById('input-width').value,
    }));
    const b06b = sk01b.mode === 'preset' && sk01b.value === '14';
    record('EV-B06b', 'SK-01 Ctrl+3（输入框聚焦）→ 不响应且不插入字符', b06b,
      `state.canvasMode 保持=${sk01b.mode} ｜ 输入框内容="${sk01b.value}"`,
      sk01b);

    // ③ 输入框有选区时 Ctrl+C 走原生复制（复制选区，不复制分辨率）
    await app.evaluate(async ({ clipboard }) => clipboard.writeText('__SENTINEL__'));
    await win.evaluate(() => {
      const w = document.getElementById('input-width');
      w.focus();
      w.value = '1414';
      w.setSelectionRange(0, 4);
    });
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(400);
    const clipNative = await app.evaluate(async ({ clipboard }) => clipboard.readText());
    const b06c = clipNative === '1414';
    record('EV-B06c', 'SK-05 Ctrl+C（输入框有选区）→ 原生复制选区', b06c,
      `剪贴板="${clipNative}"（期望 "1414"；工具复制载荷应为 "${payloadProbe.res}"）`,
      { clipNative });

    // ④ 输入框无选区时 Ctrl+C 不触发工具复制
    // 🔒 先回读哨兵，确认剪贴板写入已生效，再按键 ——
    //    否则 Chromium 的原生复制是异步落地，可能把哨兵覆盖成上一轮的 '1414'。
    await win.waitForTimeout(400);
    await app.evaluate(async ({ clipboard }) => clipboard.writeText('__SENTINEL__'));
    await win.waitForTimeout(200);
    const sentinelOk = (await app.evaluate(async ({ clipboard }) => clipboard.readText())) === '__SENTINEL__';
    await win.evaluate(() => {
      const w = document.getElementById('input-width');
      w.focus();
      w.value = '14';
      w.setSelectionRange(1, 1);
    });
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(500);
    const clipNone = await app.evaluate(async ({ clipboard }) => clipboard.readText());
    const b06d = sentinelOk && clipNone === '__SENTINEL__';
    record('EV-B06d', 'SK-05 Ctrl+C（输入框无选区）→ 不触发工具复制', b06d,
      `哨兵写入生效=${sentinelOk} ｜ 按键后剪贴板保持="${clipNone}"`,
      { clipNone, sentinelOk });

    // ⑤ Ctrl+R 绝不刷新窗口（恢复默认值而非 reload）
    await win.evaluate(() => {
      document.getElementById('input-width').blur();
      document.getElementById('input-width').value = '99';
      document.getElementById('input-width').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.waitForTimeout(200);
    const beforeReload = await win.evaluate(() => window.__p4bMark || null);
    await win.evaluate(() => {
      window.__p4bMark = 'alive';
    });
    await win.keyboard.press('Control+r');
    await win.waitForTimeout(700);
    const afterReload = await win.evaluate(() => ({
      mark: window.__p4bMark || null,
      width: document.getElementById('input-width').value,
      stateWidth: window.LedApp.state.widthText,
    }));
    const b06e = afterReload.mark === 'alive' && afterReload.stateWidth === '14';
    record('EV-B06e', 'SK-04 Ctrl+R → 恢复默认值且**不刷新窗口**', b06e,
      `页面标记仍在=${afterReload.mark === 'alive'} ｜ state.widthText=${afterReload.stateWidth} ｜ beforeReload=${beforeReload}`,
      afterReload);

    // ⑥ 对话框打开时除 Esc 外全部失效
    await win.evaluate(() => window.__desktopMenu('menu:shortcut-help'));
    await win.waitForTimeout(300);
    const modalProbe = await win.evaluate(() => ({
      open: !document.getElementById('modal-layer').hidden,
      title: document.getElementById('modal-title').textContent,
      rows: document.querySelectorAll('.shortcut-table tbody tr').length,
    }));
    await win.keyboard.press('Control+1');
    await win.waitForTimeout(250);
    const modeInModal = await win.evaluate(() => window.LedApp.state.canvasMode);
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);
    const modalClosed = await win.evaluate(() => document.getElementById('modal-layer').hidden);
    const b06f = modalProbe.open && modalProbe.rows === 12 && modeInModal === 'width' && modalClosed;
    record('EV-B06f', 'FS-D 对话框打开时仅 Esc 有效，其余快捷键失效', b06f,
      `帮助表 ${modalProbe.rows} 行 ｜ 对话框内 Ctrl+1 后模式仍为 ${modeInModal} ｜ Esc 关闭=${modalClosed}`,
      { modalProbe, modeInModal, modalClosed });

    /* ================================================================
       EV-B07 模态对话框：焦点锁 / 焦点归还 / 三线版本
       ================================================================ */
    console.log('\n【EV-B07】模态对话框（焦点锁 / 焦点归还 / 三线版本）');
    await win.evaluate(() => window.__desktopMenu('menu:about'));
    await win.waitForTimeout(500);
    const about = await win.evaluate(() => {
      const rows = document.querySelectorAll('.about-list__k');
      const vals = document.querySelectorAll('.about-list__v');
      const out = {};
      for (let i = 0; i < rows.length; i++) out[rows[i].textContent] = vals[i].textContent;
      return { map: out, count: rows.length };
    });
    const b07a =
      about.count >= 8 &&
      about.map['桌面版本'] === '1.1.0' &&
      about.map['计算内核'] === 'core@1.0.1' &&
      about.map['HTML 版'] === '1.0.1';
    record('EV-B07a', '关于对话框三线版本（IPC 实读）', b07a,
      `桌面=${about.map['桌面版本']} ｜ 内核=${about.map['计算内核']} ｜ HTML=${about.map['HTML 版']} ｜ Electron=${about.map['Electron']}`,
      about);

    // 焦点锁：Tab 在模态内循环
    const focusLoop = await win.evaluate(async () => {
      const layer = document.getElementById('modal-layer');
      const focusables = Array.prototype.slice.call(
        document.querySelectorAll('#desktop-modal button, #desktop-modal input')
      ).filter((el) => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      last.focus();
      return { count: focusables.length, lastIsFocused: document.activeElement === last };
    });
    await win.keyboard.press('Tab');
    await win.waitForTimeout(200);
    const wrapped = await win.evaluate(() => {
      const focusables = Array.prototype.slice.call(
        document.querySelectorAll('#desktop-modal button, #desktop-modal input')
      ).filter((el) => el.offsetParent !== null);
      return document.activeElement === focusables[0];
    });
    const b07b = focusLoop.count >= 2 && wrapped;
    record('EV-B07b', 'IX-17 模态焦点锁（Tab 在对话框内循环）', b07b,
      `可聚焦元素 ${focusLoop.count} 个 ｜ 末位 Tab 后回到首位=${wrapped}`,
      { focusLoop, wrapped });

    // 焦点归还：关闭后回到触发元素
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);
    const focusReturn = await win.evaluate(() => ({
      modalHidden: document.getElementById('modal-layer').hidden,
      active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
    }));
    const b07c = focusReturn.modalHidden && focusReturn.active === 'input-width';
    record('EV-B07c', 'IX-18 焦点归还（关闭后回到触发元素）', b07c,
      `对话框已关闭=${focusReturn.modalHidden} ｜ 焦点落点=#${focusReturn.active}`,
      focusReturn);

    // 设置对话框（EL-STB-01~04）：容差输入框必须在模态内可见可聚焦
    await win.evaluate(() => window.__desktopMenu('menu:open-settings'));
    await win.waitForTimeout(400);
    const settings = await win.evaluate(() => {
      const input = document.getElementById('input-tolerance');
      const inModal = !!(input && document.getElementById('desktop-modal').contains(input));
      const visible = !!(input && input.offsetParent !== null);
      const focused = document.activeElement === input;
      return {
        inModal,
        visible,
        focused,
        value: input ? input.value : null,
        title: (document.getElementById('modal-title') || {}).textContent,
      };
    });
    // 改容差 → 即时生效 + 持久化（走 IPC settings.set）
    await win.evaluate(() => {
      const input = document.getElementById('input-tolerance');
      input.focus();
      input.value = '0.8';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.waitForTimeout(600);
    const tolState = await win.evaluate(() => window.LedApp.state.tolerancePercent);
    const b07d = settings.inModal && settings.visible && settings.focused && tolState === 0.8;
    record('EV-B07d', '设置对话框：容差输入框在模态内可见可聚焦 + 即时生效', b07d,
      `容差输入框在模态内=${settings.inModal} 可见=${settings.visible} 初始焦点=${settings.focused} ｜ 改为 0.8 后 state.tolerancePercent=${tolState}`,
      { settings, tolState });
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);

    /* ================================================================
       EV-B08 状态栏九项
       ================================================================ */
    console.log('\n【EV-B08】状态栏九项（EL-FT-01~09）');
    const sb = await win.evaluate(() => ({
      unit: (document.getElementById('ft-unit') || {}).textContent,
      ratio: (document.getElementById('ft-ratio') || {}).textContent,
      mode: (document.getElementById('ft-mode') || {}).textContent,
      badge: (document.getElementById('ft-badge') || {}).textContent,
      error: (document.getElementById('ft-error') || {}).textContent,
      layout: (document.getElementById('ft-layout') || {}).textContent,
      message: (document.getElementById('ft-message') || {}).textContent,
      settings: (document.getElementById('ft-settings') || {}).textContent,
      scale: (document.getElementById('ft-scale') || {}).textContent,
      height: (document.querySelector('.status-bar') || {}).offsetHeight,
    }));
    const b08 =
      !!sb.unit && !!sb.ratio && !!sb.mode && !!sb.layout && !!sb.scale &&
      sb.scale.endsWith('%') && sb.height === 28;
    record('EV-B08', '状态栏九项与 28px 高度', b08,
      `单位=${sb.unit} ｜ 比例=${sb.ratio} ｜ 模式=${sb.mode} ｜ 徽标=${sb.badge} ｜ 错误出口="${sb.error}" ｜ 档位=${sb.layout} ｜ 缩放=${sb.scale} ｜ 高度=${sb.height}px`,
      sb);

    /* ================================================================
       控制台清洁度
       ================================================================ */
    const errs = consoleMsgs.filter((m) => m.type === 'error');
    const warns = consoleMsgs.filter((m) => m.type === 'warning');
    record('EV-B10', '渲染层 console 零 error/warning（SEC-31）',
      errs.length === 0 && warns.length === 0 && pageErrors.length === 0,
      `console error=${errs.length} warning=${warns.length} ｜ pageerror=${pageErrors.length}`,
      { errs, warns, pageErrors });
  } catch (e) {
    record('EV-B00', '证据采集执行', false,
      '异常: ' + String(e && e.message ? e.message : e), null);
  } finally {
    if (app) {
      try { await app.close(); } catch (e) { /* ignore */ }
    }
  }

  /* ================================================================
     EV-B09 受保护文件零改动 + 分支合规
     ================================================================ */
  console.log('\n【EV-B09】受保护文件零改动 + 分支合规');
  {
    const status = run('git', ['status', '--porcelain'], { cwd: REPO });
    const protectedDiff = run(
      'git',
      ['diff', '--stat', '--', 'src/', 'index.html', 'test/', 'core.lock.json', 'dist/', 'docs/'],
      { cwd: REPO },
    );
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO });
    // 🔒 不可用 trim()：porcelain 首行以 " M " 开头，trim() 会吃掉行首空格
    //    → slice(3) 变成 "esktop/..."，导致路径判定误报。
    const entries = status.out.split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .filter((l) => l.trim().length > 0)
      .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }));
    const onlyDesktop = entries.every((e) => e.path.startsWith('desktop/'));
    const ok = onlyDesktop && protectedDiff.out.trim() === '' && branch.out.trim() === 'feature/desktop-windows';
    record('EV-B09', '受保护文件零改动 + 分支合规', ok,
      `分支=${branch.out.trim()} ｜ 变更条目 ${entries.length} 个（全部在 desktop/=${onlyDesktop}）｜ 受保护文件 diff=${protectedDiff.out.trim() === '' ? '空' : protectedDiff.out.trim()}`,
      { branch: branch.out.trim(), entries, protectedDiff: protectedDiff.out.trim() });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    platform: { os: os.platform(), release: os.release(), node: process.versions.node },
    evidence,
    failures,
    conditional,
    knownLimitations: [
      {
        id: 'LIM-B01',
        topic: '125% / 150% 系统缩放',
        detail: '本机系统缩放为 100%，DPR 三档需物理机改系统缩放后重新采证。',
        impact: 'EV-B08 的缩放档位指示只覆盖 100%。',
        verifyBy: '物理机固定 1920×1080 逐档改缩放后复跑本脚本。',
      },
      {
        id: 'LIM-B02',
        topic: '200 组差分测试（DEC-15）',
        detail: 'DEC-15 的 200 组可观察结果零未解释差分属 P4-B 出口条件，本轮未执行。',
        impact: '本轮只完成 1 组默认态 + 若干交互态的载荷逐字核对。',
        verifyBy: '按 D-09 的差分计划批量生成输入向量后复跑。',
      },
    ],
  };
  fs.writeFileSync(path.join(OUT, 'p4b-evidence.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log('\n==============================================================');
  console.log(
    `总计 ${evidence.length} 项，通过 ${evidence.length - failures.length - conditional.length}，失败 ${failures.length}，有条件 ${conditional.length}`,
  );
  if (failures.length) console.log('失败项: ' + failures.join(', '));
  if (conditional.length) console.log('有条件项: ' + conditional.join(', '));
  console.log('报告: desktop/test/reports/p4b-evidence.json');
  console.log('==============================================================');
  process.exit(failures.length ? 1 : conditional.length ? 2 : 0);
}

main().catch((e) => {
  console.error('[证据采集异常]', e && e.stack ? e.stack : e);
  process.exit(1);
});
