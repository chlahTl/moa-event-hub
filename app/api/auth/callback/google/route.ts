import { and, eq, isNull, lt } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../../db";
import { authSessions, events, oauthAccounts, users } from "../../../../../db/schema";
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  OAUTH_NONCE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  clearAuthCookie,
  decodeReturnPath,
  getGoogleOAuthConfig,
  randomToken,
  readCookie,
  sessionCookie,
  sha256Hex,
} from "../../../../auth";

const LEGACY_OWNER_EMAIL = "choewonhyeog387@gmail.com";

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
  const config = getGoogleOAuthConfig();
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

    const user = await upsertGoogleUser({
      subject: profile.sub,
      email,
      displayName: profile.name?.trim() || email.split("@", 1)[0],
      avatarUrl: profile.picture?.trim() || null,
    });
    const rawSessionToken = randomToken(48);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const db = getDb();
    await db.delete(authSessions).where(lt(authSessions.expiresAt, now.toISOString()));
    await db.insert(authSessions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await sha256Hex(rawSessionToken),
      expiresAt,
      lastSeenAt: now.toISOString(),
    });
    if (email === LEGACY_OWNER_EMAIL) {
      await db.update(events).set({ ownerUserId: user.id }).where(isNull(events.ownerUserId));
    }

    const headers = new Headers({ Location: new URL(returnTo, url.origin).toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookie(rawSessionToken, secure));
    appendOAuthCookieClears(headers, secure);
    return new Response(null, { status: 302, headers });
  } catch {
    return authFailure(request, "failed", secure);
  }
}

async function upsertGoogleUser(input: {
  subject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  await ensureDatabase();
  const db = getDb();
  const [existing] = await db.select({ user: users }).from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, input.subject)))
    .limit(1);
  const now = new Date().toISOString();
  if (existing) {
    const [user] = await db.update(users).set({
      displayName: input.displayName,
      email: input.email,
      avatarUrl: input.avatarUrl,
      updatedAt: now,
    }).where(eq(users.id, existing.user.id)).returning();
    await db.update(oauthAccounts).set({ email: input.email, updatedAt: now })
      .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, input.subject)));
    return user;
  }

  const userId = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id: userId,
    displayName: input.displayName,
    email: input.email,
    avatarUrl: input.avatarUrl,
    updatedAt: now,
  }).returning();
  await db.insert(oauthAccounts).values({
    id: crypto.randomUUID(),
    userId,
    provider: "google",
    providerAccountId: input.subject,
    email: input.email,
    updatedAt: now,
  });
  return user;
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
