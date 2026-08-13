import { redirect } from "next/navigation";

export default async function EventAdminPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/admin/events/${encodeURIComponent(eventId)}/overview`);
}
