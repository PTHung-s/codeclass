import { useState, useCallback } from "react";
import { Block, BlockType, createBlock } from "./types";
import { blocksToHtml, htmlToBlocks } from "./serialize";
import {
  Plus, GripVertical, X, Heading, Type, Code2, CheckCircle2,
  AlertTriangle, Info, HelpCircle, Minus, Braces, Lightbulb,
  Eye, Save, Undo2, ArrowUp, ArrowDown,
} from "lucide-react";
import { Separator } from "../ui/separator";

interface Props {
  initialHtml: string;
  onSave: (html: string) => void;
  onCancel?: () => void;
}

const BLOCK_MENU: { type: BlockType; icon: React.ReactNode; label: string }[] = [
  { type: "heading", icon: <Heading className="w-3.5 h-3.5" />, label: "Tiêu đề" },
  { type: "paragraph", icon: <Type className="w-3.5 h-3.5" />, label: "Văn bản" },
  { type: "divider", icon: <Minus className="w-3.5 h-3.5" />, label: "Ngăn cách" },
  { type: "code", icon: <Code2 className="w-3.5 h-3.5" />, label: "Code" },
  { type: "challenge", icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Challenge" },
  { type: "fact-card", icon: <Info className="w-3.5 h-3.5" />, label: "Fact Card" },
  { type: "warning", icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Cảnh báo" },
  { type: "tip", icon: <Lightbulb className="w-3.5 h-3.5" />, label: "Mẹo" },
  { type: "quiz", icon: <HelpCircle className="w-3.5 h-3.5" />, label: "Quiz" },
];

export default function LessonEditor({ initialHtml, onSave, onCancel }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => htmlToBlocks(initialHtml));
  const [preview, setPreview] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

  const addBlock = useCallback((type: BlockType, afterIdx?: number) => {
    const newBlock = createBlock(type);
    setBlocks((prev) => {
      if (afterIdx !== undefined && afterIdx < prev.length - 1) {
        const copy = [...prev];
        copy.splice(afterIdx + 1, 0, newBlock);
        return copy;
      }
      return [...prev, newBlock];
    });
    setSelectedBlock(newBlock.id);
  }, []);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlock === id) setSelectedBlock(null);
  }, [selectedBlock]);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }, []);

  const handleSave = () => {
    const html = blocksToHtml(blocks);
    onSave(html);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-1 flex-wrap">
          {BLOCK_MENU.map((item) => (
            <button
              key={item.type}
              onClick={() => addBlock(item.type)}
              title={item.label}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors"
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={() => setPreview(!preview)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${preview ? "bg-brand-100 text-brand-700 border border-brand-200" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"}`}
          >
            <Eye className="w-3.5 h-3.5" /> {preview ? "Soạn" : "Preview"}
          </button>
          {onCancel && (
            <button onClick={onCancel} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">
              <Undo2 className="w-3.5 h-3.5" /> Hủy
            </button>
          )}
          <button onClick={handleSave} className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            <Save className="w-3.5 h-3.5" /> Lưu
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="p-4 min-h-[300px]">
        {preview ? (
          <div className="lesson-content prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: blocksToHtml(blocks) }} />
        ) : blocks.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Plus className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Nhấn nút trên thanh công cụ để thêm nội dung</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, idx) => (
              <BlockEditor
                key={block.id}
                block={block}
                isSelected={selectedBlock === block.id}
                onSelect={() => setSelectedBlock(block.id)}
                onChange={(upd) => updateBlock(block.id, upd)}
                onRemove={() => removeBlock(block.id)}
                onMoveUp={() => moveBlock(block.id, -1)}
                onMoveDown={() => moveBlock(block.id, 1)}
                isFirst={idx === 0}
                isLast={idx === blocks.length - 1}
                onAddAfter={(type) => addBlock(type, idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
        <span>{blocks.length} block{blocks.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setBlocks([createBlock("paragraph")])} className="hover:text-gray-600">Xóa hết</button>
      </div>
    </div>
  );
}

// ========== Individual Block Editor ==========

function BlockEditor({
  block, isSelected, onSelect, onChange, onRemove, onMoveUp, onMoveDown,
  isFirst, isLast, onAddAfter,
}: {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<Block>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  onAddAfter: (type: BlockType) => void;
}) {
  return (
    <div
      className={`group relative border rounded-lg transition-all ${isSelected ? "border-primary ring-1 ring-brand-200 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}
      onClick={onSelect}
    >
      {/* Block controls (show on hover/select) */}
      <div className={`absolute -left-10 top-2 flex flex-col gap-0.5 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button onClick={onMoveUp} disabled={isFirst} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400" title="Lên"><ArrowUp className="w-3 h-3" /></button>
        <button onClick={onMoveDown} disabled={isLast} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400" title="Xuống"><ArrowDown className="w-3 h-3" /></button>
      </div>

      {/* Block type indicator */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border-b text-[10px] font-semibold uppercase tracking-wider ${isSelected ? "bg-brand-50 border-brand-100 text-brand-600" : "bg-gray-50 border-gray-100 text-gray-400"}`}>
        <GripVertical className="w-3 h-3 cursor-grab" />
        {blockLabel(block.type)}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onRemove} className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="Xóa"><X className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Block content */}
      <div className="p-3">
        <BlockContent block={block} onChange={onChange} />
      </div>

      {/* Quick add between blocks */}
      {isSelected && (
        <div className="flex justify-center gap-1 pb-2 px-3">
          {BLOCK_MENU.slice(0, 5).map((item) => (
            <button
              key={item.type}
              onClick={(e) => { e.stopPropagation(); onAddAfter(item.type); }}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
              title={`Thêm ${item.label}`}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function blockLabel(type: BlockType): string {
  const map: Record<BlockType, string> = {
    heading: "Tiêu đề", paragraph: "Văn bản", code: "Code", challenge: "Challenge",
    "fact-card": "Fact Card", warning: "Cảnh báo", tip: "Mẹo", quiz: "Quiz",
    divider: "Ngăn cách", html: "HTML",
  };
  return map[type];
}

// ========== Block Content Renderers ==========

function BlockContent({ block, onChange }: { block: Block; onChange: (updates: Partial<Block>) => void }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex items-center gap-2">
          <select
            value={block.meta?.level || "h2"}
            onChange={(e) => onChange({ meta: { ...block.meta, level: e.target.value } })}
            className="text-xs border border-gray-200 rounded px-1.5 py-1"
          >
            <option value="h2">H2</option>
            <option value="h3">H3</option>
          </select>
          <input
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="flex-1 text-lg font-bold outline-none"
            placeholder="Tiêu đề..."
          />
        </div>
      );

    case "paragraph":
      return (
        <textarea
          value={block.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className="w-full outline-none resize-none text-sm text-gray-700 leading-relaxed min-h-[60px]"
          placeholder="Nhập nội dung văn bản... (hỗ trợ HTML: <strong>, <code>, <em>)"
          rows={2}
        />
      );

    case "code":
      const isRunner = block.meta?.runner === "true";
      return (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isRunner}
                onChange={(e) => onChange({ meta: { ...block.meta, runner: e.target.checked ? "true" : "false" } })}
                className="accent-brand-600"
              />
              Cho phép chạy (Python Runner)
            </label>
          </div>
          <textarea
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="w-full bg-[#0f172a] text-green-300 font-mono text-sm p-4 rounded-lg outline-none resize-y min-h-[120px]"
            placeholder='print("Hello World!")'
            spellCheck={false}
          />
        </div>
      );

    case "challenge":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">Output mong đợi:</label>
            <input
              value={block.meta?.expected || ""}
              onChange={(e) => onChange({ meta: { ...block.meta, expected: e.target.value } })}
              className="flex-1 text-xs font-mono border border-gray-200 rounded px-2 py-1 outline-none focus:border-primary"
              placeholder='VD: Hello World'
            />
          </div>
          <textarea
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="w-full bg-[#0f172a] text-green-300 font-mono text-sm p-4 rounded-lg outline-none resize-y min-h-[120px]"
            placeholder="# Gợi ý cho học sinh (không để đáp án)"
            spellCheck={false}
          />
        </div>
      );

    case "fact-card":
    case "warning":
    case "tip": {
      const colors: Record<string, string> = { "fact-card": "#3b82f6", warning: "#f59e0b", tip: "#0066cc" };
      const bgColors: Record<string, string> = { "fact-card": "#f0f9ff", warning: "#fef3c7", tip: "#f5f3ff" };
      return (
        <div className="flex gap-2">
          <input
            type="color"
            value={block.meta?.color || colors[block.type]}
            onChange={(e) => onChange({ meta: { ...block.meta, color: e.target.value } })}
            className="w-8 h-8 rounded cursor-pointer border"
            title="Màu viền trái"
          />
          <textarea
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="flex-1 outline-none resize-none text-sm leading-relaxed min-h-[60px] p-2 rounded border"
            style={{ borderLeftWidth: "4px", borderLeftColor: block.meta?.color || colors[block.type], backgroundColor: bgColors[block.type] }}
            placeholder="Nội dung..."
            rows={2}
          />
        </div>
      );
    }

    case "quiz":
      return (
        <div className="space-y-2">
          <input
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="w-full text-sm font-semibold outline-none"
            placeholder="Câu hỏi?"
          />
          <div>
            <label className="text-[10px] text-gray-400">Đáp án (mỗi dòng 1 lựa chọn, dòng đầu = đáp án đúng):</label>
            <textarea
              value={JSON.parse(block.meta?.options || '["A","B","C","D"]').join("\n")}
              onChange={(e) => {
                const lines = e.target.value.split("\n").filter(Boolean);
                onChange({ meta: { ...block.meta, options: JSON.stringify(lines), answer: "0" } });
              }}
              className="w-full text-xs font-mono border border-gray-200 rounded p-2 outline-none resize-none mt-1"
              rows={4}
              placeholder="Đáp án A&#10;B&#10;C&#10;D"
            />
          </div>
        </div>
      );

    case "divider":
      return <Separator />;

    case "html":
      return (
        <textarea
          value={block.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className="w-full bg-gray-50 text-gray-700 font-mono text-xs p-3 rounded-lg outline-none resize-y min-h-[80px]"
          placeholder="<p>HTML tự do...</p>"
          spellCheck={false}
          rows={3}
        />
      );

    default:
      return <p className="text-gray-400 text-sm">Unknown block type: {block.type}</p>;
  }
}
