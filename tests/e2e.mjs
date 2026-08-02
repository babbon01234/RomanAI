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
  await ctx.close();
}

// ── 2. Students ask real questions ──────────────────────────────────────────
console.log("\n2. Students ask questions");
const script = [
  ["Priya",  "Unit 3 — Photosynthesis", "When is the lab report due?",          "Slide 4"],
  ["Priya",  "Unit 3 — Photosynthesis", "Where do the light reactions happen?", "Slide 2"],
  ["Alex",   "Unit 3 — Photosynthesis", "What does the Calvin cycle produce?",  "Slide 3"],
  ["Alex",   "Lab Safety & Grading",    "Do I need goggles?",                   "Page 1"],
  ["Marcus", "Lab Safety & Grading",    "How much is the lab report worth?",    "Page 2"],
  ["Marcus", "Unit 3 — Study Guide",    "What should I bring to the exam?",     "Section 1"],
  ["Jordan", "Unit 3 — Photosynthesis", "Who invented the telescope?",          null],
];

for (const [student, lesson, question, wantCite] of script) {
  const { ctx, page } = await ctxFor([
    ["oh_role", "student"],
    ["oh_student", student],
  ]);
  await page.goto(`${BASE}/student/chat`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: lesson }).click();
  await page.fill("textarea", question);
  await page.getByRole("button", { name: "Ask" }).click();

  if (wantCite) {
    await page.waitForSelector(`text=${wantCite}`, { timeout: 15000 });
    ok(`${student}: "${question}" → ${wantCite}`, true);
  } else {
    await page.waitForSelector("text=I don't have that", { timeout: 15000 });
    const notes = await page.locator("aside").count();
    ok(`${student}: "${question}" → refused, no citation`, notes === 0);
  }
  await ctx.close();
}

// ── 3. Teacher sees all of it, promotes one ─────────────────────────────────
console.log("\n3. Teacher question log");
{
  const { ctx, page } = await ctxFor([["oh_role", "teacher"]], 1280, 1000);
  await page.goto(`${BASE}/teacher/questions`, { waitUntil: "networkidle" });

  const body = await page.innerText("body");
  ok("log shows all 7 questions", /7 questions/.test(body));
  for (const name of ["Priya", "Alex", "Marcus", "Jordan"]) {
    ok(`log attributes ${name}`, body.includes(name));
  }
  ok("log shows the refusal too", body.includes("I don't have that"));

  await page.getByRole("button", { name: "Promote to FAQ" }).first().click();
  await page.waitForSelector("text=In FAQ", { timeout: 15000 });
  ok("promote-to-FAQ marks the question", true);
  await ctx.close();
}

// ── 4. The promoted answer reaches students as a chip ───────────────────────
console.log("\n4. Promoted FAQ reaches students");
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
