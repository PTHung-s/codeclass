-- Migration: 20260803140000_recording_sessions
-- Adds teacher-controlled lesson recording: RecordingSession (Start/End),
-- RecordingParticipant (one row per student in the session) and RecordingEvent
-- (timestamped events that power the draggable timeline).
--
-- Why this exists: the existing session_logs table only stores ONE aggregate
-- tab_outs number per day, with no timestamps, so it can never answer "when did
-- this student leave the tab". Recording events carry an `at` timestamp.
--
-- `session_date` is stored at Asia/Ho_Chi_Minh midnight and acts as the
-- overwrite key: re-recording on the same day replaces that day's session
-- (cascade deletes its participants and events), while earlier days survive.
--
-- This is a purely additive change; no existing data is touched.

CREATE TABLE "recording_sessions" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "title"        TEXT,
    "session_date" DATETIME NOT NULL,
    "started_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at"     DATETIME,
    "status"       TEXT NOT NULL DEFAULT 'recording',
    "started_by"   TEXT NOT NULL,
    "course_id"    TEXT,
    CONSTRAINT "recording_sessions_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "recording_sessions_session_date_idx" ON "recording_sessions"("session_date");
CREATE INDEX "recording_sessions_status_idx" ON "recording_sessions"("status");

CREATE TABLE "recording_participants" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "session_id"     TEXT NOT NULL,
    "user_id"        TEXT NOT NULL,
    "joined_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_manually" BOOLEAN NOT NULL DEFAULT 0,
    "active_seconds" INTEGER NOT NULL DEFAULT 0,
    "tab_out_count"  INTEGER NOT NULL DEFAULT 0,
    "run_count"      INTEGER NOT NULL DEFAULT 0,
    "final_code"     TEXT,
    CONSTRAINT "recording_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "recording_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recording_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recording_participants_session_id_user_id_key" ON "recording_participants"("session_id", "user_id");
CREATE INDEX "recording_participants_user_id_idx" ON "recording_participants"("user_id");

CREATE TABLE "recording_events" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "participant_id" TEXT NOT NULL,
    "at"             DATETIME NOT NULL,
    "type"           TEXT NOT NULL,
    "code"           TEXT,
    "label"          TEXT,
    "passed"         BOOLEAN,
    "meta"           TEXT,
    CONSTRAINT "recording_events_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "recording_participants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "recording_events_participant_id_at_idx" ON "recording_events"("participant_id", "at");
