import { randomUUID } from "node:crypto";
import { db } from "./index";
import { flagContent, serializeFlags } from "@/lib/review/flags";
import type {
  AnswerSource,
  ApprovalStatus,
  CanvasKind,
  Chunk,
  Faq,
  FileKind,
  FileStatus,
  LessonFile,
  LessonSummary,
  Message,
  Outcome,
  ParsedChunk,
} from "@/lib/types";

/* ----------------------------------- lessons ---------------------------- */

export function createLesson(title: string, description: string): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO lessons (id, title, description) VALUES (?, ?, ?)",
  ).run(id, title, description);
  return id;
}

/**
 * Lessons with their file/chunk counts and a rolled-up status. A lesson is
 * only "ready" once every one of its files finished parsing.
 *
 * Correlated subqueries rather than one grouped join: files and chunks are
 * both one-to-many off a lesson, so joining them together multiplies rows and
 * every count comes out wrong.
 */
export function listLessons(): LessonSummary[] {
  return db
    .prepare(
      `SELECT l.*,
              (SELECT COUNT(*) FROM files f WHERE f.lesson_id = l.id)
                AS file_count,
              (SELECT COUNT(*) FROM chunks c WHERE c.lesson_id = l.id)
                AS chunk_count,
              (SELECT COUNT(*) FROM chunks c
                 WHERE c.lesson_id = l.id AND c.approval_status = 'approved')
                AS approved_count,
              (SELECT COUNT(*) FROM chunks c
                 WHERE c.lesson_id = l.id AND c.approval_status = 'pending')
                AS pending_count,
              (SELECT COUNT(*) FROM chunks c
                 WHERE c.lesson_id = l.id AND c.approval_status = 'rejected')
                AS rejected_count,
              (SELECT COUNT(*) FROM chunks c
                 WHERE c.lesson_id = l.id
                   AND c.approval_status = 'pending'
                   AND c.flags <> '[]')
                AS flagged_count,
              (SELECT CASE
                 WHEN SUM(f.status = 'failed')     > 0 THEN 'failed'
                 WHEN SUM(f.status = 'processing') > 0 THEN 'processing'
                 ELSE 'ready'
               END FROM files f WHERE f.lesson_id = l.id)
                AS status,
              -- First failure reason, so the teacher sees why rather than
              -- just that something went wrong.
              (SELECT MIN(CASE WHEN f.status = 'failed' THEN f.error END)
                 FROM files f WHERE f.lesson_id = l.id)
                AS error
         FROM lessons l
        -- created_at is second-granularity, so rowid breaks ties from a
        -- burst of uploads and keeps the order stable across renders.
        ORDER BY l.created_at DESC, l.rowid DESC`,
    )
    .all() as LessonSummary[];
}

export function getLesson(id: string): LessonSummary | undefined {
  return listLessons().find((l) => l.id === id);
}

/** Everything tied to the lesson goes with it — see schema.sql's cascades. */
export function deleteLesson(lessonId: string): void {
  db.prepare("DELETE FROM lessons WHERE id = ?").run(lessonId);
}

export function listFiles(lessonId: string): LessonFile[] {
  return db
    .prepare("SELECT * FROM files WHERE lesson_id = ? ORDER BY created_at")
    .all(lessonId) as LessonFile[];
}

/* ------------------------------------ files ----------------------------- */

export function createFile(
  lessonId: string,
  filename: string,
  kind: FileKind,
  canvas?: { fileId: string; updatedAt: string | null },
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO files (id, lesson_id, filename, kind, canvas_file_id, canvas_updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    lessonId,
    filename,
    kind,
    canvas?.fileId ?? null,
    canvas?.updatedAt ?? null,
  );
  return id;
}

/** Chunks cascade with it — see schema.sql. */
export function deleteFile(fileId: string): void {
  db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
}

export function setFileStatus(
  fileId: string,
  status: FileStatus,
  opts: { error?: string; chunkCount?: number } = {},
): void {
  db.prepare(
    "UPDATE files SET status = ?, error = ?, chunk_count = ? WHERE id = ?",
  ).run(status, opts.error ?? null, opts.chunkCount ?? 0, fileId);
}

/* ----------------------------------- chunks ----------------------------- */

/**
 * The one place chunks are created, whichever way content arrived — manual
 * upload and Canvas sync both land here. Triage flags are computed on the way
 * in, and approval_status is left to the column default of 'pending'. Both of
 * those being here rather than in a caller is deliberate: it is what makes
 * "nothing is answerable until a teacher approves it" true by construction.
 */
export function insertChunks(
  lessonId: string,
  fileId: string,
  parsed: ParsedChunk[],
): void {
  const stmt = db.prepare(
    `INSERT INTO chunks (id, lesson_id, file_id, locator, ordinal, content, flags)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction((rows: ParsedChunk[]) => {
    rows.forEach((row, i) => {
      stmt.run(
        randomUUID(),
        lessonId,
        fileId,
        row.locator,
        i,
        row.content,
        serializeFlags(flagContent(row.content)),
      );
    });
  });
  insertAll(parsed);
}

/**
 * What the answer pipeline is allowed to see. There is deliberately no
 * unfiltered "all chunks for a lesson" reader: the review queue asks for a
 * status by name below, so retrieval cannot pick up unapproved content by
 * reaching for the more convenient function.
 */
export function getApprovedChunks(lessonId: string): Chunk[] {
  return db
    .prepare(
      `SELECT * FROM chunks
        WHERE lesson_id = ? AND approval_status = 'approved'
        ORDER BY ordinal`,
    )
    .all(lessonId) as Chunk[];
}

/* --------------------------------- review -------------------------------- */

export interface ReviewChunk extends Chunk {
  filename: string;
}

/** Everything a teacher needs to judge one lesson's content, in file order. */
export function listChunksForReview(
  lessonId: string,
  status?: ApprovalStatus,
): ReviewChunk[] {
  return db
    .prepare(
      `SELECT c.*, f.filename
         FROM chunks c
         JOIN files f ON f.id = c.file_id
        WHERE c.lesson_id = ?
          AND (? IS NULL OR c.approval_status = ?)
        ORDER BY c.ordinal`,
    )
    .all(lessonId, status ?? null, status ?? null) as ReviewChunk[];
}

export function setChunkApproval(
  chunkId: string,
  status: ApprovalStatus,
): void {
  db.prepare(
    `UPDATE chunks SET approval_status = ?, reviewed_at = datetime('now')
      WHERE id = ?`,
  ).run(status, chunkId);
}

/**
 * The bulk action. Only ever touches pending chunks with no flags — a flagged
 * one always needs a person to look at it, and an already-decided one keeps
 * the decision the teacher made.
 *
 * @returns how many were approved, for the confirmation message.
 */
export function approveUnflagged(lessonId: string): number {
  const result = db
    .prepare(
      `UPDATE chunks
          SET approval_status = 'approved', reviewed_at = datetime('now')
        WHERE lesson_id = ?
          AND approval_status = 'pending'
          AND flags = '[]'`,
    )
    .run(lessonId);

  return result.changes;
}

/** Total pending across every lesson — the count on the teacher's nav. */
export function countPendingChunks(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM chunks WHERE approval_status = 'pending'")
    .get() as { n: number };

  return row.n;
}

/* ------------------------------------ faqs ------------------------------ */

export function listFaqs(lessonId: string, limit?: number): Faq[] {
  const sql =
    "SELECT * FROM faqs WHERE lesson_id = ? ORDER BY created_at DESC" +
    (limit ? " LIMIT ?" : "");
  const args = limit ? [lessonId, limit] : [lessonId];
  return db.prepare(sql).all(...args) as Faq[];
}

export function listAllFaqs(): Faq[] {
  return db
    .prepare("SELECT * FROM faqs ORDER BY created_at DESC")
    .all() as Faq[];
}

export function createFaq(
  lessonId: string,
  question: string,
  answer: string,
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO faqs (id, lesson_id, question, answer) VALUES (?, ?, ?, ?)",
  ).run(id, lessonId, question, answer);
  return id;
}

export function updateFaq(id: string, question: string, answer: string): void {
  db.prepare("UPDATE faqs SET question = ?, answer = ? WHERE id = ?").run(
    question,
    answer,
    id,
  );
}

export function deleteFaq(id: string): void {
  db.prepare("DELETE FROM faqs WHERE id = ?").run(id);
}

/* ----------------------------- canvas provenance ------------------------ */

export interface CanvasLessonKey {
  courseId: string;
  kind: CanvasKind;
  /** Canvas id of the module/assignment; '' for the per-course singletons. */
  itemId: string;
}

/**
 * The heart of re-sync: find the lesson this Canvas thing produced last time
 * and update it, or create it. Identity is (course, kind, item) — a module
 * renamed in Canvas keeps its lesson, and with it every question students
 * already asked about it.
 */
export function upsertCanvasLesson(
  key: CanvasLessonKey,
  fields: { title: string; description: string },
): { id: string; created: boolean } {
  const existing = db
    .prepare(
      `SELECT id FROM lessons
        WHERE canvas_course_id = ? AND canvas_kind = ? AND canvas_item_id = ?`,
    )
    .get(key.courseId, key.kind, key.itemId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE lessons
          SET title = ?, description = ?, synced_at = datetime('now')
        WHERE id = ?`,
    ).run(fields.title, fields.description, existing.id);
    return { id: existing.id, created: false };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO lessons
       (id, title, description, canvas_course_id, canvas_kind, canvas_item_id, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(id, fields.title, fields.description, key.courseId, key.kind, key.itemId);

  return { id, created: true };
}

export function listCanvasLessons(courseId: string): LessonSummary[] {
  return listLessons().filter((l) => l.canvas_course_id === courseId);
}

/** Canvas-sourced files on a lesson, keyed by Canvas file id. */
export function canvasFilesByKey(lessonId: string): Map<string, LessonFile> {
  const rows = db
    .prepare(
      "SELECT * FROM files WHERE lesson_id = ? AND canvas_file_id IS NOT NULL",
    )
    .all(lessonId) as LessonFile[];

  return new Map(rows.map((row) => [row.canvas_file_id as string, row]));
}

export interface SyncedCourse {
  canvas_course_id: string;
  lesson_count: number;
  last_synced_at: string;
}

/** Courses this app has pulled before, for the "last synced" line in the UI. */
export function listSyncedCourses(): SyncedCourse[] {
  return db
    .prepare(
      `SELECT canvas_course_id,
              COUNT(*)      AS lesson_count,
              MAX(synced_at) AS last_synced_at
         FROM lessons
        WHERE canvas_course_id IS NOT NULL
        GROUP BY canvas_course_id`,
    )
    .all() as SyncedCourse[];
}

/* ---------------------------------- messages ---------------------------- */

export function logMessage(entry: {
  lessonId: string;
  studentName: string;
  question: string;
  answer: string;
  citations: unknown[];
  source: AnswerSource;
  outcome?: Outcome;
  humanReason?: string | null;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO messages
       (id, lesson_id, student_name, question, answer, citations_json, source,
        outcome, human_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.lessonId,
    entry.studentName,
    entry.question,
    entry.answer,
    JSON.stringify(entry.citations),
    entry.source,
    entry.outcome ?? "answered",
    entry.humanReason ?? null,
  );
  return id;
}

/** How many questions are sitting unanswered — the count the log leads with. */
export function countNeedsHuman(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE outcome = 'needs_human'")
    .get() as { n: number };

  return row.n;
}

export interface MessageWithLesson extends Message {
  lesson_title: string;
}

export function listMessages(
  limit = 100,
  outcome?: Outcome,
): MessageWithLesson[] {
  return db
    .prepare(
      `SELECT m.*, l.title AS lesson_title
         FROM messages m
         JOIN lessons l ON l.id = m.lesson_id
        WHERE (? IS NULL OR m.outcome = ?)
        ORDER BY m.created_at DESC, m.rowid DESC
        LIMIT ?`,
    )
    .all(outcome ?? null, outcome ?? null, limit) as MessageWithLesson[];
}

/** A student's own history for one lesson, oldest first, for rehydrating chat. */
export function listMessagesForStudent(
  lessonId: string,
  studentName: string,
  limit = 50,
): Message[] {
  // Take the most recent N, then flip in JS. Sorting ascending inside a
  // subquery needs rowid, which `SELECT *` doesn't carry out of one.
  const recent = db
    .prepare(
      `SELECT * FROM messages
        WHERE lesson_id = ? AND student_name = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?`,
    )
    .all(lessonId, studentName, limit) as Message[];

  return recent.reverse();
}

export function getMessage(id: string): MessageWithLesson | undefined {
  return db
    .prepare(
      `SELECT m.*, l.title AS lesson_title
         FROM messages m JOIN lessons l ON l.id = m.lesson_id
        WHERE m.id = ?`,
    )
    .get(id) as MessageWithLesson | undefined;
}

export function markMessagePromoted(messageId: string, faqId: string): void {
  db.prepare("UPDATE messages SET promoted_faq_id = ? WHERE id = ?").run(
    faqId,
    messageId,
  );
}
