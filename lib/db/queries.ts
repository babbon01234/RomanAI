import { randomUUID } from "node:crypto";
import { getDb } from "./index";
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

export async function createLesson(
  title: string,
  description: string,
): Promise<string> {
  const id = randomUUID();
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO lessons (id, title, description) VALUES (?, ?, ?)",
    args: [id, title, description],
  });
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
export async function listLessons(): Promise<LessonSummary[]> {
  const db = await getDb();
  const result = await db.execute(
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
  );
  return result.rows as unknown as LessonSummary[];
}

export async function getLesson(id: string): Promise<LessonSummary | undefined> {
  return (await listLessons()).find((l) => l.id === id);
}

/** Everything tied to the lesson goes with it — see schema.sql's cascades. */
export async function deleteLesson(lessonId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM lessons WHERE id = ?", args: [lessonId] });
}

export async function listFiles(lessonId: string): Promise<LessonFile[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM files WHERE lesson_id = ? ORDER BY created_at",
    args: [lessonId],
  });
  return result.rows as unknown as LessonFile[];
}

/* ------------------------------------ files ----------------------------- */

export async function createFile(
  lessonId: string,
  filename: string,
  kind: FileKind,
  canvas?: { fileId: string; updatedAt: string | null },
): Promise<string> {
  const id = randomUUID();
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO files (id, lesson_id, filename, kind, canvas_file_id, canvas_updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      lessonId,
      filename,
      kind,
      canvas?.fileId ?? null,
      canvas?.updatedAt ?? null,
    ],
  });
  return id;
}

/** Where a file's bytes live in Vercel Blob. NULL for Canvas rich text. */
export async function setFileBlobUrl(fileId: string, blobUrl: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE files SET blob_url = ? WHERE id = ?",
    args: [blobUrl, fileId],
  });
}

/** Chunks cascade with it — see schema.sql. */
export async function deleteFile(fileId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM files WHERE id = ?", args: [fileId] });
}

export async function setFileStatus(
  fileId: string,
  status: FileStatus,
  opts: { error?: string; chunkCount?: number } = {},
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE files SET status = ?, error = ?, chunk_count = ? WHERE id = ?",
    args: [status, opts.error ?? null, opts.chunkCount ?? 0, fileId],
  });
}

/* ----------------------------------- chunks ----------------------------- */

/**
 * The one place chunks are created, whichever way content arrived — manual
 * upload and Canvas sync both land here. Triage flags are computed on the way
 * in, and approval_status is left to the column default of 'pending'. Both of
 * those being here rather than in a caller is deliberate: it is what makes
 * "nothing is answerable until a teacher approves it" true by construction.
 */
export async function insertChunks(
  lessonId: string,
  fileId: string,
  parsed: ParsedChunk[],
): Promise<void> {
  if (parsed.length === 0) return;

  const db = await getDb();
  await db.batch(
    parsed.map((row, i) => ({
      sql: `INSERT INTO chunks (id, lesson_id, file_id, locator, ordinal, content, flags)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        lessonId,
        fileId,
        row.locator,
        i,
        row.content,
        serializeFlags(flagContent(row.content)),
      ],
    })),
    "write",
  );
}

/**
 * What the answer pipeline is allowed to see. There is deliberately no
 * unfiltered "all chunks for a lesson" reader: the review queue asks for a
 * status by name below, so retrieval cannot pick up unapproved content by
 * reaching for the more convenient function.
 */
export async function getApprovedChunks(lessonId: string): Promise<Chunk[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT * FROM chunks
           WHERE lesson_id = ? AND approval_status = 'approved'
           ORDER BY ordinal`,
    args: [lessonId],
  });
  return result.rows as unknown as Chunk[];
}

/* --------------------------------- review -------------------------------- */

export interface ReviewChunk extends Chunk {
  filename: string;
}

/** Everything a teacher needs to judge one lesson's content, in file order. */
export async function listChunksForReview(
  lessonId: string,
  status?: ApprovalStatus,
): Promise<ReviewChunk[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT c.*, f.filename
            FROM chunks c
            JOIN files f ON f.id = c.file_id
           WHERE c.lesson_id = ?
             AND (? IS NULL OR c.approval_status = ?)
           ORDER BY c.ordinal`,
    args: [lessonId, status ?? null, status ?? null],
  });
  return result.rows as unknown as ReviewChunk[];
}

export async function setChunkApproval(
  chunkId: string,
  status: ApprovalStatus,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `UPDATE chunks SET approval_status = ?, reviewed_at = datetime('now')
           WHERE id = ?`,
    args: [status, chunkId],
  });
}

/**
 * The bulk action. Only ever touches pending chunks with no flags — a flagged
 * one always needs a person to look at it, and an already-decided one keeps
 * the decision the teacher made.
 *
 * @returns how many were approved, for the confirmation message.
 */
export async function approveUnflagged(lessonId: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: `UPDATE chunks
             SET approval_status = 'approved', reviewed_at = datetime('now')
           WHERE lesson_id = ?
             AND approval_status = 'pending'
             AND flags = '[]'`,
    args: [lessonId],
  });

  return result.rowsAffected;
}

/** Total pending across every lesson — the count on the teacher's nav. */
export async function countPendingChunks(): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT COUNT(*) AS n FROM chunks WHERE approval_status = 'pending'",
  );
  return (result.rows[0] as unknown as { n: number }).n;
}

/* ------------------------------------ faqs ------------------------------ */

export async function listFaqs(lessonId: string, limit?: number): Promise<Faq[]> {
  const db = await getDb();
  const sql =
    "SELECT * FROM faqs WHERE lesson_id = ? ORDER BY created_at DESC" +
    (limit ? " LIMIT ?" : "");
  const args = limit ? [lessonId, limit] : [lessonId];
  const result = await db.execute({ sql, args });
  return result.rows as unknown as Faq[];
}

export async function listAllFaqs(): Promise<Faq[]> {
  const db = await getDb();
  const result = await db.execute("SELECT * FROM faqs ORDER BY created_at DESC");
  return result.rows as unknown as Faq[];
}

export async function createFaq(
  lessonId: string,
  question: string,
  answer: string,
): Promise<string> {
  const id = randomUUID();
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO faqs (id, lesson_id, question, answer) VALUES (?, ?, ?, ?)",
    args: [id, lessonId, question, answer],
  });
  return id;
}

export async function updateFaq(
  id: string,
  question: string,
  answer: string,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE faqs SET question = ?, answer = ? WHERE id = ?",
    args: [question, answer, id],
  });
}

export async function deleteFaq(id: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM faqs WHERE id = ?", args: [id] });
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
export async function upsertCanvasLesson(
  key: CanvasLessonKey,
  fields: { title: string; description: string },
): Promise<{ id: string; created: boolean }> {
  const db = await getDb();
  const existingResult = await db.execute({
    sql: `SELECT id FROM lessons
           WHERE canvas_course_id = ? AND canvas_kind = ? AND canvas_item_id = ?`,
    args: [key.courseId, key.kind, key.itemId],
  });
  const existing = existingResult.rows[0] as unknown as { id: string } | undefined;

  if (existing) {
    await db.execute({
      sql: `UPDATE lessons
               SET title = ?, description = ?, synced_at = datetime('now')
             WHERE id = ?`,
      args: [fields.title, fields.description, existing.id],
    });
    return { id: existing.id, created: false };
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO lessons
            (id, title, description, canvas_course_id, canvas_kind, canvas_item_id, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [id, fields.title, fields.description, key.courseId, key.kind, key.itemId],
  });

  return { id, created: true };
}

export async function listCanvasLessons(courseId: string): Promise<LessonSummary[]> {
  return (await listLessons()).filter((l) => l.canvas_course_id === courseId);
}

/** Canvas-sourced files on a lesson, keyed by Canvas file id. */
export async function canvasFilesByKey(
  lessonId: string,
): Promise<Map<string, LessonFile>> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM files WHERE lesson_id = ? AND canvas_file_id IS NOT NULL",
    args: [lessonId],
  });
  const rows = result.rows as unknown as LessonFile[];
  return new Map(rows.map((row) => [row.canvas_file_id as string, row]));
}

export interface SyncedCourse {
  canvas_course_id: string;
  lesson_count: number;
  last_synced_at: string;
}

/** Courses this app has pulled before, for the "last synced" line in the UI. */
export async function listSyncedCourses(): Promise<SyncedCourse[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT canvas_course_id,
            COUNT(*)      AS lesson_count,
            MAX(synced_at) AS last_synced_at
       FROM lessons
      WHERE canvas_course_id IS NOT NULL
      GROUP BY canvas_course_id`,
  );
  return result.rows as unknown as SyncedCourse[];
}

/* ---------------------------------- messages ---------------------------- */

export async function logMessage(entry: {
  lessonId: string;
  studentName: string;
  question: string;
  answer: string;
  citations: unknown[];
  source: AnswerSource;
  outcome?: Outcome;
  humanReason?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO messages
            (id, lesson_id, student_name, question, answer, citations_json, source,
             outcome, human_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      entry.lessonId,
      entry.studentName,
      entry.question,
      entry.answer,
      JSON.stringify(entry.citations),
      entry.source,
      entry.outcome ?? "answered",
      entry.humanReason ?? null,
    ],
  });
  return id;
}

/** How many questions are sitting unanswered — the count the log leads with. */
export async function countNeedsHuman(): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT COUNT(*) AS n FROM messages WHERE outcome = 'needs_human'",
  );
  return (result.rows[0] as unknown as { n: number }).n;
}

export interface MessageWithLesson extends Message {
  lesson_title: string;
}

export async function listMessages(
  limit = 100,
  outcome?: Outcome,
): Promise<MessageWithLesson[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT m.*, l.title AS lesson_title
            FROM messages m
            JOIN lessons l ON l.id = m.lesson_id
           WHERE (? IS NULL OR m.outcome = ?)
           ORDER BY m.created_at DESC, m.rowid DESC
           LIMIT ?`,
    args: [outcome ?? null, outcome ?? null, limit],
  });
  return result.rows as unknown as MessageWithLesson[];
}

/** A student's own history for one lesson, oldest first, for rehydrating chat. */
export async function listMessagesForStudent(
  lessonId: string,
  studentName: string,
  limit = 50,
): Promise<Message[]> {
  const db = await getDb();
  // Take the most recent N, then flip in JS. Sorting ascending inside a
  // subquery needs rowid, which `SELECT *` doesn't carry out of one.
  const result = await db.execute({
    sql: `SELECT * FROM messages
           WHERE lesson_id = ? AND student_name = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?`,
    args: [lessonId, studentName, limit],
  });
  const recent = result.rows as unknown as Message[];
  return recent.reverse();
}

export async function getMessage(id: string): Promise<MessageWithLesson | undefined> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT m.*, l.title AS lesson_title
            FROM messages m JOIN lessons l ON l.id = m.lesson_id
           WHERE m.id = ?`,
    args: [id],
  });
  return result.rows[0] as unknown as MessageWithLesson | undefined;
}

export async function markMessagePromoted(
  messageId: string,
  faqId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE messages SET promoted_faq_id = ? WHERE id = ?",
    args: [faqId, messageId],
  });
}
