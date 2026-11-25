import "dotenv/config";
import { randomUUID } from "node:crypto";
import prisma from "../../utils/prisma";
import { detectLanguage } from "../../utils/codeLanguage";
import { fromExamAttempt, fromProblemSubmission } from "../skillEvidence";

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

async function run() {
  console.log("\n── Cross-feature skill evidence & language detection ──");

  const validSkills = new Set(["py.var", "py.loop_for", "cpp.array"]);
  const examRows = fromExamAttempt(
    "user-1",
    "exam-1",
    "attempt-1",
    [
      {
        questionId: "q-1",
        isCorrect: true,
        skillIds: ["py.var", "unknown.custom_tag", "py.var"],
        difficulty: 4,
      },
      {
        questionId: "q-2",
        isCorrect: false,
        skillIds: ["py.loop_for"],
      },
    ],
    validSkills,
    new Date("2026-11-25T10:00:00Z"),
  );

  check("fromExamAttempt skips unknown free-text skills and deduplicates repeated skillIds", examRows.length === 2);
  check("fromExamAttempt preserves source, contextId, sessionKey, and difficulty", (
    examRows[0]?.source === "exam" &&
    examRows[0]?.contextId === "exam-1" &&
    examRows[0]?.sessionKey === "exam:exam-1:attempt-1" &&
    examRows[0]?.difficultyUsed === 4 &&
    examRows[0]?.isCorrect === true
  ));
  check("fromExamAttempt defaults missing difficulty to 3", examRows[1]?.difficultyUsed === 3 && examRows[1]?.isCorrect === false);

  const unapprovedProblem = fromProblemSubmission(
    "user-1",
    "prob-1",
    1,
    { skillId: "py.var", skillTagStatus: "pending", difficulty: "hard" },
    true,
    new Date(),
  );
  const approvedProblem = fromProblemSubmission(
    "user-1",
    "prob-1",
    2,
    { skillId: "py.var", skillTagStatus: "approved", difficulty: "hard" },
    true,
    new Date(),
  );
  check("fromProblemSubmission returns empty when skillTagStatus is not approved", unapprovedProblem.length === 0);
  check("fromProblemSubmission maps approved hard problem to difficulty 5", approvedProblem.length === 1 && approvedProblem[0].difficultyUsed === 5);

  check("detectLanguage identifies C++ code", detectLanguage("#include <iostream>\nint main(){return 0;}") === "cpp");
  check("detectLanguage identifies Python code", detectLanguage("def solve(n):\n    print(n)\n") === "python");

  console.log("\n── Database invariants (passed flag, language column, CodeLabSnippet CRUD) ──");
  const suffix = randomUUID().slice(0, 8);
  const testUser = await prisma.user.create({
    data: {
      fullName: "Test Student",
      email: `test-logic-${suffix}@codeclass.local`,
      passwordHash: "unused-hash",
      role: "student",
    },
  });
  const testProblem = await prisma.problem.create({
    data: {
      title: `Smoke Problem ${suffix}`,
      statement: "In ra tong a + b",
      difficulty: "easy",
      status: "published",
      createdById: testUser.id,
    },
  });

  try {
    await prisma.problemSubmission.create({
      data: {
        problemId: testProblem.id,
        studentId: testUser.id,
        code: "print(1)",
        language: "python",
        passed: false,
      },
    });

    const solvedBefore = await prisma.problemSubmission.findMany({
      where: { studentId: testUser.id, passed: true },
      select: { problemId: true },
    });
    check("failing submission (passed=false) does not count as solved", solvedBefore.length === 0);

    await prisma.problemSubmission.create({
      data: {
        problemId: testProblem.id,
        studentId: testUser.id,
        code: "#include <iostream>\nint main(){}",
        language: "cpp",
        passed: true,
      },
    });

    const solvedAfter = await prisma.problemSubmission.findMany({
      where: { studentId: testUser.id, passed: true },
      select: { problemId: true, language: true },
    });
    check("passing C++ submission counts once as solved and persists language='cpp'", solvedAfter.length === 1 && solvedAfter[0].language === "cpp");

    const snippet = await prisma.codeLabSnippet.create({
      data: {
        userId: testUser.id,
        title: "hello.cpp",
        language: "cpp",
        code: "#include <iostream>\nint main(){}",
        inputText: "5\n",
      },
    });
    const updatedSnippet = await prisma.codeLabSnippet.update({
      where: { id: snippet.id },
      data: { code: "updated" },
    });
    const listAfterUpdate = await prisma.codeLabSnippet.findMany({ where: { userId: testUser.id } });
    await prisma.codeLabSnippet.delete({ where: { id: snippet.id } });
    const listAfterDelete = await prisma.codeLabSnippet.findMany({ where: { userId: testUser.id } });

    check("CodeLabSnippet CRUD works cleanly", (
      updatedSnippet.code === "updated" &&
      listAfterUpdate.length === 1 &&
      listAfterDelete.length === 0
    ));
  } finally {
    await prisma.problem.delete({ where: { id: testProblem.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nCross-feature checks: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
