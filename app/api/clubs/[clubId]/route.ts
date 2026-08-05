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
