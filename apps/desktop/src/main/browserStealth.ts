import type { PlatformId } from '@vcat/shared';

export const CHROME_MAJOR_VERSION = '131';

export const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface ChromeBrowserHeaders {
  'User-Agent': string;
  'Sec-CH-UA': string;
  'Sec-CH-UA-Mobile': string;
  'Sec-CH-UA-Platform': string;
}

export interface PlatformFingerprintProfile {
  platformId: PlatformId;
  seed: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  canvasNoise: number;
  webglVendor: string;
  webglRenderer: string;
  languages: string[];
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

function hashPlatformId(platformId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < platformId.length; i++) {
    hash ^= platformId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10000;
}

/** Generates a deterministic, isolated browser fingerprint profile per platform. */
export function getPlatformFingerprintProfile(
  platformId: PlatformId,
  hostPlatform: NodeJS.Platform = process.platform
): PlatformFingerprintProfile {
  const seed = hashPlatformId(platformId) + 1;
  const concurrencyPool = [4, 8, 12, 16];
  const memoryPool = [8, 16];
  const macRenderers = [
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
  ];
  const winRenderers = [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0)',
  ];

  const isWin = hostPlatform === 'win32';
  const rendererPool = isWin ? winRenderers : macRenderers;

  return {
    platformId,
    seed,
    hardwareConcurrency: concurrencyPool[seed % concurrencyPool.length],
    deviceMemory: memoryPool[seed % memoryPool.length],
    canvasNoise: (seed % 3) + 1,
    webglVendor: isWin ? 'Google Inc. (NVIDIA)' : 'Google Inc. (Apple)',
    webglRenderer: rendererPool[seed % rendererPool.length],
    languages: ['zh-CN', 'zh', 'en-US', 'en'],
  };
}

export const FINGERPRINT_ARG_PREFIX = '--vmark-fp=';

export function encodeFingerprintArg(profile: PlatformFingerprintProfile): string {
  return `${FINGERPRINT_ARG_PREFIX}${Buffer.from(JSON.stringify(profile), 'utf8').toString('base64')}`;
}

export function decodeFingerprintArg(argv: readonly string[]): PlatformFingerprintProfile | null {
  const raw = argv.find((a) => a.startsWith(FINGERPRINT_ARG_PREFIX));
  if (!raw) return null;
  try {
    const json = Buffer.from(raw.slice(FINGERPRINT_ARG_PREFIX.length), 'base64').toString('utf8');
    return JSON.parse(json) as PlatformFingerprintProfile;
  } catch {
    return null;
  }
}

/** Builds the main-world anti-detection and per-platform fingerprint isolation script. */
export function buildStealthMainWorldScript(profile: PlatformFingerprintProfile): string {
  const serialized = JSON.stringify(profile);
  return `
(() => {
  const fp = ${serialized};
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => fp.languages, configurable: true });
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency, configurable: true });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => fp.deviceMemory, configurable: true });
  } catch {}
  try {
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        value: { runtime: {}, app: { isInstalled: false } },
        configurable: true,
      });
    }
  } catch {}
  try {
    if (navigator.plugins && navigator.plugins.length === 0) {
      const fakePlugins = [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      ];
      Object.defineProperty(Navigator.prototype, 'plugins', { get: () => fakePlugins, configurable: true });
    }
  } catch {}
  try {
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (sx, sy, sw, sh) {
      const img = origGetImageData.apply(this, [sx, sy, sw, sh]);
      if (img.data && img.data.length >= 4) {
        img.data[0] = (img.data[0] + fp.canvasNoise) & 255;
      }
      return img;
    };
  } catch {}
  try {
    const origGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return fp.webglVendor;
      if (param === 37446) return fp.webglRenderer;
      return origGetParam.apply(this, [param]);
    };
  } catch {}
})();
`;
}
