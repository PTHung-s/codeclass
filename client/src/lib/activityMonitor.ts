/**
 * ActivityMonitor — the single shared detector for browsing-away signals.
 *
 * Three features used to attach near-identical browser listeners separately:
 *   - presence reporting  (usePresenceReporter)
 *   - lesson recording    (useSessionRecorder)
 *   - quiz anti-cheat     (useAntiCheat)
 *
 * This module owns ALL of those raw listeners once, normalizes the signals,
 * and lets every consumer subscribe. Consumers keep their own policies
 * (idle thresholds, reporting cadence, heart rules) — they just stop wiring
 * the raw DOM events themselves.
 *
 * Listeners are ref-counted: attached when the first subscriber subscribes,
 * detached when the last one leaves (safe under StrictMode double-mount).
 */

export type ActivityEvent =
  | { type: "windowBlur" } // window lost focus (another window / tab covering, alt-tab…)
  | { type: "windowFocus" } // window regained focus
  | { type: "tabHidden" } // document.hidden === true (the tab itself is hidden)
  | { type: "tabVisible" } // document.hidden === false
  | { type: "fullscreenExit" } // left fullscreen
  | { type: "inputActivity" }; // any mouse/keyboard interaction (drives idle timers)

export interface ActivityState {
  windowFocused: boolean;
  tabVisible: boolean;
  lastInputAt: number;
}

type Subscriber = (e: ActivityEvent) => void;

// ── shared listener state ──
let count = 0;
let windowFocused = typeof document !== "undefined" ? document.hasFocus() : true;
let tabVisible = typeof document !== "undefined" ? !document.hidden : true;
let lastInputAt = Date.now();
let wasFullscreen = false;

const INPUT_EVENTS = ["mousemove", "keydown", "mousedown", "click", "scroll", "touchstart"] as const;

function onBlur() {
  windowFocused = false;
  emit({ type: "windowBlur" });
}
function onFocus() {
  windowFocused = true;
  lastInputAt = Date.now();
  emit({ type: "windowFocus" });
}
function onVisibility() {
  tabVisible = !document.hidden;
  lastInputAt = Date.now();
  emit(tabVisible ? { type: "tabVisible" } : { type: "tabHidden" });
}
function onFullscreenChange() {
  const isFull = !!document.fullscreenElement;
  const exiting = wasFullscreen && !isFull;
  wasFullscreen = isFull;
  if (exiting) emit({ type: "fullscreenExit" });
}
function onInput() {
  lastInputAt = Date.now();
  emit({ type: "inputActivity" });
}

function attach() {
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  for (const evt of INPUT_EVENTS) {
    window.addEventListener(evt, onInput, { passive: true });
  }
  wasFullscreen = !!document.fullscreenElement;
}

function detach() {
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("focus", onFocus);
  document.removeEventListener("visibilitychange", onVisibility);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  for (const evt of INPUT_EVENTS) {
    window.removeEventListener(evt, onInput);
  }
}

const subscribers = new Set<Subscriber>();
function emit(e: ActivityEvent) {
  for (const cb of subscribers) {
    try {
      cb(e);
    } catch {
      // a broken subscriber must not break the others
    }
  }
}

/** Subscribe to normalized activity events. Returns an unsubscribe function. */
export function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb);
  if (count === 0) attach();
  count++;
  return () => {
    subscribers.delete(cb);
    count--;
    if (count === 0) detach();
  };
}

/** Read the current shared focus/activity snapshot (for initial state). */
export function getState(): ActivityState {
  return { windowFocused, tabVisible, lastInputAt };
}
