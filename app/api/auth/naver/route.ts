import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  encodeReturnPath,
  getOAuthConfig,
  randomToken,
  safeRelativeReturnPath,
  shortLivedOAuthCookie,
} from "../../../auth";

export async function GET(request: Request) {
  const config = getOAuthConfig("naver");
  if (!config) return redirectToSignIn(request, "configuration", "naver");

  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const state = randomToken();
  const returnTo = safeRelativeReturnPath(url.searchParams.get("returnTo"));
  const callbackUrl = new URL("/api/auth/callback/naver", url.origin).toString();
  const authorizationUrl = new URL("https://nid.naver.com/oauth2.0/authorize");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizationUrl.searchParams.set("state", state);

  const headers = new Headers({ Location: authorizationUrl.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", shortLivedOAuthCookie(OAUTH_STATE_COOKIE, state, secure));
  headers.append("Set-Cookie", shortLivedOAuthCookie(OAUTH_RETURN_COOKIE, encodeReturnPath(returnTo), secure));
  return new Response(null, { status: 302, headers });
}

function redirectToSignIn(request: Request, error: string, provider: string) {
  const target = new URL("/signin", request.url);
  target.searchParams.set("error", error);
  target.searchParams.set("provider", provider);
  return Response.redirect(target, 302);
}
