"use client";

import type { LessonSummary } from "@/lib/types";

/** Divider tabs in a binder — they sit on the page edge, not above it. */
export function LessonTabs({
  lessons,
  selectedId,
  onSelect,
}: {
  lessons: LessonSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Lessons"
      className="-mb-px flex flex-wrap items-end gap-1.5 overflow-x-auto"
    >
      {lessons.map((lesson) => {
        const active = lesson.id === selectedId;
        const askable = lesson.approved_count > 0;

        return (
          <button
            key={lesson.id}
            role="tab"
            aria-selected={active}
            disabled={!askable}
            onClick={() => onSelect(lesson.id)}
            title={
              askable
                ? undefined
                : lesson.status === "processing"
                  ? "Still processing"
                  : "Your teacher hasn’t approved this lesson yet"
            }
            className={
              "relative max-w-[14rem] shrink-0 truncate rounded-t-lg border border-b-0 px-4 pb-2.5 text-[13px] transition-all duration-150 ease-[var(--ease-quiet)] " +
              (active
                ? "z-10 border-parchment-line bg-white pt-3 font-medium text-ink"
                : askable
                  ? "cursor-pointer border-transparent bg-parchment-deep/70 pt-2.5 text-charcoal-muted hover:bg-parchment-deep hover:text-ink"
                  : "cursor-not-allowed border-transparent bg-parchment-deep/40 pt-2.5 text-charcoal-muted/50")
            }
          >
            {/* The gold tab marker, only on the active divider. */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold"
              />
            )}
            {lesson.title}
          </button>
        );
      })}
    </div>
  );
}
