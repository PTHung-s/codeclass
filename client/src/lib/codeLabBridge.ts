import type { NavigateFunction } from "react-router-dom";
import type { SupportedLanguage } from "./codeRunner";

const HANDOFF_STORAGE_KEY = "codelab.handoff.v1";

export interface CodeLabHandoff {
  code: string;
  language: SupportedLanguage;
  fileName?: string;
  inputText?: string;
  runMode?: "interactive" | "file";
  sourceLabel?: string;
}

export function openInCodeLab(navigate: NavigateFunction, payload: CodeLabHandoff) {
  try {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // fallback silently
  }
  navigate("/code-lab");
}

export function consumeCodeLabHandoff(): CodeLabHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.code !== "string") return null;
    const language: SupportedLanguage = parsed.language === "cpp" ? "cpp" : "python";
    return {
      code: parsed.code,
      language,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : undefined,
      inputText: typeof parsed.inputText === "string" ? parsed.inputText : undefined,
      runMode: parsed.runMode === "file" || parsed.runMode === "interactive" ? parsed.runMode : undefined,
      sourceLabel: typeof parsed.sourceLabel === "string" ? parsed.sourceLabel : undefined,
    };
  } catch {
    return null;
  }
}
