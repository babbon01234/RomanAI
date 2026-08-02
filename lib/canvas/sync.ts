import "server-only";
import fs from "node:fs/promises";
import {
  canvasFilesByKey,
  deleteFile,
  listCanvasLessons,
  upsertCanvasLesson,
} from "@/lib/db/queries";
import {
  processPending,
  stageCanvasFile,
  stageCanvasText,
  uploadPath,
  type Pending,
} from "@/lib/processing";
import { CanvasError, type CanvasClient } from "./client";
import { planCourse, type CoursePlan, type PlannedLesson } from "./plan";
import type {
  CanvasAssignment,
  CanvasCourse,
  CanvasFile,
  CanvasModule,
} from "./types";

/* -------------------------------- reporting ----------------------------- */

export interface LessonReport {
  lessonId: string;
  title: string;
  kind: PlannedLesson["kind"];
  created: boolean;
  /** Newly staged for parsing. */
  added: number;
  /** Skipped because Canvas says it hasn't changed since the last sync. */
  unchanged: number;
  /** Dropped because it's no longer in Canvas. */
  removed: number;
}

export interface SyncReport {
  courseId: string;
  courseName: string;
  lessons: LessonReport[];
  created: number;
  updated: number;
  added: number;
  unchanged: number;
  removed: number;
  /** Canvas files this app can't read, with the reason. */
  skipped: string[];
  /** Endpoints that failed without sinking the whole sync. */
  warnings: string[];
  /** Lessons from an earlier sync whose Canvas source is gone. */
  stale: string[];
}

/* --------------------------------- pulling ------------------------------ */

/**
 * A course can have its Files tab hidden or its Modules disabled, and Canvas
 * answers with a 401 or 404 for that one endpoint. That shouldn't cost the
 * teacher the other three, so each list is pulled independently and a failure
 * becomes a warning on the report.
 */
async function pull<T>(
  label: string,
  warnings: string[],
  fetchList: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await fetchList();
  } catch (error) {
    warnings.push(
      `Couldn't read ${label}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return [];
  }
}

export async function fetchCourse(
  client: CanvasClient,
  courseId: string,
): Promise<{
  course: CanvasCourse;
  files: CanvasFile[];
  modules: CanvasModule[];
  assignments: CanvasAssignment[];
  warnings: string[];
}> {
  // The course object is the one hard requirement — without it there is no
  // syllabus and no name, and a failure here means bad credentials or a bad
  // course id, which the teacher needs to hear about directly.
  const course = await client.getCourse(courseId);
  const warnings: string[] = [];

  const [files, modules, assignments] = await Promise.all([
    pull("files", warnings, () => client.listFiles(courseId)),
    pull("modules", warnings, () => client.listModules(courseId)),
    pull("assignments", warnings, () => client.listAssignments(courseId)),
  ]);

  return { course, files, modules, assignments, warnings };
}

/* -------------------------------- applying ------------------------------ */

/**
 * Writes a plan into the database and returns the work that still has to be
 * done (downloading and parsing). Re-running on an unchanged course creates
 * nothing new: lessons are matched by their Canvas identity and files by
 * Canvas's own `updated_at`.
 */
export type Downloader = (url: string) => Promise<Buffer>;

export function applyPlan(
  plan: CoursePlan,
  download: Downloader,
): {
  report: Omit<SyncReport, "warnings">;
  pending: { lessonId: string; items: Pending[] }[];
  orphanedPaths: string[];
} {
  const lessons: LessonReport[] = [];
  const pending: { lessonId: string; items: Pending[] }[] = [];
  const orphanedPaths: string[] = [];

  for (const planned of plan.lessons) {
    const { id: lessonId, created } = upsertCanvasLesson(
      { courseId: plan.courseId, kind: planned.kind, itemId: planned.itemId },
      { title: planned.title, description: planned.description },
    );

    const existing = canvasFilesByKey(lessonId);
    const items: Pending[] = [];
    let unchanged = 0;

    const keep = (key: string, version: string | null): boolean => {
      const row = existing.get(key);
      // A file that failed last time is retried even if Canvas says it hasn't
      // changed — otherwise a transient download error would be permanent.
      const same =
        row !== undefined &&
        row.status === "ready" &&
        version !== null &&
        row.canvas_updated_at === version;

      if (row && !same) {
        deleteFile(row.id);
        orphanedPaths.push(uploadPath(row.id, row.filename));
      }
      existing.delete(key);

      if (same) unchanged++;
      return !same;
    };

    for (const planText of planned.texts) {
      if (!keep(planText.key, planText.fingerprint)) continue;

      items.push(
        stageCanvasText({
          lessonId,
          filename: planText.filename,
          label: planText.label,
          html: planText.html,
          canvasFileId: planText.key,
          canvasUpdatedAt: planText.fingerprint,
        }),
      );
    }

    for (const file of planned.files) {
      if (!keep(file.canvasFileId, file.updatedAt)) continue;

      items.push(
        stageCanvasFile({
          lessonId,
          filename: file.filename,
          kind: file.kind,
          canvasFileId: file.canvasFileId,
          canvasUpdatedAt: file.updatedAt,
          download: () => download(file.url),
        }),
      );
    }

    // Anything still in `existing` was on this lesson last sync and isn't in
    // Canvas now. It goes, so a deleted handout stops being answerable.
    let removed = 0;
    for (const row of existing.values()) {
      deleteFile(row.id);
      orphanedPaths.push(uploadPath(row.id, row.filename));
      removed++;
    }

    lessons.push({
      lessonId,
      title: planned.title,
      kind: planned.kind,
      created,
      added: items.length,
      unchanged,
      removed,
    });

    if (items.length > 0) pending.push({ lessonId, items });
  }

  // Lessons a previous sync made that this one didn't. They're reported, not
  // deleted — deleting cascades the teacher's question log, and losing that to
  // an unpublished module would be a worse surprise than a stale lesson.
  const planKeys = new Set(plan.lessons.map((l) => `${l.kind}:${l.itemId}`));
  const stale = listCanvasLessons(plan.courseId)
    .filter((l) => !planKeys.has(`${l.canvas_kind}:${l.canvas_item_id}`))
    .map((l) => l.title);

  return {
    report: {
      courseId: plan.courseId,
      courseName: plan.courseName,
      lessons,
      created: lessons.filter((l) => l.created).length,
      updated: lessons.filter((l) => !l.created).length,
      added: sum(lessons, (l) => l.added),
      unchanged: sum(lessons, (l) => l.unchanged),
      removed: sum(lessons, (l) => l.removed),
      skipped: plan.skipped,
      stale,
    },
    pending,
    orphanedPaths,
  };
}

/* ------------------------------ the whole thing ------------------------- */

/**
 * Pull a course, write its lessons, and start parsing. Returns as soon as the
 * rows exist; downloading and parsing continue in the background so the
 * dashboard's existing Processing → Ready badges cover the wait, exactly as
 * they do for a manual upload.
 */
export async function syncCourse(
  client: CanvasClient,
  courseId: string,
): Promise<SyncReport> {
  if (!/^\d+$/.test(courseId.trim())) {
    throw new CanvasError(`"${courseId}" isn't a Canvas course id.`);
  }

  const pulled = await fetchCourse(client, courseId.trim());
  const plan = planCourse(pulled);

  const { report, pending, orphanedPaths } = applyPlan(plan, (url) =>
    client.download(url),
  );

  await Promise.all(
    orphanedPaths.map((path) => fs.rm(path, { force: true }).catch(() => {})),
  );

  // Not awaited: same as the upload path. processPending never rejects.
  for (const { lessonId, items } of pending) void processPending(lessonId, items);

  return { ...report, warnings: pulled.warnings };
}

/* -------------------------------- helpers ------------------------------- */

function sum<T>(items: T[], of: (item: T) => number): number {
  return items.reduce((total, item) => total + of(item), 0);
}
