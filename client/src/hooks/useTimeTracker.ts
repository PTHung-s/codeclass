import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL = 60_000;
const TICK_INTERVAL = 1_000;

/** Send heartbeat using raw fetch — avoids axios 401 interceptor that logs out the user */
function sendHeartbeat(activeSeconds: number, tabOuts: number) {
  const token = localStorage.getItem("token");
  if (!token) return;
  fetch("/api/tracking/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ activeSeconds, tabOuts }),
  }).catch(() => {});
}

export function useTimeTracker() {
  const activeRef = useRef(0);
  const outsRef = useRef(0);

  useEffect(() => {
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const handleVisibility = () => {
      if (document.hidden) {
        outsRef.current += 1;
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      } else {
        if (!tickTimer) {
          tickTimer = setInterval(() => { activeRef.current += 1; }, TICK_INTERVAL);
        }
      }
    };

    if (!document.hidden) {
      tickTimer = setInterval(() => { activeRef.current += 1; }, TICK_INTERVAL);
    }

    heartbeatTimer = setInterval(() => {
      const seconds = activeRef.current;
      const outs = outsRef.current;
      if (seconds === 0 && outs === 0) return;
      activeRef.current = 0;
      outsRef.current = 0;
      sendHeartbeat(seconds, outs);
    }, HEARTBEAT_INTERVAL);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      const seconds = activeRef.current;
      const outs = outsRef.current;
      if (seconds > 0 || outs > 0) sendHeartbeat(seconds, outs);
      if (tickTimer) clearInterval(tickTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}
