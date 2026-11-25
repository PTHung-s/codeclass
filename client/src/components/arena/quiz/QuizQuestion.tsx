import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, Send } from "lucide-react";
import api from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { ArenaMarkdown } from "../ArenaMarkdown";
import type { ArenaState } from "../../../lib/arenaTypes";

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * The live quiz question: statement on top, options below, submit bar pinned to
 * the bottom of the shell. Same skeleton as DebugQuestion so both arenas feel
 * like the same product.
 */
export function QuizQuestion({
  state,
  arenaId,
  isPlayer,
}: {
  state: ArenaState;
  arenaId: string;
  isPlayer: boolean;
}) {
  const q = state.question;
  const [selected, setSelected] = useState<number | null>(state.myAnswer?.selectedIndex ?? null);
  const [changes, setChanges] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(performance.now());
  const autoFiredRef = useRef<string | null>(null);
  const submitted = !!state.myAnswer?.answeredAt;
  const [locked, setLocked] = useState(false);

  const submitMu = useMutation({
    mutationFn: (selectedIndex: number) =>
      api
        .post(`/arenas/${arenaId}/questions/${q?.id}/answer`, {
          selectedIndex,
          responseTimeMs: Math.round(performance.now() - startedAt.current),
          activeTimeMs: Math.round(performance.now() - startedAt.current),
          changeCount: changes,
        })
        .then((response) => response.data as { ok: boolean }),
  });

  useEffect(() => {
    startedAt.current = performance.now();
    setSelected(state.myAnswer?.selectedIndex ?? null);
    setChanges(0);
    setMessage(null);
    setLocked(false);
    autoFiredRef.current = null;
  }, [q?.id, state.myAnswer?.selectedIndex]);

  const effLocked = submitted || locked || submitMu.isPending;

  // Auto-submit the current pick on the last tick, once per question.
  useEffect(() => {
    if (!isPlayer || !q || effLocked) return;
    if (state.remainingSeconds > 1) return;
    if (autoFiredRef.current === q.id) return;
    autoFiredRef.current = q.id;
    // No pick on the buzzer — lock the UI and explain. A missing answer record
    // already scores 0 and the reveal renders no-selection honestly, so there
    // is nothing to send to the server here.
    if (selected === null) {
      setLocked(true);
      setMessage("⏰ Hết giờ — bạn chưa chọn phương án nào, hệ thống ghi nhận 0 điểm.");
      return;
    }
    void (async () => {
      try {
        const result = await submitMu.mutateAsync(selected);
        if (result?.ok) {
          setLocked(true);
          setMessage("⏰ Hết giờ — hệ thống tự nộp lựa chọn của bạn.");
        }
      } catch {
        /* best-effort auto-submit */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.remainingSeconds, q?.id]);

  if (!q) return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Đang tải câu hỏi...</div>;

  const submit = async () => {
    if (selected === null) return;
    try {
      const result = await submitMu.mutateAsync(selected);
      if (result.ok) {
        setLocked(true);
        setMessage("Đã chốt đáp án · đáp án đúng hiện khi hết giờ");
      }
    } catch (error: any) {
      setMessage(error?.response?.data?.error || "Không thể nộp đáp án");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-800 bg-[#0E1728] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">
              Câu {q.orderIndex + 1}/{state.match.questionCount}
            </p>
            <h2 className="truncate text-base font-extrabold text-slate-50">{q.title}</h2>
          </div>
          <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300">
            Độ khó {Number(q.effectiveDifficulty || q.difficulty || 3).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-3 py-3 sm:px-4">
          <div className="rounded-2xl border border-slate-800 bg-[#0E1728] p-3 sm:p-4">
            <ArenaMarkdown content={q.statement} className="text-slate-200" />
          </div>

          {isPlayer ? (
            <div className="grid gap-2.5">
              {(q.options || []).map((option, index) => (
                <button
                  key={`${q.id}-${index}`}
                  type="button"
                  disabled={effLocked}
                  onClick={() => {
                    setSelected(index);
                    setChanges((value) => value + 1);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-3 text-left transition sm:p-4",
                    selected === index
                      ? "border-blue-400/70 bg-blue-500/15"
                      : "border-slate-800 bg-[#0E1728] hover:border-slate-700 hover:bg-slate-800/60",
                    effLocked && "cursor-default opacity-80",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      selected === index
                        ? "border-blue-400 bg-blue-500 text-white"
                        : "border-slate-600 text-slate-400",
                    )}
                  >
                    {LETTERS[index]}
                  </span>
                  <ArenaMarkdown content={option} className="flex-1 text-slate-200" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-[#0E1728] p-8 text-center text-sm text-slate-400">
              <Eye className="size-8 opacity-40" />
              Giáo viên và khán giả chỉ thấy tiến độ. Đáp án sẽ hiện sau khi hết giờ.
            </div>
          )}
        </div>
      </div>

      {isPlayer && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 bg-[#0E1728] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {message || (effLocked ? "Đã chốt, chờ hết giờ xem đáp án." : "Bạn có thể đổi lựa chọn trước khi chốt.")}
          </span>
          <Button
            onClick={submit}
            disabled={selected === null || effLocked}
            size="sm"
            className="shrink-0 gap-1 bg-blue-600 hover:bg-blue-500"
          >
            <Send className="h-4 w-4" /> Chốt đáp án
          </Button>
        </div>
      )}
    </div>
  );
}
