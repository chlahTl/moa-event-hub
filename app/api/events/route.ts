import { count, desc } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, participants, responses, stampPoints } from "../../../db/schema";
import { createPublicToken } from "../../../lib/participant-session";

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const [eventRows, clubRows, pointRows, responseCounts, participantCounts] = await Promise.all([
      db.select().from(events).orderBy(desc(events.eventDate), desc(events.createdAt)),
      db.select().from(clubs).orderBy(clubs.createdAt),
      db.select().from(stampPoints).orderBy(stampPoints.position, stampPoints.createdAt),
      db
        .select({ clubId: responses.clubId, total: count() })
        .from(responses)
        .groupBy(responses.clubId),
      db
        .select({ eventId: participants.eventId, total: count() })
        .from(participants)
        .groupBy(participants.eventId),
    ]);

    const counts = new Map(responseCounts.map((row) => [row.clubId, Number(row.total)]));
    const eventParticipantCounts = new Map(participantCounts.map((row) => [row.eventId, Number(row.total)]));
    return Response.json({
      events: eventRows.map((event) => {
        const eventClubs = clubRows
          .filter((club) => club.eventId === event.id)
          .map((club) => ({ ...club, responseCount: counts.get(club.id) ?? 0 }));
        return {
          ...event,
          startDate: event.startDate || event.eventDate,
          endDate: event.endDate || event.eventDate,
          clubs: eventClubs,
          stampPoints: pointRows.filter((point) => point.eventId === event.id),
          responseCount: eventClubs.reduce((sum, club) => sum + club.responseCount, 0),
          participantCount: eventParticipantCounts.get(event.id) ?? 0,
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
      description?: string;
      institution?: string;
      eventDate?: string;
      startDate?: string;
      endDate?: string;
      location?: string;
    };
    const name = body.name?.trim() ?? "";
    const startDate = body.startDate?.trim() || body.eventDate?.trim() || "";
    const endDate = body.endDate?.trim() || startDate;
    if (!name || !startDate || !endDate) {
      return Response.json({ error: "행사명과 행사 기간을 입력해 주세요." }, { status: 400 });
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return Response.json({ error: "행사 날짜 형식을 확인해 주세요." }, { status: 400 });
    }
    if (endDate < startDate) {
      return Response.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const id = crypto.randomUUID();
    const [event] = await db
      .insert(events)
      .values({
        id,
        name,
        description: body.description?.trim() ?? "",
        institution: body.institution?.trim() || "NCHM",
        eventDate: startDate,
        startDate,
        endDate,
        location: body.location?.trim() ?? "",
        inviteToken: createPublicToken(),
      })
      .returning();
    return Response.json({
      event: { ...event, clubs: [], stampPoints: [], responseCount: 0, participantCount: 0 },
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "행사를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
