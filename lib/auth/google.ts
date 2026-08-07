/**
 * Google's OAuth 2.0 authorization-code flow, called directly via `fetch` —
 * no SDK, same convention as `lib/canvas/client.ts`. The redirect URI is
 * derived from the request's own origin at call time rather than an env var,
 * so it just has to match whatever's registered in Google Cloud Console.
 */

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function googleConfig(): GoogleConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      "Google sign-in isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
    );
  }

  return { clientId, clientSecret };
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = googleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleConfig();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new GoogleAuthError(`Google rejected the sign-in (${response.status}).`);
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new GoogleAuthError("Couldn't read the Google profile.");
  }

  return response.json() as Promise<GoogleProfile>;
}
