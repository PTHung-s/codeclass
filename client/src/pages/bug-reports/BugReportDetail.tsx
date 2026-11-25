import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Loader2, Trash2, XCircle } from "lucide-react";
import { useAuthContext } from "../../contexts/AuthContext";
import api from "../../lib/api";
import { isStaff as checkIsStaff } from "../../lib/roles";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { StudentName } from "../../components/ui/StudentName";
import { useConfirmContext } from "../../hooks/useConfirm";

interface BugReport {
 id: string;
 title: string;
 description: string;
 images: string[];
 status: string;
 priority: string;
 resolution: string | null;
 createdAt: string;
 reportedById: string;
 reportedBy: { id: string; fullName: string; nickname?: string | null; email: string; role?: string };
 assignedTo: { id: string; fullName: string; email?: string } | null;
 course: { id: string; title: string } | null;
}

const statusConfig: Record<string, { label: string; icon: typeof AlertCircle; color: string }> = {
 open: { label: "Đang mở", icon: AlertCircle, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
 in_progress: { label: "Đang xử lý", icon: Clock, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
 resolved: { label: "Đã xử lý", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
 closed: { label: "Đã đóng", icon: XCircle, color: "bg-muted text-muted-foreground" },
};

const priorityLabels: Record<string, string> = {
 low:"Thấp",
 medium:"Trung bình",
 high:"Cao",
 critical:"Nghiêm trọng",
};

export default function BugReportDetail() {
 const { id } = useParams();
 const { user } = useAuthContext();
 const navigate = useNavigate();
 const qc = useQueryClient();
 const confirm = useConfirmContext();
 const isStaff = checkIsStaff(user?.role);

 const { data, isLoading } = useQuery<BugReport>({
 queryKey: ["bug-report", id],
 queryFn: () => api.get(`/bug-reports/${id}`).then((r) => r.data),
 enabled: !!id,
 });

 const updateMutation = useMutation({
 mutationFn: (payload: Partial<Pick<BugReport,"status" |"priority" |"resolution">>) =>
 api.patch(`/bug-reports/${id}`, payload),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["bug-report", id] });
 qc.invalidateQueries({ queryKey: ["bug-reports"] });
 },
 });

 const deleteMutation = useMutation({
 mutationFn: () => api.delete(`/bug-reports/${id}`),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["bug-reports"] });
 navigate("/bug-reports");
 },
 });

 if (isLoading) {
 return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
 }

 if (!data) {
 return <div className="mx-auto max-w-3xl px-4 py-10 text-sm">Không tìm thấy ticket.</div>;
 }

 const StatusIcon = statusConfig[data.status]?.icon || AlertCircle;
 const canDelete = isStaff || (data.reportedById === user?.id && data.status ==="open");

 return (
 <div className="mx-auto max-w-4xl px-4 py-8">
 <Button variant="ghost" size="sm" onClick={() => navigate("/bug-reports")} className="mb-5">
 <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
 </Button>

 <section className="rounded-xl border border-border bg-card p-6">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="min-w-0">
 <div className="mb-2 flex flex-wrap items-center gap-2">
 <h1 className="text-xl font-bold dark:text-foreground">{data.title}</h1>
 <Badge variant="secondary" className={statusConfig[data.status]?.color}>
 <StatusIcon className="h-3.5 w-3.5" />
 {statusConfig[data.status]?.label}
 </Badge>
 <Badge variant="secondary" className="">
 {priorityLabels[data.priority] || data.priority}
 </Badge>
 </div>
 <div className="flex items-center gap-1 text-xs">
 <StudentName fullName={data.reportedBy?.fullName ||"Học sinh"} nickname={data.reportedBy?.nickname} primaryClassName="text-xs" /> <span>· {new Date(data.createdAt).toLocaleString("vi-VN")}</span>
 {data.course ? ` · ${data.course.title}` :""}
 </div>
 </div>

 {canDelete && (
 <Button variant="destructive" size="sm"
 onClick={async () => {
	     const ok = await confirm({
	       title: "Xóa ticket",
	       message: "Xóa ticket báo lỗi này? Hành động này không thể hoàn tác.",
	       confirmLabel: "Xóa",
	       variant: "danger",
	     });
	     if (ok) deleteMutation.mutate();
	   }}
 disabled={deleteMutation.isPending}
 >
 <Trash2 className="h-4 w-4" />
 Xóa ticket
 </Button>
 )}
 </div>

 {isStaff && (
 <div className="mt-5 grid gap-3 border-y py-4 md:grid-cols-2">
 <label className="space-y-1">
 <span className="text-xs font-semibold uppercase">Trạng thái</span>
 <select
 value={data.status}
 onChange={(event) => updateMutation.mutate({ status: event.target.value })}
 className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
 >
 <option value="open">Đang mở</option>
 <option value="in_progress">Đang xử lý</option>
 <option value="resolved">Đã xử lý</option>
 <option value="closed">Đã đóng</option>
 </select>
 </label>
 <label className="space-y-1">
 <span className="text-xs font-semibold uppercase">Mức độ</span>
 <select
 value={data.priority}
 onChange={(event) => updateMutation.mutate({ priority: event.target.value })}
 className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
 >
 <option value="low">Thấp</option>
 <option value="medium">Trung bình</option>
 <option value="high">Cao</option>
 <option value="critical">Nghiêm trọng</option>
 </select>
 </label>
 </div>
 )}

 <div className="mt-5 whitespace-pre-wrap text-sm leading-6">{data.description}</div>

 {data.images.length > 0 && (
 <div className="mt-6 grid gap-3 sm:grid-cols-2">
 {data.images.map((url) => (
 <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
 <img src={url} alt="Bug screenshot" className="h-64 w-full object-cover" />
 </a>
 ))}
 </div>
 )}
 </section>
 </div>
 );
}
