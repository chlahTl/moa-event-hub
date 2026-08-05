import { ensureDatabase, getDb } from "../../../db";
import { clubs, events } from "../../../db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      eventId?: string;
      name?: string;
      description?: string;
      stampEmoji?: string;
      stampMessage?: string;
      submissionGuide?: string;
      collectGender?: boolean;
      collectAge?: boolean;
    };
    const eventId = body.eventId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    if (!eventId || !name) {
      return Response.json({ error: "행사와 동아리명을 확인해 주세요." }, { status: 400 });
    }
    if (!body.collectGender && !body.collectAge) {
      return Response.json({ error: "받을 정보를 하나 이상 선택해 주세요." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const parent = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!parent.length) return Response.json({ error: "행사를 찾을 수 없습니다." }, { status: 404 });

    const [club] = await db
      .insert(clubs)
      .values({
        id: crypto.randomUUID(),
        eventId,
        name,
        description: body.description?.trim() ?? "",
        stampEmoji: normalizeStampEmoji(body.stampEmoji),
        stampMessage: body.stampMessage?.trim().slice(0, 120) ?? "",
        submissionGuide: body.submissionGuide?.trim().slice(0, 300) ?? "",
        collectGender: body.collectGender ?? true,
        collectAge: body.collectAge ?? true,
      })
      .returning();
    return Response.json({ club: { ...club, responseCount: 0 } }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "동아리를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}

function normalizeStampEmoji(value?: string) {
  return value?.trim().slice(0, 8) || "⭐";
}
