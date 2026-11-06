/**
 * Desktop v1.3.0 · P 值 / PX 换算 / 箱体核验独立单元测试
 * ---------------------------------------------------------------------------
 * 零外部依赖：直接 require 桌面专属纯计算模块 renderer/led-pitch.js。
 * 覆盖任务书 §10 A / B / C 全部用例；不依赖 Electron、不依赖 GUI、不依赖网络。
 *
 * 运行：npm run test:pitch
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const Pitch = require(path.join(here, '..', 'renderer', 'led-pitch.js'));

function fresh() {
  Pitch.reset();
  return Pitch;
}

/* ==========================================================================
   A · P 值计算测试
   ========================================================================== */
test('A-01 预设清单完整且数值精确（10 项）', () => {
  fresh();
  const labels = Pitch.PITCH_PRESETS.map((p) => p.label);
  assert.deepEqual(labels, ['P0.9', 'P1.25', 'P1.5', 'P1.667', 'P1.86', 'P2', 'P2.5', 'P3', 'P4', 'P5']);
  assert.equal(Pitch.PITCH_PRESETS.find((p) => p.label === 'P1.667').value, 1.667);
  assert.equal(Pitch.PITCH_PRESETS.find((p) => p.label === 'P0.9').value, 0.9);
  assert.equal(Object.isFrozen(Pitch.PITCH_PRESETS), true);
});

test('A-02 P0.9 / P1.25 / P2.5 / P3 换算（14000×4000 mm）', () => {
  fresh();
  const cases = [
    [0.9, 14000 / 0.9, 4000 / 0.9, 15556, 4444],
    [1.25, 11200, 3200, 11200, 3200],
    [2.5, 5600, 1600, 5600, 1600],
    [3, 14000 / 3, 4000 / 3, 4667, 1333],
  ];
  for (const [p, ew, eh, iw, ih] of cases) {
    const r = Pitch.physicalToPixels(14000, 4000, p);
    assert.equal(r.ok, true, `P${p} 应可用`);
    assert.ok(Math.abs(r.theoreticalWidthPx - ew) < 1e-9, `P${p} 理论宽`);
    assert.ok(Math.abs(r.theoreticalHeightPx - eh) < 1e-9, `P${p} 理论高`);
    assert.equal(r.integerWidthPx, iw, `P${p} 整数宽`);
    assert.equal(r.integerHeightPx, ih, `P${p} 整数高`);
  }
});

test('A-03 P1.86：14000×4000 mm → 7526.881720 / 2150.537634 → 7527×2151', () => {
  fresh();
  const r = Pitch.physicalToPixels(14000, 4000, 1.86);
  assert.equal(r.ok, true);
  assert.equal(r.formatted.theoreticalWidthPx, '7526.881720');
  assert.equal(r.formatted.theoreticalHeightPx, '2150.537634');
  assert.equal(r.integerWidthPx, 7527);
  assert.equal(r.integerHeightPx, 2151);
  assert.equal(r.formatted.integerResolution, '7527 × 2151 px');
  assert.equal(r.aspectRatio, 3.5);
  assert.equal(r.formatted.aspectRatio, '3.5 : 1');
  assert.equal(r.physicalWidthMm, 14000);
  assert.equal(r.physicalHeightMm, 4000);
  assert.equal(r.hasRoundingError, true);
  assert.ok(r.roundingErrorWidthPx > 0 && r.roundingErrorWidthPx < 1);
  assert.ok(r.roundingErrorHeightPx > 0 && r.roundingErrorHeightPx < 1);
});

test('A-04 自定义 P1.667 / P1.875：存储值不因显示精度丢失', () => {
  fresh();
  for (const p of [1.667, 1.875]) {
    const s = Pitch.setPitch(String(p));
    assert.equal(s.ok, true);
    assert.equal(Pitch.getPitch().value, p);
    assert.equal(Pitch.getPitch().formatted, String(p));
    const r = Pitch.estimateNativeResolution({ physicalWidthMm: 14000, physicalHeightMm: 4000 });
    assert.equal(r.ok, true);
    assert.equal(r.pixelPitchMm, p);
    assert.equal(r.theoreticalWidthPx, 14000 / p);
  }
});

test('A-05 未设置 P：null 状态、禁止换算、明确提示（不默认 P2.5）', () => {
  fresh();
  assert.equal(Pitch.getPitch().value, null);
  assert.equal(Pitch.getPitch().unconfigured, true);
  assert.equal(Pitch.getPitch().formatted, '未配置');
  const r = Pitch.estimateNativeResolution({ physicalWidthMm: 14000, physicalHeightMm: 4000 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /未配置/);
  Pitch.setPitch('');
  assert.equal(Pitch.getPitch().value, null);
  assert.match(Pitch.state.notice, /禁止/);
  assert.match(Pitch.state.notice, /原始物理尺寸保持不变/);
});

test('A-06 非法输入：NaN / ±Infinity / 0 / 负数 / 非数值 / 超精度', () => {
  fresh();
  const bad = [NaN, Infinity, -Infinity, 0, -1, -0.001, 'abc', 'NaN', 'Infinity', '1e309', '0', '-2', '1.1234567'];
  Pitch.setPitch(2.5);
  for (const v of bad) {
    const r = Pitch.setPitch(v);
    assert.equal(r.ok, false, `${String(v)} 应被拒绝`);
    assert.equal(Pitch.getPitch().value, 2.5, `${String(v)} 不得覆盖既有有效值`);
  }
  assert.equal(Pitch.parsePitch(null).ok, true);
  assert.equal(Pitch.parsePitch(null).unconfigured, true);
  assert.equal(Pitch.parsePitch('  ').unconfigured, true);
  assert.equal(Pitch.parsePitch({}).ok, false);
  assert.equal(Pitch.parsePitch([]).ok, false);
});

test('A-07 极小值 / 极大值边界（有限正数合法，溢出拒绝）', () => {
  fresh();
  assert.equal(Pitch.parsePitch(Number.MIN_VALUE).ok, true);
  assert.equal(Pitch.parsePitch(Number.MAX_VALUE).ok, true);
  assert.equal(Pitch.parsePitch(1e12).ok, true);
  assert.equal(Pitch.parsePitch('0.000001').value, 0.000001);
  assert.equal(Pitch.parsePitch('1e309').ok, false);
  // 极小 P 导致理论像素溢出 → 明确返回不可用，不产出 Infinity
  const r = Pitch.physicalToPixels(14000, 4000, Number.MIN_VALUE);
  assert.equal(r.ok, false);
  assert.match(r.reason, /有限数值/);
});

test('A-08 修改 P 后依赖参数立即重新计算，且原物理尺寸不变', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.setPitch(2.5);
  const a = Pitch.estimateNativeResolution();
  assert.equal(a.integerWidthPx, 5600);
  Pitch.setPitch(1.86);
  const b = Pitch.estimateNativeResolution();
  assert.equal(b.integerWidthPx, 7527);
  assert.equal(Pitch.snapshot().physicalWidthMm, 14000);
  assert.equal(Pitch.snapshot().physicalHeightMm, 4000);
  assert.equal(b.physicalWidthMm, 14000);
  assert.equal(b.physicalHeightMm, 4000);
});

/* ==========================================================================
   B · 物理尺寸换算测试
   ========================================================================== */
test('B-01 m/cm/mm 输入换算到权威 mm 后参与 P 换算（14 m = 14000 mm）', () => {
  fresh();
  const toMm = (v, u) => v * ({ m: 1000, cm: 10, mm: 1 })[u];
  const w = toMm(14, 'm');
  const h = toMm(4, 'm');
  assert.equal(w, 14000);
  assert.equal(h, 4000);
  const r = Pitch.physicalToPixels(w, h, 2.5);
  assert.equal(r.integerWidthPx, 5600);
  assert.equal(r.integerHeightPx, 1600);
  assert.equal(r.aspectRatio, 3.5);
  assert.equal(r.formatted.integerResolution, '5600 × 1600 px');
  // cm / mm 输入得到同一物理尺寸 → 同一结果
  assert.deepEqual(
    Pitch.physicalToPixels(toMm(1400, 'cm'), toMm(400, 'cm'), 2.5).formatted.integerResolution,
    '5600 × 1600 px',
  );
  assert.deepEqual(
    Pitch.physicalToPixels(toMm(14000, 'mm'), toMm(4000, 'mm'), 2.5).formatted.integerResolution,
    '5600 × 1600 px',
  );
});

test('B-02 物理尺寸 → 像素：连续值、整数估算、总像素、误差同时保留', () => {
  fresh();
  const r = Pitch.physicalToPixels(14000, 4000, 1.86);
  assert.equal(r.theoreticalWidthPx, 14000 / 1.86);
  assert.equal(r.theoreticalHeightPx, 4000 / 1.86);
  assert.equal(r.formatted.theoreticalWidthPx, '7526.881720');
  assert.equal(r.totalPixelsTheoretical, r.theoreticalWidthPx * r.theoreticalHeightPx);
  assert.equal(r.totalPixelsInteger, 7527 * 2151);
  assert.equal(r.formatted.totalPixelsInteger, '16190577');
  assert.notEqual(r.totalPixelsTheoretical, r.totalPixelsInteger);
  assert.equal(r.hasRoundingError, true);
  assert.equal(r.formatted.roundingErrorWidthPx, '+0.118280');
  assert.equal(r.formatted.roundingErrorHeightPx, '+0.462366');
});

test('B-03 非整数像素估算精度：不丢弃小数、误差带符号', () => {
  fresh();
  const r = Pitch.physicalToPixels(10001, 3333, 1.667);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.theoreticalWidthPx - 10001 / 1.667) < 1e-12);
  assert.equal(r.integerWidthPx, Math.round(10001 / 1.667));
  assert.ok(Math.abs(r.roundingErrorWidthPx) <= 0.5 + 1e-9);
  assert.equal(r.roundingErrorWidthPx, r.integerWidthPx - r.theoreticalWidthPx);
  assert.equal(r.roundingErrorWidthPercent, (r.integerWidthPx - r.theoreticalWidthPx) / r.theoreticalWidthPx * 100);
  // 完全整除时误差为 0
  const exact = Pitch.physicalToPixels(14000, 4000, 2.5);
  assert.equal(exact.hasRoundingError, false);
  assert.equal(exact.roundingErrorWidthPx, 0);
  assert.equal(exact.formatted.roundingErrorWidthPx, '+0.000000');
});

test('B-04 PX 直接输入：只写 resolution*，绝不覆盖 physical*', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  const w = Pitch.parsePixelCount('3840');
  const h = Pitch.parsePixelCount('1080');
  assert.equal(w.ok, true);
  assert.equal(w.px, 3840);
  assert.equal(w.semantic, 'resolution');
  Pitch.recordResolutionPx('width', w.px);
  Pitch.recordResolutionPx('height', h.px);
  Pitch.markPxDirect();
  Pitch.setActiveUnit('px');
  const s = Pitch.snapshot();
  assert.equal(s.physicalWidthMm, 14000);
  assert.equal(s.physicalHeightMm, 4000);
  assert.equal(s.resolutionWidthPx, 3840);
  assert.equal(s.resolutionHeightPx, 1080);
  assert.equal(s.pxOrigin, 'direct');
  assert.equal(s.activeUnit, 'px');
});

test('B-05 PX 输入后切换单位：物理尺寸保持原值（不反算、不覆盖）', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.recordResolutionPx('width', 3840);
  Pitch.recordResolutionPx('height', 1080);
  Pitch.setActiveUnit('px');
  const before = Pitch.getPhysical();
  Pitch.setActiveUnit('m');
  const after = Pitch.getPhysical();
  assert.deepEqual(after, before);
  assert.equal(after.widthMm, 14000);
  assert.equal(after.heightMm, 4000);
  assert.equal(Pitch.snapshot().resolutionWidthPx, 3840);
});

test('B-06 未配置 P 时禁止物理↔像素换算并给出提示', () => {
  fresh();
  Pitch.setPitch(null);
  assert.match(Pitch.state.notice, /禁止物理尺寸 ↔ 像素分辨率换算/);
  assert.equal(Pitch.physicalToPixels(14000, 4000, null).ok, false);
  assert.equal(Pitch.estimateNativeResolution({ physicalWidthMm: 14000, physicalHeightMm: 4000 }).ok, false);
  // 但 px 直接输入不受影响
  assert.equal(Pitch.parsePixelCount('1920').ok, true);
});

test('B-07 PX 直接输入的真实像素值不因 P 值变化被篡改', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.setPitch(2.5);
  Pitch.recordResolutionPx('width', 3840);
  Pitch.recordResolutionPx('height', 1080);
  Pitch.markPxDirect();
  Pitch.setPitch(1.86);
  Pitch.setPitch(3);
  assert.equal(Pitch.snapshot().resolutionWidthPx, 3840);
  assert.equal(Pitch.snapshot().resolutionHeightPx, 1080);
  assert.equal(Pitch.snapshot().physicalWidthMm, 14000);
});

test('B-08 PX 非法输入：空 / NaN / Infinity / 0 / 负数 / 非数值', () => {
  fresh();
  for (const v of ['', '  ', 'abc', 'NaN', 'Infinity', '1e309', '0', '-1', '-0.5']) {
    const r = Pitch.parsePixelCount(v);
    assert.equal(r.ok, false, `${v} 应被拒绝`);
    assert.equal(r.px, null);
  }
  assert.equal(Pitch.parsePixelCount('7527').px, 7527);
  assert.equal(Pitch.parsePixelCount('+1080').px, 1080);
});

test('B-09 物理尺寸非法时估算明确不可用', () => {
  fresh();
  assert.equal(Pitch.physicalToPixels(null, 4000, 2.5).ok, false);
  assert.equal(Pitch.physicalToPixels(0, 4000, 2.5).ok, false);
  assert.equal(Pitch.physicalToPixels(-1, 4000, 2.5).ok, false);
  assert.equal(Pitch.physicalToPixels(14000, NaN, 2.5).ok, false);
});

/* ==========================================================================
   C · 箱体 / 模组规格核验测试
   ========================================================================== */
test('C-01 完全匹配案例（P2.5，500mm 箱体 × 28 / 8，200px/箱）', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.setPitch(2.5);
  const c = Pitch.computeCabinetSpec({ widthMm: 500, heightMm: 500, pixelsX: 200, pixelsY: 200, cols: 28, rows: 8 });
  assert.equal(c.ok, true);
  assert.equal(c.source, '箱体像素矩阵计算');
  assert.equal(c.totalWidthMm, 14000);
  assert.equal(c.totalHeightMm, 4000);
  assert.equal(c.totalWidthPx, 5600);
  assert.equal(c.totalHeightPx, 1600);
  assert.equal(c.actualResolution, '5600 × 1600 px');
  assert.equal(c.actualAspectRatio, 3.5);
  assert.equal(c.warnings.length, 0);
  const t = Pitch.estimateNativeResolution();
  const d = Pitch.compareCabinetToTheory(c, t);
  assert.equal(d.ok, true);
  assert.equal(d.exactMatch, true);
  assert.equal(d.verdict, '完全匹配');
  assert.equal(d.leftSource, '理论 P 值估算');
  assert.equal(d.rightSource, '箱体像素矩阵计算');
  assert.equal(t.source, '理论 P 值估算');
});

test('C-02 理论值与箱体结果有轻微差异：差异显式列出，不静默修正', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.setPitch(1.86);
  const c = Pitch.computeCabinetSpec({ widthMm: 500, heightMm: 500, pixelsX: 269, pixelsY: 269, cols: 28, rows: 8 });
  const t = Pitch.estimateNativeResolution();
  const d = Pitch.compareCabinetToTheory(c, t);
  assert.equal(d.ok, true);
  assert.equal(d.exactMatch, false);
  assert.match(d.verdict, /存在差异/);
  assert.equal(d.deltaWidthPx, 7532 - 7527);
  assert.notEqual(d.deltaWidthPx, 0);
  assert.ok(d.relativePixelDeviationPercent < 1);
  // 两列来源始终可区分
  assert.notEqual(d.leftSource, d.rightSource);
});

test('C-03 横向箱体数量错误 → 明确告警', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  const c = Pitch.computeCabinetSpec({ widthMm: 500, heightMm: 500, pixelsX: 200, pixelsY: 200, cols: 27, rows: 8 });
  assert.equal(c.ok, true);
  assert.equal(c.totalWidthMm, 13500);
  assert.ok(c.warnings.some((w) => /横向箱体数量/.test(w)));
  assert.ok(c.warnings.some((w) => /总宽度与屏幕物理宽度不一致/.test(w)));
});

test('C-04 纵向箱体数量错误 → 明确告警', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  const c = Pitch.computeCabinetSpec({ widthMm: 500, heightMm: 500, pixelsX: 200, pixelsY: 200, cols: 28, rows: 7 });
  assert.ok(c.warnings.some((w) => /纵向箱体数量/.test(w)));
  assert.ok(c.warnings.some((w) => /总高度与屏幕物理高度不一致/.test(w)));
});

test('C-05 非法像素矩阵：0 / 负数 / 小数 / 非数值 / NaN', () => {
  fresh();
  const bad = ['0', '-1', '12.5', 'abc', '', 'NaN', 'Infinity'];
  for (const v of bad) {
    const c = Pitch.computeCabinetSpec({ pixelsX: v });
    assert.equal(c.ok, false, `pixelsX=${v} 应被拒绝`);
    assert.ok(c.errors.length > 0);
  }
  assert.equal(Pitch.parseCabinetField('12.5', 'pixelsY').ok, false);
  assert.equal(Pitch.parseCabinetField('200', 'pixelsY').ok, true);
  assert.equal(Pitch.parseCabinetField('500.5', 'widthMm').ok, true, '箱体物理尺寸允许小数 mm');
});

test('C-06 箱体尺寸与屏幕物理尺寸不一致 → 明确告警', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  const c = Pitch.computeCabinetSpec({ widthMm: 480, heightMm: 480, pixelsX: 192, pixelsY: 192, cols: 28, rows: 8 });
  assert.equal(c.totalWidthMm, 13440);
  assert.equal(c.totalHeightMm, 3840);
  assert.ok(c.warnings.length >= 2);
  assert.ok(c.warnings.every((w) => /不一致|不匹配/.test(w)));
});

test('C-07 未配置 P 时箱体结果仍可计算，但「与理论估算差异」明确不可用', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  const c = Pitch.computeCabinetSpec({ widthMm: 500, heightMm: 500, pixelsX: 200, pixelsY: 200, cols: 28, rows: 8 });
  assert.equal(c.ok, true);
  const d = Pitch.compareCabinetToTheory(c, Pitch.estimateNativeResolution());
  assert.equal(d.ok, false);
  assert.match(d.reason, /未配置|不可用/);
  assert.equal(c.source, '箱体像素矩阵计算');
});

test('C-08 来源标注不合并：理论估算与箱体结果字段彼此独立', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.setPitch(2.5);
  const t = Pitch.estimateNativeResolution();
  const c = Pitch.computeCabinetSpec({ widthMm: 500, heightMm: 500, pixelsX: 200, pixelsY: 200, cols: 28, rows: 8 });
  assert.equal(t.source, '理论 P 值估算');
  assert.equal(c.source, '箱体像素矩阵计算');
  assert.equal(t.totalPixelsInteger, 5600 * 1600);
  assert.equal(c.totalWidthPx * c.totalHeightPx, 5600 * 1600);
  assert.equal(typeof t.theoreticalWidthPx, 'number');
  assert.equal(typeof c.theoreticalWidthPx, 'undefined', '箱体结果不得混入理论连续值');
});

test('C-09 数据语义：physical* / resolution* / pixelPitchMm 五种字段互不覆盖', () => {
  fresh();
  Pitch.recordPhysicalMm('width', 14000);
  Pitch.recordPhysicalMm('height', 4000);
  Pitch.setPitch(2.5);
  Pitch.recordResolutionPx('width', 9999);
  Pitch.recordResolutionPx('height', 8888);
  const s = Pitch.snapshot();
  assert.equal(s.physicalWidthMm, 14000);
  assert.equal(s.physicalHeightMm, 4000);
  assert.equal(s.resolutionWidthPx, 9999);
  assert.equal(s.resolutionHeightPx, 8888);
  assert.equal(s.pixelPitchMm, 2.5);
  assert.equal(Pitch.estimateNativeResolution().physicalWidthMm, 14000, '理论估算只从物理尺寸取值');
});
