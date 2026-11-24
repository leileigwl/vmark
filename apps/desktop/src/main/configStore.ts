import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeSecrets, encodeSecrets, type RawConfig, type SecretCipher, type SecretField } from './secretStore';

/** 需要让用户知道的降级情况（每种每次运行只提示一次）。 */
export type SecretNoticeKind = 'plaintext-kept' | 'memory-only' | 'undecryptable' | 'migrate-failed' | 'encrypt-failed';

export interface ConfigStoreDeps {
  filePath: string;
  getCipher: () => Promise<SecretCipher>;
  /** 主进程日志（只会收到固定文案、字段名和错误信息，绝不含凭据）。 */
  log: (message: string) => void;
  /** 界面提示（主进程弹窗）。 */
  notify: (kind: SecretNoticeKind, message: string, detail: string) => void;
}

interface StoreState {
  migrationTried: boolean;
  notified: Set<SecretNoticeKind>;
  memoryOnly: Partial<Record<SecretField, string>>;
  queue: Promise<unknown>;
}

const states = new Map<string, StoreState>();

function stateFor(filePath: string): StoreState {
  const s = states.get(filePath) ?? { migrationTried: false, notified: new Set(), memoryOnly: {}, queue: Promise.resolve() };
  states.set(filePath, s);
  return s;
}

/** 错误说明只给错误码 / 类型：JSON.parse 的报错会带上文件片段，可能含凭据，绝不能进日志。 */
export function errText(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code) return String(code);
  if (err instanceof SyntaxError) return '配置文件不是有效的 JSON';
  return err instanceof Error && err.message.startsWith('加密失败') ? err.message : '未知错误';
}

/** 先写同目录临时文件再 rename：任何一步失败，原文件逐字节不变。 */
async function writeAtomic(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf-8', mode: 0o600 });
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** 读当前磁盘内容；文件不存在返回 null，JSON 损坏照常抛出（交给调用方决定）。 */
async function readRaw(filePath: string): Promise<RawConfig | null> {
  let text: string;
  try {
    text = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(text) as RawConfig;
}

const KEYCHAIN = '系统钥匙串（macOS 钥匙串 / Windows DPAPI / Linux libsecret）';

/** 带凭据加密的配置读写。所有读写在同一个文件上串行执行，避免迁移与保存互相覆盖。 */
export function createConfigStore(deps: ConfigStoreDeps) {
  const state = stateFor(deps.filePath);

  function warn(kind: SecretNoticeKind, message: string, detail: string): void {
    if (state.notified.has(kind)) return;
    state.notified.add(kind);
    deps.log(`[secretStore] ${message} ${detail}`);
    deps.notify(kind, message, detail);
  }

  function serial<T>(op: () => Promise<T>): Promise<T> {
    const run = state.queue.then(op, op);
    state.queue = run.catch(() => undefined);
    return run;
  }

  async function migrate(raw: RawConfig, decoded: RawConfig, cipher: SecretCipher, fields: SecretField[]): Promise<void> {
    state.migrationTried = true;
    try {
      const { raw: next, failed } = encodeSecrets(decoded, raw, cipher);
      if (failed.length > 0) throw new Error(`加密失败：${failed.join(', ')}`);
      await writeAtomic(deps.filePath, JSON.stringify(next, null, 2));
      deps.log(`[secretStore] 已把 ${fields.join(', ')} 迁移为${KEYCHAIN}加密保存`);
    } catch (err) {
      warn('migrate-failed', '图床密钥迁移为加密保存失败，原配置文件未改动。',
        `原因：${errText(err)}。本次仍使用原有设置，下次启动会再试。`);
    }
  }

  /** 读配置；文件不存在返回 null（由调用方生成默认配置）。 */
  function read(): Promise<RawConfig | null> {
    return serial(async () => {
      const raw = await readRaw(deps.filePath);
      if (!raw) return null;
      const cipher = await deps.getCipher();
      const { config, legacyPlain, undecryptable } = decodeSecrets(raw, cipher);
      if (legacyPlain.length > 0 && cipher.available && !state.migrationTried) {
        await migrate(raw, config, cipher, legacyPlain);
      } else if (legacyPlain.length > 0 && !cipher.available) {
        warn('plaintext-kept', `${KEYCHAIN}不可用，图床密钥仍以明文保存在配置文件中（未删除、未改动）。`,
          `原因：${cipher.reason}。可在系统里启用钥匙串后重启 Vmark，届时会自动改为加密保存。`);
      }
      if (undecryptable.length > 0) {
        warn('undecryptable', '无法用系统钥匙串解密已保存的图床密钥，加密数据已原样保留。',
          `涉及：${undecryptable.join(', ')}。${cipher.available ? '可能拒绝了钥匙串授权，' : `原因：${cipher.reason}。`}允许访问后重启 Vmark 即可恢复，或重新填写。`);
      }
      const imageBed = { ...(config.imageBed as Record<string, unknown>), ...state.memoryOnly };
      return { ...config, imageBed };
    });
  }

  /** 写配置：凭据加密后原子写入；不可用时新凭据只留在内存并提示。 */
  function write(config: RawConfig): Promise<void> {
    return serial(async () => {
      let previous: RawConfig = {};
      try {
        previous = (await readRaw(deps.filePath)) ?? {};
      } catch (err) {
        // 旧文件损坏时照旧覆盖写（与原行为一致），但要留下日志。
        deps.log(`[secretStore] 读取旧配置失败，将直接写入新配置：${errText(err)}`);
      }
      const cipher = await deps.getCipher();
      const { raw, memoryOnly, failed } = encodeSecrets(config, previous, cipher);
      await writeAtomic(deps.filePath, JSON.stringify(raw, null, 2));
      state.memoryOnly = memoryOnly;
      const fields = Object.keys(memoryOnly);
      if (failed.length > 0) {
        warn('encrypt-failed', '用系统钥匙串加密图床密钥失败，新密钥只保存在本次运行的内存里，磁盘上原有数据未改动。',
          `涉及：${failed.join(', ')}。其他设置已正常保存；重启 Vmark 后需要重新填写。`);
      } else if (fields.length > 0 && !cipher.available) {
        warn('memory-only', `${KEYCHAIN}不可用，新填写的图床密钥只保存在本次运行的内存里，没有写入磁盘。`,
          `涉及：${fields.join(', ')}。原因：${cipher.reason}。重启 Vmark 后需要重新填写。`);
      }
    });
  }

  return { read, write };
}
