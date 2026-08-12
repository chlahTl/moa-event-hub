import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import {
  clubStampRecords,
  clubs,
  events,
  participants,
  responses,
  stampPoints,
  stampRecords,
} from "../../../db/schema";
import { authorizeAdminRequest } from "../../auth";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../lib/api-response";
import { writeAdminAuditLog } from "../../../lib/event-deletion";
import { AGE_GROUPS, GENDERS, normalizeParticipantName } from "../../../lib/tour";

const PRIVATE_NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
      isNull(events.deletedAt),
    )).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);

    const records = await db.select().from(participants).where(and(
      eq(participants.eventId, eventId),
      eq(participants.recordSource, "manual"),
    )).orderBy(desc(participants.visitedAt), desc(participants.createdAt));
    if (!records.length) return Response.json({ records: [] }, { headers: PRIVATE_NO_STORE });

    const participantIds = records.map((record) => record.id);
    const [clubVisits, pointVisits] = await Promise.all([
      db.select({ participantId: clubStampRecords.participantId, name: clubs.name })
        .from(clubStampRecords)
        .innerJoin(clubs, eq(clubStampRecords.clubId, clubs.id))
        .where(inArray(clubStampRecords.participantId, participantIds)),
      db.select({ participantId: stampRecords.participantId, name: stampPoints.name })
        .from(stampRecords)
        .innerJoin(stampPoints, eq(stampRecords.stampPointId, stampPoints.id))
        .where(inArray(stampRecords.participantId, participantIds)),
    ]);
    return Response.json({
      records: records.map((record) => ({
        ...record,
        clubs: clubVisits.filter((visit) => visit.participantId === record.id).map((visit) => visit.name),
        stampPoints: pointVisits.filter((visit) => visit.participantId === record.id).map((visit) => visit.name),
      })),
    }, { headers: PRIVATE_NO_STORE });
  } catch {
    return internalApiError("종이 접수 기록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    const eventId = stringField(body, "eventId");
    const participantName = normalizeParticipantName(stringField(body, "participantName"));
    const contactInfo = stringField(body, "contactInfo");
    const affiliation = stringField(body, "affiliation");
    const gender = stringField(body, "gender");
    const ageGroup = stringField(body, "ageGroup");
    const visitedAtInput = stringField(body, "visitedAt");
    const clubIds = stringArrayField(body, "clubIds");
    const stampPointIds = stringArrayField(body, "stampPointIds");
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    if (!participantName) return apiError("참가자 이름을 입력해 주세요.", 400);
    if (participantName.length > 30) return apiError("참가자 이름은 30자 이내로 입력해 주세요.", 400);
    if (contactInfo.length > 100) return apiError("학번 또는 연락처는 100자 이내로 입력해 주세요.", 400);
    if (affiliation.length > 100) return apiError("소속은 100자 이내로 입력해 주세요.", 400);
    if (!GENDERS.has(gender)) return apiError("성별을 선택해 주세요.", 400);
    if (!AGE_GROUPS.has(ageGroup)) return apiError("연령 구분을 선택해 주세요.", 400);
    if (clubIds.length > 100 || stampPointIds.length > 100 || [...clubIds, ...stampPointIds].some((id) => !isUuid(id))) {
      return apiError("스탬프 선택 정보를 확인해 주세요.", 400);
    }
    const visitedAt = visitedAtInput
      ? new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(visitedAtInput) ? `${visitedAtInput}+09:00` : visitedAtInput)
      : new Date();
    if (Number.isNaN(visitedAt.valueOf())) return apiError("방문 시간을 확인해 주세요.", 400);

    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select().from(events).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
      isNull(events.deletedAt),
    )).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);
    if (!event.stampEnabled && (clubIds.length || stampPointIds.length)) {
      return apiError("스탬프를 사용하지 않는 행사에는 스탬프 내역을 등록할 수 없습니다.", 409);
    }

    const selectedClubs = clubIds.length
      ? await db.select().from(clubs).where(and(eq(clubs.eventId, eventId), inArray(clubs.id, clubIds)))
      : [];
    const selectedPoints = stampPointIds.length
      ? await db.select().from(stampPoints).where(and(eq(stampPoints.eventId, eventId), inArray(stampPoints.id, stampPointIds)))
      : [];
    if (selectedClubs.length !== new Set(clubIds).size || selectedPoints.length !== new Set(stampPointIds).size) {
      return apiError("이 행사에 속하지 않은 스탬프 항목이 포함되어 있습니다.", 400);
    }

    const participantId = crypto.randomUUID();
    const timestamp = visitedAt.toISOString();
    await db.insert(participants).values({
      id: participantId,
      eventId,
      deviceTokenHash: `manual:${crypto.randomUUID()}`,
      participantName,
      gender,
      ageGroup,
      contactInfo,
      affiliation,
      visitedAt: timestamp,
      recordSource: "manual",
      lastSeenAt: timestamp,
    });
    try {
      for (const club of selectedClubs) {
        await db.insert(clubStampRecords).values({
          id: crypto.randomUUID(),
          eventId,
          participantId,
          clubId: club.id,
          createdAt: timestamp,
        });
        await db.insert(responses).values({
          id: crypto.randomUUID(),
          eventId,
          clubId: club.id,
          participantName,
          gender,
          ageGroup,
          createdAt: timestamp,
        });
      }
      for (const point of selectedPoints) {
        await db.insert(stampRecords).values({
          id: crypto.randomUUID(),
          eventId,
          participantId,
          stampPointId: point.id,
          createdAt: timestamp,
        });
      }
    } catch (error) {
      await db.delete(participants).where(eq(participants.id, participantId));
      throw error;
    }
    await writeAdminAuditLog({
      eventId,
      eventName: event.name,
      action: "participant.manually_recorded",
      user: authorization.user,
      details: { clubCount: selectedClubs.length, stampPointCount: selectedPoints.length },
    });
    return Response.json({ record: { id: participantId } }, { status: 201 });
  } catch {
    return internalApiError("종이 접수 기록을 저장하지 못했습니다.");
  }
}

function stringArrayField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}
