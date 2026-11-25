import {
  applyMemoryDecay,
  bktUpdate,
  calculateSignal,
  computeHalfLifeDays,
  computeItemEvidenceWeight,
  countSpacedSuccesses,
  estimateMasteryUncertainty,
  ewmaUpdate,
  type Observation,
} from "../skillMastery";

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
check(
  "0% correctness never yields positive EWMA signal (fixes naive EWMA wrong-answer boost)",
  calculateSignal(0, 1, 1, 0, 3) === 0 &&
    ewmaUpdate(0.3, { outcomes: [false], attempt: 1, timeFactor: 1, hintCount: 0, difficulty: 3 }) < 0.3,
);
check(
  "EWMA hard-correct gives higher signal than easy-correct",
  calculateSignal(1, 1, 1, 0, 5) > calculateSignal(1, 1, 1, 0, 1),
);
check("strong evidence raises EWMA mastery", ewmaUpdate(0.5, strong) > 0.5);
check("weak evidence lowers EWMA mastery", ewmaUpdate(0.5, weak) < 0.5);
check("empty EWMA evidence is a no-op", ewmaUpdate(0.63, { ...strong, outcomes: [] }) === 0.63);
check("BKT remains in probability bounds", bktUpdate(0.5, strong) >= 0 && bktUpdate(0.5, strong) <= 1);
check("BKT correct evidence raises knowledge", bktUpdate(0.2, strong) > 0.2);
check("BKT wrong evidence lowers knowledge", bktUpdate(0.8, weak) < 0.8);

// IRT-BKT source, difficulty & hint sensitivity
const singleMcqQuiz: Observation = {
  outcomes: [true],
  attempt: 1,
  timeFactor: 1,
  hintCount: 0,
  difficulty: 3,
  source: "lesson_quiz",
};
const singleCodeProblem: Observation = {
  ...singleMcqQuiz,
  source: "problem",
};
const singleHardQuiz: Observation = {
  ...singleMcqQuiz,
  difficulty: 5,
};
const singleEasyQuiz: Observation = {
  ...singleMcqQuiz,
  difficulty: 1,
};
const singleHintedProblem: Observation = {
  ...singleCodeProblem,
  hintCount: 3,
};
check(
  "BKT-IRT: coding problem AC raises mastery more than single 4-option MCQ",
  bktUpdate(0.35, singleCodeProblem) > bktUpdate(0.35, singleMcqQuiz),
);
check(
  "BKT-IRT: hard question correct raises mastery more than easy question",
  bktUpdate(0.35, singleHardQuiz) > bktUpdate(0.35, singleEasyQuiz),
);
check(
  "BKT-IRT: solving with 3 hints yields less mastery than solving unaided",
  bktUpdate(0.35, singleHintedProblem) < bktUpdate(0.35, singleCodeProblem),
);

// Memory decay / Forgetting curve
const fresh = applyMemoryDecay(0.85, 2, 1);
const decayed14 = applyMemoryDecay(0.85, 14, 1);
const decayedStable14 = applyMemoryDecay(0.85, 14, 4);
check("memory decay: within 2-day grace period retains 100%", fresh.retentionRate === 1 && fresh.effectiveMastery === 0.85);
check("memory decay: 14 days idle decays mastery toward floor", decayed14.retentionRate < 0.6 && decayed14.effectiveMastery < 0.85 && decayed14.effectiveMastery > 0.25);
check(
  "memory decay: more spaced repetitions expand half-life and preserve higher retention",
  computeHalfLifeDays(4) > computeHalfLifeDays(1) && decayedStable14.effectiveMastery > decayed14.effectiveMastery,
);
const spacingHistory = [
  { ts: "2026-10-01T10:00:00Z", value: 0.7 },
  { ts: "2026-10-01T10:30:00Z", value: 0.78 }, // same sitting (<12h) -> 1 spaced success
  { ts: "2026-10-04T10:00:00Z", value: 0.82 }, // >=12h later -> 2nd spaced success
];
check("spaced successes collapses same-sitting cramming into 1 spacing event", countSpacedSuccesses(spacingHistory) === 2);

// Guessing detection weights
check(
  "computeItemEvidenceWeight discounts trivially easy correct & rare distractor wrong when N>=6",
  computeItemEvidenceWeight([18, 1, 1, 0], 0, 0, true) === 0.9 &&
    computeItemEvidenceWeight([10, 5, 4, 1], 3, 0, false) === 0.9 &&
    computeItemEvidenceWeight([10, 5, 4, 1], 1, 0, false) === 1,
);

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
