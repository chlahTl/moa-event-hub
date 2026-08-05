import { and, eq, isNotNull } from "drizzle-orm";
import { authorizeAdminRequest } from "../../../../chatgpt-auth";
import { ensureDatabase, getDb } from "../../../../../db";
import { events } from "../../../../../db/schema";
import { apiError, internalApiError, isUuid } from "../../../../../lib/api-response";
import { writeAdminAuditLog } from "../../../../../lib/event-deletion";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { eventId } = await context.params;
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [current] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!current) return apiError("행사를 찾을 수 없습니다.", 404);
    if (!current.deletedAt) {
      return Response.json({ restored: true, alreadyRestored: true, event: normalizeEvent(current) });
    }

    const [event] = await db.update(events).set({
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(events.id, eventId), isNotNull(events.deletedAt))).returning();
    if (!event) {
      const [latest] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (latest && !latest.deletedAt) {
        return Response.json({ restored: true, alreadyRestored: true, event: normalizeEvent(latest) });
      }
      return apiError("행사 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    await writeAdminAuditLog({
      eventId: event.id,
      eventName: event.name,
      action: "event.restored",
      user: authorization.user,
    });
    return Response.json({ restored: true, alreadyRestored: false, event: normalizeEvent(event) });
  } catch {
    return internalApiError("행사를 복구하지 못했습니다.");
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
