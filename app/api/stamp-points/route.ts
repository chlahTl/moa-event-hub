import { asc, eq, sql } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { events, stampPoints } from "../../../db/schema";
import { createPublicToken } from "../../../lib/participant-session";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    if (!eventId) return Response.json({ error: "행사 정보가 필요합니다." }, { status: 400 });
    await ensureDatabase();
    const db = getDb();
    const points = await db
      .select()
      .from(stampPoints)
      .where(eq(stampPoints.eventId, eventId))
      .orderBy(asc(stampPoints.position), asc(stampPoints.createdAt));
    return Response.json({ points });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "스탬프 지점을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { eventId?: string; name?: string; description?: string };
    const eventId = body.eventId?.trim() ?? "";
    const name = body.name?.normalize("NFKC").trim() ?? "";
    if (!eventId || !name) {
      return Response.json({ error: "행사와 지점명을 확인해 주세요." }, { status: 400 });
    }
    if (name.length > 40) {
      return Response.json({ error: "지점명은 40자 이내로 입력해 주세요." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
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
      description: body.description?.normalize("NFKC").trim() ?? "",
      position: Number(lastPosition?.value ?? 0) + 1,
    }).returning();
    return Response.json({ point }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "스탬프 지점을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
