# Project: Classroom Q&A Assistant — Phase 4

## What this is
An AI assistant that answers student questions about assignments and lessons,
grounded strictly in a teacher's own materials — never general knowledge,
never a guess. Full details in PHASE1_SPEC.md. Visual direction is in
DESIGN_GUIDE.md — follow it deliberately, this should not look like a generic
AI-generated dashboard.

## Where we are
Phase 1 (the core loop, manual upload, dummy auth) is built and demoable.
Phase 2 added a real Canvas API pull: a static access token, `/api/canvas/sync`,
and a course → lessons mapping that feeds the *same* parsing and chunking
pipeline, so Canvas-sourced and hand-uploaded lessons are identical downstream.
Manual upload still works and is the fastest way to test.

Phase 3 added teacher approval, and it is a hard gate, not a preference:
every chunk lands as `pending` and the answer pipeline reads only `approved`
ones. Triage flags (answer keys, rubrics, private notes about a named student)
sort the teacher's queue; they never decide anything on their own.

Phase 4 taught it to stop. Questions that are a person's to answer — extension
requests, grade disputes, personal circumstances, requests for an opinion —
are handed back with no answer generated at all, and land in the teacher's log
tagged with why. `lib/triage.ts` reads the student's wording before any model
call (so it works in rehearsal mode); the model's own `needs_human` field is
the second line for what wording can't settle.

It still does **not** have real authentication and **must not** touch a real
school's Canvas or real student data — sandbox/test instances only.

## The rule that outranks the others
Nothing a teacher hasn't approved may reach a student. If a change would let
unapproved content into an answer — a new retrieval path, a cache, a summary
built at upload time, a "preview" that reads raw chunks — it is wrong, however
convenient. `getApprovedChunks` is the only chunk reader the answer pipeline
may use, and there is deliberately no unfiltered equivalent for it to reach
for instead.

## Explicitly out of scope — do not implement
- OAuth / LTI (that's Phase 9). The static API token is deliberate.
- Any real Frisco ISD or real-school Canvas instance
- Writing back to Canvas — the client is read-only GETs
- Real login/authentication (passwords, sessions tied to real accounts)
- A *real* content-safety classifier. Phase 3's flags are regex triage to
  order a human's queue — deliberately not a model call, and never a decision.
- A second model call to classify questions. Phase 4 rides on the existing
  structured output; a student waiting on a reply shouldn't pay for two
  round trips.
- Any way for a teacher to "resolve" a flagged question. The log is a log.
- Cost/rate-limiting logic
- Multi-teacher or multi-school support
- Real embeddings/vector database (keyword or full-context retrieval is fine
  at this scale — see PHASE1_SPEC.md)

If you find yourself about to build any of the above, stop and flag it to me
instead of proceeding — it means scope has drifted.

## Tech stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- SQLite via `better-sqlite3` for local storage (lessons, chunks, chat logs,
  FAQ entries)
- Anthropic SDK (`@anthropic-ai/sdk`) for the chat model — use
  `claude-sonnet-5`
- Canvas REST API via `fetch` — no SDK. Domain and token come from
  `CANVAS_BASE_URL` / `CANVAS_ACCESS_TOKEN`.
- File parsing:
  - `pdf-parse` for PDFs
  - `mammoth` for .docx
  - For .pptx: no need for an exotic library — a .pptx is just a zip of XML.
    Use `jszip` to unzip it, read `ppt/slides/slideN.xml` for each slide, and
    strip text nodes out of the XML with a simple parser (e.g. `xml2js` or a
    regex on `<a:t>` tags). Keep the slide number so citations can say
    "Slide 4."

## Suggested repo structure
```
/app
  /teacher        → teacher dashboard routes (incl. /canvas, /review)
  /student        → student chat routes
  /api
    /upload       → file upload + parsing + chunking
    /chat         → question → retrieval → Claude API → answer
    /canvas/sync  → pull one Canvas course into lessons
    /faq          → FAQ CRUD
    /log          → question/answer log for teacher view
/lib
  /canvas         → API client, course→lesson mapping, sync/upsert
  /parsing        → pdf/docx/pptx/html text extraction
  /review         → content flags for the approval queue
  /db             → sqlite schema + queries
  /retrieval      → chunk matching / FAQ matching logic (approved only)
  triage.ts       → is this question ours to answer at all
/components       → shared UI components
```
Adjust as needed — this is a starting point, not a rigid requirement.

## How to work
1. Read PHASE1_SPEC.md fully before writing any code.
2. Read DESIGN_GUIDE.md before building any UI.
3. Propose the scaffold first (folders, dependencies, base config) and
   confirm with me before installing anything.
4. Build in this order, checking in briefly after each with what to test:
   dummy auth → teacher lesson/upload management → chat retrieval engine →
   student chat UI → FAQ layer → teacher question log/dashboard.
5. Prioritize a working, demoable core loop over polishing edge cases — but
   the UI itself should still look genuinely good, since that's part of what
   gets demoed to a teacher.

## Gotchas worth knowing
- Adding a column to `lib/db/schema.sql` is not enough. Existing databases
  already have the table, and `CREATE TABLE IF NOT EXISTS` is a no-op on one —
  add the column to `ADDED_COLUMNS` in `lib/db/index.ts` too, or it will exist
  on a fresh clone and be missing on yours.
- Anything computed at insert time (flags are the example) needs a backfill
  for rows that predate it, or existing content quietly reads as "we checked
  and found nothing" when nobody ever checked.
- Two words mean "triage" in this codebase and they are unrelated:
  `lib/review/flags.ts` judges *content* for the approval queue,
  `lib/triage.ts` judges *questions* at ask time.
