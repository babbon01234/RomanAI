"use server";

import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { createSession, destroySession } from "@/lib/auth/session";
import { createUserWithPassword, findUserByEmail } from "@/lib/auth/users";
import type { Role } from "@/lib/types";

function fail(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}

export async function signUpWithPassword(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role: Role = formData.get("role") === "teacher" ? "teacher" : "student";

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

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
