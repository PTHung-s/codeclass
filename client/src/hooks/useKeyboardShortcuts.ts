import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger inside inputs, textareas, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "d":
            e.preventDefault();
            navigate("/dashboard");
            break;
          case "c":
            e.preventDefault();
            navigate("/courses");
            break;
          case "p":
            e.preventDefault();
            navigate("/problems");
            break;
          case "m":
            e.preventDefault();
            navigate("/materials");
            break;
          case "s":
            e.preventDefault();
            navigate("/settings");
            break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
