"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { FaqChips } from "./FaqChips";
import { GradeButton } from "./GradeButton";
import { LessonTabs } from "./LessonTabs";
import { MarginNote } from "./MarginNote";
import type { ChatResponse } from "@/app/api/chat/route";
import type { GradeResponse } from "@/app/api/canvas/submission/route";
import type { AnswerSource, Citation, Faq, LessonSummary } from "@/lib/types";

export interface Exchange {
  key: string;
  question: string;
  answer?: string;
  citations: Citation[];
  found?: boolean;
  /** "faq" when a teacher-approved answer matched — no model call was made. */
  source?: AnswerSource;
  /** true when the bot handed the question to the teacher instead of answering. */
  handedOff?: boolean;
  error?: string;
  /**
   * Rehydrated from the log rather than just answered. The margin-scrawl is
   * the signature moment for an answer arriving; replaying it for history
   * every time the page loads would spend it on nothing.
   */
  restored?: boolean;
}

export function ChatShell({
  lessons,
  faqs,
  history,
  rehearsal,
}: {
  lessons: LessonSummary[];
  faqs: Faq[];
  /** This student's prior exchanges, keyed by lesson, from the question log. */
  history: Record<string, Exchange[]>;
  rehearsal: boolean;
}) {
  // Approved passages, not merely parsed ones — a lesson whose content is
  // still awaiting the teacher has nothing that can be answered from.
  const askable = lessons.filter((l) => l.approved_count > 0);
  const [lessonId, setLessonId] = useState<string | null>(
    askable[0]?.id ?? null,
  );
  const [byLesson, setByLesson] = useState<Record<string, Exchange[]>>(history);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const exchanges = lessonId ? (byLesson[lessonId] ?? []) : [];
  const lessonFaqs = faqs.filter((f) => f.lesson_id === lessonId);
  const selected = lessons.find((l) => l.id === lessonId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges.length, sending]);

  async function ask(question: string) {
    if (!lessonId || !question.trim() || sending) return;

    const key = `${Date.now()}`;
    const id = lessonId;
    setByLesson((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), { key, question, citations: [] }],
    }));
    setDraft("");
    setSending(true);

    const patch = (fields: Partial<Exchange>) =>
      setByLesson((prev) => ({
        ...prev,
        [id]: (prev[id] ?? []).map((e) =>
          e.key === key ? { ...e, ...fields } : e,
        ),
      }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: id, question }),
      });
      const data = (await res.json()) as ChatResponse & { error?: string };

      if (!res.ok) patch({ error: data.error ?? "Something went wrong." });
      else
        patch({
          answer: data.answer,
          citations: data.citations,
          found: data.found,
          source: data.source,
          handedOff: data.outcome === "needs_human",
        });
    } catch {
      patch({ error: "Couldn’t reach the server. Try again." });
    } finally {
      setSending(false);
    }
  }

  /**
   * Same shape as asking, different endpoint. It reads as an exchange in the
   * transcript because that's what it is from the student's side — they asked
   * a question and got an answer, with the rubric row in the margin where a
   * slide number would be.
   */
  async function askAboutGrade() {
    if (!lessonId || sending) return;

    const key = `grade-${Date.now()}`;
    const id = lessonId;
    const question = "Why did I lose points on this?";

    setByLesson((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), { key, question, citations: [] }],
    }));
    setSending(true);

    const patch = (fields: Partial<Exchange>) =>
      setByLesson((prev) => ({
        ...prev,
        [id]: (prev[id] ?? []).map((e) =>
          e.key === key ? { ...e, ...fields } : e,
        ),
      }));

    try {
      const res = await fetch("/api/canvas/submission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: id }),
      });
      const data = (await res.json()) as GradeResponse & { error?: string };

      if (!res.ok) patch({ error: data.error ?? "Couldn’t look up your grade." });
      else
        patch({
          answer: data.answer,
          citations: data.citations,
          found: data.graded,
          source: "grade",
          // An ungraded assignment is a hand-off, not a failed answer.
          handedOff: !data.graded,
        });
    } catch {
      patch({ error: "Couldn’t reach the server. Try again." });
    } finally {
      setSending(false);
    }
  }

  if (askable.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-parchment-line bg-white/50 px-6 py-14 text-center text-[14px] text-charcoal-muted">
        {lessons.length === 0
          ? "Your teacher hasn’t added any lessons yet."
          : "Your teacher is still going through this material. Check back soon."}
      </p>
    );
  }

  return (
    <>
      <LessonTabs
        lessons={lessons}
        selectedId={lessonId}
        onSelect={setLessonId}
      />

      {/* The page itself. */}
      <div className="rounded-lg rounded-tl-none border border-parchment-line bg-white shadow-[0_16px_40px_-32px_rgba(27,42,74,.6)]">
        {rehearsal && (
          <p className="border-b border-parchment-line bg-gold-wash/60 px-5 py-2 text-[11px] leading-relaxed text-charcoal-muted sm:px-7">
            <span className="font-medium text-ink">Rehearsal mode.</span>{" "}
            Retrieval and citations are real; answers are quoted straight from
            the material instead of written. Add an API key to turn this off.
          </p>
        )}

        <div className="px-5 py-6 sm:px-7">
          {exchanges.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-charcoal-muted">
              Ask anything about this lesson. Every answer shows where it came
              from.
            </p>
          ) : (
            <div className="relative grid gap-y-5 md:grid-cols-[minmax(0,1fr)_11rem] md:gap-x-7">
              {/* The margin rule. This is what reads as notebook paper —
                  horizontal rules behind one-line answers just looked like
                  stray underlines. Leader lines cross it on their way out. */}
              <span
                aria-hidden
                style={{ right: "calc(11rem + 0.875rem)" }}
                className="pointer-events-none absolute inset-y-[-4px] hidden w-px bg-gold/30 md:block"
              />
              {exchanges.map((exchange) => (
                <ExchangeRows key={exchange.key} exchange={exchange} />
              ))}
            </div>
          )}

          {sending && (
            <p className="mt-6 flex items-center gap-1.5" aria-live="polite">
              <span className="sr-only">Looking through the lesson</span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  style={{ animationDelay: `${i * 180}ms` }}
                  className="h-1.5 w-1.5 rounded-full bg-ink animate-[nib-tap_1.4s_ease-in-out_infinite]"
                />
              ))}
            </p>
          )}

          <div ref={endRef} />
        </div>

        <FaqChips
          faqs={lessonFaqs}
          onPick={ask}
          disabled={sending || !lessonId}
        />

        {/* Only on a Canvas assignment — everywhere else there is no rubric
            behind it and the button would promise something it can't do. */}
        {selected?.canvas_kind === "assignment" && (
          <GradeButton
            onAsk={askAboutGrade}
            disabled={sending || !lessonId}
            pending={sending}
          />
        )}

        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => ask(draft)}
          disabled={sending || !lessonId}
        />
      </div>
    </>
  );
}

/**
 * Emits grid children in pairs so each message lines up with its own margin
 * slot. Alignment falls out of the grid — nothing is measured or positioned.
 */
function ExchangeRows({ exchange }: { exchange: Exchange }) {
  const rise = exchange.restored
    ? ""
    : "animate-[ink-rise_.26s_var(--ease-quiet)_both]";

  return (
    <Fragment>
      <div className={`${rise} md:col-start-1`}>
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-[14px] leading-relaxed text-parchment">
          {exchange.question}
        </p>
      </div>
      <div aria-hidden className="hidden md:col-start-2 md:block" />

      <div
        style={exchange.restored ? undefined : { animationDelay: "60ms" }}
        className={`${rise} md:col-start-1`}
      >
        {exchange.error ? (
          <p className="text-[14px] leading-8 text-red-700">{exchange.error}</p>
        ) : exchange.handedOff ? (
          /* Not a failed answer — a deliberate redirect. It gets its own
             quiet frame so it doesn't read as the bot falling over. */
          <p className="max-w-[52ch] border-l-2 border-gold-deep/50 pl-3.5 text-[15px] leading-8 text-charcoal">
            {exchange.answer}
          </p>
        ) : exchange.answer ? (
          <p
            className={
              "max-w-[52ch] whitespace-pre-wrap text-[15px] leading-8 " +
              (exchange.found ? "text-charcoal" : "italic text-charcoal-muted")
            }
          >
            {exchange.answer}
          </p>
        ) : (
          <p className="text-[14px] leading-8 text-charcoal-muted/60">…</p>
        )}
      </div>

      <div className="md:col-start-2">
        <MarginNote
          citations={exchange.citations}
          seed={exchange.key}
          savedAnswer={exchange.source === "faq"}
          animate={!exchange.restored}
        />
      </div>
    </Fragment>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="border-t border-parchment-line px-5 py-4 sm:px-7">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-end gap-2.5"
      >
        <textarea
          value={value}
          rows={1}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask about this lesson…"
          aria-label="Ask about this lesson"
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-parchment-line bg-parchment/50 px-3.5 py-2.5 text-[14px] leading-relaxed text-charcoal placeholder:text-charcoal-muted/55 transition-colors duration-150 focus:border-gold focus:bg-white"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="h-[42px] shrink-0 cursor-pointer rounded-lg bg-gold px-4 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
