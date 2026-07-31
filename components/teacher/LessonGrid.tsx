"use client";

import { useEffect, useState } from "react";
import { LessonCard } from "./LessonCard";
import type { LessonSummary } from "@/lib/types";

/**
 * Renders server-supplied lessons and polls only while something is still
 * parsing, so the Processing → Ready badge flips on its own and the page goes
 * quiet the moment there's nothing left to watch.
 */
export function LessonGrid({ initial }: { initial: LessonSummary[] }) {
  // Null until the first poll lands. The parent keys this component on the
  // lesson set, so adding a lesson remounts it and drops any stale poll.
  const [polled, setPolled] = useState<LessonSummary[] | null>(null);
  const lessons = polled ?? initial;

  const processing = lessons.some(
    (l) => l.file_count > 0 && l.status === "processing",
  );

  useEffect(() => {
    if (!processing) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/lessons", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { lessons: LessonSummary[] };
        if (!cancelled) setPolled(data.lessons);
      } catch {
        // A dropped poll is harmless — the next tick retries.
      }
    }, 700);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [processing]);

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lessons.map((lesson) => (
        <LessonCard key={lesson.id} lesson={lesson} />
      ))}
    </div>
  );
}
