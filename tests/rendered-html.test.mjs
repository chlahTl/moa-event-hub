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
  assert.match(html, /부스별 QR/);
  assert.match(html, /href="\/signin\?returnTo=%2Fadmin"/);
  assert.match(html, /로그인하고 행사 만들기/);
});

test("uses native navigation links that work in the vinext client", async () => {
  const [landing, dashboard] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/EventOperationsDashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(landing, /next\/link/);
  assert.doesNotMatch(dashboard, /next\/link/);
  assert.match(landing, /<a href="\/signin\?returnTo=%2Fadmin" target="_top"[^>]*>로그인하고 행사 만들기/);
});

test("keeps participant names and club responses connected", async () => {
  const [visitForm, tourForm, responseRoute, tourOptions, schema, exportRoute, dashboard] = await Promise.all([
    readFile(new URL("../app/visit/[clubId]/GuidedClubVisit.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/join/[inviteToken]/OfflineReadyClubTour.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/responses/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/tour.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/EventOperationsDashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(visitForm, /name="participantName"/);
  assert.match(visitForm, /AGE_GROUP_OPTIONS/);
  assert.match(tourForm, /AGE_GROUP_OPTIONS/);
  assert.match(tourOptions, /8세 이하/);
  assert.match(tourOptions, /25~39세/);
  assert.match(tourOptions, /일반/);
  assert.match(tourOptions, /40세 이상/);
  assert.match(responseRoute, /participantName/);
  assert.match(responseRoute, /clubId/);
  assert.match(responseRoute, /AGE_GROUPS/);
  assert.match(schema, /participantName: text\("participant_name"\)/);
  assert.match(exportRoute, /"이름"/);
  assert.match(dashboard, /item\.participantName/);
});

test("stamp tour schema prevents duplicate participants and stamps", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migrationName of ["0000_eager_blockbuster.sql", "0001_dizzy_kulan_gath.sql", "0002_warm_tomas.sql", "0003_condemned_robbie_robertson.sql", "0004_funny_purifiers.sql", "0005_red_maverick.sql"]) {
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

  database.prepare("INSERT INTO clubs (id, event_id, name) VALUES (?, ?, ?)").run("club-1", "event-1", "찬양팀");
  const clubSettings = database.prepare("SELECT stamp_emoji, stamp_message, submission_guide FROM clubs WHERE id = ?").get("club-1");
  assert.equal(clubSettings.stamp_emoji, "⭐");
  assert.equal(clubSettings.stamp_message, "");
  assert.equal(clubSettings.submission_guide, "");
  database.prepare("INSERT INTO club_stamp_records (id, event_id, participant_id, club_id) VALUES (?, ?, ?, ?)").run("club-record-1", "event-1", "person-1", "club-1");
  assert.throws(
    () => database.prepare("INSERT INTO club_stamp_records (id, event_id, participant_id, club_id) VALUES (?, ?, ?, ?)").run("club-record-2", "event-1", "person-1", "club-1"),
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

test("club operations support custom guidance, safe offline retry, editing and exports", async () => {
  const [schema, clubRoute, clubDetailRoute, claimRoute, exportRoute, dashboard, scanner, serviceWorker, registration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/clubs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/clubs/[clubId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stamps/claim/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/EventOperationsDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/join/[inviteToken]/OfflineReadyClubTour.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ServiceWorkerRegistration.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /stampEmoji: text\("stamp_emoji"\)/);
  assert.match(clubRoute, /submissionGuide/);
  assert.match(clubDetailRoute, /export async function PATCH/);
  assert.match(clubDetailRoute, /export async function DELETE/);
  assert.match(claimRoute, /targetClub\.stampMessage/);
  assert.match(exportRoute, /searchParams\.get\("clubId"\)/);
  assert.match(exportRoute, /eq\(clubStampRecords\.clubId, clubId\)/);
  assert.match(exportRoute, /participants\.participantName/);
  assert.match(dashboard, /다음 행동 안내/);
  assert.match(dashboard, /실적 CSV/);
  assert.match(dashboard, /전체 명단 보기/);
  assert.match(dashboard, /참가자 명단 →/);
  assert.match(dashboard, /\/api\/participants\?/);
  assert.match(dashboard, /scope=participants/);
  assert.match(dashboard, /참가자당 동아리 참여/);
  assert.match(dashboard, /정보 수정/);
  assert.match(dashboard, /method: "PATCH"/);
  assert.match(dashboard, /\/admin\/paper\/\$\{selected\.id\}\?clubId=\$\{club\.id\}/);
  assert.match(dashboard, /window\.confirm/);
  assert.match(scanner, /moa-pending-stamps/);
  assert.match(scanner, /인터넷이 돌아오면 자동 등록/);
  assert.doesNotMatch(scanner, /localStorage[\s\S]{0,120}participantName/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(registration, /serviceWorker\.register\("\/sw\.js"\)/);
});

test("stamp APIs keep identity server-side and validate event ownership", async () => {
  const [session, joinRoute, claimRoute, dashboard, scanner, clubVisit] = await Promise.all([
    readFile(new URL("../lib/participant-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tour/[inviteToken]/join/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stamps/claim/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/EventOperationsDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/join/[inviteToken]/OfflineReadyClubTour.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/visit/[clubId]/GuidedClubVisit.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /SHA-256/);
  assert.match(joinRoute, /deviceTokenHash/);
  assert.match(joinRoute, /"Set-Cookie": participantCookie\(deviceToken, request\)/);
  assert.match(claimRoute, /findParticipant\(target\.event\.id, deviceTokenHash\)/);
  assert.match(claimRoute, /다른 QR입니다/);
  assert.match(claimRoute, /onConflictDoNothing/);
  assert.match(claimRoute, /clubStampRecords/);
  assert.match(claimRoute, /participantName: participant\.participantName/);
  assert.match(dashboard, /\/join\/\$\{event\.inviteToken\}/);
  assert.match(dashboard, /\/stamp\/\$\{point\.token\}/);
  assert.match(scanner, /NotAllowedError/);
  assert.match(scanner, /카메라 권한이 거부됐어요/);
  assert.match(scanner, /clubId/);
  assert.match(clubVisit, /JSON\.stringify\(\{ clubId \}\)/);
  assert.match(clubVisit, /stampSuccess/);
});

test("creates a separate printable record sheet for each club", async () => {
  const [paperPage, paperSheet, dashboard] = await Promise.all([
    readFile(new URL("../app/admin/paper/[eventId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/paper/[eventId]/PaperRecordSheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/EventOperationsDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(paperPage, /searchParams/);
  assert.match(paperPage, /eventClubs\.find\(\(club\) => club\.id === clubId\)/);
  assert.match(paperPage, /selectedClub \? \[selectedClub\]/);
  assert.match(paperSheet, /동아리별 종이 접수 양식/);
  assert.match(paperSheet, /참가자 이름·성별·연령 구분은 필수 항목입니다/);
  assert.doesNotMatch(paperSheet, /collectGender|collectAge/);
  assert.doesNotMatch(dashboard, /name="collectGender"|name="collectAge"|선택 안 함/);
  assert.match(dashboard, /종이 기록지<\/a>/);
});
