import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/types";

/**
 * Real sessions (Phase 9): an opaque token in an httpOnly cookie, backed by a
 * row in `sessions`. DB-backed rather than a signed JWT so sign-out actually
 * revokes the session instead of just discarding the client's copy — and it
 * needs no separate signing-secret env var.
 */

const SESSION_COOKIE = "oh_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString();

  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    args: [token, userId, expiresAt],
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/** The signed-in user, or null if there's no session or it's expired. */
export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.google_id,
                 u.created_at, s.expires_at AS session_expires_at
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ?`,
    args: [token],
  });
  const row = result.rows[0] as unknown as
    | (User & { session_expires_at: string })
    | undefined;
  if (!row) return null;

  if (new Date(row.session_expires_at).getTime() < Date.now()) {
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [token] });
    return null;
  }

  const { id, email, name, role, password_hash, google_id, created_at } = row;
  return { id, email, name, role, password_hash, google_id, created_at };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    const db = await getDb();
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [token] });
  }

  jar.delete(SESSION_COOKIE);
}
