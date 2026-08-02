/**
 * Deciding whether a question is the bot's to answer at all.
 *
 * Two things do this, and they are deliberately different in kind:
 *
 *  1. This file — a deterministic pass over the student's wording, run before
 *     any model call. It catches the cases where the student isn't asking
 *     about the material at all, they're asking a person for a decision.
 *  2. The model's own `needs_human` field (lib/prompt.ts), for the subtler
 *     cases wording alone can't settle.
 *
 * Why both: the app runs without an API key in rehearsal mode, and "can I get
 * an extension" has to be declined there too. A refusal that only works when
 * the bill is being paid isn't a safety property.
 *
 * The line these patterns draw is grammatical, not topical, and that is what
 * keeps them precise. "Can I get an extension?" is a request for permission
 * addressed to a teacher. "When is this due?" is a question about the
 * material. Both mention deadlines; only one is the bot's to answer. So the
 * rules look for first-person requests and dispute language, never for
 * subject-matter keywords on their own.
 */

import { NOT_IN_MATERIALS } from "@/lib/prompt";

export type HumanReason =
  | "extension"
  | "grade"
  | "personal"
  | "subjective"
  | "not-covered"
  /**
   * The one reason this file's rules never produce — it comes from the grade
   * explanation route when there are no rubric marks to restate yet. It lives
   * here so the teacher's log has one table of labels rather than two.
   */
  | "not-graded";

export interface Triage {
  needsHuman: boolean;
  reason: HumanReason | null;
}

/** First person, and asking — "can I", "could we", "I need", "I want". */
const ASKING = String.raw`\b(can|could|may|might|would)\s+(i|we|you)\b|\bi\s+(need|want|would\s+like)\b|\bis\s+it\s+(ok|okay|possible|alright)\b|\bany\s+(chance|way)\b`;

interface Rule {
  reason: HumanReason;
  /** All of these must match. */
  all: RegExp[];
  /** If any of these match, the rule doesn't fire. */
  unless?: RegExp[];
}

const RULES: Rule[] = [
  /* ------------------------------ extensions ----------------------------- */
  {
    reason: "extension",
    all: [
      /\bextensions?\b|\b(more|extra)\s+time\b|\bpush(ed)?\s+back\b|\blate\s+(submission|turn[-\s]?in)\b/i,
      new RegExp(ASKING, "i"),
    ],
    // A .pdf extension is not a deadline. No \b before the dot — there is no
    // word boundary between a space and ".", so "\b\.docx" never matches.
    unless: [/\bfile\s+extensions?\b|\.\w+\s+extensions?\b/i],
  },
  {
    reason: "extension",
    all: [
      /\bturn\s+(it|this|mine|them)\s+in\s+(late|after|tomorrow|monday|tuesday|wednesday|thursday|friday)\b|\bsubmit\s+(it|this)\s+late\b|\bhand\s+(it|this)\s+in\s+late\b/i,
    ],
  },
  {
    reason: "extension",
    all: [/\b(deadline|due\s+date)\b/i, /\bmove|extend|change|push\b/i, new RegExp(ASKING, "i")],
  },

  /* -------------------------------- grades ------------------------------- */
  {
    reason: "grade",
    all: [/\bre-?grade|re-?mark\b|\bgrade\s+dispute\b|\bcontest\b/i],
  },
  {
    reason: "grade",
    all: [
      /\b(my|this)\s+(grade|score|mark|points?)\b/i,
      /\bwrong|unfair|mistake|error|incorrect|too\s+low|lower\s+than|changed?\b/i,
    ],
  },
  {
    reason: "grade",
    all: [
      /\b(grade|score|mark|points?)\b/i,
      /\b(change|raise|bump|round\s+up|fix|review|recheck|look\s+at)\b/i,
      new RegExp(ASKING, "i"),
    ],
    // "How is this graded?" and "how many points is it worth" are rubric
    // facts — answerable from approved content, and not a dispute.
    unless: [/\bhow\s+(is|are|many|much)\b|\bwhat('s| is)\s+(it|this)\s+worth\b/i],
  },
  {
    reason: "grade",
    all: [/\bwhy\s+did\s+i\s+(only\s+)?(get|receive|lose)\b|\bi\s+(deserve|should\s+have\s+(got|gotten|received))\b/i],
  },

  /* ------------------------------- personal ------------------------------ */
  {
    reason: "personal",
    all: [
      /\bi\s+(was|am|will\s+be|have\s+been)\s+(absent|sick|ill|out|away|gone)\b|\bi\s+missed\b|\bfamily\s+emergency\b|\bin\s+the\s+hospital\b/i,
    ],
  },
  {
    reason: "personal",
    all: [
      // The adverbs are optional but common — "I'm really struggling" is how
      // this is actually said, and the bare form alone misses most of them.
      /\bi('m|\s+am)\s+(?:\w+\s+){0,2}(struggling|stressed|overwhelmed|anxious|worried|panicking|behind|lost)\b|\bi\s+can'?t\s+(cope|keep\s+up|handle)\b/i,
    ],
  },
  {
    reason: "personal",
    all: [/\b(my|our)\s+(mom|mother|dad|father|parents?|family|guardian)\b/i],
  },
  {
    reason: "personal",
    all: [/\bbe\s+excused\b|\bskip\s+(this|the)\b|\bmiss\s+(class|the\s+test|the\s+quiz)\b/i, new RegExp(ASKING, "i")],
  },

  /* ------------------------------ subjective ----------------------------- */
  {
    reason: "subjective",
    all: [/\b(do\s+you\s+think|in\s+your\s+opinion|what\s+do\s+you\s+think|would\s+you\s+say)\b/i],
  },
  {
    reason: "subjective",
    all: [
      /\b(is|does)\s+(my|this)\b/i,
      /\bgood\s+enough|okay|ok\b|\ball?\s?right\b|\bpass|fail|enough\b/i,
    ],
    // "Is this due Friday" and "is this correct spelling" aren't judgment
    // calls about the student's own work.
    unless: [/\bdue\b|\bdate\b|\bformat\b|\brequired\b/i],
  },
  {
    reason: "subjective",
    all: [
      /\b(can|could|will)\s+you\s+(check|review|read|look\s+at|proofread|grade|mark|edit)\b/i,
      /\bmy\b/i,
    ],
  },
  {
    reason: "subjective",
    all: [/\bwill\s+i\s+(pass|fail|get\s+an?\s+[a-f]\b)/i],
  },
];

export function triageQuestion(question: string): Triage {
  for (const rule of RULES) {
    if (rule.unless?.some((pattern) => pattern.test(question))) continue;
    if (rule.all.every((pattern) => pattern.test(question))) {
      return { needsHuman: true, reason: rule.reason };
    }
  }

  return { needsHuman: false, reason: null };
}

/* ------------------------------- what we say ----------------------------- */

/**
 * Written to sound like a person handing the question back, not a system
 * refusing it (DESIGN_GUIDE copy voice). Each one says plainly that it isn't
 * the bot's call and who to take it to — no hedging, no apology, no offer to
 * "help with something else".
 */
export const REDIRECTS: Record<HumanReason, string> = {
  extension:
    "That's your teacher's decision, not mine — I'd only be guessing. Message them directly and ask.",
  grade:
    "I can't help with anything about your grade. Take that straight to your teacher — they're the one who can actually look at it.",
  personal:
    "This one needs your teacher, not me. Send them a message and tell them what you've told me.",
  subjective:
    "I can only tell you what's in the lesson materials, so I'm not the one to judge this. Ask your teacher what they think.",
  // One wording for this, shared with the prompt the model is held to.
  "not-covered": NOT_IN_MATERIALS,
  // Set by the grade route, which supplies its own more specific wording —
  // see NOT_GRADED_MESSAGES in lib/canvas/rubric.ts.
  "not-graded":
    "Your teacher hasn't graded this yet, so there's nothing for me to explain.",
};

/** How the teacher's question log labels it. */
export const REASON_LABELS: Record<HumanReason, string> = {
  extension: "Extension request",
  grade: "About a grade",
  personal: "Personal — needs a reply",
  subjective: "Wants an opinion",
  "not-covered": "Not in the materials",
  "not-graded": "Waiting on grading",
};
