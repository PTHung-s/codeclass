import { PrismaClient } from "@prisma/client";
import { setQueueDepth } from "./metrics";
import { pythonQueuePosition } from "./pythonRunner";
import { cppQueuePosition } from "./cppRunner";

/**
 * SQLite has exactly one writer. Prisma's default pool opens several
 * connections, so the app competed with itself: two pooled connections both
 * trying to write meant one waited on a lock it could not see until Prisma gave
 * up with P1008 ("Socket timeout"). That surfaced as HTTP 500 on
 * /attendance/start and /tracking/heartbeat while CPU sat near idle.
 *
 * Pinning the pool to one connection serialises writes inside the process
 * instead, which is what SQLite wants anyway. Only applied to file: URLs so a
 * later move to Postgres is unaffected.
 */
function tunedSqliteUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return undefined;
  if (url.includes("connection_limit")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

const tunedUrl = tunedSqliteUrl();

const prisma = tunedUrl
  ? new PrismaClient({ datasources: { db: { url: tunedUrl } } })
  : new PrismaClient();

// Every second, sync the live queue depth (students waiting to run code) into
// the metrics module so the admin monitor sees it without a circular import.
setInterval(() => {
  try {
    setQueueDepth(pythonQueuePosition() + cppQueuePosition());
  } catch {
    /* non-fatal */
  }
}, 1000);

/**
 * The database shipped in journal_mode=DELETE, where a writer locks the whole
 * file and readers block until it finishes. With a class online — presence
 * heartbeats every 30s, recording snapshots, mastery recalcs, attendance —
 * writes queued behind each other and timed out.
 *
 * WAL lets readers continue during a write and shortens the writer's lock
 * window. busy_timeout is set FIRST because switching journal mode needs a
 * brief exclusive lock, and with the default timeout of 0 that attempt fails
 * instantly with "database is locked" if anything else is mid-write — which is
 * exactly what happened on the first attempt at this fix.
 *
 * journal_mode persists in the file header, so this is effectively a one-time
 * migration; it is re-applied every boot so a restored backup or a fresh volume
 * is not silently left on DELETE.
 */
async function configureSqlite(): Promise<void> {
  if (!tunedUrl) return;

  // These go through $queryRawUnsafe, not $executeRawUnsafe: a PRAGMA that sets
  // a value also RETURNS it, and Prisma rejects a returning statement on the
  // execute path with "Execute returned results, which is not allowed in SQLite".
  try {
    // Per-connection, and the precondition for the journal_mode switch below.
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 10000");
  } catch (err) {
    console.error("[sqlite] could not set busy_timeout:", err);
  }

  // Boot-time writes (skill graph sync, recording reconcile) can hold the lock,
  // so retry instead of leaving the database on DELETE for the whole run.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
      await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
      const rows = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
      const mode = String(rows[0]?.journal_mode ?? "unknown");
      if (mode.toLowerCase() === "wal") {
        console.log(`[sqlite] journal_mode=wal, busy_timeout=10000ms, connection_limit=1`);
        return;
      }
      if (attempt === 5) console.error(`[sqlite] journal_mode is still ${mode} after 5 attempts`);
    } catch (err) {
      // Never block boot on tuning: the app still runs on the old settings.
      if (attempt === 5) console.error("[sqlite] could not enable WAL after 5 attempts:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

void configureSqlite();

export default prisma;
