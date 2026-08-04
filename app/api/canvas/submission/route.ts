import { NextResponse } from "next/server";
import { CanvasClient, CanvasError, isCanvasConfigured } from "@/lib/canvas/client";
import {
  NOT_GRADED_MESSAGES,
  buildBreakdown,
  type NotGradedReason,
} from "@/lib/canvas/rubric";
import { canvasIdFor } from "@/lib/canvas/students";
import { getLesson, logMessage } from "@/lib/db/queries";
import { explainGrade } from "@/lib/grade-explanation";
import { getRole, getStudentName } from "@/lib/session";
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Why did I lose points on this?"
 *
 * Pulls the teacher's real rubric assessment out of Canvas and restates it.
 * Nothing here grades, re-grades, or forms a view about the work — the model
 * downstream is handed structured data and told to translate it. When there is
 * no assessment to translate, this says so and stops; there is no path that
 * produces an explanation without the teacher's marks behind it.
 *
 * The student is taken from the session cookie, never from the request body:
 * a student must not be able to ask for somebody else's grades by editing a
 * payload, dummy auth or not.
 */

/** The question as it appears in the teacher's log. */
const ASKED = "Why did I lose points on this?";

export interface GradeResponse {
  id: string;
  answer: string;
  citations: Citation[];
  graded: boolean;
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

  let lessonId: string;
  try {
    const body = (await request.json()) as { lessonId?: unknown };
    lessonId = String(body.lessonId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const lesson = lessonId ? await getLesson(lessonId) : undefined;
  if (!lesson) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  if (lesson.canvas_kind !== "assignment" || !lesson.canvas_course_id) {
    return NextResponse.json(
      { error: "That isn't a Canvas assignment, so there's no grade to explain." },
      { status: 400 },
    );
  }

  if (!isCanvasConfigured()) {
    return NextResponse.json(
      { error: "Canvas isn't connected, so I can't look up your grade." },
      { status: 503 },
    );
  }

  const userId = canvasIdFor(studentName);
  if (!userId) {
    // A roster name nobody mapped to a sandbox account. Honest about why
    // rather than pretending the assignment isn't graded.
    return NextResponse.json(
      {
        error: `${studentName} isn't linked to a Canvas account in this sandbox, so I can't look up a submission.`,
      },
      { status: 400 },
    );
  }

  try {
    const client = CanvasClient.fromEnv();
    const courseId = lesson.canvas_course_id;
    const assignmentId = lesson.canvas_item_id ?? "";

    // Both are needed: the assessment carries points and comments keyed by
    // criterion id, and only the assignment knows what those criteria are.
    const [assignment, submission] = await Promise.all([
      client.getAssignment(courseId, assignmentId),
      client.getSubmission(courseId, assignmentId, userId),
    ]);

    const result = buildBreakdown(assignment, submission);

    if ("notGraded" in result) {
      return await handOff(lessonId, studentName, result.notGraded);
    }

    const explanation = await explainGrade(result.breakdown);

    const id = await logMessage({
      lessonId,
      studentName,
      question: ASKED,
      answer: explanation.text,
      citations: explanation.citations,
      source: "grade",
      outcome: "answered",
    });

    return NextResponse.json({
      id,
      answer: explanation.text,
      citations: explanation.citations,
      graded: true,
      provider: explanation.provider,
    } satisfies GradeResponse);
  } catch (error) {
    const message =
      error instanceof CanvasError
        ? error.message
        : "Couldn't reach Canvas to check your grade. Try again in a moment.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Nothing to restate. The student gets a plain reason, and the teacher sees it
 * in their log — a student asking about an ungraded assignment is worth
 * knowing about.
 */
async function handOff(
  lessonId: string,
  studentName: string,
  reason: NotGradedReason,
): Promise<NextResponse> {
  const answer = NOT_GRADED_MESSAGES[reason];

  const id = await logMessage({
    lessonId,
    studentName,
    question: ASKED,
    answer,
    citations: [],
    source: "grade",
    outcome: "needs_human",
    humanReason: "not-graded",
  });

  return NextResponse.json({
    id,
    answer,
    citations: [],
    graded: false,
    provider: "rehearsal",
  } satisfies GradeResponse);
}
