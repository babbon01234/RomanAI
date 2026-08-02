-- Local SQLite only; no persistence guarantees (PHASE1_SPEC).
--
-- Phase 2 added the canvas_* provenance columns. A lesson pulled from Canvas
-- carries enough identity to be found again on the next sync and updated in
-- place; a manually uploaded one leaves them NULL and is never touched by a
-- sync. Existing databases pick these up through the ALTER TABLE migration in
-- index.ts, since CREATE TABLE IF NOT EXISTS won't add columns.

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  -- NULL for manually created lessons.
  canvas_course_id TEXT,
  -- What in Canvas this lesson came from: module | assignment | syllabus | files
  canvas_kind      TEXT,
  -- The Canvas id of that thing. '' for the per-course singletons.
  canvas_item_id   TEXT,
  synced_at        TEXT
);
-- The re-sync key: one lesson per Canvas thing, so a second sync updates the
-- row it made the first time instead of adding a twin.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_canvas
  ON lessons(canvas_course_id, canvas_kind, canvas_item_id)
  WHERE canvas_course_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS files (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  kind       TEXT NOT NULL,                       -- pdf | docx | pptx | html
  status     TEXT NOT NULL DEFAULT 'processing',  -- processing | ready | failed
  error      TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Canvas file id, or a synthetic key like 'syllabus' for rich-text content.
  canvas_file_id TEXT,
  -- Canvas's own updated_at. Unchanged means we can skip the re-download.
  canvas_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_lesson ON files(lesson_id);
CREATE INDEX IF NOT EXISTS idx_files_canvas ON files(lesson_id, canvas_file_id);

-- locator is the human-facing citation fragment: "Slide 4", "Page 2".
--
-- Phase 3: nothing here is answerable until a teacher approves it. The default
-- is 'pending' at the column level rather than in application code, so a new
-- insert path added later cannot accidentally produce answerable content — it
-- would have to ask for approval explicitly, in writing.
CREATE TABLE IF NOT EXISTS chunks (
  id        TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  locator   TEXT NOT NULL,
  ordinal   INTEGER NOT NULL,
  content   TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  -- JSON array of triage flags from lib/review/flags.ts. '[]' means unflagged,
  -- which is what "approve all unflagged" acts on.
  flags      TEXT NOT NULL DEFAULT '[]',
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_lesson ON chunks(lesson_id, ordinal);
-- Retrieval only ever asks for approved chunks of one lesson.
CREATE INDEX IF NOT EXISTS idx_chunks_approval
  ON chunks(lesson_id, approval_status);

CREATE TABLE IF NOT EXISTS faqs (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_faqs_lesson ON faqs(lesson_id);

-- Every Q&A pair, for the teacher's question log.
--
-- Phase 4: `outcome` separates questions the bot handled from ones it handed
-- back. 'needs_human' means no answer was generated — either the question was
-- never the bot's to answer (an extension request, a grade dispute) or the
-- approved material didn't cover it. `human_reason` says which; see
-- lib/triage.ts.
CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  lesson_id      TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_name   TEXT NOT NULL,
  question       TEXT NOT NULL,
  answer         TEXT NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  source         TEXT NOT NULL,   -- faq | model
  outcome        TEXT NOT NULL DEFAULT 'answered',  -- answered | needs_human
  human_reason   TEXT,            -- extension | grade | personal | subjective | not-covered
  promoted_faq_id TEXT REFERENCES faqs(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_lesson ON messages(lesson_id);
-- The teacher's "what needs me" filter.
CREATE INDEX IF NOT EXISTS idx_messages_outcome
  ON messages(outcome, created_at DESC);
