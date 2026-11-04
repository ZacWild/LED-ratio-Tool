/**
 * LED-ratio-Tool · Git pre-push 钩子自测（真实标准输入协议）
 * ---------------------------------------------------------------------------
 * 🔴 目的：以 **Git 原生 pre-push 协议**（标准输入，每行
 *    `<local ref> <local sha> <remote ref> <remote sha>`）驱动真实 Hook，
 *    覆盖推送 / 删除分支 / 删除标签 / 多 ref 推送 / 空输入等场景。
 *    Hook 的历史缺陷（v1 未声明 PROTECTED_BRANCHES → 删除 main 仅告警）
 *    正是「没有 stdin 级自测」漏掉的 —— 本文件补上这一层。
 *
 * 用法：npm run test:hooks   （或 node test/githooks-selftest.mjs）
 * 退出码：0 = 全部通过；1 = 有失败用例
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const HOOK = join(ROOT, '.githooks', 'pre-push');
const ZERO = '0'.repeat(40);
const SHA = '1234567890123456789012345678901234567890';

const cases = [
  // ---- 推送：允许清单 ----
  { name: '推送 历史开发分支 feature/desktop-windows', stdin: `refs/heads/feature/desktop-windows ${SHA} refs/heads/feature/desktop-windows ${SHA}`, expect: 0 },
  { name: '推送 chore/* 工作分支', stdin: `refs/heads/chore/git-guardrails ${SHA} refs/heads/chore/git-guardrails ${SHA}`, expect: 0 },
  { name: '推送 docs/* 工作分支', stdin: `refs/heads/docs/x ${SHA} refs/heads/docs/x ${SHA}`, expect: 0 },
  { name: '推送 fix/* 工作分支', stdin: `refs/heads/fix/x ${SHA} refs/heads/fix/x ${SHA}`, expect: 0 },
  { name: '推送 test/* 工作分支', stdin: `refs/heads/test/x ${SHA} refs/heads/test/x ${SHA}`, expect: 0 },
  { name: '推送 refactor/* 工作分支', stdin: `refs/heads/refactor/x ${SHA} refs/heads/refactor/x ${SHA}`, expect: 0 },
  { name: '推送 perf/* 工作分支', stdin: `refs/heads/perf/x ${SHA} refs/heads/perf/x ${SHA}`, expect: 0 },
  // ---- 推送：拒绝 ----
  { name: '推送 main → 拒绝（R-4）', stdin: `refs/heads/main ${SHA} refs/heads/main ${SHA}`, expect: 1, contains: "拒绝推送到 'main'" },
  { name: '推送 master → 拒绝（R-4）', stdin: `refs/heads/master ${SHA} refs/heads/master ${SHA}`, expect: 1, contains: 'master' },
  { name: '推送非约定命名 foo → 拒绝', stdin: `refs/heads/foo ${SHA} refs/heads/foo ${SHA}`, expect: 1, contains: '不符合约定工作分支命名' },
  { name: '推送 feat/*（不在清单）→ 拒绝', stdin: `refs/heads/feat/x ${SHA} refs/heads/feat/x ${SHA}`, expect: 1 },
  // ---- 删除分支（🔴 v1 漏洞回归用例）----
  { name: '删除 main → 拒绝（v1 仅告警的漏洞回归）', stdin: `refs/heads/main ${ZERO} refs/heads/main ${SHA}`, expect: 1, contains: "拒绝删除受保护分支 'main'" },
  { name: '删除 master → 拒绝', stdin: `refs/heads/master ${ZERO} refs/heads/master ${SHA}`, expect: 1, contains: '拒绝删除受保护分支' },
  { name: '删除 feature/desktop-windows → 拒绝', stdin: `refs/heads/feature/desktop-windows ${ZERO} refs/heads/feature/desktop-windows ${SHA}`, expect: 1 },
  { name: '删除 feature/* 前缀分支 → 拒绝', stdin: `refs/heads/feature/anything ${ZERO} refs/heads/feature/anything ${SHA}`, expect: 1, contains: '拒绝删除受保护分支' },
  { name: '删除 chore/* 非受保护分支 → 允许（告警）', stdin: `refs/heads/chore/old ${ZERO} refs/heads/chore/old ${SHA}`, expect: 0, contains: '允许删除非受保护分支' },
  // ---- 标签 ----
  { name: '删除受保护标签 pre-desktop → 拒绝', stdin: `refs/tags/pre-desktop ${ZERO} refs/tags/pre-desktop ${SHA}`, expect: 1, contains: '拒绝删除受保护标签' },
  { name: '推送新标签 → 允许', stdin: `refs/tags/v1 ${SHA} refs/tags/v1 ${ZERO}`, expect: 0 },
  { name: '删除非受保护标签 v9 → 允许（告警）', stdin: `refs/tags/v9 ${ZERO} refs/tags/v9 ${SHA}`, expect: 0 },
  // ---- 多 ref 推送 ----
  { name: '多 ref：合法分支 ×2 → 允许', stdin: `refs/heads/chore/a ${SHA} refs/heads/chore/a ${SHA}\nrefs/heads/fix/b ${SHA} refs/heads/fix/b ${SHA}`, expect: 0 },
  { name: '多 ref：合法分支 + main 混推 → 整体拒绝', stdin: `refs/heads/chore/a ${SHA} refs/heads/chore/a ${SHA}\nrefs/heads/main ${SHA} refs/heads/main ${SHA}`, expect: 1, contains: '拒绝推送到' },
  { name: '多 ref：合法分支 + 删 main 混推 → 整体拒绝', stdin: `refs/heads/chore/a ${SHA} refs/heads/chore/a ${SHA}\nrefs/heads/main ${ZERO} refs/heads/main ${SHA}`, expect: 1, contains: '拒绝删除受保护分支' },
  // ---- 边界 ----
  { name: '空标准输入 → 放行（手动运行场景）', stdin: '', expect: 0 },
];

let failed = 0;
console.log('=== Git pre-push Hook 自测（真实 stdin 协议）===\n');
for (const c of cases) {
  const r = spawnSync('bash', [HOOK], { cwd: ROOT, input: c.stdin, encoding: 'utf8' });
  const code = r.status;
  const out = (r.stdout || '') + (r.stderr || '');
  const codeOk = code === c.expect;
  const textOk = !c.contains || out.includes(c.contains);
  const ok = codeOk && textOk;
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) {
    console.log(`       退出码 = ${code}（期望 ${c.expect}）${c.contains && !textOk ? `｜输出未包含 "${c.contains}"` : ''}`);
    console.log('       —— 输出 ——');
    for (const line of out.trim().split('\n')) console.log('       ' + line);
  }
}
console.log(`\n用例 ${cases.length} ｜ 通过 ${cases.length - failed} ｜ 失败 ${failed}`);
process.exit(failed ? 1 : 0);
