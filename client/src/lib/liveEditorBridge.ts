export interface LiveEditorSnapshot {
  code: string;
  language: string;
  label: string;
  source: "problem" | "code_lab" | "lesson" | "exam" | "workspace" | "other";
  updatedAt: number;
}

type Listener = (snap: LiveEditorSnapshot | null) => void;

let currentSnapshot: LiveEditorSnapshot | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) {
    try {
      fn(currentSnapshot);
    } catch {
      // keep listeners isolated
    }
  }
}

/** Publish the student's active editor buffer for live teacher monitoring and recording. */
export function publishLiveEditor(snap: Omit<LiveEditorSnapshot, "updatedAt">): void {
  const code = typeof snap.code === "string" ? snap.code.slice(0, 20_000) : "";
  const label = (snap.label || "").trim().slice(0, 140) || "Trình soạn thảo";
  const language = snap.language || "python";
  if (
    currentSnapshot &&
    currentSnapshot.source === snap.source &&
    currentSnapshot.label === label &&
    currentSnapshot.language === language &&
    currentSnapshot.code === code
  ) {
    return;
  }
  currentSnapshot = {
    code,
    language,
    label,
    source: snap.source,
    updatedAt: Date.now(),
  };
  notify();
}

/** Clear active editor state on unmount (guarded by source to avoid route transition races). */
export function clearLiveEditor(source?: LiveEditorSnapshot["source"]): void {
  if (!currentSnapshot) return;
  if (source && currentSnapshot.source !== source) return;
  currentSnapshot = null;
  notify();
}

export function getLiveEditorSnapshot(): LiveEditorSnapshot | null {
  return currentSnapshot;
}

export function subscribeLiveEditor(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
