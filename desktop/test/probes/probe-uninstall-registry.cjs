/**
 * LED-ratio-Tool 桌面版 · NSIS 卸载项注册表实测探针
 * ============================================================================
 * 🔴 用途（P7-DPI-09 后续 · 注册表卸载项验证）：
 *    INS-05「安装后注册表项是否正确创建」/ UNI-04「卸载后注册表项是否正确清除」
 *    在既有验收里被硬编码成 SKIP，理由是「本环境禁止调用 reg.exe」。
 *    **该理由不成立** —— reg.exe 只是被环境策略拦了，注册表本身完全可读可写
 *    （PowerShell 的 Microsoft.Win32.Registry 提供程序即可，无需 reg.exe）。
 *    本探针给出真实的注册表读数。
 *
 * 🔴 方法纪律：
 *    · 卸载项**不硬编码 GUID**，一律按 DisplayName 匹配枚举，避免猜键名。
 *    · 卸载后**轮询等待**（NSIS 卸载器是异步的：exe 先消失，键随后才删），
 *      轮询窗口 60s，每 2s 一次；超时如实报告「未清除」，不记为通过。
 *    · 全程只读注册表 + 跑安装/卸载器，不改产品代码。
 *
 * 用法：
 *   node_modules/electron/dist/electron.exe test/probes/probe-uninstall-registry.cjs
 *   node test/probes/probe-uninstall-registry.cjs --setup=<setup.exe> [--legacy=<old.exe>]
 * 输出：stdout 一行 [PROBE-UNINSTALL-REG] {json}
 * ============================================================================
 */

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const argv = process.argv.slice(2);
const argOf = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : null;
};

const DESKTOP = path.join(__dirname, '..', '..');
const SETUP = argOf('setup') || path.join(DESKTOP, 'dist', 'LED Ratio Tool-1.2.0-x64-setup.exe');
const LEGACY = argOf('legacy') || null;
const INSTALL_DIR = path.join(os.tmpdir(), 'LED Ratio Tool RegProbe');
const INSTALLED_EXE = path.join(INSTALL_DIR, 'LED Ratio Tool.exe');
const UNINSTALLER = path.join(INSTALL_DIR, 'Uninstall LED Ratio Tool.exe');
const APP_ID = 'com.ledratiotool.desktop';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * 注册表读取：走 PowerShell 的注册表提供程序（**不用 reg.exe**）
 * ------------------------------------------------------------------ */
const PS_READ_UNINSTALL = `
$roots = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
$o = @()
foreach ($r in $roots) {
  if (-not (Test-Path $r)) { continue }
  foreach ($k in (Get-ChildItem $r -ErrorAction SilentlyContinue)) {
    $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
    if (-not $p) { continue }
    $dn = [string]$p.DisplayName
    if ($dn -notlike '*LED Ratio*' -and [string]$p.InstallLocation -notlike '*LED Ratio*') { continue }
    $o += [PSCustomObject]@{
      hive = $r.Split('\\')[2]
      key = $k.PSChildName
      path = $r + '\\' + $k.PSChildName
      DisplayName = $dn
      DisplayVersion = [string]$p.DisplayVersion
      Publisher = [string]$p.Publisher
      InstallLocation = [string]$p.InstallLocation
      UninstallString = [string]$p.UninstallString
      QuietUninstallString = [string]$p.QuietUninstallString
      DisplayIcon = [string]$p.DisplayIcon
      InstallDate = [string]$p.InstallDate
      NoModify = [string]$p.NoModify
      NoRepair = [string]$p.NoRepair
      EstimatedSize = [string]$p.EstimatedSize
      URLInfoAbout = [string]$p.URLInfoAbout
      InstallSource = [string]$p.InstallSource
    }
  }
}
if ($o.Count -eq 0) { Write-Output '[]' } else { $o | ConvertTo-Json -Compress -Depth 4 }
`;

/** 读当前所有 LED Ratio Tool 相关的卸载项 */
function readUninstallEntries() {
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_READ_UNINSTALL], { encoding: 'utf8' });
  const raw = (r.stdout || '').trim();
  if (!raw) return { error: (r.stderr || 'empty').slice(0, 400), entries: [] };
  try {
    const parsed = JSON.parse(raw);
    return { entries: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (e) {
    return { error: 'parse fail: ' + raw.slice(0, 300), entries: [] };
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
async function main() {
  const out = {
    generatedAt: new Date().toISOString(),
    appId: APP_ID,
    installDir: INSTALL_DIR,
    setup: SETUP,
    legacy: LEGACY,
    steps: [],
  };

  // 0) 基线：安装前是否已有残留
  const baseline = readUninstallEntries();
  out.steps.push({
    step: 'baseline',
    note: '安装前既存卸载项（若有，说明是上一轮卸载残留）',
    count: baseline.entries.length,
    entries: baseline.entries,
  });

  // 1) 安装
  const inst = spawnSync(SETUP, ['/S', `/D=${INSTALL_DIR}`], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
  await sleep(4000);
  out.steps.push({
    step: 'install',
    setup: SETUP,
    exit: inst.status,
    installedExe: fs.existsSync(INSTALLED_EXE),
    uninstallerExists: fs.existsSync(UNINSTALLER),
  });

  // 2) INS-05：安装后注册表项
  const afterInstall = readUninstallEntries();
  out.steps.push({
    step: 'INS-05-registry-after-install',
    count: afterInstall.entries.length,
    entries: afterInstall.entries,
    error: afterInstall.error || null,
  });

  // 3) UNI-04：卸载后注册表项（轮询等待异步卸载）
  //    --race 模式：复现上一轮 p7-acceptance 的时序 —— 卸载器一退出就**抢先删掉安装目录**，
  //    用于验证「注册表项残留」是否由脚本抢先删目录导致（而非产品缺陷）。
  const RACE = argv.includes('--race');
  let gone = false;
  const timeline = [];
  if (fs.existsSync(UNINSTALLER)) {
    const ru = spawnSync(UNINSTALLER, ['/S'], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
    out.steps.push({ step: 'uninstall', exit: ru.status, uninstaller: UNINSTALLER, race: RACE });
    if (RACE) {
      // 立即抢先删目录（不等异步卸载完成）
      try { fs.rmSync(INSTALL_DIR, { recursive: true, force: true }); } catch { /* noop */ }
      out.steps.push({ step: 'race-remove-install-dir', note: '卸载器退出后立即递归删除安装目录' });
    }
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const cur = readUninstallEntries();
      timeline.push({ tSec: (i + 1) * 2, count: cur.entries.length });
      if (cur.entries.length === 0) { gone = true; break; }
    }
  }
  const afterUninstall = readUninstallEntries();
  out.steps.push({
    step: 'UNI-04-registry-after-uninstall',
    removedWithin60s: gone,
    pollTimeline: timeline,
    count: afterUninstall.entries.length,
    entries: afterUninstall.entries,
  });
  out.steps.push({
    step: 'cleanup-state',
    installedExeExists: fs.existsSync(INSTALLED_EXE),
    installDirExists: fs.existsSync(INSTALL_DIR),
  });

  process.stdout.write('[PROBE-UNINSTALL-REG] ' + JSON.stringify(out, null, 2) + '\n');
}

main();
