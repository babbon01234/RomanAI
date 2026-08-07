import { NextResponse } from "next/server";
import { activeProvider, answerQuestion } from "@/lib/answer";
import {
  getLesson,
  listFaqs,
  listFiles,
  logMessage,
} from "@/lib/db/queries";
import { selectChunks } from "@/lib/retrieval/chunks";
import { matchFaq } from "@/lib/retrieval/faq-match";
import { getRole, getStudentName } from "@/lib/session";
import { REDIRECTS, triageQuestion, type HumanReason } from "@/lib/triage";
import type { Citation, Outcome } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ChatResponse {
  id: string;
  answer: string;
  citations: Citation[];
  found: boolean;
  source: "faq" | "model";
  /** "needs_human" means nothing was generated — the student was sent on. */
  outcome: Outcome;
  humanReason: HumanReason | null;
  provider: "model" | "rehearsal";
}

export async function POST(request: Request) {
  if ((await getRole()) !== "student") {
    return NextResponse.json({ error: "Students only." }, { status: 403 });
  }

  const studentName = await getStudentName();
  if (!studentName) {
    return NextResponse.json({ error: "Pick your name first." }, { status: 403 });
  }

  const body = (await request.json()) as { lessonId?: string; question?: string };
  const lessonId = body.lessonId?.trim();
  const question = body.question?.trim();

  if (!lessonId || !question) {
    return NextResponse.json(
      { error: "Pick a lesson and ask a question." },
      { status: 400 },
    );
  }

  const lesson = await getLesson(lessonId);
  if (!lesson) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  // FAQ first, and before triage too. If a teacher has written an answer to
  // "can I get an extension", their words outrank our redirect — they've
  // already made the call this would otherwise hand back to them.
  const faq = matchFaq(question, await listFaqs(lessonId));
  if (faq) {
    const id = await logMessage({
      lessonId,
      studentName,
      question,
      answer: faq.answer,
      citations: [],
      source: "faq",
    });

    return NextResponse.json({
      id,
      answer: faq.answer,
      citations: [],
      found: true,
      source: "faq",
      outcome: "answered",
      humanReason: null,
      provider: activeProvider(),
    } satisfies ChatResponse);
  }

  /**
   * Classify before answering. This pass reads the student's wording only —
   * it doesn't need the lesson, doesn't call the model, and works with no API
   * key. When it fires we return without generating anything at all, which is
   * the point: there is no answer to be tempted into guessing at.
   */
  const triage = triageQuestion(question);
  if (triage.needsHuman && triage.reason) {
    // A grade question on a Canvas assignment has somewhere better to go than
    // the teacher's inbox: Phase 7's explanation reads out their actual rubric
    // marks. Without this the app contradicts itself — typing "why did I lose
    // points" is refused while the button right below answers it.
    const extra =
      triage.reason === "grade" && lesson.canvas_kind === "assignment"
        ? " If you just want to know where the points went, the “Why did I lose points on this?” button below shows your teacher's own rubric notes."
        : "";

    return await handOff(lessonId, studentName, question, triage.reason, undefined, extra);
  }

  const { chunks } = await selectChunks(lessonId, question);
  const filenames = new Map((await listFiles(lessonId)).map((f) => [f.id, f.filename]));

  let answer;
  try {
    answer = await answerQuestion({
      question,
      lessonTitle: lesson.title,
      chunks,
      filenames,
    });
  } catch (error) {
    console.error("chat: answering failed", error);
    return NextResponse.json(
      { error: "Couldn’t get an answer just now. Try again." },
      { status: 502 },
    );
  }

  // The model's own read, for what wording alone couldn't settle. Its answer
  // text is discarded rather than shown — if this is a question for a person,
  // whatever it wrote isn't ours to pass on.
  if (answer.needsHuman) {
    return await handOff(lessonId, studentName, question, "subjective");
  }

  // Material that doesn't cover the question is also a question for a person.
  // The student sees the same wording as before; what changed is that the
  // teacher now sees it in their log as something waiting on them.
  if (!answer.found) {
    return await handOff(lessonId, studentName, question, "not-covered", answer.provider);
  }

  // Log every exchange — this is the teacher's window into what's being asked.
  const id = await logMessage({
    lessonId,
    studentName,
    question,
    answer: answer.text,
    citations: answer.citations,
    source: "model",
    outcome: "answered",
  });

  return NextResponse.json({
    id,
    answer: answer.text,
    citations: answer.citations,
    found: answer.found,
    source: "model",
    outcome: "answered",
    humanReason: null,
    provider: answer.provider,
  } satisfies ChatResponse);
}

/**
 * Hand the question back. Nothing is generated, nothing is cited, and the log
 * entry carries the reason so the teacher can scan for what needs them.
 */
async function handOff(
  lessonId: string,
  studentName: string,
  question: string,
  reason: HumanReason,
  provider = activeProvider(),
  /** Appended to the standard redirect when there's somewhere else to point. */
  extra = "",
): Promise<NextResponse> {
  const answer = REDIRECTS[reason] + extra;

  const id = await logMessage({
    lessonId,
    studentName,
    question,
    answer,
    citations: [],
    source: "model",
    outcome: "needs_human",
    humanReason: reason,
  });

  return NextResponse.json({
    id,
    answer,
    citations: [],
    found: false,
    source: "model",
    outcome: "needs_human",
    humanReason: reason,
    provider,
  } satisfies ChatResponse);
}
