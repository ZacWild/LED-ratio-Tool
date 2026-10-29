/**
 * LED 大屏比例与视频画布换算工具 · 单文件离线版构建脚本
 * 零依赖：只用 node:fs / node:path / node:url。
 *
 * 产物：dist/led-ratio-tool.html
 *   —— 把 src/core.js、src/app.js、src/styles.css 全部内联进一个 HTML，
 *      产物可离线双击直接打开，无任何外链与网络请求。
 *
 * 用法：node led-ratio-tool/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = here;
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');
const outFile = join(distDir, 'led-ratio-tool.html');

const coreJs = readFileSync(join(srcDir, 'core.js'), 'utf8');
const appJs = readFileSync(join(srcDir, 'app.js'), 'utf8');
const stylesCss = readFileSync(join(srcDir, 'styles.css'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

/**
 * 把 HTML 里的外链标签替换为内联内容。
 * 只处理本项目自己的三个资源，不动其它标签。
 */
function inlineAssets(html) {
  let out = html;

  const styleRe = /[ \t]*<link rel="stylesheet" href="src\/styles\.css">\r?\n?/;
  if (!styleRe.test(out)) {
    throw new Error('未找到 <link rel="stylesheet" href="src/styles.css">，index.html 结构与构建脚本不匹配');
  }
  out = out.replace(styleRe, '<style>\n' + stylesCss + '\n</style>\n');

  const coreRe = /[ \t]*<script src="src\/core\.js"><\/script>\r?\n?/;
  if (!coreRe.test(out)) {
    throw new Error('未找到 <script src="src/core.js">，index.html 结构与构建脚本不匹配');
  }
  out = out.replace(coreRe, '<script>\n' + coreJs + '\n</script>\n');

  const appRe = /[ \t]*<script src="src\/app\.js"><\/script>\r?\n?/;
  if (!appRe.test(out)) {
    throw new Error('未找到 <script src="src/app.js">，index.html 结构与构建脚本不匹配');
  }
  out = out.replace(appRe, '<script>\n' + appJs + '\n</script>\n');

  return out;
}

/**
 * 产物自检：不允许残留外链、远程引用或本地文件引用。
 * 单文件版必须完全自包含。
 */
function assertSelfContained(html) {
  const forbidden = [
    { re: /<link[^>]+href=/i, why: '残留 <link href> 外链' },
    { re: /<script[^>]+\bsrc=/i, why: '残留 <script src> 外链' },
    { re: /@import\s/i, why: '残留 CSS @import' },
    { re: /https?:\/\//i, why: '残留 http(s) 远程引用' },
    { re: /url\(\s*['"]?(?!data:)[^)'"]*\.(png|jpe?g|gif|svg|woff2?|ttf|ico)/i, why: '残留图片/字体文件引用' }
  ];
  for (const item of forbidden) {
    if (item.re.test(html)) {
      throw new Error('产物自检失败：' + item.why);
    }
  }
}

const output = inlineAssets(indexHtml);
assertSelfContained(output);

mkdirSync(distDir, { recursive: true });
writeFileSync(outFile, output, 'utf8');

const bytes = statSync(outFile).size;
const kb = (bytes / 1024).toFixed(1);
console.log('构建完成：' + outFile);
console.log('产物大小：' + kb + ' KB（单文件、零外链、离线可用）');
