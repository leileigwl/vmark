import type { AppUpdateState } from '@vcat/shared';

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GithubLatestReleasePayload {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubReleaseAsset[];
}

export const DEFAULT_GITHUB_REPO = 'leileigwl/vmark';
export const DEFAULT_RELEASE_PAGE_URL = `https://github.com/${DEFAULT_GITHUB_REPO}/releases/latest`;

/** Parses a SemVer string (with optional leading `v` and prerelease suffix). */
export function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = raw.trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(cleaned);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.').filter(Boolean) : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two SemVer strings according to SemVer 2.0 ordering.
 * Returns > 0 if `a > b`, < 0 if `a < b`, 0 if equal (or unparseable fallback).
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  const aPre = pa.prerelease;
  const bPre = pb.prerelease;
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const ai = aPre[i];
    const bi = bPre[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const diff = compareIdentifiers(ai, bi);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Returns true only when `candidateTag` is a stable release strictly newer than `currentVersion`. */
export function isNewerStableVersion(
  currentVersion: string,
  candidateTag: string,
  flags?: { draft?: boolean; prerelease?: boolean }
): boolean {
  if (flags?.draft || flags?.prerelease) return false;
  const parsed = parseSemver(candidateTag);
  if (!parsed || parsed.prerelease.length > 0) return false;
  return compareSemver(candidateTag, currentVersion) > 0;
}

/** Picks the best direct installer URL for the current platform and architecture. */
export function pickPlatformAssetUrl(
  assets: readonly GithubReleaseAsset[],
  platform: NodeJS.Platform,
  arch: string,
  fallbackUrl: string
): string {
  const valid = assets.filter((a) => typeof a.name === 'string' && typeof a.browser_download_url === 'string');
  const findBy = (pred: (lower: string) => boolean): string | undefined =>
    valid.find((a) => pred(a.name.toLowerCase()))?.browser_download_url;

  if (platform === 'darwin') {
    const archTokens = arch === 'arm64' ? ['arm64', 'aarch64'] : ['x64', 'x86_64'];
    return (
      findBy((n) => n.endsWith('.dmg') && archTokens.some((t) => n.includes(t))) ??
      findBy((n) => n.endsWith('.dmg')) ??
      findBy((n) => n.endsWith('.zip')) ??
      fallbackUrl
    );
  }
  if (platform === 'win32') {
    return findBy((n) => n.endsWith('.exe')) ?? fallbackUrl;
  }
  if (platform === 'linux') {
    return findBy((n) => n.endsWith('.appimage')) ?? findBy((n) => n.endsWith('.deb')) ?? fallbackUrl;
  }
  return fallbackUrl;
}

export function normalizeVersionTag(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

/** Queries GitHub Releases `latest` endpoint and returns an `AppUpdateState` without throwing. */
export async function checkGithubLatestRelease(input: {
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  repo?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AppUpdateState> {
  const repo = input.repo ?? DEFAULT_GITHUB_REPO;
  const fetchFn = input.fetchImpl ?? fetch;
  const currentVersion = normalizeVersionTag(input.currentVersion);
  const checkedAt = Date.now();

  try {
    const res = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Vmark/${currentVersion}`,
      },
      signal: AbortSignal.timeout(input.timeoutMs ?? 8000),
    });
    if (!res.ok) {
      return {
        status: 'error',
        currentVersion,
        mode: 'manual',
        error: `HTTP ${res.status}`,
        checkedAt,
      };
    }

    const payload = (await res.json()) as GithubLatestReleasePayload;
    const tag = payload.tag_name ?? '';
    if (!isNewerStableVersion(currentVersion, tag, { draft: payload.draft, prerelease: payload.prerelease })) {
      return {
        status: 'not-available',
        currentVersion,
        mode: 'manual',
        checkedAt,
      };
    }

    const releaseUrl = payload.html_url || `https://github.com/${repo}/releases/tag/${tag}`;
    const downloadUrl = pickPlatformAssetUrl(payload.assets ?? [], input.platform, input.arch, releaseUrl);
    return {
      status: 'available',
      currentVersion,
      latestVersion: normalizeVersionTag(tag),
      releaseName: payload.name || tag,
      releaseNotes: payload.body?.trim() || '',
      releaseUrl,
      downloadUrl,
      mode: 'manual',
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      currentVersion,
      mode: 'manual',
      error: message,
      checkedAt,
    };
  }
}
