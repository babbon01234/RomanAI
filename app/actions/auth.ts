"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { createSession, destroySession } from "@/lib/auth/session";
import { checkTeacherCode } from "@/lib/auth/teacher-code";
import { createUserWithPassword, findUserByEmail } from "@/lib/auth/users";
import type { Role } from "@/lib/types";

/** Short-lived proof that a teacher code was checked, for the Google detour. */
const TEACHER_OK_COOKIE = "oh_teacher_ok";

function fail(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

export async function signUpWithPassword(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role: Role = formData.get("role") === "teacher" ? "teacher" : "student";

  // Before anything else: becoming a teacher is the privileged path.
  if (role === "teacher") {
    const check = checkTeacherCode(String(formData.get("teacherCode") ?? ""));
    if (!check.ok) fail("/signup", check.error);
  }

  if (!name || !email || !password) fail("/signup", "Fill in every field.");
  if (password.length < 8) fail("/signup", "Password needs at least 8 characters.");
  if (await findUserByEmail(email)) fail("/signup", "That email already has an account.");

  const user = await createUserWithPassword(email, name, role, await hashPassword(password));
  await createSession(user.id);
  redirect(role === "teacher" ? "/teacher" : "/student/chat");
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await findUserByEmail(email);
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    fail("/", "Wrong email or password.");
  }

  await createSession(user.id);
  redirect(user.role === "teacher" ? "/teacher" : "/student/chat");
}

/**
 * Google signup for a teacher. The code is checked here, before we ever hand
 * off to Google, and the result is a short-lived httpOnly cookie the callback
 * route requires — so hitting /api/auth/google?role=teacher directly can't
 * mint a teacher account.
 */
export async function startTeacherGoogleSignup(formData: FormData): Promise<void> {
  const check = checkTeacherCode(String(formData.get("teacherCode") ?? ""));
  if (!check.ok) fail("/signup", check.error);

  (await cookies()).set(TEACHER_OK_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 10,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/api/auth/google?role=teacher");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
