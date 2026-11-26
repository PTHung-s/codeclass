import { computeRelativePenalties } from "../codeDuelService";
import { resolveCodeLanguage } from "../examAttemptService";
import { extractJsonObject, normalizeAiExamDraft } from "../examAiGenerator";
import { parseAndValidateExamJson } from "../examImport";
import { SKILL_SEEDS } from "../../utils/skillGraph";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

const d = (iso: string) => new Date(iso);

console.log("\n── Code Duel relative ICPC penalty ──");
const r1Start = d("2026-11-26T10:00:00Z");
const r2Start = d("2026-11-26T10:05:00Z");
const penalties = computeRelativePenalties([
  // Student A solves round 1 in 30s and round 2 in 40s (total 70s)
  { userId: "stuA", roundId: "r1", acceptedAt: d("2026-11-26T10:00:30Z"), roundStartedAt: r1Start },
  { userId: "stuA", roundId: "r2", acceptedAt: d("2026-11-26T10:05:40Z"), roundStartedAt: r2Start },
  // Student B solves round 1 in 120s (total 120s)
  { userId: "stuB", roundId: "r1", acceptedAt: d("2026-11-26T10:02:00Z"), roundStartedAt: r1Start },
]);

const penA = penalties.get("stuA") ?? 0;
const penB = penalties.get("stuB") ?? 0;
check("stuA 2-round solve (70s) beats stuB 1-round solve (120s)", penA === 70_000 && penB === 120_000 && penA < penB);

const legacyPenalties = computeRelativePenalties([
  { userId: "stuFast", roundId: "rLegacy", acceptedAt: d("2026-11-26T10:00:20Z"), roundStartedAt: null },
  { userId: "stuSlow", roundId: "rLegacy", acceptedAt: d("2026-11-26T10:01:00Z"), roundStartedAt: null },
]);
check(
  "legacy round without startedAt still gives lower penalty to faster AC",
  (legacyPenalties.get("stuFast") ?? Infinity) < (legacyPenalties.get("stuSlow") ?? 0),
);

console.log("\n── Exam language lock helper ──");
check("locks to question language when python/cpp", resolveCodeLanguage("cpp", "python") === "cpp");
check("falls back to requested language when unrestricted", resolveCodeLanguage("both", "cpp") === "cpp");
check("defaults to python for unknown language", resolveCodeLanguage(null, "java") === "python");

console.log("\n── Exam AI generator parsing & normalization ──");
const sampleSkillId = SKILL_SEEDS[0].skillId;
const fencedRaw = [
  "Đây là đề thi gợi ý:",
  "```json",
  JSON.stringify({
    tieu_de: "Kiểm tra vòng lặp",
    mo_ta: "Ôn tập for và while",
    thoi_gian_phut: 30,
    cau_hoi: [
      {
        loai: "trac_nghiem",
        do_kho: 9,
        diem: 1,
        stem: "Vòng lặp nào lặp theo dãy?",
        lua_chon: ["for", "while", "if", "def"],
        dap_an_index: 99,
        ky_nang: [sampleSkillId, "unknown_skill_id"],
      },
      {
        loai: "tra_loi_ngan",
        do_kho: 2,
        diem: 2,
        stem: "Từ khóa dừng vòng lặp ngay lập tức?",
        dap_an: "break; BREAK",
      },
      {
        loai: "thuc_hanh",
        do_kho: 3,
        diem: 4,
        stem: "Tính tổng 2 số a + b",
        code_dap_an: "a, b = map(int, input().split())\nprint(a + b)",
        testcase_mau: [{ input: "2 3", output: "5" }],
      },
      {
        // Malformed coding question missing testcase_mau should be dropped cleanly
        loai: "thuc_hanh",
        stem: "Bài lỗi thiếu testcase",
        code_dap_an: "print(1)",
        testcase_mau: [],
      },
    ],
  }),
  "```",
].join("\n");

const extracted = extractJsonObject(fencedRaw);
const normalizedDraft = normalizeAiExamDraft(extracted, "python");
check("keeps 3 valid questions and drops malformed one", normalizedDraft.cau_hoi.length === 3);
check("assigns sequential ma_cau codes", normalizedDraft.cau_hoi.map((q) => q.ma_cau).join(",") === "C01,C02,C03");
check("clamps do_kho and dap_an_index to valid bounds", normalizedDraft.cau_hoi[0].do_kho === 5 && normalizedDraft.cau_hoi[0].dap_an_index === 3);
check(
  "filters invalid ky_nang outside skill graph",
  (normalizedDraft.cau_hoi[0].ky_nang || []).length === 1 && normalizedDraft.cau_hoi[0].ky_nang?.[0] === sampleSkillId,
);
check(
  "splits short-answer variants cleanly",
  Array.isArray(normalizedDraft.cau_hoi[1].dap_an) && normalizedDraft.cau_hoi[1].dap_an.length === 2,
);

let validatedOk = false;
try {
  const doc = parseAndValidateExamJson({
    phien_ban: "1.0",
    de_thi: {
      tieu_de: normalizedDraft.tieu_de,
      mo_ta: normalizedDraft.mo_ta,
      thoi_gian_phut: normalizedDraft.thoi_gian_phut,
      thang_diem: 10,
      che_do_chat: "nghiem",
      cho_xem_ket_qua: true,
      ngon_ngu_code: ["python", "cpp"],
    },
    cau_hoi: normalizedDraft.cau_hoi,
  });
  validatedOk = doc.cau_hoi.length === 3;
} catch {
  validatedOk = false;
}
check("normalized AI draft passes parseAndValidateExamJson end-to-end", validatedOk);

console.log(`\nexamAndGameLogic tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
