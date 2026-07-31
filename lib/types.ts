export type FileKind = "pdf" | "docx" | "pptx";
export type FileStatus = "processing" | "ready" | "failed";
export type AnswerSource = "faq" | "model";

export interface Lesson {
  id: string;
  title: string;
  description: string;
  created_at: string;
}

export interface LessonFile {
  id: string;
  lesson_id: string;
  filename: string;
  kind: FileKind;
  status: FileStatus;
  error: string | null;
  chunk_count: number;
  created_at: string;
}

export interface Chunk {
  id: string;
  lesson_id: string;
  file_id: string;
  /** Human-facing citation fragment: "Slide 4", "Page 2". */
  locator: string;
  ordinal: number;
  content: string;
}

/** What a parser returns before it is tied to a lesson/file row. */
export interface ParsedChunk {
  locator: string;
  content: string;
}

export interface Faq {
  id: string;
  lesson_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface Citation {
  lessonTitle: string;
  /** "Slide 7" */
  locator: string;
  filename: string;
}

export interface Message {
  id: string;
  lesson_id: string;
  student_name: string;
  question: string;
  answer: string;
  citations_json: string;
  source: AnswerSource;
  promoted_faq_id: string | null;
  created_at: string;
}

export interface LessonSummary extends Lesson {
  file_count: number;
  chunk_count: number;
  /** Rolled up from this lesson's files: failed > processing > ready. */
  status: FileStatus;
}

export const STUDENT_NAMES = ["Alex", "Jordan", "Sam", "Priya", "Marcus"];
export const TEACHER_NAME = "Ms. Rivera";
