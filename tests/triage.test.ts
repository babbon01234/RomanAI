import { test } from "node:test";
import assert from "node:assert/strict";
import { REASON_LABELS, REDIRECTS, triageQuestion } from "@/lib/triage";

/**
 * The two failure modes are not equally bad, but both are real.
 *
 * A miss means the model gets the question, and its own `needs_human` field is
 * the second line of defence — degraded, not broken. A false positive means a
 * student asking a perfectly ordinary question about their homework is told to
 * go bother their teacher, which is worse than useless. So the negatives below
 * carry at least as much weight as the positives.
 */

const reason = (q: string) => triageQuestion(q).reason;

/* -------------------------------- positives ------------------------------ */

test("extension requests are handed to the teacher", () => {
  for (const q of [
    "can I get an extension on this",
    "Can I get an extension on this?",
    "could we have more time on the lab report",
    "I need an extension please",
    "is it okay if I turn this in late",
    "any chance of extra time for the essay?",
    "can you push back the deadline",
  ]) {
    assert.equal(reason(q), "extension", `missed: ${q}`);
  }
});

test("grade disputes are handed to the teacher", () => {
  for (const q of [
    "can you regrade my lab report",
    "my grade is wrong",
    "I think this score is unfair",
    "why did I only get 12 points",
    "can you bump my grade up",
    "I deserve a better mark than this",
  ]) {
    assert.equal(reason(q), "grade", `missed: ${q}`);
  }
});

test("personal circumstances are handed to the teacher", () => {
  for (const q of [
    "I was absent on Tuesday, what do I do",
    "I missed class last week",
    "my mom said she would email you",
    "I'm really struggling with this unit",
    "can I be excused from the quiz",
  ]) {
    assert.equal(reason(q), "personal", `missed: ${q}`);
  }
});

test("requests for an opinion are handed to the teacher", () => {
  for (const q of [
    "do you think this is a good topic",
    "is my introduction good enough",
    "can you check my essay",
    "will I pass if I skip the last section",
  ]) {
    assert.equal(reason(q), "subjective", `missed: ${q}`);
  }
});

/* ------------------------- negatives, which matter ----------------------- */

test("ordinary factual questions are answered, not deflected", () => {
  for (const q of [
    // The other half of the Phase 4 definition of done.
    "what format should this be in",
    "when is this due",
    "is this due Friday",
    "what is this assignment asking for",
    "how long does the essay need to be",
    "do we need to cite sources",
    "where do I submit it",
    "what should I include in the conclusion",
    "how many sources do we need",
  ]) {
    assert.deepEqual(
      triageQuestion(q),
      { needsHuman: false, reason: null },
      `wrongly deflected: ${q}`,
    );
  }
});

test("questions about grading that the rubric can answer stay answerable", () => {
  // A rubric is approved content. "How is this graded" is a fact about the
  // material; only a dispute is the teacher's call.
  for (const q of [
    "how is this graded",
    "how many points is the analysis worth",
    "what is the lab report worth",
    "how much of my grade is the final",
    "what is the grading breakdown",
  ]) {
    assert.equal(reason(q), null, `wrongly deflected: ${q}`);
  }
});

test("a file extension is not a deadline", () => {
  // "extension" plus "can I" would otherwise fire on both of these.
  assert.equal(reason("what file extension should I use"), null);
  assert.equal(reason("can I use a .docx extension instead of pdf"), null);
});

test("time questions about the material aren't extension requests", () => {
  assert.equal(reason("how much time do we get for the exam"), null);
  assert.equal(reason("how long is the presentation supposed to be"), null);
});

/* --------------------------------- copy ---------------------------------- */

test("every reason has something to say to the student and the teacher", () => {
  for (const key of [
    "extension",
    "grade",
    "personal",
    "subjective",
    "not-covered",
  ] as const) {
    assert.ok(REDIRECTS[key]?.length > 20, `${key} has no student message`);
    assert.ok(REASON_LABELS[key]?.length > 0, `${key} has no teacher label`);
  }
});

test("the redirect points at the teacher and doesn't hedge", () => {
  for (const key of ["extension", "grade", "personal", "subjective"] as const) {
    const text = REDIRECTS[key];
    assert.match(text, /teacher/i, `${key} doesn't name the teacher`);
    // A redirect that apologises reads as a malfunction rather than a
    // deliberate hand-off (DESIGN_GUIDE copy voice).
    assert.doesNotMatch(text, /sorry|apolog|unfortunately/i, `${key} hedges`);
  }
});
