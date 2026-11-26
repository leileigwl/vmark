import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DOUYIN_DRAFT_SPEC, XHS_DRAFT_SPEC, runSocialDraftFlow, type DraftPage } from '../src/main/socialDraftPage';

/** 离线夹具（本地 HTML 模拟小红书/抖音图文发布页），验证多图上传、逐张确认、正文按段填入、存草稿。不代表真机通过。 */
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function makeImages(n: number): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-cards-'));
  return Array.from({ length: n }, (_, i) => {
    const p = path.join(dir, `card-${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return p;
  });
}

function driver(page: Page): DraftPage & { uploads: number[] } {
  const uploads: number[] = [];
  return {
    uploads,
    eval: (script) => page.evaluate(script),
    setFiles: async (selector, files) => {
      uploads.push(files.length);
      await page.setInputFiles(selector, files);
    },
    sleep: (ms) => page.waitForTimeout(Math.min(ms, 100)),
  };
}

const BODY = ['很多独立开发者把精力放在写代码上。', '💡 技巧：优质内容的本质是一次创作。', '', '一、极简 3 步内容飞轮', '1. 单点源头创作'].join('\n');

test.describe('小红书/抖音图文草稿（离线夹具）', () => {
  test('小红书：切到「上传图文」，18 张卡片按顺序逐张上传，每张缩略图出现后再传下一张', async ({ page }) => {
    await page.setContent(fixture('xhs-publish.html'));
    const files = makeImages(18);
    const d = driver(page);
    const res = await runSocialDraftFlow(d, XHS_DRAFT_SPEC, { files, title: '独立开发者的高效内容矩阵与全平台分发', body: BODY, tags: ['独立开发'] });
    const saved = await page.evaluate(() => (window as unknown as { __saved: Record<string, unknown> }).__saved);
    expect(res.uploaded).toBe(18);
    expect(res.warnings).toEqual([]);
    expect(d.uploads).toEqual(Array(18).fill(1)); // 入口不支持多选：1 张 + 17 次追加
    expect(saved.thumbs).toEqual(files.map((f) => path.basename(f))); // 顺序不乱，第 1 张是封面
    expect([...(saved.title as string)].length).toBeLessThanOrEqual(20);
    expect(saved.body).not.toContain('独立开发者的高效内容矩阵与全平台分发'); // 标题不在正文重复
    expect(saved.body).toContain('💡 技巧：优质内容');
    expect(saved.body).toContain('#独立开发');
    expect(saved.lines as number).toBeGreaterThanOrEqual(5); // 按行成段，没有挤成一段
  });

  test('抖音：点「发布图文」，多选 input 一次传完并等待真实 DOM 缩略图，Slate 多段正文与标签完整保留', async ({ page }) => {
    await page.setContent(fixture('douyin-publish.html'));
    const files = makeImages(4);
    const d = driver(page);
    const res = await runSocialDraftFlow(d, DOUYIN_DRAFT_SPEC, { files, title: '标题', body: BODY, tags: ['效率'] });
    const saved = await page.evaluate(() => (window as unknown as { __saved: Record<string, unknown> }).__saved);
    expect(d.uploads).toEqual([4]);
    expect(res.uploaded).toBe(4);
    expect(res.warnings).toEqual([]);
    expect(saved.thumbs).toHaveLength(4);
    expect(saved.body).toContain('很多独立开发者把精力放在写代码上。');
    expect(saved.body).toContain('💡 技巧：优质内容');
    expect(saved.body).toContain('1. 单点源头创作');
    expect(saved.body).toContain('#效率');
    expect(saved.lines as number).toBeGreaterThanOrEqual(5);
    expect(saved.body).not.toMatch(/[>`]|\[!/);
  });

  test('小红书：首次点「暂存离开」被忽略时自动重试，确认出现保存成功后再结束', async ({ page }) => {
    await page.setContent(fixture('xhs-publish.html'));
    await page.evaluate(() => {
      (window as unknown as { __ignoreSaveClicks: number }).__ignoreSaveClicks = 1;
    });
    const res = await runSocialDraftFlow(driver(page), XHS_DRAFT_SPEC, { files: makeImages(2), title: '重试测试', body: BODY, tags: ['Vmark'] });
    const stats = await page.evaluate(() => ({
      attempts: (window as unknown as { __saveAttemptCount: number }).__saveAttemptCount,
      saved: (window as unknown as { __saved: Record<string, unknown> | null }).__saved,
    }));
    expect(res.warnings).toEqual([]);
    expect(stats.attempts).toBeGreaterThanOrEqual(2);
    expect(stats.saved).not.toBeNull();
  });

  test('小红书：点「暂存离开」后超时仍未确认保存成功时报错而不是返回假成功', async ({ page }) => {
    await page.setContent(fixture('xhs-publish.html'));
    await page.evaluate(() => {
      (window as unknown as { __neverSave: boolean }).__neverSave = true;
    });
    const err = await runSocialDraftFlow(driver(page), XHS_DRAFT_SPEC, {
      files: makeImages(2),
      title: '超时测试',
      body: BODY,
      saveConfirmTimeoutMs: 700,
    } as Parameters<typeof runSocialDraftFlow>[2]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('未检测到保存成功');
  });

  test('抖音真实 DOM 选择器与草稿入口配置校验', () => {
    expect(DOUYIN_DRAFT_SPEC.thumbnails).toContain('[class^="container-"] [class^="img-"] > img');
    expect(DOUYIN_DRAFT_SPEC.thumbnails).toContain('div[class^="img-"] > img');
  });

  test('小红书：正文含 #话题 触发联想浮层时，存草稿前必须先关闭浮层再保存', async ({ page }) => {
    await page.setContent(fixture('xhs-publish.html'));
    const res = await runSocialDraftFlow(driver(page), XHS_DRAFT_SPEC, {
      files: makeImages(2),
      title: '浮层遮挡测试',
      body: BODY,
      tags: ['Vmark'],
      saveConfirmTimeoutMs: 700,
    });
    const state = await page.evaluate(() => ({
      popoverOpen: (window as unknown as { __popoverOpen: boolean }).__popoverOpen,
      blockedByPopover: (window as unknown as { __blockedByPopover: boolean }).__blockedByPopover,
      saved: (window as unknown as { __saved: Record<string, unknown> | null }).__saved,
    }));
    expect(res.warnings).toEqual([]);
    expect(state.popoverOpen).toBe(false);
    expect(state.blockedByPopover).toBe(false);
    expect(state.saved?.body).toContain('#Vmark');
  });

  test('找不到上传区域时报错列出尝试过的全部选择器', async ({ page }) => {
    await page.setContent('<html><body><div>拖入此区域</div></body></html>');
    const err = await runSocialDraftFlow({ ...driver(page), sleep: () => Promise.resolve() }, DOUYIN_DRAFT_SPEC, { files: makeImages(1), title: 't', body: 'b' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    for (const sel of DOUYIN_DRAFT_SPEC.entryInputs) expect((err as Error).message).toContain(sel);
  });

  test('缩略图迟迟不出现时报「第 N 张上传超时」而不是假成功', async ({ page }) => {
    await page.setContent(fixture('xhs-publish.html'));
    await page.evaluate(() => {
      const input = document.querySelector('.img-upload-area input') as HTMLInputElement;
      input.replaceWith(input.cloneNode(true)); // 追加的图片不再产生缩略图
    });
    const err = await runSocialDraftFlow(driver(page), XHS_DRAFT_SPEC, { files: makeImages(3), title: 't', body: 'b', perImageTimeoutMs: 600 }).catch((e: Error) => e);
    expect((err as Error).message).toContain('第 2 张图片上传超时');
  });
});
