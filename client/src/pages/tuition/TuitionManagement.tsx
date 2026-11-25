import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
  UserX,
  StickyNote,
} from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { isStaff } from "../../lib/roles";
import { StudentName } from "../../components/ui/StudentName";
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

interface TuitionRow {
  studentId: string;
  studentName: string;
  nickname?: string | null;
  months: Array<{ status: string; amount: number | null; note?: string | null }>;
}

interface TuitionStats {
  year: number;
  totalPaid: number;
  totalPartial: number;
  countPaid: number;
  countPartial: number;
  countUnpaid: number;
}

const STATUS_COLOR: Record<string, string> = {
  paid: "bg-emerald-500 text-white",
  partial: "bg-amber-500 text-white",
  unpaid: "bg-red-500/15 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Đã đóng",
  partial: "Một phần",
  unpaid: "Chưa đóng",
};

const MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

function formatMoney(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

export default function TuitionManagement() {
  const { user } = useAuthContext();
  const canManageTuition = isStaff(user?.role);
  const toast = useToast();
  const qc = useQueryClient();

  const [year, setYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [editDialog, setEditDialog] = useState<{
    studentId: string;
    studentName: string;
    nickname?: string | null;
    month: number;
    currentStatus: string;
    currentAmount: number | null;
    currentNote: string | null;
  } | null>(null);
  const [formStatus, setFormStatus] = useState("unpaid");
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [activeTab, setActiveTab] = useState<"sheet" | "stats">("sheet");
  const [removeStudent, setRemoveStudent] = useState<{
    id: string;
    name: string;
    nickname?: string | null;
  } | null>(null);
  const [showExclusions, setShowExclusions] = useState(false);

  const { data: sheet, isLoading } = useQuery({
    queryKey: ["tuition-sheet", year],
    queryFn: () => api.get(`/tuition/sheet?year=${year}`).then((r: any) => r.data),
  });

  const { data: stats } = useQuery<TuitionStats>({
    queryKey: ["tuition-stats", year],
    queryFn: () => api.get(`/tuition/stats?year=${year}`).then((r: any) => r.data),
    enabled: canManageTuition,
  });

  const updateMutation = useMutation({
    mutationFn: (body: {
      userId: string;
      period: string;
      status: string;
      amount: number | null;
      note: string;
    }) => api.put("/tuition/update", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tuition-sheet"] });
      qc.invalidateQueries({ queryKey: ["tuition-stats"] });
      toast.success({ title: "Đã cập nhật học phí" });
      setEditDialog(null);
    },
    onError: () => toast.error({ title: "Lỗi khi cập nhật" }),
  });

  const handleCellClick = (
    studentId: string,
    studentName: string,
    nickname: string | null | undefined,
    month: number,
    status: string,
    amount: number | null,
    note: string | null,
  ) => {
    if (!canManageTuition) return;
    setEditDialog({ studentId, studentName, nickname, month, currentStatus: status, currentAmount: amount, currentNote: note });
    setFormStatus(status);
    setFormAmount(amount?.toString() || "");
    // Nạp lại ghi chú cũ — trước đây luôn reset về "" nên mở ô rồi Lưu là mất ghi chú.
    setFormNote(note || "");
  };

  const handleSave = () => {
    if (!editDialog) return;
    const period = `${year}-${(editDialog.month + 1).toString().padStart(2, "0")}`;
    const amount = formAmount.trim() ? parseInt(formAmount.trim()) : null;
    updateMutation.mutate({
      userId: editDialog.studentId,
      period,
      status: formStatus,
      amount,
      note: formNote.trim(),
    });
  };

  const rows = sheet?.rows || [];
  const filteredRows = searchTerm
    ? rows.filter((r: TuitionRow) =>
        `${r.studentName} ${r.nickname || ""}`.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : rows;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Quản lý Học phí"
        description={
          canManageTuition ? "Theo dõi và cập nhật học phí từng tháng" : "Quản lý học phí"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setYear(year - 1)}
                aria-label="Năm trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="inline-flex h-8 min-w-[72px] items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium">
                {year}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setYear(year + 1)}
                disabled={year >= new Date().getFullYear() + 1}
                aria-label="Năm sau"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {canManageTuition ? (
              <Button variant="outline" size="sm" onClick={() => setShowExclusions((v) => !v)}>
                {showExclusions ? "Ẩn danh sách loại" : "Danh sách đã loại"}
              </Button>
            ) : null}
          </div>
        }
      />

      {showExclusions ? <RosterExclusionsPanel /> : null}

      <div className="flex w-fit gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
        <button
          onClick={() => setActiveTab("sheet")}
          className={cn(
            "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
            activeTab === "sheet"
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Bảng học phí
        </button>
        {canManageTuition ? (
          <button
            onClick={() => setActiveTab("stats")}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              activeTab === "stats"
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Thống kê
          </button>
        ) : null}
      </div>

      {activeTab === "sheet" ? (
        <div className="space-y-4">
          {canManageTuition ? (
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Tìm học sinh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          ) : null}

          {isLoading ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="skeleton-shimmer h-64 bg-muted" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-12 text-center">
              <DollarSign className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">Chưa có dữ liệu học phí</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Giáo viên hãy nhấp vào các ô để nhập thông tin học phí
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 top-0 z-30 min-w-[180px] bg-card px-4 py-3 font-semibold text-foreground">
                        Học sinh
                      </th>
                      {MONTHS.map((m, i) => (
                        <th
                          key={i}
                          className="sticky top-0 z-20 min-w-[70px] bg-card px-3 py-3 text-center font-semibold text-foreground"
                        >
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRows.map((row: TuitionRow) => (
                      <tr key={row.studentId} className="hover:bg-muted/40">
                        <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {row.studentName.charAt(0)}
                            </div>
                            <StudentName
                              fullName={row.studentName}
                              nickname={row.nickname}
                              className="min-w-0 flex-1"
                              primaryClassName="text-sm font-medium"
                            />
                            {canManageTuition ? (
                              <button
                                title="Loại khỏi danh sách"
                                onClick={() =>
                                  setRemoveStudent({
                                    id: row.studentId,
                                    name: row.studentName,
                                    nickname: row.nickname,
                                  })
                                }
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                        {row.months.map((cell, i) => (
                          <td key={i} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() =>
                                handleCellClick(
                                  row.studentId,
                                  row.studentName,
                                  row.nickname,
                                  i,
                                  cell.status,
                                  cell.amount,
                                  cell.note ?? null,
                                )
                              }
                              disabled={!canManageTuition}
                              className={cn(
                                "relative mx-auto h-8 w-full max-w-[60px] rounded text-xs font-semibold transition hover:opacity-80 disabled:cursor-default",
                                STATUS_COLOR[cell.status] || "bg-muted text-muted-foreground",
                              )}
                              title={[
                                cell.amount
                                  ? `${STATUS_LABEL[cell.status]}: ${formatMoney(cell.amount)}`
                                  : STATUS_LABEL[cell.status],
                                cell.note ? `Ghi chú: ${cell.note}` : null,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            >
                              {cell.amount ? formatMoney(cell.amount) : "—"}
                              {cell.note ? (
                                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white shadow-sm">
                                  <StickyNote className="h-2.5 w-2.5" />
                                </span>
                              ) : null}
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
              <span className="h-3 w-3 rounded bg-emerald-500" /> Đã đóng
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-500" /> Một phần
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-500" /> Chưa đóng
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-flex h-3 w-3 items-center justify-center rounded bg-muted">
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sky-500" />
              </span>
              Ô có ghi chú (rê chuột để xem nội dung)
            </span>
          </div>
        </div>
      ) : null}

      {activeTab === "stats" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Tổng thu</p>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatMoney(stats?.totalPaid || 0)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Đã đóng đầy đủ</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Đóng một phần</p>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatMoney(stats?.totalPartial || 0)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{stats?.countPartial || 0} khoản</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Đã hoàn thành</p>
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {stats?.countPaid || 0}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Khoản đã đóng</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Chưa đóng</p>
                <Calendar className="h-4 w-4 text-red-500" />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {stats?.countUnpaid || 0}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Khoản còn nợ</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Dialog open={Boolean(editDialog)} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cập nhật học phí</DialogTitle>
          </DialogHeader>
          {editDialog ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Học sinh</label>
                <StudentName
                  fullName={editDialog.studentName}
                  nickname={editDialog.nickname}
                  primaryClassName="text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tháng</label>
                <p className="text-sm text-foreground">
                  {MONTHS[editDialog.month]} / {year}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Trạng thái</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
                >
                  <option value="unpaid">Chưa đóng</option>
                  <option value="partial">Đóng một phần</option>
                  <option value="paid">Đã đóng</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Số tiền (VND)
                </label>
                <Input
                  type="number"
                  placeholder="VD: 500000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Ghi chú</label>
                <Input
                  type="text"
                  placeholder="Ghi chú (tùy chọn)"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                />
                {editDialog.currentNote ? (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1.5 text-xs text-sky-700 dark:text-sky-300">
                    <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>Ghi chú đã lưu: {editDialog.currentNote}</span>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {removeStudent ? (
        <RosterRemovalDialog
          open
          studentId={removeStudent.id}
          studentName={removeStudent.name}
          studentNickname={removeStudent.nickname}
          onClose={() => setRemoveStudent(null)}
        />
      ) : null}
    </div>
  );
}
