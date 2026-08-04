import Link from "next/link";
import { LessonGrid } from "@/components/teacher/LessonGrid";
import { listLessons } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function TeacherLessonsPage() {
  const lessons = await listLessons();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-[-0.01em]">Lessons</h1>
          <p className="mt-1.5 text-[13px] text-charcoal-muted">
            What students can ask about.
          </p>
        </div>

        {/* Two ways in. Canvas is the primary path now, but manual upload
            stays first-class — it's how you test without touching Canvas. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/teacher/canvas"
            className="rounded-lg border border-parchment-line bg-white/70 px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-gold hover:bg-gold-wash/50"
          >
            Sync from Canvas
          </Link>

          <Link
            href="/teacher/lessons/new"
            className="rounded-lg bg-gold px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment"
          >
            Add a lesson
          </Link>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-parchment-line bg-white/40 px-6 py-14 text-center">
          <p className="font-display text-lg text-ink">No lessons yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-charcoal-muted">
            Sync a Canvas course, or add a lesson and upload the slides
            yourself. Students can start asking as soon as it finishes
            processing.
          </p>
        </div>
      ) : (
        <LessonGrid
          key={lessons.map((l) => l.id).join()}
          initial={lessons}
        />
      )}
    </>
  );
}
