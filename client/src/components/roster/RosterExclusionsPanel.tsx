import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import api from "../../lib/api";
import { StudentName } from "../ui/StudentName";

export default function RosterExclusionsPanel() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["roster-exclusions"], queryFn: () => api.get("/roster-exclusions").then(r => r.data) });
  const restore = useMutation({ mutationFn: (id: string) => api.delete(`/roster-exclusions/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["roster-exclusions"] }); ["attendance-sheet", "attendance-stats", "attendance-pending", "tuition-sheet", "tuition-stats"].forEach(k => qc.invalidateQueries({ queryKey: [k] })); } });
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10"><h3 className="font-semibold text-gray-900 dark:text-white">Học sinh đã loại ({data.length})</h3>{isLoading ? <p className="mt-2 text-sm text-gray-500">Đang tải…</p> : data.length === 0 ? <p className="mt-2 text-sm text-gray-500">Chưa có học sinh nào.</p> : <div className="mt-2 space-y-2">{data.map((x: any) => <div key={x.studentId} className="flex items-center justify-between rounded-lg bg-white p-2 dark:bg-gray-800"><StudentName fullName={x.student.fullName} nickname={x.student.nickname} className="min-w-0 flex-1" primaryClassName="text-sm" /><button onClick={() => restore.mutate(x.studentId)} className="ml-3 inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50"><RotateCcw className="h-3 w-3" /> Khôi phục</button></div>)}</div>}</div>;
}
