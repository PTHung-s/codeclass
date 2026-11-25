import { useEffect, useState, useCallback, useRef } from "react";
import { socketSubscribe, socketSend, socketSendIfOpen, socketIsOpen } from "../lib/socket";
import { ArenaState, ArenaPanelState } from "../lib/arenaTypes";

export interface ArenaChaosEvent {
  power: "blackout" | "generator";
  sourceUserId: string;
  targetUserIds: string[];
  endsAt: string;
  /**
   * Identity of the effect, not the moment we noticed it. `Date.now()` used to
   * fill this slot, so a re-delivered broadcast looked like a brand-new hit and
   * fired a second toast for one blackout.
   */
  eventKey: string;
}

/**
 * Live arena room: joins on mount, re-joins after a reconnect, leaves on unmount.
 *
 * The socket is the app-wide shared one, so this hook only owns the room state.
 * Merging with the REST snapshot lives in `useArenaMatch`.
 */
export function useArenaSocket(arenaId: string | null, viewerUserId?: string) {
  const [connected, setConnected] = useState(socketIsOpen());
  const [state, setState] = useState<ArenaState | null>(null);
  const [kicked, setKicked] = useState(false);
  const [panelStates, setPanelStates] = useState<Record<string, ArenaPanelState>>({});
  const [chaosEvent, setChaosEvent] = useState<ArenaChaosEvent | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [error] = useState<string | null>(null);

  // Which question the panels below belong to. Staff peeking at question 3 used
  // to see the code a student typed for question 2, because nothing ever
  // cleared this map between questions.
  const panelQuestionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!arenaId) return;

    setConnected(socketIsOpen());
    setKicked(false);
    setGenerationError(null);
    setPanelStates({});
    panelQuestionRef.current = null;

    const sendJoin = () => socketSend("arena_join", { arenaId });

    // Join immediately (queued if socket still connecting)
    sendJoin();

    /** Drop every peeked panel when the match moves to a different question. */
    const syncPanelQuestion = (index: number | undefined) => {
      if (typeof index !== "number") return;
      if (panelQuestionRef.current === index) return;
      panelQuestionRef.current = index;
      setPanelStates({});
    };

    const unsub = socketSubscribe((msg) => {
      // Track connection state
      if (msg.type === "__socket_open") {
        setConnected(true);
        // Re-join the room after a reconnect
        sendJoin();
        return;
      }
      if (msg.type === "__socket_close") {
        setConnected(false);
        return;
      }

      switch (msg.type) {
        case "arena_state":
          syncPanelQuestion(msg.payload?.match?.currentQuestionIndex);
          setState(msg.payload);
          break;
        case "arena_phase":
          syncPanelQuestion(msg.payload.questionIndex);
          setState((prev) => {
            if (!prev) return prev;
            // When the phase changes, clear data that belongs to the OLD phase
            // so the UI doesn't render stale content before arena_state arrives.
            // arena_state (now sent first) already has the correct data, so this
            // is a defensive no-op in normal operation.
            const enteringQuestion = msg.payload.phase === "question";
            const enteringReveal = msg.payload.phase === "reveal";
            const enteringCountdown = msg.payload.phase === "countdown";
            const enteringPodium = msg.payload.phase === "podium";
            return {
              ...prev,
              match: {
                ...prev.match,
                phase: msg.payload.phase,
                ...(typeof msg.payload.questionIndex === "number"
                  ? { currentQuestionIndex: msg.payload.questionIndex }
                  : {}),
              },
              // Clear question when leaving the question phase (entering reveal/podium)
              ...(enteringReveal || enteringPodium ? { question: null } : {}),
              // Clear reveal when leaving the reveal phase (entering question/countdown)
              ...(enteringQuestion || enteringCountdown ? { reveal: null } : {}),
            };
          });
          break;
        case "arena_timer":
          setState((prev) =>
            prev ? { ...prev, remainingSeconds: msg.payload.remainingSeconds } : prev,
          );
          break;
        case "arena_generating":
          // A fresh attempt clears whatever the previous one failed with.
          setGenerationError(null);
          setState((prev) =>
            prev
              ? { ...prev, match: { ...prev.match, status: "generating", phase: "generating" } }
              : prev,
          );
          break;
        case "arena_generation_failed":
          // The server has already rolled the match back to the lobby. Nobody
          // listened for this before, so a failed quiz generation left everyone
          // watching a spinner that would never resolve.
          setGenerationError(
            msg.payload?.message || "AI chưa tạo được câu hỏi. Có thể thử bắt đầu lại.",
          );
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  match: { ...prev.match, status: "lobby", phase: "lobby" },
                  question: null,
                  reveal: null,
                }
              : prev,
          );
          break;
        case "arena_panel":
          setPanelStates((prev) => ({
            ...prev,
            [msg.payload.userId]: {
              userId: msg.payload.userId,
              hasCode: msg.payload.hasCode,
              language: msg.payload.language,
              code: msg.payload.code,
              highlighted: Array.isArray(msg.payload.highlighted) ? msg.payload.highlighted : [],
            },
          }));
          break;
        case "arena_chaos":
          setChaosEvent({
            power: msg.payload.power,
            sourceUserId: msg.payload.sourceUserId,
            targetUserIds: Array.isArray(msg.payload.targetUserIds) ? msg.payload.targetUserIds : [],
            endsAt: msg.payload.endsAt,
            eventKey: `${msg.payload.power}:${msg.payload.sourceUserId}:${msg.payload.endsAt}`,
          });
          break;
        case "arena_kicked":
          if (viewerUserId && msg.payload?.userId === viewerUserId) setKicked(true);
          break;
      }
    });

    return () => {
      unsub();
      socketSend("arena_leave", { arenaId });
    };
  }, [arenaId, viewerUserId]);

  const sendMessage = useCallback((type: string, payload: any) => {
    socketSend(type, payload);
  }, []);
  const sendTransientMessage = useCallback((type: string, payload: any) => socketSendIfOpen(type, payload), []);

  const clearGenerationError = useCallback(() => setGenerationError(null), []);

  return {
    connected,
    state,
    panelStates,
    chaosEvent,
    generationError,
    clearGenerationError,
    error,
    sendMessage,
    sendTransientMessage,
    kicked,
  };
}
