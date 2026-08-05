import { and, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, responses } from "../../../db/schema";
import { authorizeAdminRequest } from "../../chatgpt-auth";
import { apiError, internalApiError, isUuid } from "../../../lib/api-response";

function csvCell(value: string | null) {
  const raw = value ?? "";
  const escapedFormula = /^[=+\-@]/.test(raw.trimStart()) || /^[\t\r]/.test(raw)
    ? `'${raw}`
    : raw;
  return `"${escapedFormula.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const authorization = authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
    const clubId = new URL(request.url).searchParams.get("clubId")?.trim() ?? "";
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    if (clubId && !isUuid(clubId)) return apiError("동아리 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt))).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);
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
        ? and(eq(responses.eventId, eventId), eq(responses.clubId, clubId), isNull(events.deletedAt))
        : and(eq(responses.eventId, eventId), isNull(events.deletedAt)));

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
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return internalApiError("엑셀용 파일을 만들지 못했습니다.");
  }
}
