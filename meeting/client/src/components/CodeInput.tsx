import React from 'react';
import { useMeetingStore } from '../store/useMeetingStore';
import { Bot } from 'lucide-react';

const CodeInput: React.FC = () => {
  const { stdin, setStdin, viewingPeerCode, isHost, attachToAi } = useMeetingStore();
  const isReadOnly = !!viewingPeerCode && !isHost;

  return (
    <div className="flex flex-col h-full bg-raised">
      <div className="px-4 py-2 bg-raised border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400 font-medium">Input (stdin)</span>
          <button
            onClick={() => attachToAi(stdin, 'dữ liệu input (stdin)', 'input')}
            disabled={!stdin}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
              stdin 
                ? 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20' 
                : 'opacity-50 cursor-not-allowed'
            }`}
            title="Thảo luận về dữ liệu input với AI"
          >
            <Bot size={12} />
            <span className="text-[10px] font-bold uppercase tracking-wider">AI</span>
          </button>
        </div>
        <button
          onClick={() => setStdin('')}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
          title="Clear input"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 p-2">
        <textarea
          value={stdin}
          onChange={(e) => {
            if (!isReadOnly) {
              setStdin(e.target.value);
            }
          }}
          disabled={isReadOnly}
          placeholder="Nhập input cho chương trình (ví dụ: 5 10). Các giá trị nhập vào stdin trong quá trình chạy sẽ được đọc từ đây."
          className="w-full h-full bg-base text-white text-sm p-3 rounded border border-line-strong focus:outline-none focus:border-accent resize-none font-mono custom-scrollbar"
        />
      </div>
    </div>
  );
};

export default CodeInput;
