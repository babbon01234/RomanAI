import "server-only";
import { cookies } from "next/headers";
import { STUDENT_NAMES } from "@/lib/types";

/**
 * Dummy auth for Phase 1 — a role and a fake student name in a cookie. There
 * is no password, no account, and nothing here is a security boundary. The
 * student name exists only so the teacher's question log has a name attached.
 */

export type Role = "teacher" | "student";

const ROLE_COOKIE = "oh_role";
const NAME_COOKIE = "oh_student";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function getRole(): Promise<Role | null> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  return value === "teacher" || value === "student" ? value : null;
}

export async function getStudentName(): Promise<string | null> {
  const value = (await cookies()).get(NAME_COOKIE)?.value;
  // Only ever trust a name from the known roster.
  return value && STUDENT_NAMES.includes(value) ? value : null;
}

/** Write-only helpers — callable from Server Actions and Route Handlers. */

export async function setRole(role: Role): Promise<void> {
  (await cookies()).set(ROLE_COOKIE, role, { path: "/", maxAge: MAX_AGE });
}

export async function setStudentName(name: string): Promise<void> {
  if (!STUDENT_NAMES.includes(name)) throw new Error(`Unknown student: ${name}`);
  (await cookies()).set(NAME_COOKIE, name, { path: "/", maxAge: MAX_AGE });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ROLE_COOKIE);
  jar.delete(NAME_COOKIE);
}
