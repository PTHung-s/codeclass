/**
 * Fire-and-forget user-scoped events. Dynamic import avoids a startup cycle:
 * the websocket service itself imports services that can award XP/tokens.
 */
export function notifyWalletChanged(userId: string) {
  import("../services/gameWebSocket")
    .then(({ sendToUser }) => sendToUser(userId, { type: "wallet_changed", payload: {} }))
    .catch(() => {});
}
