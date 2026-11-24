import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

/**
 * 凭据加密第二部分（docs/TODO.md 第 10 项）：
 * 1. 渲染进程拿不到图床凭据明文（getImageBedConfig 只给非密钥字段），
 *    渲染层把不含密钥的配置存回 / 拿去测试上传时，主进程用已保存的密钥补齐，不会把密钥清掉。
 * 2. 平台登录 Cookie / 会话由内置浏览器（Chromium 分区）保存，加密同样依赖系统钥匙串；
 *    钥匙串不可用时打开登录窗口前明确提示一次。
 * 跑真实的 registerImageConfigIpc 与 readAppConfig / writeAppConfig，Electron 由 tests/support/electronStub.mjs 假实现。
 */
register('./support/electronStubLoader.mjs', import.meta.url);
const { readAppConfig, writeAppConfig, noticeSessionCredentialStorage } = await import('../src/main/ipc/context.ts');
const { registerImageConfigIpc } = await import('../src/main/ipc/image-config/index.ts');
const { DEFAULT_CONFIG, resolveSafePath, recordRecentWorkspace } = await import('../src/main/ipc/pathUtils.ts');
const { IPC_INVOKE_CHANNELS } = await import('@vcat/shared');
const { registry } = (await import('./support/electronStub.mjs')) as {
  registry: {
    paths: Record<string, string>;
    safeStorage: { available: boolean; backend: string; failEncrypt: boolean; failDecrypt: boolean };
    dialogs: Array<{ message?: string; detail?: string }>;
  };
};

const SECRETS = { token: 'ghp_RENDERERTOKEN_5a6b', accessKey: 'AKID_RENDERERAK_77', secretKey: 'SK_RENDERERSK_zz' };
const SECRET_VALUES = Object.values(SECRETS);

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function setup() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-cred-r-ud-'));
  Object.assign(registry.paths, { userData, documents: fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-cred-r-doc-')) });
  Object.assign(registry.safeStorage, { available: true, backend: 'gnome_libsecret', failEncrypt: false, failDecrypt: false });
  registry.dialogs.length = 0;
  const handlers = new Map<string, Handler>();
  const ipcMain = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn), on() {} };
  registerImageConfigIpc({
    ipcMain: ipcMain as unknown as Electron.IpcMain,
    getMainWindow: () => null,
    sendMenuAction: () => undefined,
    buildApplicationMenu: () => undefined,
    readAppConfig,
    writeAppConfig,
    recordRecentWorkspace,
    resolveSafePath,
  });
  const invoke = (channel: string, ...args: unknown[]) => {
    const fn = handlers.get(channel);
    assert.ok(fn, `未注册 ${channel}`);
    return Promise.resolve(fn({}, ...args));
  };
  return { file: path.join(userData, 'vcat-config.json'), invoke };
}

function assertNoSecretIn(text: string, where: string): void {
  for (const s of SECRET_VALUES) assert.ok(!text.includes(s), `${where} 里出现了明文凭据 ${s.slice(0, 6)}…`);
}

test('getImageBedConfig 只给渲染进程非密钥字段：Token/AK/SK 不出主进程', async () => {
  const env = setup();
  await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a', imageBed: { strategy: 'custom_oss', provider: 's3', bucket: 'pics', ...SECRETS } });
  const toRenderer = await env.invoke(IPC_INVOKE_CHANNELS.getImageBedConfig);
  assertNoSecretIn(JSON.stringify(toRenderer), '发给渲染进程的图床配置');
  assert.deepEqual(toRenderer, { strategy: 'custom_oss', provider: 's3', bucket: 'pics' });
});

test('渲染层把不含密钥的配置存回（如只改图片比例）：已保存的密钥原样保留', async () => {
  const env = setup();
  await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a', imageBed: { strategy: 'custom_oss', provider: 's3', bucket: 'pics', ...SECRETS } });
  const fromRenderer = (await env.invoke(IPC_INVOKE_CHANNELS.getImageBedConfig)) as Record<string, unknown>;
  await env.invoke(IPC_INVOKE_CHANNELS.saveImageBedConfig, { ...fromRenderer, defaultImageScale: 75 });
  const cfg = await readAppConfig();
  assert.equal(cfg.imageBed.defaultImageScale, 75);
  assert.equal(cfg.imageBed.token, SECRETS.token);
  assert.equal(cfg.imageBed.accessKey, SECRETS.accessKey);
  assert.equal(cfg.imageBed.secretKey, SECRETS.secretKey);
  assertNoSecretIn(fs.readFileSync(env.file, 'utf8'), '配置文件');
});

test('渲染层显式清空（空字符串）某个密钥：真的删掉', async () => {
  const env = setup();
  await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a', imageBed: { strategy: 'custom_oss', provider: 'smms', ...SECRETS } });
  await env.invoke(IPC_INVOKE_CHANNELS.saveImageBedConfig, { strategy: 'custom_oss', provider: 'smms', token: '' });
  const cfg = await readAppConfig();
  assert.equal(cfg.imageBed.token, undefined);
  assert.equal(cfg.imageBed.secretKey, SECRETS.secretKey);
});

test('测试上传：渲染层传来的配置不含密钥时用已保存的密钥补齐', async () => {
  const env = setup();
  await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a', imageBed: { strategy: 'custom_oss', provider: 's3', bucket: 'pics', ...SECRETS } });
  const fromRenderer = await env.invoke(IPC_INVOKE_CHANNELS.getImageBedConfig);
  const res = (await env.invoke(IPC_INVOKE_CHANNELS.testImageBedUpload, fromRenderer)) as { ok: boolean; message: string };
  assert.equal(res.ok, true, res.message);
  assertNoSecretIn(JSON.stringify(res), '返回给渲染进程的测试结果');
});

test('平台登录会话：钥匙串可用时不提示', async () => {
  setup();
  await noticeSessionCredentialStorage();
  assert.equal(registry.dialogs.length, 0);
});

test('平台登录会话：钥匙串不可用时打开登录窗口前明确提示 Cookie 只能弱保护，同一次运行只提示一次', async () => {
  setup();
  registry.safeStorage.available = false;
  await noticeSessionCredentialStorage();
  await noticeSessionCredentialStorage();
  assert.equal(registry.dialogs.length, 1);
  const text = `${registry.dialogs[0].message} ${registry.dialogs[0].detail}`;
  assert.match(text, /钥匙串/);
  assert.match(text, /Cookie|登录/);
});
