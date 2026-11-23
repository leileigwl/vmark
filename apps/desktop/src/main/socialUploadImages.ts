import fs from 'node:fs/promises';
import path from 'node:path';
import { SOCIAL_CARD_PRESETS } from '@vcat/core';
import type { SocialCoverRatio } from '@vcat/shared';

/** 卡片生成器（正式环境是 rasterizeSocialCards，测试里可替换）。 */
export type CardRasterizer = (params: {
  markdown: string;
  title?: string;
  themeId: string;
  aspectRatio: SocialCoverRatio;
  maxCards: number;
  /** 正文相对路径图片的基准目录（工作区根目录，与编辑器 vcat-asset 协议一致）。 */
  imageBaseDir?: string;
}) => Promise<{ imagePaths: string[] }>;

export interface SocialUploadParams {
  workspacePath: string | null;
  markdown: string;
  title?: string;
  themeId: string;
  aspectRatio?: SocialCoverRatio;
  /** 平台单篇图片上限（含封面），来自 SOCIAL_MAX_CARDS。 */
  maxCards: number;
  /** 用户上传的封面，工作区相对路径。 */
  coverImagePath?: string;
}

const COVER_EXT_RE = /\.(png|jpe?g|webp)$/i;

/** 界面里选的卡片模板；不认识的模板回退到平台默认。 */
export function pickSocialTheme(candidate: string | undefined, fallback: string): string {
  return candidate && Object.prototype.hasOwnProperty.call(SOCIAL_CARD_PRESETS, candidate) ? candidate : fallback;
}

/** 把封面相对路径解析为工作区内存在的图片文件；越界、不存在、非图片一律返回 null。 */
export async function resolveSocialCoverImage(workspacePath: string | null, raw: string | undefined): Promise<string | null> {
  if (!workspacePath || !raw?.trim()) return null;
  let cleaned: string;
  try {
    cleaned = decodeURIComponent(raw.trim().replace(/^\.\//, ''));
  } catch {
    return null;
  }
  if (!COVER_EXT_RE.test(cleaned)) return null;
  const root = path.resolve(workspacePath);
  const abs = path.resolve(root, cleaned);
  if (!abs.startsWith(`${root}${path.sep}`)) return null;
  try {
    return (await fs.stat(abs)).isFile() ? abs : null;
  } catch {
    return null;
  }
}

/**
 * 卡片平台要上传的图片：永远是生成的卡片（正文图片已经排进卡片里），
 * 有上传封面时插在第 1 张，总数不超过平台上限。卡片生成失败时返回空列表。
 */
export async function resolveSocialUploadImages(params: SocialUploadParams, rasterize: CardRasterizer): Promise<string[]> {
  const cover = await resolveSocialCoverImage(params.workspacePath, params.coverImagePath);
  const budget = Math.max(0, params.maxCards - (cover ? 1 : 0));
  if (budget === 0) return [];
  let cards: string[];
  try {
    const { imagePaths } = await rasterize({
      markdown: params.markdown,
      title: params.title,
      themeId: params.themeId,
      aspectRatio: params.aspectRatio ?? '3:4',
      maxCards: budget,
      imageBaseDir: params.workspacePath ? path.resolve(params.workspacePath) : undefined,
    });
    cards = imagePaths.slice(0, budget);
  } catch {
    return [];
  }
  if (cards.length === 0) return [];
  return cover ? [cover, ...cards] : cards;
}
