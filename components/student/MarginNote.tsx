import type { Citation } from "@/lib/types";

/**
 * The signature element: the citation, written in the margin by hand.
 *
 * Each note gets its own resting angle derived from the message id, so a
 * column of them reads as annotated rather than stamped — but the angle is
 * stable across re-renders, so nothing twitches.
 */
function tiltFor(seed: string, index: number): string {
  let hash = index * 2654435761;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  // -2.6deg … +1.4deg, mostly leaning left the way a right-handed note does.
  const degrees = ((Math.abs(hash) % 41) / 10 - 2.6).toFixed(2);
  return `${degrees}deg`;
}

export function MarginNote({
  citations,
  seed,
  savedAnswer = false,
}: {
  citations: Citation[];
  seed: string;
  /** A teacher-approved FAQ answer — its source is the teacher, not a page. */
  savedAnswer?: boolean;
}) {
  const notes: { label: string; sub?: string }[] = savedAnswer
    ? [{ label: "Saved answer", sub: "From your teacher" }]
    : citations.map((c) => ({ label: c.locator, sub: c.filename }));

  if (notes.length === 0) return <div aria-hidden />;

  return (
    <aside
      aria-label="Where this answer came from"
      className="mt-2 flex flex-col items-start gap-3 md:mt-0 md:pt-1"
    >
      {notes.map((note, i) => (
        <div
          key={`${note.label}-${i}`}
          style={
            {
              "--tilt": tiltFor(seed, i),
              // Beat 3 of margin-scrawl, staggered per note.
              animationDelay: `${340 + i * 90}ms`,
            } as React.CSSProperties
          }
          className="relative animate-[margin-scrawl_.52s_var(--ease-settle)_both]"
        >
          {/* Beat 2: the leader line, drawn from the answer across the gutter.
              Desktop only — on a phone the note sits directly beneath. */}
          <span
            aria-hidden
            style={{ animationDelay: `${200 + i * 90}ms` }}
            className="absolute right-full top-[13px] hidden h-px w-7 origin-right bg-gold/55 animate-[leader-draw_.24s_var(--ease-quiet)_both] md:block"
          />

          <p className="font-annot text-[19px] leading-none text-ink">
            {note.label}
          </p>

          {/* Hand-drawn underline rather than a border — a ruler line here
              would fight the handwriting. */}
          <svg
            aria-hidden
            viewBox="0 0 82 6"
            className="mt-1 h-1.5 w-[72px] text-gold"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M1 4.2c14-2.1 28-2.6 42-1.4 12 1 24 1.1 38-.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>

          {note.sub && (
            <p className="mt-1.5 max-w-[11rem] truncate text-[10px] uppercase tracking-[0.12em] text-charcoal-muted/70">
              {note.sub}
            </p>
          )}
        </div>
      ))}
    </aside>
  );
}
