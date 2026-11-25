import { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { LogIn, Users, X, Zap } from "lucide-react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import StudentAvatar from "../ui/StudentAvatar";
import type { ArenaState } from "../../lib/arenaTypes";

const panel = "rounded-2xl border border-slate-800 bg-[#0E1728] p-4";

/**
 * Lobby for both arenas. What differs between Debug and Quiz is only the blurb
 * and the scoring explainer, so those arrive as props instead of being a second
 * near-identical component.
 */
export function ArenaLobby({
  state,
  arenaId,
  userId,
  isStaff,
  onStart,
  starting,
  icon,
  blurb,
  scoring,
  generationError,
}: {
  state: ArenaState;
  arenaId: string;
  userId: string;
  isStaff: boolean;
  onStart: () => void;
  starting: boolean;
  icon: ReactNode;
  blurb: ReactNode;
  /** The "how points work" card — different per arena type. */
  scoring: ReactNode;
  /** Set when a previous start attempt failed to generate questions. */
  generationError?: string | null;
}) {
  const alreadyJoined = state.players.some((p) => p.userId === userId);
  const joinMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/join`).then((r) => r.data) });
  const kickMu = useMutation({
    mutationFn: (uid: string) => api.post(`/arenas/${arenaId}/kick`, { userId: uid }).then((r) => r.data),
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className={cn(panel, "text-center")}>
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15"
          >
            {icon}
          </motion.div>
          <h1 className="mt-3 text-2xl font-extrabold text-slate-50">{state.match.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{blurb}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
              <Zap className="h-3 w-3" /> {state.match.secondsPerQuestion}s/câu
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
              <Users className="h-3 w-3" /> {state.players.length} người chơi
            </span>
            {state.match.scopeNote && (
              <span
                className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full bg-slate-800 px-2.5 py-1 text-slate-300"
                title={state.match.scopeNote}
              >
                📊 {state.match.scopeNote}
              </span>
            )}
          </div>
        </div>

        {generationError && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p className="font-bold">Chưa tạo được đề</p>
            <p className="mt-1 text-amber-200/85">{generationError}</p>
            {isStaff && <p className="mt-1 text-xs text-amber-200/70">Bấm "Bắt đầu arena" để thử lại.</p>}
          </div>
        )}

        <div className={panel}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Người chơi ({state.players.length})
            </p>
            {isStaff && state.players.length > 0 && (
              <p className="text-[11px] text-slate-500">Di chuột vào avatar để mời ra</p>
            )}
          </div>
          {state.players.length === 0 ? (
            <p className="text-xs text-slate-500">Chưa có ai tham gia — học sinh bấm "Tham gia phòng" bên dưới.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-3">
              {state.players.map((p) => (
                <div key={p.userId} className="group relative flex flex-col items-center gap-1.5 rounded-lg p-1.5">
                  <StudentAvatar
                    studentId={p.userId}
                    fullName={p.fullName}
                    avatarUrl={p.avatarUrl}
                    size="lg"
                    clickable={false}
                  />
                  <span className="w-full truncate text-center text-[11px] font-medium text-slate-300" title={p.fullName}>
                    {p.fullName}
                  </span>
                  {isStaff && (
                    <button
                      onClick={() => kickMu.mutate(p.userId)}
                      disabled={kickMu.isPending}
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition hover:bg-red-600 group-hover:opacity-100"
                      title={`Mời ${p.fullName} ra`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {scoring}

        {isStaff ? (
          <Button
            onClick={onStart}
            disabled={starting || state.players.length === 0}
            className="w-full gap-2 bg-blue-600 hover:bg-blue-500"
            size="lg"
          >
            {starting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Đang lựa
                chọn câu hỏi...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" /> Bắt đầu arena
              </>
            )}
          </Button>
        ) : state.match.mode === "practice" ? (
          // Practice matches start themselves server-side (startPractice calls
          // startArena), so there is deliberately no button here.
          <div className="text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
            <p className="mt-2 text-sm text-slate-400">Đang khởi động luyện tập...</p>
          </div>
        ) : alreadyJoined ? (
          <p className="text-center text-sm text-slate-400">Đã tham gia — đợi host bắt đầu... ⏳</p>
        ) : (
          <Button
            onClick={() => joinMu.mutate()}
            disabled={joinMu.isPending}
            className="w-full gap-2 bg-blue-600 hover:bg-blue-500"
            size="lg"
          >
            {joinMu.isPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Đang vào
                phòng...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" /> Tham gia phòng
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Two-column scoring explainer for Debug — matches how the server actually scores. */
export function DebugScoringCard() {
  return (
    <div className="rounded-2xl border border-dashed border-blue-500/40 bg-blue-500/5 p-4 text-xs">
      <p className="mb-2 font-bold text-blue-200">Cách chấm điểm (2 luồng độc lập)</p>
      <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
        <div className="rounded-xl bg-amber-500/10 p-2.5">
          <p className="font-bold text-amber-300">🎯 Tô đúng dòng lỗi</p>
          <p className="mt-0.5 text-slate-300">
            Chính xác: <b className="text-amber-200">+40đ</b>
          </p>
          <p className="text-slate-400">Tô dư dòng: +20đ</p>
        </div>
        <div className="rounded-xl bg-emerald-500/10 p-2.5">
          <p className="font-bold text-emerald-300">🔧 Sửa code đúng</p>
          <p className="mt-0.5 text-slate-300">
            Ra output đúng: <b className="text-emerald-200">+60đ</b>
          </p>
          <p className="text-slate-400">Làm cả 2: +100đ</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Nộp sớm còn được thưởng thêm theo thời gian còn lại · Hết giờ hệ thống tự nộp.
      </p>
    </div>
  );
}

/** Scoring explainer for Quiz. */
export function QuizScoringCard() {
  return (
    <div className="rounded-2xl border border-dashed border-blue-500/40 bg-blue-500/5 p-4 text-xs">
      <p className="mb-2 font-bold text-blue-200">Cách chấm điểm</p>
      <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
        <div className="rounded-xl bg-emerald-500/10 p-2.5">
          <p className="font-bold text-emerald-300">✅ Chọn đúng</p>
          <p className="mt-0.5 text-slate-300">Được điểm câu đó</p>
        </div>
        <div className="rounded-xl bg-amber-500/10 p-2.5">
          <p className="font-bold text-amber-300">⏱ Trả lời nhanh</p>
          <p className="mt-0.5 text-slate-300">Thưởng thêm theo thời gian còn lại</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Mỗi câu chỉ chốt một lần · Hết giờ hệ thống tự nộp.</p>
    </div>
  );
}
