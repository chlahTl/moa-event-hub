const COOKIE_NAME = "moa_participant_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function createDeviceToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function createPublicToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(18)));
}

export function readDeviceToken(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      const token = decodeURIComponent(value.join("="));
      return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
    }
  }
  return null;
}

export async function hashDeviceToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function participantCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax${secure}`;
}
