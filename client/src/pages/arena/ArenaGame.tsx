import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Bug, ShieldOff } from "lucide-react";
import api from "../../lib/api";
import { useArenaMatch } from "../../hooks/useArenaMatch";
import { useAuthContext } from "../../contexts/AuthContext";
import { useConfirmContext } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { ArenaShell } from "../../components/arena/ArenaShell";
import { ArenaScoreboard } from "../../components/arena/ArenaScoreboard";
import { ArenaLobby, DebugScoringCard } from "../../components/arena/ArenaLobby";
import { ArenaCountdown, ArenaGenerating } from "../../components/arena/ArenaGenerating";
import { ArenaPodium } from "../../components/arena/ArenaPodium";
import { DebugQuestion } from "../../components/arena/debug/DebugQuestion";
import { DebugBrief } from "../../components/arena/debug/DebugBrief";
import { DebugReveal } from "../../components/arena/debug/DebugReveal";

const BACK = "/arena";

/**
 * Debug Arena — phase router only.
 *
 * Everything visual lives in `components/arena/`, so this file's whole job is:
 * pick the body for the current phase, own the host mutations, and turn chaos
 * events into toasts.
 */
export default function ArenaGame() {
  const { id: arenaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const confirm = useConfirmContext();
  const toast = useToast();

  const {
    connected,
    state,
    isLoading,
    isStaff,
    isPlayer,
    isHost,
    phase,
    status,
    panelStates,
    chaosEvent,
    generationError,
    sendMessage,
    sendTransientMessage,
    kicked,
  } = useArenaMatch(arenaId || null, user?.id, user?.role);

  const startMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/start`).then((r) => r.data) });
  const skipMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/skip`).then((r) => r.data) });
  const endMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/end`).then((r) => r.data) });

  // One toast per effect. The key is the effect's identity, so a re-delivered
  // broadcast is recognised as the same blackout instead of a second one.
  const lastChaosRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chaosEvent || lastChaosRef.current === chaosEvent.eventKey) return;
    lastChaosRef.current = chaosEvent.eventKey;
    const actor = state?.players.find((p) => p.userId === chaosEvent.sourceUserId);
    const name = actor?.fullName || "Một người chơi";
    if (chaosEvent.power === "blackout") {
      toast.warning({
        title: `⚡ ${name} vừa cúp điện`,
        message: chaosEvent.targetUserIds.includes(user?.id || "")
          ? "Bạn đang mất điện — bật máy phát để nhìn lại code."
          : `${chaosEvent.targetUserIds.length} người chơi đang mất điện.`,
        duration: 6000,
      });
    } else {
      toast.success({
        title: `🛡️ ${name} đã bật máy phát`,
        message: "Máy phát bảo vệ người chơi này đến hết câu hỏi.",
        duration: 4500,
      });
    }
  }, [chaosEvent, state?.players, toast, user?.id]);

  const handleEnd = async () => {
    const ok = await confirm({
      title: "Kết thúc arena?",
      message: "Bảng xếp hạng hiện tại sẽ được dùng để trao thưởng.",
      confirmLabel: "Kết thúc",
      variant: "danger",
    });
    if (ok) endMu.mutate();
  };

  if (isLoading && !state) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="text-sm text-muted-foreground">Đang tải arena...</p>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-500">Không tìm thấy arena.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(BACK)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Button>
      </div>
    );
  }
  if (state.match.arenaType === "quiz") return <Navigate to={`/quiz-arena/${arenaId}`} replace />;

  if (state.viewerKicked || kicked) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/40">
          <ShieldOff className="h-8 w-8 text-red-500" />
        </div>
        <p className="text-lg font-extrabold">Bạn đã bị mời ra khỏi phòng này</p>
        <p className="text-sm text-muted-foreground">Giáo viên đã mời bạn ra và bạn không thể vào lại trận này.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(BACK)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </Button>
      </div>
    );
  }

  const questionNo = state.match.currentQuestionIndex >= 0 ? state.match.currentQuestionIndex + 1 : 0;
  const gainByUser = state.reveal
    ? new Map(state.reveal.results.map((r) => [r.userId, r.score]))
    : undefined;
  // Scoreboard only during the reveal — the question phase wants the brief on
  // the right so the left can be fully for the two code panels.
  const showScoreboard = phase === "reveal";
  const showDebugBrief = phase === "question" && !!state.question;

  return (
    <ErrorBoundary>
      <ArenaShell
        title={state.match.title}
        icon={<Bug className="h-3.5 w-3.5 text-blue-400" />}
        subtitle={`${isPlayer ? "🎮 Người chơi" : isStaff ? "👨‍🏫 Host" : "👁 Khán giả"} · Câu ${questionNo}/${state.match.questionCount}`}
        backTo={BACK}
        connected={connected}
        phase={phase}
        remainingSeconds={state.remainingSeconds}
        secondsPerQuestion={state.match.secondsPerQuestion}
        showHostControls={isHost && status === "in_progress"}
        onSkip={() => skipMu.mutate()}
        skipping={skipMu.isPending}
        onEnd={handleEnd}
        rightPanel={
          showScoreboard ? (
            <ArenaScoreboard
              players={state.players}
              tokenRewards={state.match.tokenRewards}
              gainByUser={gainByUser}
              showGains
            />
          ) : showDebugBrief ? (
            <DebugBrief question={state.question!} />
          ) : null
        }
      >
        {phase === "lobby" && (
          <ArenaLobby
            state={state}
            arenaId={arenaId!}
            userId={user?.id || ""}
            isStaff={isStaff}
            onStart={() => startMu.mutate()}
            starting={startMu.isPending}
            icon={<Bug className="h-9 w-9 text-blue-400" />}
            blurb={
              <>
                AI sẽ ra <b>{state.match.questionCount} câu</b> debug code (
                {state.match.languages.map((l) => (l === "cpp" ? "C++" : "Python")).join(", ")}). Mỗi câu luôn có đúng{" "}
                <b>1 bug</b>: tô đúng dòng lỗi được điểm, sửa code ra output đúng cũng được điểm — hai việc độc lập.
              </>
            }
            scoring={<DebugScoringCard />}
            generationError={generationError}
          />
        )}

        {phase === "generating" && (
          <ArenaGenerating
            icon={<Bug className="h-12 w-12 text-blue-400" />}
            error={generationError}
            // Practice matches auto-start server-side; the only person who can
            // recover from a failed AI generation is the student who owns it.
            onRetry={isStaff || state.match.mode === "practice" ? () => startMu.mutate() : undefined}
            retrying={startMu.isPending}
          />
        )}

        {phase === "countdown" && <ArenaCountdown seconds={state.remainingSeconds} />}

        {phase === "question" && (
          <DebugQuestion
            state={state}
            arenaId={arenaId!}
            isPlayer={isPlayer}
            isStaff={isStaff}
            userId={user?.id || ""}
            panelStates={panelStates}
            sendMessage={sendTransientMessage}
          />
        )}

        {phase === "reveal" && (
          <DebugReveal
            state={state}
            isHost={isHost}
            onSkip={() => skipMu.mutate()}
            skipping={skipMu.isPending}
            viewerId={user?.id || ""}
          />
        )}

        {phase === "podium" && <ArenaPodium state={state} onExit={() => navigate(BACK)} />}
      </ArenaShell>
    </ErrorBoundary>
  );
}
