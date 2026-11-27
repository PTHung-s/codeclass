/**
 * CLI to import Competitive Programming problem packs into CodeClass SQLite DB.
 *
 * Examples:
 *   npm run import:problems
 *   npm run import:problems -- --pack=01-number-theory-sieve
 *   npm run import:problems -- --mode=upsert
 *   npm run import:problems -- --file=./path/to/custom.json --draft
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../utils/prisma";
import {
  CP_PACKS_DIR,
  importProblemPack,
  listBuiltInPacks,
  loadBuiltInPack,
} from "../services/problemPackService";

function getArg(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const packArg = getArg("--pack=") || "all";
  const fileArg = getArg("--file=");
  const modeArg = getArg("--mode=") === "upsert" ? "upsert" : "skip";
  const authorEmail = getArg("--author=");
  const draft = process.argv.includes("--draft");

  const author = authorEmail
    ? await prisma.user.findUnique({ where: { email: authorEmail }, select: { id: true, email: true, fullName: true } })
    : await prisma.user.findFirst({
        where: { role: { in: ["admin", "teacher"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, fullName: true },
      });

  if (!author) {
    console.error("Không tìm thấy tài khoản admin/teacher trong DB. Hãy chỉ định --author=<email>.");
    process.exit(1);
  }

  console.log(`Using author: ${author.fullName} <${author.email}> | mode=${modeArg} | publish=${!draft}`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  if (fileArg) {
    const abs = path.resolve(process.cwd(), fileArg);
    const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
    const res = await importProblemPack(raw, author.id, { mode: modeArg, publish: !draft });
    console.log(
      `  [${res.packId}] ${res.title}: +${res.created} created, ~${res.updated} updated, =${res.skipped} skipped`,
    );
    if (res.errors.length) {
      for (const e of res.errors) console.error("    ERROR:", e);
    }
    totalCreated += res.created;
    totalUpdated += res.updated;
    totalSkipped += res.skipped;
    totalErrors += res.errors.length;
  } else {
    const available = await listBuiltInPacks();
    if (!available.length) {
      console.error(`Không có gói đề nào trong ${CP_PACKS_DIR}`);
      process.exit(1);
    }
    const targetIds =
      packArg === "all"
        ? available.map((p) => p.packId)
        : packArg.split(",").map((s) => s.trim()).filter(Boolean);

    for (const pid of targetIds) {
      const pack = loadBuiltInPack(pid);
      const res = await importProblemPack(pack, author.id, { mode: modeArg, publish: !draft });
      console.log(
        `  [${res.packId}] ${res.title}: +${res.created} created, ~${res.updated} updated, =${res.skipped} skipped`,
      );
      if (res.errors.length) {
        for (const e of res.errors) console.error("    ERROR:", e);
      }
      totalCreated += res.created;
      totalUpdated += res.updated;
      totalSkipped += res.skipped;
      totalErrors += res.errors.length;
    }
  }

  console.log(
    `\nDone! Total: +${totalCreated} created, ~${totalUpdated} updated, =${totalSkipped} skipped, !${totalErrors} errors.`,
  );
  await prisma.$disconnect();
  if (totalErrors > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
