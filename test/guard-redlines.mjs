/**
 * LED 大屏比例与视频画布换算工具 · 业务规则红线守卫
 * ---------------------------------------------------------------------------
 * 用途：把「核心计算逻辑与已确认的业务规则是不可改动的硬性红线」从报告里的
 *       原则，变成 CI 里可以自动判定的东西。
 *
 * 为什么需要这个文件：
 *   core.js 的 22 个导出有 64 条单元测试覆盖，但 app.js 里还有 8 处承载
 *   业务口径的常量与规则 —— 它们不在 core.js 里，改动它们**不会触发任何
 *   现有断言**。最典型的例子是 NEAR_21_9_PERCENT：现有用例把它夹逼在
 *   [2.381%, 23.81%) 区间内，把它从 2.5 改成 5 或 10 都一律不报警。
 *   而这个数字一旦变了，21:9 误报与漏报就会同时改变 —— 工具会给现场
 *   工程师一个错的数值结论，错结论的代价高于程序崩溃。
 *
 * 判定方式：哈希锁 + 语义锚点双重保险。
 *   1. 哈希锁：core.js 的 SHA-256 必须与 core.lock.json 一致，不一致直接失败。
 *      要更新锁必须显式跑 npm run core:accept（会强制先跑黄金向量）。
 *   2. 语义锚点：8 处受保护口径以「标识符 + 期望字面值」的形式登记，
 *      任何值变更都会被捕获。
 *
 * 零依赖：只用 node:fs / node:crypto / node:path / node:url。
 *
 * 用法：
 *   node test/guard-redlines.mjs            # 校验，失败退出码 1
 *   node test/guard-redlines.mjs --print    # 同时打印全部登记项
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

/* ==========================================================================
   1. 业务规则红线登记册
   ========================================================================== */

/**
 * core.js 的 22 个导出 —— 全部为红线，任何一项的语义或数值变化都必须
 * 先由项目负责人确认，并同步更新黄金测试向量。
 */
const CORE_EXPORTS = [
  'parseDimension', 'toMm', 'UNIT_TO_MM',
  'computeRatio', 'gcd', 'bestRational', 'matchStandards', 'STANDARDS',
  'canvasFromWidth', 'canvasFromHeight', 'fitAdvice', 'bestIntegerCanvas',
  'PRESETS', 'DEMO_CASES',
  'fmt', 'roundTo', 'roundErrorPercent', 'fmtErrorPercent',
  'EXACT_REL_TOL', 'APPROX_REL_TOL', 'MAX_DENOMINATOR', 'DEFAULT_TOLERANCE_PERCENT',
];

/**
 * app.js 内 8 处承载业务口径的常量与规则 —— 现有断言覆盖不足的重点防线。
 *
 * kind: 'value'  —— 必须逐字等于 expect
 * kind: 'anchor' —— 该标识符必须存在（用于函数/对象这类无法用字面值锁定的）
 *
 * 说明：行号仅作定位参考，不作为判定依据 —— 行号会随代码变动漂移，
 *       判定必须基于内容本身，否则守卫本身就会变成维护负担。
 */
const PROTECTED_APP_ANCHORS = [
  {
    id: 'A-01',
    name: '21:9 俗称误报阈值',
    symbol: 'NEAR_21_9_PERCENT',
    file: 'src/app.js',
    expect: '2.5',
    kind: 'value',
    why: '3440×1440 与真实 21:9 相差 2.3810%，阈值 2.5 恰好把这类「俗称 21:9」识别出来。改动会让误报与漏报同时改变。',
  },
  {
    id: 'A-02',
    name: '自定义整数比默认值',
    symbol: 'DEFAULT_CUSTOM_CANVAS_RATIO',
    file: 'src/app.js',
    expect: '65:36',
    kind: 'value',
    why: '65:36 是现场常用的大屏比例默认值，改动会静默改变所有新用户的默认档位。',
  },
  {
    id: 'A-03',
    name: '整数倍求解默认档位',
    symbol: 'customCanvasPrefer',
    file: 'src/app.js',
    expect: "'bounds'",
    kind: 'value',
    why: 'bounds = 优先给出界内解。切换到 exact 会改变双解候选的主次呈现。',
  },
  {
    id: 'A-04',
    name: '单位步长与小数位规格',
    file: 'src/app.js',
    expect: 'UNIT_SPEC',
    kind: 'anchor',
    why: 'm/cm/mm 三档的步长与小数位决定输入校验口径，改动会让同一物理尺寸产生不同可输入值。',
  },
  {
    id: 'A-05',
    name: '四层参数模型（现场参数 ②③④）',
    file: 'src/app.js',
    expect: 'SITE_FIELDS',
    kind: 'anchor',
    why: '四层参数模型是产品的业务骨架：②③④ 必须永远是手填事实，工具一个字都不推导。',
  },
  {
    id: 'A-06',
    name: '相对误差计算（core 未导出的镜像）',
    file: 'src/app.js',
    expect: 'relativeDiffPercent',
    kind: 'anchor',
    why: '这是 core.js 未导出、在表现层重算误差的镜像实现，与 core 的口径必须一致，否则会出现两套误差数字。',
  },
  {
    id: 'A-07',
    name: '偏差格式化（走 core.fmtErrorPercent）',
    file: 'src/app.js',
    expect: 'fmtErrorPercent',
    kind: 'anchor',
    why: '保证「非零误差不显示为 0」这条自相矛盾防护在表现层同样成立。',
  },
  {
    id: 'A-08',
    name: '结果徽标判定优先级',
    file: 'src/app.js',
    expect: 'renderBadge',
    kind: 'anchor',
    why: '优先级为 非标准比例 > 取整误差 > 严格匹配。renderBadge 是该判定的唯一实现处，改动会让同一个结果给出不同的结论标签。',
  },
];

/* ==========================================================================
   2. 校验实现
   ========================================================================== */

const failures = [];
const notes = [];

function fail(msg) { failures.push(msg); }

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/* ---- 2.1 core.js 哈希锁 ---- */
const lockPath = join(ROOT, 'core.lock.json');
const corePath = join(ROOT, 'src', 'core.js');

if (!existsSync(lockPath)) {
  fail(`缺少 core.lock.json —— 无法锁定 core.js 基线（应在仓库根目录存在）`);
} else {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const actual = sha256(corePath);
  if (lock.sha256 !== actual) {
    fail(
      `core.js 哈希不匹配（业务规则红线被改动或文件被替换）\n` +
      `        锁中记录: ${lock.sha256}\n` +
      `        当前实际: ${actual}\n` +
      `        若这是经确认的业务规则变更，请执行：npm run core:accept`
    );
  } else {
    notes.push(`core.js 哈希锁校验通过（sha256 ${actual.slice(0, 16)}…）`);
  }
}

/* ---- 2.2 core.js 导出清单 ---- */
const coreSrc = readFileSync(corePath, 'utf8');
const missingExports = CORE_EXPORTS.filter((n) => !new RegExp(`\\b${n}\\s*:`).test(coreSrc));
if (missingExports.length) {
  fail(`core.js 缺少受保护导出：${missingExports.join(', ')}`);
} else {
  notes.push(`core.js ${CORE_EXPORTS.length} 个受保护导出齐备`);
}

/* ---- 2.3 app.js 8 处受保护口径 ---- */
for (const anchor of PROTECTED_APP_ANCHORS) {
  const file = join(ROOT, anchor.file);
  if (!existsSync(file)) {
    fail(`${anchor.id} 锚定文件不存在：${anchor.file}`);
    continue;
  }
  const src = readFileSync(file, 'utf8');

  if (anchor.kind === 'value') {
    // 要求存在赋值语句且字面值一致。
    // 只匹配「标识符 = 值」，不假设声明形式（var / let / const 都可能），
    // 也不依赖行号 —— 判定必须基于内容，否则守卫本身会成为维护负担。
    const re = new RegExp(`\\b${escapeRe(anchor.symbol)}\\s*=\\s*([^;\\n]+)`);
    const m = src.match(re);
    if (!m) {
      fail(`${anchor.id} ${anchor.name}：未找到赋值语句（${anchor.file}）`);
      continue;
    }
    const value = m[1].trim().replace(/;$/, '').trim();
    // 允许末尾分号与引号风格差异，比较时统一去空白
    const norm = (s) => s.replace(/^['"]|['"]$/g, '').trim();
    if (norm(value) !== norm(anchor.expect)) {
      fail(
        `${anchor.id} ${anchor.name}：值已变更\n` +
        `        期望: ${anchor.expect}\n` +
        `        实际: ${value}\n` +
        `        理由: ${anchor.why}`
      );
    }
  } else {
    if (!new RegExp(`\\b${escapeRe(anchor.expect)}\\b`).test(src)) {
      fail(`${anchor.id} ${anchor.name}：标识符 ${anchor.expect} 已消失（${anchor.file}）\n        理由: ${anchor.why}`);
    }
  }
}
if (!failures.length) {
  notes.push(`app.js ${PROTECTED_APP_ANCHORS.length} 处受保护业务口径全部校验通过`);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ==========================================================================
   3. 输出
   ========================================================================== */

console.log('=== 业务规则红线守卫 ===');
for (const n of notes) console.log('  ✅ ' + n);
if (process.argv.includes('--print')) {
  console.log('\n--- 登记册 ---');
  console.log(`core.js 导出（${CORE_EXPORTS.length}）：`);
  console.log('  ' + CORE_EXPORTS.join(', '));
  console.log(`app.js 受保护口径（${PROTECTED_APP_ANCHORS.length}）：`);
  for (const a of PROTECTED_APP_ANCHORS) {
    console.log(`  ${a.id} ${a.name}  [${a.file}]  ${a.kind === 'value' ? '= ' + a.expect : '含 ' + a.expect}`);
  }
}

if (failures.length) {
  console.log('\n❌ 红线守卫失败：');
  for (const f of failures) console.log('  - ' + f);
  console.log('\n提示：业务规则变更必须由项目负责人确认，并同步更新黄金测试向量。');
  process.exit(1);
}

console.log('\n✅ 业务规则红线守卫全部通过。');
process.exit(0);
