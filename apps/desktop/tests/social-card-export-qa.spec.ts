import { expect, test, type Frame, type Page } from '@playwright/test';

/**
 * 卡片/图集出图回归（用户 2026-11-26 截图，极简杂志模板）：
 * a) 页底文字、图片被 .box 的 overflow:hidden 切掉；
 * b) 页眉把标题硬截成「二、云端 CI 怎么执行？（图」；
 * c) 分页在加粗中间断开，`**` 裸露在卡片上。
 */
const FILLER = '本地跑通以后，提交代码会触发云端流水线，按照同样的步骤再验证一遍，确保别人的机器上也能通过。';
const QA_MD = [
  '# 本地测试与云端 CI',
  '',
  FILLER,
  '',
  '## 二、云端 CI 怎么执行？（图 3 · 流程总览）',
  '',
  ...Array.from({ length: 20 }, () => `短句${'一二三四五六七八九十'.repeat(2)}。\n`),
  '推送之后，GitHub 会自动拉起一台干净的虚拟机，安装依赖，运行测试，整个过程如下图所示，**[配图：图 4 · GitHub Actions 云端 CI 流程]**，全部通过才允许合并',
  '',
  FILLER.repeat(4),
].join('\n');

/** 宽字母（W/M）比估算器假设的平均字宽宽得多：用它稳定复现「估算偏小 → 缩略图页底被切」。 */
const DENSE_MD = [
  '# 密集正文',
  '',
  ...Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 段：WWW MMM WMW MWM WWWW MMMM WMWM MWMW WWW MMM WMW MWM WWWW MMMM WMWM MWMW WWW MMM。`),
].join('\n\n');

async function openWithMarkdown(page: Page, md: string) {
  await page.addInitScript((source: string) => {
    const meta = { id: 'c-1', title: 'cards', relativePath: 'cards.md', folder: '', wordCount: 10, updatedAt: Date.now(), imageCount: 0, hasFrontmatter: false, excerpt: '' };
    const noop = () => () => {};
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getWorkspacePath: async () => '/tmp/vmark-cards-qa',
      getRecentWorkspaces: async () => ['/tmp/vmark-cards-qa'],
      listArticles: async () => [meta],
      listFolders: async () => [],
      getImageBedConfig: async () => ({ strategy: 'platform_private' }),
      getStartupConfig: async () => ({ lastArticlePath: 'cards.md', theme: 'apple-light' }),
      getPlatformAuthStates: async () => ({ xiaohongshu: true }),
      getGitStatus: async () => ({ isGitRepo: false, branch: '', changedFiles: 0 }),
      readArticle: async () => source,
      saveArticle: async () => ({ ok: true }),
      saveStartupConfig: async () => ({ ok: true }),
      setRecentFiles: () => {},
      onMenuAction: noop,
      onPlatformAuthUpdated: noop,
    };
  }, md);
  await page.goto('/');
  await page.locator('.vditor-ir .vditor-reset').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByTestId('platform-row-xiaohongshu').getByRole('checkbox').click();
  await page.getByTestId('section-social').getByRole('button', { expanded: false }).click();
  await page.getByRole('radio', { name: '极简杂志' }).click();
}

async function thumbFrames(page: Page): Promise<Frame[]> {
  const frames = page.getByTestId('card-strip').locator('iframe');
  await expect(frames.first()).toBeVisible();
  const n = await frames.count();
  const out: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const f = await (await frames.nth(i).elementHandle())!.contentFrame();
    out.push(f!);
  }
  return out;
}

/** 卡片里的内容（文字和图片）必须完整落在内容框内，不能被 overflow:hidden 切掉。 */
async function overflowOf(frame: Frame) {
  // 缩略图 iframe 禁止脚本：只能同步读取布局，等字体由外层轮询完成。
  await expect.poll(() => frame.evaluate(() => document.fonts.status)).toBe('loaded');
  return frame.evaluate(() => {
    const box = document.querySelector('.box') as HTMLElement | null;
    const flow = box?.querySelector('.flow') as HTMLElement | null;
    // 封面卡没有 .flow；内容卡缺 .box/.flow 说明模板结构变了，content=-1 让断言失败而不是空通过。
    if (box?.querySelector('.cover')) return { content: 0, cutChildren: 0 };
    if (!box || !flow) return { content: -1, cutChildren: 0 };
    const limit = box.getBoundingClientRect().bottom + 1;
    const cut = Array.from(flow.children).filter((el) => el.getBoundingClientRect().bottom > limit).length;
    return { content: 1, cutChildren: cut };
  });
}

test.describe('卡片出图 QA（极简杂志）', () => {
  test('分页不在加粗中间断开，卡片上不出现裸露的 ** ', async ({ page }) => {
    await openWithMarkdown(page, QA_MD);
    const frames = await thumbFrames(page);
    const texts = await Promise.all(frames.map((f) => f.evaluate(() => document.querySelector('.box')?.textContent ?? '')));
    expect(texts.join('\n')).toContain('配图：图 4 · GitHub Actions 云端 CI 流程');
    for (const t of texts) expect(t).not.toContain('**');
    const strong = await Promise.all(frames.map((f) => f.evaluate(() => Array.from(document.querySelectorAll('.box strong')).map((s) => s.textContent ?? '').join('|'))));
    expect(strong.join('|')).toContain('配图：');
    expect(strong.join('|')).toContain('GitHub Actions 云端 CI 流程');
  });

  test('页眉标题不被硬截在括号中间', async ({ page }) => {
    await openWithMarkdown(page, QA_MD);
    const frames = await thumbFrames(page);
    const masts = await Promise.all(frames.map((f) => f.evaluate(() => document.querySelector('.mast span:last-child')?.textContent ?? '')));
    expect(masts).toContain('二、云端 CI 怎么执行？');
    for (const m of masts) {
      const opens = (m.match(/[（(【[]/g) ?? []).length;
      const closes = (m.match(/[）)】\]]/g) ?? []).length;
      expect(opens, `页眉「${m}」括号未闭合`).toBe(closes);
    }
  });

  test('密集正文的缩略图不切掉页底文字', async ({ page }) => {
    await openWithMarkdown(page, DENSE_MD);
    let checked = 0;
    for (const f of await thumbFrames(page)) {
      const r = await overflowOf(f);
      expect(r.content, '内容卡缺少 .box/.flow').toBeGreaterThanOrEqual(0);
      checked += r.content;
      expect(r.cutChildren, '有内容块超出卡片内容框被裁切').toBe(0);
    }
    expect(checked, '至少检查了一张内容卡').toBeGreaterThan(0);
  });

  test('图片和长段落相邻时缩略图里的图片与文字都不被裁切', async ({ page }) => {
    const png = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='900' height='1300'><rect width='900' height='1300' fill='#889aaa'/></svg>")}`;
    const wide = 'WWW MMM WMW MWM WWWW MMMM WMWM MWMW WWW MMM WMW MWM WWWW MMMM。';
    const md = ['# 图文混排', '', wide.repeat(4), '', `![流程图](${png})`, '', wide.repeat(5), '', `![第二张](${png})`, '', wide.repeat(3)].join('\n');
    await openWithMarkdown(page, md);
    let checked = 0;
    for (const f of await thumbFrames(page)) {
      const r = await overflowOf(f);
      expect(r.content, '内容卡缺少 .box/.flow').toBeGreaterThanOrEqual(0);
      checked += r.content;
      expect(r.cutChildren, '图片或文字超出卡片内容框被裁切').toBe(0);
    }
    expect(checked, '至少检查了一张内容卡').toBeGreaterThan(0);
  });
});
