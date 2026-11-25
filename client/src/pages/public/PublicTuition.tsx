import { useQuery } from"@tanstack/react-query";
import api from"../../lib/api";
import { displayStudentName } from"../../lib/studentName";

export default function PublicTuition() {
 const year = new Date().getFullYear();
 const { data, isLoading } = useQuery<any>({ queryKey: ["public-tuition", year], queryFn: () => api.get(`/tuition/public-sheet?year=${year}`).then(r => r.data) });
 return <main className="mx-auto max-w-7xl p-4"><h1 className="mb-1 text-2xl font-bold">Tình trạng học phí</h1><p className="mb-5 text-sm">Bảng xem công khai · {year}</p>{isLoading ? <p>Đang tải…</p> : <div className="max-h-[calc(100vh-180px)] overflow-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b"><th className="sticky left-0 top-0 z-30 bg-muted/40 p-3 text-left">Học sinh</th>{Array.from({length: 12}, (_, i) => <th key={i} className="sticky top-0 z-20 bg-muted/40 p-2">T{i + 1}</th>)}</tr></thead><tbody>{data?.rows.map((s: any) => <tr key={s.studentId} className="border-b"><td title={s.studentName} className="sticky left-0 z-10 bg-card p-3 font-medium">{displayStudentName(s.studentName)}</td>{s.months.map((m: any, i: number) => <td key={i} className={`p-2 text-center font-semibold ${m.status ==="paid" ?"" : m.status ==="partial" ?"" :""}`}>{m.status ==="paid" ?"Đã đóng" : m.status ==="partial" ?"Một phần" :"Chưa đóng"}{m.amount ? <div className="text-xs font-normal">{Number(m.amount).toLocaleString("vi-VN")}đ</div> : null}</td>)}</tr>)}</tbody></table></div>}</main>;
}
