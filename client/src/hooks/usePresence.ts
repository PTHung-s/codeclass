import { useEffect, useState } from "react";
import api from "../lib/api";
import { socketSendIfOpen, socketSubscribe } from "../lib/socket";

export type PresenceStatus = "online" | "idle" | "away" | "offline";

export interface PresenceStudent {
  userId: string;
  fullName: string;
  nickname?: string | null;
  avatarUrl: string | null;
  status: PresenceStatus;
  activityType: string;
  activityLabel: string;
  lastActiveAt: number;
  code?: string | null;
  codeLanguage?: string | null;
  codeLabel?: string | null;
  codeUpdatedAt?: number | null;
}

/**
 * Live list of currently-connected students.
 * Immediately hydrates via REST + WS sync request on mount so navigating to
 * /monitor never shows an empty list waiting for the next student heartbeat.
 */
export function usePresence() {
  const [students, setStudents] = useState<PresenceStudent[]>([]);

  useEffect(() => {
    let mounted = true;

    const hydrate = () => {
      api
        .get("/recordings/presence")
        .then((res) => {
          if (mounted && Array.isArray(res.data?.students)) {
            setStudents(res.data.students);
          }
        })
        .catch(() => {
          /* ignore transient errors; WS stream will recover */
        });
      socketSendIfOpen("presence_sync_request", {});
    };

    hydrate();

    const unsub = socketSubscribe((msg) => {
      if (msg.type === "presence_list" && Array.isArray(msg.payload?.students)) {
        setStudents(msg.payload.students);
      } else if (msg.type === "__socket_open") {
        hydrate();
      }
    });

    const fallbackPoll = setInterval(() => {
      api
        .get("/recordings/presence")
        .then((res) => {
          if (mounted && Array.isArray(res.data?.students)) {
            setStudents(res.data.students);
          }
        })
        .catch(() => {});
    }, 15_000);

    return () => {
      mounted = false;
      clearInterval(fallbackPoll);
      unsub();
    };
  }, []);

  return students;
}
