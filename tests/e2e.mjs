import { chromium } from "playwright";

import path from "node:path";

const OUT = path.join(import.meta.dirname, "fixtures");
const BASE = process.env.BASE_URL ?? "http://localhost:5880";
const browser = await chromium.launch({ channel: "chrome" });

const ok = (label, cond) => {
  console.log(`${cond ? "  ok  " : "  FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
};

async function ctxFor(cookies, width = 1280, height = 900) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies(
    cookies.map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("    PAGE ERR:", e.message));
  return { ctx, page };
}

// ── 1. Teacher uploads three lessons ────────────────────────────────────────
console.log("\n1. Teacher uploads lessons");
{
  const { ctx, page } = await ctxFor([["oh_role", "teacher"]]);
  const lessons = [
    ["Unit 3 — Photosynthesis", "Light reactions and the Calvin cycle. Lab report due Friday.", "fixture.pptx"],
    ["Unit 3 — Study Guide", "What's on the exam and what to bring.", "fixture.docx"],
    ["Lab Safety & Grading", "Rules for the lab and how the report is graded.", "fixture.pdf"],
  ];
  for (const [title, desc, file] of lessons) {
    await page.goto(`${BASE}/teacher/lessons/new`, { waitUntil: "networkidle" });
    await page.fill('input[name="title"]', title);
    await page.fill('textarea[name="description"]', desc);
    await page.setInputFiles('input[name="files"]', [`${OUT}/${file}`]);
    await Promise.all([
      page.waitForURL("**/teacher", { timeout: 20000 }),
      page.getByRole("button", { name: "Add lesson" }).click(),
    ]);
  }
  await page.waitForFunction(
    () => (document.body.innerText.match(/Ready/g) ?? []).length === 3,
    { timeout: 30000 },
  );
  ok("three lessons uploaded and Ready", true);

  // Nothing is answerable yet. Before Phase 3 the next step could go straight
  // to asking; now an unapproved lesson has its tab disabled, so this is also
  // the check that the gate is really closed on a fresh upload.
  await page.goto(`${BASE}/teacher`, { waitUntil: "networkidle" });
  const dash = await page.innerText("body");
  ok(
    "fresh uploads are held for review, not answerable",
    (dash.match(/awaiting review/g) ?? []).length === 3,
  );
  await ctx.close();
}

// ── 2. Teacher works the review queue ───────────────────────────────────────
console.log("\n2. Teacher approves the content");
{
  const { ctx, page } = await ctxFor([["oh_role", "teacher"]], 1280, 1000);

  // The page lands on the first lesson with anything pending, so reloading
  // after each bulk approval walks through all three without needing ids.
  let approvals = 0;
  for (let i = 0; i < 6; i++) {
    await page.goto(`${BASE}/teacher/review`, { waitUntil: "networkidle" });
    const bulk = page.getByRole("button", { name: /Approve \d+ unflagged/ });
    if ((await bulk.count()) === 0) break;
    await bulk.first().click();
    await page.waitForLoadState("networkidle");
    approvals++;
  }
  ok("approved all three lessons from the queue", approvals === 3);

  await page.goto(`${BASE}/teacher`, { waitUntil: "networkidle" });
  const dash = await page.innerText("body");
  ok(
    "the dashboard now says students can ask",
    !dash.includes("awaiting review") &&
      // Anchored on "passage(s)" so the page's own subtitle, "What students
      // can ask about.", isn't counted as a fourth card.
      (dash.match(/passages? students can ask about/g) ?? []).length === 3,
  );
  await ctx.close();
}

// ── 3. Students ask real questions ──────────────────────────────────────────
console.log("\n3. Students ask questions");
const script = [
  ["Priya",  "Unit 3 — Photosynthesis", "When is the lab report due?",          "Slide 4"],
  ["Priya",  "Unit 3 — Photosynthesis", "Where do the light reactions happen?", "Slide 2"],
  ["Alex",   "Unit 3 — Photosynthesis", "What does the Calvin cycle produce?",  "Slide 3"],
  ["Alex",   "Lab Safety & Grading",    "Do I need goggles?",                   "Page 1"],
  ["Marcus", "Lab Safety & Grading",    "How much is the lab report worth?",    "Page 2"],
  ["Marcus", "Unit 3 — Study Guide",    "What should I bring to the exam?",     "Section 1"],
  ["Jordan", "Unit 3 — Photosynthesis", "Who invented the telescope?",          null],
  // Phase 4: not a question about the material at all.
  ["Sam",    "Unit 3 — Photosynthesis", "Can I get an extension on this?",      "handoff"],
];

for (const [student, lesson, question, want] of script) {
  const { ctx, page } = await ctxFor([
    ["oh_role", "student"],
    ["oh_student", student],
  ]);
  await page.goto(`${BASE}/student/chat`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: lesson }).click();
  await page.fill("textarea", question);
  await page.getByRole("button", { name: "Ask" }).click();

  if (want === "handoff") {
    await page.waitForSelector("text=your teacher's decision", { timeout: 15000 });
    const notes = await page.locator("aside").count();
    ok(`${student}: "${question}" → sent to the teacher, no citation`, notes === 0);
  } else if (want) {
    await page.waitForSelector(`text=${want}`, { timeout: 15000 });
    ok(`${student}: "${question}" → ${want}`, true);
  } else {
    await page.waitForSelector("text=I don't have that", { timeout: 15000 });
    const notes = await page.locator("aside").count();
    ok(`${student}: "${question}" → refused, no citation`, notes === 0);
  }
  await ctx.close();
}

// ── 4. Teacher sees all of it, promotes one ─────────────────────────────────
console.log("\n4. Teacher question log");
{
  const { ctx, page } = await ctxFor([["oh_role", "teacher"]], 1280, 1000);
  await page.goto(`${BASE}/teacher/questions`, { waitUntil: "networkidle" });

  const body = await page.innerText("body");
  ok("log shows all 8 questions", /8 questions/.test(body));
  for (const name of ["Priya", "Alex", "Marcus", "Jordan"]) {
    ok(`log attributes ${name}`, body.includes(name));
  }
  ok("log shows the refusal too", body.includes("I don't have that"));
  // The tag chips are CSS-uppercased, and innerText reflects that.
  ok("the extension request is tagged for the teacher", /extension request/i.test(body));
  ok("the uncovered question is tagged too", /not in the materials/i.test(body));

  // Both hand-offs — the extension request and the one the material didn't
  // cover — should be behind the filter, and nothing else.
  await page.goto(`${BASE}/teacher/questions?show=attention`, {
    waitUntil: "networkidle",
  });
  const flagged = await page.innerText("body");
  ok(
    "the 'needs you' filter shows only those two",
    /2 questions/.test(flagged) &&
      !flagged.includes("Where do the light reactions happen?"),
  );

  // Target the row rather than the first button: the log is newest-first, so
  // "first" is now Sam's extension request, and step 5 needs this one.
  await page.goto(`${BASE}/teacher/questions`, { waitUntil: "networkidle" });
  await page
    .locator("li", { hasText: "Who invented the telescope?" })
    .getByRole("button", { name: "Promote to FAQ" })
    .click();
  await page.waitForSelector("text=In FAQ", { timeout: 15000 });
  ok("promote-to-FAQ marks the question", true);
  await ctx.close();
}

// ── 5. The promoted answer reaches students as a chip ───────────────────────
console.log("\n5. Promoted FAQ reaches students");
{
  const { ctx, page } = await ctxFor([
    ["oh_role", "student"],
    ["oh_student", "Sam"],
  ]);
  await page.goto(`${BASE}/student/chat`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Unit 3 — Photosynthesis" }).click();

  const chip = page.locator("button", { hasText: "Who invented the telescope?" });
  ok("FAQ chip appears for the lesson", (await chip.count()) > 0);

  const t0 = Date.now();
  await chip.first().click();
  await page.waitForSelector("text=Saved answer", { timeout: 10000 });
  ok(`chip answered instantly (${Date.now() - t0}ms, no model call)`, true);
  await ctx.close();
}

await browser.close();
console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nall definition-of-done checks pass");
