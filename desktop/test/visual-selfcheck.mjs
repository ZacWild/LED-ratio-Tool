/**
 * LED-ratio-Tool 桌面版 · 视觉回归比对器自检（负控）
 * ============================================================================
 * 目的：证明视觉回归的**比对器本身**可信。
 * 🔴 若比对器恒返回 0 差异，则视觉回归的「全部通过」是**假通过** ——
 *    这是回归测试最危险的失效模式（测试永远绿，缺陷永远漏）。
 *
 * 本自检做 5 件事：
 *   ① PNG 解码正确（尺寸与缓冲长度）
 *   ② encode → decode 往返**像素级**一致（编码器无损）
 *   ③ 注入 100 万像素差异 → 必须被检出且超阈值
 *   ④ 注入 **1 个**像素差异 → 必须被检出（证明不是「大块差异才检出」）
 *   ⑤ 注入**遮罩区内**的差异 → 必须被排除（证明遮罩规则真实生效）
 *
 * 用法：node desktop/test/visual-selfcheck.mjs
 * 退出码：0 = 全部通过；1 = 自检失败（比对器不可信 → 视觉回归结论一律作废）
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP = path.join(__dirname, '..');

/**
 * 从 visual-regression.mjs 中提取三个纯函数（不执行其 main）。
 * 🔴 用「截断 main 调用 + 追加 export」的方式，避免复制实现导致两处漂移。
 */
function loadComparator() {
  const src = fs.readFileSync(path.join(__dirname, 'visual-regression.mjs'), 'utf8');
  const marker = /main\(\)\.catch\([\s\S]*$/;
  if (!marker.test(src)) throw new Error('未找到 main() 调用锚点，无法提取比对器');
  const patched = src.replace(marker,
    'export { decodePng, encodePng, comparePixels, MASKS, THRESHOLD_RATIO };');
  const tmp = path.join(process.env.TEMP || '.', `vr-selfcheck-${process.pid}.mjs`);
  fs.writeFileSync(tmp, patched, 'utf8');
  return import(pathToFileURL(tmp).href).then((m) => ({ m, tmp }));
}

async function main() {
  console.log('=== 视觉回归比对器自检（负控）===\n');
  const { m, tmp } = await loadComparator();
  const checks = [];
  const ok = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`  ${pass ? '✅' : '❌'} ${name}`);
    console.log(`       ${detail}`);
  };

  // 基准图（由 visual-regression.mjs --accept 建立）
  const baseFile = path.join(DESKTOP, 'test', 'baselines', 'shots', 'baseline-1440x900.png');
  if (!fs.existsSync(baseFile)) {
    console.error('❌ 基准图缺失：' + baseFile);
    console.error('   请先执行：node desktop/test/visual-regression.mjs --accept');
    process.exit(1);
  }
  const a = m.decodePng(fs.readFileSync(baseFile));

  // ① 解码正确
  ok('① PNG 解码正确',
    a.width === 1440 && a.height === 900 && a.data.length === a.width * a.height * 4,
    `解码为 ${a.width}×${a.height}，缓冲 ${a.data.length} 字节（期望 ${a.width * a.height * 4}）`);

  // ② 往返一致
  const re = m.decodePng(m.encodePng(a.width, a.height, a.data));
  ok('② encode → decode 往返像素级一致', re.data.equals(a.data),
    re.data.equals(a.data) ? '无损往返 ✓（比对器基础可信）' : '往返有损 → 比对器结论不可信');

  // ③ 大块差异
  const mod3 = Buffer.from(a.data);
  for (let i = 0; i < 1000000; i++) {
    const p = (i * 7) % (a.width * a.height);
    const o = p * 4;
    mod3[o] = 255; mod3[o + 1] = 0; mod3[o + 2] = 0;
  }
  const cmp3 = m.comparePixels(a, { width: a.width, height: a.height, data: mod3 }, m.MASKS);
  ok('③ 注入 100 万像素差异 → 检出且超阈值',
    cmp3.diff > 900000 && cmp3.ratio > m.THRESHOLD_RATIO,
    `检出 ${cmp3.diff} 像素（${(cmp3.ratio * 100).toFixed(2)}%）> 阈值 ${(m.THRESHOLD_RATIO * 100).toFixed(3)}%`);

  // ④ 单像素差异
  const mod4 = Buffer.from(a.data);
  mod4[0] = 255; mod4[1] = 0; mod4[2] = 0;
  const cmp4 = m.comparePixels(a, { width: a.width, height: a.height, data: mod4 }, m.MASKS);
  ok('④ 注入 1 个像素差异 → 检出', cmp4.diff >= 1,
    `检出 ${cmp4.diff} 像素（证明不是「大块差异才检出」）`);

  // ⑤ 遮罩区排除
  const mask = m.MASKS[0];
  const mod5 = Buffer.from(a.data);
  const [mx0, my0] = mask.rect;
  for (let y = my0; y < Math.min(my0 + 1, a.height); y++) {
    for (let x = mx0; x < Math.min(mx0 + 50, a.width); x++) {
      const o = (y * a.width + x) * 4;
      mod5[o] = 255; mod5[o + 1] = 0; mod5[o + 2] = 0;
    }
  }
  const cmp5 = m.comparePixels(a, { width: a.width, height: a.height, data: mod5 }, m.MASKS);
  ok('⑤ 遮罩区内差异 → 被排除', cmp5.diff === 0,
    `遮罩 ${mask.id} 内注入 50 像素 → 检出 ${cmp5.diff}（必须 0）`);

  try { fs.unlinkSync(tmp); } catch (e) { /* 临时文件清理失败不影响结论 */ }

  const failed = checks.filter((c) => !c.pass);
  console.log('\n============================================================');
  console.log(`自检结果：${checks.length - failed.length}/${checks.length} 通过`);
  if (failed.length) {
    console.error('❌ 比对器不可信 → 本轮视觉回归结论一律作废');
    process.exit(1);
  }
  console.log('✅ 比对器可信 → 视觉回归的「通过」结论有效');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ 自检异常：', e && e.stack ? e.stack : e);
  process.exit(1);
});
