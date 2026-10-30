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
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE = 'settings.json';
const BAK = 'settings.json.bak';
const TMP = 'settings.json.tmp';

const SCHEMA_VERSION = 1;
const DEFAULT_TOLERANCE = 0.5; // 与 core.js DEFAULT_TOLERANCE_PERCENT 一致

/** 允许出现在 settings.json 中的键 —— 精确白名单 */
const ALLOWED_KEYS = Object.freeze([
  'schemaVersion',
  'tolerancePercent',
  'createdAt',
  'updatedAt',
]);

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

/**
 * 校验并归一化一个设置对象。逐字段回退，不整体丢弃。
 * @param {any} raw
 * @returns {{ok: boolean, value: {tolerancePercent: number}, badFields: string[]}}
 */
function normalize(raw) {
  const badFields = [];
  const out = { tolerancePercent: DEFAULT_TOLERANCE };

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
    settings: { schemaVersion: SCHEMA_VERSION, tolerancePercent: DEFAULT_TOLERANCE },
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

  const prev = readSettings(userDataDir);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    tolerancePercent: t,
    createdAt: prev.settings.createdAt || now,
    updatedAt: now,
  };

  // 只写白名单内的键
  const final = Object.create(null);
  for (const key of ALLOWED_KEYS) {
    if (key in payload) final[key] = payload[key];
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
  ALLOWED_KEYS,
  SCHEMA_VERSION,
  DEFAULT_TOLERANCE,
  ERR_WRITE_FAILED,
  ERR_SETTINGS_CORRUPT,
};
