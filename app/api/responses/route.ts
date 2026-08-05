import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, responses } from "../../../db/schema";

const GENDERS = new Set(["여성", "남성", "응답하지 않음"]);
const AGE_GROUPS = new Set(["유아", "초등", "중등", "고등", "청년", "후기"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clubId?: string;
      participantName?: string;
      gender?: string;
      ageGroup?: string;
    };
    const clubId = body.clubId?.trim() ?? "";
    if (!clubId) return Response.json({ error: "동아리 정보가 없습니다." }, { status: 400 });

    const participantName = body.participantName?.normalize("NFKC").trim().replace(/\s+/g, " ") ?? "";
    if (!participantName) {
      return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    }
    if (participantName.length > 30) {
      return Response.json({ error: "이름은 30자 이내로 입력해 주세요." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
    if (!club) return Response.json({ error: "동아리를 찾을 수 없습니다." }, { status: 404 });

    if (club.collectGender && !GENDERS.has(body.gender ?? "")) {
      return Response.json({ error: "성별을 선택해 주세요." }, { status: 400 });
    }
    if (club.collectAge && !AGE_GROUPS.has(body.ageGroup ?? "")) {
      return Response.json({ error: "연령 구분을 선택해 주세요." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(responses).values({
      id,
      eventId: club.eventId,
      clubId,
      participantName,
      gender: club.collectGender ? body.gender : null,
      ageGroup: club.collectAge ? body.ageGroup : null,
    });
    return Response.json({ response: { id } }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "응답을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
