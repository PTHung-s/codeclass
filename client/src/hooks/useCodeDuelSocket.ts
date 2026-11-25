import { useEffect, useState, useCallback } from "react";
import { socketSubscribe, socketSend, socketSendIfOpen, socketIsOpen } from "../lib/socket";
import {
  CodeDuelState,
  CodeDuelPanelState,
  CodeDuelReadyState,
  CodeDuelTabEvent,
} from "../lib/codeDuelTypes";

/**
 * Live Code Duel room: joins on mount, re-joins after a reconnect, leaves on
 * unmount. The socket is the app-wide shared one, so this hook only owns the
 * room state; merging with the REST snapshot lives in useCodeDuelMatch.
 */
export function useCodeDuelSocket(matchId: string | null, viewerUserId?: string) {
  const [connected, setConnected] = useState(socketIsOpen());
  const [state, setState] = useState<CodeDuelState | null>(null);
  // { [userId]: latest editor code } for the teacher live wall.
  const [panelStates, setPanelStates] = useState<Record<string, CodeDuelPanelState>>({});
  // Latest out-tab event per user (badge on the monitor wall).
  const [tabEvents, setTabEvents] = useState<Record<string, CodeDuelTabEvent>>({});
  // Students mark themselves ready in the lobby. This is deliberately live
  // room state (rather than a permanent player attribute) for each session.
  const [readyStates, setReadyStates] = useState<Record<string, CodeDuelReadyState>>({});
  // Anti-cheat lock (seconds) for THIS viewer, set on return-from-tab.
  const [lock, setLock] = useState<{ seconds: number; lockId: number; lockUntil?: number } | null>(null);

  const [judgingResults, setJudgingResults] = useState<Record<string, any>>({});
  const [judgingTotal, setJudgingTotal] = useState<number>(0);
  // True when the teacher kicked this viewer out of the match.
  const [kicked, setKicked] = useState(false);
  // { [roundId]: { [testNum]: {passed,status} } } — realtime per-test results of
  // THIS viewer's submissions, pushed as each public test is judged.
  const [liveTestResults, setLiveTestResults] = useState<Record<string, Record<string, any>>>({});

  useEffect(() => {
    if (!matchId) return;
    setConnected(socketIsOpen());
    setPanelStates({});
    setTabEvents({});
    setReadyStates({});
    setLock(null);
    setKicked(false);
    setJudgingResults({});
    setLiveTestResults({});

    const sendJoin = () => socketSend("code_duel_join", { matchId });

    sendJoin();

    const unsub = socketSubscribe((msg) => {
      switch (msg.type) {
        case "__socket_open":
          setConnected(true);
          sendJoin();
          return;
        case "__socket_close":
          setConnected(false);
          return;
        case "code_duel_state":
          setState(msg.payload);
          break;
        case "code_duel_timer":
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  remainingSeconds: msg.payload.remainingSeconds,
                  match: { ...prev.match, paused: Boolean(msg.payload.paused) },
                }
              : prev,
          );
          break;
        case "code_duel_phase":
          setState((prev) =>
            prev ? { ...prev, match: { ...prev.match, status: msg.payload.status } } : prev,
          );
          // "Chơi lại" returns the match to draft. The server has cleared the
          // old lock, so immediately remove any overlay already held locally.
          if (msg.payload.status === "draft") setLock(null);
          break;
        case "code_duel_reveal":
          // Server will follow with a full state; nothing to do here beyond a
          // phase hint so the UI can flip promptly.
          setState((prev) =>
            prev ? { ...prev, match: { ...prev.match, status: "reveal" } } : prev,
          );
          break;
        case "code_duel_panel":
          setPanelStates((prev) => ({
            ...prev,
            [msg.payload.userId]: {
              userId: msg.payload.userId,
              hasCode: msg.payload.hasCode,
              language: msg.payload.language,
              code: msg.payload.code,
            },
          }));
          break;
        case "code_duel_tab":
          setTabEvents((prev) => ({
            ...prev,
            [msg.payload.userId]: {
              userId: msg.payload.userId,
              out: msg.payload.out,
              outTabCount: msg.payload.outTabCount,
            },
          }));
          break;
        case "code_duel_ready":
          if (Array.isArray(msg.payload?.userIds)) {
            const next: Record<string, CodeDuelReadyState> = {};
            for (const userId of msg.payload.userIds) {
              if (typeof userId === "string") next[userId] = { userId, ready: true };
            }
            setReadyStates(next);
          } else if (typeof msg.payload?.userId === "string") {
            setReadyStates((prev) => ({
              ...prev,
              [msg.payload.userId]: { userId: msg.payload.userId, ready: Boolean(msg.payload.ready) },
            }));
          }
          break;
        case "code_duel_tab_lock":
          // Only the targeted viewer receives this; apply the darken overlay.
          if (!viewerUserId || viewerUserId === msg.payload?.userId || !msg.payload?.userId) {
            setLock({ seconds: msg.payload.seconds, lockId: Date.now(), lockUntil: msg.payload?.lockUntil || Date.now() + Number(msg.payload.seconds || 0) * 1000 });
          }
          break;
        case "code_duel_judging":
          // Server started judging; clear any stale results and mark state as judging.
          setJudgingResults({});
          setJudgingTotal(msg.payload.total || 0);
          setState((prev) =>
            prev ? { ...prev, match: { ...prev.match, status: "judging" }, judging: true } : prev,
          );
          break;
        case "code_duel_submission_result":
          // Incremental per-submission result while judging.
          setJudgingResults((prev) => ({ ...prev, [msg.payload.submissionId]: msg.payload }));
          setJudgingTotal(msg.payload.total ?? 0);
          break;
        case "code_duel_test_result":
          // Realtime per-test result of THIS viewer's own submission (public
          // tests only — server withholds hidden ones until the reveal).
          setLiveTestResults((prev) => {
            const round = prev[msg.payload.roundId] || {};
            return { ...prev, [msg.payload.roundId]: { ...round, [msg.payload.testNum]: msg.payload } };
          });
          break;
        case "code_duel_kicked":
          // This viewer was removed by the teacher — lock them out.
          setKicked(true);
          break;
        case "code_duel_unlocked":
          // Staff restored access while this page was open: clear the local
          // lock and immediately rejoin the match over the existing socket.
          setKicked(false);
          sendJoin();
          break;
      }
    });

    return () => {
      unsub();
      socketSend("code_duel_leave", { matchId });
    };
  }, [matchId, viewerUserId]);

  const sendMessage = useCallback((type: string, payload: any) => {
    socketSend(type, payload);
  }, []);
  const sendTransientMessage = useCallback((type: string, payload: any) => socketSendIfOpen(type, payload), []);

  const clearLock = useCallback(() => setLock(null), []);

  return {
    connected,
    state,
    panelStates,
    tabEvents,
    readyStates,
    lock,
    clearLock,
    sendMessage,
    sendTransientMessage,
    judgingResults,
    judgingTotal,
    liveTestResults,
    kicked,
  };
}
