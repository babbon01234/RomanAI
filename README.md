# Office Hours — Phase 1

An assistant that answers students' questions about a lesson using only the
teacher's own uploaded materials, and shows exactly where each answer came
from. Scope and constraints are in [CLAUDE.md](CLAUDE.md),
[PHASE1_SPEC.md](PHASE1_SPEC.md), and [DESIGN_GUIDE.md](DESIGN_GUIDE.md).

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

The SQLite database and uploaded files are created on first run under `data/`,
which is gitignored. Delete that folder to start over.

### Answers: rehearsal vs. real

With no API key the app runs in **rehearsal mode** — retrieval, citations, and
the "not in the materials" path are all real; only the answer prose is quoted
from the matched passage rather than written. The student view says so on
screen. It exists so the whole loop is demoable without spending anything.

For real answers, put a key in `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

Nothing else changes — `lib/answer.ts` picks the path at request time.

## How an answer is produced

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
4. **Log** (`lib/db/queries.ts`). Every exchange lands in the teacher's feed.

## Layout

```
app/
  page.tsx              role picker
  student/              name picker, chat
  teacher/              lessons, questions, faq
  api/{chat,lessons}/   chat endpoint, status polling
  actions/              server actions (session, lessons, faq)
lib/
  parsing/              pdf / docx / pptx → chunks with locators
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
- **Motion is one moment.** The margin citation is the only place with real
  animation, per DESIGN_GUIDE. Everything else is hover and focus states.
  All of it collapses to final-state-immediately under `prefers-reduced-motion`.

## Out of scope for Phase 1

Canvas/LTI, real auth, content-safety classifiers, rate limiting, multi-teacher
support, and vector search. See CLAUDE.md — if a change needs one of these,
the scope has drifted.
