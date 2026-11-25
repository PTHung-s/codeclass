// Block types for the lesson editor
export type BlockType =
  | "heading"
  | "paragraph"
  | "code"
  | "challenge"
  | "fact-card"
  | "warning"
  | "tip"
  | "quiz"
  | "divider"
  | "html";

export interface Block {
  id: string;
  type: BlockType;
  content: string; // HTML for text blocks, code text for code blocks
  meta?: Record<string, string>; // e.g., { expected: "output", level: "h2", language: "python" }
}

// Helper to generate unique IDs
let counter = 0;
export function genId(): string {
  return `b${Date.now()}_${++counter}`;
}

// Default content for each block type
export const blockDefaults: Record<BlockType, Partial<Block>> = {
  heading: { content: "Tiêu đề mới", meta: { level: "h2" } },
  paragraph: { content: "Nhập nội dung..." },
  code: { content: 'print("Hello World!")', meta: { language: "python" } },
  challenge: { content: '# Viết code ở đây\n', meta: { expected: "", language: "python" } },
  "fact-card": { content: "<strong>💡 Mẹo:</strong> Nội dung...", meta: { color: "#3b82f6" } },
  warning: { content: "<strong>⚠️ Lưu ý:</strong> Nội dung...", meta: { color: "#f59e0b" } },
  tip: { content: "<strong>📖 Thông tin:</strong> Nội dung...", meta: { color: "#0066cc" } },
  quiz: { content: "Câu hỏi?", meta: { options: '["A","B","C","D"]', answer: "0" } },
  divider: { content: "" },
  html: { content: "<p>HTML tự do</p>" },
};

export function createBlock(type: BlockType, overrides?: Partial<Block>): Block {
  return {
    id: genId(),
    type,
    ...blockDefaults[type],
    ...overrides,
    meta: { ...blockDefaults[type].meta, ...overrides?.meta },
  } as Block;
}
