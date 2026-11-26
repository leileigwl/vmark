import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { register } from 'node:module';
import type Electron from 'electron';

register('./support/electronStubLoader.mjs', import.meta.url);
const { publishCnblogsWebDraft } = await import('../src/main/publishCnblogsDraft.ts');

test('publishCnblogsWebDraft 上传图片时必须为 Blob 附带准确图片 MIME 类型（修复 HTTP 400「只能上传图片文件」）', async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-cnblogs-'));
  await fs.mkdir(path.join(ws, 'assets'), { recursive: true });
  await fs.writeFile(path.join(ws, 'assets', 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(path.join(ws, 'assets', 'b.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

  const uploadedTypes: Array<{ name: string; type: string }> = [];
  let postedBody: { title?: string; postBody?: string; isDraft?: boolean } | null = null;

  const mockSession = {
    fromPartition() {
      return {
        cookies: {
          async get(filter?: { name?: string }) {
            if (filter?.name === 'XSRF-TOKEN') return [{ name: 'XSRF-TOKEN', value: 'xsrf_tok', domain: 'i.cnblogs.com' }];
            return [{ name: '.Cnblogs.AspNetCore.Cookies', value: 'cookie_ok', domain: '.cnblogs.com' }];
          },
        },
        async fetch(input: string, init?: RequestInit) {
          const url = String(input);
          if (url.includes('upload.cnblogs.com/v2/images/cors-upload')) {
            const form = init?.body as FormData;
            const file = form.get('image') as File | Blob | null;
            const name = file && 'name' in file ? String(file.name) : '';
            const type = file?.type ?? '';
            uploadedTypes.push({ name, type });
            // 复现博客园服务端校验：未带 image/* MIME 时返回 HTTP 400「只能上传图片文件」
            if (!type.startsWith('image/')) {
              return {
                ok: false,
                status: 400,
                url,
                headers: new Headers(),
                text: async () => '只能上传图片文件',
                json: async () => ({}),
              };
            }
            return {
              ok: true,
              status: 200,
              url,
              headers: new Headers(),
              text: async () => JSON.stringify({ imageUrl: `https://img2024.cnblogs.com/mock/${name}` }),
              json: async () => ({ imageUrl: `https://img2024.cnblogs.com/mock/${name}` }),
            };
          }
          if (url.includes('i.cnblogs.com/api/posts')) {
            postedBody = JSON.parse(String(init?.body ?? '{}'));
            return {
              ok: true,
              status: 200,
              url,
              headers: new Headers(),
              text: async () => JSON.stringify({ id: 23790001 }),
              json: async () => ({ id: 23790001 }),
            };
          }
          return {
            ok: true,
            status: 200,
            url,
            headers: new Headers(),
            text: async () => '{}',
            json: async () => ({}),
          };
        },
      };
    },
  } as unknown as typeof Electron.session;

  try {
    const res = await publishCnblogsWebDraft({
      session: mockSession,
      includeRemote: true,
      cfg: { workspacePath: ws, imageBed: { strategy: 'platform_private' } },
      payload: {
        title: '博客园图片上传测试',
        markdown: '# 测试\n\n![图1](./assets/a.png)\n\n![图2](./assets/b.jpg)\n',
        targets: [{ platformId: 'cnblogs', mode: 'draft' }],
      },
    });

    assert.equal(res.ok, true, res.message);
    assert.equal(res.uploadedImagesCount, 2);
    assert.deepEqual(uploadedTypes, [
      { name: 'a.png', type: 'image/png' },
      { name: 'b.jpg', type: 'image/jpeg' },
    ]);
    assert.equal(postedBody?.isDraft, true);
    assert.match(postedBody?.postBody ?? '', /https:\/\/img2024\.cnblogs\.com\/mock\/a\.png/);
    assert.match(postedBody?.postBody ?? '', /https:\/\/img2024\.cnblogs\.com\/mock\/b\.jpg/);
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});

test('publishCnblogsWebDraft 上传失败时在错误信息中保留服务端返回文本', async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'vmark-cnblogs-err-'));
  await fs.mkdir(path.join(ws, 'assets'), { recursive: true });
  await fs.writeFile(path.join(ws, 'assets', 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const mockSession = {
    fromPartition() {
      return {
        cookies: {
          async get(filter?: { name?: string }) {
            if (filter?.name === 'XSRF-TOKEN') return [{ name: 'XSRF-TOKEN', value: 'xsrf_tok', domain: 'i.cnblogs.com' }];
            return [{ name: '.Cnblogs.AspNetCore.Cookies', value: 'cookie_ok', domain: '.cnblogs.com' }];
          },
        },
        async fetch(input: string) {
          const url = String(input);
          if (url.includes('upload.cnblogs.com/v2/images/cors-upload')) {
            return {
              ok: false,
              status: 400,
              url,
              headers: new Headers(),
              text: async () => '图片尺寸过大',
              json: async () => ({}),
            };
          }
          return { ok: true, status: 200, url, headers: new Headers(), text: async () => '{}', json: async () => ({}) };
        },
      };
    },
  } as unknown as typeof Electron.session;

  try {
    const res = await publishCnblogsWebDraft({
      session: mockSession,
      includeRemote: true,
      cfg: { workspacePath: ws, imageBed: { strategy: 'platform_private' } },
      payload: {
        title: '失败透传测试',
        markdown: '![图](./assets/a.png)',
        targets: [{ platformId: 'cnblogs', mode: 'draft' }],
      },
    });
    assert.equal(res.ok, false);
    assert.match(res.message, /HTTP 400/);
    assert.match(res.message, /图片尺寸过大/);
  } finally {
    await fs.rm(ws, { recursive: true, force: true });
  }
});
