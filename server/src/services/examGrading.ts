/**
 * Post-exam grading: MCQ deterministic, code via hidden tests, short via LLM suggestion + teacher final.
 */
import prisma from "../utils/prisma";
import { judgePythonCode } from "../utils/pythonRunner";
import { judgeCppCode } from "../utils/cppRunner";
import { safeJsonParse } from "./examTypes";
import { resolveCodeLanguage } from "./examAttemptService";
import { chatCompletion, hasLLM } from "../utils/llmClient";

/**
 * AI viết nhận xét cho câu trả lời ngắn theo phong cách GV yêu cầu.
 * KHÔNG tự lưu — trả text về, GV chỉnh sửa rồi mới chốt (teacherNote).
 */
export async function suggestShortComment(params: {
  stem: string;
  guide?: string | null;
  accepted: string[];
  student: string;
  maxPoints: number;
  llmSuggestion?: { suggestedScore?: number; rationale?: string } | null;
  style?: string | null;
}): Promise<{ comment: string }> {
  if (!hasLLM()) {
    return { comment: "(Chưa cấu hình LLM — hãy viết nhận xét thủ công.)" };
  }
  try {
    const result = await chatCompletion(
      [
        {
          role: "system",
          content:
            'Bạn là trợ giảng viết nhận xét cho bài làm môn tin học/lập trình. Viết nhận xét NGẮN bằng tiếng Việt về câu trả lời ngắn của học sinh: nêu em đúng/đủ ý gì, thiếu/sai ý gì so với đáp án, gợi ý cách khắc phục. Giọng tích cực, tôn trọng học sinh, không chê nặng lời, không chấm điểm trong nhận xét, không dùng markdown. Trả JSON {"comment": "..."}.',
        },
        {
          role: "user",
          content: JSON.stringify({
            cau_hoi: params.stem,
            huong_dan_cham: params.guide || undefined,
            dap_an_tham_chieu: params.accepted,
            bai_lam_cua_hoc_sinh: params.student,
            diem_toi_da: params.maxPoints,
            y_kien_bo_cham_he_thong: params.llmSuggestion || undefined,
            phong_cach_giao_vien_yeu_cau: params.style || undefined,
          }),
        },
      ],
      { temperature: 0.4, max_tokens: 600, response_format: { type: "json_object" }, timeoutMs: 60_000 },
    );
    const parsed = JSON.parse(result?.content || "{}");
    return { comment: String(parsed.comment || "").slice(0, 1200) };
  } catch (err: any) {
    throw new Error(`AI nhận xét lỗi: ${err?.message || "unknown"}`);
  }
}

async function gradeShortWithLlm(params: {
  stem: string;
  guide?: string | null;
  accepted: string[];
  student: string;
  maxPoints: number;
}): Promise<{ suggestedScore: number; rationale: string; confidence: number }> {
  if (!hasLLM()) {
    // Fallback: soft exact match
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const ok = params.accepted.some((a) => norm(a) === norm(params.student));
    return {
      suggestedScore: ok ? params.maxPoints : 0,
      rationale: "Chưa cấu hình LLM — so khớp đơn giản; GV cần duyệt.",
      confidence: ok ? 0.5 : 0.3,
    };
  }

  try {
    const result = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Bạn chấm câu trả lời ngắn lập trình/tin học. Trả JSON: {\"score\": number, \"confidence\": 0-1, \"rationale\": \"tiếng Việt ngắn\"}. score từ 0 đến max_points. Không cộng điểm nếu lạc đề.",
        },
        {
          role: "user",
          content: JSON.stringify({
            stem: params.stem,
            huong_dan_cham: params.guide,
            dap_an_tham_chieu: params.accepted,
            bai_lam: params.student,
            max_points: params.maxPoints,
          }),
        },
      ],
      { temperature: 0.1, max_tokens: 400, response_format: { type: "json_object" }, timeoutMs: 45_000 },
    );
    const parsed = JSON.parse(result?.content || "{}");
    const score = Math.max(0, Math.min(params.maxPoints, Number(parsed.score) || 0));
    return {
      suggestedScore: score,
      rationale: String(parsed.rationale || "").slice(0, 500),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    };
  } catch (err: any) {
    return {
      suggestedScore: 0,
      rationale: `LLM lỗi: ${err?.message || "unknown"} — GV chấm tay`,
      confidence: 0,
    };
  }
}

async function gradeOneAttempt(attemptId: string) {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { include: { questions: { include: { testCases: true } } } },
      answers: true,
      student: { select: { fullName: true } },
    },
  });
  if (!attempt) return;
  console.log(
    `[grade-one] attempt=${attemptId} student=${attempt.student?.fullName ?? "?"} status=${attempt.status} gradeStatus=${attempt.gradeStatus} finals=${JSON.stringify(attempt.answers.filter((a) => a.finalScore != null).map((a) => `${a.questionId.slice(0, 6)}:${a.finalScore}`))}`,
  );
  if (attempt.status === "in_progress") {
    // force expire path may call grade later
  }

  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));
  let total = 0;
  let maxTotal = 0;
  let needsReview = false;

  for (const q of attempt.exam.questions) {
    maxTotal += q.points;
    let answer = answerMap.get(q.id);
    if (!answer) {
      answer = await prisma.examAnswer.create({
        data: {
          attemptId: attempt.id,
          questionId: q.id,
          maxScore: q.points,
          autoScore: 0,
          finalScore: q.type === "tra_loi_ngan" ? null : 0,
        },
      });
    }

    // BẢO VỆ: câu này đã có finalScore (GV chốt / chấm xong) → GIỮ NGUYÊN TUYỆT ĐỐI
    if (answer.finalScore != null) {
      continue;
    }

    if (q.type === "trac_nghiem") {
      const correct = answer.selectedIndex != null && answer.selectedIndex === q.correctIndex;
      const score = correct ? q.points : 0;
      total += score;
      await prisma.examAnswer.update({
        where: { id: answer.id },
        data: {
          maxScore: q.points,
          autoScore: score,
          finalScore: score,
          autoDetailJson: JSON.stringify({ correct, correctIndex: q.correctIndex }),
          gradedAt: new Date(),
        },
      });
    } else if (q.type === "thuc_hanh") {
      const lang = resolveCodeLanguage(q.language, answer.codeLanguage);
      const code = answer.codeAnswer || "";
      const hidden = q.testCases.filter((t) => t.kind === "an" && t.status === "da_duyet");
      const cases = (hidden.length ? hidden : q.testCases.filter((t) => t.kind === "mau")).map((t) => ({
        input: t.input,
        output: t.output,
        hidden: t.kind === "an",
      }));

      let passed = 0;
      let totalTests = cases.length;
      let detail: unknown = { status: "no_code" };

      if (!code.trim() || totalTests === 0) {
        detail = { status: totalTests === 0 ? "no_tests" : "no_code", passed: 0, totalTests };
      } else if (lang === "cpp") {
        const r = await judgeCppCode(code, cases);
        passed = r.passedCount;
        totalTests = r.totalTests;
        detail = { status: r.status, passed, totalTests, results: r.results };
      } else {
        const r = await judgePythonCode(code, cases);
        passed = r.passedCount;
        totalTests = r.totalTests;
        detail = { status: r.status, passed, totalTests, results: r.results };
      }

      const score = totalTests > 0 ? (passed / totalTests) * q.points : 0;
      total += score;
      await prisma.examAnswer.update({
        where: { id: answer.id },
        data: {
          maxScore: q.points,
          autoScore: score,
          finalScore: score,
          autoDetailJson: JSON.stringify(detail),
          gradedAt: new Date(),
        },
      });
    } else if (q.type === "tra_loi_ngan") {
      needsReview = true;
      const accepted = safeJsonParse<string[]>(q.acceptedAnswersJson, []);
      // TỐI ƯU: đã có gợi ý LLM cho đúng câu trả lời này → dùng lại, không gọi API
      const cached = safeJsonParse<{ suggestedScore?: number; rationale?: string; confidence?: number } | null>(
        answer.llmSuggestionJson ?? null,
        null,
      );
      const suggestion =
        cached && typeof cached.suggestedScore === "number"
          ? {
              suggestedScore: Math.max(0, Math.min(q.points, cached.suggestedScore)),
              rationale: String(cached.rationale || ""),
              confidence: typeof cached.confidence === "number" ? cached.confidence : 0.5,
            }
          : await gradeShortWithLlm({
              stem: q.stem,
              guide: q.gradingGuide,
              accepted,
              student: answer.textAnswer || "",
              maxPoints: q.points,
            });
      // Do NOT set finalScore — teacher must approve
      await prisma.examAnswer.update({
        where: { id: answer.id },
        data: {
          maxScore: q.points,
          autoScore: suggestion.suggestedScore,
          finalScore: null,
          llmSuggestionJson: JSON.stringify(suggestion),
          gradedAt: new Date(),
        },
      });
    }
  }

  // Sum finals where present; short pending counts 0 until approved
  const refreshed = await prisma.examAnswer.findMany({ where: { attemptId } });
  total = refreshed.reduce((s, a) => s + (a.finalScore ?? 0), 0);

  await prisma.examAttempt.update({
    where: { id: attemptId },
    data: {
      totalScore: total,
      maxScore: maxTotal,
      gradeStatus: needsReview ? "needs_review" : "graded",
      gradeSummaryJson: JSON.stringify({
        needsReview,
        gradedAt: new Date().toISOString(),
      }),
    },
  });
}

export async function startExamGradeJob(examId: string, startedById: string, force = false) {
  const running = await prisma.examGradeJob.findFirst({
    where: { examId, status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (running) {
    const age = Date.now() - running.startedAt.getTime();
    if (age < 30 * 60_000) {
      return running; // idempotent: reuse in-flight job
    }
    await prisma.examGradeJob.update({
      where: { id: running.id },
      data: {
        status: "failed",
        error: "Job timeout — chạy lại",
        finishedAt: new Date(),
      },
    });
  }

  // Ensure late submits that only expired are included
  await prisma.examAttempt.updateMany({
    where: {
      examId,
      status: "in_progress",
      expiresAt: { lte: new Date() },
    },
    data: { status: "expired", submittedAt: new Date() },
  });

  const attempts = await prisma.examAttempt.findMany({
    where: {
      examId,
      status: { in: ["submitted", "expired"] },
      // CHỐT QUAN TRỌNG: bỏ qua bài đã chấm xong — bảo vệ điểm/nhận xét GV đã chốt
      ...(force ? {} : { gradeStatus: { not: "graded" } }),
    },
    select: { id: true, gradeStatus: true },
  });
  console.log(`[grade-job] exam=${examId} force=${force} selected=${attempts.length}`, JSON.stringify(attempts.slice(0, 20)));

  const job = await prisma.examGradeJob.create({
    data: {
      examId,
      startedById,
      status: "running",
      totalAttempts: attempts.length,
      doneAttempts: 0,
    },
  });

  // Fire-and-forget sequential grade (SQLite-friendly)
  void (async () => {
    try {
      for (const a of attempts) {
        await prisma.examAttempt.update({
          where: { id: a.id },
          data: { gradeStatus: "grading" },
        });
        await gradeOneAttempt(a.id);
        await prisma.examGradeJob.update({
          where: { id: job.id },
          data: { doneAttempts: { increment: 1 } },
        });
      }
      await prisma.examGradeJob.update({
        where: { id: job.id },
        data: { status: "done", finishedAt: new Date() },
      });
    } catch (err: any) {
      await prisma.examGradeJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: err?.message || String(err),
          finishedAt: new Date(),
        },
      });
    }
  })();

  return job;
}

export async function applyTeacherShortGrade(params: {
  attemptId: string;
  questionId: string;
  finalScore: number;
  teacherNote?: string;
}) {
  const answer = await prisma.examAnswer.findUnique({
    where: {
      attemptId_questionId: {
        attemptId: params.attemptId,
        questionId: params.questionId,
      },
    },
    include: { question: true, attempt: { include: { answers: true } } },
  });
  if (!answer) throw new Error("Không tìm thấy bài làm");
  const max = answer.maxScore ?? answer.question.points;
  const finalScore = Math.max(0, Math.min(max, params.finalScore));

  await prisma.examAnswer.update({
    where: { id: answer.id },
    data: {
      finalScore,
      teacherNote: params.teacherNote,
      gradedAt: new Date(),
    },
  });

  const answers = await prisma.examAnswer.findMany({ where: { attemptId: params.attemptId } });
  const total = answers.reduce((s, a) => {
    if (a.id === answer.id) return s + finalScore;
    return s + (a.finalScore ?? 0);
  }, 0);
  const pendingShort = await prisma.examAnswer.count({
    where: {
      attemptId: params.attemptId,
      finalScore: null,
      question: { type: "tra_loi_ngan" },
    },
  });

  await prisma.examAttempt.update({
    where: { id: params.attemptId },
    data: {
      totalScore: total,
      gradeStatus: pendingShort > 0 ? "needs_review" : "graded",
    },
  });

  return { finalScore, totalScore: total };
}
