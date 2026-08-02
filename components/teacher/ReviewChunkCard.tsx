"use client";

import { useState } from "react";
import { decideChunk } from "@/app/actions/review";
import { parseFlags } from "@/lib/review/flags";
import type { ApprovalStatus } from "@/lib/types";

/**
 * One passage awaiting a decision. A flagged card is marked at its edge and
 * says plainly why it was flagged — a flag is a reason to look, never a
 * verdict, so the content stays fully readable either way (Phase 3 brief).
 */

const COLLAPSE_AT = 420;

export function ReviewChunkCard({
  chunk,
}: {
  chunk: {
    id: string;
    locator: string;
    content: string;
    filename: string;
    approval_status: ApprovalStatus;
    flags: string;
  };
}) {
  const flags = parseFlags(chunk.flags);
  const flagged = flags.length > 0;
  const long = chunk.content.length > COLLAPSE_AT;
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={
        "relative overflow-hidden rounded-sm border bg-white/75 pl-5 pr-5 py-4 transition-colors duration-200 " +
        (flagged ? "border-gold-deep/35 bg-gold-wash/25" : "border-parchment-line")
      }
    >
      {/* A marked edge rather than a loud banner — the card still reads as
          content the teacher is judging, not as an alarm. */}
      {flagged && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gold-deep/60" />
      )}

      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-annot text-[15px] leading-none text-ink">
          {chunk.locator}
        </span>
        <span className="text-[12px] text-charcoal-muted">{chunk.filename}</span>
        <StatusPill status={chunk.approval_status} />
      </header>

      {flags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {flags.map((flag) => (
            <li
              key={flag.code}
              className="rounded-md border border-gold-deep/25 bg-white/70 px-2.5 py-2"
            >
              <p className="text-[12px] font-medium text-ink">{flag.label}</p>
              <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-charcoal-muted">
                {flag.excerpt}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p
        className={
          "mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-charcoal " +
          (long && !expanded ? "line-clamp-6" : "")
        }
      >
        {chunk.content}
      </p>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1.5 cursor-pointer text-[12px] text-charcoal-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          {expanded ? "Show less" : "Show all of this passage"}
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-parchment-line pt-3.5">
        <Decide
          chunkId={chunk.id}
          status="approved"
          disabled={chunk.approval_status === "approved"}
          className="bg-sage text-white hover:bg-sage/85 disabled:bg-sage-wash disabled:text-sage"
        >
          {chunk.approval_status === "approved" ? "Approved" : "Approve"}
        </Decide>

        <Decide
          chunkId={chunk.id}
          status="rejected"
          disabled={chunk.approval_status === "rejected"}
          className="border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:border-red-200 disabled:bg-red-50"
        >
          {chunk.approval_status === "rejected" ? "Rejected" : "Reject"}
        </Decide>

        {/* An undo, so a mis-click isn't permanent and a teacher can put
            something back in the queue to think about again. */}
        {chunk.approval_status !== "pending" && (
          <Decide
            chunkId={chunk.id}
            status="pending"
            className="ml-auto bg-transparent text-charcoal-muted hover:text-ink"
          >
            Undo
          </Decide>
        )}
      </div>
    </article>
  );
}

function Decide({
  chunkId,
  status,
  disabled,
  className,
  children,
}: {
  chunkId: string;
  status: ApprovalStatus;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <form action={decideChunk}>
      <input type="hidden" name="chunkId" value={chunkId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={disabled}
        className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-colors duration-150 disabled:cursor-default ${className}`}
      >
        {children}
      </button>
    </form>
  );
}

const PILLS: Record<ApprovalStatus, { label: string; className: string }> = {
  pending: {
    label: "Awaiting review",
    className: "border-parchment-line bg-parchment-deep text-charcoal-muted",
  },
  approved: {
    label: "Students can see this",
    className: "border-sage/30 bg-sage-wash text-sage",
  },
  rejected: {
    label: "Never shown",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

function StatusPill({ status }: { status: ApprovalStatus }) {
  const { label, className } = PILLS[status];

  return (
    <span
      className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-500 ease-[var(--ease-quiet)] ${className}`}
    >
      {label}
    </span>
  );
}
