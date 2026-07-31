import { StatusBadge } from "./StatusBadge";
import type { LessonSummary } from "@/lib/types";

/**
 * An index card on the desk — square corners, a ruled header line, and the
 * status badge sitting where a filing tab would.
 */
export function LessonCard({ lesson }: { lesson: LessonSummary }) {
  const empty = lesson.file_count === 0;

  return (
    <article className="group relative flex min-h-[168px] flex-col rounded-sm border border-parchment-line bg-white/75 p-5 shadow-[0_10px_22px_-20px_rgba(27,42,74,.55)] transition-shadow duration-200 hover:shadow-[0_16px_28px_-20px_rgba(27,42,74,.55)]">
      {/* Ruled header line, like the red rule on an index card. */}
      <span
        aria-hidden
        className="absolute inset-x-5 top-[52px] h-px bg-gold/25"
      />

      <h3 className="pr-2 font-display text-lg leading-snug text-ink">
        {lesson.title}
      </h3>

      {lesson.description ? (
        <p className="mt-5 line-clamp-3 text-[13px] leading-relaxed text-charcoal-muted">
          {lesson.description}
        </p>
      ) : (
        <p className="mt-5 text-[13px] italic text-charcoal-muted/60">
          No description
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="text-[12px] text-charcoal-muted">
          {empty
            ? "No files"
            : `${lesson.file_count} file${lesson.file_count === 1 ? "" : "s"} · ${lesson.chunk_count} passage${lesson.chunk_count === 1 ? "" : "s"}`}
        </span>
        {!empty && <StatusBadge status={lesson.status} />}
      </div>
    </article>
  );
}
