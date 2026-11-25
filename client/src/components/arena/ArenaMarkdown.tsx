import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { SyntaxHighlighter, oneDark } from "../ui/CodeHighlighter";
import { cn } from "../../lib/utils";

function normalizeNewlines(content: string) {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/(?<!\n)\n(?!\n)/g, "  \n");
}

export function ArenaMarkdown({
  content,
  className,
  variant = "default",
}: {
  content: string;
  className?: string;
  variant?: "default" | "document";
}) {
  const document = variant === "document";
  return (
    <div
      className={cn(
        "arena-markdown min-w-0 break-words text-sm leading-relaxed text-foreground",
        document && "text-[1.05rem] leading-8",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className: languageClass, children, ...props }) {
            const language = /language-([\w-]+)/.exec(languageClass || "")?.[1];
            const code = String(children).replace(/\n$/, "");
            if (language) {
              return (
                <div className="my-6 max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm">
                  <SyntaxHighlighter
                    language={language}
                    style={oneDark}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      minWidth: "max-content",
                      borderRadius: 0,
                      fontSize: "0.8125rem",
                      lineHeight: "1.55",
                      padding: "0.875rem 1rem",
                      background: "#09090b",
                    }}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code
                className="whitespace-pre-wrap rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1
              className={
                document
                  ? "mb-6 mt-10 border-b border-border pb-4 text-3xl font-bold tracking-tight text-foreground first:mt-0"
                  : "mb-3 mt-5 text-2xl font-bold text-foreground"
              }
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className={
                document
                  ? "mb-4 mt-10 text-2xl font-bold tracking-tight text-foreground"
                  : "mb-2 mt-4 text-xl font-bold text-foreground"
              }
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className={
                document
                  ? "mb-3 mt-7 text-lg font-semibold text-foreground"
                  : "mb-2 mt-3 text-lg font-semibold text-foreground"
              }
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 mt-5 font-semibold text-foreground">{children}</h4>
          ),
          p: ({ children }) => (
            <p className={document ? "mb-5 leading-8 text-foreground/90 last:mb-0" : "mb-2 text-foreground/90 last:mb-0"}>
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul
              className={
                document
                  ? "my-5 list-disc space-y-2 pl-6 leading-7 text-foreground/90 marker:text-muted-foreground"
                  : "my-2 list-disc space-y-1 pl-5 text-foreground/90"
              }
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className={
                document
                  ? "my-5 list-decimal space-y-2 pl-6 leading-7 text-foreground/90 marker:font-semibold marker:text-muted-foreground"
                  : "my-2 list-decimal space-y-1 pl-5 text-foreground/90"
              }
            >
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="text-foreground/90">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote
              className={
                document
                  ? "my-6 border-l-4 border-primary/40 bg-muted/50 px-5 py-4 text-foreground/85"
                  : "my-3 border-l-2 border-border pl-3 text-muted-foreground"
              }
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-8 border-border" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-6 max-w-full overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-max border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border bg-muted px-3 py-2.5 font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-3 py-2.5 align-top text-foreground/90">{children}</td>
          ),
        }}
      >
        {document
          ? (content || "").replace(/<br\s*\/?>/gi, "\n")
          : normalizeNewlines(content || "")}
      </ReactMarkdown>
    </div>
  );
}
