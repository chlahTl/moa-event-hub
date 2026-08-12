import { and, desc, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubStampRecords, clubs, events, participants } from "../../../db/schema";
import { authorizeAdminRequest } from "../../auth";
import { apiError, internalApiError, isUuid } from "../../../lib/api-response";

const PRIVATE_NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId")?.trim() ?? "";
    const clubId = url.searchParams.get("clubId")?.trim() ?? "";
    if (!isUuid(eventId) || (clubId && !isUuid(clubId))) {
      return apiError("참가자 조회 정보를 확인해 주세요.", 400);
    }

    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
      isNull(events.deletedAt),
    )).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);

    if (clubId) {
      const [club] = await db.select({ id: clubs.id, name: clubs.name }).from(clubs)
        .where(and(eq(clubs.id, clubId), eq(clubs.eventId, eventId))).limit(1);
      if (!club) return apiError("이 행사에 속한 동아리를 찾을 수 없습니다.", 404);
      const records = await db.select({
        id: participants.id,
        participantName: participants.participantName,
        gender: participants.gender,
        ageGroup: participants.ageGroup,
        contactInfo: participants.contactInfo,
        affiliation: participants.affiliation,
        recordSource: participants.recordSource,
        createdAt: clubStampRecords.createdAt,
      }).from(clubStampRecords)
        .innerJoin(participants, eq(clubStampRecords.participantId, participants.id))
        .where(and(eq(clubStampRecords.eventId, eventId), eq(clubStampRecords.clubId, clubId)))
        .orderBy(desc(clubStampRecords.createdAt));
      return Response.json({ scope: "club", club, records }, { headers: PRIVATE_NO_STORE });
    }

    const [participantRows, visitRows] = await Promise.all([
      db.select({
        id: participants.id,
        participantName: participants.participantName,
        gender: participants.gender,
        ageGroup: participants.ageGroup,
        contactInfo: participants.contactInfo,
        affiliation: participants.affiliation,
        recordSource: participants.recordSource,
        createdAt: participants.createdAt,
      }).from(participants).where(eq(participants.eventId, eventId)).orderBy(desc(participants.createdAt)),
      db.select({
        participantId: clubStampRecords.participantId,
        clubId: clubs.id,
        clubName: clubs.name,
      }).from(clubStampRecords).innerJoin(clubs, eq(clubStampRecords.clubId, clubs.id))
        .where(eq(clubStampRecords.eventId, eventId)),
    ]);
    return Response.json({
      scope: "event",
      records: participantRows.map((participant) => ({
        ...participant,
        clubs: visitRows
          .filter((visit) => visit.participantId === participant.id)
          .map((visit) => ({ id: visit.clubId, name: visit.clubName })),
      })),
    }, { headers: PRIVATE_NO_STORE });
  } catch {
    return internalApiError("참가자 명단을 불러오지 못했습니다.");
  }
}
