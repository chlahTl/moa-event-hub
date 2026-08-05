import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, responses } from "../../../db/schema";

function csvCell(value: string | null) {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId");
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
      .where(eq(responses.eventId, eventId));

    const header = ["행사명", "기관명", "동아리", "이름", "성별", "연령 구분", "입력 일시"];
    const csv = `\uFEFF${header.map(csvCell).join(",")}\n${rows
      .map((row) => [row.eventName, row.institution, row.clubName, row.participantName, row.gender, row.ageGroup, row.createdAt].map(csvCell).join(","))
      .join("\n")}`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="moa-event-${eventId}.csv"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "엑셀용 파일을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
