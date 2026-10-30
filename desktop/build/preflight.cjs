/**
 * LED-ratio-Tool 桌面版 · 启动前置检查
 * ---------------------------------------------------------------------------
 * SEC-40：ELECTRON_RUN_AS_NODE=1 会让 electron.exe 退化为纯 Node 运行
 * （require('electron') 返回路径字符串，app 为 undefined），
 * 导致启动报 `Cannot read properties of undefined (reading 'enableSandbox')`
 * —— 报错信息与真实原因不匹配，极易误判。
 *
 * 本脚本在启动前拦截，并检查构建机运行库。
 *
 * 退出码：0 = 通过；1 = 存在阻断项
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const problems = [];

/* ---- 1. ELECTRON_RUN_AS_NODE ---- */
if (process.env.ELECTRON_RUN_AS_NODE) {
  problems.push(
    'ELECTRON_RUN_AS_NODE 已设置 —— electron.exe 会退化为纯 Node 运行，' +
      '启动将报 "Cannot read properties of undefined"。请先清除该环境变量。',
  );
}

/* ---- 2. VC++ 运行库（Electron >=40.10.3 的 postinstall 需要）---- */
if (process.platform === 'win32') {
  const required = ['vcruntime140.dll', 'vcruntime140_1.dll', 'vcruntime140_threads.dll'];
  const missing = required.filter(
    (f) => !fs.existsSync(path.join(process.env.SystemRoot || 'C://Windows', 'System32', f)),
  );
  if (missing.length) {
    problems.push(
      `缺少 VC++ 运行库: ${missing.join(', ')} —— 请安装 Microsoft Visual C++ 2015-2022 Redistributable (x64)`,
    );
  }
}

/* ---- 3. Node 版本 ---- */
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  problems.push(`Node 版本过低（${process.versions.node}），需要 >= 20`);
}

if (problems.length) {
  console.error('[前置检查失败]');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(
  `[前置检查通过] Node ${process.versions.node} ｜ VC++ 运行库就绪 ｜ ELECTRON_RUN_AS_NODE 未设置`,
);
process.exit(0);
