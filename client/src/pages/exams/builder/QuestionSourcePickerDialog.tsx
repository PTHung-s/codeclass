import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import api from "../../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import type { BuilderQuestionInput } from "./types";

export function QuestionSourcePickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (q: BuilderQuestionInput) => void;
}) {
  const [sourceTab, setSourceTab] = useState<"problems" | "quizBank" | "lessonQuiz">("problems");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery<{
    problems: any[];
    quizBankItems: any[];
    lessonQuestions: any[];
  }>({
    queryKey: ["exam-question-sources", q],
    queryFn: () =>
      api.get("/exams/question-sources", { params: { q: q.trim() || undefined, limit: 30 } }).then((r) => r.data),
    enabled: open,
  });

  const parseJsonArray = (raw: string): string[] => {
    try {
      const p = JSON.parse(raw || "[]");
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  };

  const pickProblem = (p: any) => {
    let sampleIn = p.sampleInput || "1 2\n";
    let sampleOut = p.sampleOutput || "3\n";
    try {
      const tcs = JSON.parse(p.testCases || "[]");
      if (Array.isArray(tcs) && tcs[0]) {
        sampleIn = String(tcs[0].input ?? sampleIn);
        sampleOut = String(tcs[0].expectedOutput ?? tcs[0].output ?? sampleOut);
      }
    } catch {
      /* ignore */
    }
    onPick({
      loai: "thuc_hanh",
      diem: 3,
      do_kho: p.difficulty === "hard" ? 4 : p.difficulty === "easy" ? 2 : 3,
      stem: `**${p.title}**\n\n${p.statement || ""}`.trim(),
      ngon_ngu: "python",
      code_dap_an: p.teacherSolution?.trim() ? p.teacherSolution : "# Cần bổ sung lời giải mẫu\n",
      sample_input: sampleIn,
      sample_output: sampleOut,
      ky_nang: p.skillId ? [p.skillId] : [],
    });
  };

  const pickMcq = (
    stem: string,
    optionsRaw: string,
    answerIndex: number,
    explanation?: string,
    difficulty?: number,
    skillId?: string | null,
  ) => {
    const opts = parseJsonArray(optionsRaw);
    if (opts.length < 2) return;
    onPick({
      loai: "trac_nghiem",
      diem: 1,
      do_kho: Math.max(1, Math.min(5, Math.round(difficulty || 2))),
      stem,
      lua_chon: opts.slice(0, 6),
      dap_an_index: Math.max(0, Math.min(opts.length - 1, answerIndex || 0)),
      giai_thich: explanation || undefined,
      ky_nang: skillId ? [skillId] : [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nhặt câu hỏi từ Thư viện &amp; Quiz Bank</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-8 rounded-lg border bg-muted/50 p-0.5">
              {(
                [
                  ["problems", "Bài code"],
                  ["quizBank", "Quiz Bank"],
                  ["lessonQuiz", "Quiz bài học"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSourceTab(k)}
                  className={`rounded-md px-2.5 text-xs font-medium transition-colors ${
                    sourceTab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhanh câu hỏi..." className="h-8 pl-8 text-xs" />
            </div>
          </div>

          <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-lg border p-2">
            {isLoading ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Đang tải nguồn câu hỏi...</p>
            ) : sourceTab === "problems" ? (
              !(data?.problems?.length) ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Không tìm thấy bài code phù hợp.</p>
              ) : (
                data.problems.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProblem(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs hover:bg-muted/50"
                  >
                    <span className="truncate font-medium">{p.title}</span>
                    <Plus className="size-3.5 shrink-0 text-primary" />
                  </button>
                ))
              )
            ) : sourceTab === "quizBank" ? (
              !(data?.quizBankItems?.length) ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Chưa có câu hỏi đã duyệt trong Quiz Bank.</p>
              ) : (
                data.quizBankItems.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pickMcq(b.stem, b.options, b.answerIndex, b.explanation, b.difficulty, b.testsSkill)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs hover:bg-muted/50"
                  >
                    <span className="line-clamp-2 flex-1 font-medium">{b.stem}</span>
                    <Plus className="size-3.5 shrink-0 text-primary" />
                  </button>
                ))
              )
            ) : !(data?.lessonQuestions?.length) ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Không có câu hỏi quiz bài học phù hợp.</p>
            ) : (
              data.lessonQuestions.map((lq) => (
                <button
                  key={lq.id}
                  type="button"
                  onClick={() => pickMcq(lq.question, lq.options, lq.correctIndex, lq.explanation, lq.difficulty, lq.skillId)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{lq.question}</p>
                    {lq.quiz?.title && <p className="text-[10px] text-muted-foreground">{lq.quiz.title}</p>}
                  </div>
                  <Plus className="size-3.5 shrink-0 text-primary" />
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
