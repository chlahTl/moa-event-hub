import { ensureDatabase, getDb } from "../../../db";
import { clubs, events } from "../../../db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { authorizeAdminRequest } from "../../auth";
import { apiError, internalApiError, isUuid, readJsonObject, stringField } from "../../../lib/api-response";

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    const eventId = stringField(body, "eventId");
    const name = stringField(body, "name");
    const description = stringField(body, "description");
    const stampEmoji = stringField(body, "stampEmoji");
    const stampMessage = stringField(body, "stampMessage");
    const submissionGuide = stringField(body, "submissionGuide");
    if (!name) {
      return Response.json({ error: "행사와 동아리명을 확인해 주세요." }, { status: 400 });
    }
    if (!isUuid(eventId)) return apiError("행사 정보 형식을 확인해 주세요.", 400);
    if (name.length > 60) return apiError("동아리명은 60자 이내로 입력해 주세요.", 400);
    if (description.length > 200) return apiError("동아리 설명은 200자 이내로 입력해 주세요.", 400);
    if (stampEmoji.length > 8) return apiError("스탬프 표시는 8자 이내로 입력해 주세요.", 400);
    if (stampMessage.length > 120) return apiError("완료 문구는 120자 이내로 입력해 주세요.", 400);
    if (submissionGuide.length > 300) return apiError("제출 안내는 300자 이내로 입력해 주세요.", 400);
    if ((body.collectGender !== undefined && typeof body.collectGender !== "boolean") ||
        (body.collectAge !== undefined && typeof body.collectAge !== "boolean")) {
      return apiError("수집 정보 설정을 확인해 주세요.", 400);
    }
    const collectGender = typeof body.collectGender === "boolean" ? body.collectGender : true;
    const collectAge = typeof body.collectAge === "boolean" ? body.collectAge : true;
    if (!collectGender && !collectAge) {
      return Response.json({ error: "받을 정보를 하나 이상 선택해 주세요." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const parent = await db.select({ id: events.id, stampEnabled: events.stampEnabled }).from(events)
      .where(and(
        eq(events.id, eventId),
        eq(events.ownerUserId, authorization.user.id),
        isNull(events.deletedAt),
      )).limit(1);
    if (!parent.length) return apiError("행사를 찾을 수 없습니다.", 404);
    if (!parent[0].stampEnabled) return apiError("스탬프 사용을 켠 행사에서만 동아리 QR을 만들 수 있습니다.", 409);

    const [club] = await db
      .insert(clubs)
      .values({
        id: crypto.randomUUID(),
        eventId,
        name,
        description,
        stampEmoji: normalizeStampEmoji(stampEmoji),
        stampMessage,
        submissionGuide,
        collectGender,
        collectAge,
      })
      .returning();
    return Response.json({ club: { ...club, responseCount: 0 } }, { status: 201 });
  } catch {
    return internalApiError("동아리를 만들지 못했습니다.");
  }
}

function normalizeStampEmoji(value: string) {
  return value.slice(0, 8) || "⭐";
}
