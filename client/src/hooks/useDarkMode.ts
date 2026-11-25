import { useState, useEffect, useCallback } from "react";

const DARK_MODE_EVENT = "codeclass:dark-mode-change";

function readInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("dark")) return true;
  const saved = localStorage.getItem("darkMode");
  if (saved !== null) return saved === "true";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(readInitialDark);

  useEffect(() => {
    const onThemeChange = (ev: Event) => {
      const next = (ev as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setDark(next);
    };
    window.addEventListener(DARK_MODE_EVENT, onThemeChange);
    return () => window.removeEventListener(DARK_MODE_EVENT, onThemeChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("darkMode", String(dark));
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      window.dispatchEvent(new CustomEvent(DARK_MODE_EVENT, { detail: next }));
      return next;
    });
  }, []);

  return { dark, toggle };
}
