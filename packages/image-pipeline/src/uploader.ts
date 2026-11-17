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

/** Uploads local ./assets/ images in memory for distribution without mutating disk markdown. */
export async function uploadLocalImagesForPublish(params: {
  workspacePath: string;
  markdown: string;
  config: ImageBedConfig;
  uploadFn: ImageUploadFn;
}): Promise<PublishImageUploadResult> {
  const { workspacePath, markdown, config, uploadFn } = params;
  const refs = extractImageRefs(markdown).filter((r) => r.isLocal);
  const urlMap: Record<string, string> = {};
  const errors: string[] = [];
  let uploadedCount = 0;

  for (const ref of refs) {
    if (urlMap[ref.src]) continue;
    const cleanRel = ref.src.replace(/^\.\//, '');
    const fullPath = path.resolve(workspacePath, cleanRel);
    // Prevent path traversal outside workspace
    if (!fullPath.startsWith(path.resolve(workspacePath))) {
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
  }

  return {
    markdown: replaceImagesInMemory(markdown, urlMap),
    urlMap,
    uploadedCount,
    errors,
  };
}
