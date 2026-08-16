import { env } from "cloudflare:workers";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureDatabase, getDb } from "../db";
import { authSessions, events, loginEvents, oauthAccounts, userDailyActivity, users } from "../db/schema";
import { getSeoulDateKey } from "../lib/event-lifecycle";

export const SUPER_ADMIN_EMAIL = "choewonhyeog387@gmail.com";
export const ANALYTICS_RETENTION_DAYS = 90;

export type OAuthProvider = "google" | "naver";

export type AppUser = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  fullName: string | null;
};

export type AdminAuthorization =
  | { authorized: true; user: AppUser }
  | { authorized: false; response: Response };

export const ADMIN_SESSION_COOKIE = "moa_admin_session";
export const OAUTH_STATE_COOKIE = "moa_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "moa_oauth_verifier";
export const OAUTH_NONCE_COOKIE = "moa_oauth_nonce";
export const OAUTH_RETURN_COOKIE = "moa_oauth_return";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;

export async function getCurrentUser(
  requestHeaders?: Pick<Headers, "get">,
): Promise<AppUser | null> {
  const source = requestHeaders ?? await headers();
  const token = readCookie(source, ADMIN_SESSION_COOKIE);
  if (!token) return null;

  await ensureDatabase();
  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(
      eq(authSessions.tokenHash, tokenHash),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ))
    .limit(1);

  if (!row) return null;

  const now = new Date();
  await recordAuthenticatedActivity(row.id, tokenHash, now);
  return toAppUser(row);
}

export async function requireAppUser(returnTo: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}

export function signInPath(returnTo = "/admin"): string {
  return `/signin?returnTo=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function signOutPath(returnTo = "/"): string {
  return `/api/auth/signout?returnTo=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function authorizeAdminRequest(
  request: Request,
): Promise<AdminAuthorization> {
  const user = await getCurrentUser(request.headers);
  if (!user) {
    return {
      authorized: false,
      response: authorizationError(401, "관리자 로그인이 필요합니다. Google 또는 네이버로 로그인한 뒤 다시 시도해 주세요."),
    };
  }

  if (!hasTrustedMutationOrigin(request)) {
    return {
      authorized: false,
      response: authorizationError(403, "다른 사이트에서 보낸 관리자 요청은 처리할 수 없습니다."),
    };
  }

  return { authorized: true, user };
}

export async function authorizeSuperAdminRequest(
  request: Request,
): Promise<AdminAuthorization> {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization;
  if (!isSuperAdmin(authorization.user)) {
    return {
      authorized: false,
      response: Response.json({ error: "페이지를 찾을 수 없습니다." }, {
        status: 404,
        headers: { "Cache-Control": "no-store, private", Vary: "Cookie" },
      }),
    };
  }
  return authorization;
}

export function isSuperAdmin(user: Pick<AppUser, "email">): boolean {
  return user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function getOAuthConfig(provider: OAuthProvider) {
  const bindings = env as unknown as Record<string, unknown>;
  const prefix = provider === "google" ? "GOOGLE" : "NAVER";
  const clientId = bindingString(bindings[`${prefix}_CLIENT_ID`]);
  const clientSecret = bindingString(bindings[`${prefix}_CLIENT_SECRET`]);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function establishOAuthSession(input: {
  provider: OAuthProvider;
  subject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}): Promise<string> {
  await ensureDatabase();
  const db = getDb();
  const normalizedEmail = input.email.trim().toLowerCase();
  const [existing] = await db.select({ user: users }).from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(
      eq(oauthAccounts.provider, input.provider),
      eq(oauthAccounts.providerAccountId, input.subject),
    ))
    .limit(1);
  const now = new Date();
  const nowIso = now.toISOString();
  let userId: string;

  if (existing) {
    userId = existing.user.id;
    await db.update(users).set({
      displayName: input.displayName,
      email: normalizedEmail,
      avatarUrl: input.avatarUrl,
      updatedAt: nowIso,
    }).where(eq(users.id, userId));
    await db.update(oauthAccounts).set({ email: normalizedEmail, updatedAt: nowIso })
      .where(and(
        eq(oauthAccounts.provider, input.provider),
        eq(oauthAccounts.providerAccountId, input.subject),
      ));
  } else {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName: input.displayName,
      email: normalizedEmail,
      avatarUrl: input.avatarUrl,
      updatedAt: nowIso,
    });
    await db.insert(oauthAccounts).values({
      id: crypto.randomUUID(),
      userId,
      provider: input.provider,
      providerAccountId: input.subject,
      email: normalizedEmail,
      updatedAt: nowIso,
    });
  }

  await db.delete(authSessions).where(lt(authSessions.expiresAt, nowIso));
  const rawSessionToken = randomToken(48);
  await db.insert(authSessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await sha256Hex(rawSessionToken),
    expiresAt: new Date(now.getTime() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    lastSeenAt: nowIso,
  });
  try {
    await db.insert(loginEvents).values({
      id: crypto.randomUUID(),
      userId,
      provider: input.provider,
      loggedInAt: nowIso,
    });
    const retentionCutoff = new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(loginEvents).where(lt(loginEvents.loggedInAt, retentionCutoff));
    await db.delete(userDailyActivity).where(lt(userDailyActivity.lastSeenAt, retentionCutoff));
  } catch (error) {
    console.error("Failed to record login analytics", error);
  }
  if (normalizedEmail === SUPER_ADMIN_EMAIL) {
    await db.update(events).set({ ownerUserId: userId }).where(isNull(events.ownerUserId));
  }
  return rawSessionToken;
}

export function readCookie(
  requestHeaders: Pick<Headers, "get">,
  name: string,
): string | null {
  const cookie = requestHeaders.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value || null;
    }
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return serializeCookie(ADMIN_SESSION_COOKIE, token, ADMIN_SESSION_MAX_AGE_SECONDS, secure);
}

export function shortLivedOAuthCookie(name: string, value: string, secure: boolean): string {
  return serializeCookie(name, value, OAUTH_COOKIE_MAX_AGE_SECONDS, secure);
}

export function clearAuthCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", 0, secure);
}

export function safeRelativeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/admin";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/admin";
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/signin") return "/admin";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin";
  }
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeReturnPath(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(safeRelativeReturnPath(value)));
}

export function decodeReturnPath(value: string | null): string {
  if (!value) return "/admin";
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return safeRelativeReturnPath(new TextDecoder().decode(bytes));
  } catch {
    return "/admin";
  }
}

export function hasTrustedMutationOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function serializeCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join("; ");
}

function authorizationError(status: 401 | 403, message: string): Response {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store, private", Vary: "Cookie" },
  });
}

function toAppUser(row: {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}): AppUser {
  return {
    ...row,
    userId: row.id,
    fullName: row.displayName || null,
  };
}

function bindingString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function recordAuthenticatedActivity(userId: string, tokenHash: string, now: Date) {
  try {
    const nowIso = now.toISOString();
    const activityDate = getSeoulDateKey(now);
    await Promise.all([
      getDb().update(authSessions).set({ lastSeenAt: nowIso }).where(eq(authSessions.tokenHash, tokenHash)),
      env.DB.prepare(`INSERT INTO user_daily_activity
        (id, user_id, activity_date, request_count, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(user_id, activity_date) DO UPDATE SET
          request_count = request_count + 1,
          last_seen_at = excluded.last_seen_at`)
        .bind(crypto.randomUUID(), userId, activityDate, nowIso, nowIso)
        .run(),
    ]);
  } catch (error) {
    console.error("Failed to record authenticated activity", error);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
