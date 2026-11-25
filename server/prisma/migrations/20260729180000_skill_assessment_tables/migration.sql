-- Migration: 20260729180000_skill_assessment_tables
-- Adds the Skill Assessment tables (Skill, StudentSkillMastery,
-- Recommendation, RecommendationLog, EngineSetting, QuizQuestionResponse,
-- QuizQuestionCalibration, StudentWeaknessTag, StudentRosterExclusion,
-- DailyStudyPlan, DailyStudyItem, ChecklistAssignment, ChecklistItem,
-- ChecklistAssignmentStudent, ChecklistItemCompletion, DailyCheckIn,
-- ArenaChaosEffect, ArenaQuizItem, ArenaQuizCalibration,
-- GlobalTuitionPayment, AdaptiveTestSession) and the missing
-- QuizQuestion / Problem / AttendanceSession columns required by the
-- cpp.* / py.* skill graph and master-recalculation logic.

-- Problem skill tagging
ALTER TABLE "problems" ADD COLUMN "skill_id" TEXT;
ALTER TABLE "problems" ADD COLUMN "ai_skill_suggest" TEXT;
ALTER TABLE "problems" ADD COLUMN "skill_tag_status" TEXT NOT NULL DEFAULT 'untagged';
CREATE INDEX "problems_skill_tag_status_idx" ON "problems"("skill_tag_status");

-- QuizQuestion skill + calibration columns
ALTER TABLE "quiz_questions" ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "quiz_questions" ADD COLUMN "calibrated_difficulty" REAL;
ALTER TABLE "quiz_questions" ADD COLUMN "effective_difficulty" REAL;
ALTER TABLE "quiz_questions" ADD COLUMN "calibration_samples" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quiz_questions" ADD COLUMN "calibration_confidence" REAL NOT NULL DEFAULT 0;
ALTER TABLE "quiz_questions" ADD COLUMN "calibration_status" TEXT NOT NULL DEFAULT 'collecting';
ALTER TABLE "quiz_questions" ADD COLUMN "calibration_locked" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "quiz_questions" ADD COLUMN "last_calibrated_at" DATETIME;
ALTER TABLE "quiz_questions" ADD COLUMN "skill_id" TEXT;
ALTER TABLE "quiz_questions" ADD COLUMN "ai_skill_suggest" TEXT;
ALTER TABLE "quiz_questions" ADD COLUMN "skill_tag_status" TEXT NOT NULL DEFAULT 'untagged';
CREATE INDEX "quiz_questions_skill_tag_status_idx" ON "quiz_questions"("skill_tag_status");

-- User avatar shop columns
ALTER TABLE "users" ADD COLUMN "unlocked_avatars" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "users" ADD COLUMN "selected_avatar" TEXT NOT NULL DEFAULT 'default';

-- Adaptive test session linkage
ALTER TABLE "adaptive_test_attempts" ADD COLUMN "session_id" TEXT;

-- Attendance session lifecycle columns
ALTER TABLE "attendance_sessions" ADD COLUMN "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "attendance_sessions" ADD COLUMN "ends_at" DATETIME;
ALTER TABLE "attendance_sessions" ADD COLUMN "started_by" TEXT;

-- Skill catalog
CREATE TABLE IF NOT EXISTS "skills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skills_skillId_key" UNIQUE ("skillId")
);
CREATE INDEX IF NOT EXISTS "skills_topicId_idx" ON "skills"("topicId");

-- Per-student mastery per skill
CREATE TABLE IF NOT EXISTS "student_skill_masteries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "value" REAL NOT NULL DEFAULT 0.5,
    "trend" TEXT NOT NULL DEFAULT 'flat',
    "historyJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_skill_masteries_userId_skillId_key" UNIQUE ("userId", "skillId")
);

-- Recommendations + log
CREATE TABLE IF NOT EXISTS "recommendations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'remedial',
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "mandatory" BOOLEAN NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lessonId" TEXT,
    "detailLevel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" DATETIME,
    "completedAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "recommendations_userId_status_idx" ON "recommendations"("userId", "status");

CREATE TABLE IF NOT EXISTS "recommendation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "ruleId" TEXT NOT NULL,
    "skillId" TEXT,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "recommendation_logs_userId_createdAt_idx" ON "recommendation_logs"("userId", "createdAt");

-- Engine settings
CREATE TABLE IF NOT EXISTS "engine_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Quiz question responses (for calibration)
CREATE TABLE IF NOT EXISTS "quiz_question_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT 'lesson_quiz',
    "attemptOrdinal" INTEGER NOT NULL DEFAULT 1,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "authoredDifficulty" INTEGER NOT NULL,
    "difficultyUsed" REAL NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER,
    "activeTimeMs" INTEGER,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "skillId" TEXT,
    "skillTagStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_question_responses_attemptId_questionId_key" UNIQUE ("attemptId", "questionId")
);
CREATE INDEX IF NOT EXISTS "quiz_question_responses_questionId_contentVersion_idx" ON "quiz_question_responses"("questionId", "contentVersion");
CREATE INDEX IF NOT EXISTS "quiz_question_responses_userId_questionId_createdAt_idx" ON "quiz_question_responses"("userId", "questionId", "createdAt");

-- Quiz question calibration
CREATE TABLE IF NOT EXISTS "quiz_question_calibrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'smoothed-rate-v1',
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueStudentCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "correctRate" REAL NOT NULL DEFAULT 0,
    "empiricalDifficulty" REAL,
    "effectiveDifficulty" REAL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "optionDistribution" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_question_calibrations_questionId_contentVersion_modelVersion_key" UNIQUE ("questionId", "contentVersion", "modelVersion")
);
CREATE INDEX IF NOT EXISTS "quiz_question_calibrations_status_idx" ON "quiz_question_calibrations"("status");

-- Student weakness tags
CREATE TABLE IF NOT EXISTS "student_weakness_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_weakness_tags_userId_tag_key" UNIQUE ("userId", "tag")
);
CREATE INDEX IF NOT EXISTS "student_weakness_tags_userId_status_idx" ON "student_weakness_tags"("userId", "status");

-- Student roster exclusions (replaces User.rosterExclusion column)
CREATE TABLE IF NOT EXISTS "student_roster_exclusions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "removedById" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_roster_exclusions_studentId_key" UNIQUE ("studentId")
);

-- Daily check-ins (replaces User.dailyCheckIns that's used in some flows)
CREATE TABLE IF NOT EXISTS "daily_check_ins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "note" TEXT,
    "checkInAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_check_ins_studentId_date_key" UNIQUE ("studentId", "date")
);
CREATE INDEX IF NOT EXISTS "daily_check_ins_date_idx" ON "daily_check_ins"("date");

-- Checklist assignments (student checklists)
CREATE TABLE IF NOT EXISTS "checklist_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "checklist_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "checklist_assignment_students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_assignment_students_assignmentId_studentId_key" UNIQUE ("assignmentId", "studentId")
);
CREATE TABLE IF NOT EXISTS "checklist_item_completions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_item_completions_itemId_studentId_key" UNIQUE ("itemId", "studentId")
);

-- Daily study plan + items
CREATE TABLE IF NOT EXISTS "daily_study_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_study_plans_userId_day_key" UNIQUE ("userId", "day")
);

CREATE TABLE IF NOT EXISTS "daily_study_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'lesson',
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "lessonId" TEXT,
    "moduleId" TEXT,
    "courseId" TEXT,
    "quizId" TEXT,
    "problemId" TEXT,
    "skillId" TEXT,
    "evidence" TEXT,
    "actionUrl" TEXT,
    "priority" REAL NOT NULL DEFAULT 0.5,
    "masterySnapshot" REAL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "daily_study_items_userId_day_position_idx" ON "daily_study_items"("userId", "day", "position");
CREATE INDEX IF NOT EXISTS "daily_study_items_planId_idx" ON "daily_study_items"("planId");

-- Adaptive test sessions (transient state)
CREATE TABLE IF NOT EXISTS "adaptive_test_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "stateJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "adaptive_test_sessions_expiresAt_idx" ON "adaptive_test_sessions"("expiresAt");
CREATE INDEX IF NOT EXISTS "adaptive_test_sessions_userId_idx" ON "adaptive_test_sessions"("userId");

-- Debug arena extra columns
ALTER TABLE "debug_arena_matches" ADD COLUMN "arena_type" TEXT NOT NULL DEFAULT 'debug';
ALTER TABLE "debug_arena_matches" ADD COLUMN "chaos_enabled" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_item_id" TEXT;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_options" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_correct_index" INTEGER;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_explanation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_topic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_difficulty" REAL;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_effective_difficulty" REAL;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_calibration_samples" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_calibration_confidence" REAL NOT NULL DEFAULT 0;
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_calibration_status" TEXT NOT NULL DEFAULT 'collecting';
ALTER TABLE "debug_arena_questions" ADD COLUMN "quiz_difficulty_used" REAL;
ALTER TABLE "debug_arena_questions" ADD COLUMN "buggy_line_numbers" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "debug_arena_answers" ADD COLUMN "highlighted_lines" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "debug_arena_answers" ADD COLUMN "identified" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "debug_arena_answers" ADD COLUMN "selected_index" INTEGER;
ALTER TABLE "debug_arena_answers" ADD COLUMN "is_correct" BOOLEAN;
ALTER TABLE "debug_arena_answers" ADD COLUMN "response_time_ms" INTEGER;
ALTER TABLE "debug_arena_answers" ADD COLUMN "active_time_ms" INTEGER;
ALTER TABLE "debug_arena_answers" ADD COLUMN "change_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "debug_arena_answers" ADD COLUMN "quiz_difficulty_used" REAL;

CREATE TABLE IF NOT EXISTS "arena_chaos_effects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "match_id" TEXT NOT NULL,
    "question_index" INTEGER NOT NULL,
    "source_user_id" TEXT NOT NULL,
    "target_user_ids" TEXT NOT NULL DEFAULT '[]',
    "power" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" DATETIME NOT NULL,
    CONSTRAINT "arena_chaos_effects_action_key_key" UNIQUE ("action_key")
);
CREATE INDEX IF NOT EXISTS "arena_chaos_effects_match_id_question_index_idx" ON "arena_chaos_effects"("match_id", "question_index");

CREATE TABLE IF NOT EXISTS "arena_quiz_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'python',
    "statement" TEXT NOT NULL,
    "input" TEXT NOT NULL DEFAULT '',
    "expected_output" TEXT NOT NULL DEFAULT '',
    "options" TEXT NOT NULL DEFAULT '[]',
    "correct_index" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "skill_id" TEXT,
    "ai_skill_suggest" TEXT,
    "skill_tag_status" TEXT NOT NULL DEFAULT 'untagged',
    "authored_difficulty" REAL NOT NULL DEFAULT 3,
    "effective_difficulty" REAL,
    "calibrated_difficulty" REAL,
    "content_version" INTEGER NOT NULL DEFAULT 1,
    "calibration_samples" INTEGER NOT NULL DEFAULT 0,
    "calibration_confidence" REAL NOT NULL DEFAULT 0,
    "calibration_status" TEXT NOT NULL DEFAULT 'collecting',
    "calibration_locked" BOOLEAN NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arena_quiz_items_fingerprint_key" UNIQUE ("fingerprint")
);
CREATE INDEX IF NOT EXISTS "arena_quiz_items_language_updated_at_idx" ON "arena_quiz_items"("language", "updated_at");

CREATE TABLE IF NOT EXISTS "arena_quiz_calibrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_id" TEXT NOT NULL,
    "content_version" INTEGER NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT 'smoothed-rate-v1',
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "unique_student_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "correct_rate" REAL NOT NULL DEFAULT 0,
    "empirical_difficulty" REAL,
    "effective_difficulty" REAL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "option_distribution" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arena_quiz_calibrations_item_id_content_version_model_version_key" UNIQUE ("item_id", "content_version", "model_version")
);
CREATE INDEX IF NOT EXISTS "arena_quiz_calibrations_status_idx" ON "arena_quiz_calibrations"("status");

-- Legacy global tuition table (no class scope)
CREATE TABLE IF NOT EXISTS "global_tuition_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "amount" REAL,
    "note" TEXT,
    "paid_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "global_tuition_payments_user_id_period_key" UNIQUE ("user_id", "period")
);
CREATE INDEX IF NOT EXISTS "global_tuition_payments_period_idx" ON "global_tuition_payments"("period");