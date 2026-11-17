import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CnblogsAdapter,
  GitHubStaticAdapter,
  PLATFORM_CATALOG,
  type FetchLike,
} from './index.ts';

test('GitHubStaticAdapter 5-step flow: checkAuth -> uploadImage -> push -> verifyDelivery', async () => {
  const calls: string[] = [];
  const mockFetch: FetchLike = async (url, init) => {
    const method = init?.method || 'GET';
    calls.push(`${method} ${url}`);

    const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
    assert.equal(authHeader, 'Bearer ghp_test_token');

    if (method === 'GET' && url === 'https://api.github.com/repos/leileigwl/blog') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ full_name: 'leileigwl/blog' }),
      };
    }

    if (method === 'PUT' && url === 'https://api.github.com/repos/leileigwl/blog/contents/assets/cover.png') {
      const body = JSON.parse(String(init?.body || '{}')) as { content: string; branch: string };
      assert.equal(body.branch, 'main');
      assert.equal(body.content, Buffer.from('png-bytes').toString('base64'));
      return {
        ok: true,
        status: 201,
        text: async () => '',
        json: async () => ({
          content: {
            path: 'assets/cover.png',
            download_url: 'https://raw.githubusercontent.com/leileigwl/blog/main/assets/cover.png',
          },
        }),
      };
    }

    if (method === 'PUT' && url === 'https://api.github.com/repos/leileigwl/blog/contents/posts/hello-vmark.md') {
      const body = JSON.parse(String(init?.body || '{}')) as { content: string; branch: string };
      assert.equal(body.branch, 'main');
      const decoded = Buffer.from(body.content, 'base64').toString('utf8');
      assert.ok(decoded.includes('title: "Hello Vmark"'));
      assert.ok(decoded.includes('draft: false'));
      assert.ok(decoded.includes('# Hello Vmark'));
      return {
        ok: true,
        status: 201,
        text: async () => '',
        json: async () => ({
          content: {
            path: 'posts/hello-vmark.md',
            html_url: 'https://github.com/leileigwl/blog/blob/main/posts/hello-vmark.md',
          },
        }),
      };
    }

    if (
      method === 'GET' &&
      url === 'https://api.github.com/repos/leileigwl/blog/contents/posts/hello-vmark.md?ref=main'
    ) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ path: 'posts/hello-vmark.md' }),
      };
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  const adapter = new GitHubStaticAdapter({
    repo: 'leileigwl/blog',
    branch: 'main',
    token: 'ghp_test_token',
    baseDir: 'posts',
    fetchFn: mockFetch,
  });

  assert.equal(adapter.descriptor.id, 'github_static');
  assert.deepEqual(
    adapter.descriptor,
    PLATFORM_CATALOG.find((p) => p.id === 'github_static')
  );

  const authed = await adapter.checkAuth();
  assert.equal(authed, true);

  const imageUrl = await adapter.uploadImage(Buffer.from('png-bytes'), 'cover.png');
  assert.equal(imageUrl, 'https://raw.githubusercontent.com/leileigwl/blog/main/assets/cover.png');

  const result = await adapter.push({
    title: 'Hello Vmark',
    markdown: '# Hello Vmark\n\nContent here.',
    html: '<h1>Hello Vmark</h1><p>Content here.</p>',
    tags: ['vmark', 'blog'],
    mode: 'direct',
  });

  assert.equal(result.postId, 'posts/hello-vmark.md');
  assert.equal(result.url, 'https://github.com/leileigwl/blog/blob/main/posts/hello-vmark.md');
  assert.equal(result.mode, 'direct');
  assert.equal(result.verified, true);
  assert.equal(calls.length, 4);
});

test('GitHubStaticAdapter returns false on auth failure and failed verifyDelivery', async () => {
  const mockFetch: FetchLike = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
    json: async () => ({ message: 'Bad credentials' }),
  });

  const adapter = new GitHubStaticAdapter({
    repo: 'leileigwl/blog',
    token: 'bad_token',
    fetchFn: mockFetch,
  });

  assert.equal(await adapter.checkAuth(), false);
  assert.equal(await adapter.verifyDelivery('posts/missing.md'), false);
});

test('CnblogsAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const rpcMethods: string[] = [];
  const mockFetch: FetchLike = async (url, init) => {
    assert.equal(url, 'https://rpc.cnblogs.com/metaweblog/vmarkuser');
    assert.equal(init?.method, 'POST');
    const body = String(init?.body || '');

    if (body.includes('<methodName>blogger.getUsersBlogs</methodName>')) {
      rpcMethods.push('blogger.getUsersBlogs');
      assert.ok(body.includes('<string>vmarkuser</string>'));
      assert.ok(body.includes('<string>cn_token_123</string>'));
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<?xml version="1.0"?><methodResponse><params><param><value><array><data><value><struct><member><name>blogid</name><value><string>98765</string></value></member></struct></value></data></array></value></param></params></methodResponse>',
        json: async () => ({}),
      };
    }

    if (body.includes('<methodName>metaWeblog.newMediaObject</methodName>')) {
      rpcMethods.push('metaWeblog.newMediaObject');
      assert.ok(body.includes('<string>98765</string>'));
      assert.ok(body.includes(`<base64>${Buffer.from('img-data').toString('base64')}</base64>`));
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<?xml version="1.0"?><methodResponse><params><param><value><struct><member><name>url</name><value><string>https://img2026.cnblogs.com/blog/98765/cover.png</string></value></member></struct></value></param></params></methodResponse>',
        json: async () => ({}),
      };
    }

    if (body.includes('<methodName>metaWeblog.newPost</methodName>')) {
      rpcMethods.push('metaWeblog.newPost');
      assert.ok(body.includes('<string>98765</string>'));
      assert.ok(body.includes('<string>博客园测试 &amp; 发布</string>'));
      assert.ok(body.includes('<boolean>0</boolean>'));
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<?xml version="1.0"?><methodResponse><params><param><value><string>18001234</string></value></param></params></methodResponse>',
        json: async () => ({}),
      };
    }

    if (body.includes('<methodName>metaWeblog.getPost</methodName>')) {
      rpcMethods.push('metaWeblog.getPost');
      assert.ok(body.includes('<string>18001234</string>'));
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<?xml version="1.0"?><methodResponse><params><param><value><struct><member><name>postid</name><value><string>18001234</string></value></member></struct></value></param></params></methodResponse>',
        json: async () => ({}),
      };
    }

    throw new Error(`Unexpected RPC call: ${body}`);
  };

  const adapter = new CnblogsAdapter({
    blogUrl: 'https://rpc.cnblogs.com/metaweblog/vmarkuser',
    username: 'vmarkuser',
    token: 'cn_token_123',
    fetchFn: mockFetch,
  });

  assert.equal(adapter.descriptor.id, 'cnblogs');
  assert.deepEqual(
    adapter.descriptor,
    PLATFORM_CATALOG.find((p) => p.id === 'cnblogs')
  );

  const authed = await adapter.checkAuth();
  assert.equal(authed, true);

  const imageUrl = await adapter.uploadImage(Buffer.from('img-data'), 'cover.png');
  assert.equal(imageUrl, 'https://img2026.cnblogs.com/blog/98765/cover.png');

  const result = await adapter.push({
    title: '博客园测试 & 发布',
    markdown: '# 正文',
    html: '<h1>正文</h1>',
    tags: ['随笔', 'TypeScript'],
    mode: 'draft',
  });

  assert.equal(result.postId, '18001234');
  assert.equal(result.url, 'https://www.cnblogs.com/vmarkuser/p/18001234.html');
  assert.equal(result.mode, 'draft');
  assert.equal(result.verified, true);
  assert.deepEqual(rpcMethods, [
    'blogger.getUsersBlogs',
    'metaWeblog.newMediaObject',
    'metaWeblog.newPost',
    'metaWeblog.getPost',
  ]);
});

test('CnblogsAdapter handles XML-RPC fault gracefully in checkAuth and verifyDelivery', async () => {
  const mockFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      '<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultString</name><value><string>Invalid credentials</string></value></member></struct></value></fault></methodResponse>',
    json: async () => ({}),
  });

  const adapter = new CnblogsAdapter({
    blogUrl: 'https://rpc.cnblogs.com/metaweblog/vmarkuser',
    username: 'vmarkuser',
    token: 'bad_token',
    fetchFn: mockFetch,
  });

  assert.equal(await adapter.checkAuth(), false);
  assert.equal(await adapter.verifyDelivery('18001234'), false);
});
