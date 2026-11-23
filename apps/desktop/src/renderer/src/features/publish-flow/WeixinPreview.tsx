import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { renderWeixinHtml } from '@vcat/core/weixin';
import { Button } from '../../ui';
import { previewSrc } from './coverCrop';

/** 公众号排版里的相对图片在预览中走 vcat-asset 协议显示；复制出去的富文本保留原地址（推送时会转存）。 */
function withPreviewImages(html: string): string {
  return html.replace(/<img src="([^"]+)"/g, (_m, src: string) => `<img src="${previewSrc(src)}"`);
}

async function copyRichText(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) }),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('[weixin-preview] 剪贴板 API 不可用，改用选区复制', err);
  }
  const holder = document.createElement('div');
  holder.innerHTML = html;
  holder.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand('copy');
  sel?.removeAllRanges();
  holder.remove();
  return ok;
}

/** 公众号行展开后的排版预览（与推送用同一个渲染器）+「复制富文本」。 */
export function WeixinPreview({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderWeixinHtml(markdown).html, [markdown]);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const doc = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px;background:#fff">${withPreviewImages(html)}</body>`;
  return (
    <div className="space-y-2" data-testid="weixin-preview">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">公众号排版预览（与推送内容一致）</span>
        <Button
          className="h-9"
          onClick={() => {
            const text = new DOMParser().parseFromString(html, 'text/html').body.innerText;
            void copyRichText(html, text).then((ok) => setCopied(ok ? 'ok' : 'fail'));
          }}
        >
          {copied === 'ok' ? <Check /> : <Copy />}
          {copied === 'ok' ? '已复制' : copied === 'fail' ? '复制失败，请重试' : '复制富文本'}
        </Button>
      </div>
      <iframe
        title="公众号排版预览"
        sandbox=""
        srcDoc={doc}
        className="h-[360px] w-full rounded-[var(--radius-ui)] border border-line bg-white"
      />
    </div>
  );
}
