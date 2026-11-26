import React, { useState, useRef, useEffect } from 'react';
import { apiUrl } from '../services/apiBase';
import { Bot, Send, User, Loader2, Sparkles, Trash2, X, FileText, Terminal, Code2, Database, Copy, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useMeetingStore } from '../store/useMeetingStore';
import type { AiMessage } from '../types/ai';
import { getSessionToken } from '../lib/roomState';
import { uiConfirm } from '../store/useUiStore';

const AiCodeBlock: React.FC<{ lang?: string; codeText: string }> = ({ lang, codeText }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(codeText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-line-strong bg-[#11141b] shadow-md">
      <div className="flex items-center justify-between border-b border-line bg-overlay/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted transition-colors hover:bg-line hover:text-white active:scale-95"
        >
          {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
          {copied ? 'Đã chép' : 'Chép'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto custom-scrollbar text-xs leading-relaxed text-gray-200 font-mono">
        <code>{codeText}</code>
      </pre>
    </div>
  );
};

const QUICK_HINTS = [
  { icon: Code2, text: 'Giải thích đoạn code này từng dòng' },
  { icon: Terminal, text: 'Tìm lỗi logic & đề xuất cách sửa' },
  { icon: Sparkles, text: 'Gợi ý tối ưu độ phức tạp thuật toán' },
];

const AIAssistant: React.FC = () => {
  const {
    roomId,
    userName,
    aiMessages,
    addAiMessage,
    clearAiMessages,
    aiInput,
    setAiInput,
    aiAttachments,
    removeAiAttachment,
    clearAiAttachments,
  } = useMeetingStore();

  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiMessages, isLoading]);

  const handleSend = async () => {
    if ((!aiInput.trim() && aiAttachments.length === 0) || isLoading) return;

    const finalPrompt = aiInput.trim() || 'Hãy phân tích các thông tin đã đính kèm giúp tôi.';
    const displayMsg = aiInput.trim() || `Phân tích ${aiAttachments.length} đối tượng đã đính kèm`;
    const currentAttachments = [...aiAttachments];

    setAiInput('');
    clearAiAttachments();

    const newUserMsg: AiMessage = {
      role: 'user',
      parts: [{ text: displayMsg }],
      attachments: currentAttachments,
    };
    addAiMessage(newUserMsg);
    setIsLoading(true);

    try {
      const tk = localStorage.getItem('token') || '';
      const response = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
        },
        body: JSON.stringify({
          message: finalPrompt,
          history: aiMessages.slice(-10),
          attachments: currentAttachments,
          roomId,
          userName,
          sessionToken: getSessionToken(),
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({} as any));
        throw new Error(errBody.error || `Lỗi server (${response.status})`);
      }
      const data = await response.json();

      if (data.reply) {
        addAiMessage({ role: 'model', parts: [{ text: data.reply }] });
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('AI Assistant Error:', error);
      addAiMessage({
        role: 'model',
        parts: [{ text: 'Xin lỗi, tôi gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng kiểm tra kết nối / API key rồi thử lại.' }],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getAttachmentIcon = (type: string) => {
    switch (type) {
      case 'code': return <Code2 size={12} />;
      case 'assignment': return <FileText size={12} />;
      case 'terminal': return <Terminal size={12} />;
      case 'input': return <Database size={12} />;
      default: return <FileText size={12} />;
    }
  };

  const clearChat = async () => {
    if (await uiConfirm('Bạn có chắc muốn xóa lịch sử trò chuyện với AI?', { title: 'Xóa lịch sử AI', danger: true })) {
      clearAiMessages();
      if (roomId) {
        const tk = localStorage.getItem('token') || '';
        fetch(apiUrl('/api/ai/history'), {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
          },
          body: JSON.stringify({ roomId, sessionToken: getSessionToken() }),
        }).catch(() => {});
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-raised">
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {aiMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-5 space-y-5">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-accent/15 blur-2xl" />
              <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 to-overlay text-accent shadow-lg">
                <Bot size={28} />
              </div>
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-white font-extrabold text-base">Trợ lý AI lập trình</h3>
              <p className="text-muted text-xs leading-relaxed">
                Hỗ trợ giải thích code, phân tích câu trắc nghiệm làm sai, tìm bug và gợi ý thuật toán lập trình.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {QUICK_HINTS.map(({ icon: Icon, text }) => (
                <button
                  key={text}
                  onClick={() => setAiInput(text)}
                  className="group flex items-center gap-2.5 text-left px-3.5 py-2.5 bg-overlay/80 hover:bg-elevated border border-line hover:border-accent/40 rounded-xl text-xs text-gray-300 hover:text-white transition-all active:scale-[0.99]"
                >
                  <Icon size={14} className="text-accent shrink-0" />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {aiMessages.map((msg) => (
          <div
            key={msg.id}
            className={`anim-msg flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === 'user'
                  ? 'bg-elevated border border-line-strong text-white'
                  : 'bg-accent text-accent-ink shadow-sm'
              }`}
            >
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed markdown-content ${
                msg.role === 'user'
                  ? 'bg-accent/15 text-white border border-accent/30 rounded-tr-sm'
                  : 'bg-overlay text-gray-200 border border-line-strong rounded-tl-sm shadow-sm'
              }`}
            >
              {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-accent/20">
                  {msg.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-1 px-2 py-0.5 bg-base/60 border border-accent/30 rounded-md text-[10px] text-accent font-semibold"
                    >
                      {getAttachmentIcon(att.type)}
                      <span className="max-w-[120px] truncate">{att.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <Markdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ className, children }: any) {
                    const match = /language-([\w+-]+)/.exec(className || '');
                    const raw = String(children).replace(/\n$/, '');
                    const isBlock = Boolean(match) || raw.includes('\n');
                    return isBlock ? (
                      <AiCodeBlock lang={match?.[1]} codeText={raw} />
                    ) : (
                      <code className="bg-white/10 px-1.5 py-0.5 rounded text-accent font-mono text-[12px] font-semibold">
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <>{children}</>,
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-accent/40 pl-3 italic text-muted my-2">{children}</blockquote>
                  ),
                }}
              >
                {msg.parts?.[0]?.text ?? ''}
              </Markdown>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2.5 items-center">
            <div className="w-7 h-7 rounded-xl bg-accent/20 border border-accent/35 text-accent flex items-center justify-center shrink-0">
              <Loader2 size={14} className="animate-spin" />
            </div>
            <div className="bg-overlay border border-line-strong px-3.5 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-accent/80 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-accent/80 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-accent/80 rounded-full animate-bounce [animation-delay:-0.3s]" />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3.5 bg-overlay/80 border-t border-line">
        {aiAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {aiAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/15 border border-accent/30 rounded-lg text-[11px] font-semibold text-accent animate-in fade-in zoom-in"
              >
                {getAttachmentIcon(attachment.type)}
                <span className="max-w-[130px] truncate">{attachment.label}</span>
                <button
                  onClick={() => removeAiAttachment(attachment.id)}
                  className="hover:text-white transition-colors ml-0.5 p-0.5 hover:bg-accent/20 rounded"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={aiAttachments.length > 0 ? 'Đặt câu hỏi về các mục đã đính kèm...' : 'Hỏi AI về bài tập, code hoặc câu trắc nghiệm...'}
            className="w-full bg-base/90 border border-line-strong rounded-xl p-3 pr-12 text-xs text-white placeholder:text-muted/70 focus:outline-none focus:border-accent resize-none transition-colors"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={(!aiInput.trim() && aiAttachments.length === 0) || isLoading}
            className={`absolute right-2.5 bottom-2.5 p-2 rounded-lg transition-all ${
              (aiInput.trim() || aiAttachments.length > 0) && !isLoading
                ? 'bg-accent text-accent-ink shadow-md shadow-accent/20 hover:brightness-110 active:scale-90'
                : 'bg-elevated text-muted disabled:cursor-not-allowed'
            }`}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-accent" />
            <span className="text-[10px] font-semibold text-muted">Trợ lý AI · Hỗ trợ Markdown & KaTeX</span>
          </div>
          {aiMessages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1 hover:bg-danger/15 rounded-ctl text-muted hover:text-danger transition-all"
              title="Xóa lịch sử"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <style>{`
        .markdown-content h1 { font-size: 1.15rem; font-weight: 800; margin-bottom: 0.6rem; color: white; }
        .markdown-content h2 { font-size: 1.02rem; font-weight: 700; margin-bottom: 0.5rem; color: white; }
        .markdown-content h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 0.4rem; color: white; }
        .markdown-content table { border-collapse: collapse; width: 100%; margin-bottom: 0.75rem; font-size: 12px; }
        .markdown-content th, .markdown-content td { border: 1px solid rgba(255,255,255,0.1); padding: 6px 8px; text-align: left; }
        .markdown-content th { background: rgba(255,255,255,0.05); color: white; }
      `}</style>
    </div>
  );
};

export default AIAssistant;
