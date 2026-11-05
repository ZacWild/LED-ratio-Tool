/**
 * Desktop v1.3.0 · settings.json 旧版 1.2.0 升级兼容测试
 * ---------------------------------------------------------------------------
 * 任务书 §2.2：新字段缺失视为未配置 / 不覆盖旧设置 / 不删除其他允许字段 /
 * 不改变用户数据目录 / 不因新增字段导致旧版升级后配置丢失。
 * 全部在临时目录进行，不触碰真实 %APPDATA%。
 *
 * 运行：npm run test:settings-compat
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const store = require(path.join(here, '..', 'main', 'settings-store.js'));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'led-pitch-settings-'));
}
function writeOld(dir, obj) {
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
function readRaw(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
}
function oldFixture(overrides) {
  return Object.assign({
    schemaVersion: 1,
    tolerancePercent: 1.75,
    createdAt: '2026-11-04T08:00:00.000Z',
    updatedAt: '2026-11-04T08:00:00.000Z',
  }, overrides || {});
}

test('S-01 旧版 1.2.0 四键文件：P 值视为未配置，容差原样保留', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  const r = store.readSettings(d);
  assert.equal(r.code, 0);
  assert.equal(r.settings.tolerancePercent, 1.75);
  assert.equal(r.settings.pixelPitchMm, null);
  assert.equal(r.settings.schemaVersion, 1);
  assert.equal(r.settings.createdAt, '2026-11-04T08:00:00.000Z');
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-02 首次启动（无文件）：P 值未配置，绝不默认 P2.5', () => {
  const d = tmpDir();
  const r = store.readSettings(d);
  assert.equal(r.settings.tolerancePercent, 0.5);
  assert.equal(r.settings.pixelPitchMm, null);
  assert.equal(fs.existsSync(path.join(d, 'settings.json')), false, '读取不得擅自创建文件');
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-03 不覆盖旧设置：写入 P 值后容差、createdAt 与未知字段全部保留', () => {
  const d = tmpDir();
  writeOld(d, oldFixture({ extraFutureField: 'keep-me' }));
  const r = store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: 1.86 });
  assert.equal(r.code, 0);
  const raw = readRaw(d);
  assert.equal(raw.tolerancePercent, 1.75);
  assert.equal(raw.createdAt, '2026-11-04T08:00:00.000Z');
  assert.equal(raw.extraFutureField, 'keep-me', '其他既有字段不得被删除');
  assert.equal(raw.pixelPitchMm, 1.86);
  assert.equal(raw.schemaVersion, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-04 schemaVersion 保持 1 → v1.2.0 回退仍可读（不整体回退、配置不丢失）', () => {
  assert.equal(store.SCHEMA_VERSION, 1);
  const d = tmpDir();
  writeOld(d, oldFixture());
  store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: 2.5 });
  const raw = readRaw(d);
  assert.equal(raw.schemaVersion, 1);
  // 模拟 v1.2.0 的 sv > 1 判定：1 不触发回退；且旧版只认 4 键仍能取到容差
  assert.equal(raw.schemaVersion > 1, false);
  assert.equal(raw.tolerancePercent, 1.75);
  assert.equal(store.readSettings(d).settings.tolerancePercent, 1.75);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-05 未配置态不写入 P 键 → settings.json 仍是原有精确 4 键', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  assert.equal(store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: null }).code, 0);
  assert.deepEqual(Object.keys(readRaw(d)).sort(),
    ['createdAt', 'schemaVersion', 'tolerancePercent', 'updatedAt']);
  // 从「已配置」再回到「未配置」也应删除该键
  store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: 1.86 });
  assert.equal(readRaw(d).pixelPitchMm, 1.86);
  store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: null });
  assert.equal('pixelPitchMm' in readRaw(d), false);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-06 P 值持久化往返：关闭/重开后仍保留（readSettings 回读）', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  store.writeSettings(d, { tolerancePercent: 0.8, pixelPitchMm: 1.667 });
  const back = store.readSettings(d);
  assert.equal(back.settings.pixelPitchMm, 1.667, '不得因显示精度丢失实际值');
  assert.equal(back.settings.tolerancePercent, 0.8);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-07 旧文件里 P 值非法（NaN/0/负数/字符串/Infinity）→ 降级为未配置，不整体丢弃', () => {
  const bad = [0, -1, '1.86', 'NaN', null, {}, [], 1e309];
  for (const v of bad) {
    const d = tmpDir();
    const fixture = oldFixture();
    fixture.pixelPitchMm = v;
    writeOld(d, fixture);
    const r = store.readSettings(d);
    assert.equal(r.settings.pixelPitchMm, null, `${String(v)} 应视为未配置`);
    assert.equal(r.settings.tolerancePercent, 1.75, '容差不得被牵连重置');
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('S-08 写入非法 P 值被拒绝，不落盘、不破坏原文件', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  for (const v of [NaN, Infinity, -Infinity, 0, -2, '2.5', {}]) {
    const r = store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: v });
    assert.equal(r.code, 4002, `${String(v)} 应被拒绝`);
  }
  const raw = readRaw(d);
  assert.equal(raw.tolerancePercent, 1.75);
  assert.equal('pixelPitchMm' in raw, false);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-09 原「匹配容差百分比」校验行为逐字不变', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  for (const v of [0, -1, 101, NaN, Infinity, '0.5', null, undefined]) {
    assert.equal(store.writeSettings(d, { tolerancePercent: v }).code, 4002, `tolerance=${String(v)} 应被拒绝`);
  }
  assert.equal(store.writeSettings(d, { tolerancePercent: 100 }).code, 0);
  assert.equal(store.writeSettings(d, { tolerancePercent: 0.0001 }).code, 0);
  assert.equal(store.writeSettings(d, {}).code, 4002, '缺 tolerancePercent 仍须拒绝');
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-10 原子写 + .bak：写入成功后上一版可回退', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  store.writeSettings(d, { tolerancePercent: 0.9, pixelPitchMm: 3 });
  const bak = path.join(d, 'settings.json.bak');
  assert.equal(fs.existsSync(bak), true);
  assert.equal(JSON.parse(fs.readFileSync(bak, 'utf8')).tolerancePercent, 1.75);
  assert.equal(fs.existsSync(path.join(d, 'settings.json.tmp')), false, 'tmp 不得残留');
  assert.deepEqual(fs.readdirSync(d).sort(), ['settings.json', 'settings.json.bak']);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-11 主文件损坏 → .bak 回退，P 值与容差仍可取回', () => {
  const d = tmpDir();
  writeOld(d, oldFixture({ pixelPitchMm: 2.5 }));
  fs.copyFileSync(path.join(d, 'settings.json'), path.join(d, 'settings.json.bak'));
  fs.writeFileSync(path.join(d, 'settings.json'), '{ broken json', 'utf8');
  const r = store.readSettings(d);
  assert.equal(r.code, 0);
  assert.equal(r.settings.tolerancePercent, 1.75);
  assert.equal(r.settings.pixelPitchMm, 2.5);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-12 patch 不能引入白名单之外的新键（原型污染防护）', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  store.writeSettings(d, { tolerancePercent: 1.75, pixelPitchMm: 1.86, evilKey: 'x', '__proto__': { polluted: true } });
  const raw = readRaw(d);
  assert.equal('evilKey' in raw, false);
  assert.equal('polluted' in raw, false);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(raw).sort(),
    ['createdAt', 'pixelPitchMm', 'schemaVersion', 'tolerancePercent', 'updatedAt']);
  fs.rmSync(d, { recursive: true, force: true });
});

test('S-13 只改 P 值、不传容差时沿用原容差（不擅自重置为 0.5）', () => {
  const d = tmpDir();
  writeOld(d, oldFixture());
  // writeSettings 契约仍要求 tolerancePercent；此处验证 readSettings 的既有值不被污染
  const before = store.readSettings(d).settings;
  store.writeSettings(d, { tolerancePercent: before.tolerancePercent, pixelPitchMm: 1.25 });
  const after = store.readSettings(d).settings;
  assert.equal(after.tolerancePercent, 1.75);
  assert.equal(after.pixelPitchMm, 1.25);
  fs.rmSync(d, { recursive: true, force: true });
});
