export interface ChecklistItem {
  id: string;
  label: string;
  tagFilter: string; // keyword to match in problem tags
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface ChecklistGroup {
  title: string;
  icon: string;
  items: ChecklistItem[];
}

export function computeStars(completed: number, total: number): number {
  if (total === 0) return 0;
  const raw = Math.round((completed / total) * 10) / 2;
  return Math.min(5, raw);
}

export const CHECKLISTS: ChecklistGroup[] = [
  {
    title: "Cơ bản",
    icon: "📚",
    items: [
      { id: "print", label: "Nhập/Xuất", tagFilter: "Nhập xuất", difficulty: 1 },
      { id: "variables", label: "Biến & Kiểu dữ liệu", tagFilter: "Biến", difficulty: 1 },
      { id: "if-else", label: "If-Else & Rẽ nhánh", tagFilter: "If-Else", difficulty: 1 },
      { id: "for-loop", label: "Vòng lặp For", tagFilter: "For", difficulty: 1 },
      { id: "while-loop", label: "Vòng lặp While", tagFilter: "While", difficulty: 2 },
      { id: "function", label: "Hàm (def, return)", tagFilter: "Hàm", difficulty: 2 },
      { id: "list", label: "List & Mảng", tagFilter: "Mảng", difficulty: 1 },
      { id: "dict-set", label: "Dictionary & Set", tagFilter: "Dict", difficulty: 2 },
      { id: "string", label: "String & Xử lý chuỗi", tagFilter: "Xâu", difficulty: 2 },
    ],
  },
  {
    title: "Thuật toán",
    icon: "🔢",
    items: [
      { id: "brute-force", label: "Duyệt trâu (Brute Force)", tagFilter: "Duyệt", difficulty: 1 },
      { id: "sorting", label: "Sắp xếp", tagFilter: "Sắp xếp", difficulty: 2 },
      { id: "binary-search", label: "Tìm kiếm nhị phân", tagFilter: "Nhị phân", difficulty: 2 },
      { id: "two-pointers", label: "Hai con trỏ", tagFilter: "Hai con trỏ", difficulty: 3 },
      { id: "recursion", label: "Đệ quy", tagFilter: "Đệ quy", difficulty: 3 },
      { id: "dp", label: "Quy hoạch động", tagFilter: "Quy hoạch động", difficulty: 4 },
      { id: "greedy", label: "Tham lam", tagFilter: "Tham lam", difficulty: 3 },
      { id: "math", label: "Số học & Toán", tagFilter: "Số học", difficulty: 3 },
    ],
  },
  {
    title: "Cấu trúc dữ liệu",
    icon: "🌳",
    items: [
      { id: "stack-queue", label: "Stack & Queue", tagFilter: "Stack", difficulty: 3 },
      { id: "tree", label: "Cây (Tree)", tagFilter: "Cây", difficulty: 4 },
      { id: "graph", label: "Đồ thị", tagFilter: "Đồ thị", difficulty: 4 },
      { id: "bit-fenwick", label: "Fenwick Tree (BIT)", tagFilter: "BIT", difficulty: 4 },
      { id: "dsu", label: "Disjoint Set Union", tagFilter: "DSU", difficulty: 4 },
    ],
  },
  {
    title: "Nâng cao",
    icon: "⚡",
    items: [
      { id: "sieve", label: "Sàng nguyên tố", tagFilter: "Sàng", difficulty: 3 },
      { id: "divide-conquer", label: "Chia để trị", tagFilter: "Chia để trị", difficulty: 4 },
      { id: "segment-tree", label: "Segment Tree", tagFilter: "Segment", difficulty: 5 },
      { id: "dijkstra", label: "Dijkstra & Đường đi", tagFilter: "Dijkstra", difficulty: 5 },
      { id: "string-adv", label: "KMP & Xử lý xâu nâng cao", tagFilter: "KMP", difficulty: 5 },
    ],
  },
];
