/** Heuristic nhận diện ngôn ngữ của mã nguồn học sinh nộp lên (dùng chung cho judge + hacktest). */
export function detectLanguage(code: string): "python" | "cpp" {
  const cppPatterns = [
    /#include\s*</,
    /int\s+main\s*\(/,
    /\bstd::/,
    /\bcout\s*<</,
    /\bcin\s*>>/,
    /\bvector\s*</,
    /\bprintf\s*\(/,
  ];
  if (cppPatterns.some((p) => p.test(code))) return "cpp";
  return "python";
}
