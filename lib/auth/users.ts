import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { Role, User } from "@/lib/types";

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email.toLowerCase()],
  });
  return (result.rows[0] as unknown as User) ?? null;
}

export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE google_id = ?",
    args: [googleId],
  });
  return (result.rows[0] as unknown as User) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as User) ?? null;
}

export async function createUserWithPassword(
  email: string,
  name: string,
  role: Role,
  passwordHash: string,
): Promise<User> {
  const id = randomUUID();
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)",
    args: [id, email.toLowerCase(), name, role, passwordHash],
  });
  return { id, email: email.toLowerCase(), name, role, password_hash: passwordHash, google_id: null, created_at: new Date().toISOString() };
}

export async function createUserWithGoogle(
  email: string,
  name: string,
  role: Role,
  googleId: string,
): Promise<User> {
  const id = randomUUID();
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO users (id, email, name, role, google_id) VALUES (?, ?, ?, ?, ?)",
    args: [id, email.toLowerCase(), name, role, googleId],
  });
  return { id, email: email.toLowerCase(), name, role, password_hash: null, google_id: googleId, created_at: new Date().toISOString() };
}
