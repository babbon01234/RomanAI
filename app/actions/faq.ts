"use server";

import { revalidatePath } from "next/cache";
import {
  createFaq,
  deleteFaq,
  getMessage,
  markMessagePromoted,
  updateFaq,
} from "@/lib/db/queries";
import { getRole } from "@/lib/session";

async function assertTeacher() {
  if ((await getRole()) !== "teacher") throw new Error("Teachers only.");
}

function refresh() {
  revalidatePath("/teacher/faq");
  revalidatePath("/teacher/questions");
}

/**
 * Promote a logged question into an official FAQ. The answer is copied as a
 * starting point — the teacher edits it in the FAQ manager before it's the
 * wording students see.
 */
export async function promoteToFaq(messageId: string) {
  await assertTeacher();

  const message = await getMessage(messageId);
  if (!message) throw new Error("No such question.");

  const faqId = await createFaq(message.lesson_id, message.question, message.answer);
  await markMessagePromoted(messageId, faqId);
  refresh();
}

export async function saveFaq(formData: FormData) {
  await assertTeacher();

  const id = String(formData.get("id") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();

  if (id && question && answer) await updateFaq(id, question, answer);
  refresh();
}

export async function removeFaq(formData: FormData) {
  await assertTeacher();
  await deleteFaq(String(formData.get("id") ?? ""));
  refresh();
}
