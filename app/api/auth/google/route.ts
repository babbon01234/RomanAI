import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, isGoogleConfigured } from "@/lib/auth/google";

export const runtime = "nodejs";

const STATE_COOKIE = "oh_oauth_state";

/**
 * Kicks off Google sign-in. `?role=teacher|student` only matters the first
 * time this email signs in — it's what a brand-new account gets created
 * with. Returning users get whatever role their account already has.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/?error=" + encodeURIComponent("Google sign-in isn't configured."), url.origin),
    );
  }

  const role = url.searchParams.get("role") === "teacher" ? "teacher" : "student";
  const csrfToken = randomBytes(16).toString("hex");

  (await cookies()).set(STATE_COOKIE, `${csrfToken}:${role}`, {
    path: "/",
    maxAge: 60 * 10,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const redirectUri = `${url.origin}/api/auth/google/callback`;
  return NextResponse.redirect(buildGoogleAuthUrl(redirectUri, csrfToken));
}
