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

async function getStaffActionItems() {
  const [examsNeedsReview, openBugReports, pendingRedemptions, pendingHackTests] = await Promise.all([
    prisma.examAttempt.count({ where: { gradeStatus: "needs_review" } }),
    prisma.bugReport.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.rewardRedemption.count({ where: { status: "pending" } }),
    prisma.hackTest.count({ where: { status: "pending" } }),
  ]);
  return { examsNeedsReview, openBugReports, pendingRedemptions, pendingHackTests };
}

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;

    if (req.user!.role === "teacher" || req.user!.role === "teaching_assistant") {
      const [courses, memberCount, actionItems] = await Promise.all([
        prisma.course.findMany({ select: { id: true } }),
        prisma.user.count({ where: { role: "student", status: "active" } }),
        getStaffActionItems(),
      ]);

      res.json({
        activeCourses: courses.length,
        totalStudents: memberCount,
        actionItems,
      });
    } else if (req.user!.role === "student") {
      const activeCourses = await prisma.course.findMany({
        where: { status: "active" },
        select: { id: true },
      });

      const courseIds = activeCourses.map((m) => m.id);

      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds }, status: "active" },
        select: { id: true, title: true, description: true, kind: true },
      });

      // Course progress: lessons completed vs total per course (supports both content & session courses)
      const courseProgress = await Promise.all(
        courseIds.map(async (cid) => {
          const course = courses.find((c) => c.id === cid);
          if (course?.kind === "session") {
            const totalLessons = await prisma.sessionLesson.count({
              where: { courseId: cid, status: "published" },
            });
            const completedLessons = await prisma.userSessionProgress.count({
              where: { userId, status: "verified", lesson: { courseId: cid } },
            });
            const nextLesson =
              totalLessons > 0
                ? await prisma.sessionLesson.findFirst({
                    where: {
                      courseId: cid,
                      status: "published",
                      progress: { none: { userId, status: "verified" } },
                    },
                    orderBy: { orderIndex: "asc" },
                    select: { id: true, title: true },
                  })
                : null;
            return {
              course: { id: cid, title: course?.title || "Unknown", kind: "session" },
              totalLessons,
              completedLessons,
              nextLesson,
            };
          }

          const totalLessons = await prisma.lesson.count({
            where: { courseId: cid, status: { not: "archived" } },
          });
          const completedLessons = await prisma.lessonProgress.count({
            where: { userId, lesson: { courseId: cid } },
          });
          const nextLesson =
            totalLessons > 0
              ? await prisma.lesson.findFirst({
                  where: {
                    courseId: cid,
                    status: { not: "archived" },
                    progress: { none: { userId } },
                  },
                  orderBy: [{ module: { orderIndex: "asc" } }, { orderIndex: "asc" }],
                  select: { id: true, title: true },
                })
              : null;
          return {
            course: { id: cid, title: course?.title || "Unknown", kind: course?.kind || "content" },
            totalLessons,
            completedLessons,
            nextLesson,
          };
        }),
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
          OR: [{ finishedAt: { not: null } }, { status: { in: ["finished", "expired"] } }],
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

      const contestFeedbacks = await Promise.all(
        contestParticipants.map(async (participant) => {
          const contest = participant.contest;
          const feedback = contest.aiFeedbacks[0] || null;
          const bestByProblem = contest.problems.map((problem) => bestContestSubmission(contest.submissions, problem.problemId));
          const score = Math.round(bestByProblem.reduce((sum, submission) => sum + (submission?.score || 0), 0));
          const maxScore = contest.problems.reduce((sum, problem) => sum + problem.points, 0);
          const solved = bestByProblem.filter((submission) => submission?.verdict === "accepted").length;
          const usedMinutes =
            participant.startedAt && participant.finishedAt
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
        }),
      );

      const [assignedRows, openExams] = await Promise.all([
        prisma.assignmentStudent.findMany({
          where: {
            studentId: userId,
            assignment: { status: "published", submissionType: "problem", problemId: { not: null } },
          },
          include: {
            assignment: {
              select: {
                id: true,
                title: true,
                deadline: true,
                problemId: true,
                problem: { select: { id: true, title: true, difficulty: true } },
              },
            },
          },
        }),
        prisma.exam.findMany({
          where: {
            status: "published",
            OR: [{ closeAt: null }, { closeAt: { gt: new Date() } }],
          },
          include: {
            attempts: {
              where: { studentId: userId },
              select: { status: true, gradeStatus: true, totalScore: true, maxScore: true },
            },
          },
          orderBy: [{ closeAt: "asc" }, { createdAt: "desc" }],
          take: 5,
        }),
      ]);

      const assignedProblemIds = [...new Set(assignedRows.map((r) => r.assignment.problemId).filter((id): id is string => !!id))];
      const passedProblemIds = assignedProblemIds.length
        ? new Set(
            (
              await prisma.problemSubmission.findMany({
                where: { studentId: userId, passed: true, problemId: { in: assignedProblemIds } },
                select: { problemId: true },
              })
            ).map((s) => s.problemId),
          )
        : new Set<string>();

      const pendingAssignments = assignedRows
        .filter((r) => r.assignment.problemId && !passedProblemIds.has(r.assignment.problemId))
        .map((r) => ({
          id: r.assignment.id,
          title: r.assignment.title,
          problemId: r.assignment.problemId!,
          problemTitle: r.assignment.problem?.title || r.assignment.title,
          difficulty: r.assignment.problem?.difficulty || "medium",
          deadline: r.assignment.deadline,
        }))
        .sort((a, b) => {
          if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          if (a.deadline) return -1;
          if (b.deadline) return 1;
          return 0;
        })
        .slice(0, 5);

      const activeExams = openExams.map((e) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        durationMinutes: e.durationMinutes,
        closeAt: e.closeAt,
        attemptStatus: e.attempts[0]?.status ?? null,
        gradeStatus: e.attempts[0]?.gradeStatus ?? null,
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
        pendingAssignments,
        activeExams,
      });
    } else {
      const [userCount, courseCount, activeCourseCount, actionItems] = await Promise.all([
        prisma.user.count(),
        prisma.course.count(),
        prisma.course.count({ where: { status: "active" } }),
        getStaffActionItems(),
      ]);
      res.json({
        totalUsers: userCount,
        totalCourses: courseCount,
        activeCourses: activeCourseCount,
        actionItems,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

export default router;
