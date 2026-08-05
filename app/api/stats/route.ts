import { count, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { clubs, responses } from "../../../db/schema";

export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) return Response.json({ error: "eventId가 필요합니다." }, { status: 400 });
    await ensureDatabase();
    const db = getDb();
    const [gender, age, recent] = await Promise.all([
      db
        .select({ label: responses.gender, total: count() })
        .from(responses)
        .where(eq(responses.eventId, eventId))
        .groupBy(responses.gender),
      db
        .select({ label: responses.ageGroup, total: count() })
        .from(responses)
        .where(eq(responses.eventId, eventId))
        .groupBy(responses.ageGroup),
      db
        .select({
          id: responses.id,
          clubName: clubs.name,
          participantName: responses.participantName,
          gender: responses.gender,
          ageGroup: responses.ageGroup,
          createdAt: responses.createdAt,
        })
        .from(responses)
        .innerJoin(clubs, eq(responses.clubId, clubs.id))
        .where(eq(responses.eventId, eventId))
        .orderBy(desc(responses.createdAt))
        .limit(8),
    ]);
    return Response.json({
      gender: gender.filter((item) => item.label).map((item) => ({ ...item, total: Number(item.total) })),
      age: age.filter((item) => item.label).map((item) => ({ ...item, total: Number(item.total) })),
      recent,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "통계를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
