import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ShieldOff, Sparkles } from "lucide-react";
import api from "../../lib/api";
import { useArenaMatch } from "../../hooks/useArenaMatch";
import { useAuthContext } from "../../contexts/AuthContext";
import { useConfirmContext } from "../../hooks/useConfirm";
import { Button } from "../../components/ui/button";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { ArenaShell } from "../../components/arena/ArenaShell";
import { ArenaScoreboard } from "../../components/arena/ArenaScoreboard";
import { ArenaLobby, QuizScoringCard } from "../../components/arena/ArenaLobby";
import { ArenaCountdown, ArenaGenerating } from "../../components/arena/ArenaGenerating";
import { ArenaPodium } from "../../components/arena/ArenaPodium";
import { QuizQuestion } from "../../components/arena/quiz/QuizQuestion";
import { QuizReveal } from "../../components/arena/quiz/QuizReveal";

const BACK = "/quiz-arena";

/**
 * Quiz Arena — the same shell as Debug Arena with a different question body.
 *
 * The two pages used to be independent 1000-line files that had drifted apart
 * (only one had an auto-submit, only one handled a null question during the
 * phase handover). Sharing `useArenaMatch` + `ArenaShell` is what keeps them
 * behaving identically.
 */
export default function QuizArenaGame() {
  const { id: arenaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const confirm = useConfirmContext();

  const {
    connected,
    state,
    isLoading,
    isStaff,
    isPlayer,
    isHost,
    phase,
    status,
    generationError,
    kicked,
  } = useArenaMatch(arenaId || null, user?.id, user?.role);

  const startMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/start`).then((r) => r.data) });
  const skipMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/skip`).then((r) => r.data) });
  const endMu = useMutation({ mutationFn: () => api.post(`/arenas/${arenaId}/end`).then((r) => r.data) });

  const handleEnd = async () => {
    const ok = await confirm({
      title: "Kết thúc Quiz Arena?",
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
        <p className="text-sm text-muted-foreground">Đang tải Quiz Arena...</p>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-500">Không tìm thấy phòng.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(BACK)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Button>
      </div>
    );
  }
  if (state.match.arenaType === "debug") return <Navigate to={`/arena/${arenaId}`} replace />;

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
  const gainByUser = state.reveal ? new Map(state.reveal.results.map((r) => [r.userId, r.score])) : undefined;
  // Scoreboard only during the reveal.
  const showScoreboard = phase === "reveal";

  return (
    <ErrorBoundary>
      <ArenaShell
        title={state.match.title}
        icon={<Sparkles className="h-3.5 w-3.5 text-blue-400" />}
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
            icon={<Sparkles className="h-9 w-9 text-blue-400" />}
            blurb={
              <>
                AI sẽ ra <b>{state.match.questionCount} câu</b> trắc nghiệm theo topic của lớp. Mỗi câu có đúng một đáp
                án; độ khó của câu được hiệu chỉnh lại sau mỗi lượt làm.
              </>
            }
            scoring={<QuizScoringCard />}
            generationError={generationError}
          />
        )}

        {phase === "generating" && (
          <ArenaGenerating
            icon={<Sparkles className="h-12 w-12 text-blue-400" />}
            error={generationError}
            onRetry={isStaff || state.match.mode === "practice" ? () => startMu.mutate() : undefined}
            retrying={startMu.isPending}
          />
        )}

        {phase === "countdown" && <ArenaCountdown seconds={state.remainingSeconds} />}

        {phase === "question" && <QuizQuestion state={state} arenaId={arenaId!} isPlayer={isPlayer} />}

        {phase === "reveal" && (
          <QuizReveal
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
