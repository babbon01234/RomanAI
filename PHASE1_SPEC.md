# Phase 1 Spec — Core Q&A Engine (Dummy Auth, Manual Content)

## Goal
Prove that a teacher can add lesson/assignment content, a student can ask a
question about it in chat, and get an accurate, cited answer — without
needing Canvas, real auth, or real students yet.

## Dummy auth
- Landing screen: two buttons — "Continue as Teacher" and "Continue as
  Student." No password.
- Teacher path: goes straight into the teacher dashboard as a single fixed
  fake teacher (pick any placeholder name).
- Student path: before entering chat, show "Who are you?" with 4–5 fake
  student names (e.g. Alex, Jordan, Sam, Priya, Marcus) — used only to tag
  which log entries belong to which fake student, so the teacher dashboard
  has something realistic to look at.

## Teacher dashboard

**Lessons/assignments list**
Each entry: title, short description, one or more uploaded files.

**Add new lesson**
Form: title + description + file upload (PDF, PPTX, or DOCX). On upload:
1. Extract text from the file.
2. Chunk it — by slide for PPTX, by paragraph/section for PDF/DOCX — and tag
   each chunk with the lesson title + a locator ("Slide 4," "Page 2").
3. Store chunks tied to that lesson.
4. Show a status indicator: Processing → Ready.

**Question log**
A live feed/table of every question asked by any fake student: which lesson
it was about, the question, and the answer given. This is the teacher's
window into what's actually being asked — build it early, it's useful for
testing everything else too.

**FAQ manager**
From the question log, a one-click "Promote to FAQ" action on any question.
Teacher can edit the answer text before saving it as an official FAQ entry
tied to that lesson.

## Student chat

**Lesson picker**
Student selects which lesson/assignment they have a question about, pulled
from the teacher's list.

**FAQ shortcuts**
Above the chat input, show up to 5 FAQ entries for the selected lesson as
clickable chips. Clicking one shows the saved answer instantly — no API call.

**Chat flow, on submit:**
1. Check if the question closely matches an existing FAQ entry (basic
   keyword overlap is fine for Phase 1). If yes, return that instantly.
2. Otherwise, retrieve the relevant chunks for the selected lesson. If a
   lesson's total content is small, it's fine to just pass all of that
   lesson's chunks as context — don't build real vector search yet.
3. Call the Claude API with a system prompt instructing it to answer **only**
   from the provided chunks, and to say plainly "I don't have that in the
   lesson materials — ask your teacher" when the answer isn't in them.
4. Show the answer with a visible citation (e.g. "Source: Lesson 4, Slide
   7") pulled from the chunk's stored locator.
5. Log the Q&A pair (fake student name + lesson) for the teacher dashboard.

## Explicitly not in Phase 1
- No real embeddings/vector DB — keyword or full-context retrieval only.
- No content filtering/safety classifier — assume all uploaded content is
  fine for students to see (that's a later phase, on purpose).
- No rate limiting.
- No persistence guarantees beyond local SQLite — fine if data resets
  between deploys.

## Definition of done
You can: upload 2–3 real lesson files as the fake teacher, switch to a fake
student, ask 5–6 real questions about that lesson, get accurate cited
answers, and see all of that activity show up in the teacher's question log.
