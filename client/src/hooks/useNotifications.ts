import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import api from "../lib/api";
import { socketSubscribe } from "../lib/socket";

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

function normalizeNotifications(payload: unknown): Notification[] {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as { notifications?: unknown; data?: unknown; items?: unknown }).notifications
        ?? (payload as { data?: unknown }).data
        ?? (payload as { items?: unknown }).items
      : [];

  if (!Array.isArray(candidates)) return [];

  return candidates.filter((item): item is Notification => {
    if (!item || typeof item !== "object") return false;
    const notification = item as Partial<Notification>;
    return (
      typeof notification.id === "string" &&
      typeof notification.title === "string" &&
      typeof notification.message === "string" &&
      typeof notification.type === "string" &&
      typeof notification.isRead === "boolean" &&
      typeof notification.createdAt === "string"
    );
  });
}

export function useNotifications() {
  const qc = useQueryClient();
  const sessionStartRef = useRef(new Date());
  const prevIdsRef = useRef<Set<string>>(new Set());

  const { data: notifications = [], refetch } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => normalizeNotifications(r.data)),
  });

  useEffect(() => socketSubscribe((message) => {
    if (message.type === "notification_changed" || message.type === "__socket_open") {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }), [qc]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Detect new notifications and emit toast events
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const currentIds = new Set(notifications.map((n) => n.id));
    // Skip on first load
    if (prevIdsRef.current.size === 0) {
      prevIdsRef.current = currentIds;
      return;
    }
    const sessionStart = sessionStartRef.current;
    const newNotifs = notifications.filter(
      (n) =>
        !prevIdsRef.current.has(n.id) &&
        !n.isRead &&
        new Date(n.createdAt) > sessionStart
    );

    newNotifs.forEach((n) => {
      const event = new CustomEvent("codeclass:toast", {
        detail: {
          id: n.id,
          title: n.title,
          message: n.message,
          type: toastType(n.type),
        },
      });
      window.dispatchEvent(event);
    });

    prevIdsRef.current = currentIds;
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    refetch,
  };
}

function toastType(notificationType: string): "success" | "warning" | "info" | "error" {
  switch (notificationType) {
    case "assignment_published":
      return "info";
    case "submission_reviewed":
      return "success";
    case "revision_requested":
      return "warning";
    case "late_submission":
      return "warning";
    case "new_submission":
      return "info";
    default:
      return "info";
  }
}
