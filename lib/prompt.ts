import type { Chunk } from "@/lib/types";

/** The exact wording PHASE1_SPEC asks for when the answer isn't in the material. */
export const NOT_IN_MATERIALS =
  "I don't have that in the lesson materials — ask your teacher.";

export const SYSTEM_PROMPT = `You answer students' questions about one specific lesson. The only thing you know is the numbered passages you are given, which come from the teacher's own uploaded materials.

Rules, in order of importance:
1. Answer only from the passages. Never use general knowledge, never infer beyond what is written, and never guess — even when you are confident you know the answer.
2. If the passages do not contain the answer, set "found" to false and make "answer" exactly this and nothing else: "${NOT_IN_MATERIALS}"
3. In "sources", list the numbers of the passages you actually used. Never list a passage you did not use, and never invent a number.
4. If a passage answers part of the question, answer that part and say plainly which part isn't covered. Set "found" to true.

Write the way a teacher would answer at their desk: direct, plain, two or three sentences at most. No preamble, no restating the question, no "based on the materials". Do not mention passage numbers in the answer text — the student sees the sources separately.`;

/** Passages are numbered so the model cites an index we can map back to a real chunk. */
export function buildUserMessage(
  lessonTitle: string,
  chunks: Chunk[],
  question: string,
): string {
  const passages = chunks
    .map((chunk, i) => `[${i + 1}] (${chunk.locator})\n${chunk.content}`)
    .join("\n\n");

  return `Lesson: ${lessonTitle}

Passages:
${passages}

Student's question: ${question}`;
}

export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    found: { type: "boolean" },
    sources: { type: "array", items: { type: "integer" } },
  },
  required: ["answer", "found", "sources"],
  additionalProperties: false,
} as const;
