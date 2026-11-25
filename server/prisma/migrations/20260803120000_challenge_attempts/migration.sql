-- Migration: 20260803120000_challenge_attempts
-- Adds the ChallengeAttempt table: one row per (student × in-lesson code
-- challenge), upserted on every Run. Before this, code written in the
-- PythonRunner widget was never persisted server-side (only the student's own
-- localStorage), so teachers had no way to see what students actually wrote.
--
-- `passed` is nullable on purpose:
--   NULL  = the challenge has no expectedOutput to grade against
--           (every C++/Python code_runner block falls here)
--   0     = graded and wrong
--   1     = graded and correct
-- This is a purely additive change; no existing data is touched.

CREATE TABLE "challenge_attempts" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "user_id"         TEXT NOT NULL,
    "lesson_id"       TEXT NOT NULL,
    "challenge_key"   TEXT NOT NULL,
    "title"           TEXT,
    "language"        TEXT NOT NULL DEFAULT 'python',
    "latest_code"     TEXT NOT NULL,
    "first_pass_code" TEXT,
    "run_count"       INTEGER NOT NULL DEFAULT 0,
    "fail_count"      INTEGER NOT NULL DEFAULT 0,
    "passed"          BOOLEAN,
    "first_pass_at"   DATETIME,
    "last_run_at"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      DATETIME NOT NULL,
    CONSTRAINT "challenge_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "challenge_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "challenge_attempts_user_id_challenge_key_key" ON "challenge_attempts"("user_id", "challenge_key");
CREATE INDEX "challenge_attempts_lesson_id_idx" ON "challenge_attempts"("lesson_id");
CREATE INDEX "challenge_attempts_user_id_last_run_at_idx" ON "challenge_attempts"("user_id", "last_run_at");
