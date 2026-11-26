import { Router, Request, Response } from "express";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { parseAndValidateExamJson, ExamImportError } from "../services/examImport";
import {
  serializeExamDetail,
  serializeExamListItem,
  serializeAttempt,
  serializeQuestionForStaff,
  serializeQuestionForStudent,
  attemptIsWritable,
  scaleScore,
} from "../services/examSerialize";
import { isStaffRole, safeJsonParse } from "../services/examTypes";
import {
  generateHiddenTestcases,
  approveTestcases,
  refreshExamReadyStatus,
  preflightSolution,
  preflightExamSolutions,
} from "../services/examTestcaseGen";
import { startExamGradeJob, applyTeacherShortGrade, suggestShortComment } from "../services/examGrading";
import { generateExamDraft } from "../services/examAiGenerator";
import {
  assertExamReadAccess,
  assertExamStartAccess,
  expireAttemptIfNeeded,
  hitRateLimit,
  maybeSweepExpiredAttempts,
  rateLimitHeartbeat,
  rateLimitRunSample,
  releaseGenLock,
  resolveCodeLanguage,
  tryAcquireGenLock,
} from "../services/examAttemptService";
import { runPythonCode } from "../utils/pythonRunner";
import { runCppCode } from "../utils/cppRunner";
import { publishCentrifugo } from "../services/centrifugo";
import { broadcastToStaff } from "../services/gameWebSocket";
import { notifyNotificationChanged } from "../services/notificationEvents";
import { resolveCourseStudents } from "../services/assignmentService";
import { ExamMsg } from "../services/examMessages";
import {
  buildShuffledPaper,
  snapshotMeta,
  shuffledToOriginal,
  originalToShuffled,
  convertDraft,
} from "../services/examShuffle";

const router = Router();
const STAFF = ["admin", "teacher", "teaching_assistant"] as const;
const MAX_VIOLATIONS_BEFORE_FORCE_SUBMIT = 8;

// Extend realtime channels
const examStaffChannel = (examId: string) => `exam_staff:${examId}`;

function emitExamStaff(examId: string, event: { type: string; payload: any }) {
  void publishCentrifugo(examStaffChannel(examId), event);
  broadcastToStaff(event);
}

function paramId(v: string | string[]): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

function serverNowPayload() {
  return { serverTime: new Date().toISOString() };
}

async function getExamOr404(id: string) {
  return prisma.exam.findUnique({
    where: { id },
    include: {
      questions: { include: { testCases: true }, orderBy: { orderIndex: "asc" as const } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      _count: { select: { attempts: true, questions: true } },
    },
  });
}

async function loadOwnedAttempt(examId: string, userId: string) {
  await maybeSweepExpiredAttempts();
  const attempt = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId: userId } },
    include: { answers: true },
  });
  if (!attempt) return null;
  const { changed } = await expireAttemptIfNeeded(attempt);
  if (!changed) return attempt;
  return prisma.examAttempt.findUnique({
    where: { id: attempt.id },
    include: { answers: true },
  });
}

// --- Import JSON ---
router.post("/import-json", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const doc = parseAndValidateExamJson(req.body?.document ?? req.body);
    const courseId = typeof req.body?.courseId === "string" ? req.body.courseId : null;

    if (courseId) {
      const c = await prisma.course.findUnique({ where: { id: courseId } });
      if (!c) {
        res.status(400).json({ error: ExamMsg.courseNotFound });
        return;
      }
    }

    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          courseId,
          title: doc.de_thi.tieu_de,
          description: doc.de_thi.mo_ta,
          subject: doc.de_thi.mon,
          durationMinutes: doc.de_thi.thoi_gian_phut,
          scale: doc.de_thi.thang_diem ?? 100,
          antiCheatMode: doc.de_thi.che_do_chat ?? "nghiem",
          showResults: Boolean(doc.de_thi.cho_xem_ket_qua),
          allowedLanguages: JSON.stringify(doc.de_thi.ngon_ngu_code ?? ["python", "cpp"]),
          teacherNote: doc.de_thi.ghi_chu_giao_vien,
          status: "draft",
          sourceJson: JSON.stringify(doc),
          createdById: req.user!.userId,
        },
      });

      for (let i = 0; i < doc.cau_hoi.length; i++) {
        const cq = doc.cau_hoi[i];
        const q = await tx.examQuestion.create({
          data: {
            examId: created.id,
            code: cq.ma_cau,
            type: cq.loai,
            difficulty: cq.do_kho,
            points: cq.diem,
            orderIndex: i,
            stem: cq.stem,
            optionsJson: cq.lua_chon ? JSON.stringify(cq.lua_chon) : null,
            correctIndex: cq.dap_an_index ?? null,
            explanation: cq.giai_thich ?? null,
            acceptedAnswersJson: cq.dap_an ? JSON.stringify(cq.dap_an) : null,
            gradingGuide: cq.huong_dan_cham ?? null,
            language: cq.ngon_ngu ?? null,
            statementExtra: cq.mo_ta_de ?? null,
            constraints: cq.rang_buoc ?? null,
            ioHintJson: cq.goi_y_io ? JSON.stringify(cq.goi_y_io) : null,
            solutionCode: cq.code_dap_an ?? null,
            genConfigJson: cq.sinh_testcase ? JSON.stringify(cq.sinh_testcase) : null,
            skillIdsJson: JSON.stringify(cq.ky_nang ?? []),
            tagsJson: JSON.stringify(cq.tags ?? []),
          },
        });

        if (cq.loai === "thuc_hanh" && cq.testcase_mau) {
          for (let j = 0; j < cq.testcase_mau.length; j++) {
            const s = cq.testcase_mau[j];
            await tx.examTestCase.create({
              data: {
                questionId: q.id,
                kind: "mau",
                input: s.input,
                output: s.output,
                orderIndex: j,
                difficultyLevel: 1,
                status: "da_duyet",
                runnerLanguage: cq.ngon_ngu,
                note: s.mo_ta,
              },
            });
          }
        }
      }
      return created;
    });

    await refreshExamReadyStatus(exam.id);
    const full = await getExamOr404(exam.id);
    res.status(201).json(serializeExamDetail(full!, req.user!.role));
  } catch (err: any) {
    if (err instanceof ExamImportError) {
      res.status(400).json({ error: err.message, details: err.details });
      return;
    }
    console.error("[exams/import-json]", err);
    res.status(500).json({ error: ExamMsg.importFailed });
  }
});

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const where: any = {};
    if (courseId) where.courseId = courseId;

    if (!isStaffRole(role)) {
      where.status = "published";
    }

    const exams = await prisma.exam.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        _count: { select: { attempts: true, questions: true } },
      },
      take: 200,
    });
    res.json(exams.map((e) => serializeExamListItem(e, role)));
  } catch (err) {
    console.error("[exams/list]", err);
    res.status(500).json({ error: ExamMsg.listFailed });
  }
});

// Nguồn câu hỏi có sẵn (Problems, QuizBankItem, QuizQuestion) để nhặt vào đề thi trên UI.
router.get("/question-sources", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));

    const [problems, rawQuizBankItems, lessonQuestions] = await Promise.all([
      prisma.problem.findMany({
        where: {
          status: { not: "archived" },
          ...(q ? { OR: [{ title: { contains: q } }, { shortDescription: { contains: q } }] } : {}),
        },
        select: {
          id: true,
          title: true,
          difficulty: true,
          statement: true,
          sampleInput: true,
          sampleOutput: true,
          teacherSolution: true,
          testCases: true,
          skillId: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.quizBankItem.findMany({
        where: {
          status: "approved",
          ...(q ? { stem: { contains: q } } : {}),
        },
        select: {
          id: true,
          stem: true,
          options: true,
          answerIndex: true,
          explanation: true,
          difficultyAuthored: true,
          testsSkill: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.quizQuestion.findMany({
        where: {
          ...(q ? { question: { contains: q } } : {}),
        },
        select: {
          id: true,
          question: true,
          options: true,
          correctIndex: true,
          difficulty: true,
          explanation: true,
          skillId: true,
          quiz: { select: { title: true } },
        },
        take: limit,
      }),
    ]);

    res.json({
      problems,
      quizBankItems: rawQuizBankItems.map((b) => ({
        ...b,
        difficulty: b.difficultyAuthored,
      })),
      lessonQuestions,
    });
  } catch (err) {
    console.error("[exams/question-sources]", err);
    res.status(500).json({ error: "Không tải được nguồn câu hỏi" });
  }
});

// AI tự sinh đề thi hoặc bộ câu hỏi theo yêu cầu giáo viên / ngữ cảnh khóa học.
router.post("/ai-generate", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const courseId = typeof req.body?.courseId === "string" && req.body.courseId.trim() ? req.body.courseId.trim() : undefined;
    if (!prompt && !courseId) {
      res.status(400).json({ error: "Vui lòng nhập chủ đề/mô tả yêu cầu hoặc chọn khóa học." });
      return;
    }

    const clamp = (v: unknown, min: number, max: number, def: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
    };
    const mcqCount = clamp(req.body?.mcqCount, 0, 20, 5);
    const shortAnswerCount = clamp(req.body?.shortAnswerCount, 0, 10, 0);
    const codingCount = clamp(req.body?.codingCount, 0, 6, 1);
    const total = mcqCount + shortAnswerCount + codingCount;
    if (total < 1 || total > 25) {
      res.status(400).json({ error: "Tổng số câu hỏi cần sinh phải từ 1 đến 25." });
      return;
    }

    const rawDiff = req.body?.difficulty;
    const difficulty = rawDiff === "easy" || rawDiff === "medium" || rawDiff === "hard" || rawDiff === "mixed" ? rawDiff : "mixed";
    const codeLanguage = req.body?.codeLanguage === "cpp" ? "cpp" : "python";
    const existingStems = Array.isArray(req.body?.existingStems)
      ? req.body.existingStems.map((s: unknown) => String(s ?? "").trim()).filter(Boolean).slice(0, 30)
      : undefined;

    const result = await generateExamDraft({
      prompt,
      courseId,
      mcqCount,
      shortAnswerCount,
      codingCount,
      difficulty,
      codeLanguage,
      existingStems,
    });
    res.json(result);
  } catch (err: any) {
    console.error("[exams/ai-generate]", err);
    const code = typeof err?.statusCode === "number" ? err.statusCode : 502;
    res.status(code).json({ error: err?.message || "AI chưa tạo được đề thi. Vui lòng thử lại." });
  }
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const access = await assertExamReadAccess(id, req.user!.userId, req.user!.role);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    const exam = await getExamOr404(id);
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    res.json(serializeExamDetail(exam, req.user!.role));
  } catch (err) {
    console.error("[exams/get]", err);
    res.status(500).json({ error: ExamMsg.getFailed });
  }
});

// --- Preview: giáo viên xem đề đúng như học sinh thấy (không lộ đáp án / testcase ẩn) ---
router.get("/:id/preview", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const exam = await getExamOr404(id);
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    // Serialize với role "student" rồi xào như học sinh thật (mỗi lần xem một kiểu).
    const detail = serializeExamDetail(exam, "student") as any;
    detail.questions = buildShuffledPaper(detail.questions || []);
    res.json({ ...detail, preview: true, ...serverNowPayload() });
  } catch (err) {
    console.error("[exams/preview]", err);
    res.status(500).json({ error: ExamMsg.getFailed });
  }
});

router.patch("/:id", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: paramId(req.params.id) } });
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    const b = req.body || {};
    const data: any = {};
    if (typeof b.title === "string") data.title = b.title;
    if (typeof b.description === "string") data.description = b.description;
    if (typeof b.durationMinutes === "number") data.durationMinutes = b.durationMinutes;
    if (typeof b.scale === "number") data.scale = b.scale;
    if (b.antiCheatMode === "nghiem" || b.antiCheatMode === "ghi_log") data.antiCheatMode = b.antiCheatMode;
    if (typeof b.showResults === "boolean") data.showResults = b.showResults;
    if (typeof b.showRanking === "boolean") data.showRanking = b.showRanking;
    if (typeof b.showReview === "boolean") data.showReview = b.showReview;
    if (typeof b.teacherNote === "string") data.teacherNote = b.teacherNote;
    if (b.courseId === null || typeof b.courseId === "string") data.courseId = b.courseId;
    if (b.openAt !== undefined) data.openAt = b.openAt ? new Date(b.openAt) : null;
    if (b.closeAt !== undefined) data.closeAt = b.closeAt ? new Date(b.closeAt) : null;
    if (Array.isArray(b.allowedLanguages)) data.allowedLanguages = JSON.stringify(b.allowedLanguages);

    const updated = await prisma.exam.update({ where: { id: exam.id }, data });
    const full = await getExamOr404(updated.id);
    res.json(serializeExamDetail(full!, req.user!.role));
  } catch (err) {
    console.error("[exams/patch]", err);
    res.status(500).json({ error: ExamMsg.patchFailed });
  }
});

router.post("/:id/publish", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const exam = await getExamOr404(paramId(req.params.id));
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    const force = Boolean(req.body?.force);
    if (!force) {
      const coding = exam.questions.filter((q) => q.type === "thuc_hanh");
      const missing = coding.filter(
        (q) => !q.testCases.some((t) => t.kind === "an" && t.status === "da_duyet"),
      );
      if (missing.length) {
        res.status(400).json({
          error: ExamMsg.missingHidden,
          missing: missing.map((q) => q.code),
          hint: ExamMsg.publishForceHint,
        });
        return;
      }
      const pre = await preflightExamSolutions(exam.id);
      if (!pre.ok) {
        res.status(400).json({
          error: ExamMsg.solutionSampleFail,
          preflight: pre.results,
        });
        return;
      }
    }
    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: {
        status: "published",
        openAt: req.body?.openAt ? new Date(req.body.openAt) : exam.openAt ?? new Date(),
        closeAt: req.body?.closeAt ? new Date(req.body.closeAt) : exam.closeAt,
      },
    });

    try {
      const existingNotif = await prisma.notification.findFirst({
        where: { type: "exam_published", relatedEntityId: exam.id },
        select: { id: true },
      });
      if (!existingNotif) {
        const { studentIds } = await resolveCourseStudents(exam.courseId);
        if (studentIds.length > 0) {
          await prisma.notification.createMany({
            data: studentIds.map((uid) => ({
              userId: uid,
              title: "Phòng thi mới mở",
              message: `Phòng thi "${exam.title}" (${exam.durationMinutes} phút) đã mở.`,
              type: "exam_published",
              relatedEntityType: "exam",
              relatedEntityId: exam.id,
            })),
          });
          for (const uid of studentIds) notifyNotificationChanged(uid);
        }
      }
    } catch { /* fail-soft */ }

    res.json({ id: updated.id, status: updated.status, openAt: updated.openAt, closeAt: updated.closeAt });
  } catch (err) {
    console.error("[exams/publish]", err);
    res.status(500).json({ error: ExamMsg.publishFailed });
  }
});

router.post("/:id/close", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const updated = await prisma.exam.update({
      where: { id: paramId(req.params.id) },
      data: { status: "closed", closeAt: new Date() },
    });
    res.json({ id: updated.id, status: updated.status });
  } catch {
    res.status(500).json({ error: ExamMsg.closeFailed });
  }
});

// Xóa đề (chỉ khi chưa có bài nộp) — dùng khi muốn import lại bản đề mới
router.delete("/:id", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: { attempts: { select: { status: true } } },
    });
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    const hasSubmitted = exam.attempts.some((a) => a.status === "submitted" || a.status === "expired");
    if (hasSubmitted) {
      res.status(400).json({ error: "Đã có bài nộp — không xóa được đề này" });
      return;
    }
    await prisma.exam.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[exams/delete]", err);
    res.status(500).json({ error: "Xóa đề thất bại" });
  }
});

async function handleGenerateTests(req: Request, res: Response, replacePending: boolean) {
  const qid = paramId(req.params.qid);
  const examId = paramId(req.params.id);
  if (!tryAcquireGenLock(qid)) {
    res.status(429).json({ error: ExamMsg.genBusy });
    return;
  }
  try {
    const q = await prisma.examQuestion.findFirst({
      where: { id: qid, examId },
    });
    if (!q) {
      res.status(404).json({ error: ExamMsg.questionNotFound });
      return;
    }
    const pre = await preflightSolution(q.id);
    if (!pre.ok) {
      res.status(400).json({
        error: ExamMsg.solutionSampleFailNoGen,
        preflight: pre,
      });
      return;
    }
    const count = typeof req.body?.count === "number" ? req.body.count : undefined;
    const result = await generateHiddenTestcases(q.id, { count, replacePending });
    await refreshExamReadyStatus(examId);
    const full = await prisma.examQuestion.findUnique({
      where: { id: q.id },
      include: { testCases: true },
    });
    res.json({ ...result, preflight: pre, question: serializeQuestionForStaff(full!) });
  } catch (err: any) {
    console.error("[exams/generate-tests]", err);
    res.status(400).json({ error: err?.message || ExamMsg.genFailed });
  } finally {
    releaseGenLock(qid);
  }
}

router.post(
  "/:id/questions/:qid/generate-tests",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    await handleGenerateTests(req, res, true);
  },
);

router.post(
  "/:id/questions/:qid/regenerate-tests",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    await handleGenerateTests(req, res, true);
  },
);

router.post(
  "/:id/questions/:qid/preflight",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    try {
      const result = await preflightSolution(paramId(req.params.qid));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || ExamMsg.preflightFailed });
    }
  },
);

router.patch(
  "/:id/questions/:qid/testcases",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    try {
      const items = Array.isArray(req.body?.testcases) ? req.body.testcases : [];
      for (const it of items) {
        if (typeof it.id !== "string") continue;
        const data: any = {};
        if (typeof it.input === "string") data.input = it.input;
        if (typeof it.output === "string") data.output = it.output;
        if (typeof it.mo_ta === "string" || typeof it.note === "string") data.note = it.mo_ta ?? it.note;
        if (typeof it.muc_do === "number") data.difficultyLevel = it.muc_do;
        if (typeof it.status === "string") data.status = it.status;
        if (typeof it.kind === "string") data.kind = it.kind;
        await prisma.examTestCase.updateMany({
          where: { id: it.id, questionId: paramId(req.params.qid) },
          data,
        });
      }
      const full = await prisma.examQuestion.findUnique({
        where: { id: paramId(req.params.qid) },
        include: { testCases: true },
      });
      await refreshExamReadyStatus(paramId(req.params.id));
      res.json(serializeQuestionForStaff(full!));
    } catch (err) {
      res.status(500).json({ error: ExamMsg.patchFailed });
    }
  },
);

router.post(
  "/:id/questions/:qid/testcases/approve",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.testCaseIds) ? req.body.testCaseIds.map(String) : undefined;
      const count = await approveTestcases(paramId(req.params.qid), ids);
      await refreshExamReadyStatus(paramId(req.params.id));
      res.json({ approved: count });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || ExamMsg.approveTcFailed });
    }
  },
);

// ---
router.post("/:id/attempt/start", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const access = await assertExamStartAccess(examId, req.user!.userId, req.user!.role);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    const exam = access.exam;

    const existingRaw = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: req.user!.userId } },
      include: { answers: true },
    });

    if (existingRaw) {
      const exp = await expireAttemptIfNeeded(existingRaw);
      const existing = exp.changed
        ? await prisma.examAttempt.findUnique({
            where: { id: existingRaw.id },
            include: { answers: true },
          }) || existingRaw
        : existingRaw;
      if (existing.status === "submitted" || existing.status === "expired") {
        res.status(400).json({
          error: ExamMsg.attemptDone,
          attempt: serializeAttempt(existing as any, { examScale: exam.scale }),
          ...serverNowPayload(),
        });
        return;
      }
      if (!attemptIsWritable(existing)) {
        res.status(400).json({ error: ExamMsg.timeUp, attemptId: existing.id, ...serverNowPayload() });
        return;
      }
      res.json({
        resumed: true,
        attempt: serializeAttempt(existing as any, { examScale: exam.scale }),
        ...serverNowPayload(),
      });
      return;
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + exam.durationMinutes * 60_000);
    const fullForSnap = await getExamOr404(exam.id);
    // Xào thứ tự câu + lựa chọn MCQ riêng cho từng học sinh.
    const snapQs = buildShuffledPaper(
      (fullForSnap?.questions || []).map((q) => serializeQuestionForStudent(q as any)),
    );
    const attempt = await prisma.examAttempt.create({
      data: {
        examId: exam.id,
        studentId: req.user!.userId,
        status: "in_progress",
        startedAt,
        expiresAt,
        contentSnapshotJson: JSON.stringify(snapQs),
      },
      include: { answers: true },
    });
    await prisma.examLiveSnapshot.create({
      data: {
        examId: exam.id,
        attemptId: attempt.id,
        studentId: req.user!.userId,
        draftJson: "{}",
      },
    });
    res.status(201).json({
      resumed: false,
      attempt: serializeAttempt(attempt, { examScale: exam.scale }),
      ...serverNowPayload(),
    });
  } catch (err) {
    console.error("[exams/attempt/start]", err);
    res.status(500).json({ error: ExamMsg.startFailed });
  }
});

router.get("/:id/attempt/me", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const access = await assertExamReadAccess(examId, req.user!.userId, req.user!.role);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    let attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
      include: {
        answers: { include: { question: true } },
        student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
    });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.noAttempt });
      return;
    }
    { const exp = await expireAttemptIfNeeded(attempt);
      if (exp.changed) {
        attempt = await prisma.examAttempt.findUnique({
          where: { id: attempt.id },
          include: {
            answers: { include: { question: true } },
            student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
        }) as typeof attempt;
      } }
    const exam = access.exam;
    const showGrades = isStaffRole(req.user!.role) || Boolean(exam.showResults);
    // Học sinh nhận selectedIndex theo thứ tự lựa chọn đã xào (khớp snapshot để resume đúng).
    if (!isStaffRole(req.user!.role) && (attempt as any).contentSnapshotJson && attempt.answers) {
      const meta = snapshotMeta((attempt as any).contentSnapshotJson);
      if (meta.size) {
        (attempt as any).answers = attempt.answers.map((a) => {
          const m = meta.get(a.questionId);
          if (m?.perm && a.selectedIndex != null && a.question?.type === "trac_nghiem") {
            return { ...a, selectedIndex: originalToShuffled(m.perm, a.selectedIndex) as number };
          }
          return a;
        });
      }
    }
    res.json({
      ...serializeAttempt(attempt as any, {
        includeGrades: showGrades,
        staff: isStaffRole(req.user!.role),
        examScale: exam.scale,
      }),
      ...serverNowPayload(),
    });
  } catch {
    res.status(500).json({ error: ExamMsg.attemptLoadFailed });
  }
});

// ---
router.put("/:id/attempt/answers", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    // Đường nóng (autosave mỗi vài giây): KHÔNG sweep ở đây — sweep chạy theo timer 60s toàn cục.
    let attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
    });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.notStarted });
      return;
    }
    { const exp = await expireAttemptIfNeeded(attempt);
      if (exp.changed) {
        attempt = await prisma.examAttempt.findUnique({ where: { id: attempt.id } }) as typeof attempt;
      } }
    if (!attemptIsWritable(attempt)) {
      res.status(400).json({ error: ExamMsg.cannotEdit, ...serverNowPayload() });
      return;
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const questions = await prisma.examQuestion.findMany({
      where: { examId },
      select: { id: true, type: true, language: true },
    });
    const qmap = new Map(questions.map((q) => [q.id, q]));
    const meta = snapshotMeta((attempt as any).contentSnapshotJson);

    // Đọc 1 lần toàn bộ đáp án hiện có, chỉ GHI những câu thực sự thay đổi
    // (client autosave có thể gửi cả 25-40 câu trong khi phần lớn không đổi).
    const existingRows = await prisma.examAnswer.findMany({ where: { attemptId: attempt.id } });
    const exMap = new Map(existingRows.map((r) => [r.questionId, r]));

    for (const a of answers) {
      if (typeof a.questionId !== "string" || !qmap.has(a.questionId)) continue;
      const qmeta = qmap.get(a.questionId)!;
      const data: Record<string, unknown> = {};
      if ("selectedIndex" in a) {
        // Client gửi vị trí trong danh sách đã xào → lưu theo thứ tự gốc.
        let si: unknown = typeof a.selectedIndex === "number" ? a.selectedIndex : null;
        if (si != null && qmeta.type === "trac_nghiem") {
          si = shuffledToOriginal(meta.get(a.questionId)?.perm, si);
        }
        data.selectedIndex = si;
      }
      if ("textAnswer" in a) {
        data.textAnswer = typeof a.textAnswer === "string" ? a.textAnswer : null;
      }
      if ("codeAnswer" in a) {
        data.codeAnswer = typeof a.codeAnswer === "string" ? a.codeAnswer : null;
      }
      if ("codeLanguage" in a || "codeAnswer" in a) {
        data.codeLanguage = resolveCodeLanguage(
          qmeta.language,
          typeof a.codeLanguage === "string" ? a.codeLanguage : null,
        );
      }
      if ("isFlagged" in a) {
        data.isFlagged = Boolean(a.isFlagged);
      }
      if (Object.keys(data).length === 0) continue;

      const existing = exMap.get(a.questionId);
      if (!existing) {
        const created = await prisma.examAnswer.create({
          data: {
            attemptId: attempt.id,
            questionId: a.questionId,
            selectedIndex: (data.selectedIndex as number | null) ?? null,
            textAnswer: (data.textAnswer as string | null) ?? null,
            codeAnswer: (data.codeAnswer as string | null) ?? null,
            codeLanguage: (data.codeLanguage as string | null) ?? null,
            isFlagged: Boolean(data.isFlagged),
          },
        });
        exMap.set(a.questionId, created);
      } else {
        // So sánh trước khi ghi — bỏ qua câu không đổi để giảm ghi SQLite
        const changed =
          (("selectedIndex" in data) && (existing.selectedIndex ?? null) !== (data.selectedIndex as number | null)) ||
          (("textAnswer" in data) && (existing.textAnswer ?? null) !== (data.textAnswer as string | null)) ||
          (("codeAnswer" in data) && (existing.codeAnswer ?? null) !== (data.codeAnswer as string | null)) ||
          (("codeLanguage" in data) && (existing.codeLanguage ?? null) !== (data.codeLanguage as string | null)) ||
          (("isFlagged" in data) && existing.isFlagged !== Boolean(data.isFlagged));
        if (changed) {
          await prisma.examAnswer.update({ where: { id: existing.id }, data });
          Object.assign(existing, {
            selectedIndex: (data.selectedIndex as number | null) ?? existing.selectedIndex,
            textAnswer: (data.textAnswer as string | null) ?? existing.textAnswer,
            codeAnswer: (data.codeAnswer as string | null) ?? existing.codeAnswer,
            codeLanguage: (data.codeLanguage as string | null) ?? existing.codeLanguage,
            isFlagged: "isFlagged" in data ? Boolean(data.isFlagged) : existing.isFlagged,
          });
        }
      }
    }

    if (req.body?.currentQuestionId || req.body?.draft) {
      const draftConv = convertDraft(req.body.draft ?? {}, meta, "toOriginal");
      await prisma.examLiveSnapshot.upsert({
        where: { attemptId: attempt.id },
        create: {
          examId,
          attemptId: attempt.id,
          studentId: req.user!.userId,
          currentQuestionId: typeof req.body.currentQuestionId === "string" ? req.body.currentQuestionId : null,
          draftJson: JSON.stringify(draftConv),
        },
        update: {
          currentQuestionId:
            typeof req.body.currentQuestionId === "string" ? req.body.currentQuestionId : undefined,
          draftJson: req.body.draft !== undefined ? JSON.stringify(draftConv) : undefined,
          lastSeenAt: new Date(),
        },
      });
      emitExamStaff(examId, {
        type: "exam_live",
        payload: {
          examId,
          studentId: req.user!.userId,
          attemptId: attempt.id,
          currentQuestionId: req.body.currentQuestionId ?? null,
        },
      });
    }

    res.json({ ok: true, ...serverNowPayload(), expiresAt: attempt.expiresAt.toISOString() });
  } catch (err) {
    console.error("[exams/answers]", err);
    res.status(500).json({ error: ExamMsg.saveFailed });
  }
});

// ---
router.post("/:id/attempt/run-sample", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const rl = rateLimitRunSample(req.user!.userId, examId);
    if (!rl.ok) {
      res.status(429).json({ error: ExamMsg.runSampleFast, retryAfterMs: rl.retryAfterMs });
      return;
    }
    let attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
    });
    // Chế độ xem trước: staff chưa có attempt vẫn được chạy sample để kiểm tra đề.
    const staffPreview = isStaffRole(req.user!.role) && !attempt;
    if (!attempt && !staffPreview) {
      res.status(400).json({ error: ExamMsg.cannotRun });
      return;
    }
    if (attempt) {
      const exp = await expireAttemptIfNeeded(attempt);
      if (exp.changed) {
        attempt = await prisma.examAttempt.findUnique({ where: { id: attempt.id } }) as typeof attempt;
      }
      if (!attemptIsWritable(attempt)) {
        res.status(400).json({ error: ExamMsg.cannotRun });
        return;
      }
    }
    const questionId = String(req.body?.questionId || "");
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code.trim()) {
      res.status(400).json({ error: ExamMsg.missingCode });
      return;
    }
    const q = await prisma.examQuestion.findFirst({
      where: { id: questionId, examId, type: "thuc_hanh" },
      include: { testCases: { where: { kind: "mau" } } },
    });
    if (!q) {
      res.status(404).json({ error: ExamMsg.codingNotFound });
      return;
    }
    const language = resolveCodeLanguage(q.language, req.body?.language);
    const samples = q.testCases;
    const results = [];
    for (let i = 0; i < samples.length; i++) {
      const tc = samples[i];
      const run = language === "cpp" ? await runCppCode(code, tc.input) : await runPythonCode(code, tc.input);
      const stdout = (run.stdout || "").replace(/\r\n/g, "\n").trimEnd();
      const expected = (tc.output || "").replace(/\r\n/g, "\n").trimEnd();
      results.push({
        testNum: i + 1,
        passed: run.status === "success" && stdout === expected,
        status: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        expected: tc.output,
        hidden: false,
      });
    }
    res.json({
      passedCount: results.filter((r) => r.passed).length,
      totalTests: results.length,
      language,
      results,
      ...serverNowPayload(),
    });
  } catch (err) {
    console.error("[exams/run-sample]", err);
    res.status(500).json({ error: ExamMsg.runSampleFailed });
  }
});

// ---
router.post("/:id/attempt/submit", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    let attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
    });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.noAttempt });
      return;
    }
    { const exp = await expireAttemptIfNeeded(attempt);
      if (exp.changed) {
        attempt = await prisma.examAttempt.findUnique({ where: { id: attempt.id } }) as typeof attempt;
      } }
    if (attempt.status === "submitted" || attempt.status === "expired") {
      res.json({ ok: true, attempt: serializeAttempt(attempt), ...serverNowPayload() });
      return;
    }
    const now = new Date();
    const expired = attempt.expiresAt.getTime() <= now.getTime();
    const updated = await prisma.examAttempt.update({
      where: { id: attempt.id },
      data: {
        status: expired ? "expired" : "submitted",
        submittedAt: now,
      },
      include: { answers: true },
    });
    emitExamStaff(examId, {
      type: "exam_submitted",
      payload: { examId, studentId: req.user!.userId, attemptId: attempt.id },
    });
    res.json({ ok: true, attempt: serializeAttempt(updated), ...serverNowPayload() });
  } catch {
    res.status(500).json({ error: ExamMsg.submitFailed });
  }
});

// --- Heartbeat + violations ---
router.post("/:id/attempt/heartbeat", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const rl = rateLimitHeartbeat(req.user!.userId, examId);
    if (!rl.ok) {
      res.status(429).json({ error: ExamMsg.heartbeatFast, retryAfterMs: rl.retryAfterMs });
      return;
    }
    // Đường nóng 4s/HS: không sweep ở đây (timer 60s toàn cục đã lo).
    let attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
    });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.noAttempt });
      return;
    }
    { const exp = await expireAttemptIfNeeded(attempt);
      if (exp.changed) {
        attempt = await prisma.examAttempt.findUnique({ where: { id: attempt.id } }) as typeof attempt;
      } }
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    const meta = snapshotMeta((attempt as any).contentSnapshotJson);
    const draftConv = convertDraft(req.body?.draft ?? {}, meta, "toOriginal");
    const pauseInfo = safeJsonParse<{ paused?: boolean } | null>((attempt as any).pauseJson ?? null, null);
    const isPaused = Boolean(pauseInfo?.paused);
    const now = new Date();
    const remainingMs = Math.max(0, attempt.expiresAt.getTime() - now.getTime());

    // Đang tạm dừng (GV pause): ghi nhận presence nhưng BỎ QUA mọi violation.
    const violations = Array.isArray(req.body?.violations) ? req.body.violations : [];
    if (!isPaused) {
      for (const v of violations.slice(0, 20)) {
        await prisma.examViolation.create({
          data: {
            attemptId: attempt.id,
            studentId: req.user!.userId,
            type: String(v.type || "unknown").slice(0, 80),
            detail: typeof v.detail === "string" ? v.detail.slice(0, 500) : null,
          },
        });
      }
    }

    const snap = await prisma.examLiveSnapshot.upsert({
      where: { attemptId: attempt.id },
      create: {
        examId,
        attemptId: attempt.id,
        studentId: req.user!.userId,
        currentQuestionId: typeof req.body?.currentQuestionId === "string" ? req.body.currentQuestionId : null,
        draftJson: JSON.stringify(draftConv),
        violationCount: isPaused ? 0 : violations.length,
        lastSeenAt: now,
      },
      update: {
        currentQuestionId:
          typeof req.body?.currentQuestionId === "string" ? req.body.currentQuestionId : undefined,
        draftJson: req.body?.draft !== undefined ? JSON.stringify(draftConv) : undefined,
        violationCount: !isPaused && violations.length ? { increment: violations.length } : undefined,
        lastSeenAt: now,
      },
    });

    let forceSubmitted = false;
    if (
      !isPaused &&
      exam?.antiCheatMode === "nghiem" &&
      attempt.status === "in_progress" &&
      snap.violationCount >= MAX_VIOLATIONS_BEFORE_FORCE_SUBMIT
    ) {
      attempt = await prisma.examAttempt.update({
        where: { id: attempt.id },
        data: { status: "submitted", submittedAt: now },
      });
      forceSubmitted = true;
      emitExamStaff(examId, {
        type: "exam_force_submit",
        payload: {
          examId,
          studentId: req.user!.userId,
          attemptId: attempt.id,
          reason: "too_many_violations",
        },
      });
    }

    emitExamStaff(examId, {
      type: "exam_heartbeat",
      payload: {
        examId,
        studentId: req.user!.userId,
        attemptId: attempt.id,
        currentQuestionId: snap.currentQuestionId,
        violationCount: snap.violationCount,
        lastSeenAt: snap.lastSeenAt,
        draft: draftConv ?? null,
      },
    });

    res.json({
      ok: true,
      ...serverNowPayload(),
      expiresAt: attempt.expiresAt.toISOString(),
      remainingMs: forceSubmitted ? 0 : remainingMs,
      status: attempt.status,
      paused: isPaused,
      violationCount: snap.violationCount,
      forceSubmitted,
      maxViolations: MAX_VIOLATIONS_BEFORE_FORCE_SUBMIT,
    });
  } catch (err) {
    console.error("[exams/heartbeat]", err);
    res.status(500).json({ error: ExamMsg.heartbeatFailed });
  }
});

// --- Tạm dừng bài thi của 1 học sinh (GV điều khiển từ Monitor, trường hợp khẩn cấp) ---
router.post("/:id/monitor/:attemptId/pause", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const attemptId = paramId(req.params.attemptId);
    const paused = Boolean(req.body?.paused);
    const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId, examId } });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    const cur = safeJsonParse<{ paused?: boolean; at?: string } | null>(attempt.pauseJson ?? null, null);
    if (paused === Boolean(cur?.paused)) {
      res.json({ ok: true, paused: Boolean(cur?.paused) });
      return;
    }
    const now = new Date();
    let data: Record<string, unknown>;
    if (paused) {
      data = { pauseJson: JSON.stringify({ paused: true, by: "teacher", at: now.toISOString() }) };
    } else {
      // Resume: cộng lại thời gian bị tạm dừng vào expiresAt
      let expiresAt = attempt.expiresAt;
      if (attempt.status === "in_progress" && cur?.at) {
        const pausedAt = Date.parse(cur.at);
        if (Number.isFinite(pausedAt) && now.getTime() > pausedAt) {
          expiresAt = new Date(
            Math.min(expiresAt.getTime() + (now.getTime() - pausedAt), now.getTime() + 24 * 3_600_000),
          );
        }
      }
      data = { pauseJson: null, expiresAt };
    }
    const updated = await prisma.examAttempt.update({ where: { id: attempt.id }, data });
    emitExamStaff(examId, {
      type: "exam_pause",
      payload: { examId, attemptId: attempt.id, studentId: attempt.studentId, paused },
    });
    res.json({ ok: true, paused, expiresAt: updated.expiresAt.toISOString(), ...serverNowPayload() });
  } catch (err) {
    console.error("[exams/pause]", err);
    res.status(500).json({ error: ExamMsg.heartbeatFailed });
  }
});

// Gia hạn thêm phút hoặc mở lại bài cho 1 học sinh khi gặp sự cố mạng/hết giờ
router.post("/:id/monitor/:attemptId/extend", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const attemptId = paramId(req.params.attemptId);
    const rawMin = Number(req.body?.addMinutes);
    const addMinutes = Number.isFinite(rawMin) ? Math.max(1, Math.min(180, Math.round(rawMin))) : 10;
    const reopen = Boolean(req.body?.reopen);
    const forceReopen = Boolean(req.body?.forceReopen);

    const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId, examId } });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }

    const now = new Date();
    let updated;
    if (attempt.status === "in_progress") {
      const baseMs = Math.max(attempt.expiresAt.getTime(), now.getTime());
      const expiresAt = new Date(baseMs + addMinutes * 60_000);
      updated = await prisma.examAttempt.update({
        where: { id: attempt.id },
        data: { expiresAt },
      });
    } else {
      if (!reopen) {
        res.status(400).json({ error: "Bài thi đã kết thúc — cần xác nhận mở lại (reopen: true)." });
        return;
      }
      if (attempt.gradeStatus === "graded" && !forceReopen) {
        res.status(400).json({ error: "Bài thi đã chấm xong — cần xác nhận forceReopen để mở lại." });
        return;
      }
      const expiresAt = new Date(now.getTime() + addMinutes * 60_000);
      updated = await prisma.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "in_progress",
          submittedAt: null,
          pauseJson: null,
          expiresAt,
          ...(attempt.gradeStatus !== "ungraded" ? { gradeStatus: "ungraded" } : {}),
        },
      });
    }

    emitExamStaff(examId, {
      type: "exam_pause",
      payload: { examId, attemptId: attempt.id, studentId: attempt.studentId, extendedMinutes: addMinutes, reopened: reopen },
    });
    res.json({
      ok: true,
      status: updated.status,
      expiresAt: updated.expiresAt.toISOString(),
      ...serverNowPayload(),
    });
  } catch (err) {
    console.error("[exams/extend]", err);
    res.status(500).json({ error: "Không gia hạn được thời gian thi" });
  }
});

// Học sinh tự tiếp tục sau khi GV tạm dừng
router.post("/:id/attempt/resume-pause", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
    });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.noAttempt });
      return;
    }
    const cur = safeJsonParse<{ paused?: boolean; at?: string } | null>(attempt.pauseJson ?? null, null);
    if (!cur?.paused) {
      res.json({ ok: true, paused: false, ...serverNowPayload() });
      return;
    }
    const now = new Date();
    let expiresAt = attempt.expiresAt;
    if (attempt.status === "in_progress" && cur.at) {
      const pausedAt = Date.parse(cur.at);
      if (Number.isFinite(pausedAt) && now.getTime() > pausedAt) {
        expiresAt = new Date(
          Math.min(expiresAt.getTime() + (now.getTime() - pausedAt), now.getTime() + 24 * 3_600_000),
        );
      }
    }
    await prisma.examAttempt.update({ where: { id: attempt.id }, data: { pauseJson: null, expiresAt } });
    emitExamStaff(examId, {
      type: "exam_pause",
      payload: { examId, attemptId: attempt.id, studentId: attempt.studentId, paused: false },
    });
    res.json({ ok: true, paused: false, expiresAt: expiresAt.toISOString(), ...serverNowPayload() });
  } catch (err) {
    console.error("[exams/resume-pause]", err);
    res.status(500).json({ error: ExamMsg.heartbeatFailed });
  }
});

// --- HS xem lại bài làm chi tiết (khi GV bật "cho xem lại bài") ---
router.get("/:id/attempt/review", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const staff = isStaffRole(req.user!.role);
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        title: true,
        scale: true,
        showResults: true,
        showRanking: true,
        showReview: true,
        questions: { select: { id: true, correctIndex: true, explanation: true } },
      },
    });
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    const attempt = await prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: req.user!.userId } },
      include: { answers: true },
    });
    if (!attempt) {
      res.status(404).json({ error: ExamMsg.noAttempt });
      return;
    }
    const canSeeAnswers = staff || exam.showReview;
    const canSeeScore = staff || exam.showResults || exam.showReview;
    res.json({
      examId,
      title: exam.title,
      scale: exam.scale,
      status: attempt.status,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      gradeStatus: attempt.gradeStatus,
      canSeeAnswers,
      // Đề đúng như học sinh đã làm (thứ tự/lựa chọn đã xào riêng của em)
      snapshot: safeJsonParse(attempt.contentSnapshotJson ?? null, null),
      // Đáp án đúng + giải thích — chỉ trả khi GV đã mở
      questionsMeta: canSeeAnswers
        ? exam.questions.map((q) => ({ id: q.id, correctIndex: q.correctIndex, explanation: q.explanation }))
        : [],
      totalScore: canSeeScore ? attempt.totalScore : undefined,
      maxScore: canSeeScore ? attempt.maxScore : undefined,
      scaledTotalScore: canSeeScore ? scaleScore(attempt.totalScore, attempt.maxScore, exam.scale) : undefined,
      answers: (attempt.answers || []).map((a) => ({
        questionId: a.questionId,
        selectedIndex: a.selectedIndex, // index GỐC — client tự quy đổi qua _choice_perm khi render
        textAnswer: a.textAnswer,
        codeAnswer: a.codeAnswer,
        isFlagged: a.isFlagged,
        ...(canSeeAnswers
          ? {
              autoScore: a.autoScore,
              finalScore: a.finalScore,
              maxScore: a.maxScore,
              teacherNote: a.teacherNote,
              autoDetail: safeJsonParse(a.autoDetailJson ?? null, null),
            }
          : {}),
      })),
      ...serverNowPayload(),
    });
  } catch (err) {
    console.error("[exams/review]", err);
    res.status(500).json({ error: ExamMsg.getFailed });
  }
});

router.get("/:id/monitor", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const attempts = await prisma.examAttempt.findMany({
      where: { examId: paramId(req.params.id) },
      include: {
        student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        answers: true,
        liveSnap: true,
        violations: { orderBy: { createdAt: "desc" }, take: 20 },
      },
      orderBy: { startedAt: "asc" },
    });

    const examForQs = await prisma.exam.findUnique({
      where: { id: paramId(req.params.id) },
      include: { questions: { include: { testCases: true }, orderBy: { orderIndex: "asc" as const } } },
    });

    res.json({
      examId: paramId(req.params.id),
      channel: examStaffChannel(paramId(req.params.id)),
      // Đề theo góc nhìn học sinh — monitor render giống màn hình làm bài
      questions: examForQs ? serializeExamDetail(examForQs, "student").questions : [],
      students: attempts.map((a) => ({
        attempt: serializeAttempt(a, { includeAnswers: true, staff: true }),
        live: a.liveSnap
          ? {
              currentQuestionId: a.liveSnap.currentQuestionId,
              draft: safeJsonParse(a.liveSnap.draftJson, {}),
              violationCount: a.liveSnap.violationCount,
              lastSeenAt: a.liveSnap.lastSeenAt,
            }
          : null,
        recentViolations: a.violations.map((v) => ({
          id: v.id,
          type: v.type,
          detail: v.detail,
          createdAt: v.createdAt,
        })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: ExamMsg.monitorFailed });
  }
});

// --- Bảng xếp hạng — GV xem đầy đủ; HS xem khi GV đã công bố ---
router.get("/:id/ranking", authenticate, async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const staff = isStaffRole(req.user!.role);
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      res.status(404).json({ error: ExamMsg.notFound });
      return;
    }
    if (!staff && !exam.showRanking) {
      res.status(403).json({ error: ExamMsg.rankingNotPublished });
      return;
    }
    const attempts = await prisma.examAttempt.findMany({
      where: { examId, status: { in: ["submitted", "expired"] } },
      include: { student: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
    });
    const rows = attempts.map((a) => ({
      attemptId: a.id,
      studentId: a.studentId,
      fullName: a.student?.fullName || a.student?.email || "—",
      avatarUrl: a.student?.avatarUrl ?? null,
      status: a.status,
      gradeStatus: a.gradeStatus,
      submittedAt: a.submittedAt,
      rawScore: a.totalScore,
      maxScore: a.maxScore,
      scaledScore: scaleScore(a.totalScore, a.maxScore, exam.scale),
    }));
    rows.sort((x, y) => {
      const sx = x.scaledScore ?? -1;
      const sy = y.scaledScore ?? -1;
      if (sy !== sx) return sy - sx;
      const tx = x.submittedAt ? new Date(x.submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
      const ty = y.submittedAt ? new Date(y.submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
      return tx - ty;
    });
    const full = rows.map((r, i) => ({ rank: i + 1, ...r }));
    // HS: chỉ thấy hạng + tên + điểm (không lộ email/trạng thái chấm), đánh dấu chính mình
    const ranking = staff
      ? full
      : full.map((r) => ({
          rank: r.rank,
          fullName: r.fullName,
          scaledScore: r.scaledScore,
          isMe: r.studentId === req.user!.userId,
        }));
    res.json({
      examId,
      scale: exam.scale,
      showResults: exam.showResults,
      showRanking: exam.showRanking,
      staff,
      ranking,
    });
  } catch (err) {
    console.error("[exams/ranking]", err);
    res.status(500).json({ error: ExamMsg.getFailed });
  }
});

router.post("/:id/grade/start", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const job = await startExamGradeJob(paramId(req.params.id), req.user!.userId, Boolean(req.body?.force));
    res.status(201).json(job);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || ExamMsg.gradeStartFailed });
  }
});

router.get("/:id/grade/status", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const jobs = await prisma.examGradeJob.findMany({
      where: { examId: paramId(req.params.id) },
      orderBy: { startedAt: "desc" },
      take: 5,
    });
    const attempts = await prisma.examAttempt.findMany({
      where: { examId: paramId(req.params.id), status: { in: ["submitted", "expired"] } },
      include: {
        student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        answers: { include: { question: true } },
      },
    });
    res.json({
      jobs,
      attempts: attempts.map((a) => ({
        ...serializeAttempt(a as any, { includeAnswers: true, includeGrades: true, staff: true }),
        answers: (a.answers || []).map((ans) => ({
          questionId: ans.questionId,
          selectedIndex: ans.selectedIndex,
          textAnswer: ans.textAnswer,
          codeAnswer: ans.codeAnswer,
          codeLanguage: ans.codeLanguage,
          isFlagged: ans.isFlagged,
          autoScore: ans.autoScore,
          finalScore: ans.finalScore,
          maxScore: ans.maxScore,
          autoDetail: ans.autoDetailJson ? safeJsonParse(ans.autoDetailJson, null) : null,
          llmSuggestion: ans.llmSuggestionJson ? safeJsonParse(ans.llmSuggestionJson, null) : null,
          teacherNote: ans.teacherNote,
          gradedAt: ans.gradedAt,
          question: ans.question
            ? {
                id: ans.question.id,
                code: ans.question.code,
                type: ans.question.type,
                stem: ans.question.stem,
                points: ans.question.points,
                difficulty: ans.question.difficulty,
                statementExtra: ans.question.statementExtra,
                constraints: ans.question.constraints,
                lua_chon: safeJsonParse<string[]>(ans.question.optionsJson, []),
                correctIndex: ans.question.correctIndex,
                explanation: ans.question.explanation,
                language: ans.question.language,
              }
            : null,
        })),
      })),
    });
  } catch {
    res.status(500).json({ error: ExamMsg.gradeStatusFailed });
  }
});

router.patch(
  "/:id/grades/:attemptId",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    try {
      const questionId = String(req.body?.questionId || "");
      const finalScore = Number(req.body?.finalScore);
      if (!questionId || !Number.isFinite(finalScore)) {
        res.status(400).json({ error: ExamMsg.gradePatchNeed });
        return;
      }
      const result = await applyTeacherShortGrade({
        attemptId: paramId(req.params.attemptId),
        questionId,
        finalScore,
        teacherNote: typeof req.body?.teacherNote === "string" ? req.body.teacherNote : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || ExamMsg.gradePatchFailed });
    }
  },
);

// ─── AI gợi ý nhận xét cho câu trả lời ngắn (GV chỉnh sửa trước khi chốt) ───
const suggestCommentHits = new Map<string, number[]>();
router.post(
  "/:id/grades/:attemptId/suggest-comment",
  authenticate,
  requireRole(...STAFF),
  async (req: Request, res: Response) => {
    try {
      const rl = hitRateLimit(suggestCommentHits, req.user!.userId, 10, 60_000);
      if (!rl.ok) {
        res.status(429).json({ error: ExamMsg.heartbeatFast, retryAfterMs: rl.retryAfterMs });
        return;
      }
      const examId = paramId(req.params.id);
      const attemptId = paramId(req.params.attemptId);
      const questionId = String(req.body?.questionId || "");
      if (!questionId) {
        res.status(400).json({ error: ExamMsg.gradePatchNeed });
        return;
      }
      const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId, examId } });
      if (!attempt) {
        res.status(404).json({ error: ExamMsg.notFound });
        return;
      }
      const answer = await prisma.examAnswer.findUnique({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
        include: { question: true },
      });
      if (!answer || !answer.question) {
        res.status(404).json({ error: ExamMsg.questionNotFound });
        return;
      }
      const llmSuggestion = safeJsonParse<{ suggestedScore?: number; rationale?: string } | null>(
        answer.llmSuggestionJson ?? null,
        null,
      );
      const result = await suggestShortComment({
        stem: answer.question.stem,
        guide: answer.question.gradingGuide,
        accepted: safeJsonParse<string[]>(answer.question.acceptedAnswersJson, []),
        student: answer.textAnswer || "",
        maxPoints: answer.maxScore ?? answer.question.points,
        llmSuggestion,
        style: typeof req.body?.style === "string" ? req.body.style.slice(0, 2000) : null,
      });
      res.json(result);
    } catch (err: any) {
      console.error("[exams/suggest-comment]", err);
      res.status(500).json({ error: err?.message || ExamMsg.gradePatchFailed });
    }
  },
);


// ─── Export grades CSV ───
router.get("/:id/grade/export", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const examId = paramId(req.params.id);
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) { res.status(404).json({ error: ExamMsg.notFound }); return; }
    const attempts = await prisma.examAttempt.findMany({
      where: { examId, status: { in: ["submitted", "expired"] } },
      include: {
        student: { select: { fullName: true, email: true } },
        answers: { include: { question: true } },
      },
      orderBy: { submittedAt: "asc" },
    });
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = ["studentName","email","status","gradeStatus","totalScore","maxScore","scaledTotal","scaledMax","submittedAt"];
    const lines = [header.join(",")];
    for (const a of attempts) {
      const scaled = a.maxScore && a.maxScore > 0 && a.totalScore != null
        ? Math.round((a.totalScore / a.maxScore) * exam.scale * 100) / 100
        : "";
      lines.push([
        esc(a.student?.fullName),
        esc(a.student?.email),
        esc(a.status),
        esc(a.gradeStatus),
        esc(a.totalScore),
        esc(a.maxScore),
        esc(scaled),
        esc(exam.scale),
        esc(a.submittedAt?.toISOString() || ""),
      ].join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="exam-' + examId.slice(0, 8) + '-grades.csv"');
    res.send("\uFEFF" + lines.join("\n"));
  } catch (err) {
    console.error("[exams/grade/export]", err);
    res.status(500).json({ error: ExamMsg.gradeStatusFailed });
  }
});

// Accept all LLM short suggestions for one attempt
router.post("/:id/grades/:attemptId/accept-llm-short", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const attemptId = paramId(req.params.attemptId);
    const answers = await prisma.examAnswer.findMany({
      where: { attemptId, finalScore: null, question: { type: "tra_loi_ngan" } },
      include: { question: true },
    });
    let n = 0;
    for (const a of answers) {
      const sug = a.llmSuggestionJson ? safeJsonParse<{ suggestedScore?: number }>(a.llmSuggestionJson, {}) : {};
      const score = typeof sug.suggestedScore === "number" ? sug.suggestedScore : a.autoScore ?? 0;
      await applyTeacherShortGrade({
        attemptId,
        questionId: a.questionId,
        finalScore: score,
        teacherNote: a.teacherNote || "accept-llm",
      });
      n++;
    }
    res.json({ accepted: n });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || ExamMsg.gradePatchFailed });
  }
});

export default router;


