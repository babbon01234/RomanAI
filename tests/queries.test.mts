import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the connection at a throwaway file before anything imports it.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "office-hours-test-"));
process.env.OFFICE_HOURS_DB = path.join(TMP, "test.db");

const q = await import("@/lib/db/queries");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let lessonId: string;
let fileId: string;

before(async () => {
  lessonId = await q.createLesson("Unit 3", "Photosynthesis");
  fileId = await q.createFile(lessonId, "deck.pptx", "pptx");
  await q.insertChunks(lessonId, fileId, [
    { locator: "Slide 1", content: "Light reactions happen in the thylakoid." },
    { locator: "Slide 2", content: "The Calvin cycle happens in the stroma." },
  ]);
  await q.setFileStatus(fileId, "ready", { chunkCount: 2 });
});

test("a lesson rolls up its files' counts and status", async () => {
  const lesson = (await q.getLesson(lessonId))!;

  assert.equal(lesson.file_count, 1);
  assert.equal(lesson.chunk_count, 2);
  assert.equal(lesson.status, "ready");
  assert.equal(lesson.error, null);
});

test("a failed file surfaces its reason on the lesson", async () => {
  const id = await q.createLesson("Broken", "");
  const bad = await q.createFile(id, "scan.pdf", "pdf");
  await q.setFileStatus(bad, "failed", { error: "Invalid PDF structure." });

  const lesson = (await q.getLesson(id))!;
  assert.equal(lesson.status, "failed");
  // Previously only visible in the database, never to the teacher.
  assert.equal(lesson.error, "Invalid PDF structure.");
});

test("a student's history comes back oldest-first and only their own", async () => {
  // This is the regression this file exists for: the first version ordered
  // through a subquery on rowid, which SELECT * doesn't carry out — it
  // typechecked, linted, and crashed the student page at runtime.
  for (const [student, question] of [
    ["Priya", "first"],
    ["Priya", "second"],
    ["Jordan", "not Priya's"],
    ["Priya", "third"],
  ] as const) {
    await q.logMessage({
      lessonId,
      studentName: student,
      question,
      answer: `answer to ${question}`,
      citations: [],
      source: "model",
    });
  }

  const priya = await q.listMessagesForStudent(lessonId, "Priya");

  assert.deepEqual(
    priya.map((m) => m.question),
    ["first", "second", "third"],
  );
  assert.ok(priya.every((m) => m.student_name === "Priya"));
});

test("history is capped at the limit, keeping the most recent", async () => {
  const id = await q.createLesson("Chatty", "");
  for (let i = 0; i < 6; i++) {
    await q.logMessage({
      lessonId: id,
      studentName: "Sam",
      question: `q${i}`,
      answer: "a",
      citations: [],
      source: "model",
    });
  }

  const recent = await q.listMessagesForStudent(id, "Sam", 3);
  assert.deepEqual(
    recent.map((m) => m.question),
    ["q3", "q4", "q5"],
  );
});

test("deleting a lesson takes its chunks, files, messages and FAQs with it", async () => {
  const id = await q.createLesson("Doomed", "");
  const doomedFile = await q.createFile(id, "x.pdf", "pdf");
  await q.insertChunks(id, doomedFile, [{ locator: "Page 1", content: "content" }]);
  await q.createFaq(id, "a question", "an answer");
  await q.logMessage({
    lessonId: id,
    studentName: "Alex",
    question: "q",
    answer: "a",
    citations: [],
    source: "model",
  });

  assert.equal((await q.listChunksForReview(id)).length, 1);

  await q.deleteLesson(id);

  assert.equal(await q.getLesson(id), undefined);
  assert.equal((await q.listChunksForReview(id)).length, 0);
  assert.equal((await q.listFiles(id)).length, 0);
  assert.equal((await q.listFaqs(id)).length, 0);
  assert.equal((await q.listMessagesForStudent(id, "Alex")).length, 0);
});

test("promoting a question links it to the new FAQ", async () => {
  const messageId = await q.logMessage({
    lessonId,
    studentName: "Marcus",
    question: "When is it due?",
    answer: "Friday.",
    citations: [],
    source: "model",
  });

  const faqId = await q.createFaq(lessonId, "When is it due?", "Friday.");
  await q.markMessagePromoted(messageId, faqId);

  assert.equal((await q.getMessage(messageId))!.promoted_faq_id, faqId);
});
