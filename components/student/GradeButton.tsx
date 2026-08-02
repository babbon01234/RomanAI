"use client";

/**
 * The way into a grade explanation, shown only on a Canvas assignment.
 *
 * It sits with the FAQ chips rather than in the composer: like a chip it's a
 * question you tap instead of type, and it's phrased as the student's own
 * words for the same reason. Marked out from the chips because it goes
 * somewhere different — the teacher's marking, not the lesson material.
 */
export function GradeButton({
  onAsk,
  disabled,
  pending,
}: {
  onAsk: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="border-t border-parchment-line px-5 pt-3.5 sm:px-7">
      <button
        type="button"
        onClick={onAsk}
        disabled={disabled}
        className="group inline-flex items-center gap-2 rounded-full border border-gold-deep/40 bg-gold-wash/50 px-3.5 py-1.5 text-[13px] text-ink transition-colors duration-150 hover:border-gold-deep hover:bg-gold-wash disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-gold-deep transition-transform duration-150 group-hover:scale-125"
        />
        {pending ? "Looking up your marks…" : "Why did I lose points on this?"}
      </button>
      <p className="mt-1.5 text-[11px] text-charcoal-muted">
        Shows your teacher’s own rubric notes. Nothing is added to them.
      </p>
    </div>
  );
}
