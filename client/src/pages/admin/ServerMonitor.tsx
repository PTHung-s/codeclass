import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Database, Download, Eye, EyeOff, RefreshCw } from"lucide-react";
import { cn } from"../../lib/utils";
import api from"../../lib/api";
import { useAuthContext } from"../../contexts/AuthContext";
import { useToast } from"../../hooks/useToast";
import HonourPreviewPanel from"../../components/honour/HonourPreviewPanel";
import {
 METRICS_HISTORY,
 useOverlayEnabled,
 useServerMetrics,
} from"../../hooks/useServerMetrics";

const POLL_SEC = 3;

function fmtUptime(sec: number): string {
 const h = Math.floor(sec / 3600);
 const m = Math.floor((sec % 3600) / 60);
 const s = sec % 60;
 if (h > 0) return `${h}h ${m}m`;
 if (m > 0) return `${m}m ${s}s`;
 return `${s}s`;
}

function Sparkline({ values, max, color }: { values: number[]; max: number; color: string }) {
 if (values.length < 2) return <div className="mt-2 h-10 rounded bg-muted/40" />;
 const w = 100;
 const h = 40;
 const step = w / (METRICS_HISTORY - 1);
 const safeMax = max > 0 ? max : 1;
 const pts = values
 .map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(v, safeMax) / safeMax) * h).toFixed(1)}`)
 .join("");
 return (
 <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-10 w-full">
 <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
 </svg>
 );
}

function StatCard({ label, value, sub, children, tone ="default" }: {
 label: string;
 value: string;
 sub?: string;
 children?: React.ReactNode;
 tone?:"default" |"good" |"warn" |"bad";
}) {
  const toneCls = {
    default: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
  }[tone];
 return (
 <div className="rounded-xl border border-border bg-card p-4">
 <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
 <div className={cn("mt-1 text-2xl font-extrabold tabular-nums", toneCls)}>{value}</div>
 {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
 {children}
 </div>
 );
}

export default function ServerMonitor() {
 const { metrics, history, error } = useServerMetrics(true, POLL_SEC * 1000);
 const [overlayOn, setOverlayOn] = useOverlayEnabled();

 const header = (
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h1 className="flex items-center gap-2 text-2xl font-extrabold dark:text-foreground">
 <Activity className="h-6 w-6" /> Hiệu năng server
 </h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Cập nhật mỗi {POLL_SEC}s{metrics ? ` · uptime ${fmtUptime(metrics.uptimeSec)}` :""}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={() => setOverlayOn(!overlayOn)}
 className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors",
 overlayOn
 ?"bg-primary/10 dark:bg-blue-950/40 "
 :"bg-card hover:bg-muted/40",
 )}
 title="Khung nhỏ nổi ở góc màn hình, hiện trên mọi trang"
 >
 {overlayOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
 {overlayOn ?"Đang hiện góc màn hình" :"Hiện ở góc màn hình"}
 </button>
 {metrics && (
 <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
 <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> LIVE
 </span>
 )}
 </div>
 </div>
 );

 if (!metrics) {
 return (
 <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
 {header}
 {error ? (
 <div className="rounded-lg border bg-red-500/10 p-4 text-sm dark:bg-red-950/30">
 {error}
 </div>
 ) : (
 <div className="animate-pulse text-sm text-muted-foreground">Đang thu thập số liệu…</div>
 )}
 </div>
 );
 }

 const { cpu, memory, requests, dbErrors, websocket, queue } = metrics;
 const dbTimeout = dbErrors.timeout || 0;

 return (
 <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
 {header}

 {error && (
 <div className="rounded-lg border bg-amber-500/10 px-3 py-2 text-xs dark:bg-amber-950/30">
 Số liệu có thể cũ: {error}
 </div>
 )}

 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
 <StatCard
 label="CPU tiến trình"
 value={`${cpu.processPct}%`}
 sub={`load ${cpu.load1.toFixed(2)} · ${cpu.cores} core`}
 tone={cpu.processPct > 80 ?"bad" : cpu.processPct > 50 ?"warn" :"good"}
 >
 <Sparkline values={history.cpu} max={100} color="#0066cc" />
 </StatCard>
 <StatCard
 label="RAM (rss)"
 value={`${memory.rssMb} MB`}
 sub={`heap ${memory.heapUsedMb} MB`}
 tone={memory.rssMb > 1500 ?"bad" : memory.rssMb > 1000 ?"warn" :"good"}
 >
 <Sparkline values={history.mem} max={1900} color="#10b981" />
 </StatCard>
 <StatCard
 label="Request / giây"
 value={requests.perSec.toFixed(1)}
 sub="trung bình 10s gần nhất"
 tone={requests.perSec > 40 ?"bad" : requests.perSec > 20 ?"warn" :"default"}
 >
 <Sparkline values={history.req} max={40} color="#f59e0b" />
 </StatCard>
 <StatCard label="WebSocket" value={String(websocket.activeConnections)} sub="kết nối đang mở">
 <Sparkline values={history.ws} max={60} color="#06b6d4" />
 </StatCard>
 </div>

 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
 <StatCard
 label="Lỗi DB timeout"
 value={String(dbTimeout)}
 sub="P1008 — SQLite nghẽn ghi"
 tone={dbTimeout > 0 ?"bad" :"good"}
 />
 <StatCard label="Lỗi trùng khoá" value={String(dbErrors.unique || 0)} sub="P2002" />
 <StatCard
 label="Hàng đợi chạy code"
 value={String(queue.waiting)}
 sub="học sinh đang phải chờ"
 tone={queue.waiting > 3 ?"bad" : queue.waiting > 0 ?"warn" :"good"}
 />
 </div>

 <HonourPreviewPanel />

 <div className="rounded-xl border border-border bg-card p-4">
 <h2 className="mb-3 text-sm font-bold dark:text-foreground">Chi tiết bộ nhớ</h2>
 <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
 <div>Heap dùng: <span className="font-semibold dark:text-foreground">{memory.heapUsedMb} MB</span></div>
 <div>Heap cấp: <span className="font-semibold dark:text-foreground">{memory.heapTotalMb} MB</span></div>
 <div>External: <span className="font-semibold dark:text-foreground">{memory.externalMb} MB</span></div>
 <div>Uptime: <span className="font-semibold dark:text-foreground">{fmtUptime(metrics.uptimeSec)}</span></div>
 </div>
 <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
 Đọc từ <code>process.memoryUsage()</code> và <code>os.loadavg()</code> của tiến trình API. Máy production có
 1 vCPU / 2 GB, nên RAM trên 1500 MB hoặc load1 vượt 1.0 là dấu hiệu cần chú ý. Đồ thị giữ khoảng{""}
 {Math.round((METRICS_HISTORY * POLL_SEC) / 60)} phút gần nhất và reset khi tải lại trang.
 </p>
 </div>

 <DatabaseBackupPanel />
 </div>
 );
}

interface BackupListResponse {
 dbSizeBytes: number;
 maxBackups: number;
 backups: Array<{ filename: string; sizeBytes: number; createdAt: string }>;
}

function fmtSize(bytes: number): string {
 if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
 if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
 return `${bytes} B`;
}

function DatabaseBackupPanel() {
 const { user } = useAuthContext();
 const toast = useToast();
 const queryClient = useQueryClient();
 const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
 const isAdmin = user?.role === "admin";

 const { data, isLoading } = useQuery<BackupListResponse>({
 queryKey: ["admin-backups"],
 queryFn: () => api.get("/admin/backups").then((r) => r.data),
 enabled: isAdmin,
 });

 const createBackup = useMutation({
 mutationFn: () => api.post("/admin/backups").then((r) => r.data),
 onSuccess: (res) => {
 queryClient.invalidateQueries({ queryKey: ["admin-backups"] });
 toast.success({ title: "Đã sao lưu dữ liệu", message: `${res.filename} (${fmtSize(res.sizeBytes)})` });
 },
 onError: () => toast.error({ title: "Không tạo được bản sao lưu" }),
 });

 if (!isAdmin) return null;

 const handleDownload = async (filename: string) => {
 setDownloadingFile(filename);
 try {
 const res = await api.get(`/admin/backups/${encodeURIComponent(filename)}/download`, { responseType: "blob" });
 const url = URL.createObjectURL(res.data);
 const a = document.createElement("a");
 a.href = url;
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);
 } catch {
 toast.error({ title: "Không tải được tệp sao lưu" });
 } finally {
 setDownloadingFile(null);
 }
 };

 return (
 <div className="rounded-xl border border-border bg-card p-4 space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
 <Database className="h-4 w-4 text-primary" />
 Sao lưu cơ sở dữ liệu (SQLite)
 </h2>
 <p className="mt-0.5 text-xs text-muted-foreground">
 Tự động snapshot mỗi 24 giờ qua <code>VACUUM INTO</code> và giữ {data?.maxBackups ?? 7} bản gần nhất
 {data ? ` · DB hiện tại ${fmtSize(data.dbSizeBytes)}` : ""}.
 </p>
 </div>
 <button
 type="button"
 disabled={createBackup.isPending}
 onClick={() => createBackup.mutate()}
 className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
 >
 <RefreshCw className={cn("h-3.5 w-3.5", createBackup.isPending && "animate-spin")} />
 {createBackup.isPending ? "Đang sao lưu..." : "Sao lưu ngay"}
 </button>
 </div>

 {isLoading ? (
 <p className="text-xs text-muted-foreground">Đang tải danh sách bản sao lưu...</p>
 ) : !data?.backups.length ? (
 <p className="text-xs text-muted-foreground">Chưa có bản sao lưu nào. Nhấn &quot;Sao lưu ngay&quot; để tạo bản đầu tiên.</p>
 ) : (
 <div className="divide-y divide-border rounded-lg border border-border">
 {data.backups.map((b) => (
 <div key={b.filename} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
 <div className="min-w-0 flex-1">
 <p className="truncate font-mono font-medium text-foreground">{b.filename}</p>
 <p className="text-[11px] text-muted-foreground">
 {new Date(b.createdAt).toLocaleString("vi-VN")} · {fmtSize(b.sizeBytes)}
 </p>
 </div>
 <button
 type="button"
 disabled={downloadingFile === b.filename}
 onClick={() => handleDownload(b.filename)}
 className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
 >
 <Download className="h-3 w-3" />
 {downloadingFile === b.filename ? "Đang tải..." : "Tải về"}
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}
