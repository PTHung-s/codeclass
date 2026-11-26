import {
  aggregateStudentAssignmentProgress,
  deriveSubmissionType,
  evaluateLessonItem,
  evaluateProblemItem,
  evaluateQuizItem,
  normalizeAssignmentItems,
  NormalizedAssignmentItem,
  summarizeItemsText,
} from "../assignmentService";

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

console.log("\n── Normalization & legacy fallback ──");
const mixedItems = normalizeAssignmentItems({
  id: "a1",
  title: "BTVN Tuần 4",
  deadline: null,
  items: [
    {
      id: "i2",
      itemType: "quiz",
      orderIndex: 2,
      problemId: null,
      quizId: "q1",
      lessonId: "l1",
      quiz: { id: "q1", title: "Quiz Vòng lặp", lessonId: "l1", lesson: { id: "l1", title: "Vòng lặp", course: { id: "c1", title: "Python" } } },
    },
    {
      id: "i1",
      itemType: "problem",
      orderIndex: 0,
      problemId: "p1",
      quizId: null,
      lessonId: null,
      problem: { id: "p1", title: "Tổng N số", difficulty: "easy" },
    },
    {
      id: "i3",
      itemType: "lesson",
      orderIndex: 1,
      problemId: null,
      quizId: null,
      lessonId: "l2",
      lesson: { id: "l2", title: "Bài 5: Hàm", course: { id: "c1", title: "Python" } },
    },
  ],
});

check("sorts items by orderIndex", mixedItems.map((i) => i.id).join(",") === "i1,i3,i2");
check("builds problem linkPath", mixedItems[0].linkPath === "/problems/p1");
check("builds lesson linkPath", mixedItems[1].linkPath === "/lessons/l2");
check("builds quiz linkPath", mixedItems[2].linkPath === "/lessons/l1/quiz");
check("derives mixed submissionType", deriveSubmissionType(mixedItems) === "mixed");
check(
  "summarizes mixed items cleanly",
  summarizeItemsText(mixedItems) === "1 bài code, 1 quiz, 1 bài học",
);

const legacyItems = normalizeAssignmentItems({
  id: "a-legacy",
  title: "Legacy bài code",
  deadline: null,
  problemId: "p99",
  problem: { id: "p99", title: "Fibonacci", difficulty: "medium" },
});
check("legacy assignment falls back to single problem item", legacyItems.length === 1 && legacyItems[0].problemId === "p99");

console.log("\n── Late-submission loophole fix & strictDeadline ──");
const deadline = d("2026-11-20T12:00:00Z");
const pItem: NormalizedAssignmentItem = {
  id: "it-p",
  itemType: "problem",
  problemId: "p1",
  quizId: null,
  lessonId: null,
  title: "Hai tổng",
  difficulty: "easy",
  courseTitle: null,
  linkPath: "/problems/p1",
};

// Failed attempt before deadline + AC after deadline => isLate MUST be true!
const latePassEval = evaluateProblemItem(
  pItem,
  {
    attempts: 2,
    passed: true,
    firstAttemptAt: d("2026-11-20T10:00:00Z"),
    lastAttemptAt: d("2026-11-21T10:00:00Z"),
    passedAt: d("2026-11-21T10:00:00Z"),
    latestSubmissionId: "sub2",
  },
  deadline,
  false,
);
check("failed before deadline + AC after deadline => passed=true and isLate=true", latePassEval.passed === true && latePassEval.isLate === true);

// Passed before deadline + optional extra practice after deadline => isLate MUST be false!
const onTimeWithLaterRetry = evaluateProblemItem(
  pItem,
  {
    attempts: 2,
    passed: true,
    firstAttemptAt: d("2026-11-20T09:00:00Z"),
    lastAttemptAt: d("2026-11-22T09:00:00Z"),
    passedAt: d("2026-11-20T09:00:00Z"),
    latestSubmissionId: "sub1",
  },
  deadline,
  true,
);
check("AC before deadline + retry later => passed=true and isLate=false even under strictDeadline", onTimeWithLaterRetry.passed === true && onTimeWithLaterRetry.isLate === false);

// strictDeadline = true blocks AC after deadline from counting as passed
const strictBlockedEval = evaluateProblemItem(
  pItem,
  {
    attempts: 1,
    passed: true,
    firstAttemptAt: d("2026-11-21T08:00:00Z"),
    lastAttemptAt: d("2026-11-21T08:00:00Z"),
    passedAt: d("2026-11-21T08:00:00Z"),
    latestSubmissionId: "sub3",
  },
  deadline,
  true,
);
check(
  "strictDeadline=true rejects post-deadline pass",
  strictBlockedEval.passed === false && strictBlockedEval.closedAfterDeadline === true && strictBlockedEval.status === "attempting",
);

console.log("\n── Multi-item aggregation & quiz/lesson evaluation ──");
const qItem: NormalizedAssignmentItem = {
  id: "it-q",
  itemType: "quiz",
  problemId: null,
  quizId: "q1",
  lessonId: "l1",
  title: "Quiz 1",
  difficulty: null,
  courseTitle: null,
  linkPath: "/lessons/l1/quiz",
};
const lItem: NormalizedAssignmentItem = {
  id: "it-l",
  itemType: "lesson",
  problemId: null,
  quizId: null,
  lessonId: "l2",
  title: "Bài học 2",
  difficulty: null,
  courseTitle: null,
  linkPath: "/lessons/l2",
};

const quizDone = evaluateQuizItem(
  qItem,
  {
    attempts: 2,
    passed: true,
    firstAttemptAt: d("2026-11-19T10:00:00Z"),
    lastAttemptAt: d("2026-11-19T10:05:00Z"),
    passedAt: d("2026-11-19T10:05:00Z"),
    scoreLabel: "9/10",
  },
  deadline,
  false,
);
check("quiz evaluation preserves passed + scoreLabel", quizDone.passed && quizDone.scoreLabel === "9/10" && !quizDone.isLate);

const lessonNotDone = evaluateLessonItem(lItem, null, deadline, false);
const partialAgg = aggregateStudentAssignmentProgress(
  [latePassEval, quizDone, lessonNotDone],
  deadline,
  false,
  d("2026-11-22T00:00:00Z"),
);
check(
  "2/3 completed aggregates to attempting + completedItems=2 + overdue=true",
  partialAgg.status === "attempting" && partialAgg.completedItems === 2 && partialAgg.totalItems === 3 && partialAgg.overdue === true && partialAgg.passed === false,
);

const lessonDone = evaluateLessonItem(lItem, d("2026-11-20T11:00:00Z"), deadline, false);
const fullAggLate = aggregateStudentAssignmentProgress(
  [latePassEval, quizDone, lessonDone],
  deadline,
  false,
  d("2026-11-22T00:00:00Z"),
);
check(
  "3/3 completed with 1 late item => passed=true, isLate=true, completedAt=max(passedAt)",
  fullAggLate.status === "passed" &&
    fullAggLate.passed === true &&
    fullAggLate.isLate === true &&
    fullAggLate.completedItems === 3 &&
    fullAggLate.completedAt?.toISOString() === "2026-11-21T10:00:00.000Z",
);

const strictPartialAgg = aggregateStudentAssignmentProgress(
  [strictBlockedEval, quizDone, lessonDone],
  deadline,
  true,
  d("2026-11-22T00:00:00Z"),
);
check(
  "strictDeadline locks incomplete assignment after deadline",
  strictPartialAgg.passed === false && strictPartialAgg.locked === true && strictPartialAgg.closedAfterDeadline === true,
);

console.log(`\nassignmentService tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
