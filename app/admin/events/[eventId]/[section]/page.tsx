import { redirect } from "next/navigation";
import { requireAppUser, signOutPath } from "../../../../auth";
import AdminDashboard, { type AdminSection } from "../../../EventOperationsDashboard";

export const dynamic = "force-dynamic";

const SECTIONS = new Set<AdminSection>(["overview", "field", "clubs", "participants", "results", "settings"]);

export default async function EventAdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; section: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const { eventId, section } = await params;
  const { clubId } = await searchParams;
  if (!SECTIONS.has(section as AdminSection)) redirect(`/admin/events/${encodeURIComponent(eventId)}/overview`);
  const user = await requireAppUser(`/admin/events/${eventId}/${section}`);
  return <AdminDashboard adminName={user.displayName} adminEmail={user.email} signOutHref={signOutPath("/")} eventId={eventId} section={section as AdminSection} participantClubId={clubId || null} />;
}
