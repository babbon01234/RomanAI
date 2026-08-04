"use server";

import { revalidatePath } from "next/cache";
import {
  approveUnflagged,
  getLesson,
  setChunkApproval,
} from "@/lib/db/queries";
import { getRole } from "@/lib/session";
import type { ApprovalStatus } from "@/lib/types";

async function assertTeacher() {
  if ((await getRole()) !== "teacher") throw new Error("Teachers only.");
}

/**
 * Approving changes what students can be told, so every one of these paths
 * refreshes the student side too — a teacher who approves a lesson and hands
 * a phone to a student shouldn't be looking at a stale tab list.
 */
function refresh() {
  revalidatePath("/teacher/review");
  revalidatePath("/teacher");
  revalidatePath("/student/chat");
}

function readStatus(value: FormDataEntryValue | null): ApprovalStatus {
  const status = String(value ?? "");
  if (status === "approved" || status === "rejected" || status === "pending") {
    return status;
  }
  throw new Error(`Unknown approval status: ${status}`);
}

export async function decideChunk(formData: FormData) {
  await assertTeacher();

  const chunkId = String(formData.get("chunkId") ?? "");
  if (!chunkId) return;

  await setChunkApproval(chunkId, readStatus(formData.get("status")));
  refresh();
}

export async function approveUnflaggedAction(formData: FormData) {
  await assertTeacher();

  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId || !(await getLesson(lessonId))) return;

  await approveUnflagged(lessonId);
  refresh();
}
