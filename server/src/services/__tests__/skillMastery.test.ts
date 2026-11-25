import { bktUpdate, calculateSignal, estimateMasteryUncertainty, ewmaUpdate, type Observation } from "../skillMastery";

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

const strong: Observation = {
  outcomes: [true, true, true],
  attempt: 1,
  timeFactor: 1,
  hintCount: 0,
  difficulty: 5,
};
const weak: Observation = {
  outcomes: [false, false, false],
  attempt: 3,
  timeFactor: 0.1,
  hintCount: 3,
  difficulty: 1,
};

console.log("\n── Skill mastery math ──");
check("signal is bounded at the lower edge", calculateSignal(0, 10, 0, 20, 1) >= 0);
check("signal is bounded at the upper edge", calculateSignal(1, 1, 1, 0, 5) <= 1);
check("strong evidence raises EWMA mastery", ewmaUpdate(0.5, strong) > 0.5);
check("weak evidence lowers EWMA mastery", ewmaUpdate(0.5, weak) < 0.5);
check("empty EWMA evidence is a no-op", ewmaUpdate(0.63, { ...strong, outcomes: [] }) === 0.63);
check("BKT remains in probability bounds", bktUpdate(0.5, strong) >= 0 && bktUpdate(0.5, strong) <= 1);
check("BKT correct evidence raises knowledge", bktUpdate(0.2, strong) > 0.2);
check("BKT wrong evidence lowers knowledge", bktUpdate(0.8, weak) < 0.8);

const sparseBand = estimateMasteryUncertainty(0.62, [{ ts: "2026-01-01", value: 0.62 }]);
const denseBand = estimateMasteryUncertainty(0.62, Array.from({ length: 30 }, (_, index) => ({ ts: `2026-01-${String(index + 1).padStart(2, "0")}`, value: 0.62 })));
const volatileBand = estimateMasteryUncertainty(0.62, [
  { ts: "2026-01-01", value: 0.2 }, { ts: "2026-01-02", value: 0.8 },
  { ts: "2026-01-03", value: 0.3 }, { ts: "2026-01-04", value: 0.75 },
]);
const stableFourBand = estimateMasteryUncertainty(0.62, Array.from({ length: 4 }, (_, index) => ({ ts: `2026-02-0${index + 1}`, value: 0.62 })));
check("skills without evidence have no uncertainty band", estimateMasteryUncertainty(0.5, []) === null);
check("more evidence narrows the uncertainty band", Boolean(sparseBand && denseBand && (denseBand.upperBound - denseBand.lowerBound) < (sparseBand.upperBound - sparseBand.lowerBound)));
check("volatile evidence widens the uncertainty band", Boolean(volatileBand && stableFourBand && (volatileBand.upperBound - volatileBand.lowerBound) > (stableFourBand.upperBound - stableFourBand.lowerBound)));
check("uncertainty bounds remain in probability range", Boolean(denseBand && denseBand.lowerBound >= 0 && denseBand.upperBound <= 1));

console.log(`  Passed: ${pass} / ${pass + fail}`);
console.log(`  Failed: ${fail}`);
if (fail > 0) process.exit(1);
