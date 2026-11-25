import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { X, Star, ChevronRight, ChevronDown, ExternalLink, Map, User } from "lucide-react";
import { StudentName } from "./StudentName";

interface StudentChecklistModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  studentNickname?: string | null;
  studentEmail: string;
}

function StarDisplay({ stars }: { stars: number }) {
  const full = Math.floor(stars);
  const half = stars - full >= 0.4;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      ))}
      {half && (
        <span className="relative">
          <Star className="w-3.5 h-3.5 text-gray-200 fill-gray-200" />
          <span className="absolute inset-0 overflow-hidden w-[50%]">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          </span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className="w-3.5 h-3.5 text-gray-200 fill-gray-200" />
      ))}
    </span>
  );
}

export default function StudentChecklistModal({ open, onClose, studentId, studentName, studentNickname, studentEmail }: StudentChecklistModalProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["student-checklist", studentId],
    queryFn: () => api.get(`/teacher/students/${studentId}/checklist`).then((r) => r.data),
    enabled: open,
  });

  if (!open) return null;

  const overallTotal = data?.groups?.reduce((sum: number, g: any) =>
    sum + g.items.reduce((s: number, i: any) => s + i.linkedTotal, 0), 0) || 0;
  const overallPassed = data?.groups?.reduce((sum: number, g: any) =>
    sum + g.items.reduce((s: number, i: any) => s + i.linkedPassed, 0), 0) || 0;
  const overallPct = overallTotal > 0 ? Math.round((overallPassed / overallTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Map className="w-5 h-5 text-brand-600" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Lộ trình của học sinh</h2>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <User className="w-4 h-4" />
                <StudentName fullName={studentName} nickname={studentNickname} primaryClassName="text-sm font-semibold" />
              </div>
              <span className="text-gray-400 text-xs dark:text-gray-500">{studentEmail}</span>
              <span className="inline-flex items-center gap-1 text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full text-xs font-semibold">
                {overallPassed}/{overallTotal} bài ({overallPct}%)
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg dark:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Đang tải...</div>
          ) : data?.groups?.map((group: any) => (
            <div key={group.title}>
              <div className="flex items-center gap-3 py-3">
                <span className="text-sm text-gray-400 font-medium tracking-wide dark:text-gray-500">{group.title}</span>
                <span className="flex-1 border-t border-gray-200 dark:border-gray-700" />
              </div>

              {group.items.map((item: any) => {
                const isExpanded = expanded[item.id] || false;
                const hasProblems = item.problems?.length > 0;
                const total = item.linkedTotal || 0;
                const passed = item.linkedPassed || 0;
                const pct = hasProblems && total > 0 ? Math.round((passed / total) * 100) : 0;
                const isComplete = hasProblems && total > 0 && passed >= total;
                const stars = total === 0 ? 0 : Math.min(5, Math.round((passed / total) * 10) / 2);

                return (
                  <div key={item.id}>
                    <button
                      onClick={() => hasProblems && setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className={`w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors text-left ${hasProblems ? "hover:bg-gray-50 cursor-pointer" : "cursor-default opacity-50"}`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                        isComplete ? "bg-green-100 text-green-600" : pct > 0 ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        {isComplete ? "✓" : pct > 0 ? "◐" : "○"}
                      </span>
                      <span className="text-sm text-gray-800 flex-1 dark:text-gray-100">{item.label}</span>
                      <StarDisplay stars={stars} />
                      <span className={`text-xs font-medium w-10 text-right ${isComplete ? "text-green-600" : pct > 0 ? "text-amber-600" : "text-gray-400"}`}>
                        {hasProblems ? `${passed}/${total}` : ""}
                      </span>
                      {hasProblems && (isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />)}
                    </button>

                    {isExpanded && hasProblems && (
                      <div className="ml-8 border-l-2 border-gray-100 pl-4 py-1 space-y-0.5 dark:border-gray-700">
                        {item.problems.map((p: any, i: number) => (
                          <div key={p.id}
                            className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-md ${p.passed ? "bg-green-50/50" : ""}`}>
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] shrink-0 ${p.passed ? "bg-green-500 border-green-500 text-white" : "border-gray-300 text-gray-400"}`}>
                              {p.passed ? "✓" : i + 1}
                            </span>
                            <span className={`text-sm flex-1 ${p.passed ? "text-green-700 font-medium" : "text-gray-600"}`}>{p.title}</span>
                            <span className={`text-[10px] ${p.difficulty === "easy" ? "text-green-500" : p.difficulty === "medium" ? "text-amber-500" : "text-red-500"}`}>
                              {p.difficulty === "easy" ? "Dễ" : p.difficulty === "medium" ? "TB" : "Khó"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
