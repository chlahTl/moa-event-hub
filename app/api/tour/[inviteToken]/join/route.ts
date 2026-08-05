import { ensureDatabase, getDb } from "../../../../../db";
import { participants } from "../../../../../db/schema";
import {
  createDeviceToken,
  hashDeviceToken,
  participantCookie,
  readDeviceToken,
} from "../../../../../lib/participant-session";
import { buildTourPayload, findEventByInviteToken, findParticipant } from "../../../../../lib/tour-data";
import { AGE_GROUPS, GENDERS, getEventAvailability, normalizeParticipantName } from "../../../../../lib/tour";

export async function POST(
  request: Request,
  context: { params: Promise<{ inviteToken: string }> },
) {
  try {
    const { inviteToken } = await context.params;
    const body = (await request.json()) as { participantName?: string; gender?: string; ageGroup?: string };
    await ensureDatabase();
    const event = await findEventByInviteToken(inviteToken);
    if (!event) return Response.json({ error: "유효하지 않은 행사 초대 QR입니다." }, { status: 404 });
    const availability = getEventAvailability(event);
    if (!availability.available) return Response.json({ error: availability.message }, { status: 410 });

    const participantName = normalizeParticipantName(body.participantName);
    if (!participantName) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    if (participantName.length > 30) {
      return Response.json({ error: "이름은 30자 이내로 입력해 주세요." }, { status: 400 });
    }
    if (!GENDERS.has(body.gender ?? "")) {
      return Response.json({ error: "성별을 선택해 주세요." }, { status: 400 });
    }
    if (!AGE_GROUPS.has(body.ageGroup ?? "")) {
      return Response.json({ error: "연령 구분을 선택해 주세요." }, { status: 400 });
    }

    const deviceToken = readDeviceToken(request) || createDeviceToken();
    const deviceTokenHash = await hashDeviceToken(deviceToken);
    let participant = await findParticipant(event.id, deviceTokenHash);
    if (!participant) {
      const db = getDb();
      await db.insert(participants).values({
        id: crypto.randomUUID(),
        eventId: event.id,
        deviceTokenHash,
        participantName,
        gender: body.gender,
        ageGroup: body.ageGroup,
      }).onConflictDoNothing();
      participant = await findParticipant(event.id, deviceTokenHash);
    }
    if (!participant) throw new Error("참가자 등록 결과를 확인하지 못했습니다.");

    return Response.json(await buildTourPayload(event, participant, "행사 참가 등록이 완료됐어요."), {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": participantCookie(deviceToken, request),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "행사에 참가하지 못했습니다." },
      { status: 500 },
    );
  }
}
