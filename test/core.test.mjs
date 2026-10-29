/**
 * LED 大屏比例与视频画布换算工具 —— 计算核心单元测试
 * 运行：node --test led-ratio-tool/test/core.test.mjs
 *
 * 测试风格：node:test + node:assert/strict，用例名用中文描述验收点。
 * core.js 是 UMD 封装，这里用 createRequire 以 CommonJS 方式引入。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../src/core.js');

const {
  parseDimension, toMm, computeRatio, gcd, matchStandards, STANDARDS,
  PRESETS, canvasFromWidth, canvasFromHeight, bestIntegerCanvas, fitAdvice,
  DEMO_CASES, fmt
} = core;

/* ==================== A. 单位与尺寸解析 ==================== */

test('A1 空字符串与纯空格返回 error=empty', () => {
  assert.equal(parseDimension('', 'm').error, 'empty');
  assert.equal(parseDimension('   ', 'm').error, 'empty');
  assert.equal(parseDimension('', 'm').ok, false);
  assert.equal(parseDimension('', 'm').mm, null);
});

test('A2 非法字符返回 error=nan（字母/多小数点/科学计数法/百分号）', () => {
  assert.equal(parseDimension('abc', 'm').error, 'nan');
  assert.equal(parseDimension('12abc', 'm').error, 'nan');
  assert.equal(parseDimension('1.2.3', 'm').error, 'nan');
  assert.equal(parseDimension('1e5', 'm').error, 'nan');
  assert.equal(parseDimension('12%', 'm').error, 'nan');
  assert.equal(parseDimension('m', 'm').error, 'nan');
  assert.equal(parseDimension('1.2.3', 'm').ok, false);
});

test('A3 零与负数返回 error=nonPositive', () => {
  assert.equal(parseDimension('0', 'm').error, 'nonPositive');
  assert.equal(parseDimension('-3', 'm').error, 'nonPositive');
  assert.equal(parseDimension('-0.5', 'm').error, 'nonPositive');
  assert.equal(parseDimension('0', 'm').ok, false);
});

test('A4 单位换算正确：m×1000、cm×10、mm×1', () => {
  assert.equal(parseDimension('14', 'm').mm, 14000);
  assert.equal(parseDimension('1400', 'cm').mm, 14000);
  assert.equal(parseDimension('14000', 'mm').mm, 14000);
  assert.equal(toMm(14, 'm'), 14000);
  assert.equal(toMm(1400, 'cm'), 14000);
  assert.equal(toMm(14000, 'mm'), 14000);
});

test('A5 支持小数输入：14.5m / 3.75m / 2.34cm', () => {
  assert.equal(parseDimension('14.5', 'm').mm, 14500);
  assert.equal(parseDimension('3.75', 'm').mm, 3750);
  assert.equal(parseDimension('2.34', 'cm').mm, 23.4);
  assert.equal(parseDimension('14.5', 'm').ok, true);
});

test('A6 单位切换后比例不变', () => {
  const a = computeRatio(parseDimension('14', 'm').mm, parseDimension('4', 'm').mm);
  const b = computeRatio(parseDimension('1400', 'cm').mm, parseDimension('400', 'cm').mm);
  const c = computeRatio(parseDimension('14000', 'mm').mm, parseDimension('4000', 'mm').mm);
  assert.equal(a.ratio, b.ratio);
  assert.equal(a.ratio, c.ratio);
  assert.equal(a.reducedText, '7:2');
});

test('A7 宽高互换后比例正确反转', () => {
  const fwd = computeRatio(14000, 4000);
  const rev = computeRatio(4000, 14000);
  assert.equal(fwd.ratio, 3.5);
  assert.equal(rev.ratio, 1 / 3.5);
  assert.ok(Math.abs(rev.ratio - 1 / fwd.ratio) < 1e-12);
  // 互为倒数时，自身反转关系必须自洽
  assert.ok(Math.abs(fwd.ratio * rev.ratio - 1) < 1e-12);
});

test('A8 非法输入返回错误对象而不是抛异常', () => {
  assert.doesNotThrow(() => parseDimension('abc', 'm'));
  assert.doesNotThrow(() => parseDimension('', 'm'));
  assert.doesNotThrow(() => parseDimension('-1', 'm'));
  assert.doesNotThrow(() => computeRatio(0, 100));
  assert.doesNotThrow(() => computeRatio(100, 0));
  assert.equal(computeRatio(0, 100).ok, false);
  assert.equal(computeRatio(100, 0).error, 'invalidDimension');
});

/* ==================== B. 比例计算 ==================== */

test('B1 14m×4m：ratio=3.5、reduced 7:2、decimal "3.5000"、exact=true', () => {
  const r = computeRatio(14000, 4000);
  assert.equal(r.ratio, 3.5);
  assert.equal(r.decimal, '3.5000');
  assert.deepEqual(r.reduced, { a: 7, b: 2 });
  assert.equal(r.reducedText, '7:2');
  assert.equal(r.exact, true);
  assert.equal(r.nearest, null);
});

test('B2 3440×1440：ratio≈2.3889、最简整数比 43:18', () => {
  const r = computeRatio(3440, 1440);
  assert.equal(r.decimal, '2.3889');
  assert.equal(r.reducedText, '43:18');
  assert.equal(r.exact, true);
  // 43:18 必须严格区别于 7:3（21:9 的严格比例）
  assert.notEqual(r.reducedText, '7:3');
});

test('B3 21:9 的严格数学比例是 7:3，不是 21:9 字符串', () => {
  const r = computeRatio(21000, 9000);
  assert.equal(r.reducedText, '7:3');
  assert.equal(r.ratio, 7 / 3);
});

test('B4 非整除比例返回 nearest 且必须带 exact=false', () => {
  // 1.2345678mm : 1mm —— 放大 1000 取整后 gcd 还原不回真实比例
  const r = computeRatio(1.2345678, 1);
  assert.equal(r.exact, false);
  assert.equal(r.reduced, null);
  assert.equal(r.reducedText, '');
  assert.ok(r.nearest, '非精确比例必须给出 nearest');
  assert.equal(r.nearest.exact, false);
  assert.ok(r.nearest.relError <= 1e-6);
});

test('B5 nearest 不得覆盖权威值：ratio/decimal 始终来自真实尺寸', () => {
  const r = computeRatio(1.2345678, 1);
  assert.equal(r.ratio, 1.2345678);
  assert.equal(r.decimal, '1.2346');
  assert.notEqual(r.ratio, r.nearest.a / r.nearest.b);
});

test('B6 近似比的相对误差必须 ≤ 1e-6（超出则不给 nearest）', () => {
  const r = computeRatio(1.2345678, 1);
  assert.ok(r.nearest.relError <= 1e-6);
  assert.ok(r.nearest.relErrorPercent <= 0.0001);
});

test('B7 precision 对象说明精度策略与判定依据', () => {
  const r = computeRatio(14000, 4000);
  assert.ok(r.precision, '必须返回 precision 说明');
  assert.equal(r.precision.scale, 1000);
  assert.equal(r.precision.scaledWidth, 14000000);
  assert.equal(r.precision.scaledHeight, 4000000);
  assert.equal(r.precision.gcd, 2000000);
  assert.equal(r.precision.strategy, 'scaled-integer-gcd');
  assert.equal(r.precision.exactTolerance, 1e-9);
});

test('B8 gcd 计算正确', () => {
  assert.equal(gcd(14000000, 4000000), 2000000);
  assert.equal(gcd(12, 18), 6);
  assert.equal(gcd(7, 2), 1);
  assert.equal(gcd(0, 5), 5);
});

test('B9 极端长宽比 100000mm×1mm 不产生 NaN/Infinity', () => {
  const r = computeRatio(100000, 1);
  assert.ok(Number.isFinite(r.ratio));
  // decimal 按约定是字符串，必须能被解析回有限数
  assert.equal(typeof r.decimal, 'string');
  assert.ok(Number.isFinite(Number(r.decimal)));
  assert.equal(r.ratio, 100000);
  assert.equal(r.reducedText, '100000:1');
  assert.equal(r.exact, true);
});

test('B10 小数输入无明显精度错误', () => {
  const r = computeRatio(parseDimension('14.5', 'm').mm, parseDimension('4', 'm').mm);
  assert.equal(r.ratio, 3.625);
  assert.equal(r.decimal, '3.6250');
  assert.equal(r.reducedText, '29:8');
  assert.equal(r.exact, true);
});

/* ==================== C. 常见比例库 ==================== */

test('C1 STANDARDS 至少包含任务要求的全部条目', () => {
  const names = STANDARDS.map(s => s.name);
  const required = ['16:9', '16:10', '4:3', '3:2', '1:1', '9:16', '4:5', '21:9', '32:9',
    '2.35:1', '2.39:1', '2.40:1', '3440×1440', '3840×1646', '3840×2160', '1920×1080'];
  for (const name of required) {
    assert.ok(names.includes(name), '缺少标准条目：' + name);
  }
});

test('C2 21:9 必须标注 isTrueStandard=false 且严格比例为 7:3', () => {
  const s = STANDARDS.find(x => x.name === '21:9');
  assert.equal(s.isTrueStandard, false);
  assert.equal(s.exactValue, 7 / 3);
  assert.ok(s.note.includes('俗称'), 'note 必须说明 21:9 为俗称');
});

test('C3 小数比例用高精度小数表示', () => {
  assert.equal(STANDARDS.find(x => x.name === '2.35:1').exactValue, 2.35);
  assert.equal(STANDARDS.find(x => x.name === '2.39:1').exactValue, 2.39);
  assert.equal(STANDARDS.find(x => x.name === '2.40:1').exactValue, 2.4);
});

test('C4 真实分辨率条目按像素实算比例', () => {
  assert.equal(STANDARDS.find(x => x.name === '3440×1440').exactValue, 3440 / 1440);
  assert.equal(STANDARDS.find(x => x.name === '3840×1646').exactValue, 3840 / 1646);
  assert.equal(STANDARDS.find(x => x.name === '3840×2160').exactValue, 3840 / 2160);
  assert.equal(STANDARDS.find(x => x.name === '1920×1080').exactValue, 1920 / 1080);
});

test('C5 matchStandards 按相对误差升序返回并标出 closest', () => {
  const res = matchStandards(16 / 9);
  assert.equal(res.ok, true);
  for (let i = 1; i < res.matches.length; i++) {
    assert.ok(res.matches[i - 1].diffPercent <= res.matches[i].diffPercent, '必须按相对误差升序');
  }
  assert.ok(res.closest);
  assert.equal(res.closest.closest, true);
  assert.equal(res.matches.filter(m => m.closest === true).length, 1);
});

test('C6 相对误差定义：|ratio - 标准值| / 标准值 × 100%', () => {
  const res = matchStandards(3.5);
  const item = res.matches.find(m => m.name === '21:9');
  const expected = Math.abs(3.5 - 7 / 3) / (7 / 3) * 100;
  assert.ok(Math.abs(item.diffPercent - expected) < 1e-3);
});

test('C7 3.5 不被判为 21:9（超过容差即非标准比例）', () => {
  const res = matchStandards(3.5);
  const item = res.matches.find(m => m.name === '21:9');
  assert.equal(item.withinTolerance, false);
  assert.ok(item.diffPercent > 0.5);
  assert.equal(res.isStandard, false, '3.5 不在 0.5% 容差内，应识别为非标准比例');
});

test('C8 3440×1440 匹配自身且不匹配严格 21:9', () => {
  const res = matchStandards(3440 / 1440);
  const self = res.matches.find(m => m.name === '3440×1440');
  const std21 = res.matches.find(m => m.name === '21:9');
  assert.equal(self.exactMatch, true);
  assert.equal(self.withinTolerance, true);
  assert.equal(std21.withinTolerance, false);
});

test('C9 16:9 与 1920×1080 精确匹配', () => {
  const res = matchStandards(16 / 9);
  const s169 = res.matches.find(m => m.name === '16:9');
  assert.equal(s169.exactMatch, true);
  assert.equal(s169.withinTolerance, true);
});

test('C10 容差可自定义', () => {
  const strict = matchStandards(3.5, 0.5);
  const loose = matchStandards(3.5, 60);
  assert.equal(strict.isStandard, false);
  assert.equal(loose.isStandard, true);
  assert.equal(loose.tolerance, 60);
});

/* ==================== D. 视频画布换算 ==================== */

test('D1 canvasFromWidth：4900px 宽 @3.5 → 理论高 1400、输出 4900×1400、strictMatch=true', () => {
  const c = canvasFromWidth(4900, 3.5);
  assert.equal(c.ok, true);
  assert.equal(c.theoreticalHeight, 1400);
  assert.equal(c.roundedHeight, 1400);
  assert.equal(c.bestRoundedHeight, 1400);
  assert.equal(c.outputWidth, 4900);
  assert.equal(c.outputHeight, 1400);
  assert.equal(c.outputRatio, 3.5);
  assert.equal(c.strictMatch, true);
  assert.equal(c.ratioErrorPercent, 0);
  assert.equal(c.pixelErrorPercent, 0);
});

test('D2 canvasFromWidth：3840px 宽 @21:9 → 理论高 1645.7143、整数 1646、strictMatch=false', () => {
  const c = canvasFromWidth(3840, 7 / 3);
  assert.equal(c.theoreticalHeight, 3840 / (7 / 3));
  assert.equal(c.theoreticalHeightText, '1645.7143');
  assert.equal(c.roundedHeight, 1646);
  assert.equal(c.bestRoundedHeight, 1646);
  assert.equal(c.outputWidth, 3840);
  assert.equal(c.outputHeight, 1646);
  assert.equal(c.strictMatch, false);
  assert.ok(c.ratioErrorPercent > 0, '必须显示微小比例误差');
  assert.ok(c.ratioErrorPercent < 0.1, '误差必须很小');
});

test('D3 canvasFromWidth：1920×1080 对 16:9 必须 strictMatch=true', () => {
  const c = canvasFromWidth(1920, 16 / 9);
  assert.equal(c.outputHeight, 1080);
  assert.equal(c.outputRatio, 16 / 9);
  assert.equal(c.strictMatch, true);
  assert.equal(c.ratioErrorPercent, 0);
});

test('D4 canvasFromWidth：3840×2160 对 16:9 必须 strictMatch=true', () => {
  const c = canvasFromWidth(3840, 16 / 9);
  assert.equal(c.outputHeight, 2160);
  assert.equal(c.outputRatio, 16 / 9);
  assert.equal(c.strictMatch, true);
  assert.equal(c.ratioErrorPercent, 0);
});

test('D5 canvasFromHeight 与 canvasFromWidth 对称', () => {
  const c = canvasFromHeight(1080, 16 / 9);
  assert.equal(c.theoreticalWidth, 1920);
  assert.equal(c.bestRoundedWidth, 1920);
  assert.equal(c.outputWidth, 1920);
  assert.equal(c.outputHeight, 1080);
  assert.equal(c.strictMatch, true);

  // 高度侧同样会暴露取整误差：1080 高配 65:36 恰好等于 1950（严格整数倍）
  const exact = canvasFromHeight(1080, 65 / 36);
  assert.equal(exact.outputWidth, 1950);
  assert.equal(exact.strictMatch, true);

  // 而 1000 高配 65:36 时，理论宽 1805.5555… 无法取整成严格整数倍
  const c2 = canvasFromHeight(1000, 65 / 36);
  assert.equal(c2.outputWidth, 1806);
  assert.equal(c2.strictMatch, false);
  assert.ok(c2.ratioErrorPercent > 0);
});

test('D6 比例误差与像素误差是两个独立字段', () => {
  const c = canvasFromWidth(1920, 65 / 36);
  assert.equal(typeof c.ratioErrorPercent, 'number');
  assert.equal(typeof c.pixelErrorPercent, 'number');
  assert.ok(c.ratioErrorPercent > 0);
  assert.ok(c.pixelErrorPercent > 0);
  // 1920px 宽下高度误差约 0.3846px，相对目标高度约 0.036%
  assert.ok(Math.abs(c.pixelErrorPercent - 0.0362) < 0.001);
});

test('D7 65:36 在 1920px 宽下输出 1920×1063 且 strictMatch=false', () => {
  const c = canvasFromWidth(1920, 65 / 36);
  assert.equal(c.outputWidth, 1920);
  assert.equal(c.outputHeight, 1063);
  assert.equal(c.strictMatch, false);
  assert.ok(c.ratioErrorPercent > 0);
});

test('D8 fitAdvice：比例一致判为 exact', () => {
  const a = fitAdvice(1920, 1080, 16 / 9);
  assert.equal(a.ok, true);
  assert.equal(a.mode, 'exact');
  assert.equal(a.cropPx, 0);
  assert.equal(a.pillarboxPx, 0);
});

test('D9 fitAdvice：内容更宽判为 crop，内容更窄判为 letterbox', () => {
  const wide = fitAdvice(1920, 1080, 21 / 9);
  assert.equal(wide.mode, 'crop');
  assert.ok(wide.cropPx > 0, '裁切量必须为正');
  assert.equal(wide.pillarboxPx, 0);

  const narrow = fitAdvice(1920, 1080, 4 / 5);
  assert.equal(narrow.mode, 'letterbox');
  assert.ok(narrow.pillarboxPx > 0, '黑边量必须为正');
  assert.equal(narrow.cropPx, 0);
});

test('D10 fitAdvice 数值均为有限非负，且绝不建议拉伸', () => {
  for (const [w, h, r] of [[1920, 1080, 16 / 9], [1920, 1080, 21 / 9], [1920, 1080, 4 / 5],
    [3440, 1440, 7 / 3], [1080, 1920, 9 / 16]]) {
    const a = fitAdvice(w, h, r);
    assert.equal(a.ok, true);
    assert.ok(Number.isFinite(a.cropPx) && a.cropPx >= 0);
    assert.ok(Number.isFinite(a.pillarboxPx) && a.pillarboxPx >= 0);
    assert.ok(Number.isFinite(a.coverCropPx) && a.coverCropPx >= 0);
    assert.ok(Number.isFinite(a.containBarPx) && a.containBarPx >= 0);
    assert.ok(['crop', 'letterbox', 'exact'].includes(a.mode));
  }
});

test('D11 fitAdvice 必须标明裁切/黑边的轴向（供 UI 画叠加层）', () => {
  // 内容比画布宽 → 裁左右（x 轴）
  const wide = fitAdvice(1920, 1080, 21 / 9);
  assert.equal(wide.mode, 'crop');
  assert.equal(wide.cropAxis, 'x');
  assert.equal(wide.cropPx, 300);
  assert.equal(wide.pillarboxAxis, null);
  // 备选方案是上下方向（y 轴）
  assert.equal(wide.coverCropAxis, 'x');
  assert.equal(wide.containBarAxis, 'y');

  // 内容比画布窄 → 左右补黑边（x 轴）
  const narrow = fitAdvice(1920, 1080, 4 / 5);
  assert.equal(narrow.mode, 'letterbox');
  assert.equal(narrow.pillarboxAxis, 'x');
  assert.equal(narrow.pillarboxPx, 528);
  assert.equal(narrow.cropAxis, null);
  assert.equal(narrow.coverCropAxis, 'y');
  assert.equal(narrow.containBarAxis, 'x');

  // 比例一致时无裁切无黑边，轴向全部为 null
  const exact = fitAdvice(1920, 1080, 16 / 9);
  assert.equal(exact.cropAxis, null);
  assert.equal(exact.pillarboxAxis, null);
  assert.equal(exact.coverCropAxis, null);
  assert.equal(exact.containBarAxis, null);
});

test('D11 fitAdvice 非法输入返回 error 而不是抛异常', () => {
  assert.equal(fitAdvice(0, 1080, 16 / 9).ok, false);
  assert.equal(fitAdvice(1920, -1, 16 / 9).ok, false);
  assert.equal(fitAdvice(1920, 1080, 0).ok, false);
  assert.doesNotThrow(() => fitAdvice(NaN, 1080, 16 / 9));
});

/* ==================== E. 整数倍画布 ==================== */

test('E1 16:9 在 1920×1080 约束下给出精确解 1920×1080（k=120）', () => {
  const c = bestIntegerCanvas(16 / 9, { maxWidth: 1920, maxHeight: 1080 });
  assert.equal(c.ok, true);
  assert.equal(c.width, 1920);
  assert.equal(c.height, 1080);
  assert.equal(c.k, 120);
  assert.equal(c.exact, true);
});

test('E2 65:36 在 1920×1080 约束下给出精确解 1950×1080（k=30）', () => {
  const c = bestIntegerCanvas(65 / 36, { maxWidth: 1920, maxHeight: 1080 });
  assert.equal(c.ok, true);
  assert.equal(c.width, 1950);
  assert.equal(c.height, 1080);
  assert.equal(c.k, 30);
  assert.equal(c.exact, true);
  assert.equal(c.reducedText, '65:36');
});

test('E3 整数倍画布的比例严格等于输入比例', () => {
  for (const ratio of [16 / 9, 65 / 36, 7 / 3, 1, 4 / 3]) {
    const c = bestIntegerCanvas(ratio, { maxWidth: 1920, maxHeight: 1080 });
    assert.equal(c.exact, true);
    assert.ok(Math.abs(c.width / c.height - ratio) < 1e-12);
  }
});

test('E4 无法精确表示的比率返回 exact=false 且带误差与说明', () => {
  const c = bestIntegerCanvas(1.2345678, { maxWidth: 1920, maxHeight: 1080 });
  assert.equal(c.ok, true);
  assert.equal(c.exact, false);
  assert.equal(typeof c.ratioErrorPercent, 'number');
  assert.ok(c.ratioErrorPercent > 0);
  assert.ok(c.note && c.note.length > 0, '必须给出标注说明');
});

test('E5 非法边界返回 error 而不是抛异常', () => {
  assert.equal(bestIntegerCanvas(16 / 9, { maxWidth: 0, maxHeight: 1080 }).ok, false);
  assert.equal(bestIntegerCanvas(16 / 9, { maxWidth: 1920, maxHeight: -1 }).ok, false);
  assert.doesNotThrow(() => bestIntegerCanvas(NaN, { maxWidth: 1920, maxHeight: 1080 }));
});

test('E6 连 1 倍整数比都放不下时明确报告无解', () => {
  // 16:9 的最小整数倍需要 9px 高，maxHeight=5 时一个都放不下
  const c = bestIntegerCanvas(16 / 9, { maxWidth: 10000, maxHeight: 5 });
  assert.equal(c.ok, false);
  assert.equal(c.error, 'noSolution');
});

test('E7 高度驱动解超出 maxWidth 时必须诚实报告（不得谎称落在界内）', () => {
  // 16:9 最小整数倍为 16×9，在 10×10 的界内放不下：给出最小解并标注溢出
  const c = bestIntegerCanvas(16 / 9, { maxWidth: 10, maxHeight: 10 });
  assert.equal(c.ok, true);
  assert.equal(c.width, 16);
  assert.equal(c.height, 9);
  assert.equal(c.k, 1);
  assert.equal(c.exceedsMaxWidth, true);
  assert.equal(c.overflowPx, 6);
  // 界内无解时 withinBounds 必须为 null，而不是退化成 0×0 这种无意义值
  assert.equal(c.fitsInBounds, false);
  assert.equal(c.withinBounds, null);
});

/* ==================== F. 预设规格 ==================== */

test('F1 PRESETS 包含任务要求的全部规格', () => {
  const names = PRESETS.map(p => p.name);
  for (const name of ['1920×1080', '2560×1440', '3440×1440', '3840×2160', '3840×1646', '4096×2160', '5120×2160']) {
    assert.ok(names.includes(name), '缺少预设：' + name);
  }
});

test('F2 每条预设的 realRatio 由像素宽高实算', () => {
  for (const p of PRESETS) {
    assert.equal(p.realRatio, p.width / p.height);
    assert.ok(Number.isFinite(p.realRatio));
  }
});

test('F3 预设比例与错误判定一致：3840×2160 与 1920×1080 同为 16:9', () => {
  const a = PRESETS.find(p => p.name === '3840×2160');
  const b = PRESETS.find(p => p.name === '1920×1080');
  assert.equal(a.realRatio, b.realRatio);
  assert.equal(a.realRatio, 16 / 9);
});

/* ==================== G. 演示案例 ==================== */

test('G1 DEMO_CASES 至少包含 6 条案例，每条带中文名与说明', () => {
  assert.ok(DEMO_CASES.length >= 6);
  for (const c of DEMO_CASES) {
    assert.ok(c.name && c.name.length > 0, '案例必须有中文名');
    assert.ok(c.description && c.description.length > 0, '案例必须有说明');
    assert.ok(c.id);
    assert.ok(c.result);
  }
});

test('G2 案例A：14m×4m → 3.5 / 7:2 / 4900×1400 / strictMatch，且不被判为 21:9', () => {
  const c = DEMO_CASES.find(x => x.id === 'case-a-14m-4m');
  assert.ok(c);
  assert.equal(c.result.ratio, 3.5);
  assert.equal(c.result.decimal, '3.5000');
  assert.equal(c.result.reducedText, '7:2');
  assert.equal(c.result.canvasWidth, 4900);
  assert.equal(c.result.canvasHeight, 1400);
  assert.equal(c.result.strictMatch, true);
  assert.equal(c.result.matches21x9, false);
  assert.ok(c.result.diffPercent21x9 > 0.5);
});

test('G3 案例B：21:9 → reduced 7:3、3840×1646、strictMatch=false 且有微小误差', () => {
  const c = DEMO_CASES.find(x => x.id === 'case-b-21x9-3840');
  assert.ok(c);
  assert.equal(c.result.reducedText, '7:3');
  assert.equal(c.result.canvasWidth, 3840);
  assert.equal(c.result.canvasHeight, 1646);
  assert.equal(c.result.strictMatch, false);
  assert.ok(c.result.ratioErrorPercent > 0);
  assert.ok(c.result.ratioErrorPercent < 0.1);
});

test('G4 案例C：3440×1440 ≈ 2.3889 且不被判为严格 21:9', () => {
  const c = DEMO_CASES.find(x => x.id === 'case-c-3440x1440');
  assert.ok(c);
  assert.equal(c.result.decimal, '2.3889');
  assert.equal(c.result.matches21x9, false);
});

test('G5 案例D：16:9 在 1920×1080 与 3840×2160 下均 strictMatch=true', () => {
  const c = DEMO_CASES.find(x => x.id === 'case-d-16x9');
  assert.ok(c);
  assert.equal(c.result.canvas1920.strictMatch, true);
  assert.equal(c.result.canvas3840.strictMatch, true);
  assert.equal(c.result.canvas1920.width, 1920);
  assert.equal(c.result.canvas1920.height, 1080);
  assert.equal(c.result.canvas3840.width, 3840);
  assert.equal(c.result.canvas3840.height, 2160);
});

test('G6 案例E：65:36 → 1920×1063 非严格匹配，并给出精确方案 1950×1080', () => {
  const c = DEMO_CASES.find(x => x.id === 'case-e-65x36');
  assert.ok(c);
  assert.equal(c.result.canvasWidth, 1920);
  assert.equal(c.result.canvasHeight, 1063);
  assert.equal(c.result.strictMatch, false);
  assert.ok(c.result.ratioErrorPercent > 0);
  assert.equal(c.result.exactCanvas.width, 1950);
  assert.equal(c.result.exactCanvas.height, 1080);
  assert.equal(c.result.exactCanvas.k, 30);
});

test('G7 案例F：异常输入返回对应 error，且单位切换/互换/极端比例均正常', () => {
  const c = DEMO_CASES.find(x => x.id === 'case-f-robustness');
  assert.ok(c);
  assert.equal(c.result.errors.empty, 'empty');
  assert.equal(c.result.errors.zero, 'nonPositive');
  assert.equal(c.result.errors.negative, 'nonPositive');
  assert.equal(c.result.errors.illegal, 'nan');
  assert.equal(c.result.unitSwitch.meters, 14000);
  assert.equal(c.result.unitSwitch.centimeters, 14000);
  assert.equal(c.result.unitSwitch.millimeters, 14000);
  assert.ok(Math.abs(c.result.swappedRatio - 1 / 3.5) < 1e-12);
  assert.equal(c.result.decimalInput.value, 3750);
  assert.ok(Number.isFinite(c.result.extreme.ratio));
});

/* ==================== H. 数值健壮性 ==================== */

test('H1 fmt 统一保留 4 位小数', () => {
  assert.equal(fmt(3.5), '3.5000');
  assert.equal(fmt(2.388888888888889), '2.3889');
  assert.equal(fmt(0), '0.0000');
  assert.equal(fmt(1 / 3), '0.3333');
  assert.equal(fmt(-0.00001), '0.0000');
  assert.equal(fmt(NaN), '—');
  assert.equal(fmt(Infinity), '—');
});

test('H2 所有对外数值必须有限（非 NaN / Infinity）', () => {
  const ratios = [computeRatio(14000, 4000), computeRatio(1.2345678, 1), computeRatio(100000, 1)];
  const canvases = [canvasFromWidth(4900, 3.5), canvasFromWidth(3840, 7 / 3), canvasFromHeight(1080, 65 / 36)];
  const advices = [fitAdvice(1920, 1080, 21 / 9), fitAdvice(1920, 1080, 4 / 5)];
  for (const obj of ratios.concat(canvases).concat(advices)) {
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'number') {
        assert.ok(Number.isFinite(v), '数值必须有限：' + key + ' = ' + v);
      }
    }
  }
});

test('H3 极端输入不产生 NaN/Infinity', () => {
  const cases = [
    computeRatio(1e-3, 1e9), computeRatio(1e9, 1e-3),
    canvasFromWidth(1, 1e-9), canvasFromHeight(1, 1e9),
    fitAdvice(1, 1, 1e9), bestIntegerCanvas(1e-9, { maxWidth: 1920, maxHeight: 1080 })
  ];
  for (const obj of cases) {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'number') {
        assert.ok(Number.isFinite(obj[key]), '数值必须有限：' + key);
      }
    }
  }
});

test('H4 全流程（解析→比例→画布→标准比对）不抛异常且数值有限', () => {
  assert.doesNotThrow(() => {
    const p = parseDimension('14.5', 'm');
    const r = computeRatio(p.mm, parseDimension('4', 'm').mm);
    const c = canvasFromWidth(4900, r.ratio);
    const m = matchStandards(r.ratio);
    assert.ok(Number.isFinite(r.ratio));
    assert.ok(Number.isFinite(c.outputRatio));
    assert.ok(Array.isArray(m.matches));
  });
});

test('H5 极端比例不得让画布尺寸溢出成 Infinity', () => {
  const c = bestIntegerCanvas(1e308, { maxWidth: 1920, maxHeight: 1080 });
  assert.equal(c.ok, false);
  assert.equal(c.error, 'overflow');
  assert.equal(c.width, null);
  assert.equal(c.height, null);

  // 画布换算同样不得吐出 Infinity
  const cw = canvasFromWidth(100, 1e-308);
  assert.equal(cw.ok, false);
  assert.equal(cw.error, 'overflow');
  const ch = canvasFromHeight(100, 1e308);
  assert.equal(ch.ok, false);
  assert.equal(ch.error, 'overflow');
});

test('H6 宽高相差悬殊时比例计算必须报错而不是溢出', () => {
  const r = computeRatio(1e308, 1e-308);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'overflow');
  assert.equal(r.ratio, null);

  const a = fitAdvice(1e308, 1e-308, 1.5);
  assert.equal(a.ok, false);
  assert.equal(a.error, 'overflow');
});

test('H7 穷举极端输入：所有对外数值必须有限', () => {
  const vals = [0, -1, NaN, Infinity, -Infinity, 1e308, -1e308, 1e-308, 5e-324,
    Number.MAX_VALUE, Number.MIN_VALUE, 2 ** 53];
  for (const v of vals) {
    for (const w of [1, 100, 1920, 1e-9, 1e9]) {
      const results = [
        computeRatio(v, w), computeRatio(w, v),
        canvasFromWidth(v, w), canvasFromWidth(w, v),
        canvasFromHeight(v, w), canvasFromHeight(w, v),
        bestIntegerCanvas(v, { maxWidth: 1920, maxHeight: 1080 }),
        fitAdvice(v, w, 1.5), fitAdvice(w, v, 1.5)
      ];
      for (const res of results) {
        assert.ok(res && typeof res === 'object');
        for (const key of Object.keys(res)) {
          if (typeof res[key] === 'number') {
            assert.ok(Number.isFinite(res[key]), '数值必须有限：' + key);
          }
        }
      }
    }
  }
});
