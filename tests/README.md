# Tests

```sh
npm test             # unit tests — fast, no browser, no network
npm run test:e2e     # Phase 1 loop in a real browser (needs the dev server + Chrome)
npm run test:canvas  # Phase 2 loop against a stub Canvas API (self-contained)
```

`npm test` uses Node's built-in test runner, so there is nothing to install.

## What's covered and why

Each of these exists because something actually broke during the build, not
because the file looked untested:

| File | Guards against |
| --- | --- |
| `faq-match.test.ts` | A saved answer going to the wrong question. "When is the lab report due?" and "Is the lab report graded?" share two of three terms, and the term they differ on is the whole question — a loose threshold returned the due date to a student asking about grading. |
| `retrieval.test.ts` | A wrong margin note. A passage sharing one incidental word ("lab") rode along as a second citation, and the citation is the product's entire promise. |
| `parsing.test.ts` | Citations that don't match the file. Slide and page numbers must come from the document, and a `.docx` must not claim page numbers it doesn't have. |
| `chunking.test.ts` | Split passages losing their locator, and long text splitting mid-sentence. |
| `triage.test.ts` | Deflecting a question the bot should have answered. A miss just falls through to the model's own `needs_human` field; a false positive tells a student asking about their homework to go bother their teacher, so the negatives carry more weight than the positives here — "how is this graded", "what file extension should I use", and "how much time do we get for the exam" all have to survive. Two live bugs came out of it: an adverb ("I'm *really* struggling") broke the personal rule, and `\b\.docx` can never match, because there's no word boundary between a space and a dot. |
| `review.test.mts` | The approval gate leaking. Content answerable before anyone approved it, a rejected answer key still reachable by asking in its own words, bulk approval overturning a teacher's decision or waving through a flagged passage, and a pre-Phase-3 database coming back with its old content silently unflagged. Also the two flag calibrations that matter: a lone "Points possible: 40" must not flag, and "Reading" must not read as a student's name. |
| `canvas.test.mts` | Re-sync duplicating a course instead of updating it — the failure that would make the feature unusable on the second press. Also: a course silently truncated at its first page of files, the access token following a redirect to S3, and `Intl` rejecting the due-date format (that one was real, and broke every assignment). |

## Fixtures

`fixtures/` holds a real 4-slide `.pptx`, a `.docx`, a 2-page `.pdf`, and a
deliberately corrupt PDF for the failure path. They are small on purpose —
these test the *plumbing*. Testing against a real teacher's 40-slide deck is a
manual step, and the one most likely to surface something new.

## The end-to-end scripts

`e2e.mjs` drives the definition of done from PHASE1_SPEC in a real browser, now
through the later phases' gates: three uploads → **all held for review** →
the teacher clears them from the review queue with "Approve all unflagged" →
questions from five students with correct citations, a refusal, and an
extension request handed back → the teacher's log with both hand-offs behind
the "needs you" filter → promote-to-FAQ → the promoted answer reaching a
student as a chip.

It needs the dev server running on 5880 and Google Chrome installed (it drives
your existing Chrome — no browser download). Point `BASE_URL` elsewhere to run
it against a throwaway server instead of writing to `data/`.

This is the only thing that exercises the review queue's buttons — the unit
tests cover `approveUnflagged` directly, and `canvas-e2e.mjs` writes approval
decisions straight to the column, so without this nothing would catch the
Approve button coming unwired.

`canvas-e2e.mjs` drives the Phase 2, 3 *and* 4 definitions of done without a
Canvas account. It stands up a stub Canvas API on 5901 serving the four
endpoints the sync reads plus the real `.pptx` fixture, builds and starts the
app on 5902 against a throwaway database, then uses the actual HTTP routes:
sync → lessons populate → **a student asking before approval gets nothing** →
approve the unflagged and reject the flagged → the deck's slide numbers reach a
student's citation while the rejected answer key stays unreachable even when
asked for in its own words → re-sync adds nothing and doesn't reopen approvals.

Phase 4 then asks that same lesson for an extension and a grade fix (both
declined, both flagged), and for the format (answered and cited), and reads the
teacher's log **as a rendered page** to confirm the two hand-offs show up under
"Needs you" and the answered one doesn't.

The stub course's assignment carries a deliberate answer-key section and a
stated file format, so the flagging, the gate, the citation path, and both
halves of the triage are all exercised on one lesson. It builds its own copy
and never touches `data/` or your real Canvas credentials, so it's safe to run
while the dev server is up.

Once you have real sandbox credentials, the thing worth doing by hand is the
one this can't fake: a course whose modules, file names and slide decks are
messier than a fixture.
