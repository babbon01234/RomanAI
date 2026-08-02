"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UPLOAD_DIR } from "@/lib/db";
import { createLesson, deleteLesson, listFiles } from "@/lib/db/queries";
import { processPending, stageUpload } from "@/lib/processing";
import { getRole } from "@/lib/session";

export interface LessonFormState {
  error?: string;
}

export async function createLessonAction(
  _prev: LessonFormState,
  formData: FormData,
): Promise<LessonFormState> {
  if ((await getRole()) !== "teacher") return { error: "Teachers only." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!title) return { error: "Give the lesson a title." };
  if (files.length === 0) return { error: "Add at least one file." };

  const lessonId = createLesson(title, description);

  const pending = [];
  try {
    for (const file of files) pending.push(await stageUpload(lessonId, file));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }

  // Deliberately not awaited: the teacher lands on the dashboard immediately
  // and watches the card go Processing → Ready. processPending never rejects —
  // per-file failures are recorded as a failed status instead.
  void processPending(lessonId, pending);

  revalidatePath("/teacher");
  redirect("/teacher");
}

/**
 * Removes the lesson, everything cascading from it, and the uploaded files on
 * disk. Destructive and not undoable — the UI asks first.
 */
export async function deleteLessonAction(formData: FormData) {
  if ((await getRole()) !== "teacher") throw new Error("Teachers only.");

  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId) return;

  // Read the file list before the cascade removes the rows.
  const files = listFiles(lessonId);
  deleteLesson(lessonId);

  for (const file of files) {
    const onDisk = path.join(
      UPLOAD_DIR,
      `${file.id}${path.extname(file.filename)}`,
    );
    // A missing upload shouldn't fail the delete the teacher already asked for.
    await fs.rm(onDisk, { force: true }).catch(() => {});
  }

  revalidatePath("/teacher");
  revalidatePath("/teacher/questions");
  revalidatePath("/teacher/faq");
}
