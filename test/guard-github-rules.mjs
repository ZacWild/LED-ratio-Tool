/**
 * LED-ratio-Tool · GitHub 操作规则 —— 本地状态审计
 * ---------------------------------------------------------------------------
 * 规则全文见仓库根目录 GITHUB-RULES.md
 *
 * 🔴 本脚本的能力边界（务必先读，勿高估）
 * ---------------------------------------------------------------------------
 * 本脚本是**本地状态审计**，**不是**权限控制系统：
 *
 *   · 它**不能**阻止任何人对远端的推送或合并 —— 远端 main 的真正保护
 *     由 **GitHub Rulesets / 分支保护规则**承担（需在仓库设置中配置）。
 *   · 它**不能**识别"项目负责人是否已在对话中授权" —— 授权是人的判断，
 *     只有项目负责人本人能给出。本脚本对此**不做任何猜测，也不假装能识别**。
 *   · 它**不能**替代 CI —— 本项目**目前没有** GitHub Actions 工作流，
 *     所有检查目前都只在本地执行。
 *
 * 因此本脚本的定位是：
 *   ✅ 「在动手之前提醒我当前状态是否符合约定」
 *   ❌ 不是「强制拦截」—— 真正的强制拦截由 GitHub Rulesets 与 pre-push hook 承担
 *
 * -----------------------------------------------------------------------------
 * 两种运行模式（**必须分开**）
 * -----------------------------------------------------------------------------
 *   ① 默认模式（本地状态审计）
 *        node test/guard-github-rules.mjs
 *      检查当前仓库状态，输出报告。**不因分支名不符而失败** —— 因为
 *      CI 以 detached HEAD 检出代码时分支名不是 feature/desktop-windows，
 *      若在此强制检查会让 CI 永久失败。
 *
 *   ② 策略模式（开发流程约定，**不属于产品测试**）
 *        node test/guard-github-rules.mjs --policy
 *      额外检查「当前分支是否为约定的开发分支」。这是**开发流程**检查，
 *      **绝不应**放进 npm test 或 CI 的产品测试链路。
 *
 * -----------------------------------------------------------------------------
 * 推送拦截：由 .githooks/pre-push 承担（真实 Git hook 协议）
 * -----------------------------------------------------------------------------
 *        bash .githooks/pre-push            # 手动跑
 *        git config core.hooksPath .githooks # 启用（一次性）
 *      Git 的 pre-push hook 通过**标准输入**提供待推送 ref，
 *      不是环境变量 —— 见 .githooks/pre-push 的实现。
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

const POLICY_MODE = process.argv.includes('--policy');

const violations = [];
const warnings = [];
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

/* ==========================================================================
   A 组 · 与分支名无关的状态检查
   —— 这些在任何检出方式下都成立，故属于默认模式（本地状态审计）
   ========================================================================== */

/* ---- A-1｜正式发布文件未被改动 ---- */
{
  const diff = git(['diff', '--name-only', 'main', 'HEAD', '--', ...PROTECTED_FILES]);
  if (diff === null) {
    warnings.push('A-1：无法比对正式发布文件（git diff 失败）');
  } else if (diff.length) {
    violations.push(
      `A-1 以下正式发布文件相对 main 存在内容差异：\n` +
        diff.split('\n').map((f) => `        - ${f}`).join('\n') +
        `\n        规则：正式发布文件禁止修改。dist 必须由 build.mjs 重新构建且与 main\n` +
        `        中的版本逐字节一致（npm run verify:reproducible 必须通过）。`,
    );
  } else {
    checks.push('A-1 正式发布文件与 main 一致');
  }
}

/* ---- A-2｜受保护分支与标签存在 ---- */
{
  const missingBranches = PROTECTED_BRANCHES.filter(
    (b) => !git(['rev-parse', '--verify', `refs/heads/${b}`]),
  );
  const missingTags = PROTECTED_TAGS.filter(
    (t) => !git(['rev-parse', '--verify', `refs/tags/${t}`]),
  );
  if (missingBranches.length) {
    violations.push(`A-2 受保护分支缺失：${missingBranches.join(', ')} —— 可能被误删。`);
  }
  if (missingTags.length) {
    violations.push(
      `A-2 受保护标签缺失：${missingTags.join(', ')} —— 可能被误删。` +
        `\n        pre-desktop 是回滚锚点，删除它等同于销毁回滚能力。`,
    );
  }
  if (!missingBranches.length && !missingTags.length) {
    checks.push(`A-2 ${PROTECTED_BRANCHES.length} 个分支 + ${PROTECTED_TAGS.length} 个标签全部在位`);
  }
}

/* ---- A-3｜dist 产物哈希与提交一致（LF 归一化口径）---- */
{
  const distPath = join(ROOT, 'dist', 'led-ratio-tool.html');
  if (existsSync(distPath)) {
    const raw = readFileSync(distPath);
    const normalized = Buffer.from(
      raw.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      'utf8',
    );
    const actual = createHash('sha256').update(normalized).digest('hex');
    let committed = null;
    try {
      committed = execFileSync('git', ['cat-file', 'blob', 'HEAD:dist/led-ratio-tool.html'], {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      committed = null;
    }
    if (committed) {
      const committedHash = createHash('sha256')
        .update(
          Buffer.from(committed.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'),
        )
        .digest('hex');
      if (actual !== committedHash) {
        violations.push(
          `A-3：dist 产物哈希与提交不一致（${actual.slice(0, 16)}… vs ${committedHash.slice(0, 16)}…）\n` +
            `        请运行 npm run build 重新构建后再提交。`,
        );
      } else {
        checks.push(`A-3 dist 产物哈希一致（${actual.slice(0, 16)}…）`);
      }
    }
  } else {
    warnings.push('A-3：dist 产物不存在（尚未构建）');
  }
}

/* ==========================================================================
   B 组 · 远端状态审计（**只读、只报告**，不阻止任何操作）
   ========================================================================== */

/* ---- B-1｜本地 main 与 origin/main 的关系 ---- */
{
  const localMain = git(['rev-parse', 'main']);
  // 🔴 git ls-remote 失败（网络抖动 / 代理 / 认证）时返回 null ——
  //    必须判空，否则会把**环境问题**变成**未捕获异常**（非 0 退出码），
  //    被误读成「违规」。此处只提示、不判违规。
  const remoteRaw = git(['ls-remote', 'origin', 'refs/heads/main']);
  const remoteMain = remoteRaw ? remoteRaw.split(/\s+/)[0] || null : null;
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{upstream}']);

  if (!localMain) {
    warnings.push('B-1：本地无 main 分支');
  } else if (remoteRaw === null) {
    warnings.push(
      'B-1：无法读取 origin/main —— git ls-remote 调用失败（网络/代理/认证问题）。' +
        '\n        这是**环境问题**，不是违规；本次审计未核对远端 main 状态。',
    );
  } else if (!remoteMain) {
    warnings.push('B-1：远端无 main 分支（或输出格式异常）');
  } else if (localMain === remoteMain) {
    checks.push(`B-1 本地 main 与 origin/main 一致（${localMain.slice(0, 12)}）`);
  } else {
    // 这是**正常的**（本地 main 落后于远端，或本地有未推送的提交）
    // —— 只报告，不判违规。
    const ahead = git(['rev-list', '--count', `${remoteMain}..${localMain}`]);
    const behind = git(['rev-list', '--count', `${localMain}..${remoteMain}`]);
    warnings.push(
      `B-1：本地 main (${localMain.slice(0, 12)}) 与 origin/main (${remoteMain.slice(0, 12)}) 不一致` +
        `｜本地领先 ${ahead ?? '?'} 个提交、落后 ${behind ?? '?'} 个提交。` +
        `\n        这本身**不是违规** —— 例如远端已发生过经授权的合并时就会这样。` +
        `\n        真正的合并权限由 GitHub Rulesets 控制，本脚本无权也不应阻止。`,
    );
  }
  if (upstream) {
    checks.push(`B-1 main 跟踪分支 = ${upstream}`);
  }
}

/* ==========================================================================
   C 组 · 开发流程策略检查（**仅 --policy 模式**，不进入产品测试链路）
   ========================================================================== */
if (POLICY_MODE) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const detached = branch === 'HEAD';
  if (detached) {
    warnings.push(
      `C-1 当前处于 detached HEAD（${git(['rev-parse', '--short', 'HEAD']) || '?'}）—— ` +
        `CI 检出即为此状态，此处不判违规。`,
    );
  } else if (branch !== DEV_BRANCH) {
    violations.push(
      `C-1 当前分支为 "${branch}"，开发流程约定在 "${DEV_BRANCH}" 上进行。\n` +
        `        （这是**开发流程**检查，不是产品测试 —— 故未包含在 npm test 中）`,
    );
  } else {
    checks.push(`C-1 当前分支 = ${branch}`);
  }
} else {
  checks.push('C-1 开发分支策略检查（--policy 模式才启用，未计入产品测试）');
}

/* ==========================================================================
   输出
   ========================================================================== */
console.log('=== GitHub 操作规则 · 本地状态审计 ===');
console.log(
  '（本脚本是**本地状态审计**，不是权限控制系统；远端 main 的保护由 GitHub Rulesets 承担）\n',
);
for (const c of checks) console.log('  ✅ ' + c);
for (const w of warnings) console.log('  ⚠️  ' + w);
if (violations.length) {
  console.log('\n❌ 违反的约定：');
  for (const v of violations) console.log('  - ' + v);
  console.log('\n规则全文见 GITHUB-RULES.md。');
  process.exit(1);
}
console.log('\n✅ 本地状态审计通过（未发现违反约定的情况）。');
if (warnings.length) {
  console.log(`   注：有 ${warnings.length} 项提示需人工确认（见上 ⚠️）。`);
}
process.exit(0);
