import { and, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { events, participants } from "../../../../db/schema";
import { authorizeAdminRequest } from "../../../auth";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../../lib/api-response";
import { writeAdminAuditLog } from "../../../../lib/event-deletion";
import { AGE_GROUPS, GENDERS, normalizeParticipantName } from "../../../../lib/tour";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ participantId: string }> },
) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { participantId } = await context.params;
    if (!isUuid(participantId)) return apiError("참가자 정보 형식을 확인해 주세요.", 400);
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);

    const participantName = normalizeParticipantName(stringField(body, "participantName"));
    const gender = stringField(body, "gender");
    const ageGroup = stringField(body, "ageGroup");
    const contactInfo = stringField(body, "contactInfo");
    const affiliation = stringField(body, "affiliation");
    if (!participantName) return apiError("참가자 이름을 입력해 주세요.", 400);
    if (participantName.length > 30) return apiError("참가자 이름은 30자 이내로 입력해 주세요.", 400);
    if (!GENDERS.has(gender)) return apiError("성별을 선택해 주세요.", 400);
    if (!AGE_GROUPS.has(ageGroup)) return apiError("연령 구분을 선택해 주세요.", 400);
    if (contactInfo.length > 100) return apiError("학번 또는 연락처는 100자 이내로 입력해 주세요.", 400);
    if (affiliation.length > 100) return apiError("소속은 100자 이내로 입력해 주세요.", 400);

    await ensureDatabase();
    const db = getDb();
    const [owned] = await db.select({ participant: participants, event: events }).from(participants)
      .innerJoin(events, eq(participants.eventId, events.id))
      .where(and(
        eq(participants.id, participantId),
        eq(events.ownerUserId, authorization.user.id),
        isNull(events.deletedAt),
      )).limit(1);
    if (!owned) return apiError("참가자를 찾을 수 없습니다.", 404);

    const [participant] = await db.update(participants).set({
      participantName,
      gender,
      ageGroup,
      contactInfo,
      affiliation,
      lastSeenAt: new Date().toISOString(),
    }).where(eq(participants.id, participantId)).returning();
    await writeAdminAuditLog({
      eventId: owned.event.id,
      eventName: owned.event.name,
      action: "participant.updated",
      user: authorization.user,
      details: { participantId },
    });
    return Response.json({ participant }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return internalApiError("참가자 정보를 수정하지 못했습니다.");
  }
}
