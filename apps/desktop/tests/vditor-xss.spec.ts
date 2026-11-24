import { expect, test, type Page } from '@playwright/test';

/**
 * GHSA-x2mx-f527-mxr9：Vditor 预览把链接 href 解码后拼进 <video>/<audio> 的 HTML，
 * 引号能跳出 src 生成 onerror，Markdown 里一个恶意链接就能执行脚本（sanitize 打开也拦不住）。
 * 这里加载应用随包分发的 Vditor 运行时（out/renderer/vditor，由已安装的 vditor 包复制而来），
 * 走它自己的 preview / mediaRender，验证恶意链接不再执行脚本、正常媒体链接仍渲染成播放器。
 */

type VditorStatic = {
  preview: (el: HTMLElement, md: string, opts: Record<string, unknown>) => Promise<void>;
  mediaRender: (el: HTMLElement) => void;
};

async function openRuntime(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="out"></div>';
  });
  await page.addScriptTag({ url: '/vditor/dist/method.min.js' });
  await page.waitForFunction(() => typeof (window as unknown as { Vditor?: unknown }).Vditor === 'function');
}

const PAYLOADS = [
  `<a href='x" onerror="window.__vmarkXss=(window.__vmarkXss||0)+1" y="a.mp4'>video</a>`,
  `<a href='x" onerror="window.__vmarkXss=(window.__vmarkXss||0)+1" y="a.mp3'>audio</a>`,
];

for (const payload of PAYLOADS) {
  test(`Vditor 预览：Markdown 里的恶意媒体链接不执行脚本（${payload.includes('.mp4') ? 'video' : 'audio'}）`, async ({ page }) => {
    await openRuntime(page);
    const result = await page.evaluate(async (md) => {
      const V = (window as unknown as { Vditor: VditorStatic }).Vditor;
      const out = document.getElementById('out')!;
      await V.preview(out, md, { cdn: `${location.origin}/vditor`, mode: 'light', markdown: { sanitize: true } });
      // 媒体加载失败的 error 事件是异步的，等一会儿再看有没有执行。
      await new Promise((r) => setTimeout(r, 800));
      return {
        executed: (window as unknown as { __vmarkXss?: number }).__vmarkXss ?? 0,
        injectedHandlers: out.querySelectorAll('[onerror]').length,
      };
    }, payload);
    expect(result.executed, '恶意链接里的 onerror 不应执行').toBe(0);
    expect(result.injectedHandlers, '渲染结果里不应出现 onerror 属性').toBe(0);
  });
}

test('Vditor mediaRender：解码后的 href 带引号也不能生成事件属性', async ({ page }) => {
  await openRuntime(page);
  const result = await page.evaluate(async () => {
    const V = (window as unknown as { Vditor: VditorStatic }).Vditor;
    const out = document.getElementById('out')!;
    const a = document.createElement('a');
    a.setAttribute('href', 'x" onerror="window.__vmarkXss=(window.__vmarkXss||0)+1" y="a.webm');
    a.textContent = 'clip';
    out.appendChild(a);
    V.mediaRender(out);
    await new Promise((r) => setTimeout(r, 800));
    return {
      executed: (window as unknown as { __vmarkXss?: number }).__vmarkXss ?? 0,
      injectedHandlers: out.querySelectorAll('[onerror]').length,
    };
  });
  expect(result.executed).toBe(0);
  expect(result.injectedHandlers).toBe(0);
});

test('Vditor 预览：正常的视频 / 音频链接仍渲染成播放器', async ({ page }) => {
  await openRuntime(page);
  const tags = await page.evaluate(async () => {
    const V = (window as unknown as { Vditor: VditorStatic }).Vditor;
    const out = document.getElementById('out')!;
    await V.preview(out, '[v](https://example.com/clip.mp4)\n\n[a](https://example.com/song.mp3)\n', {
      cdn: `${location.origin}/vditor`,
      mode: 'light',
      markdown: { sanitize: true },
    });
    return [...out.querySelectorAll('video, audio')].map((el) => `${el.tagName.toLowerCase()} ${el.getAttribute('src')}`);
  });
  expect(tags).toEqual(['video https://example.com/clip.mp4', 'audio https://example.com/song.mp3']);
});
