/**
 * Lightweight Token-Normalized Winnowing Code Plagiarism Detector.
 *
 * Defeats cosmetic edits (variable/function renaming, whitespace changes, comment edits)
 * by normalizing user identifiers to `ID`, numeric literals to `NUM`, strings to `STR`,
 * while preserving structural language keywords and operators, then comparing
 * k-gram Winnowing fingerprints across submissions.
 */

export interface CodeSubmissionItem {
  submissionId: string;
  studentId: string;
  studentName: string;
  nickname?: string | null;
  email?: string;
  language: "python" | "cpp";
  code: string;
  score?: number | null;
  submittedAt?: Date | string | null;
}

export interface PlagiarismPair {
  studentA: { id: string; name: string; nickname?: string | null; score?: number | null; code: string; language: string };
  studentB: { id: string; name: string; nickname?: string | null; score?: number | null; code: string; language: string };
  similarity: number; // 0..1
  jaccard: number;
  containment: number;
  sharedFingerprints: number;
  tokenCountA: number;
  tokenCountB: number;
}

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
  "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
  "True", "try", "while", "with", "yield", "range", "len", "print", "input", "int",
  "str", "list", "dict", "set", "tuple", "sorted", "min", "max", "sum", "abs", "bisect",
  "heapq", "deque", "append", "pop", "popleft", "sys", "stdin", "math",
]);

const CPP_KEYWORDS = new Set([
  "auto", "bool", "break", "case", "char", "class", "const", "continue", "default", "do",
  "double", "else", "enum", "false", "float", "for", "if", "inline", "int", "long",
  "namespace", "new", "nullptr", "operator", "private", "public", "return", "short",
  "signed", "sizeof", "static", "struct", "switch", "template", "this", "true", "typedef",
  "typename", "unsigned", "using", "void", "while", "vector", "string", "pair", "map",
  "set", "unordered_map", "unordered_set", "queue", "stack", "deque", "priority_queue",
  "sort", "lower_bound", "upper_bound", "push_back", "pop_back", "emplace_back", "cin",
  "cout", "endl", "min", "max", "swap", "std", "include", "main",
]);

function stripCommentsAndStrings(code: string, language: "python" | "cpp"): string {
  let s = code.replace(/\r\n/g, "\n");
  if (language === "python") {
    s = s
      .replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, " STR ")
      .replace(/#[^\n]*/g, " ")
      .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, " STR ");
  } else {
    s = s
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ")
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, " STR ");
  }
  return s;
}

export function normalizeAndTokenize(code: string, language: "python" | "cpp"): string[] {
  const cleaned = stripCommentsAndStrings(code, language);
  const kwSet = language === "cpp" ? CPP_KEYWORDS : PY_KEYWORDS;
  const tokenRe = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|==|!=|<=|>=|<<|>>|\+\+|--|&&|\|\||->|[+\-*/%&|^~!<>?:=.,;()[\]{}]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(cleaned)) !== null) {
    const tok = m[0];
    if (tok === "STR") {
      out.push("STR");
    } else if (/^\d/.test(tok)) {
      out.push("NUM");
    } else if (/^[A-Za-z_]/.test(tok)) {
      out.push(kwSet.has(tok) ? tok : "ID");
    } else {
      out.push(tok);
    }
  }
  return out;
}

function hashKgram(tokens: string[], start: number, k: number): number {
  let h = 2166136261;
  for (let i = 0; i < k; i++) {
    const s = tokens[start + i];
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 31;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function winnowFingerprints(tokens: string[], k = 5, windowSize = 4): Set<number> {
  const fps = new Set<number>();
  if (tokens.length < k) {
    if (tokens.length > 0) fps.add(hashKgram(tokens, 0, tokens.length));
    return fps;
  }
  const hashes: number[] = [];
  for (let i = 0; i <= tokens.length - k; i++) {
    hashes.push(hashKgram(tokens, i, k));
  }
  if (hashes.length <= windowSize) {
    let minVal = hashes[0];
    for (const h of hashes) if (h < minVal) minVal = h;
    fps.add(minVal);
    return fps;
  }

  let prevMinIdx = -1;
  for (let i = 0; i <= hashes.length - windowSize; i++) {
    let minIdx = i;
    for (let j = i + 1; j < i + windowSize; j++) {
      // Rightmost minimum on ties (classic Winnowing rule).
      if (hashes[j] <= hashes[minIdx]) minIdx = j;
    }
    if (minIdx !== prevMinIdx) {
      fps.add(hashes[minIdx]);
      prevMinIdx = minIdx;
    }
  }
  return fps;
}

export function detectPlagiarismPairs(
  items: CodeSubmissionItem[],
  opts: { threshold?: number; minTokens?: number; maxPairs?: number } = {},
): PlagiarismPair[] {
  const threshold = Math.max(0.3, Math.min(0.99, opts.threshold ?? 0.72));
  const minTokens = opts.minTokens ?? 14;
  const maxPairs = opts.maxPairs ?? 60;

  const prepared = items
    .map((item) => {
      const tokens = normalizeAndTokenize(item.code || "", item.language);
      const fp = winnowFingerprints(tokens);
      return { item, tokens, fp };
    })
    .filter((x) => x.tokens.length >= minTokens && x.fp.size > 0);

  const pairs: PlagiarismPair[] = [];

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      if (a.item.studentId === b.item.studentId) continue;

      let shared = 0;
      const [small, large] = a.fp.size <= b.fp.size ? [a.fp, b.fp] : [b.fp, a.fp];
      for (const h of small) {
        if (large.has(h)) shared++;
      }
      if (shared === 0) continue;

      const union = a.fp.size + b.fp.size - shared;
      const jaccard = union > 0 ? shared / union : 0;
      const containment = small.size > 0 ? shared / small.size : 0;
      const similarity = Math.round((0.55 * jaccard + 0.45 * containment) * 1000) / 1000;

      if (similarity >= threshold) {
        pairs.push({
          studentA: {
            id: a.item.studentId,
            name: a.item.studentName,
            nickname: a.item.nickname,
            score: a.item.score,
            code: a.item.code,
            language: a.item.language,
          },
          studentB: {
            id: b.item.studentId,
            name: b.item.studentName,
            nickname: b.item.nickname,
            score: b.item.score,
            code: b.item.code,
            language: b.item.language,
          },
          similarity,
          jaccard: Math.round(jaccard * 1000) / 1000,
          containment: Math.round(containment * 1000) / 1000,
          sharedFingerprints: shared,
          tokenCountA: a.tokens.length,
          tokenCountB: b.tokens.length,
        });
      }
    }
  }

  pairs.sort((x, y) => y.similarity - x.similarity || y.sharedFingerprints - x.sharedFingerprints);
  return pairs.slice(0, maxPairs);
}
