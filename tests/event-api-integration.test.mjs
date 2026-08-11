import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  D1DatabaseMock,
  workerEnvironment,
} from "./d1-mock.mjs";

const database = new D1DatabaseMock();
globalThis.__moaTestCloudflareEnv = workerEnvironment(database);
const MISSING_EVENT_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID = "admin-user-1";
const ADMIN_SESSION = "admin-session-token";
const OTHER_USER_ID = "admin-user-2";
const OTHER_SESSION = "other-session-token";

const [
  eventsRoute,
  eventRoute,
  deletionImpactRoute,
  restoreRoute,
  permanentRoute,
  clubsRoute,
  clubRoute,
  stampPointsRoute,
  tourRoute,
  tourJoinRoute,
  claimRoute,
  statsRoute,
  exportRoute,
  adminAuth,
  databaseModule,
] = await Promise.all([
  import("../app/api/events/route.ts"),
  import("../app/api/events/[eventId]/route.ts"),
  import("../app/api/events/[eventId]/deletion-impact/route.ts"),
  import("../app/api/events/[eventId]/restore/route.ts"),
  import("../app/api/events/[eventId]/permanent/route.ts"),
  import("../app/api/clubs/route.ts"),
  import("../app/api/clubs/[clubId]/route.ts"),
  import("../app/api/stamp-points/route.ts"),
  import("../app/api/tour/[inviteToken]/route.ts"),
  import("../app/api/tour/[inviteToken]/join/route.ts"),
  import("../app/api/stamps/claim/route.ts"),
  import("../app/api/stats/route.ts"),
  import("../app/api/export/route.ts"),
  import("../app/auth.ts"),
  import("../db/index.ts"),
]);

before(async () => {
  await databaseModule.ensureDatabase();
  for (const [id, name, email, sessionId, token] of [
    [ADMIN_USER_ID, "테스트 관리자", "choewonhyeog387@gmail.com", "session-admin", ADMIN_SESSION],
    [OTHER_USER_ID, "다른 관리자", "other@example.com", "session-other", OTHER_SESSION],
  ]) {
    database.sqlite.prepare(`
      INSERT INTO users (id, display_name, email, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, name, email);
    database.sqlite.prepare(`
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(sessionId, id, await adminAuth.sha256Hex(token), "2099-01-01T00:00:00.000Z");
  }
});

after(() => {
  database.close();
  delete globalThis.__moaTestCloudflareEnv;
});

function request(path, options = {}) {
  const headers = options.admin
    ? {
        "content-type": "application/json",
        cookie: `${adminAuth.ADMIN_SESSION_COOKIE}=${options.sessionToken ?? ADMIN_SESSION}`,
        origin: "http://localhost",
        ...options.headers,
      }
    : { "content-type": "application/json", ...options.headers };
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function eventContext(eventId) {
  return { params: Promise.resolve({ eventId }) };
}

function clubContext(clubId) {
  return { params: Promise.resolve({ clubId }) };
}

function inviteContext(inviteToken) {
  return { params: Promise.resolve({ inviteToken }) };
}

async function json(response, expectedStatus) {
  assert.equal(response.status, expectedStatus, await response.clone().text());
  return response.json();
}

function eventRowCount(table, eventId) {
  const column = table === "events" ? "id" : "event_id";
  const row = database.sqlite
    .prepare(`SELECT count(*) AS total FROM ${table} WHERE ${column} = ?`)
    .get(eventId);
  return Number(row.total);
}

test("event APIs preserve public QR flows and safely complete the deletion lifecycle", async () => {
  const unauthenticatedDelete = await eventRoute.DELETE(
    request("/api/events/not-created", { method: "DELETE" }),
    eventContext("not-created"),
  );
  assert.equal(unauthenticatedDelete.status, 401);

  const malformedDelete = await eventRoute.DELETE(
    request("/api/events/not-created", { method: "DELETE", admin: true }),
    eventContext("not-created"),
  );
  assert.equal(malformedDelete.status, 400);

  const missingDelete = await eventRoute.DELETE(
    request(`/api/events/${MISSING_EVENT_ID}`, { method: "DELETE", admin: true }),
    eventContext(MISSING_EVENT_ID),
  );
  assert.equal(missingDelete.status, 404);

  const createdEvent = await json(await eventsRoute.POST(request("/api/events", {
    method: "POST",
    admin: true,
    body: {
      name: "=통합 테스트 여름 축제",
      description: "행사 삭제 수명주기 테스트",
      institution: "+NCHM",
      startDate: "2020-01-01",
      endDate: "2099-12-31",
      location: "서울",
      status: "active",
    },
  })), 201);
  const event = createdEvent.event;
  assert.ok(event.id);
  assert.ok(event.inviteToken);
  assert.equal(event.ownerUserId, ADMIN_USER_ID);

  const otherUsersEvents = await json(await eventsRoute.GET(request("/api/events", {
    admin: true,
    sessionToken: OTHER_SESSION,
  })), 200);
  assert.deepEqual(otherUsersEvents.events, []);
  const crossAccountStats = await statsRoute.GET(request(`/api/stats?eventId=${event.id}`, {
    admin: true,
    sessionToken: OTHER_SESSION,
  }));
  assert.equal(crossAccountStats.status, 404);

  const createdClub = await json(await clubsRoute.POST(request("/api/clubs", {
    method: "POST",
    admin: true,
    body: {
      eventId: event.id,
      name: "-환경 동아리",
      description: "지구를 위한 활동",
      stampEmoji: "🌱",
      stampMessage: "환경 동아리 스탬프 완료!",
      submissionGuide: "안내 데스크에 활동지를 제출해 주세요.",
      collectGender: true,
      collectAge: true,
    },
  })), 201);
  const club = createdClub.club;

  const publicClub = await json(await clubRoute.GET(
    request(`/api/clubs/${club.id}`),
    clubContext(club.id),
  ), 200);
  assert.equal(publicClub.club.name, "-환경 동아리");
  assert.equal(publicClub.club.stampEmoji, "🌱");

  const createdPoint = await json(await stampPointsRoute.POST(request("/api/stamp-points", {
    method: "POST",
    admin: true,
    body: {
      eventId: event.id,
      name: "포토존",
      description: "기념 사진 촬영",
    },
  })), 201);
  const point = createdPoint.point;

  const initialTour = await json(await tourRoute.GET(
    request(`/api/tour/${event.inviteToken}`),
    inviteContext(event.inviteToken),
  ), 200);
  assert.equal(initialTour.event.id, event.id);
  assert.equal(initialTour.participant, null);
  assert.equal(initialTour.progress.total, 1);
  assert.equal(initialTour.extraProgress.total, 1);

  const joinResponse = await tourJoinRoute.POST(
    request(`/api/tour/${event.inviteToken}/join`, {
      method: "POST",
      body: {
        participantName: "@김 모아",
        gender: "응답하지 않음",
        ageGroup: "청년",
      },
    }),
    inviteContext(event.inviteToken),
  );
  const joinedTour = await json(joinResponse, 201);
  assert.equal(joinedTour.participant.name, "@김 모아");
  const participantCookie = joinResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.match(participantCookie ?? "", /^moa_participant_session=[A-Za-z0-9_-]+$/);

  const clubClaim = await json(await claimRoute.POST(request("/api/stamps/claim", {
    method: "POST",
    headers: { cookie: participantCookie },
    body: { clubId: club.id },
  })), 200);
  assert.equal(clubClaim.duplicate, false);
  assert.equal(clubClaim.progress.completed, 1);
  assert.equal(clubClaim.stampedClub.stampEmoji, "🌱");
  assert.equal(clubClaim.successMessage, "환경 동아리 스탬프 완료!");

  const duplicateClubClaim = await json(await claimRoute.POST(request("/api/stamps/claim", {
    method: "POST",
    headers: { cookie: participantCookie },
    body: { clubId: club.id },
  })), 200);
  assert.equal(duplicateClubClaim.duplicate, true);

  const pointClaim = await json(await claimRoute.POST(request("/api/stamps/claim", {
    method: "POST",
    headers: { cookie: participantCookie },
    body: { pointToken: point.token },
  })), 200);
  assert.equal(pointClaim.duplicate, false);
  assert.equal(pointClaim.extraProgress.completed, 1);

  const joinedTourAgain = await json(await tourRoute.GET(
    request(`/api/tour/${event.inviteToken}`, {
      headers: { cookie: participantCookie },
    }),
    inviteContext(event.inviteToken),
  ), 200);
  assert.equal(joinedTourAgain.participant.name, "@김 모아");
  assert.equal(joinedTourAgain.progress.completed, 1);
  assert.equal(joinedTourAgain.extraProgress.completed, 1);

  const unauthenticatedStats = await statsRoute.GET(request(`/api/stats?eventId=${event.id}`));
  assert.equal(unauthenticatedStats.status, 401);
  const statsResponse = await statsRoute.GET(request(`/api/stats?eventId=${event.id}`, {
    admin: true,
  }));
  const stats = await json(statsResponse, 200);
  assert.match(statsResponse.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(stats.age, [{ label: "청년", total: 1 }]);
  assert.equal(stats.recent.length, 1);
  assert.equal(stats.recent[0].clubName, "-환경 동아리");

  const unauthenticatedCsv = await exportRoute.GET(request(`/api/export?eventId=${event.id}`));
  assert.equal(unauthenticatedCsv.status, 401);
  const csvResponse = await exportRoute.GET(request(`/api/export?eventId=${event.id}`, {
    admin: true,
  }));
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get("content-type") ?? "", /^text\/csv/);
  assert.match(csvResponse.headers.get("cache-control") ?? "", /no-store/);
  const csv = await csvResponse.text();
  assert.match(csv, /"'=통합 테스트 여름 축제"/);
  assert.match(csv, /"'\+NCHM"/);
  assert.match(csv, /"'-환경 동아리"/);
  assert.match(csv, /"'@김 모아"/);

  const expectedImpact = {
    clubCount: 1,
    participantCount: 1,
    responseCount: 1,
    stampPointCount: 1,
    stampRecordCount: 1,
    clubStampRecordCount: 1,
  };
  const impact = await json(await deletionImpactRoute.GET(
    request(`/api/events/${event.id}/deletion-impact`, { admin: true }),
    eventContext(event.id),
  ), 200);
  assert.deepEqual(impact.impact, expectedImpact);

  const firstSoftDelete = await json(await eventRoute.DELETE(
    request(`/api/events/${event.id}`, { method: "DELETE", admin: true }),
    eventContext(event.id),
  ), 200);
  assert.equal(firstSoftDelete.deleted, true);
  assert.equal(firstSoftDelete.alreadyDeleted, false);
  assert.deepEqual(firstSoftDelete.impact, expectedImpact);

  const repeatedSoftDelete = await json(await eventRoute.DELETE(
    request(`/api/events/${event.id}`, { method: "DELETE", admin: true }),
    eventContext(event.id),
  ), 200);
  assert.equal(repeatedSoftDelete.alreadyDeleted, true);

  const activeEvents = await json(await eventsRoute.GET(request("/api/events?view=active", {
    admin: true,
  })), 200);
  assert.equal(activeEvents.events.some((item) => item.id === event.id), false);
  const trashEvents = await json(await eventsRoute.GET(request("/api/events?view=trash", {
    admin: true,
  })), 200);
  assert.equal(trashEvents.events.some((item) => item.id === event.id), true);

  const blockedInvite = await tourRoute.GET(
    request(`/api/tour/${event.inviteToken}`),
    inviteContext(event.inviteToken),
  );
  assert.equal(blockedInvite.status, 404);
  const blockedClubQr = await clubRoute.GET(
    request(`/api/clubs/${club.id}`),
    clubContext(club.id),
  );
  assert.equal(blockedClubQr.status, 404);

  const firstRestore = await json(await restoreRoute.POST(
    request(`/api/events/${event.id}/restore`, { method: "POST", admin: true }),
    eventContext(event.id),
  ), 200);
  assert.equal(firstRestore.restored, true);
  assert.equal(firstRestore.alreadyRestored, false);

  const repeatedRestore = await json(await restoreRoute.POST(
    request(`/api/events/${event.id}/restore`, { method: "POST", admin: true }),
    eventContext(event.id),
  ), 200);
  assert.equal(repeatedRestore.alreadyRestored, true);

  const restoredInvite = await tourRoute.GET(
    request(`/api/tour/${event.inviteToken}`, {
      headers: { cookie: participantCookie },
    }),
    inviteContext(event.inviteToken),
  );
  assert.equal(restoredInvite.status, 200);

  // Permanent deletion is available only from the trash.
  await json(await eventRoute.DELETE(
    request(`/api/events/${event.id}`, { method: "DELETE", admin: true }),
    eventContext(event.id),
  ), 200);

  const wrongConfirmation = await permanentRoute.DELETE(
    request(`/api/events/${event.id}/permanent`, {
      method: "DELETE",
      admin: true,
      body: { confirmationName: "다른 행사명" },
    }),
    eventContext(event.id),
  );
  assert.equal(wrongConfirmation.status, 400);
  assert.equal(eventRowCount("events", event.id), 1);
  assert.equal(eventRowCount("participants", event.id), 1);

  const permanentDelete = await json(await permanentRoute.DELETE(
    request(`/api/events/${event.id}/permanent`, {
      method: "DELETE",
      admin: true,
      body: { confirmationName: event.name },
    }),
    eventContext(event.id),
  ), 200);
  assert.equal(permanentDelete.deleted, true);
  assert.equal(permanentDelete.permanent, true);
  assert.equal(permanentDelete.alreadyDeleted, false);
  assert.deepEqual(permanentDelete.impact, expectedImpact);

  const repeatedPermanentDelete = await json(await permanentRoute.DELETE(
    request(`/api/events/${event.id}/permanent`, {
      method: "DELETE",
      admin: true,
      body: { confirmationName: event.name },
    }),
    eventContext(event.id),
  ), 200);
  assert.equal(repeatedPermanentDelete.deleted, true);
  assert.equal(repeatedPermanentDelete.permanent, true);
  assert.equal(repeatedPermanentDelete.alreadyDeleted, true);
  assert.deepEqual(repeatedPermanentDelete.impact, expectedImpact);

  for (const table of [
    "events",
    "clubs",
    "responses",
    "participants",
    "stamp_points",
    "stamp_records",
    "club_stamp_records",
  ]) {
    assert.equal(eventRowCount(table, event.id), 0, `${table} retained event data`);
  }

  const auditRows = database.sqlite.prepare(`
    SELECT event_name, action, details
    FROM admin_audit_logs
    WHERE event_id = ?
  `).all(event.id);
  assert.equal(auditRows.filter((row) => row.action === "event.created").length, 1);
  assert.equal(auditRows.filter((row) => row.action === "event.moved_to_trash").length, 2);
  assert.equal(auditRows.filter((row) => row.action === "event.restored").length, 1);
  assert.equal(auditRows.filter((row) => row.action === "event.permanently_deleted").length, 1);
  const permanentAudit = auditRows.find((row) => row.action === "event.permanently_deleted");
  assert.ok(permanentAudit);
  assert.equal(permanentAudit.event_name, event.name);
  assert.deepEqual(JSON.parse(permanentAudit.details), expectedImpact);

  assert.deepEqual(database.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});
