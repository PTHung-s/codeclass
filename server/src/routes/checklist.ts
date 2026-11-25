import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { CHECKLISTS } from "../data/checklist";

const router = Router();

async function buildChecklist(studentId: string) {
  const allProblems = await prisma.problem.findMany({
    where: { status: "published" },
    include: { tags: true },
  });

  const problemsWithTests = allProblems.filter(p => {
    if (!p.testCases) return false;
    try { return JSON.parse(p.testCases).length > 0; }
    catch { return false; }
  });

  // Collect passed problems for student (if studentId provided)
  const passedProblems = new Set<string>();
  if (studentId) {
    const submissions = await prisma.problemSubmission.findMany({
      where: { studentId },
      select: { problemId: true, note: true },
    });
    for (const sub of submissions) {
      if (sub.note && sub.note.includes("Auto-judge")) {
        const match = sub.note.match(/Auto-judge\s*\((\d+)\/(\d+)\)/);
        if (match && parseInt(match[1]) === parseInt(match[2])) {
          passedProblems.add(sub.problemId);
        }
      }
    }
  }

  const groups = CHECKLISTS.map(group => ({
    title: group.title,
    icon: group.icon,
    items: group.items.map(item => {
      const matched = problemsWithTests.filter(p =>
        p.tags.some(t => t.tag.toLowerCase().includes(item.tagFilter.toLowerCase()))
      );
      const problemList = matched.map(p => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        passed: passedProblems.has(p.id),
      }));
      problemList.sort((a, b) => a.difficulty.localeCompare(b.difficulty) || a.title.localeCompare(b.title));
      const linkedTotal = problemList.length;
      const linkedPassed = problemList.filter(p => p.passed).length;
      return {
        id: item.id,
        label: item.label,
        difficulty: item.difficulty,
        problems: problemList,
        linkedTotal,
        linkedPassed,
      };
    }),
    stars: 0,
    completed: 0,
    total: 0,
  }));

  return { groups };
}

// View checklist (student sees own progress, teacher/admin sees full list without progress)
router.get("/checklist", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    // Only collect passed problems for students
    const data = await buildChecklist(role === "student" ? userId : "");
    res.json(data);
  } catch (err) {
    console.error("Checklist error:", err);
    res.status(500).json({ error: "Failed to load checklist" });
  }
});

// Teacher: view any student's checklist
router.get("/teacher/students/:studentId/checklist", authenticate, async (req: Request, res: Response) => {
  try {
    const { role } = req.user!;
    if (role !== "teacher" && role !== "admin" && role !== "teaching_assistant") {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const studentId = String(req.params.studentId);
    const student = await prisma.user.findFirst({
      where: { id: studentId, role: "student", status: "active" },
      select: { id: true, fullName: true, nickname: true, email: true },
    });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    const data = await buildChecklist(studentId);
    res.json({ student, ...data });
  } catch (err) {
    console.error("Teacher checklist error:", err);
    res.status(500).json({ error: "Failed to load student checklist" });
  }
});

export default router;
