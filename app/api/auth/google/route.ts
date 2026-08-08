import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, isGoogleConfigured } from "@/lib/auth/google";

export const runtime = "nodejs";

const STATE_COOKIE = "oh_oauth_state";
const TEACHER_OK_COOKIE = "oh_teacher_ok";

/**
 * Kicks off Google sign-in. `?role=teacher|student` only matters the first
 * time this email signs in — it's what a brand-new account gets created
 * with. Returning users get whatever role their account already has.
 *
 * `role=teacher` is honoured only when startTeacherGoogleSignup has already
 * checked the teacher code and left its cookie; anything else is downgraded
 * to a student, so this URL is not a way around the gate.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/?error=" + encodeURIComponent("Google sign-in isn't configured."), url.origin),
    );
  }

  const jar = await cookies();
  const teacherAuthorized = jar.get(TEACHER_OK_COOKIE)?.value === "1";
  jar.delete(TEACHER_OK_COOKIE);

  const role =
    url.searchParams.get("role") === "teacher" && teacherAuthorized
      ? "teacher"
      : "student";
  const csrfToken = randomBytes(16).toString("hex");

  jar.set(STATE_COOKIE, `${csrfToken}:${role}`, {
    path: "/",
    maxAge: 60 * 10,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const redirectUri = `${url.origin}/api/auth/google/callback`;
  return NextResponse.redirect(buildGoogleAuthUrl(redirectUri, csrfToken));
}
