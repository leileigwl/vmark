import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageBedUploader, type FetchFn } from './index.ts';

test('github uploader sends PUT request with Authorization and base64 body and returns jsDelivr CDN URL', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch: FetchFn = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ content: { path: 'images/test.png' } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const uploader = createImageBedUploader(mockFetch);
  const bytes = Buffer.from('hello-png-binary');
  const resultUrl = await uploader(bytes, 'demo.png', {
    strategy: 'custom_oss',
    provider: 'github',
    repo: 'owner/assets-repo',
    branch: 'assets',
    token: 'ghp_secret_123',
  });

  assert.equal(capturedInit?.method, 'PUT');
  assert.match(
    capturedUrl,
    /^https:\/\/api\.github\.com\/repos\/owner\/assets-repo\/contents\/images\/\d+-demo\.png$/
  );

  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer ghp_secret_123');

  const body = JSON.parse(String(capturedInit?.body)) as {
    content: string;
    branch: string;
    message: string;
  };
  assert.equal(body.content, bytes.toString('base64'));
  assert.equal(body.branch, 'assets');

  assert.match(
    resultUrl,
    /^https:\/\/cdn\.jsdelivr\.net\/gh\/owner\/assets-repo@assets\/images\/\d+-demo\.png$/
  );
});

test('github uploader uses customDomain when configured', async () => {
  const mockFetch: FetchFn = async () =>
    new Response(JSON.stringify({}), { status: 201 });

  const uploader = createImageBedUploader(mockFetch);
  const resultUrl = await uploader(Buffer.from('img'), 'pic.png', {
    strategy: 'custom_oss',
    provider: 'github',
    repo: 'owner/repo',
    token: 'tok',
    customDomain: 'https://img.example.com/',
  });

  assert.match(resultUrl, /^https:\/\/img\.example\.com\/images\/\d+-pic\.png$/);
});

test('smms uploader sends FormData with smfile and returns data.url', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch: FetchFn = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        code: 'success',
        data: { url: 'https://s2.loli.net/2026/11/17/demo.png' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const uploader = createImageBedUploader(mockFetch);
  const url = await uploader(Buffer.from('png-data'), 'shot.png', {
    strategy: 'custom_oss',
    provider: 'smms',
    token: 'smms-token-abc',
  });

  assert.equal(capturedUrl, 'https://sm.ms/api/v2/upload');
  assert.equal(capturedInit?.method, 'POST');
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'smms-token-abc');
  assert.ok(capturedInit?.body instanceof FormData);
  const formFile = capturedInit.body.get('smfile');
  assert.ok(formFile instanceof Blob);
  assert.equal(url, 'https://s2.loli.net/2026/11/17/demo.png');
});

test('smms uploader returns fallback URL on image_repeated', async () => {
  const mockFetch: FetchFn = async () =>
    new Response(
      JSON.stringify({
        success: false,
        code: 'image_repeated',
        message: 'Image upload repeated limit',
        data: { images: 'https://s2.loli.net/2026/11/17/repeated.png' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const uploader = createImageBedUploader(mockFetch);
  const url = await uploader(Buffer.from('dup'), 'dup.png', {
    strategy: 'custom_oss',
    provider: 'smms',
    token: 'smms-token-abc',
  });

  assert.equal(url, 'https://s2.loli.net/2026/11/17/repeated.png');
});

test('missing credentials or provider throws clear Chinese error', async () => {
  const neverFetch: FetchFn = async () => {
    throw new Error('fetch should not be called');
  };
  const uploader = createImageBedUploader(neverFetch);

  await assert.rejects(
    () =>
      uploader(Buffer.from('x'), 'a.png', {
        strategy: 'custom_oss',
        provider: 'github',
        token: 'tok',
      }),
    /GitHub 图床配置缺少仓库名/
  );

  await assert.rejects(
    () =>
      uploader(Buffer.from('x'), 'a.png', {
        strategy: 'custom_oss',
        provider: 'github',
        repo: 'owner/repo',
      }),
    /GitHub 图床配置缺少访问令牌/
  );

  await assert.rejects(
    () =>
      uploader(Buffer.from('x'), 'a.png', {
        strategy: 'custom_oss',
        provider: 'smms',
      }),
    /SM\.MS 图床配置缺少 API Token/
  );

  await assert.rejects(
    () =>
      uploader(Buffer.from('x'), 'a.png', {
        strategy: 'custom_oss',
      }),
    /未配置图床服务商/
  );
});

test('HTTP failure throws clear Chinese error', async () => {
  const failFetch: FetchFn = async () =>
    new Response('Bad credentials', { status: 401, statusText: 'Unauthorized' });
  const uploader = createImageBedUploader(failFetch);

  await assert.rejects(
    () =>
      uploader(Buffer.from('x'), 'a.png', {
        strategy: 'custom_oss',
        provider: 'github',
        repo: 'owner/repo',
        token: 'bad-token',
      }),
    /GitHub 图床上传失败 \(HTTP 401\)/
  );
});
