"use server";

import { redirect } from "next/navigation";
import { clearSession, setRole, setStudentName } from "@/lib/session";

export async function continueAsTeacher() {
  await setRole("teacher");
  redirect("/teacher");
}

export async function continueAsStudent() {
  await setRole("student");
  redirect("/student");
}

export async function chooseStudent(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  await setStudentName(name);
  redirect("/student/chat");
}

export async function signOut() {
  await clearSession();
  redirect("/");
}
