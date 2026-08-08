import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Who is allowed to become a teacher.
 *
 * Student signup is open — the account is the identity, and a student can
 * only ever read their own history. A *teacher* account is a different
 * thing: it approves chunks (the one gate that decides what reaches
 * students) and reads every question in the log, including the ones triage
 * flags as personal circumstances or grade disputes. Open teacher signup on
 * a public URL hands that to anyone who finds it.
 *
 * So the rule is deliberately asymmetric, and it fails closed in production:
 *
 *   - dev, no code set        → allowed, so local work needs no config
 *   - production, no code set → refused, so a deploy can't be wide open by
 *                               omission
 *   - code set (either)       → must match
 */

export function teacherSignupConfigured(): boolean {
  return Boolean(process.env.TEACHER_SIGNUP_CODE?.trim());
}

/** True in dev with no code configured — the only case where it's a free pass. */
export function teacherSignupOpen(): boolean {
  return process.env.NODE_ENV !== "production" && !teacherSignupConfigured();
}

export function checkTeacherCode(supplied: string): { ok: true } | { ok: false; error: string } {
  if (teacherSignupOpen()) return { ok: true };

  const expected = process.env.TEACHER_SIGNUP_CODE?.trim();
  if (!expected) {
    return {
      ok: false,
      error: "Teacher signup is closed. Ask whoever runs this to set TEACHER_SIGNUP_CODE.",
    };
  }

  const given = supplied.trim();
  if (!given) return { ok: false, error: "That teacher signup code is wrong." };

  // Compare in constant time so a wrong code can't be found a character at a
  // time. Buffers must match in length first — byteLength, not string length,
  // since a multi-byte character would otherwise throw here.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const match = a.byteLength === b.byteLength && timingSafeEqual(a, b);

  return match ? { ok: true } : { ok: false, error: "That teacher signup code is wrong." };
}
