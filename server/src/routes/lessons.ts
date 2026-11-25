import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import prisma from "../utils/prisma";
import { param, checkCourseAccess } from "../utils/routeHelpers";

const router = Router();

router.get("/modules/:moduleId/lessons", authenticate, async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, "moduleId");
    const module_ = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!module_) {
      res.status(404).json({ error: "Module not found" });
      return;
    }

    const { userId, role } = req.user!;
    if (role !== "admin") {
      const access = await checkCourseAccess(userId, role, module_.courseId);
      if (!access) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const lessons = await prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { orderIndex: "asc" },
    });

    const completed = await prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessons.map((l) => l.id) } },
      select: { lessonId: true },
    });
    const completedSet = new Set(completed.map((c) => c.lessonId));

    res.json(lessons.map((l) => ({ ...l, completed: completedSet.has(l.id) })));
  } catch {
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

router.post("/modules/:moduleId/lessons", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, "moduleId");
    const module_ = await prisma.module.findUnique({ where: { id: moduleId }, include: { course: true } });
    if (!module_) {
      res.status(404).json({ error: "Module not found" });
      return;
    }

    const { title, description, content, status, estimatedDuration } = req.body;
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const maxOrder = await prisma.lesson.findFirst({
      where: { moduleId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });

    const lesson = await prisma.lesson.create({
      data: {
        courseId: module_.courseId,
        moduleId,
        title,
        description,
        content,
        status: status || "draft",
        estimatedDuration,
        orderIndex: (maxOrder?.orderIndex ?? -1) + 1,
      },
    });

    res.status(201).json(lesson);
  } catch {
    res.status(500).json({ error: "Failed to create lesson" });
  }
});

router.get("/lessons/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        module: { select: { id: true, title: true } },
        lessonMaterials: { include: { material: true } },
      },
    });

    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    const { userId, role } = req.user!;
    if (role !== "admin") {
      const access = await checkCourseAccess(userId, role, lesson.courseId);
      if (!access) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    res.json(lesson);
  } catch {
    res.status(500).json({ error: "Failed to fetch lesson" });
  }
});

router.patch("/lessons/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const lesson = await prisma.lesson.findUnique({ where: { id }, include: { course: true } });

    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    const { title, description, content, status, orderIndex, estimatedDuration } = req.body;
    const updated = await prisma.lesson.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(content !== undefined && { content }),
        ...(status !== undefined && { status }),
        ...(orderIndex !== undefined && { orderIndex }),
        ...(estimatedDuration !== undefined && { estimatedDuration }),
      },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update lesson" });
  }
});

router.delete("/lessons/:id", authenticate, requireRole("admin", "teacher"), async (req: Request, res: Response) => {
  try {
    const id = param(req, "id");
    const lesson = await prisma.lesson.findUnique({ where: { id }, include: { course: true } });

    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    await prisma.lesson.update({ where: { id }, data: { status: "archived" } });
    res.json({ message: "Lesson archived" });
  } catch {
    res.status(500).json({ error: "Failed to delete lesson" });
  }
});

router.get("/courses/:courseId/lessons/flat", authenticate, async (req: Request, res: Response) => {
  try {
    const courseId = param(req, "courseId");
    const { userId, role } = req.user!;

    if (role !== "admin") {
      const access = await checkCourseAccess(userId, role, courseId);
      if (!access) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const modules = await prisma.module.findMany({
      where: { courseId },
      orderBy: { orderIndex: "asc" },
      include: {
        lessons: {
          where: { status: { not: "archived" } },
          orderBy: { orderIndex: "asc" },
          select: { id: true, title: true, orderIndex: true, estimatedDuration: true },
        },
      },
    });

    const flat: any[] = [];
    for (const mod of modules) {
      for (const lesson of mod.lessons) {
        flat.push({
          id: lesson.id,
          title: lesson.title,
          moduleId: mod.id,
          moduleTitle: mod.title,
          estimatedDuration: lesson.estimatedDuration,
        });
      }
    }

    const progressList = await prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: flat.map((l) => l.id) } },
      select: { lessonId: true },
    });
    const completedSet = new Set(progressList.map((p) => p.lessonId));

    const result = flat.map((l) => ({ ...l, completed: completedSet.has(l.id) }));

    // Quiz gating (students only): a lesson is "locked" if a prior lesson has a
    // quiz the student hasn't passed. Lessons without a quiz never gate.
    if (role === "student" && result.length) {
      const lessonIds = result.map((l) => l.id);
      const quizzes = await prisma.quiz.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true, _count: { select: { questions: true } } },
      });
      const gateSet = new Set(quizzes.filter((q) => q._count.questions > 0).map((q) => q.lessonId));
      const passedQuiz = await prisma.quizAttempt.findMany({
        where: { userId, passed: true, quiz: { lessonId: { in: lessonIds } } },
        select: { quiz: { select: { lessonId: true } } },
      });
      const passedSet = new Set(passedQuiz.map((a) => a.quiz.lessonId));

      // Chapter gating: get which chapters are cleared via adaptive test
      const moduleIds = [...new Set(result.map((l) => l.moduleId))];
      const clearedChapters = await prisma.chapterProgress.findMany({
        where: { userId, moduleId: { in: moduleIds } },
        select: { moduleId: true },
      });
      const clearedSet = new Set(clearedChapters.map((c) => c.moduleId));

      // A module is "fully completed" if all its lessons are cleared
      // (no-quiz lessons have progress OR quiz-gated lessons have passed quiz)
      const moduleLessonIds = new Map<string, string[]>();
      for (const l of result) {
        const ids = moduleLessonIds.get(l.moduleId) || [];
        ids.push(l.id);
        moduleLessonIds.set(l.moduleId, ids);
      }
      const fullyCompletedModules = new Set<string>();
      for (const [modId, lessonIds] of moduleLessonIds) {
        const allCleared = lessonIds.every((lid) => {
          if (completedSet.has(lid)) return true; // has LessonProgress record
          // No progress — lesson might be quiz-gated, check if quiz was passed
          if (gateSet.has(lid) && passedSet.has(lid)) return true;
          return false;
        });
        if (allCleared) fullyCompletedModules.add(modId);
      }

      // Build ordered module list from flat results
      const moduleOrder: string[] = [];
      for (const l of result) {
        if (!moduleOrder.includes(l.moduleId)) moduleOrder.push(l.moduleId);
      }

      let reachable = true;
      let lastModuleId = "";
      for (const l of result) {
        // Chapter gate: entering new module → check prev module accessible
        if (l.moduleId !== lastModuleId) {
          const prevIdx = moduleOrder.indexOf(l.moduleId) - 1;
          if (prevIdx >= 0) {
            const prevMod = moduleOrder[prevIdx];
            // Prev chapter is cleared via: adaptive test OR all lessons completed
            reachable = clearedSet.has(prevMod) || fullyCompletedModules.has(prevMod);
          } else {
            reachable = true; // first module always reachable
          }
          lastModuleId = l.moduleId;
        }

        l.hasQuiz = gateSet.has(l.id);
        l.quizPassed = passedSet.has(l.id);
        // Cleared = no quiz OR quiz passed OR lesson completed via adaptive skip
        const cleared = !l.hasQuiz || l.quizPassed || completedSet.has(l.id);
        // Unlocked if: reachable (prev chapter cleared) OR already completed via adaptive
        l.locked = !reachable && !completedSet.has(l.id);
        if (!cleared) reachable = false;
      }
    } else {
      for (const l of result) {
        l.hasQuiz = false;
        l.quizPassed = false;
        l.locked = false;
      }
    }

    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

router.post("/lessons/:id/progress", authenticate, async (req: Request, res: Response) => {
  try {
    const lessonId = param(req, "id");
    const { userId } = req.user!;

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    // A lesson carrying a quiz is only "completed" once that quiz is passed.
    // QuizPage already calls this after a pass, and LessonView routes quiz
    // lessons to the quiz page — the gate closes the API hole where a direct
    // POST could farm lessonXp + tokens for lessons never opened.
    const quizCount = await prisma.quiz.count({ where: { lessonId } });
    if (quizCount > 0) {
      const passed = await prisma.quizAttempt.findFirst({
        where: { quiz: { lessonId }, userId, passed: true },
        select: { id: true },
      });
      if (!passed) {
        res.status(403).json({ error: "Bạn cần đỗ bài kiểm tra của bài học này trước." });
        return;
      }
    }

    const progress = await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { completedAt: new Date() },
      create: { userId, lessonId },
    });

    // Award tokens (synchronous so we can show the claim to the student)
    let tokensAwarded = 0;
    try {
      const { awardLessonTokens } = await import("../utils/tokens");
      const award = await awardLessonTokens(userId, {
        refType: "Lesson",
        refId: lessonId,
        description: `Hoàn thành bài học: ${lesson.title}`,
      });
      tokensAwarded = award.awarded ? award.amount : 0;
    } catch { /* token award failed silently */ }

    // XP ledger: once per lesson (dedupKey) + streak day.
    try {
      const { awardXp, awardStreakDay } = await import("../utils/xpLedger");
      const { getRates } = await import("../utils/gamificationSettings");
      const { xp: rates } = await getRates();
      await awardXp(userId, rates.lessonXp, {
        reason: "lesson_completed",
        description: `Hoàn thành bài học: ${lesson.title}`,
        refType: "Lesson",
        refId: lessonId,
      });
      await awardStreakDay(userId);
    } catch { /* xp award failed silently */ }

    res.json({ ...progress, tokensAwarded });
    // Check badges in background
    import("../utils/badgeEngine").then(({ checkBadges }) => checkBadges(userId)).catch(() => {});
  } catch {
    res.status(500).json({ error: "Failed to save progress" });
  }
});

export default router;
