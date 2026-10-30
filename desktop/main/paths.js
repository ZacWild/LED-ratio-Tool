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
 * 注意：Electron 的 sessionData 默认值是 <userData>/SessionData，会落在
 * %APPDATA% 下。DEC-19 要求它落在 %LOCALAPPDATA%，因此必须显式 setPath。
 *
 * @param {string} appDataDir Electron 的 appData 路径（%APPDATA%）
 * @returns {{userData: string, sessionData: string}}
 */
function resolveStoragePaths(appDataDir) {
  const localAppData = path.join(
    path.dirname(appDataDir), // %APPDATA% 的父目录 = %LOCALAPPDATA%
    APP_DIR_NAME,
  );
  return {
    userData: path.join(appDataDir, APP_DIR_NAME),
    sessionData: path.join(localAppData, 'SessionData'),
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
