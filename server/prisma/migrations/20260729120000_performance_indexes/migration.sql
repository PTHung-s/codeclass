-- Hot-path indexes for course navigation and real-time Arena queries.
CREATE INDEX "course_members_user_id_status_idx" ON "course_members"("user_id", "status");
CREATE INDEX "modules_course_id_order_index_idx" ON "modules"("course_id", "order_index");
CREATE INDEX "lessons_course_id_module_id_order_index_idx" ON "lessons"("course_id", "module_id", "order_index");
CREATE INDEX "debug_arena_matches_arena_type_status_created_at_idx" ON "debug_arena_matches"("arena_type", "status", "created_at");
CREATE INDEX "debug_arena_matches_created_by_mode_status_idx" ON "debug_arena_matches"("created_by", "mode", "status");
CREATE INDEX "debug_arena_players_user_id_match_id_idx" ON "debug_arena_players"("user_id", "match_id");
CREATE INDEX "debug_arena_answers_match_id_user_id_idx" ON "debug_arena_answers"("match_id", "user_id");
CREATE INDEX "debug_arena_answers_question_id_answered_at_idx" ON "debug_arena_answers"("question_id", "answered_at");
CREATE INDEX "debug_arena_kicks_user_id_match_id_idx" ON "debug_arena_kicks"("user_id", "match_id");
