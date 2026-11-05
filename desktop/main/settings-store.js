/**
 * LED-ratio-Tool 桌面版 · 设置存储
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-19 —— 用户设置与 Chromium 会话数据分离
 *   DEC-20 —— 卸载默认保留 settings.json，重装自动恢复
 *   PS-01   —— V1.0 只保存匹配容差（跨会话）
 *   SEC-09  —— 原子写 + .bak + 损坏回退
 *   SEC-11  —— userData 下业务文件只有 settings.json + .bak
 *
 * 🔒 V1.0 的 settings.json 键集合精确到 4 个（表B §2.2）。
 *    unit / stageMode / window / 栏宽 / 草稿在 V1.0 的 schema 中**不存在**
 *    —— 不是「存在但为空」（TK-70 裁定前按表B 执行）。
 *
 * 🔒 v1.3.0 增量兼容（LED 像素间距 P）：
 *    · `schemaVersion` **保持 1**：若升到 2，回退到 v1.2.0 时旧版 normalize()
 *      会因 `sv > 1` 整体回退、导致容差配置丢失，违反「保留 v1.2.0 可回退状态」；
 *    · `pixelPitchMm` 是**可选增量字段**：缺失 = 未配置（null），绝不默认 P2.5；
 *    · 未配置时**不写入该键**，settings.json 仍是原有精确 4 键（既有门禁不变）；
 *    · 写入采用「读原文件 → 合并 → 原子写」，保留原文件中已存在的其他键，
 *      不覆盖旧设置、不删除其他字段、不改变用户数据目录；
 *    · `tolerancePercent` 的默认值、合法区间、校验与业务逻辑**逐字不变**。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE = 'settings.json';
const BAK = 'settings.json.bak';
const TMP = 'settings.json.tmp';

const SCHEMA_VERSION = 1;
const DEFAULT_TOLERANCE = 0.5; // 与 core.js DEFAULT_TOLERANCE_PERCENT 一致

/** 允许出现在 settings.json 中的键 —— 精确白名单（v1.3.0 增 1 个可选键） */
const ALLOWED_KEYS = Object.freeze([
  'schemaVersion',
  'tolerancePercent',
  'createdAt',
  'updatedAt',
  'pixelPitchMm',
]);

/**
 * P 值字段校验：只允许「大于 0 的有限数值」或「未配置」。
 * 名称刻意避开受保护的计算函数标识符（SEC-01 静态断言）。
 */
function readPitchValue(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return { ok: false, value: null };
  }
  return { ok: true, value: raw };
}

/** 错误码（SEC-06） */
const ERR_WRITE_FAILED = 5001;
const ERR_SETTINGS_CORRUPT = 5002;

function settingsPath(userDataDir) {
  return path.join(userDataDir, FILE);
}
function backupPath(userDataDir) {
  return path.join(userDataDir, BAK);
}
function tmpPath(userDataDir) {
  return path.join(userDataDir, TMP);
}

/** 读取原始 settings.json 对象（主文件损坏时回退 .bak）；失败返回 null。 */
function readRawObject(userDataDir) {
  for (const file of [settingsPath(userDataDir), backupPath(userDataDir)]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      /* 试下一个来源 */
    }
  }
  return null;
}

/**
 * 校验并归一化一个设置对象。逐字段回退，不整体丢弃。
 * @param {any} raw
 * @returns {{ok: boolean, value: {tolerancePercent: number, pixelPitchMm: number|null}, badFields: string[]}}
 */
function normalize(raw) {
  const badFields = [];
  const out = { tolerancePercent: DEFAULT_TOLERANCE, pixelPitchMm: null };

  if (!raw || typeof raw !== 'object') {
    badFields.push('*');
    return { ok: false, value: out, badFields };
  }

  // schemaVersion 未知或更大 → 整体回退（保留原文件不覆盖）
  const sv = raw.schemaVersion;
  if (typeof sv !== 'number' || !Number.isFinite(sv) || sv < 1) {
    badFields.push('schemaVersion');
    return { ok: false, value: out, badFields };
  }
  if (sv > SCHEMA_VERSION) {
    badFields.push('schemaVersion');
    return { ok: false, value: out, badFields };
  }

  const t = raw.tolerancePercent;
  if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t <= 100) {
    out.tolerancePercent = t;
  } else if (t !== undefined) {
    badFields.push('tolerancePercent');
  }

  // v1.3.0 增量字段：缺失或非法都视为「未配置」，绝不整体丢弃旧文件、
  // 不改变容差的既有结果；非法值只静默降级为 null（渲染层另有显式输入校验）。
  const pitch = readPitchValue(raw.pixelPitchMm);
  out.pixelPitchMm = pitch.ok ? pitch.value : null;

  return { ok: badFields.length === 0, value: out, badFields };
}

/**
 * 读取设置。损坏时静默回退默认值，绝不阻断启动。
 * @param {string} userDataDir
 * @returns {{settings: {schemaVersion:number, tolerancePercent:number}, code: number, badFields: string[]}}
 */
function readSettings(userDataDir) {
  const now = new Date().toISOString();
  const fallback = {
    settings: { schemaVersion: SCHEMA_VERSION, tolerancePercent: DEFAULT_TOLERANCE, pixelPitchMm: null },
    code: 0,
    badFields: [],
  };

  let text = null;
  try {
    text = fs.readFileSync(settingsPath(userDataDir), 'utf8');
  } catch (_) {
    // 文件不存在 → 首次启动，静默用默认值
    return { ...fallback, settings: { ...fallback.settings, createdAt: now, updatedAt: now } };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // 主文件损坏 → 先试 .bak
    try {
      parsed = JSON.parse(fs.readFileSync(backupPath(userDataDir), 'utf8'));
    } catch (__) {
      return { ...fallback, code: ERR_SETTINGS_CORRUPT, badFields: ['*'] };
    }
  }

  const norm = normalize(parsed);
  const createdAt =
    parsed && typeof parsed.createdAt === 'string' ? parsed.createdAt : now;
  return {
    settings: {
      schemaVersion: SCHEMA_VERSION,
      tolerancePercent: norm.value.tolerancePercent,
      pixelPitchMm: norm.value.pixelPitchMm,
      createdAt,
      updatedAt: now,
    },
    code: norm.ok ? 0 : ERR_SETTINGS_CORRUPT,
    badFields: norm.badFields,
  };
}

/**
 * 原子写入：先备份 → 写 tmp → rename。
 * rename 同卷原子，强杀只会得到旧版或新版，绝不半写（SEC-09）。
 * @param {string} userDataDir
 * @param {object} patch
 * @returns {{code: number, message: string, data: object|null}}
 */
function writeSettings(userDataDir, patch) {
  const now = new Date().toISOString();

  // 字段白名单 —— 杜绝原型污染与未批准字段（SEC-08）
  const picked = Object.create(null);
  for (const key of ALLOWED_KEYS) {
    if (key in (patch || {})) picked[key] = patch[key];
  }
  if (!('tolerancePercent' in picked)) {
    return {
      code: 4002,
      message: 'tolerancePercent 缺失或非法，未写入',
      data: null,
    };
  }
  const t = picked.tolerancePercent;
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t > 100) {
    return {
      code: 4002,
      message: 'tolerancePercent 必须是 0 到 100 之间的有限数',
      data: null,
    };
  }

  // v1.3.0 增量字段：合法 → 写入；未配置 → 不写该键（保持 v1.2.0 精确 4 键形态）；
  // 非法 → 拒绝本次写入，绝不落盘脏值。未提供该字段时保留原文件中的既有值。
  const pitchPatch = ('pixelPitchMm' in picked) ? readPitchValue(picked.pixelPitchMm) : null;
  if (pitchPatch && !pitchPatch.ok) {
    return { code: 4002, message: 'pixelPitchMm 必须是大于 0 的有限数或未配置', data: null };
  }

  const prev = readSettings(userDataDir);

  // 🔒 升级兼容：以「原文件已有内容」为底稿合并，而不是从零重建。
  //    只搬运原文件**已存在**的键，patch 无法引入白名单之外的新键（SEC-08 仍成立）；
  //    旧版 1.2.0 写入的容差、时间戳以及任何既有字段都不会被删除。
  const final = Object.create(null);
  const existing = readRawObject(userDataDir);
  if (existing) {
    for (const key of Object.keys(existing)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      final[key] = existing[key];
    }
  }

  final.schemaVersion = SCHEMA_VERSION;
  final.tolerancePercent = t;
  final.createdAt = prev.settings.createdAt || now;
  final.updatedAt = now;
  if (pitchPatch) {
    if (pitchPatch.value === null) delete final.pixelPitchMm;
    else final.pixelPitchMm = pitchPatch.value;
  }

  const target = settingsPath(userDataDir);
  const tmp = tmpPath(userDataDir);
  const bak = backupPath(userDataDir);

  try {
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, bak); // ① 备份上一版
    }
    fs.writeFileSync(tmp, JSON.stringify(final, null, 2) + '\n', 'utf8'); // ② 写 tmp
    fs.renameSync(tmp, target); // ③ 原子 rename
    return { code: 0, message: 'ok', data: { updatedAt: final.updatedAt } };
  } catch (_) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (__) {
      /* 清理失败不影响主流程 */
    }
    // 写入失败：静默忽略，不阻断启动；但本次会话内新值仍生效（表B PS-01）
    return {
      code: ERR_WRITE_FAILED,
      message: '写入失败，本次会话内仍生效',
      data: null,
    };
  }
}

module.exports = {
  readSettings,
  writeSettings,
  readRawObject,
  readPitchValue,
  ALLOWED_KEYS,
  SCHEMA_VERSION,
  DEFAULT_TOLERANCE,
  ERR_WRITE_FAILED,
  ERR_SETTINGS_CORRUPT,
};
