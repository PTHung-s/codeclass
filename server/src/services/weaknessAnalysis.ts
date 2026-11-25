import prisma from "../utils/prisma";
import { vnStartOfDay } from "../utils/vnTime";
import { chatCompletion, hasLLM } from "../utils/llmClient";
import { getLessonObjectives, formatObjectives } from "../utils/courseContent";

const SYSTEM_PROMPT = `Bạn là trợ lý giáo dục chuyên phân tích điểm yếu của học sinh lập trình.

Nhiệm vụ: Phân tích toàn bộ hoạt động hôm nay của học sinh và cập nhật "pool tag điểm yếu".

QUY TẮC:
1. Mỗi tag là 1 cụm ngắn gọn (2-5 từ tiếng Việt) mô tả 1 lỗi/cần cải thiện cụ thể.
   Ví dụ: "quên ép kiểu int()", "nhầm index vòng lặp", "sai điều kiện if", "off-by-one", "không xử lý input rỗng"
2. So sánh bài làm mới với pool tag hiện tại → xác định:
   - newTags: điểm yếu MỚI phát hiện (chưa có trong pool)
   - improvedTags: điểm yếu cũ mà học sinh ĐÃ cải thiện (không còn mắc nữa)
   - Nếu không có gì mới, trả về mảng rỗng.
3. Chỉ dựa vào dữ liệu được cung cấp, không suy đoán.

Định dạng JSON trả về BẮT BUỘC:
{
  "newTags": ["tag1", "tag2"],
  "improvedTags": ["tag3"]
}`;

export interface WeaknessAnalysisResult {
  newTags: string[];
  improvedTags: string[];
}

/** Gather ALL activity data for a student today */
async function gatherActivity(userId: string, todayStart: Date) {
  const [
    quizAttempts,
    adaptiveTests,
    arenaAnswers,
    submissions,
    problemSubmissions,
    contestResults,
    lessonCompletions,
  ] = await Promise.all([
    // Quiz attempts
    prisma.quizAttempt.findMany({
      where: { userId, createdAt: { gte: todayStart } },
      include: { quiz: { select: { title: true, lesson: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    // Adaptive tests (vượt chương)
    prisma.adaptiveTestAttempt.findMany({
      where: { userId, createdAt: { gte: todayStart } },
      include: { module: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // Debug Arena answers
    prisma.debugArenaAnswer.findMany({
      where: { userId, answeredAt: { gte: todayStart } },
      include: { question: { select: { title: true, statement: true } } },
      orderBy: { answeredAt: "desc" },
    }),
    // Assignment submissions
    prisma.submission.findMany({
      where: { studentId: userId, submittedAt: { gte: todayStart } },
      include: { assignment: { select: { title: true } } },
      orderBy: { submittedAt: "desc" },
    }),
    // Problem submissions (luyện tập) — uses studentId
    prisma.problemSubmission.findMany({
      where: { studentId: userId, createdAt: { gte: todayStart } },
      include: { problem: { select: { title: true, difficulty: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // Contest participations
    prisma.contestParticipant.findMany({
      where: { studentId: userId, finishedAt: { gte: todayStart } },
      include: { contest: { select: { title: true } } },
      orderBy: { finishedAt: "desc" },
    }),
    // Lessons completed
    prisma.lessonProgress.findMany({
      where: { userId, completedAt: { gte: todayStart } },
      include: { lesson: { select: { title: true, courseId: true, course: { select: { id: true, title: true, description: true } } } } },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  return {
    quizAttempts, adaptiveTests, arenaAnswers, submissions,
    problemSubmissions, contestResults, lessonCompletions,
  };
}

function buildActivitySummary(activity: Awaited<ReturnType<typeof gatherActivity>>): string {
  const lines: string[] = [];

  for (const qa of activity.quizAttempts) {
    lines.push(`[Quiz] ${qa.quiz?.title || "?"} (bài ${qa.quiz?.lesson?.title || "?"}) — ${qa.score}/${qa.totalQuestions} đúng (${qa.passed ? "Đỗ" : "Trượt"})`);
  }

  for (const at of activity.adaptiveTests) {
    lines.push(`[Vượt chương] ${at.module?.title || "?"} — ${at.correctCount}/${at.totalQuestions} đúng (${at.passed ? "Đạt" : at.partialPass ? "1 phần" : "Chưa đạt"})`);
  }

  for (const aa of activity.arenaAnswers.slice(0, 15)) {
    lines.push(`[Arena Debug] ${aa.question.title} — ${aa.decision === "correct" ? "Chọn Đúng" : aa.decision === "bug" ? "Chọn Sai" : "Không trả lời"} (điểm: ${aa.score})`);
  }

  for (const sub of activity.submissions) {
    lines.push(`[Bài tập] ${sub.assignment.title} — ${sub.status === "graded" ? `Đã chấm` : "Chưa chấm"}`);
  }

  for (const ps of activity.problemSubmissions) {
    lines.push(`[Luyện tập] ${ps.problem.title} (${ps.problem.difficulty}) — ${ps.passed ? "Đúng" : "Sai"}`);
  }

  for (const cr of activity.contestResults) {
    lines.push(`[Kỳ thi] ${cr.contest.title} — Đã hoàn thành`);
  }

  for (const lc of activity.lessonCompletions) {
    const objectives = lc.lesson.course
      ? getLessonObjectives(lc.lesson.course, lc.lesson.title)
      : null;
    const objectivesSuffix = objectives && objectives.length > 0
      ? `\n${formatObjectives(objectives)}`
      : "";
    lines.push(`[Hoàn thành bài] ${lc.lesson.title}${objectivesSuffix}`);
  }

  return lines.length > 0 ? lines.slice(0, 30).join("\n") : "";
}

export async function analyzeWeaknesses(userId: string): Promise<WeaknessAnalysisResult & { activityCount: number }> {
  // VN midnight: the container runs in UTC, where setHours(0,0,0,0) would
  // start the window at 07:00 VN and miss the previous evening's activity.
  const todayStart = vnStartOfDay();

  // Gather all activity
  const activity = await gatherActivity(userId, todayStart);
  const activitySummary = buildActivitySummary(activity);

  const totalActivity =
    activity.quizAttempts.length + activity.adaptiveTests.length +
    activity.arenaAnswers.length + activity.submissions.length +
    activity.problemSubmissions.length + activity.contestResults.length +
    activity.lessonCompletions.length;

  if (totalActivity === 0 || !activitySummary) {
    return { newTags: [], improvedTags: [], activityCount: 0 };
  }

  // Log start
  const log = await prisma.aILog.create({
    data: { userId, mode: "weakness_analysis", prompt: "analyzing...", status: "processing" },
  });

  try {
    if (!hasLLM()) {
      await prisma.aILog.update({ where: { id: log.id }, data: { status: "skipped", result: "No LLM configured" } });
      return { newTags: [], improvedTags: [], activityCount: totalActivity };
    }

    // Fetch existing tags
    const existingTags = await prisma.studentWeaknessTag.findMany({
      where: { userId, status: "active" },
      select: { tag: true },
    });
    const activeTags = existingTags.map((t) => t.tag);

    const userPrompt = `Phân tích điểm yếu của học sinh.

POOL TAG HIỆN TẠI:
${activeTags.length > 0 ? activeTags.map((t) => `  - ${t}`).join("\n") : "  (chưa có tag nào)"}

TOÀN BỘ HOẠT ĐỘNG HÔM NAY (${totalActivity} hoạt động):
${activitySummary}

Hãy trả về JSON với newTags (điểm yếu mới) và improvedTags (đã cải thiện).`;

    const llmResult = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, max_tokens: 400, response_format: { type: "json_object" }, timeoutMs: 30000 },
    );

    const content = llmResult?.content;
    if (!content) {
      await prisma.aILog.update({ where: { id: log.id }, data: { status: "success", result: "No content" } });
      return { newTags: [], improvedTags: [], activityCount: totalActivity };
    }

    const parsed = JSON.parse(content);
    const result = {
      newTags: Array.isArray(parsed.newTags) ? parsed.newTags.slice(0, 5).map(String) : [],
      improvedTags: Array.isArray(parsed.improvedTags) ? parsed.improvedTags.slice(0, 5).map(String) : [],
      activityCount: totalActivity,
    };

    // Log success
    await prisma.aILog.update({
      where: { id: log.id },
      data: {
        status: "success",
        prompt: userPrompt.slice(0, 2000),
        result: JSON.stringify(result),
      },
    });

    return result;
  } catch (err: any) {
    const errorMsg = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : err?.message || "Unknown";
    await prisma.aILog.update({
      where: { id: log.id },
      data: { status: "error", result: errorMsg },
    });
    console.error("Weakness analysis error:", errorMsg);
    return { newTags: [], improvedTags: [], activityCount: totalActivity };
  }
}

/** Apply analysis results to the DB */
export async function applyWeaknessAnalysis(userId: string, result: WeaknessAnalysisResult) {
  for (const tag of result.newTags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;
    const existing = await prisma.studentWeaknessTag.findUnique({
      where: { userId_tag: { userId, tag: normalized } },
    });
    if (existing) {
      await prisma.studentWeaknessTag.update({
        where: { id: existing.id },
        data: { severity: Math.min(5, existing.severity + 1), lastSeenAt: new Date(), status: "active" },
      });
    } else {
      await prisma.studentWeaknessTag.create({
        data: { userId, tag: normalized, status: "active", severity: 1 },
      });
    }
  }

  for (const tag of result.improvedTags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;
    await prisma.studentWeaknessTag.updateMany({
      where: { userId, tag: normalized, status: "active" },
      data: { status: "improved", lastSeenAt: new Date() },
    });
  }
}

/** Daily cron entry point: analyze all students who had activity today */
export async function runDailyWeaknessAnalysis() {
  // VN midnight: the container runs in UTC, where setHours(0,0,0,0) would
  // start the window at 07:00 VN and miss the previous evening's activity.
  const todayStart = vnStartOfDay();

  const activeUserIds = new Set<string>();

  const [quizUsers, subUsers, arenaUsers, problemUsers, adaptiveUsers, contestUsers, lessonUsers] = await Promise.all([
    prisma.quizAttempt.findMany({ where: { createdAt: { gte: todayStart } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.submission.findMany({ where: { submittedAt: { gte: todayStart } }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.debugArenaAnswer.findMany({ where: { answeredAt: { gte: todayStart } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.problemSubmission.findMany({ where: { createdAt: { gte: todayStart } }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.adaptiveTestAttempt.findMany({ where: { createdAt: { gte: todayStart } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.contestParticipant.findMany({ where: { finishedAt: { gte: todayStart } }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.lessonProgress.findMany({ where: { completedAt: { gte: todayStart } }, select: { userId: true }, distinct: ["userId"] }),
  ]);

  for (const q of quizUsers) activeUserIds.add(q.userId);
  for (const s of subUsers) activeUserIds.add(s.studentId);
  for (const a of arenaUsers) activeUserIds.add(a.userId);
  for (const p of problemUsers) activeUserIds.add(p.studentId);
  for (const at of adaptiveUsers) activeUserIds.add(at.userId);
  for (const c of contestUsers) activeUserIds.add(c.studentId);
  for (const l of lessonUsers) activeUserIds.add(l.userId);

  const results: { userId: string; newTags: number; improvedTags: number; activityCount: number }[] = [];

  for (const userId of activeUserIds) {
    try {
      const analysis = await analyzeWeaknesses(userId);
      if (analysis.newTags.length > 0 || analysis.improvedTags.length > 0) {
        await applyWeaknessAnalysis(userId, analysis);
      }
      results.push({
        userId,
        newTags: analysis.newTags.length,
        improvedTags: analysis.improvedTags.length,
        activityCount: analysis.activityCount,
      });
    } catch (err) {
      console.error(`Weakness analysis failed for user ${userId}:`, err);
    }
  }

  // Log overall run — use first active user or skip if none
  const loggerId = activeUserIds.values().next().value || undefined;
  if (loggerId) {
    await prisma.aILog.create({
      data: {
        userId: loggerId,
        mode: "weakness_analysis_batch",
        status: "success",
        prompt: "Daily run",
        result: JSON.stringify({ totalUsers: results.length, summary: results }),
      },
    }).catch(() => {});
  }

  return { analyzed: results.length, details: results };
}

/** Get running analysis status for all students */
export async function getAnalysisStatus() {
  // VN midnight: the container runs in UTC, where setHours(0,0,0,0) would
  // start the window at 07:00 VN and miss the previous evening's activity.
  const todayStart = vnStartOfDay();

  const logs = await prisma.aILog.findMany({
    where: { mode: "weakness_analysis", createdAt: { gte: todayStart } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { fullName: true } } },
    take: 100,
  });

  return logs.map((l) => ({
    id: l.id,
    userId: l.userId,
    fullName: l.user?.fullName || "—",
    status: l.status,
    createdAt: l.createdAt,
  }));
}
