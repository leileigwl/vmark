import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { PlatformId } from '@vcat/shared';

export interface PlatformAccountRecord {
  platformId: PlatformId;
  accountId?: string;
  accountName?: string;
  avatarUrl?: string;
  authorized: boolean;
  lastCheckedAt: number;
  lastSuccessAt?: number;
  statusMessage: string;
}

export type AccountDatabase = Record<string, PlatformAccountRecord>;

function getAccountStorePath(): string {
  return path.join(app.getPath('userData'), 'platform_accounts.json');
}

/** Reads all persistent platform account records from disk. */
export async function readAccountDatabase(): Promise<AccountDatabase> {
  try {
    const raw = await fs.readFile(getAccountStorePath(), 'utf-8');
    return JSON.parse(raw) as AccountDatabase;
  } catch {
    return {};
  }
}

/** Saves all platform account records to disk atomically. */
export async function writeAccountDatabase(db: AccountDatabase): Promise<void> {
  const targetPath = getAccountStorePath();
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${targetPath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2), 'utf-8');
  await fs.rename(tempPath, targetPath);
}

/** Upserts a single platform account record. */
export async function upsertAccountRecord(
  platformId: PlatformId,
  patch: Partial<PlatformAccountRecord>
): Promise<PlatformAccountRecord> {
  const db = await readAccountDatabase();
  const existing = db[platformId] || {
    platformId,
    authorized: false,
    lastCheckedAt: Date.now(),
    statusMessage: '未授权',
  };

  const updated: PlatformAccountRecord = {
    ...existing,
    ...patch,
    platformId,
    lastCheckedAt: Date.now(),
    lastSuccessAt: patch.authorized ? Date.now() : existing.lastSuccessAt,
  };

  db[platformId] = updated;
  await writeAccountDatabase(db);
  return updated;
}

/** Batch updates authorization states from a heartbeat check. */
export async function batchSyncHeartbeatResults(
  states: Partial<Record<PlatformId, boolean>>,
  messageMap: Partial<Record<PlatformId, string>> = {}
): Promise<AccountDatabase> {
  const db = await readAccountDatabase();
  const now = Date.now();

  for (const [pid, authed] of Object.entries(states) as [PlatformId, boolean][]) {
    const prev = db[pid] || {
      platformId: pid,
      authorized: false,
      lastCheckedAt: now,
      statusMessage: '待检测',
    };

    const isAuthed = Boolean(authed);
    db[pid] = {
      ...prev,
      authorized: isAuthed,
      lastCheckedAt: now,
      lastSuccessAt: isAuthed ? now : prev.lastSuccessAt,
      statusMessage: messageMap[pid] ?? (isAuthed ? '会话有效（心跳正常）' : '未授权或会话已失效'),
    };
  }

  await writeAccountDatabase(db);
  return db;
}
