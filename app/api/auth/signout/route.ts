import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { authSessions } from "../../../../db/schema";
import {
  ADMIN_SESSION_COOKIE,
  clearAuthCookie,
  readCookie,
  safeRelativeReturnPath,
  sha256Hex,
} from "../../../auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = readCookie(request.headers, ADMIN_SESSION_COOKIE);
  if (token) {
    await ensureDatabase();
    await getDb().delete(authSessions).where(eq(authSessions.tokenHash, await sha256Hex(token)));
  }
  const returnTo = safeRelativeReturnPath(url.searchParams.get("returnTo") || "/");
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(returnTo, url.origin).toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": clearAuthCookie(ADMIN_SESSION_COOKIE, url.protocol === "https:"),
    },
  });
}
