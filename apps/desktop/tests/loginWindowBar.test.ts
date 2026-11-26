import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOGIN_BAR_HEIGHT,
  buildLoginBarHtml,
  loginWindowName,
  nextLoginBarAction,
  parseLoginBarActionUrl,
  resolveLoginBarTheme,
} from '../src/main/loginWindowBar.ts';

test('顶栏：平台名、后退、刷新、关闭；不出现完成按钮、标签页、地址栏和技术术语', () => {
  const html = buildLoginBarHtml({ platformId: 'juejin', signedInAtOpen: false });
  assert.match(html, /稀土掘金/);
  assert.match(html, /vmark-nav:\/\/back/);
  assert.match(html, /vmark-nav:\/\/reload/);
  assert.match(html, /vmark-nav:\/\/close/);
  assert.match(html, /document\.title\s*=/);
  assert.match(html, /aria-label="关闭"/);
  assert.ok(!html.includes('>登录完成<'));
  assert.ok(!html.includes('>完成<'));
  assert.ok(!html.includes('vmark-nav://done'));
  for (const banned of ['沙箱', 'persist:', 'Cookie', 'data-platform-tab', 'url-pill']) assert.ok(!html.includes(banned), banned);
  assert.match(html, /color-scheme:light/); // 未传 app 主题时默认浅色（apple-light），不再读系统 prefers-color-scheme
  assert.match(html, new RegExp(`height:${LOGIN_BAR_HEIGHT}px`));
});

test('已登录时打开（如去后台/草稿箱）显示“已登录”，同样不显示完成按钮', () => {
  const html = buildLoginBarHtml({ platformId: 'weixin', signedInAtOpen: true });
  assert.match(html, /微信公众号/);
  assert.match(html, />已登录</);
  assert.ok(!html.includes('>完成<'));
  assert.ok(!html.includes('>登录完成<'));
});

test('未知平台名会被转义，不会注入脚本', () => {
  assert.equal(loginWindowName('<img onerror=x>' as never), '&lt;img onerror=x&gt;');
});

test('登录状态变化：未登录打开 → 检测到登录后自动关闭；已登录打开不自动关', () => {
  assert.deepEqual(nextLoginBarAction({ signedInAtOpen: false, signedIn: true, trigger: 'cookie' }), { close: true, status: '登录成功，正在返回…' });
  assert.deepEqual(nextLoginBarAction({ signedInAtOpen: false, signedIn: false, trigger: 'cookie' }), { close: false, status: null });
  assert.deepEqual(nextLoginBarAction({ signedInAtOpen: true, signedIn: true, trigger: 'cookie' }), { close: false, status: null });
});

test('点「登录完成」：已登录就关闭，否则提示继续登录', () => {
  assert.deepEqual(nextLoginBarAction({ signedInAtOpen: false, signedIn: true, trigger: 'done' }), { close: true, status: '登录成功，正在返回…' });
  assert.deepEqual(nextLoginBarAction({ signedInAtOpen: false, signedIn: false, trigger: 'done' }), {
    close: false,
    status: '还没检测到登录，请在下方页面完成登录',
  });
  assert.deepEqual(nextLoginBarAction({ signedInAtOpen: true, signedIn: false, trigger: 'done' }), { close: true, status: null });
});

test('顶栏配色跟随 app 内主题，不跟随系统 prefers-color-scheme', () => {
  const dark = buildLoginBarHtml({
    platformId: 'juejin',
    signedInAtOpen: false,
    appTheme: { themeId: 'bloom-ink-dark', tokens: { surface: '#232428', ink: '#e6e8eb', primary: '#7f91a8' } },
  });
  assert.ok(!dark.includes('prefers-color-scheme'));
  assert.match(dark, /color-scheme:dark/);
  assert.match(dark, /--bg:#232428/);
  assert.match(dark, /--primary:#7f91a8/);
  const light = buildLoginBarHtml({ platformId: 'juejin', signedInAtOpen: false, appTheme: { themeId: 'apple-light' } });
  assert.match(light, /color-scheme:light/);
  assert.match(light, /--bg:#fafafa/);
});

test('app 主题读取失败或值可疑时回落到对应深浅的默认色，不能注入 CSS', () => {
  assert.equal(resolveLoginBarTheme(null).scheme, 'light');
  assert.equal(resolveLoginBarTheme({ themeId: 'bloom-mist-dark' }).scheme, 'dark');
  assert.equal(resolveLoginBarTheme({ themeId: 'custom-typora' }).scheme, 'light');
  const t = resolveLoginBarTheme({ themeId: 'bloom-ink-dark', tokens: { surface: 'red}body{background:url(x)', ink: 42 } });
  assert.equal(t.tokens.surface, '#1a1c1f');
  assert.equal(t.tokens.ink, '#dde1e6');
  const html = buildLoginBarHtml({ platformId: 'juejin', signedInAtOpen: false, appTheme: { tokens: { surface: '</style><script>' } } });
  assert.ok(!html.includes('<script>'));
});

test('parseLoginBarActionUrl 同时识别标题协议 vmark-nav:// 与旧式 data: 页内 hash', () => {
  assert.equal(parseLoginBarActionUrl('vmark-nav://back:1'), 'back');
  assert.equal(parseLoginBarActionUrl('vmark-nav://reload:2'), 'reload');
  assert.equal(parseLoginBarActionUrl('vmark-nav://done:3'), 'done');
  assert.equal(parseLoginBarActionUrl('vmark-nav://close:4'), 'close');
  assert.equal(parseLoginBarActionUrl('data:text/html,abc#vmark-nav://back:1700000001'), 'back');
  assert.equal(parseLoginBarActionUrl('data:text/html,abc#vmark-nav://reload:1700000002'), 'reload');
  assert.equal(parseLoginBarActionUrl('data:text/html,abc#vmark-nav://done:1700000003'), 'done');
  assert.equal(parseLoginBarActionUrl('data:text/html,abc#vmark-nav://close:1700000004'), 'close');
  assert.equal(parseLoginBarActionUrl('vmark-nav://done'), 'done');
  assert.equal(parseLoginBarActionUrl('https://mp.weixin.qq.com/'), null);
});
