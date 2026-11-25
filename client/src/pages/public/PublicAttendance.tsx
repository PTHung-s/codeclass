import { useQuery } from"@tanstack/react-query";
import { Check, Clock3, Minus, ShieldCheck, X } from"lucide-react";
import api from"../../lib/api";
import { displayStudentName } from"../../lib/studentName";

const statusMeta: Record<string, { label: string; className: string; Icon: typeof Check }> = {
 present: { label:"Có mặt", className:" ring-1", Icon: Check },
 late: { label:"Đi trễ", className:" ring-1", Icon: Clock3 },
 absent: { label:"Vắng", className:" ring-1", Icon: X },
 excused: { label:"Có phép", className:" ring-1", Icon: ShieldCheck },
};

function StatusCell({ status }: { status: string | null }) {
 const meta = status ? statusMeta[status] : null;
 if (!meta) return <span title="Chưa có dữ liệu" className="inline-flex h-7 w-7 items-center justify-center rounded-full"><Minus className="h-3.5 w-3.5" /></span>;
 const Icon = meta.Icon;
 return <span title={meta.label} aria-label={meta.label} className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${meta.className}`}><Icon className="h-4 w-4 stroke-[2.5]" /></span>;
}

export default function PublicAttendance() {
 const month = new Date().toISOString().slice(0, 7);
 const { data, isLoading } = useQuery<any>({ queryKey: ["public-attendance", month], queryFn: () => api.get(`/attendance/public-sheet?month=${month}`).then(r => r.data) });
 return <main className="mx-auto max-w-7xl p-4 sm:p-6"><h1 className="mb-1 text-2xl font-bold">Điểm danh học sinh</h1><p className="mb-4 text-sm">Bảng xem công khai · {month}</p><div className="mb-4 flex flex-wrap gap-2 text-xs">{Object.values(statusMeta).map(({ label, className, Icon }) => <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${className}`}><Icon className="h-3.5 w-3.5" />{label}</span>)}<span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium"><Minus className="h-3.5 w-3.5" />Chưa có dữ liệu</span></div>{isLoading ? <p>Đang tải…</p> : <div className="max-h-[calc(100vh-230px)] overflow-auto rounded-xl border shadow-sm"><table className="w-full text-sm"><thead><tr className="border-b"><th className="sticky left-0 top-0 z-30 min-w-[170px] bg-muted/40 p-3 text-left font-semibold">Học sinh</th>{data?.dates.map((d: string) => <th key={d} className="sticky top-0 z-20 min-w-[44px] bg-muted/40 p-2 text-center font-semibold">{d.slice(-2)}</th>)}</tr></thead><tbody>{data?.students.map((s: any) => <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40"><td title={s.fullName} className="sticky left-0 z-10 bg-card p-3 font-medium">{displayStudentName(s.fullName)}</td>{s.days.map((d: any) => <td key={d.date} className="p-2 text-center"><StatusCell status={d.status} /></td>)}</tr>)}</tbody></table></div>}</main>;
}
