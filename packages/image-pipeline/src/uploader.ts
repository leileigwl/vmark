import fs from 'node:fs/promises';
import path from 'node:path';
import type { ImageBedConfig } from '@vcat/shared';
import { extractImageRefs, replaceImagesInMemory } from './index.ts';

export type ImageUploadFn = (
  buffer: Buffer,
  fileName: string,
  config: ImageBedConfig
) => Promise<string>;

export interface PublishImageUploadResult {
  markdown: string;
  urlMap: Record<string, string>;
  uploadedCount: number;
  errors: string[];
}

const REFERER_RULES: Array<{ pattern: RegExp; referer: string }> = [
  { pattern: /(?:mmbiz\.qpic\.cn|qpic\.cn|wx\.qlogo\.cn)$/i, referer: 'https://mp.weixin.qq.com/' },
  { pattern: /zhimg\.com$/i, referer: 'https://www.zhihu.com/' },
  { pattern: /(?:csdnimg\.cn|csdn\.net)$/i, referer: 'https://blog.csdn.net/' },
  { pattern: /(?:byteimg\.com|juejin\.cn|ibytedtos\.com)$/i, referer: 'https://juejin.cn/' },
  { pattern: /(?:jianshu\.io|jianshu\.com)$/i, referer: 'https://www.jianshu.com/' },
  { pattern: /(?:hdslb\.com|bilibili\.com)$/i, referer: 'https://www.bilibili.com/' },
  { pattern: /(?:sinaimg\.cn|weibo\.com)$/i, referer: 'https://weibo.com/' },
  { pattern: /cnblogs\.com$/i, referer: 'https://www.cnblogs.com/' },
];

/** Resolves the Referer header required to bypass anti-hotlinking when fetching external images. */
export function resolveRefererForUrl(imageUrl: string): string {
  try {
    const parsed = new URL(imageUrl);
    for (const rule of REFERER_RULES) {
      if (rule.pattern.test(parsed.hostname)) {
        return rule.referer;
      }
    }
    return `${parsed.origin}/`;
  } catch {
    return '';
  }
}

function isHostSkipped(imageUrl: string, skipHosts?: string[]): boolean {
  if (!skipHosts || skipHosts.length === 0) return false;
  try {
    const hostname = new URL(imageUrl).hostname.toLowerCase();
    return skipHosts.some((h) => {
      const target = h.toLowerCase().trim();
      return target && (hostname === target || hostname.endsWith(`.${target}`));
    });
  } catch {
    return false;
  }
}

function inferImageFileName(imageUrl: string, contentType: string | null): string {
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
  };
  const cleanMime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const mimeExt = mimeMap[cleanMime];
  try {
    const base = path.posix.basename(new URL(imageUrl).pathname) || 'image';
    const hasExt = /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(base);
    if (hasExt) return base;
    return `${base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image'}.${mimeExt || 'png'}`;
  } catch {
    return `image.${mimeExt || 'png'}`;
  }
}

/**
 * Uploads local ./assets/ images (and optionally remote anti-hotlink images) in memory
 * for distribution without mutating disk markdown.
 */
export async function uploadLocalImagesForPublish(params: {
  workspacePath?: string | null;
  markdown: string;
  config: ImageBedConfig;
  uploadFn: ImageUploadFn;
  includeRemote?: boolean;
  skipHosts?: string[];
  fetchFn?: typeof fetch;
}): Promise<PublishImageUploadResult> {
  const {
    workspacePath,
    markdown,
    config,
    uploadFn,
    includeRemote = false,
    skipHosts,
    fetchFn = fetch,
  } = params;

  const allRefs = extractImageRefs(markdown);
  const refs = includeRemote ? allRefs : allRefs.filter((r) => r.isLocal);
  const urlMap: Record<string, string> = {};
  const errors: string[] = [];
  let uploadedCount = 0;

  for (const ref of refs) {
    if (urlMap[ref.src]) continue;

    if (ref.isLocal) {
      if (!workspacePath) {
        errors.push(`未配置工作区路径，无法读取本地图片: ${ref.src}`);
        continue;
      }
      const cleanRel = ref.src.replace(/^\.\//, '');
      const resolvedRoot = path.resolve(workspacePath);
      const fullPath = path.resolve(resolvedRoot, cleanRel);
      if (!fullPath.startsWith(`${resolvedRoot}${path.sep}`) && fullPath !== resolvedRoot) {
        errors.push(`非法图片路径: ${ref.src}`);
        continue;
      }
      try {
        const buffer = await fs.readFile(fullPath);
        const uploadedUrl = await uploadFn(buffer, path.basename(fullPath), config);
        if (uploadedUrl) {
          urlMap[ref.src] = uploadedUrl;
          uploadedCount++;
        }
      } catch (err) {
        errors.push(
          `上传图片 ${ref.src} 失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      continue;
    }

    // Remote anti-hotlink image handling
    if (!/^https?:\/\//i.test(ref.src) || isHostSkipped(ref.src, skipHosts)) {
      continue;
    }
    try {
      const referer = resolveRefererForUrl(ref.src);
      const res = await fetchFn(ref.src, {
        headers: {
          ...(referer ? { Referer: referer } : {}),
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) {
        errors.push(`抓取外链图片失败 (${res.status}): ${ref.src}`);
        continue;
      }
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const fileName = inferImageFileName(ref.src, res.headers.get('content-type'));
      const uploadedUrl = await uploadFn(buffer, fileName, config);
      if (uploadedUrl) {
        urlMap[ref.src] = uploadedUrl;
        uploadedCount++;
      }
    } catch (err) {
      errors.push(
        `转存防盗链图片 ${ref.src} 失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    markdown: replaceImagesInMemory(markdown, urlMap),
    urlMap,
    uploadedCount,
    errors,
  };
}
