import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GoogleAuthError,
  exchangeCodeForTokens,
  fetchGoogleProfile,
} from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import {
  createUserWithGoogle,
  findUserByEmail,
  findUserByGoogleId,
} from "@/lib/auth/users";

export const runtime = "nodejs";

const STATE_COOKIE = "oh_oauth_state";

function fail(origin: string, error: string) {
  return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error)}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  const jar = await cookies();
  const stored = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const [csrfToken, pendingRole] = (stored ?? "").split(":");
  if (!code || !returnedState || !stored || returnedState !== csrfToken) {
    return fail(url.origin, "That Google sign-in link expired. Try again.");
  }

  try {
    const redirectUri = `${url.origin}/api/auth/google/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const profile = await fetchGoogleProfile(tokens.access_token);

    let user = await findUserByGoogleId(profile.sub);
    if (!user) {
      const existing = await findUserByEmail(profile.email);
      if (existing) {
        // An email/password account already owns this address — Google
        // sign-in isn't a second door into someone else's account.
        return fail(url.origin, "That email already has a password sign-in. Use it instead.");
      }
      user = await createUserWithGoogle(
        profile.email,
        profile.name,
        pendingRole === "teacher" ? "teacher" : "student",
        profile.sub,
      );
    }

    await createSession(user.id);
    return NextResponse.redirect(
      `${url.origin}${user.role === "teacher" ? "/teacher" : "/student/chat"}`,
    );
  } catch (error) {
    const message = error instanceof GoogleAuthError ? error.message : "Google sign-in failed.";
    return fail(url.origin, message);
  }
}
