/**
 * LED-ratio-Tool · 构建可复现性校验
 * ---------------------------------------------------------------------------
 * 目的：确认「重新构建的产物」与「仓库中已提交的产物」逐字节一致。
 *
 * 🔴 为什么不直接用 `git diff --quiet`：
 *   · 该命令依赖外部 git 可执行文件在 PATH 中 —— 在某些环境（CI 容器、
 *     精简 PATH 的会话）里 git 可能不可用；
 *   · 一旦 git 调用失败，`git diff --quiet` 会返回非 0，被误判成
 *     「产物不一致」—— 这就把**环境问题误报成了业务问题**；
 *   · 且它无法区分「产物真的变了」与「比较手段失效了」。
 *
 * 本脚本改为**直接比较文件内容**：
 *   ① 读工作区的 dist/led-ratio-tool.html
 *   ② 读 Git 对象库中 HEAD 版本的同一文件（git cat-file 读原始 blob）
 *   ③ 两者按 **LF 归一化**后逐字节比较
 *   若第 ② 步无法取得（无 git / 非 Git 仓库 / 该文件未入库），
 *   **明确报错并以独立退出码 3 退出**，不与「产物不一致」混淆。
 *
 * 退出码：
 *   0 = 可复现（产物与提交一致）
 *   1 = 不可复现（产物与提交不一致）—— 业务问题
 *   3 = 无法判定（环境问题：git 不可用 / 文件未入库 / 非 Git 仓库）
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const REL = 'dist/led-ratio-tool.html';

const normalize = (buf) =>
  Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8');
const sha256 = (buf) => createHash('sha256').update(normalize(buf)).digest('hex');

/** 读取 Git 对象库中 HEAD 版本的文件原始字节 */
function readCommittedBlob(relPath) {
  try {
    return {
      bytes: execFileSync('git', ['cat-file', 'blob', `HEAD:${relPath}`], {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    return { error: e };
  }
}

const workPath = join(ROOT, REL);
if (!existsSync(workPath)) {
  console.error(`[无法判定] 产物不存在：${REL} —— 请先执行 npm run build`);
  process.exit(3);
}

const committed = readCommittedBlob(REL);
if (committed.error) {
  console.error('[无法判定] 无法从 Git 对象库读取 HEAD 版本的文件：' + REL);
  console.error('  可能原因：git 不在 PATH 中 / 当前不是 Git 仓库 / 该文件尚未提交');
  console.error('  ⚠️ 这是**环境问题**，不是产物不一致 —— 请勿据此判定构建失败。');
  process.exit(3);
}

const workBytes = readFileSync(workPath);
const workHash = sha256(workBytes);
const commitHash = sha256(committed.bytes);

if (workHash === commitHash) {
  console.log('OK: build output matches commit (reproducible)');
  console.log(`     sha256 ${workHash}`);
  process.exit(0);
}

console.error('FAIL: build output differs from commit (not reproducible)');
console.error(`     工作区 sha256 ${workHash}`);
console.error(`     提交版 sha256 ${commitHash}`);
console.error('     请执行 npm run build 重新构建并确认差异原因。');
process.exit(1);
