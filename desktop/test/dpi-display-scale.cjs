/**
 * LED-ratio-Tool 桌面版 · 真实系统显示缩放切换（SetDisplayConfig 路径）
 * ============================================================================
 * 🔴 用途：P7-DPI-09 Remediation 的真实 DPI 验收要求在 **125% / 150%** 真实系统缩放下
 *    实测。既有两条路径在本机均已实测失效：
 *      · `SPI_SETLOGICALDPIOVERRIDE`：index=1→96、index=2/3/4→96，**全部回落**
 *      · 注册表 `PerMonitorSettings`：写入后需**注销重登**（会终止会话）
 *
 *    本脚本走 **Windows 显示设置同一条系统路径**：
 *      `SetDisplayConfig(..., DISPLAYCONFIG_DEVICE_INFO_SET_DPI_SCALE, ...)`
 *    —— 这正是「设置 → 系统 → 显示 → 缩放」滑块背后的 API，**不需要注销重登**，
 *    也不涉及任何页面缩放 / zoomFactor / Playwright / CDP 模拟。
 *
 * 🔴 坐标/缩放纪律：唯一生效判据是 **新进程**读到的
 *    `GetDpiForSystem()` 与 Electron 的 `display.scaleFactor` / `devicePixelRatio`。
 *    本脚本只调用系统 API，绝不代劳任何模拟。
 *
 * 用法：
 *   node test/dpi-display-scale.cjs --set=125     # 把缩放设为 125%
 *   node test/dpi-display-scale.cjs --set=100     # 还原到 100%
 *   node test/dpi-display-scale.cjs --query       # 只读：枚举所有显示源与当前缩放
 * ============================================================================
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
const has = (name) => argv.includes(`--${name}`);

/* ------------------------------------------------------------------ *
 * C# 桥：QueryDisplayConfig + SetDisplayConfig(DPI_SCALE)
 * ------------------------------------------------------------------ */
const CS_SOURCE = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DpiScale
{
    const uint QDC_ONLY_ACTIVE = 0x00000002;
    const uint QDC_ALL_PATHS   = 0x00000008;
    const int  ERROR_INSUFFICIENT_BUFFER = 122;
    const int  GET_TARGET_NAME = 2;
    const int  GET_SOURCE_NAME = 1;
    const int  GET_DPI_SCALE   = -3;
    const int  SET_DPI_SCALE   = -4;

    [StructLayout(LayoutKind.Sequential)]
    public struct LUID { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_RATIONAL { public uint Numerator; public uint Denominator; }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_PATH_SOURCE_INFO { public LUID adapterId; public uint id; public uint modeInfoIdx; public uint statusFlags; }

    public enum OUTPUT_TECH : uint {
        OTHER = 0xFFFFFFFF, HD15 = 0, SVIDEO = 1, COMPOSITE = 2, COMPONENT = 3,
        DVI = 4, HDMI = 5, LVDS = 6, D_JPN = 8, SDI = 9,
        DISPLAYPORT_EXTERNAL = 10, DISPLAYPORT_EMBEDDED = 11,
        UDI_EXTERNAL = 12, UDI_EMBEDDED = 13, INDIRECT_WIRED = 14,
        INDIRECT_VIRTUAL = 16, DISPLAYPORT_USB = 18, VIRTUAL_UNIVERAL = 22,
        INTERNAL = 0x80000000
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_PATH_TARGET_INFO {
        public LUID adapterId;
        public uint id;
        public uint modeInfoIdx;
        public OUTPUT_TECH outputTechnology;
        public uint rotation;
        public uint scaling;
        public DISPLAYCONFIG_RATIONAL refreshRate;
        public uint scanLineOrdering;
        [MarshalAs(UnmanagedType.Bool)] public bool targetAvailable;
        public uint statusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_PATH_INFO {
        public DISPLAYCONFIG_PATH_SOURCE_INFO sourceInfo;
        public DISPLAYCONFIG_PATH_TARGET_INFO targetInfo;
        public uint flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_MODE_INFO { public uint infoType; public uint id; public LUID adapterId; public uint modeInfoIdx; }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_DEVICE_INFO_HEADER { public int type; public uint size; public LUID adapterId; public uint id; }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_TARGET_DEVICE_NAME {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string monitorFriendlyDeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string monitorDevicePath;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string sourceDevicePath;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_SOURCE_DEVICE_NAME {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string viewGdiDeviceName;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_SOURCE_DPI_SCALE_GET {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        public int dpiScaleInt;
        public int dpiScaleNumerator;
        public int dpiScaleDenominator;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DISPLAYCONFIG_SOURCE_DPI_SCALE_SET {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        public uint dpiScaleInt;
    }

    [DllImport("user32.dll")]
    static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPathArrayElements, out uint numModeInfoArrayElements);
    [DllImport("user32.dll")]
    static extern int QueryDisplayConfig(uint flags, ref uint numPathArrayElements,
        [Out] DISPLAYCONFIG_PATH_INFO[] pathInfoArray,
        ref uint numModeInfoArrayElements,
        [Out] DISPLAYCONFIG_MODE_INFO[] modeInfoArray,
        IntPtr currentTopologyId);
    // 原生第 7 参是 void*（泛型 device-info 缓冲），C# 必须用 IntPtr 声明
    [DllImport("user32.dll")]
    static extern int SetDisplayConfig(DISPLAYCONFIG_PATH_INFO[] pathInfoArray, uint numPathArrayElements,
        DISPLAYCONFIG_PATH_INFO[] newPathInfoArray, uint numNewPathInfoArrayElements,
        DISPLAYCONFIG_MODE_INFO[] modeInfoArray, uint numModeInfoArrayElements,
        IntPtr targetDeviceInfoArray, uint numTargetDeviceInfoArrayElements,
        uint flags);
    [DllImport("user32.dll")]
    static extern int DisplayConfigGetDeviceInfo(IntPtr requestPacket);

    public class Entry {
        public string monitor; public string sourceName;
        public long adapterLow; public int adapterHigh; public uint sourceId;
        public int currentScale; public int dpiScaleNumerator; public int dpiScaleDenominator; public int dpiScaleInt;
    }

    public static string ReadScalesJson()
    {
        List<Entry> entries; string err;
        int[] allowed = ReadScales(out entries, out err);
        char Q = (char)34;
        char A = (char)39;
        var sb = new System.Text.StringBuilder();
        sb.Append('{');
        sb.Append(Q).Append("err").Append(Q).Append(':');
        if (err == null) sb.Append("null"); else sb.Append(Q).Append(err.Replace(Q, A)).Append(Q);
        sb.Append(',').Append(Q).Append("allowed").Append(Q).Append(":[");
        if (allowed != null) { for (int i = 0; i < allowed.Length; i++) { if (i > 0) sb.Append(','); sb.Append(allowed[i]); } }
        sb.Append(']').Append(',').Append(Q).Append("entries").Append(Q).Append(":[");
        for (int i = 0; i < entries.Count; i++)
        {
            if (i > 0) sb.Append(',');
            var e = entries[i];
            string mon = e.monitor == null ? "" : e.monitor.Replace(Q, A);
            string src = e.sourceName == null ? "" : e.sourceName.Replace(Q, A);
            sb.Append('{');
            sb.Append(Q).Append("monitor").Append(Q).Append(':').Append(Q).Append(mon).Append(Q).Append(',');
            sb.Append(Q).Append("sourceName").Append(Q).Append(':').Append(Q).Append(src).Append(Q).Append(',');
            sb.Append(Q).Append("adapterLow").Append(Q).Append(':').Append(e.adapterLow).Append(',');
            sb.Append(Q).Append("adapterHigh").Append(Q).Append(':').Append(e.adapterHigh).Append(',');
            sb.Append(Q).Append("sourceId").Append(Q).Append(':').Append(e.sourceId).Append(',');
            sb.Append(Q).Append("currentScale").Append(Q).Append(':').Append(e.currentScale).Append(',');
            sb.Append(Q).Append("numerator").Append(Q).Append(':').Append(e.dpiScaleNumerator).Append(',');
            sb.Append(Q).Append("denominator").Append(Q).Append(':').Append(e.dpiScaleDenominator).Append(',');
            sb.Append(Q).Append("dpiScaleInt").Append(Q).Append(':').Append(e.dpiScaleInt);
            sb.Append('}');
        }
        sb.Append(']').Append('}');
        return sb.ToString();
    }

    static int[] ReadScales(out List<Entry> entries, out string err)
    {
        entries = new List<Entry>();
        err = null;

        // 🔴 依次尝试多种标志组合，取「能拿到路径」的那一组
        //    0x02=QDC_DATABASE_ALL  0x04=QDC_ONLY_ACTIVE_PATHS  0x08=QDC_ALL_PATHS  0x10=QDC_VIRTUAL_MODE_AWARE
        uint[] flagSets = new uint[] { 0x02, 0x04, 0x0A, 0x14, 0x12, 0x06, 0x01 };
        uint usedFlags = 0;
        DISPLAYCONFIG_PATH_INFO[] paths = null;
        DISPLAYCONFIG_MODE_INFO[] modes = null;
        uint np = 0, nm = 0;

        foreach (uint flags in flagSets)
        {
            uint p = 0, m = 0;
            int rc = GetDisplayConfigBufferSizes(flags, out p, out m);
            if (rc != 0 || p == 0) continue;
            var tp = new DISPLAYCONFIG_PATH_INFO[p];
            var tm = new DISPLAYCONFIG_MODE_INFO[m];
            uint np2 = p, nm2 = m;
            rc = QueryDisplayConfig(flags, ref np2, tp, ref nm2, tm, IntPtr.Zero);
            if (rc == ERROR_INSUFFICIENT_BUFFER) {
                GetDisplayConfigBufferSizes(flags, out p, out m);
                tp = new DISPLAYCONFIG_PATH_INFO[p];
                tm = new DISPLAYCONFIG_MODE_INFO[m];
                np2 = p; nm2 = m;
                rc = QueryDisplayConfig(flags, ref np2, tp, ref nm2, tm, IntPtr.Zero);
            }
            if (rc != 0 || np2 == 0) continue;
            usedFlags = flags; paths = tp; modes = tm; np = np2; nm = nm2;
            break;
        }
        if (paths == null) { err = "no flag combination returned active paths"; return null; }
        err = "flags=0x" + usedFlags.ToString("X") + " paths=" + np;

        var names = new DISPLAYCONFIG_TARGET_DEVICE_NAME[np];
        for (int i = 0; i < np; i++) {
            names[i].header.type = GET_TARGET_NAME;
            names[i].header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_TARGET_DEVICE_NAME));
            names[i].header.adapterId = paths[i].targetInfo.adapterId;
            names[i].header.id = paths[i].targetInfo.id;
        }
        int nameSize = Marshal.SizeOf(typeof(DISPLAYCONFIG_TARGET_DEVICE_NAME));
        IntPtr nameBuf = Marshal.AllocHGlobal(nameSize * (int)np);
        try {
            for (int i = 0; i < np; i++) Marshal.StructureToPtr(names[i], nameBuf + i * nameSize, false);
            SetDisplayConfig(paths, np, null, 0, modes, nm, nameBuf, np, 0);
        } finally { Marshal.FreeHGlobal(nameBuf); }

        var srcNames = new DISPLAYCONFIG_SOURCE_DEVICE_NAME[np];
        for (int i = 0; i < np; i++) {
            srcNames[i].header.type = GET_SOURCE_NAME;
            srcNames[i].header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DEVICE_NAME));
            srcNames[i].header.adapterId = paths[i].sourceInfo.adapterId;
            srcNames[i].header.id = paths[i].sourceInfo.id;
        }
        int srcSize = Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DEVICE_NAME));
        IntPtr srcBuf = Marshal.AllocHGlobal(srcSize * (int)np);
        try {
            for (int i = 0; i < np; i++) Marshal.StructureToPtr(srcNames[i], srcBuf + i * srcSize, false);
            SetDisplayConfig(paths, np, null, 0, modes, nm, srcBuf, np, 0);
        } finally { Marshal.FreeHGlobal(srcBuf); }

        int[] allowed = new int[] { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 25, 50, 75 };

        for (int i = 0; i < (int)np; i++) {
            var get = new DISPLAYCONFIG_SOURCE_DPI_SCALE_GET();
            get.header.type = GET_DPI_SCALE;
            get.header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_GET));
            get.header.adapterId = paths[i].sourceInfo.adapterId;
            get.header.id = paths[i].sourceInfo.id;
            int sz = Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_GET));
            IntPtr p = Marshal.AllocHGlobal(sz);
            try {
                Marshal.StructureToPtr(get, p, false);
                int drc = DisplayConfigGetDeviceInfo(p);
                var got = (DISPLAYCONFIG_SOURCE_DPI_SCALE_GET)Marshal.PtrToStructure(p, typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_GET));
                // 🔴 GET 失败**不跳过**该源：SET_DPI_SCALE 只需要 adapterId + sourceId，
                //    与 GET_DPI_SCALE 是否可用无关。跳过会导致「有源但改不了」。
                var e = new Entry();
                e.monitor = (names[i].monitorFriendlyDeviceName != null) ? names[i].monitorFriendlyDeviceName : "";
                e.sourceName = (srcNames[i].viewGdiDeviceName != null) ? srcNames[i].viewGdiDeviceName : "";
                e.adapterLow = paths[i].sourceInfo.adapterId.LowPart;
                e.adapterHigh = paths[i].sourceInfo.adapterId.HighPart;
                e.sourceId = paths[i].sourceInfo.id;
                e.dpiScaleNumerator = got.dpiScaleNumerator;
                e.dpiScaleInt = got.dpiScaleInt;
                e.dpiScaleDenominator = got.dpiScaleDenominator;
                e.currentScale = got.dpiScaleDenominator == 0 ? 0 : got.dpiScaleNumerator * 100 / got.dpiScaleDenominator;
                entries.Add(e);
            } finally { Marshal.FreeHGlobal(p); }
        }
        return allowed;
    }

    public static string SetScale(long adapterLow, int adapterHigh, uint sourceId, int targetPercent)
    {
        uint[] flagSets = new uint[] { 0x02, 0x04, 0x0A, 0x14, 0x12, 0x06, 0x01 };
        DISPLAYCONFIG_PATH_INFO[] paths = null;
        DISPLAYCONFIG_MODE_INFO[] modes = null;
        uint np = 0, nm = 0;
        uint usedFlags = 0;

        foreach (uint flags in flagSets)
        {
            uint p = 0, m = 0;
            int rc = GetDisplayConfigBufferSizes(flags, out p, out m);
            if (rc != 0 || p == 0) continue;
            var tp = new DISPLAYCONFIG_PATH_INFO[p];
            var tm = new DISPLAYCONFIG_MODE_INFO[m];
            uint np2 = p, nm2 = m;
            rc = QueryDisplayConfig(flags, ref np2, tp, ref nm2, tm, IntPtr.Zero);
            if (rc == ERROR_INSUFFICIENT_BUFFER) {
                GetDisplayConfigBufferSizes(flags, out p, out m);
                tp = new DISPLAYCONFIG_PATH_INFO[p];
                tm = new DISPLAYCONFIG_MODE_INFO[m];
                np2 = p; nm2 = m;
                rc = QueryDisplayConfig(flags, ref np2, tp, ref nm2, tm, IntPtr.Zero);
            }
            if (rc != 0 || np2 == 0) continue;
            usedFlags = flags; paths = tp; modes = tm; np = np2; nm = nm2;
            break;
        }
        if (paths == null) return "ERR_NO_PATHS";

        int targetIdx = -1;
        for (int i = 0; i < (int)np; i++) {
            if (paths[i].sourceInfo.id == sourceId &&
                (long)paths[i].sourceInfo.adapterId.LowPart == adapterLow &&
                paths[i].sourceInfo.adapterId.HighPart == adapterHigh) { targetIdx = i; break; }
        }
        if (targetIdx < 0) return "ERR_NOT_FOUND sourceId=" + sourceId + " flags=0x" + usedFlags.ToString("X");

        var dpiSet = new DISPLAYCONFIG_SOURCE_DPI_SCALE_SET();
        dpiSet.header.type = SET_DPI_SCALE;
        dpiSet.header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_SET));
        dpiSet.header.adapterId = paths[targetIdx].sourceInfo.adapterId;
        dpiSet.header.id = paths[targetIdx].sourceInfo.id;
        dpiSet.dpiScaleInt = (uint)targetPercent;

        int size = Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_SET));
        IntPtr buf = Marshal.AllocHGlobal(size);
        int rc2;
        try {
            Marshal.StructureToPtr(dpiSet, buf, false);
            rc2 = SetDisplayConfig(paths, np, null, 0, modes, nm, buf, 1, 0);
        } finally { Marshal.FreeHGlobal(buf); }
        return rc2 == 0 ? ("OK flags=0x" + usedFlags.ToString("X")) : ("ERR_SET rc=" + rc2 + " flags=0x" + usedFlags.ToString("X"));
    }
}
`;

const PS_BRIDGE = (cs, body) => `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${cs}
'@ -Language CSharp
${body}
`;

/** 读新进程的 GetDpiForSystem */
function readSystemDpi() {
  const ps = `$sig = @'
using System;
using System.Runtime.InteropServices;
public class DpiRead {
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr hdc, int i);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr hdc);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
$hdc=[DpiRead]::GetDC([IntPtr]::Zero); $d=[DpiRead]::GetDeviceCaps($hdc,88); [void][DpiRead]::ReleaseDC([IntPtr]::Zero,$hdc); Write-Output $d`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  const n = Number((r.stdout || '').trim());
  return Number.isFinite(n) ? n : null;
}

/** 查询当前各显示源的 DPI 缩放设置（带重试：显示配置在 SetDisplayConfig 后会短暂不可枚举） */
function queryScales() {
  let last = { error: 'not attempted' };
  for (let attempt = 1; attempt <= 5; attempt++) {
    last = queryScalesOnce();
    const ents = (last && last.entries) || [];
    if (ents.length) return { ...last, attempt };
    // 退避 800ms 后重试
    const until = Date.now() + 800;
    while (Date.now() < until) { /* 短暂等待（同步 sleep） */ }
  }
  return { ...last, attempt: 5, error: (last.error || 'entries empty after retries') };
}

function queryScalesOnce() {
  const ps = PS_BRIDGE(CS_SOURCE, `
Write-Output ([DpiScale]::ReadScalesJson())`);
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  const raw = (r.stdout || '').trim();
  if (r.status !== 0) return { error: (r.stderr || raw).slice(0, 800) };
  try {
    return JSON.parse(raw);
  } catch {
    return { error: 'parse fail', raw: raw.slice(0, 800) };
  }
}

/** 设置某个显示源的 DPI 缩放 */
function setScale(adapterLow, adapterHigh, sourceId, percent) {
  const ps = PS_BRIDGE(CS_SOURCE, `
Write-Output ([DpiScale]::SetScale([int64]${adapterLow}, ${adapterHigh}, [uint32]${sourceId}, ${percent}))`);
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  return (r.stdout || '').trim() || (r.stderr || '').trim().slice(0, 400);
}

/** Electron 侧显示器信息（scaleFactor / workArea） */
function electronDisplays() {
  const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!fs.existsSync(electronPath)) return { available: false, reason: 'electron.exe not found' };
  const helper = path.join(__dirname, '.dpi-display-probe.cjs');
  fs.writeFileSync(helper, `
const { app, screen } = require('electron');
app.whenReady().then(() => {
  const pack = (d) => ({ id: d.id, label: d.label, scaleFactor: d.scaleFactor,
    bounds: { ...d.bounds }, workArea: { ...d.workArea }, size: { ...d.size } });
  const out = { all: screen.getAllDisplays().map(pack), primary: pack(screen.getPrimaryDisplay()) };
  process.stdout.write('__DPI_PROBE__' + JSON.stringify(out));
  app.exit(0);
});
`, 'utf8');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electronPath, [helper], { encoding: 'utf8', env });
  try { fs.unlinkSync(helper); } catch {}
  const raw = (r.stdout || '').split('__DPI_PROBE__')[1];
  if (!raw) return { available: false, stdout: (r.stdout || '').slice(0, 400) };
  try { return { available: true, ...JSON.parse(raw.trim()) }; } catch (e) { return { available: false, reason: String(e) }; }
}

function main() {
  const out = { generatedAt: new Date().toISOString(), actions: [] };

  const setPct = arg('set');
  const query = queryScales();
  out.before = { scales: query, getDpiForSystem: readSystemDpi(), electron: electronDisplays() };

  if (setPct) {
    const pct = Number(setPct);
    const entries = (query && query.entries) || [];
    if (!entries.length) {
      out.actions.push({ action: 'setScale', target: pct, result: 'NO_SOURCE_ENTRIES', error: query && query.error });
    } else {
      for (const e of entries) {
        const res = setScale(e.adapterLow, e.adapterHigh, e.sourceId, pct);
        out.actions.push({
          action: 'setScale',
          monitor: e.monitor,
          sourceName: e.sourceName,
          sourceId: e.sourceId,
          from: e.currentScale,
          to: pct,
          result: res,
        });
      }
    }
    // 生效后必须用**新进程**读
    out.after = { scales: queryScales(), getDpiForSystem: readSystemDpi(), electron: electronDisplays() };
  } else if (has('query')) {
    out.after = { scales: queryScales(), getDpiForSystem: readSystemDpi(), electron: electronDisplays() };
  }

  process.stdout.write('[DPI-DISPLAY-SCALE] ' + JSON.stringify(out, null, 2) + '\n');
}

main();
