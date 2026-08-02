import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "office-hours-review-"));
process.env.OFFICE_HOURS_DB = path.join(TMP, "test.db");

const { flagContent } = await import("@/lib/review/flags");
const q = await import("@/lib/db/queries");
const { selectChunks } = await import("@/lib/retrieval/chunks");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const codes = (text: string) => flagContent(text).map((f) => f.code);

/* ------------------------------ answer keys ------------------------------ */

test("answer-key wording is flagged however it's phrased", () => {
  for (const text of [
    "Answer Key — Unit 3 Quiz. Do not distribute to students before Friday.",
    "Answer: photosynthesis converts light energy into chemical energy.",
    "Correct response: the mitochondrion is the site of cellular respiration.",
    "Key: chloroplasts contain the pigment chlorophyll, which absorbs light.",
    "Solution — first balance the equation, then solve for the unknown value.",
    "ANS: 42 grams of glucose are produced during the reaction described.",
  ]) {
    assert.ok(
      codes(text).includes("answer-key"),
      `should have flagged: ${text.slice(0, 50)}`,
    );
  }
});

test("a run of numbered letter answers is caught without any keyword", () => {
  // No word in here says "answer" — but no teacher would want it answerable.
  const flags = codes("1. B\n2. D\n3. A\n4. C\n5. B");
  assert.ok(flags.includes("answer-key"));
});

test("ordinary lesson prose isn't mistaken for a key", () => {
  for (const text of [
    "Photosynthesis happens in the chloroplast. The light reactions come first, then the Calvin cycle fixes carbon.",
    "Answering questions in full sentences is expected on this assignment.",
    "In this unit we will cover the key ideas behind cellular respiration.",
  ]) {
    assert.deepEqual(codes(text), [], `should not have flagged: ${text.slice(0, 50)}`);
  }
});

/* -------------------------------- rubrics -------------------------------- */

test("a point breakdown is flagged but a single point value is not", () => {
  assert.ok(
    codes("Data table: 10 points. Analysis: 20 points. Conclusion: 10 points.").includes(
      "rubric",
    ),
  );
  assert.ok(codes("Grading breakdown for the final lab report").includes("rubric"));

  // This one matters: every Canvas assignment lesson carries exactly this
  // line. Flagging it would put a flag on every synced assignment and make
  // "approve all unflagged" useless.
  assert.deepEqual(
    codes("Assignment: Lab report 2\nDue: Friday\nPoints possible: 40"),
    [],
  );
});

/* ----------------------------- private notes ----------------------------- */

test("a student named next to a private note is flagged", () => {
  assert.ok(
    codes("Marcus gets extended time on assessments per his accommodations.").includes(
      "private-note",
    ),
  );
  assert.ok(
    codes("Note: Priya is on a 504 plan; seat her near the front.").includes(
      "private-note",
    ),
  );
  // Strong enough to flag with no name attached at all.
  assert.ok(
    codes("Confidential — do not share this page with the class.").includes(
      "private-note",
    ),
  );
});

test("the same vocabulary in ordinary teaching text doesn't fire", () => {
  // "Reading" and "Friday" are capitalised but nobody's name; without the
  // stopword list these read as students.
  assert.deepEqual(
    codes("Reading level is one thing we discuss as a class on Friday."),
    [],
  );
});

/* ------------------------- the gate, end to end -------------------------- */

function seed(title: string, chunks: { locator: string; content: string }[]) {
  const lessonId = q.createLesson(title, "");
  const fileId = q.createFile(lessonId, "handout.pdf", "pdf");
  q.insertChunks(lessonId, fileId, chunks);
  q.setFileStatus(fileId, "ready", { chunkCount: chunks.length });
  return lessonId;
}

const LESSON = [
  { locator: "Page 1", content: "The Calvin cycle fixes carbon in the stroma of the chloroplast." },
  { locator: "Page 2", content: "Light reactions take place in the thylakoid membrane." },
  { locator: "Page 3", content: "Answer Key: 1. thylakoid  2. stroma  3. chlorophyll" },
];

test("everything arrives pending — nothing is answerable on upload", () => {
  const lessonId = seed("Unit 3", LESSON);

  const all = q.listChunksForReview(lessonId);
  assert.equal(all.length, 3);
  assert.ok(
    all.every((c) => c.approval_status === "pending"),
    "a freshly uploaded chunk must never be approved",
  );

  assert.equal(q.getApprovedChunks(lessonId).length, 0);
  // The real assertion: retrieval, not just the query underneath it.
  assert.equal(selectChunks(lessonId, "What is the Calvin cycle?").chunks.length, 0);
});

test("the answer key in that upload is the passage that got flagged", () => {
  const lessonId = seed("Unit 3 again", LESSON);
  const flagged = q
    .listChunksForReview(lessonId)
    .filter((c) => c.flags !== "[]");

  assert.deepEqual(flagged.map((c) => c.locator), ["Page 3"]);
});

test("approving opens exactly one passage, and rejecting keeps one shut", () => {
  const lessonId = seed("Unit 3 third", LESSON);
  const [first, , key] = q.listChunksForReview(lessonId);

  q.setChunkApproval(first.id, "approved");
  q.setChunkApproval(key.id, "rejected");

  const approved = q.getApprovedChunks(lessonId);
  assert.deepEqual(approved.map((c) => c.locator), ["Page 1"]);

  // A question that matches the rejected passage's wording must still not
  // reach it — this is the (c) case in the Phase 3 definition of done.
  const retrieved = selectChunks(lessonId, "thylakoid stroma chlorophyll answer");
  assert.deepEqual(retrieved.chunks.map((c) => c.locator), ["Page 1"]);
  assert.ok(
    retrieved.chunks.every((c) => !c.content.includes("Answer Key")),
    "rejected content must never enter the candidate set",
  );
});

test("bulk approval clears the unflagged and leaves the flagged alone", () => {
  const lessonId = seed("Unit 4", LESSON);

  const approved = q.approveUnflagged(lessonId);
  assert.equal(approved, 2);

  const after = q.listChunksForReview(lessonId);
  const key = after.find((c) => c.locator === "Page 3")!;
  assert.equal(key.approval_status, "pending", "a flagged passage needs a person");
  assert.equal(q.getApprovedChunks(lessonId).length, 2);
});

test("bulk approval doesn't overturn a decision the teacher already made", () => {
  const lessonId = seed("Unit 5", LESSON);
  const [first] = q.listChunksForReview(lessonId);

  q.setChunkApproval(first.id, "rejected");
  const approved = q.approveUnflagged(lessonId);

  assert.equal(approved, 1, "only the still-pending unflagged passage");
  assert.equal(
    q.listChunksForReview(lessonId).find((c) => c.id === first.id)!.approval_status,
    "rejected",
  );
});

/* ----------------------------- the upgrade path -------------------------- */

test("a pre-Phase-3 database comes back with its content pending and flagged", () => {
  // The database this app has been running on since Phase 1 has chunks with
  // no approval column and no flags. Both gaps have to close on first open:
  // unflagged-by-omission would let "approve all unflagged" push an existing
  // answer key straight to students.
  const legacy = path.join(TMP, "legacy.db");
  const Database = createRequire(import.meta.url)("better-sqlite3");

  const old = new Database(legacy);
  old.exec(`
    CREATE TABLE lessons (id TEXT PRIMARY KEY, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE files (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, filename TEXT NOT NULL,
      kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'processing', error TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE chunks (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, file_id TEXT NOT NULL,
      locator TEXT NOT NULL, ordinal INTEGER NOT NULL, content TEXT NOT NULL);
    INSERT INTO lessons (id, title) VALUES ('l1', 'Old lesson');
    INSERT INTO files (id, lesson_id, filename, kind, status, chunk_count)
      VALUES ('f1', 'l1', 'old.pdf', 'pdf', 'ready', 2);
    INSERT INTO chunks (id, lesson_id, file_id, locator, ordinal, content) VALUES
      ('c1', 'l1', 'f1', 'Page 1', 0, 'The light reactions happen in the thylakoid membrane.'),
      ('c2', 'l1', 'f1', 'Page 2', 1, 'Answer Key: 1. thylakoid 2. stroma 3. chlorophyll');
  `);
  old.close();

  // A subprocess, because the connection is a module-level singleton bound to
  // whichever database was named when this file first imported it.
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "-e",
      `import { listLessons, listChunksForReview } from "@/lib/db/queries";
       const [lesson] = listLessons();
       console.log(JSON.stringify({
         pending: lesson.pending_count,
         approved: lesson.approved_count,
         flagged: lesson.flagged_count,
         flaggedLocators: listChunksForReview(lesson.id)
           .filter((c) => c.flags !== "[]")
           .map((c) => c.locator),
       }));`,
    ],
    { env: { ...process.env, OFFICE_HOURS_DB: legacy }, encoding: "utf8" },
  );

  const result = JSON.parse(output.trim().split("\n").at(-1)!);

  assert.equal(result.approved, 0, "existing content is not grandfathered in");
  assert.equal(result.pending, 2);
  assert.equal(result.flagged, 1, "the old answer key must be flagged too");
  assert.deepEqual(result.flaggedLocators, ["Page 2"]);
});

test("a lesson's counts drive what the student side is allowed to show", () => {
  const lessonId = seed("Unit 6", LESSON);

  let lesson = q.getLesson(lessonId)!;
  assert.equal(lesson.chunk_count, 3);
  assert.equal(lesson.approved_count, 0, "no lesson is askable before review");
  assert.equal(lesson.pending_count, 3);
  assert.equal(lesson.flagged_count, 1);

  q.approveUnflagged(lessonId);
  lesson = q.getLesson(lessonId)!;

  assert.equal(lesson.approved_count, 2);
  assert.equal(lesson.pending_count, 1);
  // File and chunk counts must survive the switch to correlated subqueries;
  // joining files and chunks in one GROUP BY multiplies both.
  assert.equal(lesson.file_count, 1);
  assert.equal(lesson.chunk_count, 3);
  assert.equal(lesson.status, "ready");
});
