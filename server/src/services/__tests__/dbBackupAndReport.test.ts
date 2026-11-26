import { isSafeBackupFilename, selectBackupsToPrune } from "../dbBackupService";
import { formatWeeklyParentReport } from "../weeklyReportService";

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

console.log("\n── SQLite Backup safety & pruning ──");
check(
  "accepts valid timestamped backup filename",
  isSafeBackupFilename("codeclass-backup-2026-11-26_13-45-00.db"),
);
check(
  "rejects path traversal filename",
  !isSafeBackupFilename("../dev.db") && !isSafeBackupFilename("..\\dev.db"),
);
check(
  "rejects nested directory or arbitrary name",
  !isSafeBackupFilename("backups/codeclass-backup-2026-11-26_13-45-00.db") &&
    !isSafeBackupFilename("dev.db"),
);

const pruneList = selectBackupsToPrune(
  [
    { filename: "codeclass-backup-2026-11-20_03-00-00.db", mtimeMs: 100 },
    { filename: "codeclass-backup-2026-11-26_03-00-00.db", mtimeMs: 700 },
    { filename: "codeclass-backup-2026-11-24_03-00-00.db", mtimeMs: 500 },
    { filename: "codeclass-backup-2026-11-21_03-00-00.db", mtimeMs: 200 },
    { filename: "codeclass-backup-2026-11-25_03-00-00.db", mtimeMs: 600 },
    { filename: "codeclass-backup-2026-11-23_03-00-00.db", mtimeMs: 400 },
    { filename: "codeclass-backup-2026-11-22_03-00-00.db", mtimeMs: 300 },
    { filename: "codeclass-backup-2026-11-19_03-00-00.db", mtimeMs: 50 },
    { filename: "codeclass-backup-2026-11-18_03-00-00.db", mtimeMs: 25 },
    { filename: "random-note.txt", mtimeMs: 999 },
  ],
  7,
);
check(
  "keeps 7 newest valid backups and prunes oldest 2 without touching unrelated files",
  pruneList.length === 2 &&
    pruneList.includes("codeclass-backup-2026-11-19_03-00-00.db") &&
    pruneList.includes("codeclass-backup-2026-11-18_03-00-00.db") &&
    !pruneList.includes("random-note.txt"),
);

console.log("\n── Weekly Parent Report formatter ──");
const report = formatWeeklyParentReport({
  days: 7,
  fromDate: "2026-11-19T00:00:00.000Z",
  toDate: "2026-11-26T00:00:00.000Z",
  student: {
    id: "stu-1",
    fullName: "Nguyễn Minh Anh",
    nickname: "Minh Anh",
    email: "ma@example.com",
  },
  metrics: {
    streak: 5,
    attendance: { held: 2, present: 2, late: 0, absent: 0, excused: 0, rate: 100 },
    assignments: {
      total: 4,
      passed: 3,
      lateCount: 1,
      overdueCount: 1,
      overdueTitles: ["Vòng lặp for"],
    },
    practice: {
      problemsSolvedInPeriod: 6,
      lessonsCompletedInPeriod: 2,
      quizzesAttemptedInPeriod: 2,
      quizzesPassedInPeriod: 2,
      latestExam: { title: "Kiểm tra giữa kỳ", scoreText: "8.5/10" },
    },
    skills: {
      strongest: [{ skillId: "py.basics", name: "Biến & kiểu dữ liệu", mastery: 0.91 }],
      weakest: [{ skillId: "py.loops", name: "Vòng lặp", mastery: 0.48, dueForReview: true }],
    },
  },
});

check("includes student display name", report.includes("Nguyễn Minh Anh (Minh Anh)"));
check("includes attendance stats", report.includes("2/2 buổi (100%)"));
check("includes assignment completion and overdue title", report.includes("3/4 bài (75%)") && report.includes("Vòng lặp for"));
check("includes latest exam score", report.includes("Kiểm tra giữa kỳ") && report.includes("8.5/10"));
check("includes strongest and weakest skills", report.includes("Biến & kiểu dữ liệu") && report.includes("Vòng lặp (48%"));

console.log(`\ndbBackupAndReport tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
