"use client";

import type { Faq } from "@/lib/types";

/** Up to five saved questions for this lesson, per PHASE1_SPEC. */
export function FaqChips({
  faqs,
  onPick,
  disabled,
}: {
  faqs: Faq[];
  onPick: (question: string) => void;
  disabled: boolean;
}) {
  if (faqs.length === 0) return null;

  return (
    <div className="border-t border-parchment-line px-5 pt-3.5 sm:px-7">
      <p className="text-[11px] uppercase tracking-[0.14em] text-charcoal-muted">
        Asked a lot
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {faqs.slice(0, 5).map((faq) => (
          <button
            key={faq.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(faq.question)}
            className="max-w-full cursor-pointer truncate rounded-full border border-parchment-line bg-parchment/60 px-3.5 py-1.5 text-[12.5px] text-charcoal transition-colors duration-150 hover:border-gold hover:bg-gold-wash hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {faq.question}
          </button>
        ))}
      </div>
    </div>
  );
}
