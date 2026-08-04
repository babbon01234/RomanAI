import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Point the connection — and with it the upload directory — at a throwaway
// location before anything imports it.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "office-hours-canvas-"));
process.env.OFFICE_HOURS_DB = path.join(TMP, "test.db");

const { CanvasClient, nextLink } = await import("@/lib/canvas/client");
const { planCourse } = await import("@/lib/canvas/plan");
const { applyPlan } = await import("@/lib/canvas/sync");
const { parseHtml, htmlToText } = await import("@/lib/parsing/html");
const q = await import("@/lib/db/queries");
const { processPending } = await import("@/lib/processing");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const DECK = fs.readFileSync(path.join(FIXTURES, "fixture.pptx"));
const HANDOUT = fs.readFileSync(path.join(FIXTURES, "fixture.pdf"));

/* --------------------------------- client -------------------------------- */

test("pagination follows rel=next and stops at the last page", async () => {
  const seen: string[] = [];

  const fetcher = (async (url: string | URL) => {
    const href = String(url);
    seen.push(href);
    const page = new URL(href).searchParams.get("page") ?? "1";

    return new Response(JSON.stringify([{ id: Number(page) }]), {
      status: 200,
      headers:
        page === "1"
          ? {
              // Canvas advertises the next page only in the header — a body-only
              // reader silently truncates a course at its first 100 files.
              link: '<https://canvas.test/api/v1/courses/1/files?page=2>; rel="next",<https://canvas.test/api/v1/courses/1/files?page=2>; rel="last"',
            }
          : {},
    });
  }) as unknown as typeof fetch;

  const client = new CanvasClient(
    { baseUrl: "https://canvas.test", token: "secret" },
    fetcher,
  );

  const files = await client.listFiles("1");

  assert.deepEqual(files, [{ id: 1 }, { id: 2 }]);
  assert.equal(seen.length, 2);
  assert.match(seen[0], /per_page=100/);
});

test("nextLink ignores rel values other than next", () => {
  assert.equal(
    nextLink('<https://c/a?page=3>; rel="last",<https://c/a?page=1>; rel="first"'),
    null,
  );
  assert.equal(nextLink('<https://c/a?page=2>; rel="next"'), "https://c/a?page=2");
  assert.equal(nextLink(null), null);
});

test("a rejected token explains itself instead of leaking a status code", async () => {
  const fetcher = (async () =>
    new Response(JSON.stringify({ errors: [{ message: "Invalid access token." }] }), {
      status: 401,
    })) as unknown as typeof fetch;

  const client = new CanvasClient(
    { baseUrl: "https://canvas.test", token: "stale" },
    fetcher,
  );

  await assert.rejects(client.getCourse("1"), (error: Error) => {
    assert.match(error.message, /access token/i);
    assert.match(error.message, /canvas\.test/);
    return true;
  });
});

test("the access token never travels to a redirected storage host", async () => {
  const headersSeen: (HeadersInit | undefined)[] = [];

  const fetcher = (async (_url: string, init?: RequestInit) => {
    headersSeen.push(init?.headers);
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as unknown as typeof fetch;

  const client = new CanvasClient(
    { baseUrl: "https://canvas.test", token: "secret" },
    fetcher,
  );

  await client.download("https://canvas.test/files/1/download?verifier=abc");
  await client.download("https://inst-fs-iad.s3.amazonaws.com/files/1");

  assert.ok("Authorization" in (headersSeen[0] as Record<string, string>));
  assert.deepEqual(headersSeen[1], {});
});

/* ---------------------------------- html --------------------------------- */

test("Canvas rich text becomes readable prose, not tag soup", () => {
  const text = htmlToText(
    `<p>Turn in the <strong>lab report</strong> by Friday.</p>
     <ul><li>Include your data table</li><li>Cite two sources</li></ul>
     <script>alert(1)</script>`,
  );

  assert.match(text, /Turn in the lab report by Friday\./);
  assert.match(text, /- Include your data table/);
  // Script contents must never reach the model as if they were lesson material.
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /</);
});

test("headings become locators so a long syllabus cites its own sections", () => {
  const chunks = parseHtml(
    `<p>This course meets Tuesdays and Thursdays in room 214 all semester.</p>
     <h2>Grading</h2>
     <p>Labs are forty percent of the grade and the final exam is thirty.</p>`,
    "Syllabus",
  );

  assert.deepEqual(
    chunks.map((c) => c.locator),
    ["Syllabus", "Syllabus — Grading"],
  );
  // The heading stays in the body too — a locator isn't in the model's context.
  assert.match(chunks[1].content, /Grading/);
});

/* ---------------------------------- plan --------------------------------- */

const FILES = [
  { id: 900, display_name: "Photosynthesis.pptx", filename: "photosynthesis.pptx", url: "https://canvas.test/files/900", updated_at: "2026-01-05T00:00:00Z" },
  { id: 901, display_name: "Course policies.pdf", filename: "policies.pdf", url: "https://canvas.test/files/901", updated_at: "2026-01-06T00:00:00Z" },
  { id: 902, display_name: "cell-diagram.png", filename: "cell-diagram.png", url: "https://canvas.test/files/902", updated_at: "2026-01-07T00:00:00Z" },
];

const MODULES = [
  {
    id: 51,
    name: "Unit 3 — Photosynthesis",
    items: [
      { id: 1, title: "Photosynthesis slides", type: "File", content_id: 900 },
      { id: 2, title: "Lab report", type: "Assignment", content_id: 77 },
    ],
  },
];

const ASSIGNMENTS = [
  {
    id: 77,
    name: "Lab report 2",
    description: "<p>Write up the chloroplast experiment.</p>",
    due_at: "2026-02-13T05:59:00Z",
    points_possible: 40,
  },
];

/**
 * Each test that writes gets its own course id, so a rename in one can't leak
 * into the next and quietly turn a real assertion into a passing one.
 */
function fixturePlan(
  courseId = 4021,
  overrides: Partial<Parameters<typeof planCourse>[0]> = {},
) {
  return planCourse({
    course: {
      id: courseId,
      name: "Biology I",
      course_code: "BIO-1",
      syllabus_body:
        "<p>Biology I meets Tuesdays and Thursdays. Late work loses ten percent per day.</p>",
    },
    files: FILES,
    modules: MODULES,
    assignments: ASSIGNMENTS,
    ...overrides,
  });
}

test("a course maps onto syllabus, assignment, module and leftover-files lessons", () => {
  const plan = fixturePlan();

  assert.deepEqual(
    plan.lessons.map((l) => [l.kind, l.title]),
    [
      ["syllabus", "Syllabus — Biology I"],
      ["assignment", "Lab report 2"],
      ["module", "Unit 3 — Photosynthesis"],
      ["files", "Course files — Biology I"],
    ],
  );

  // The module claims the file its item points at; the unclaimed PDF falls
  // through to "Course files" rather than being dropped.
  const moduleLesson = plan.lessons.find((l) => l.kind === "module")!;
  const leftover = plan.lessons.find((l) => l.kind === "files")!;
  assert.deepEqual(moduleLesson.files.map((f) => f.filename), ["Photosynthesis.pptx"]);
  assert.deepEqual(leftover.files.map((f) => f.filename), ["Course policies.pdf"]);

  // An unreadable file is reported, not silently missing.
  assert.deepEqual(plan.skipped, ["cell-diagram.png — not a PDF, DOCX, or PPTX"]);
});

test("a due date lands in the content, because that's what students ask", () => {
  const assignment = fixturePlan().lessons.find((l) => l.kind === "assignment")!;
  const chunks = parseHtml(assignment.texts[0].html, assignment.texts[0].label);
  const body = chunks.map((c) => c.content).join("\n");

  assert.match(body, /Due: /);
  assert.match(body, /2026/);
  assert.match(body, /Points possible: 40/);
  assert.match(body, /chloroplast experiment/);
  assert.equal(chunks[0].locator, "Assignment details");
});

test("a module with no items and no files isn't turned into an empty lesson", () => {
  const plan = fixturePlan(4021, {
    modules: [{ id: 52, name: "Placeholder", items: [] }],
  });

  assert.equal(plan.lessons.some((l) => l.kind === "module"), false);
});

/* -------------------------------- re-sync -------------------------------- */

/** Serves each fixture file as the format its name claims, so parsing succeeds. */
async function download(url: string): Promise<Buffer> {
  if (url.endsWith("/900")) return DECK;
  if (url.endsWith("/901")) return HANDOUT;
  throw new Error(`unexpected download: ${url}`);
}

async function runSync(plan: ReturnType<typeof planCourse>) {
  const { report, pending } = await applyPlan(plan, download);
  for (const { lessonId, items } of pending) await processPending(lessonId, items);
  return report;
}

test("re-syncing updates in place instead of duplicating", async () => {
  const first = await runSync(fixturePlan());

  assert.equal(first.created, 4);
  assert.equal(first.updated, 0);
  assert.equal((await q.listCanvasLessons("4021")).length, 4);

  // The whole point of pulling files: a real slide number reaches the citation.
  const moduleLesson = (await q.listCanvasLessons("4021")).find((l) => l.canvas_kind === "module")!;
  const locators = (await q.listChunksForReview(moduleLesson.id)).map((c) => c.locator);
  assert.ok(locators.includes("Slide 4"), `expected a Slide 4 locator in ${locators}`);
  assert.equal(moduleLesson.status, "ready");

  const second = await runSync(fixturePlan());

  assert.equal(second.created, 0, "a second sync must not create lessons again");
  assert.equal(second.updated, 4);
  assert.equal(second.added, 0, "nothing changed in Canvas, so nothing re-read");
  assert.ok(second.unchanged > 0);

  // Still four lessons, and the module's chunks weren't duplicated.
  assert.equal((await q.listCanvasLessons("4021")).length, 4);
  assert.deepEqual((await q.listChunksForReview(moduleLesson.id)).map((c) => c.locator), locators);
});

test("a lesson keeps its id across a re-sync, so its question log survives", async () => {
  await runSync(fixturePlan(4022));
  const before = (await q.listCanvasLessons("4022")).find((l) => l.canvas_kind === "assignment")!;

  await q.logMessage({
    lessonId: before.id,
    studentName: "Priya",
    question: "When is the lab report due?",
    answer: "February 13.",
    citations: [],
    source: "model",
  });

  // Renaming it in Canvas must not orphan what students already asked.
  await runSync(
    fixturePlan(4022, {
      assignments: [{ ...ASSIGNMENTS[0], name: "Lab report 2 (revised)" }],
    }),
  );

  const after = (await q.listCanvasLessons("4022")).find((l) => l.canvas_kind === "assignment")!;
  assert.equal(after.id, before.id);
  assert.equal(after.title, "Lab report 2 (revised)");
  assert.equal((await q.listMessagesForStudent(after.id, "Priya")).length, 1);
});

test("an edited file is re-read; a deleted one stops being answerable", async () => {
  await runSync(fixturePlan(4023));

  const edited = { ...FILES[0], updated_at: "2026-03-01T00:00:00Z" };
  const changed = await runSync(
    fixturePlan(4023, { files: [edited, FILES[1], FILES[2]] }),
  );

  assert.equal(changed.added, 1, "only the file Canvas says changed is re-read");

  const moduleLesson = (await q.listCanvasLessons("4023")).find((l) => l.canvas_kind === "module")!;
  // Re-read, not read twice: the deck contributes the same chunks as before.
  assert.equal((await q.listFiles(moduleLesson.id)).filter((f) => f.kind === "pptx").length, 1);

  const removed = await runSync(fixturePlan(4023, { files: [FILES[1], FILES[2]] }));

  assert.equal(removed.removed, 1);
  assert.equal((await q.listFiles(moduleLesson.id)).filter((f) => f.kind === "pptx").length, 0);
  assert.equal(
    (await q.listChunksForReview(moduleLesson.id)).some((c) => c.locator.startsWith("Slide")),
    false,
    "chunks from a file deleted in Canvas must not answer questions",
  );
});

test("a lesson whose Canvas source disappeared is reported, not deleted", async () => {
  await runSync(fixturePlan(4024));
  const report = await runSync(fixturePlan(4024, { assignments: [] }));

  assert.deepEqual(report.stale, ["Lab report 2"]);
  // Still there — deleting it would cascade the teacher's question log.
  assert.ok(
    (await q.listCanvasLessons("4024")).some((l) => l.canvas_kind === "assignment"),
  );
});

test("a manually uploaded lesson is never touched by a sync", async () => {
  const manual = await q.createLesson("Hand-made lesson", "Uploaded, not synced.");
  const file = await q.createFile(manual, "notes.pdf", "pdf");
  await q.insertChunks(manual, file, [{ locator: "Page 1", content: "Manual content." }]);
  await q.setFileStatus(file, "ready", { chunkCount: 1 });

  await runSync(fixturePlan(4025));

  const after = (await q.getLesson(manual))!;
  assert.equal(after.canvas_course_id, null);
  assert.equal(after.chunk_count, 1);
  assert.equal((await q.listCanvasLessons("4025")).some((l) => l.id === manual), false);
});
