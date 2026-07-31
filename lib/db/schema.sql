-- Phase 1 storage. Local SQLite only; no persistence guarantees (PHASE1_SPEC).

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  kind       TEXT NOT NULL,                       -- pdf | docx | pptx
  status     TEXT NOT NULL DEFAULT 'processing',  -- processing | ready | failed
  error      TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_lesson ON files(lesson_id);

-- locator is the human-facing citation fragment: "Slide 4", "Page 2".
CREATE TABLE IF NOT EXISTS chunks (
  id        TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  locator   TEXT NOT NULL,
  ordinal   INTEGER NOT NULL,
  content   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_lesson ON chunks(lesson_id, ordinal);

CREATE TABLE IF NOT EXISTS faqs (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_faqs_lesson ON faqs(lesson_id);

-- Every Q&A pair, for the teacher's question log.
CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  lesson_id      TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_name   TEXT NOT NULL,
  question       TEXT NOT NULL,
  answer         TEXT NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  source         TEXT NOT NULL,   -- faq | model
  promoted_faq_id TEXT REFERENCES faqs(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_lesson ON messages(lesson_id);
