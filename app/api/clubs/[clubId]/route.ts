import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { clubs, events } from "../../../../db/schema";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string }> },
) {
  try {
    const { clubId } = await context.params;
    await ensureDatabase();
    const db = getDb();
    const rows = await db
      .select({
        id: clubs.id,
        name: clubs.name,
        description: clubs.description,
        stampEmoji: clubs.stampEmoji,
        stampMessage: clubs.stampMessage,
        submissionGuide: clubs.submissionGuide,
        collectGender: clubs.collectGender,
        collectAge: clubs.collectAge,
        eventId: events.id,
        eventName: events.name,
        institution: events.institution,
        eventDate: events.eventDate,
        location: events.location,
      })
      .from(clubs)
      .innerJoin(events, eq(clubs.eventId, events.id))
      .where(eq(clubs.id, clubId))
      .limit(1);
    if (!rows.length) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ club: rows[0] });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "동아리를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ clubId: string }> },
) {
  try {
    const { clubId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      stampEmoji?: string;
      stampMessage?: string;
      submissionGuide?: string;
      collectGender?: boolean;
      collectAge?: boolean;
    };
    const name = body.name?.trim() ?? "";
    if (!name) return Response.json({ error: "동아리명을 입력해 주세요." }, { status: 400 });
    if (!body.collectGender && !body.collectAge) {
      return Response.json({ error: "받을 정보를 하나 이상 선택해 주세요." }, { status: 400 });
    }
    await ensureDatabase();
    const db = getDb();
    const [club] = await db
      .update(clubs)
      .set({
        name: name.slice(0, 60),
        description: body.description?.trim().slice(0, 200) ?? "",
        stampEmoji: body.stampEmoji?.trim().slice(0, 8) || "⭐",
        stampMessage: body.stampMessage?.trim().slice(0, 120) ?? "",
        submissionGuide: body.submissionGuide?.trim().slice(0, 300) ?? "",
        collectGender: body.collectGender ?? true,
        collectAge: body.collectAge ?? true,
      })
      .where(eq(clubs.id, clubId))
      .returning();
    if (!club) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ club });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "동아리를 수정하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ clubId: string }> },
) {
  try {
    const { clubId } = await context.params;
    await ensureDatabase();
    const db = getDb();
    const deleted = await db.delete(clubs).where(eq(clubs.id, clubId)).returning({ id: clubs.id });
    if (!deleted.length) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "동아리를 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
