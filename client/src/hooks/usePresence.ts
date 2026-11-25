import { useEffect, useState } from "react";
import { socketSubscribe } from "../lib/socket";

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
}

/** Live list of currently-connected students, pushed from the server via WS. */
export function usePresence() {
  const [students, setStudents] = useState<PresenceStudent[]>([]);

  useEffect(() => {
    const unsub = socketSubscribe((msg) => {
      if (msg.type === "presence_list" && Array.isArray(msg.payload?.students)) {
        setStudents(msg.payload.students);
      }
    });
    return unsub;
  }, []);

  return students;
}
