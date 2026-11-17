import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ImageRef {
  rawMatch: string;
  alt: string;
  src: string;
  isLocal: boolean;
}

const MD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Extracts all Markdown image references and classifies local vs remote URLs. */
export function extractImageRefs(markdown: string): ImageRef[] {
  const refs: ImageRef[] = [];
  for (const match of markdown.matchAll(MD_IMAGE_REGEX)) {
    const src = match[2];
    const isLocal = !/^https?:\/\//i.test(src) && !/^data:/i.test(src);
    refs.push({
      rawMatch: match[0],
      alt: match[1],
      src,
      isLocal,
    });
  }
  return refs;
}

/** Persists a binary image buffer into the workspace assets directory using content hash. */
export async function saveImageToAssets(
  workspaceRoot: string,
  buffer: Buffer,
  ext = 'png'
): Promise<{ relativeMarkdownPath: string; fullPath: string; sha256: string }> {
  const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'png';
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const fileName = `${Date.now()}-${sha256}.${cleanExt}`;
  const assetsDir = path.join(workspaceRoot, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const fullPath = path.join(assetsDir, fileName);
  await fs.writeFile(fullPath, buffer);

  return {
    relativeMarkdownPath: `./assets/${fileName}`,
    fullPath,
    sha256,
  };
}

/** Clones markdown in memory and rewrites image URLs for distribution without mutating disk files. */
export function replaceImagesInMemory(
  markdown: string,
  urlMap: Record<string, string>
): string {
  return markdown.replace(MD_IMAGE_REGEX, (full, alt: string, src: string) => {
    const mapped = urlMap[src];
    return mapped ? `![${alt}](${mapped})` : full;
  });
}

export { uploadLocalImagesForPublish, type ImageUploadFn, type PublishImageUploadResult } from './uploader.ts';
export { createImageBedUploader, type FetchFn } from './providers.ts';
