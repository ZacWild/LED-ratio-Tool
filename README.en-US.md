# LED Ratio Tool

> LED screen ratio & video canvas conversion tool — **one brand, two independent offline delivery forms**.

**Language / 语言**: [简体中文](README.md) · [English](README.en-US.md)

Convert the real width and height of an LED screen into its true aspect ratio, and help calculate video canvas sizes, ratio deviations and aspect-preserving fit options.

This project comes from the author's daily work with LED walls (odd-shaped, extra-long screens) in video production, where ratio and pixel conversion used to be painful every single time. The author hopes this small, genuinely useful tool can help others with similar needs — to use, review, report issues and improve.

**Current versions:**

| Delivery form | Version | Status |
|---|---|---|
| HTML offline version (single file) | 1.0.1 | ✅ Released (distributed with the repository) |
| Windows desktop version (Electron) | **1.3.0** | 🟡 **In development**: feature branch `feature/desktop-v1.3.0-pr10-guide` (LED pixel pitch features, in-app usage guide, bilingual UI), pending PR review; **not released, no Tag / Release / build artifacts** |
| Windows desktop version (last official release) | 1.2.0 | ✅ Released ([GitHub Release v1.2.0](https://github.com/ZacWild/LED-ratio-Tool/releases/tag/v1.2.0), 2026-11-04); rollback version |

---

## What it does

- Convert the physical width/height of an LED screen into the true aspect ratio and its simplest integer form.
- Calculate canvas sizes by target width, target height, common resolutions or integer multiples.
- Compare candidate resolutions against the target ratio, with deviation figures.
- Suggest cropping or letterboxing when the content ratio does not match the screen.
- Copy conversion results with on-site parameter notes, ready to hand over to post-production or on-site engineers.

Both delivery forms share the same calculation kernel (`src/core.js`); the core conversion capability is identical — they only differ in how they run. On top of that, the desktop version provides **desktop-exclusive capabilities** (px input unit, native menu and global shortcuts, local settings persistence) that the HTML offline version does not have.

**Desktop v1.3.0 (in development) adds desktop-only capabilities**: the global "LED pixel pitch P" setting with persistence, real px conversion as `physical size ÷ P`, the LED theoretical native resolution estimate (continuous value / integer estimate / rounding error kept side by side), cabinet / module specification verification (theoretical estimate and cabinet pixel matrix listed separately), the **in-app usage guide and P-value explanation**, and the **bilingual UI (Chinese / English, switched in Settings)**. None of these are back-ported to the HTML offline version; the HTML version remains 1.0.1 and **does not include any of the desktop-only capabilities above**.

---

## Which version to choose

| | HTML offline version | Windows desktop version |
|---|---|---|
| **Version** | 1.0.1 | **1.3.0 (in development)**; the latest official release is still 1.2.0 |
| **How it runs** | Open a single file in a local browser | Standalone Windows application (Electron) |
| **Installation** | None — double-click to use | The installer runs once; the portable build needs no installation |
| **Data storage** | Browser localStorage | Local user settings directory (persisted, survives reinstall; v1.3.0 adds an optional P-value field, compatible with old settings) |
| **Input units** | m / cm / mm | m / cm / mm / **px** (px means real pixel resolution; physical size ↔ px converts by the global P value, conversion is disabled while P is unconfigured) |
| **How to get it** | Download directly from the repository `dist/` directory | **v1.3.0 has no release packages yet** — feature branch source only; the [last official release v1.2.0](https://github.com/ZacWild/LED-ratio-Tool/releases/tag/v1.2.0) remains downloadable |
| **Best for** | Quick one-off use, cross-platform (any device with a browser) | Daily Windows use, standalone window, native menu & shortcuts, cabinet / pixel-pitch verification |

---

## HTML offline version (v1.0.1)

**Download:** [Download led-ratio-tool.html](https://github.com/ZacWild/LED-ratio-Tool/raw/refs/heads/main/dist/led-ratio-tool.html), save it locally and open it in a browser.
If there is no release, you can also get `led-ratio-tool.html` from the repository `dist/` directory.

1. Double-click the HTML file — no installation needed.
2. Enter the real width and height of the LED screen and confirm the unit.
3. Choose the target ratio and the canvas conversion mode.
4. Read the resolution and deviation, then use "Copy full parameters" to prepare handover notes.

- A fully self-contained single file: no external links, no CDN, no network requests — share via chat apps, USB sticks or e-mail.
- All calculation happens in the local browser; no internet needed and no input data is uploaded.
- Shared source: `index.html` + `src/` (`core.js` calculation kernel / `app.js` interaction / `styles.css` styles).

---

## Windows desktop version v1.3.0 (in development · not released)

> Branch `feature/desktop-v1.3.0-pr10-guide`, based on `main` HEAD `68b24d1`.
> **This version is not merged, not tagged, has no Release and no published build artifacts**; the following describes the feature set under review and does not constitute a release statement.

**Theme: global LED pixel pitch P + real PX conversion + LED theoretical native resolution estimate + cabinet / module specification verification + in-app usage guide + bilingual UI.**

| Capability | Description |
|---|---|
| Global "LED pixel pitch P" | A second independent settings row (next to the tolerance): 10 presets (P0.9 / P1.25 / P1.5 / P1.667 / P1.86 / P2 / P2.5 / P3 / P4 / P5) plus a custom value (mm). Only finite values > 0 are accepted; unconfigured stays `null` with an explicit "Not Configured" status — **no default P value**. |
| Settings persistence compatibility | Uses the existing `settings.get/set` channel (no new IPC channel or preload API); `pixelPitchMm` is an optional field, `schemaVersion` stays 1. A v1.2.0 four-key `settings.json` without the field is treated as unconfigured; writes are read → merge → atomic write. |
| Real PX conversion | **The v1.2.0 `1 px = 1 mm` assumption is removed.** `pixels = physical size (mm) ÷ P`. Physical size and pixel resolution are two separate semantics: PX input does not overwrite the physical size; switching px back to m/cm/mm restores the original physical values without reverse calculation; conversion is disabled while P is unconfigured, with an explicit notice. |
| LED theoretical native resolution estimate | An independent collapsible result block: theoretical continuous pixel values, integer estimate, theoretical total pixels, actual aspect ratio, rounding error and the current P value. Continuous value, integer estimate and error are **kept side by side without silent correction**; source label "Theoretical Estimate (Derived from P Value)". |
| Cabinet / module verification | An independent collapsible result block: enter cabinet width/height (mm), horizontal/vertical pixels per cabinet and column/row counts to get the tiled width/height, total pixels, actual tiled resolution and its difference from the theoretical estimate. Source label "Cabinet Pixel Matrix Calculation", listed separately from the theoretical estimate. |
| In-app usage guide | A "Usage Guide" (ⓘ) below the canvas preview, in four layers — quick start, LED professional features, parameters & results, module-by-module instructions. Auto-hidden on short windows so it never squeezes the preview. |
| P-value explanation | A collapsible explanation under the pitch settings row: what P means, how it is used, how to choose it from supplier specs, why there is no default, what changes when P switches, and the limits of theoretical values. |
| PX value source badge | In px input mode a compact badge near the top-right "Target resolution" shows where the current PX numbers come from — **Theoretical Estimate (Derived from P Value)** or **User Input**. Hidden in m/cm/mm modes and on stacked layouts. |
| Bilingual UI | "Interface language" dropdown inside the settings modal switches Simplified Chinese / English. Switching never reloads the page, never loses input values and never changes calculation results; the language preference persists across restarts. |
| Linkage | P value / physical size / cabinet parameters all recompute in real time; the original physical size and manually entered PX values are never overwritten by P changes. Existing ratio, simplest integer ratio, canvas suggestions and copy-full-parameters keep their behavior; the canvas suggestion never presents an estimate as a controller-confirmed resolution. |

**Boundary**: `src/core.js` (SHA-256 hash lock, 22 protected exports), root `src/app.js`, root `index.html`, `dist/led-ratio-tool.html` and the HTML offline version 1.0.1 are all untouched; `appId`, `APP_DIR_NAME`, the user data directory, IPC channels, the preload API surface and the Electron security settings are unchanged. New logic lives only in the desktop layer: `desktop/build/desktop-adapter.cjs`, `desktop/renderer/led-pitch.js`, `desktop/renderer/desktop-ui.js`, `desktop/renderer/guide.js` and `app.css`; generated copies are rebuilt by `npm run sync`, never hand-edited.

> ⚠️ The theoretical pixel resolution derived from the physical size ÷ P **does not equal** the input resolution confirmed by the LED control system; the theoretical estimate and the cabinet tiling result are on-site reference values only — final parameters must be confirmed by the control system, playback equipment and on-site engineers.

**Current test status**: new pitch / conversion / cabinet unit tests 26/26, settings upgrade compatibility 13/13, DOM-level probe 18/18, plus a set of existing local regressions all passing; the Electron-related desktop E2E, visual regression, high-DPI, P7 artifact fingerprint and installation acceptance were blocked by a local GPU process crash and need GitHub Actions runs as the authority. See [`CHANGELOG.md`](CHANGELOG.md) and [`desktop/README.md`](desktop/README.md).

### Usage guide and bilingual UI (PR #10)

- **Usage guide**: an "Usage Guide" (ⓘ) below the canvas preview in the middle column, in four layers — Quick start, LED professional features, Parameters & results, module-by-module instructions; auto-hidden on short windows.
- **P-value explanation**: a collapsible block under the pitch settings row (definition / purpose / how to choose from supplier specs / no default on first use / what changes on switching / limits of theoretical values).
- **PX value source badge**: in px input mode, a floating badge next to the top-right "Target resolution" shows **Theoretical Estimate (Derived from P Value)** or **User Input**; hidden in m/cm/mm modes and on stacked layouts.
- **Bilingual UI**: an "Interface language" dropdown inside the settings modal switches Simplified Chinese / English without reloading the page, without losing input values and without changing calculation results; the preference persists across restarts.
- **Unified terminology** (the Chinese and English UI and documentation use the same concepts, never mixed):

| Chinese | English | Meaning |
|---|---|---|
| LED 点间距（P 值） | Pixel Pitch (P Value) | Distance between adjacent pixel centres, in mm |
| 理论原生分辨率 | Theoretical Native Resolution | **Theoretical estimate** derived from physical size ÷ P |
| 理论宽高比 | Theoretical Aspect Ratio | Aspect ratio of the theoretical estimate |
| 取整误差 | Rounding Error | Difference between the integer estimate and the continuous value |
| 实际换算结果 | Actual Conversion Results | Ratio & canvas conversion (does not change with P) |
| 实际规格核验 | Actual Specification Check | Tiled specification computed from cabinet specs |
| 箱体像素矩阵计算 | Cabinet Pixel Matrix Calculation | Source label of the actual tiled resolution |
| 理论估算（由 P 值推算） | Theoretical Estimate (Derived from P Value) | PX value source badge |
| 用户输入 | User Input | PX value source badge (manual input, never overwritten by P) |
| 未配置 | Not Configured | Default P state (no default P value) |

> ⚠️ Concept separation: the **Theoretical Native Resolution** (estimate) ≠ the **Actual Tiled Resolution** (from cabinet specs) ≠ the **Controller Input Resolution** (confirmed by the LED control system). The three come from different sources and are always listed separately; final parameters are subject to confirmation by the control system and on-site engineers.

---

## Windows desktop version (last official release v1.2.0, 2026-11-04)

> The notes below describe a **published historical version**, kept for rollback and comparison. The v1.2.0 `1 px = 1 mm` convention has been removed in v1.3.0.

The Windows desktop version is a native application sharing the same calculation kernel as the HTML version, plus:

- **px input unit** (added in v1.2.0, **applies to v1.2.0 only**): enter the native pixel resolution directly (e.g. `1920×1080` → `1.7778:1`, `3840×1080` → `3.5556:1`). The internal convention **1 px = 1 mm** only affects the display conversion on unit switching — the ratio calculation depends only on the aspect ratio. In px mode result wording changes to "Input size" to avoid being misread as physical size. ⚠️ **This assumption was removed in v1.3.0**, replaced by real conversion using the global P value.
- Standalone application window, native menu bar, global shortcuts (e.g. `Ctrl+C` copy results, `Ctrl+B` swap width/height).
- Dark professional workspace UI and brand icons (installer / portable / taskbar / title bar share one source).
- **Local settings persistence**: tolerance and other settings are stored in the local user directory and survive upgrades and reinstalls.
- Fully offline: no network access, no data upload.

**Official release packages** ([Release v1.2.0](https://github.com/ZacWild/LED-ratio-Tool/releases/tag/v1.2.0), published 2026-11-04):

| Package | Download | Notes |
|---|---|---|
| Installer (NSIS) | [LED.Ratio.Tool-1.2.0-x64-setup.exe](https://github.com/ZacWild/LED-ratio-Tool/releases/download/v1.2.0/LED.Ratio.Tool-1.2.0-x64-setup.exe) | Wizard installation with Start-menu / uninstall entries |
| Portable | [LED.Ratio.Tool-1.2.0-x64-portable.exe](https://github.com/ZacWild/LED-ratio-Tool/releases/download/v1.2.0/LED.Ratio.Tool-1.2.0-x64-portable.exe) | No installation — double-click to use, good for USB sticks |
| Checksums | [SHA256SUMS.txt](https://github.com/ZacWild/LED-ratio-Tool/releases/download/v1.2.0/SHA256SUMS.txt) | SHA-256 of the two EXE files |

After downloading, verify file integrity with `SHA256SUMS.txt` (`sha256sum -c SHA256SUMS.txt`, or `certutil -hashfile <file> SHA256`).

> ⚠️ **On the unsigned binaries**: this tool is **not code-signed** (owing to project scale; the project owner has accepted this). Windows SmartScreen may show a prompt on first run — click "More info → Run anyway". The tool does not go online and does not upload data (the installer only writes standard uninstall entries and similar system information).

**Release status**: **officially released**. The desktop version completed development and full acceptance (real-Windows install / uninstall / upgrade, display scaling, portable build, security configuration). Download official installers only from the [Releases](https://github.com/ZacWild/LED-ratio-Tool/releases) page; do not trust unofficial channels.

---

## Important notes

**The physical size of an LED screen is not the native pixel resolution of the LED control system.** This tool calculates ratios and canvas suggestions from the entered sizes; it does not derive the resolutions actually supported by the controller or playback server. The desktop v1.3.0 "LED theoretical native resolution estimate" is a **theoretical value** from `physical size ÷ P`, not a controller-confirmed input resolution; "cabinet specification verification" computes the **tiled specification** from the cabinet pixel matrix. The two have different sources and are always listed separately — never interchangeable.

Before final delivery, confirm with the on-site engineers:

- The receive resolution of the LED control system
- The post-production compositing resolution
- The resolution of the final delivered video file

Do not assume on-site equipment can play content based only on this tool's results; actual parameters are subject to the control system, playback devices and on-site engineers.

Also, industry nicknames are not strict mathematical ratios. For example, strict **21:9 = 7:3 ≈ 2.3333:1**. Always work from the ratio computed from the real dimensions instead of substituting the nickname.

---

## Repository layout

```text
LED-ratio-Tool/
├── README.md / README.en-US.md / CHANGELOG.md / VERSION / DELIVERY.md / DESIGN-SPEC.md   project docs
├── index.html                     HTML version dev entry (used with src/)
├── src/                           HTML version source (core.js / app.js / styles.css)
├── build.mjs                      HTML version zero-dependency build script
├── dist/led-ratio-tool.html       ★ HTML offline single-file version (primary deliverable)
├── test/                          HTML version tests (unit / 90-item acceptance / red-line guards / shots)
├── desktop/                       ★ Windows desktop version (Electron)
│   ├── main/ preload/ renderer/   main process / preload / renderer source
│   ├── build/                     packaging & asset sync scripts (electron-builder config)
│   ├── resources/                 brand icons
│   ├── test/                      desktop test suite
│   │   ├── reports/               acceptance reports & raw evidence (JSON / shots)
│   │   └── probes/                one-off forensic probes (historical diagnostics)
│   └── README.md                  desktop status, test matrix & usage notes
└── .github/workflows/             Windows CI gates
```

---

## Development & testing

The project has zero third-party npm dependencies. After modifying the calculation logic:

**HTML version**

```bash
node --test test/core.test.mjs   # unit tests
node build.mjs                   # rebuild dist/led-ratio-tool.html
```

After editing front-end code, rebuild the single-file version so the offline file does not keep stale content.

**Windows desktop version**

The desktop version has its own test matrix (asset sync verification, security audit, desktop E2E, 200-case differential, visual regression, three-tier display-scaling acceptance, packaging verification); see [`desktop/README.md`](desktop/README.md). The desktop version shares the root `src/core.js` calculation kernel (protected by a SHA-256 hash lock, byte-for-byte reuse).

---

## Version information

- **The `VERSION` file (repository root) records the HTML offline version**, currently `1.0.1`.
- **The Windows desktop version number** lives in [`desktop/package.json`](desktop/package.json), currently **`1.3.0` (in development, not released)**; the **latest official release is still 1.2.0**, see [Releases](https://github.com/ZacWild/LED-ratio-Tool/releases). `desktop/package-lock.json` is kept in sync.
- The two delivery forms evolve and version independently; the full change history is in [`CHANGELOG.md`](CHANGELOG.md).

---

## Project history & AI collaboration

This project is **not a "one-prompt" artifact**. It was built under the leadership of the project owner, implemented by multiple AI models in phases, and converged through Git version management, automated testing, CI and manual acceptance.

The author has no programming background and is not a professional developer — in this project they act as the **product owner**: proposing the use case, defining requirements and acceptance criteria, deciding the scope, running test acceptance and authoring releases. Code was implemented by several AI models in Tencent WorkBuddy in **phased collaboration**, never as a one-shot output.

| Phase | Model | Scope |
|---|---|---|
| P1–P3 | Space Bunny | Early main development |
| P4–P5 | Step5-preview | Feature completion, testing & preview stage |
| P6 | MiniMax M3.1 Flash | Release readiness, test system, defect fixes, packaging & CI |
| RC wrap-up onwards | DeepSeek V4.1 | Leftover issues, local fixes, engineering docs, PR & release preparation |

**Quality assurance chain** (every phase must pass)

- **Git & PR**: development happens on feature branches; `main` is protected by a ruleset and merges require project-owner authorization (see [`GITHUB-RULES.md`](GITHUB-RULES.md)).
- **Automated tests**: unit tests, business red-line guards, desktop E2E, 200-case differential, visual regression, high-DPI acceptance and other gates; counts and current status in [`desktop/README.md`](desktop/README.md).
- **CI**: GitHub Actions runs the full gate set on every push and PR; status checks are part of branch protection.
- **Manual acceptance**: the product owner makes the final call on usability, visuals and release conditions — **passing automation does not mean ready to release**.

---

## License & feedback

- License: [MIT](LICENSE)
- Repository: [ZacWild/LED-ratio-Tool](https://github.com/ZacWild/LED-ratio-Tool)
- Issues welcome for bug reports and feature suggestions: [Issues](https://github.com/ZacWild/LED-ratio-Tool/issues)
- AI-generated code is not guaranteed defect-free; when used in real projects, verify the calculation results against on-site parameters.
