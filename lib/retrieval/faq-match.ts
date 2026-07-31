import { terms } from "./terms";
import type { Faq } from "@/lib/types";

/**
 * How close a student's wording has to be before we answer from a saved FAQ
 * instead of the lesson material. Set high on purpose: returning the wrong
 * saved answer is worse than paying for a model call.
 *
 * 0.75 rather than something looser because questions about the same thing
 * share most of their words — "when is the lab report due" and "is the lab
 * report graded" overlap on two of three terms, and the term they differ on
 * is the entire question. Below ~0.75 that pair collides.
 */
const MATCH_THRESHOLD = 0.75;

function coverage(a: string[], b: Set<string>): number {
  if (a.length === 0) return 0;
  let hits = 0;
  for (const term of new Set(a)) if (b.has(term)) hits++;
  return hits / new Set(a).size;
}

/**
 * Scores both directions and takes the weaker one. One-way overlap would let
 * a two-word FAQ ("Due date?") swallow every question containing "due".
 */
export function matchFaq(question: string, faqs: Faq[]): Faq | null {
  const asked = terms(question);
  if (asked.length === 0) return null;

  const askedSet = new Set(asked);
  let best: { faq: Faq; score: number } | null = null;

  for (const faq of faqs) {
    const saved = terms(faq.question);
    if (saved.length === 0) continue;

    const score = Math.min(
      coverage(asked, new Set(saved)),
      coverage(saved, askedSet),
    );

    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { faq, score };
    }
  }

  return best?.faq ?? null;
}
