-- Migration: 20260805000000_daily_study_item_minutes
-- Adds DailyStudyItem.estimatedMinutes.
--
-- Why: createTodayDailyStudyPlan has always sent estimatedMinutes on each item
-- (dailyStudyPlan.ts computes 5, 6, or 10-20 minutes depending on whether the
-- item is a quiz, a lesson or a problem), and the client's DailyStudyItem type
-- declares the field. But the column never existed, so every plan creation
-- failed with PrismaClientValidationError. The error was caught and logged,
-- so the daily study plan silently produced nothing instead of failing loudly.
--
-- Note the column name is camelCase: this model declares no @map on its fields,
-- unlike most of the schema, so Prisma uses the field names verbatim. Verified
-- against PRAGMA table_info(daily_study_items) before writing this.
--
-- Additive with a default, so existing rows stay valid and no data is touched.

ALTER TABLE "daily_study_items" ADD COLUMN "estimatedMinutes" INTEGER NOT NULL DEFAULT 5;
