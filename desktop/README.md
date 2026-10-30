# LED-ratio-Tool · Windows 桌面版

LED 大屏物理尺寸 → 视频画布分辨率换算工具的 Windows 桌面版本。
业务内核与 HTML 版**完全相同**（`core.js` 逐字节复用），桌面版只增加原生外壳与桌面交互。

---

## 一、当前状态

**P4-A 最小原型已完成**（壳层可行性验证）。

| 能力 | 状态 |
|---|---|
| Electron 启动与窗口初始化 | ✅ 已实现并实测 |
| `app://` 本地资源加载 | ✅ 已实现并实测 |
| preload 与 IPC 最小安全边界（8 方法） | ✅ 已实现并实测 |
| CSP 阶段一配置与安全验证 | ✅ 已实现并实测 |
| `core.js` 原样复用（SHA-256 锁） | ✅ 已实现并实测 |
| settings 与 sessionData 分离 | ✅ 已实现并实测 |
| 最小窗口 / 高 DPI / 工作区检测 | ✅ 已实现并实测（100% 缩放档） |
| **完整业务 UI（F-01~F-18）** | ⏳ **属 P4-B，尚未实现** |
| 正式安装包 / 便携版 / 签名 | ⏳ 属 P7，尚未产出 |

> ⚠️ **本工程当前不是可交付版本。** 它是技术可行性验证原型。

---

## 二、运行

### 前置条件

| 项 | 要求 |
|---|---|
| Node.js | ≥ 20（实测 v22.22.2） |
| VC++ 运行库 | Microsoft Visual C++ 2015-2022 Redistributable (x64) —— Electron postinstall 需要 |
| 系统环境变量 | **`ELECTRON_RUN_AS_NODE` 必须未设置** —— 设置了会让 `electron.exe` 退化为纯 Node 运行 |

### 命令

```bash
cd desktop

npm install                 # 安装依赖（Electron 45.1.0 精确锁定）
npm run preflight           # 前置检查（环境变量 + VC++ + Node 版本）
npm run sync                # 从仓库同步 core.js / app.js / styles.css / index.html + 哈希门禁
npm run dev                 # 启动桌面版

npm run audit:security      # 安全静态审计（47 项）
npm run sync:check          # 只校验副本漂移，不写入
```

---

## 三、存储位置

### 用户设置

```
%APPDATA%\LED Ratio Tool\
├── settings.json          ← 业务持久化（当前仅匹配容差）
├── settings.json.bak      ← 上一版备份
├── settings.json.tmp      ← 写入中间态（rename 后即消失）
├── logs\                  ← Chromium 系统目录
├── Crashpad\              ← Chromium 系统目录
└── lockfile               ← Chromium 单实例锁（非业务数据）
```

### Chromium 会话与缓存（与用户设置**分离**）

```
%LOCALAPPDATA%\LED Ratio Tool\SessionData\
```

### 彻底清除个人设置

1. 关闭应用
2. 删除 `%APPDATA%\LED Ratio Tool\` 整个目录
3. 删除 `%LOCALAPPDATA%\LED Ratio Tool\` 整个目录

删除后重新启动，匹配容差恢复默认值 **0.5**。

### 卸载行为

**卸载默认保留** `settings.json` —— 重装后自动恢复容差。
> 应用**不写任何数据删除逻辑**。`deleteAppDataOnUninstall` 是 one-click 安装器专用选项，
> 本项目 `oneClick:false`，该键无效 —— 不依赖它保证任何行为。

---

## 四、业务红线

核心计算逻辑与已确认的业务规则**不可改动**。

- 机器闸：`core.lock.json`（SHA-256）+ `test/guard-redlines.mjs`（8 处受保护口径）
- 人类索引：[`PROTECTED.md`](PROTECTED.md)

**任何涉及红线的修改必须提交三件套**：变更原因、影响面分析、回归测试，且须项目负责人确认。

---

## 五、架构速览

```
desktop/
├── main/
│   ├── main.js           生命周期 / app:// 协议 / 窗口 / 安全拦截
│   ├── ipc.js            8 个 IPC 方法（唯一注册处）
│   ├── settings-store.js settings.json 原子写 + .bak + 损坏回退
│   ├── paths.js          userData / sessionData 固化（目录名唯一来源）
│   ├── csp.js            CSP 唯一来源
│   └── menu.js           原生菜单栏
├── preload/preload.js    contextBridge 8 方法（单文件，零依赖，只用 Web API）
├── renderer/             index.html + core.js + app.js + styles.css + app.css + desktop-ui.js
├── build/
│   ├── sync-assets.mjs   同步 + 哈希门禁 + 桌面适配注入
│   ├── desktop-adapter.cjs app.js 的两处桌面适配（持久化 / 剪贴板 → IPC）
│   ├── preflight.cjs     启动前置检查
│   └── electron-builder.yml
└── test/
    ├── security-audit.cjs  47 项安全静态审计
    └── p4a-evidence.cjs    9 项 P4-A 证据采集
```

### 关键实现约束

| 约束 | 原因 |
|---|---|
| `protocol.handle()` 在 `app.whenReady()` **之后** | 在模块顶层调用会抛 `Session can only be received when app is ready`，应用挂起不启动 |
| `registerSchemesAsPrivileged()` 在**模块顶层** | 必须早于 ready |
| IPC 注册**先于** `loadURL()` | 否则渲染层首次调用 `settings.get` 会得到 "No handler registered" |
| `useContentSize: true` | `width`/`height` = **客户区**尺寸；`minWidth/minHeight` 同一口径 |
| 不用 `setContentSize` 做最小尺寸保证 | 它不遵守 `minHeight` |
| `devicePixelRatio` 仅用于诊断 | 1 CSS px = 1 DIP = 1/96 英寸，禁止乘布局尺寸 |
| preload 单文件、零 npm 依赖 | Electron 45 沙箱 preload 只提供 Web API + `electron` 系列 |

---

## 六、安全基线

| 能力 | 实现 |
|---|---|
| 进程隔离 | `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` |
| 暴露面 | 恰好 8 个方法，零通用透传，对象冻结 |
| 内容来源 | `app://` 自定义协议，路径穿越防护三步 |
| CSP | `default-src 'none'` + `connect-src 'none'` + `script-src 'self'`（无 unsafe-eval/inline） |
| 网络 | 运行时出网计数 = 0 |
| 禁用项 | 自动更新 / 系统托盘 / 账号云同步 / 遥测崩溃上报 —— 四层反向核验 |

详见 `_audit/out/P3-表C-Electron安全清单.md`。

---

## 七、GitHub 操作规则

本工程受项目负责人的 GitHub 操作规则约束，详见仓库根 `GITHUB-RULES.md` 与 `test/guard-github-rules.mjs`（机器闸）。
