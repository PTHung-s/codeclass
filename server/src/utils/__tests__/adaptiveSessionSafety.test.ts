import {
  createSession,
  deleteSession,
  getAdaptiveQuestionCount,
  getSession,
  processAnswer,
  restoreSession,
  serializeSession,
  type BankQuestion,
} from "../adaptiveEngine";

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

const bank: BankQuestion[] = [
  { id: "q1", lessonId: "l1", question: "Q1", options: ["A", "B"], correctIndex: 0, difficulty: 2, explanation: null },
  { id: "q2", lessonId: "l1", question: "Q2", options: ["A", "B"], correctIndex: 1, difficulty: 3, explanation: null },
  { id: "q3", lessonId: "l2", question: "Q3", options: ["A", "B"], correctIndex: 0, difficulty: 4, explanation: null },
];
const config = { scale: 1, pass: 4, partial: 3 };

console.log("\n── Adaptive session safety ──");
check("bank size is capped at the configured maximum", getAdaptiveQuestionCount(100) === 25);
check("short bank uses its real size", getAdaptiveQuestionCount(2) === 2);
check("negative bank size is normalized", getAdaptiveQuestionCount(-1) === 0);
check("non-finite bank size is normalized", getAdaptiveQuestionCount(Number.NaN) === 0);

const session = createSession("safety-1", "user-1", "module-1", "course-1", bank, config, 3, 10);
session.currentQuestionId = "q1";
const first = processAnswer(session, "q1", 0);
check("first answer is recorded", session.answers.length === 1 && first.answer.isCorrect);
check("answered question is cleared as current", session.currentQuestionId === null);

const duplicate = processAnswer(session, "q1", 1);
check("retry is idempotent", session.answers.length === 1 && duplicate.answer.selectedIndex === 0);

session.currentQuestionId = "q2";
let rejectedUnexpected = false;
try {
  processAnswer(session, "q3", 0);
} catch (error) {
  rejectedUnexpected = error instanceof Error && error.message.includes("Unexpected question");
}
check("a different unanswered/current question cannot be substituted", rejectedUnexpected);

let rejectedIndex = false;
try {
  processAnswer(session, "q2", 2);
} catch (error) {
  rejectedIndex = error instanceof Error && error.message.includes("out of range");
}
check("out-of-range answer indexes are rejected", rejectedIndex);

const roundTrip = restoreSession(serializeSession(session));
check("serialized sessions restore with ownership", roundTrip?.userId === "user-1");
check("serialized sessions preserve current question", roundTrip?.currentQuestionId === "q2");

deleteSession("safety-1");
check("deleted in-memory sessions are unavailable", getSession("safety-1") === undefined);

const expired = createSession("expired-1", "user-1", "module-1", "course-1", bank, config, 2, 10, -1);
check("expired sessions are rejected", getSession(expired.sessionId) === undefined);

console.log(`  Passed: ${pass} / ${pass + fail}`);
console.log(`  Failed: ${fail}`);
if (fail > 0) process.exit(1);
