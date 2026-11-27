/**
 * Output comparison checkers & IOI-style Subtask scoring.
 * Pure, dependency-free so all runners and unit tests share one implementation.
 */

export type CheckerType = "exact" | "tokens" | "float_1e6" | "float_1e4" | "ignore_case";

export interface SubtaskScoreSummary {
  subtask: number;
  passed: number;
  total: number;
  points: number;
  earned: number;
  allPassed: boolean;
}

const VALID_CHECKERS = new Set<CheckerType>([
  "exact",
  "tokens",
  "float_1e6",
  "float_1e4",
  "ignore_case",
]);

export function normalizeCheckerType(val?: string | null): CheckerType {
  if (typeof val === "string" && VALID_CHECKERS.has(val as CheckerType)) {
    return val as CheckerType;
  }
  return "exact";
}

function splitTokens(s: string): string[] {
  const trimmed = s.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

const FLOAT_TOKEN_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseFloatToken(token: string): number | null {
  if (!FLOAT_TOKEN_RE.test(token)) return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compare student output against expected output under the configured checker mode.
 */
export function compareOutputs(
  actual: string,
  expected: string,
  checkerType: CheckerType = "exact",
): boolean {
  const normA = actual.replace(/\r\n/g, "\n").trim();
  const normE = expected.replace(/\r\n/g, "\n").trim();

  if (checkerType === "exact") {
    return normA === normE;
  }

  const tokA = splitTokens(normA);
  const tokE = splitTokens(normE);
  if (tokA.length !== tokE.length) return false;

  if (checkerType === "tokens") {
    for (let i = 0; i < tokA.length; i++) {
      if (tokA[i] !== tokE[i]) return false;
    }
    return true;
  }

  if (checkerType === "ignore_case") {
    for (let i = 0; i < tokA.length; i++) {
      if (tokA[i].toLowerCase() !== tokE[i].toLowerCase()) return false;
    }
    return true;
  }

  const eps = checkerType === "float_1e4" ? 1e-4 : 1e-6;
  for (let i = 0; i < tokA.length; i++) {
    const aNum = parseFloatToken(tokA[i]);
    const eNum = parseFloatToken(tokE[i]);
    if (aNum !== null && eNum !== null) {
      const tol = eps * Math.max(1, Math.abs(eNum));
      if (Math.abs(aNum - eNum) > tol) return false;
    } else if (tokA[i] !== tokE[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Compute normalized 0..10 score. Uses IOI-style all-or-nothing subtask scoring
 * when any test defines a positive `subtask` group; otherwise fractional passed/total.
 */
export function computeJudgeScore(
  testCases: Array<{ subtask?: number; points?: number }>,
  results: Array<{ passed: boolean }>,
): { score: number; subtasks?: SubtaskScoreSummary[] } {
  if (testCases.length === 0) return { score: 0 };

  const hasSubtasks = testCases.some(
    (tc) => typeof tc.subtask === "number" && Number.isFinite(tc.subtask) && tc.subtask > 0,
  );

  if (!hasSubtasks) {
    const passedCount = results.filter((r) => r.passed).length;
    return {
      score: Math.round((passedCount / testCases.length) * 100) / 10,
    };
  }

  const groups = new Map<
    number,
    { indices: number[]; explicitPoints: number | null }
  >();

  for (let i = 0; i < testCases.length; i++) {
    const subId =
      typeof testCases[i].subtask === "number" && testCases[i].subtask! > 0
        ? Math.floor(testCases[i].subtask!)
        : 0;
    let g = groups.get(subId);
    if (!g) {
      g = { indices: [], explicitPoints: null };
      groups.set(subId, g);
    }
    g.indices.push(i);
    if (
      g.explicitPoints === null &&
      typeof testCases[i].points === "number" &&
      Number.isFinite(testCases[i].points) &&
      testCases[i].points! > 0
    ) {
      g.explicitPoints = testCases[i].points!;
    }
  }

  const sortedIds = Array.from(groups.keys()).sort((a, b) => a - b);
  const explicitSum = sortedIds.reduce(
    (acc, id) => acc + (groups.get(id)!.explicitPoints ?? 0),
    0,
  );
  const useExplicit = explicitSum > 0 && sortedIds.every((id) => (groups.get(id)!.explicitPoints ?? 0) > 0);
  const evenWeight = 10 / Math.max(1, sortedIds.length);

  let totalWeight = 0;
  let totalEarned = 0;
  const subtasks: SubtaskScoreSummary[] = [];

  for (const id of sortedIds) {
    const g = groups.get(id)!;
    const pts = useExplicit ? g.explicitPoints! : evenWeight;
    const passed = g.indices.filter((idx) => results[idx]?.passed).length;
    const total = g.indices.length;
    const allPassed = total > 0 && passed === total;
    const earned = allPassed ? pts : 0;

    totalWeight += pts;
    totalEarned += earned;
    subtasks.push({
      subtask: id,
      passed,
      total,
      points: Math.round(pts * 100) / 100,
      earned: Math.round(earned * 100) / 100,
      allPassed,
    });
  }

  const score =
    totalWeight > 0 ? Math.round((totalEarned / totalWeight) * 1000) / 100 : 0;
  return {
    score: Math.round(score * 10) / 10,
    subtasks,
  };
}
