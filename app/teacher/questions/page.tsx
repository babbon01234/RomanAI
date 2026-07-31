import Link from "next/link";
import { PromoteButton } from "@/components/teacher/PromoteButton";
import { listMessages } from "@/lib/db/queries";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

/** "14:32 · 31 Jul" — enough to place a question in the day. */
function when(iso: string): string {
  const date = new Date(iso.replace(" ", "T") + "Z");
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

export default function TeacherQuestionsPage() {
  const messages = listMessages();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-[-0.01em]">Questions</h1>
          <p className="mt-1.5 text-[13px] text-charcoal-muted">
            Everything students have asked, newest first.
          </p>
        </div>
        {messages.length > 0 && (
          <p className="text-[12px] text-charcoal-muted">
            {messages.length} question{messages.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-parchment-line bg-white/40 px-6 py-14 text-center">
          <p className="font-display text-lg text-ink">Nothing asked yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-charcoal-muted">
            Once students start asking, every question lands here with the
            answer they got.
          </p>
        </div>
      ) : (
        <ol className="mt-8 space-y-2.5">
          {messages.map((message) => {
            const citations = JSON.parse(
              message.citations_json,
            ) as Citation[];

            return (
              <li
                key={message.id}
                className="rounded-lg border border-parchment-line bg-white/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-charcoal-muted">
                  <span className="font-medium text-ink">
                    {message.student_name}
                  </span>
                  <span className="text-charcoal-muted/40">&middot;</span>
                  <span>{message.lesson_title}</span>
                  <span className="text-charcoal-muted/40">&middot;</span>
                  <span>{when(message.created_at)}</span>

                  {message.source === "faq" && (
                    <span className="rounded-full bg-parchment-deep px-2 py-0.5 text-[10px] uppercase tracking-[0.1em]">
                      Saved answer
                    </span>
                  )}

                  <span className="ml-auto">
                    <PromoteButton
                      messageId={message.id}
                      promoted={Boolean(message.promoted_faq_id)}
                    />
                  </span>
                </div>

                <p className="mt-2.5 text-[14px] font-medium leading-relaxed text-ink">
                  {message.question}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-charcoal-muted">
                  {message.answer}
                </p>

                {citations.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                    {citations.map((citation, i) => (
                      <span
                        key={i}
                        className="font-annot text-[15px] leading-none text-ink/70"
                      >
                        {citation.locator}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {messages.length > 0 && (
        <p className="mt-6 text-[12px] text-charcoal-muted">
          Promoted questions become shortcuts students can tap. Edit the wording
          in{" "}
          <Link
            href="/teacher/faq"
            className="text-gold-deep underline underline-offset-2 hover:text-ink"
          >
            FAQ
          </Link>
          .
        </p>
      )}
    </>
  );
}
