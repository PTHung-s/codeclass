import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, Copy, Check, Bot, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';

const CodeTerminal: React.FC = () => {
  const { output, isRunning, lastRunMeta, setOutput, attachToAi } = useMeetingStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTo({
        top: terminalRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [output]);

  const handleClear = () => {
    setOutput('');
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isError = lastRunMeta
    ? lastRunMeta.status === 'error'
    : output.includes('Error') || output.includes('error') || output.includes('Exit Code:');

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-raised border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex gap-1.5 mr-1 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <Terminal size={14} className="text-gray-400 shrink-0" />
          <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider truncate">
            Output Terminal
          </span>
          {isRunning && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
              <Loader2 size={10} className="animate-spin" /> Đang chạy…
            </span>
          )}
          {!isRunning && lastRunMeta && (
            <span
              key={lastRunMeta.at}
              className={`anim-badge-pop inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                lastRunMeta.status === 'ok'
                  ? 'bg-ok/15 text-ok'
                  : 'bg-danger/15 text-danger'
              }`}
            >
              {lastRunMeta.status === 'ok' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {lastRunMeta.status === 'ok' ? 'Thành công' : 'Có lỗi'} · {lastRunMeta.durationMs}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => attachToAi(output, 'kết quả output terminal', 'terminal')}
            disabled={!output}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all active:scale-95 mr-1 ${
              output
                ? 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20'
                : 'opacity-50 cursor-not-allowed'
            }`}
            title="Giải thích lỗi/output với AI"
          >
            <Bot size={12} />
            <span className="text-[10px] font-bold uppercase tracking-wider">AI</span>
          </button>
          <button
            onClick={handleCopy}
            disabled={!output}
            className={`p-1.5 rounded transition-all active:scale-95 ${
              output
                ? 'text-gray-500 hover:text-white hover:bg-line'
                : 'text-gray-700 cursor-not-allowed'
            }`}
            title="Copy output"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-line rounded transition-all active:scale-95"
            title="Xóa terminal"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Shimmer progress bar khi đang biên dịch / chạy */}
      {isRunning && (
        <div className="h-[2px] w-full overflow-hidden bg-accent/15">
          <div className="anim-terminal-shimmer h-full w-1/2 bg-gradient-to-r from-transparent via-accent to-transparent" />
        </div>
      )}

      {/* Terminal Output */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[13px] scroll-smooth custom-scrollbar"
      >
        {output ? (
          <div key={lastRunMeta?.at || 'out'} className="relative rounded-ctl px-2 py-1 anim-output-flash">
            <div
              className={`absolute left-[-8px] top-0 bottom-0 w-[2px] rounded-full ${
                isError ? 'bg-danger/60' : 'bg-ok/50'
              }`}
            />
            <pre
              className={`whitespace-pre-wrap break-words leading-relaxed ${
                isError ? 'text-red-400' : 'text-green-400'
              }`}
            >
              {output}
            </pre>
          </div>
        ) : (
          <div className="text-gray-600 flex flex-col items-center justify-center h-full opacity-40">
            <Terminal size={32} className="mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest">
              {isRunning ? 'Đang chạy chương trình...' : 'Sẵn sàng thực thi'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeTerminal;
