import { useEffect, useRef, useState, useCallback } from"react";
import { useQuery, useMutation, useQueryClient } from"@tanstack/react-query";
import { useParams, useNavigate } from"react-router-dom";
import { useAuthContext } from"../../contexts/AuthContext";
import { getAvatarBgColor } from"../../lib/utils";
import api from"../../lib/api";
import ProblemViewer from"../../components/ui/ProblemViewer";
import ConfirmDialog from"../../components/ui/ConfirmDialog";
import PythonCodeWorkspace from"../../components/ui/PythonCodeWorkspace";
import { StudentWorkspacePanel } from"../../components/ui/StudentWorkspaceShell";
import { useToast } from"../../hooks/useToast";
import { useReward } from"../../hooks/useReward";
import { useMascot, msgSolved } from"../../components/mascot";
import { fireACConfetti } from"../../lib/confetti";
import StudentChecklistModal from"../../components/ui/StudentChecklistModal";
import ProblemTestManager from"../../components/ui/ProblemTestManager";
import { DifficultyBadge } from"../../components/ui/Badges";
import { Button } from"../../components/ui/button";
import { SkeletonProblemDetail } from"../../components/ui/skeletons/SkeletonProblemDetail";
import { StudentName } from"../../components/ui/StudentName";
import Editor from"@monaco-editor/react";
import { ArrowLeft, Bug, CheckCircle2, Clock, ClipboardList, Database, Edit, FileText, Loader2, Send, ShieldCheck, Tag, Users, XCircle } from"lucide-react";

type PracticeTrackingState = {
 startedAt: number;
 lastActivityAt: number | null;
 activeMs: number;
 typedChars: number;
 lastCode: string;
};

const STUDENT_TABS = [
 { id: 0, label:"Đề bài", icon: FileText },
 { id: 1, label:"Luyện tập", icon: Send },
 { id: 2, label:"Lịch sử", icon: ClipboardList },
 { id: 3, label:"Hacktest", icon: Bug },
] as const;

const TEACHER_TABS = [
 { id: 0, label:"Đề bài", icon: FileText },
 { id: 1, label:"Bài nộp của HS", icon: Users },
 { id: 2, label:"Hacktest", icon: ShieldCheck },
 { id: 4, label:"Bộ test", icon: Database },
] as const;

function parseJudgeNote(note?: string | null) {
 if (!note) return null;
 const match = note.match(/Auto-judge \((\d+)\/(\d+)\) - ([\d.]+)\/10/);
 if (!match) return null;
 return {
 passed: Number(match[1]),
 total: Number(match[2]),
 score: Number(match[3]),
 lines: note.split("\n").filter((line) => line.includes("Test")),
 };
}

export default function ProblemDetail() {
 const { problemId } = useParams();
 const { user } = useAuthContext();
 const navigate = useNavigate();
 const qc = useQueryClient();
 const toast = useToast();
 const reward = useReward();
 const { say } = useMascot();
 const isTeacher = user?.role ==="teacher" || user?.role ==="admin";
 const isStudent = !isTeacher;

 const [activeTab, setActiveTab] = useState(0);
 const [code, setCode] = useState("");
 const [answer, setAnswer] = useState("");
 const [note, setNote] = useState("");
 const [showConfirm, setShowConfirm] = useState(false);
 const [checklistStudent, setChecklistStudent] = useState<{ id: string; fullName: string; nickname?: string | null; email: string } | null>(null);
 const [practiceSubmissionId, setPracticeSubmissionId] = useState<string | null>(null);
 const [submitError, setSubmitError] = useState("");
 const [submitSuccess, setSubmitSuccess] = useState("");
 const [hackInput, setHackInput] = useState("");
 const [hackOutput, setHackOutput] = useState("");
 const [hackNote, setHackNote] = useState("");
 const [hackError, setHackError] = useState("");
 const [rejectTarget, setRejectTarget] = useState<{ hackTestId: string } | null>(null);
 const [rejectReason, setRejectReason] = useState("");
 const draftKeyRef = useRef(`problem_draft_${problemId}`);
 const restoredDraftRef = useRef(false);
 const trackingRef = useRef<PracticeTrackingState>({
 startedAt: Date.now(),
 lastActivityAt: null,
 activeMs: 0,
 typedChars: 0,
 lastCode:"",
 });

 const resetPracticeTracking = useCallback((initialCode ="") => {
 trackingRef.current = {
 startedAt: Date.now(),
 lastActivityAt: null,
 activeMs: 0,
 typedChars: 0,
 lastCode: initialCode,
 };
 }, []);

 const setCodeWithoutTracking = useCallback((value: string) => {
 setCode(value);
 resetPracticeTracking(value);
 }, [resetPracticeTracking]);

 const handleTrackedCodeChange = useCallback((value: string) => {
 const now = Date.now();
 const state = trackingRef.current;
 if (state.lastActivityAt) {
 state.activeMs += Math.min(now - state.lastActivityAt, 30_000);
 }
 state.lastActivityAt = now;
 state.typedChars += Math.max(0, value.length - state.lastCode.length);
 state.lastCode = value;
 setCode(value);
 }, []);

 const getPracticeTrackingPayload = useCallback(() => {
 const now = Date.now();
 const state = trackingRef.current;
 const activeMs = state.activeMs + (state.lastActivityAt ? Math.min(now - state.lastActivityAt, 30_000) : 0);
 const activeTimeSeconds = Math.max(0, Math.round(activeMs / 1000));
 const totalTimeSeconds = Math.max(0, Math.round((now - state.startedAt) / 1000));
 const typingSpeed = activeTimeSeconds > 0 && state.typedChars > 0
 ? Math.round(state.typedChars / (activeTimeSeconds / 60))
 : null;

 return {
 typingSpeed,
 activeTimeSeconds,
 totalTimeSeconds,
 };
 }, []);

 const { data: problem, isLoading } = useQuery({
 queryKey: ["problem", problemId],
 queryFn: () => api.get(`/problems/${problemId}`).then((r) => r.data),
 });

 const submissionsQuery = useQuery({
 queryKey: ["problemSubmissions", problemId],
 queryFn: () => api.get(`/problems/${problemId}/submissions`).then((r) => r.data),
 enabled: !!problemId && isStudent,
 // Có bài đang chấm nền thì tự poll để hiện tiến độ "Đang chấm x/y".
 refetchInterval: (query) => {
   const rows = query.state.data as any[] | undefined;
   return rows?.some((r) => r?.status === "pending" || r?.status === "judging") ? 2000 : false;
 },
 });

 const assignedStudentsQuery = useQuery({
 queryKey: ["assignedStudents", problemId],
 queryFn: () => api.get(`/problems/${problemId}/assigned-students`).then((r) => r.data),
 enabled: !!problemId && isTeacher,
 });

 const hackTestsQuery = useQuery({
 queryKey: ["problemHackTests", problemId],
 queryFn: () => api.get(`/problems/${problemId}/hacktests`).then((r) => r.data),
 enabled: !!problemId,
 });

 const practiceSubmissionQuery = useQuery({
 queryKey: ["practiceSubmission", practiceSubmissionId],
 queryFn: () => api.get(`/problem-submissions/${practiceSubmissionId}`).then((r) => r.data),
 enabled: !!practiceSubmissionId,
 });

 const tabs = isTeacher ? TEACHER_TABS : STUDENT_TABS;

 // Restore saved draft OR set starter code — only once on problem mount
 const codeInitialized = useRef(false);

 useEffect(() => {
 draftKeyRef.current = `problem_draft_${problemId}`;
 restoredDraftRef.current = false;
 codeInitialized.current = false;
 resetPracticeTracking("");
 }, [problemId, resetPracticeTracking]);

 useEffect(() => {
 // Try to restore saved draft first
 const saved = localStorage.getItem(draftKeyRef.current);
 if (saved) {
 try {
 const parsed = JSON.parse(saved);
 if (parsed.code) setCodeWithoutTracking(parsed.code);
 if (parsed.answer) setAnswer(parsed.answer);
 if (parsed.note) setNote(parsed.note);
 restoredDraftRef.current = true;
 codeInitialized.current = true;
 return; // Don't overwrite with starter
 } catch {
 // Ignore corrupt draft.
 }
 }

 // No draft: use starter code
 if (problem && !codeInitialized.current) {
 setCodeWithoutTracking(problem.starterCode ||"");
 codeInitialized.current = true;
 }
 }, [problemId, problem, setCodeWithoutTracking]);

 // Auto-save draft with debounce (but don't trigger re-renders)
 const saveTimer = useRef<ReturnType<typeof setTimeout>>();
 const codeRef = useRef(code);
 const answerRef = useRef(answer);
 const noteRef = useRef(note);
 const workspaceRef = useRef<HTMLDivElement>(null); // anchor for floating reward on solve
 // Theo dõi chấm nền: id bài vừa nộp / đang chấm / đã ĂN MỪNG (tránh lặp).
 const justSubmittedRef = useRef<Set<string>>(new Set());
 const prevPendingRef = useRef<Set<string>>(new Set());
 const celebratedRef = useRef<Set<string>>(new Set());
 codeRef.current = code;
 answerRef.current = answer;
 noteRef.current = note;

 useEffect(() => {
 saveTimer.current = setInterval(() => {
 if (codeRef.current || answerRef.current || noteRef.current) {
 localStorage.setItem(draftKeyRef.current, JSON.stringify({
 code: codeRef.current,
 answer: answerRef.current,
 note: noteRef.current,
 }));
 }
 }, 2000); // Save every 2 seconds instead of on every keystroke
 return () => clearInterval(saveTimer.current);
 }, [problemId]);

 const clearDraft = useCallback(() => {
 localStorage.removeItem(draftKeyRef.current);
 }, []);

 const submitMutation = useMutation({
 mutationFn: (payload: { code: string; answer: string; note: string; typingSpeed: number | null; activeTimeSeconds: number; totalTimeSeconds: number }) =>
 api.post(`/problems/${problemId}/submissions`, payload).then((r) => r.data),
 onSuccess: (data) => {
 qc.invalidateQueries({ queryKey: ["problemSubmissions", problemId] });
 clearDraft();
 resetPracticeTracking(codeRef.current);
 setSubmitError("");
 if (data.judging) {
 // Chấm chạy nền — học sinh không phải đợi, theo dõi ở tab Lịch sử.
 justSubmittedRef.current.add(data.submission?.id);
 setSubmitSuccess("Đã nộp bài — hệ thống đang chấm test. Kết quả sẽ hiện ở Lịch sử trong ít giây, em cứ xem tiếp đề hoặc làm bài khác nhé!");
 toast.success({ title:"Đã nộp bài", message:"Hệ thống đang chấm nền. Theo dõi tiến độ ở tab Lịch sử." });
 } else {
 setSubmitSuccess("Đã nộp bài luyện tập.");
 toast.success({ title:"Đã nộp bài", message:"Bài đã được lưu vào lịch sử." });
 }
 setActiveTab(2);
 },
 onError: (err: any) => {
 setSubmitError(err.response?.data?.error ||"Nộp bài thất bại");
 setSubmitSuccess("");
 },
 });

 // Kết quả chấm nền về nơi đích: khi một bài đang chấm chuyển thành AC →
 // confetti + thưởng nổi + mascot đúng một lần duy nhất.
 useEffect(() => {
 const subs = submissionsQuery.data as any[] | undefined;
 if (!subs) return;
 const pendingIds = new Set(subs.filter((s) => s?.status === "pending" || s?.status === "judging").map((s) => s.id));
 for (const s of subs) {
 if (!s || s.passed !== true || s.status !== "done" || celebratedRef.current.has(s.id)) continue;
 const isNew = justSubmittedRef.current.has(s.id) || prevPendingRef.current.has(s.id);
 celebratedRef.current.add(s.id);
 if (!isNew || !isStudent) continue;
 const judgeInfo = parseJudgeNote(s.note);
 try {
 fireACConfetti();
 say("celebrate", msgSolved({ score: judgeInfo?.passed ?? s.judgedTests ?? 0, total: judgeInfo?.total ?? s.totalTests ?? 0, tokens: s.tokensAwarded ?? 0 }));
 } catch { /* bỏ qua lỗi hiệu ứng */ }
 if (s.tokensAwarded > 0) reward.showGold(s.tokensAwarded, { target: workspaceRef.current });
 if (s.xpAwarded > 0) reward.showExp(s.xpAwarded, { target: workspaceRef.current });
 qc.invalidateQueries({ queryKey: ["problemProgress","solved"] });
 qc.invalidateQueries({ queryKey: ["problemProgress","summary"] });
 }
 for (const id of Array.from(justSubmittedRef.current)) {
 const row = subs.find((x) => x?.id === id);
 if (row && row.status !== "pending" && row.status !== "judging") justSubmittedRef.current.delete(id);
 }
 prevPendingRef.current = pendingIds;
 }, [submissionsQuery.data, isStudent]);

 const createHackTestMutation = useMutation({
 mutationFn: (payload: { input: string; expectedOutput: string; note: string }) =>
 api.post(`/problems/${problemId}/hacktests`, payload).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["problemHackTests", problemId] });
 setHackInput("");
 setHackOutput("");
 setHackNote("");
 setHackError("");
 toast.success({ title:"Đã gửi hacktest", message:"Giáo viên sẽ kiểm tra trước khi thêm vào bộ test ẩn." });
 },
 onError: (err: any) => {
 setHackError(err.response?.data?.error ||"Gửi hacktest thất bại");
 },
 });

 const approveHackTestMutation = useMutation({
 mutationFn: (hackTestId: string) => api.post(`/hacktests/${hackTestId}/approve`).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["problemHackTests", problemId] });
 toast.success({ title:"Đã duyệt hacktest", message:"Test đã được thêm vào bộ test ẩn của bài." });
 },
 onError: (err: any) => {
 toast.error({ title:"Không duyệt được", message: err.response?.data?.error ||"Hacktest chưa hợp lệ." });
 },
 });

 const rejectHackTestMutation = useMutation({
 mutationFn: ({ hackTestId, reason }: { hackTestId: string; reason: string }) =>
 api.post(`/hacktests/${hackTestId}/reject`, { reason }).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["problemHackTests", problemId] });
 toast.success({ title:"Đã từ chối hacktest" });
 },
 onError: (err: any) => {
 toast.error({ title:"Không từ chối được", message: err.response?.data?.error ||"Vui lòng thử lại." });
 },
 });

 const handleSubmit = () => {
 if (!code.trim() && !answer.trim()) {
 setSubmitError("Vui lòng nhập code hoặc đáp án trước khi nộp.");
 setSubmitSuccess("");
 return;
 }
 setShowConfirm(true);
 };

 const handleCreateHackTest = () => {
 if (!hackInput.trim() || !hackOutput.trim()) {
 setHackError("Vui lòng nhập đủ input và output kỳ vọng.");
 return;
 }
 createHackTestMutation.mutate({
 input: hackInput,
 expectedOutput: hackOutput,
 note: hackNote,
 });
 };

 if (isLoading) {
 return <SkeletonProblemDetail />;
 }

 if (!problem) {
 return (
 <div className="py-16 text-center">
 <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
 <p className="text-muted-foreground">Không tìm thấy đề bài</p>
 </div>
 );
 }

 const submissions = submissionsQuery.data || [];
 const isSolved = submissions.length > 0;
 const hasAccepted = submissions.some((submission: any) => {
 const judge = parseJudgeNote(submission.note);
 return judge && judge.total > 0 && judge.passed === judge.total;
 });
 const hackTests = hackTestsQuery.data || [];
 const pendingHackTests = hackTests.filter((hackTest: any) => hackTest.status ==="pending").length;
 const difficultyLabel = problem.difficulty ==="easy" ?"Dễ" : problem.difficulty ==="medium" ?"Trung bình" :"Khó";

 return (
 <div className="mx-auto max-w-7xl space-y-5">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 if (window.history.length > 1) navigate(-1);
 else navigate("/problems");
 }}
 className="-ml-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
 >
 <ArrowLeft className="h-4 w-4" /> Quay lại
 </Button>

 <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
 <div className="border-b border-border px-5 py-4">
 <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
 <div>
 <h1 className="text-2xl font-semibold tracking-tight text-foreground">{problem.title}</h1>
 <div className="mt-2 flex flex-wrap items-center gap-2">
 {isStudent && isSolved && (
 <span className="inline-flex items-center gap-1 rounded-full /10 px-2 py-0.5 text-xs font-semibold">
 <CheckCircle2 className="h-3.5 w-3.5" /> Đã nộp
 </span>
 )}
 <DifficultyBadge difficulty={problem.difficulty} />
 {problem.estimatedTime && (
 <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
 <Clock className="h-3.5 w-3.5" /> {problem.estimatedTime} phút
 </span>
 )}
 </div>
 <div className="mt-3 flex flex-wrap gap-2">
 {problem.tags?.map((tag: any) => (
 <span key={tag.tag} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
 <Tag className="h-3 w-3" /> {tag.tag}
 </span>
 ))}
 </div>
 </div>

 {isTeacher && (
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" onClick={() => navigate(`/problems/${problemId}/edit`)}>
 <Edit className="h-3.5 w-3.5" /> Chỉnh sửa
 </Button>
 </div>
 )}
 </div>
 </div>

 <div className="flex overflow-x-auto border-b border-border">
 {tabs.filter((tab) => isTeacher || tab.id !== 3 || hasAccepted).map((tab) => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={`inline-flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${ activeTab === tab.id ?"border-foreground text-foreground" :"border-transparent text-muted-foreground hover:text-foreground" }`}
 >
 <tab.icon className="h-4 w-4" />
 {tab.label}
 {tab.id === 2 && isStudent && submissions.length > 0 && (
 <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{submissions.length}</span>
 )}
 {tab.id === 1 && isTeacher && assignedStudentsQuery.data && (
 <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
 {assignedStudentsQuery.data.totalSubmitted || 0}/{assignedStudentsQuery.data.totalAssigned || assignedStudentsQuery.data.students?.length || 0}
 </span>
 )}
 {tab.id === 2 && isTeacher && pendingHackTests > 0 && (
 <span className="rounded-full /10 px-1.5 py-0.5 text-xs">{pendingHackTests}</span>
 )}
 </button>
 ))}
 </div>

 <div className="p-5">
 {activeTab === 0 && (
 <StudentWorkspacePanel
 eyebrow="Đề luyện tập"
 title={problem.title}
 bare
 action={isStudent ? (
 <Button onClick={() => setActiveTab(1)} size="sm">
 <Send className="h-4 w-4" /> Bắt đầu luyện tập
 </Button>
 ) : null}
 minHeightClassName="min-h-[520px]"
 >
 <div className="p-5 lg:p-6">
 <ProblemViewer problem={problem} showTeacherSolution={isTeacher} />
 </div>
 </StudentWorkspacePanel>
 )}

 {activeTab === 1 && isStudent && (
 <StudentWorkspacePanel
 eyebrow="Luyện tập"
 title={problem.title}
 bare
 action={(
 <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
 Python
 </span>
 )}
 minHeightClassName="min-h-[680px]"
 >
 <div className="space-y-4 p-4 lg:p-5">
 {submitError && (
	           <div className="result-in rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{submitError}</div>
	         )}
 {submitSuccess && (() => {
	           const m = submitSuccess.match(/(\d+)\/(\d+)\s*tests/i);
	           const full = m ? Number(m[1]) === Number(m[2]) && Number(m[2]) > 0 : /10\/10|all_passed/i.test(submitSuccess);
	           const partial = !full && !!m;
	           const tone = full
	             ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
	             : partial
	               ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
	               : 'border-primary/25 bg-primary/10 text-primary';
	           return <div className={`result-in rounded-lg border px-3 py-2 text-sm font-medium ${tone}`}>{submitSuccess}</div>;
	         })()}
 <div ref={workspaceRef}>
 <PythonCodeWorkspace
 code={code}
 onCodeChange={handleTrackedCodeChange}
 starterCode={problem.starterCode}
 sampleInput={problem.sampleInput}
 sampleOutput={problem.sampleOutput}
 testCases={problem.testCases}
 note={note}
 onNoteChange={setNote}
 onSubmit={handleSubmit}
 submitLabel="Nộp bài luyện tập"
 submitting={submitMutation.isPending}
 autosaveLabel="Đã bật tự lưu bản nháp"
 height="100%"
 />
 </div>
 <textarea
 value={answer}
 onChange={(event) => setAnswer(event.target.value)}
 rows={3}
 placeholder="Nếu bài cần giải thích ý tưởng, em có thể ghi thêm ở đây..."
 className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
 />
 </div>
 </StudentWorkspacePanel>
 )}

 {activeTab === 1 && isTeacher && (
 <div className="space-y-4">
 {assignedStudentsQuery.isLoading ? (
 <div className="py-8 text-center text-sm text-muted-foreground">Đang tải danh sách học sinh...</div>
 ) : (
 <>
 {/* Summary cards */}
 <div className="grid grid-cols-3 gap-3">
 <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
 <p className="text-2xl font-semibold tabular-nums text-foreground">{assignedStudentsQuery.data?.totalAssigned || 0}</p>
 <p className="text-xs text-muted-foreground mt-1">Được giao</p>
 </div>
 <div className="rounded-xl border /10 p-4 text-center">
 <p className="text-2xl font-semibold tabular-nums">{assignedStudentsQuery.data?.totalSubmitted || 0}</p>
 <p className="text-xs /80 mt-1">Đã nộp</p>
 </div>
 <div className="rounded-xl border /10 p-4 text-center">
 <p className="text-2xl font-semibold tabular-nums">{assignedStudentsQuery.data?.totalPending || 0}</p>
 <p className="text-xs /80 mt-1">Chưa nộp</p>
 </div>
 </div>

 {/* Student list */}
 {!assignedStudentsQuery.data?.students?.length ? (
 <div className="py-10 text-center">
 <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
 <p className="text-sm text-muted-foreground">Chưa có học sinh nào được giao bài này.</p>
 <p className="text-xs text-muted-foreground/70 mt-1">Học sinh có thể tự luyện tập đề này trong thư viện đề.</p>
 </div>
 ) : (
 <div className="overflow-hidden rounded-xl border border-border bg-card">
 <div className="overflow-x-auto">
 <table className="w-full min-w-[560px]">
 <thead className="border-b border-border bg-muted/50">
 <tr>
 <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Học sinh</th>
 <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Nguồn</th>
 <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Trạng thái</th>
 <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Điểm</th>
 <th className="px-4 py-3"></th>
 </tr>
 </thead>
 <tbody>
 {assignedStudentsQuery.data.students.map((s: any) => (
 <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
 <td className="px-4 py-3">
 <button
 onClick={(e) => { e.stopPropagation(); navigate(`/students/${s.id}`); }}
 className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left w-full"
 title="Xem lộ trình của học sinh này"
 >
 <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0" style={{ backgroundColor: getAvatarBgColor(s.fullName) }}>
 {s.fullName?.charAt(0) ||"?"}
 </div>
 <div className="min-w-0">
 <StudentName fullName={s.fullName} nickname={s.nickname} primaryClassName="text-sm font-semibold text-foreground" />
 <p className="text-xs text-muted-foreground truncate">{s.email}</p>
 </div>
 </button>
 </td>
 <td className="px-4 py-3">
 <div className="flex flex-wrap gap-1">
 {s.assignedVia.map((via: string, i: number) => (
 <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
 {via}
 </span>
 ))}
 </div>
 </td>
 <td className="px-4 py-3 text-center">
 {s.hasSubmitted ? (
 <span className="inline-flex items-center gap-1 text-xs font-semibold dark:/10 px-2 py-0.5 rounded-full">
 <CheckCircle2 className="w-3 h-3" /> Đã nộp
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 text-xs font-semibold dark:/10 px-2 py-0.5 rounded-full">
 <Clock className="w-3 h-3" /> Chưa nộp
 </span>
 )}
 </td>
 <td className="px-4 py-3 text-center">
 {s.score !== null ? (
 <span className="text-sm font-semibold tabular-nums text-foreground">{s.score}/10</span>
 ) : s.hasSubmitted ? (
 <span className="text-xs text-muted-foreground">-</span>
 ) : (
 <span className="text-xs text-muted-foreground/50">-</span>
 )}
 </td>
 <td className="px-4 py-3 text-right">
 <div className="flex justify-end gap-2">
 <button
 onClick={(e) => { e.stopPropagation(); setChecklistStudent({ id: s.id, fullName: s.fullName, nickname: s.nickname, email: s.email }); }}
 className="text-sm font-medium text-muted-foreground hover:text-foreground"
 >
 Lộ trình
 </button>
 {s.submissionId ? (
 <button
 onClick={(e) => {
 e.stopPropagation();
 if (s.submissionKind ==="practice") setPracticeSubmissionId(s.submissionId);
 else navigate(`/submissions/${s.submissionId}`);
 }}
 className="text-sm font-medium text-primary hover:underline"
 >
 Xem code
 </button>
 ) : null}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </>
 )}
 </div>
 )}

 {activeTab === 2 && isStudent && (
 <div className="space-y-3">
 {submissionsQuery.isLoading ? (
 <div className="py-8 text-center text-sm text-muted-foreground">Đang tải lịch sử...</div>
 ) : submissions.length === 0 ? (
 <div className="py-12 text-center">
 <ClipboardList className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
 <p className="text-sm text-muted-foreground">Chưa có lần nộp nào.</p>
 </div>
 ) : (
 submissions.map((submission: any) => {
 const judge = parseJudgeNote(submission.note);
 return (
 <details key={submission.id} className="rounded-xl border border-border bg-card">
 <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50">
 <span>{new Date(submission.createdAt).toLocaleString("vi-VN")}</span>
 {submission.status ==="pending" || submission.status ==="judging" ? (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
 <Loader2 className="h-3 w-3 animate-spin" />
 Đang chấm {submission.judgedTests || 0}/{submission.totalTests || "?"} test
 </span>
 ) : submission.status ==="error" ? (
 <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Lỗi chấm — thử nộp lại</span>
 ) : judge ? (
 <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${judge.passed === judge.total ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
 {judge.passed}/{judge.total} · {judge.score}/10
 </span>
 ) : (
 <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Đã lưu</span>
 )}
 </summary>
 <div className="space-y-3 border-t border-border p-4">
 {submission.code && (
 <Editor
 height="220px"
 language="python"
 value={submission.code}
 theme="vs-dark"
 options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
 />
 )}
 {judge && (
 <div className="rounded-lg border border-border bg-muted/50 p-3">
 <p className="mb-2 text-sm font-medium text-foreground">Kết quả chấm tự động</p>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
 {judge.lines.map((line: string, index: number) => {
 const passed = line.includes("PASS");
 return (
 <span key={index} className={`duel-card-in rounded-lg px-2 py-1.5 text-center text-xs font-semibold ${passed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`} style={{ animationDelay: `${index * 40}ms` }}>
 {passed ?"PASS" :"FAIL"} T{index + 1}
 </span>
 );
 })}
 </div>
 </div>
 )}
 {submission.answer && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-foreground/80">{submission.answer}</p>}
 </div>
 </details>
 );
 })
 )}
 </div>
 )}

 {activeTab === 3 && isStudent && (
 <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
 <div className="space-y-3">
 <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
 <div className="flex items-start gap-2">
 <Bug className="mt-0.5 h-4 w-4 text-muted-foreground" />
 <div>
 <p className="text-sm font-semibold text-foreground">Đề xuất test phản ví dụ</p>
 <p className="mt-1 text-xs leading-5 text-muted-foreground">
 Test hợp lệ sẽ được giáo viên duyệt rồi thêm vào bộ test ẩn. Hãy nhập đúng input và output theo đề bài.
 </p>
 </div>
 </div>
 </div>
 {hackError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{hackError}</div>}
 <div className="grid gap-3 md:grid-cols-2">
 <label className="space-y-1">
 <span className="text-xs font-medium uppercase text-muted-foreground">Input</span>
 <textarea
 value={hackInput}
 onChange={(event) => setHackInput(event.target.value)}
 rows={10}
 className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
 placeholder="Ví dụ:&#10;5&#10;1 2 3 4 5"
 />
 </label>
 <label className="space-y-1">
 <span className="text-xs font-medium uppercase text-muted-foreground">Output đúng</span>
 <textarea
 value={hackOutput}
 onChange={(event) => setHackOutput(event.target.value)}
 rows={10}
 className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
 placeholder="Output kỳ vọng"
 />
 </label>
 </div>
 <label className="space-y-1">
 <span className="text-xs font-medium uppercase text-muted-foreground">Ghi chú</span>
 <textarea
 value={hackNote}
 onChange={(event) => setHackNote(event.target.value)}
 rows={3}
 className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
 placeholder="Test này bắt lỗi gì? Ví dụ: thiếu trường hợp n = 1, số âm, biên lớn..."
 />
 </label>
 <Button
 onClick={handleCreateHackTest}
 disabled={createHackTestMutation.isPending}
 >
 <Bug className="h-4 w-4" />
 {createHackTestMutation.isPending ?"Đang kiểm tra..." :"Gửi hacktest"}
 </Button>
 </div>

 <aside className="space-y-3">
 <p className="text-sm font-semibold text-foreground">Hacktest của em</p>
 {hackTestsQuery.isLoading ? (
 <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">Đang tải...</div>
 ) : hackTests.length === 0 ? (
 <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">Chưa có đề xuất nào.</div>
 ) : (
 hackTests.map((hackTest: any) => (
 <div key={hackTest.id} className="rounded-lg border border-border bg-card p-3">
 <div className="flex items-center justify-between gap-2">
 <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
 hackTest.status ==="approved" ?"/10 " :
 hackTest.status ==="rejected" ?"bg-destructive/10 text-destructive" :"/10 "
 }`}>
 {hackTest.status ==="approved" ?"Đã duyệt" : hackTest.status ==="rejected" ?"Từ chối" :"Chờ duyệt"}
 </span>
 <span className="text-xs text-muted-foreground">{new Date(hackTest.createdAt).toLocaleDateString("vi-VN")}</span>
 </div>
 <pre className="mt-2 max-h-24 overflow-auto rounded bg-foreground p-2 font-mono text-xs">{hackTest.inputPreview}</pre>
 {hackTest.validationNote && <p className="mt-2 text-xs leading-5 text-muted-foreground">{hackTest.validationNote}</p>}
 </div>
 ))
 )}
 </aside>
 </div>
 )}

 {activeTab === 4 && isTeacher && problemId && (
 <ProblemTestManager problemId={problemId} />
 )}

 {activeTab === 2 && isTeacher && (
 <div className="space-y-3">
 {hackTestsQuery.isLoading ? (
 <div className="py-8 text-center text-sm text-muted-foreground">Đang tải hacktest...</div>
 ) : hackTests.length === 0 ? (
 <div className="py-12 text-center">
 <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
 <p className="text-sm text-muted-foreground">Chưa có hacktest nào được đề xuất.</p>
 </div>
 ) : (
 hackTests.map((hackTest: any) => (
 <div key={hackTest.id} className="rounded-xl border border-border bg-card p-4">
 <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
 hackTest.status ==="approved" ?"/10 " :
 hackTest.status ==="rejected" ?"bg-destructive/10 text-destructive" :"/10 "
 }`}>
 {hackTest.status ==="approved" ?"Đã duyệt" : hackTest.status ==="rejected" ?"Từ chối" :"Chờ duyệt"}
 </span>
 <span className="text-xs text-muted-foreground">
 {hackTest.proposer?.fullName ||"Học sinh"} · bắt được {hackTest.impactedCount || 0} lời giải AC cũ
 </span>
 </div>
 {hackTest.note && <p className="mt-2 text-sm text-foreground/80">{hackTest.note}</p>}
 {hackTest.validationNote && <p className="mt-1 text-xs text-muted-foreground">{hackTest.validationNote}</p>}
 </div>
 {hackTest.status ==="pending" && (
 <div className="flex shrink-0 items-center gap-2">
 <Button
 size="sm"
 onClick={() => approveHackTestMutation.mutate(hackTest.id)}
 disabled={approveHackTestMutation.isPending}
 >
 <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
 </Button>
 <Button
 size="sm"
 variant="destructive"
 onClick={() => {
 setRejectReason("Test chưa đúng đề hoặc chưa đủ rõ.");
 setRejectTarget({ hackTestId: hackTest.id });
 }}
 disabled={rejectHackTestMutation.isPending}
 >
 <XCircle className="h-3.5 w-3.5" /> Từ chối
 </Button>
 </div>
 )}
 </div>
 <div className="mt-3 grid gap-3 md:grid-cols-2">
 <div>
 <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Input</p>
 <pre className="max-h-56 overflow-auto rounded-lg bg-foreground p-3 font-mono text-xs">{hackTest.input}</pre>
 </div>
 <div>
 <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Output đúng</p>
 <pre className="max-h-56 overflow-auto rounded-lg bg-foreground p-3 font-mono text-xs">{hackTest.expectedOutput}</pre>
 </div>
 </div>
 </div>
 ))
 )}
 </div>
 )}
 </div>
 </section>

 {rejectTarget && (
 <div
 className="fixed inset-0 z-[110] flex items-center justify-center"
 role="dialog"
 aria-modal="true"
 aria-label="Từ chối hacktest"
 >
 <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
 <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevated">
 <h3 className="text-base font-semibold tracking-tight text-foreground">Từ chối hacktest</h3>
 <p className="mt-1 text-sm text-muted-foreground">Nhập lý do để học viên biết vì sao test bị từ chối.</p>
 <label htmlFor="reject-reason" className="sr-only">Lý do từ chối</label>
 <textarea
 id="reject-reason"
 value={rejectReason}
 onChange={(e) => setRejectReason(e.target.value)}
 rows={3}
 className="mt-3 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
 />
 <div className="mt-4 flex justify-end gap-2">
 <Button variant="outline" onClick={() => setRejectTarget(null)}>
 Hủy
 </Button>
 <Button
 variant="destructive"
 onClick={() => {
 if (!rejectReason.trim()) return;
 rejectHackTestMutation.mutate({ hackTestId: rejectTarget.hackTestId, reason: rejectReason.trim() });
 setRejectTarget(null);
 }}
 disabled={!rejectReason.trim() || rejectHackTestMutation.isPending}
 >
 {rejectHackTestMutation.isPending ?"Đang xử lý..." :"Từ chối"}
 </Button>
 </div>
 </div>
 </div>
 )}

 <ConfirmDialog
 open={showConfirm}
 title="Xác nhận nộp bài"
 message="Bài sẽ được lưu vào lịch sử luyện tập. Nếu có test case, hệ thống sẽ chấm ngay sau khi nộp."
 confirmLabel="Nộp bài"
 cancelLabel="Hủy"
 variant="primary"
 onConfirm={() => {
 setShowConfirm(false);
 submitMutation.mutate({
 code: code.trim(),
 answer: answer.trim(),
 note: note.trim(),
 ...getPracticeTrackingPayload(),
 });
 }}
 onCancel={() => setShowConfirm(false)}
 />


 {practiceSubmissionId && (
 <div
 className="fixed inset-0 z-[100] flex items-center justify-center"
 role="dialog"
 aria-modal="true"
 aria-label="Xem bài luyện tập"
 >
 <div
 className="absolute inset-0 bg-black/40 backdrop-blur-sm"
 onClick={() => setPracticeSubmissionId(null)}
 aria-hidden="true"
 />
 <EscapeOnOpen onEscape={() => setPracticeSubmissionId(null)} />
 <div className="relative mx-4 flex max-h-[86vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-elevated">
 <div className="flex items-start justify-between border-b border-border px-5 py-4">
 <div>
 <p className="text-sm font-semibold text-foreground">
 {practiceSubmissionQuery.data?.student?.fullName ||"Bài luyện tập"}
 </p>
 <p className="text-xs text-muted-foreground">
 {practiceSubmissionQuery.data?.problem?.title ||"Đang tải..."}
 </p>
 </div>
 <Button variant="ghost" size="sm" onClick={() => setPracticeSubmissionId(null)}>
 Đóng
 </Button>
 </div>
 <div className="min-h-0 flex-1 overflow-auto p-5">
 {practiceSubmissionQuery.isLoading ? (
 <div className="py-10 text-center text-sm text-muted-foreground">Đang tải code...</div>
 ) : (
 <div className="space-y-4">
 {practiceSubmissionQuery.data?.note && (
 <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-xs text-foreground/80 whitespace-pre-wrap">
 {practiceSubmissionQuery.data.note}
 </pre>
 )}
 <Editor
 height="460px"
 language="python"
 value={practiceSubmissionQuery.data?.code || practiceSubmissionQuery.data?.answer ||""}
 theme="vs-dark"
 options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
 />
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {checklistStudent && (
 <StudentChecklistModal
 open={!!checklistStudent}
 onClose={() => setChecklistStudent(null)}
 studentId={checklistStudent.id}
 studentName={checklistStudent.fullName}
 studentNickname={checklistStudent.nickname}
 studentEmail={checklistStudent.email}
 />
 )}
 </div>
 );
}

function EscapeOnOpen({ onEscape }: { onEscape: () => void }) {
 useEffect(() => {
 const handler = (e: KeyboardEvent) => {
 if (e.key ==="Escape") onEscape();
 };
 window.addEventListener("keydown", handler);
 return () => window.removeEventListener("keydown", handler);
 }, [onEscape]);
 return null;
}
