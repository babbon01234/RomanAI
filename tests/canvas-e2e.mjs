/**
 * The Phase 2 definition of done, end to end, without a real Canvas account.
 *
 * Stands up a stub Canvas API serving the four endpoints the sync reads and
 * the real fixture files, points the app at it, then drives the actual HTTP
 * routes: sync → lessons populate → re-sync doesn't duplicate → a student
 * gets a cited answer grounded in the synced content.
 *
 *   node tests/canvas-e2e.mjs
 *
 * Starts its own app server on a throwaway database, so it never touches
 * data/app.db or your real Canvas credentials.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FIXTURES = path.join(HERE, "fixtures");

const CANVAS_PORT = 5901;
const APP_PORT = 5902;
const APP = `http://127.0.0.1:${APP_PORT}`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "office-hours-e2e-"));

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✖"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

/* ----------------------------- stub Canvas API ---------------------------- */

const COURSE = {
  id: 771,
  name: "Biology I (Sandbox)",
  course_code: "BIO-1",
  syllabus_body:
    "<p>Biology I meets Tuesdays and Thursdays in room 214.</p><h2>Late work</h2><p>Late work loses ten percent per day, up to three days.</p>",
};

const FILES = [
  {
    id: 900,
    display_name: "Photosynthesis.pptx",
    filename: "photosynthesis.pptx",
    url: `http://127.0.0.1:${CANVAS_PORT}/files/900/download?verifier=abc`,
    updated_at: "2026-01-05T00:00:00Z",
  },
  {
    id: 902,
    display_name: "seating-chart.png",
    filename: "seating-chart.png",
    url: `http://127.0.0.1:${CANVAS_PORT}/files/902/download`,
    updated_at: "2026-01-07T00:00:00Z",
  },
];

const MODULES = [
  {
    id: 51,
    name: "Unit 3 — Photosynthesis",
    items: [
      { id: 1, title: "Photosynthesis slides", type: "File", content_id: 900 },
      { id: 2, title: "Lab report 2", type: "Assignment", content_id: 77 },
    ],
  },
];

const ASSIGNMENTS = [
  {
    id: 77,
    name: "Lab report 2",
    // The heading splits this into two chunks: ordinary instructions, and an
    // answer key. Phase 3's whole job is that the second one never reaches a
    // student unless a teacher says so.
    description:
      "<p>Write up the chloroplast experiment and include your data table.</p>" +
      // Phase 4 needs a factual question that the approved material actually
      // answers, so the "still answers normally" half is testing the triage
      // rather than testing that this fixture is thin.
      "<p>Submit it in PDF format. No other format is accepted.</p>" +
      "<h2>Answer Key</h2>" +
      "<p>Correct response: the stroma is where the Calvin cycle occurs.</p>",
    due_at: "2026-02-13T05:59:00Z",
    points_possible: 40,
  },
];

/* The rubric as a teacher would have built and marked it (Phase 7). */
const RUBRIC = [
  {
    id: "_1001",
    description: "Data table",
    points: 10,
    ratings: [
      { id: "r1", description: "Complete", points: 10 },
      { id: "r2", description: "Partial", points: 7 },
    ],
  },
  { id: "_1002", description: "Analysis", points: 20 },
  { id: "_1003", description: "Presentation", points: 10 },
];

const TEACHER_COMMENTS = {
  _1001: "Units are missing from the second column.",
  _1002: "Good use of the data, but no link back to the hypothesis.",
};

/** Priya is graded; Alex submitted but isn't marked yet. */
const SUBMISSIONS = {
  10421: {
    user_id: 10421,
    workflow_state: "graded",
    score: 33,
    graded_at: "2026-02-16T10:04:00Z",
    rubric_assessment: {
      _1001: { points: 7, comments: TEACHER_COMMENTS._1001, rating_id: "r2" },
      _1002: { points: 16, comments: TEACHER_COMMENTS._1002 },
      _1003: { points: 10, comments: null },
    },
    submission_comments: [{ comment: "Nice improvement on last time." }],
  },
  10422: { user_id: 10422, workflow_state: "submitted", rubric_assessment: null },
};

let tokenSeen = null;
let downloadAuth = "not-called";
let submissionQuery = null;

function startCanvas() {
  const server = createServer((req, res) => {
    tokenSeen = req.headers.authorization ?? tokenSeen;
    const url = new URL(req.url, `http://127.0.0.1:${CANVAS_PORT}`);

    const json = (body) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/api/v1/courses") return json([COURSE]);
    if (url.pathname === `/api/v1/courses/${COURSE.id}`) return json(COURSE);
    if (url.pathname === `/api/v1/courses/${COURSE.id}/files`) return json(FILES);
    if (url.pathname === `/api/v1/courses/${COURSE.id}/modules`) return json(MODULES);
    if (url.pathname === `/api/v1/courses/${COURSE.id}/assignments`)
      return json(ASSIGNMENTS);

    // The single-assignment fetch is the only one that carries the rubric
    // definition — the list endpoint above deliberately doesn't, matching
    // Canvas.
    if (url.pathname === `/api/v1/courses/${COURSE.id}/assignments/77`)
      return json({ ...ASSIGNMENTS[0], rubric: RUBRIC });

    const submission = /\/assignments\/77\/submissions\/(\d+)$/.exec(url.pathname);
    if (submission) {
      submissionQuery = url.search;
      const found = SUBMISSIONS[submission[1]];
      if (!found) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ errors: [{ message: "not found" }] }));
      }
      return json(found);
    }

    if (url.pathname === "/files/900/download") {
      downloadAuth = req.headers.authorization ?? "absent";
      res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      return res.end(fs.readFileSync(path.join(FIXTURES, "fixture.pptx")));
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "not found" }] }));
  });

  return new Promise((resolve) => server.listen(CANVAS_PORT, "127.0.0.1", () => resolve(server)));
}

/* -------------------------------- app server ------------------------------ */

/**
 * A throwaway database, a stub Canvas, and no API key. Values set here win
 * over .env.local — @next/env only fills in variables that aren't already in
 * the environment — so the real model key stays out and the answer layer
 * runs in its rehearsal mode, which is what makes the citation assertions
 * deterministic.
 */
const APP_ENV = {
  ...process.env,
  OFFICE_HOURS_DB: path.join(TMP, "e2e.db"),
  CANVAS_BASE_URL: `http://127.0.0.1:${CANVAS_PORT}`,
  CANVAS_ACCESS_TOKEN: "sandbox-token-123",
  // Priya is graded, Alex isn't, Sam is deliberately unmapped.
  CANVAS_STUDENT_IDS: "Priya:10421,Alex:10422",
  AI_API_KEY: "",
};

/**
 * Production build rather than `next dev`: Next refuses a second dev server in
 * a directory that already has one, and this script has to be runnable while
 * you're working.
 */
function build() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", "build"], {
      cwd: ROOT,
      env: APP_ENV,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`next build failed:\n${stderr}`)),
    );
  });
}

function startApp() {
  const child = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    cwd: ROOT,
    env: APP_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr.on("data", (d) => {
    const text = String(d);
    if (/error/i.test(text)) process.stderr.write(`  [app] ${text}`);
  });

  return child;
}

async function waitForApp() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(APP, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("the app never came up");
}

/* ---------------------------------- drive --------------------------------- */

/**
 * Opens the app's own database — same file the running server reads, so
 * writes here are visible to it immediately. Used both to stand in for a
 * teacher working the review queue, and (below) to seed Phase 9 accounts
 * directly rather than drive the real signup form for a whole cast of
 * students on every run.
 */
function withDb(work) {
  const Database = createRequire(import.meta.url)("better-sqlite3");
  const db = new Database(APP_ENV.OFFICE_HOURS_DB);
  try {
    return work(db);
  } finally {
    db.close();
  }
}
const review = withDb;

/**
 * A real account + session per identity, seeded straight into the database
 * (bypassing signup/Google) so the script can authenticate as a stable cast
 * of students and one teacher. Creates `users`/`sessions` itself rather than
 * relying on the app having touched the database first — this can run
 * before the very first HTTP request.
 */
const identityCache = new Map();
function as(role, name) {
  const key = `${role}:${name ?? ""}`;
  if (identityCache.has(key)) return identityCache.get(key);

  const cookie = withDb((db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        role TEXT NOT NULL, password_hash TEXT, google_id TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
    `);

    const email = `${(name ?? role).toLowerCase()}@example.test`;
    let user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) {
      const id = randomUUID();
      db.prepare("INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(
        id,
        email,
        name ?? "Ms. Rivera",
        role,
      );
      user = { id };
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
      token,
      user.id,
      expiresAt,
    );

    return `oh_session=${token}`;
  });

  identityCache.set(key, cookie);
  return cookie;
}

/** A rendered page's visible text, with markup and entities resolved. */
async function page(pathname, cookie) {
  const res = await fetch(`${APP}${pathname}`, { headers: { cookie } });
  const html = await res.text();
  const body = html.match(/<body[\s\S]*?<\/body>/)?.[0] ?? html;

  return body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#x22;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function api(pathname, { method = "GET", cookie, body } = {}) {
  const res = await fetch(`${APP}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log("Building…");
  await build();

  const canvas = await startCanvas();
  const app = startApp();

  const stop = () => {
    app.kill("SIGTERM");
    canvas.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  };

  try {
    await waitForApp();

    console.log("\nSync");
    const sync = await api("/api/canvas/sync", {
      method: "POST",
      cookie: as("teacher"),
      body: { courseId: String(COURSE.id) },
    });

    check("the route accepts the sync", sync.status === 200, JSON.stringify(sync.body));
    const report = sync.body?.report;
    if (!report) throw new Error("no report came back; nothing else can be checked");

    check("the token reached Canvas", tokenSeen === "Bearer sandbox-token-123", tokenSeen);
    check(
      "lessons were created from the course",
      report.created === 3,
      `created ${report.created}`,
    );
    check(
      "syllabus, assignment and module all became lessons",
      ["syllabus", "assignment", "module"].every((k) =>
        report.lessons.some((l) => l.kind === k),
      ),
      report.lessons.map((l) => l.kind).join(", "),
    );
    check(
      "the unreadable file is reported, not silently dropped",
      report.skipped.some((s) => s.includes("seating-chart.png")),
      JSON.stringify(report.skipped),
    );
    check("no endpoint failed", report.warnings.length === 0, JSON.stringify(report.warnings));

    console.log("\nParsing");
    const lessons = await pollUntilReady(as("teacher"));
    check(
      "every synced lesson finished processing",
      lessons.every((l) => l.status === "ready"),
      lessons.map((l) => `${l.title}=${l.status}${l.error ? ` (${l.error})` : ""}`).join("; "),
    );
    check(
      "the deck was downloaded with the token",
      downloadAuth === "Bearer sandbox-token-123",
      downloadAuth,
    );

    const moduleLesson = lessons.find((l) => l.canvas_kind === "module");
    check("the module lesson holds real passages", moduleLesson?.chunk_count > 0, String(moduleLesson?.chunk_count));

    const student = as("student", "Priya");
    const assignment = lessons.find((l) => l.canvas_kind === "assignment");

    console.log("\nApproval gate (Phase 3)");
    check(
      "synced content arrives unapproved, exactly like an upload",
      lessons.every((l) => l.approved_count === 0 && l.pending_count > 0),
      lessons.map((l) => `${l.title}: ${l.approved_count}/${l.pending_count}`).join("; "),
    );
    check(
      "the answer key in the assignment was flagged for the teacher",
      assignment?.flagged_count === 1,
      `flagged ${assignment?.flagged_count} of ${assignment?.pending_count}`,
    );

    const beforeApproval = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: assignment.id, question: "When is the lab report due?" },
    });
    check(
      "a student asking before approval gets nothing",
      beforeApproval.body?.found === false &&
        (beforeApproval.body?.citations ?? []).length === 0,
      JSON.stringify(beforeApproval.body?.answer),
    );

    // Stands in for the teacher working the review queue. The queue's own
    // actions are unit-tested; what's under test here is the gate, so this
    // writes the same decisions straight to the column the gate reads.
    const rejected = review((db) => {
      db.prepare(
        `UPDATE chunks SET approval_status = 'approved'
          WHERE approval_status = 'pending' AND flags = '[]'`,
      ).run();
      return db
        .prepare(
          `UPDATE chunks SET approval_status = 'rejected'
            WHERE approval_status = 'pending' AND flags <> '[]'`,
        )
        .run().changes;
    });
    check("the flagged passage is the one rejected", rejected === 1, String(rejected));

    console.log("\nGrounded answers");

    const slide = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: moduleLesson.id, question: "What happens in the Calvin cycle?" },
    });
    const locator = slide.body?.citations?.[0]?.locator ?? "";
    check(
      "a question about the synced deck cites a real slide",
      /^Slide \d+/.test(locator),
      `answer=${JSON.stringify(slide.body?.answer)?.slice(0, 90)} locator=${locator}`,
    );

    const due = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: assignment.id, question: "When is the lab report due?" },
    });
    check(
      "the assignment's due date is answerable once approved",
      due.body?.found === true && due.body?.citations?.[0]?.locator === "Assignment details",
      `${JSON.stringify(due.body?.answer)?.slice(0, 120)}`,
    );

    // The other half of the same lesson. Asking in the answer key's own words
    // must still come back empty — this is the case the whole phase exists for.
    const key = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: {
        lessonId: assignment.id,
        question: "What is the correct response about the stroma?",
      },
    });
    check(
      "the rejected answer key never surfaces, even when asked for directly",
      key.body?.found === false && !/stroma/i.test(key.body?.answer ?? ""),
      JSON.stringify(key.body?.answer),
    );

    console.log("\nKnowing when to stop (Phase 4)");

    // The definition of done, both halves, against the same approved lesson.
    const extension = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: assignment.id, question: "can I get an extension on this?" },
    });
    check(
      "an extension request is declined rather than guessed at",
      extension.body?.outcome === "needs_human" &&
        extension.body?.humanReason === "extension",
      `outcome=${extension.body?.outcome} reason=${extension.body?.humanReason}`,
    );
    check(
      "the student is pointed at their teacher, with no citation",
      /teacher/i.test(extension.body?.answer ?? "") &&
        (extension.body?.citations ?? []).length === 0,
      JSON.stringify(extension.body?.answer),
    );

    const format = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: assignment.id, question: "what format should this be in?" },
    });
    check(
      "a factual question still answers normally from approved content",
      format.body?.outcome === "answered" && format.body?.found === true,
      `outcome=${format.body?.outcome} ${JSON.stringify(format.body?.answer)?.slice(0, 80)}`,
    );

    const grade = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: assignment.id, question: "my grade on this is wrong, can you fix it" },
    });
    check(
      "a grade dispute is handed over too",
      grade.body?.outcome === "needs_human" && grade.body?.humanReason === "grade",
      `reason=${grade.body?.humanReason}`,
    );

    // The teacher's log is a page, not an endpoint, so this reads the page —
    // which also covers the "visually separate them" half of the task.
    const attention = await page("/teacher/questions?show=attention", as("teacher"));
    check(
      "both hand-offs appear in the teacher's 'needs you' filter",
      attention.includes("Extension request") && attention.includes("About a grade"),
      attention.match(/Extension request|About a grade/g)?.join(", ") ?? "neither",
    );
    check(
      "the filter hides questions the bot handled",
      !attention.includes("what format should this be in"),
      "the answered question leaked into the flagged view",
    );

    const everything = await page("/teacher/questions", as("teacher"));
    check(
      "the unfiltered log still shows everything",
      everything.includes("what format should this be in") &&
        everything.includes("can I get an extension on this?"),
      "a question is missing from the full log",
    );

    console.log("\nExplaining a grade (Phase 7)");

    const explain = (cookie) =>
      api("/api/canvas/submission", {
        method: "POST",
        cookie,
        body: { lessonId: assignment.id },
      });

    const priya = await explain(student);
    const said = priya.body?.answer ?? "";

    check(
      "the graded student gets an explanation",
      priya.status === 200 && priya.body?.graded === true,
      JSON.stringify(priya.body?.error ?? said.slice(0, 80)),
    );
    check(
      "style=full was asked for, which is what returns the comments",
      /style=full/.test(submissionQuery ?? "") &&
        /rubric_assessment/.test(submissionQuery ?? ""),
      submissionQuery ?? "no submission call",
    );

    // The definition of done: it matches what the teacher actually entered.
    check(
      "the real per-criterion numbers come back",
      said.includes("7 out of 10") && said.includes("16 out of 20") &&
        said.includes("33 out of 40"),
      said.slice(0, 160),
    );
    check(
      "the teacher's own comments come back, word for word",
      said.includes(TEACHER_COMMENTS._1001) && said.includes(TEACHER_COMMENTS._1002),
      said.slice(0, 160),
    );
    check(
      "a criterion with no comment says so rather than inventing one",
      /didn't leave a note/.test(said),
      said.slice(-160),
    );
    check(
      "the rubric rows appear as citations",
      (priya.body?.citations ?? []).some((c) => /^Data table — 7\/10$/.test(c.locator)) &&
        (priya.body?.citations ?? []).every(
          (c) => c.filename === "Your teacher's rubric",
        ),
      JSON.stringify(priya.body?.citations?.map((c) => c.locator)),
    );
    check(
      "nothing is said about the quality of the work",
      !/\b(excellent|weak|strong|poor|careless|thorough|well done|should have)\b/i.test(
        said.replace(/“[^”]*”/g, " "),
      ),
      said.slice(0, 200),
    );

    const alex = await explain(as("student", "Alex"));
    check(
      "an ungraded submission says so plainly and explains nothing",
      alex.body?.graded === false && /hasn't graded this yet/.test(alex.body?.answer ?? ""),
      JSON.stringify(alex.body?.answer),
    );

    const sam = await explain(as("student", "Sam"));
    check(
      "a student with no Canvas account gets a straight reason, not a guess",
      sam.status === 400 && /isn't linked to a Canvas account/.test(sam.body?.error ?? ""),
      JSON.stringify(sam.body?.error),
    );

    // Typing the question still refuses to re-grade, but now points somewhere.
    const typed = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: assignment.id, question: "why did I lose points on this?" },
    });
    check(
      "typing the same question points at the button instead of contradicting it",
      typed.body?.outcome === "needs_human" &&
        /Why did I lose points on this\?/.test(typed.body?.answer ?? ""),
      JSON.stringify(typed.body?.answer),
    );

    const gradeLog = await page("/teacher/questions", as("teacher"));
    check(
      "the teacher's log tags it as a grade explanation",
      /grade explanation/i.test(gradeLog),
      "no grade-explanation tag in the log",
    );

    const syllabus = lessons.find((l) => l.canvas_kind === "syllabus");
    const late = await api("/api/chat", {
      method: "POST",
      cookie: student,
      body: { lessonId: syllabus.id, question: "What is the penalty for late work?" },
    });
    check(
      "the syllabus cites the section it came from",
      (late.body?.citations?.[0]?.locator ?? "").startsWith("Syllabus"),
      late.body?.citations?.[0]?.locator ?? "none",
    );

    console.log("\nRe-sync");
    const again = await api("/api/canvas/sync", {
      method: "POST",
      cookie: as("teacher"),
      body: { courseId: String(COURSE.id) },
    });
    const second = again.body?.report;

    check("re-sync creates nothing new", second?.created === 0, `created ${second?.created}`);
    check("re-sync re-reads nothing unchanged", second?.added === 0, `added ${second?.added}`);

    const after = (await api("/api/lessons", { cookie: as("teacher") })).body.lessons;
    check("the lesson count is unchanged", after.length === lessons.length, `${after.length} vs ${lessons.length}`);
    check(
      "passages weren't duplicated",
      after.every((l) => l.chunk_count === lessons.find((p) => p.id === l.id)?.chunk_count),
      after.map((l) => `${l.title}=${l.chunk_count}`).join("; "),
    );
    // A re-sync that silently reset approvals would make the review queue
    // pointless on any course a teacher syncs twice.
    check(
      "a re-sync doesn't send approved content back to the queue",
      after.every((l) => l.pending_count === 0) &&
        after.some((l) => l.approved_count > 0),
      after.map((l) => `${l.title}: ${l.approved_count}a/${l.pending_count}p`).join("; "),
    );

    console.log("\nAuthorisation");
    const asStudent = await api("/api/canvas/sync", {
      method: "POST",
      cookie: student,
      body: { courseId: String(COURSE.id) },
    });
    check("a student can't trigger a sync", asStudent.status === 403, String(asStudent.status));

    const bad = await api("/api/canvas/sync", {
      method: "POST",
      cookie: as("teacher"),
      body: { courseId: "999999" },
    });
    check(
      "an unknown course fails with a readable reason",
      bad.status === 400 && /course/i.test(bad.body?.error ?? ""),
      bad.body?.error ?? "",
    );
  } finally {
    stop();
  }

  console.log(
    failures === 0
      ? "\nAll Canvas end-to-end checks passed.\n"
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function pollUntilReady(cookie) {
  for (let i = 0; i < 40; i++) {
    const { body } = await api("/api/lessons", { cookie });
    const synced = (body?.lessons ?? []).filter((l) => l.canvas_course_id);
    if (synced.length > 0 && synced.every((l) => l.status !== "processing")) return synced;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("lessons never finished processing");
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
