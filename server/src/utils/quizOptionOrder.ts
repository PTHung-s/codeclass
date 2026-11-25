/**
 * Per-attempt A/B/C/D shuffling, and the two index frames it creates.
 *
 * Question order was already randomized; the options inside a question were
 * not, so the answer sat on the same letter every single time and a paper could
 * be passed from memory of the lettering alone. Now each fetch permutes the
 * options of each question it serves.
 *
 * That leaves two frames, and quietly mixing them up mis-grades a paper:
 *
 *  - canonical — the order the options sit in inside QuizQuestion.options.
 *    QuizQuestion.correctIndex is expressed in it, and so is everything we
 *    write: QuizAttempt.answers, QuizQuestionResponse (whose selectedIndex is
 *    the distractor histogram in questionCalibration), the teacher CSV export.
 *    Persisted rows must stay canonical or the analytics turn into noise.
 *  - display — the order one browser rendered on one attempt. Letters come
 *    straight from array position, both in OptionButton and in the review.
 *
 * `optionOrder[displayPosition] = canonicalIndex` is the bridge between them.
 * It is served with the questions, echoed back on submit, and stored on the
 * attempt so a review opened months later still shows the lettering the
 * student actually saw.
 *
 * Everything here treats a missing or malformed optionOrder as "the frames are
 * identical" — attempts recorded before this existed, and any client that does
 * not echo it, keep grading exactly as they did.
 */

/** A fresh permutation of 0..length-1 (Fisher-Yates). */
export function permuteIndices(length: number): number[] {
  const a = Array.from({ length }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Trust an echoed order only when it really is a permutation of 0..n-1.
 * Anything else — wrong length, duplicates, out of range, not an array — is
 * rejected rather than partially applied, because a half-valid map would
 * scramble the grade instead of failing loudly.
 */
export function safeOptionOrder(order: unknown, optionCount: number): number[] | null {
  if (optionCount === 0 || !Array.isArray(order) || order.length !== optionCount) return null;
  const seen = new Set<number>();
  for (const value of order) {
    if (!Number.isInteger(value) || value < 0 || value >= optionCount || seen.has(value)) return null;
    seen.add(value);
  }
  return order as number[];
}

/** display position → canonical index. */
export function toCanonicalIndex(displayIndex: number, order: number[] | null): number {
  if (!order || !Number.isInteger(displayIndex) || displayIndex < 0 || displayIndex >= order.length) {
    return displayIndex;
  }
  return order[displayIndex];
}

/** canonical index → display position. Unknown index passes through unchanged. */
export function toDisplayIndex(canonicalIndex: number | null | undefined, order: number[] | null): number | null {
  if (canonicalIndex === null || canonicalIndex === undefined) return null;
  if (!order) return canonicalIndex;
  const pos = order.indexOf(canonicalIndex);
  return pos >= 0 ? pos : canonicalIndex;
}

/**
 * Re-express a graded answer in the frame the student's browser rendered:
 * options in the order they were shown, indices pointing at those positions.
 * The review UI reads options[selectedIndex] and options[correctIndex] off one
 * array, so both have to move together with the array.
 */
export function toDisplayFrame<
  T extends { options?: string[]; correctIndex?: number | null; selectedIndex?: number | null },
>(row: T, order: number[] | null): T {
  if (!order) return row;
  return {
    ...row,
    ...(Array.isArray(row.options) ? { options: order.map((canonical) => row.options![canonical]) } : {}),
    correctIndex: toDisplayIndex(row.correctIndex, order),
    selectedIndex: toDisplayIndex(row.selectedIndex, order),
  };
}
