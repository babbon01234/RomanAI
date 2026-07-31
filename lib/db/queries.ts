import { randomUUID } from "node:crypto";
import { db } from "./index";
import type {
  Chunk,
  Faq,
  FileKind,
  FileStatus,
  LessonFile,
  LessonSummary,
  Message,
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
 */
export function listLessons(): LessonSummary[] {
  return db
    .prepare(
      `SELECT l.*,
              COUNT(f.id) AS file_count,
              COALESCE(SUM(f.chunk_count), 0) AS chunk_count,
              CASE
                WHEN SUM(f.status = 'failed')     > 0 THEN 'failed'
                WHEN SUM(f.status = 'processing') > 0 THEN 'processing'
                ELSE 'ready'
              END AS status
         FROM lessons l
         LEFT JOIN files f ON f.lesson_id = l.id
        GROUP BY l.id
        -- created_at is second-granularity, so rowid breaks ties from a
        -- burst of uploads and keeps the order stable across renders.
        ORDER BY l.created_at DESC, l.rowid DESC`,
    )
    .all() as LessonSummary[];
}

export function getLesson(id: string): LessonSummary | undefined {
  return listLessons().find((l) => l.id === id);
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
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO files (id, lesson_id, filename, kind) VALUES (?, ?, ?, ?)",
  ).run(id, lessonId, filename, kind);
  return id;
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

export function insertChunks(
  lessonId: string,
  fileId: string,
  parsed: ParsedChunk[],
): void {
  const stmt = db.prepare(
    `INSERT INTO chunks (id, lesson_id, file_id, locator, ordinal, content)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction((rows: ParsedChunk[]) => {
    rows.forEach((row, i) => {
      stmt.run(randomUUID(), lessonId, fileId, row.locator, i, row.content);
    });
  });
  insertAll(parsed);
}

export function getChunksForLesson(lessonId: string): Chunk[] {
  return db
    .prepare("SELECT * FROM chunks WHERE lesson_id = ? ORDER BY ordinal")
    .all(lessonId) as Chunk[];
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

/* ---------------------------------- messages ---------------------------- */

export function logMessage(entry: {
  lessonId: string;
  studentName: string;
  question: string;
  answer: string;
  citations: unknown[];
  source: "faq" | "model";
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO messages
       (id, lesson_id, student_name, question, answer, citations_json, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.lessonId,
    entry.studentName,
    entry.question,
    entry.answer,
    JSON.stringify(entry.citations),
    entry.source,
  );
  return id;
}

export interface MessageWithLesson extends Message {
  lesson_title: string;
}

export function listMessages(limit = 100): MessageWithLesson[] {
  return db
    .prepare(
      `SELECT m.*, l.title AS lesson_title
         FROM messages m
         JOIN lessons l ON l.id = m.lesson_id
        ORDER BY m.created_at DESC, m.rowid DESC
        LIMIT ?`,
    )
    .all(limit) as MessageWithLesson[];
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
