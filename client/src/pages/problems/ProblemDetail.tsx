import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { openInCodeLab } from "../../lib/codeLabBridge";
import { clearLiveEditor, publishLiveEditor } from "../../lib/liveEditorBridge";
import { reportRecordingRun } from "../../hooks/useSessionRecorder";
import type { SupportedLanguage } from "../../lib/codeRunner";
import { getAvatarBgColor } from "../../lib/utils";
import api from "../../lib/api";
import ProblemViewer, { parseVisibleTests } from "../../components/ui/ProblemViewer";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import PythonCodeWorkspace, { type ExternalRunRequest } from "../../components/ui/PythonCodeWorkspace";
import { useToast } from "../../hooks/useToast";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useReward } from "../../hooks/useReward";
import { useMascot, msgSolved } from "../../components/mascot";
import { fireACConfetti } from "../../lib/confetti";
import StudentChecklistModal from "../../components/ui/StudentChecklistModal";
import ProblemTestManager from "../../components/ui/ProblemTestManager";
import PlagiarismDialog from "../../components/ui/PlagiarismDialog";
import { DifficultyBadge } from "../../components/ui/Badges";
import { Button } from "../../components/ui/button";
import { SkeletonProblemDetail } from "../../components/ui/skeletons/SkeletonProblemDetail";
import { StudentName } from "../../components/ui/StudentName";
import Editor from "@monaco-editor/react";
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Columns2,
  Compass,
  Database,
  Edit,
  Eye,
  EyeOff,
  FileText,
  LayoutList,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  RotateCcw,
  Send,
  ShieldCheck,
  Tag,
  Terminal,
  Users,
  XCircle,
} from "lucide-react";

type PracticeTrackingState = {
  startedAt: number;
  lastActivityAt: number | null;
  activeMs: number;
  typedChars: number;
  lastCode: string;
};

const STUDENT_TABS = [
  { id: 0, label: "Đề bài", icon: FileText },
  { id: 1, label: "Nộp & Chấm code", icon: Send },
  { id: 2, label: "Lịch sử", icon: ClipboardList },
  { id: 3, label: "Hacktest", icon: Bug },
] as const;

const STUDENT_SPLIT_LEFT_TABS = [
  { id: 0, label: "Đề bài", icon: FileText },
  { id: 2, label: "Lịch sử", icon: ClipboardList },
  { id: 3, label: "Hacktest", icon: Bug },
] as const;

const TEACHER_TABS = [
  { id: 0, label: "Đề bài", icon: FileText },
  { id: 1, label: "Bài nộp của HS", icon: Users },
  { id: 2, label: "Hacktest", icon: ShieldCheck },
  { id: 4, label: "Bộ test", icon: Database },
] as const;

interface ParsedTestLine {
  testNum: number;
  verdict: "AC" | "WA" | "TLE" | "MLE" | "OLE" | "RTE" | "SKIP" | "CE" | "BLK";
  detail?: string;
}

function parseJudgeNote(note?: string | null) {
  if (!note) return null;
  const match = note.match(/Auto-judge \((\d+)\/(\d+)\) - ([\d.]+)\/10/);
  if (!match) return null;
  const lines = note.split("\n");
  const subtaskLine = lines.find((l) => l.startsWith("Subtasks:")) || null;
  const testLines: ParsedTestLine[] = [];
  for (const line of lines) {
    if (!line.includes("Test ")) continue;
    const numMatch = line.match(/Test\s+(\d+)/);
    const testNum = numMatch ? Number(numMatch[1]) : testLines.length + 1;
    let verdict: ParsedTestLine["verdict"] = "WA";
    if (line.includes("PASS")) verdict = "AC";
    else if (line.includes("quá thời gian")) verdict = "TLE";
    else if (line.includes("quá bộ nhớ")) verdict = "MLE";
    else if (line.includes("vượt giới hạn output")) verdict = "OLE";
    else if (line.includes("bỏ qua")) verdict = "SKIP";
    else if (line.includes("lỗi biên dịch")) verdict = "CE";
    else if (line.includes("sandbox")) verdict = "BLK";
    else if (line.includes("lỗi chạy code") || line.includes(" - ")) verdict = "RTE";
    const dashIdx = line.indexOf(" - ");
    testLines.push({
      testNum,
      verdict,
      detail: dashIdx !== -1 ? line.slice(dashIdx + 3).trim() : undefined,
    });
  }
  return {
    passed: Number(match[1]),
    total: Number(match[2]),
    score: Number(match[3]),
    subtaskLine,
    testLines,
  };
}

const VERDICT_BADGE_CLASS: Record<ParsedTestLine["verdict"], string> = {
  AC: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  WA: "bg-destructive/10 text-destructive border-destructive/25",
  TLE: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  MLE: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  OLE: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  RTE: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  CE: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  BLK: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  SKIP: "bg-muted text-muted-foreground border-border",
};

const CHECKER_SIDEBAR_LABELS: Record<string, string> = {
  exact: "Exact match",
  tokens: "Tokens (bỏ khoảng trắng)",
  ignore_case: "Ignore case",
  float_1e6: "Float (1e-6)",
  float_1e4: "Float (1e-4)",
};

interface NeighborsPayload {
  packTitle: string | null;
  tierLabel: string | null;
  position: number | null;
  totalInGroup: number | null;
  prev: { id: string; title: string; difficulty: string } | null;
  next: { id: string; title: string; difficulty: string } | null;
}

function formatLimitSec(ms?: number) {
  const sec = Number(ms || 2000) / 1000;
  return Number.isInteger(sec) ? `${sec}.0s` : `${sec.toFixed(1)}s`;
}

export default function ProblemDetail() {
  const { problemId } = useParams();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { dark } = useDarkMode();
  const reward = useReward();
  const { say } = useMascot();
  const isTeacher = isStaff(user?.role);
  const isStudent = !isTeacher;

  const [activeTab, setActiveTab] = useState(0);
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">(() => {
    const saved = localStorage.getItem("codeclass_problem_fontsize");
    return saved === "sm" || saved === "lg" ? saved : "base";
  });
  const [layoutMode, setLayoutMode] = useState<"split" | "tabs" | "zen">(() => {
    const saved = localStorage.getItem("codeclass_problem_layout");
    return saved === "tabs" ? "tabs" : "split";
  });
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const raw = Number(localStorage.getItem("codeclass_split_ratio"));
    return Number.isFinite(raw) && raw >= 30 && raw <= 68 ? raw : 48;
  });
  const [isLargeDesktop, setIsLargeDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );
  const [showTagsSpoiler, setShowTagsSpoiler] = useState(isTeacher);
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [externalRunReq, setExternalRunReq] = useState<ExternalRunRequest | null>(null);
  const runSeqRef = useRef(0);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);

  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [checklistStudent, setChecklistStudent] = useState<{
    id: string;
    fullName: string;
    nickname?: string | null;
    email: string;
  } | null>(null);
  const [viewingSubmission, setViewingSubmission] = useState<{
    id: string;
    kind: "practice" | "assignment";
  } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [hackInput, setHackInput] = useState("");
  const [hackOutput, setHackOutput] = useState("");
  const [hackNote, setHackNote] = useState("");
  const [hackError, setHackError] = useState("");
  const [rejectTarget, setRejectTarget] = useState<{ hackTestId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [plagiarismOpen, setPlagiarismOpen] = useState(false);

  const draftKeyRef = useRef(`problem_draft_${problemId}`);
  const restoredDraftRef = useRef(false);
  const trackingRef = useRef<PracticeTrackingState>({
    startedAt: Date.now(),
    lastActivityAt: null,
    activeMs: 0,
    typedChars: 0,
    lastCode: "",
  });

  useEffect(() => {
    const onResize = () => setIsLargeDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    localStorage.setItem("codeclass_problem_fontsize", fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (layoutMode !== "zen") {
      localStorage.setItem("codeclass_problem_layout", layoutMode);
    }
  }, [layoutMode]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingSplitRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(30, Math.min(68, Math.round(pct * 10) / 10));
      setSplitRatio(clamped);
    };
    const onMouseUp = () => {
      if (draggingSplitRef.current) {
        draggingSplitRef.current = false;
        document.body.style.userSelect = "";
        localStorage.setItem("codeclass_split_ratio", String(splitRatio));
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [splitRatio]);

  const resetPracticeTracking = useCallback((initialCode = "") => {
    trackingRef.current = {
      startedAt: Date.now(),
      lastActivityAt: null,
      activeMs: 0,
      typedChars: 0,
      lastCode: initialCode,
    };
  }, []);

  const setCodeWithoutTracking = useCallback(
    (value: string) => {
      setCode(value);
      resetPracticeTracking(value);
    },
    [resetPracticeTracking],
  );

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
    const activeMs =
      state.activeMs + (state.lastActivityAt ? Math.min(now - state.lastActivityAt, 30_000) : 0);
    const activeTimeSeconds = Math.max(0, Math.round(activeMs / 1000));
    const totalTimeSeconds = Math.max(0, Math.round((now - state.startedAt) / 1000));
    const typingSpeed =
      activeTimeSeconds > 0 && state.typedChars > 0
        ? Math.round(state.typedChars / (activeTimeSeconds / 60))
        : null;

    return { typingSpeed, activeTimeSeconds, totalTimeSeconds };
  }, []);

  const { data: problem, isLoading } = useQuery({
    queryKey: ["problem", problemId],
    queryFn: () => api.get(`/problems/${problemId}`).then((r) => r.data),
  });

  const neighborsQuery = useQuery<NeighborsPayload>({
    queryKey: ["problemNeighbors", problemId],
    queryFn: () => api.get(`/problems/${problemId}/neighbors`).then((r) => r.data),
    enabled: !!problemId,
    staleTime: 120_000,
  });

  const submissionsQuery = useQuery({
    queryKey: ["problemSubmissions", problemId],
    queryFn: () => api.get(`/problems/${problemId}/submissions`).then((r) => r.data),
    enabled: !!problemId && isStudent,
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
    queryKey: ["practiceSubmission", viewingSubmission?.kind, viewingSubmission?.id],
    queryFn: () => {
      if (!viewingSubmission) return null;
      const endpoint =
        viewingSubmission.kind === "assignment"
          ? `/submissions/${viewingSubmission.id}`
          : `/problem-submissions/${viewingSubmission.id}`;
      return api.get(endpoint).then((r) => r.data);
    },
    enabled: !!viewingSubmission,
  });

  const isSplitActive = isStudent && isLargeDesktop && (layoutMode === "split" || layoutMode === "zen");

  useEffect(() => {
    if (isSplitActive && activeTab === 1) {
      setActiveTab(0);
    }
  }, [isSplitActive, activeTab]);

  const codeInitialized = useRef(false);

  useEffect(() => {
    draftKeyRef.current = `problem_draft_${problemId}`;
    restoredDraftRef.current = false;
    codeInitialized.current = false;
    setExpandedSubId(null);
    setSubmitError("");
    setSubmitSuccess("");
    setActiveTab(0);
    setShowTagsSpoiler(isTeacher);
    resetPracticeTracking("");
  }, [problemId, isTeacher, resetPracticeTracking]);

  useEffect(() => {
    const saved = localStorage.getItem(draftKeyRef.current);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.code) setCodeWithoutTracking(parsed.code);
        if (parsed.language === "cpp" || parsed.language === "python") {
          setLanguage(parsed.language);
        } else if (
          parsed.code &&
          (/#include\s*</.test(parsed.code) || /\bint\s+main\s*\(/.test(parsed.code))
        ) {
          setLanguage("cpp");
        }
        if (parsed.answer) setAnswer(parsed.answer);
        if (parsed.note) setNote(parsed.note);
        restoredDraftRef.current = true;
        codeInitialized.current = true;
        return;
      } catch {
        /* ignore corrupt draft */
      }
    }

    if (problem && !codeInitialized.current) {
      const starter = problem.starterCode || "";
      setCodeWithoutTracking(starter);
      if (/#include\s*</.test(starter) || /\bint\s+main\s*\(/.test(starter)) {
        setLanguage("cpp");
      } else {
        setLanguage("python");
      }
      codeInitialized.current = true;
    }
  }, [problemId, problem, setCodeWithoutTracking]);

  const saveTimer = useRef<ReturnType<typeof setInterval>>();
  const codeRef = useRef(code);
  const langRef = useRef(language);
  const answerRef = useRef(answer);
  const noteRef = useRef(note);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const justSubmittedRef = useRef<Set<string>>(new Set());
  const prevPendingRef = useRef<Set<string>>(new Set());
  const celebratedRef = useRef<Set<string>>(new Set());
  codeRef.current = code;
  langRef.current = language;
  answerRef.current = answer;
  noteRef.current = note;

  useEffect(() => {
    saveTimer.current = setInterval(() => {
      if (codeRef.current || answerRef.current || noteRef.current) {
        localStorage.setItem(
          draftKeyRef.current,
          JSON.stringify({
            code: codeRef.current,
            language: langRef.current,
            answer: answerRef.current,
            note: noteRef.current,
          }),
        );
      }
    }, 2000);
    return () => clearInterval(saveTimer.current);
  }, [problemId]);

  useEffect(() => {
    if (!isStudent) return;
    if (code.trim().length > 0) {
      publishLiveEditor({
        code,
        language,
        label: problem?.title ? `Bài tập: ${problem.title}` : "Bài tập",
        source: "problem",
      });
    }
  }, [isStudent, code, language, problem?.title]);

  useEffect(() => {
    return () => clearLiveEditor("problem");
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(draftKeyRef.current);
  }, []);

  const submitMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      language: SupportedLanguage;
      answer: string;
      note: string;
      typingSpeed: number | null;
      activeTimeSeconds: number;
      totalTimeSeconds: number;
    }) => api.post(`/problems/${problemId}/submissions`, payload).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["problemSubmissions", problemId] });
      clearDraft();
      resetPracticeTracking(codeRef.current);
      setSubmitError("");
      if (isStudent) {
        reportRecordingRun(
          problem?.title ? `Nộp bài: ${problem.title}` : "Nộp bài tập",
          null,
          codeRef.current,
        );
      }
      if (data.judging) {
        justSubmittedRef.current.add(data.submission?.id);
        if (data.submission?.id) setExpandedSubId(data.submission.id);
        setSubmitSuccess("Đã nộp bài — hệ thống đang chấm test ngầm...");
        toast.success({
          title: "Đã nộp bài",
          message: "Hệ thống đang chấm nền. Kết quả sẽ hiện ở Lịch sử sau ít giây.",
        });
      } else {
        setSubmitSuccess("Đã nộp bài luyện tập.");
        toast.success({ title: "Đã nộp bài", message: "Bài đã được lưu vào lịch sử." });
      }
      setActiveTab(2);
    },
    onError: (err: any) => {
      setSubmitError(err.response?.data?.error || "Nộp bài thất bại");
      setSubmitSuccess("");
    },
  });

  useEffect(() => {
    const subs = submissionsQuery.data as any[] | undefined;
    if (!subs) return;
    const pendingIds = new Set(
      subs.filter((s) => s?.status === "pending" || s?.status === "judging").map((s) => s.id),
    );
    for (const s of subs) {
      if (!s || s.passed !== true || s.status !== "done" || celebratedRef.current.has(s.id)) continue;
      const isNew = justSubmittedRef.current.has(s.id) || prevPendingRef.current.has(s.id);
      celebratedRef.current.add(s.id);
      if (!isNew || !isStudent) continue;
      const judgeInfo = parseJudgeNote(s.note);
      try {
        fireACConfetti();
        say(
          "celebrate",
          msgSolved({
            score: judgeInfo?.passed ?? s.judgedTests ?? 0,
            total: judgeInfo?.total ?? s.totalTests ?? 0,
            tokens: s.tokensAwarded ?? 0,
          }),
        );
      } catch {
        /* ignore celebration effect error */
      }
      if (s.tokensAwarded > 0) reward.showGold(s.tokensAwarded, { target: workspaceRef.current });
      if (s.xpAwarded > 0) reward.showExp(s.xpAwarded, { target: workspaceRef.current });
      qc.invalidateQueries({ queryKey: ["problemProgress", "solved"] });
      qc.invalidateQueries({ queryKey: ["problemProgress", "summary"] });
    }
    for (const id of Array.from(justSubmittedRef.current)) {
      const row = subs.find((x) => x?.id === id);
      if (row && row.status !== "pending" && row.status !== "judging") {
        justSubmittedRef.current.delete(id);
      }
    }
    prevPendingRef.current = pendingIds;
  }, [submissionsQuery.data, isStudent, qc, reward, say]);

  const createHackTestMutation = useMutation({
    mutationFn: (payload: { input: string; expectedOutput: string; note: string }) =>
      api.post(`/problems/${problemId}/hacktests`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["problemHackTests", problemId] });
      setHackInput("");
      setHackOutput("");
      setHackNote("");
      setHackError("");
      toast.success({
        title: "Đã gửi hacktest",
        message: "Giáo viên sẽ kiểm tra trước khi thêm vào bộ test ẩn.",
      });
    },
    onError: (err: any) => {
      setHackError(err.response?.data?.error || "Gửi hacktest thất bại");
    },
  });

  const approveHackTestMutation = useMutation({
    mutationFn: (hackTestId: string) =>
      api.post(`/hacktests/${hackTestId}/approve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["problemHackTests", problemId] });
      toast.success({
        title: "Đã duyệt hacktest",
        message: "Test đã được thêm vào bộ test ẩn của bài.",
      });
    },
    onError: (err: any) => {
      toast.error({
        title: "Không duyệt được",
        message: err.response?.data?.error || "Hacktest chưa hợp lệ.",
      });
    },
  });

  const rejectHackTestMutation = useMutation({
    mutationFn: ({ hackTestId, reason }: { hackTestId: string; reason: string }) =>
      api.post(`/hacktests/${hackTestId}/reject`, { reason }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["problemHackTests", problemId] });
      toast.success({ title: "Đã từ chối hacktest" });
    },
    onError: (err: any) => {
      toast.error({
        title: "Không từ chối được",
        message: err.response?.data?.error || "Vui lòng thử lại.",
      });
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

  const triggerSingleSampleRun = useCallback(
    (input: string, expected: string | null, index: number) => {
      if (!code.trim()) {
        toast.info({
          title: "Chưa có code",
          message: "Hãy viết code ở khung soạn thảo rồi bấm Chạy thử nhé.",
        });
        if (!isSplitActive) setActiveTab(1);
        return;
      }
      runSeqRef.current += 1;
      setExternalRunReq({ seq: runSeqRef.current, mode: "single", input, expected, sampleIndex: index });
      if (!isSplitActive) setActiveTab(1);
    },
    [code, isSplitActive, toast],
  );

  const triggerAllSamplesRun = useCallback(() => {
    if (!code.trim()) {
      toast.info({
        title: "Chưa có code",
        message: "Hãy viết code ở khung soạn thảo rồi bấm Chạy tất cả ví dụ nhé.",
      });
      if (!isSplitActive) setActiveTab(1);
      return;
    }
    runSeqRef.current += 1;
    setExternalRunReq({ seq: runSeqRef.current, mode: "all" });
    if (!isSplitActive) setActiveTab(1);
  }, [code, isSplitActive, toast]);

  const visibleTests = useMemo(() => parseVisibleTests(problem?.testCases), [problem?.testCases]);

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
  const hasAttempted = submissions.length > 0;
  const hasAccepted = submissions.some((submission: any) => {
    if (submission.passed === true) return true;
    const judge = parseJudgeNote(submission.note);
    return !!(judge && judge.total > 0 && judge.passed === judge.total);
  });
  const hackTests = hackTestsQuery.data || [];
  const pendingHackTests = hackTests.filter((hackTest: any) => hackTest.status === "pending").length;
  const neighbors = neighborsQuery.data;

  const tabs = isTeacher
    ? TEACHER_TABS
    : isSplitActive
      ? STUDENT_SPLIT_LEFT_TABS
      : STUDENT_TABS;

  const historySection = (
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
          const isExpanded = expandedSubId === submission.id;
          const isPending = submission.status === "pending" || submission.status === "judging";
          return (
            <div key={submission.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setExpandedSubId((prev) => (prev === submission.id ? null : submission.id))}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span>{new Date(submission.createdAt).toLocaleString("vi-VN")}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {submission.language === "cpp" || /#include\s*</.test(submission.code || "")
                      ? "C++"
                      : "Python"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isPending ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Đang chấm {submission.judgedTests || 0}/{submission.totalTests || "?"} test
                    </span>
                  ) : submission.status === "error" ? (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                      Lỗi chấm — thử nộp lại
                    </span>
                  ) : judge ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                        judge.passed === judge.total
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {judge.passed}/{judge.total} · {judge.score}/10
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Đã lưu
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-3 border-t border-border p-4">
                  {judge && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">
                          Chi tiết từng test ({judge.passed}/{judge.total} đạt)
                        </p>
                        {judge.subtaskLine && (
                          <span className="text-[11px] font-medium text-primary">
                            {judge.subtaskLine}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                        {judge.testLines.map((t) => (
                          <span
                            key={t.testNum}
                            title={t.detail || t.verdict}
                            className={`rounded-md border px-2 py-1 text-center text-[11px] font-semibold tabular-nums ${VERDICT_BADGE_CLASS[t.verdict]}`}
                          >
                            T{t.testNum}: {t.verdict}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {submission.code && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Code đã nộp</span>
                        <button
                          type="button"
                          onClick={() => {
                            const lang =
                              submission.language === "cpp" || /#include\s*</.test(submission.code)
                                ? "cpp"
                                : "python";
                            setLanguage(lang);
                            setCodeWithoutTracking(submission.code);
                            toast.success({ title: "Đã nạp code vào Editor" });
                            if (!isSplitActive) setActiveTab(1);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                        >
                          <RotateCcw className="h-3 w-3" /> Nạp vào Editor
                        </button>
                      </div>
                      <Editor
                        height="220px"
                        language={
                          submission.language === "cpp" || /#include\s*</.test(submission.code)
                            ? "cpp"
                            : "python"
                        }
                        value={submission.code}
                        theme={dark ? "vs-dark" : "vs"}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 13,
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>
                  )}
                  {submission.answer && (
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-foreground/80">
                      {submission.answer}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const hacktestStudentSection = (
    <div className={isSplitActive ? "space-y-4" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"}>
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
        {hackError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {hackError}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase text-muted-foreground">Input</span>
            <textarea
              value={hackInput}
              onChange={(event) => setHackInput(event.target.value)}
              rows={8}
              className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Ví dụ:&#10;5&#10;1 2 3 4 5"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase text-muted-foreground">Output đúng</span>
            <textarea
              value={hackOutput}
              onChange={(event) => setHackOutput(event.target.value)}
              rows={8}
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
            rows={2}
            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            placeholder="Test này bắt lỗi gì? Ví dụ: thiếu trường hợp n = 1, số âm, biên lớn..."
          />
        </label>
        <Button onClick={handleCreateHackTest} disabled={createHackTestMutation.isPending}>
          <Bug className="h-4 w-4" />
          {createHackTestMutation.isPending ? "Đang kiểm tra..." : "Gửi hacktest"}
        </Button>
      </div>

      <aside className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Hacktest của em</p>
        {hackTestsQuery.isLoading ? (
          <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Đang tải...
          </div>
        ) : hackTests.length === 0 ? (
          <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Chưa có đề xuất nào.
          </div>
        ) : (
          hackTests.map((hackTest: any) => (
            <div key={hackTest.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    hackTest.status === "approved"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : hackTest.status === "rejected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {hackTest.status === "approved"
                    ? "Đã duyệt"
                    : hackTest.status === "rejected"
                      ? "Từ chối"
                      : "Chờ duyệt"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(hackTest.createdAt).toLocaleDateString("vi-VN")}
                </span>
              </div>
              <pre className="mt-2 max-h-24 overflow-auto rounded border border-border bg-muted/60 p-2 font-mono text-xs text-foreground">
                {hackTest.inputPreview}
              </pre>
              {hackTest.validationNote && (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{hackTest.validationNote}</p>
              )}
            </div>
          ))
        )}
      </aside>
    </div>
  );

  const studentWorkspaceSection = (
    <div className="space-y-3">
      {submitError && (
        <div className="result-in rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="result-in rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          {submitSuccess}
        </div>
      )}
      <div ref={workspaceRef}>
        <PythonCodeWorkspace
          code={code}
          onCodeChange={handleTrackedCodeChange}
          language={language}
          onLanguageChange={setLanguage}
          starterCode={problem.starterCode}
          sampleInput={problem.sampleInput}
          sampleOutput={problem.sampleOutput}
          visibleTests={visibleTests}
          checkerType={problem.checkerType}
          note={note}
          onNoteChange={isSplitActive ? undefined : setNote}
          onSubmit={handleSubmit}
          submitLabel="Nộp bài"
          submitting={submitMutation.isPending}
          autosaveLabel="Tự lưu nháp"
          height={isSplitActive ? (layoutMode === "zen" ? 410 : 350) : 440}
          liveLabel={problem?.title ? `Bài tập: ${problem.title}` : "Bài tập"}
          disableLivePublish
          layout={isSplitActive ? "stacked" : "side-by-side"}
          externalRunRequest={externalRunReq}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowNoteDrawer((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showNoteDrawer
              ? "Ẩn ghi chú / giải thích ý tưởng"
              : "+ Thêm ghi chú hoặc giải thích ý tưởng (tuỳ chọn)"}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() =>
              openInCodeLab(navigate, {
                code: code || problem.starterCode || "",
                language,
                fileName: `bai_${problem.id.slice(0, 6)}.${language === "cpp" ? "cpp" : "py"}`,
                inputText: problem.sampleInput || "",
                sourceLabel: problem.title,
              })
            }
          >
            <Terminal className="h-3 w-3 text-primary" /> Mở trong Code Lab
          </Button>
        </div>
        {showNoteDrawer && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={2}
              placeholder="Giải thích thuật toán / độ phức tạp (tuỳ chọn)..."
              className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-xs outline-none focus:border-ring"
            />
            {isSplitActive && (
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Ghi chú cho giáo viên..."
                className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-xs outline-none focus:border-ring"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );

  // VNOJ / Codeforces style right info rail shown on Tab 0 when not in split editor mode.
  const showVnojSidebar = !isSplitActive && activeTab === 0;

  const rightContestSidebar = (
    <aside className="no-print space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* Card 1: Thông tin bài toán (VNOJ / Codeforces spec table) */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Thông tin bài toán
          </span>
          {isStudent && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                hasAccepted
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : hasAttempted
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {hasAccepted ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> AC
                </>
              ) : hasAttempted ? (
                "Đang thử"
              ) : (
                "Chưa giải"
              )}
            </span>
          )}
        </div>

        <div className="divide-y divide-border/70 px-4 text-xs">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted-foreground">Độ khó</span>
            <DifficultyBadge difficulty={problem.difficulty} />
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted-foreground">Giới hạn thời gian</span>
            <span className="font-mono font-semibold text-foreground">
              {formatLimitSec(problem.timeLimitMs)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted-foreground">Giới hạn bộ nhớ</span>
            <span className="font-mono font-semibold text-foreground">
              {problem.memoryLimitMb || 256} MB
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted-foreground">Kiểu chấm</span>
            <span className="font-medium text-foreground">
              {CHECKER_SIDEBAR_LABELS[problem.checkerType || "exact"] || problem.checkerType}
            </span>
          </div>
          {problem.estimatedTime && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-muted-foreground">Thời lượng ước tính</span>
              <span className="font-medium text-foreground">{problem.estimatedTime} phút</span>
            </div>
          )}
          {problem.skillId && (
            <div className="flex items-center justify-between gap-2 py-2.5">
              <span className="text-muted-foreground">Kỹ năng</span>
              <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {problem.skillId}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-border bg-muted/20 p-3.5">
          {isStudent ? (
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                if (isLargeDesktop) {
                  setLayoutMode("split");
                } else {
                  setActiveTab(1);
                }
              }}
            >
              <Send className="h-3.5 w-3.5" /> Bắt đầu làm bài
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() =>
                  navigate(
                    `/assignments?quickType=problem&quickId=${encodeURIComponent(problem.id)}&quickTitle=${encodeURIComponent(problem.title)}`,
                  )
                }
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Giao bài cho lớp
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/problems/${problemId}/edit`)}
                >
                  <Edit className="h-3.5 w-3.5" /> Chỉnh sửa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPlagiarismOpen(true)}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> Đạo văn
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card 2: Problem Tags (Codeforces spoiler collapse for students) */}
      {problem.tags?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <button
            type="button"
            onClick={() => setShowTagsSpoiler((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
              <Tag className="h-3.5 w-3.5 text-primary" />
              Chủ đề ({problem.tags.length})
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {showTagsSpoiler ? (
                <>
                  <EyeOff className="h-3 w-3" /> Ẩn <ChevronDown className="h-3 w-3 rotate-180" />
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" /> Hiện thẻ <ChevronDown className="h-3 w-3" />
                </>
              )}
            </span>
          </button>
          {showTagsSpoiler && (
            <div className="flex flex-wrap gap-1.5 border-t border-border p-3.5">
              {problem.tags.map((tag: any) => (
                <span
                  key={tag.tag}
                  className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {tag.tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Card 3: Contest / Pack Navigator */}
      {neighbors && (
        <div className="overflow-hidden rounded-xl border border-border bg-card p-3.5 shadow-card space-y-2.5">
          {neighbors.packTitle && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-foreground">{neighbors.packTitle}</span>
              {neighbors.position && neighbors.totalInGroup && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {neighbors.position}/{neighbors.totalInGroup}
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 justify-start px-2 text-xs"
              disabled={!neighbors.prev}
              title={neighbors.prev?.title}
              onClick={() => neighbors.prev && navigate(`/problems/${neighbors.prev.id}`)}
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Bài trước</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 justify-end px-2 text-xs"
              disabled={!neighbors.next}
              title={neighbors.next?.title}
              onClick={() => neighbors.next && navigate(`/problems/${neighbors.next.id}`)}
            >
              <span className="truncate">Bài tiếp</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => navigate("/problems/roadmap")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-primary hover:bg-muted/40"
          >
            <Compass className="h-3.5 w-3.5" /> Mở Lộ trình CP 4 Tầng
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <div className={`mx-auto space-y-3 ${isSplitActive || layoutMode === "zen" ? "max-w-[1540px]" : "max-w-7xl"}`}>
      {/* Compact Top Contest Bar (hidden in zen mode & print) */}
      {layoutMode !== "zen" && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/problems")}
              className="-ml-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Thư viện đề
            </Button>
            {neighbors?.packTitle && (
              <span className="hidden rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                {neighbors.packTitle}
                {neighbors.position && neighbors.totalInGroup
                  ? ` · ${neighbors.position}/${neighbors.totalInGroup}`
                  : ""}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {neighbors && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!neighbors.prev}
                  title={neighbors.prev?.title}
                  onClick={() => neighbors.prev && navigate(`/problems/${neighbors.prev.id}`)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!neighbors.next}
                  title={neighbors.next?.title}
                  onClick={() => neighbors.next && navigate(`/problems/${neighbors.next.id}`)}
                >
                  Tiếp <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
              {(["sm", "base", "lg"] as const).map((sz, i) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSize(sz)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                    fontSize === sz
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={sz === "sm" ? "Cỡ chữ nhỏ" : sz === "lg" ? "Cỡ chữ lớn" : "Cỡ chữ vừa"}
                >
                  {i === 0 ? "A-" : i === 1 ? "A" : "A+"}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => window.print()}
              title="In đề bài"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">In đề</span>
            </Button>

            {isStudent && isLargeDesktop && (
              <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => setLayoutMode("split")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    layoutMode === "split"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Chia đôi màn hình: Đề trái · Code phải"
                >
                  <Columns2 className="h-3 w-3" /> Chia đôi
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("tabs")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    layoutMode === "tabs"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Đọc đề chuẩn VNOJ / Codeforces"
                >
                  <LayoutList className="h-3 w-3" /> Đọc đề
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("zen")}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  title="Chế độ tập trung toàn màn hình"
                >
                  <Maximize2 className="h-3 w-3" />
                  Tập trung
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Split-pane Zen exit strip */}
      {layoutMode === "zen" && (
        <div className="no-print flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5">
          <span className="text-xs font-semibold text-foreground">{problem.title}</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setLayoutMode("split")}
            className="h-6 gap-1 text-[11px]"
          >
            <Minimize2 className="h-3 w-3" /> Thoát tập trung
          </Button>
        </div>
      )}

      {/* Main Content Area: Student Split-Pane OR VNOJ/Codeforces Contest Layout */}
      {isSplitActive ? (
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div
            ref={splitContainerRef}
            className="flex flex-row"
            style={{ minHeight: layoutMode === "zen" ? "calc(100vh - 7.5rem)" : "700px" }}
          >
            {/* Left pane */}
            <div
              className="flex min-w-0 flex-col border-r border-border"
              style={{ width: `${splitRatio}%` }}
            >
              <div className="no-print flex items-center justify-between border-b border-border bg-muted/25 px-2">
                <div className="flex overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                        activeTab === tab.id
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <tab.icon className="h-3.5 w-3.5" />
                      {tab.label}
                      {tab.id === 2 && submissions.length > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {submissions.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {hasAccepted ? (
                  <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> AC
                  </span>
                ) : hasAttempted ? (
                  <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    Đang thử
                  </span>
                ) : null}
              </div>

              <div
                className="flex-1 overflow-y-auto p-5 lg:p-6"
                style={{ maxHeight: layoutMode === "zen" ? "calc(100vh - 10rem)" : "78vh" }}
              >
                {activeTab === 0 && (
                  <ProblemViewer
                    problem={problem}
                    title={problem.title}
                    packLabel={neighbors?.packTitle}
                    showContestHeader
                    showTeacherSolution={false}
                    fontSize={fontSize}
                    onRunSample={triggerSingleSampleRun}
                    onRunAllSamples={visibleTests.length > 1 ? triggerAllSamplesRun : undefined}
                  />
                )}
                {activeTab === 2 && historySection}
                {activeTab === 3 && hacktestStudentSection}
              </div>
            </div>

            {/* Drag handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để thay đổi tỷ lệ khung đề bài và code"
              onMouseDown={() => {
                draggingSplitRef.current = true;
                document.body.style.userSelect = "none";
              }}
              className="no-print w-1.5 shrink-0 cursor-col-resize bg-border/30 transition-colors hover:bg-primary/50 active:bg-primary"
              title="Kéo để điều chỉnh độ rộng"
            />

            {/* Right pane */}
            <div className="no-print min-w-0 flex-1 overflow-y-auto p-4">
              {studentWorkspaceSection}
            </div>
          </div>
        </section>
      ) : (
        <div className={showVnojSidebar ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px]" : ""}>
          {/* Main Contest Sheet Card */}
          <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="no-scrollbar no-print flex items-center justify-between overflow-x-auto border-b border-border bg-muted/25 px-3">
              <div className="flex">
                {tabs
                  .filter((tab) => isTeacher || tab.id !== 3 || hasAccepted)
                  .map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-medium transition-colors ${
                        activeTab === tab.id
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <tab.icon className="h-3.5 w-3.5" />
                      {tab.label}
                      {tab.id === 2 && isStudent && submissions.length > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {submissions.length}
                        </span>
                      )}
                      {tab.id === 1 && isTeacher && assignedStudentsQuery.data && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {assignedStudentsQuery.data.totalSubmitted || 0}/
                          {assignedStudentsQuery.data.totalAssigned ||
                            assignedStudentsQuery.data.students?.length ||
                            0}
                        </span>
                      )}
                      {tab.id === 2 && isTeacher && pendingHackTests > 0 && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          {pendingHackTests}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              {activeTab !== 0 && (
                <span className="hidden truncate pl-3 text-xs font-medium text-muted-foreground sm:inline">
                  {problem.title}
                </span>
              )}
            </div>

            <div className="p-5 sm:p-6 lg:p-8">
              {activeTab === 0 && (
                <ProblemViewer
                  problem={problem}
                  title={problem.title}
                  packLabel={neighbors?.packTitle}
                  showContestHeader
                  showTeacherSolution={isTeacher}
                  fontSize={fontSize}
                  onRunSample={isStudent ? triggerSingleSampleRun : undefined}
                  onRunAllSamples={isStudent && visibleTests.length > 1 ? triggerAllSamplesRun : undefined}
                />
              )}

              {activeTab === 1 && isStudent && studentWorkspaceSection}

              {activeTab === 1 && isTeacher && (
                <div className="space-y-4">
                  {assignedStudentsQuery.isLoading ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Đang tải danh sách học sinh...
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => setPlagiarismOpen(true)}>
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-amber-500" /> Quét đạo văn code
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-border bg-card p-3.5 text-center shadow-sm">
                          <p className="text-xl font-semibold tabular-nums text-foreground">
                            {assignedStudentsQuery.data?.totalAssigned || 0}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Được giao</p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-center">
                          <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {assignedStudentsQuery.data?.totalSubmitted || 0}
                          </p>
                          <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                            {(assignedStudentsQuery.data?.totalAssigned || 0) === 0 &&
                            (assignedStudentsQuery.data?.totalSubmitted || 0) > 0
                              ? "Đã nộp (tự luyện)"
                              : "Đã nộp"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-center">
                          <p className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                            {assignedStudentsQuery.data?.totalPending || 0}
                          </p>
                          <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">Chưa nộp</p>
                        </div>
                      </div>

                      {!assignedStudentsQuery.data?.students?.length ? (
                        <div className="py-10 text-center">
                          <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">
                            Chưa có học sinh nào được giao bài này.
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            Học sinh có thể tự luyện tập đề này trong thư viện đề.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px]">
                              <thead className="border-b border-border bg-muted/50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Học sinh
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Nguồn
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Trạng thái
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Điểm
                                  </th>
                                  <th className="px-4 py-3"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {assignedStudentsQuery.data.students.map((s: any) => (
                                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                                    <td className="max-w-[260px] px-4 py-3">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/students/${s.id}`);
                                        }}
                                        className="flex w-full min-w-0 items-center gap-3 text-left transition-opacity hover:opacity-80"
                                        title="Xem lộ trình của học sinh này"
                                      >
                                        <div
                                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                          style={{ backgroundColor: getAvatarBgColor(s.fullName) }}
                                        >
                                          {s.fullName?.charAt(0) || "?"}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <StudentName
                                            fullName={s.fullName}
                                            nickname={s.nickname}
                                            primaryClassName="text-sm font-semibold text-foreground"
                                            inline
                                          />
                                          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                                        </div>
                                      </button>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3">
                                      <div className="flex flex-wrap gap-1">
                                        {s.assignedVia.map((via: string, i: number) => (
                                          <span
                                            key={i}
                                            className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                          >
                                            {via}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-center">
                                      {s.hasSubmitted ? (
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                          <CheckCircle2 className="h-3 w-3 shrink-0" /> Đã nộp
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                          <Clock className="h-3 w-3 shrink-0" /> Chưa nộp
                                        </span>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-center">
                                      {s.score !== null ? (
                                        <span className="text-sm font-semibold tabular-nums text-foreground">
                                          {s.score}/10
                                        </span>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right">
                                      <div className="flex justify-end gap-3 whitespace-nowrap">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setChecklistStudent({
                                              id: s.id,
                                              fullName: s.fullName,
                                              nickname: s.nickname,
                                              email: s.email,
                                            });
                                          }}
                                          className="whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground"
                                        >
                                          Lộ trình
                                        </button>
                                        {s.submissionId ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setViewingSubmission({
                                                id: s.submissionId,
                                                kind: s.submissionKind === "assignment" ? "assignment" : "practice",
                                              });
                                            }}
                                            className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
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

              {activeTab === 2 && isStudent && historySection}
              {activeTab === 3 && isStudent && hacktestStudentSection}
              {activeTab === 4 && isTeacher && problemId && <ProblemTestManager problemId={problemId} />}

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
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  hackTest.status === "approved"
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : hackTest.status === "rejected"
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                {hackTest.status === "approved"
                                  ? "Đã duyệt"
                                  : hackTest.status === "rejected"
                                    ? "Từ chối"
                                    : "Chờ duyệt"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {hackTest.proposer?.fullName || "Học sinh"} · bắt được{" "}
                                {hackTest.impactedCount || 0} lời giải AC cũ
                              </span>
                            </div>
                            {hackTest.note && (
                              <p className="mt-2 text-sm text-foreground/80">{hackTest.note}</p>
                            )}
                            {hackTest.validationNote && (
                              <p className="mt-1 text-xs text-muted-foreground">{hackTest.validationNote}</p>
                            )}
                          </div>
                          {hackTest.status === "pending" && (
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
                            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs text-foreground">
                              {hackTest.input}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                              Output đúng
                            </p>
                            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs text-foreground">
                              {hackTest.expectedOutput}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Right VNOJ / Codeforces Sticky Sidebar */}
          {showVnojSidebar && rightContestSidebar}
        </div>
      )}

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
            <p className="mt-1 text-sm text-muted-foreground">
              Nhập lý do để học viên biết vì sao test bị từ chối.
            </p>
            <label htmlFor="reject-reason" className="sr-only">
              Lý do từ chối
            </label>
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
                  rejectHackTestMutation.mutate({
                    hackTestId: rejectTarget.hackTestId,
                    reason: rejectReason.trim(),
                  });
                  setRejectTarget(null);
                }}
                disabled={!rejectReason.trim() || rejectHackTestMutation.isPending}
              >
                {rejectHackTestMutation.isPending ? "Đang xử lý..." : "Từ chối"}
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
            language,
            answer: answer.trim(),
            note: note.trim(),
            ...getPracticeTrackingPayload(),
          });
        }}
        onCancel={() => setShowConfirm(false)}
      />

      {viewingSubmission && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Xem bài luyện tập"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setViewingSubmission(null)}
            aria-hidden="true"
          />
          <EscapeOnOpen onEscape={() => setViewingSubmission(null)} />
          <div className="relative mx-4 flex max-h-[86vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-elevated">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {practiceSubmissionQuery.data?.student?.fullName || "Bài luyện tập"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {practiceSubmissionQuery.data?.problem?.title || "Đang tải..."}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setViewingSubmission(null)}>
                Đóng
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {practiceSubmissionQuery.isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Đang tải code...</div>
              ) : (
                <div className="space-y-4">
                  {practiceSubmissionQuery.data?.note && (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/50 p-3 text-xs text-foreground/80">
                      {practiceSubmissionQuery.data.note}
                    </pre>
                  )}
                  <Editor
                    height="460px"
                    language={
                      practiceSubmissionQuery.data?.language === "cpp" ||
                      /#include\s*</.test(practiceSubmissionQuery.data?.code || "")
                        ? "cpp"
                        : "python"
                    }
                    value={
                      practiceSubmissionQuery.data?.code || practiceSubmissionQuery.data?.answer || ""
                    }
                    theme={dark ? "vs-dark" : "vs"}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                    }}
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

      {isTeacher && problemId && (
        <PlagiarismDialog
          open={plagiarismOpen}
          onClose={() => setPlagiarismOpen(false)}
          endpoint={`/problems/${problemId}/plagiarism`}
          title={`Quét tương đồng code — ${problem?.title || "Bài tập"}`}
        />
      )}
    </div>
  );
}

function EscapeOnOpen({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
  return null;
}
