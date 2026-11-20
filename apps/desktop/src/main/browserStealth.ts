export const CHROME_MAJOR_VERSION = '131';

export const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface ChromeBrowserHeaders {
  'User-Agent': string;
  'Sec-CH-UA': string;
  'Sec-CH-UA-Mobile': string;
  'Sec-CH-UA-Platform': string;
}

/** Returns matched Chrome Desktop User-Agent and Sec-CH-UA Client Hints headers. */
export function buildChromeBrowserHeaders(platform: NodeJS.Platform = process.platform): ChromeBrowserHeaders {
  const secPlatform =
    platform === 'win32' ? '"Windows"' : platform === 'linux' ? '"Linux"' : '"macOS"';
  const uaOs =
    platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : platform === 'linux'
        ? 'X11; Linux x86_64'
        : 'Macintosh; Intel Mac OS X 10_15_7';

  return {
    'User-Agent': `Mozilla/5.0 (${uaOs}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR_VERSION}.0.0.0 Safari/537.36`,
    'Sec-CH-UA': `"Google Chrome";v="${CHROME_MAJOR_VERSION}", "Chromium";v="${CHROME_MAJOR_VERSION}", "Not_A Brand";v="24"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': secPlatform,
  };
}

/** Applies consistent Chrome UA and Sec-CH-UA* headers onto a mutable request header map. */
export function applyChromeHeadersToRecord(
  requestHeaders: Record<string, string>,
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  const browserHeaders = buildChromeBrowserHeaders(platform);
  const next = { ...requestHeaders };
  const overrideKeys = new Set(Object.keys(browserHeaders).map((k) => k.toLowerCase()));
  for (const key of Object.keys(next)) {
    if (overrideKeys.has(key.toLowerCase())) {
      delete next[key];
    }
  }
  return { ...next, ...browserHeaders };
}

/** Validates and normalizes an optional per-platform proxy URL (`http://`, `https://`, `socks5://`, `socks4://`). */
export function normalizeProxyRules(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('代理地址格式无效，请使用如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080');
  }
  if (!['http:', 'https:', 'socks5:', 'socks4:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http / https / socks5 / socks4 代理协议');
  }
  return parsed.toString().replace(/\/$/, '');
}

/** Applies or clears proxy rules on an Electron Session. */
export async function applySessionProxy(
  targetSession: {
    setProxy: (config: {
      proxyRules?: string;
      mode?: 'direct' | 'auto_detect' | 'pac_script' | 'fixed_servers' | 'system';
    }) => Promise<void>;
  },
  proxyUrl?: string | null
): Promise<void> {
  const normalized = normalizeProxyRules(proxyUrl);
  if (normalized) {
    await targetSession.setProxy({ proxyRules: normalized });
  } else {
    await targetSession.setProxy({ mode: 'direct' });
  }
}
