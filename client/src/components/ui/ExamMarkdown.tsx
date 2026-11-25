import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlighter, oneDark } from "./CodeHighlighter";

/**
 * Markdown renderer kiểu Codeforces cho đề thi:
 * - ```cpp / ```python → khối code syntax-highlight
 * - ```input / ```output / ```example → ô ví dụ kiểu CF (header + mono)
 * - **Input** / **Output** / bảng / heading render sạch sẽ
 */
export default function ExamMarkdown({ content, compact = false }: { content: string; compact?: boolean }) {
  return (
    <div className={`exam-md min-w-0 break-words text-foreground ${compact ? "text-sm leading-relaxed" : "text-[0.95rem] leading-7"}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold first:mt-0">{children}</h2>,
          h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h3>,
          h3: ({ children }) => (
            <h4 className="mb-1.5 mt-4 text-sm font-bold uppercase tracking-wide text-foreground/80 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-border bg-muted/60 px-3 py-1.5 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border/60 px-3 py-1.5 align-top">{children}</td>,
          pre: ({ children }) => <>{children}</>,
          code({ className: languageClass, children, ...props }) {
            const language = /language-([\w-]+)/.exec(languageClass || "")?.[1];
            const code = String(children).replace(/\n$/, "");

            // Codeforces-style example boxes
            if (language === "input" || language === "output" || language === "example") {
              const label = language === "example" ? "Ví dụ" : language === "input" ? "Input" : "Output";
              return (
                <div className="my-2 overflow-hidden rounded-lg border border-border bg-muted/40">
                  <div className="border-b border-border bg-muted/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  <pre className="overflow-x-auto px-3 py-2 font-mono text-[0.82rem] leading-6">{code}</pre>
                </div>
              );
            }

            if (language) {
              return (
                <div className="my-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950">
                  <SyntaxHighlighter
                    language={language}
                    style={oneDark}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: 0,
                      fontSize: "0.82rem",
                      lineHeight: 1.6,
                      padding: "0.75rem 1rem",
                      background: "#09090b",
                    }}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-rose-700 dark:text-rose-300" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
