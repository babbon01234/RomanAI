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
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ChatResponse {
  id: string;
  answer: string;
  citations: Citation[];
  found: boolean;
  source: "faq" | "model";
  provider: "anthropic" | "rehearsal";
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

  const lesson = getLesson(lessonId);
  if (!lesson) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  // FAQ first. A teacher-approved answer beats a generated one, and it costs
  // nothing — so this runs before any retrieval or model call.
  const faq = matchFaq(question, listFaqs(lessonId));
  if (faq) {
    const id = logMessage({
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
      provider: activeProvider(),
    } satisfies ChatResponse);
  }

  const { chunks } = selectChunks(lessonId, question);
  const filenames = new Map(listFiles(lessonId).map((f) => [f.id, f.filename]));

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

  // Log every exchange — this is the teacher's window into what's being asked.
  const id = logMessage({
    lessonId,
    studentName,
    question,
    answer: answer.text,
    citations: answer.citations,
    source: "model",
  });

  return NextResponse.json({
    id,
    answer: answer.text,
    citations: answer.citations,
    found: answer.found,
    source: "model",
    provider: answer.provider,
  } satisfies ChatResponse);
}
