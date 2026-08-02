import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFaq } from "@/lib/retrieval/faq-match";
import type { Faq } from "@/lib/types";

const faq = (id: string, question: string): Faq => ({
  id,
  lesson_id: "l",
  question,
  answer: `answer:${id}`,
  created_at: "",
});

const faqs = [
  faq("due", "When is the lab report due?"),
  faq("goggles", "Do I need goggles in the lab?"),
  faq("late", "What happens if I submit the lab report late?"),
];

test("matches rewordings of a saved question", () => {
  for (const asked of [
    "When is the lab report due?",
    "when is the lab report due",
    "The lab report — when is it due?",
  ]) {
    assert.equal(matchFaq(asked, faqs)?.id, "due", asked);
  }

  assert.equal(matchFaq("do i need goggles in the lab", faqs)?.id, "goggles");
  assert.equal(
    matchFaq("What happens if the lab report is late?", faqs)?.id,
    "late",
  );
});

test("does not answer a different question about the same thing", () => {
  // The regression this file exists for. These share most of their words with
  // the due-date FAQ; the word they differ on is the entire question.
  for (const asked of [
    "Is the lab report graded?",
    "What is the lab report worth?",
    "How long should the lab report be?",
  ]) {
    assert.equal(matchFaq(asked, faqs), null, asked);
  }
});

test("returns nothing for unrelated questions", () => {
  for (const asked of [
    "Do I need a calculator?",
    "When is the exam?",
    "What is photosynthesis?",
  ]) {
    assert.equal(matchFaq(asked, faqs), null, asked);
  }
});

test("a short saved question cannot swallow everything sharing its subject", () => {
  // Scoring only one direction would let this match any question about a lab.
  const terse = [faq("terse", "Lab report?")];
  assert.equal(matchFaq("When is the lab report due?", terse), null);
});

test("handles empty and stopword-only input", () => {
  assert.equal(matchFaq("", faqs), null);
  assert.equal(matchFaq("is it?", faqs), null);
});
