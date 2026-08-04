import Link from "next/link";
import { approveUnflaggedAction } from "@/app/actions/review";
import { ReviewChunkCard } from "@/components/teacher/ReviewChunkCard";
import { listChunksForReview, listLessons } from "@/lib/db/queries";
import type { ApprovalStatus, LessonSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "pending", label: "Awaiting review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "Everything" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string; show?: string }>;
}) {
  const params = await searchParams;
  const lessons = (await listLessons()).filter((l) => l.chunk_count > 0);

  // Land on whatever most needs a person: the first lesson with something
  // pending, rather than the newest lesson which may be fully reviewed.
  const selected =
    lessons.find((l) => l.id === params.lesson) ??
    lessons.find((l) => l.pending_count > 0) ??
    lessons[0];

  const show: FilterKey = FILTERS.some((f) => f.key === params.show)
    ? (params.show as FilterKey)
    : "pending";

  const chunks = selected
    ? await listChunksForReview(
        selected.id,
        show === "all" ? undefined : (show as ApprovalStatus),
      )
    : [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-[-0.01em]">Review</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-charcoal-muted">
            Students can’t be told anything from a passage until you approve it.
            Flagged passages are a guess about what’s worth a second look — you
            decide.
          </p>
        </div>
      </div>

      {lessons.length === 0 ? (
        <Empty />
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr]">
          <LessonList lessons={lessons} selectedId={selected?.id} show={show} />

          {selected && (
            <section className="min-w-0">
              <LessonHeader lesson={selected} show={show} />

              {chunks.length === 0 ? (
                <p className="mt-6 rounded-lg border border-dashed border-parchment-line bg-white/40 px-5 py-10 text-center text-[13px] text-charcoal-muted">
                  {show === "pending"
                    ? "Nothing left to review in this lesson."
                    : "Nothing here yet."}
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {chunks.map((chunk) => (
                    <ReviewChunkCard key={chunk.id} chunk={chunk} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

/* --------------------------------- pieces -------------------------------- */

function LessonList({
  lessons,
  selectedId,
  show,
}: {
  lessons: LessonSummary[];
  selectedId?: string;
  show: FilterKey;
}) {
  return (
    <nav aria-label="Lessons to review" className="lg:sticky lg:top-6 lg:self-start">
      <ul className="space-y-1">
        {lessons.map((lesson) => {
          const active = lesson.id === selectedId;

          return (
            <li key={lesson.id}>
              <Link
                href={`/teacher/review?lesson=${lesson.id}&show=${show}`}
                aria-current={active ? "true" : undefined}
                className={
                  "block rounded-md px-3 py-2.5 text-[13px] leading-snug transition-colors duration-150 " +
                  (active
                    ? "bg-ink text-parchment"
                    : "text-charcoal hover:bg-parchment-deep/70")
                }
              >
                <span className="block truncate">{lesson.title}</span>
                <span
                  className={
                    "mt-0.5 block text-[11px] " +
                    (active ? "text-parchment/65" : "text-charcoal-muted")
                  }
                >
                  {lesson.pending_count > 0
                    ? `${lesson.pending_count} to review` +
                      (lesson.flagged_count > 0
                        ? ` · ${lesson.flagged_count} flagged`
                        : "")
                    : `${lesson.approved_count} approved`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function LessonHeader({
  lesson,
  show,
}: {
  lesson: LessonSummary;
  show: FilterKey;
}) {
  const unflagged = lesson.pending_count - lesson.flagged_count;

  return (
    <div className="border-b border-parchment-line pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-snug text-ink">
            {lesson.title}
          </h2>
          <p className="mt-1 text-[12px] text-charcoal-muted">
            {lesson.approved_count} approved · {lesson.pending_count} awaiting
            review · {lesson.rejected_count} rejected
          </p>
        </div>

        {/* The bulk action deliberately skips flagged passages — clearing a
            whole lesson in one press is the point, but not at the cost of the
            things the flags were raised about. */}
        {unflagged > 0 && (
          <form action={approveUnflaggedAction}>
            <input type="hidden" name="lessonId" value={lesson.id} />
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment"
            >
              Approve {unflagged} unflagged
            </button>
          </form>
        )}
      </div>

      {lesson.flagged_count > 0 && (
        <p className="mt-3 rounded-md border border-gold-deep/25 bg-gold-wash/40 px-3 py-2 text-[12px] leading-relaxed text-ink">
          {lesson.flagged_count} passage
          {lesson.flagged_count === 1 ? " was" : "s were"} flagged as possibly
          an answer key, a rubric, or a private note about a student. Bulk
          approval leaves {lesson.flagged_count === 1 ? "it" : "them"} for you.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={`/teacher/review?lesson=${lesson.id}&show=${filter.key}`}
            aria-current={filter.key === show ? "true" : undefined}
            className={
              "rounded-full border px-3 py-1 text-[12px] transition-colors duration-150 " +
              (filter.key === show
                ? "border-gold bg-gold-wash text-ink"
                : "border-parchment-line bg-white/60 text-charcoal-muted hover:border-gold hover:text-ink")
            }
          >
            {filter.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-parchment-line bg-white/40 px-6 py-14 text-center">
      <p className="font-display text-lg text-ink">Nothing to review yet</p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-charcoal-muted">
        Add a lesson or sync a Canvas course. Everything that comes in lands
        here first — students can’t be told anything from it until you’ve said
        so.
      </p>
      <Link
        href="/teacher"
        className="mt-5 inline-block rounded-lg bg-gold px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment"
      >
        Go to lessons
      </Link>
    </div>
  );
}
