/**
 * LED-ratio-Tool · 统一哈希工具
 * ---------------------------------------------------------------------------
 * 唯一口径来源：全工程所有哈希计算必须经由此模块，禁止各自实现。
 *
 * 🔒 为什么必须归一化行尾符后再哈希
 * ---------------------------------------------------------------------------
 * 仓库用 .gitattributes 的 `* text=auto` 约定**入库为 LF**。但 Git 的
 * core.autocrlf 设置会让**工作区**内容不同：
 *
 *   core.autocrlf=false → 检出为 LF（内容与入库一致）
 *   core.autocrlf=true  → 检出为 CRLF（Windows 默认）
 *
 * 若直接对**工作区文件字节**求 SHA-256，同一份源码在两类机器上会得到
 * **两个不同的哈希** → core.lock.json 的哈希锁在 Windows 上必然失配，
 * 而这与"业务代码是否被改过"毫无关系。
 *
 * 本模块的做法：先做行尾符归一化（CRLF→LF、CR→LF），再求 SHA-256。
 * 于是：
 *   · 哈希只反映**业务内容**，不反映 checkout 策略
 *   · 同一份源码在 Windows / macOS / Linux、不同 autocrlf 下得到相同哈希
 *   · **不修改任何源文件的实际字节**（归一化只在内存中进行）
 *
 * 🔒 二进制文件不适用此归一化 —— 但本项目参与哈希锁的全是文本文件。
 *    `sha256Normalized` 通过检测 NUL 字节自动跳过二进制。
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * 判定是否为二进制（含 NUL 字节即视为二进制）。
 * @param {Buffer} buf
 * @returns {boolean}
 */
export function isBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * 归一化行尾符：CRLF → LF，孤立 CR → LF。
 * @param {Buffer|string} input
 * @returns {Buffer}
 */
export function normalizeEol(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  if (isBinary(buf)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8');
}

/**
 * 归一化后的 SHA-256（十六进制）。
 * @param {Buffer|string} input
 * @returns {string}
 */
export function sha256Normalized(input) {
  return createHash('sha256').update(normalizeEol(input)).digest('hex');
}

/**
 * 归一化后的 SHA-256（从文件读）。
 * @param {string} filePath
 * @returns {string}
 */
export function sha256FileNormalized(filePath) {
  return sha256Normalized(readFileSync(filePath));
}

/**
 * 两个文件是否**业务内容**相同（忽略行尾符差异）。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameContent(a, b) {
  return sha256FileNormalized(a) === sha256FileNormalized(b);
}
