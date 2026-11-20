import type { MultiPlatformPublishResultItem } from '@vcat/shared';

/** Renders a single multi-platform dispatch result row with optional safe external draft/article link. */
export function PublishResultRow({ result }: { result: MultiPlatformPublishResultItem }) {
  const safeUrl = result.url && /^https?:\/\//i.test(result.url) ? result.url : null;

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
          className="font-medium text-[var(--accent)] underline hover:opacity-80"
        >
          打开草稿 / 查看链接
        </a>
      )}
    </div>
  );
}
