import { and, desc, eq } from "drizzle-orm";
import { authorizeAdminRequest } from "../../../../auth";
import { ensureDatabase, getDb } from "../../../../../db";
import { adminAuditLogs, events } from "../../../../../db/schema";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../../../lib/api-response";
import { getEventDeletionImpact, permanentlyDeleteEvent } from "../../../../../lib/event-deletion";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { eventId } = await context.params;
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    const confirmationName = stringField(body, "confirmationName");
    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select().from(events).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
    )).limit(1);
    if (!event) {
      const audit = await findPermanentDeletionAudit(eventId, authorization.user.id);
      if (!audit) return apiError("행사를 찾을 수 없습니다.", 404);
      if (confirmationName !== audit.eventName.normalize("NFKC").trim()) {
        return apiError("행사명을 정확히 입력해 주세요.", 400);
      }
      return Response.json({
        deleted: true,
        permanent: true,
        alreadyDeleted: true,
        impact: parseImpact(audit.details),
      });
    }
    if (!event.deletedAt) return apiError("먼저 행사를 휴지통으로 이동해 주세요.", 409);
    if (confirmationName !== event.name.normalize("NFKC").trim()) {
      return apiError("행사명을 정확히 입력해 주세요.", 400);
    }

    const impact = await getEventDeletionImpact(eventId);
    try {
      await permanentlyDeleteEvent({
        eventId,
        eventName: event.name,
        user: authorization.user,
        ownerUserId: authorization.user.id,
        impact,
      });
    } catch {
      // A matching completion audit means another identical request won the
      // race and the desired state was reached successfully.
      const audit = await findPermanentDeletionAudit(eventId, authorization.user.id);
      if (audit && confirmationName === audit.eventName.normalize("NFKC").trim()) {
        return Response.json({
          deleted: true,
          permanent: true,
          alreadyDeleted: true,
          impact: parseImpact(audit.details),
        });
      }
      throw new Error("permanent-delete-failed");
    }
    return Response.json({ deleted: true, permanent: true, alreadyDeleted: false, impact });
  } catch {
    return internalApiError("행사를 영구 삭제하지 못했습니다.");
  }
}

async function findPermanentDeletionAudit(eventId: string, actorUserId: string) {
  const [audit] = await getDb().select({
    eventName: adminAuditLogs.eventName,
    details: adminAuditLogs.details,
  }).from(adminAuditLogs).where(and(
    eq(adminAuditLogs.eventId, eventId),
    eq(adminAuditLogs.action, "event.permanently_deleted"),
    eq(adminAuditLogs.actorUserId, actorUserId),
  )).orderBy(desc(adminAuditLogs.createdAt)).limit(1);
  return audit ?? null;
}

function parseImpact(value: string) {
  const empty = {
    clubCount: 0,
    participantCount: 0,
    responseCount: 0,
    stampPointCount: 0,
    stampRecordCount: 0,
    clubStampRecordCount: 0,
  };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.keys(empty).map((key) => [
      key,
      typeof parsed[key] === "number" && Number.isFinite(parsed[key]) ? parsed[key] : 0,
    ])) as typeof empty;
  } catch {
    return empty;
  }
}
