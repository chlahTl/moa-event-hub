import { and, count, desc, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, responses } from "../../../db/schema";
import { authorizeAdminRequest } from "../../auth";
import { apiError, internalApiError, isUuid } from "../../../lib/api-response";

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, eventId), eq(events.ownerUserId, authorization.user.id), isNull(events.deletedAt))).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);
    const [gender, age, recent] = await Promise.all([
      db
        .select({ label: responses.gender, total: count() })
        .from(responses)
        .where(eq(responses.eventId, eventId))
        .groupBy(responses.gender),
      db
        .select({ label: responses.ageGroup, total: count() })
        .from(responses)
        .where(eq(responses.eventId, eventId))
        .groupBy(responses.ageGroup),
      db
        .select({
          id: responses.id,
          clubName: clubs.name,
          participantName: responses.participantName,
          gender: responses.gender,
          ageGroup: responses.ageGroup,
          createdAt: responses.createdAt,
        })
        .from(responses)
        .innerJoin(clubs, eq(responses.clubId, clubs.id))
        .where(eq(responses.eventId, eventId))
        .orderBy(desc(responses.createdAt))
        .limit(8),
    ]);
    return Response.json({
      gender: gender.filter((item) => item.label).map((item) => ({ ...item, total: Number(item.total) })),
      age: age.filter((item) => item.label).map((item) => ({ ...item, total: Number(item.total) })),
      recent,
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return internalApiError("통계를 불러오지 못했습니다.");
  }
}
