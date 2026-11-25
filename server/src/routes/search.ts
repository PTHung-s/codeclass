import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { query } from "../utils/routeHelpers";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const q = query(req, "q");
    if (!q || q.length < 2) {
      res.json({
        courses: [],
        lessons: [],
        sessionLessons: [],
        problems: [],
        exams: [],
        materials: [],
        assignments: [],
      });
      return;
    }

    const { userId, role } = req.user!;
    const search = q.trim();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));

    const problemWhere: any = {
      OR: [
        { title: { contains: search } },
        { shortDescription: { contains: search } },
      ],
      status: role === "student" ? "published" : { not: "archived" },
    };

    const [courses, lessons, sessionLessons, problems, exams, materials, assignments] = await Promise.all([
      prisma.course.findMany({
        where: {
          OR: [{ title: { contains: search } }, { description: { contains: search } }],
          ...(role === "student" ? { status: "active" } : { status: { not: "archived" } }),
        },
        select: { id: true, title: true, kind: true, status: true },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.lesson.findMany({
        where: {
          title: { contains: search },
          status: { not: "archived" },
        },
        select: {
          id: true,
          title: true,
          module: { select: { id: true, title: true } },
          course: { select: { id: true, title: true } },
        },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.sessionLesson.findMany({
        where: {
          title: { contains: search },
          ...(role === "student" ? { status: "published" } : {}),
        },
        select: {
          id: true,
          title: true,
          orderIndex: true,
          courseId: true,
          course: { select: { id: true, title: true } },
        },
        take: limit,
        orderBy: { orderIndex: "asc" },
      }),
      prisma.problem.findMany({
        where: problemWhere,
        select: {
          id: true,
          title: true,
          difficulty: true,
          tags: { select: { tag: true } },
        },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.exam.findMany({
        where: {
          OR: [{ title: { contains: search } }, { subject: { contains: search } }],
          ...(role === "student" ? { status: { in: ["published", "closed"] } } : {}),
        },
        select: { id: true, title: true, subject: true, status: true, durationMinutes: true },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.material.findMany({
        where: {
          OR: [{ title: { contains: search } }, { description: { contains: search } }],
          ...(role === "student" ? { visibility: "student-visible" } : {}),
        },
        select: { id: true, title: true, type: true },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      role === "student"
        ? prisma.assignment.findMany({
            where: {
              status: "published",
              submissionType: "problem",
              assignedStudents: { some: { studentId: userId } },
              title: { contains: search },
            },
            select: { id: true, title: true, problemId: true, deadline: true },
            take: limit,
            orderBy: { createdAt: "desc" },
          })
        : prisma.assignment.findMany({
            where: {
              status: { not: "archived" },
              submissionType: "problem",
              title: { contains: search },
            },
            select: { id: true, title: true, problemId: true, deadline: true },
            take: limit,
            orderBy: { createdAt: "desc" },
          }),
    ]);

    res.json({ courses, lessons, sessionLessons, problems, exams, materials, assignments });
  } catch {
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
