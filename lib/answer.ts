import "server-only";
import { isModelConfigured, jsonSchemaFormat, modelClient, modelName } from "@/lib/model";
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
 * "model" is the real grounded call. "rehearsal" runs when no API key is
 * set: retrieval, citations, and the not-in-materials path are all genuine —
 * only the answer prose is extracted rather than written. It exists so the
 * whole loop is buildable and demoable without spending anything, and the UI
 * labels it so nobody mistakes it for the model.
 */

export type Provider = "model" | "rehearsal";

export interface Answer {
  text: string;
  citations: Citation[];
  /** false when the material doesn't cover the question. */
  found: boolean;
  /**
   * The model's own read on whether this is its question to answer — set even
   * when the material would have covered it. The route decides what to do
   * with it; see lib/triage.ts for the pass that runs before this one.
   */
  needsHuman: boolean;
  provider: Provider;
}

export function activeProvider(): Provider {
  return isModelConfigured() ? "model" : "rehearsal";
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
      needsHuman: false,
      provider,
    };
  }

  const nameOf = (chunk: Chunk) => filenames.get(chunk.file_id) ?? "";

  return provider === "model"
    ? askModel({ question, lessonTitle, chunks, nameOf })
    : rehearse({ question, lessonTitle, chunks, nameOf });
}

/* ------------------------------- real call ------------------------------ */

async function askModel({
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
  const response = await modelClient().chat.completions.create({
    model: modelName(),
    max_completion_tokens: 1024,
    response_format: jsonSchemaFormat("answer", ANSWER_SCHEMA),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(lessonTitle, chunks, question) },
    ],
  });

  const choice = response.choices[0];

  // A refusal is the model declining to answer at all. Treating it as
  // "not in the materials" is the honest reading: we have no grounded answer,
  // and inventing a different message would imply we know why.
  if (choice?.message.refusal) {
    return {
      text: NOT_IN_MATERIALS,
      citations: [],
      found: false,
      needsHuman: false,
      provider: "model",
    };
  }

  // A truncated response would be unparseable JSON; 1024 tokens is far more
  // than a two-sentence answer needs, so this means something else went wrong.
  if (choice?.finish_reason === "length") {
    throw new Error("Answer was cut off before it finished.");
  }

  const text = choice?.message.content ?? "";
  const parsed = JSON.parse(text) as {
    answer: string;
    found: boolean;
    sources: number[];
    needs_human: boolean;
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
    needsHuman: Boolean(parsed.needs_human),
    provider: "model",
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
      // Rehearsal extracts rather than reasons, so it has no opinion here.
      // The deterministic pass in lib/triage.ts is what covers this mode.
      needsHuman: false,
      provider: "rehearsal",
    };
  }

  // Quote the material rather than paraphrase it — an extract is honest about
  // what this mode is, where invented prose would not be. Line breaks survive
  // so a slide's heading stays a heading instead of running into the sentence.
  const text = ranked.map(({ chunk }) => chunk.content.trim()).join("\n\n");

  return {
    text,
    citations: ranked.map(({ chunk }) => cite(chunk, lessonTitle, nameOf(chunk))),
    found: true,
    needsHuman: false,
    provider: "rehearsal",
  };
}
