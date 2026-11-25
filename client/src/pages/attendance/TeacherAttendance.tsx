import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  X,
  UserCheck,
  Clock,
  UserX,
  FileText,
  Play,
  Square,
  Timer,
  BarChart3,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import { StudentName } from "../../components/ui/StudentName";
import { socketSubscribe } from "../../lib/socket";
import RosterRemovalDialog from "../../components/roster/RosterRemovalDialog";
import RosterExclusionsPanel from "../../components/roster/RosterExclusionsPanel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { cn } from "../../lib/utils";

interface Student {
  id: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  days: Array<{ date: string; status: string | null }>;
}

interface PendingItem {
  id: string;
  studentId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  date: string;
  checkInAt: string;
  note: string | null;
}

interface ActiveSession {
  id: string;
  startedAt: string;
  endsAt: string;
  status: string;
}

function vnDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

function useCountdown(endsAt: string | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

function fmtTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const statusCellClass = (status: string | null) => {
  if (status === "present") return "bg-emerald-500 text-white";
  if (status === "late") return "bg-amber-400 text-white";
  if (status === "absent") return "bg-red-500 text-white";
  if (status === "excused") return "bg-sky-400 text-white";
  if (status === "pending") return "bg-muted text-muted-foreground";
  return "bg-muted/60 text-muted-foreground/70";
};

const statusLabel = (status: string | null) => {
  if (status === "present") return "CM";
  if (status === "late") return "T";
  if (status === "absent") return "V";
  if (status === "excused") return "CP";
  if (status === "pending") return "?";
  return "—";
};

export default function TeacherAttendance() {
  const [activeTab, setActiveTab] = useState<"sheet" | "pending" | "stats">("sheet");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [editCell, setEditCell] = useState<{
    studentId: string;
    studentName: string;
    date: string;
    currentStatus: string | null;
  } | null>(null);
  const [startDuration, setStartDuration] = useState(30);
  const [removeStudent, setRemoveStudent] = useState<{ id: string; name: string } | null>(null);
  const [showExclusions, setShowExclusions] = useState(false);

  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmContext();
  const { user } = useAuthContext();
  const isTeacher =
    user?.role === "teacher" || user?.role === "admin" || user?.role === "teaching_assistant";
  const monthKey = useMemo(() => vnDateKey(currentDate).slice(0, 7), [currentDate]);

  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (typeof msg.type !== "string" || !msg.type.startsWith("attendance.")) return;
      qc.invalidateQueries({ queryKey: ["attendance-active-session"] });
      qc.invalidateQueries({ queryKey: ["attendance-sheet"] });
      if (isTeacher) qc.invalidateQueries({ queryKey: ["attendance-pending"] });
      if (activeTab === "stats") qc.invalidateQueries({ queryKey: ["attendance-stats", monthKey] });
    });
    return unsub;
  }, [qc, isTeacher, activeTab, monthKey]);

  const sessionQuery = useQuery({
    queryKey: ["attendance-active-session"],
    queryFn: () =>
      api.get("/attendance/active-session").then((r: any) => r.data.session as ActiveSession | null),
    refetchInterval: 30000,
  });

  const sheetQuery = useQuery({
    queryKey: ["attendance-sheet", monthKey, search],
    queryFn: () => {
      const params = new URLSearchParams({ month: monthKey });
      if (search) params.set("search", search);
      return api.get(`/attendance/sheet?${params}`).then((r: any) => r.data);
    },
    refetchInterval: 60000,
  });

  const pendingQuery = useQuery({
    queryKey: ["attendance-pending"],
    queryFn: () => api.get("/attendance/pending").then((r: any) => r.data),
    enabled: isTeacher,
    refetchInterval: isTeacher ? 60000 : false,
  });

  const statsQuery = useQuery({
    queryKey: ["attendance-stats", monthKey],
    queryFn: () => api.get(`/attendance/stats?month=${monthKey}`).then((r: any) => r.data),
    enabled: isTeacher && activeTab === "stats",
  });

  const startMutation = useMutation({
    mutationFn: (durationMinutes: number) => api.post("/attendance/start", { durationMinutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-active-session"] });
      toast.success({ title: "Đã bắt đầu phiên điểm danh" });
    },
    onError: () => toast.error({ title: "Lỗi khi bắt đầu phiên" }),
  });

  const endMutation = useMutation({
    mutationFn: () => api.post("/attendance/end"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-active-session"] });
      qc.invalidateQueries({ queryKey: ["attendance-sheet"] });
      toast.success({ title: "Đã kết thúc phiên điểm danh" });
    },
    onError: () => toast.error({ title: "Lỗi khi kết thúc phiên" }),
  });

  const approveMutation = useMutation({
    mutationFn: (body: { checkInIds: string[]; action: string }) =>
      api.post("/attendance/approve", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-sheet"] });
      qc.invalidateQueries({ queryKey: ["attendance-pending"] });
      toast.success({ title: "Đã duyệt điểm danh" });
    },
    onError: () => toast.error({ title: "Lỗi khi duyệt" }),
  });

  const overrideMutation = useMutation({
    mutationFn: (body: { studentId: string; date: string; status: string }) =>
      api.put("/attendance/override", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-sheet"] });
      toast.success({ title: "Đã cập nhật điểm danh" });
      setEditCell(null);
    },
    onError: () => toast.error({ title: "Lỗi khi cập nhật" }),
  });

  const session: ActiveSession | null = sessionQuery.data || null;
  const countdown = useCountdown(session?.endsAt || null);
  const isSessionActive = session?.status === "active";
  const students: Student[] = sheetQuery.data?.students || [];
  const pending: PendingItem[] = pendingQuery.data?.pending || [];
  const pendingCount: number = sheetQuery.data?.pendingCount || 0;
  const dates: string[] = students.length > 0 ? students[0].days.map((d: any) => d.date) : [];

  const handlePrevious = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const handleNext = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };
  const handleApprove = (ids: string[], action: "approve" | "reject") => {
    if (ids.length) approveMutation.mutate({ checkInIds: ids, action });
  };
  const handleOverride = (status: string) => {
    if (!editCell) return;
    overrideMutation.mutate({
      studentId: editCell.studentId,
      date: editCell.date,
      status,
    });
  };
  const handleEndSession = async () => {
    const ok = await confirm({
      title: "Kết thúc phiên điểm danh",
      message: "Học sinh chưa check-in sẽ bị đánh vắng.",
      confirmLabel: "Kết thúc",
      variant: "danger",
    });
    if (ok) endMutation.mutate();
  };

  const monthLabel = new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "long",
  }).format(currentDate);

  const tabs = isTeacher
    ? [
        { key: "sheet" as const, icon: FileText, label: "Bảng điểm danh" },
        { key: "pending" as const, icon: Clock, label: "Duyệt điểm danh", badge: pendingCount },
        { key: "stats" as const, icon: BarChart3, label: "Thống kê" },
      ]
    : [{ key: "sheet" as const, icon: FileText, label: "Bảng điểm danh" }];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Điểm danh"
        description="Quản lý điểm danh học sinh hàng ngày"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={handlePrevious} aria-label="Tháng trước">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="inline-flex h-8 min-w-[120px] items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium">
                {monthLabel}
              </span>
              <Button variant="outline" size="icon-sm" onClick={handleNext} aria-label="Tháng sau">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowExclusions((v) => !v)}>
              {showExclusions ? "Ẩn danh sách loại" : "Danh sách đã loại"}
            </Button>
          </div>
        }
      />

      {showExclusions ? <RosterExclusionsPanel /> : null}

      {isTeacher ? (
        <Card className={cn(isSessionActive ? "border-emerald-500/30" : "border-border")}>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {isSessionActive ? (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      Phiên đang mở
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Timer className="h-5 w-5 text-muted-foreground" />
                      <span
                        className={cn(
                          "text-2xl font-semibold tabular-nums",
                          countdown < 60 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {fmtTimer(countdown)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Timer className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Chưa mở phiên điểm danh</div>
                    <p className="text-sm text-muted-foreground">Bắt đầu phiên để học sinh điểm danh</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isSessionActive ? (
                <Button variant="destructive" onClick={handleEndSession} disabled={endMutation.isPending}>
                  <Square className="h-4 w-4" /> Kết thúc
                </Button>
              ) : (
                <>
                  <select
                    value={startDuration}
                    onChange={(e) => setStartDuration(Number(e.target.value))}
                    className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
                  >
                    <option value={10}>10 phút</option>
                    <option value={20}>20 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={45}>45 phút</option>
                    <option value={60}>60 phút</option>
                  </select>
                  <Button
                    onClick={() => startMutation.mutate(startDuration)}
                    disabled={startMutation.isPending}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Play className="h-4 w-4" /> Bắt đầu
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex w-fit gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="h-4 w-4" /> {tab.label}
            {tab.badge && tab.badge > 0 ? (
              <span className="ml-0.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === "sheet" ? (
        <div className="space-y-4">
          {isTeacher ? (
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Tìm học sinh..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          ) : null}

          {sheetQuery.isLoading ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="skeleton-shimmer h-64 bg-muted" />
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-12 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">Chưa có dữ liệu điểm danh</p>
            </div>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 top-0 z-30 min-w-[170px] bg-card px-4 py-3 font-semibold text-foreground">
                        Học sinh
                      </th>
                      {dates.map((date) => (
                        <th
                          key={date}
                          className="sticky top-0 z-20 min-w-[70px] bg-card px-3 py-3 text-center font-semibold text-foreground"
                        >
                          <div className="text-xs">{date.slice(8, 10)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {
                              ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][
                                new Date(date + "T00:00:00+07:00").getDay()
                              ]
                            }
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {students.map((student) => (
                      <tr key={student.id} className="hover:bg-muted/40">
                        <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {student.fullName.charAt(0)}
                            </div>
                            <StudentName
                              fullName={student.fullName}
                              nickname={student.nickname}
                              className="flex-1"
                              primaryClassName="text-sm font-medium"
                            />
                            {isTeacher ? (
                              <button
                                title="Loại khỏi danh sách"
                                onClick={() =>
                                  setRemoveStudent({ id: student.id, name: student.fullName })
                                }
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                        {student.days.map((day) => (
                          <td key={day.date} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() =>
                                isTeacher &&
                                setEditCell({
                                  studentId: student.id,
                                  studentName: student.fullName,
                                  date: day.date,
                                  currentStatus: day.status,
                                })
                              }
                              className={cn(
                                "mx-auto h-8 w-full max-w-[60px] rounded text-xs font-semibold transition hover:opacity-80",
                                statusCellClass(day.status),
                              )}
                            >
                              {statusLabel(day.status)}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-500" /> Có mặt
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-400" /> Trễ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-500" /> Vắng
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-sky-400" /> Có phép
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-muted" /> Chờ duyệt
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-muted/60" /> Chưa có
            </span>
          </div>
        </div>
      ) : null}

      {activeTab === "pending" && isTeacher ? (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-12 text-center">
              <Clock className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                Không có điểm danh nào chờ duyệt
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleApprove(
                    pending.map((p) => p.id),
                    "approve",
                  )}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4" /> Duyệt tất cả ({pending.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleApprove(
                    pending.map((p) => p.id),
                    "reject",
                  )}
                >
                  <X className="h-4 w-4" /> Từ chối tất cả
                </Button>
              </div>
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {pending.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {item.fullName.charAt(0)}
                        </div>
                        <div>
                          <StudentName
                            fullName={item.fullName}
                            nickname={item.nickname}
                            primaryClassName="text-sm font-medium text-foreground"
                          />
                          <div className="text-xs text-muted-foreground">
                            Check-in lúc {formatTime(item.checkInAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="icon-sm"
                          className="bg-emerald-500 text-white hover:bg-emerald-600"
                          onClick={() => handleApprove([item.id], "approve")}
                          aria-label="Duyệt"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => handleApprove([item.id], "reject")}
                          aria-label="Từ chối"
                          className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : null}

      {activeTab === "stats" && isTeacher ? (
        <div className="space-y-6">
          {statsQuery.isLoading ? (
            <div className="skeleton-shimmer h-48 rounded-xl border border-border bg-card" />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Tổng học sinh</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {statsQuery.data?.totalStudents || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Tỷ lệ trung bình</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {statsQuery.data?.avgRate || 0}%
                    </p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 font-semibold text-foreground">Học sinh</th>
                        <th className="px-3 py-3 text-center font-semibold text-foreground">CM</th>
                        <th className="px-3 py-3 text-center font-semibold text-foreground">Trễ</th>
                        <th className="px-3 py-3 text-center font-semibold text-foreground">Vắng</th>
                        <th className="px-3 py-3 text-center font-semibold text-foreground">CP</th>
                        <th className="px-3 py-3 text-center font-semibold text-foreground">Tỷ lệ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {statsQuery.data?.stats?.map((s: any) => (
                        <tr key={s.studentId} className="hover:bg-muted/40">
                          <td className="px-4 py-2.5 font-medium text-foreground">
                            <StudentName
                              fullName={s.fullName}
                              nickname={s.nickname}
                              primaryClassName="text-sm font-medium text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{s.present}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{s.late}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{s.absent}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{s.excused}</td>
                          <td className="px-3 py-2.5 text-center font-semibold tabular-nums">
                            {s.rate || 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : null}

      <Dialog open={Boolean(editCell)} onOpenChange={(open) => !open && setEditCell(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cập nhật điểm danh</DialogTitle>
          </DialogHeader>
          {editCell ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{editCell.studentName}</p>
              <p>Ngày {editCell.date}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleOverride("present")}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <UserCheck className="h-4 w-4" /> Có mặt
            </Button>
            <Button
              onClick={() => handleOverride("late")}
              className="bg-amber-400 text-white hover:bg-amber-500"
            >
              <Clock className="h-4 w-4" /> Trễ
            </Button>
            <Button
              onClick={() => handleOverride("absent")}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              <UserX className="h-4 w-4" /> Vắng
            </Button>
            <Button
              onClick={() => handleOverride("excused")}
              className="bg-sky-400 text-white hover:bg-sky-500"
            >
              <FileText className="h-4 w-4" /> Có phép
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCell(null)} className="w-full">
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {removeStudent ? (
        <RosterRemovalDialog
          open
          studentId={removeStudent.id}
          studentName={removeStudent.name}
          onClose={() => setRemoveStudent(null)}
        />
      ) : null}
    </div>
  );
}
