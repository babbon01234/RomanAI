"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SyncReport } from "@/lib/canvas/sync";

/**
 * The Canvas side of the teacher's desk. Deliberately quiet: a list of the
 * courses the token can see, one button each, and a plain account of what the
 * sync did. The signature animation belongs to the student's margin notes —
 * nothing here competes with it (DESIGN_GUIDE).
 */

export interface CanvasCourseRow {
  id: string;
  name: string;
  code: string | null;
  lastSyncedAt: string | null;
  lessonCount: number;
}

/** What the server managed to learn about this teacher's Canvas courses. */
export type Listing =
  | { state: "unconfigured" }
  | { state: "error"; message: string }
  | { state: "ready"; courses: CanvasCourseRow[] };

export function CanvasSync({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [syncing, setSyncing] = useState<string | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");

  async function sync(courseId: string) {
    setSyncing(courseId);
    setReport(null);
    setFailure(null);

    try {
      const res = await fetch("/api/canvas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = (await res.json()) as { report?: SyncReport; error?: string };

      if (!res.ok || !data.report) {
        setFailure(data.error ?? "The sync failed.");
        return;
      }

      setReport(data.report);
      // Re-reads the course list — the "last synced" line is now stale. Files
      // are still downloading; the lessons page polls for that on its own.
      startRefresh(() => router.refresh());
    } catch {
      setFailure("Couldn’t reach the server.");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {listing.state === "unconfigured" && <NotConfigured />}

      {listing.state === "error" && (
        <Notice tone="bad" title="Canvas didn’t answer">
          <p>{listing.message}</p>
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            className="mt-2 cursor-pointer text-[12px] font-medium underline underline-offset-2"
          >
            {refreshing ? "Asking Canvas…" : "Try again"}
          </button>
        </Notice>
      )}

      {listing.state === "ready" && (
        <section>
          <h2 className="font-display text-lg text-ink">Your Canvas courses</h2>
          <p className="mt-1 text-[13px] text-charcoal-muted">
            Syncing pulls the syllabus, modules, assignments and files. Run it
            again any time — it updates what’s already here instead of adding
            copies.
          </p>

          {listing.courses.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-parchment-line bg-white/40 px-5 py-8 text-center text-[13px] text-charcoal-muted">
              This access token can’t see any courses.
            </p>
          ) : (
            <ul className="mt-5 space-y-2.5">
              {listing.courses.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  busy={syncing === course.id}
                  disabled={syncing !== null}
                  onSync={() => void sync(course.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {listing.state !== "unconfigured" && (
        <section className="border-t border-parchment-line pt-7">
          <h2 className="font-display text-lg text-ink">Sync by course ID</h2>
          <p className="mt-1 text-[13px] text-charcoal-muted">
            The number in the Canvas URL:{" "}
            <span className="font-mono text-[12px]">/courses/</span>
            <span className="font-mono text-[12px] text-ink">12345</span>. Useful
            when a course isn’t in the list above.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (manualId.trim()) void sync(manualId.trim());
            }}
            className="mt-3.5 flex flex-wrap items-center gap-2.5"
          >
            <input
              value={manualId}
              onChange={(event) => setManualId(event.target.value)}
              inputMode="numeric"
              pattern="\d*"
              placeholder="12345"
              aria-label="Canvas course ID"
              className="w-36 rounded-lg border border-parchment-line bg-white/70 px-3.5 py-2.5 text-[14px] text-charcoal placeholder:text-charcoal-muted/50 transition-colors duration-150 focus:border-gold"
            />
            <button
              type="submit"
              disabled={!manualId.trim() || syncing !== null}
              className="cursor-pointer rounded-lg border border-parchment-line bg-white/70 px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-gold hover:bg-gold-wash/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing === manualId.trim() ? "Syncing…" : "Sync"}
            </button>
          </form>
        </section>
      )}

      {failure && (
        <Notice tone="bad" title="That sync didn’t finish">
          <p>{failure}</p>
        </Notice>
      )}

      {report && <Report report={report} />}
    </div>
  );
}

/* --------------------------------- pieces -------------------------------- */

function CourseRow({
  course,
  busy,
  disabled,
  onSync,
}: {
  course: CanvasCourseRow;
  busy: boolean;
  disabled: boolean;
  onSync: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-sm border border-parchment-line bg-white/75 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] leading-snug text-ink">
          {course.name}
        </p>
        <p className="mt-0.5 text-[12px] text-charcoal-muted">
          {course.code ? `${course.code} · ` : ""}ID {course.id}
          {course.lastSyncedAt ? (
            <>
              {" · "}
              {course.lessonCount} lesson
              {course.lessonCount === 1 ? "" : "s"}, last synced{" "}
              <Ago at={course.lastSyncedAt} />
            </>
          ) : (
            " · never synced"
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onSync}
        disabled={disabled}
        className="shrink-0 cursor-pointer rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment disabled:cursor-wait disabled:opacity-55 disabled:hover:bg-gold disabled:hover:text-ink"
      >
        {busy ? "Syncing…" : course.lastSyncedAt ? "Re-sync" : "Sync"}
      </button>
    </li>
  );
}

function Report({ report }: { report: SyncReport }) {
  const nothing =
    report.created === 0 && report.added === 0 && report.removed === 0;

  return (
    <Notice tone="good" title={`Synced ${report.courseName}`}>
      <p>
        {nothing
          ? "Nothing had changed in Canvas — everything here is already up to date."
          : summarize(report)}
      </p>

      {report.lessons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {report.lessons.map((lesson) => (
            <li key={lesson.lessonId} className="flex flex-wrap gap-x-2">
              <span className="text-ink">{lesson.title}</span>
              <span className="text-charcoal-muted">
                {lesson.created ? "new" : "updated"}
                {lesson.added > 0 && ` · ${lesson.added} reading`}
                {lesson.unchanged > 0 && ` · ${lesson.unchanged} unchanged`}
                {lesson.removed > 0 && ` · ${lesson.removed} removed`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Aside label="Couldn’t read" items={report.skipped} />
      <Aside label="No longer in Canvas" items={report.stale} />
      <Aside label="Partly unavailable" items={report.warnings} />

      {report.added > 0 && (
        <p className="mt-3 text-charcoal-muted">
          Files are still being read. Watch the lesson cards go Processing →
          Ready.
        </p>
      )}
    </Notice>
  );
}

function summarize(report: SyncReport): string {
  const parts: string[] = [];
  if (report.created) parts.push(`${report.created} new lesson${plural(report.created)}`);
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.added) parts.push(`${report.added} file${plural(report.added)} to read`);
  if (report.unchanged) parts.push(`${report.unchanged} unchanged`);
  if (report.removed) parts.push(`${report.removed} removed`);
  return `${parts.join(", ")}.`;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function Aside({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[12px] text-charcoal-muted">
        {label} ({items.length})
      </summary>
      <ul className="mt-1.5 space-y-1 pl-4 text-[12px] text-charcoal-muted">
        {items.map((item) => (
          <li key={item} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    </details>
  );
}

function NotConfigured() {
  return (
    <Notice tone="plain" title="Canvas isn’t connected yet">
      <p>
        Add your sandbox domain and an access token to{" "}
        <span className="font-mono text-[12px]">.env.local</span>, then restart
        the dev server:
      </p>
      <pre className="mt-2.5 overflow-x-auto rounded-md border border-parchment-line bg-parchment-deep/60 px-3 py-2.5 font-mono text-[12px] text-ink">
        {`CANVAS_BASE_URL=your-school.instructure.com\nCANVAS_ACCESS_TOKEN=your-token`}
      </pre>
      <p className="mt-2.5">
        The token comes from Canvas under Account → Settings → New Access Token.
        Manual upload keeps working either way.
      </p>
    </Notice>
  );
}

const TONES = {
  good: "border-sage/30 bg-sage-wash/60",
  bad: "border-red-200 bg-red-50 text-red-800",
  plain: "border-parchment-line bg-white/60",
} as const;

function Notice({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={`rounded-lg border px-4 py-3.5 text-[13px] leading-relaxed ${TONES[tone]}`}
    >
      <p className="font-display text-[15px] text-inherit">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * SQLite writes `datetime('now')` as UTC without a zone marker, which JS would
 * otherwise read as local time and report as hours off.
 */
function Ago({ at }: { at: string }) {
  const date = new Date(`${at.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return <>{at}</>;

  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
