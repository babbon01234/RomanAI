import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBreakdown, lostPointsOn } from "@/lib/canvas/rubric";
import { restate } from "@/lib/grade-explanation";
import { GRADE_SYSTEM_PROMPT } from "@/lib/prompt";
import type { CanvasAssignment, CanvasSubmission } from "@/lib/canvas/types";

/**
 * The risk in this feature is not that it breaks — it's that it quietly says
 * something the teacher never said. A wrong criterion name, a points figure
 * invented from a missing field, or an explanation produced for a submission
 * that was never graded all look plausible to a student and are indefensible
 * to a teacher. So most of these check what *doesn't* come out.
 */

const ASSIGNMENT: CanvasAssignment = {
  id: 77,
  name: "Lab report 2",
  points_possible: 40,
  rubric: [
    {
      id: "_1001",
      description: "Data table",
      long_description: "A complete, labelled table of results.",
      points: 10,
      ratings: [
        { id: "r1", description: "Complete", points: 10 },
        { id: "r2", description: "Partial", points: 7 },
      ],
    },
    { id: "_1002", description: "Analysis", points: 20 },
    { id: "_1003", description: "Presentation", points: 10 },
  ],
};

const GRADED: CanvasSubmission = {
  workflow_state: "graded",
  score: 33,
  graded_at: "2026-02-16T10:04:00Z",
  rubric_assessment: {
    _1001: { points: 7, comments: "Units are missing from the second column.", rating_id: "r2" },
    _1002: { points: 16, comments: "Good use of the data, but no link back to the hypothesis." },
    _1003: { points: 10, comments: null },
  },
  submission_comments: [{ comment: "Nice improvement on last time." }],
};

function breakdownOf(
  assignment: CanvasAssignment = ASSIGNMENT,
  submission: CanvasSubmission = GRADED,
) {
  const result = buildBreakdown(assignment, submission);
  assert.ok("breakdown" in result, "expected a breakdown");
  return result.breakdown;
}

/* ------------------------------- the join -------------------------------- */

test("criterion names come from the assignment, marks from the submission", () => {
  // Neither object has both halves: this is the whole reason two calls are
  // made. An assessment alone is points keyed by "_1001".
  const breakdown = breakdownOf();

  assert.deepEqual(
    breakdown.criteria.map((c) => [c.name, c.awarded, c.possible, c.lost]),
    [
      ["Data table", 7, 10, 3],
      ["Analysis", 16, 20, 4],
      ["Presentation", 10, 10, 0],
    ],
  );
  assert.equal(breakdown.score, 33);
  assert.equal(breakdown.pointsPossible, 40);
});

test("the teacher's comments are carried through untouched", () => {
  const breakdown = breakdownOf();

  assert.equal(
    breakdown.criteria[0].comment,
    "Units are missing from the second column.",
  );
  // A criterion with full marks and no note must not acquire one.
  assert.equal(breakdown.criteria[2].comment, null);
  assert.deepEqual(breakdown.overallComments, ["Nice improvement on last time."]);
});

test("the rating label is resolved, not the raw rating id", () => {
  assert.equal(breakdownOf().criteria[0].rating, "Partial");
  // No rating_id on this row, so nothing to show.
  assert.equal(breakdownOf().criteria[1].rating, null);
});

test("only the rows that actually lost points answer the question asked", () => {
  assert.deepEqual(
    lostPointsOn(breakdownOf()).map((c) => c.name),
    ["Data table", "Analysis"],
  );
});

/* ---------------------- nothing to restate, said so ---------------------- */

test("an ungraded submission produces no explanation at all", () => {
  for (const [label, submission] of [
    ["never submitted", { workflow_state: "unsubmitted" }],
    ["submitted, not marked", { workflow_state: "submitted", rubric_assessment: null }],
    ["graded but rubric left blank", { workflow_state: "graded", score: 33, rubric_assessment: {} }],
  ] as const) {
    const result = buildBreakdown(ASSIGNMENT, submission);
    assert.ok("notGraded" in result, `${label} should not produce a breakdown`);
  }
});

test("the three not-graded cases are told apart", () => {
  const reason = (submission: object) => {
    const r = buildBreakdown(ASSIGNMENT, submission);
    return "notGraded" in r ? r.notGraded : null;
  };

  assert.equal(reason({ workflow_state: "unsubmitted" }), "no-submission");
  assert.equal(reason({ workflow_state: "submitted" }), "not-graded");
  // Graded overall but no rubric filled in is its own situation — the student
  // has a score and would be confused to be told it isn't marked.
  assert.equal(reason({ workflow_state: "graded", score: 33 }), "no-assessment");
});

test("an assignment with no rubric says so rather than improvising", () => {
  const result = buildBreakdown({ id: 1, name: "Essay" }, GRADED);
  assert.ok("notGraded" in result && result.notGraded === "no-rubric");
});

test("a rubric row the teacher never marked is left out entirely", () => {
  // Listing it as 0 awarded would invent a judgement they didn't make.
  const breakdown = breakdownOf(ASSIGNMENT, {
    workflow_state: "graded",
    score: 7,
    rubric_assessment: { _1001: { points: 7, comments: "Units missing." } },
  });

  assert.deepEqual(breakdown.criteria.map((c) => c.name), ["Data table"]);
});

/* ------------------------------ the restating ---------------------------- */

test("the template restates the marks and quotes the teacher verbatim", () => {
  const text = restate(breakdownOf());

  assert.match(text, /33 out of 40/);
  assert.match(text, /Data table: 7 out of 10 — 3 points off/);
  assert.match(text, /Analysis: 16 out of 20 — 4 points off/);
  assert.match(text, /Presentation: 10 out of 10 — full marks/);
  assert.match(text, /“Units are missing from the second column\.”/);
  assert.match(text, /“Nice improvement on last time\.”/);
  assert.match(text, /Your teacher marked this "Partial"/);
});

test("a criterion with no comment says so instead of filling the silence", () => {
  assert.match(restate(breakdownOf()), /didn't leave a note on this one/);
});

test("the template says nothing about the quality of the work", () => {
  const text = restate(breakdownOf()).toLowerCase();

  // Every judgement word here would be the app's opinion, not the teacher's.
  // The teacher's own words are quoted, so only text outside quotes counts.
  const outsideQuotes = text.replace(/“[^”]*”/g, " ").replace(/"[^"]*"/g, " ");

  for (const word of [
    "excellent", "weak", "strong", "poor", "careless", "thorough",
    "should have", "next time", "try to", "unfortunately", "well done",
  ]) {
    assert.ok(
      !outsideQuotes.includes(word),
      `the restatement added its own judgement: "${word}"`,
    );
  }
});

test("the system prompt forbids adding judgement, in so many words", () => {
  // This is the load-bearing instruction. If it's ever softened, the model is
  // free to invent reasons a student can't tell from their teacher's.
  assert.match(GRADE_SYSTEM_PROMPT, /never add a reason the teacher did not write/i);
  assert.match(GRADE_SYSTEM_PROMPT, /never assess the work yourself/i);
  assert.match(GRADE_SYSTEM_PROMPT, /do not fill the silence/i);
  assert.match(GRADE_SYSTEM_PROMPT, /never suggest the grade is wrong/i);
});
