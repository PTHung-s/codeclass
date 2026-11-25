import path from "path";

const dbPath = "file:" + path.resolve("prod.db").replace(/\\/g, "/");
process.env.DATABASE_URL = dbPath;

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbPath } } });

  // All quiz questions in the C++ course
  const questions = await prisma.$queryRawUnsafe<any[]>(`
    SELECT qq.id, qq.skillId, qq.aiSkillSuggest, qq.skillTagStatus, qq.question,
           q.title AS quiz_title, l.title AS lesson_title
    FROM quiz_questions qq
    JOIN quizzes q ON qq.quiz_id = q.id
    JOIN lessons l ON q.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = 'cpp-co-ban-id'
    ORDER BY l.order_index, q.order_index, qq.order_index
  `);

  console.log("Total C++ course questions:", questions.length);

  const byStatus = new Map<string, number>();
  for (const q of questions) byStatus.set(q.skillTagStatus, (byStatus.get(q.skillTagStatus) || 0) + 1);
  console.log("By skillTagStatus:", Array.from(byStatus.entries()).map(([s, n]) => `${s}:${n}`).join(", "));

  // Valid skill ids in the graph
  const validCpp = new Set([
    "cpp.intro","cpp.compile","cpp.var_basic","cpp.type_num","cpp.type_char","cpp.type_bool",
    "cpp.io_out","cpp.io_in","cpp.op_arith","cpp.op_assign","cpp.op_compare","cpp.op_logic",
    "cpp.op_precedence","cpp.if_basic","cpp.if_chain","cpp.switch","cpp.loop_while","cpp.loop_control",
    "cpp.loop_for","cpp.loop_nested","cpp.array_basic","cpp.array_algo","cpp.array_2d","cpp.func_basic",
    "cpp.func_ref","cpp.scope","cpp.overload","cpp.string_basic","cpp.string_ops",
  ]);

  // For untagged / ai_pending: what did AI suggest, and is it valid?
  const untagged = questions.filter((q) => q.skillTagStatus !== "approved");
  console.log("\nNon-approved questions:", untagged.length);
  const sugStatus = new Map<string, number>();
  const invalidSugg: any[] = [];
  for (const q of untagged) {
    const sugg = q.aiSkillSuggest;
    const key = !sugg ? "(none)" : (validCpp.has(sugg) ? "VALID:" + sugg : "INVALID:" + sugg);
    sugStatus.set(key, (sugStatus.get(key) || 0) + 1);
    if (sugg && !validCpp.has(sugg)) invalidSugg.push({ skillId: sugg, q: (q.question || "").slice(0, 60) });
  }
  console.log("AI suggestion status:", Array.from(sugStatus.entries()).map(([s, n]) => `${s}:${n}`).join(", "));
  if (invalidSugg.length) {
    console.log("\nINVALID suggestions:");
    for (const i of invalidSugg) console.log("  ", i.skillId, "|", i.q);
  }

  // Per-skill question counts (approved only) to show coverage
  const approved = questions.filter((q) => q.skillTagStatus === "approved");
  const perSkill = new Map<string, number>();
  for (const q of approved) {
    if (q.skillId) perSkill.set(q.skillId, (perSkill.get(q.skillId) || 0) + 1);
  }
  console.log("\nApproved question counts per skill (skillId: #questions):");
  console.log(Array.from(perSkill.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([s, n]) => `${s}:${n}`).join(" "));

  // What about aiSkillSuggest vs skillId mismatch on approved questions?
  const mismatch = approved.filter((q) => q.skillId && q.aiSkillSuggest && q.skillId !== q.aiSkillSuggest);
  console.log("\nApproved questions where skillId != aiSkillSuggest:", mismatch.length);

  await prisma.$disconnect();
}

main().catch((e) => console.error("FATAL:", e)).finally(() => process.exit(0));