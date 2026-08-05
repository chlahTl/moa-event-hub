import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { events, stampPoints } from "../../../db/schema";
import { createPublicToken } from "../../../lib/participant-session";
import { authorizeAdminRequest } from "../../chatgpt-auth";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../lib/api-response";

export async function GET(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt))).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);
    const points = await db
      .select()
      .from(stampPoints)
      .where(eq(stampPoints.eventId, eventId))
      .orderBy(asc(stampPoints.position), asc(stampPoints.createdAt));
    return Response.json({ points }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return internalApiError("스탬프 지점을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    const eventId = stringField(body, "eventId");
    const name = stringField(body, "name");
    const description = stringField(body, "description");
    if (!name) {
      return Response.json({ error: "행사와 지점명을 확인해 주세요." }, { status: 400 });
    }
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    if (name.length > 40) {
      return Response.json({ error: "지점명은 40자 이내로 입력해 주세요." }, { status: 400 });
    }
    if (description.length > 300) return apiError("지점 설명은 300자 이내로 입력해 주세요.", 400);

    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt))).limit(1);
    if (!event) return Response.json({ error: "행사를 찾을 수 없습니다." }, { status: 404 });
    const [lastPosition] = await db
      .select({ value: sql<number>`coalesce(max(${stampPoints.position}), 0)` })
      .from(stampPoints)
      .where(eq(stampPoints.eventId, eventId));
    const [point] = await db.insert(stampPoints).values({
      id: crypto.randomUUID(),
      eventId,
      token: createPublicToken(),
      name,
      description,
      position: Number(lastPosition?.value ?? 0) + 1,
    }).returning();
    return Response.json({ point }, { status: 201 });
  } catch {
    return internalApiError("스탬프 지점을 만들지 못했습니다.");
  }
}
