import { and, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { clubs, events } from "../../../../db/schema";
import { authorizeAdminRequest } from "../../../auth";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../../lib/api-response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string }> },
) {
  try {
    const { clubId } = await context.params;
    if (!isUuid(clubId)) return apiError("동아리 정보 형식을 확인해 주세요.", 400);
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
        stampEnabled: events.stampEnabled,
      })
      .from(clubs)
      .innerJoin(events, eq(clubs.eventId, events.id))
      .where(and(eq(clubs.id, clubId), isNull(events.deletedAt)))
      .limit(1);
    if (!rows.length) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    if (!rows[0].stampEnabled) return apiError("이 행사는 스탬프 참여를 사용하지 않습니다.", 410);
    return Response.json({ club: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return internalApiError("동아리를 불러오지 못했습니다.");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ clubId: string }> },
) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { clubId } = await context.params;
    if (!isUuid(clubId)) return apiError("동아리 정보 형식을 확인해 주세요.", 400);
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [existing] = await db.select({ club: clubs }).from(clubs)
      .innerJoin(events, eq(clubs.eventId, events.id))
      .where(and(
        eq(clubs.id, clubId),
        eq(events.ownerUserId, authorization.user.id),
        isNull(events.deletedAt),
      )).limit(1);
    if (!existing) return apiError("동아리를 찾을 수 없습니다.", 404);
    const name = body.name === undefined ? existing.club.name : stringField(body, "name");
    const description = body.description === undefined
      ? existing.club.description
      : stringField(body, "description");
    const stampEmoji = body.stampEmoji === undefined
      ? existing.club.stampEmoji
      : stringField(body, "stampEmoji") || "⭐";
    const stampMessage = body.stampMessage === undefined
      ? existing.club.stampMessage
      : stringField(body, "stampMessage");
    const submissionGuide = body.submissionGuide === undefined
      ? existing.club.submissionGuide
      : stringField(body, "submissionGuide");
    if (!name) return apiError("동아리명을 입력해 주세요.", 400);
    if (name.length > 60) return apiError("동아리명은 60자 이내로 입력해 주세요.", 400);
    if (description.length > 200) return apiError("동아리 설명은 200자 이내로 입력해 주세요.", 400);
    if (stampEmoji.length > 8) return apiError("스탬프 표시는 8자 이내로 입력해 주세요.", 400);
    if (stampMessage.length > 120) return apiError("완료 문구는 120자 이내로 입력해 주세요.", 400);
    if (submissionGuide.length > 300) return apiError("제출 안내는 300자 이내로 입력해 주세요.", 400);
    if ((body.collectGender !== undefined && typeof body.collectGender !== "boolean") ||
        (body.collectAge !== undefined && typeof body.collectAge !== "boolean")) {
      return apiError("수집 정보 설정을 확인해 주세요.", 400);
    }
    const collectGender = typeof body.collectGender === "boolean"
      ? body.collectGender
      : existing.club.collectGender;
    const collectAge = typeof body.collectAge === "boolean"
      ? body.collectAge
      : existing.club.collectAge;
    if (!collectGender && !collectAge) {
      return apiError("받을 정보를 하나 이상 선택해 주세요.", 400);
    }
    const [club] = await db
      .update(clubs)
      .set({
        name,
        description,
        stampEmoji,
        stampMessage,
        submissionGuide,
        collectGender,
        collectAge,
      })
      .where(eq(clubs.id, clubId))
      .returning();
    if (!club) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ club });
  } catch {
    return internalApiError("동아리를 수정하지 못했습니다.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ clubId: string }> },
) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const { clubId } = await context.params;
    if (!isUuid(clubId)) return apiError("동아리 정보 형식을 확인해 주세요.", 400);
    await ensureDatabase();
    const db = getDb();
    const [existing] = await db.select({ id: clubs.id }).from(clubs)
      .innerJoin(events, eq(clubs.eventId, events.id))
      .where(and(
        eq(clubs.id, clubId),
        eq(events.ownerUserId, authorization.user.id),
        isNull(events.deletedAt),
      )).limit(1);
    if (!existing) return apiError("동아리를 찾을 수 없습니다.", 404);
    const deleted = await db.delete(clubs).where(eq(clubs.id, clubId)).returning({ id: clubs.id });
    if (!deleted.length) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch {
    return internalApiError("동아리를 삭제하지 못했습니다.");
  }
}
