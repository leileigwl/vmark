import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ImageBedConfig } from '@vcat/shared';
import type { ImageUploadFn } from './uploader.ts';

const execFileAsync = promisify(execFile);

export type FetchFn = typeof fetch;

interface SmmsResponse {
  success?: boolean;
  code?: string;
  message?: string;
  images?: string;
  data?: {
    url?: string;
    images?: string;
  };
}

function sanitizeFileName(fileName: string): string {
  const base = path.posix.basename(fileName.replace(/\\/g, '/'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.png';
}

async function uploadToGithub(
  buffer: Buffer,
  fileName: string,
  config: ImageBedConfig,
  fetchFn: FetchFn
): Promise<string> {
  const repo = config.repo?.trim();
  const token = config.token?.trim();
  if (!repo) {
    throw new Error('GitHub 图床配置缺少仓库名 (repo)');
  }
  if (!token) {
    throw new Error('GitHub 图床配置缺少访问令牌 (token)');
  }

  const branch = config.branch?.trim() || 'main';
  const cleanName = sanitizeFileName(fileName);
  const uploadPath = `images/${Date.now()}-${cleanName}`;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${uploadPath}`;

  const res = await fetchFn(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'vcat-image-pipeline',
    },
    body: JSON.stringify({
      message: `chore: upload ${cleanName}`,
      content: buffer.toString('base64'),
      branch,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `GitHub 图床上传失败 (HTTP ${res.status}): ${detail || res.statusText}`
    );
  }

  const customDomain = config.customDomain?.trim().replace(/\/+$/, '');
  if (customDomain) {
    return `${customDomain}/${uploadPath}`;
  }
  return `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${uploadPath}`;
}

async function uploadToSmms(
  buffer: Buffer,
  fileName: string,
  config: ImageBedConfig,
  fetchFn: FetchFn
): Promise<string> {
  const token = config.token?.trim();
  if (!token) {
    throw new Error('SM.MS 图床配置缺少 API Token (token)');
  }

  const cleanName = sanitizeFileName(fileName);
  const form = new FormData();
  form.append(
    'smfile',
    new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' }),
    cleanName
  );

  const res = await fetchFn('https://sm.ms/api/v2/upload', {
    method: 'POST',
    headers: {
      Authorization: token,
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `SM.MS 图床上传失败 (HTTP ${res.status}): ${detail || res.statusText}`
    );
  }

  const json = (await res.json()) as SmmsResponse;
  if (json.success && json.data?.url) {
    return json.data.url;
  }
  if (json.code === 'image_repeated') {
    const repeatedUrl = json.data?.images || json.images || json.data?.url;
    if (repeatedUrl) {
      return repeatedUrl;
    }
  }

  throw new Error(
    `SM.MS 图床上传失败: ${json.message || json.code || '未返回图片 URL'}`
  );
}

async function uploadWithPicgoCore(
  buffer: Buffer,
  fileName: string,
  config: ImageBedConfig
): Promise<string> {
  const picgoBin = config.picgoPath?.trim() || 'picgo';
  const cleanName = sanitizeFileName(fileName);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcat-picgo-'));
  const tempFile = path.join(tmpDir, cleanName);

  try {
    await fs.writeFile(tempFile, buffer);
    const { stdout } = await execFileAsync(picgoBin, ['upload', tempFile]);
    const urls = stdout.match(/https?:\/\/[^\s'"]+/g);
    const uploadedUrl = urls?.[urls.length - 1];
    if (!uploadedUrl) {
      throw new Error(`PicGo 上传未返回有效 URL: ${stdout.trim() || '无输出'}`);
    }
    return uploadedUrl;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('PicGo 上传')) {
      throw err;
    }
    throw new Error(
      `PicGo 上传失败: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Creates an ImageUploadFn supporting GitHub, SM.MS, and PicGo Core providers. */
export function createImageBedUploader(fetchFn: FetchFn = fetch): ImageUploadFn {
  return async (
    buffer: Buffer,
    fileName: string,
    config: ImageBedConfig
  ): Promise<string> => {
    if (!config.provider) {
      throw new Error('未配置图床服务商 (provider)');
    }

    switch (config.provider) {
      case 'github':
        return uploadToGithub(buffer, fileName, config, fetchFn);
      case 'smms':
        return uploadToSmms(buffer, fileName, config, fetchFn);
      case 'picgo_core':
        return uploadWithPicgoCore(buffer, fileName, config);
      default:
        throw new Error(`暂不支持的图床服务商: ${config.provider}`);
    }
  };
}
