import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, CheckCircle, XCircle, FileText, Timer, Play } from "lucide-react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import AttendanceHeatmap, { AttendanceLegend } from "../../components/attendance/AttendanceHeatmap";
import { socketSubscribe } from "../../lib/socket";
import { useAuthContext } from "../../contexts/AuthContext";
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

interface StatusData {
  session: { id: string; startedAt: string; endsAt: string; status: string } | null;
  checkIn: { status: string | null; checkInAt: string | null; note: string | null } | null;
  canCheckIn: boolean;
  canRequestLeave: boolean;
}

function vnDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(timestamp));
}

function useCountdown(endsAt: string | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      return;
    }
    const tick = () =>
      setRemaining(Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000)));
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

const STATUS_INFO: Record<
  string,
  { icon: any; color: string; bg: string; label: string; desc: string }
> = {
  pending: {
    icon: Clock,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "Đang chờ duyệt",
    desc: "Giáo viên sẽ duyệt điểm danh của bạn",
  },
  present: {
    icon: CheckCircle,
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Đã điểm danh",
    desc: "Bạn đã điểm danh thành công",
  },
  late: {
    icon: Clock,
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    label: "Trễ",
    desc: "Bạn điểm danh trễ",
  },
  absent: {
    icon: XCircle,
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-500/10",
    label: "Vắng",
    desc: "Bạn chưa điểm danh",
  },
  excused: {
    icon: FileText,
    color: "text-sky-700 dark:text-sky-400",
    bg: "bg-sky-500/10",
    label: "Có phép",
    desc: "Bạn đã xin nghỉ có phép",
  },
};

function StatBox({
  value,
  label,
  className,
  valueClassName,
}: {
  value: string | number;
  label: string;
  className: string;
  valueClassName: string;
}) {
  return (
    <div className={cn("rounded-lg p-3 text-center", className)}>
      <div className={cn("text-lg font-semibold tabular-nums", valueClassName)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function StudentAttendance() {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveReason, setLeaveReason] = useState("");
  const [months, setMonths] = useState(3);

  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmContext();
  const { user } = useAuthContext();
  const today = useMemo(() => vnDateKey(new Date()), []);

  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "attendance.session_started" || msg.type === "attendance.session_ended") {
        qc.invalidateQueries({ queryKey: ["my-attendance-status"] });
        return;
      }
      if (msg.type === "attendance.updated" && msg.payload?.studentId === user?.id) {
        qc.invalidateQueries({ queryKey: ["my-attendance-status"] });
        qc.invalidateQueries({ queryKey: ["my-attendance-history"] });
      }
    });
    return unsub;
  }, [qc, user?.id]);

  const statusQuery = useQuery({
    queryKey: ["my-attendance-status", today],
    queryFn: () => api.get(`/attendance/my-status?date=${today}`).then((r: any) => r.data),
    refetchInterval: 60000,
  });

  const historyQuery = useQuery({
    queryKey: ["my-attendance-history", months],
    queryFn: () => api.get(`/attendance/my-history?months=${months}`).then((r: any) => r.data),
  });

  const checkInMutation = useMutation({
    mutationFn: () => api.post("/attendance/check-in"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] });
      toast.success({ title: "Điểm danh thành công! Đang chờ giáo viên duyệt" });
    },
    onError: (err: any) => toast.error({ title: err.response?.data?.error || "Có lỗi xảy ra" }),
  });

  const leaveMutation = useMutation({
    mutationFn: (body: { reason: string }) => api.post("/attendance/request-leave", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] });
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] });
      toast.success({ title: "Đã ghi nhận đơn xin nghỉ" });
      setLeaveOpen(false);
      setLeaveReason("");
    },
    onError: (err: any) => toast.error({ title: err.response?.data?.error || "Có lỗi xảy ra" }),
  });

  const status: StatusData = statusQuery.data || {
    session: null,
    checkIn: null,
    canCheckIn: false,
    canRequestLeave: false,
  };
  const history = historyQuery.data || { days: [], stats: {} };
  const countdown = useCountdown(status.session?.endsAt || null);
  const isSessionActive = status.session?.status === "active";

  const handleCheckIn = async () => {
    const ok = await confirm({
      title: "Xác nhận điểm danh",
      message: "Xác nhận điểm danh hôm nay?",
      confirmLabel: "Điểm danh",
    });
    if (ok) checkInMutation.mutate();
  };

  const handleRequestLeave = () => {
    if (!leaveReason.trim()) {
      toast.error({ title: "Vui lòng nhập lý do nghỉ" });
      return;
    }
    leaveMutation.mutate({ reason: leaveReason.trim() });
  };

  const currentStatus = status.checkIn?.status;
  const statusInfo = currentStatus ? STATUS_INFO[currentStatus] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Điểm danh"
        description="Điểm danh hàng ngày và xin nghỉ có phép"
      />

      <Card className={cn(isSessionActive ? "border-emerald-500/30" : "border-border")}>
        <CardContent className="p-5 sm:p-6">
          {status.session ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Hôm nay • {today}</div>
                  <div className="mt-1 flex items-center gap-3">
                    {isSessionActive ? (
                      <>
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                          <span className="text-sm font-semibold">Đang mở</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-5 w-5 text-muted-foreground" />
                          <span
                            className={cn(
                              "text-xl font-semibold tabular-nums",
                              countdown < 60 ? "text-destructive" : "text-foreground",
                            )}
                          >
                            {fmtTimer(countdown)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
                        <span className="text-sm font-semibold">Đã kết thúc</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {currentStatus && statusInfo ? (
                <div className={cn("flex items-start gap-4 rounded-xl p-4", statusInfo.bg)}>
                  <statusInfo.icon className={cn("mt-0.5 h-8 w-8", statusInfo.color)} />
                  <div>
                    <div className={cn("font-semibold", statusInfo.color)}>{statusInfo.label}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{statusInfo.desc}</div>
                    {status.checkIn?.checkInAt ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Thời gian: {formatTime(status.checkIn.checkInAt)}
                      </div>
                    ) : null}
                    {status.checkIn?.note ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Ghi chú: {status.checkIn.note}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {status.canCheckIn ? (
                    <Button
                      onClick={handleCheckIn}
                      disabled={checkInMutation.isPending}
                      size="lg"
                      className="h-14 w-full bg-emerald-600 text-base text-white hover:bg-emerald-700"
                    >
                      <CheckCircle className="h-5 w-5" />{" "}
                      {checkInMutation.isPending ? "Đang điểm danh..." : "Điểm danh ngay"}
                    </Button>
                  ) : isSessionActive && !currentStatus ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/40 py-8 text-center">
                      <Play className="mx-auto h-8 w-8 text-emerald-500" />
                      <p className="mt-2 text-sm font-medium text-muted-foreground">
                        Phiên điểm danh đang mở — hãy điểm danh ngay!
                      </p>
                    </div>
                  ) : null}

                  {status.canRequestLeave && !currentStatus ? (
                    <Button variant="outline" onClick={() => setLeaveOpen(true)} className="w-full">
                      <FileText className="h-4 w-4" /> Xin nghỉ có phép
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 py-10 text-center">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                Chưa có phiên điểm danh nào đang mở
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground">Lịch sử điểm danh</h3>
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            >
              <option value={1}>1 tháng</option>
              <option value={3}>3 tháng</option>
              <option value={6}>6 tháng</option>
            </select>
          </div>
          <div className="border-t border-border px-5 pb-5 pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatBox
                value={history.stats.present || 0}
                label="Có mặt"
                className="bg-emerald-500/10"
                valueClassName="text-emerald-700 dark:text-emerald-400"
              />
              <StatBox
                value={history.stats.late || 0}
                label="Trễ"
                className="bg-amber-500/10"
                valueClassName="text-amber-700 dark:text-amber-400"
              />
              <StatBox
                value={history.stats.absent || 0}
                label="Vắng"
                className="bg-red-500/10"
                valueClassName="text-red-700 dark:text-red-400"
              />
              <StatBox
                value={history.stats.excused || 0}
                label="Có phép"
                className="bg-sky-500/10"
                valueClassName="text-sky-700 dark:text-sky-400"
              />
              <StatBox
                value={`${history.stats.rate || 0}%`}
                label="Tỷ lệ"
                className="bg-primary/10"
                valueClassName="text-primary"
              />
            </div>
            <div className="mt-4">
              <AttendanceHeatmap days={history.days} cellSize={14} />
              <div className="mt-3">
                <AttendanceLegend />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xin nghỉ có phép</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Ngày nghỉ</label>
              <Input type="text" value={today} disabled />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Lý do nghỉ</label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Nhập lý do nghỉ..."
                className="min-h-[100px] w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleRequestLeave} disabled={leaveMutation.isPending}>
              {leaveMutation.isPending ? "Đang gửi..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
