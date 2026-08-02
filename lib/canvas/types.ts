/**
 * The slices of the Canvas REST API this phase reads. These are hand-written
 * rather than generated — Canvas returns far more per object than we use, and
 * narrowing here documents exactly what the sync depends on.
 */

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  /** Only present when the request asks for include[]=syllabus_body. */
  syllabus_body?: string | null;
  workflow_state?: string;
}

export interface CanvasFile {
  id: number;
  /** What the teacher named it in Canvas; falls back to filename. */
  display_name?: string;
  filename: string;
  "content-type"?: string;
  /** Pre-signed download URL. Expires, so it is never stored. */
  url: string;
  size?: number;
  updated_at?: string;
  /** Canvas marks deleted files rather than removing them from some lists. */
  hidden?: boolean;
  locked?: boolean;
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  /** File | Page | Assignment | Discussion | Quiz | SubHeader | ExternalUrl | ExternalTool */
  type: string;
  /** For type File this is the file id; for Assignment the assignment id. */
  content_id?: number;
  position?: number;
  html_url?: string;
  external_url?: string;
}

export interface CanvasModule {
  id: number;
  name: string;
  position?: number;
  /** Present when the request asks for include[]=items. */
  items?: CanvasModuleItem[];
  items_count?: number;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  /** HTML. */
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  published?: boolean;
  /**
   * The rubric's *definition* — what each criterion is called and what it's
   * worth. Present on a single-assignment fetch, not on the list endpoint.
   */
  rubric?: CanvasRubricCriterion[];
  rubric_settings?: { id?: number; title?: string; points_possible?: number };
}

/** One row of the rubric as the teacher built it. */
export interface CanvasRubricCriterion {
  /** Canvas ids look like "_1234"; they key the assessment below. */
  id: string;
  description?: string;
  long_description?: string;
  points?: number;
  ratings?: { id?: string; description?: string; points?: number }[];
}

/**
 * The teacher's marks, keyed by criterion id. This is the whole reason the
 * assignment has to be fetched alongside it: an assessment entry knows what
 * was awarded but not what the criterion is called or what it was out of.
 *
 * Only present with include[]=rubric_assessment. `style=full` is what makes
 * Canvas return per-criterion comments rather than points alone.
 */
export type CanvasRubricAssessment = Record<
  string,
  { points?: number | null; comments?: string | null; rating_id?: string | null }
>;

export interface CanvasSubmission {
  id?: number;
  user_id?: number;
  assignment_id?: number;
  score?: number | null;
  grade?: string | null;
  /** unsubmitted | submitted | graded | pending_review */
  workflow_state?: string;
  graded_at?: string | null;
  submitted_at?: string | null;
  rubric_assessment?: CanvasRubricAssessment | null;
  /** Whole-submission comments, distinct from per-criterion ones. */
  submission_comments?: {
    id?: number;
    comment?: string;
    author_name?: string;
    created_at?: string;
  }[];
}
