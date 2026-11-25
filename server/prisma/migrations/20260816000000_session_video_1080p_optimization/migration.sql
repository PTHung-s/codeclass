-- Keep the original video only while the 1080p derivative is being encoded.
-- All columns are additive so existing session lessons remain playable.

ALTER TABLE "session_lessons" ADD COLUMN "video_source_url" TEXT;
ALTER TABLE "session_lessons" ADD COLUMN "video_storage_key" TEXT;
ALTER TABLE "session_lessons" ADD COLUMN "video_source_key" TEXT;
ALTER TABLE "session_lessons" ADD COLUMN "video_original_size" INTEGER;
ALTER TABLE "session_lessons" ADD COLUMN "video_optimized_size" INTEGER;
ALTER TABLE "session_lessons" ADD COLUMN "video_compression_status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "session_lessons" ADD COLUMN "video_compression_error" TEXT;
ALTER TABLE "session_lessons" ADD COLUMN "video_processing_token" TEXT;
