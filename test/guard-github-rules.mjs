/**
 * LED-ratio-Tool · GitHub 操作规则守卫
 * ---------------------------------------------------------------------------
 * 用途：把项目负责人制定的 GitHub 操作规则变成可自动判定的门禁。
 *   规则全文见仓库根目录 GITHUB-RULES.md
 *
 * 覆盖的规则：
 *   R-1  开发与推送只在 feature/desktop-windows
 *   R-3  禁止合并到 main（除非对话中明确授权）
 *   R-4  禁止直接推送 main
 *   R-5  禁止修改正式发布文件（dist / baselines / LICENSE）
 *   R-6  禁止删除现有分支与标签
 *
 * 用法：
 *   node test/guard-github-rules.mjs            # 校验当前状态，违规退出码 1
 *   node test/guard-github-rules.mjs --pre-push # 推送前检查（含推送目标 ref）
 *
 * 注意：本守卫是「辅助」，不是「授权」。它无法判断"项目负责人是否已在对话中
 *       授权合并" —— 那一项永远是人工判断，由项目负责人执行合并动作。
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

const DEV_BRANCH = 'feature/desktop-windows';
const PROTECTED_BRANCHES = ['main', DEV_BRANCH];
const PROTECTED_TAGS = ['pre-desktop'];
/** 正式发布文件：任何内容差异都视为违规 */
const PROTECTED_FILES = [
  'dist/led-ratio-tool.html',
  'test/baselines/led-ratio-tool.v1000.html',
  'LICENSE',
];

const violations = [];
const checks = [];

function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (e) {
    return null;
  }
}

/* ---- R-1｜当前分支必须在 feature 分支 ---- */
{
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) {
    violations.push('R-1：无法读取当前分支（不在 Git 仓库内？）');
  } else if (branch !== DEV_BRANCH) {
    violations.push(
      `R-1：当前分支为 "${branch}"，只允许在 "${DEV_BRANCH}" 上开发。\n` +
      `        切换：git checkout ${DEV_BRANCH}`
    );
  } else {
    checks.push(`R-1 当前分支 = ${branch} ✅`);
  }
}

/* ---- R-3｜main 不得被合并（无授权记录时）---- */
{
  const mainLocal = git(['rev-parse', 'main']);
  const base = git(['merge-base', 'main', DEV_BRANCH]);
  if (mainLocal && base) {
    // main 相对 merge-base 的独有提交数 —— 正常应为 0
    const ahead = git(['rev-list', '--count', `${base}..main`]);
    if (ahead && Number(ahead) > 0) {
      violations.push(
        `R-3：main 上有 ${ahead} 个不在 ${DEV_BRANCH} 中的提交 —— 疑似发生了未经授权的合并。\n` +
        `        若这是经项目负责人授权的合并，请在仓库中记录授权（见 GITHUB-RULES.md R-3）。`
      );
    } else {
      checks.push('R-3 main 无未经授权的合并 ✅');
    }
  }
}

/* ---- R-4｜推送目标不得是 main ---- */
if (process.argv.includes('--pre-push')) {
  const remote = process.env.GIT_PUSH_REMOTE || 'origin';
  const branch = process.env.GIT_PUSH_REF || '';
  // GIT_PUSH_REF 形如 refs/heads/xxx
  const target = branch.replace(/^refs\/heads\//, '');
  if (!target) {
    violations.push('R-4：无法读取推送目标 ref（GIT_PUSH_REF 未设置）');
  } else if (target === 'main' || target === 'master') {
    violations.push(
      `R-4：拒绝推送到 ${target}。\n` +
      `        规则：禁止直接向 main 推送提交。变更请推送到 ${DEV_BRANCH}。`
    );
  } else if (!PROTECTED_BRANCHES.includes(target)) {
    violations.push(
      `R-4：推送目标 "${target}" 不在允许清单 ${JSON.stringify(PROTECTED_BRANCHES)} 内。\n` +
      `        如确需推送到其他分支，请先取得项目负责人授权。`
    );
  } else {
    checks.push(`R-4 推送目标 = ${remote}/${target} ✅`);
  }
} else {
  checks.push('R-4 推送目标检查（--pre-push 时生效）跳过');
}

/* ---- R-5｜正式发布文件不得相对 main 产生内容差异 ---- */
{
  const diff = git(['diff', '--name-only', 'main', 'HEAD', '--', ...PROTECTED_FILES]);
  if (diff === null) {
    violations.push('R-5：无法比对正式发布文件（git diff 失败）');
  } else if (diff.length) {
    violations.push(
      `R-5：以下正式发布文件相对 main 存在内容差异：\n` +
      diff.split('\n').map((f) => `        - ${f}`).join('\n') +
      `\n        规则：正式发布文件禁止修改。dist 必须由 build.mjs 重新构建且与 main\n` +
      `        中的版本逐字节一致（npm run verify:reproducible 必须通过）。`
    );
  } else {
    checks.push(`R-5 ${PROTECTED_FILES.length} 个正式发布文件与 main 一致 ✅`);
  }
}

/* ---- R-6｜受保护分支与标签必须存在 ---- */
{
  for (const b of PROTECTED_BRANCHES) {
    if (!git(['rev-parse', '--verify', b])) {
      violations.push(`R-6：受保护分支 "${b}" 不存在 —— 可能被误删。`);
    }
  }
  for (const t of PROTECTED_TAGS) {
    if (!git(['rev-parse', '--verify', `refs/tags/${t}`])) {
      violations.push(`R-6：受保护标签 "${t}" 不存在 —— 可能被误删。`);
    }
  }
  if (!violations.some((v) => v.startsWith('R-6'))) {
    checks.push(`R-6 ${PROTECTED_BRANCHES.length} 个分支 + ${PROTECTED_TAGS.length} 个标签全部在位 ✅`);
  }
}

/* ---- 附加：可复现性（受保护文件的哈希一致性）---- */
{
  const distPath = join(ROOT, 'dist', 'led-ratio-tool.html');
  if (existsSync(distPath)) {
    const actual = createHash('sha256').update(readFileSync(distPath)).digest('hex');
    // 必须用 cat-file 读原始 blob 字节 —— `git show` 会经过文本转换，
    // 在 autocrlf 环境下会把 LF 转成 CRLF，算出与工作区不同的假哈希。
    let committedBuf = null;
    try {
      committedBuf = execFileSync('git', ['cat-file', 'blob', 'HEAD:dist/led-ratio-tool.html'], {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch { committedBuf = null; }
    if (committedBuf) {
      const committedHash = createHash('sha256').update(committedBuf).digest('hex');
      if (actual !== committedHash) {
        violations.push(
          `R-5：dist 产物哈希与提交不一致（${actual.slice(0, 16)}… vs ${committedHash.slice(0, 16)}…）\n` +
          `        请运行 npm run build 重新构建后再提交。`
        );
      } else {
        checks.push(`dist 产物哈希一致（${actual.slice(0, 16)}…）✅`);
      }
    }
  }
}

/* ---- 输出 ---- */
console.log('=== GitHub 操作规则守卫 ===');
for (const c of checks) console.log('  ✅ ' + c);

if (violations.length) {
  console.log('\n❌ 规则守卫失败：');
  for (const v of violations) console.log('  - ' + v);
  console.log('\n规则全文见 GITHUB-RULES.md。任何一条都不得绕过。');
  process.exit(1);
}

console.log('\n✅ GitHub 操作规则守卫全部通过。');
process.exit(0);
