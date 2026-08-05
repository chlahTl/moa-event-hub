import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { clubStampRecords, clubs, events, participants, stampPoints, stampRecords } from "../db/schema";

export async function findEventByInviteToken(inviteToken: string) {
  const db = getDb();
  const [event] = await db.select().from(events)
    .where(and(eq(events.inviteToken, inviteToken), isNull(events.deletedAt))).limit(1);
  return event ?? null;
}

export async function findParticipant(eventId: string, deviceTokenHash: string) {
  const db = getDb();
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.eventId, eventId), eq(participants.deviceTokenHash, deviceTokenHash)))
    .limit(1);
  return participant ?? null;
}

export async function buildTourPayload(
  event: typeof events.$inferSelect,
  participant: typeof participants.$inferSelect | null,
  successMessage = "",
) {
  const db = getDb();
  const eventClubs = await db
    .select()
    .from(clubs)
    .where(eq(clubs.eventId, event.id))
    .orderBy(asc(clubs.createdAt));
  const points = await db
    .select()
    .from(stampPoints)
    .where(and(eq(stampPoints.eventId, event.id), eq(stampPoints.active, true)))
    .orderBy(asc(stampPoints.position), asc(stampPoints.createdAt));
  const visited = participant
    ? await db
        .select({ stampPointId: stampRecords.stampPointId, createdAt: stampRecords.createdAt })
        .from(stampRecords)
        .where(and(eq(stampRecords.eventId, event.id), eq(stampRecords.participantId, participant.id)))
    : [];
  const visitedClubs = participant
    ? await db
        .select({ clubId: clubStampRecords.clubId, createdAt: clubStampRecords.createdAt })
        .from(clubStampRecords)
        .where(and(eq(clubStampRecords.eventId, event.id), eq(clubStampRecords.participantId, participant.id)))
    : [];
  const visitedMap = new Map(visited.map((record) => [record.stampPointId, record.createdAt]));
  const visitedClubMap = new Map(visitedClubs.map((record) => [record.clubId, record.createdAt]));
  const completed = points.filter((point) => visitedMap.has(point.id)).length;
  const completedClubs = eventClubs.filter((club) => visitedClubMap.has(club.id)).length;
  return {
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      institution: event.institution,
      location: event.location,
      startDate: event.startDate || event.eventDate,
      endDate: event.endDate || event.eventDate,
      inviteToken: event.inviteToken,
    },
    participant: participant
      ? {
          id: participant.id,
          name: participant.participantName,
          gender: participant.gender,
          ageGroup: participant.ageGroup,
        }
      : null,
    clubs: eventClubs.map((club) => ({
      name: club.name,
      description: club.description,
      stampEmoji: club.stampEmoji,
      stampMessage: club.stampMessage,
      submissionGuide: club.submissionGuide,
      visited: visitedClubMap.has(club.id),
      visitedAt: visitedClubMap.get(club.id) ?? null,
    })),
    extraPoints: points.map((point) => ({
      id: point.id,
      name: point.name,
      description: point.description,
      visited: visitedMap.has(point.id),
      visitedAt: visitedMap.get(point.id) ?? null,
    })),
    progress: {
      completed: completedClubs,
      total: eventClubs.length,
      percent: eventClubs.length ? Math.round((completedClubs / eventClubs.length) * 100) : 0,
    },
    extraProgress: {
      completed,
      total: points.length,
      percent: points.length ? Math.round((completed / points.length) * 100) : 0,
    },
    successMessage,
  };
}
