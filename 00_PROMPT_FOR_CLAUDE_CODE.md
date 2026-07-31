Read CLAUDE.md, PHASE1_SPEC.md, and DESIGN_GUIDE.md in this repo fully before
writing any code.

Then:

1. Propose the initial project scaffold — folder structure, package.json
   dependencies, base config — and show it to me before installing anything.

2. Once I confirm, build in this order, checking in briefly after each step
   with what to test and how:
   a. Dummy auth (teacher/student role picker, fake student list)
   b. Teacher: lesson creation + file upload + parsing + chunking, with a
      status indicator
   c. Chat retrieval engine + Claude API call with the grounded system
      prompt from PHASE1_SPEC.md
   d. Student chat UI, with citations shown in the margin per
      DESIGN_GUIDE.md
   e. FAQ layer (promote-to-FAQ from the teacher side, FAQ shortcuts on the
      student side, keyword-match-first logic before hitting the API)
   f. Teacher question log / dashboard view

3. Follow DESIGN_GUIDE.md deliberately for all UI — this should not look
   like a generic AI-generated dashboard. The handwritten-style margin
   citation is the one signature element; keep everything else disciplined
   around it.

3a. Check if there's an animation or motion-design skill available in this
    environment (for example one referring to "award winning animation" or
    "bespoke motion"). If one exists, use it for the UI's motion/animation
    work. If nothing like that is available, follow the "Motion &
    animation" section in DESIGN_GUIDE.md instead — don't block on this,
    just use whichever is actually there.

4. Stay strictly within PHASE1_SPEC.md scope. If you're about to build
   something CLAUDE.md marks out of scope, stop and tell me instead of
   proceeding.

I have limited time — two 8-hour days — so prioritize a working, demoable
core loop over polishing edge cases. The UI still needs to look genuinely
good, since that's part of what I'm demoing to a real teacher.
