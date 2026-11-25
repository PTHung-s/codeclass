import { useEffect, useState } from"react";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { useNavigate } from"react-router-dom";
import { useAuthContext } from"../../contexts/AuthContext";
import api from"../../lib/api";
import { socketSubscribe } from"../../lib/socket";
import StudentAvatar from"../../components/ui/StudentAvatar";
import { StudentName } from"../../components/ui/StudentName";
import { Button } from"../../components/ui/button";
import { Input } from"../../components/ui/input";
import { Badge } from"../../components/ui/badge";
import {
 HelpCircle,
 Plus,
 Search,
 Clock,
 CheckCircle2,
 AlertCircle,
 Loader2,
 Eye,
 MessageSquare,
 FilterX,
 UserCheck,
 Inbox,
} from"lucide-react";

interface HelpRequest {
 id: string;
 title: string;
 description: string;
 status: string;
 priority: string;
 tags: string[];
 viewCount: number;
 replyCount: number;
 createdById: string;
 claimedById: string | null;
 problemId: string | null;
 createdAt: string;
 createdBy: { id: string; fullName: string; nickname?: string | null; avatarUrl: string | null; role: string };
 claimedBy: { id: string; fullName: string; avatarUrl: string | null; role?: string } | null;
 problem: { id: string; title: string } | null;
}

const statusConfig: Record<string, { label: string; icon: typeof HelpCircle; color: string }> = {
 open: { label: "Đang mở", icon: AlertCircle, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
 in_progress: { label: "Đang xử lý", icon: Clock, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
 resolved: { label: "Đã giải quyết", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
 closed: { label: "Đã đóng", icon: CheckCircle2, color: "bg-muted text-muted-foreground" },
};

export default function HelpList() {
 const { user } = useAuthContext();
 const navigate = useNavigate();
 const qc = useQueryClient();
 const [search, setSearch] = useState("");
 const [statusFilter, setStatusFilter] = useState("");

 const { data: requests, isLoading } = useQuery<HelpRequest[]>({
 queryKey: ["help-requests", statusFilter, search],
 queryFn: async () => {
 const params = new URLSearchParams();
 if (statusFilter) params.set("status", statusFilter);
 if (search) params.set("search", search);
 const res = await api.get(`/help-requests?${params.toString()}`);
 return res.data;
 },
 });

 useEffect(() => socketSubscribe((message) => {
 if (message.type ==="help_request_changed" || message.type ==="__socket_open") {
 qc.invalidateQueries({ queryKey: ["help-requests"] });
 }
 }), [qc]);

 return (
 <div className="max-w-5xl mx-auto px-4 py-8">
 <div className="flex items-center justify-between mb-6">
 <div>
 <h1 className="text-2xl font-bold dark:text-foreground">Trợ giúp</h1>
 <p className="text-sm mt-1">Học viên giúp đỡ lẫn nhau — đặt câu hỏi hoặc trả lời</p>
 </div>
 <Button variant="default" onClick={() => navigate("/help/new")}>
 <Plus className="w-4 h-4" />
 Tạo yêu cầu mới
 </Button>
 </div>

 {/* Search + Filters */}
 <div className="flex items-center gap-3 mb-4">
 <div className="relative flex-1 max-w-sm">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Tìm kiếm câu hỏi..."
 className="pl-9"
 />
 </div>
 <div className="flex items-center gap-1.5">
 {[
 { value:"", label:"Tất cả" },
 { value:"open", label:"Đang mở" },
 { value:"in_progress", label:"Đang xử lý" },
 { value:"resolved", label:"Đã giải quyết" },
 ].map((opt) => (
 <Button
 key={opt.value}
 variant={statusFilter === opt.value ?"default" :"ghost"}
 size="sm"
 onClick={() => setStatusFilter(opt.value)}
 className="rounded-full"
 >
 {opt.label}
 </Button>
 ))}
 </div>
 </div>

 {/* List */}
 {isLoading ? (
 <div className="flex items-center justify-center py-20">
 <Loader2 className="w-6 h-6 animate-spin" />
 </div>
 ) : requests && requests.length > 0 ? (
 <div className="space-y-3">
 {requests.map((req) => {
 const StatusIcon = statusConfig[req.status]?.icon || HelpCircle;
 return (
 <div
 key={req.id}
 onClick={() => navigate(`/help/${req.id}`)}
 className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <h3 className="font-semibold dark:text-foreground text-sm truncate">{req.title}</h3>
 <Badge variant="secondary" className={`gap-1 ${statusConfig[req.status]?.color}`}>
 <StatusIcon className="w-3 h-3" />
 {statusConfig[req.status]?.label}
 </Badge>
 </div>
 <p className="text-sm line-clamp-2 mb-2">{req.description}</p>
 {/* Tags */}
 {req.tags.length > 0 && (
 <div className="flex flex-wrap gap-1 mb-2">
 {req.tags.map((tag) => (
 <Badge key={tag} variant="secondary" className="rounded text-[10px] font-medium">{tag}</Badge>
 ))}
 </div>
 )}
 <div className="flex items-center gap-4 text-xs">
 <span className="flex items-center gap-1">
 <StudentAvatar studentId={req.createdBy.id} fullName={req.createdBy.fullName} nickname={req.createdBy.nickname} avatarUrl={req.createdBy.avatarUrl} size="sm" showName={false} clickable={req.createdBy.role ==="student"} />
 <StudentName fullName={req.createdBy.fullName} nickname={req.createdBy.nickname} primaryClassName="text-xs" />
 </span>
 <span>{new Date(req.createdAt).toLocaleDateString("vi-VN")}</span>
 <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {req.viewCount}</span>
 <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {req.replyCount}</span>
 {req.claimedBy && (
 <span className="flex items-center gap-1">
 <UserCheck className="w-3 h-3" />
 {req.claimedBy.fullName}
 </span>
 )}
 {req.problem && (
 <span className="text-primary">Bài: {req.problem.title}</span>
 )}
 </div>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-20">
 <Inbox className="w-12 h-12 mb-3" />
 <p className="text-sm">Chưa có yêu cầu trợ giúp nào</p>
 <Button variant="link" onClick={() => navigate("/help/new")} className="mt-3">
 Tạo yêu cầu đầu tiên
 </Button>
 </div>
 )}
 </div>
 );
}
