import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Video,
  Plus,
  Users,
  Lock,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  ClipboardList,
  ShieldAlert,
  Sparkles,
  Maximize2,
  ArrowLeft,
  Clock,
  BookOpen,
  Award,
  CheckCircle2,
  Wifi,
  WifiOff,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const MEET_TAB = "codeclass_meet";

interface MeetingRoomItem {
  id: string;
  title: string;
  courseId?: string | null;
  courseTitle?: string | null;
  hostName: string;
  hasPassword: boolean;
  status: string;
  activeParticipantCount: number;
  peakParticipantCount: number;
  activeQuizTitle?: string | null;
  examMonitoring: boolean;
  activeParticipants: Array<{
    name: string;
    role?: string | null;
    ccId?: string | null;
    points?: number;
    violations?: number;
  }>;
  quizSessionCount: number;
  lastSyncedAt: string;
  endedAt?: string | null;
  createdAt: string;
  joinUrl: string;
}

interface MeetingRoomsResponse {
  meetingServerOnline: boolean;
  publicBaseUrl: string;
  rooms: MeetingRoomItem[];
  recentEndedRooms: MeetingRoomItem[];
}

interface QuizSessionSummary {
  id: string;
  roomId: string;
  roomTitle: string;
  courseId?: string | null;
  courseTitle?: string | null;
  hostName: string;
  kind: "quiz" | "adaptive";
  title: string;
  totalQuestions: number;
  submissionCount: number;
  avgAccuracy: number;
  skills: Array<{ id: string; name: string }>;
  startedAt: string;
  endedAt?: string | null;
  submissions: Array<{
    id: string;
    userId?: string | null;
    studentName: string;
    score: number;
    totalQuestions: number;
    accuracy: number;
    timeTaken: number;
    rank?: number | null;
    completedAt: string;
  }>;
}

export default function MeetPage() {
  const { user } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirmContext();
  const qc = useQueryClient();

  const isStaff = user?.role === "admin" || user?.role === "teacher" || user?.role === "teaching_assistant";

  const [tab, setTab] = useState<"rooms" | "history">("rooms");
  const [createOpen, setCreateOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomCourseId, setRoomCourseId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [autoOpenAfterCreate, setAutoOpenAfterCreate] = useState(true);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [embeddedRoom, setEmbeddedRoom] = useState<{ id: string; title: string; url: string } | null>(null);

  // History filters & detail dialog
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterKind, setFilterKind] = useState<"" | "quiz" | "adaptive">("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const roomsQ = useQuery<MeetingRoomsResponse>({
    queryKey: ["meeting-rooms"],
    queryFn: () => api.get("/meetings/rooms").then((r) => r.data),
    refetchInterval: 8000,
  });

  const historyQ = useQuery<{ sessions: QuizSessionSummary[] }>({
    queryKey: ["meeting-quiz-history", filterCourseId, filterKind],
    queryFn: () =>
      api
        .get("/meetings/quiz-history", {
          params: {
            ...(filterCourseId ? { courseId: filterCourseId } : {}),
            ...(filterKind ? { kind: filterKind } : {}),
            limit: 40,
          },
        })
        .then((r) => r.data),
  });

  const coursesQ = useQuery({
    queryKey: ["courses-for-meet"],
    queryFn: () =>
      api
        .get("/courses", { params: { status: "current" } })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data?.courses || [])),
  });

  const sessionDetailQ = useQuery<any>({
    queryKey: ["meeting-quiz-session", selectedSessionId],
    queryFn: () => api.get(`/meetings/quiz-sessions/${selectedSessionId}`).then((r) => r.data),
    enabled: Boolean(selectedSessionId),
  });

  const openRoomTab = (url: string) => {
    const win = window.open(url, MEET_TAB);
    if (win) {
      try {
        win.opener = null;
      } catch {
        // ignore cross-origin opener restriction
      }
    }
  };

  const createMut = useMutation({
    mutationFn: () =>
      api
        .post("/meetings/rooms", {
          title: roomTitle.trim(),
          courseId: roomCourseId || undefined,
          password: roomPassword.trim() || undefined,
          notifyStudents,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      toast.success({ title: `Đã tạo phòng "${data.room?.title || roomTitle}"` });
      qc.invalidateQueries({ queryKey: ["meeting-rooms"] });
      setCreateOpen(false);
      setRoomTitle("");
      setRoomPassword("");
      if (autoOpenAfterCreate && data.joinUrl) {
        openRoomTab(data.joinUrl);
      }
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.error;
      toast.error({
        title: detail ? `Không tạo được phòng Meeting: ${detail}` : "Không tạo được phòng Meeting — vui lòng kiểm tra Meeting Server.",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (roomId: string) => api.delete(`/meetings/rooms/${roomId}`).then((r) => r.data),
    onSuccess: (_data, roomId) => {
      toast.success({ title: "Đã đóng phòng Meeting" });
      if (embeddedRoom?.id === roomId) setEmbeddedRoom(null);
      qc.invalidateQueries({ queryKey: ["meeting-rooms"] });
    },
    onError: (err: any) => {
      toast.error({ title: err?.response?.data?.error || "Không đóng được phòng" });
    },
  });

  const copyLink = async (room: MeetingRoomItem) => {
    const full = room.joinUrl.startsWith("http")
      ? room.joinUrl
      : `${window.location.origin}${room.joinUrl}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopiedId(room.id);
      setTimeout(() => setCopiedId((prev) => (prev === room.id ? null : prev)), 2000);
      toast.success({ title: "Đã sao chép link vào phòng" });
    } catch {
      toast.error({ title: "Không sao chép được link" });
    }
  };

  const liveRooms = roomsQ.data?.rooms || [];
  const recentEndedRooms = roomsQ.data?.recentEndedRooms || [];
  const totalOnlineUsers = useMemo(
    () => liveRooms.reduce((sum, r) => sum + (r.activeParticipantCount || 0), 0),
    [liveRooms],
  );
  const sessions = historyQ.data?.sessions || [];

  // Inline embedded Meeting viewport (optional 1-click mode)
  if (embeddedRoom) {
    return (
      <ErrorBoundary>
        <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="xs" onClick={() => setEmbeddedRoom(null)}>
                <ArrowLeft className="mr-1 size-3.5" /> Quay lại danh sách
              </Button>
              <span className="truncate text-sm font-semibold">{embeddedRoom.title}</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Đang nhúng
              </span>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const url = embeddedRoom.url;
                setEmbeddedRoom(null);
                openRoomTab(url);
              }}
            >
              <Maximize2 className="mr-1 size-3.5" /> Mở tab toàn màn hình
            </Button>
          </div>
          <iframe
            src={embeddedRoom.url}
            title={embeddedRoom.title}
            className="h-full w-full flex-1 border-0"
            allow="camera; microphone; display-capture; autoplay; clipboard-read; clipboard-write"
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Video className="size-6 text-primary" /> Lớp học Trực tuyến (Meeting)
              </h1>
              {roomsQ.data && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    roomsQ.data.meetingServerOnline
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {roomsQ.data.meetingServerOnline ? (
                    <>
                      <Wifi className="size-3" /> Trực tuyến · {liveRooms.length} phòng · {totalOnlineUsers} người
                    </>
                  ) : (
                    <>
                      <WifiOff className="size-3" /> Meeting Server ngoại tuyến
                    </>
                  )}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isStaff
                ? "Tạo phòng học theo khóa, theo dõi lớp đang online và xem lại toàn bộ kết quả Quiz đồng bộ về hồ sơ kỹ năng."
                : "Tham gia nhanh các lớp học trực tuyến đang diễn ra và xem lại lịch sử làm Quiz trong buổi học."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                roomsQ.refetch();
                historyQ.refetch();
              }}
              disabled={roomsQ.isFetching}
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${roomsQ.isFetching ? "animate-spin" : ""}`} />
              Làm mới
            </Button>
            {isStaff && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 size-4" /> Tạo phòng Meeting
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="inline-flex h-9 rounded-lg border border-border bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setTab("rooms")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
              tab === "rooms" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Video className="size-3.5" /> Lớp học đang online ({liveRooms.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
              tab === "history" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardList className="size-3.5" /> Lịch sử Quiz Meeting ({sessions.length})
          </button>
        </div>

        {/* TAB 1: LIVE ROOMS */}
        {tab === "rooms" ? (
          <div className="space-y-6">
            {roomsQ.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card/60" />
                ))}
              </div>
            ) : liveRooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center space-y-3">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Video className="size-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">Hiện chưa có lớp học Meeting nào đang mở</h2>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {isStaff
                      ? "Bấm \"Tạo phòng Meeting\" để mở phòng giảng dạy mới, gắn khóa học và gửi thông báo tới học sinh."
                      : "Khi giáo viên mở phòng học trực tuyến, phòng sẽ tự động hiển thị tại đây để bạn bấm vào ngay."}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  {isStaff && (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-1.5 size-4" /> Tạo phòng Meeting đầu tiên
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openRoomTab(roomsQ.data?.publicBaseUrl || "/meet/")}
                  >
                    <ExternalLink className="mr-1.5 size-3.5" /> Mở sảnh Meeting gốc
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {liveRooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <h3 className="truncate text-base font-semibold">{room.title}</h3>
                            {room.hasPassword && <Lock className="size-3.5 text-amber-500 shrink-0" />}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">
                            GV/Host: <span className="font-medium text-foreground">{room.hostName || "Chưa rõ"}</span>
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary shrink-0 tabular-nums">
                          <Users className="size-3" /> {room.activeParticipantCount}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {room.courseTitle && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium">
                            <BookOpen className="size-3 text-primary" /> {room.courseTitle}
                          </span>
                        )}
                        {room.activeQuizTitle && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            <Sparkles className="size-3" /> Đang thi Quiz: {room.activeQuizTitle}
                          </span>
                        )}
                        {room.examMonitoring && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                            <ShieldAlert className="size-3" /> Đang giám sát thi
                          </span>
                        )}
                      </div>

                      {room.activeParticipants.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {room.activeParticipants.slice(0, 6).map((p, idx) => (
                            <span
                              key={`${room.id}-p-${idx}`}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {p.name}
                            </span>
                          ))}
                          {room.activeParticipants.length > 6 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              +{room.activeParticipants.length - 6} khác
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                      <Button size="xs" className="flex-1" onClick={() => openRoomTab(room.joinUrl)}>
                        <ExternalLink className="mr-1 size-3.5" /> Vào phòng
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setEmbeddedRoom({
                            id: room.id,
                            title: room.title,
                            url: room.joinUrl,
                          })
                        }
                        title="Mở ngay trong khung CodeClass"
                      >
                        Mở nhúng
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => copyLink(room)}
                        title="Sao chép link mời"
                      >
                        {copiedId === room.id ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                      {isStaff && (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Đóng phòng "${room.title}"?`,
                              message: "Toàn bộ thành viên đang trong phòng sẽ bị ngắt kết nối khỏi buổi học.",
                              confirmLabel: "Đóng phòng",
                              variant: "danger",
                            });
                            if (ok) deleteMut.mutate(room.id);
                          }}
                          title="Đóng phòng"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent ended rooms */}
            {recentEndedRooms.length > 0 && (
              <div className="space-y-2.5">
                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-4" /> Các buổi học gần đây
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {recentEndedRooms.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{r.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {r.courseTitle ? `${r.courseTitle} · ` : ""}
                          Cao điểm {r.peakParticipantCount} người · {r.quizSessionCount} quiz
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {new Date(r.endedAt || r.lastSyncedAt).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: MEETING QUIZ HISTORY */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-lg border border-border bg-card px-3 text-xs"
                value={filterCourseId}
                onChange={(e) => setFilterCourseId(e.target.value)}
              >
                <option value="">Tất cả khóa học</option>
                {(coursesQ.data || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-lg border border-border bg-card px-3 text-xs"
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as any)}
              >
                <option value="">Tất cả loại Quiz</option>
                <option value="quiz">Quiz chuẩn</option>
                <option value="adaptive">Adaptive Quiz</option>
              </select>
            </div>

            {historyQ.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card/60" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-xs text-muted-foreground">
                Chưa có dữ liệu Quiz nào được ghi nhận từ lớp học Meeting. Khi giáo viên tổ chức Quiz trong phòng Meeting, kết quả sẽ tự động đồng bộ về đây và cập nhật hồ sơ kỹ năng học viên.
              </div>
            ) : (
              <div className="space-y-2.5">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              s.kind === "adaptive"
                                ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {s.kind === "adaptive" ? "Adaptive" : "Quiz"}
                          </span>
                          <h3 className="font-semibold text-sm text-foreground">{s.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Phòng: <span className="font-medium text-foreground">{s.roomTitle}</span>
                          {s.courseTitle ? ` · ${s.courseTitle}` : ""} ·{" "}
                          {new Date(s.startedAt).toLocaleString("vi-VN")}
                        </p>
                        {s.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {s.skills.map((sk) => (
                              <span
                                key={sk.id}
                                className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {sk.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <div>
                          <p className="text-xs text-muted-foreground">Số câu</p>
                          <p className="font-semibold tabular-nums text-sm">{s.totalQuestions}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Lượt nộp</p>
                          <p className="font-semibold tabular-nums text-sm">{s.submissionCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Độ chính xác TB</p>
                          <p
                            className={`font-bold tabular-nums text-sm ${
                              s.avgAccuracy >= 70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : s.avgAccuracy >= 45
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-500"
                            }`}
                          >
                            {s.avgAccuracy}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CREATE MEETING ROOM DIALOG */}
        <Dialog open={createOpen} onOpenChange={(v) => !v && !createMut.isPending && setCreateOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="size-4 text-primary" /> Tạo phòng Meeting mới
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tên buổi học / Phòng Meeting *</label>
                <Input
                  className="mt-1"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="Ví dụ: Python Cơ Bản — Buổi 5: Vòng lặp"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Gắn khóa học (tùy chọn)</label>
                <select
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                  value={roomCourseId}
                  onChange={(e) => setRoomCourseId(e.target.value)}
                >
                  <option value="">— Không gắn khóa học cụ thể —</option>
                  {(coursesQ.data || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mật khẩu phòng (tùy chọn)</label>
                <Input
                  type="password"
                  className="mt-1"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="Để trống nếu mở tự do"
                />
              </div>
              {roomCourseId && (
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={notifyStudents}
                    onChange={(e) => setNotifyStudents(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>Gửi thông báo lớp đang mở tới học sinh trong khóa</span>
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={autoOpenAfterCreate}
                  onChange={(e) => setAutoOpenAfterCreate(e.target.checked)}
                  className="accent-primary"
                />
                <span>Tự động mở phòng học ngay sau khi tạo</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={createMut.isPending}>
                  Hủy
                </Button>
                <Button
                  size="sm"
                  disabled={!roomTitle.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? "Đang tạo..." : "Tạo phòng"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* QUIZ SESSION DETAIL DIALOG */}
        <Dialog open={Boolean(selectedSessionId)} onOpenChange={(v) => !v && setSelectedSessionId(null)}>
          <DialogContent className="max-w-2xl max-h-[82vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Award className="size-4 text-primary" />
                {sessionDetailQ.data?.title || "Chi tiết phiên Quiz Meeting"}
              </DialogTitle>
            </DialogHeader>
            {sessionDetailQ.isLoading ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Đang tải chi tiết...</p>
            ) : sessionDetailQ.data ? (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  Phòng: <span className="font-medium text-foreground">{sessionDetailQ.data.roomTitle}</span>
                  {sessionDetailQ.data.courseTitle ? ` · ${sessionDetailQ.data.courseTitle}` : ""}
                </div>

                {/* Leaderboard / Submissions */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Kết quả học viên ({sessionDetailQ.data.submissions?.length || 0})
                  </h4>
                  {(sessionDetailQ.data.submissions || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có bài nộp nào.</p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {sessionDetailQ.data.submissions.map((sub: any) => (
                        <div key={sub.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            {sub.rank != null && (
                              <span className="w-6 text-center font-bold text-primary">#{sub.rank}</span>
                            )}
                            <span className="truncate font-medium">{sub.studentName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 tabular-nums">
                            <span>
                              {sub.score}/{sub.totalQuestions}
                            </span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {sub.accuracy}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Questions breakdown */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Thống kê từng câu ({sessionDetailQ.data.questions?.length || 0})
                  </h4>
                  <div className="space-y-2">
                    {(sessionDetailQ.data.questions || []).map((q: any, idx: number) => (
                      <div key={q.id || idx} className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">
                            Câu {idx + 1}: {q.question}
                          </span>
                          {q.attemptCount > 0 && (
                            <span className="inline-flex items-center gap-1 shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> {q.correctCount}/{q.attemptCount} đúng
                            </span>
                          )}
                        </div>
                        {q.skillName && (
                          <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Kỹ năng: {q.skillName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
