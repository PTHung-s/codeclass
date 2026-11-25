import type { Exam, ExamAnswer, ExamAttempt, ExamQuestion, ExamTestCase, User } from "@prisma/client";
import { isStaffRole, safeJsonParse } from "./examTypes";

type Q = ExamQuestion & { testCases?: ExamTestCase[] };
type ExamFull = Exam & {
  questions?: Q[];
  createdBy?: Pick<User, "id" | "fullName" | "email"> | null;
  _count?: { attempts?: number; questions?: number };
};

function parseLangs(raw: string): string[] {
  return safeJsonParse<string[]>(raw, ["python", "cpp"]);
}

/** Public fields for one question (student-safe). */
export function serializeQuestionForStudent(q: Q) {
  const samples = (q.testCases || [])
    .filter((t) => t.kind === "mau" && t.status !== "loai_bo")
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((t) => ({
      id: t.id,
      input: t.input,
      output: t.output,
      mo_ta: t.note,
    }));

  return {
    id: q.id,
    ma_cau: q.code,
    loai: q.type,
    do_kho: q.difficulty,
    diem: q.points,
    orderIndex: q.orderIndex,
    stem: q.stem,
    mo_ta_de: q.statementExtra,
    rang_buoc: q.constraints,
    goi_y_io: safeJsonParse(q.ioHintJson, null),
    ngon_ngu: q.language,
    lua_chon: q.type === "trac_nghiem" ? safeJsonParse<string[]>(q.optionsJson, []) : undefined,
    testcase_mau: q.type === "thuc_hanh" ? samples : undefined,
    ky_nang: safeJsonParse<string[]>(q.skillIdsJson, []),
    tags: safeJsonParse<string[]>(q.tagsJson, []),
  };
}

/** Full question for staff (includes answers / solution). */
export function serializeQuestionForStaff(q: Q) {
  const base = serializeQuestionForStudent(q);
  const hidden = (q.testCases || [])
    .filter((t) => t.kind === "an")
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      input: t.input,
      output: t.output,
      thu_tu: t.orderIndex,
      muc_do: t.difficultyLevel,
      status: t.status,
      mo_ta: t.note,
      ngon_ngu_runner: t.runnerLanguage,
      has_generator: Boolean(t.generatorSource),
    }));

  return {
    ...base,
    dap_an_index: q.correctIndex,
    giai_thich: q.explanation,
    dap_an: safeJsonParse<string[]>(q.acceptedAnswersJson, []),
    huong_dan_cham: q.gradingGuide,
    code_dap_an: q.solutionCode,
    sinh_testcase: safeJsonParse(q.genConfigJson, null),
    testcase_an: hidden,
    testCases: (q.testCases || []).map((t) => ({
      id: t.id,
      kind: t.kind,
      input: t.input,
      output: t.output,
      thu_tu: t.orderIndex,
      muc_do: t.difficultyLevel,
      status: t.status,
      mo_ta: t.note,
      ngon_ngu_runner: t.runnerLanguage,
      generator_source: t.generatorSource,
    })),
  };
}

export function serializeExamListItem(exam: ExamFull, role?: string) {
  const staff = isStaffRole(role);
  const rawMax = exam.questions?.length
    ? exam.questions.reduce((s, q) => s + (Number(q.points) || 0), 0)
    : undefined;
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    subject: exam.subject,
    durationMinutes: exam.durationMinutes,
    scale: exam.scale,
    status: exam.status,
    openAt: exam.openAt,
    closeAt: exam.closeAt,
    courseId: exam.courseId,
    antiCheatMode: exam.antiCheatMode,
    showResults: exam.showResults,
    showRanking: exam.showRanking,
    showReview: exam.showReview,
    allowedLanguages: parseLangs(exam.allowedLanguages),
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
    questionCount: exam._count?.questions ?? exam.questions?.length,
    /** Tổng điểm thô các câu (trước khi map thang) — chỉ khi questions được include. */
    rawMaxScore: rawMax,
    attemptCount: staff ? exam._count?.attempts : undefined,
    createdBy: exam.createdBy
      ? { id: exam.createdBy.id, fullName: exam.createdBy.fullName }
      : undefined,
    teacherNote: staff ? exam.teacherNote : undefined,
  };
}

/** Map raw point total onto exam.scale (e.g. 85/100 raw points → scale 10). */
export function scaleScore(raw: number | null | undefined, rawMax: number | null | undefined, scale: number): number | null {
  if (raw == null || rawMax == null || rawMax <= 0) return raw == null ? null : raw;
  const s = scale > 0 ? scale : 100;
  return Math.round((raw / rawMax) * s * 100) / 100;
}

export function serializeExamDetail(exam: ExamFull, role?: string) {
  const staff = isStaffRole(role);
  const questions = (exam.questions || [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((q) => (staff ? serializeQuestionForStaff(q) : serializeQuestionForStudent(q)));

  return {
    ...serializeExamListItem(exam, role),
    teacherNote: staff ? exam.teacherNote : undefined,
    questions,
  };
}

export function serializeAttempt(
  attempt: ExamAttempt & {
    answers?: (ExamAnswer & { question?: ExamQuestion })[];
    student?: Pick<User, "id" | "fullName" | "email" | "avatarUrl">;
  },
  opts: {
    includeAnswers?: boolean;
    includeGrades?: boolean;
    staff?: boolean;
    examScale?: number;
  } = {},
) {
  const { includeAnswers = true, includeGrades = false, staff = false, examScale = 100 } = opts;
  const pendingShort = (attempt.answers || []).filter(
    (a) => a.finalScore == null && (a.question?.type === "tra_loi_ngan" || a.llmSuggestionJson),
  ).length;
  const showScore = includeGrades || staff;
  const scaledTotal = showScore
    ? scaleScore(attempt.totalScore, attempt.maxScore, examScale)
    : undefined;
  const contentSnapshot = safeJsonParse((attempt as any).contentSnapshotJson, null);
  const pause = safeJsonParse((attempt as any).pauseJson ?? null, null);
  return {
    id: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    gradeStatus: attempt.gradeStatus,
    /** GV tạm dừng bài: { paused, by, at } | null */
    pause,
    pendingShortReview: showScore ? pendingShort > 0 || attempt.gradeStatus === "needs_review" : undefined,
    totalScore: showScore ? attempt.totalScore : undefined,
    maxScore: showScore ? attempt.maxScore : undefined,
    /** Điểm đã map sang thang đề (scale). */
    scaledTotalScore: scaledTotal,
    scaledMaxScore: showScore ? examScale : undefined,
    contentSnapshot,
    gradeSummary: showScore ? safeJsonParse(attempt.gradeSummaryJson, null) : undefined,
    student: attempt.student
      ? {
          id: attempt.student.id,
          fullName: attempt.student.fullName,
          email: attempt.student.email,
          avatarUrl: attempt.student.avatarUrl,
        }
      : undefined,
    answers: includeAnswers
      ? (attempt.answers || []).map((a) => ({
          questionId: a.questionId,
          selectedIndex: a.selectedIndex,
          textAnswer: a.textAnswer,
          codeAnswer: a.codeAnswer,
          codeLanguage: a.codeLanguage,
          isFlagged: a.isFlagged,
          ...(showScore
            ? {
                autoScore: a.autoScore,
                finalScore: a.finalScore,
                maxScore: a.maxScore,
                needsTeacherReview:
                  a.finalScore == null &&
                  (a.question?.type === "tra_loi_ngan" || Boolean(a.llmSuggestionJson)),
                autoDetail: safeJsonParse(a.autoDetailJson, null),
                llmSuggestion: safeJsonParse(a.llmSuggestionJson, null),
                teacherNote: a.teacherNote,
                gradedAt: a.gradedAt,
              }
            : {}),
        }))
      : undefined,
  };
}

/** True if student may still edit answers. */
export function attemptIsWritable(attempt: Pick<ExamAttempt, "status" | "expiresAt">, now = new Date()): boolean {
  if (attempt.status !== "in_progress") return false;
  return attempt.expiresAt.getTime() > now.getTime();
}
