import Link from "next/link";
import { PromoteButton } from "@/components/teacher/PromoteButton";
import { countNeedsHuman, listMessages } from "@/lib/db/queries";
import { REASON_LABELS, type HumanReason } from "@/lib/triage";
import type { Citation, Outcome } from "@/lib/types";

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

function reasonLabel(reason: string | null): string {
  return REASON_LABELS[reason as HumanReason] ?? "Needs your attention";
}

export default async function TeacherQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const onlyFlagged = (await searchParams).show === "attention";
  const messages = await listMessages(100, onlyFlagged ? "needs_human" : undefined);
  const waiting = await countNeedsHuman();

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

      {/* The whole point of the filter: a teacher opening this page wants to
          know who is waiting on them, not to read everything again. */}
      {waiting > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Filter href="/teacher/questions" active={!onlyFlagged}>
            Everything
          </Filter>
          <Filter href="/teacher/questions?show=attention" active={onlyFlagged}>
            Needs you
            <span
              className={
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                (onlyFlagged ? "bg-ink/10 text-ink" : "bg-gold text-ink")
              }
            >
              {waiting}
            </span>
          </Filter>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-parchment-line bg-white/40 px-6 py-14 text-center">
          <p className="font-display text-lg text-ink">
            {onlyFlagged ? "Nothing waiting on you" : "Nothing asked yet"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-charcoal-muted">
            {onlyFlagged
              ? "Every question so far was one the materials could answer."
              : "Once students start asking, every question lands here with the answer they got."}
          </p>
        </div>
      ) : (
        <ol className="mt-8 space-y-2.5">
          {messages.map((message) => (
            <QuestionRow
              key={message.id}
              message={message}
              citations={JSON.parse(message.citations_json) as Citation[]}
            />
          ))}
        </ol>
      )}

      {messages.length > 0 && !onlyFlagged && (
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

/* --------------------------------- pieces -------------------------------- */

function QuestionRow({
  message,
  citations,
}: {
  message: {
    id: string;
    student_name: string;
    lesson_title: string;
    created_at: string;
    question: string;
    answer: string;
    source: string;
    outcome: Outcome;
    human_reason: string | null;
    promoted_faq_id: string | null;
  };
  citations: Citation[];
}) {
  const needsHuman = message.outcome === "needs_human";

  return (
    <li
      className={
        "relative overflow-hidden rounded-lg border p-4 " +
        (needsHuman
          ? "border-gold-deep/35 bg-gold-wash/30"
          : "border-parchment-line bg-white/70")
      }
    >
      {/* Same marked edge as a flagged review card — one visual language for
          "a person still has to deal with this". */}
      {needsHuman && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gold-deep/60" />
      )}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-charcoal-muted">
        <span className="font-medium text-ink">{message.student_name}</span>
        <span className="text-charcoal-muted/40">&middot;</span>
        <span>{message.lesson_title}</span>
        <span className="text-charcoal-muted/40">&middot;</span>
        <span>{when(message.created_at)}</span>

        {/* A grade explanation is a different kind of interaction from a
            question about the lesson — it restates this teacher's own marks
            back to one student, so it's worth being able to pick out. */}
        {message.source === "grade" && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-parchment">
            Grade explanation
          </span>
        )}

        {needsHuman && (
          <span className="rounded-full bg-gold-deep/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-parchment">
            {reasonLabel(message.human_reason)}
          </span>
        )}

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
      <p
        className={
          "mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed " +
          (needsHuman ? "italic text-charcoal-muted" : "text-charcoal-muted")
        }
      >
        {needsHuman ? `Told them: “${message.answer}”` : message.answer}
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
}

function Filter({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={
        "inline-flex items-center rounded-full border px-3 py-1 text-[12px] transition-colors duration-150 " +
        (active
          ? "border-gold bg-gold-wash text-ink"
          : "border-parchment-line bg-white/60 text-charcoal-muted hover:border-gold hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}
