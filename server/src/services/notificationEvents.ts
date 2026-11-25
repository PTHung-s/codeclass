/**
 * Notification records stay in the database; this event only tells the
 * recipient's open clients to refresh their notification query immediately.
 */
export function notifyNotificationChanged(userId: string) {
  import("./gameWebSocket")
    .then(({ sendToUser }) => sendToUser(userId, { type: "notification_changed", payload: {} }))
    .catch(() => {});
}
