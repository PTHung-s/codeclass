import path from "path";
import { extractRawEvents, groupSequences } from "../bktCalibrator";

async function main() {
  const dbPath = "file:" + path.resolve("prod.db").replace(/\\/g, "/");
  process.env.DATABASE_URL = dbPath;

  const raw = await extractRawEvents();
  console.log("Total raw skill keys:", raw.size);
  console.log("C++ keys:", Array.from(raw.keys()).filter((k) => k.startsWith("cpp.")).length);

  // Deep dive: cpp.io_in — raw events
  const evs = raw.get("cpp.io_in") || [];
  console.log("\ncpp.io_in raw events:", evs.length);
  const byStudent = new Map<string, number>();
  for (const e of evs) byStudent.set(e.studentId, (byStudent.get(e.studentId) || 0) + 1);
  console.log("  per student:", Array.from(byStudent.entries()).map(([s, n]) => `${s.slice(0, 8)}:${n}`).join(", "));

  // Now let me check the direct DB count independently
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbPath } } });

  // All quizAttempts with quiz questions that have approved cpp.io_in
  const quizIdsRes: { id: string }[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT q.id FROM quizzes q
    JOIN lessons l ON q.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = 'cpp-co-ban-id'
  `);
  const quizIds = quizIdsRes.map((r) => r.id);
  console.log("\nC++ course quiz ids:", quizIds.length);

  // Independent count: how many APPROVED cpp.io_in questions exist in these quizzes
  const ioInQ = await prisma.quizQuestion.findMany({
    where: { quizId: { in: quizIds }, skillId: "cpp.io_in", skillTagStatus: "approved" },
    select: { id: true },
  });
  console.log("Approved cpp.io_in questions in course:", ioInQ.length);

  // And how many attempts reference those questions via answers
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
  console.log("Attempts containing at least one cpp.io_in answer:", countRes[0]?.cnt);

  await prisma.$disconnect();
}

main().catch((e) => console.error("FATAL:", e)).finally(() => process.exit(0));