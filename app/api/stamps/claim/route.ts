import { and, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { clubStampRecords, clubs, events, participants, responses, stampPoints, stampRecords } from "../../../../db/schema";
import { hashDeviceToken, readDeviceToken } from "../../../../lib/participant-session";
import { buildTourPayload, findParticipant } from "../../../../lib/tour-data";
import { getEventAvailability } from "../../../../lib/tour";
import { apiError, internalApiError, readJsonObject, stringField } from "../../../../lib/api-response";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (!body) return apiError("요청 내용을 확인해 주세요.", 400);
    const pointToken = stringField(body, "pointToken");
    const clubId = stringField(body, "clubId");
    if (!pointToken && !clubId) {
      return Response.json({ error: "동아리 또는 추가 지점 QR 정보가 없습니다." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const [target] = clubId
      ? await db
          .select({ club: clubs, event: events })
          .from(clubs)
          .innerJoin(events, eq(clubs.eventId, events.id))
          .where(and(eq(clubs.id, clubId), isNull(events.deletedAt)))
          .limit(1)
      : await db
          .select({ point: stampPoints, event: events })
          .from(stampPoints)
          .innerJoin(events, eq(stampPoints.eventId, events.id))
          .where(and(eq(stampPoints.token, pointToken), isNull(events.deletedAt)))
          .limit(1);

    if (!target) {
      return Response.json({ error: clubId ? "유효하지 않은 동아리 QR입니다." : "유효하지 않은 추가 지점 QR입니다." }, { status: 404 });
    }
    const targetClub = "club" in target ? target.club : null;
    const targetPoint = "point" in target ? target.point : null;
    if (targetPoint && !targetPoint.active) {
      return Response.json({ error: "현재 사용할 수 없는 추가 지점입니다." }, { status: 410 });
    }
    const availability = getEventAvailability(target.event);
    if (!availability.available) return Response.json({ error: availability.message }, { status: 410 });

    const deviceToken = readDeviceToken(request);
    if (!deviceToken) {
      return Response.json({ error: "먼저 행사 초대 QR로 참가 등록을 해 주세요." }, { status: 401 });
    }
    const deviceTokenHash = await hashDeviceToken(deviceToken);
    const participant = await findParticipant(target.event.id, deviceTokenHash);
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

    if (targetClub) {
      const inserted = await db.insert(clubStampRecords).values({
        id: crypto.randomUUID(),
        eventId: target.event.id,
        participantId: participant.id,
        clubId: targetClub.id,
      }).onConflictDoNothing().returning({ id: clubStampRecords.id });
      const duplicate = inserted.length === 0;
      if (!duplicate) {
        await db.insert(responses).values({
          id: crypto.randomUUID(),
          eventId: target.event.id,
          clubId: targetClub.id,
          participantName: participant.participantName,
          gender: targetClub.collectGender ? participant.gender : null,
          ageGroup: targetClub.collectAge ? participant.ageGroup : null,
        });
      }
      return Response.json({
        ...(await buildTourPayload(
          target.event,
          participant,
          duplicate ? "이미 참여한 동아리예요." : targetClub.stampMessage || `${targetClub.name} 참여 스탬프를 받았어요!`,
        )),
        duplicate,
        stampedClub: {
          name: targetClub.name,
          stampEmoji: targetClub.stampEmoji,
          submissionGuide: targetClub.submissionGuide,
        },
      });
    }

    if (!targetPoint) throw new Error("스탬프 대상을 확인하지 못했습니다.");
    const [existing] = await db
      .select({ id: stampRecords.id })
      .from(stampRecords)
      .where(and(eq(stampRecords.participantId, participant.id), eq(stampRecords.stampPointId, targetPoint.id)))
      .limit(1);
    if (!existing) {
      await db.insert(stampRecords).values({
        id: crypto.randomUUID(),
        eventId: target.event.id,
        participantId: participant.id,
        stampPointId: targetPoint.id,
      }).onConflictDoNothing();
    }

    return Response.json({
      ...(await buildTourPayload(
        target.event,
        participant,
        existing ? "이미 받은 추가 지점 스탬프예요." : `${targetPoint.name} 스탬프를 받았어요!`,
      )),
      duplicate: Boolean(existing),
      stampedPoint: { id: targetPoint.id, name: targetPoint.name },
    });
  } catch {
    return internalApiError("스탬프를 등록하지 못했습니다.");
  }
}
