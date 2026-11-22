import assert from 'node:assert/strict';
import test from 'node:test';
import { LOGIN_BAR_HEIGHT, buildLoginBarHtml, loginWindowName, nextLoginBarAction } from '../src/main/loginWindowBar.ts';

test('顶栏：平台名、「登录完成」、关闭；不出现标签页、地址栏和技术术语', () => {
  const html = buildLoginBarHtml({ platformId: 'juejin', signedInAtOpen: false });
  assert.match(html, /稀土掘金/);
  assert.match(html, /vmark-nav:\/\/done/);
  assert.match(html, />登录完成</);
  assert.match(html, /vmark-nav:\/\/close/);
  assert.match(html, /aria-label="关闭"/);
  for (const banned of ['沙箱', 'persist:', 'Cookie', 'data-platform-tab', 'url-pill']) assert.ok(!html.includes(banned), banned);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, new RegExp(`height:${LOGIN_BAR_HEIGHT}px`));
});

test('已登录时打开（如去后台/草稿箱）按钮叫“完成”，不提示登录', () => {
  const html = buildLoginBarHtml({ platformId: 'weixin', signedInAtOpen: true });
  assert.match(html, /微信公众号/);
  assert.match(html, />完成</);
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
