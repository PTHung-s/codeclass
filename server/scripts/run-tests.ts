import { spawnSync } from "node:child_process";
import path from "node:path";

const tsxCli = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");

const testFiles = [
  "src/utils/__tests__/adaptiveEngine.test.ts",
  "src/utils/__tests__/adaptiveSessionSafety.test.ts",
  "src/utils/__tests__/skillGraph.test.ts",
  "src/services/__tests__/skillMastery.test.ts",
  "src/services/__tests__/crossFeatureLogic.test.ts",
];

let failedSuites = 0;

for (const file of testFiles) {
  console.log(`\n=== Running ${file} ===`);
  const res = spawnSync(process.execPath, [tsxCli, file], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    failedSuites += 1;
    console.error(`FAIL: ${file} exited with code ${res.status}`);
  }
}

console.log(`\nTest summary: ${testFiles.length - failedSuites}/${testFiles.length} suites passed.`);
if (failedSuites > 0) process.exit(1);
