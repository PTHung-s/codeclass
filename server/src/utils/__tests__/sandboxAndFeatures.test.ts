import assert from "node:assert/strict";
import { compareOutputs, computeJudgeScore } from "../judgeChecker";
import { judgePythonCode, runPythonCode } from "../pythonRunner";
import { getSandboxStatus } from "../codeSandbox";
import { detectPlagiarismPairs } from "../../services/plagiarismService";
import { buildCpRoadmap } from "../../services/cpRoadmapService";
import prisma from "../../utils/prisma";

async function run() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) {
      pass++;
      console.log(`  ✓ ${name}`);
    } else {
      fail++;
      console.log(`  ✗ ${name}`);
    }
  };

  console.log("\n── 1. Judge Checker & Subtask Scoring ──");
  check("exact trims CRLF cleanly", compareOutputs("1 2\r\n", "1 2\n", "exact"));
  check("tokens ignores extra spaces/newlines", compareOutputs("1   2\n3", "1 2 3", "tokens"));
  check("ignore_case matches YES vs yes", compareOutputs("Yes", "YES", "ignore_case"));
  check("float_1e6 passes within tolerance", compareOutputs("3.1415927", "3.1415926", "float_1e6"));
  check("float_1e6 rejects error >= 1e-4", !compareOutputs("3.1417", "3.1415", "float_1e6"));

  const subScore = computeJudgeScore(
    [
      { subtask: 1, points: 3 },
      { subtask: 1, points: 3 },
      { subtask: 2, points: 7 },
      { subtask: 2, points: 7 },
    ],
    [{ passed: true }, { passed: true }, { passed: true }, { passed: false }],
  );
  check(
    "IOI subtask all-or-nothing awards only fully passed subtask 1 (3.0/10)",
    subScore.score === 3 && subScore.subtasks?.length === 2 && subScore.subtasks[0].allPassed && !subScore.subtasks[1].allPassed,
  );

  console.log("\n── 2. Ultra-Lightweight Python Sandbox ──");
  const status = getSandboxStatus();
  console.log("  Sandbox mode:", status.mode, "| maxConcurrent:", status.maxConcurrent);

  const okRes = await runPythonCode("a, b = map(int, input().split())\nprint(a + b)", "17 25", {
    timeLimitMs: 3000,
  });
  check("normal A+B passes inside sandbox", okRes.status === "success" && okRes.stdout.trim() === "42");

  // Stdlib modules like math/bisect/heapq/collections must work seamlessly under -I + audit hook
  const stdlibRes = await runPythonCode(
    "import sys, math, bisect, heapq, collections\nprint(math.gcd(12, 18), collections.Counter('aab')['a'])",
    "",
    { timeLimitMs: 3000 },
  );
  check("CP stdlib imports work cleanly under audit hook", stdlibRes.status === "success" && stdlibRes.stdout.trim() === "6 2");

  // Dynamic __import__ bypass attempt must be blocked by PEP-578 audit hook
  const bypassRes = await runPythonCode(
    `m = getattr(__builtins__, "__imp" + "ort__")("subprocess")\nm.run(["echo", "pwn"])`,
    "",
    { timeLimitMs: 3000 },
  );
  check("blocks dynamic getattr(__builtins__, '__import__')('subprocess')", bypassRes.status === "blocked");

  // Parent process secrets must never leak into student child environment
  process.env.__SANDBOX_SECRET_CANARY = "top-secret-canary-999";
  const envLeakRes = await runPythonCode(
    `m = getattr(__builtins__, "__imp" + "ort__")("os")\nprint(m.environ.get("__SANDBOX_SECRET_CANARY", "HIDDEN"))`,
    "",
    { timeLimitMs: 3000 },
  );
  delete process.env.__SANDBOX_SECRET_CANARY;
  check(
    "strips server secrets from child environment",
    envLeakRes.status === "success" && envLeakRes.stdout.trim() === "HIDDEN",
  );

  // Hard wall-clock TLE kill
  const tleRes = await runPythonCode("while True:\n    pass\n", "", { timeLimitMs: 650 });
  check("enforces per-problem timeLimitMs cleanly", tleRes.status === "time_limit" && tleRes.durationMs < 3500);

  // Fast output limit kill (does NOT wait for timeout!)
  const oleRes = await runPythonCode("while True:\n    print('A' * 4000)\n", "", {
    timeLimitMs: 5000,
    maxOutputLength: 32_768,
  });
  check("aborts infinite output flood immediately with output_limit", oleRes.status === "output_limit");

  // Judge circuit breaker skips remaining hidden tests after 3 consecutive TLEs
  const breakerTests = Array.from({ length: 6 }, () => ({
    input: "1\n",
    output: "1",
    hidden: true,
  }));
  const breakerRes = await judgePythonCode("while True:\n    pass\n", breakerTests, undefined, {
    timeLimitMs: 550,
    maxConsecutiveHeavyFails: 3,
  });
  const skippedCount = breakerRes.results.filter((r) => r.status === "skipped").length;
  check("judge circuit breaker skips remaining hidden tests after 3 consecutive TLEs", skippedCount === 3);

  console.log("\n── 3. Code Plagiarism Winnowing Detector ──");
  const codeA = `
# Compute prefix sums and answer queries
import sys
data = sys.stdin.read().split()
n = int(data[0])
q = int(data[1])
arr = [int(data[2 + i]) for i in range(n)]
pref = [0] * (n + 1)
for i in range(n):
    pref[i + 1] = pref[i] + arr[i]
out = []
idx = 2 + n
for _ in range(q):
    l = int(data[idx]); r = int(data[idx + 1]); idx += 2
    out.append(str(pref[r] - pref[l - 1]))
print("\\n".join(out))
`;
  const codeBRenamed = `
import sys
tokens = sys.stdin.read().split()
cnt = int(tokens[0])
queries = int(tokens[1])
values = [int(tokens[2 + k]) for k in range(cnt)]
prefix = [0] * (cnt + 1)
for k in range(cnt):
    prefix[k + 1] = prefix[k] + values[k]
answers = []
ptr = 2 + cnt
for _ in range(queries):
    left = int(tokens[ptr]); right = int(tokens[ptr + 1]); ptr += 2
    answers.append(str(prefix[right] - prefix[left - 1]))
print("\\n".join(answers))
`;
  const codeCUnrelated = `
import heapq
def dijkstra(n, adj):
    dist = [10**18] * (n + 1)
    dist[1] = 0
    pq = [(0, 1)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(pq, (dist[v], v))
    return dist
`;
  const pairs = detectPlagiarismPairs(
    [
      { submissionId: "s1", studentId: "u1", studentName: "An", language: "python", code: codeA },
      { submissionId: "s2", studentId: "u2", studentName: "Binh", language: "python", code: codeBRenamed },
      { submissionId: "s3", studentId: "u3", studentName: "Chi", language: "python", code: codeCUnrelated },
    ],
    { threshold: 0.7 },
  );
  check(
    "flags renamed clone (A <-> B) and ignores unrelated algorithm (C)",
    pairs.length === 1 &&
      pairs[0].similarity >= 0.85 &&
      new Set([pairs[0].studentA.id, pairs[0].studentB.id]).has("u1") &&
      new Set([pairs[0].studentA.id, pairs[0].studentB.id]).has("u2"),
  );

  console.log("\n── 4. CP 4-Tier Roadmap Loader ──");
  const staff = await prisma.user.findFirst({ where: { role: { in: ["admin", "teacher"] } } });
  assert.ok(staff, "Expected staff account in DB");
  const roadmap = await buildCpRoadmap(staff.id, staff.role);
  check(
    "roadmap covers all 4 tiers and all 190 pack problems",
    roadmap.tiers.length === 4 && roadmap.summary.totalPackProblems === 190,
  );

  await prisma.$disconnect();
  console.log(`\nsandboxAndFeatures tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
