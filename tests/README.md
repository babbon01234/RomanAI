# Tests

```sh
npm test          # unit tests — fast, no browser, no network
npm run test:e2e  # full loop in a real browser (needs the dev server + Chrome)
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

## Fixtures

`fixtures/` holds a real 4-slide `.pptx`, a `.docx`, a 2-page `.pdf`, and a
deliberately corrupt PDF for the failure path. They are small on purpose —
these test the *plumbing*. Testing against a real teacher's 40-slide deck is a
manual step, and the one most likely to surface something new.

## The end-to-end script

`e2e.mjs` drives the definition of done from PHASE1_SPEC in a real browser:
three uploads, questions from four students, correct citations, a refusal, the
teacher's log, promote-to-FAQ, and the promoted answer reaching a student as a
chip. It needs the dev server running on 5880 and Google Chrome installed
(it drives your existing Chrome — no browser download).
