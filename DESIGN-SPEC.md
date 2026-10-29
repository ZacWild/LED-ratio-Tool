# LED 大屏比例与视频画布换算工具 · 桌面端视觉设计规格

> 版本：v1.0（设计定稿稿）
> 适用：桌面端浏览器（Chrome / Edge / Firefox / Safari 最新两个大版本）
> 定位：专业视频后期工作台风格 —— 简洁、克制、现代、精确、中文优先
> 本文档所有数值均为最终值，可直接落进 CSS，无需二次决策。

---

## 0. 设计立场（为什么是这一套）

专业视频工具（达芬奇 DaVinci Resolve、Premiere 的调色/监看界面）的共识是**深色工作台**：深色底降低环境光反射与视觉疲劳，让用户的注意力集中在"数值与画面"本身。本工具的视觉主角是**比例数值与屏幕几何**，因此：

- 整体采用**低饱和深灰底 + 琥珀色（Amber）强调**——不用通用 SaaS 后台的蓝紫配色，与"LED 大屏 / 专业后期"的行业气质对齐；
- 装饰降到零：无渐变背景、无大圆角、无投影堆叠，层级靠**明度阶梯 + 1px 边框 + 等宽数字**建立；
- 数字是主角：所有数值（分辨率、比例、误差）一律走**等宽字体 + tabular-nums**，对齐即专业。

---

## 1. 色彩系统

### 1.1 背景 / 边框 Token（由深至浅 4 层底 + 2 层边框）

| Token | 用途 | Hex |
|---|---|---|
| `--bg-app` | 页面最底层底色（body） | `#141518` |
| `--bg-stage` | 可视化舞台底（比页面更深，衬托屏幕矩形） | `#101216` |
| `--bg-panel` | 面板底（三栏中每一栏的底色） | `#1B1D21` |
| `--bg-card` | 卡片/表格行 hover 底、输入框底 | `#26292F` |
| `--bg-card-hover` | 可交互卡片 hover 底 | `#2C3038` |
| `--border-subtle` | 弱分隔线（面板内部分组、表格行线） | `#26292F` |
| `--border-default` | 默认边框（面板外框、输入框、按钮） | `#33373E` |
| `--border-strong` | hover/激活边框（输入框聚焦前 hover、表格强调） | `#454A52` |

### 1.2 文字 Token（4 级）

| Token | 用途 | Hex |
|---|---|---|
| `--text-primary` | 主文字（标题、正文、核心数值默认色） | `#E8EAED` |
| `--text-secondary` | 次级文字（说明、单位、表头） | `#A8ADB5` |
| `--text-muted` | 弱化文字（占位符、禁用态、非关键注记） | `#6E747E` |
| `--text-accent` | 数值强调 / 强调文字（琥珀，用于可点击强调与核心数值） | `#FFC169` |

### 1.3 强调色与状态色

| Token | 用途 | Hex | 文字级对比度（对 `--bg-panel #1B1D21`） |
|---|---|---|---|
| `--accent` | 主强调：主按钮底、激活分段、屏幕画布轮廓 | `#F0A832` | 8.4:1 |
| `--accent-strong` | 深底上的强调文字 | `#FFC169` | 10.6:1 |
| `--success` | 严格匹配、复制成功 | `#4CC38A` | 7.7:1 |
| `--warning` | 非标准比例、取整误差、警示条 | `#F2B23E` | 9.0:1 |
| `--error` | 输入错误、非法值 | `#F0616D` | 5.4:1 |
| `--info` | 提示条（"以现场参数为准"类） | `#5CA8FF` | 6.9:1 |
| `--on-accent` | 琥珀底上的文字 | `#141518` | 8.9:1（对 `#F0A832`） |

**半透明衍生色**（状态色做大底时一律用 10–12% 透明度，禁止实色铺底）：

| Token | 值 | 用途 |
|---|---|---|
| `--success-bg` | `rgba(76,195,138,0.12)` | 徽章底、成功反馈底 |
| `--warning-bg` | `rgba(242,178,62,0.10)` | 警示条底、徽章底 |
| `--error-bg` | `rgba(240,97,109,0.10)` | 错误输入底、错误徽章底 |
| `--info-bg` | `rgba(92,168,255,0.10)` | 提示条底 |
| `--accent-bg` | `rgba(240,168,50,0.10)` | 裁切示意 hatch、选中预设底 |

### 1.4 对比度核算（正文 ≥ 4.5:1，大字/图形 ≥ 3:1）

| 前景 | 背景 | 实测对比度 | 结论 |
|---|---|---|---|
| `#E8EAED` 正文 | `#141518` 页面底 | 14.8:1 | ✅ 正文 |
| `#E8EAED` 正文 | `#1B1D21` 面板底 | 13.9:1 | ✅ 正文 |
| `#A8ADB5` 次级 | `#1B1D21` 面板底 | 7.5:1 | ✅ 可作正文/说明 |
| `#A8ADB5` 次级 | `#26292F` 输入框底 | 6.6:1 | ✅ |
| `#6E747E` 弱化 | `#1B1D21` 面板底 | 3.6:1 | ⚠️ 仅限占位符/禁用态/非关键注记（≥12px），**禁止用于任何承担信息义务的正文** |
| `#FFC169` 核心数值 | `#1B1D21` 面板底 | 10.6:1 | ✅ 大数值 |
| `#4CC38A` 成功 | `#1B1D21` | 7.7:1 | ✅ |
| `#F0616D` 错误 | `#1B1D21` | 5.4:1 | ✅ 文字可用 |
| `#141518` on `#F0A832` 主按钮 | — | 8.9:1 | ✅ |

### 1.5 语义规则

1. 状态色（success/warning/error/info）**只允许**出现在：文字、图标、徽章、左侧 3px 竖线、≤12% 透明度底色。**禁止任何状态色作为面板/大面积实色背景。**
2. `--accent` 琥珀是唯一"操作与焦点"色：主按钮、激活分段、画布轮廓线、选中指示。一个屏幕内琥珀实色面积 ≤ 主按钮 + 激活分段的合计，防止强调失效。
3. 错误必须同时有：红色 + 图标（`!`）+ 文字说明三要素，缺一不可（见 §10 无障碍）。
4. 深色底上永远不用纯白 `#FFFFFF` 作正文（刺眼），核心数值用 `#FFC169` 或 `#E8EAED`。

---

## 2. 排版系统

### 2.1 字体栈

```css
/* 中文正文栈 */
--font-ui: "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", "Segoe UI", sans-serif;

/* 数值专用等宽栈（分辨率 / 比例 / 误差 / 输入框数字） */
--font-num: "JetBrains Mono", "SFMono-Regular", "Cascadia Mono", "Roboto Mono", Consolas, "Courier New", monospace;
```

说明：本地静态工具，不引 webfont；Windows 落到 Microsoft YaHei + Consolas，macOS 落到 PingFang SC + SF Mono，均能保证等宽数字效果。若项目愿意带一个本地字体文件，**首选内置 JetBrains Mono**（开源、tabular-nums 支持完整）。

### 2.2 字号阶梯（7 级）

| 级别 | Token | 字号/行高 | 字重 | 字体栈 | 用途 |
|---|---|---|---|---|---|
| 1 | `--text-xl-num` | 40px / 48px | 600 | mono | 结果面板核心比例值（如 `16 : 9`） |
| 2 | `--text-lg` | 20px / 28px | 600 | ui | 顶栏标题 |
| 3 | `--text-md` | 15px / 22px | 600 | ui | 面板标题（分组名） |
| 4 | `--text-body` | 14px / 22px | 400 | ui | 正文、说明文字 |
| 5 | `--text-num` | 13px / 20px | 400 | mono | 表格数值、输入框数字（输入框用 15px 例外，见 §4.1） |
| 6 | `--text-caption` | 12px / 18px | 400 | ui | 表头、单位、辅助说明 |
| 7 | `--text-micro` | 11px / 16px | 500 | ui | 徽章（含拉丁字母时加 `letter-spacing: 0.05em`） |

### 2.3 数值排版硬规则

- 所有数字一律 `font-variant-numeric: tabular-nums;`（等宽数字，列表纵向对齐的生命线）。
- 所有数值文字使用 `--font-num` 等宽栈。
- **核心比例值规格**（本工具视觉主角）：40px / 600 / `#FFC169` / mono，比例中间的分隔符（`:`）前后各空 0.25em，分隔符本身用 `#6E747E` 弱化（`16 : 9` 中冒号退后，数字前进）。
- **核心分辨率值规格**：24px / 600 / `#E8EAED` / mono，如 `7680 × 2160`（`×` 用 `#6E747E`）。
- 负号用真 minus（U+2212）或短横线 `-`，禁用连字符 `–`；乘号统一 `×`（U+00D7）。

---

## 3. 间距与栅格

### 3.1 间距刻度（6 档）

| Token | 值 | 用途 |
|---|---|---|
| `--space-1` | 4px | 图标与文字间距、徽章内水平 padding 的一半 |
| `--space-2` | 8px | 输入框内图标距边、表格单元格上下 padding、徽章内边距 |
| `--space-3` | 12px | 面板内分组间距、按钮内左右 padding |
| `--space-4` | 16px | 面板内边距（上下左右统一 16px）、面板标题与内容间距 |
| `--space-5` | 24px | 页面外边距、三栏之间的 gap、面板内大分组间距 |
| `--space-6` | 32px | 页面上下留白、单栏移动端面板间距 |

### 3.2 页面布局（三栏）

- 顶栏 Header：高 56px，通栏，底边 1px `--border-subtle`，含产品名（`--text-lg`）与副标题（`--text-caption`，`#A8ADB5`）。
- 内容区：`max-width: 1440px; margin: 0 auto; padding: 24px;` 三栏 `display: grid; gap: 16px;`
  - A 输入面板：固定 **320px**
  - B 可视化舞台：**flex 剩余宽度，最小 480px**（grid 中 `minmax(480px, 1fr)`）
  - C 换算结果面板：固定 **400px**
- 面板统一：`background: --bg-panel; border: 1px solid --border-subtle; border-radius: 8px; padding: 16px;` **不用投影**（深色主题下投影是无效装饰，层级靠明度差）。

### 3.3 断点（3 档，均为 max-width 媒体查询）

| 断点 | 触发条件 | 布局 |
|---|---|---|
| 桌面三栏 | 视口 ≥ 1101px | A(320) + B(minmax(480,1fr)) + C(400)，B 高度 480px |
| 平板两栏 | 视口 ≤ 1100px | 左列 A(320 固定)，右列 = B(上，高度 360px) 与 C(下) 纵向堆叠；gap 16px |
| 移动单栏 | 视口 ≤ 760px | 单列纵向：**A 输入面板 → C 换算结果面板 → B 可视化舞台**（理由：移动端用户最短路径是"输入→看结果"，可视化是校验辅助，放最后）；面板间距 16px，页面 padding 16px |

### 3.4 圆角刻度（3 档，全项目仅此 3 档）

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 4px | 徽章、小标签 |
| `--radius-md` | 6px | 按钮、输入框、分段控件 |
| `--radius-lg` | 8px | 面板、可视化舞台 |

**禁用胶囊形（border-radius ≥ 高度一半）按钮**，本工具任何按钮不得出现。

---

## 4. 组件规格

### 4.1 数字输入框

- 尺寸：高 **36px**，宽 = 所在分组 100%；面板内两个并排输入（宽/高）时各占 `(100% - 12px) / 2`。
- 结构：`background: --bg-card; border: 1px solid --border-default; border-radius: 6px; padding: 0 44px 0 12px;`（右侧 44px 预留给单位后缀）。
- 文字：15px / 20px mono，`--text-primary`，`tabular-nums`。
- **单位后缀**：绝对定位 `right: 12px` 垂直居中，12px / `--text-secondary`（如 `m`、`px`），输入时保持常显（不随焦点隐藏）。
- **步进箭头**：隐藏原生 spinner（`appearance: none` 或用 `type="text" inputmode="decimal"`）。步进用输入框右侧一对 24×24px 的 `−` / `+` 微按钮（仅 hover 输入框时显示 `opacity 0→1`，图标 12px `--text-secondary`，hover 变 `--text-primary`，点击区域 24×24）。键盘 ↑/↓ 步进必须支持（这是专业工具的习惯）。
- 状态：
  - **默认**：边框 `--border-default`
  - **hover**：边框 `--border-strong`
  - **focus**：边框 `--accent` + `outline: 2px solid --accent-strong; outline-offset: 2px`（outline 是全局 focus 统一样式，见 §10）
  - **error**：边框 `--error`，背景叠加 `--error-bg`，输入框下方 8px 处出现 12px 错误文案 `--error` + 前置 `!` 图标，占位布局（预留 20px 高度防跳动）
  - **disabled**：背景 `--bg-panel`，文字与单位 `--text-muted`，边框 `--border-subtle`，`cursor: not-allowed`
- 占位符：`--text-muted`，格式提示型（如 `如 14`）。

### 4.2 单位切换器（分段控件）

- 容器：高 32px，`background: --bg-card; border-radius: 6px; padding: 2px;` 内部 `display: flex;`，段等分。
- 未激活段：文字 13px / `--text-secondary` / 400，`border-radius: 4px`（内层半径 = 外层 − padding），`cursor: pointer`，hover 文字变 `--text-primary`。
- **激活段**：`background: --accent; color: --on-accent; font-weight: 600; border-radius: 4px;`（小面积实色琥珀 = 控件身份，符合 §1.5 面积约束）。
- 段间切换无滑动动画（禁止），仅状态瞬切。
- 键盘：容器 `role="radiogroup"`，方向键切换，Tab 进入，焦点环同全局。

### 4.3 按钮（三种 + 复制）

全局：高 **32px**，水平 padding 12px，字号 14px，`border-radius: 6px`，`cursor: pointer`。

| 类型 | 默认 | hover | active | disabled |
|---|---|---|---|---|
| 主按钮 | 底 `--accent`，字 `--on-accent`，600 | 底 `--accent-strong` | 底 `--accent`，`transform: none`（禁位移），加 `filter: brightness(0.92)` | 底 `--bg-card`，字 `--text-muted`，边框 `--border-subtle` |
| 次按钮 | 透明底，1px 边框 `--border-default`，字 `--text-primary` | 边框与字变 `--accent-strong` | 边框 `--border-strong` | 同上 disabled |
| 幽灵按钮 | 无底无边框，字 `--text-secondary` | 字 `--text-primary`，底 `--bg-card` | 字 `--text-primary` | 字 `--text-muted`，`cursor: not-allowed` |

- 全局禁用按钮投影、禁用任何位移/缩放动画。
- **复制按钮**（本工具高频动作，单独规格）：次按钮形态，高 **28px**，内含 14px「复制」图标（两个叠置矩形线框图标）+ 文字 13px，水平 padding 10px。
  - **成功反馈态**：点击后 120ms 内过渡为——图标换成 ✓、文字变「已复制」、字色 `--success`、底色 `--success-bg`、边框 `rgba(76,195,138,0.4)`；保持 **1600ms** 后恢复原态（恢复时无动画直接切回，避免闪烁）。
  - 失败态（剪贴板 API 拒绝）：图标 `!`、文字「复制失败」、字色 `--error`、底 `--error-bg`，保持 2000ms；旁路提示手动全选。
  - 成功/失败均同步向 aria-live 区域播报（§10）。

### 4.4 结果面板（C 栏）

自上而下：

1. **面板标题**「换算结果」15px/600 `--text-primary`，右侧挂当前状态徽章（§4.6）。
2. **核心比例区**：核心比例值（40px 规格，§2.3）居左，下方紧贴核心分辨率值（24px 规格）与「像素密度 / 换算说明」两行 13px mono `--text-secondary`。该区底部 16px 间距后接 1px `--border-subtle` 分隔线。
3. **误差表格**（§6）。
4. **底部提示条**（§4.8）。

### 4.5 预设规格选择 —— 采用**紧凑列表**（否决卡片）

**理由**：① 预设数量会随 LED 箱体型号增长（P1.86 / P2.5 / 16:9 / 4:3 / 21:9 / 自定义…），卡片网格在数量 >6 时必然出现"卡片堆叠感"（客户明令禁止的观感）；② 专业工具的密度审美是"一行一预设、可扫读"；③ 列表天然支持键盘上下键选择。

- 列表行：高 **40px**，水平 padding 12px，左右两段式：左段预设名（14px `--text-primary`）+ 右段预设参数（13px mono `--text-secondary` 右对齐，如 `1920 × 1080`）。
- 行间分隔：1px `--border-subtle`（首行无）。
- **hover**：整行底 `--bg-card`。
- **选中态**：整行底 `--accent-bg`，左侧 2px `--accent` 竖向指示条（绝对定位 `left: 0`，高 = 行高 − 8px 上下居中），预设名加粗 600。
- 列表最大高度 240px，超出滚动（滚动条宽 8px，thumb `--border-strong`，track 透明）；列表底部留"自定义"幽灵按钮行。
- 键盘：列表容器可 focus，↑↓ 移动高亮（高亮 = hover 样式），Enter 选定，Esc 清除。

### 4.6 状态徽章（4 类 + 兜底）

统一规格：高 22px，水平 padding 8px，`border-radius: 4px`，11px / 500，`--text-micro` 规格，**图标 + 文字双要素**（图标 12px，与文字间距 4px）：

| 徽章 | 图标 | 文字 | 字/图标色 | 底 | 边框 |
|---|---|---|---|---|---|
| 严格匹配 | ✓（对勾） | `严格匹配` | `--success` | `--success-bg` | `rgba(76,195,138,0.4)` |
| 非标准比例 | ▲（三角） | `非标准比例` | `--warning` | `--warning-bg` | `rgba(242,178,62,0.4)` |
| 取整误差 | Δ（希腊 Delta，表差值） | `取整误差` | `--info` | `--info-bg` | `rgba(92,168,255,0.4)` |
| 需现场确认 | !（叹号，圆圈描边） | `需现场确认` | `--text-secondary` | `--bg-card` | `--border-default` |
| 错误兜底 | ! | `输入有误` | `--error` | `--error-bg` | `rgba(240,97,109,0.4)` |

**颜色永远不是唯一载体**：每类徽章的图标形状互不相同（✓ / ▲ / Δ / !），文字互不相同。

### 4.7 严格匹配 vs 非严格匹配的视觉区分（结果面板主判定）

不依赖颜色，三通道区分：

1. **徽章**：`✓ 严格匹配`（绿）vs `▲ 非标准比例`（琥珀）——图标形状 + 文字不同；
2. **核心比例值后缀**：严格匹配时比例值右侧追加 12px `--success` 文字 `（整数比）`；非严格时追加 `（约化值）`，色 `--text-secondary`；
3. **可视化舞台角标**：屏幕矩形左上角外侧挂同款徽章（同 §4.6 规格），B/C 两处同屏可见。

### 4.8 提示条 / 警示条

- 提示条（信息型，如「实际交付分辨率以现场控制卡参数为准」）：通栏，高 40px（两行文字时 52px），`background: --info-bg; border-left: 3px solid --info; border-radius: 4px;`，内 padding 12px，`ℹ` 图标 14px `--info` + 文字 12px / 18px `--text-secondary`，图标距文字 8px。**无右侧关闭按钮**（该提示为常驻合规说明，不可关）。
- 警示条（需用户处理，如「当前输入超出常见箱体拼接范围」）：同结构，`--warning` 与 `--warning-bg`，图标 `▲`。
- 警示条可以有关闭 `×`（幽灵按钮 24×24），关闭状态本次会话内记忆。

---

## 5. ★ 屏幕比例可视化专项（视觉核心）

### 5.1 容器与等比绘制算法

- 舞台容器（B 栏）：`background: --bg-stage; border: 1px solid --border-subtle; border-radius: 8px;`，桌面高度 **480px**（两栏断点 360px），内 padding 32px（四周预留标注线空间）。
- **绘制方案：CSS `aspect-ratio` 为主 + JS 兜底**，取舍如下：

  **推荐写法（CSS，覆盖 95% 场景）**——利用 `aspect-ratio` 的 transferred size constraint（max 约束会沿比例传导到另一轴）：

  ```css
  .screen-rect {
    aspect-ratio: var(--screen-ratio);   /* 如 14 / 4 */
    max-width: 100%;      /* 受容器宽约束 */
    max-height: 100%;     /* 受容器高约束，且会反向约束宽度 */
    width: 100%;          /* 期望先占满宽 */
    margin: auto;         /* 舞台为 flex 容器时居中 */
  }
  ```

  舞台内容区用 `display: flex; align-items: center; justify-content: center;`。当 `width:100%` 推出的高度超容器时，`max-height` 通过比例传导把宽度压回来，14m×4m（3.5:1）呈明显超宽矩形、1:1 呈正方形、10:1 极端比也只会缩到容器宽为止，**不撑破容器**。

  **JS 兜底（边缘保险）**：初始化与窗口 resize 时校验一次 `rect.width ≤ stageWidth && rect.height ≤ stageHeight`，若失守（老浏览器 transferred 约束未实现），按 `scale = min(stageW / w, stageH / h)` 显式设置像素宽高。兜底逻辑十几行，成本低，保险价值高。

  **不推荐**：纯 JS 每帧计算（没必要）与 SVG viewBox 方案（标注线与 hatch 的混排实现成本高于 div + CSS）。

- 屏幕矩形本体：`background: #17181C; border: 1px solid #8A9099;`（1px 实线灰 = LED 屏物理边界；#8A9099 对 #101216 舞台底对比度 4.6:1，满足图形 3:1）。圆角 0（屏幕是方的，圆角会撒谎）。

### 5.2 矩形内/外的尺寸标注

- **标注位置**：宽标注在矩形正下方 12px，水平居中；高标注在矩形正右侧 12px，垂直居中（竖排数字不旋转，直接横排如 `4m`）。标注文字：11px mono / `--text-secondary` / 500，如 `14 m`、`4 m`。
- **标注线**：1px `--border-strong` 实线 + 两端 4px 竖向端线（classic dimension line 画法）；宽标注线长 = 矩形宽，高标注线长 = 矩形高。文字底加 4px `--bg-stage` 的 padding 垫底，避免压线。
- 比例标注（如 `3.5 : 1`）放矩形正上方 12px，11px mono `--text-muted`（辅助信息，弱化）。

### 5.3 目标画布轮廓叠加（二维策略表：contain / cover × 宽窄）

**术语定义（全节统一，开发照此理解）**：

- **屏幕矩形** = LED 物理边界，宽高比记 **S**；
- **画布轮廓** = 目标视频画布，宽高比记 **C**；
- **完整显示（contain）** = 画布整体缩放进屏幕矩形内，不切掉任何画面内容，剩余区域为黑边；
- **铺满（cover）** = 画布缩放到盖满屏幕矩形，超出部分被裁掉。

画布轮廓统一：`border: 1.5px dashed --accent-strong`（琥珀虚线 = 目标画布，与屏物理边界的灰色实线形成"实物 vs 目标"的明确语法），轮廓左上角外侧挂 11px `--text-accent` 标签文字（如 `16:9 画布`）。

**二维策略表**（UI 渲染叠加层的唯一几何依据；黑边区底色 `#0A0A0C` 比舞台更深，hatch 写法见下）：

| 画布比例 C 相对屏幕比例 S | 完整显示（contain） | 铺满（cover） |
|---|---|---|
| C < S（画布比屏窄） | 画布按**屏高**撑满、水平居中；**左右**为留黑边区（`pillarboxAxis='x'`） | 画布按**屏宽**撑满；**上下**被裁（`coverCropAxis='y'`） |
| C > S（画布比屏宽） | 画布按**屏宽**撑满、垂直居中；**上下**为留黑边区（`containBarAxis='y'`） | 画布按**屏高**撑满；**左右**被裁（`coverCropAxis='x'`） |
| C = S（一致） | 画布与屏幕矩形完全重合：虚线描边叠加在屏矩形边缘外扩（`inset: -3px`），无黑边无裁切 | 同左，完全重合，无黑边无裁切 |

**裁切/黑边区的 hatch 斜线阴影（可直接抄）**：

```css
/* CSS 方案（推荐，零依赖） */
.hatch-area {
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(240, 168, 50, 0.16) 0px,
    rgba(240, 168, 50, 0.16) 1px,
    transparent 1px,
    transparent 8px
  );
}
/* 裁切区改用错误色斜线：rgba(240, 97, 109, 0.16)，与留黑边（琥珀）语义区分 */
```

```html
<!-- SVG 方案（备选，若矩形改用 SVG 绘制） -->
<defs>
  <pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(240,168,50,0.16)" stroke-width="1"/>
  </pattern>
</defs>
<rect fill="url(#hatch)" ... />
```

hatch 线宽 1px、间距 8px、透明度 0.16——远低于文字对比度要求，因此 hatch **只是辅助**，语义必须同时由区内文字（`留黑边` / `此处被裁切`，前者 11px `--text-muted`，后者 11px `--error`）承载。

**实现铁律（三条，违反即返工）**：

1. **UI 不许自己比较 C 与 S 来判断裁切/黑边落在哪个轴**——必须读取 core.js `fitAdvice()` 返回的轴向字段：`coverCropAxis`（`'x'`=左右 / `'y'`=上下 / `null`=不适用）、`containBarAxis`、`cropAxis`、`pillarboxAxis`。字段值为 `null` 表示该策略下无裁切/无黑边（含 C=S 情形）。UI 的职责是"按字段渲染"，不是"自己算几何"。
2. **术语与字段名以 core.js 为准，禁止改名**：`pillarboxPx`（柱状黑边）= 左右两侧、`letterbox`（信状黑边）= 上下两侧——这是行业标准术语。**core.js 的字段名保持不变，不要改 core.js**；后续开发不得以"命名统一"为由重命名。
3. **hatch 斜线区语义**：留黑边区用琥珀色斜线 `rgba(240,168,50,0.16)`，裁切区用错误红斜线 `rgba(240,97,109,0.16)`；区内文字标签（`留黑边` / `此处被裁切`）必须保留——颜色不是唯一信息载体。

#### 5.3.1 core.js 接口契约（UI 调用方式）

```
fitAdvice(屏幕宽px, 屏幕高px, 画布比例)
```

返回对象字段（UI 直接按 axis 字段渲染叠加层，全部为只读消费；表中 W = 容器宽、H = 容器高、R = 内容比例，即 `fitAdvice` 的三个实参）：

| 字段 | 类型 | 含义 |
|---|---|---|
| `mode` | `'exact'` \| `'crop'` \| `'letterbox'` | 匹配模式（精确 / 裁切 / 黑边） |
| `cropPx` | number | ◇ **core 推荐方案快捷字段**（只用于文字提示，**不用于画叠加层**）：R > 容器比时 = 左右各裁量 `(H·R−W)/2`，否则恒为 0；与 `pillarboxPx` 互斥（二者永远只有一个非零）；配对 `cropAxis` |
| `pillarboxPx` | number | ◇ **core 推荐方案快捷字段**（只用于文字提示，**不用于画叠加层**）：R < 容器比时 = 左右各补黑边量 `(W−H·R)/2`，否则恒为 0；配对 `pillarboxAxis`（恒为 `'x'` 或 `null`） |
| `coverCropPx` | number | ★ **策略恒定字段**（画叠加层用）：cover 策略裁切量——R > 容器比时左右各裁 `(H·R−W)/2`，R < 容器比时上下各裁 `(W/R−H)/2`；配对 `coverCropAxis` |
| `containBarPx` | number | ★ **策略恒定字段**（画叠加层用）：contain 策略黑边量——R < 容器比时左右各补 `(W−H·R)/2`，R > 容器比时上下各补 `(H−W/R)/2`；配对 `containBarAxis` |
| `coverCropAxis` | `'x'` \| `'y'` \| `null` | cover 裁切轴向：`'x'`=左右被裁 / `'y'`=上下被裁 / `null`=不适用 |
| `containBarAxis` | `'x'` \| `'y'` \| `null` | contain 黑边轴向：`'x'`=左右黑边 / `'y'`=上下黑边 / `null`=不适用 |
| `cropAxis` | `'x'` \| `'y'` \| `null` | 当前 mode 的裁切轴向 |
| `pillarboxAxis` | `'x'` \| `'y'` \| `null` | 柱状黑边轴向（pillarbox 语义固定为 'x'，非柱状时 null） |

UI 渲染叠加层的唯一路径：`fitAdvice(...) → 按 axis 字段决定 hatch 区落在哪个轴 → 按 Px 字段决定 hatch 区宽度 → 渲染`。

**⚠️ 容器方向警告（本工具最容易画反的地方，画叠加层前必读）**

`fitAdvice(containerW, containerH, contentRatio)`（core.js 源码形参名为 `canvasWidth / canvasHeight / contentRatio`）的语义是「**把内容塞进容器**」：**前两个参数是容器，第三个参数是内容比例**。

- **舞台叠加层（屏幕 vs 画布）**：容器 = 屏幕矩形，内容 = 目标画布 → 调用 `fitAdvice(屏幕宽px, 屏幕高px, 画布比例C)`。
- **core 内部 `canvasFromWidth` / `canvasFromHeight` 结尾的那次调用**（如 `fitAdvice(W, bestRoundedHeight, R)`）：容器 = 输出画布，内容 = 目标比例 R → **语义与舞台场景相反**；且因 R 与输出画布比例几乎一致（差异仅为取整误差），该结果算的是"画布 vs 目标比例"的取整余量，**对舞台叠加层没有参考价值，不许复用**。
- **UI 画叠加层只允许用两组策略恒定字段**：`coverCropPx` + `coverCropAxis`（铺满策略）、`containBarPx` + `containBarAxis`（完整显示策略）；`cropPx` / `pillarboxPx` / `cropAxis` / `pillarboxAxis` 是 core 推荐方案的快捷值，**只用于文案提示，不用于画叠加层**。

核心判断：`canvasFromWidth().fitAdvice` 与 `fitAdvice(屏W, 屏H, C)` 在同一场景下 **axis 可能相反**。动手画之前，请用两个用例并排打印对比，确认你取的是后者。

### 5.4 比例差异的视觉表达（候选与推荐）

| 候选 | 描述 | 评价 |
|---|---|---|
| A. 叠加对比 | 画布虚线轮廓直接叠加在屏矩形上，hatch 标出裁切/黑边 | ✅ **推荐**。同屏直接看到"画布在屏上怎么放、裁掉哪"，信息密度最高、零学习成本 |
| B. 双矩形并排 | 屏与画布各画一个矩形，左右并排 | ❌ 需要用户脑内做几何对比，专业用户也要多看两秒 |
| C. 误差百分比色条 | 用色条长短表现误差大小 | ❌ 把连续量硬编码成视觉长度，不如表格里一个精确数字 + 徽章直接 |

**采用 A 为主，C 的精确数字形态为辅**：可视化叠加（A）给直觉，误差表格的精确百分比数字（§6）给精度——直觉 + 数字双保险，这也符合"专业数据可视化"的定位。

### 5.5 网格 / 标尺辅助线（克制原则）

- **不画**刻度标尺（ruler）——标尺是编辑器隐喻，换算工具用不上，画了就是装饰。
- 提供两个辅助开关（右上角幽灵按钮组，默认**全关**）：
  - 「中心线」：过屏矩形中心的水平 + 垂直虚线 `1px dashed rgba(232,234,237,0.15)`；
  - 「九宫格」：3×3 均分虚线，同色同规格。
- 开关按钮：24px 高幽灵按钮，激活时文字变 `--text-primary`、底部 2px `--accent` 短线（宽 12px 居中）。

---

## 6. 表格与数值展示（误差表格）

- 表格宽 = 结果面板内容宽（400 − 32 = 368px），位于核心比例区下方，与上方分隔线间距 16px。
- **列**（4 列）：项目名（左对齐，120px）/ 屏幕值 / 画布值 / 偏差（后三列数值右对齐，各 76px 左右按内容均分）。
- 表头：12px / `--text-secondary` / 500，高 32px，底部 1px `--border-default`；表头无背景色。
- 数据行：高 36px，行间 1px `--border-subtle`，文字 13px mono / `--text-primary` / `tabular-nums`，**数值列一律右对齐**（对齐是小数对齐的前提）。
- 行 hover：底 `--bg-card`（仅装饰性，无点击行为时也可省略——建议保留，暗示可扫读）。
- 偏差列：正值前缀 `+`，零值显示 `0`，色值规则：|偏差| = 0 → `--success`；其余 → `--text-primary`（不用红绿轰炸，只有徽章承担状态语义）。
- **小数位**：偏差百分比固定 **2 位小数**（`±3.25%`）；比例值最多 4 位有效小数、末尾去零（`2.35 : 1` 不写成 `2.3500 : 1`）。
- **千分位规则（明确）**：分辨率类数值 **≥ 10,000 时加千分位逗号**（`10,240`），4 位数不加（`1920` / `3840` / `7680` 保持行业习惯写法）；像素总量等大数一律加千分位（`16,588,800`）。规则写死：`value >= 10000 ? toLocaleString('zh-CN') : String(value)`。

---

## 7. 状态与反馈

- **复制成功/失败**：见 §4.3 复制按钮——颜色 + 图标 + 文字三通道，成功停 1600ms、失败停 2000ms，同时写入 aria-live。
- **加载态：无。** 本工具为纯本地同步计算（输入 → 换算在同一事件循环内完成），任何 loading 视觉都是谎言。明确要求：**不设计、不实现任何 loading/spinner/skeleton。**
- **空状态**（用户尚未输入时结果面板的样貌）：核心比例区显示占位符 `— : —`（40px 规格，色 `--text-muted`），下方 12px `--text-muted` 文字「在左侧输入屏幕尺寸后自动换算」；误差表格区域不渲染（占位高度 0，避免空表格框）。这是**真实会出现的异常态**，已按走查表补齐。
- **错误态**：输入非法（非正数、超出量程）时——输入框 error 态（§4.1）+ 结果面板徽章转 `! 输入有误` + 核心比例区回退空状态。三处同步，单一数据源驱动。

---

## 8. 动效（白名单制，仅 2 处）

| # | 动效 | 规格 | 说明 |
|---|---|---|---|
| 1 | 数值更新淡入 | `opacity 0.6 → 1`，时长 **120ms**，缓动 `ease-out`，仅作用于核心比例区与新表格行 | 输入变化时的"结果刷新了"轻提示 |
| 2 | 复制按钮反馈过渡 | 颜色/背景/边框过渡，时长 **120ms**，`ease-out` | 见 §4.3 |

- 其余一切动效**全部禁止**：无页面级转场、无面板滑入、无按钮位移缩放、无 hover 弹跳、无滚动视差。
- 全局遵守：`@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }`——上述 2 处动效一并关闭，功能无损（动效只是提示，不承载信息）。

---

## 9. 响应式细则

| 区域 | ≥1101px 三栏 | ≤1100px 两栏 | ≤760px 单栏 |
|---|---|---|---|
| 顶栏 | 56px 通栏 | 56px | 48px（标题缩到 17px） |
| A 输入面板 | 左列 320px | 左列 320px | 第一位，全宽 |
| B 可视化舞台 | 中列，高 480px | 右列上部，高 360px | **第三位**，高 300px，全宽 |
| C 换算结果面板 | 右列 400px | 右列下部 | **第二位**，全宽 |
| 页面 padding | 24px | 24px | 16px |
| 面板 gap | 16px | 16px | 16px |

- 单栏时核心比例值从 40px 降到 **32px**（行高 40px），防止小屏横向溢出；分辨率值 24px 不变。
- 两栏断点下 B/C 右列堆叠时，C 不设固定高，随内容伸展。

### 触摸目标（鼠标为主的桌面工具，但按可触控屏兼容）

- 所有可点击元素最小命中区 **36 × 36px**（视觉尺寸可小于此，如 24px 图标按钮用透明 padding 扩展命中区至 36px）；
- 列表行 40px 高已达标；徽章非交互元素，不适用。

---

## 10. 无障碍

1. **焦点顺序**：DOM 顺序 = 视觉顺序（A 栏自上而下 → B 栏控件 → C 栏按钮），代码上保证面板容器按 A→B→C 排 DOM，单栏断点时顺序天然正确（§9 已按此排布）。禁止任何 `tabindex > 0`。
2. **focus 可见性（全局统一）**：`*:focus-visible { outline: 2px solid --accent-strong; outline-offset: 2px; }`——琥珀双像素外扩环，在深色底上对比度 10.6:1，任何控件不豁免；禁止 `outline: none` 而不补替代方案。
3. **aria-live 区域**：
   - `#live-results`：挂在结果面板顶部（DOM 位置即物理位置），`role="status" aria-live="polite"`——播报换算结果摘要（「16 比 9，严格匹配」）；
   - `#live-feedback`：挂在复制按钮同级（按钮之后），`role="status" aria-live="polite"`——播报「已复制」/「复制失败」；
   - 输入错误：错误文案元素本身带 `role="alert"`（assertive 级），紧贴对应输入框。
   - live 区域视觉上 `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)`（视觉隐藏但可读屏）。
4. **颜色不作唯一信息载体**的落实（逐处）：状态徽章 = 图标形状 + 文字（§4.6）；严格/非严格 = 徽章 + 比例后缀文字 + 舞台角标（§4.7）；裁切/黑边 = hatch + 区内文字（§5.3）；误差 = 精确数字而非颜色深浅（§6）。全文档无一处"仅靠颜色传达语义"。
5. 表格数值右对齐 + tabular-nums 同时服务低视力用户（数字列不抖动、可逐行扫读）。

---

## 11. ASCII 布局线框图

### 11.1 桌面三栏（≥1101px）

```
┌───────────────────────────────────────────────────────────────────────────┐
│ (H) 顶栏 56px  「LED 比例换算台」14px副标题                         [中心线][九宫格] │
├──────────────────┬───────────────────────────────────┬────────────────────┤
│ (A) 输入面板      │ (B) 可视化舞台  flex(min 480px)     │ (C) 换算结果面板     │
│ 320px 固定       │ 高 480px                           │ 400px 固定          │
│                  │                                   │                    │
│ ┌屏幕尺寸──────┐ │      ┌────────────────────┐       │ 换算结果  [✓严格匹配]│
│ │宽 [ 14   ] m │ │ 3.5:1│  LED 屏矩形          │16:9画布│                    │
│ │高 [ 4    ] m │ │      │  (灰实线边框)        │       │   16 : 9           │
│ └──────────────┘ │      │  ┌──────────────┐  │       │   (整数比)          │
│ ┌单位 m|cm|px───┐ │      │  │hatch·留黑边   │  │       │   7680 × 2160      │
│ └──────────────┘ │      │  └──────────────┘  │       │ ────────────────── │
│ ┌目标画布──────┐ │      └────────────────────┘       │ 误差表格            │
│ │预设列表 40px/行│ │   └──────14 m──────┘  ↑4m        │ 项目|屏幕|画布|偏差  │
│ │ P2.5 箱体    │ │                                   │ ...36px/行          │
│ │ 16:9   ◀选中 │ │                                   │ ┌────────────────┐ │
│ │ 4:3         │ │                                   │ │ℹ 以现场参数为准  │ │
│ │ [自定义]──── │ │                                   │ └────────────────┘ │
└──────────────────┴───────────────────────────┴────────────────────┘
   gap 16px      页面 padding 24px, max-width 1440px 居中
```

### 11.2 移动单栏（≤760px）

```
┌───────────────────────────┐
│ (H) 顶栏 48px              │
├───────────────────────────┤
│ (A) 输入面板  全宽          │
│  宽 [14]m   高 [4]m        │
│  单位 [m][cm][px]          │
│  预设列表（高 240px 内滚动）│
├───────────────────────────┤
│ (C) 换算结果面板  全宽      │
│  换算结果  [✓严格匹配]     │
│  16 : 9  (32px)           │
│  7680 × 2160              │
│  误差表格（横向可滚动）     │
│  ℹ 以现场参数为准          │
├───────────────────────────┤
│ (B) 可视化舞台  全宽 高300px│
│  ┌───────────────┐        │
│  │  屏矩形+画布   │        │
│  └───────────────┘        │
└───────────────────────────┘
  页面 padding 16px, 面板间距 16px
```

注：单栏时误差表格若超出 368px 宽，允许容器横向滚动（`overflow-x: auto`），首列「项目名」粘性固定（`position: sticky; left: 0; background: --bg-panel`）。

---

## 12. 寇豆码实现要点清单（16 条编号项，逐条对照上文）

1. 落 `:root` CSS 变量（§13 全量清单），所有组件只引用变量，禁止硬编码 hex。
2. 布局：`grid-template-columns: 320px minmax(480px, 1fr) 400px; gap: 16px`，容器 `max-width: 1440px; margin: 0 auto; padding: 24px`；断点 `max-width: 1100px`（两栏）/ `max-width: 760px`（单栏，DOM 顺序 A→C→B）。
3. 字体：`--font-ui` / `--font-num` 两栈；**所有数字元素**加 `font-variant-numeric: tabular-nums`。
4. 输入框：36px 高、右侧 44px 单位后缀位、隐藏原生 spinner、↑/↓ 键盘步进、error 态预留 20px 文案高度；错误文案元素挂 `role="alert"`。
5. 屏幕矩形：CSS `aspect-ratio: var(--screen-ratio)` + `width:100%; max-width:100%; max-height:100%; margin:auto`，JS resize 兜底 `scale = min(cw/w, ch/h)`。
6. 画布轮廓：`border: 1.5px dashed var(--accent-strong)`；裁切/黑边区 hatch 用 `repeating-linear-gradient(-45deg, rgba(240,168,50,0.16) 0 1px, transparent 1px 8px)`（裁切区换 `rgba(240,97,109,0.16)`），区内必须带文字标签。
7. 裁切/黑边叠加层一律读 core.js `fitAdvice()` 返回的 axis 字段（`coverCropAxis` / `containBarAxis` / `cropAxis` / `pillarboxAxis`，null=无）决定 hatch 落在哪个轴，**不自己在 UI 里比 C 与 S 的大小**（几何判定归 core，UI 只渲染；契约见 §5.3.1）。
8. 徽章组件：图标 + 文字 + 色 + 12% 透明底四件套，5 类（严格匹配/非标准/取整误差/需现场确认/输入有误），图标形状互不相同。
9. 按钮三态（主/次/幽灵）32px 高、复制按钮 28px 高；复制成功 1600ms / 失败 2000ms 自动复位，无恢复动画。
10. 全局 focus：`:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px }`，任何控件不豁免。
11. 动效白名单仅 2 处（数值淡入 120ms ease-out、复制反馈过渡 120ms），其余禁；`prefers-reduced-motion: reduce` 时全关。
12. 误差表格：数值列右对齐、13px mono、行高 36px；偏差 2 位小数、正数带 `+`；千分位规则 `>=10000` 才加。
13. 空状态：`— : —` 占位（40px / `--text-muted`）+ 引导文案；错误态三处同步（输入框 / 徽章 / 核心区回退空态）。
14. aria-live 双区域（结果摘要 polite / 复制反馈 polite）+ 错误 alert，视觉隐藏样式见 §10.3。
15. **无任何 loading 态**——纯本地同步计算，禁止 spinner/skeleton。
16. 提示条常驻不可关闭（现场参数说明）；警示条可关闭且会话内记忆。

---

## 13. CSS 自定义属性清单（可直接落成 `:root`）

```css
:root {
  /* 背景 */
  --bg-app: #141518;
  --bg-stage: #101216;
  --bg-panel: #1B1D21;
  --bg-card: #26292F;
  --bg-card-hover: #2C3038;

  /* 边框 */
  --border-subtle: #26292F;
  --border-default: #33373E;
  --border-strong: #454A52;

  /* 文字 */
  --text-primary: #E8EAED;
  --text-secondary: #A8ADB5;
  --text-muted: #6E747E;
  --text-accent: #FFC169;

  /* 强调与状态 */
  --accent: #F0A832;
  --accent-strong: #FFC169;
  --on-accent: #141518;
  --success: #4CC38A;
  --warning: #F2B23E;
  --error: #F0616D;
  --info: #5CA8FF;

  /* 状态底（半透明） */
  --success-bg: rgba(76, 195, 138, 0.12);
  --warning-bg: rgba(242, 178, 62, 0.10);
  --error-bg: rgba(240, 97, 109, 0.10);
  --info-bg: rgba(92, 168, 255, 0.10);
  --accent-bg: rgba(240, 168, 50, 0.10);

  /* 字体 */
  --font-ui: "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", "Segoe UI", sans-serif;
  --font-num: "JetBrains Mono", "SFMono-Regular", "Cascadia Mono", "Roboto Mono", Consolas, "Courier New", monospace;

  /* 字号 / 行高 */
  --text-xl-num-size: 40px;  --text-xl-num-lh: 48px;   /* 移动端 32/40 */
  --text-lg-size: 20px;      --text-lg-lh: 28px;
  --text-md-size: 15px;      --text-md-lh: 22px;
  --text-body-size: 14px;    --text-body-lh: 22px;
  --text-num-size: 13px;     --text-num-lh: 20px;
  --text-caption-size: 12px; --text-caption-lh: 18px;
  --text-micro-size: 11px;   --text-micro-lh: 16px;

  /* 间距 */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 24px; --space-6: 32px;

  /* 圆角 */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px;

  /* 布局尺寸 */
  --header-h: 56px;          /* ≤760px 时 48px */
  --col-input: 320px;
  --col-result: 400px;
  --stage-h: 480px;          /* 两栏 360px / 单栏 300px */
  --input-h: 36px;
  --btn-h: 32px;
  --btn-copy-h: 28px;
  --list-row-h: 40px;
  --table-row-h: 36px;

  /* 动效 */
  --motion-fast: 120ms ease-out;
}
```

---

## 14. 禁止项自检表

| 客户/铁律禁止项 | 本方案如何避开 |
|---|---|
| AI 套图 / 模板搬运 / 同质化 | 深色后期工作台 + 琥珀强调是本工具专属定调（对齐达芬奇系专业工具语言），并带有本工具独有的视觉语法：灰实线=屏物理边界、琥珀虚线=目标画布、hatch=裁切/黑边——这套语法服务于换算语义，套模板做不出来 |
| 通用 SaaS 后台模板感（深色侧栏+白卡片堆叠） | 无侧边导航（单页三栏工作台）；无卡片堆叠——全页面只有 3 个面板，面板内用分隔线分组而非嵌套卡片；预设用列表不用卡片网格 |
| 过度装饰的渐变背景 | 全文档 0 处渐变背景；唯一 gradient 是 hatch 斜线的 repeating-linear-gradient，它是功能语义（裁切示意）不是装饰 |
| 大量无意义卡片 | 面板仅 A/B/C 三个，各有明确单一职责；组内分组用 1px 分隔线 |
| 过多圆角胶囊按钮 | 圆角全局仅 4/6/8px 三档，任何按钮 radius ≤ 6px < 高度一半，胶囊形物理上不可能出现 |
| 炫技式动画 | 动效白名单制，全站仅 2 处 120ms 微动效，且尊重 reduced-motion |
| 巨大标题占据操作空间 | 最大标题 20px（顶栏），视觉主角让位给 40px 的**数据**而非文字标语 |
| 只有视觉效果缺乏实用功能 | 每个视觉元素都绑定语义：hatch=裁切量、虚线=画布、徽章=匹配判定；无一处纯装饰元素 |
| 不可实施的模糊描述 | 全文档所有颜色/字号/间距/时长/断点均为具体值，第 13 节可直接落 `:root` |

---

## 15. 可变内容集中管理建议（本地工具的"可配置"等价物）

本工具为纯本地静态页、无云端，不适用"云端可配"；但可变内容仍应**集中在数据层而非散在组件里**，改预设不需要动样式与逻辑：

| 可变内容 | 建议存放 | 说明 |
|---|---|---|
| 预设列表（箱体/标准比例/名称/参数） | 独立 `presets.js` 或 `presets.json` 数据文件 | 后续加预设只改数据文件 |
| 提示条文案（"以现场参数为准"） | 数据层 `NOTICE_TEXT` 常量 | 客户可能改措辞 |
| 复制反馈停留时长（1600/2000ms）、误差小数位（2 位） | 顶部常量区 | 验收后可能微调 |
| 匹配判定阈值（何为"取整误差"） | 计算模块常量 | 归寇豆码定义，设计只承诺展示位（徽章/后缀文字） |
| 匹配容差设置项的默认值 | 引用 `LedCore.DEFAULT_TOLERANCE_PERCENT` | core.js 已导出 `EXACT_REL_TOL` / `APPROX_REL_TOL` / `MAX_DENOMINATOR` / `DEFAULT_TOLERANCE_PERCENT` 四个阈值常量；若 UI 做"匹配容差"设置项，默认值直接引用 `LedCore.DEFAULT_TOLERANCE_PERCENT`，**禁止另写魔法数字** |

---

*规格完 —— 郝美琳 · 2026-10-27*
