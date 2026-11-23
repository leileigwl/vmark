import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveRefererForUrl } from '@vcat/image-pipeline';

type UploadFn = (buffer: Buffer, fileName: string) => Promise<string>;
type CoverResult = { ok: true; url?: string } | { ok: false; message: string };

/** 把一张封面（工作区相对路径或远程地址）转存到公众号素材，返回 mmbiz 地址。 */
export async function resolveWeixinCoverUrl(params: {
  coverImageUrl?: string;
  workspacePath: string | null;
  upload: UploadFn;
  includeRemote: boolean;
}): Promise<CoverResult> {
  const raw = params.coverImageUrl?.trim();
  if (!raw) return { ok: true, url: undefined };

  if (!/^https?:\/\//i.test(raw)) {
    if (!params.workspacePath) {
      return { ok: false, message: `未配置工作区路径，无法读取本地封面图: ${raw}` };
    }
    const resolvedRoot = path.resolve(params.workspacePath);
    const cleanRel = raw.replace(/^\.\//, '');
    const fullCoverPath = path.resolve(resolvedRoot, cleanRel);
    if (!fullCoverPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      return { ok: false, message: `非法封面图路径: ${raw}` };
    }
    const coverBuffer = await fs.readFile(fullCoverPath);
    const url = await params.upload(coverBuffer, path.basename(fullCoverPath));
    return { ok: true, url };
  }

  if (!params.includeRemote || raw.includes('mmbiz.qpic.cn')) {
    return { ok: true, url: raw };
  }

  const referer = resolveRefererForUrl(raw);
  const res = await fetch(raw, {
    headers: {
      ...(referer ? { Referer: referer } : {}),
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    return { ok: false, message: `抓取封面图失败 (${res.status}): ${raw}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const url = await params.upload(buffer, 'cover.png');
  return { ok: true, url };
}

/** 2.35:1 封面与按焦点裁好的 1:1 转发图分别转存；没有方图时 squareUrl 为空，由公众号居中裁。 */
export async function resolveWeixinCovers(params: {
  coverImageUrl?: string;
  squareImagePath?: string;
  workspacePath: string | null;
  upload: UploadFn;
  includeRemote: boolean;
}): Promise<{ ok: true; url?: string; squareUrl?: string } | { ok: false; message: string }> {
  const { squareImagePath, ...rest } = params;
  const cover = await resolveWeixinCoverUrl(rest);
  if (!cover.ok) return cover;
  const square = await resolveWeixinCoverUrl({ ...rest, coverImageUrl: squareImagePath });
  if (!square.ok) return square;
  return { ok: true, url: cover.url, squareUrl: square.url };
}
