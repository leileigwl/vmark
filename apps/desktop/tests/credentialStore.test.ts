import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

/**
 * 凭据加密（docs/TODO.md 第 10 项）：图床 Token / AccessKey / SecretKey 只能经系统钥匙串
 * （Electron safeStorage）加密后落盘。测试直接跑真实的 readAppConfig / writeAppConfig，
 * Electron 的 app / safeStorage / dialog 由 tests/support/electronStub.mjs 假实现并由测试控制。
 */
register('./support/electronStubLoader.mjs', import.meta.url);
const { readAppConfig, writeAppConfig } = await import('../src/main/ipc/context.ts');
const { DEFAULT_CONFIG } = await import('../src/main/ipc/pathUtils.ts');
const { registry } = (await import('./support/electronStub.mjs')) as {
  registry: {
    paths: Record<string, string>;
    safeStorage: { available: boolean; backend: string; failEncrypt: boolean; failDecrypt: boolean };
    dialogs: Array<{ message?: string; detail?: string }>;
  };
};

const SECRETS = { token: 'ghp_PLAINTOKEN_9f8e7d', accessKey: 'AKID_PLAINAK_1234', secretKey: 'SK_PLAINSK_abcd' };
const SECRET_VALUES = Object.values(SECRETS);

type Env = { file: string; logs: string[]; restore: () => void };

/** 每个用例一个新的 userData 目录；钥匙串默认可用；收集主进程的所有日志输出。 */
function setup(raw?: unknown): Env {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-cred-ud-'));
  Object.assign(registry.paths, { userData, documents: fs.mkdtempSync(path.join(os.tmpdir(), 'vmark-cred-doc-')) });
  Object.assign(registry.safeStorage, { available: true, backend: 'gnome_libsecret', failEncrypt: false, failDecrypt: false });
  registry.dialogs.length = 0;
  const file = path.join(userData, 'vcat-config.json');
  if (raw !== undefined) fs.writeFileSync(file, JSON.stringify(raw, null, 2), 'utf8');
  const logs: string[] = [];
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of ['log', 'info', 'warn', 'error'] as const) {
    console[k] = (...args: unknown[]) => logs.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '));
  }
  return { file, logs, restore: () => Object.assign(console, saved) };
}

function legacyConfig() {
  return {
    workspacePath: '/ws/blog',
    recentWorkspaces: ['/ws/blog', '/ws/old'],
    imageBed: { strategy: 'custom_oss', provider: 'github', repo: 'me/pics', branch: 'main', ...SECRETS },
    startup: { mode: 'specific_dir', defaultDir: '/ws/blog' },
    futureKey: { keep: true },
  };
}

function assertNoSecretIn(text: string, where: string): void {
  for (const s of SECRET_VALUES) assert.ok(!text.includes(s), `${where} 里出现了明文凭据 ${s.slice(0, 6)}…`);
}

test('保存含 Token/AK/SK 的图床配置：磁盘原文没有明文，读回是原值，非密钥字段照常保存', async () => {
  const env = setup();
  try {
    await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a', imageBed: { strategy: 'custom_oss', provider: 'github', repo: 'me/pics', ...SECRETS } });
    const disk = fs.readFileSync(env.file, 'utf8');
    assertNoSecretIn(disk, '配置文件');
    assert.equal(JSON.parse(disk).imageBed.repo, 'me/pics');
    const cfg = await readAppConfig();
    assert.equal(cfg.imageBed.token, SECRETS.token);
    assert.equal(cfg.imageBed.accessKey, SECRETS.accessKey);
    assert.equal(cfg.imageBed.secretKey, SECRETS.secretKey);
    assertNoSecretIn(env.logs.join('\n'), '日志');
  } finally {
    env.restore();
  }
});

test('旧版明文配置：首次读取能读出，并自动迁移为加密，其他设置（含未知字段）一个不丢', async () => {
  const env = setup(legacyConfig());
  try {
    const cfg = await readAppConfig();
    assert.equal(cfg.imageBed.token, SECRETS.token);
    assert.equal(cfg.imageBed.secretKey, SECRETS.secretKey);
    const disk = fs.readFileSync(env.file, 'utf8');
    assertNoSecretIn(disk, '迁移后的配置文件');
    const parsed = JSON.parse(disk);
    const { imageBed: _ib, ...legacyRest } = legacyConfig();
    const { imageBed, secureSecrets: _ss, ...parsedRest } = parsed;
    assert.deepEqual(parsedRest, legacyRest);
    assert.deepEqual(imageBed, { strategy: 'custom_oss', provider: 'github', repo: 'me/pics', branch: 'main' });
    const again = await readAppConfig();
    assert.equal(again.imageBed.accessKey, SECRETS.accessKey);
    assert.equal(registry.dialogs.length, 0, '能加密时不应弹降级提示');
    assertNoSecretIn(env.logs.join('\n'), '日志');
  } finally {
    env.restore();
  }
});

test('配置文件损坏（JSON 不合法）：日志不带文件片段里的凭据', async () => {
  const env = setup();
  try {
    fs.writeFileSync(env.file, `{"imageBed":{"token":"${SECRETS.token}"`, 'utf8');
    await readAppConfig();
    await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a' });
    assert.match(env.logs.join('\n'), /JSON/);
    assertNoSecretIn(env.logs.join('\n'), '日志');
  } finally {
    env.restore();
  }
});

test('迁移失败（加密抛错）：旧文件逐字节不变、明文仍可读出使用，日志说明失败但不含凭据', async () => {
  const env = setup(legacyConfig());
  try {
    registry.safeStorage.failEncrypt = true;
    const before = fs.readFileSync(env.file);
    const cfg = await readAppConfig();
    assert.equal(cfg.imageBed.token, SECRETS.token);
    assert.deepEqual(fs.readFileSync(env.file), before);
    assert.deepEqual(fs.readdirSync(path.dirname(env.file)), ['vcat-config.json'], '不能留下临时文件');
    assert.match(env.logs.join('\n'), /迁移/);
    assertNoSecretIn(env.logs.join('\n'), '日志');
  } finally {
    env.restore();
  }
});

test('钥匙串不可用：旧明文不删不改且能用；弹一次界面提示，日志有提示且不含凭据', async () => {
  const env = setup(legacyConfig());
  try {
    registry.safeStorage.available = false;
    const before = fs.readFileSync(env.file);
    const cfg = await readAppConfig();
    await readAppConfig();
    assert.equal(cfg.imageBed.token, SECRETS.token);
    assert.equal(cfg.imageBed.accessKey, SECRETS.accessKey);
    assert.deepEqual(fs.readFileSync(env.file), before);
    assert.equal(registry.dialogs.length, 1, '同一次运行只提示一次');
    assert.match(`${registry.dialogs[0].message} ${registry.dialogs[0].detail}`, /钥匙串/);
    assert.match(env.logs.join('\n'), /钥匙串/);
    assertNoSecretIn(env.logs.join('\n') + JSON.stringify(registry.dialogs), '日志/提示');
  } finally {
    env.restore();
  }
});

test('Linux 只有 basic_text（没有 keyring）视为不可用：不迁移、明确提示', async () => {
  const env = setup(legacyConfig());
  const realPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux' });
  try {
    registry.safeStorage.backend = 'basic_text';
    const before = fs.readFileSync(env.file);
    const cfg = await readAppConfig();
    assert.equal(cfg.imageBed.token, SECRETS.token);
    assert.deepEqual(fs.readFileSync(env.file), before);
    assert.equal(registry.dialogs.length, 1);
    assert.match(env.logs.join('\n'), /basic_text/);
  } finally {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    env.restore();
  }
});

test('钥匙串不可用时填入新 Token：不写进磁盘，本次运行内存里可用，并提示重启后要重填', async () => {
  const env = setup({ ...legacyConfig(), imageBed: { strategy: 'custom_oss', provider: 'smms' } });
  try {
    registry.safeStorage.available = false;
    const cfg = await readAppConfig();
    cfg.imageBed = { ...cfg.imageBed, token: SECRETS.token };
    await writeAppConfig(cfg);
    assertNoSecretIn(fs.readFileSync(env.file, 'utf8'), '配置文件');
    assert.equal((await readAppConfig()).imageBed.token, SECRETS.token);
    assert.ok(registry.dialogs.some((d) => /重启|重新填写/.test(`${d.message} ${d.detail}`)));
    assertNoSecretIn(env.logs.join('\n'), '日志');
  } finally {
    env.restore();
  }
});

test('钥匙串可用但加密新 Token 失败：其他设置照常保存，新 Token 不落盘只在内存，并提示', async () => {
  const env = setup({ ...legacyConfig(), imageBed: { strategy: 'custom_oss', provider: 'smms' } });
  try {
    const cfg = await readAppConfig();
    registry.safeStorage.failEncrypt = true;
    await writeAppConfig({ ...cfg, workspacePath: '/ws/new', imageBed: { ...cfg.imageBed, token: SECRETS.token } });
    const disk = fs.readFileSync(env.file, 'utf8');
    assertNoSecretIn(disk, '配置文件');
    assert.equal(JSON.parse(disk).workspacePath, '/ws/new');
    assert.equal((await readAppConfig()).imageBed.token, SECRETS.token);
    assert.equal(registry.dialogs.length, 1);
    assertNoSecretIn(env.logs.join('\n'), '日志');
  } finally {
    env.restore();
  }
});

test('已加密但解密失败（拒绝钥匙串授权）：不报假值、提示用户；改其他设置后密文原样保留，授权恢复后能读回', async () => {
  const env = setup();
  try {
    await writeAppConfig({ ...DEFAULT_CONFIG, workspacePath: '/ws/a', imageBed: { strategy: 'custom_oss', provider: 'github', ...SECRETS } });
    const encrypted = JSON.parse(fs.readFileSync(env.file, 'utf8'));
    registry.safeStorage.failDecrypt = true;
    const cfg = await readAppConfig();
    assert.equal(cfg.imageBed.token, undefined);
    assert.equal(registry.dialogs.length, 1);
    cfg.startup = { mode: 'new_file' };
    await writeAppConfig(cfg);
    const after = JSON.parse(fs.readFileSync(env.file, 'utf8'));
    assert.deepEqual(after.startup, { mode: 'new_file' });
    const { startup: _a, ...restBefore } = encrypted;
    const { startup: _b, ...restAfter } = after;
    assert.deepEqual(restAfter, restBefore, '密文和其他字段必须原样保留');
    registry.safeStorage.failDecrypt = false;
    assert.equal((await readAppConfig()).imageBed.token, SECRETS.token);
  } finally {
    env.restore();
  }
});
