/**
 * Proper harness for extractRawEvents against prod.db.
 * CRITICAL: set DATABASE_URL BEFORE any import — utils/prisma reads env at
 * module load. Static imports are hoisted and run first, so we only use
 * dynamic `await import()` AFTER setting the env var.
 */
import path from "path";

const dbPath = "file:" + path.resolve("prod.db").replace(/\\/g, "/");
process.env.DATABASE_URL = dbPath;

async function main() {
  // Module-level client now binds to prod.db (absolute path, WAL config applied).
  const { extractRawEvents, groupSequences } = await import("../bktCalibrator");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbPath } } });

  const raw = await extractRawEvents();
  console.log("Total raw skill keys:", raw.size);
  const cppKeys = Array.from(raw.keys()).filter((k) => k.startsWith("cpp."));
  console.log("C++ keys:", cppKeys.length);

  const evs = raw.get("cpp.io_in") || [];
  console.log("\ncpp.io_in raw events:", evs.length);
  const byStudent = new Map<string, number>();
  for (const e of evs) byStudent.set(e.studentId, (byStudent.get(e.studentId) || 0) + 1);
  console.log("  per student:", Array.from(byStudent.entries()).map(([s, n]) => `${s.slice(0, 8)}:${n}`).join(", "));

  // Direct prod.db cross-check (same client now).
  const quizIdsRes: { id: string }[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT q.id FROM quizzes q
    JOIN lessons l ON q.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = 'cpp-co-ban-id'
  `);
  const quizIds = quizIdsRes.map((r) => r.id);
  const ioInQ = await prisma.quizQuestion.findMany({
    where: { quizId: { in: quizIds }, skillId: "cpp.io_in", skillTagStatus: "approved" },
    select: { id: true },
  });
  console.log("\nC++ course quiz ids:", quizIds.length, "| approved cpp.io_in questions:", ioInQ.length);

  interface Row { cnt: number }
  const countRes = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT COUNT(*) AS cnt
    FROM quiz_attempts qa
    WHERE qa.quiz_id IN (SELECT q.id FROM quizzes q JOIN lessons l ON q.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = 'cpp-co-ban-id')
      AND EXISTS (
        SELECT 1 FROM json_each(qa.answers) a
        WHERE json_extract(a.value, '$.questionId') IN (SELECT id FROM quiz_questions WHERE quiz_id = qa.quiz_id AND skillId = 'cpp.io_in' AND skillTagStatus = 'approved')
      )
  `);
  console.log("Attempts containing >=1 cpp.io_in answer:", countRes[0]?.cnt);

  // Grouped sequences now
  const grouped = groupSequences(raw);
  console.log("\ncpp.io_in grouped sequences:", (grouped.get("cpp.io_in") || []).length);
  for (const [skillId, seqs] of grouped) {
    if (skillId.startsWith("cpp.")) {
      console.log(`  ${skillId}: ${seqs.length} seqs, events=${seqs.reduce((s, q) => s + q.length, 0)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => console.error("FATAL:", e)).finally(() => process.exit(0));
