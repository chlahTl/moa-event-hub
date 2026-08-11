import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  clearAuthCookie,
  decodeReturnPath,
  establishOAuthSession,
  getOAuthConfig,
  readCookie,
  sessionCookie,
} from "../../../../auth";

type NaverTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
};

type NaverProfileResponse = {
  resultcode?: string;
  response?: {
    id?: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const config = getOAuthConfig("naver");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request.headers, OAUTH_STATE_COOKIE);
  const returnTo = decodeReturnPath(readCookie(request.headers, OAUTH_RETURN_COOKIE));
  const code = url.searchParams.get("code");

  if (url.searchParams.get("error")) return authFailure(request, "cancelled", secure);
  if (!config || !state || !expectedState || state !== expectedState || !code) {
    return authFailure(request, "invalid", secure);
  }

  try {
    const callbackUrl = new URL("/api/auth/callback/naver", url.origin).toString();
    const tokenResponse = await fetch("https://nid.naver.com/oauth2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        state,
        redirect_uri: callbackUrl,
      }),
    });
    if (!tokenResponse.ok) throw new Error("naver-token-exchange-failed");
    const tokens = await tokenResponse.json() as NaverTokenResponse;
    if (!tokens.access_token || tokens.error) throw new Error("naver-token-missing");

    const profileResponse = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error("naver-profile-failed");
    const profilePayload = await profileResponse.json() as NaverProfileResponse;
    const profile = profilePayload.response;
    const email = profile?.email?.trim().toLowerCase() ?? "";
    if (profilePayload.resultcode !== "00" || !profile?.id || !email) {
      throw new Error("naver-profile-invalid");
    }

    const rawSessionToken = await establishOAuthSession({
      provider: "naver",
      subject: profile.id,
      email,
      displayName: profile.name?.trim() || profile.nickname?.trim() || email.split("@", 1)[0],
      avatarUrl: profile.profile_image?.trim() || null,
    });
    const headers = new Headers({ Location: new URL(returnTo, url.origin).toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookie(rawSessionToken, secure));
    appendOAuthCookieClears(headers, secure);
    return new Response(null, { status: 302, headers });
  } catch {
    return authFailure(request, "failed", secure);
  }
}

function authFailure(request: Request, error: string, secure: boolean) {
  const target = new URL("/signin", request.url);
  target.searchParams.set("error", error);
  target.searchParams.set("provider", "naver");
  const headers = new Headers({ Location: target.toString(), "Cache-Control": "no-store" });
  appendOAuthCookieClears(headers, secure);
  return new Response(null, { status: 302, headers });
}

function appendOAuthCookieClears(headers: Headers, secure: boolean) {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_RETURN_COOKIE]) {
    headers.append("Set-Cookie", clearAuthCookie(name, secure));
  }
}
