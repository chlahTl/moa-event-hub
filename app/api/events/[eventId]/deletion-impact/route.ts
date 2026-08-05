import { eq } from "drizzle-orm";
import { authorizeAdminRequest } from "../../../../chatgpt-auth";
import { ensureDatabase, getDb } from "../../../../../db";
import { events } from "../../../../../db/schema";
import { apiError, internalApiError, isUuid } from "../../../../../lib/api-response";
import { getEventDeletionImpact } from "../../../../../lib/event-deletion";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { eventId } = await context.params;
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const [event] = await getDb().select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);
    return Response.json(
      { impact: await getEventDeletionImpact(eventId) },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch {
    return internalApiError("삭제할 데이터 수를 확인하지 못했습니다.");
  }
}
