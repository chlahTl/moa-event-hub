import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export type AdminAuthorization =
  | { authorized: true; user: ChatGPTUser }
  | { authorized: false; response: Response };

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

/**
 * SIWC proves the visitor's identity. It does not grant administrator access,
 * so every protected server route must also check this explicit allowlist.
 */
export const ADMIN_EMAIL_ALLOWLIST = ["choewonhyeog387@gmail.com"] as const;
const ADMIN_EMAILS = new Set<string>(ADMIN_EMAIL_ALLOWLIST);

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  return parseChatGPTUser(requestHeaders);
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function isAdminUser(user: ChatGPTUser): boolean {
  return ADMIN_EMAILS.has(normalizeEmail(user.email));
}

/**
 * Authorizes a management API request without redirecting. Public QR and
 * participant routes must not call this helper; management routes should
 * return `result.response` whenever `authorized` is false.
 */
export function authorizeAdminRequest(request: Request): AdminAuthorization {
  const user = parseChatGPTUser(request.headers, request.url);

  if (!user) {
    return {
      authorized: false,
      response: authorizationError(
        401,
        "관리자 로그인이 필요합니다. ChatGPT로 로그인한 뒤 다시 시도해 주세요.",
      ),
    };
  }

  if (!isAdminUser(user)) {
    return {
      authorized: false,
      response: authorizationError(
        403,
        "이 계정에는 관리자 권한이 없습니다.",
      ),
    };
  }

  if (!hasTrustedMutationOrigin(request)) {
    return {
      authorized: false,
      response: authorizationError(
        403,
        "다른 사이트에서 보낸 관리자 요청은 처리할 수 없습니다.",
      ),
    };
  }

  return { authorized: true, user };
}

/**
 * Parses dispatcher-owned SIWC headers only on a trusted delivery host.
 * The raw workers.dev origin is intentionally rejected because clients can
 * send look-alike `oai-*` headers directly to that origin. Localhost remains
 * available for deterministic development and automated tests.
 */
export function parseChatGPTUser(
  requestHeaders: Pick<Headers, "get">,
  requestUrl?: string,
): ChatGPTUser | null {
  if (!isTrustedIdentityDelivery(requestHeaders, requestUrl)) return null;

  const userId = cleanHeaderValue(requestHeaders.get(USER_ID_HEADER), 255);
  const email = normalizeEmail(
    cleanHeaderValue(requestHeaders.get(USER_EMAIL_HEADER), 320) ?? "",
  );
  if (!userId || !isPlausibleEmail(email)) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const decodedFullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;
  const fullName = cleanHeaderValue(decodedFullName, 200);

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export function isTrustedIdentityDelivery(
  requestHeaders: Pick<Headers, "get">,
  requestUrl?: string,
): boolean {
  const hostname = identityHostname(requestHeaders, requestUrl);
  if (!hostname) return false;

  if (isLocalHostname(hostname)) return true;

  // SIWC headers are injected and sanitized by the Sites dispatcher. They are
  // not trustworthy when a caller bypasses it and reaches Workers directly.
  return hostname !== "workers.dev" && !hostname.endsWith(".workers.dev");
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function authorizationError(status: 401 | 403, message: string): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
        Vary: `${USER_ID_HEADER}, ${USER_EMAIL_HEADER}`,
      },
    },
  );
}

/**
 * Browser mutations must originate from this Site. Non-browser maintenance
 * clients may omit Origin, while Fetch Metadata still blocks explicit
 * cross-site requests when the browser supplies it.
 */
function hasTrustedMutationOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return true;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return (
      (originUrl.protocol === "http:" || originUrl.protocol === "https:") &&
      originUrl.origin === requestUrl.origin
    );
  } catch {
    return false;
  }
}

function identityHostname(
  requestHeaders: Pick<Headers, "get">,
  requestUrl?: string,
): string | null {
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return normalizeHostname(url.hostname);
    } catch {
      return null;
    }
  }

  const host = requestHeaders.get("host");
  if (!host) return null;

  try {
    return normalizeHostname(new URL(`http://${host}`).hostname);
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string {
  return value.trim().replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function cleanHeaderValue(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  const containsControlCharacter = Array.from(cleaned).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!cleaned || cleaned.length > maxLength || containsControlCharacter) {
    return null;
  }
  return cleaned;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
