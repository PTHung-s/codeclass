import { lazy, Suspense, type ComponentType } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AuthContext } from "./contexts/AuthContext";
import Layout from "./components/layout/Layout";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Dashboard from "./pages/dashboard/Dashboard";
import { JSX } from "react";

/**
 * lazy() + tự reload khi chunk 404 sau deploy (file hash cũ đã bị xóa khỏi server).
 * Tab cũ mở từ trước deploy sẽ tự tải lại trang 1 lần thay vì màn hình trắng.
 */
function lazyRetry<T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>) {
  return lazy(() =>
    importFn().catch((err) => {
      const KEY = "chunk-reload-at";
      const last = Number(sessionStorage.getItem(KEY) || "0");
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {}); // chờ reload
      }
      throw err;
    }),
  );
}

// Heavy / infrequently visited pages — code-split out of the initial bundle.
const CourseList = lazyRetry(() => import("./pages/courses/CourseList"));
const MaterialList = lazyRetry(() => import("./pages/materials/MaterialList"));
const MaterialDetail = lazyRetry(() => import("./pages/materials/MaterialDetail"));
const ArenaList = lazyRetry(() => import("./pages/arena/ArenaList"));
const ArenaCreate = lazyRetry(() => import("./pages/arena/ArenaCreate"));
const ArenaHistory = lazyRetry(() => import("./pages/arena/ArenaHistory"));
const ArenaReview = lazyRetry(() => import("./pages/arena/ArenaReview"));
const QuizArenaList = lazyRetry(() => import("./pages/arena/QuizArenaList"));
const QuizArenaCreate = lazyRetry(() => import("./pages/arena/QuizArenaCreate"));
const QuizArenaReview = lazyRetry(() => import("./pages/arena/QuizArenaReview"));
const Settings = lazyRetry(() => import("./pages/settings/Settings"));
const QuizPage = lazyRetry(() => import("./pages/lessons/QuizPage"));
const Leaderboard = lazyRetry(() => import("./pages/leaderboard/Leaderboard"));
const ChecklistPage = lazyRetry(() => import("./pages/checklist/ChecklistPage"));
const BugReportList = lazyRetry(() => import("./pages/bug-reports/BugReportList"));
const BugReportForm = lazyRetry(() => import("./pages/bug-reports/BugReportForm"));
const BugReportDetail = lazyRetry(() => import("./pages/bug-reports/BugReportDetail"));
const Tokens = lazyRetry(() => import("./pages/tokens/Tokens"));
const GamificationSettings = lazyRetry(() => import("./pages/tokens/GamificationSettings"));
const Quests = lazyRetry(() => import("./pages/quests/Quests"));
const MascotDemoPage = lazyRetry(() => import("./pages/mascot/MascotDemoPage"));
const TeacherAttendance = lazyRetry(() => import("./pages/attendance/TeacherAttendance"));
const StudentAttendance = lazyRetry(() => import("./pages/attendance/StudentAttendance"));
const TuitionManagement = lazyRetry(() => import("./pages/tuition/TuitionManagement"));
const Assignments = lazyRetry(() => import("./pages/assignments/Assignments"));
const MyAssignments = lazyRetry(() => import("./pages/assignments/MyAssignments"));
const PublicAttendance = lazyRetry(() => import("./pages/public/PublicAttendance"));
const PublicTuition = lazyRetry(() => import("./pages/public/PublicTuition"));
const CodeLab = lazyRetry(() => import("./pages/code-lab/CodeLab"));

const CodeDuelList = lazyRetry(() => import("./pages/code-duel/CodeDuelList"));
const CodeDuelDashboard = lazyRetry(() => import("./pages/code-duel/CodeDuelDashboard"));
const CodeDuelCreate = lazyRetry(() => import("./pages/code-duel/CodeDuelCreate"));
const CodeDuelDetail = lazyRetry(() => import("./pages/code-duel/CodeDuelDetail"));
const CodeDuelAuthoring = lazyRetry(() => import("./pages/code-duel/CodeDuelAuthoring"));
const CodeDuelGame = lazyRetry(() => import("./pages/code-duel/CodeDuelGame"));
const CodeDuelMonitor = lazyRetry(() => import("./pages/code-duel/CodeDuelMonitor"));
const CodeDuelAccessPage = lazyRetry(() => import("./pages/code-duel/CodeDuelAccessPage"));
const CodeDuelLeaderboard = lazyRetry(() => import("./pages/code-duel/CodeDuelLeaderboard"));
const CodeDuelHistory = lazyRetry(() => import("./pages/code-duel/CodeDuelHistory"));

const CourseDetail = lazyRetry(() => import("./pages/courses/CourseDetail"));
const CourseForm = lazyRetry(() => import("./pages/courses/CourseForm"));
const CourseCurriculum = lazyRetry(() => import("./pages/courses/CourseCurriculum"));
const CourseTrackingTab = lazyRetry(() => import("./pages/courses/tracking/CourseTrackingTab"));
const ProblemList = lazyRetry(() => import("./pages/problems/ProblemList"));
const ProblemDetail = lazyRetry(() => import("./pages/problems/ProblemDetail"));
const ProblemForm = lazyRetry(() => import("./pages/problems/ProblemForm"));
const ArenaGame = lazyRetry(() => import("./pages/arena/ArenaGame"));
const QuizArenaGame = lazyRetry(() => import("./pages/arena/QuizArenaGame"));
const StudentProfile = lazyRetry(() => import("./pages/students/StudentProfile"));
const LessonView = lazyRetry(() => import("./pages/lessons/LessonView"));
const AdaptiveTestPage = lazyRetry(() => import("./pages/lessons/AdaptiveTestPage"));
const AdaptiveHistoryPage = lazyRetry(() => import("./pages/lessons/AdaptiveHistoryPage"));
const AIAdmin = lazyRetry(() => import("./pages/admin/AIAdmin"));
const AdminPanel = lazyRetry(() => import("./pages/admin/AdminPanel"));
const MonitorPage = lazyRetry(() => import("./pages/monitor/MonitorPage"));
const SkillHeatmap = lazyRetry(() => import("./pages/teacher/SkillHeatmap"));
const EngineConfigPage = lazyRetry(() => import("./pages/admin/EngineConfig"));
const RecLogPage = lazyRetry(() => import("./pages/admin/RecLog"));
const SkillTagReview = lazyRetry(() => import("./pages/admin/SkillTagReview"));
const QuizBankReview = lazyRetry(() => import("./pages/admin/QuizBankReview"));
const ContentManager = lazyRetry(() => import("./pages/admin/ContentManager"));
const ServerMonitor = lazyRetry(() => import("./pages/admin/ServerMonitor"));
const MascotChatterStudio = lazyRetry(() => import("./pages/mascot/MascotChatterStudio"));
const MeetPage = lazyRetry(() => import("./pages/meet/MeetPage"));
const SessionCoursePage = lazyRetry(() => import("./pages/session/SessionCoursePage"));
const SessionLessonHomePage = lazyRetry(() => import("./pages/session/SessionLessonHomePage"));
const SessionVideoPage = lazyRetry(() => import("./pages/session/SessionVideoPage"));
const SessionReadingPage = lazyRetry(() => import("./pages/session/SessionReadingPage"));
const SessionCodePage = lazyRetry(() => import("./pages/session/SessionCodePage"));
const SessionQuizPage = lazyRetry(() => import("./pages/session/SessionQuizPage"));
const SessionTeacherPage = lazyRetry(() => import("./pages/session/SessionTeacherPage"));
const ExamList = lazyRetry(() => import("./pages/exams/ExamList"));
const ExamImport = lazyRetry(() => import("./pages/exams/ExamImport"));
const ExamEdit = lazyRetry(() => import("./pages/exams/ExamEdit"));
const ExamTestcases = lazyRetry(() => import("./pages/exams/ExamTestcases"));
const ExamLobby = lazyRetry(() => import("./pages/exams/ExamLobby"));
const ExamTake = lazyRetry(() => import("./pages/exams/ExamTake"));
const ExamMonitor = lazyRetry(() => import("./pages/exams/ExamMonitor"));
const ExamGrading = lazyRetry(() => import("./pages/exams/ExamGrading"));
const ExamRanking = lazyRetry(() => import("./pages/exams/ExamRanking"));
const ExamResult = lazyRetry(() => import("./pages/exams/ExamResult"));

function ProtectedRoute({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="flex items-center justify-center min-h-screen text-gray-500 dark:text-gray-400">Đang tải...</div>;
  if (!auth.user) return <Navigate to="/login" />;
  if (auth.user.mustChangePassword && location.pathname !== "/settings") return <Navigate to="/settings" replace />;
  if (roles && !roles.includes(auth.user.role)) return <Navigate to="/dashboard" />;
  return children;
}

export default function App() {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground">Đang tải trang...</div>}>
      <Routes>
        <Route path="/login" element={auth.user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/register" element={auth.user ? <Navigate to="/dashboard" /> : <Register />} />
        <Route path="/mascot" element={<ProtectedRoute><MascotDemoPage /></ProtectedRoute>} />
        <Route path="/attendance" element={
          <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
            <TeacherAttendance />
          </ProtectedRoute>
        } />
        <Route path="/tuition" element={<ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}><TuitionManagement /></ProtectedRoute>} />
        <Route path="/public/attendance" element={<PublicAttendance />} />
        <Route path="/public/tuition" element={<PublicTuition />} />
        <Route path="/*" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="courses" element={<CourseList />} />
          <Route path="courses/new" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <CourseForm />
            </ProtectedRoute>
          } />
          <Route path="courses/:courseId" element={<CourseDetail />}>
            <Route index element={<Navigate to="curriculum" replace />} />
            <Route path="curriculum" element={<CourseCurriculum />} />
            <Route
              path="tracking"
              element={
                <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
                  <CourseTrackingTab />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route
            path="monitor"
            element={
              <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
                <MonitorPage />
              </ProtectedRoute>
            }
          />
          <Route path="courses/:courseId/edit" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <CourseForm />
            </ProtectedRoute>
          } />
          <Route path="course/:courseId" element={<SessionCoursePage />} />
          <Route path="course/:courseId/lesson/:lessonId" element={<SessionLessonHomePage />} />
          <Route path="course/:courseId/lesson/:lessonId/video" element={<SessionVideoPage />} />
          <Route path="course/:courseId/lesson/:lessonId/reading" element={<SessionReadingPage />} />
          <Route path="course/:courseId/lesson/:lessonId/code" element={<SessionCodePage />} />
          <Route path="course/:courseId/lesson/:lessonId/quiz" element={<SessionQuizPage />} />
          <Route path="teacher/course/:courseId/lesson/:lessonId" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <SessionTeacherPage />
            </ProtectedRoute>
          } />
          <Route path="problems" element={<ProblemList />} />
          <Route path="problems/new" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <ProblemForm />
            </ProtectedRoute>
          } />
          <Route path="problems/:problemId" element={<ProblemDetail />} />
          <Route path="problems/:problemId/edit" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <ProblemForm />
            </ProtectedRoute>
          } />
          <Route path="materials" element={<MaterialList />} />
          <Route path="materials/:id" element={<MaterialDetail />} />
          <Route path="arena" element={<ArenaList />} />
          <Route path="arena/new" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ArenaCreate />
            </ProtectedRoute>
          } />
          <Route path="arena/:id" element={<ArenaGame />} />
          <Route path="arena/history" element={<ArenaHistory />} />
          <Route path="arena/:id/review" element={<ArenaReview />} />
          <Route path="quiz-arena" element={<QuizArenaList />} />
          <Route path="quiz-arena/new" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <QuizArenaCreate />
            </ProtectedRoute>
          } />
          <Route path="quiz-arena/history" element={<ArenaHistory />} />
          <Route path="quiz-arena/:id/review" element={<QuizArenaReview />} />
          <Route path="quiz-arena/:id" element={<QuizArenaGame />} />
          <Route path="students/:studentId" element={<StudentProfile />} />
          <Route path="lessons/:lessonId" element={<LessonView />} />
          <Route path="lessons/:lessonId/quiz" element={<QuizPage />} />
          <Route path="adaptive-test" element={<AdaptiveTestPage />} />
          <Route path="adaptive-history" element={<AdaptiveHistoryPage />} />
          <Route path="my-attendance" element={<StudentAttendance />} />
          <Route path="assignments" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <Assignments />
            </ProtectedRoute>
          } />
          <Route path="my-assignments" element={<MyAssignments />} />
          <Route path="code-lab" element={<CodeLab />} />
          <Route path="exams" element={<ExamList />} />
          <Route path="exams/new" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ExamImport />
            </ProtectedRoute>
          } />
          <Route path="exams/:examId/edit" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ExamEdit />
            </ProtectedRoute>
          } />
          <Route path="exams/:examId/testcases" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ExamTestcases />
            </ProtectedRoute>
          } />
          <Route path="exams/:examId/monitor" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ExamMonitor />
            </ProtectedRoute>
          } />
          <Route path="exams/:examId/grading" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ExamGrading />
            </ProtectedRoute>
          } />
          {/* Bảng xếp hạng: HS xem được khi GV bật showRanking (API tự chặn + trang hiện thông báo) */}
          <Route path="exams/:examId/ranking" element={<ExamRanking />} />
          <Route path="exams/:examId/preview" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ExamTake preview />
            </ProtectedRoute>
          } />
          <Route path="exams/:examId/take" element={<ExamTake />} />
          <Route path="exams/:examId/result" element={<ExamResult />} />
          <Route path="exams/:examId" element={<ExamLobby />} />
          <Route path="code-duel" element={<CodeDuelList />} />
          <Route path="code-duel/dashboard" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <CodeDuelDashboard />
            </ProtectedRoute>
          } />
          <Route path="code-duel/new" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <CodeDuelCreate />
            </ProtectedRoute>
          } />
          <Route path="code-duel/:id/authoring" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <CodeDuelAuthoring />
            </ProtectedRoute>
          } />
          <Route path="code-duel/:id/monitor" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <CodeDuelMonitor />
            </ProtectedRoute>
          } />
          <Route path="code-duel/:id/access" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <CodeDuelAccessPage />
            </ProtectedRoute>
          } />
          <Route path="code-duel/:id/history" element={<CodeDuelHistory />} />
          <Route path="code-duel/:id/leaderboard" element={<CodeDuelLeaderboard />} />
          <Route path="code-duel/:id/game" element={<CodeDuelGame />} />
          <Route path="code-duel/:id" element={<CodeDuelDetail />} />
          <Route path="admin" element={
            <ProtectedRoute roles={["admin"]}>
              <AdminPanel />
            </ProtectedRoute>
          } />
          <Route path="admin/ai-tools" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <AIAdmin />
            </ProtectedRoute>
          } />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="quests" element={<Quests />} />
          <Route path="gamification-settings" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <GamificationSettings />
            </ProtectedRoute>
          } />
          <Route path="checklist" element={<ChecklistPage />} />
          <Route path="bug-reports" element={<BugReportList />} />
          <Route path="teacher/skill-heatmap" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <SkillHeatmap />
            </ProtectedRoute>
          } />
          <Route path="admin/engine-config" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <EngineConfigPage />
            </ProtectedRoute>
          } />
          <Route path="admin/rec-logs" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <RecLogPage />
            </ProtectedRoute>
          } />
          <Route path="admin/skill-tags" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <SkillTagReview />
            </ProtectedRoute>
          } />
          <Route path="admin/quiz-bank" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <QuizBankReview />
            </ProtectedRoute>
          } />
          <Route path="admin/server" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <ServerMonitor />
            </ProtectedRoute>
          } />
          <Route path="admin/content" element={
            <ProtectedRoute roles={["teacher", "admin", "teaching_assistant"]}>
              <ContentManager />
            </ProtectedRoute>
          } />
          <Route path="bug-reports/new" element={<BugReportForm />} />
          <Route path="bug-reports/:id" element={<BugReportDetail />} />
          <Route path="mascot-studio" element={
            <ProtectedRoute roles={["admin", "teacher", "teaching_assistant"]}>
              <MascotChatterStudio />
            </ProtectedRoute>
          } />
          <Route path="meet" element={<MeetPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      </Suspense>
    </AuthContext.Provider>
  );
}
