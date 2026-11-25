/**
 * Skill Tag Enrichment — AI auto-tags quiz questions & problems with skill IDs.
 *
 * Flow:
 *   1. enrichUntaggedItems(): scans all items with skillTagStatus="untagged",
 *      calls the LLM (vilao primary, DeepSeek fallback) to suggest a skill,
 *      saves suggestion as ai_pending.
 *   2. Teacher reviews in UI → approve (skillId = aiSkillSuggest) or override.
 *
 * If no LLM provider is configured or every call fails, items just stay
 * "untagged" until the key is fixed — nothing is force-tagged.
 */

import prisma from "../utils/prisma";
import { SKILL_SEEDS } from "../utils/skillGraph";
import { chatCompletion, hasLLM } from "../utils/llmClient";

const SKILL_LIST = SKILL_SEEDS.map(
  (s) => `- ${s.skillId}: ${s.name} (${s.topicName}) — ${s.description}`,
).join("\n");

const SYSTEM_PROMPT = `Bạn là chuyên gia phân loại câu hỏi lập trình theo kỹ năng (skill).
Bạn sẽ nhận được một câu hỏi quiz (có các lựa chọn) HOẶC một bài tập code, cùng danh sách kỹ năng.
Nhiệm vụ: chọn ĐÚNG MỘT skill_id phù hợp nhất từ danh sách.

Quy tắc:
1. Trả về CHÍNH XÁC một skill_id từ danh sách (ví dụ: "py.for_range", "cpp.loop_for" hoặc "algo.binary_search").
2. Nếu câu hỏi tổng hợp nhiều kỹ năng, chọn kỹ năng CHÍNH được kiểm tra.
3. KHÔNG được bịa skill_id ngoài danh sách.
4. Trả về JSON: {"skill_id": "py.xxx, cpp.xxx hoặc algo.xxx", "confidence": 0.0-1.0, "reason": "lý do ngắn tiếng Việt"}

Danh sách kỹ năng:
${SKILL_LIST}`;

interface AITagResult {
  skill_id: string;
  confidence: number;
  reason: string;
}

async function askAI(userPrompt: string): Promise<AITagResult | null> {
  if (!hasLLM()) return null;
  const result = await chatCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.2, max_tokens: 300, response_format: { type: "json_object" } },
  );
  if (!result) return null;
  try {
    const parsed = JSON.parse(result.content);
    const skillId = String(parsed.skill_id || "").trim();
    // Validate against known skills
    if (!SKILL_SEEDS.some((s) => s.skillId === skillId)) return null;
    return {
      skill_id: skillId,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      reason: String(parsed.reason || "").slice(0, 200),
    };
  } catch {
    return null;
  }
}

/** Enrich all untagged quiz questions. Returns count tagged. */
async function enrichQuizQuestions(): Promise<number> {
  const questions = await prisma.quizQuestion.findMany({
    where: { skillTagStatus: "untagged" },
    take: 100, // batch limit to avoid hammering the API
    include: { quiz: { include: { lesson: true } } },
  });

  let tagged = 0;
  for (const q of questions) {
    const options: string[] = JSON.parse(q.options || "[]");
    const correctOption = options[q.correctIndex] || "";
    const lessonTitle = q.quiz?.lesson?.title || q.quiz?.title || "";

    const prompt = `Câu hỏi quiz (bài: "${lessonTitle}"):
${q.question}

Các lựa chọn:
${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}

Đáp án đúng: ${correctOption}
${q.explanation ? `Giải thích: ${q.explanation}` : ""}

Hãy chọn skill_id phù hợp nhất.`;

    const result = await askAI(prompt);
    if (result) {
      await prisma.quizQuestion.update({
        where: { id: q.id },
        data: {
          aiSkillSuggest: result.skill_id,
          skillTagStatus: "ai_pending",
        },
      });
      tagged++;
    } else {
      // AI failed → mark rejected so we don't retry endlessly
      await prisma.quizQuestion.update({
        where: { id: q.id },
        data: { skillTagStatus: "rejected" },
      });
    }
  }
  return tagged;
}

/** Enrich all untagged problems. Returns count tagged. */
async function enrichProblems(): Promise<number> {
  const problems = await prisma.problem.findMany({
    where: { skillTagStatus: "untagged" },
    take: 50,
  });

  let tagged = 0;
  for (const p of problems) {
    const prompt = `Bài tập code:
Tiêu đề: ${p.title}
${p.shortDescription ? `Mô tả ngắn: ${p.shortDescription}` : ""}
${p.statement ? `Đề bài: ${p.statement.slice(0, 500)}` : ""}
Độ khó: ${p.difficulty}

Hãy chọn skill_id phù hợp nhất.`;

    const result = await askAI(prompt);
    if (result) {
      await prisma.problem.update({
        where: { id: p.id },
        data: {
          aiSkillSuggest: result.skill_id,
          skillTagStatus: "ai_pending",
        },
      });
      tagged++;
    } else {
      await prisma.problem.update({
        where: { id: p.id },
        data: { skillTagStatus: "rejected" },
      });
    }
  }
  return tagged;
}

/**
 * Run enrichment for both quiz questions and problems.
 * Safe to call repeatedly — only processes "untagged" items.
 */
export async function enrichAllUntagged(): Promise<{
  quizTagged: number;
  problemTagged: number;
}> {
  console.log("[SkillTag] Starting AI enrichment...");
  const quizTagged = await enrichQuizQuestions();
  const problemTagged = await enrichProblems();
  console.log(`[SkillTag] Done: ${quizTagged} quiz, ${problemTagged} problems tagged (pending review)`);
  return { quizTagged, problemTagged };
}

/** Get items pending teacher review (ai_pending status). */
export async function getPendingReview(opts: { type?: "quiz" | "problem"; limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  const result: Array<{
    id: string;
    type: "quiz" | "problem";
    title: string;
    content: string;
    aiSkillSuggest: string | null;
    context: string;
    details: {
      statement?: string | null;
      shortDescription?: string | null;
      sampleInput?: string | null;
      sampleOutput?: string | null;
      requirementsText?: string | null;
      testCases?: string | null;
      explanation?: string | null;
      options?: string[];
      correctIndex?: number;
    };
  }> = [];

  if (!opts.type || opts.type === "quiz") {
    const questions = await prisma.quizQuestion.findMany({
      where: { skillTagStatus: "ai_pending" },
      take: limit,
      include: { quiz: { include: { lesson: true } } },
    });
    for (const q of questions) {
      const options: string[] = JSON.parse(q.options || "[]");
      result.push({
        id: q.id,
        type: "quiz",
        title: q.quiz?.lesson?.title || q.quiz?.title || "Quiz",
        content: q.question,
        aiSkillSuggest: q.aiSkillSuggest,
        context: options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}${i === q.correctIndex ? " ✓" : ""}`).join("  |  "),
        details: {
          options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        },
      });
    }
  }

  if (!opts.type || opts.type === "problem") {
    const problems = await prisma.problem.findMany({
      where: { skillTagStatus: "ai_pending" },
      take: limit,
    });
    for (const p of problems) {
      result.push({
        id: p.id,
        type: "problem",
        title: p.title,
        content: p.shortDescription || p.statement || "",
        aiSkillSuggest: p.aiSkillSuggest,
        context: p.difficulty,
        details: {
          shortDescription: p.shortDescription,
          statement: p.statement,
          sampleInput: p.sampleInput,
          sampleOutput: p.sampleOutput,
          requirementsText: p.requirementsText,
          testCases: p.testCases,
        },
      });
    }
  }

  return result;
}

/** Approve a single item — accepts AI suggestion or an override. */
export async function approveItem(
  type: "quiz" | "problem",
  id: string,
  skillId: string,
): Promise<void> {
  if (!SKILL_SEEDS.some((s) => s.skillId === skillId)) {
    throw new Error("skillId không hợp lệ");
  }
  if (type === "quiz") {
    await prisma.quizQuestion.update({
      where: { id },
      data: { skillId, skillTagStatus: "approved", aiSkillSuggest: skillId },
    });
  } else {
    await prisma.problem.update({
      where: { id },
      data: { skillId, skillTagStatus: "approved", aiSkillSuggest: skillId },
    });
  }
}

/** Reject an item (AI suggestion wrong, leave untagged). */
export async function rejectItem(type: "quiz" | "problem", id: string): Promise<void> {
  if (type === "quiz") {
    await prisma.quizQuestion.update({
      where: { id },
      data: { skillTagStatus: "rejected", aiSkillSuggest: null },
    });
  } else {
    await prisma.problem.update({
      where: { id },
      data: { skillTagStatus: "rejected", aiSkillSuggest: null },
    });
  }
}

/** Remove a reviewed item without destroying historical problem evidence. */
export async function deleteItem(type: "quiz" | "problem", id: string): Promise<void> {
  if (type === "quiz") {
    await prisma.quizQuestion.delete({ where: { id } });
    return;
  }

  // Problems can be referenced by submissions, contests and assignments. Archive
  // them so historical records remain readable and the problem leaves active lists.
  await prisma.problem.update({
    where: { id },
    data: { status: "archived", skillTagStatus: "rejected", aiSkillSuggest: null },
  });
}

/** Bulk approve all ai_pending items (accept AI suggestion). One-click for teachers. */
export async function bulkApproveAll(): Promise<{ approved: number }> {
  // Only copy suggestions that are still in the canonical catalog. Old or
  // malformed AI output stays pending for explicit teacher review.
  const validIds = SKILL_SEEDS.map((seed) => `'${seed.skillId.replace(/'/g, "''")}'`).join(", ");
  const quizCount = await prisma.$executeRawUnsafe(
    `UPDATE quiz_questions
     SET skill_id = ai_skill_suggest, skill_tag_status = 'approved'
     WHERE skill_tag_status = 'ai_pending' AND ai_skill_suggest IN (${validIds})`,
  );
  const problemCount = await prisma.$executeRawUnsafe(
    `UPDATE problems
     SET skill_id = ai_skill_suggest, skill_tag_status = 'approved'
     WHERE skill_tag_status = 'ai_pending' AND ai_skill_suggest IN (${validIds})`,
  );

  return { approved: quizCount + problemCount };
}

/** Stats for the review dashboard. */
export async function getTagStats() {
  const [quizUntagged, quizPending, quizApproved, quizRejected] = await Promise.all([
    prisma.quizQuestion.count({ where: { skillTagStatus: "untagged" } }),
    prisma.quizQuestion.count({ where: { skillTagStatus: "ai_pending" } }),
    prisma.quizQuestion.count({ where: { skillTagStatus: "approved" } }),
    prisma.quizQuestion.count({ where: { skillTagStatus: "rejected" } }),
  ]);
  const [probUntagged, probPending, probApproved, probRejected] = await Promise.all([
    prisma.problem.count({ where: { skillTagStatus: "untagged" } }),
    prisma.problem.count({ where: { skillTagStatus: "ai_pending" } }),
    prisma.problem.count({ where: { skillTagStatus: "approved" } }),
    prisma.problem.count({ where: { skillTagStatus: "rejected" } }),
  ]);
  return {
    quiz: { untagged: quizUntagged, pending: quizPending, approved: quizApproved, rejected: quizRejected },
    problem: { untagged: probUntagged, pending: probPending, approved: probApproved, rejected: probRejected },
  };
}
