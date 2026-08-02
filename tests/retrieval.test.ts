import { test } from "node:test";
import assert from "node:assert/strict";
import { overlap, terms } from "@/lib/retrieval/terms";

test("keeps content words and drops stopwords", () => {
  assert.deepEqual(terms("When is the lab report due?"), [
    "lab",
    "report",
    "due",
  ]);
  assert.deepEqual(terms("Do I need goggles in the lab?"), ["goggle", "lab"]);
});

test("is case- and punctuation-insensitive", () => {
  assert.deepEqual(terms("LAB REPORT!!"), terms("lab, report."));
});

test("returns nothing when a question is all stopwords", () => {
  assert.deepEqual(terms("do you have any of them?"), []);
  assert.equal(overlap([], "anything at all"), 0);
});

test("overlap is the share of question terms present in the text", () => {
  const asked = terms("Where do the light reactions happen?");

  assert.equal(overlap(asked, "The light reactions happen in the thylakoid"), 1);
  assert.equal(overlap(asked, "Nothing relevant whatsoever"), 0);
});

test("an incidental shared word scores far below a real match", () => {
  // The regression this file exists for: the Grading passage shares the word
  // "lab" with a goggles question, and rode along as a second citation.
  const asked = terms("Do I need goggles in the lab?");

  const real = overlap(asked, "Lab Safety Rules\nGoggles must be worn in the lab.");
  const incidental = overlap(asked, "Grading\nThe lab report is worth 20%.");

  assert.equal(real, 1);
  assert.ok(
    incidental < real * 0.8,
    `incidental ${incidental} should fall below the 80%-of-best cutoff (${real * 0.8})`,
  );
});
