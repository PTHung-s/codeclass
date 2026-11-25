/**
 * Shuffle per học sinh: thứ tự câu hỏi + thứ tự lựa chọn MCQ.
 *
 * Thiết kế:
 * - Lúc `attempt/start`, snapshot (góc nhìn học sinh) được xào: thứ tự câu ngẫu nhiên,
 *   `lua_chon` của câu trắc nghiệm xào ngẫu nhiên. Permutation được nhúng vào từng câu
 *   trong snapshot dưới dạng `_choice_perm` (perm[shuffledPos] = originalIdx) —
 *   KHÔNG đổi schema; attempt cũ (không có perm) không bị ảnh hưởng.
 * - DB LUÔN lưu `selectedIndex` theo thứ tự GỐC → chấm điểm / monitor / grading
 *   so sánh với đáp án gốc không cần thay đổi.
 * - Biên API: lưu vào thì shuffled→original; trả về cho học sinh thì original→shuffled.
 *   `_choice_perm` lộ cho client là vô hại (không chứa đáp án đúng).
 */

export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Xào thứ tự câu + lựa chọn MCQ; trả về snapshot mới (kèm _choice_perm trên câu MCQ). */
export function buildShuffledPaper(studentQuestions: any[]): any[] {
  const order = shuffleArray(studentQuestions);
  return order.map((q) => {
    if (q && q.loai === "trac_nghiem" && Array.isArray(q.lua_chon) && q.lua_chon.length > 1) {
      const perm = shuffleArray<number>(q.lua_chon.map((_: unknown, i: number) => i));
      return { ...q, lua_chon: perm.map((oi) => q.lua_chon[oi]), _choice_perm: perm };
    }
    return q;
  });
}

export type SnapshotMeta = Map<string, { loai?: string; perm?: number[] }>;

/** Đọc loai + _choice_perm của từng câu từ contentSnapshotJson. */
export function snapshotMeta(snapshotJson: string | null | undefined): SnapshotMeta {
  const m: SnapshotMeta = new Map();
  if (!snapshotJson) return m;
  try {
    const snap = JSON.parse(snapshotJson);
    if (Array.isArray(snap)) {
      for (const q of snap) {
        if (q && typeof q.id === "string") {
          m.set(q.id, {
            loai: typeof q.loai === "string" ? q.loai : undefined,
            perm: Array.isArray(q._choice_perm) ? q._choice_perm : undefined,
          });
        }
      }
    }
  } catch {
    /* snapshot hỏng → không convert */
  }
  return m;
}

/** Client gửi vị trí trong danh sách đã xào → vị trí gốc để lưu DB. */
export function shuffledToOriginal(perm: number[] | undefined, shuffledIdx: unknown): unknown {
  if (typeof shuffledIdx !== "number" || !perm) return shuffledIdx;
  return shuffledIdx >= 0 && shuffledIdx < perm.length ? perm[shuffledIdx] : shuffledIdx;
}

/** DB (gốc) → vị trí trong danh sách đã xào để trả về cho học sinh. */
export function originalToShuffled(perm: number[] | undefined, originalIdx: unknown): unknown {
  if (typeof originalIdx !== "number" || !perm) return originalIdx;
  const i = perm.indexOf(originalIdx);
  return i >= 0 ? i : originalIdx;
}

/** Convert selectedIndex của draft (object { [qid]: {...} }) theo 1 hướng. */
export function convertDraft(
  draft: unknown,
  meta: SnapshotMeta,
  dir: "toOriginal" | "toShuffled",
): unknown {
  if (!draft || typeof draft !== "object") return draft;
  const out: Record<string, unknown> = {};
  for (const [qid, val] of Object.entries(draft as Record<string, any>)) {
    if (!val || typeof val !== "object") {
      out[qid] = val;
      continue;
    }
    const d = { ...val };
    const m = meta.get(qid);
    if (m?.loai === "trac_nghiem" && m.perm && d.selectedIndex != null) {
      d.selectedIndex =
        dir === "toOriginal"
          ? shuffledToOriginal(m.perm, d.selectedIndex)
          : originalToShuffled(m.perm, d.selectedIndex);
    }
    out[qid] = d;
  }
  return out;
}
