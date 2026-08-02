"use client";

import { useState } from "react";
import { deleteLessonAction } from "@/app/actions/lessons";
import { StatusBadge } from "./StatusBadge";
import type { LessonSummary } from "@/lib/types";

/**
 * An index card on the desk — square corners, a ruled header line, and the
 * status badge sitting where a filing tab would.
 */
export function LessonCard({ lesson }: { lesson: LessonSummary }) {
  const [confirming, setConfirming] = useState(false);
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

      {/* Why it failed, not just that it did — the reason was previously
          only visible in the database. */}
      {lesson.error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] leading-relaxed text-red-700">
          {lesson.error}
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

      <div className="mt-3 border-t border-parchment-line pt-3">
        {confirming ? (
          <form action={deleteLessonAction} className="flex items-center gap-3">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <span className="text-[12px] text-charcoal-muted">
              Delete this lesson and its questions?
            </span>
            <button
              type="submit"
              className="ml-auto shrink-0 cursor-pointer rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="shrink-0 cursor-pointer text-[11px] text-charcoal-muted transition-colors hover:text-ink"
            >
              Keep
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="cursor-pointer text-[11px] text-charcoal-muted/70 transition-colors hover:text-red-700"
          >
            Delete lesson
          </button>
        )}
      </div>
    </article>
  );
}
