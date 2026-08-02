/** "html" is Canvas rich text — a syllabus body or assignment description. */
export type FileKind = "pdf" | "docx" | "pptx" | "html";
export type FileStatus = "processing" | "ready" | "failed";
/** "grade" is a restatement of a teacher's rubric marks, not a Q&A answer. */
export type AnswerSource = "faq" | "model" | "grade";

/** What in Canvas a synced lesson was built from. */
export type CanvasKind = "syllabus" | "module" | "assignment" | "files";

export interface Lesson {
  id: string;
  title: string;
  description: string;
  created_at: string;
  /** NULL on manually created lessons — see schema.sql. */
  canvas_course_id: string | null;
  canvas_kind: CanvasKind | null;
  canvas_item_id: string | null;
  synced_at: string | null;
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
  canvas_file_id: string | null;
  canvas_updated_at: string | null;
}

/** Nothing reaches a student until a teacher moves it to "approved". */
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Chunk {
  id: string;
  lesson_id: string;
  file_id: string;
  /** Human-facing citation fragment: "Slide 4", "Page 2". */
  locator: string;
  ordinal: number;
  content: string;
  approval_status: ApprovalStatus;
  /** JSON array of triage flags — see lib/review/flags.ts. */
  flags: string;
  reviewed_at: string | null;
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

/** Whether the bot handled the question or handed it back to the teacher. */
export type Outcome = "answered" | "needs_human";

export interface Message {
  id: string;
  lesson_id: string;
  student_name: string;
  question: string;
  answer: string;
  citations_json: string;
  source: AnswerSource;
  outcome: Outcome;
  /** A HumanReason (lib/triage.ts) when outcome is needs_human. */
  human_reason: string | null;
  promoted_faq_id: string | null;
  created_at: string;
}

export interface LessonSummary extends Lesson {
  file_count: number;
  chunk_count: number;
  /** The only count that decides whether a student can ask about this lesson. */
  approved_count: number;
  pending_count: number;
  rejected_count: number;
  /** Pending *and* flagged — what the review queue leads with. */
  flagged_count: number;
  /** Rolled up from this lesson's files: failed > processing > ready. */
  status: FileStatus;
  /** Why the first failing file failed, if any did. */
  error: string | null;
}

export const STUDENT_NAMES = ["Alex", "Jordan", "Sam", "Priya", "Marcus"];
export const TEACHER_NAME = "Ms. Rivera";
