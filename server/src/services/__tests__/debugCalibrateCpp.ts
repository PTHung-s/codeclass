/**
 * Run calibration on prod.db with REAL data only (no synthetic), then print
 * before/after so we can see how much C++ numbers move vs the current stored
 * values (which were fitted with LLM synthetic data).
 */
import path from "path";

const dbPath = "file:" + path.resolve("prod.db").replace(/\\/g, "/");
process.env.DATABASE_URL = dbPath;

async function main() {
  const { calibrateAllSkills, getAllCalibrations } = await import("../bktCalibrator");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbPath } } });

  const before = await prisma.skillBktCalibration.findMany({ orderBy: { skillId: "asc" } });
  const beforeMap = new Map(before.map((b) => [b.skillId, b]));
  console.log("BEFORE: stored calibrations:", before.length);

  console.log("\nRunning calibrateAllSkills with REAL data only...");
  const started = Date.now();
  const results = await calibrateAllSkills();
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${results.length} skills`);

  console.log("\n=== skillId | pL0 | pT | pSlip | pGuess | (#seqs real) | events | converged | iterations ===");
  for (const r of results) {
    if (!r.skillId.startsWith("cpp.")) continue;
    console.log(
      `${r.skillId.padEnd(15)} pL0=${r.pL0.toFixed(3)} pT=${r.pT.toFixed(3)} pSlip=${r.pSlip.toFixed(3)} pGuess=${r.pGuess.toFixed(3)} seqs=${String(r.sampleSize).padStart(3)} evts=${String(r.totalEvents).padStart(5)} conv=${r.converged} iter=${String(r.iterations).padStart(2)}`,
    );
  }

  // Compare with stored values (which included synthetic) for C++ skills
  console.log("\n=== C++ delta vs stored (real-only now vs stored-including-synthetic) ===");
  const after = await prisma.skillBktCalibration.findMany({ orderBy: { skillId: "asc" } });
  for (const r of after) {
    if (!r.skillId.startsWith("cpp.")) continue;
    const b = beforeMap.get(r.skillId);
    if (!b) continue;
    const delta = (cur: number, prev: number) => (prev === 0 ? "n/a" : `${(cur - prev >= 0 ? "+" : "")}${(cur - prev).toFixed(3)}`);
    console.log(
      `${r.skillId.padEnd(15)} pL0 ${b.pL0.toFixed(3)}→${r.pL0.toFixed(3)} (${delta(r.pL0, b.pL0)}) | pT ${b.pT.toFixed(3)}→${r.pT.toFixed(3)} (${delta(r.pT, b.pT)}) | pSlip ${b.pSlip.toFixed(3)}→${r.pSlip.toFixed(3)} (${delta(r.pSlip, b.pSlip)}) | pGuess ${b.pGuess.toFixed(3)}→${r.pGuess.toFixed(3)} (${delta(r.pGuess, b.pGuess)}) | seqs ${b.sampleSize}→${r.sampleSize}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => console.error("FATAL:", e)).finally(() => process.exit(0));