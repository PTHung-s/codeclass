import type { ReactNode } from "react";
import Editor from "@monaco-editor/react";
import { CheckCircle2, XCircle, CircleDot } from "lucide-react";
import { ARENA_EDITOR_OPTIONS, configureArenaEditor } from "../arena/arenaMonaco";
import ExamMarkdown from "../ui/ExamMarkdown";

export const LOAI_LABEL: Record<string, string> = {
  trac_nghiem: "Trắc nghiệm",
  tra_loi_ngan: "Trả lời ngắn",
  thuc_hanh: "Thực hành",
};

/**
 * Render 1 câu hỏi ĐÚNG như màn hình học sinh làm bài (chỉ-đọc),
 * kèm đánh dấu HS chọn / đáp án đúng cho phía giáo viên.
 * Dùng chung cho ExamMonitor + ExamGrading để đảm bảo trải nghiệm nhất quán.
 */
export default function QuestionPaperView({
  idx,
  q,
  answer,
  correctIndex,
  current,
  children,
}: {
  idx: number;
  q: any;
  answer?: {
    selectedIndex?: number | null;
    textAnswer?: string | null;
    codeAnswer?: string | null;
  } | null;
  correctIndex?: number | null;
  current?: boolean;
  children?: ReactNode;
}) {
  const d = answer || {};
  const sel = typeof d.selectedIndex === "number" ? d.selectedIndex : null;
  const cor = typeof correctIndex === "number" ? correctIndex : null;

  return (
    <div
      className={`rounded-xl border bg-card p-4 shadow-card sm:p-6 ${
        current ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm font-bold text-foreground">Câu {idx + 1}</span>
        <span className="font-mono text-[10px]">{q.ma_cau}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{LOAI_LABEL[q.loai] || q.loai}</span>
        <span>{q.diem} điểm</span>
        <span>độ khó {q.do_kho}</span>
      </div>

      <div className="mt-1">
        <ExamMarkdown content={q.stem} />
      </div>
      {q.mo_ta_de && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <ExamMarkdown content={q.mo_ta_de} compact />
        </div>
      )}
      {q.rang_buoc && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <span className="font-semibold uppercase tracking-wide">Giới hạn: </span>
          {q.rang_buoc}
        </p>
      )}

      {q.loai === "trac_nghiem" && (
        <div className="mt-4 space-y-2">
          {(q.lua_chon || []).map((opt: string, oi: number) => {
            const isSel = sel === oi;
            const isCor = cor === oi;
            let cls = "border-border opacity-70";
            if (isSel && isCor) cls = "border-emerald-500 bg-emerald-500/10";
            else if (isSel) cls = "border-destructive bg-destructive/5";
            else if (isCor) cls = "border-emerald-500/40 border-dashed";
            return (
              <div key={oi} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${cls}`}>
                <span className="mt-0.5">
                  {isSel && isCor && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {isSel && !isCor && <XCircle className="h-4 w-4 text-destructive" />}
                  {!isSel && isCor && <CheckCircle2 className="h-4 w-4 text-emerald-600/50" />}
                  {!isSel && !isCor && <CircleDot className="h-4 w-4 text-muted-foreground/40" />}
                </span>
                <span className="flex-1">{opt}</span>
                {isCor && (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                    Đáp án
                  </span>
                )}
                {isSel && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    HS chọn
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {q.loai === "tra_loi_ngan" && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Bài làm của học sinh
          </p>
          <pre className="min-h-[80px] whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 font-sans text-sm">
            {(d.textAnswer || "").trim() || <span className="text-muted-foreground italic">Không trả lời</span>}
          </pre>
        </div>
      )}

      {q.loai === "thuc_hanh" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs font-medium uppercase">
              {q.ngon_ngu || "python"}
            </span>
            {!((d.codeAnswer || "").trim()) && (
              <span className="text-xs italic text-muted-foreground">Học sinh chưa viết code</span>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <Editor
              height="240px"
              language={q.ngon_ngu === "cpp" ? "cpp" : "python"}
              theme="codeclass-arena"
              value={d.codeAnswer || ""}
              beforeMount={configureArenaEditor}
              options={{
                ...ARENA_EDITOR_OPTIONS,
                fontSize: 14,
                minimap: { enabled: false },
                wordWrap: "on",
                readOnly: true,
                domReadOnly: true,
              }}
            />
          </div>
          {q.testcase_mau?.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.testcase_mau.map((t: any, i: number) => (
                <div key={i} className="overflow-hidden rounded-lg border border-border bg-muted/40">
                  <div className="flex items-center justify-between border-b border-border bg-muted/70 px-3 py-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Ví dụ {i + 1}
                    </span>
                    {t.mo_ta && <span className="text-[11px] text-muted-foreground">{t.mo_ta}</span>}
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div className="px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase text-muted-foreground">Input</div>
                      <pre className="mt-0.5 overflow-x-auto font-mono text-[0.78rem] leading-5">{t.input}</pre>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase text-muted-foreground">Output</div>
                      <pre className="mt-0.5 overflow-x-auto font-mono text-[0.78rem] leading-5">{t.output}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * Gộp snapshot (đề đã xào của học sinh) + đáp án gốc thành danh sách hiển thị:
 * - vị trí lựa chọn của HS và đáp án đúng được quy đổi về vị trí HIỂN THỊ qua _choice_perm
 * - nếu attempt cũ không có snapshot thì dùng đề gốc (identity).
 */
export function buildDisplayPaper(
  snapshot: any[] | null | undefined,
  rawQuestions: any[],
  answersByQid: Map<string, any>,
): {
  key: string;
  q: any;
  answer: { selectedIndex: number | null; textAnswer: string | null; codeAnswer: string | null };
  correctIndex: number | null;
  explanation?: string | null;
  scoreInfo?: { autoScore: number | null; finalScore: number | null; maxScore: number | null } | null;
}[] {
  const rawById = new Map<string, any>();
  for (const r of rawQuestions) {
    const id = anyId(r);
    if (id) rawById.set(id, r);
  }
  const source =
    Array.isArray(snapshot) && snapshot.length
      ? snapshot.map((sq) => ({ q: sq, raw: rawById.get(sq.id) }))
      : rawQuestions.map((rq) => ({ q: rq, raw: rq }));
  return source.map(({ q, raw }, i) => {
    const perm = Array.isArray(q._choice_perm) ? q._choice_perm : undefined;
    const toDisp = (orig: unknown) =>
      typeof orig === "number" && perm ? (perm.indexOf(orig) >= 0 ? perm.indexOf(orig) : orig) : orig;
    const ans = q.id ? answersByQid.get(q.id) : undefined;
    const correctOrig =
      raw?.correctIndex ?? raw?.dap_an_index ?? null;
    return {
      key: q.id || `idx-${i}`,
      q: { ...q },
      answer: {
        selectedIndex: ans ? toDisp(ans.selectedIndex ?? null) : null,
        textAnswer: ans?.textAnswer ?? null,
        codeAnswer: ans?.codeAnswer ?? null,
      },
      correctIndex: correctOrig != null ? (toDisp(correctOrig) as number) : null,
      explanation: (raw as any)?.explanation ?? null,
      scoreInfo: ans
        ? { autoScore: ans.autoScore ?? null, finalScore: ans.finalScore ?? null, maxScore: ans.maxScore ?? q.diem ?? null }
        : null,
    };
  });
}

function anyId(r: any): string | null {
  if (!r) return null;
  return r.id || r.questionId || null;
}
