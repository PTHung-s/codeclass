import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import prisma from "../utils/prisma";
import { vnStartOfWeek } from "../utils/vnTime";

const router = Router();

function safeJsonParse(value?: string | null, fallback: any = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bestContestSubmission(submissions: any[], problemId: string) {
  return submissions
    .filter((submission) => submission.problemId === problemId && submission.verdict !== "draft")
    .sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    })[0] || null;
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;

    if (req.user!.role === "teacher" || req.user!.role === "teaching_assistant") {
      const courses = await prisma.course.findMany({
        select: { id: true },
      });

      const [memberCount] = await Promise.all([
        prisma.user.count({ where: { role: "student", status: "active" } }),
      ]);

      res.json({
        activeCourses: courses.length,
        totalStudents: memberCount,
      });
    } else if (req.user!.role === "student") {
      const activeCourses = await prisma.course.findMany({
        where: { status: "active" },
        select: { id: true },
      });

      const courseIds = activeCourses.map(m => m.id);

      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds }, status: "active" },
        select: { id: true, title: true, description: true },
      });

      // Course progress: lessons completed vs total per course
      const courseProgress = await Promise.all(
        courseIds.map(async (cid) => {
          const course = courses.find(c => c.id === cid);
          const totalLessons = await prisma.lesson.count({
            where: { courseId: cid, status: { not: "archived" } },
          });
          const completedLessons = await prisma.lessonProgress.count({
            where: { userId, lesson: { courseId: cid } },
          });
          const nextLesson = totalLessons > 0
            ? await prisma.lesson.findFirst({
                where: {
                  courseId: cid,
                  status: { not: "archived" },
                  progress: { none: { userId } },
                },
                orderBy: [
                  { module: { orderIndex: "asc" } },
                  { orderIndex: "asc" },
                ],
                select: { id: true, title: true },
              })
            : null;
          return {
            course: { id: cid, title: course?.title || "Unknown" },
            totalLessons,
            completedLessons,
            nextLesson,
          };
        })
      );

      // ── Gamification: XP, Level, Rank (single source of truth — xp ledger) ──
      const xpLedger = await import("../utils/xpLedger");
      const userXpBreakdown = await xpLedger.getXpBreakdown(userId);
      const { xp: userXp, streak: currentStreak, longestStreak, problemCount } = userXpBreakdown;
      const userLevel = Math.floor(Math.sqrt(Math.max(0, userXp) / 10)) + 1;
      const nextLevelXp = userLevel * userLevel * 10;
      const xpToNext = nextLevelXp - userXp;
      const levelProgress = nextLevelXp > 0 ? Math.round((1 - xpToNext / nextLevelXp) * 100) : 100;

      // League
      const leagueNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster"];
      const leagueIdx = Math.min(Math.floor((userLevel - 1) / 5), leagueNames.length - 1);
      const leagueEmojis = ["🥉", "🥈", "🥇", "💎", "💠", "👑", "⚡"];
      const leagueName = leagueNames[leagueIdx];
      const leagueEmoji = leagueEmojis[leagueIdx];

      // User rank + mini leaderboard (single read of User.xp, no scan)
      const allStudents = await prisma.user.findMany({
        where: { role: "student", status: "active" },
        select: { id: true, fullName: true, nickname: true, avatarUrl: true, xp: true },
      });
      const rankings: { id: string; xp: number }[] = allStudents.map((s) => ({
        id: s.id,
        xp: s.xp,
      }));
      rankings.sort((a, b) => b.xp - a.xp);
      const userRank = rankings.findIndex((r) => r.id === userId) + 1;

      // Mini leaderboard (top 5)
      const miniLeaderboard = rankings.slice(0, 5).map((r, i) => ({
        userId: r.id,
        rank: i + 1,
        fullName: (() => {
          const student = allStudents.find((s) => s.id === r.id);
          return student?.nickname || student?.fullName || "Unknown";
        })(),
        avatarUrl: allStudents.find((s) => s.id === r.id)?.avatarUrl,
        xp: r.xp,
        isYou: r.id === userId,
      }));

      // Weekly stats — the same VN Monday-start week as /leaderboard's "Tuần này",
      // not a rolling 7×24h window (a rolling window drifted every hour).
      const weekAgo = vnStartOfWeek();
      const weeklyProblems = await xpLedger.countXp(userId, "Problem", weekAgo);
      const weeklyProblemXp = await xpLedger.getXpSumForType(userId, "Problem", weekAgo);
      const weeklyLessons = await xpLedger.countXp(userId, "Lesson", weekAgo);

      // Token balance
      const tokenBalance = await prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });

      // Badge count
      const badgeCount = await prisma.userBadge.count({ where: { userId } });
      const recentBadge = await prisma.userBadge.findFirst({
        where: { userId },
        orderBy: { earnedAt: "desc" },
        include: { badge: { select: { name: true, icon: true } } },
      });

      const contestParticipants = await prisma.contestParticipant.findMany({
        where: {
          studentId: userId,
          OR: [
            { finishedAt: { not: null } },
            { status: { in: ["finished", "expired"] } },
          ],
        },
        take: 3,
        orderBy: { updatedAt: "desc" },
        include: {
          contest: {
            select: {
              id: true,
              title: true,
              durationMinutes: true,
              updatedAt: true,
              problems: { select: { id: true, problemId: true, points: true } },
              aiFeedbacks: {
                where: { studentId: userId },
                take: 1,
                orderBy: { updatedAt: "desc" },
                select: {
                  id: true,
                  status: true,
                  summary: true,
                  problemFeedback: true,
                  error: true,
                  updatedAt: true,
                },
              },
              submissions: {
                where: {
                  studentId: userId,
                  verdict: { not: "draft" },
                },
                select: {
                  problemId: true,
                  verdict: true,
                  score: true,
                  maxScore: true,
                  submittedAt: true,
                },
                orderBy: { submittedAt: "desc" },
              },
            },
          },
        },
      });

      const contestFeedbacks = await Promise.all(contestParticipants.map(async (participant) => {
        const contest = participant.contest;
        const feedback = contest.aiFeedbacks[0] || null;
        const bestByProblem = contest.problems.map((problem) => bestContestSubmission(contest.submissions, problem.problemId));
        const score = Math.round(bestByProblem.reduce((sum, submission) => sum + (submission?.score || 0), 0));
        const maxScore = contest.problems.reduce((sum, problem) => sum + problem.points, 0);
        const solved = bestByProblem.filter((submission) => submission?.verdict === "accepted").length;
        const usedMinutes = participant.startedAt && participant.finishedAt
          ? Math.max(0, Math.round((participant.finishedAt.getTime() - participant.startedAt.getTime()) / 60000))
          : null;

        let rank: number | null = null;
        try {
          const allContestSubmissions = await prisma.contestSubmission.findMany({
            where: { contestId: contest.id, verdict: { not: "draft" } },
            select: { studentId: true, problemId: true, score: true, submittedAt: true },
          });
          const scoreByStudent = new Map<string, Map<string, any>>();
          for (const submission of allContestSubmissions) {
            const byProblem = scoreByStudent.get(submission.studentId) || new Map<string, any>();
            const current = byProblem.get(submission.problemId);
            if (!current || submission.score > current.score || (submission.score === current.score && submission.submittedAt > current.submittedAt)) {
              byProblem.set(submission.problemId, submission);
            }
            scoreByStudent.set(submission.studentId, byProblem);
          }
          const ranking = [...scoreByStudent.entries()]
            .map(([studentId, byProblem]) => ({
              studentId,
              score: [...byProblem.values()].reduce((sum, submission) => sum + (submission.score || 0), 0),
            }))
            .sort((a, b) => b.score - a.score);
          const index = ranking.findIndex((item) => item.studentId === userId);
          rank = index >= 0 ? index + 1 : null;
        } catch {
          rank = null;
        }

        return {
          contestId: contest.id,
          title: contest.title,
          durationMinutes: contest.durationMinutes,
          score,
          maxScore,
          solved,
          totalProblems: contest.problems.length,
          rank,
          usedMinutes,
          status: feedback?.status || "missing",
          feedbackId: feedback?.id || null,
          summary: safeJsonParse(feedback?.summary, null),
          problems: safeJsonParse(feedback?.problemFeedback, []),
          error: feedback?.error || null,
          updatedAt: feedback?.updatedAt || contest.updatedAt,
        };
      }));

      res.json({
        courses,
        courseProgress,
        // Gamification
        xp: userXp,
        level: userLevel,
        levelProgress,
        xpToNext,
        nextLevelXp,
        leagueName,
        leagueEmoji,
        rank: userRank,
        streak: currentStreak,
        longestStreak,
        problemCount,
        lessonCount: userXpBreakdown.lessonCount,
        tokenBalance: tokenBalance?.tokenBalance ?? 0,
        badgeCount,
        recentBadge: recentBadge ? { name: recentBadge.badge.name, icon: recentBadge.badge.icon } : null,
        miniLeaderboard,
        weeklyProblemXp,
        weeklyProblems,
        weeklyLessons,
        contestFeedbacks,
      });
    } else {
      const userCount = await prisma.user.count();
      const courseCount = await prisma.course.count();
      const activeCourseCount = await prisma.course.count({ where: { status: "active" } });
      res.json({
        totalUsers: userCount,
        totalCourses: courseCount,
        activeCourses: activeCourseCount,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

export default router;
