import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkKatexFontsInAsar, katexFontUrls } from '../scripts/katex-fonts-check.mjs';
import { writeAsar } from './support/asarFixture.ts';

/**
 * 打包版 KaTeX 字体：编辑器（渲染进程 CSS、Vditor 自带 KaTeX）和卡片出图（主进程 katex 包、
 * 发布弹窗缩略图）引用的每个 KaTeX 字体文件都必须真的打进 app.asar，缺一个检查就失败，
 * 否则公式会退回系统字体，排版错位。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'scripts', 'katex-fonts-check.mjs');

const KATEX_CSS =
  '.katex{font:normal 1.21em KaTeX_Main}' +
  '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff")}' +
  '@font-face{font-family:KaTeX_Math;font-style:italic;src:url(fonts/KaTeX_Math-Italic.woff2) format("woff2")}';

/** 和 electron-vite + electron-builder 真实产物同样布局的最小 app.asar 内容。 */
function completeApp(): Record<string, string> {
  return {
    'package.json': '{"name":"@vcat/desktop","version":"0.1.0"}',
    // 卡片出图：主进程 require('katex/dist/katex.min.css')，字体按 file:// 指向同目录 fonts/
    'node_modules/katex/dist/katex.min.css': KATEX_CSS,
    'node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2': 'w2',
    'node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff': 'w1',
    'node_modules/katex/dist/fonts/KaTeX_Math-Italic.woff2': 'w2',
    // 编辑器：index.css 打包后的 KaTeX @font-face
    'out/renderer/assets/index-AAA.css':
      '@font-face{font-family:KaTeX_Main;src:url("./KaTeX_Main-Regular-h1.woff2") format("woff2")}',
    'out/renderer/assets/KaTeX_Main-Regular-h1.woff2': 'w2',
    // 发布弹窗卡片缩略图：katex.min.css?inline 打进 JS，字体用 new URL(..., import.meta.url)
    'out/renderer/assets/index-BBB.js': `const c='@font-face{src:url(' + new URL("KaTeX_Math-Italic-h2.woff2", import.meta.url) + ')}';`,
    'out/renderer/assets/KaTeX_Math-Italic-h2.woff2': 'w2',
    // Vditor 运行时 KaTeX（编辑器公式渲染、导出 docx）
    'out/renderer/vditor/dist/js/katex/katex.min.css': KATEX_CSS,
    'out/renderer/vditor/dist/js/katex/fonts/KaTeX_Main-Regular.woff2': 'w2',
    'out/renderer/vditor/dist/js/katex/fonts/KaTeX_Main-Regular.woff': 'w1',
    'out/renderer/vditor/dist/js/katex/fonts/KaTeX_Math-Italic.woff2': 'w2',
  };
}

function asarWith(entries: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-katex-'));
  const file = path.join(dir, 'linux-unpacked', 'resources', 'app.asar');
  writeAsar(file, entries);
  return file;
}

function without(...names: string[]): Record<string, string> {
  const entries = completeApp();
  for (const n of names) delete entries[n];
  return entries;
}

test('字体齐全：四处 KaTeX 引用都能找到字体文件', () => {
  assert.deepEqual(checkKatexFontsInAsar(asarWith(completeApp())), []);
});

test('卡片出图（主进程 katex 包）缺字体：失败并指出缺哪个文件', () => {
  const errors = checkKatexFontsInAsar(asarWith(without('node_modules/katex/dist/fonts/KaTeX_Math-Italic.woff2')));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /卡片出图/);
  assert.match(errors[0], /node_modules\/katex\/dist\/fonts\/KaTeX_Math-Italic\.woff2/);
});

test('卡片出图整个 katex 包没打进去：失败', () => {
  const entries = completeApp();
  for (const k of Object.keys(entries)) if (k.startsWith('node_modules/katex/')) delete entries[k];
  const errors = checkKatexFontsInAsar(asarWith(entries));
  assert.ok(errors.some((e) => /卡片出图/.test(e) && /katex\.min\.css/.test(e)), errors.join('\n'));
});

test('编辑器打包 CSS 引用的字体缺失：失败', () => {
  const errors = checkKatexFontsInAsar(asarWith(without('out/renderer/assets/KaTeX_Main-Regular-h1.woff2')));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /编辑器/);
  assert.match(errors[0], /out\/renderer\/assets\/KaTeX_Main-Regular-h1\.woff2/);
});

test('编辑器 CSS 里根本没有 KaTeX 字体（样式没打进去）：失败', () => {
  const errors = checkKatexFontsInAsar(asarWith(without('out/renderer/assets/index-AAA.css')));
  assert.ok(errors.some((e) => /编辑器/.test(e)), errors.join('\n'));
});

test('发布弹窗卡片缩略图的字体缺失：失败', () => {
  const errors = checkKatexFontsInAsar(asarWith(without('out/renderer/assets/KaTeX_Math-Italic-h2.woff2')));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /缩略图/);
});

test('Vditor 自带 KaTeX 的字体缺失：失败', () => {
  const errors = checkKatexFontsInAsar(asarWith(without('out/renderer/vditor/dist/js/katex/fonts/KaTeX_Main-Regular.woff')));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Vditor/);
});

test('字体文件是 0 字节也算缺失', () => {
  const entries = completeApp();
  entries['node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2'] = '';
  const errors = checkKatexFontsInAsar(asarWith(entries));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /KaTeX_Main-Regular\.woff2/);
});

test('命令行：release 目录里字体缺失时退出码非 0，齐全时为 0', () => {
  const bad = asarWith(without('node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2'));
  const badRun = spawnSync(process.execPath, [script, path.dirname(path.dirname(path.dirname(bad)))], { encoding: 'utf8' });
  assert.notEqual(badRun.status, 0, badRun.stdout + badRun.stderr);
  assert.match(badRun.stderr, /KaTeX_Main-Regular\.woff2/);

  const good = asarWith(completeApp());
  const goodRun = spawnSync(process.execPath, [script, path.dirname(path.dirname(path.dirname(good)))], { encoding: 'utf8' });
  assert.equal(goodRun.status, 0, goodRun.stdout + goodRun.stderr);
});

test('命令行：release 目录里没有 app.asar 时失败', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-katex-empty-'));
  const run = spawnSync(process.execPath, [script, empty], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /app\.asar/);
});

test('真实 katex 包：CSS 引用的每个字体都在 dist/fonts 里（依赖升级改了布局时提前发现）', () => {
  const cssPath = createRequire(import.meta.url).resolve('katex/dist/katex.min.css');
  const urls = katexFontUrls(fs.readFileSync(cssPath, 'utf8'));
  assert.ok(urls.filter((u) => u.endsWith('.woff2')).length >= 15, `只解析到 ${urls.length} 个字体引用`);
  for (const u of urls) assert.ok(fs.existsSync(path.join(path.dirname(cssPath), u)), `缺 ${u}`);
});
