import path from "path";

const dbPath = "file:" + path.resolve("prod_fresh.db").replace(/\\/g, "/");
process.env.DATABASE_URL = dbPath;

async function main() {
  const { calibrateAllSkills } = await import("../bktCalibrator");
  const started = Date.now();
  const results = await calibrateAllSkills();
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${results.length} skills\n`);

  console.log("=== C++ skills (real data only) ===");
  console.log("skillId".padEnd(17), "pL0".padStart(6), "pT".padStart(6), "pSlip".padStart(6), "pGuess".padStart(6), "seqs".padStart(4), "evts".padStart(5), "conv", "iter");
  for (const r of results) {
    if (!r.skillId.startsWith("cpp.")) continue;
    console.log(
      r.skillId.padEnd(17),
      r.pL0.toFixed(3).padStart(6), r.pT.toFixed(3).padStart(6), r.pSlip.toFixed(3).padStart(6), r.pGuess.toFixed(3).padStart(6),
      String(r.sampleSize).padStart(4), String(r.totalEvents).padStart(5),
      String(r.converged).padEnd(5), String(r.iterations).padStart(3)
    );
  }

  console.log("\n=== Python skills (for comparison) ===");
  for (const r of results) {
    if (!r.skillId.startsWith("py.")) continue;
    console.log(
      r.skillId.padEnd(17),
      r.pL0.toFixed(3).padStart(6), r.pT.toFixed(3).padStart(6), r.pSlip.toFixed(3).padStart(6), r.pGuess.toFixed(3).padStart(6),
      String(r.sampleSize).padStart(4), String(r.totalEvents).padStart(5),
      String(r.converged).padEnd(5), String(r.iterations).padStart(3)
    );
  }

  console.log("\n=== Summary ===");
  const cpp = results.filter(r => r.skillId.startsWith("cpp.") && r.converged);
  const py = results.filter(r => r.skillId.startsWith("py.") && r.converged);
  console.log(`C++: ${cpp.length} converged, ${results.filter(r => r.skillId.startsWith("cpp.")).length} total`);
  console.log(`Python: ${py.length} converged, ${results.filter(r => r.skillId.startsWith("py.")).length} total`);
  console.log(`Total with data: ${results.filter(r => r.sampleSize > 0).length}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });