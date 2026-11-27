import assert from "node:assert/strict";
import prisma from "../../utils/prisma";
import { importProblemPack, validateProblemPack } from "../problemPackService";

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

  console.log("\n── Problem Pack validator & idempotent importer ──");

  // 1. Validation edge cases
  let threwEmpty = false;
  try {
    validateProblemPack({ packId: "bad", title: "Bad", problems: [] });
  } catch {
    threwEmpty = true;
  }
  check("rejects empty problems array", threwEmpty);

  let threwHuge = false;
  try {
    validateProblemPack({
      packId: "huge",
      title: "Huge",
      problems: [
        {
          title: "Huge Test",
          statement: "Test",
          difficulty: "easy",
          testCases: [{ input: "a".repeat(260_000), output: "1", hidden: true }],
        },
      ],
    });
  } catch {
    threwHuge = true;
  }
  check("rejects test case exceeding 250KB", threwHuge);

  const valid = validateProblemPack({
    packId: "unit-check",
    title: "Unit Check Pack",
    problems: [
      {
        title: "Sample Pack Check",
        statement: "Given N, print N+1",
        difficulty: "medium",
        skillId: "algo.dp_knapsack",
        tags: ["quy hoạch động", "quy hoạch động", "test"],
        testCases: [
          { input: "1\r\n", output: "2\r\n\n", hidden: false },
          { input: "10\n", output: "11", hidden: true },
        ],
      },
      {
        title: "Unknown Skill Check",
        statement: "Fallback unknown skill",
        difficulty: "easy",
        skillId: "nonexistent.skill",
        testCases: [{ input: "0\n", output: "0", hidden: false }],
      },
    ],
  });
  check("accepts valid new CP skillId (algo.dp_knapsack)", valid.problems[0].skillId === "algo.dp_knapsack");
  check("drops unknown skillId safely to null", valid.problems[1].skillId === null);
  check("deduplicates tags and normalizes CRLF test outputs", valid.problems[0].tags?.length === 2 && valid.problems[0].testCases[0].output === "2");

  // 2. DB idempotent import (create -> skip -> upsert)
  const staff = await prisma.user.findFirst({ where: { role: { in: ["admin", "teacher"] } } });
  assert.ok(staff, "Expected at least 1 admin/teacher in DB");

  const uniq = Date.now();
  const titleA = `__test_pack_a_${uniq}`;
  const titleB = `__test_pack_b_${uniq}`;
  const samplePack = {
    packId: `test-pack-${uniq}`,
    title: "Test Import Pack",
    problems: [
      {
        title: titleA,
        shortDescription: "Short A",
        statement: "Statement A v1",
        difficulty: "easy",
        skillId: "algo.graph_shortest_path",
        tags: ["đồ thị", "dijkstra"],
        hints: "Hint A",
        teacherSolution: "// C++ v1",
        testCases: [
          { input: "1\n", output: "1", hidden: false },
          { input: "2\n", output: "4", hidden: true },
        ],
      },
      {
        title: titleB,
        shortDescription: "Short B",
        statement: "Statement B v1",
        difficulty: "hard",
        skillId: "algo.dp_interval_bitmask",
        tags: ["quy hoạch động"],
        testCases: [{ input: "3\n", output: "9", hidden: false }],
      },
    ],
  };

  try {
    const res1 = await importProblemPack(samplePack, staff.id, { mode: "skip", publish: true });
    check("first import creates 2 problems", res1.created === 2 && res1.skipped === 0 && res1.errors.length === 0);

    const dbA = await prisma.problem.findFirst({ where: { title: titleA }, include: { tags: true } });
    check(
      "created problem has approved canonical skillId and tags",
      dbA?.skillId === "algo.graph_shortest_path" &&
        dbA?.skillTagStatus === "approved" &&
        dbA?.status === "published" &&
        dbA?.tags.length === 2,
    );

    const res2 = await importProblemPack(samplePack, staff.id, { mode: "skip", publish: true });
    check("second import with mode=skip skips both", res2.created === 0 && res2.skipped === 2 && res2.updated === 0);

    const updatedPack = {
      ...samplePack,
      problems: [
        { ...samplePack.problems[0], statement: "Statement A v2", tags: ["đồ thị"] },
        samplePack.problems[1],
      ],
    };
    const res3 = await importProblemPack(updatedPack, staff.id, { mode: "upsert", publish: true });
    const dbA2 = await prisma.problem.findFirst({ where: { title: titleA }, include: { tags: true } });
    check(
      "third import with mode=upsert updates statement and tags",
      res3.updated === 2 && dbA2?.statement === "Statement A v2" && dbA2?.tags.length === 1,
    );
  } finally {
    await prisma.problem.deleteMany({ where: { title: { in: [titleA, titleB] } } });
    await prisma.$disconnect();
  }

  console.log(`\nproblemPackService tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
