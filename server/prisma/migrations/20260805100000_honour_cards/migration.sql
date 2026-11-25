-- Migration: 20260805100000_honour_cards
-- Weekly top-3 honour cards.
--
-- honour_showings answers "has this viewer already seen this student's card
-- this week?". The key is (viewer, honouree, week) rather than a per-day flag
-- because the top 3 come online at different times: a student who logs in when
-- only #1 is online sees one card now and the other two later, each exactly
-- once. A "seen today" boolean cannot express that.
--
-- honour_praises stores the compliment a viewer must write to dismiss a card,
-- one per (author, honouree, week). The honouree reads them from the bell.
--
-- Column names are camelCase-free here (snake_case with @map in the schema),
-- matching the newer tables like challenge_attempts.
--
-- Purely additive; no existing data is touched.

CREATE TABLE "honour_showings" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "viewer_id"    TEXT NOT NULL,
    "honouree_id"  TEXT NOT NULL,
    "week_key"     TEXT NOT NULL,
    "rank"         INTEGER NOT NULL,
    "shown_at"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "honour_showings_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "honour_showings_viewer_id_honouree_id_week_key_key" ON "honour_showings"("viewer_id", "honouree_id", "week_key");
CREATE INDEX "honour_showings_week_key_idx" ON "honour_showings"("week_key");

CREATE TABLE "honour_praises" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "author_id"    TEXT NOT NULL,
    "honouree_id"  TEXT NOT NULL,
    "week_key"     TEXT NOT NULL,
    "rank"         INTEGER NOT NULL,
    "message"      TEXT NOT NULL,
    "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "honour_praises_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "honour_praises_honouree_id_fkey" FOREIGN KEY ("honouree_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "honour_praises_author_id_honouree_id_week_key_key" ON "honour_praises"("author_id", "honouree_id", "week_key");
CREATE INDEX "honour_praises_honouree_id_week_key_idx" ON "honour_praises"("honouree_id", "week_key");
