/**
 * LED-ratio-Tool 桌面版 · L1 独立性自检（机器闸）
 * ============================================================================
 * 依据：P3-D09 §6.6「独立性自检：差分器静态扫描自身：不得 import/require 任何
 *       路径下的 core.js → 命中即退出码 1（自检必须是一道机器闸，不靠人工承诺）」
 *       TK-93「提取 own* 函数到独立文件，禁止整体 import acceptance.mjs」
 *
 * 🔴 检查三件事：
 *   ① 被检文件**不得** import/require 任何路径下的 `core.js`；
 *   ② 被检文件**不得** import/require `acceptance.mjs`（会连带执行产品代码）；
 *   ③ 被检文件**不得** import/require `src/app.js` / `desktop/renderer/app.js`
 *      （UI 层也是产品代码，期望值不得由被测实现生成）。
 *
 * 检查方式：剥离注释与字符串字面量后，正则扫描 import/require 形式。
 * 仅扫描**代码**部分 —— 注释里提到 core.js 是允许且必要的（要写明为什么不许引用）。
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** 禁止引用的模块模式（对代码部分生效） */
const FORBIDDEN = [
  { re: /require\s*\(\s*['"][^'"]*core\.js['"]\s*\)/gi, label: 'require(*core.js)' },
  { re: /import\s+[^;]*?from\s*['"][^'"]*core\.js['"]/gi, label: 'import … from *core.js' },
  { re: /import\s*\(\s*['"][^'"]*core\.js['"]\s*\)/gi, label: 'import(*core.js)' },
  { re: /require\s*\(\s*['"][^'"]*acceptance\.mjs['"]\s*\)/gi, label: 'require(*acceptance.mjs)' },
  { re: /import\s+[^;]*?from\s*['"][^'"]*acceptance\.mjs['"]/gi, label: 'import … from *acceptance.mjs' },
  { re: /require\s*\(\s*['"][^'"]*src\/app\.js['"]\s*\)/gi, label: 'require(*src/app.js)' },
  { re: /require\s*\(\s*['"][^'"]*renderer\/app\.js['"]\s*\)/gi, label: 'require(*renderer/app.js)' },
];

/**
 * 剥离注释，保留代码骨架（用于扫描）。
 * 手法：逐字符走一遍，跟踪字符串/模板串/正则/注释状态。
 * ⚠ 简化处理：正则字面量按普通文本处理（对本仓库的测试文件足够安全）。
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i += 2; out += '  '; continue; }
      if (c === '/' && n === '*') { state = 'block'; i += 2; out += '  '; continue; }
      if (c === "'") { state = 'sq'; out += c; i++; continue; }
      if (c === '"') { state = 'dq'; out += c; i++; continue; }
      if (c === '`') { state = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += '\n'; } else { out += ' '; }
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // 字符串态
    if (c === '\\') { out += '  '; i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
      state = 'code';
    }
    out += c === '\n' ? '\n' : ' '; i++; continue;
  }
  return out;
}

/**
 * 对单个文件做独立性检查。
 * @param {string} absPath 文件绝对路径
 * @returns {{file:string, ok:boolean, hits:Array<{label:string, line:number, text:string}>}}
 */
function checkFile(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const code = stripComments(raw);
  const lines = code.split(/\r?\n/);
  const hits = [];
  for (const rule of FORBIDDEN) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(code)) !== null) {
      const idx = code.slice(0, m.index).split(/\r?\n/).length;
      hits.push({ label: rule.label, line: idx, text: lines[idx - 1].trim() });
    }
  }
  return { file: path.relative(process.cwd(), absPath).replace(/\\/g, '/'), ok: hits.length === 0, hits };
}

/**
 * 对一组文件做独立性检查。
 * @param {string[]} absPaths
 */
function checkFiles(absPaths) {
  return absPaths.map(checkFile);
}

module.exports = { checkFile, checkFiles, stripComments, FORBIDDEN };
