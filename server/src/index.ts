import "dotenv/config";
import express from "express";
import compression from "compression";
import cors from "cors";
import path from "path";
import http from "http";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import courseRoutes from "./routes/courses";
import moduleRoutes from "./routes/modules";
import lessonRoutes from "./routes/lessons";
import materialRoutes from "./routes/materials";
import problemRoutes from "./routes/problems";
import problemSubmissionRoutes from "./routes/problemSubmissions";
import dashboardRoutes from "./routes/dashboard";
import notificationRoutes from "./routes/notifications";
import studentRoutes from "./routes/students";
import aiAdminRoutes from "./routes/ai-admin";
import aiChatRoutes from "./routes/ai-chat";
import hintRoutes from "./routes/hints";
import searchRoutes from "./routes/search";
import quizRoutes from "./routes/quizzes";
import leaderboardRoutes from "./routes/leaderboard";
import uploadRoutes from "./routes/upload";
import judgeRoutes from "./routes/judge";
import checklistRoutes from "./routes/checklist";
import codeRunnerRoutes from "./routes/codeRunner";
import hackTestRoutes from "./routes/hackTests";
import bugReportRoutes from "./routes/bugReports";
import helpRequestRoutes from "./routes/helpRequests";
import dailyAttendanceRoutes, { expireExpiredAttendanceSessions } from "./routes/dailyAttendance";
import tuitionRoutes from "./routes/tuition";
import adaptiveRoutes from "./routes/adaptive";
import trackingRoutes from "./routes/tracking";
import debugArenaRoutes from "./routes/debugArena";
import tokenRoutes from "./routes/tokens";
import streakRoutes from "./routes/streak";
import questRoutes from "./routes/quests";
import weaknessTagRoutes from "./routes/weaknessTags";
import skillsRoutes from "./routes/skills";
import skillTagRoutes from "./routes/skillTags";
import quizBankRoutes from "./routes/quizBank";
import adminSettingsRoutes from "./routes/adminSettings";
import announcementRoutes from "./routes/announcement";
import avatarRoutes from "./routes/avatars";
import rosterExclusionRoutes from "./routes/rosterExclusions";
import checklistAssignmentRoutes from "./routes/checklistAssignments";
import challengeAttemptRoutes from "./routes/challengeAttempts";
import courseTrackingRoutes from "./routes/courseTracking";
import recordingRoutes from "./routes/recordings";
import adminMetricsRoutes from "./routes/adminMetrics";
import honourRoutes from "./routes/honour";
import codeDuelRoutes from "./routes/codeDuel";
import sessionCourseRoutes from "./routes/sessionCourse";
import gachaRoutes from "./routes/gacha";
import realtimeRoutes from "./routes/realtime";
import examRoutes from "./routes/exams";
import assignmentRoutes from "./routes/assignments";
import codeLabSnippetsRoutes from "./routes/codeLabSnippets";
import meetingRoutes from "./routes/meetings";
import publicParentRoutes from "./routes/publicParent";
import { initWebSocketServer } from "./services/gameWebSocket";
import { runStorageCleanup } from "./services/storageCleanup";
import { countRequest } from "./utils/metrics";
import { rateLimit } from "express-rate-limit";

const app = express();
// Caddy reverse proxy sits 1 hop in front; without this, express-rate-limit
// throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on odd X-Forwarded-For headers
// and every limited endpoint returns 500 instead of working.
app.set("trust proxy", 1);
app.disable("x-powered-by");
const PORT = process.env.PORT || 3001;

// Nén gzip/brotli cho MỌI response (JS bundle ~750KB -> ~230KB, JSON API lớn cũng
// giảm tương tự) — phải đặt TRƯỚC các route/static để có tác dụng.
app.use(compression());

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173,http://127.0.0.1:5173").split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// ── Rate limiting ──
// Code runner compiles/spawns processes and adaptive answers rewrite the DB —
// both need protection against accidental or malicious request floods.
// Ceilings stay generous because a whole classroom shares one public IP (NAT):
// 30 students pressing "Run" during a lesson exceeds 60/min, so limits only
// stop genuine floods, not normal class activity.
// NOTE: no limit on /api/auth — an IP-based login limit would block an entire
// class after a handful of logins.
const codeRunLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Quá nhiều yêu cầu chạy code. Vui lòng đợi 1 phút rồi thử lại." },
});
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút." },
});
app.use("/api/run", codeRunLimiter);
app.use("/api/adaptive", codeRunLimiter);
app.use("/api/tracking", trackingLimiter);

// Count every API request for the admin monitor's requests/sec metric.
app.use("/api", (req, _res, next) => { countRequest(); next(); });

// Health check for Caddy reverse proxy
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api", moduleRoutes);
app.use("/api", lessonRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api", problemSubmissionRoutes);
app.use("/api", hackTestRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", studentRoutes);
app.use("/api/ai", aiAdminRoutes);
app.use("/api/ai", aiChatRoutes);
app.use("/api", hintRoutes);
app.use("/api/search", searchRoutes);
app.use("/api", quizRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api", judgeRoutes);
app.use("/api", checklistRoutes);
app.use("/api", codeRunnerRoutes);
app.use("/api/bug-reports", bugReportRoutes);
app.use("/api/help-requests", helpRequestRoutes);
app.use("/api/attendance", dailyAttendanceRoutes);
app.use("/api/tuition", tuitionRoutes);
app.use("/api", adaptiveRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/arenas", debugArenaRoutes);
app.use("/api/code-duel", codeDuelRoutes);
app.use("/api", tokenRoutes);
app.use("/api", streakRoutes);
app.use("/api", questRoutes);
app.use("/api", weaknessTagRoutes);
app.use("/api/skills", skillsRoutes);
app.use("/api/skill-tags", skillTagRoutes);
app.use("/api/quiz-bank", quizBankRoutes);
app.use("/api/admin-settings", adminSettingsRoutes);
app.use("/api/announcement", announcementRoutes);
app.use("/api/avatars", avatarRoutes);
app.use("/api/roster-exclusions", rosterExclusionRoutes);
app.use("/api/checklist-assignments", checklistAssignmentRoutes);
app.use("/api", challengeAttemptRoutes);
app.use("/api", courseTrackingRoutes);
app.use("/api", recordingRoutes);
app.use("/api", adminMetricsRoutes);
app.use("/api", honourRoutes);
app.use("/api/session-course", sessionCourseRoutes);
app.use("/api/gacha", gachaRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/code-lab", codeLabSnippetsRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/public/parent", publicParentRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In production, serve the React build
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist, {
    setHeaders: (res, filePath) => {
      // index.html must always revalidate so the browser picks up the newest hashed bundle
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      // hashed assets under /assets/ are content-addressed -> safe to cache forever
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      // course content JSON can change -> revalidate
      } else if (filePath.includes(`${path.sep}course-content${path.sep}`)) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      }
    },
  }));
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = http.createServer(app);
initWebSocketServer(server);

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; stopping interactive Code Lab sessions.`);
  const forceExitTimer = setTimeout(() => process.exit(0), 5_000);
  forceExitTimer.unref();
  import("./utils/interactiveRunner")
    .then(({ stopAllInteractiveSessions }) => stopAllInteractiveSessions())
    .then(() => {
      server.close(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      });
    })
    .catch(() => {
      server.close(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      });
    });
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Never let a stray async error kill the process (a Docker restart would
// interrupt every student mid-lesson). Log and continue instead.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

// Resume any in-progress arenas after a server restart
import("./services/debugArenaService")
  .then(({ resumeInProgressArenas }) => resumeInProgressArenas())
  .catch(() => {});
// Seed default meme stickers (idempotent)
import("./utils/seedStickers")
  .then(({ seedDefaultStickers }) => seedDefaultStickers())
  .catch((err) => console.error("Sticker seed failed:", err));
// Seed + migrate GameEvent (idempotent)
import("./utils/seedEvents")
  .then(({ seedDefaultEvents }) => seedDefaultEvents())
  .catch((err) => console.error("Event seed failed:", err));
// Resume any in-progress Code Duel matches after a server restart
import("./services/codeDuelService")
  .then(({ resumeInProgressMatches }) => resumeInProgressMatches())
  .catch(() => {});
// Exam room: expire stale attempts + recover grade jobs
import("./services/examAttemptService")
  .then(async ({ expireStaleAttempts, recoverStaleGradeJobs }) => {
    await recoverStaleGradeJobs();
    await expireStaleAttempts();
    setInterval(() => {
      void expireStaleAttempts();
      void recoverStaleGradeJobs();
    }, 60_000);
  })
  .catch((err) => console.error("Exam sweep init failed:", err));
// ── Daily weakness analysis at 10 PM Vietnam time ──
function scheduleWeaknessAnalysis() {
  const checkAndRun = async () => {
    const now = new Date();
    const vnHour = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })).getHours();
    // Run at 22:00 (10 PM) Vietnam
    if (vnHour === 22) {
      const lastRunKey = `weakness_analysis_${new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })).toDateString()}`;
      const todayKey = new Date().toDateString();
      // Simple in-memory guard: only run once per day
      if ((scheduleWeaknessAnalysis as any)._lastRun !== todayKey) {
        (scheduleWeaknessAnalysis as any)._lastRun = todayKey;
        console.log("[WeaknessAnalysis] Starting daily analysis at", new Date().toISOString());
        try {
          const { runDailyWeaknessAnalysis } = await import("./services/weaknessAnalysis");
          const result = await runDailyWeaknessAnalysis();
          console.log("[WeaknessAnalysis] Done:", result.analyzed, "students analyzed");
        } catch (err) {
          console.error("[WeaknessAnalysis] Daily run failed:", err);
        }
      }
    }
  };
  // Check every 5 minutes
  setInterval(checkAndRun, 5 * 60 * 1000);
  // Also check once on startup (in case server restarts at 10 PM)
  checkAndRun();
}
scheduleWeaknessAnalysis();

setInterval(() => {
  expireExpiredAttendanceSessions().catch((err) => {
    console.error("[Attendance] Session expiry failed:", err);
  });
}, 60_000);
expireExpiredAttendanceSessions().catch(() => {});

// Retry object-store deletes left behind by transient R2/network failures.
runStorageCleanup();
setInterval(() => { void runStorageCleanup(); }, 5 * 60_000).unref();

// Assignment 24h pre-deadline reminder sweep (every 15 minutes + 30s after startup).
import("./services/assignmentService")
  .then(({ sendDueSoonAssignmentReminders }) => {
    const t = setTimeout(() => { void sendDueSoonAssignmentReminders().catch(() => {}); }, 30_000);
    t.unref();
    setInterval(() => { void sendDueSoonAssignmentReminders().catch(() => {}); }, 15 * 60_000).unref();
  })
  .catch(() => {});

// Rotating daily SQLite VACUUM INTO backups (keeps last 7 backups).
import("./services/dbBackupService")
  .then(({ scheduleDailyDatabaseBackups }) => scheduleDailyDatabaseBackups())
  .catch(() => {});

server.listen(PORT, () => {
  console.log(`CodeClass API running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV === "production") {
    console.log(`Serving React build from ${clientDist}`);
  }
});

// Seed skill graph on first run (idempotent)
import("./services/skillMastery")
  .then(({ seedSkillsIfEmpty }) => seedSkillsIfEmpty())
  .catch((err) => console.error("Skill seed error:", err));

export default app;
