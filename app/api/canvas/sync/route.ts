import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { CanvasClient, CanvasError } from "@/lib/canvas/client";
import { syncCourse } from "@/lib/canvas/sync";
import { getRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pulls one Canvas course into lessons. Idempotent: running it again on the
 * same course updates what it made last time rather than duplicating it.
 *
 * Returns once the lesson and file rows exist. Downloading and parsing carry
 * on in the background, which the dashboard already shows through the
 * Processing → Ready badges.
 */
export async function POST(request: Request) {
  if ((await getRole()) !== "teacher") {
    return NextResponse.json({ error: "Teachers only." }, { status: 403 });
  }

  let courseId: string;
  try {
    const body = (await request.json()) as { courseId?: unknown };
    courseId = String(body.courseId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!courseId) {
    return NextResponse.json({ error: "Pick a course first." }, { status: 400 });
  }

  try {
    const report = await syncCourse(CanvasClient.fromEnv(), courseId);

    revalidatePath("/teacher");
    revalidatePath("/teacher/canvas");

    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      { error: message(error) },
      // A Canvas-side problem is the teacher's to fix (bad token, wrong
      // course); anything else is ours.
      { status: error instanceof CanvasError ? 400 : 500 },
    );
  }
}

function message(error: unknown): string {
  if (error instanceof CanvasError) return error.message;
  return error instanceof Error ? error.message : "The sync failed.";
}
