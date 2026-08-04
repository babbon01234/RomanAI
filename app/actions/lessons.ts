"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createLesson, deleteLesson, listFiles } from "@/lib/db/queries";
import { deleteBlobs, processPending, stageUpload } from "@/lib/processing";
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

  const lessonId = await createLesson(title, description);

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
 * Removes the lesson, everything cascading from it, and the uploaded files in
 * Blob storage. Destructive and not undoable — the UI asks first.
 */
export async function deleteLessonAction(formData: FormData) {
  if ((await getRole()) !== "teacher") throw new Error("Teachers only.");

  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId) return;

  // Read the file list before the cascade removes the rows.
  const files = await listFiles(lessonId);
  await deleteLesson(lessonId);

  const blobUrls = files
    .map((f) => f.blob_url)
    .filter((url): url is string => Boolean(url));
  await deleteBlobs(blobUrls);

  revalidatePath("/teacher");
  revalidatePath("/teacher/questions");
  revalidatePath("/teacher/faq");
}
