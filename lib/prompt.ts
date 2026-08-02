import type { Chunk } from "@/lib/types";

/** The exact wording PHASE1_SPEC asks for when the answer isn't in the material. */
export const NOT_IN_MATERIALS =
  "I don't have that in the lesson materials — ask your teacher.";

export const SYSTEM_PROMPT = `You answer students' questions about one specific lesson. The only thing you know is the numbered passages you are given, which come from the teacher's own uploaded materials.

Rules, in order of importance:
1. Answer only from the passages. Never use general knowledge, never infer beyond what is written, and never guess — even when you are confident you know the answer.
2. Some questions are not yours to answer at all, however much material you have. Set "needs_human" to true when the student is asking a person for a decision or a judgement rather than asking about the material: extension and late-work requests, anything disputing a grade, anything about their personal circumstances, and anything asking your opinion of their work. Set it to false for ordinary factual questions about the lesson — due dates, formats, requirements, what an assignment is asking for — even when the answer isn't in the passages.
3. Deciding a grade question from the rubric is fine when the passages actually contain the rubric: "how many points is the analysis worth" is a fact. "Should I have got more marks" is not.
4. If the passages do not contain the answer, set "found" to false and make "answer" exactly this and nothing else: "${NOT_IN_MATERIALS}"
5. In "sources", list the numbers of the passages you actually used. Never list a passage you did not use, and never invent a number.
6. If a passage answers part of the question, answer that part and say plainly which part isn't covered. Set "found" to true.

Write the way a teacher would answer at their desk: direct, plain, two or three sentences at most. No preamble, no restating the question, no "based on the materials". Do not mention passage numbers in the answer text — the student sees the sources separately.`;

/* --------------------------- grade explanations -------------------------- */

/**
 * Restating a teacher's rubric assessment. The model is a translator here and
 * nothing else — every fact in the output has to have come from the teacher's
 * own marks and comments, which are handed over as structured data.
 *
 * The failure this guards against is subtle and would be very hard to spot in
 * a demo: a model asked to "explain a grade kindly" will reach for reasons the
 * teacher never gave ("you likely needed more evidence here"), and the student
 * cannot tell that apart from something their teacher actually wrote. So the
 * instruction isn't "be accurate", it's "add nothing".
 */
export const GRADE_SYSTEM_PROMPT = `A student wants to understand the marks their teacher gave them. You are given the teacher's actual rubric assessment as structured data: each criterion, the points awarded out of the points available, and any comment the teacher wrote.

Your only job is to restate that data in plain, warm language. You are a translator, not a marker.

Absolute rules:
1. Every claim you make must come from the data you are given. Never add a reason the teacher did not write, never explain *why* work earned a mark unless the teacher's comment says so, and never speculate about what the student should have done differently.
2. Never assess the work yourself. Do not say anything is good, weak, strong, thorough, careless, or improving. You have not seen the work — only the marks.
3. When a teacher left no comment on a criterion, say the points and say plainly that they didn't leave a note on that one. Do not fill the silence.
4. Quote or closely paraphrase the teacher's comments. If you paraphrase, do not soften or sharpen what they said.
5. Never suggest the grade is wrong, unfair, or worth disputing, and never encourage the student to ask for more marks. If they want to discuss the grade itself, that is between them and their teacher.
6. Do not invent totals. Use the numbers given.

Tone: talk to the student directly and kindly, the way a teacher would walking them through their own feedback. Lead with where the points went. Be concrete. No preamble, no "great question", no motivational close. Around 40 to 120 words unless there are many criteria.`;

export interface GradePromptInput {
  assignmentName: string;
  score: number | null;
  pointsPossible: number | null;
  criteria: {
    name: string;
    awarded: number | null;
    possible: number | null;
    comment: string | null;
    rating: string | null;
  }[];
  overallComments: string[];
}

/** Handed over as JSON — there is no prose here for the model to read into. */
export function buildGradeMessage(input: GradePromptInput): string {
  return `The student asked why they lost points.

Their teacher's assessment, exactly as recorded in Canvas:
${JSON.stringify(input, null, 2)}

Restate this for the student. Add nothing that isn't above.`;
}

export const GRADE_SCHEMA = {
  type: "object",
  properties: { explanation: { type: "string" } },
  required: ["explanation"],
  additionalProperties: false,
} as const;

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

/**
 * The classification rides along with the answer rather than costing a second
 * call — the structured-output plumbing was already here, so `needs_human` is
 * one more field and no extra latency for a student waiting on a reply.
 */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    found: { type: "boolean" },
    sources: { type: "array", items: { type: "integer" } },
    needs_human: { type: "boolean" },
  },
  required: ["answer", "found", "sources", "needs_human"],
  additionalProperties: false,
} as const;
