import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CnblogsAdapter,
  GitHubStaticAdapter,
  PLATFORM_CATALOG,
  WeiboAdapter,
  ZhihuAdapter,
  JuejinAdapter,
  CsdnAdapter,
  BaijiahaoAdapter,
  BilibiliAdapter,
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

test('ZhihuAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const calls: string[] = [];
  const mockFetch: FetchLike = async (url, init) => {
    const method = init?.method || 'GET';
    calls.push(`${method} ${url}`);

    if (url === 'https://www.zhihu.com/api/v4/me') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ id: 'zh_user_123' }),
      };
    }
    if (url === 'https://zhuanlan.zhihu.com/api/uploaded_images') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ src: 'https://picx.zhimg.com/v2-uploaded.png' }),
      };
    }
    if (url === 'https://zhuanlan.zhihu.com/api/articles/drafts') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ id: 9876543, url: 'https://zhuanlan.zhihu.com/p/9876543/edit' }),
      };
    }
    if (url === 'https://zhuanlan.zhihu.com/api/articles/9876543/draft') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ id: 9876543 }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const adapter = new ZhihuAdapter({ fetchFn: mockFetch });
  assert.equal(adapter.descriptor.id, 'zhihu');
  assert.equal(adapter.descriptor.defaultMode, 'draft');

  assert.equal(await adapter.checkAuth(), true);
  const img = await adapter.uploadImage(Buffer.from('img'), 'pic.png');
  assert.equal(img, 'https://picx.zhimg.com/v2-uploaded.png');

  const result = await adapter.push({
    title: '知乎标题',
    markdown: '# 正文',
    html: '<h2>正文</h2>',
    tags: ['技术'],
    mode: 'draft',
  });
  assert.equal(result.postId, '9876543');
  assert.equal(result.url, 'https://zhuanlan.zhihu.com/p/9876543/edit');
  assert.equal(result.mode, 'draft');
  assert.equal(await adapter.verifyDelivery('9876543'), true);
});

test('JuejinAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const mockFetch: FetchLike = async (url) => {
    if (url === 'https://api.juejin.cn/user_api/v1/user/get') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ err_no: 0, data: { user_id: 'jj_999' } }),
      };
    }
    if (url === 'https://api.juejin.cn/user_api/v1/sys/token') {
      return {
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === 'x-ware-csrf-token' ? '0,test_csrf,123' : null) },
        text: async () => '',
        json: async () => ({}),
      };
    }
    if (url.includes('imagex/v2/gen_token')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          err_no: 0,
          data: { token: { AccessKeyId: 'ak', SecretAccessKey: 'sk', SessionToken: 'st' } },
        }),
      };
    }
    if (url.includes('Action=ApplyImageUpload')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          Result: {
            UploadAddress: {
              SessionKey: 'sess_k',
              UploadHosts: ['tos-cn.example.com'],
              StoreInfos: [{ StoreUri: 'tos-cn-i-k3u1fbpfcp/sample.png', Auth: 'tos_auth' }],
            },
          },
        }),
      };
    }
    if (url.startsWith('https://tos-cn.example.com/')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    }
    if (url.includes('Action=CommitImageUpload')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ Result: { Results: [{ Uri: 'ok' }] } }) };
    }
    if (url.includes('imagex/v2/get_img_url')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ err_no: 0, data: { main_url: 'https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/sample.png' } }),
      };
    }
    if (url === 'https://api.juejin.cn/content_api/v1/article_draft/create') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ err_no: 0, data: { id: 'draft_jj_888' } }),
      };
    }
    if (url === 'https://api.juejin.cn/content_api/v1/article_draft/detail') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ err_no: 0 }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const adapter = new JuejinAdapter({ fetchFn: mockFetch });
  assert.equal(adapter.descriptor.id, 'juejin');
  assert.equal(await adapter.checkAuth(), true);

  const img = await adapter.uploadImage(Buffer.from('img'), 'pic.png');
  assert.equal(img, 'https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/sample.png');

  const pushRes = await adapter.push({
    title: '掘金文章',
    markdown: '# 正文',
    html: '<h1>正文</h1>',
    tags: ['前端'],
    mode: 'draft',
  });
  assert.equal(pushRes.postId, 'draft_jj_888');
  assert.equal(pushRes.url, 'https://juejin.cn/editor/drafts/draft_jj_888');
  assert.equal(await adapter.verifyDelivery('draft_jj_888'), true);
});

test('CsdnAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const mockFetch: FetchLike = async (url) => {
    const urlStr = String(url);
    if (urlStr === 'https://bizapi.csdn.net/blog-console-api/v3/editor/getBaseInfo') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ code: 200, data: { name: 'vmark_author' } }),
      };
    }
    if (urlStr === 'https://bizapi.csdn.net/resource-api/v1/image/direct/upload/signature') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          code: 200,
          data: {
            filePath: '2026/test.png',
            host: 'https://csdn-obs.myhuaweicloud.com',
            accessId: 'test_ak',
            policy: 'test_policy',
            signature: 'test_sig',
            callbackUrl: 'https://bizapi.csdn.net/callback',
            callbackBody: '{}',
            callbackBodyType: 'application/json',
            customParam: {
              rtype: 'obs',
              filePath: '2026/test.png',
              isAudit: 0,
              'x-image-app': 'direct_blog_markdown',
              type: 'image',
              'x-image-suffix': 'png',
              username: 'vmark_author',
            },
          },
        }),
      };
    }
    if (urlStr === 'https://csdn-obs.myhuaweicloud.com') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ code: 200, data: { imageUrl: 'https://img-blog.csdnimg.cn/csdn_img.png' } }),
      };
    }
    if (urlStr === 'https://bizapi.csdn.net/blog-console-api/v3/mdeditor/saveArticle') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ code: 200, data: { id: 'csdn_112233' } }),
      };
    }
    throw new Error(`Unexpected url: ${urlStr}`);
  };

  const adapter = new CsdnAdapter({ fetchFn: mockFetch });
  assert.equal(adapter.descriptor.id, 'csdn');
  assert.equal(await adapter.checkAuth(), true);

  const img = await adapter.uploadImage(Buffer.from('img'), 'pic.png');
  assert.equal(img, 'https://img-blog.csdnimg.cn/csdn_img.png');

  const pushRes = await adapter.push({
    title: 'CSDN文章',
    markdown: '# 正文',
    html: '<h1>正文</h1>',
    tags: ['架构'],
    mode: 'draft',
  });
  assert.equal(pushRes.postId, 'csdn_112233');
  assert.equal(pushRes.url, 'https://editor.csdn.net/md?articleId=csdn_112233');
  assert.equal(await adapter.verifyDelivery('csdn_112233'), true);
});

test('BaijiahaoAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const mockFetch: FetchLike = async (url) => {
    if (url === 'https://baijiahao.baidu.com/builder/author/register/get_user_info') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ errno: 0, data: { app_id: 'bjh_app_123' } }),
      };
    }
    if (url === 'https://baijiahao.baidu.com/builderinner/open/resource/query/upload') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ errno: 0, data: { url: 'https://bjh-pic.baidu.com/pic_1.jpg' } }),
      };
    }
    if (url === 'https://baijiahao.baidu.com/builderinner/open/resource/article/save') {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ errno: 0, data: { article_id: 'bjh_art_777' } }),
      };
    }
    if (url.startsWith('https://baijiahao.baidu.com/builderinner/open/resource/article/detail')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ errno: 0 }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const adapter = new BaijiahaoAdapter({ fetchFn: mockFetch });
  assert.equal(adapter.descriptor.id, 'baijiahao');
  assert.equal(await adapter.checkAuth(), true);

  const img = await adapter.uploadImage(Buffer.from('img'), 'pic.png');
  assert.equal(img, 'https://bjh-pic.baidu.com/pic_1.jpg');

  const pushRes = await adapter.push({
    title: '百家号文章',
    markdown: '# 正文',
    html: '<h2>正文</h2>',
    tags: ['科技'],
    mode: 'draft',
  });
  assert.equal(pushRes.postId, 'bjh_art_777');
  assert.equal(pushRes.url, 'https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=bjh_art_777');
  assert.equal(await adapter.verifyDelivery('bjh_art_777'), true);
});

test('Platform adapters return false on authentication failure or expired session', async () => {
  const unauthFetch: FetchLike = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
    json: async () => ({ code: 401, errno: 401, err_no: 401 }),
  });

  const zhihu = new ZhihuAdapter({ fetchFn: unauthFetch });
  assert.equal(await zhihu.checkAuth(), false);

  const juejin = new JuejinAdapter({ fetchFn: unauthFetch });
  assert.equal(await juejin.checkAuth(), false);

  const csdn = new CsdnAdapter({ fetchFn: unauthFetch });
  assert.equal(await csdn.checkAuth(), false);

  const bjh = new BaijiahaoAdapter({ fetchFn: unauthFetch });
  assert.equal(await bjh.checkAuth(), false);
});

test('BaijiahaoAdapter modern production pipeline: appinfo auth -> pcui image upload -> tokenized pcui draft save', async () => {
  let capturedFormData: FormData | null = null;
  const mockFetch: FetchLike = async (url, init) => {
    if (url.includes('builder/app/appinfo')) {
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          errno: 0,
          errmsg: 'success',
          data: { user: { userid: 'bjh_user_01', name: '技术创作者' }, app_id: '1589639493090963' },
        }),
      };
    }
    if (url.includes('pcui/picture/uploadproxy')) {
      capturedFormData = init?.body as FormData;
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          errno: 0,
          errmsg: 'success',
          ret: { https_url: 'https://bjh-pic.baidu.com/pcui_uploaded.png' },
        }),
      };
    }
    if (url === 'https://baijiahao.baidu.com/builder/rc/edit') {
      return {
        ok: true,
        status: 200,
        text: async () => `<!DOCTYPE html><html><body><script>window.__BJH__INIT__AUTH__ = "mock_bjh_token_xyz";</script></body></html>`,
        json: async () => ({}),
      };
    }
    if (url.includes('pcui/article/save')) {
      const headers = (init?.headers as Record<string, string>) || {};
      assert.equal(headers['token'], 'mock_bjh_token_xyz');
      // Standard Baidu JSONP callback with terminating semicolon and whitespace
      return {
        ok: true,
        status: 200,
        text: async () => `bjhdraft({"errno":0,"errmsg":"success","ret":{"article_id":"bjh_pcui_999"}});\n`,
        json: async () => ({}),
      };
    }
    if (url.includes('builder/rc/edit?type=news&article_id=bjh_pcui_999')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<html>Editor loaded</html>',
        json: async () => ({}),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const adapter = new BaijiahaoAdapter({ fetchFn: mockFetch });
  assert.equal(await adapter.checkAuth(), true);
  assert.equal(adapter.getAppId(), '1589639493090963');
  assert.equal(adapter.getUserInfo()?.name, '技术创作者');
  assert.equal(adapter.getUserInfo()?.userid, 'bjh_user_01');

  const img = await adapter.uploadImage(Buffer.from('mock-bytes'), 'test.png');
  assert.equal(img, 'https://bjh-pic.baidu.com/pcui_uploaded.png');
  assert.ok(capturedFormData, 'FormData must be passed to pcui/picture/uploadproxy');
  const fd = capturedFormData as FormData;
  assert.equal(fd.get('app_id'), '1589639493090963');
  assert.equal(fd.get('is_events'), '');

  const pushRes = await adapter.push({
    title: '现代化微前端架构实践',
    markdown: '# 正文',
    html: '<p>正文内容</p>',
    tags: ['前端'],
    mode: 'draft',
  });
  assert.equal(pushRes.postId, 'bjh_pcui_999');
  assert.equal(pushRes.url, 'https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=bjh_pcui_999');
  assert.equal(await adapter.verifyDelivery('bjh_pcui_999'), true);

  // Probe edge cases: empty user object or missing author qualifications returns false
  const emptyUserFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ errno: 0, errmsg: 'success', data: { user: {} } }),
  });
  const emptyUserAdapter = new BaijiahaoAdapter({ fetchFn: emptyUserFetch });
  assert.equal(await emptyUserAdapter.checkAuth(), false);
});

test('JuejinAdapter rejects guest user_id "0" and surfaces actionable re-login error on must login', async () => {
  const guestAdapter = new JuejinAdapter({
    fetchFn: async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ err_no: 0, data: { user_id: '0' } }),
    }),
  });
  assert.equal(await guestAdapter.checkAuth(), false);

  const expiredAdapter = new JuejinAdapter({
    fetchFn: async (url) => {
      if (String(url).includes('sys/token')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ err_no: 403, err_msg: 'must login' }),
      };
    },
  });
  await assert.rejects(
    () =>
      expiredAdapter.push({
        title: '测试',
        markdown: '内容',
        html: '<p>内容</p>',
        tags: [],
        mode: 'draft',
      }),
    /掘金登录态已失效（must login）/
  );
});

test('BilibiliAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const adapter = new BilibiliAdapter({
    csrfToken: 'bili_csrf',
    fetchFn: async (url) => {
      const u = String(url);
      if (u.includes('/x/web-interface/nav')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 0, data: { isLogin: true } }) };
      }
      if (u.includes('/upcover')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 0, data: { url: '//i0.hdslb.com/bfs/article/1.png' } }) };
      }
      if (u.includes('/draft/addupdate')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 0, data: { aid: 9527 } }) };
      }
      if (u.includes('/draft/view')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 0 }) };
      }
      throw new Error(`Unexpected bilibili url: ${u}`);
    },
  });

  assert.equal(await adapter.checkAuth(), true);
  const img = await adapter.uploadImage(Buffer.from('img'), 'a.png');
  assert.equal(img, 'https://i0.hdslb.com/bfs/article/1.png');
  const pushed = await adapter.push({ title: 'B站测试', markdown: '正文', html: '<p>正文</p>', tags: [], mode: 'draft' });
  assert.equal(pushed.postId, '9527');
  assert.equal(pushed.url, 'https://member.bilibili.com/platform/upload/text/new-edit?aid=9527');
  assert.equal(pushed.verified, true);
});

test('CsdnAdapter surfaces actionable blog-activation error when saveArticle returns 400 博主不存在', async () => {
  const adapter = new CsdnAdapter({
    fetchFn: async () => ({
      ok: false,
      status: 400,
      text: async () => '',
      json: async () => ({ code: 400, msg: '博主不存在' }),
    }),
  });
  await assert.rejects(
    () => adapter.push({ title: 't', markdown: 'm', html: '<p>m</p>', tags: [], mode: 'draft' }),
    /CSDN 账号尚未开通博客空间/
  );
});

test('WeiboAdapter 5-step flow: checkAuth -> uploadImage -> push draft -> verifyDelivery', async () => {
  const adapter = new WeiboAdapter({
    fetchFn: async (url) => {
      if (url.includes('card.weibo.com/article/v5/editor')) {
        return {
          ok: true,
          status: 200,
          text: async () => `config: JSON.parse('{"uid":"10086","nick":"测试微博"}')`,
          json: async () => ({}),
        };
      }
      if (url.includes('picupload.weibo.com')) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ data: { pics: { pic_1: { pid: 'wb_pid_1' } } } }),
        };
      }
      if (url.includes('draft/create')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 100000, data: { id: 'wb_d_1' } }) };
      }
      if (url.includes('draft/save')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ code: 100000 }) };
      }
      throw new Error(`Unexpected url: ${url}`);
    },
  });

  assert.equal(await adapter.checkAuth(), true);
  assert.equal(await adapter.uploadImage(Buffer.from('img'), 'a.png'), 'https://wx3.sinaimg.cn/large/wb_pid_1.jpg');
  const pushed = await adapter.push({ title: '微博测试', markdown: '正文', html: '<p>正文</p>', tags: [], mode: 'draft' });
  assert.equal(pushed.postId, 'wb_d_1');
  assert.equal(pushed.url, 'https://card.weibo.com/article/v5/editor#/draft/wb_d_1');
  assert.equal(await adapter.verifyDelivery('wb_d_1'), true);
});
