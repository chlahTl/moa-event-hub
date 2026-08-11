import {
  OAUTH_NONCE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  encodeReturnPath,
  getGoogleOAuthConfig,
  randomToken,
  safeRelativeReturnPath,
  sha256Base64Url,
  shortLivedOAuthCookie,
} from "../../../auth";

export async function GET(request: Request) {
  const config = getGoogleOAuthConfig();
  if (!config) return redirectToSignIn(request, "configuration");

  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const state = randomToken();
  const verifier = randomToken(48);
  const nonce = randomToken();
  const returnTo = safeRelativeReturnPath(url.searchParams.get("returnTo"));
  const callbackUrl = new URL("/api/auth/callback/google", url.origin).toString();
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", await sha256Base64Url(verifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("prompt", "select_account");

  const headers = new Headers({ Location: authorizationUrl.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", shortLivedOAuthCookie(OAUTH_STATE_COOKIE, state, secure));
  headers.append("Set-Cookie", shortLivedOAuthCookie(OAUTH_VERIFIER_COOKIE, verifier, secure));
  headers.append("Set-Cookie", shortLivedOAuthCookie(OAUTH_NONCE_COOKIE, nonce, secure));
  headers.append("Set-Cookie", shortLivedOAuthCookie(OAUTH_RETURN_COOKIE, encodeReturnPath(returnTo), secure));
  return new Response(null, { status: 302, headers });
}

function redirectToSignIn(request: Request, error: string) {
  const target = new URL("/signin", request.url);
  target.searchParams.set("error", error);
  return Response.redirect(target, 302);
}
