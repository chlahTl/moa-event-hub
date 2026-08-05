import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

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

test("uses native navigation links that work in the vinext client", async () => {
  const [landing, dashboard] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/StampTourDashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(landing, /next\/link/);
  assert.doesNotMatch(dashboard, /next\/link/);
  assert.match(landing, /<a href="\/admin" target="_top"[^>]*>첫 행사 만들기/);
});

test("keeps participant names and club responses connected", async () => {
  const [visitForm, responseRoute, schema, exportRoute, dashboard] = await Promise.all([
    readFile(new URL("../app/visit/[clubId]/VisitForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/responses/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/StampTourDashboard.tsx", import.meta.url), "utf8"),
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

test("stamp tour schema prevents duplicate participants and stamps", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migrationName of ["0000_eager_blockbuster.sql", "0001_dizzy_kulan_gath.sql", "0002_warm_tomas.sql"]) {
    const migration = await readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      database.exec(statement);
    }
  }

  database.prepare("INSERT INTO events (id, name, event_date, invite_token) VALUES (?, ?, ?, ?)").run("event-1", "테스트 행사", "2026-08-05", "invite-token");
  database.prepare("INSERT INTO participants (id, event_id, device_token_hash, participant_name) VALUES (?, ?, ?, ?)").run("person-1", "event-1", "device-hash", "김모아");
  assert.throws(
    () => database.prepare("INSERT INTO participants (id, event_id, device_token_hash, participant_name) VALUES (?, ?, ?, ?)").run("person-2", "event-1", "device-hash", "김모아"),
    /UNIQUE constraint failed/,
  );

  database.prepare("INSERT INTO stamp_points (id, event_id, token, name) VALUES (?, ?, ?, ?)").run("point-1", "event-1", "point-token", "포토존");
  database.prepare("INSERT INTO stamp_records (id, event_id, participant_id, stamp_point_id) VALUES (?, ?, ?, ?)").run("record-1", "event-1", "person-1", "point-1");
  assert.throws(
    () => database.prepare("INSERT INTO stamp_records (id, event_id, participant_id, stamp_point_id) VALUES (?, ?, ?, ?)").run("record-2", "event-1", "person-1", "point-1"),
    /UNIQUE constraint failed/,
  );
  database.close();
});

test("stamp APIs keep identity server-side and validate event ownership", async () => {
  const [session, joinRoute, claimRoute, dashboard, scanner] = await Promise.all([
    readFile(new URL("../lib/participant-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tour/[inviteToken]/join/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stamps/claim/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/StampTourDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/join/[inviteToken]/EventTour.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /SHA-256/);
  assert.match(joinRoute, /deviceTokenHash/);
  assert.match(joinRoute, /"Set-Cookie": participantCookie\(deviceToken, request\)/);
  assert.match(claimRoute, /findParticipant\(row\.event\.id, deviceTokenHash\)/);
  assert.match(claimRoute, /다른 QR입니다/);
  assert.match(claimRoute, /onConflictDoNothing/);
  assert.match(dashboard, /\/join\/\$\{event\.inviteToken\}/);
  assert.match(dashboard, /\/stamp\/\$\{point\.token\}/);
  assert.match(scanner, /NotAllowedError/);
  assert.match(scanner, /카메라 권한이 거부됐어요/);
});
