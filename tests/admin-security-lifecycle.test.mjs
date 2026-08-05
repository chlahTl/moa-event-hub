import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import vm from "node:vm";

// chatgpt-auth.ts deliberately imports Vinext's `next/*` compatibility
// modules. The functions under test do not use those runtime adapters, so the
// loader supplies the smallest possible stubs while Node strips TypeScript.
const nextStubLoader = `
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return {
        url: "data:text/javascript," + encodeURIComponent(
          "export async function headers() { return new Headers(); }",
        ),
        shortCircuit: true,
      };
    }
    if (specifier === "next/navigation") {
      return {
        url: "data:text/javascript," + encodeURIComponent(
          "export function redirect(destination) { throw new Error('redirect:' + destination); }",
        ),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(nextStubLoader)}`, import.meta.url);

const lifecycle = await import(new URL("../lib/event-lifecycle.ts", import.meta.url));
const adminAuth = await import(new URL("../app/chatgpt-auth.ts", import.meta.url));

const {
  getEventLifecycle,
  getRecommendedEventId,
  getSeoulDateKey,
  resolveEventRange,
} = lifecycle;
const { ADMIN_EMAIL_ALLOWLIST, authorizeAdminRequest, parseChatGPTUser } = adminAuth;

const ADMIN_EMAIL = "choewonhyeog387@gmail.com";

function identityHeaders(email = ADMIN_EMAIL) {
  return {
    "oai-authenticated-user-id": "chatgpt-user-1",
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent("최 원혁"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
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

  assert.equal(
    getEventLifecycle({ startDate: today, endDate: "2026-08-08" }, today),
    "ongoing",
  );
  assert.equal(
    getEventLifecycle({ startDate: "2026-08-01", endDate: today }, today),
    "ongoing",
  );
  assert.equal(
    getEventLifecycle({ startDate: "2026-08-07", endDate: "2026-08-08" }, today),
    "upcoming",
  );
  assert.equal(
    getEventLifecycle({ startDate: "2026-08-01", endDate: "2026-08-05" }, today),
    "past",
  );

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
  assert.equal(
    getRecommendedEventId(events.filter((event) => !event.id.startsWith("ongoing")), today),
    "upcoming",
  );
  assert.equal(
    getRecommendedEventId(events.filter((event) => event.id === "past"), today),
    "past",
  );

  // An inactive current event must not steal the default from an active event.
  assert.equal(
    getRecommendedEventId([
      { id: "inactive-current", eventDate: today, status: "inactive" },
      { id: "active-next", eventDate: "2026-08-07", status: "active" },
    ], today),
    "active-next",
  );
});

test("admin API authorization returns 401, 403, and the allowlisted user", async () => {
  assert.deepEqual(ADMIN_EMAIL_ALLOWLIST, [ADMIN_EMAIL]);

  const anonymous = authorizeAdminRequest(new Request("http://localhost/api/events"));
  assert.equal(anonymous.authorized, false);
  if (anonymous.authorized) assert.fail("anonymous request was authorized");
  assert.equal(anonymous.response.status, 401);
  assert.match((await anonymous.response.json()).error, /로그인/);
  assert.match(anonymous.response.headers.get("cache-control") ?? "", /no-store/);

  const outsider = authorizeAdminRequest(new Request("http://localhost/api/events", {
    headers: identityHeaders("someone@example.com"),
  }));
  assert.equal(outsider.authorized, false);
  if (outsider.authorized) assert.fail("non-admin request was authorized");
  assert.equal(outsider.response.status, 403);
  assert.match((await outsider.response.json()).error, /관리자 권한/);

  const admin = authorizeAdminRequest(new Request("http://localhost/api/events", {
    headers: identityHeaders("CHOEWONHYEOG387@GMAIL.COM"),
  }));
  assert.equal(admin.authorized, true);
  if (!admin.authorized) assert.fail("allowlisted admin request was rejected");
  assert.equal(admin.user.email, ADMIN_EMAIL);
  assert.equal(admin.user.displayName, "최 원혁");
});

test("rejects forged ChatGPT identity headers on workers.dev origins", () => {
  for (const url of [
    "https://moa-event-hub.example.workers.dev/api/events",
    "https://workers.dev/api/events",
  ]) {
    const headers = new Headers({
      ...identityHeaders(),
      host: "trusted.example.com",
    });
    assert.equal(parseChatGPTUser(headers, url), null);

    const result = authorizeAdminRequest(new Request(url, { headers }));
    assert.equal(result.authorized, false);
    if (result.authorized) assert.fail(`forged identity was accepted for ${url}`);
    assert.equal(result.response.status, 401);
  }
});

test("allows same-origin admin mutations and blocks cross-site requests", () => {
  for (const method of ["POST", "DELETE"]) {
    const sameOrigin = authorizeAdminRequest(new Request("http://localhost/api/events", {
      method,
      headers: {
        ...identityHeaders(),
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
      },
    }));
    assert.equal(sameOrigin.authorized, true, `${method} same-origin request was rejected`);
  }

  const foreignOrigin = authorizeAdminRequest(new Request("http://localhost/api/events", {
    method: "POST",
    headers: {
      ...identityHeaders(),
      origin: "https://attacker.example",
    },
  }));
  assert.equal(foreignOrigin.authorized, false);
  if (foreignOrigin.authorized) assert.fail("foreign Origin was authorized");
  assert.equal(foreignOrigin.response.status, 403);

  const crossSiteMetadata = authorizeAdminRequest(new Request("http://localhost/api/events", {
    method: "DELETE",
    headers: {
      ...identityHeaders(),
      origin: "http://localhost",
      "sec-fetch-site": "cross-site",
    },
  }));
  assert.equal(crossSiteMetadata.authorized, false);
  if (crossSiteMetadata.authorized) assert.fail("cross-site Fetch Metadata was authorized");
  assert.equal(crossSiteMetadata.response.status, 403);
});

test("keeps the administrator page and every management API server-protected", async () => {
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(adminPage, /export const dynamic = "force-dynamic"/);
  assert.match(adminPage, /requireChatGPTUser\("\/admin"\)/);
  assert.match(adminPage, /if \(!isAdminUser\(user\)\)/);
  assert.match(adminPage, /<AdminAccessDenied/);

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
    assert.equal(
      countMatches(source, /authorizeAdminRequest\(request\)/g),
      expectedChecks,
      `${relativePath} must authenticate every management handler`,
    );
    assert.equal(
      countMatches(source, /if \(!authorization\.authorized\) return authorization\.response;/g),
      expectedChecks,
      `${relativePath} must stop unauthorized requests before business logic`,
    );
  }

  // QR participation remains public; only administrator data is gated.
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
  assert.match(serviceWorker, /url\.pathname === "\/admin"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/admin\/"\)/);
  assert.match(serviceWorker, /url\.pathname === "\/api"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /"\/signin-with-chatgpt"/);
  assert.match(serviceWorker, /"\/signout-with-chatgpt"/);
  assert.match(serviceWorker, /"\/callback"/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);

  const listeners = new Map();
  const fetchCalls = [];
  let cacheAccesses = 0;
  const context = {
    URL,
    Request,
    Response,
    Promise,
    self: {
      location: { origin: "https://moa.example.com" },
      clients: { claim() {} },
      skipWaiting() {},
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => {
        cacheAccesses += 1;
        throw new Error("protected request touched the cache");
      },
      match: async () => {
        cacheAccesses += 1;
        throw new Error("protected request touched the cache");
      },
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
    "/signin-with-chatgpt",
    "/signout-with-chatgpt",
    "/callback",
  ];
  for (const path of networkOnlyPaths) {
    let responsePromise;
    fetchListener({
      request: new Request(`https://moa.example.com${path}`),
      respondWith(value) {
        responsePromise = value;
      },
    });
    assert.ok(responsePromise, `${path} was not handled network-only`);
    await responsePromise;
  }

  assert.equal(cacheAccesses, 0);
  assert.equal(fetchCalls.length, networkOnlyPaths.length);
  assert.ok(fetchCalls.every(({ init }) => init?.cache === "no-store"));
});
