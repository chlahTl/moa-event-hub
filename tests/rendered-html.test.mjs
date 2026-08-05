import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Moa landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>모아 \| 행사 참여를 한곳에<\/title>/i);
  assert.match(html, /행사 참여를/);
  assert.match(html, /동아리별 QR/);
  assert.match(html, /href="\/admin"/);
});

test("keeps participant names and club responses connected", async () => {
  const [visitForm, responseRoute, schema, exportRoute, dashboard] = await Promise.all([
    readFile(new URL("../app/visit/[clubId]/VisitForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/responses/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(visitForm, /name="participantName"/);
  assert.match(visitForm, /8세 이하/);
  assert.match(visitForm, /25~39세/);
  assert.match(responseRoute, /participantName/);
  assert.match(responseRoute, /clubId/);
  assert.match(schema, /participantName: text\("participant_name"\)/);
  assert.match(exportRoute, /"이름"/);
  assert.match(dashboard, /item\.participantName/);
});
