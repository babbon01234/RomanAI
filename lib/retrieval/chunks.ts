import { getApprovedChunks } from "@/lib/db/queries";
import { overlap, terms } from "./terms";
import type { Chunk } from "@/lib/types";

/**
 * Characters of lesson material we're willing to put in one request. A single
 * lesson is usually far under this, in which case every chunk goes through in
 * document order — PHASE1_SPEC rules out real vector search at this scale.
 */
const CONTEXT_BUDGET = 30_000;

export interface Retrieval {
  chunks: Chunk[];
  /** "full" = the whole lesson fit; "ranked" = trimmed to the best matches. */
  strategy: "full" | "ranked";
}

/**
 * Approved chunks only, and that is the whole of the rule — pending and
 * rejected content never enters the candidate set, so it cannot be ranked,
 * cannot enter a prompt, and cannot be cited. Same call for manually uploaded
 * and Canvas-synced lessons; neither has a path around it.
 */
export async function selectChunks(lessonId: string, question: string): Promise<Retrieval> {
  const all = await getApprovedChunks(lessonId);
  const total = all.reduce((sum, c) => sum + c.content.length, 0);

  if (total <= CONTEXT_BUDGET) return { chunks: all, strategy: "full" };

  const questionTerms = terms(question);
  const scored = all
    .map((chunk) => ({ chunk, score: overlap(questionTerms, chunk.content) }))
    .sort((a, b) => b.score - a.score);

  const kept: Chunk[] = [];
  let used = 0;
  for (const { chunk } of scored) {
    if (used + chunk.content.length > CONTEXT_BUDGET) break;
    kept.push(chunk);
    used += chunk.content.length;
  }

  // Put them back in document order so the model reads the lesson as written.
  kept.sort((a, b) => a.ordinal - b.ordinal);
  return { chunks: kept, strategy: "ranked" };
}
