import { ensureDatabase } from "../../../../db";
import { hashDeviceToken, readDeviceToken } from "../../../../lib/participant-session";
import { buildTourPayload, findEventByInviteToken, findParticipant } from "../../../../lib/tour-data";
import { AGE_GROUPS, GENDERS, getEventAvailability } from "../../../../lib/tour";
import { internalApiError } from "../../../../lib/api-response";

export async function GET(
  request: Request,
  context: { params: Promise<{ inviteToken: string }> },
) {
  try {
    const { inviteToken } = await context.params;
    await ensureDatabase();
    const event = await findEventByInviteToken(inviteToken);
    if (!event) return Response.json({ error: "유효하지 않은 행사 초대 QR입니다." }, { status: 404 });
    if (!event.stampEnabled) return Response.json({ error: "이 행사는 스탬프 참여를 사용하지 않습니다." }, { status: 410 });
    const availability = getEventAvailability(event);
    if (!availability.available) {
      return Response.json({ error: availability.message }, { status: 410 });
    }

    const token = readDeviceToken(request);
    const savedParticipant = token ? await findParticipant(event.id, await hashDeviceToken(token)) : null;
    const participant = savedParticipant && GENDERS.has(savedParticipant.gender ?? "") && AGE_GROUPS.has(savedParticipant.ageGroup ?? "")
      ? savedParticipant
      : null;
    return Response.json(await buildTourPayload(event, participant), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return internalApiError("행사 참여 화면을 불러오지 못했습니다.");
  }
}
