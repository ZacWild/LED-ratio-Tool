/**
 * LED-ratio-Tool 桌面版 · 系统 DPI 档位切换辅助（仅取证用）
 * ============================================================================
 * 🔴 用途：P7-DPI-09 Remediation 的真实 DPI 验收需要切换 Windows 系统缩放档。
 *    本脚本提供两条**真实生效**的路径，并在每一步输出**可核对的证据**：
 *
 *    路径 A：`SPI_SETLOGICALDPIOVERRIDE`（进程/系统级 DPI 覆盖）
 *      - index 0 = 关闭覆盖（恢复默认）
 *      - index 1 = 96 DPI (100%)
 *      - index 2 = 120 DPI (125%)
 *      - index 3 = 144 DPI (150%)
 *      - index 4 = 192 DPI (200%)
 *      ⚠️ Windows 对 index 2/3/4 常回落（实测只到 125%），回落时脚本**如实报告**，
 *         绝不谎报生效。
 *
 *    路径 B：注册表 `HKCU\Control Panel\Desktop\PerMonitorSettings\<id>\DpiValue`
 *      - DpiValue = 0/1/2/3/4/5 → 100%/125%/150%/175%/200%/225%
 *      ⚠️ Win11 上写入后**通常需要注销重登**才生效；本脚本写入后会读回，
 *         并明确标注「已写入 / 已生效」两种状态的区别。
 *
 * 🔴 坐标/缩放纪律：这里只做**系统 API 层**的操作，绝不碰页面 zoomFactor、
 *    Electron zoomFactor、Playwright deviceScaleFactor、CDP 设备模拟。
 *    唯一生效判据 = **新进程**读到的 `GetDpiForSystem()` 与 Electron 的
 *    `display.scaleFactor` / `devicePixelRatio`。
 *
 * 用法：
 *   node test/dpi-switch.cjs --index=2          # 切到 125%
 *   node test/dpi-switch.cjs --index=0          # 关闭覆盖，恢复默认
 *   node test/dpi-switch.cjs --registry=2       # 写注册表 DpiValue=2（150%）
 *   node test/dpi-switch.cjs --reset-registry    # 还原注册表三档 DpiValue
 *   node test/dpi-switch.cjs --verify            # 只读，回报当前真实状态
 * ============================================================================
 */

'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
const has = (name) => argv.includes(`--${name}`);

/* ------------------------------------------------------------------ *
 * 1. 用 PowerShell 调 Win32 API：读 DPI、设 DPI 覆盖、读注册表
 * ------------------------------------------------------------------ */

/** 读**新进程**的 GetDpiForSystem（必须是新进程，既有进程读到的是陈旧值） */
function readSystemDpi() {
  const ps = `$sig = @'
using System;
using System.Runtime.InteropServices;
public class DpiNative {
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
  [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr hdc, int index);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, IntPtr c, uint d);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
$hdc = [DpiNative]::GetDC([IntPtr]::Zero)
$dpi = [DpiNative]::GetDeviceCaps($hdc, 88)
[void][DpiNative]::ReleaseDC([IntPtr]::Zero, $hdc)
Write-Output $dpi`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  const n = Number(out);
  return Number.isFinite(n) ? n : null;
}

/** 设置 DPI 逻辑覆盖（index 0=关闭, 1=96, 2=120, 3=144, 4=192） */
function setLogicalDpiOverride(index) {
  const ps = `$sig = @'
using System;
using System.Runtime.InteropServices;
public class DpiNative2 {
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, IntPtr c, uint d);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
$ok = [DpiNative2]::SystemParametersInfo(0x009F, $index, [IntPtr]::Zero, 0)
Write-Output $ok`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  return (r.stdout || '').trim().toLowerCase() === 'true';
}

/** 读注册表三档 PerMonitorSettings 的 DpiValue */
function readRegistryDpiValues() {
  const ps = `$base = 'HKCU:\\Control Panel\\Desktop\\PerMonitorSettings'
if (-not (Test-Path $base)) { Write-Output '{}'; exit 0 }
$o = @{}
Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {
  # 🔴 DpiValue 是 **<monitorId> 键下的一个 REG_DWORD 值**，不是子键
  $v = $null
  try { $v = (Get-ItemProperty -LiteralPath $_.PSPath -Name DpiValue -ErrorAction SilentlyContinue).DpiValue } catch {}
  $o[$_.PSChildName] = $v
}
$o | ConvertTo-Json -Compress`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  try {
    return JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    return {};
  }
}

/** 写注册表 DpiValue 到所有 PerMonitorSettings 子键 */
function writeRegistryDpiValue(value) {
  const ps = `$base = 'HKCU:\\Control Panel\\Desktop\\PerMonitorSettings'
if (-not (Test-Path $base)) { Write-Output 'NO_BASE'; exit 0 }
$n = 0
Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {
  # 🔴 DpiValue 是 **<monitorId> 键下的 REG_DWORD 值**（不是子键）
  try {
    Set-ItemProperty -LiteralPath $_.PSPath -Name DpiValue -Value ${value} -ErrorAction Stop
    $n++
  } catch {
    try {
      New-ItemProperty -LiteralPath $_.PSPath -Name DpiValue -Value ${value} -PropertyType DWord -Force -ErrorAction Stop | Out-Null
      $n++
    } catch { Write-Output ('FAIL ' + $_.PSChildName) }
  }
}
Write-Output $n`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

/** 读 LogPixels / Win8DpiScaling（用于还原核对） */
function readLegacyScalingKeys() {
  const ps = `$d = 'HKCU:\\Control Panel\\Desktop'
$o = @{}
$o.LogPixels = (Get-ItemProperty $d -Name LogPixels -ErrorAction SilentlyContinue).LogPixels
$o.Win8DpiScaling = (Get-ItemProperty $d -Name Win8DpiScaling -ErrorAction SilentlyContinue).Win8DpiScaling
$o | ConvertTo-Json -Compress`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  try {
    const j = JSON.parse((r.stdout || '').trim() || '{}');
    return { LogPixels: j.LogPixels === undefined ? null : j.LogPixels, Win8DpiScaling: j.Win8DpiScaling === undefined ? null : j.Win8DpiScaling };
  } catch {
    return { LogPixels: null, Win8DpiScaling: null };
  }
}

/* ------------------------------------------------------------------ *
 * 2. Electron 侧的显示器信息（要 electron 运行时才有 screen 模块）
 * ------------------------------------------------------------------ */

function electronDisplayInfo() {
  const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!fs.existsSync(electronPath)) return { available: false, reason: 'electron.exe not found' };
  const helper = path.join(__dirname, '.dpi-display-probe.cjs');
  fs.writeFileSync(helper, `
const { app, screen } = require('electron');
app.whenReady().then(() => {
  const pack = (d) => ({ id: d.id, label: d.label, scaleFactor: d.scaleFactor,
    bounds: { ...d.bounds }, workArea: { ...d.workArea } });
  const out = { all: screen.getAllDisplays().map(pack), primary: pack(screen.getPrimaryDisplay()) };
  process.stdout.write('__DPI_PROBE__' + JSON.stringify(out));
  app.exit(0);
});
`, 'utf8');
  const r = spawnSync(electronPath, [helper], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
  try {
    fs.unlinkSync(helper);
  } catch {}
  const raw = (r.stdout || '').split('__DPI_PROBE__')[1];
  if (!raw) return { available: false, reason: 'probe failed', stdout: (r.stdout || '').slice(0, 400) };
  try {
    return { available: true, ...JSON.parse(raw.trim()) };
  } catch (e) {
    return { available: false, reason: String(e) };
  }
}

/* ------------------------------------------------------------------ *
 * 3. 主流程
 * ------------------------------------------------------------------ */

/** 移动鼠标光标到指定屏幕坐标（让「鼠标所在显示器优先」的选屏逻辑落在目标屏上） */
function moveCursor(x, y) {
  const ps = `$sig = @'
using System;
using System.Runtime.InteropServices;
public class Cur {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
Write-Output ([Cur]::SetCursorPos(${x}, ${y}))`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function snapshot(tag) {
  const dpi = readSystemDpi();
  return {
    tag,
    at: new Date().toISOString(),
    getDpiForSystem: dpi,
    scaleFactorFromDpi: dpi ? +(dpi / 96).toFixed(4) : null,
    registryPerMonitor: readRegistryDpiValues(),
    legacyScaling: readLegacyScalingKeys(),
  };
}

function main() {
  const out = { generatedAt: new Date().toISOString(), actions: [], before: snapshot('before') };

  const index = arg('index');
  const registry = arg('registry');

  if (has('reset-registry')) {
    const n = writeRegistryDpiValue(0);
    out.actions.push({ action: 'reset-registry', writtenKeys: n, note: '所有 PerMonitorSettings\\DpiValue 归零' });
  }

  if (index !== null) {
    const idx = Number(index);
    const apiOk = setLogicalDpiOverride(idx);
    // 关键：必须用**新进程**读 DPI（既有进程读到的是陈旧值）
    const after = snapshot(`after-index-${idx}`);
    out.actions.push({
      action: 'setLogicalDpiOverride',
      index: idx,
      apiReturned: apiOk,
      getDpiForSystem: after.getDpiForSystem,
      expectedDpi: [null, 96, 120, 144, 192][idx] ?? null,
      effective: after.getDpiForSystem === ([null, 96, 120, 144, 192][idx] ?? -1),
      note: 'effective=true 才算真实生效；Windows 对 index>=2 常回落，如实记录',
    });
    out.after = after;
  }

  if (registry !== null) {
    const val = Number(registry);
    const n = writeRegistryDpiValue(val);
    const after = snapshot(`after-registry-${val}`);
    out.actions.push({
      action: 'writeRegistryDpiValue',
      value: val,
      writtenKeys: n,
      getDpiForSystem: after.getDpiForSystem,
      note: 'Win11 上写入通常需**注销重登**才生效；本脚本只读回证据，不谎报已生效',
    });
    out.after = after;
  }

  const cursor = arg('cursor');
  if (cursor) {
    const [cx, cy] = cursor.split(',').map(Number);
    const moved = moveCursor(cx, cy);
    out.actions.push({ action: 'moveCursor', to: { x: cx, y: cy }, result: moved });
  }

  if (has('verify') || (!has('reset-registry') && index === null && registry === null) || cursor) {
    out.electronDisplays = electronDisplayInfo();
  }

  process.stdout.write('[DPI-SWITCH] ' + JSON.stringify(out, null, 2) + '\n');
}

main();
