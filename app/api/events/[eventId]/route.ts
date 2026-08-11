import { and, eq, isNull } from "drizzle-orm";
import { authorizeAdminRequest } from "../../../auth";
import { ensureDatabase, getDb } from "../../../../db";
import { events } from "../../../../db/schema";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../../lib/api-response";
import { getEventDeletionImpact, writeAdminAuditLog } from "../../../../lib/event-deletion";

const EVENT_STATUSES = new Set(["active", "inactive", "archived"]);

export async function PATCH(
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
    const changedFields = Object.keys(body).filter((key) => ALLOWED_FIELDS.has(key));
    if (!changedFields.length) return apiError("수정할 행사 정보를 입력해 주세요.", 400);
    if (changedFields.some((key) => key === "stampEnabled"
      ? typeof body[key] !== "boolean"
      : typeof body[key] !== "string")) {
      return apiError("행사 정보 형식을 확인해 주세요.", 400);
    }

    await ensureDatabase();
    const db = getDb();
    const [current] = await db.select().from(events).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
    )).limit(1);
    if (!current) return apiError("행사를 찾을 수 없습니다.", 404);
    if (current.deletedAt) return apiError("휴지통에 있는 행사는 복구한 뒤 수정해 주세요.", 409);

    const name = body.name === undefined ? current.name : stringField(body, "name");
    const startDate = body.startDate === undefined
      ? current.startDate || current.eventDate
      : stringField(body, "startDate");
    const endDate = body.endDate === undefined
      ? current.endDate || current.eventDate
      : stringField(body, "endDate");
    const status = body.status === undefined ? current.status : stringField(body, "status");
    const description = body.description === undefined ? current.description : stringField(body, "description");
    const institution = body.institution === undefined ? current.institution : stringField(body, "institution");
    const location = body.location === undefined ? current.location : stringField(body, "location");
    const stampEnabled = body.stampEnabled === undefined ? current.stampEnabled : body.stampEnabled as boolean;
    if (!name) return apiError("행사명을 입력해 주세요.", 400);
    if (name.length > 100) return apiError("행사명은 100자 이내로 입력해 주세요.", 400);
    if (description.length > 1000) return apiError("행사 설명은 1,000자 이내로 입력해 주세요.", 400);
    if (!institution) return apiError("기관명을 입력해 주세요.", 400);
    if (institution.length > 100) return apiError("기관명은 100자 이내로 입력해 주세요.", 400);
    if (location.length > 200) return apiError("장소는 200자 이내로 입력해 주세요.", 400);
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return apiError("행사 날짜 형식을 확인해 주세요.", 400);
    }
    if (endDate < startDate) return apiError("종료일은 시작일보다 빠를 수 없습니다.", 400);
    if (!EVENT_STATUSES.has(status)) return apiError("행사 상태를 확인해 주세요.", 400);

    const [event] = await db.update(events).set({
      name,
      description,
      institution,
      eventDate: startDate,
      startDate,
      endDate,
      location,
      status,
      stampEnabled,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
      isNull(events.deletedAt),
    )).returning();
    if (!event) return apiError("행사 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);

    await writeAdminAuditLog({
      eventId: event.id,
      eventName: event.name,
      action: "event.updated",
      user: authorization.user,
      details: { fields: changedFields },
    });
    return Response.json({ event: normalizeEvent(event) });
  } catch {
    return internalApiError("행사를 수정하지 못했습니다.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { eventId } = await context.params;
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [current] = await db.select().from(events).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
    )).limit(1);
    if (!current) return apiError("행사를 찾을 수 없습니다.", 404);
    const impact = await getEventDeletionImpact(eventId);
    if (current.deletedAt) {
      return Response.json({
        deleted: true,
        alreadyDeleted: true,
        event: normalizeEvent(current),
        impact,
      });
    }

    const now = new Date().toISOString();
    const [event] = await db.update(events).set({
      deletedAt: now,
      deletedBy: authorization.user.email,
      updatedAt: now,
    }).where(and(
      eq(events.id, eventId),
      eq(events.ownerUserId, authorization.user.id),
      isNull(events.deletedAt),
    )).returning();
    if (!event) {
      const [latest] = await db.select().from(events).where(and(
        eq(events.id, eventId),
        eq(events.ownerUserId, authorization.user.id),
      )).limit(1);
      if (latest?.deletedAt) {
        return Response.json({
          deleted: true,
          alreadyDeleted: true,
          event: normalizeEvent(latest),
          impact,
        });
      }
      return apiError("행사 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    await writeAdminAuditLog({
      eventId: event.id,
      eventName: event.name,
      action: "event.moved_to_trash",
      user: authorization.user,
      details: impact,
    });
    return Response.json({
      deleted: true,
      alreadyDeleted: false,
      event: normalizeEvent(event),
      impact,
    });
  } catch {
    return internalApiError("행사를 휴지통으로 이동하지 못했습니다.");
  }
}

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "institution",
  "startDate",
  "endDate",
  "location",
  "status",
  "stampEnabled",
]);

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
