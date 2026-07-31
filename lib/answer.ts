import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ANSWER_SCHEMA,
  NOT_IN_MATERIALS,
  SYSTEM_PROMPT,
  buildUserMessage,
} from "@/lib/prompt";
import { overlap, terms } from "@/lib/retrieval/terms";
import type { Chunk, Citation } from "@/lib/types";

/**
 * One seam for producing an answer, with two implementations behind it.
 *
 * "anthropic" is the real grounded call. "rehearsal" runs when no API key is
 * set: retrieval, citations, and the not-in-materials path are all genuine —
 * only the answer prose is extracted rather than written. It exists so the
 * whole loop is buildable and demoable without spending anything, and the UI
 * labels it so nobody mistakes it for the model.
 */

export type Provider = "anthropic" | "rehearsal";

export interface Answer {
  text: string;
  citations: Citation[];
  /** false when the material doesn't cover the question. */
  found: boolean;
  provider: Provider;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function activeProvider(): Provider {
  return process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "rehearsal";
}

function cite(chunk: Chunk, lessonTitle: string, filename: string): Citation {
  return { lessonTitle, locator: chunk.locator, filename };
}

export async function answerQuestion(opts: {
  question: string;
  lessonTitle: string;
  chunks: Chunk[];
  filenames: Map<string, string>;
}): Promise<Answer> {
  const { question, lessonTitle, chunks, filenames } = opts;
  const provider = activeProvider();

  if (chunks.length === 0) {
    return {
      text: NOT_IN_MATERIALS,
      citations: [],
      found: false,
      provider,
    };
  }

  const nameOf = (chunk: Chunk) => filenames.get(chunk.file_id) ?? "";

  return provider === "anthropic"
    ? askClaude({ question, lessonTitle, chunks, nameOf })
    : rehearse({ question, lessonTitle, chunks, nameOf });
}

/* ------------------------------- real call ------------------------------ */

async function askClaude({
  question,
  lessonTitle,
  chunks,
  nameOf,
}: {
  question: string;
  lessonTitle: string;
  chunks: Chunk[];
  nameOf: (c: Chunk) => string;
}): Promise<Answer> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    // This is grounded extraction, not reasoning — thinking would add latency
    // a student waiting on a chat reply would feel, for no accuracy gain.
    thinking: { type: "disabled" },
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: ANSWER_SCHEMA },
    },
    messages: [
      { role: "user", content: buildUserMessage(lessonTitle, chunks, question) },
    ],
  });

  if (response.stop_reason === "refusal") {
    return {
      text: NOT_IN_MATERIALS,
      citations: [],
      found: false,
      provider: "anthropic",
    };
  }

  // A truncated response would be unparseable JSON; 1024 tokens is far more
  // than a two-sentence answer needs, so this means something else went wrong.
  if (response.stop_reason === "max_tokens") {
    throw new Error("Answer was cut off before it finished.");
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as {
    answer: string;
    found: boolean;
    sources: number[];
  };

  // Map cited indices back to real chunks; anything out of range is dropped,
  // so a hallucinated citation can never reach the student.
  const citations = parsed.found
    ? Array.from(new Set(parsed.sources))
        .map((n) => chunks[n - 1])
        .filter((c): c is Chunk => Boolean(c))
        .map((c) => cite(c, lessonTitle, nameOf(c)))
    : [];

  return {
    text: parsed.answer.trim(),
    citations,
    found: parsed.found && citations.length > 0,
    provider: "anthropic",
  };
}

/* ------------------------------- rehearsal ------------------------------ */

/** Below this share of question terms, we treat the lesson as not covering it. */
const MATCH_THRESHOLD = 0.34;

function rehearse({
  question,
  lessonTitle,
  chunks,
  nameOf,
}: {
  question: string;
  lessonTitle: string;
  chunks: Chunk[];
  nameOf: (c: Chunk) => string;
}): Answer {
  const questionTerms = terms(question);
  const scored = chunks
    .map((chunk) => ({ chunk, score: overlap(questionTerms, chunk.content) }))
    .sort((a, b) => b.score - a.score)
    .filter(({ score }) => score >= MATCH_THRESHOLD);

  // Only keep runners-up that are nearly as good as the best match. Without
  // this a passage sharing one incidental word rides along and puts a wrong
  // note in the margin — the one thing this product must not do.
  const best = scored[0]?.score ?? 0;
  const ranked = scored
    .filter(({ score }) => score >= best * 0.8)
    .slice(0, 2);

  if (ranked.length === 0) {
    return {
      text: NOT_IN_MATERIALS,
      citations: [],
      found: false,
      provider: "rehearsal",
    };
  }

  // Quote the material rather than paraphrase it — an extract is honest about
  // what this mode is, where invented prose would not be.
  const text = ranked
    .map(({ chunk }) => chunk.content.replace(/\n+/g, " ").trim())
    .join("\n\n");

  return {
    text,
    citations: ranked.map(({ chunk }) => cite(chunk, lessonTitle, nameOf(chunk))),
    found: true,
    provider: "rehearsal",
  };
}
