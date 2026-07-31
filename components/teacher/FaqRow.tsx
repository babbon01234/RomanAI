"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { removeFaq, saveFaq } from "@/app/actions/faq";
import type { Faq } from "@/lib/types";

/**
 * The two-column editor from DESIGN_GUIDE: question on the left, the answer
 * students will actually see on the right.
 */
export function FaqRow({
  faq,
  lessonTitle,
}: {
  faq: Faq;
  lessonTitle: string;
}) {
  const [dirty, setDirty] = useState(false);

  return (
    <form
      action={saveFaq}
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="rounded-lg border border-parchment-line bg-white/70 p-4"
    >
      <input type="hidden" name="id" value={faq.id} />

      <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-charcoal-muted">
        {lessonTitle}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-medium text-ink">Question</span>
          <textarea
            name="question"
            defaultValue={faq.question}
            rows={3}
            className="mt-1.5 w-full resize-y rounded-lg border border-parchment-line bg-parchment/40 px-3 py-2 text-[13px] leading-relaxed text-charcoal transition-colors focus:border-gold focus:bg-white"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-ink">
            Answer students see
          </span>
          <textarea
            name="answer"
            defaultValue={faq.answer}
            rows={3}
            className="mt-1.5 w-full resize-y rounded-lg border border-parchment-line bg-parchment/40 px-3 py-2 text-[13px] leading-relaxed text-charcoal transition-colors focus:border-gold focus:bg-white"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Save dirty={dirty} />
        <button
          type="submit"
          formAction={removeFaq}
          className="cursor-pointer text-[12px] text-charcoal-muted transition-colors hover:text-red-700"
        >
          Remove
        </button>
      </div>
    </form>
  );
}

function Save({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="cursor-pointer rounded-lg bg-gold px-3.5 py-1.5 text-[12px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment disabled:cursor-default disabled:opacity-35"
    >
      {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </button>
  );
}
