import { useEffect, useRef, useState, useCallback } from "react";

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const ignoreRef = useRef(false);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (ignoreRef.current) {
        ignoreRef.current = false;
        return;
      }

      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setSelection(null);
          return;
        }

        const text = sel.toString().trim();
        if (text.length < 3) {
          setSelection(null);
          return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top - 8,
        });
      }, 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-chat-ignore]")) {
        ignoreRef.current = true;
        return;
      }
      if (selection && !target.closest("[data-selection-tooltip]")) {
        setSelection(null);
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [selection]);

  return { selection, clearSelection };
}
