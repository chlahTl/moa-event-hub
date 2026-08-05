import { count, desc, inArray, isNotNull, isNull } from "drizzle-orm";
import { authorizeAdminRequest } from "../../chatgpt-auth";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, participants, responses, stampPoints } from "../../../db/schema";
import { apiError, internalApiError, readJsonObject, stringField } from "../../../lib/api-response";
import { writeAdminAuditLog } from "../../../lib/event-deletion";
import { createPublicToken } from "../../../lib/participant-session";

const EVENT_STATUSES = new Set(["active", "inactive", "archived"]);
const PRIVATE_NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const view = new URL(request.url).searchParams.get("view") ?? "active";
    if (view !== "active" && view !== "trash") {
      return apiError("행사 목록 보기 옵션을 확인해 주세요.", 400);
    }

    await ensureDatabase();
    const db = getDb();
    const eventRows = await db
      .select()
      .from(events)
      .where(view === "trash" ? isNotNull(events.deletedAt) : isNull(events.deletedAt))
      .orderBy(desc(events.eventDate), desc(events.createdAt));
    if (!eventRows.length) {
      return Response.json({ events: [] }, { headers: PRIVATE_NO_STORE });
    }

    const eventIds = eventRows.map((event) => event.id);
    const [clubRows, pointRows, responseCounts, participantCounts] = await Promise.all([
      db.select().from(clubs).where(inArray(clubs.eventId, eventIds)).orderBy(clubs.createdAt),
      db.select().from(stampPoints).where(inArray(stampPoints.eventId, eventIds))
        .orderBy(stampPoints.position, stampPoints.createdAt),
      db
        .select({ clubId: responses.clubId, total: count() })
        .from(responses)
        .where(inArray(responses.eventId, eventIds))
        .groupBy(responses.clubId),
      db
        .select({ eventId: participants.eventId, total: count() })
        .from(participants)
        .where(inArray(participants.eventId, eventIds))
        .groupBy(participants.eventId),
    ]);

    const counts = new Map(responseCounts.map((row) => [row.clubId, Number(row.total)]));
    const eventParticipantCounts = new Map(participantCounts.map((row) => [row.eventId, Number(row.total)]));
    return Response.json({
      events: eventRows.map((event) => {
        const eventClubs = clubRows
          .filter((club) => club.eventId === event.id)
          .map((club) => ({ ...club, responseCount: counts.get(club.id) ?? 0 }));
        return normalizeEvent({
          ...event,
          clubs: eventClubs,
          stampPoints: pointRows.filter((point) => point.eventId === event.id),
          clubCount: eventClubs.length,
          responseCount: eventClubs.reduce((sum, club) => sum + club.responseCount, 0),
          participantCount: eventParticipantCounts.get(event.id) ?? 0,
        });
      }),
    }, { headers: PRIVATE_NO_STORE });
  } catch {
    return internalApiError("행사 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);

    const name = stringField(body, "name");
    const eventDate = stringField(body, "eventDate");
    const startDate = stringField(body, "startDate") || eventDate;
    const endDate = stringField(body, "endDate") || startDate;
    const status = stringField(body, "status") || "active";
    const description = stringField(body, "description");
    const institution = stringField(body, "institution") || "NCHM";
    const location = stringField(body, "location");
    if (!name || !startDate || !endDate) {
      return apiError("행사명과 행사 기간을 입력해 주세요.", 400);
    }
    if (name.length > 100) return apiError("행사명은 100자 이내로 입력해 주세요.", 400);
    if (description.length > 1000) return apiError("행사 설명은 1,000자 이내로 입력해 주세요.", 400);
    if (institution.length > 100) return apiError("기관명은 100자 이내로 입력해 주세요.", 400);
    if (location.length > 200) return apiError("장소는 200자 이내로 입력해 주세요.", 400);
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return apiError("행사 날짜 형식을 확인해 주세요.", 400);
    }
    if (endDate < startDate) return apiError("종료일은 시작일보다 빠를 수 없습니다.", 400);
    if (!EVENT_STATUSES.has(status)) return apiError("행사 상태를 확인해 주세요.", 400);

    const now = new Date().toISOString();
    await ensureDatabase();
    const db = getDb();
    const id = crypto.randomUUID();
    const [event] = await db
      .insert(events)
      .values({
        id,
        name,
        description,
        institution,
        eventDate: startDate,
        startDate,
        endDate,
        location,
        status,
        inviteToken: createPublicToken(),
        updatedAt: now,
      })
      .returning();
    await writeAdminAuditLog({
      eventId: event.id,
      eventName: event.name,
      action: "event.created",
      user: authorization.user,
    });
    return Response.json({
      event: normalizeEvent({
        ...event,
        clubs: [],
        stampPoints: [],
        clubCount: 0,
        responseCount: 0,
        participantCount: 0,
      }),
    }, { status: 201 });
  } catch {
    return internalApiError("행사를 만들지 못했습니다.");
  }
}

function normalizeEvent<T extends {
  eventDate: string;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string | null;
  createdAt: string;
}>(event: T) {
  return {
    ...event,
    startDate: event.startDate || event.eventDate,
    endDate: event.endDate || event.eventDate,
    updatedAt: event.updatedAt || event.createdAt,
  };
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
