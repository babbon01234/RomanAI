import { createHash } from "node:crypto";
import { kindFromFilename, type DocumentKind } from "@/lib/parsing";
import type { CanvasKind } from "@/lib/types";
import type {
  CanvasAssignment,
  CanvasCourse,
  CanvasFile,
  CanvasModule,
} from "./types";

/**
 * Turning a Canvas course into lessons.
 *
 * This is pure — Canvas objects in, a plan out — so the mapping can be tested
 * without a Canvas instance or a database. `apply` in sync.ts does the writing.
 *
 * The mapping a teacher would expect from looking at their own course:
 *   syllabus     → one lesson
 *   each module  → one lesson, holding its files and an outline of its items
 *   each assignment → one lesson, holding its description, due date and points
 *   leftover files  → one "Course files" lesson, so nothing is silently dropped
 */

/** Rich text staged as a chunk source. `key` identifies it across syncs. */
export interface PlannedText {
  key: string;
  /** Shown in the teacher's file list. */
  filename: string;
  /** What citations call it: "Assignment details", "Syllabus". */
  label: string;
  html: string;
  /** Content hash — an unchanged body skips re-parsing on the next sync. */
  fingerprint: string;
}

export interface PlannedFile {
  canvasFileId: string;
  filename: string;
  kind: DocumentKind;
  url: string;
  updatedAt: string | null;
}

export interface PlannedLesson {
  kind: CanvasKind;
  /** Canvas id of the module/assignment; '' for the per-course singletons. */
  itemId: string;
  title: string;
  description: string;
  texts: PlannedText[];
  files: PlannedFile[];
}

export interface CoursePlan {
  courseId: string;
  courseName: string;
  lessons: PlannedLesson[];
  /** Canvas files we can't read: "diagram.png (not a PDF, DOCX, or PPTX)". */
  skipped: string[];
}

export function fingerprint(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

function text(key: string, filename: string, label: string, html: string): PlannedText {
  return { key, filename, label, html, fingerprint: fingerprint(html) };
}

/** Canvas sends `null`, `""`, and `"<p><br></p>"` all meaning "empty". */
function hasContent(html: string | null | undefined): html is string {
  return Boolean(html && html.replace(/<[^>]*>/g, "").trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Canvas timestamps are UTC. The zone is spelled out because a due time is
 * exactly the kind of answer a student acts on, and an unlabelled one that's
 * off by hours is worse than no answer at all.
 */
export function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  // Spelled out component by component: Intl rejects timeZoneName alongside
  // the dateStyle/timeStyle shorthands.
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/* -------------------------------- the plan ------------------------------ */

export function planCourse(input: {
  course: CanvasCourse;
  files: CanvasFile[];
  modules: CanvasModule[];
  assignments: CanvasAssignment[];
}): CoursePlan {
  const { course, files, modules, assignments } = input;
  const courseId = String(course.id);
  const courseName = course.name || course.course_code || `Course ${courseId}`;

  const skipped: string[] = [];
  const lessons: PlannedLesson[] = [];

  // Readable files by Canvas id. Anything we can't parse is reported rather
  // than dropped quietly — a teacher wondering why their PNG isn't answerable
  // should be able to see the reason.
  const readable = new Map<string, PlannedFile>();
  for (const file of files) {
    const name = file.display_name || file.filename;
    const kind = kindFromFilename(file.filename) ?? kindFromFilename(name);

    if (!kind) {
      skipped.push(`${name} — not a PDF, DOCX, or PPTX`);
      continue;
    }

    readable.set(String(file.id), {
      canvasFileId: String(file.id),
      filename: name,
      kind,
      url: file.url,
      updatedAt: file.updated_at ?? null,
    });
  }

  /* syllabus */
  if (hasContent(course.syllabus_body)) {
    lessons.push({
      kind: "syllabus",
      itemId: "",
      title: `Syllabus — ${courseName}`,
      description: "The course syllabus, pulled from Canvas.",
      texts: [text("syllabus", "Syllabus", "Syllabus", course.syllabus_body)],
      files: [],
    });
  }

  /* assignments */
  for (const assignment of assignments) {
    lessons.push(planAssignment(assignment, courseName));
  }

  /* modules — each claims the files its items point at */
  const claimed = new Set<string>();
  for (const mod of modules) {
    const lesson = planModule(mod, courseName, readable, claimed);
    if (lesson) lessons.push(lesson);
  }

  /* whatever's left */
  const loose = [...readable.values()].filter(
    (file) => !claimed.has(file.canvasFileId),
  );

  if (loose.length > 0) {
    lessons.push({
      kind: "files",
      itemId: "",
      title: `Course files — ${courseName}`,
      description: `${loose.length} file${loose.length === 1 ? "" : "s"} in ${courseName} that aren't part of a module.`,
      texts: [],
      files: loose,
    });
  }

  return { courseId, courseName, lessons, skipped };
}

function planAssignment(
  assignment: CanvasAssignment,
  courseName: string,
): PlannedLesson {
  const facts: string[] = [`<p>Assignment: ${escapeHtml(assignment.name)}</p>`];
  const summary: string[] = [];

  if (assignment.due_at) {
    const due = formatDue(assignment.due_at);
    facts.push(`<p>Due: ${escapeHtml(due)}</p>`);
    summary.push(`Due ${due}.`);
  } else {
    facts.push("<p>Due: no due date set in Canvas.</p>");
  }

  if (typeof assignment.points_possible === "number") {
    facts.push(`<p>Points possible: ${assignment.points_possible}</p>`);
    summary.push(`${assignment.points_possible} points.`);
  }

  // The due date and points go into the content, not just the description,
  // because "when is this due?" is the question this whole thing exists for
  // and the model can only answer from chunks.
  const body = hasContent(assignment.description)
    ? `${facts.join("\n")}\n${assignment.description}`
    : facts.join("\n");

  return {
    kind: "assignment",
    itemId: String(assignment.id),
    title: assignment.name || `Assignment ${assignment.id}`,
    description: [`From ${courseName}.`, ...summary].join(" "),
    texts: [
      text(
        `assignment-${assignment.id}`,
        "Assignment details",
        "Assignment details",
        body,
      ),
    ],
    files: [],
  };
}

function planModule(
  mod: CanvasModule,
  courseName: string,
  readable: Map<string, PlannedFile>,
  claimed: Set<string>,
): PlannedLesson | null {
  const items = mod.items ?? [];

  const files: PlannedFile[] = [];
  for (const item of items) {
    if (item.type !== "File" || item.content_id === undefined) continue;

    const file = readable.get(String(item.content_id));
    // A module can list the same file twice; claiming it once is enough.
    if (file && !claimed.has(file.canvasFileId)) {
      claimed.add(file.canvasFileId);
      files.push(file);
    }
  }

  // An empty module would be a lesson students can't ask anything about.
  if (items.length === 0 && files.length === 0) return null;

  const outline = [
    `<p>Module: ${escapeHtml(mod.name)}</p>`,
    "<p>What's in this module:</p>",
    "<ul>",
    ...items.map(
      (item) =>
        `<li>${escapeHtml(item.title)}${item.type ? ` (${escapeHtml(humanType(item.type))})` : ""}</li>`,
    ),
    "</ul>",
  ].join("\n");

  return {
    kind: "module",
    itemId: String(mod.id),
    title: mod.name || `Module ${mod.id}`,
    description: describeModule(courseName, items.length, files.length),
    texts: [
      text(`module-${mod.id}`, "Module outline", "Module outline", outline),
    ],
    files,
  };
}

function describeModule(courseName: string, items: number, files: number): string {
  const parts = [`From ${courseName}.`];
  if (items) parts.push(`${items} item${items === 1 ? "" : "s"}.`);
  if (files) parts.push(`${files} readable file${files === 1 ? "" : "s"}.`);
  return parts.join(" ");
}

/** Canvas item types are CamelCase internals; students shouldn't see those. */
function humanType(type: string): string {
  const words = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words === "sub header" ? "heading" : words;
}
