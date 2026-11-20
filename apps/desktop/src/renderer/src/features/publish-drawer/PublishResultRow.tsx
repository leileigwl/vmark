import type { MouseEvent } from 'react';
import type { MultiPlatformPublishResultItem } from '@vcat/shared';

/** Renders a single multi-platform dispatch result row and opens draft links inside the isolated built-in browser. */
export function PublishResultRow({ result }: { result: MultiPlatformPublishResultItem }) {
  const safeUrl = result.url && /^https?:\/\//i.test(result.url) ? result.url : null;

  const handleOpenDraftInSandbox = (e: MouseEvent<HTMLAnchorElement>) => {
    if (safeUrl && window.electronAPI?.openPlatformLogin) {
      e.preventDefault();
      void window.electronAPI.openPlatformLogin(result.platformId, safeUrl);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 pl-6 text-[11px] ${
        result.ok ? 'text-[#116329]' : 'text-[#cf222e]'
      }`}
    >
      <span>
        {result.ok ? '✓ ' : '✗ '}
        {result.message}
        {result.postId ? `（ID: ${result.postId}）` : ''}
      </span>
      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          onClick={handleOpenDraftInSandbox}
          title="在 Vmark 内置沙箱浏览器中带登录会话直接打开草稿"
          className="font-medium text-[var(--accent)] underline hover:opacity-80"
        >
          打开草稿 / 查看链接
        </a>
      )}
    </div>
  );
}
