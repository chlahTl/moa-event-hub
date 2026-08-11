import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import vm from "node:vm";

import { D1DatabaseMock, workerEnvironment } from "./d1-mock.mjs";

const database = new D1DatabaseMock();
globalThis.__moaTestCloudflareEnv = workerEnvironment(database);

const lifecycle = await import("../lib/event-lifecycle.ts");
const adminAuth = await import("../app/auth.ts");
const { ensureDatabase } = await import("../db/index.ts");

const {
  getEventLifecycle,
  getRecommendedEventId,
  getSeoulDateKey,
  resolveEventRange,
} = lifecycle;
const {
  ADMIN_SESSION_COOKIE,
  authorizeAdminRequest,
  hasTrustedMutationOrigin,
  safeRelativeReturnPath,
  sha256Hex,
} = adminAuth;

const TEST_USER_ID = "admin-user-1";
const TEST_EMAIL = "choewonhyeog387@gmail.com";
const TEST_SESSION = "test-session-token";

before(async () => {
  await ensureDatabase();
  database.sqlite.prepare(`
    INSERT INTO users (id, display_name, email, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(TEST_USER_ID, "최 원혁", TEST_EMAIL);
  database.sqlite.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run("session-1", TEST_USER_ID, await sha256Hex(TEST_SESSION), "2099-01-01T00:00:00.000Z");
});

after(() => {
  database.close();
  delete globalThis.__moaTestCloudflareEnv;
});

function authenticatedRequest(path, options = {}) {
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers: {
      cookie: `${ADMIN_SESSION_COOKIE}=${TEST_SESSION}`,
      origin: "http://localhost",
      ...options.headers,
    },
  });
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test("uses the Asia/Seoul calendar date across the UTC day boundary", () => {
  assert.equal(getSeoulDateKey(new Date("2026-08-05T14:59:59.999Z")), "2026-08-05");
  assert.equal(getSeoulDateKey(new Date("2026-08-05T15:00:00.000Z")), "2026-08-06");
});

test("classifies start and end dates inclusively and supports legacy eventDate", () => {
  const today = "2026-08-06";
  assert.equal(getEventLifecycle({ startDate: today, endDate: "2026-08-08" }, today), "ongoing");
  assert.equal(getEventLifecycle({ startDate: "2026-08-01", endDate: today }, today), "ongoing");
  assert.equal(getEventLifecycle({ startDate: "2026-08-07", endDate: "2026-08-08" }, today), "upcoming");
  assert.equal(getEventLifecycle({ startDate: "2026-08-01", endDate: "2026-08-05" }, today), "past");
  assert.deepEqual(resolveEventRange({ eventDate: "2026-09-12" }, today), {
    startDate: "2026-09-12",
    endDate: "2026-09-12",
  });
  assert.equal(getEventLifecycle({ eventDate: today }, today), "ongoing");
});

test("recommends an operational event in lifecycle priority order", () => {
  const today = "2026-08-06";
  const events = [
    { id: "past", startDate: "2026-08-01", endDate: "2026-08-02", status: "active" },
    { id: "ongoing-later", startDate: "2026-08-04", endDate: "2026-08-10", status: "active" },
    { id: "ongoing-sooner", startDate: "2026-08-05", endDate: "2026-08-07", status: "active" },
    { id: "upcoming", startDate: "2026-08-08", endDate: "2026-08-09", status: "active" },
  ];
  assert.equal(getRecommendedEventId(events, today), "ongoing-sooner");
  assert.equal(getRecommendedEventId(events.filter((event) => !event.id.startsWith("ongoing")), today), "upcoming");
  assert.equal(getRecommendedEventId(events.filter((event) => event.id === "past"), today), "past");
  assert.equal(getRecommendedEventId([
    { id: "inactive-current", eventDate: today, status: "inactive" },
    { id: "active-next", eventDate: "2026-08-07", status: "active" },
  ], today), "active-next");
});

test("OAuth session authorization rejects anonymous and forged-header requests", async () => {
  const anonymous = await authorizeAdminRequest(new Request("http://localhost/api/events"));
  assert.equal(anonymous.authorized, false);
  if (anonymous.authorized) assert.fail("anonymous request was authorized");
  assert.equal(anonymous.response.status, 401);

  const forged = await authorizeAdminRequest(new Request("http://localhost/api/events", {
    headers: {
      "oai-authenticated-user-id": TEST_USER_ID,
      "oai-authenticated-user-email": TEST_EMAIL,
    },
  }));
  assert.equal(forged.authorized, false);

  const authenticated = await authorizeAdminRequest(authenticatedRequest("/api/events"));
  assert.equal(authenticated.authorized, true);
  if (!authenticated.authorized) assert.fail("valid session was rejected");
  assert.equal(authenticated.user.id, TEST_USER_ID);
  assert.equal(authenticated.user.email, TEST_EMAIL);
});

test("allows same-origin admin mutations and blocks cross-site requests", async () => {
  assert.equal(hasTrustedMutationOrigin(authenticatedRequest("/api/events", { method: "POST" })), true);
  const foreign = await authorizeAdminRequest(authenticatedRequest("/api/events", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));
  assert.equal(foreign.authorized, false);
  if (foreign.authorized) assert.fail("foreign origin was authorized");
  assert.equal(foreign.response.status, 403);

  const crossSite = await authorizeAdminRequest(authenticatedRequest("/api/events", {
    method: "DELETE",
    headers: { "sec-fetch-site": "cross-site" },
  }));
  assert.equal(crossSite.authorized, false);
});

test("only accepts safe same-origin return paths", () => {
  assert.equal(safeRelativeReturnPath("/admin?view=trash"), "/admin?view=trash");
  assert.equal(safeRelativeReturnPath("https://attacker.example"), "/admin");
  assert.equal(safeRelativeReturnPath("//attacker.example"), "/admin");
  assert.equal(safeRelativeReturnPath("/api/auth/signout"), "/admin");
});

test("Google and Naver OAuth entry routes keep callbacks on the requested Cloudflare origin", async () => {
  Object.assign(globalThis.__moaTestCloudflareEnv, {
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    NAVER_CLIENT_ID: "naver-client-id",
    NAVER_CLIENT_SECRET: "naver-client-secret",
  });
  const [{ GET: startGoogle }, { GET: startNaver }] = await Promise.all([
    import("../app/api/auth/google/route.ts"),
    import("../app/api/auth/naver/route.ts"),
  ]);
  const origin = "https://moa-event-hub.choewonhyeog387.workers.dev";

  const googleResponse = await startGoogle(new Request(`${origin}/api/auth/google?returnTo=%2Fadmin`));
  assert.equal(googleResponse.status, 302);
  const googleLocation = new URL(googleResponse.headers.get("location"));
  assert.equal(googleLocation.origin, "https://accounts.google.com");
  assert.equal(
    googleLocation.searchParams.get("redirect_uri"),
    `${origin}/api/auth/callback/google`,
  );

  const naverResponse = await startNaver(new Request(`${origin}/api/auth/naver?returnTo=%2Fadmin`));
  assert.equal(naverResponse.status, 302);
  const naverLocation = new URL(naverResponse.headers.get("location"));
  assert.equal(naverLocation.origin, "https://nid.naver.com");
  assert.equal(
    naverLocation.searchParams.get("redirect_uri"),
    `${origin}/api/auth/callback/naver`,
  );
});

test("keeps every management API authenticated and owner-scoped", async () => {
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(adminPage, /export const dynamic = "force-dynamic"/);
  assert.match(adminPage, /requireAppUser\("\/admin"\)/);

  const protectedRoutes = new Map([
    ["../app/api/events/route.ts", 2],
    ["../app/api/events/[eventId]/route.ts", 2],
    ["../app/api/events/[eventId]/deletion-impact/route.ts", 1],
    ["../app/api/events/[eventId]/restore/route.ts", 1],
    ["../app/api/events/[eventId]/permanent/route.ts", 1],
    ["../app/api/clubs/route.ts", 1],
    ["../app/api/clubs/[clubId]/route.ts", 2],
    ["../app/api/stamp-points/route.ts", 2],
    ["../app/api/export/route.ts", 1],
    ["../app/api/stats/route.ts", 1],
  ]);

  for (const [relativePath, expectedChecks] of protectedRoutes) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /import \{ authorizeAdminRequest \}/, relativePath);
    assert.equal(countMatches(source, /await authorizeAdminRequest\(request\)/g), expectedChecks, relativePath);
    assert.equal(
      countMatches(source, /if \(!authorization\.authorized\) return authorization\.response;/g),
      expectedChecks,
      relativePath,
    );
    assert.match(source, /events\.ownerUserId/, `${relativePath} must enforce event ownership`);
  }

  for (const relativePath of [
    "../app/api/responses/route.ts",
    "../app/api/stamps/claim/route.ts",
    "../app/api/tour/[inviteToken]/route.ts",
    "../app/api/tour/[inviteToken]/join/route.ts",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /authorizeAdminRequest/, relativePath);
  }
});

test("service worker never caches administrator, API, or authentication responses", async () => {
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /url\.pathname === "\/signin"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/auth\/"\)/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);

  const listeners = new Map();
  const fetchCalls = [];
  let cacheAccesses = 0;
  const context = {
    URL, Request, Response, Promise,
    self: {
      location: { origin: "https://moa.example.com" },
      clients: { claim() {} },
      skipWaiting() {},
      addEventListener(type, listener) { listeners.set(type, listener); },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => { cacheAccesses += 1; throw new Error("protected request touched cache"); },
      match: async () => { cacheAccesses += 1; throw new Error("protected request touched cache"); },
    },
    fetch: async (request, init) => {
      fetchCalls.push({ request, init });
      return new Response("network-only");
    },
  };
  vm.runInNewContext(serviceWorker, context, { filename: "public/sw.js" });
  const fetchListener = listeners.get("fetch");
  assert.equal(typeof fetchListener, "function");
  const networkOnlyPaths = [
    "/admin",
    "/admin/events",
    "/api",
    "/api/events",
    "/signin",
    "/api/auth/google",
    "/api/auth/callback/google",
    "/api/auth/naver",
    "/api/auth/callback/naver",
    "/api/auth/signout",
  ];
  for (const path of networkOnlyPaths) {
    let responsePromise;
    fetchListener({
      request: new Request(`https://moa.example.com${path}`),
      respondWith(value) { responsePromise = value; },
    });
    assert.ok(responsePromise, `${path} was not handled network-only`);
    await responsePromise;
  }
  assert.equal(cacheAccesses, 0);
  assert.equal(fetchCalls.length, networkOnlyPaths.length);
  assert.ok(fetchCalls.every(({ init }) => init?.cache === "no-store"));
});
