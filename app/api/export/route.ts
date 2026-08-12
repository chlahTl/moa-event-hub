import { and, desc, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubStampRecords, clubs, events, participants, responses } from "../../../db/schema";
import { authorizeAdminRequest } from "../../auth";
import { apiError, internalApiError, isUuid } from "../../../lib/api-response";

function csvCell(value: string | null) {
  const raw = value ?? "";
  const escapedFormula = /^[=+\-@]/.test(raw.trimStart()) || /^[\t\r]/.test(raw)
    ? `'${raw}`
    : raw;
  return `"${escapedFormula.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId")?.trim() ?? "";
    const clubId = url.searchParams.get("clubId")?.trim() ?? "";
    const scope = url.searchParams.get("scope")?.trim() ?? "activity";
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    if (clubId && !isUuid(clubId)) return apiError("동아리 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.id, eventId), eq(events.ownerUserId, authorization.user.id), isNull(events.deletedAt))).limit(1);
    if (!event) return apiError("행사를 찾을 수 없습니다.", 404);
    if (scope === "participants") {
      const [participantRows, visitRows] = await Promise.all([
        db.select({
          eventName: events.name,
          institution: events.institution,
          id: participants.id,
          participantName: participants.participantName,
          gender: participants.gender,
          ageGroup: participants.ageGroup,
          contactInfo: participants.contactInfo,
          affiliation: participants.affiliation,
          recordSource: participants.recordSource,
          createdAt: participants.createdAt,
        }).from(participants).innerJoin(events, eq(participants.eventId, events.id))
          .where(and(eq(participants.eventId, eventId), isNull(events.deletedAt)))
          .orderBy(desc(participants.createdAt)),
        db.select({ participantId: clubStampRecords.participantId, clubName: clubs.name })
          .from(clubStampRecords).innerJoin(clubs, eq(clubStampRecords.clubId, clubs.id))
          .where(eq(clubStampRecords.eventId, eventId)),
      ]);
      const header = ["행사명", "기관명", "이름", "성별", "연령 구분", "학번·연락처", "소속", "참여 동아리", "등록 방식", "등록 일시"];
      const csv = `\uFEFF${header.map(csvCell).join(",")}\n${participantRows.map((row) => [
        row.eventName,
        row.institution,
        row.participantName,
        row.gender,
        row.ageGroup,
        row.contactInfo,
        row.affiliation,
        visitRows.filter((visit) => visit.participantId === row.id).map((visit) => visit.clubName).join(" · "),
        row.recordSource,
        row.createdAt,
      ].map(csvCell).join(",")).join("\n")}`;
      return csvDownload(csv, `moa-participants-${eventId}.csv`);
    }
    if (scope !== "activity") return apiError("내보내기 범위를 확인해 주세요.", 400);
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
    return csvDownload(csv, `moa-${clubId ? `club-${clubId}` : `event-${eventId}`}.csv`);
  } catch {
    return internalApiError("엑셀용 파일을 만들지 못했습니다.");
  }
}

function csvDownload(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
