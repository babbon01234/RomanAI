# Office Hours — Phase 4

An assistant that answers students' questions about a lesson using only the
teacher's own materials, and shows exactly where each answer came from.
Materials come from a Canvas course or from manual upload, **nothing is
answerable until the teacher approves it**, and questions that are a person's
to answer are handed straight back rather than guessed at. Scope and constraints are in
[CLAUDE.md](CLAUDE.md), [PHASE1_SPEC.md](PHASE1_SPEC.md), and
[DESIGN_GUIDE.md](DESIGN_GUIDE.md).

## Running it

```sh
npm install
npm run dev          # http://localhost:5880
npm test             # 65 unit tests, ~2s, no browser or network
npm run test:e2e     # the Phase 1 loop in a real browser (needs the dev server)
npm run test:canvas  # the Canvas loop against a stub Canvas API (self-contained)
```

See [tests/README.md](tests/README.md) — every test there exists because
something actually broke during the build.

The SQLite database and uploaded files are created on first run under `data/`,
which is gitignored. Delete that folder to start over.

### Answers: rehearsal vs. real

With no API key the app runs in **rehearsal mode** — retrieval, citations, and
the "not in the materials" path are all real; only the answer prose is quoted
from the matched passage rather than written. The student view says so on
screen. It exists so the whole loop is demoable without spending anything.

For real answers, put a key in `.env.local`:

```
AI_API_KEY=sk-hc-v1-...
AI_BASE_URL=https://ai.hackclub.com/proxy/v1
AI_MODEL=~openai/gpt-mini-latest
```

The model is reached over an OpenAI-compatible API, so any gateway speaking
that format works; `AI_MODEL` is a plain string the gateway resolves, so
switching to `anthropic/claude-sonnet-5` is a one-line edit. Only
`AI_API_KEY` is required — the other two have defaults (`lib/model.ts`).

Nothing else changes — `lib/answer.ts` picks the path at request time.

### Connecting Canvas

Sandbox or test instances only. Add the domain and a personal access token
(Canvas → Account → Settings → New Access Token) to `.env.local`:

```
CANVAS_BASE_URL=your-sandbox.instructure.com
CANVAS_ACCESS_TOKEN=...
```

Then **Teacher → Sync from Canvas**, pick a course, and press Sync. Leave them
blank and that page explains what's missing; manual upload is unaffected either
way, and is still the fastest way to test without touching Canvas.

## How a Canvas course becomes lessons

`lib/canvas/plan.ts` maps the course the way a teacher would expect from
looking at it, then `lib/canvas/sync.ts` writes that plan:

| In Canvas | Becomes | Cited as |
| --- | --- | --- |
| Syllabus body | one lesson | `Syllabus`, or `Syllabus — Late work` when it has headings |
| Each assignment | one lesson | `Assignment details` |
| Each module | one lesson, holding the files its items point at | `Slide 4`, `Page 2`, `Module outline` |
| Files no module claims | one "Course files" lesson | `Slide 4`, `Page 2` |

Downloaded files go through the *same* parser as an upload, so nothing
downstream — chunks, retrieval, citations, the question log — can tell where a
lesson came from. Rich text (syllabus, assignment descriptions) is chunked by
heading so a long syllabus cites its own sections instead of repeating one
locator.

**Re-sync updates, it never duplicates.** A lesson is identified by
`(course, kind, item id)`, so renaming a module in Canvas updates that lesson
and keeps the questions students already asked about it. A file is re-read only
when Canvas's `updated_at` changed or the last read failed; a file deleted in
Canvas has its passages removed so it stops being answerable. A *lesson* whose
Canvas source disappeared is reported rather than deleted — deleting cascades
the teacher's question log, which is too much to lose to an unpublished module.

## Approval: the gate everything passes through

Every chunk is created `pending`, from manual upload and Canvas sync alike, and
the answer pipeline reads only `approved` ones. Three things make that a
guarantee rather than an intention:

- The default lives in the **column**, not in application code, so a new insert
  path added later would have to ask for approval in writing to bypass it.
- Flags and the pending default are set in `insertChunks`, the single function
  both content sources pass through.
- There is **no unfiltered chunk reader** for retrieval to reach for.
  `getApprovedChunks` is the only one; the review queue asks for a status by
  name. Deleting the old `getChunksForLesson` is what made the compiler point
  at every caller that needed thinking about.

A student asking about an unapproved lesson gets the ordinary "I don't have
that in the lesson materials" — the gate is server-side, so a hidden tab isn't
what's protecting anything.

### Triage flags

`lib/review/flags.ts` marks passages worth a second look. It is regex triage to
order a human's queue, **not** a classifier and not a decision — a flagged
passage is still pending, still fully readable, and still needs a person.

| Flag | Fires on |
| --- | --- |
| Answer key | "Answer:", "Correct response:", "Key:", "ANS:", marking schemes, and runs of consecutively numbered letter answers with no keyword at all |
| Rubric | The word rubric or a grading breakdown, or **two or more** point values |
| Private note | Accommodation/behaviour vocabulary next to something that reads like a student's first name; "confidential" and IEP/504 fire on their own |

Two calibration decisions carry most of the weight. A *single* point value
doesn't flag — every Canvas assignment carries "Points possible: 40", and
flagging all of them would put a flag on every synced assignment and make
"approve all unflagged" worthless. And a capitalised word is checked against a
stoplist before it counts as a name, or "Reading" and "Friday" read as students.

Because flags are computed on insert, opening a pre-Phase-3 database backfills
them once. Without that, existing content would read as "checked, nothing
found" when nothing had been checked, and bulk approval would wave an existing
answer key straight through.

## Knowing when to stop

Some questions aren't the bot's to answer however much material it has. Asking
for an extension, disputing a grade, anything personal, anything asking its
opinion of your work — for these it generates nothing at all and says so.

Two passes decide, deliberately different in kind:

**`lib/triage.ts`** reads the student's wording before any model call. The line
it draws is *grammatical, not topical*, which is what keeps it precise: "Can I
get an extension?" is a request for permission addressed to a teacher, "When is
this due?" is a question about the material. Both mention deadlines; only one
is the bot's. So the rules look for first-person requests and dispute language,
never for subject-matter keywords alone.

**The model's `needs_human` field** catches what wording can't settle. It rides
on the existing structured output rather than a second call — no extra latency
for a student waiting on a reply. When it fires, the model's answer text is
discarded rather than shown: if this is a question for a person, whatever it
wrote isn't ours to pass on.

Both exist because the app runs without an API key. A refusal that only works
when the bill is being paid isn't a safety property.

Order matters in `app/api/chat/route.ts`: **FAQ → triage → retrieval → model.**
FAQ goes first on purpose — if a teacher has written an answer to "can I get an
extension", their words outrank our redirect, because they've already made the
call it would hand back to them.

### What the teacher sees

Hand-offs land in the question log tagged with why — *Extension request*,
*About a grade*, *Personal — needs a reply*, *Wants an opinion*, *Not in the
materials* — behind a **Needs you** filter with a count. Flagged rows carry the
same marked left edge as a flagged review card, so "a person still has to deal
with this" looks the same everywhere in the app.

"Not in the materials" is grouped in as a hand-off too. It reads as a different
kind of problem — a gap in the content rather than a request — but it's still a
student who didn't get helped, and it's the signal that tells a teacher what to
upload next.

## How an answer is produced

0. **Approved only** (`lib/db/queries.ts`). Pending and rejected chunks never
   enter the candidate set, so they can't be ranked, prompted, or cited.
1. **FAQ first** (`lib/retrieval/faq-match.ts`). A teacher-approved answer beats
   a generated one and costs nothing. Matching scores the student's wording and
   the saved wording in both directions and takes the weaker score, so a short
   FAQ can't swallow every question that shares its subject.
2. **Retrieve** (`lib/retrieval/chunks.ts`). Under the context budget, the whole
   lesson goes through in document order. Over it, chunks are ranked by keyword
   overlap and trimmed. No embeddings — PHASE1_SPEC rules them out at this scale.
3. **Answer** (`lib/answer.ts`). Passages are numbered in the prompt and the
   model returns the numbers it used via a structured-output schema. Indices are
   mapped back to real chunks and anything out of range is dropped, so a
   fabricated citation can't reach a student.
4. **Log** (`lib/db/queries.ts`). Every exchange lands in the teacher's feed,
   carrying its outcome so hand-offs can be filtered out from answers.

## Layout

```
app/
  page.tsx              role picker
  student/              name picker, chat
  teacher/              lessons, review, questions, faq, canvas
  api/{chat,lessons}/   chat endpoint, status polling
  api/canvas/sync/      pull one Canvas course into lessons
  actions/              server actions (session, lessons, faq)
lib/
  canvas/               client (auth, pagination), plan (mapping), sync (writing)
  review/               content flags for the approval queue
  triage.ts             is this question ours to answer at all
  parsing/              pdf / docx / pptx / html → chunks with locators
  retrieval/            chunk selection, FAQ matching, tokenising
  db/                   schema + typed queries
  answer.ts             the one model-call seam
  prompt.ts             grounded system prompt + output schema
components/{student,teacher}/
```

## Notes

- **Citation locators are honest per format.** PPTX gives `Slide 4` from the
  slide's own filename; PDF gives `Page 2` from per-page text. A .docx has no
  pages until it's laid out, so it gets `Section 1` rather than a made-up page
  number.
- **Parsing is synchronous, after the redirect.** The teacher lands on the
  dashboard and watches the card go Processing → Ready. A file that can't be
  read is recorded as failed with its reason and doesn't take down the batch.
- **The access token goes to Canvas and nowhere else.** File downloads follow
  a pre-signed URL that often redirects to object storage; the token is sent
  only when the URL is still on the Canvas host, since an `Authorization`
  header turns a working S3 download into a 400.
- **One dead endpoint doesn't sink a sync.** A course with its Files tab hidden
  answers 401 for files alone; that becomes a warning on the report and the
  other three still come through.
- **A redirect isn't a failed answer, and doesn't look like one.** In the chat
  it gets a quiet gold rule down its left edge rather than the muted italic
  used for "not in the materials" — one is the bot handing you on, the other is
  it coming up empty.
- **A re-sync doesn't reopen settled questions.** Canvas content that hasn't
  changed keeps its approvals. A file Canvas says *has* changed is re-read from
  scratch, and its new chunks are pending again — new words need new consent.
- **Deleting a lesson is final.** It takes the lesson's files, passages,
  questions, and FAQs with it, plus the uploads on disk. The card asks first.
- **Students see their own history.** The chat rehydrates from the question
  log, so a refresh doesn't lose the conversation — and restored answers don't
  replay the margin-scrawl, which is reserved for an answer actually arriving.
- **Motion is one moment.** The margin citation is the only place with real
  animation, per DESIGN_GUIDE. Everything else is hover and focus states.
  All of it collapses to final-state-immediately under `prefers-reduced-motion`.

## Out of scope

Still out: OAuth/LTI (Phase 9 — a static token is deliberate here), real auth,
content-safety classifiers, rate limiting, multi-teacher support, and vector
search. See CLAUDE.md — if a change needs one of these, the scope has drifted.

Canvas **Pages** are named in a module's outline but their bodies aren't pulled;
that needs the `/pages` endpoint, which isn't in this phase's list.
