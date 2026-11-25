import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { isStaff } from "../utils/routeHelpers";
import { param } from "../utils/routeHelpers";
import prisma from "../utils/prisma";
import { createR2PresignedPutUrl, deleteFromR2, ensureR2BrowserCors, isR2Configured, storageKeyFromUrl, uploadToR2 } from "../utils/r2";
import { createVideoProcessingToken, notifySessionVideoCompression } from "../services/sessionVideoOptimization";
import { enqueueStorageCleanup, runStorageCleanup } from "../services/storageCleanup";
import { recordSkillEvidenceBatch, fromSessionQuizAttempt } from "../services/skillEvidence";
import { SKILL_SEEDS } from "../utils/skillGraph";

const router = Router();

const STAFF = ["admin", "teacher", "teaching_assistant"];

// ── Multer (to disk, then forwarded to R2) ──
const uploadDir = path.join(__dirname, "../../uploads/session-tmp");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const disk = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});
const uploadVideo = multer({ storage: disk, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB
const uploadSmall = multer({ storage: disk });
const MAX_VIDEO_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

type DirectVideoIntent = {
  lessonId: string;
  key: string;
  originalName: string;
  size: number;
  contentType: string;
  duration: number | null;
  expiresAt: number;
};

function signDirectVideoIntent(intent: DirectVideoIntent) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET chưa được cấu hình.");
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readDirectVideoIntent(value: unknown): DirectVideoIntent | null {
  if (typeof value !== "string") return null;
  const [payload, signature] = value.split(".");
  const secret = process.env.JWT_SECRET;
  if (!payload || !signature || !secret) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const intent = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DirectVideoIntent;
    if (!intent.lessonId || !intent.key || !intent.originalName || !Number.isSafeInteger(intent.size) || !ALLOWED_VIDEO_TYPES.has(intent.contentType) || !Number.isFinite(intent.expiresAt) || intent.expiresAt < Date.now()) return null;
    return intent;
  } catch {
    return null;
  }
}

function readDirectVideoMetadata(body: any) {
  const originalName = typeof body?.originalName === "string" ? path.basename(body.originalName).trim() : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = Number(body?.size);
  const durationValue = Number(body?.videoDuration);
  if (!originalName || originalName.length > 255) throw new Error("Tên file video không hợp lệ.");
  if (!ALLOWED_VIDEO_TYPES.has(contentType)) throw new Error("Chỉ hỗ trợ video MP4, WebM hoặc MOV.");
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_FILE_SIZE) throw new Error("Video phải lớn hơn 0 và không vượt quá 2 GB.");
  return { originalName, contentType, size, duration: Number.isFinite(durationValue) && durationValue > 0 ? Math.round(durationValue) : null };
}

/** Validate lesson is published, and a student is allowed (not locked). Returns null if forbidden. */
async function canAccessLesson(userId: string, role: string, lessonId: string) {
  const lesson = await prisma.sessionLesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return { ok: false, code: 404, error: "Lesson not found", lesson: null as any };
  if (isStaff(role)) return { ok: true, code: 200, error: "", lesson };
  if (lesson.status !== "published") return { ok: false, code: 403, error: "Lesson chưa được publish", lesson };
  const prog = await prisma.userSessionProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  if (!prog || prog.status === "locked") return { ok: false, code: 403, error: "Buổi học chưa được mở khóa", lesson };
  return { ok: true, code: 200, error: "", lesson };
}

/** Compute a student's per-lesson status across a course. Seed missing progress rows. */
async function progressForCourse(userId: string, role: string, courseId: string) {
  const lessons = await prisma.sessionLesson.findMany({
    where: { courseId },
    orderBy: { orderIndex: "asc" },
  });
  if (isStaff(role)) {
    return {
      lessons: lessons.map((l) => ({
        ...l,
        userStatus: l.status === "published" ? "current" : "draft",
        quizCompleted: false,
        quizScore: null,
      })),
      verifiedCount: 0,
    };
  }
  // Seed progress: first published lesson = current, rest = locked.
  const firstPublished = lessons.find((l) => l.status === "published");
  const existing = await prisma.userSessionProgress.findMany({ where: { userId } });
  const progressMap = new Map(existing.map((p) => [p.lessonId, p]));
  // Upsert any published lessons with no progress row.
  await Promise.all(
    lessons
      .filter((l) => l.status === "published" && !progressMap.has(l.id))
      .map((l) =>
        prisma.userSessionProgress.upsert({
          where: { userId_lessonId: { userId, lessonId: l.id } },
          create: {
            userId,
            lessonId: l.id,
            status: l.id === firstPublished?.id ? "current" : "locked",
          },
          update: {},
        })
      )
  );
  const after = await prisma.userSessionProgress.findMany({ where: { userId } });
  const afterMap = new Map(after.map((p) => [p.lessonId, p]));
  const verifiedCount = lessons.filter((l) => afterMap.get(l.id)?.status === "verified").length;
  return {
    lessons: lessons.map((l) => {
      const p = afterMap.get(l.id);
      const userStatus = p?.status ?? (l.id === firstPublished?.id ? "current" : "locked");
      return { ...l, userStatus, quizCompleted: p?.quizCompleted ?? false, quizScore: p?.quizScore ?? null };
    }),
    verifiedCount,
  };
}

// ── Course overview (student + staff) ──
router.get("/course/:courseId", authenticate, async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const course = await prisma.course.findUnique({ where: { id: courseId }, include: { owner: { select: { fullName: true } } } });
    if (!course || course.kind !== "session") {
      res.status(404).json({ error: "Khóa học không tồn tại" });
      return;
    }
    const { lessons, verifiedCount } = await progressForCourse(req.user!.userId, req.user!.role, courseId);
    res.json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        coverImageUrl: course.coverImageUrl,
        status: course.status,
        ownerName: course.owner?.fullName,
        createdAt: course.createdAt,
      },
      totalLessons: lessons.length,
      verifiedCount,
      lessons: lessons.map((l) => ({
        id: l.id,
        orderIndex: l.orderIndex,
        title: l.title,
        status: l.status,
        userStatus: l.userStatus,
        quizCompleted: l.quizCompleted,
        quizScore: l.quizScore,
        videoUrl: isStaff(req.user!.role) ? l.videoUrl : undefined,
      })),
    });
  } catch (err) {
    console.error("session course error:", err);
    res.status(500).json({ error: "Failed to load course" });
  }
});

// ── Single lesson home (video+reading+code+files+quiz refs) ──
router.get("/lesson/:lessonId", authenticate, async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const access = await canAccessLesson(req.user!.userId, req.user!.role, lessonId);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    const lesson = access.lesson;
    const [codeFiles, materials, quiz, progress, allLessons] = await Promise.all([
      prisma.sessionCodeFile.findMany({ where: { lessonId }, orderBy: { orderIndex: "asc" } }),
      prisma.sessionMaterial.findMany({ where: { lessonId } }),
      prisma.sessionQuiz.findUnique({ where: { lessonId } }),
      prisma.userSessionProgress.findUnique({ where: { userId_lessonId: { userId: req.user!.userId, lessonId } } }),
      prisma.sessionLesson.findMany({
        where: { courseId: lesson.courseId, status: "published" },
        orderBy: { orderIndex: "asc" },
        select: { id: true, orderIndex: true, title: true },
      }),
    ]);

    const isStaffRole = isStaff(req.user!.role);
    res.json({
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        orderIndex: lesson.orderIndex,
        userStatus: isStaffRole ? "current" : progress?.status ?? "locked",
        readingContent: lesson.readingContent,
        video: lesson.videoUrl
          ? {
              url: lesson.videoUrl,
              originalName: lesson.videoOriginalName,
              size: lesson.videoSize,
              duration: lesson.videoDuration,
              compression: {
                status: lesson.videoCompressionStatus,
                originalSize: lesson.videoOriginalSize,
                optimizedSize: lesson.videoOptimizedSize,
                ...(isStaffRole && lesson.videoCompressionError ? { error: lesson.videoCompressionError } : {}),
              },
            }
          : null,
      },
      codeFiles: codeFiles.map((c) => ({ id: c.id, filename: c.filename, language: c.language, content: c.content })),
      materials: materials.map((m) => ({ id: m.id, name: m.name, type: m.type, storageUrl: m.storageUrl, size: m.size })),
      quiz: quiz
        ? {
            id: quiz.id,
            title: quiz.title,
            passScore: quiz.passScore,
            questionCount: JSON.parse(quiz.questions || "[]").length,
            // Only staff receive answer keys, so the same endpoint can safely
            // populate the teacher's quiz editor without exposing them to students.
            ...(isStaffRole ? { questions: JSON.parse(quiz.questions || "[]") } : {}),
            completed: progress?.quizCompleted ?? false,
            lastScore: progress?.quizScore ?? null,
          }
        : null,
      allLessons,
    });
  } catch (err) {
    console.error("session lesson error:", err);
    res.status(500).json({ error: "Failed to load lesson" });
  }
});

// ── Quiz questions (student; no answers) ──
router.get("/lesson/:lessonId/quiz", authenticate, async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const access = await canAccessLesson(req.user!.userId, req.user!.role, lessonId);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    if (isStaff(req.user!.role)) {
      const quiz = await prisma.sessionQuiz.findUnique({ where: { lessonId } });
      res.json(quiz ? { quiz: JSON.parse(quiz.questions || "[]"), meta: { id: quiz.id, passScore: quiz.passScore } } : { quiz: [], meta: null });
      return;
    }
    const quiz = await prisma.sessionQuiz.findUnique({ where: { lessonId } });
    if (!quiz) {
      res.status(404).json({ error: "Quiz chưa được soạn" });
      return;
    }
    const questions = JSON.parse(quiz.questions || "[]");
    const stripped = questions.map((q: any) => ({ id: q.id ?? null, question: q.question, options: q.options }));
    res.json({ quiz: stripped, meta: { id: quiz.id, passScore: quiz.passScore } });
  } catch (err) {
    console.error("session quiz get error:", err);
    res.status(500).json({ error: "Failed to load quiz" });
  }
});

// ── Submit quiz (transaction: verify lesson + unlock next) ──
router.post("/lesson/:lessonId/quiz", authenticate, async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const access = await canAccessLesson(req.user!.userId, req.user!.role, lessonId);
    if (!access.ok) {
      res.status(access.code).json({ error: access.error });
      return;
    }
    if (isStaff(req.user!.role)) {
      res.status(403).json({ error: "Giáo viên không làm quiz" });
      return;
    }
    const quiz = await prisma.sessionQuiz.findUnique({ where: { lessonId } });
    if (!quiz) {
      res.status(404).json({ error: "Quiz chưa được soạn" });
      return;
    }
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const questions = JSON.parse(quiz.questions || "[]");

    // Skill tags: question JSON may carry skillId (staff authoring); legacy
    // quizzes fall back to SkillTagMapping (scope session_quiz_question).
    const validSkill = new Set(SKILL_SEEDS.map((s) => s.skillId));
    const mappings = await prisma.skillTagMapping.findMany({
      where: { scope: "session_quiz_question", refKey: { startsWith: `${lessonId}:` }, status: "approved" },
      select: { refKey: true, skillId: true },
    });
    const mapByRef = new Map(mappings.map((m) => [m.refKey, m.skillId]));

    let score = 0;
    const resultAnswers = questions.map((q: any, i: number) => {
      const sel = answers[i];
      const isCorrect = sel === q.correctIndex;
      if (isCorrect) score++;
      const jsonSkill = typeof q.skillId === "string" && validSkill.has(q.skillId) ? q.skillId : null;
      const skillId = jsonSkill ?? mapByRef.get(`${lessonId}:${i}`) ?? null;
      return { index: i, selectedIndex: sel, correctIndex: q.correctIndex, isCorrect, skillId };
    });

    const total = questions.length;
    const passed = total > 0 ? score / total >= quiz.passScore / 100 : false;

    let attemptId = "";
    const attemptCreatedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const attempt = await tx.sessionQuizAttempt.create({
        data: {
          userId: req.user!.userId,
          lessonId,
          quizId: quiz.id,
          score,
          totalQuestions: total,
          answers: JSON.stringify(resultAnswers),
          completed: true,
        },
      });
      attemptId = attempt.id;
      // A failed quiz remains the student's current lesson. Only a passing
      // result may verify the lesson and unlock the next one.
      await tx.userSessionProgress.upsert({
        where: { userId_lessonId: { userId: req.user!.userId, lessonId } },
        create: {
          userId: req.user!.userId,
          lessonId,
          status: passed ? "verified" : "current",
          quizCompleted: passed,
          quizScore: score,
          completedAt: passed ? new Date() : null,
        },
        update: {
          status: passed ? "verified" : "current",
          quizCompleted: passed,
          quizScore: score,
          completedAt: passed ? new Date() : null,
        },
      });
      // Unlock the next published lesson only after a passing result.
      const next = await tx.sessionLesson.findFirst({
        where: { courseId: access.lesson.courseId, status: "published", orderIndex: { gt: access.lesson.orderIndex } },
        orderBy: { orderIndex: "asc" },
      });
      if (passed && next) {
        await tx.userSessionProgress.upsert({
          where: { userId_lessonId: { userId: req.user!.userId, lessonId: next.id } },
          create: { userId: req.user!.userId, lessonId: next.id, status: "current" },
          update: { status: "current" },
        });
      }
    });

    // Skill evidence → unified sink (fail-soft: never blocks the quiz result).
    try {
      await recordSkillEvidenceBatch(
        fromSessionQuizAttempt(
          req.user!.userId,
          lessonId,
          attemptId,
          resultAnswers.map((a: any) => ({ index: a.index, isCorrect: a.isCorrect, skillId: a.skillId })),
          attemptCreatedAt,
        ),
      );
    } catch (err) {
      console.error("[sessionCourse] skill evidence record failed:", err);
    }

    const next = passed
      ? await prisma.sessionLesson.findFirst({
          where: { courseId: access.lesson.courseId, status: "published", orderIndex: { gt: access.lesson.orderIndex } },
          orderBy: { orderIndex: "asc" },
          select: { id: true },
        })
      : null;
    res.json({
      score,
      total,
      percent: total > 0 ? Math.round((score / total) * 100) : 0,
      passed,
      passScore: quiz.passScore,
      completed: true,
      nextLessonId: next?.id ?? null,
    });
  } catch (err) {
    console.error("session quiz submit error:", err);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

// ============ TEACHER ROUTES ============
router.use("/teacher", authenticate, requireRole(...STAFF));

router.post("/teacher/lesson", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const { courseId, title, orderIndex } = req.body;
    if (!courseId || !title) {
      res.status(400).json({ error: "courseId và title là bắt buộc" });
      return;
    }
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.kind !== "session") {
      res.status(400).json({ error: "Chỉ có thể thêm buổi học vào khóa học dạng session." });
      return;
    }
    const maxOrder = await prisma.sessionLesson.aggregate({
      where: { courseId },
      _max: { orderIndex: true },
    });
    const lesson = await prisma.sessionLesson.create({
      data: {
        courseId,
        title,
        orderIndex: typeof orderIndex === "number" ? orderIndex : (maxOrder._max.orderIndex ?? 0) + 1,
        status: "draft",
        createdById: req.user!.userId,
      },
    });
    res.status(201).json({ lesson });
  } catch (err) {
    console.error("create session lesson error:", err);
    res.status(500).json({ error: "Failed to create lesson" });
  }
});

router.patch("/teacher/lesson/:lessonId", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const { title, readingContent, orderIndex, videoUrl, videoOriginalName, videoSize, videoDuration, status } = req.body;
    const lesson = await prisma.sessionLesson.update({
      where: { id: lessonId },
      data: {
        ...(title !== undefined && { title }),
        ...(readingContent !== undefined && { readingContent }),
        ...(orderIndex !== undefined && { orderIndex }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(videoOriginalName !== undefined && { videoOriginalName }),
        ...(videoSize !== undefined && { videoSize }),
        ...(videoDuration !== undefined && { videoDuration }),
        ...(status !== undefined && { status }),
      },
    });
    res.json({ lesson });
  } catch (err) {
    console.error("update session lesson error:", err);
    res.status(500).json({ error: "Failed to update lesson" });
  }
});

// The browser uploads the file directly to R2, bypassing Cloudflare's upload
// cap and avoiding a multi-GB temporary file on the application server.
router.post("/teacher/lesson/:lessonId/video/direct-upload", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    if (!isR2Configured()) {
      res.status(503).json({ error: "Lưu trữ video trực tiếp chưa được cấu hình." });
      return;
    }
    const lessonId = param(req, "lessonId");
    const metadata = readDirectVideoMetadata(req.body);
    const lesson = await prisma.sessionLesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (!lesson) {
      res.status(404).json({ error: "Buổi học không tồn tại" });
      return;
    }
    await ensureR2BrowserCors();
    const token = createVideoProcessingToken();
    const extension = path.extname(metadata.originalName).toLowerCase() || ".mp4";
    const key = `session-course/${lessonId}/source-${token}${extension}`;
    const { uploadUrl, publicUrl } = createR2PresignedPutUrl(key, metadata.contentType);
    const intent = signDirectVideoIntent({ lessonId, key, ...metadata, expiresAt: Date.now() + 30 * 60 * 1000 });
    res.json({ uploadUrl, publicUrl, intent, expiresInSeconds: 1_800 });
  } catch (err: any) {
    console.error("create direct session video upload error:", err);
    res.status(500).json({ error: err.message || "Không thể chuẩn bị upload video" });
  }
});

router.post("/teacher/lesson/:lessonId/video/direct-upload/complete", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const intent = readDirectVideoIntent(req.body?.intent);
    if (!intent || intent.lessonId !== lessonId) {
      res.status(400).json({ error: "Phiên upload không hợp lệ hoặc đã hết hạn. Hãy upload lại." });
      return;
    }
    const existing = await prisma.sessionLesson.findUnique({
      where: { id: lessonId },
      select: { videoStorageKey: true, videoSourceKey: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Buổi học không tồn tại" });
      return;
    }
    const url = createR2PresignedPutUrl(intent.key, intent.contentType, 60).publicUrl;
    const b64 = Buffer.from(intent.originalName, "utf8").toString("base64");
    await prisma.sessionLesson.update({
      where: { id: lessonId },
      data: {
        videoUrl: url,
        videoStorageKey: intent.key,
        videoSourceUrl: url,
        videoSourceKey: intent.key,
        videoOriginalName: b64,
        videoSize: intent.size,
        videoOriginalSize: intent.size,
        videoOptimizedSize: null,
        videoCompressionStatus: "skipped",
        videoCompressionError: null,
        videoProcessingToken: null,
        ...(intent.duration ? { videoDuration: intent.duration } : {}),
      },
    });
    notifySessionVideoCompression(lessonId, "skipped");
    const oldKeys = [...new Set([existing.videoStorageKey, existing.videoSourceKey].filter((item): item is string => Boolean(item && item !== intent.key)))];
    await Promise.all(oldKeys.map((oldKey) => deleteFromR2(oldKey).catch((error) => console.warn("Could not delete replaced session video:", error))));

    res.status(202).json({ url, originalName: intent.originalName, size: intent.size, compression: { status: "skipped" } });
  } catch (err: any) {
    console.error("complete direct session video upload error:", err);
    res.status(500).json({ error: err.message || "Không thể hoàn tất upload video" });
  }
});

router.post("/teacher/lesson/:lessonId/video", authenticate, requireRole(...STAFF), uploadVideo.single("video"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Chưa có file video" });
      return;
    }
    if (!ALLOWED_VIDEO_TYPES.has(req.file.mimetype)) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Chỉ hỗ trợ video MP4, WebM hoặc MOV." });
      return;
    }
    const lessonId = param(req, "lessonId");
    const existing = await prisma.sessionLesson.findUnique({
      where: { id: lessonId },
      select: { videoStorageKey: true, videoSourceKey: true },
    });
    if (!existing) {
      fs.unlink(req.file.path, () => {});
      res.status(404).json({ error: "Buổi học không tồn tại" });
      return;
    }
    const token = createVideoProcessingToken();
    const extension = path.extname(req.file.originalname).toLowerCase() || ".mp4";
    const key = `session-course/${lessonId}/source-${token}${extension}`;
    const url = await uploadToR2(req.file.path, key, req.file.mimetype || "video/mp4", {
      originalName: req.file.originalname,
      size: req.file.size,
    });
    const b64 = Buffer.from(req.file.originalname, "utf8").toString("base64");
    const suppliedDuration = Number(req.body?.videoDuration);
    await prisma.sessionLesson.update({
      where: { id: lessonId },
      data: {
        videoUrl: url,
        videoStorageKey: key,
        videoSourceUrl: url,
        videoSourceKey: key,
        videoOriginalName: b64,
        videoSize: req.file.size,
        videoOriginalSize: req.file.size,
        videoOptimizedSize: null,
        videoCompressionStatus: "skipped",
        videoCompressionError: null,
        videoProcessingToken: null,
        ...(Number.isFinite(suppliedDuration) && suppliedDuration > 0 ? { videoDuration: Math.round(suppliedDuration) } : {}),
      },
    });
    notifySessionVideoCompression(lessonId, "skipped");
    // Remove superseded storage now that the replacement source is safely stored.
    // The active worker is token-guarded, so an older job cannot overwrite this upload.
    const oldKeys = [...new Set([existing.videoStorageKey, existing.videoSourceKey].filter((item): item is string => Boolean(item && item !== key)))];
    await Promise.all(oldKeys.map((oldKey) => deleteFromR2(oldKey).catch((error) => console.warn("Could not delete replaced session video:", error))));

    fs.unlink(req.file.path, () => {});
    res.status(202).json({
      url,
      originalName: req.file.originalname,
      size: req.file.size,
      compression: { status: "skipped" },
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("upload session video error:", err);
    res.status(500).json({ error: err.message || "Upload video thất bại" });
  }
});

router.post("/teacher/lesson/:lessonId/video/retry-optimization", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  res.status(409).json({ error: "Tối ưu video tự động đang tạm tắt. Hãy nén video thủ công trước khi upload." });
});

router.post("/teacher/lesson/:lessonId/code", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    // Accept either { filename, content, language } or { files: [...] }.
    const files = Array.isArray(req.body?.files) ? req.body.files : [req.body];
    const created = [];
    for (const f of files) {
      if (!f?.filename || f?.content === undefined) continue;
      const maxOrder = await prisma.sessionCodeFile.aggregate({ where: { lessonId }, _max: { orderIndex: true } });
      const file = await prisma.sessionCodeFile.create({
        data: {
          lessonId,
          filename: String(f.filename),
          content: String(f.content),
          language: String(f.language || "cpp"),
          orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
          createdById: req.user!.userId,
        },
      });
      created.push(file);
    }
    res.status(201).json({ files: created });
  } catch (err) {
    console.error("add session code error:", err);
    res.status(500).json({ error: "Failed to add code" });
  }
});

router.delete("/teacher/code/:codeFileId", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    await prisma.sessionCodeFile.delete({ where: { id: param(req, "codeFileId") } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete code" });
  }
});

/** Permanently remove a session lesson and enqueue all of its object-storage files. */
router.delete("/teacher/lesson/:lessonId", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const lesson = await prisma.sessionLesson.findUnique({
      where: { id: lessonId },
      select: {
        videoStorageKey: true,
        videoSourceKey: true,
        materials: { select: { storageKey: true, storageUrl: true } },
      },
    });
    if (!lesson) {
      res.status(404).json({ error: "Buổi học không tồn tại" });
      return;
    }

    const keys = [
      lesson.videoStorageKey,
      lesson.videoSourceKey,
      ...lesson.materials.map((material) => material.storageKey || storageKeyFromUrl(material.storageUrl)),
    ];
    const uniqueKeyCount = new Set(keys.filter(Boolean)).size;
    await prisma.$transaction(async (tx) => {
      await enqueueStorageCleanup(tx, keys);
      // Database cascades remove code, materials, quiz, attempts and progress.
      await tx.sessionLesson.delete({ where: { id: lessonId } });
    });
    void runStorageCleanup();
    res.json({ ok: true, queuedObjectCount: uniqueKeyCount });
  } catch (err) {
    console.error("delete session lesson error:", err);
    res.status(500).json({ error: "Không thể xóa buổi học" });
  }
});

router.post("/teacher/lesson/:lessonId/material", authenticate, requireRole(...STAFF), uploadSmall.array("files", 10), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    if (!req.files?.length) {
      res.status(400).json({ error: "Chưa có file" });
      return;
    }
    const created = [];
    for (const file of req.files as Express.Multer.File[]) {
      const ext = (path.extname(file.originalname) || "").toLowerCase();
      const type =
        ext === ".pdf" ? "pdf" : [".doc", ".docx"].includes(ext) ? "document" : [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext) ? "image" : "other";
      const key = `session-course/${lessonId}/materials/${Date.now()}-${path.basename(file.originalname)}`;
      const url = await uploadToR2(file.path, key, file.mimetype || "application/octet-stream", { originalName: file.originalname, size: file.size });
      const material = await prisma.sessionMaterial.create({
        data: { lessonId, name: file.originalname, type, storageUrl: url, storageKey: key, size: file.size, createdById: req.user!.userId },
      });
      created.push(material);
      fs.unlink(file.path, () => {});
    }
    res.status(201).json({ materials: created });
  } catch (err: any) {
    console.error("upload session material error:", err);
    res.status(500).json({ error: err.message || "Upload tài liệu thất bại" });
  }
});

/** Permanently remove one attached file and its object-storage object. */
router.delete("/teacher/material/:materialId", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const materialId = param(req, "materialId");
    const material = await prisma.sessionMaterial.findUnique({ where: { id: materialId } });
    if (!material) {
      res.status(404).json({ error: "Tài liệu không tồn tại" });
      return;
    }
    const key = material.storageKey || storageKeyFromUrl(material.storageUrl);
    await prisma.$transaction(async (tx) => {
      await enqueueStorageCleanup(tx, [key]);
      await tx.sessionMaterial.delete({ where: { id: materialId } });
    });
    void runStorageCleanup();
    res.json({ ok: true, queuedObjectCount: key ? 1 : 0 });
  } catch (err) {
    console.error("delete session material error:", err);
    res.status(500).json({ error: "Không thể xóa tài liệu" });
  }
});

// Upsert quiz + questions.
router.put("/teacher/lesson/:lessonId/quiz", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const { title, passScore, questions } = req.body;
    if (!Array.isArray(questions) || !questions.length) {
      res.status(400).json({ error: "Phải có ít nhất 1 câu hỏi" });
      return;
    }
    for (const q of questions) {
      if (!q?.question || !Array.isArray(q?.options) || q.options.length < 2 || typeof q.correctIndex !== "number") {
        res.status(400).json({ error: "Câu hỏi phải có question, options (tối thiểu 2) và correctIndex" });
        return;
      }
    }
    // skillId per question is optional; when present it must be a known seed so
    // evidence replay never points at a nonexistent skill.
    const validSkill = new Set(SKILL_SEEDS.map((s) => s.skillId));
    const serializeQuestions = () =>
      JSON.stringify(questions.map((q: any, i: number) => ({
        id: q.id ?? `q${i}`,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
        skillId: typeof q.skillId === "string" && validSkill.has(q.skillId) ? q.skillId : null,
      })));
    const quiz = await prisma.sessionQuiz.upsert({
      where: { lessonId },
      create: {
        lessonId,
        title: title || "Quiz bắt buộc",
        passScore: typeof passScore === "number" ? passScore : 70,
        questions: serializeQuestions(),
      },
      update: {
        title: title || "Quiz bắt buộc",
        passScore: typeof passScore === "number" ? passScore : 70,
        questions: serializeQuestions(),
      },
    });
    res.json({ quiz });
  } catch (err) {
    console.error("save session quiz error:", err);
    res.status(500).json({ error: "Failed to save quiz" });
  }
});

// Toggle publish (and read status snapshot for the course).
router.post("/teacher/lesson/:lessonId/publish", authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "lessonId");
    const nextStatus = req.body?.status === "draft" ? "draft" : "published";
    const lesson = await prisma.sessionLesson.update({ where: { id: lessonId }, data: { status: nextStatus } });
    res.json({ lesson });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish lesson" });
  }
});

export default router;
