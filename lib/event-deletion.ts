import { count, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  adminAuditLogs,
  clubs,
  clubStampRecords,
  events,
  participants,
  responses,
  stampPoints,
  stampRecords,
} from "../db/schema";
import type { ChatGPTUser } from "../app/chatgpt-auth";

export type EventDeletionImpact = {
  clubCount: number;
  participantCount: number;
  responseCount: number;
  stampPointCount: number;
  stampRecordCount: number;
  clubStampRecordCount: number;
};

export async function getEventDeletionImpact(eventId: string): Promise<EventDeletionImpact> {
  const db = getDb();
  const [clubRows, participantRows, responseRows, pointRows, stampRows, clubStampRows] =
    await Promise.all([
      db.select({ total: count() }).from(clubs).where(eq(clubs.eventId, eventId)),
      db.select({ total: count() }).from(participants).where(eq(participants.eventId, eventId)),
      db.select({ total: count() }).from(responses).where(eq(responses.eventId, eventId)),
      db.select({ total: count() }).from(stampPoints).where(eq(stampPoints.eventId, eventId)),
      db.select({ total: count() }).from(stampRecords).where(eq(stampRecords.eventId, eventId)),
      db.select({ total: count() }).from(clubStampRecords).where(eq(clubStampRecords.eventId, eventId)),
    ]);

  return {
    clubCount: Number(clubRows[0]?.total ?? 0),
    participantCount: Number(participantRows[0]?.total ?? 0),
    responseCount: Number(responseRows[0]?.total ?? 0),
    stampPointCount: Number(pointRows[0]?.total ?? 0),
    stampRecordCount: Number(stampRows[0]?.total ?? 0),
    clubStampRecordCount: Number(clubStampRows[0]?.total ?? 0),
  };
}

export async function writeAdminAuditLog(input: {
  eventId: string | null;
  eventName: string;
  action: string;
  user: ChatGPTUser;
  details?: Record<string, unknown>;
}) {
  await getDb().insert(adminAuditLogs).values({
    id: crypto.randomUUID(),
    eventId: input.eventId,
    eventName: input.eventName,
    action: input.action,
    actorUserId: input.user.userId,
    actorEmail: input.user.email,
    details: JSON.stringify(input.details ?? {}),
  });
}

export async function permanentlyDeleteEvent(input: {
  eventId: string;
  eventName: string;
  user: ChatGPTUser;
  impact: EventDeletionImpact;
}) {
  const db = getDb();
  await db.batch([
    db.delete(stampRecords).where(eq(stampRecords.eventId, input.eventId)),
    db.delete(clubStampRecords).where(eq(clubStampRecords.eventId, input.eventId)),
    db.delete(responses).where(eq(responses.eventId, input.eventId)),
    db.delete(stampPoints).where(eq(stampPoints.eventId, input.eventId)),
    db.delete(participants).where(eq(participants.eventId, input.eventId)),
    db.delete(clubs).where(eq(clubs.eventId, input.eventId)),
    db.delete(events).where(eq(events.id, input.eventId)),
    db.insert(adminAuditLogs).values({
      // A deterministic id makes a concurrently retried permanent deletion
      // collapse safely instead of writing duplicate completion records.
      id: `event-permanent:${input.eventId}`,
      eventId: input.eventId,
      eventName: input.eventName,
      action: "event.permanently_deleted",
      actorUserId: input.user.userId,
      actorEmail: input.user.email,
      details: JSON.stringify(input.impact),
    }),
  ]);
}
