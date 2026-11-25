import { useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { useNavigate } from"react-router-dom";
import { useAuthContext } from"../../contexts/AuthContext";
import api from"../../lib/api";
import { isStaff } from"../../lib/roles";
import { Button } from"../../components/ui/button";
import { Input } from"../../components/ui/input";
import { StudentName } from"../../components/ui/StudentName";
import { Star, Map, ChevronRight, ChevronDown, ExternalLink, Search, User, X } from"lucide-react";

function StarDisplay({ stars }: { stars: number }) {
 const full = Math.floor(stars);
 const half = stars - full >= 0.4;
 const empty = 5 - full - (half ? 1 : 0);
 return (
 <span className="inline-flex items-center gap-0.5">
 {Array.from({ length: full }).map((_, i) => <Star key={`f${i}`} className="w-3.5 h-3.5" />)}
 {half && <span className="relative"><Star className="w-3.5 h-3.5" /><span className="absolute inset-0 overflow-hidden w-[50%]"><Star className="w-3.5 h-3.5" /></span></span>}
 {Array.from({ length: empty }).map((_, i) => <Star key={`e${i}`} className="w-3.5 h-3.5" />)}
 </span>
 );
}

export default function ChecklistPage() {
 const navigate = useNavigate();
 const { user } = useAuthContext();
 const isTeacher = isStaff(user?.role);
 const [expanded, setExpanded] = useState<Record<string, boolean>>({});

 // Student search (teacher only)
 const [studentSearch, setStudentSearch] = useState("");
 const [selectedStudent, setSelectedStudent] = useState<{ id: string; fullName: string; nickname?: string | null; email: string } | null>(null);

 // Own checklist (or default view for teacher)
 const { data, isLoading } = useQuery({
 queryKey: ["checklist"],
 queryFn: () => api.get("/checklist").then(r => r.data),
 });

 // Student search results
 const { data: studentResults = [], isLoading: searchingStudents } = useQuery({
 queryKey: ["students-search", studentSearch],
 queryFn: () => api.get("/students").then(r => r.data).then((students) => students.filter((student: { fullName: string; nickname?: string | null; email: string }) => `${student.fullName} ${student.nickname ||""} ${student.email}`.toLowerCase().includes(studentSearch.toLowerCase()))),
 enabled: isTeacher && studentSearch.length > 0,
 });

 // Selected student's checklist (always fetch fresh)
 const { data: studentChecklist, isLoading: loadingStudentChecklist, isFetching: fetchingStudentChecklist } = useQuery({
 queryKey: ["student-checklist", selectedStudent?.id],
 queryFn: () => api.get(`/teacher/students/${selectedStudent?.id}/checklist`).then(r => r.data),
 enabled: isTeacher && !!selectedStudent,
 staleTime: 0,
 refetchOnMount: true,
 refetchOnWindowFocus: true,
 });

 if (isLoading) return <div className="text-center py-12">Loading...</div>;

 // Use student's checklist if teacher selected a student
 const displayData = isTeacher && selectedStudent && studentChecklist ? studentChecklist : data;
 const overallTotal = displayData?.groups?.reduce((sum: number, g: any) =>
 sum + g.items.reduce((s: number, i: any) => s + i.linkedTotal, 0), 0) || 0;
 const overallPassed = displayData?.groups?.reduce((sum: number, g: any) =>
 sum + g.items.reduce((s: number, i: any) => s + i.linkedPassed, 0), 0) || 0;
 const overallPct = overallTotal > 0 ? Math.round((overallPassed / overallTotal) * 100) : 0;

 return (
 <div className="max-w-2xl mx-auto space-y-0">
 <div className="flex items-center gap-3 px-1 mb-5">
 <Map className="w-5 h-5 text-primary" />
 <h1 className="text-xl font-bold dark:text-foreground">Lộ Trình Kiến Thức</h1>
 </div>

 {/* Teacher: Student search + selected student info */}
 {isTeacher && (
 <div className="mb-5 space-y-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
 <Input
 type="text"
 value={studentSearch}
 onChange={(e) => setStudentSearch(e.target.value)}
 placeholder="Tìm học sinh để xem lộ trình..."
 className="pl-10"
 />
 </div>

 {/* Dropdown results */}
 {studentSearch && studentResults.length > 0 && (
 <div className="border border-border rounded-xl shadow-lg overflow-hidden divide-y divide-border dark:divide-border">
 {studentResults.slice(0, 10).map((s: any) => (
 <Button
 variant="ghost"
 key={s.id}
 onClick={() => { setSelectedStudent({ id: s.id, fullName: s.fullName, nickname: s.nickname, email: s.email }); setStudentSearch(""); }}
 className="w-full flex items-center gap-3 px-4 py-3 text-left"
 >
 <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
 {s.fullName?.charAt(0) ||"?"}
 </div>
 <div className="min-w-0">
 <StudentName fullName={s.fullName} nickname={s.nickname} primaryClassName="text-sm font-medium dark:text-foreground" />
 <p className="text-xs truncate">{s.email}</p>
 </div>
 </Button>
 ))}
 </div>
 )}

 {/* Selected student info bar */}
 {selectedStudent && studentChecklist && (
 <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
 {selectedStudent.fullName?.charAt(0) ||"?"}
 </div>
 <div>
 <StudentName fullName={selectedStudent.fullName} nickname={selectedStudent.nickname} primaryClassName="text-sm font-semibold text-primary" secondaryClassName="text-primary" />
 <p className="text-xs text-primary">
 {studentChecklist.student?.email || selectedStudent.email} · {""}
 <strong>{overallPassed}/{overallTotal}</strong> bài ({overallPct}%)
 </p>
 </div>
 </div>
 <Button
 variant="ghost"
 size="icon-sm"
 onClick={() => setSelectedStudent(null)}
 className="text-primary hover:text-primary hover:bg-primary/10"
 >
 <X className="w-4 h-4" />
 </Button>
 </div>
 )}

 {/* Loading student checklist */}
 {selectedStudent && loadingStudentChecklist && (
 <div className="py-4 text-center text-sm">Đang tải lộ trình của học sinh...</div>
 )}
 {selectedStudent && fetchingStudentChecklist && !loadingStudentChecklist && (
 <div className="py-1 text-center text-xs text-primary">Đang cập nhật dữ liệu mới...</div>
 )}
 </div>
 )}

 {/* If teacher hasn't selected a student, show hint */}
 {isTeacher && !selectedStudent && (
 <div className="mb-5 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm">
 🔍 Gõ tên học sinh vào ô tìm kiếm phía trên để xem tiến độ lộ trình của học sinh đó.
 </div>
 )}

 {displayData?.groups?.map((group: any, gi: number) => (
 <div key={group.title}>
 {/* Thin section divider */}
 <div className="flex items-center gap-3 py-3">
 <span className="text-sm font-medium tracking-wide">{group.title}</span>
 <span className="flex-1 border-t" />
 </div>

 {group.items.map((item: any) => {
 const isExpanded = expanded[item.id] || false;
 const hasProblems = item.problems?.length > 0;
 const total = item.linkedTotal || 0;
 const passed = item.linkedPassed || 0;
 const pct = hasProblems && total > 0 ? Math.round((passed / total) * 100) : 0;
 const isComplete = hasProblems && total > 0 && passed >= total;
 const stars = (() => { if (total === 0) return 0; const r = Math.round((passed / total) * 10) / 2; return Math.min(5, r); })();

 return (
 <div key={item.id}>
 <Button
 variant="ghost"
 onClick={() => hasProblems && setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
 className={`w-full flex items-center gap-3 py-2.5 px-2 -mx-2 text-left ${hasProblems ?"cursor-pointer" :"cursor-default opacity-50"}`}
 >
 <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
 isComplete ?"" : pct > 0 ?"" :""
 }`}>{isComplete ?"✓" : pct > 0 ?"◐" :"○"}</span>
 <span className="text-sm flex-1">{item.label}</span>
 <StarDisplay stars={stars} />
 <span className={`text-xs font-medium w-10 text-right ${isComplete ?"" : pct > 0 ?"" :""}`}>
 {hasProblems ? `${passed}/${total}` :""}
 </span>
 {hasProblems && (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
 </Button>

 {isExpanded && hasProblems && (
 <div className="ml-8 border-l-2 pl-4 py-1 space-y-0.5">
 {item.problems.map((p: any, i: number) => (
 <Button variant="ghost" key={p.id} onClick={(e) => { e.stopPropagation(); navigate(`/problems/${p.id}`); }}
 className={`w-full flex items-center gap-2.5 py-1.5 px-2 text-left group ${p.passed ?"bg-emerald-500/10" :""}`}>
 <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] shrink-0 ${p.passed ?"border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950" :"border-border text-muted-foreground group-hover:border-primary/30"}`}>
 {p.passed ?"✓" : i + 1}
 </span>
 <span className={`text-sm flex-1 ${p.passed ?"font-medium text-foreground" :"text-muted-foreground"}`}>{p.title}</span>
 <span className={`text-[10px] ${p.difficulty ==="easy" ?"text-emerald-600 dark:text-emerald-400" : p.difficulty ==="medium" ?"text-amber-600 dark:text-amber-400" :"text-rose-600 dark:text-rose-400"}`}>
 {p.difficulty ==="easy" ?"Dễ" : p.difficulty ==="medium" ?"TB" :"Khó"}
 </span>
 <ExternalLink className="w-3 h-3 group-hover:text-primary" />
 </Button>
 ))}
 </div>
 )}
 </div>
 );
 })}
 </div>
 ))}
 </div>
 );
}
