import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, responses } from "../../../db/schema";

function csvCell(value: string | null) {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId");
    const clubId = new URL(request.url).searchParams.get("clubId");
    if (!eventId) return Response.json({ error: "eventId가 필요합니다." }, { status: 400 });
    await ensureDatabase();
    const db = getDb();
    const rows = await db
      .select({
        eventName: events.name,
        institution: events.institution,
        clubName: clubs.name,
        participantName: responses.participantName,
        gender: responses.gender,
        ageGroup: responses.ageGroup,
        createdAt: responses.createdAt,
      })
      .from(responses)
      .innerJoin(events, eq(responses.eventId, events.id))
      .innerJoin(clubs, eq(responses.clubId, clubs.id))
      .where(clubId
        ? and(eq(responses.eventId, eventId), eq(responses.clubId, clubId))
        : eq(responses.eventId, eventId));

    if (clubId && !rows.length) {
      const club = await db
        .select({ id: clubs.id })
        .from(clubs)
        .where(and(eq(clubs.id, clubId), eq(clubs.eventId, eventId)))
        .limit(1);
      if (!club.length) return Response.json({ error: "이 행사에 속한 동아리를 찾을 수 없습니다." }, { status: 404 });
    }

    const header = ["행사명", "기관명", "동아리", "이름", "성별", "연령 구분", "입력 일시"];
    const csv = `\uFEFF${header.map(csvCell).join(",")}\n${rows
      .map((row) => [row.eventName, row.institution, row.clubName, row.participantName, row.gender, row.ageGroup, row.createdAt].map(csvCell).join(","))
      .join("\n")}`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="moa-${clubId ? `club-${clubId}` : `event-${eventId}`}.csv"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "엑셀용 파일을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
