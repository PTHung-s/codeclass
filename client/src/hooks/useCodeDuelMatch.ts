import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { CodeDuelState } from "../lib/codeDuelTypes";
import { useCodeDuelSocket } from "./useCodeDuelSocket";

/**
 * Merge the live WS state with a REST snapshot so a page has data even before
 * the socket joins (or if WebSockets are unavailable). The WS payload is
 * authoritative; the REST snapshot fills the gap on first load.
 */
export function useCodeDuelMatch(matchId: string | null, viewerUserId?: string) {
  const { connected, state, panelStates, tabEvents, readyStates, lock, clearLock, sendMessage, sendTransientMessage, judgingResults, judgingTotal, liveTestResults, kicked } =
    useCodeDuelSocket(matchId, viewerUserId);
  const [snapshot, setSnapshot] = useState<CodeDuelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await api.get<CodeDuelState>(`/code-duel/${matchId}`);
      setSnapshot(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Không thể tải trận đấu.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Merge WS dynamic state with REST role-scoped snapshot:
  // WS broadcasts public state (stripped of unverified code for privacy),
  // while REST snapshot carries the viewer's private/staff view (full code, mySubmission, isStaff).
  const matchState = state
    ? {
        ...state,
        players: snapshot?.isStaff ? snapshot.players : state.players,
        isStaff: snapshot?.isStaff ?? false,
        mySubmission: snapshot?.mySubmission ?? state.mySubmission,
        reveal: snapshot?.isStaff && snapshot?.reveal ? snapshot.reveal : state.reveal,
      }
    : snapshot;

  return {
    connected,
    loading,
    error,
    state: matchState,
    isStaff: matchState?.isStaff ?? false,
    panelStates,
    tabEvents,
    readyStates,
    lock,
    clearLock,
    sendMessage,
    sendTransientMessage,
    refresh,
    judgingResults,
    judgingTotal,
    liveTestResults,
    kicked,
  };
}
