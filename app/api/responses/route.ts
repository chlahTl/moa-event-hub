import { and, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, events, responses } from "../../../db/schema";
import { apiError, internalApiError, readJsonObject, stringField } from "../../../lib/api-response";
import { AGE_GROUPS, GENDERS, getEventAvailability } from "../../../lib/tour";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    const clubId = stringField(body, "clubId");
    if (!clubId) return Response.json({ error: "동아리 정보가 없습니다." }, { status: 400 });

    const participantName = stringField(body, "participantName").replace(/\s+/g, " ");
    if (!participantName) {
      return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    }
    if (participantName.length > 30) {
      return Response.json({ error: "이름은 30자 이내로 입력해 주세요." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const [target] = await db.select({ club: clubs, event: events }).from(clubs)
      .innerJoin(events, eq(clubs.eventId, events.id))
      .where(and(eq(clubs.id, clubId), isNull(events.deletedAt))).limit(1);
    if (!target) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });
    const { club, event } = target;
    if (!event.stampEnabled) return apiError("이 행사는 스탬프 참여를 사용하지 않습니다.", 410);
    const availability = getEventAvailability(event);
    if (!availability.available) return Response.json({ error: availability.message }, { status: 410 });

    const gender = stringField(body, "gender");
    const ageGroup = stringField(body, "ageGroup");
    if (club.collectGender && !GENDERS.has(gender)) {
      return Response.json({ error: "성별을 선택해 주세요." }, { status: 400 });
    }
    if (club.collectAge && !AGE_GROUPS.has(ageGroup)) {
      return Response.json({ error: "연령 구분을 선택해 주세요." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(responses).values({
      id,
      eventId: club.eventId,
      clubId,
      participantName,
      gender: club.collectGender ? gender : null,
      ageGroup: club.collectAge ? ageGroup : null,
    });
    return Response.json({ response: { id } }, { status: 201 });
  } catch {
    return internalApiError("응답을 저장하지 못했습니다.");
  }
}
