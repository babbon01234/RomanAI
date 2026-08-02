/**
 * Triage heuristics for the content review queue.
 *
 * These exist to sort a teacher's queue, not to make decisions. Every chunk is
 * pending until a human approves it whether it is flagged or not, so a miss
 * here is a queue that's slower to work through — never content that leaks.
 * That asymmetry is why these lean toward catching things.
 *
 * The one thing they must not do is cry wolf on ordinary material: a queue
 * where everything is flagged is a queue where "approve all unflagged" saves
 * nobody any time, and a teacher stops reading the flags. Where a pattern
 * appears in normal lesson text too — point values are the obvious one — it
 * takes more than one occurrence to count.
 */

export type FlagCode = "answer-key" | "rubric" | "private-note";

export interface Flag {
  code: FlagCode;
  /** Shown on the review card. */
  label: string;
  /** Why this fired — the matched text, so the teacher can judge at a glance. */
  excerpt: string;
}

export const FLAG_LABELS: Record<FlagCode, string> = {
  "answer-key": "Looks like an answer key",
  rubric: "Looks like a rubric or point breakdown",
  "private-note": "May name a student in a private note",
};

/* ------------------------------- answer keys ----------------------------- */

const ANSWER_KEY_PATTERNS: RegExp[] = [
  /\banswer\s*key\b/i,
  /\bmarking\s+scheme\b/i,
  /\bsolution\s*set\b/i,
  // "Answer:", "Key:", "Solution -", at the start of a line.
  /^[^\S\n]*(answers?|key|solutions?)[^\S\n]*[:\-–—][^\S\n]*\S/im,
  /\bcorrect\s+(answer|response|choice|option)\b[^\S\n]*[:\-–—=]/i,
  /\b(ans|soln)[^\S\n]*[:=][^\S\n]*\S/i,
];

/**
 * A run of numbered single-letter answers — "1. B  2. D  3. A" — which no
 * amount of keyword matching catches but is unmistakable to a reader.
 */
function looksLikeAnswerList(content: string): string | null {
  const matches = [
    ...content.matchAll(/^[^\S\n]*\(?(\d{1,2})[.)][^\S\n]*([A-Ea-e]|true|false)[^\S\n]*$/gim),
  ];

  if (matches.length < 3) return null;

  // Consecutive numbering is what separates a key from a coincidence.
  const numbers = matches.map((m) => Number(m[1]));
  const ascending = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);

  return ascending ? matches.slice(0, 3).map((m) => m[0].trim()).join("  ") : null;
}

/* ---------------------------------- rubrics ------------------------------ */

const POINT_VALUE = /\b\d{1,3}(?:\.\d)?[^\S\n]*(points?|pts?\.?|marks?)\b/gi;
const RUBRIC_WORDS = /\b(rubric|grading\s+(scale|breakdown|criteria)|point\s+breakdown|weighting)\b/i;
const OUT_OF = /\b\d{1,3}[^\S\n]*\/[^\S\n]*\d{1,3}[^\S\n]*(points?|pts?\.?|marks?)\b/i;

/* ------------------------------ private notes ---------------------------- */

const SENSITIVE = new RegExp(
  "\\b(" +
    [
      "iep",
      "504\\s*plan",
      "accommodations?",
      "modified\\s+(assignment|assessment)",
      "extended\\s+time",
      "extra\\s+time\\s+on",
      "resource\\s+room",
      "pull[-\\s]?out",
      "behaviou?r\\s+(plan|contract|note|issue|concern)",
      "counsel(or|ling|ing)",
      "adhd",
      "dyslexi(a|c)",
      "autis(m|tic)",
      "medication",
      "parent\\s+(contact|conference|meeting|call)",
      "confidential",
      "do\\s+not\\s+share",
      "reading\\s+level",
      "speech\\s+therapy",
      "struggl(es|ing)\\s+with",
      "on\\s+an?\\s+(iep|504)",
    ].join("|") +
    ")\\b",
  "i",
);

/** Strong enough on its own — no name needed for these to be worth a look. */
const ALWAYS_PRIVATE = /\b(confidential|do\s+not\s+share|iep|504\s*plan)\b/i;

/**
 * Words that are capitalized for reasons other than being someone's name.
 * Without this, "Monday" and "Reading" read as students.
 */
const NOT_A_NAME = new Set([
  "the", "this", "that", "these", "those", "a", "an", "and", "but", "or", "if",
  "when", "while", "for", "with", "without", "students", "student", "class",
  "note", "notes", "please", "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday", "january", "february", "march", "april",
  "may", "june", "july", "august", "september", "october", "november",
  "december", "unit", "lesson", "chapter", "section", "slide", "page", "answer",
  "reading", "writing", "math", "science", "history", "english", "all", "some",
  "each", "every", "his", "her", "their", "they", "he", "she", "it", "we",
  "you", "i", "no", "yes", "do", "does", "has", "have", "is", "are", "was",
  "were", "give", "given", "allow", "allowed", "needs", "need", "should",
]);

/** A capitalized word near the sensitive phrase that reads like a first name. */
function nameNear(content: string, at: number): string | null {
  const window = content.slice(Math.max(0, at - 90), at + 90);

  for (const match of window.matchAll(/\b([A-Z][a-z]{2,11})\b/g)) {
    if (!NOT_A_NAME.has(match[1].toLowerCase())) return match[1];
  }

  return null;
}

/* --------------------------------- the pass ------------------------------ */

function excerptAround(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const raw = content.slice(start, index + length + 40).replace(/\s+/g, " ").trim();

  return `${start > 0 ? "…" : ""}${raw}${index + length + 40 < content.length ? "…" : ""}`;
}

export function flagContent(content: string): Flag[] {
  const flags: Flag[] = [];
  const add = (code: FlagCode, excerpt: string) =>
    flags.push({ code, label: FLAG_LABELS[code], excerpt });

  /* answer keys */
  const keyMatch = ANSWER_KEY_PATTERNS.map((pattern) => pattern.exec(content)).find(
    Boolean,
  );

  if (keyMatch) {
    add("answer-key", excerptAround(content, keyMatch.index, keyMatch[0].length));
  } else {
    const list = looksLikeAnswerList(content);
    if (list) add("answer-key", list);
  }

  /* rubrics and point breakdowns */
  const points = [...content.matchAll(POINT_VALUE)];
  const rubricWord = RUBRIC_WORDS.exec(content);
  const outOf = OUT_OF.exec(content);

  // One point value is ordinary — "Points possible: 40" is on every Canvas
  // assignment. Two or more, or the word rubric, is a breakdown.
  if (rubricWord) {
    add("rubric", excerptAround(content, rubricWord.index, rubricWord[0].length));
  } else if (points.length >= 2) {
    add("rubric", points.slice(0, 4).map((m) => m[0].trim()).join(", "));
  } else if (outOf) {
    add("rubric", excerptAround(content, outOf.index, outOf[0].length));
  }

  /* private notes about a named student */
  const sensitive = SENSITIVE.exec(content);
  if (sensitive) {
    const name = nameNear(content, sensitive.index);
    if (name || ALWAYS_PRIVATE.test(sensitive[0])) {
      add(
        "private-note",
        excerptAround(content, sensitive.index, sensitive[0].length),
      );
    }
  }

  return flags;
}

/* -------------------------------- storage -------------------------------- */

export function serializeFlags(flags: Flag[]): string {
  return JSON.stringify(flags);
}

/** Tolerant of a malformed column — a bad row shouldn't break the queue. */
export function parseFlags(json: string): Flag[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Flag[]) : [];
  } catch {
    return [];
  }
}
