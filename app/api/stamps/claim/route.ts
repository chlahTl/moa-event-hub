import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { events, participants, stampPoints, stampRecords } from "../../../../db/schema";
import { hashDeviceToken, readDeviceToken } from "../../../../lib/participant-session";
import { buildTourPayload, findParticipant } from "../../../../lib/tour-data";
import { getEventAvailability } from "../../../../lib/tour";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pointToken?: string };
    const pointToken = body.pointToken?.trim() ?? "";
    if (!pointToken) return Response.json({ error: "스탬프 QR 정보가 없습니다." }, { status: 400 });

    await ensureDatabase();
    const db = getDb();
    const [row] = await db
      .select({ point: stampPoints, event: events })
      .from(stampPoints)
      .innerJoin(events, eq(stampPoints.eventId, events.id))
      .where(eq(stampPoints.token, pointToken))
      .limit(1);
    if (!row) return Response.json({ error: "유효하지 않은 스탬프 QR입니다." }, { status: 404 });
    if (!row.point.active) return Response.json({ error: "현재 사용할 수 없는 스탬프 지점입니다." }, { status: 410 });
    const availability = getEventAvailability(row.event);
    if (!availability.available) return Response.json({ error: availability.message }, { status: 410 });

    const deviceToken = readDeviceToken(request);
    if (!deviceToken) {
      return Response.json({ error: "먼저 행사 초대 QR로 참가 등록을 해 주세요." }, { status: 401 });
    }
    const deviceTokenHash = await hashDeviceToken(deviceToken);
    const participant = await findParticipant(row.event.id, deviceTokenHash);
    if (!participant) {
      const [otherEventParticipant] = await db
        .select({ id: participants.id })
        .from(participants)
        .where(eq(participants.deviceTokenHash, deviceTokenHash))
        .limit(1);
      return Response.json(
        { error: otherEventParticipant ? "현재 참가 중인 행사와 다른 QR입니다." : "먼저 행사 초대 QR로 참가 등록을 해 주세요." },
        { status: otherEventParticipant ? 400 : 401 },
      );
    }

    const [existing] = await db
      .select({ id: stampRecords.id })
      .from(stampRecords)
      .where(and(eq(stampRecords.participantId, participant.id), eq(stampRecords.stampPointId, row.point.id)))
      .limit(1);
    if (!existing) {
      await db.insert(stampRecords).values({
        id: crypto.randomUUID(),
        eventId: row.event.id,
        participantId: participant.id,
        stampPointId: row.point.id,
      }).onConflictDoNothing();
    }

    return Response.json({
      ...(await buildTourPayload(
        row.event,
        participant,
        existing ? "이미 받은 스탬프예요." : `${row.point.name} 스탬프를 받았어요!`,
      )),
      duplicate: Boolean(existing),
      stampedPoint: { id: row.point.id, name: row.point.name },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "스탬프를 등록하지 못했습니다." },
      { status: 500 },
    );
  }
}
