/**
 * 图床凭据（Token / AccessKey / SecretKey）的落盘格式。纯函数，不依赖 Electron，方便单测。
 * 磁盘上：imageBed 里不再有这三个字段，密文放在顶层 `secureSecrets.imageBed.<字段>`（base64）。
 * 旧版本留下的明文字段读取时照常可用，并由 configStore 迁移为密文。
 */
export const SECRET_FIELDS = ['token', 'accessKey', 'secretKey'] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

/** 系统钥匙串的加解密能力；不可用时带上原因（只写原因，绝不写凭据）。 */
export type SecretCipher =
  | { available: true; encrypt: (plain: string) => string; decrypt: (stored: string) => string }
  | { available: false; reason: string };

export type RawConfig = Record<string, unknown>;
type SecretMap = Partial<Record<SecretField, string>>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function rawImageBed(raw: RawConfig): Record<string, unknown> {
  return isObject(raw.imageBed) ? raw.imageBed : {};
}

function rawEncrypted(raw: RawConfig): SecretMap {
  const box = raw.secureSecrets;
  if (!isObject(box) || !isObject(box.imageBed)) return {};
  const out: SecretMap = {};
  for (const f of SECRET_FIELDS) {
    const v = box.imageBed[f];
    if (typeof v === 'string' && v) out[f] = v;
  }
  return out;
}

function plainValue(raw: RawConfig, f: SecretField): string | undefined {
  const v = rawImageBed(raw)[f];
  return typeof v === 'string' && v ? v : undefined;
}

export interface DecodeResult {
  /** 磁盘内容，凭据已解密回 imageBed（解不开的字段缺省）。 */
  config: RawConfig;
  /** 磁盘上还是明文的字段（需要迁移）。 */
  legacyPlain: SecretField[];
  /** 有密文但解不开的字段（密文必须原样保留）。 */
  undecryptable: SecretField[];
}

/** 读盘：明文优先（旧版本或降级时写入的更新），否则解密密文。 */
export function decodeSecrets(raw: RawConfig, cipher: SecretCipher): DecodeResult {
  const encrypted = rawEncrypted(raw);
  const imageBed: Record<string, unknown> = { ...rawImageBed(raw) };
  const legacyPlain: SecretField[] = [];
  const undecryptable: SecretField[] = [];
  for (const f of SECRET_FIELDS) {
    if (plainValue(raw, f)) {
      legacyPlain.push(f);
      continue;
    }
    delete imageBed[f];
    const blob = encrypted[f];
    if (!blob) continue;
    if (!cipher.available) {
      undecryptable.push(f);
      continue;
    }
    try {
      imageBed[f] = cipher.decrypt(blob);
    } catch {
      undecryptable.push(f);
    }
  }
  const { secureSecrets: _drop, ...rest } = raw;
  return { config: { ...rest, imageBed }, legacyPlain, undecryptable };
}

export interface EncodeResult {
  raw: RawConfig;
  /** 钥匙串不可用（或这次加密失败）、只能留在本次运行内存里的新值。 */
  memoryOnly: SecretMap;
  /** 钥匙串可用但加密/回读校验失败的字段。 */
  failed: SecretField[];
}

/**
 * 写盘：`config` 是要保存的完整配置（凭据为明文，含读盘时带出的未知字段）；`previous` 是当前磁盘内容，
 * 用来保留解不开的密文和不可用时的旧明文。规则（每个字段）：
 * - 值为 ''：用户清除，删掉磁盘上的明文和密文。
 * - 值缺省：磁盘上原有的（多半是解不开的密文）原样保留。
 * - 有值且钥匙串可用：加密并回读校验，磁盘只留密文。
 * - 有值但钥匙串不可用或加密失败：磁盘上原有的原样保留（旧明文不删）；与旧明文不同的新值只进内存。
 */
export function encodeSecrets(config: RawConfig, previous: RawConfig, cipher: SecretCipher): EncodeResult {
  const prevEncrypted = rawEncrypted(previous);
  const wanted = isObject(config.imageBed) ? config.imageBed : {};
  const imageBed: Record<string, unknown> = { ...wanted };
  const encrypted: SecretMap = {};
  const memoryOnly: SecretMap = {};
  const failed: SecretField[] = [];
  for (const f of SECRET_FIELDS) {
    delete imageBed[f];
    const value = wanted[f];
    const prevPlain = plainValue(previous, f);
    const keepPrevious = () => {
      if (prevPlain) imageBed[f] = prevPlain;
      if (prevEncrypted[f]) encrypted[f] = prevEncrypted[f];
    };
    if (value === '') continue;
    if (typeof value !== 'string') {
      keepPrevious();
      continue;
    }
    const blob = cipher.available ? tryEncrypt(cipher, value) : null;
    if (blob) {
      encrypted[f] = blob;
      continue;
    }
    if (cipher.available) failed.push(f);
    keepPrevious();
    if (value !== prevPlain) memoryOnly[f] = value;
  }
  const { secureSecrets: _cfg, ...cfgRest } = config;
  const raw: RawConfig = { ...cfgRest, imageBed };
  if (Object.keys(encrypted).length > 0) raw.secureSecrets = { v: 1, imageBed: encrypted };
  return { raw, memoryOnly, failed };
}

/** 加密并回读校验；任何异常或校验不一致都返回 null（调用方保留旧数据，不抛给保存流程）。 */
function tryEncrypt(cipher: Extract<SecretCipher, { available: true }>, value: string): string | null {
  try {
    const blob = cipher.encrypt(value);
    return cipher.decrypt(blob) === value ? blob : null;
  } catch {
    return null;
  }
}

type WithSecrets = Partial<Record<SecretField, string>>;

/** 发给渲染进程的图床配置：去掉 Token / AccessKey / SecretKey，渲染进程只拿非密钥字段。 */
export function stripSecrets<T extends WithSecrets>(imageBed: T): T {
  const out: T = { ...imageBed };
  for (const f of SECRET_FIELDS) delete out[f];
  return out;
}

/**
 * 渲染进程传回来的图床配置不含密钥（见 stripSecrets）：缺省的密钥用主进程已保存的补齐；
 * 渲染层显式给了值（含 '' 表示清除）则以渲染层为准。
 */
export function fillStoredSecrets<T extends WithSecrets>(incoming: T, stored: WithSecrets): T {
  const out: T = { ...incoming };
  for (const f of SECRET_FIELDS) {
    const saved = stored[f];
    if (out[f] === undefined && typeof saved === 'string') out[f] = saved as T[typeof f];
  }
  return out;
}
