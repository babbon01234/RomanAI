import "server-only";
import { activeProvider, type Provider } from "@/lib/answer";
import { jsonSchemaFormat, modelClient, modelName } from "@/lib/model";
import {
  GRADE_SCHEMA,
  GRADE_SYSTEM_PROMPT,
  buildGradeMessage,
} from "@/lib/prompt";
import type { CriterionResult, GradeBreakdown } from "@/lib/canvas/rubric";
import type { Citation } from "@/lib/types";

/**
 * Turning a teacher's rubric marks into something a student can read.
 *
 * Same two-implementation shape as lib/answer.ts. The rehearsal path matters
 * more here than it does there: it is a plain template over the same data, so
 * it is *incapable* of adding anything, which makes it a useful check on what
 * the model path is supposed to be doing.
 */

export interface GradeExplanation {
  text: string;
  /** One per criterion — the margin note points at the teacher's own rubric. */
  citations: Citation[];
  provider: Provider;
}

/**
 * The rubric row is the source, so it goes in the margin exactly the way a
 * slide number does. "Analysis — 17/20" is a locator: it says where in the
 * teacher's marking this came from.
 */
function cite(criterion: CriterionResult, assignmentName: string): Citation {
  const score =
    criterion.awarded !== null && criterion.possible !== null
      ? ` — ${criterion.awarded}/${criterion.possible}`
      : "";

  return {
    lessonTitle: assignmentName,
    locator: `${criterion.name}${score}`,
    filename: "Your teacher's rubric",
  };
}

export async function explainGrade(
  breakdown: GradeBreakdown,
): Promise<GradeExplanation> {
  const provider = activeProvider();
  const citations = breakdown.criteria.map((c) => cite(c, breakdown.assignmentName));

  const text =
    provider === "model"
      ? await askModel(breakdown)
      : restate(breakdown);

  return { text, citations, provider };
}

/* ------------------------------- real call ------------------------------- */

async function askModel(breakdown: GradeBreakdown): Promise<string> {
  const response = await modelClient().chat.completions.create({
    model: modelName(),
    max_completion_tokens: 1024,
    response_format: jsonSchemaFormat("grade_explanation", GRADE_SCHEMA),
    messages: [
      { role: "system", content: GRADE_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildGradeMessage({
          assignmentName: breakdown.assignmentName,
          score: breakdown.score,
          pointsPossible: breakdown.pointsPossible,
          criteria: breakdown.criteria.map((c) => ({
            name: c.name,
            awarded: c.awarded,
            possible: c.possible,
            comment: c.comment,
            rating: c.rating,
          })),
          overallComments: breakdown.overallComments,
        }),
      },
    ],
  });

  const choice = response.choices[0];

  // A refusal or a truncation both mean we have no trustworthy restatement.
  // Falling back to the template is better than showing a partial one: the
  // template can only contain the teacher's own words.
  if (choice?.message.refusal || choice?.finish_reason === "length") {
    return restate(breakdown);
  }

  const raw = choice?.message.content ?? "";
  try {
    const parsed = JSON.parse(raw) as { explanation: string };
    return parsed.explanation.trim() || restate(breakdown);
  } catch {
    return restate(breakdown);
  }
}

/* ------------------------------- rehearsal ------------------------------- */

function points(n: number): string {
  return `${n} point${n === 1 ? "" : "s"}`;
}

/**
 * A template, not a paraphrase. Runs when there's no API key, and stands in
 * whenever the model call can't be trusted. Every word about the work itself
 * is the teacher's, quoted.
 */
export function restate(breakdown: GradeBreakdown): string {
  const lines: string[] = [];

  if (breakdown.score !== null && breakdown.pointsPossible !== null) {
    lines.push(
      `You got ${breakdown.score} out of ${breakdown.pointsPossible} on ${breakdown.assignmentName}. Here's how that breaks down.`,
    );
  } else {
    lines.push(`Here's how your teacher marked ${breakdown.assignmentName}.`);
  }

  for (const criterion of breakdown.criteria) {
    const parts: string[] = [];

    if (criterion.awarded !== null && criterion.possible !== null) {
      parts.push(
        criterion.lost && criterion.lost > 0
          ? `${criterion.name}: ${criterion.awarded} out of ${criterion.possible} — ${points(criterion.lost)} off.`
          : `${criterion.name}: ${criterion.awarded} out of ${criterion.possible} — full marks.`,
      );
    } else {
      parts.push(`${criterion.name}:`);
    }

    if (criterion.rating) parts.push(`Your teacher marked this "${criterion.rating}".`);

    parts.push(
      criterion.comment
        ? `They wrote: “${criterion.comment}”`
        : "They didn't leave a note on this one.",
    );

    lines.push(parts.join(" "));
  }

  for (const comment of breakdown.overallComments) {
    lines.push(`On the whole submission, they wrote: “${comment}”`);
  }

  lines.push(
    "That's everything your teacher recorded. If any of it doesn't make sense, ask them — they can explain more than I can.",
  );

  return lines.join("\n\n");
}
