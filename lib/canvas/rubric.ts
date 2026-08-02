import type {
  CanvasAssignment,
  CanvasRubricCriterion,
  CanvasSubmission,
} from "./types";

/**
 * Joining a rubric's definition to a teacher's marks.
 *
 * Canvas splits these across two objects and neither is useful alone: the
 * assignment knows a criterion is called "Analysis" and is worth 20, the
 * submission knows criterion `_4821` scored 17 with a comment. This puts them
 * back together.
 *
 * Everything here is arithmetic and lookup — no judgement, no interpretation.
 * That is deliberate: the model downstream is given this structure and told to
 * restate it, so anything it says about the work has to have originated with
 * the teacher. Any "insight" invented at this layer would be laundered into
 * something that looks like the teacher's own assessment.
 */

export interface CriterionResult {
  id: string;
  /** What the teacher called this row. */
  name: string;
  /** The teacher's longer explanation of the criterion, if they wrote one. */
  description: string | null;
  awarded: number | null;
  possible: number | null;
  /** Points below full marks — null when either side is unknown. */
  lost: number | null;
  /** The teacher's comment on this row, verbatim. Never paraphrased here. */
  comment: string | null;
  /** The rating label the teacher picked, e.g. "Proficient". */
  rating: string | null;
}

export interface GradeBreakdown {
  assignmentName: string;
  score: number | null;
  pointsPossible: number | null;
  gradedAt: string | null;
  criteria: CriterionResult[];
  /** Whole-submission comments the teacher left, oldest first. */
  overallComments: string[];
}

/** Why there is nothing to explain, when there's nothing to explain. */
export type NotGradedReason =
  | "no-rubric"
  | "not-graded"
  | "no-assessment"
  | "no-submission";

export const NOT_GRADED_MESSAGES: Record<NotGradedReason, string> = {
  "no-submission":
    "There's no submission for this one yet, so there's nothing for me to look at. If you think that's wrong, check with your teacher.",
  "not-graded":
    "Your teacher hasn't graded this yet, so there's nothing for me to explain. Once they do, come back and ask again.",
  "no-rubric":
    "This assignment doesn't have a rubric in Canvas, so there's no breakdown for me to walk you through. Your teacher can tell you more.",
  "no-assessment":
    "Your teacher hasn't filled in the rubric for your submission yet, so I don't have their notes to show you. Ask them directly if you need it sooner.",
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

/** The label of the rating the teacher selected, if they used the rating scale. */
function ratingLabel(
  criterion: CanvasRubricCriterion,
  ratingId: string | null | undefined,
): string | null {
  if (!ratingId) return null;
  return text(criterion.ratings?.find((r) => r.id === ratingId)?.description);
}

export function buildBreakdown(
  assignment: CanvasAssignment,
  submission: CanvasSubmission,
): { breakdown: GradeBreakdown } | { notGraded: NotGradedReason } {
  const rubric = assignment.rubric ?? [];
  if (rubric.length === 0) return { notGraded: "no-rubric" };

  // Canvas reports an unsubmitted placeholder rather than a 404 for a student
  // who never turned anything in.
  if (submission.workflow_state === "unsubmitted" && !submission.graded_at) {
    return { notGraded: "no-submission" };
  }

  const assessment = submission.rubric_assessment;
  if (!assessment || Object.keys(assessment).length === 0) {
    // Graded overall but the rubric was left blank is a different situation
    // from not marked at all, and the student should be told which.
    return {
      notGraded: submission.workflow_state === "graded" ? "no-assessment" : "not-graded",
    };
  }

  const criteria: CriterionResult[] = rubric.map((criterion) => {
    const mark = assessment[criterion.id] ?? {};
    const awarded = num(mark.points);
    const possible = num(criterion.points);

    return {
      id: criterion.id,
      name: text(criterion.description) ?? "Unnamed criterion",
      description: text(criterion.long_description),
      awarded,
      possible,
      lost:
        awarded !== null && possible !== null
          ? Math.round((possible - awarded) * 100) / 100
          : null,
      comment: text(mark.comments),
      rating: ratingLabel(criterion, mark.rating_id),
    };
  });

  // A rubric row the teacher never marked has nothing to restate, and listing
  // it as "0 awarded" would invent a judgement they didn't make.
  const marked = criteria.filter((c) => c.awarded !== null || c.comment !== null);
  if (marked.length === 0) return { notGraded: "no-assessment" };

  return {
    breakdown: {
      assignmentName: assignment.name,
      score: num(submission.score),
      pointsPossible:
        num(assignment.points_possible) ?? num(assignment.rubric_settings?.points_possible),
      gradedAt: text(submission.graded_at),
      criteria: marked,
      overallComments: (submission.submission_comments ?? [])
        .map((c) => text(c.comment))
        .filter((c): c is string => c !== null),
    },
  };
}

/** Only the rows where points came off — what "why did I lose points" asks. */
export function lostPointsOn(breakdown: GradeBreakdown): CriterionResult[] {
  return breakdown.criteria.filter((c) => (c.lost ?? 0) > 0);
}
