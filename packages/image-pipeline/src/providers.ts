import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ImageBedConfig } from '@vcat/shared';
import type { ImageUploadFn } from './uploader.ts';

const defaultExecFileAsync = promisify(execFile);

export type FetchFn = typeof fetch;
export type ExecFileFn = (
  file: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeout?: number }
) => Promise<{ stdout: string; stderr: string }>;

function getExtraBinDirs(): string[] {
  const home = os.homedir();
  const dirs = [
    path.join(home, '.local', 'share', 'pnpm'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.yarn', 'bin'),
    '/usr/bin',
    '/bin',
  ];
  if (process.platform === 'win32' && process.env.APPDATA) {
    dirs.unshift(path.join(process.env.APPDATA, 'npm'));
  }
  return dirs;
}

/** Builds an environment with common Node/pnpm/Homebrew bin directories on PATH for GUI Electron apps. */
export function buildPicgoEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const currentPath = baseEnv.PATH ?? '';
  const merged = [...currentPath.split(path.delimiter).filter(Boolean), ...getExtraBinDirs()];
  const deduped = Array.from(new Set(merged));
  return { ...baseEnv, PATH: deduped.join(path.delimiter) };
}

/** Resolves the PicGo-Core CLI binary path, falling back across common macOS/Linux/Windows install locations. */
export async function resolvePicgoBinary(customPath?: string): Promise<string> {
  const trimmed = customPath?.trim();
  if (trimmed) {
    return trimmed.startsWith('~/') ? path.join(os.homedir(), trimmed.slice(2)) : trimmed;
  }

  const binName = process.platform === 'win32' ? 'picgo.cmd' : 'picgo';
  const searchDirs = [
    ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean),
    ...getExtraBinDirs(),
  ];

  for (const dir of Array.from(new Set(searchDirs))) {
    const candidate = path.join(dir, binName);
    try {
      await fs.access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return 'picgo';
}

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
  config: ImageBedConfig,
  execFileFn: ExecFileFn = defaultExecFileAsync
): Promise<string> {
  const picgoBin = await resolvePicgoBinary(config.picgoPath);
  const cleanName = sanitizeFileName(fileName);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcat-picgo-'));
  const tempFile = path.join(tmpDir, cleanName);

  try {
    await fs.writeFile(tempFile, buffer);
    const { stdout, stderr } = await execFileFn(picgoBin, ['upload', tempFile], {
      env: buildPicgoEnv(),
      timeout: 20000,
    });
    const urls = stdout.match(/https?:\/\/[^\s'"]+/g);
    const uploadedUrl = urls?.[urls.length - 1];
    if (!uploadedUrl) {
      const errMatch = `${stdout}\n${stderr}`.match(/\[PicGo ERROR\]:?\s*(.+)/i);
      const detail = errMatch?.[1]?.trim() || stdout.trim() || stderr.trim() || '无输出';
      throw new Error(`PicGo 上传未返回有效 URL: ${detail}`);
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
export function createImageBedUploader(
  fetchFn: FetchFn = fetch,
  execFileFn: ExecFileFn = defaultExecFileAsync
): ImageUploadFn {
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
        return uploadWithPicgoCore(buffer, fileName, config, execFileFn);
      default:
        throw new Error(`暂不支持的图床服务商: ${config.provider}`);
    }
  };
}
