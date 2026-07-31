# Project: Classroom Q&A Assistant — Phase 1 MVP

## What this is
An AI assistant that answers student questions about assignments and lessons,
grounded strictly in a teacher's own uploaded materials — never general
knowledge, never a guess. Full details in PHASE1_SPEC.md. Visual direction is
in DESIGN_GUIDE.md — follow it deliberately, this should not look like a
generic AI-generated dashboard.

## Where we are
This is Phase 1 of a larger project. Its only job is to prove the core loop
works and produce something demoable to a real teacher within two days.

It does **not** connect to Canvas, does **not** have real authentication, and
does **not** touch real student data. Everything in this phase runs on
fake/manually-uploaded content and a dummy login.

## Explicitly out of scope for this build — do not implement
- Canvas API or LTI integration
- Real login/authentication (passwords, sessions tied to real accounts)
- Content safety/filtering classifiers (answer-key detection, etc.)
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
  /teacher        → teacher dashboard routes
  /student        → student chat routes
  /api
    /upload       → file upload + parsing + chunking
    /chat         → question → retrieval → Claude API → answer
    /faq          → FAQ CRUD
    /log          → question/answer log for teacher view
/lib
  /parsing        → pdf/docx/pptx text extraction
  /db             → sqlite schema + queries
  /retrieval      → chunk matching / FAQ matching logic
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
