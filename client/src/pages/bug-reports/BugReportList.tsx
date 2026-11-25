import { useState } from"react";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { useNavigate } from"react-router-dom";
import { useAuthContext } from"../../contexts/AuthContext";
import api from"../../lib/api";
import { isStaff } from"../../lib/roles";
import {
 Bug,
 Plus,
 AlertCircle,
 Clock,
 CheckCircle2,
 XCircle,
 User,
 Loader2,
 ChevronRight,
 Inbox,
} from"lucide-react";
import { ErrorState, EmptyState } from"../../components/ui/StateViews";
import { Button } from"../../components/ui/button";
import { StudentName } from"../../components/ui/StudentName";

interface BugReport {
 id: string;
 title: string;
 description: string;
 images: string[];
 status: string;
 priority: string;
 reportedById: string;
 assignedToId: string | null;
 courseId: string | null;
 resolution: string | null;
 resolvedAt: string | null;
 createdAt: string;
 updatedAt: string;
 reportedBy: { id: string; fullName: string; nickname?: string | null; email: string; role?: string };
 assignedTo: { id: string; fullName: string; email: string } | null;
 course: { id: string; title: string } | null;
}

const statusConfig: Record<string, { label: string; icon: typeof Bug; color: string }> = {
 open: { label: "Đang mở", icon: AlertCircle, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
 in_progress: { label: "Đang xử lý", icon: Clock, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
 resolved: { label: "Đã xử lý", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
 closed: { label: "Đã đóng", icon: XCircle, color: "bg-muted text-muted-foreground" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
 low: { label: "Thấp", color: "bg-muted text-muted-foreground" },
 medium: { label: "Trung bình", color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
 high: { label: "Cao", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
 critical: { label: "Nghiêm trọng", color: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

export default function BugReportList() {
 const { user } = useAuthContext();
 const navigate = useNavigate();
 const [statusFilter, setStatusFilter] = useState<string>("");

 const isTeacherOrAdmin = isStaff(user?.role);

 const { data: reports, isLoading, isError, refetch } = useQuery<BugReport[]>({
 queryKey: ["bug-reports", statusFilter],
 queryFn: async () => {
 const params = statusFilter ? `?status=${statusFilter}` :"";
 const res = await api.get(`/bug-reports${params}`);
 return res.data;
 },
 });

 if (isLoading) {
 return (
 <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
 <div className="h-24 animate-pulse rounded-xl" />
 <div className="h-24 animate-pulse rounded-xl" />
 </div>
 );
 }

 if (isError) {
 return (
 <div className="max-w-5xl mx-auto px-4 py-8">
 <ErrorState title="Không tải được danh sách báo cáo lỗi" onRetry={() => refetch()} />
 </div>
 );
 }

 return (
 <div className="max-w-5xl mx-auto px-4 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-6">
 <div>
 <h1 className="text-2xl font-bold dark:text-foreground">Báo cáo lỗi</h1>
 <p className="text-sm mt-1">
 {isTeacherOrAdmin
 ?"Quản lý các báo cáo lỗi từ học viên"
 :"Gửi báo cáo lỗi để giúp chúng tôi cải thiện hệ thống"}
 </p>
 </div>
 <Button onClick={() => navigate("/bug-reports/new")}><Plus className="w-4 h-4" /> 
 Báo cáo lỗi mới
 </Button>
 </div>

 {/* Status filter (teachers only) */}
 {isTeacherOrAdmin && (
 <div className="flex items-center gap-2 mb-4">
 <span className="text-sm">Lọc:</span>
 {[
 { value:"", label:"Tất cả" },
 { value:"open", label:"Đang mở" },
 { value:"in_progress", label:"Đang xử lý" },
 { value:"resolved", label:"Đã xử lý" },
 { value:"closed", label:"Đã đóng" },
 ].map((opt) => (
 <button
 key={opt.value}
 onClick={() => setStatusFilter(opt.value)}
 className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${ statusFilter === opt.value ?"bg-primary/10 text-primary" :"" }`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 )}

 {/* Reports list */}
 {isLoading ? (
 <div className="flex items-center justify-center py-20">
 <Loader2 className="w-6 h-6 animate-spin" />
 </div>
 ) : reports && reports.length > 0 ? (
 <div className="space-y-3">
 {reports.map((report) => {
 const StatusIcon = statusConfig[report.status]?.icon || Bug;
 return (
 <div
 key={report.id}
 onClick={() => navigate(`/bug-reports/${report.id}`)}
 className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <h3 className="font-semibold dark:text-foreground text-sm truncate">
 {report.title}
 </h3>
 <span
 className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
 statusConfig[report.status]?.color
 }`}
 >
 <StatusIcon className="w-3 h-3" />
 {statusConfig[report.status]?.label}
 </span>
 {isTeacherOrAdmin && (
 <span
 className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
 priorityConfig[report.priority]?.color
 }`}
 >
 {priorityConfig[report.priority]?.label}
 </span>
 )}
 </div>
 <p className="text-sm line-clamp-2">{report.description}</p>
 <div className="flex items-center gap-3 mt-2 text-xs">
 <span className="flex items-center gap-1">
 <User className="w-3 h-3" />
 <StudentName fullName={report.reportedBy?.fullName ||"Học sinh"} nickname={report.reportedBy?.nickname} primaryClassName="text-xs" />
 </span>
 <span>{new Date(report.createdAt).toLocaleDateString("vi-VN")}</span>
 {report.course && (
 <span className="text-primary">Khóa: {report.course.title}</span>
 )}
 {report.assignedTo && (
 <span className="">
 Người xử lý: {report.assignedTo.fullName}
 </span>
 )}
 </div>
 </div>
 <ChevronRight className="w-4 h-4 shrink-0 mt-1" />
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <EmptyState
 icon={<Inbox className="h-5 w-5" />}
 title={isTeacherOrAdmin ?"Không có báo cáo lỗi nào" :"Bạn chưa gửi báo cáo lỗi nào"}
 />
 )}
 </div>
 );
}
