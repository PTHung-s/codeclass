import fs from "fs";
import path from "path";
import prisma from "../utils/prisma";

export const MAX_BACKUPS = 7;
export const BACKUP_FILENAME_RE = /^codeclass-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/;

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export function isSafeBackupFilename(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  if (path.basename(filename) !== filename) return false;
  return BACKUP_FILENAME_RE.test(filename);
}

/**
 * Pure helper: given a list of backup filenames sorted newest -> oldest,
 * returns the subset that exceed `keepCount` and should be unlinked.
 */
export function selectBackupsToPrune(
  entries: Array<{ filename: string; mtimeMs: number }>,
  keepCount: number = MAX_BACKUPS,
): string[] {
  const valid = entries.filter((e) => isSafeBackupFilename(e.filename));
  const sorted = [...valid].sort((a, b) => b.mtimeMs - a.mtimeMs || b.filename.localeCompare(a.filename));
  return sorted.slice(Math.max(0, keepCount)).map((e) => e.filename);
}

export function resolveSqliteDbPath(): string {
  const rawUrl = process.env.DATABASE_URL || "file:./dev.db";
  let filePart = rawUrl.startsWith("file:") ? rawUrl.slice("file:".length) : rawUrl;
  const qIdx = filePart.indexOf("?");
  if (qIdx >= 0) filePart = filePart.slice(0, qIdx);
  if (path.isAbsolute(filePart)) return path.normalize(filePart);
  return path.resolve(__dirname, "../../prisma", filePart);
}

export function resolveBackupDir(): string {
  return path.join(path.dirname(resolveSqliteDbPath()), "backups");
}

function formatVnBackupTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}-${get("second")}`;
}

async function pruneOldBackups(backupDir: string, keepCount = MAX_BACKUPS): Promise<string[]> {
  if (!fs.existsSync(backupDir)) return [];
  const names = await fs.promises.readdir(backupDir);
  const validEntries: Array<{ filename: string; mtimeMs: number }> = [];
  for (const name of names) {
    if (!isSafeBackupFilename(name)) continue;
    const st = await fs.promises.stat(path.join(backupDir, name)).catch(() => null);
    if (st && st.isFile()) {
      validEntries.push({ filename: name, mtimeMs: st.mtimeMs });
    }
  }
  const toDelete = selectBackupsToPrune(validEntries, keepCount);
  for (const name of toDelete) {
    await fs.promises.unlink(path.join(backupDir, name)).catch(() => {});
  }
  return toDelete;
}

let activeBackupPromise: Promise<{ filename: string; sizeBytes: number; createdAt: string; reason: string }> | null = null;

export async function createDatabaseBackup(
  reason: "manual" | "scheduled" = "manual",
): Promise<{ filename: string; sizeBytes: number; createdAt: string; reason: string }> {
  if (activeBackupPromise) return activeBackupPromise;

  activeBackupPromise = (async () => {
    const backupDir = resolveBackupDir();
    await fs.promises.mkdir(backupDir, { recursive: true });

    const filename = `codeclass-backup-${formatVnBackupTimestamp(new Date())}.db`;
    if (!isSafeBackupFilename(filename)) {
      throw new Error("Generated backup filename failed safety check");
    }
    const targetPath = path.join(backupDir, filename);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }

    const safeSqlPath = targetPath.replace(/\\/g, "/").replace(/'/g, "''");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${safeSqlPath}'`);

    const stat = await fs.promises.stat(targetPath);
    await pruneOldBackups(backupDir, MAX_BACKUPS);

    return {
      filename,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      reason,
    };
  })().finally(() => {
    activeBackupPromise = null;
  });

  return activeBackupPromise;
}

export async function listDatabaseBackups(): Promise<{
  dbSizeBytes: number;
  maxBackups: number;
  backups: BackupEntry[];
}> {
  const dbPath = resolveSqliteDbPath();
  const backupDir = resolveBackupDir();
  const dbStat = await fs.promises.stat(dbPath).catch(() => null);
  const dbSizeBytes = dbStat?.size ?? 0;

  if (!fs.existsSync(backupDir)) {
    return { dbSizeBytes, maxBackups: MAX_BACKUPS, backups: [] };
  }

  const names = await fs.promises.readdir(backupDir);
  const list: Array<BackupEntry & { mtimeMs: number }> = [];
  for (const name of names) {
    if (!isSafeBackupFilename(name)) continue;
    const st = await fs.promises.stat(path.join(backupDir, name)).catch(() => null);
    if (st && st.isFile()) {
      list.push({
        filename: name,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
        mtimeMs: st.mtimeMs,
      });
    }
  }
  list.sort((a, b) => b.mtimeMs - a.mtimeMs || b.filename.localeCompare(a.filename));

  return {
    dbSizeBytes,
    maxBackups: MAX_BACKUPS,
    backups: list.map(({ filename, sizeBytes, createdAt }) => ({ filename, sizeBytes, createdAt })),
  };
}

export async function getValidatedBackupPath(filename: string): Promise<string | null> {
  if (!isSafeBackupFilename(filename)) return null;
  const backupDir = resolveBackupDir();
  const fullPath = path.resolve(backupDir, filename);
  if (!fullPath.startsWith(path.resolve(backupDir) + path.sep)) return null;
  const st = await fs.promises.stat(fullPath).catch(() => null);
  if (!st || !st.isFile()) return null;
  return fullPath;
}

async function runDailyBackupIfStale() {
  const { backups } = await listDatabaseBackups();
  const newest = backups[0];
  const ageMs = newest ? Date.now() - new Date(newest.createdAt).getTime() : Infinity;
  if (ageMs >= 24 * 60 * 60 * 1000) {
    await createDatabaseBackup("scheduled");
  }
}

export function scheduleDailyDatabaseBackups() {
  const startupTimer = setTimeout(() => {
    void runDailyBackupIfStale().catch((err) => {
      console.error("[Backup] Scheduled startup backup check failed:", err);
    });
  }, 60_000);
  startupTimer.unref();

  const intervalTimer = setInterval(() => {
    void runDailyBackupIfStale().catch((err) => {
      console.error("[Backup] Scheduled daily backup failed:", err);
    });
  }, 30 * 60_000);
  intervalTimer.unref();
}
