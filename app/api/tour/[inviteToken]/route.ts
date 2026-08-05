import { ensureDatabase } from "../../../../db";
import { hashDeviceToken, readDeviceToken } from "../../../../lib/participant-session";
import { buildTourPayload, findEventByInviteToken, findParticipant } from "../../../../lib/tour-data";
import { getEventAvailability } from "../../../../lib/tour";

export async function GET(
  request: Request,
  context: { params: Promise<{ inviteToken: string }> },
) {
  try {
    const { inviteToken } = await context.params;
    await ensureDatabase();
    const event = await findEventByInviteToken(inviteToken);
    if (!event) return Response.json({ error: "유효하지 않은 행사 초대 QR입니다." }, { status: 404 });
    const availability = getEventAvailability(event);
    if (!availability.available) {
      return Response.json({ error: availability.message }, { status: 410 });
    }

    const token = readDeviceToken(request);
    const participant = token ? await findParticipant(event.id, await hashDeviceToken(token)) : null;
    return Response.json(await buildTourPayload(event, participant), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "행사 참여 화면을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
