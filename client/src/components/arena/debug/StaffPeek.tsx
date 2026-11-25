import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { Eye } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ARENA_EDITOR_OPTIONS, configureArenaEditor, langOf } from "../arenaMonaco";
import type { ArenaPanelState, ArenaState } from "../../../lib/arenaTypes";

/**
 * Live over-the-shoulder view of one student's work.
 *
 * `panelStates` is cleared by useArenaSocket whenever the question changes; it
 * used to persist, so at question 3 a teacher was reading code the student had
 * written for question 2 and grading them on it.
 */
export function StaffPeek({
  state,
  panelStates,
}: {
  state: ArenaState;
  panelStates: Record<string, ArenaPanelState>;
}) {
  const submitted = new Set(state.submittedUserIds);
  const [peekId, setPeekId] = useState<string | null>(null);

  // Default to whoever is actually typing.
  useEffect(() => {
    if (peekId && state.players.some((p) => p.userId === peekId)) return;
    const editing = state.players.find(
      (p) => panelStates[p.userId]?.hasCode || (panelStates[p.userId]?.highlighted?.length || 0) > 0,
    );
    setPeekId(editing?.userId || state.players[0]?.userId || null);
  }, [state.players, panelStates, peekId]);

  const peek = peekId ? panelStates[peekId] : null;
  const peekPlayer = state.players.find((p) => p.userId === peekId);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        <Eye className="h-3 w-3" /> Theo dõi học sinh (real-time)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {state.players.length === 0 && <p className="text-xs text-slate-500">Chưa có người chơi.</p>}
        {state.players.map((p) => {
          const ps = panelStates[p.userId];
          const isSubmitted = submitted.has(p.userId);
          const isWorking = !isSubmitted && ((ps?.highlighted?.length || 0) > 0 || ps?.hasCode);
          const active = peekId === p.userId;
          return (
            <button
              key={p.userId}
              onClick={() => setPeekId(p.userId)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                active
                  ? "border-blue-400/70 bg-blue-500/15 text-slate-100"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isSubmitted ? "bg-emerald-400" : isWorking ? "animate-pulse bg-amber-400" : "bg-slate-600",
                )}
              />
              <span className="max-w-[90px] truncate font-medium">{p.fullName}</span>
              <span className="text-[9px] text-slate-500">
                {isSubmitted ? "đã chốt" : isWorking ? "đang làm" : "đang nghĩ"}
              </span>
            </button>
          );
        })}
      </div>

      {peek ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">{peekPlayer?.fullName || "?"}</p>
            <div className="flex gap-1 text-[10px]">
              {(peek.highlighted?.length || 0) > 0 && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
                  🎯 {peek.highlighted!.length} dòng
                </span>
              )}
              {peek.hasCode && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                  🔧 đang sửa
                </span>
              )}
            </div>
          </div>
          {peek.hasCode && peek.code ? (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <Editor
                height="220px"
                language={langOf(peek.language)}
                beforeMount={configureArenaEditor}
                theme="codeclass-arena"
                value={peek.code}
                options={{ ...ARENA_EDITOR_OPTIONS, readOnly: true, fontSize: 12, lineHeight: 20, lineNumbers: "on" }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-slate-500">
              <Eye className="mb-2 h-7 w-7 opacity-30" />
              {submitted.has(peekId || "")
                ? `${peekPlayer?.fullName || ""} đã chốt.`
                : `${peekPlayer?.fullName || ""} chưa sửa code.`}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
