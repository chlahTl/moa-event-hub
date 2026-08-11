import {
  OAUTH_NONCE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  clearAuthCookie,
  decodeReturnPath,
  establishOAuthSession,
  getOAuthConfig,
  readCookie,
  sessionCookie,
} from "../../../../auth";

type GoogleTokenResponse = { access_token?: string; id_token?: string };
type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const config = getOAuthConfig("google");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request.headers, OAUTH_STATE_COOKIE);
  const verifier = readCookie(request.headers, OAUTH_VERIFIER_COOKIE);
  const expectedNonce = readCookie(request.headers, OAUTH_NONCE_COOKIE);
  const returnTo = decodeReturnPath(readCookie(request.headers, OAUTH_RETURN_COOKIE));
  const code = url.searchParams.get("code");

  if (url.searchParams.get("error")) return authFailure(request, "cancelled", secure);
  if (!config || !state || !expectedState || state !== expectedState || !verifier || !expectedNonce || !code) {
    return authFailure(request, "invalid", secure);
  }

  try {
    const callbackUrl = new URL("/api/auth/callback/google", url.origin).toString();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl,
      }),
    });
    if (!tokenResponse.ok) throw new Error("google-token-exchange-failed");
    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokens.access_token || !tokens.id_token) throw new Error("google-token-missing");
    validateIdTokenClaims(tokens.id_token, expectedNonce, config.clientId);

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error("google-profile-failed");
    const profile = await profileResponse.json() as GoogleUserInfo;
    const email = profile.email?.trim().toLowerCase() ?? "";
    if (!profile.sub || !email || profile.email_verified !== true) {
      throw new Error("google-profile-invalid");
    }

    const rawSessionToken = await establishOAuthSession({
      provider: "google",
      subject: profile.sub,
      email,
      displayName: profile.name?.trim() || email.split("@", 1)[0],
      avatarUrl: profile.picture?.trim() || null,
    });

    const headers = new Headers({ Location: new URL(returnTo, url.origin).toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookie(rawSessionToken, secure));
    appendOAuthCookieClears(headers, secure);
    return new Response(null, { status: 302, headers });
  } catch {
    return authFailure(request, "failed", secure);
  }
}

function validateIdTokenClaims(idToken: string, nonce: string, clientId: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("invalid-id-token");
  const normalized = parts[1].replaceAll("-", "+").replaceAll("_", "/");
  const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as {
    aud?: string;
    exp?: number;
    iss?: string;
    nonce?: string;
  };
  if (payload.aud !== clientId || payload.nonce !== nonce) throw new Error("invalid-id-token-claims");
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new Error("invalid-id-token-issuer");
  }
  if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new Error("expired-id-token");
}

function authFailure(request: Request, error: string, secure: boolean) {
  const target = new URL("/signin", request.url);
  target.searchParams.set("error", error);
  const headers = new Headers({ Location: target.toString(), "Cache-Control": "no-store" });
  appendOAuthCookieClears(headers, secure);
  return new Response(null, { status: 302, headers });
}

function appendOAuthCookieClears(headers: Headers, secure: boolean) {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_NONCE_COOKIE, OAUTH_RETURN_COOKIE]) {
    headers.append("Set-Cookie", clearAuthCookie(name, secure));
  }
}
