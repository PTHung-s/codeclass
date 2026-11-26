/**
 * QuizMarkdown — bộ render Markdown + Toán (KaTeX) + Code Syntax Highlighter dùng chung
 * cho toàn bộ hệ thống Trắc nghiệm (QuizManager, QuizRunner, AdaptiveQuizManager, AdaptiveQuizRunner).
 *
 * - Tự chuẩn hóa chuỗi `\\n` thành xuống dòng thật (tránh vỡ format ở màn hình review).
 * - Tự suy ngôn ngữ mặc định theo trình soạn thảo đang mở trên lớp (Python, C++, JS...).
 * - Phân biệt chuẩn inline code và block code (không biến nhầm block ngắn thành inline).
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useMeetingStore } from '../store/useMeetingStore';

interface QuizMarkdownProps {
  content: string;
  /** Chế độ gọn inline (dùng cho phương án A/B/C/D) */
  inline?: boolean;
  className?: string;
}

export const QuizMarkdown: React.FC<QuizMarkdownProps> = ({ content, inline = false, className = '' }) => {
  const defaultLang = useMeetingStore((s) => s.selectedLanguage?.name || 'python');
  const normalized = String(content || '').replace(/\\n/g, '\n');

  if (inline) {
    return (
      <span className={`break-words whitespace-pre-wrap ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <>{children}</>,
            code: ({ children, ...props }) => (
              <code
                className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em] font-semibold text-accent"
                {...props}
              >
                {children}
              </code>
            ),
          }}
        >
          {normalized}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={`prose prose-invert prose-sm max-w-none leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: ({ className: codeClass, children, ...props }: any) => {
            const match = /language-([\w+-]+)/.exec(codeClass || '');
            const text = String(children).replace(/\n$/, '');
            const isBlock = Boolean(match) || text.includes('\n');

            if (!isBlock) {
              return (
                <code
                  className="mx-0.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em] font-semibold text-accent"
                  {...props}
                >
                  {text}
                </code>
              );
            }

            const lang = (match ? match[1] : defaultLang).toLowerCase();
            return (
              <div className="my-2 w-full max-w-full overflow-hidden rounded-lg border border-line-strong shadow-md">
                <div className="flex items-center justify-between border-b border-line bg-overlay px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted">
                  <span>{lang}</span>
                </div>
                <SyntaxHighlighter
                  style={atomDark}
                  language={lang}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: '0.7rem 0.85rem',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    backgroundColor: '#12151c',
                    width: '100%',
                  }}
                >
                  {text}
                </SyntaxHighlighter>
              </div>
            );
          },
          pre: ({ children }) => <>{children}</>,
          p: ({ children, ...props }: any) => (
            <p className="my-1 whitespace-pre-wrap leading-relaxed" {...props}>
              {children}
            </p>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
};

export default QuizMarkdown;
