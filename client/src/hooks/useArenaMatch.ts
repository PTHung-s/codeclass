import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { useArenaSocket } from "./useArenaSocket";
import { isStaff as checkIsStaff } from "../lib/roles";
import type { ArenaState } from "../lib/arenaTypes";

/**
 * One arena's live state, assembled from the WebSocket and the REST snapshot.
 *
 * Both arena pages used to carry their own copy of this merge, and the two
 * copies had to stay in step by hand. The merge rules are load-bearing:
 *
 *  1. While the socket is connected, WS is authoritative for public data
 *     (phase, timer, players, submittedUserIds).
 *  2. REST supplies the per-viewer `myAnswer`, which `syncState` strips out of
 *     the broadcast — without it a reload mid-question forgets that you already
 *     submitted and offers the submit button again.
 *  3. A null `wsState.question` must NOT overwrite a live `restState.question`.
 *     The server sets `question: null` on purpose during reveal and podium, and
 *     letting that through blanks the screen during the handover.
 *
 * REST polling is a recovery path only: it runs at 5 s while the socket is down
 * and the match is in progress, and is otherwise off.
 */
export function useArenaMatch(arenaId: string | null, viewerId: string | undefined, role: string | undefined) {
  const socket = useArenaSocket(arenaId, viewerId);
  const { connected, state: wsState } = socket;

  const { data: restState, isLoading } = useQuery<ArenaState>({
    queryKey: ["arena", arenaId],
    queryFn: () => api.get(`/arenas/${arenaId}`).then((r) => r.data),
    enabled: !!arenaId,
    staleTime: 2000,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (!connected && s && s.match.status === "in_progress") return 5000;
      return false;
    },
  });

  const state = useMemo<ArenaState | null>(() => {
    if (!wsState || !restState) return wsState || restState || null;
    return {
      ...restState,
      ...wsState,
      match: { ...restState.match, ...wsState.match },
      ...(wsState.question !== null || restState.question === undefined
        ? { question: wsState.question }
        : { question: restState.question }),
    };
  }, [wsState, restState]);

  const isStaff = checkIsStaff(role);
  const isPlayer = !!state?.players.some((p) => p.userId === viewerId);
  // `/start` is staff-only, but the server's assertCanControl also lets whoever
  // created a practice match `/skip` and `/end` it. Keep the two separate:
  // `isStaff` gates start, `isHost` gates skip/end.
  const isHost = isStaff || (state?.match.mode === "practice" && isPlayer);

  return {
    ...socket,
    state,
    isLoading,
    isStaff,
    isPlayer,
    isHost,
    phase: state?.match.phase || "lobby",
    status: state?.match.status || "lobby",
  };
}
