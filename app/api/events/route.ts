import { count, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, responses } from "../../../db/schema";

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const [eventRows, clubRows, responseCounts] = await Promise.all([
      db.select().from(events).orderBy(desc(events.eventDate), desc(events.createdAt)),
      db.select().from(clubs).orderBy(clubs.createdAt),
      db
        .select({ clubId: responses.clubId, total: count() })
        .from(responses)
        .groupBy(responses.clubId),
    ]);

    const counts = new Map(responseCounts.map((row) => [row.clubId, Number(row.total)]));
    return Response.json({
      events: eventRows.map((event) => {
        const eventClubs = clubRows
          .filter((club) => club.eventId === event.id)
          .map((club) => ({ ...club, responseCount: counts.get(club.id) ?? 0 }));
        return {
          ...event,
          clubs: eventClubs,
          responseCount: eventClubs.reduce((sum, club) => sum + club.responseCount, 0),
        };
      }),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "행사 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      institution?: string;
      eventDate?: string;
      location?: string;
    };
    const name = body.name?.trim() ?? "";
    const eventDate = body.eventDate?.trim() ?? "";
    if (!name || !eventDate) {
      return Response.json({ error: "행사명과 날짜를 입력해 주세요." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const id = crypto.randomUUID();
    const [event] = await db
      .insert(events)
      .values({
        id,
        name,
        institution: body.institution?.trim() || "NCHM",
        eventDate,
        location: body.location?.trim() ?? "",
      })
      .returning();
    return Response.json({ event: { ...event, clubs: [], responseCount: 0 } }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "행사를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
