import Link from "next/link";
import { CanvasClient, CanvasError, isCanvasConfigured } from "@/lib/canvas/client";
import { listSyncedCourses } from "@/lib/db/queries";
import { CanvasSync, type Listing } from "@/components/teacher/CanvasSync";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-[-0.01em]">Sync from Canvas</h1>
          <p className="mt-1.5 text-[13px] text-charcoal-muted">
            Pull a course’s materials in instead of uploading them by hand.
          </p>
        </div>

        <Link
          href="/teacher"
          className="rounded-lg border border-parchment-line bg-white/70 px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-gold hover:bg-gold-wash/50"
        >
          Back to lessons
        </Link>
      </div>

      <CanvasSync listing={await loadCourses()} />
    </>
  );
}

/**
 * The course list is read here rather than through an API route the client
 * polls: this page is already dynamic, and a server read means no loading
 * flash, no effect on mount, and `router.refresh()` is all a re-read takes.
 */
async function loadCourses(): Promise<Listing> {
  if (!isCanvasConfigured()) return { state: "unconfigured" };

  try {
    const courses = await CanvasClient.fromEnv().listCourses();
    const synced = new Map(
      (await listSyncedCourses()).map((row) => [row.canvas_course_id, row]),
    );

    return {
      state: "ready",
      courses: courses.map((course) => {
        const previous = synced.get(String(course.id));
        return {
          id: String(course.id),
          name: course.name || course.course_code || `Course ${course.id}`,
          code: course.course_code ?? null,
          lastSyncedAt: previous?.last_synced_at ?? null,
          lessonCount: previous?.lesson_count ?? 0,
        };
      }),
    };
  } catch (error) {
    return {
      state: "error",
      message:
        error instanceof CanvasError
          ? error.message
          : "Couldn’t list your Canvas courses.",
    };
  }
}
