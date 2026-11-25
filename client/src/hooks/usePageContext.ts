import { useRef, useCallback } from "react";

export function usePageContext() {
  const lastPathRef = useRef<string>("");
  const sentForPathRef = useRef<Set<string>>(new Set());

  const getPageContext = useCallback((): { context: string; isNew: boolean } | null => {
    const path = window.location.pathname;

    if (sentForPathRef.current.has(path)) {
      return null;
    }

    const main = document.querySelector("main");
    if (!main) return null;

    let content = "";

    const heading = main.querySelector("h1, h2");
    if (heading) {
      content += `Tiêu đề trang: ${heading.textContent?.trim()}\n`;
    }

    const lessonContent = main.querySelector(".lesson-content");
    if (lessonContent) {
      const text = lessonContent.textContent || "";
      content += `Nội dung bài học: ${text.slice(0, 2500).trim()}`;
    } else {
      const problemContent = main.querySelector("[data-page='problem']");
      if (problemContent) {
        content += `Nội dung bài tập: ${problemContent.textContent?.slice(0, 2000).trim()}`;
      } else {
        const mainText = main.textContent || "";
        const clean = mainText.replace(/\s+/g, " ").trim().slice(0, 1500);
        content += `Nội dung trang: ${clean}`;
      }
    }

    const trimmed = content.trim();
    if (!trimmed) return null;

    sentForPathRef.current.add(path);
    lastPathRef.current = path;

    return {
      context: `[Tôi đang ở trang: ${path}]\n${trimmed}`,
      isNew: true,
    };
  }, []);

  const resetPath = useCallback((path?: string) => {
    if (path) {
      sentForPathRef.current.delete(path);
    } else {
      sentForPathRef.current.delete(lastPathRef.current);
    }
  }, []);

  return { getPageContext, resetPath };
}
