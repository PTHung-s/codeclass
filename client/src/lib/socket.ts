// Compatibility facade for existing UI hooks. Realtime transport is Centrifugo;
// application commands travel through its authenticated RPC proxy.
import {
  centrifugoIsOpen,
  onCentrifugoEvent,
  sendCentrifugoCommand,
} from "./centrifugo";

type Handler = (msg: any) => void;

/** Subscribe to all events delivered over the shared Centrifugo connection. */
export function socketSubscribe(fn: Handler): () => void {
  return onCentrifugoEvent(fn);
}

/** Queue a reliable application command until Centrifugo reconnects. */
export function socketSend(type: string, payload: any) {
  sendCentrifugoCommand(type, payload, true);
}

/** Send a transient command only while the realtime connection is live. */
export function socketSendIfOpen(type: string, payload: any): boolean {
  return sendCentrifugoCommand(type, payload, false);
}

export function socketIsOpen(): boolean {
  return centrifugoIsOpen();
}
