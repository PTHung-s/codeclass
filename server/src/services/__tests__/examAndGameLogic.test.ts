import { computeRelativePenalties } from "../codeDuelService";
import { resolveCodeLanguage } from "../examAttemptService";

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

console.log(`\nexamAndGameLogic tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
