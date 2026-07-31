"use client";

import { useTransition } from "react";
import { promoteToFaq } from "@/app/actions/faq";

export function PromoteButton({
  messageId,
  promoted,
}: {
  messageId: string;
  promoted: boolean;
}) {
  const [pending, start] = useTransition();

  if (promoted) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sage/30 bg-sage-wash px-2.5 py-1 text-[11px] font-medium text-sage">
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
          <path
            d="M1 4.2 3.6 6.8 9 1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        In FAQ
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void promoteToFaq(messageId))}
      className="shrink-0 cursor-pointer rounded-full border border-parchment-line bg-white px-3 py-1 text-[11px] font-medium text-charcoal-muted transition-colors duration-150 hover:border-gold hover:bg-gold-wash hover:text-ink disabled:opacity-50"
    >
      {pending ? "Saving…" : "Promote to FAQ"}
    </button>
  );
}
