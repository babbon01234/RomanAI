import "server-only";
import { destroySession, getSessionUser } from "@/lib/auth/session";
import type { Role } from "@/lib/types";

export type { Role };

/**
 * Phase 9: real accounts back these instead of a plain role/name cookie.
 * Signatures are unchanged from the old dummy auth on purpose — every route
 * and action that gates on `getRole()`/`getStudentName()` needed no changes
 * beyond how a session comes to exist. See lib/auth/session.ts for the
 * session itself and lib/auth/users.ts for the account records.
 */

export async function getRole(): Promise<Role | null> {
  const user = await getSessionUser();
  return user?.role ?? null;
}

export async function getStudentName(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.role === "student" ? user.name : null;
}

/** The signed-in user's display name, whichever role they are. */
export async function getUserName(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.name ?? null;
}

export async function clearSession(): Promise<void> {
  await destroySession();
}
