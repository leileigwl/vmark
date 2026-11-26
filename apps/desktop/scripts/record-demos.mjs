import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '../..');
const demosDir = path.join(repoRoot, 'docs/assets/demos');
const framesDir = process.env.DEMO_FRAMES_DIR || '';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const PREVIEW_PORT = 4179;
const BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
const MAX_GIF_BYTES = 3 * 1024 * 1024;

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crc]);
}

/** Generate a smooth horizontal/vertical gradient PNG data URL with a focal accent box. */
function makeGradientPngDataUrl(width, height, c1, c2, accent) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  const cx = Math.round(width * 0.36);
  const cy = Math.round(height * 0.48);
  const rad = Math.round(Math.min(width, height) * 0.22);

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    const ty = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const tx = x / Math.max(1, width - 1);
      const t = (tx * 0.7 + ty * 0.3);
      const distSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      const inCircle = distSq <= rad * rad;
      const px = row + 1 + x * 3;
      if (inCircle) {
        raw[px] = accent[0];
        raw[px + 1] = accent[1];
        raw[px + 2] = accent[2];
      } else {
        raw[px] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
        raw[px + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
        raw[px + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      }
    }
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server still booting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

function startPreviewServer() {
  const outRenderer = path.join(desktopDir, 'out/renderer');
  if (!fs.existsSync(path.join(outRenderer, 'index.html'))) {
    throw new Error('apps/desktop/out/renderer not built; run pnpm --filter @vcat/desktop build first');
  }
  const proc = spawn(
    'pnpm',
    ['exec', 'vite', 'preview', '--outDir', 'out/renderer', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'],
    { cwd: desktopDir, stdio: 'ignore' }
  );
  return proc;
}

async function installDemoApi(page, { articles, initialTheme = 'apple-light', lastArticlePath }) {
  const coverBanner = makeGradientPngDataUrl(960, 540, [41, 121, 255], [16, 185, 129], [255, 255, 255]);
  await page.addInitScript(
    ({ articleList, initialTheme: theme, lastPath, defaultImg }) => {
      const contents = Object.fromEntries(articleList.map((a) => [a.relativePath, a.content]));
      const metas = articleList.map(({ content: _c, ...rest }) => rest);
      const authMap = {
        github_static: true,
        weixin: true,
        cnblogs: true,
        juejin: true,
        csdn: true,
        zhihu: true,
        baijiahao: true,
        weibo: false,
        bilibili: true,
        douyin: true,
        xiaohongshu: true,
      };
      let startupCfg = { mode: 'last_opened', lastArticlePath: lastPath, theme };
      const updateState = {
        status: 'available',
        currentVersion: '0.4.0',
        latestVersion: '0.4.1',
        releaseName: 'v0.4.1 登录与多平台工作台优化',
        mode: 'manual',
      };
      const w = window;
      w.electronAPI = {
        getWorkspacePath: async () => '/Users/creator/Notes/Vmark-Workspace',
        getRecentWorkspaces: async () => ['/Users/creator/Notes/Vmark-Workspace'],
        listArticles: async () => metas,
        listFolders: async () => ['guides'],
        getImageBedConfig: async () => ({ strategy: 'platform_private', provider: 'smms' }),
        getStartupConfig: async () => startupCfg,
        saveStartupConfig: async (cfg) => {
          startupCfg = { ...startupCfg, ...cfg };
          return { ok: true };
        },
        getPlatformAuthStates: async () => ({ ...authMap }),
        getPlatformAccounts: async () => ({}),
        getGitStatus: async () => ({ isGitRepo: true, branch: 'main', changedFiles: 0 }),
        getAppUpdateState: async () => updateState,
        checkAppUpdate: async () => updateState,
        onAppUpdateState: () => () => {},
        readArticle: async (rel) => contents[rel] ?? '',
        saveArticle: async (rel, md) => {
          contents[rel] = md;
          return { ok: true };
        },
        saveLocalImage: async (base64, ext) => {
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          return {
            relativeMarkdownPath: base64 ? `data:${mime};base64,${base64}` : defaultImg,
            fullPath: `/Users/creator/Notes/Vmark-Workspace/assets/cover.${ext}`,
          };
        },
        setRecentFiles: () => {},
        onMenuAction: () => () => {},
        onPlatformAuthUpdated: () => () => {},
        listJuejinCategories: async () => [
          { id: 'cat-fe', name: '前端' },
          { id: 'cat-ai', name: '人工智能' },
        ],
        publishMultiPlatform: async (payload) => {
          await new Promise((r) => setTimeout(r, 180));
          return {
            results: payload.targets.map((t) => ({
              platformId: t.platformId,
              ok: true,
              mode: t.mode,
              postId: `draft-${t.platformId}`,
              url: `https://example.com/${t.platformId}/draft`,
              verified: true,
              message: '已存入草稿箱',
            })),
          };
        },
      };
    },
    { articleList: articles, initialTheme, lastPath: lastArticlePath, defaultImg: coverBanner }
  );
}

function transcodeDemo(webmPath, name, startOffsetSec) {
  fs.mkdirSync(demosDir, { recursive: true });
  const mp4Path = path.join(demosDir, `${name}.mp4`);
  const gifPath = path.join(demosDir, `${name}.gif`);
  const ssArgs = startOffsetSec > 0.1 ? ['-ss', startOffsetSec.toFixed(2)] : [];

  execFileSync(FFMPEG, [
    '-y',
    ...ssArgs,
    '-i', webmPath,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-crf', '23',
    mp4Path,
  ], { stdio: 'ignore' });

  const profiles = [
    { fps: 12, width: 960 },
    { fps: 10, width: 840 },
    { fps: 8, width: 760 },
  ];
  for (const p of profiles) {
    const palettePath = path.join(os.tmpdir(), `vmark-pal-${name}.png`);
    const vfBase = `fps=${p.fps},scale=${p.width}:-1:flags=lanczos`;
    execFileSync(FFMPEG, ['-y', ...ssArgs, '-i', webmPath, '-vf', `${vfBase},palettegen=stats_mode=diff`, palettePath], {
      stdio: 'ignore',
    });
    execFileSync(
      FFMPEG,
      [
        '-y',
        ...ssArgs,
        '-i', webmPath,
        '-i', palettePath,
        '-lavfi', `${vfBase} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`,
        gifPath,
      ],
      { stdio: 'ignore' }
    );
    fs.rmSync(palettePath, { force: true });
    if (fs.statSync(gifPath).size <= MAX_GIF_BYTES) break;
  }

  if (framesDir) {
    fs.mkdirSync(framesDir, { recursive: true });
    for (const [idx, sec] of ['1.2', '3.5', '6.0'].entries()) {
      const frameOut = path.join(framesDir, `${name}-frame-${idx + 1}.png`);
      try {
        execFileSync(FFMPEG, ['-y', '-ss', sec, '-i', mp4Path, '-frames:v', '1', frameOut], { stdio: 'ignore' });
      } catch {
        // video shorter than timestamp; ignore trailing extract
      }
    }
  }

  const mp4Kb = Math.round(fs.statSync(mp4Path).size / 1024);
  const gifKb = Math.round(fs.statSync(gifPath).size / 1024);
  console.log(`[demo] ${name}: mp4=${mp4Kb}KB gif=${gifKb}KB`);
}

async function runScenario(browser, tmpDir, name, fn) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: tmpDir, size: { width: 1280, height: 800 } },
  });
  const page = await ctx.newPage();
  const startedAt = Date.now();
  await fn(page, startedAt);
  const video = page.video();
  await ctx.close();
  const rawVideoPath = await video.path();
  return rawVideoPath;
}

async function main() {
  const defaultMacChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.PW_CHROMIUM_PATH || (fs.existsSync(defaultMacChrome) ? defaultMacChrome : undefined);
  const server = startPreviewServer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-demos-'));
  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

    // Demo 1: 实时渲染写作 + 表格 Tab 跳转 + Bloom 浅暗主题切换
    let trim1 = 0;
    const video1 = await runScenario(browser, tmpDir, '1-editor-writing-theme', async (page, t0) => {
      await installDemoApi(page, {
        lastArticlePath: 'guides/local-first-notes.md',
        articles: [
          {
            id: 'd1',
            title: 'Local-First 笔记与技术写作',
            relativePath: 'guides/local-first-notes.md',
            folder: 'guides',
            wordCount: 240,
            updatedAt: Date.now(),
            localImageCount: 0,
            syncRecords: {},
            content: [
              '# Local-First 笔记与技术写作',
              '',
              '> [!TIP]',
              '> 所见即所得的即时渲染（IR）写作体验：支持 KaTeX 公式、Mermaid 与 24 套 Bloom 主题。',
              '',
              '核心指标满足 $\\text{Latency} < 16\\text{ms}$，并内置表格单元格快捷键：',
              '',
              '| 快捷键 | 作用域 | 动作 |',
              '| :--- | :--- | :--- |',
              '| Tab | 表格单元 | 跳至下一格 |',
              '| Shift+Tab | 表格单元 | 返回上一格 |',
              '',
              '```ts',
              'export const saveMode = "local-first";',
              '```',
            ].join('\n'),
          },
        ],
      });
      await page.goto(BASE_URL);
      await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15000 });
      trim1 = (Date.now() - t0) / 1000 + 0.15;
      await page.waitForTimeout(700);

      // 点击表格单元格，演示 Tab 跳格并输入
      const cell = page.locator('.vditor-ir table td').first();
      await cell.click();
      await page.waitForTimeout(450);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(400);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(450);

      // 切换到偏好设置 -> 外观主题 -> 切换深色主题后再回到写作台
      await page.getByTitle('偏好设置 (图床 / 平台 / GitHub)').click();
      await page.waitForTimeout(450);
      await page.getByRole('button', { name: '外观主题' }).click();
      await page.waitForTimeout(550);
      await page.getByRole('button', { name: 'Bloom Ink Dark 水墨玄黑', exact: true }).click();
      await page.waitForTimeout(750);
      await page.getByRole('button', { name: '← 返回写作台' }).click();
      await page.waitForTimeout(1100);
    });
    transcodeDemo(video1, '1-editor-writing-theme', trim1);

    // Demo 2: 多比例配图（16:9 / 2.35:1 / 3:4）与全平台草稿箱分发
    let trim2 = 0;
    const coverPng = makeGradientPngDataUrl(1280, 720, [59, 124, 196], [245, 158, 11], [255, 255, 255]);
    const coverBuffer = Buffer.from(coverPng.split(',')[1], 'base64');
    const video2 = await runScenario(browser, tmpDir, '2-multi-platform-publish', async (page, t0) => {
      await installDemoApi(page, {
        lastArticlePath: 'publish-showcase.md',
        articles: [
          {
            id: 'd2',
            title: '一文多发：从本地 Markdown 到多平台草稿箱',
            relativePath: 'publish-showcase.md',
            folder: '',
            wordCount: 380,
            updatedAt: Date.now(),
            localImageCount: 1,
            syncRecords: {},
            content: [
              '# 一文多发：从本地 Markdown 到多平台草稿箱',
              '',
              '正文中的本地图片保持 `./assets/` 相对路径，发布时自动转存并编译为平台原生格式。',
              '',
              '> [!NOTE]',
              '> 默认仅写入各平台草稿箱，保留创作者最后确认权。',
              '',
              '```ts',
              'const ratios = ["16:9", "2.35:1", "3:4", "1:1"];',
              '```',
            ].join('\n'),
          },
        ],
      });
      await page.goto(BASE_URL);
      await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15000 });
      trim2 = (Date.now() - t0) / 1000 + 0.15;
      await page.waitForTimeout(550);

      await page.getByRole('button', { name: '发布', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      await page.waitForTimeout(500);

      for (const id of ['weixin', 'zhihu', 'juejin', 'xiaohongshu', 'douyin']) {
        const box = page.getByTestId(`platform-row-${id}`).getByRole('checkbox');
        if ((await box.getAttribute('data-state')) !== 'checked') await box.click();
      }
      await page.locator('#pub-title').fill('Vmark 多平台分发工作流');
      await page.locator('#pub-digest').fill(
        '覆盖 16:9 通用封面、公众号 2.35:1 / 1:1 焦点裁剪以及小红书抖音 3:4 视觉卡片生成，一键写入各平台草稿箱。'
      );
      await page.locator('#pub-tags').fill('效率工具');
      await page.locator('#pub-tags').press('Enter');
      await page.getByTestId('cover-input').setInputFiles({ name: 'cover-16x9.png', mimeType: 'image/png', buffer: coverBuffer });
      await page.waitForTimeout(550);

      // 展开公众号与小红书卡片预览
      const wx = page.getByTestId('section-weixin');
      await wx.getByRole('button', { expanded: false }).click();
      await page.waitForTimeout(500);
      const social = page.getByTestId('section-social');
      await social.getByRole('button', { expanded: false }).click();
      await page.waitForTimeout(700);

      // 补齐掘金分类后一键推送
      await page.getByTestId('attention-juejin').getByRole('button', { expanded: false }).click();
      await page.getByTestId('attention-juejin').getByRole('radio', { name: '前端' }).click();
      await page.waitForTimeout(450);

      await page.getByTestId('publish-start').click();
      await page.getByTestId('publish-results').locator('[data-state="ok"]').nth(4).waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(1200);
    });
    transcodeDemo(video2, '2-multi-platform-publish', trim2);

    // Demo 3: 侧边栏大纲 / 文章管理台 / 快速打开 / 账号与检查更新
    let trim3 = 0;
    const video3 = await runScenario(browser, tmpDir, '3-workspace-manager', async (page, t0) => {
      await installDemoApi(page, {
        lastArticlePath: '01-产品路线图.md',
        articles: [
          {
            id: 'a1',
            title: '01 · Vmark 产品路线图',
            relativePath: '01-产品路线图.md',
            folder: '',
            wordCount: 620,
            updatedAt: Date.now() - 3600_000,
            localImageCount: 2,
            syncRecords: {},
            content: '# Vmark 产品路线图\n\n## 一、核心原则\n\n本地 Markdown 优先。\n\n## 二、版本演进\n\n持续迭代编辑器体验与分发稳定性。\n',
          },
          {
            id: 'a2',
            title: '02 · 多平台分发规范',
            relativePath: '02-多平台分发规范.md',
            folder: '',
            wordCount: 480,
            updatedAt: Date.now() - 7200_000,
            localImageCount: 3,
            syncRecords: {},
            content: '# 多平台分发规范\n\n自动裁剪并推送草稿箱。\n',
          },
          {
            id: 'a3',
            title: '03 · 3:4 社交卡片模板指南',
            relativePath: 'guides/03-卡片模板指南.md',
            folder: 'guides',
            wordCount: 310,
            updatedAt: Date.now() - 10800_000,
            localImageCount: 1,
            syncRecords: {},
            content: '# 社交卡片模板指南\n\n一键生成 1080×1440 图片卡片。\n',
          },
        ],
      });
      await page.goto(BASE_URL);
      await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15000 });
      trim3 = (Date.now() - t0) / 1000 + 0.15;
      await page.waitForTimeout(550);

      await page.getByRole('button', { name: '大纲', exact: true }).click();
      await page.waitForTimeout(600);
      await page.getByTitle('文章管理台').click();
      await page.waitForTimeout(900);
      await page.getByTitle('打开最近文件 / 快速打开 (⇧⌘O)').click();
      await page.waitForTimeout(600);
      await page.keyboard.type('分发');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      await page.getByTitle('偏好设置 (图床 / 平台 / GitHub)').click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: '平台账号' }).click();
      await page.waitForTimeout(1000);
    });
    transcodeDemo(video3, '3-workspace-manager', trim3);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

await main();
