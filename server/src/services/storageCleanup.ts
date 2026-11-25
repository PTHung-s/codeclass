import type { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { deleteFromR2 } from "../utils/r2";

type CleanupClient = Prisma.TransactionClient | typeof prisma;

const BATCH_SIZE = 20;
let running: Promise<void> | null = null;

function uniqueKeys(keys: Array<string | null | undefined>) {
  return [...new Set(keys.filter((key): key is string => Boolean(key?.trim())))];
}

/**
 * Add object-storage deletes to the same database transaction as the record
 * deletion. The task is retained until the object store confirms deletion.
 */
export async function enqueueStorageCleanup(client: CleanupClient, keys: Array<string | null | undefined>) {
  const now = new Date();
  await Promise.all(uniqueKeys(keys).map((storageKey) => client.storageDeletionTask.upsert({
    where: { storageKey },
    create: { storageKey, nextAttemptAt: now },
    update: { nextAttemptAt: now, lastError: null },
  })));
}

function retryAt(attempts: number) {
  // 1m, 2m, 4m … capped at 24 hours. Failed cleanup never blocks a teacher
  // from deleting content, but it can never silently disappear from the queue.
  const delayMs = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(attempts, 10));
  return new Date(Date.now() + delayMs);
}

async function processPendingStorageCleanup() {
  const tasks = await prisma.storageDeletionTask.findMany({
    where: { nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const task of tasks) {
    try {
      await deleteFromR2(task.storageKey);
      await prisma.storageDeletionTask.delete({ where: { id: task.id } });
    } catch (error) {
      const attempts = task.attempts + 1;
      const lastError = error instanceof Error ? error.message.slice(0, 800) : String(error).slice(0, 800);
      console.error(`[storage-cleanup] could not delete ${task.storageKey}:`, error);
      await prisma.storageDeletionTask.update({
        where: { id: task.id },
        data: { attempts, lastError, nextAttemptAt: retryAt(attempts) },
      });
    }
  }
}

/** Run one serialized cleanup pass. Safe to invoke after any delete or at boot. */
export function runStorageCleanup() {
  if (!running) {
    running = processPendingStorageCleanup()
      .catch((error) => console.error("[storage-cleanup] pass failed:", error))
      .finally(() => { running = null; });
  }
  return running;
}
