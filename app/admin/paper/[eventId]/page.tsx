import { and, asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireAppUser } from "../../../auth";
import { ensureDatabase, getDb } from "../../../../db";
import { clubs, events, stampPoints } from "../../../../db/schema";
import PaperRecordSheet from "./PaperRecordSheet";

export const dynamic = "force-dynamic";

export default async function PaperRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const user = await requireAppUser("/admin");
  const { eventId } = await params;
  const { clubId } = await searchParams;
  await ensureDatabase();
  const db = getDb();
  const [event] = await db.select().from(events).where(and(
    eq(events.id, eventId),
    eq(events.ownerUserId, user.id),
    isNull(events.deletedAt),
  )).limit(1);
  if (!event) redirect("/admin");
  const [eventClubs, points] = await Promise.all([
    db.select({
      id: clubs.id,
      name: clubs.name,
      collectGender: clubs.collectGender,
      collectAge: clubs.collectAge,
    }).from(clubs)
      .where(eq(clubs.eventId, eventId)).orderBy(asc(clubs.createdAt)),
    db.select({ id: stampPoints.id, name: stampPoints.name }).from(stampPoints)
      .where(and(eq(stampPoints.eventId, eventId), eq(stampPoints.active, true)))
      .orderBy(asc(stampPoints.position), asc(stampPoints.createdAt)),
  ]);
  const selectedClub = clubId ? eventClubs.find((club) => club.id === clubId) : undefined;
  if (clubId && !selectedClub) redirect(`/admin/paper/${eventId}`);
  return <PaperRecordSheet event={{
    id: event.id,
    name: event.name,
    institution: event.institution,
    location: event.location,
    startDate: event.startDate || event.eventDate,
    endDate: event.endDate || event.eventDate,
    stampEnabled: event.stampEnabled,
  }} club={selectedClub} booths={selectedClub ? [selectedClub] : [...eventClubs, ...points]} />;
}
