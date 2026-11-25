/**
 * Monaco setup shared by every arena surface — live match, staff peek, review.
 *
 * `editor.background` is deliberately the same `#0B1220` the arena shell paints,
 * so the editor melts into the page instead of sitting on it as a lighter box.
 * Anything that renders arena code must use this theme; `theme="vs-dark"` looks
 * close but is a different grey and gives the seam away.
 */

export const ARENA_BG = "#0B1220";

export const ARENA_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 15,
  lineHeight: 24,
  fontLigatures: true,
  lineNumbersMinChars: 3,
  scrollBeyondLastLine: false,
  wordWrap: "off" as const,
  automaticLayout: true,
  padding: { top: 16, bottom: 16 },
  renderLineHighlight: "all" as const,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on" as const,
};

/** Read-only variant for the "look, don't touch" panels (peek, reveal, review). */
export const ARENA_READONLY_OPTIONS = {
  ...ARENA_EDITOR_OPTIONS,
  readOnly: true,
  lineNumbers: "on" as const,
};

export function configureArenaEditor(monaco: any) {
  monaco.editor.defineTheme("codeclass-arena", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "64748B", fontStyle: "italic" },
      { token: "keyword", foreground: "C084FC" },
      { token: "string", foreground: "86EFAC" },
      { token: "number", foreground: "FBBF24" },
      { token: "type", foreground: "67E8F9" },
    ],
    colors: {
      "editor.background": ARENA_BG,
      "editor.foreground": "#E5EDF8",
      "editorGutter.background": ARENA_BG,
      "editorLineNumber.foreground": "#536174",
      "editorLineNumber.activeForeground": "#CBD5E1",
      "editor.lineHighlightBackground": "#142033",
      "editor.selectionBackground": "#334B6E99",
      "editor.inactiveSelectionBackground": "#27384F88",
      "editorCursor.foreground": "#F8FAFC",
      "editorIndentGuide.background1": "#1E293B",
      "editorIndentGuide.activeBackground1": "#475569",
    },
  });
}

export const langOf = (language: string) => (language === "cpp" ? "cpp" : "python");
export const langLabel = (language: string) => (language === "cpp" ? "C++" : "Python");
