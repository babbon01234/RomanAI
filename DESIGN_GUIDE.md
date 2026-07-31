# Design Guide — "Office Hours" Direction

Don't build a generic SaaS admin dashboard. Follow this direction, adapt
details as needed, but keep the intent: this should feel like getting real
help from a teacher's desk, not like enterprise software.

## Grounding
Two very different audiences: a teacher managing a class from a desk, and a
student casually asking a question from a phone between homework. Design for
both — the student view should feel light and fast, the teacher view should
feel organized and trustworthy, and neither should feel like a reskin of the
other.

## Avoid these defaults
Current AI-generated design tends to cluster around three looks — don't
default into any of them:
1. Cream background + high-contrast serif + terracotta accent
2. Near-black background + single neon/acid accent
3. Broadsheet/newspaper hairline-rule columns

## Token system

**Color**
- Ink Navy `#1B2A4A` — headers, nav, primary text on light surfaces
- Parchment `#FAF6ED` — main content background
- Chalk Gold `#D4A657` — primary accent, CTAs, active states
- Sage `#6B8F71` — success/approved states (e.g. "Ready," FAQ promoted)
- Charcoal `#2B2B2B` — body text

**Type**
- Display (headings): a serif with real character — Fraunces or Lora
- Body: a clean, highly legible sans — Inter or IBM Plex Sans
- Annotation face: a handwriting-style font — Kalam or Caveat — used *only*
  for citation/source tags, never for real content. This is deliberate, see
  Signature below.

## Layout concept

**Student chat**
Main column is the chat itself, styled like a page in a notebook. A slim
right-hand margin column shows citations as they appear, styled like
handwritten margin notes with a slight tilt, connected to the relevant chat
bubble by a thin leader line. The lesson picker sits as tabs across the top,
like divider tabs in a binder.

```
[ Lesson 1 | Lesson 2 | Lesson 3 ]
+----------------------------+  +--------------+
| student: when's this due?  |  | "Slide 7" ✎  |
| bot: Friday at 11:59pm...  |  |  ~ tilted     |
|                            |  |    note       |
| [ FAQ chip ] [ FAQ chip ]  |  +--------------+
| [ ask a question...      ]|
+----------------------------+
```

**Teacher dashboard**
Lessons as index cards in a grid (title, file count, status badge). Question
log as a running feed below. FAQ manager as a simple two-column editor
(question → answer).

```
+--------+ +--------+ +--------+
| Lesson | | Lesson | | Lesson |
| card   | | card   | | card   |
+--------+ +--------+ +--------+

Recent questions
------------------------------
Alex   | Lesson 2 | "when's..." | [Promote to FAQ]
Priya  | Lesson 1 | "do we..."  | [Promote to FAQ]
```

## Signature element
The handwritten-style margin citation is the one memorable thing this
product does visually. It makes the core promise — "every answer is grounded
in real material, here's exactly where" — tangible at a glance. Keep
everything else disciplined and quiet so this stands out; don't compete with
it elsewhere in the UI.

## Copy voice
- Direct, plain, written from the person's side of the screen: "Ask about
  this lesson," not "Query the knowledge base."
- Empty states are invitations to act: e.g., no lesson selected yet → "Pick a
  lesson above to start asking questions."
- When the bot doesn't know something, it says so plainly and points to the
  teacher — never hedges vaguely.

## Motion & animation
Check whether an animation-specific skill (e.g. one referencing "award
winning animation" or "bespoke motion") is available in this environment. If
one exists, use it for implementation details. If not, follow this instead:

- Leverage motion deliberately, not everywhere. One orchestrated moment
  lands harder than scattered effects on every element.
- The signature moment: when a citation appears, animate the margin note
  sliding/settling into place with a slight tilt, as if it were just
  scrawled in — this is the one place to spend real animation effort, since
  it's the visual signature of the whole product.
- Chat messages: a simple, quick fade/slide-in as they appear — nothing
  bouncy or attention-seeking.
- FAQ chips and lesson tabs: subtle hover/press states only (scale or
  color shift), no motion on load.
- Teacher dashboard status badges (Processing → Ready): a small, quiet
  transition when the state changes — not a celebratory animation, this is
  a utility signal, not a delight moment.
- Respect `prefers-reduced-motion` throughout — disable non-essential
  motion when it's set.
- If in doubt, cut it. Extra animation reads as AI-generated more than it
  reads as polished. Spend the "boldness budget" on the margin-note
  signature and keep everything else calm.

## Quality floor
- Responsive down to mobile — students are more likely to use this on a
  phone than a laptop.
- Visible keyboard focus states.
- Respect reduced-motion preferences.
- One deliberate signature (the margin citations), not decoration scattered
  everywhere else.
