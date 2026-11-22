import fs from 'node:fs/promises';
import path from 'node:path';
import { getSocialCardTheme, renderXiaohongshuCards } from '@vcat/core';
import type { SocialCoverRatio, SocialImageMode } from '@vcat/shared';

export interface SocialRasterizeResult {
  imagePaths: string[];
  captionText: string;
  tags: string[];
}

export type SocialRasterizerFn = (params: {
  markdown: string;
  title?: string;
  themeId?: string;
  aspectRatio?: SocialCoverRatio;
  maxCards?: number;
}) => Promise<SocialRasterizeResult>;

/** Resolves relative local image paths referenced in markdown within the workspace. */
export async function resolveLocalImageFiles(
  workspacePath: string | null,
  markdown: string
): Promise<string[]> {
  if (!workspacePath) return [];
  const regex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const raw = match[1].trim();
    if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('data:')) continue;
    const cleaned = decodeURIComponent(raw.replace(/^\.\//, ''));
    const abs = path.isAbsolute(cleaned) ? cleaned : path.resolve(workspacePath, cleaned);
    try {
      const stat = await fs.stat(abs);
      if (stat.isFile()) results.push(abs);
    } catch {
      // skip missing local image
    }
    if (results.length >= 18) break;
  }
  return results;
}

/** Resolves the effective social card theme ID, preserving all 4 current presets and legacy aliases. */
export function resolveSocialThemeId(candidate?: string, defaultTheme = 'ios-memo'): string {
  if (candidate && candidate.trim()) {
    return getSocialCardTheme(candidate.trim()).id;
  }
  return getSocialCardTheme(defaultTheme).id;
}

/** Resolves upload image paths according to `socialImageMode` (`cards` by default, or `article_images`). */
export async function resolveSocialUploadImages(params: {
  workspacePath: string | null;
  markdown: string;
  title?: string;
  themeId?: string;
  defaultTheme?: string;
  aspectRatio?: SocialCoverRatio;
  imageMode?: SocialImageMode;
  rasterizeFn: SocialRasterizerFn;
}): Promise<string[]> {
  const {
    workspacePath,
    markdown,
    title,
    themeId,
    defaultTheme = 'ios-memo',
    aspectRatio,
    imageMode = 'cards',
    rasterizeFn,
  } = params;

  if (imageMode === 'article_images') {
    const localImages = await resolveLocalImageFiles(workspacePath, markdown);
    if (localImages.length > 0) {
      return localImages;
    }
  }

  try {
    const selectedTheme = resolveSocialThemeId(themeId, defaultTheme);
    const { imagePaths } = await rasterizeFn({
      markdown,
      title,
      themeId: selectedTheme,
      aspectRatio: aspectRatio ?? '3:4',
      maxCards: 9,
    });
    return imagePaths;
  } catch {
    return [];
  }
}

/** Builds plain-text caption and hashtags for Xiaohongshu / Douyin note body. */
export function buildSocialCaption(
  markdown: string,
  title?: string,
  tags: string[] = []
): string {
  const rendered = renderXiaohongshuCards(markdown, title);
  const tagLine = tags.length > 0 ? `\n${tags.map((t) => `#${t}`).join(' ')}` : '';
  const text = `${rendered.captionText.trim()}${tagLine}`.trim();
  return text.length > 950 ? `${text.slice(0, 947)}...` : text;
}
