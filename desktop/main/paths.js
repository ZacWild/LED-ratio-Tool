/**
 * LED-ratio-Tool 桌面版 · 路径固化
 * ---------------------------------------------------------------------------
 * 决策依据：
 *   DEC-19 —— sessionData 与用户设置必须分离
 *   DEC-20 —— 卸载默认保留 settings.json，重装自动恢复
 *   SEC-39  —— userData / sessionData 必须在 app.whenReady() 之前 setPath
 *
 * ⚠️ 目录名口径（TK-75）：本文件按 DEC-19 的 `%APPDATA%/LED Ratio Tool/`
 *    （含空格）实现。**全工程只有本文件定义目录名**，若口径变更只需改这一处。
 */
'use strict';

const path = require('node:path');
const { app } = require('electron');

/**
 * 用户设置目录名 —— 全工程唯一来源。
 * 与 productName 解耦：即使 productName 调整，此目录不变（DEC-12 应用身份不变）。
 */
const APP_DIR_NAME = 'LED Ratio Tool';

/** 应用身份 —— DEC-12 永久锁定，发布后不可改 */
const APP_ID = 'com.ledratiotool.desktop';

/**
 * 解析两个存储路径。
 *
 * 🔴 DEC-19 要求：
 *   用户设置   → %APPDATA%\LED Ratio Tool\
 *   会话与缓存 → %LOCALAPPDATA%\LED Ratio Tool\SessionData\
 *
 * ⚠️ 曾出现的实现缺陷（P4-B 缺陷 DEF-01）：
 *   原实现用 `path.dirname(appDataDir)` 推导 Local 目录 —— 但
 *   appDataDir = %APPDATA% = C:\Users\<u>\AppData\Roaming，
 *   它的 dirname 是 C:\Users\<u>\AppData，**不是** %LOCALAPPDATA%
 *   = C:\Users\<u>\AppData\Local。少了一层 → sessionData 落在
 *   AppData\LED Ratio Tool\SessionData，违反 DEC-19。
 *
 *   正确做法：**直接用 Electron 提供的 app.getPath('userData') 之外的
 *   独立 API 取 Local 目录**，不靠字符串推导。
 *   Electron 没有直接的 localAppData 路径 API，但可由 appDataDir
 *   **一次 dirname** + 'Local' 精确构造 —— 依赖 Windows 的固定布局
 *   %APPDATA% = <profile>\AppData\Roaming，故 dirname 一次 = <profile>\AppData。
 *
 *   为避免再次靠推导出错，本实现**同时**用环境变量 LOCALAPPDATA 交叉校验；
 *   两者不一致时以环境变量为准（Windows 上一定一致）。
 *
 * @param {string} appDataDir Electron 的 appData 路径（%APPDATA%）
 * @returns {{userData: string, sessionData: string, localAppData: string}}
 */
function resolveStoragePaths(appDataDir) {
  // %LOCALAPPDATA% 的权威来源：环境变量。
  // Windows 上必定存在；若不存在（极少见），退回按固定布局推导。
  const envLocal =
    typeof process !== 'undefined' && process.env && process.env.LOCALAPPDATA
      ? process.env.LOCALAPPDATA
      : null;

  // 布局推导：<profile>\AppData\Roaming → dirname 一次 = <profile>\AppData → 拼 'Local'
  const derivedLocal = path.join(path.dirname(appDataDir), 'Local');

  const localAppData = envLocal || derivedLocal;

  return {
    userData: path.join(appDataDir, APP_DIR_NAME),
    localAppData,
    sessionData: path.join(localAppData, APP_DIR_NAME, 'SessionData'),
  };
}

/**
 * 在 app.whenReady() 之前调用，固化 userData 与 sessionData。
 * @param {string} appDataDir
 */
function applyStoragePaths(appDataDir) {
  const { userData, sessionData } = resolveStoragePaths(appDataDir);
  app.setPath('userData', userData);
  app.setPath('sessionData', sessionData);
  return { userData, sessionData };
}

module.exports = {
  APP_DIR_NAME,
  APP_ID,
  resolveStoragePaths,
  applyStoragePaths,
};
